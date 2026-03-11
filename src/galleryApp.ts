import * as THREE from "three";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type {
  CardState,
  EditorState,
  GallerySettingsState,
  MapState,
  MovementState,
  NavGridState,
  TouchState,
  UiState,
  VisitorState,
} from "./gallery/appStatus";
import type {
  FloorMesh,
  GalleryRoom,
  GalleryRoomOpening,
  GallerySpotLightConfig,
  GalleryWallMesh,
  PaintingCanvasMesh,
  PaintingFrameMesh,
  PaintingHandleMesh,
  PaintingRegistryEntry,
  PaintingSpot,
  ShowConfig,
  WallSide,
} from "./gallery/types";
import { getFirstImageFile, isValidShowConfig } from "./gallery/files";
import { generatePaintingId as nextPaintingId, generateWallId } from "./gallery/idGenerators";
import { attachGalleryInput } from "./gallery/inputBindings";
import { resolveAppUrl } from "./gallery/url";
import { createInputEventHandlers } from "./gallery/inputEventHandlers";
import { createFilmstripController } from "./gallery/filmstripController";
import { createSceneConfigController } from "./gallery/sceneConfigController";
import { createPaintingConfigModel } from "./gallery/paintingModels";
import { createPaintingCardController } from "./gallery/paintingCardController";
import { createPaintingEditorInlineHandler } from "./gallery/paintingEditorInlineHandler";
import { createPaintingImageOps } from "./gallery/paintingImageOps";
import { createPaintingInteractions } from "./gallery/paintingInteractions";
import { createPaintingBuilder } from "./gallery/paintingBuilder";
import { createInteractionActions } from "./gallery/interactionActions";
import { createPaintingRegistryActions } from "./gallery/paintingRegistryActions";
import { createPaintingPlacementHelpers } from "./gallery/paintingPlacement";
import { createRuntimeMotion } from "./gallery/runtimeMotion";
import { createRuntimeLoop } from "./gallery/runtimeLoop";
import { createDragMeasureOverlay } from "./gallery/dragMeasureOverlay";
import { createMovementActions } from "./gallery/movementActions";
import { createWorldBuilder } from "./gallery/worldBuilder";
import { calculateMapBounds, drawMiniMap, minimapClientToWorld } from "./gallery/minimap";
import { createNavigationHelpers } from "./gallery/navigation";
import {
  addSynopsisFieldRowDom,
  fillSynopsisFieldsDom,
  renderPaintingCardContentDom,
  resetEditPanelDom,
} from "./gallery/paintingCardDom";
import { createPaintingEditorHandlers } from "./gallery/paintingEditorHandlers";
import { cmToM, getWallSpan, lerpAngle, mToCm, parseNumberOrFallback, snapToStep } from "./gallery/utils";
import {
  createDeleteHandleTexture,
  createFloorMaterial,
  createMoveHandleTexture,
  createPlaceholderPaintingImage,
} from "./gallery/visualAssets";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function mustEl<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento DOM mancante: #${id}`);
  return el as unknown as T;
}
function must2d(canvasEl: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvasEl.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context non disponibile");
  return ctx;
}

const canvas = mustEl<HTMLCanvasElement>("scene");
const minimapCanvas = mustEl<HTMLCanvasElement>("minimap");
const dragMeasureOverlaySvg = mustEl<SVGSVGElement>("drag-measure-overlay");
const miniCtx = must2d(minimapCanvas);
const configPanel = mustEl<HTMLDivElement>("config-panel");
const configEditorShell = mustEl<HTMLElement>("config-editor-shell");
const configSaveLocalBtn = mustEl<HTMLButtonElement>("config-save-local");
const configLoadLocalBtn = mustEl<HTMLButtonElement>("config-load-local");
const configExportJsonBtn = mustEl<HTMLButtonElement>("config-export-json");
const configImportJsonBtn = mustEl<HTMLButtonElement>("config-import-json");
const configImportCatalogJsonBtn = mustEl<HTMLButtonElement>("config-import-catalog-json");
const artCard = mustEl<HTMLElement>("art-card");
const artCardTitle = mustEl<HTMLElement>("art-card-title");
const artCardDescription = mustEl<HTMLElement>("art-card-description");
const artCardImage = mustEl<HTMLImageElement>("art-card-image");
const artCardSynoptic = mustEl<HTMLElement>("art-card-synoptic");
const artCardClose = mustEl<HTMLButtonElement>("art-card-close");
const editModeToggle = mustEl<HTMLButtonElement>("edit-mode-toggle");
const filmstrip = mustEl<HTMLElement>("filmstrip");
const filmstripItems = mustEl<HTMLElement>("filmstrip-items");
const filmstripAdd = mustEl<HTMLButtonElement>("filmstrip-add");
const artEditPanel = mustEl<HTMLElement>("art-edit-panel");
const artEditId = mustEl<HTMLInputElement>("art-edit-id");
const artEditTitle = mustEl<HTMLInputElement>("art-edit-title");
const artEditDescription = mustEl<HTMLTextAreaElement>("art-edit-description");
const artEditRoom = mustEl<HTMLSelectElement>("art-edit-room");
const artEditRoomWidthCm = mustEl<HTMLInputElement>("art-edit-room-width-cm");
const artEditRoomDepthCm = mustEl<HTMLInputElement>("art-edit-room-depth-cm");
const artEditRoomHeightCm = mustEl<HTMLInputElement>("art-edit-room-height-cm");
const artEditWall = mustEl<HTMLSelectElement>("art-edit-wall");
const artEditOffsetCm = mustEl<HTMLInputElement>("art-edit-offset-cm");
const artEditWidthCm = mustEl<HTMLInputElement>("art-edit-width-cm");
const artEditHeightCm = mustEl<HTMLInputElement>("art-edit-height-cm");
const artEditFrameBorderCm = mustEl<HTMLInputElement>("art-edit-frame-border-cm");
const artEditFrameColor = mustEl<HTMLInputElement>("art-edit-frame-color");
const artEditCenterYCm = mustEl<HTMLInputElement>("art-edit-center-y-cm");
const artEditImageUrl = mustEl<HTMLInputElement>("art-edit-image-url");
const artEditSynopsisList = mustEl<HTMLElement>("art-edit-synopsis-list");
const artEditSynopsisAdd = mustEl<HTMLButtonElement>("art-edit-synopsis-add");
const artEditMoveLeft = mustEl<HTMLButtonElement>("art-edit-move-left");
const artEditMoveRight = mustEl<HTMLButtonElement>("art-edit-move-right");
const artEditMoveUp = mustEl<HTMLButtonElement>("art-edit-move-up");
const artEditMoveDown = mustEl<HTMLButtonElement>("art-edit-move-down");
const artEditDelete = mustEl<HTMLButtonElement>("art-edit-delete");
const artEditTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#art-edit-tabs .art-edit-tab"));
const artEditTabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-art-edit-tab-panel]"));
const configTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#config-tabs .config-tab"));
const configTabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-config-tab-panel]"));
const configWhenStartDate = mustEl<HTMLInputElement>("config-when-start-date");
const configWhenEndDate = mustEl<HTMLInputElement>("config-when-end-date");
const configWhenTextMd = mustEl<HTMLTextAreaElement>("config-when-text-md");
const configWhenCalendarPrevBtn = mustEl<HTMLButtonElement>("config-when-calendar-prev");
const configWhenCalendarNextBtn = mustEl<HTMLButtonElement>("config-when-calendar-next");
const configWhenCalendarLabel = mustEl<HTMLElement>("config-when-calendar-label");
const configWhenCalendarGrid = mustEl<HTMLDivElement>("config-when-calendar-grid");
const configWhenCalendarRangeLabel = mustEl<HTMLElement>("config-when-calendar-range-label");
const configWhereAddress = mustEl<HTMLInputElement>("config-where-address");
const configWhereSearchBtn = mustEl<HTMLButtonElement>("config-where-search");
const configWhereTextMd = mustEl<HTMLTextAreaElement>("config-where-text-md");
const configWhereMap = mustEl<HTMLDivElement>("config-where-map");
const configWhereLat = mustEl<HTMLInputElement>("config-where-lat");
const configWhereLng = mustEl<HTMLInputElement>("config-where-lng");
const configMapToolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".config-map-tool"));
const configMapToggleSnapBtn = mustEl<HTMLButtonElement>("config-map-toggle-snap");
const configMapToggleMagnetBtn = mustEl<HTMLButtonElement>("config-map-toggle-magnet");
const configMapResetViewBtn = mustEl<HTMLButtonElement>("config-map-reset-view");
const configMapDeleteRoomBtn = document.getElementById("config-map-delete-room") as HTMLButtonElement | null;
const configMapFloorColor = mustEl<HTMLInputElement>("config-map-floor-color");
const configMapWallColor = mustEl<HTMLInputElement>("config-map-wall-color");
const configMapWallHeightCm = mustEl<HTMLInputElement>("config-map-wall-height-cm");
const configMapWallThicknessCm = mustEl<HTMLInputElement>("config-map-wall-thickness-cm");
const configMapWallHeightCmWall = mustEl<HTMLInputElement>("config-map-wall-height-cm-wall");
const configMapWallThicknessCmWall = mustEl<HTMLInputElement>("config-map-wall-thickness-cm-wall");
const configMapMinPaintingDistanceM = mustEl<HTMLInputElement>("config-map-min-painting-distance-m");
const configMapOpeningType = mustEl<HTMLSelectElement>("config-map-opening-type");
const configMapOpeningWidthCm = mustEl<HTMLInputElement>("config-map-opening-width-cm");
const configMapOpeningBaseCm = mustEl<HTMLInputElement>("config-map-opening-base-cm");
const configMapOpeningHeightCm = mustEl<HTMLInputElement>("config-map-opening-height-cm");
const configMapLightTargetPainting = mustEl<HTMLSelectElement>("config-map-light-target-painting");
const configMapLightHeightCm = mustEl<HTMLInputElement>("config-map-light-height-cm");
const configMapLightIntensity = mustEl<HTMLInputElement>("config-map-light-intensity");
const configMapLightAngleDeg = mustEl<HTMLInputElement>("config-map-light-angle-deg");
const configMapLightDistanceM = mustEl<HTMLInputElement>("config-map-light-distance-m");
const configMapLightPenumbra = mustEl<HTMLInputElement>("config-map-light-penumbra");
const configMapPathWalkSeconds = mustEl<HTMLInputElement>("config-map-path-walk-seconds");
const configMapPathStopSeconds = mustEl<HTMLInputElement>("config-map-path-stop-seconds");
const configMapPathOpenCard = mustEl<HTMLInputElement>("config-map-path-open-card");
const configMapPathAutoTarget = mustEl<HTMLInputElement>("config-map-path-autotarget");
const configMapPathLoop = mustEl<HTMLInputElement>("config-map-path-loop");
const configMapPathCardSeconds = mustEl<HTMLInputElement>("config-map-path-card-seconds");
const configMapPathAddPointBtn = mustEl<HTMLButtonElement>("config-map-path-add-point");
const configMapPathDeletePointBtn = mustEl<HTMLButtonElement>("config-map-path-delete-point");
const configMapPathClearBtn = mustEl<HTMLButtonElement>("config-map-path-clear");
const configMapPathStatus = mustEl<HTMLElement>("config-map-path-status");
const configGalleryMapEditor = mustEl<SVGSVGElement>("config-gallery-map-editor");
const configGalleryMapSubTabButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-config-tab-panel="gallery-map"] [data-gallery-map-subtab]')
);
const configGalleryMapSubTabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-gallery-map-subtab-panel]"));
const configIntroMd = mustEl<HTMLTextAreaElement>("config-intro-md");
const configCameraFov = mustEl<HTMLInputElement>("config-camera-fov");
const configCameraStartX = mustEl<HTMLInputElement>("config-camera-start-x");
const configCameraStartY = mustEl<HTMLInputElement>("config-camera-start-y");
const configCameraStartZ = mustEl<HTMLInputElement>("config-camera-start-z");
const configCameraTargetX = mustEl<HTMLInputElement>("config-camera-target-x");
const configCameraTargetY = mustEl<HTMLInputElement>("config-camera-target-y");
const configCameraTargetZ = mustEl<HTMLInputElement>("config-camera-target-z");
const configCameraCaptureViewBtn = mustEl<HTMLButtonElement>("config-camera-capture-view");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f1f4f8");
scene.fog = new THREE.Fog("#eef1f4", 16, 46);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);

const loader = new THREE.TextureLoader();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();
const upAxis = new THREE.Vector3(0, 1, 0);
const MIN_PITCH = -0.45;
const MAX_PITCH = 0.45;
const CM_PER_M = 100;
const PAINTING_SNAP_CM = 5;
const PAINTING_SNAP_M = PAINTING_SNAP_CM / CM_PER_M;
const DEFAULT_EXHIBITION_LAT = 41.9028;
const DEFAULT_EXHIBITION_LNG = 12.4964;
const DEFAULT_EXHIBITION_ZOOM = 12;
const GALLERY_GRID_SNAP_M = 0.2;
const GALLERY_GRID_MAJOR_STEP_M = 1;
const GALLERY_EDITOR_PADDING_M = 1;
const GALLERY_EDITOR_MIN_SPAN_M = 4;
const GALLERY_MAGNET_THRESHOLD_M = 0.15;
const GALLERY_SIZE_MAGNET_THRESHOLD_M = 0.22;
const GALLERY_LIGHT_PICK_TOLERANCE_M = 0.45;
const GALLERY_MAP_ZOOM_MIN = 0.35;
const GALLERY_MAP_ZOOM_MAX = 7;
const GALLERY_OPENING_MIN_WIDTH_M = 0.2;

type GalleryMapTool = "room" | "wall" | "opening" | "delete-opening" | "delete-wall" | "light" | "delete-light" | "path";
type GalleryMapDragAction =
  | "none"
  | "createRoom"
  | "createWall"
  | "moveRoom"
  | "resizeRoom"
  | "resizeWallStart"
  | "resizeWallEnd"
  | "movePaintingOnMap"
  | "moveLight"
  | "moveLightTarget"
  | "resizeOpeningStart"
  | "resizeOpeningEnd"
  | "moveCameraStart"
  | "moveCameraTarget"
  | "movePathPoint";
type PlanPoint = { x: number; z: number };
type PlanAssistMode = "room-create" | "room-move" | "wall-create" | "opening" | "generic";
type RoomCorner = "nw" | "ne" | "sw" | "se";
type OpeningHandleSide = "start" | "end";
type GalleryMapRoomMoveState = {
  roomId: string;
  startPointer: PlanPoint;
  startX: number;
  startZ: number;
};
type GalleryMapRoomResizeState = {
  roomId: string;
  corner: RoomCorner;
  startX: number;
  startZ: number;
  startWidth: number;
  startDepth: number;
};
type GalleryMapWallResizeState = {
  wallIndex: number;
  handle: "start" | "end";
  startX1: number;
  startZ1: number;
  startX2: number;
  startZ2: number;
};
type GalleryMapPaintingMoveState = {
  paintingId: string;
};
type GalleryMapLightMoveState = {
  lightId: string;
  startPointer: PlanPoint;
  startX: number;
  startZ: number;
};
type GalleryMapLightTargetMoveState = {
  lightId: string;
  startPointer: PlanPoint;
  startX: number;
  startZ: number;
};
type GalleryMapPathPointMoveState = {
  pointIndex: number;
  startPointer: PlanPoint;
  startX: number;
  startZ: number;
};
type GalleryMapPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanZ: number;
};
type GalleryMapOpeningRef =
  | { kind: "room"; roomId: string; wall: WallSide; openingIndex: number }
  | { kind: "customWall"; wallIndex: number; openingIndex: number };
type GalleryMapOpeningResizeState = {
  ref: GalleryMapOpeningRef;
  handle: OpeningHandleSide;
  startCenter: number;
  startWidth: number;
  startAlong: number;
};
type GalleryMapOpeningGeometry = {
  ref: GalleryMapOpeningRef;
  type: "door" | "window" | "opening";
  center: number;
  width: number;
  base: number;
  height: number;
  wallFrom: PlanPoint;
  wallTo: PlanPoint;
  wallLength: number;
};
type PlanWallRef =
  | { kind: "room"; roomId: string; wall: WallSide; length: number; from: PlanPoint; to: PlanPoint }
  | { kind: "customWall"; wallId: string; wallIndex: number; length: number; from: PlanPoint; to: PlanPoint };

type GalleryBootstrap = {
  routeId?: string | null;
  configPath?: string;
  readOnly?: boolean;
};

let config!: ShowConfig;
let roomsById: Map<string, GalleryRoom> = new Map();
const gallerySettings: GallerySettingsState = {
  defaultPaintingHeight: 1,
};
const movement: MovementState = {
  destination: null,
  route: [],
  finalDestination: null,
  speedScale: 1.35,
  yaw: 0,
  pitch: 0,
  focusTarget: null,
  dragging: false,
  mouseDownX: 0,
  mouseDownY: 0,
  movedWhileDrag: false,
  prevMouseX: 0,
  prevMouseY: 0,
};
const touchState: TouchState = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
  prevX: 0,
  prevY: 0,
};

const visitor: VisitorState = {
  position: new THREE.Vector3(),
  eyeHeight: 1.67,
  moveSpeed: 2.3,
  wallClearance: 0.42,
  minPaintingDistance: 1.35,
};

const floorMeshes: FloorMesh[] = [];
const paintingSpots: PaintingSpot[] = [];
const paintingMeshes: PaintingCanvasMesh[] = [];
const paintingPickMeshes: Array<PaintingFrameMesh | PaintingCanvasMesh> = [];
const paintingDeleteMeshes: PaintingHandleMesh[] = [];
const paintingMoveMeshes: PaintingHandleMesh[] = [];
const wallMeshes: GalleryWallMesh[] = [];
const paintingRegistry: Map<string, PaintingRegistryEntry> = new Map();
const wallColliders: THREE.Box3[] = [];
const cardState: CardState = {
  paintingId: null,
};
const uiState: UiState = {
  editMode: false,
  selectedPaintingId: null,
};
const editorState: EditorState = {
  suspend: false,
};
const mapState: MapState = {
  minX: 0,
  maxX: 0,
  minZ: 0,
  maxZ: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  pad: 18,
};
const navGrid: NavGridState = {
  cellSize: 0.4,
  minX: 0,
  minZ: 0,
  cols: 0,
  rows: 0,
  walkable: [],
};
let deleteHandleTexture: THREE.Texture | null = null;
let moveHandleTexture: THREE.Texture | null = null;
let noImagePlaceholder: string | null = null;
let sceneHemisphereLight: THREE.HemisphereLight | null = null;
let sceneAmbientLight: THREE.AmbientLight | null = null;
let suppressNextPrimaryClick = false;
let configLeafletMap: L.Map | null = null;
let configLeafletMarker: L.Marker | null = null;
let whenCalendarViewMonth = new Date();
let lastGalleryMapObserverSignature = "";
const pathPlaybackState: {
  active: boolean;
  nextIndex: number;
  waitingUntilMs: number;
  cardCloseAtMs: number;
  lastMoveIssuedAtMs: number;
  baseSpeedScale: number;
} = {
  active: false,
  nextIndex: 0,
  waitingUntilMs: 0,
  cardCloseAtMs: 0,
  lastMoveIssuedAtMs: 0,
  baseSpeedScale: 1.35,
};
const galleryMapEditorState: {
  tool: GalleryMapTool;
  dragAction: GalleryMapDragAction;
  dragStart: PlanPoint | null;
  dragCurrent: PlanPoint | null;
  selectedRoomId: string | null;
  selectedCustomWallIndex: number | null;
  selectedOpening: GalleryMapOpeningRef | null;
  selectedLightId: string | null;
  selectedPathPointIndex: number | null;
  movingRoom: GalleryMapRoomMoveState | null;
  resizingRoom: GalleryMapRoomResizeState | null;
  resizingWall: GalleryMapWallResizeState | null;
  movingPainting: GalleryMapPaintingMoveState | null;
  movingLight: GalleryMapLightMoveState | null;
  movingLightTarget: GalleryMapLightTargetMoveState | null;
  movingPathPoint: GalleryMapPathPointMoveState | null;
  resizingOpening: GalleryMapOpeningResizeState | null;
  panning: GalleryMapPanState | null;
  viewZoom: number;
  viewPanX: number;
  viewPanZ: number;
  snapToGrid: boolean;
  magnet: boolean;
  widthPx: number;
  heightPx: number;
} = {
  tool: "room",
  dragAction: "none",
  dragStart: null,
  dragCurrent: null,
  selectedRoomId: null,
  selectedCustomWallIndex: null,
  selectedOpening: null,
  selectedLightId: null,
  selectedPathPointIndex: null,
  movingRoom: null,
  resizingRoom: null,
  resizingWall: null,
  movingPainting: null,
  movingLight: null,
  movingLightTarget: null,
  movingPathPoint: null,
  resizingOpening: null,
  panning: null,
  viewZoom: 1,
  viewPanX: 0,
  viewPanZ: 0,
  snapToGrid: true,
  magnet: true,
  widthPx: 0,
  heightPx: 0,
};
const dragPainting: import("./gallery/appStatus").DragPaintingState = {
  active: false,
  pointerType: null,
  paintingId: null,
  plane: new THREE.Plane(),
};
const galleryBootstrap = ((window as Window & { __GALLERIA_BOOTSTRAP__?: GalleryBootstrap }).__GALLERIA_BOOTSTRAP__ ??
  {}) as GalleryBootstrap;
const readOnlyMode = Boolean(galleryBootstrap.readOnly);
const requestedConfigPath = (galleryBootstrap.configPath ?? "config/gallery.json").trim() || "config/gallery.json";

const world = new THREE.Group();
scene.add(world);

const artCardDomElements = { artCardTitle, artCardDescription, artCardImage, artCardSynoptic };
const artEditDomElements = {
  artEditPanel,
  artEditId,
  artEditTitle,
  artEditDescription,
  artEditRoom,
  artEditRoomWidthCm,
  artEditRoomDepthCm,
  artEditRoomHeightCm,
  artEditWall,
  artEditOffsetCm,
  artEditWidthCm,
  artEditHeightCm,
  artEditFrameBorderCm,
  artEditFrameColor,
  artEditCenterYCm,
  artEditImageUrl,
  artEditSynopsisList,
  artEditDelete,
  artEditMoveLeft,
  artEditMoveRight,
  artEditMoveUp,
  artEditMoveDown,
};

/** @type {import("./gallery/appStatus").AppStatus} */
const appStatus = {
  uiState,
  editorState,
  cardState,
  movement,
  touchState,
  visitor,
  dragPainting,
  mapState,
  navGrid,
  gallerySettings,
  refs: {
    getConfig: () => config,
    setConfig: (nextConfig: ShowConfig) => {
      config = nextConfig;
    },
    getRoomsById: () => roomsById,
    setRoomsById: (nextRoomsById: Map<string, GalleryRoom>) => {
      roomsById = nextRoomsById;
    },
    getDeleteHandleTexture: () => deleteHandleTexture,
    setDeleteHandleTexture: (nextTexture: any) => {
      deleteHandleTexture = nextTexture;
    },
    getMoveHandleTexture: () => moveHandleTexture,
    setMoveHandleTexture: (nextTexture: any) => {
      moveHandleTexture = nextTexture;
    },
    getNoImagePlaceholder: () => noImagePlaceholder,
    setNoImagePlaceholder: (nextPlaceholder: string | null) => {
      noImagePlaceholder = nextPlaceholder;
    },
    getSceneHemisphereLight: () => sceneHemisphereLight,
    setSceneHemisphereLight: (light: any) => {
      sceneHemisphereLight = light;
    },
    getSceneAmbientLight: () => sceneAmbientLight,
    setSceneAmbientLight: (light: any) => {
      sceneAmbientLight = light;
    },
    getSuppressNextPrimaryClick: () => suppressNextPrimaryClick,
    setSuppressNextPrimaryClick: (value: boolean) => {
      suppressNextPrimaryClick = value;
    },
  },
};

/** @type {import("./gallery/appServices").AppContext} */
const appContext = {
  status: appStatus,
  runtime: {
    THREE,
    scene,
    world,
    camera,
    loader,
    renderer,
    raycaster,
  },
  dom: {
    configPanel,
    minimapCanvas,
    filmstripItems,
    artCard,
    artEditPanel,
    artEditRoom,
  },
  collections: {
    floorMeshes,
    paintingSpots,
    paintingMeshes,
    paintingPickMeshes,
    paintingDeleteMeshes,
    paintingMoveMeshes,
    wallMeshes,
    wallColliders,
    paintingRegistry,
  },
  helpers: {
    cmToM,
    mToCm,
    calculateMapBounds,
    minimapClientToWorld,
    createFloorMaterial,
    createDeleteHandleTexture,
    createMoveHandleTexture,
    createPlaceholderPaintingImage,
    nextPaintingId,
    generateWallId,
    isValidShowConfig,
    getFirstImageFile,
  },
};

const { applyPaintingPlacement, clampPaintingOffset, clampPaintingCenterY } = createPaintingPlacementHelpers({
  THREE,
  upAxis,
  getRoomsById: () => roomsById,
  getConfig: () => config,
  getWallSpan,
});

const { buildRoom, buildCustomWalls } = createWorldBuilder({
  THREE,
  world,
  floorMeshes,
  wallMeshes,
  wallColliders,
  cmToM,
  getRoomWallThickness: () => Math.max(0.02, Number(config?.rendering?.wallThickness ?? 0.16)),
});

const movementActions = createMovementActions({
  app: appContext,
  getComputeRoute: () => computeRoute,
});

const dragMeasureOverlay = createDragMeasureOverlay({
  app: appContext,
  overlaySvg: dragMeasureOverlaySvg,
});

const { buildNavGrid, computeRoute } = createNavigationHelpers({
  THREE,
  navGrid,
  mapState,
  visitor,
  isPositionSafe: movementActions.isPositionSafe,
  clampToWalkable: movementActions.clampToWalkable,
});

const { updateMovement, computePaintingViewPosition, updateFocusOrientation, updateCamera } = createRuntimeMotion({
  THREE,
  camera,
  movement,
  visitor,
  MIN_PITCH,
  MAX_PITCH,
  clampToWalkable: movementActions.clampToWalkable,
  lerpAngle,
});

const { onResize, animate } = createRuntimeLoop({
  canvas,
  renderer,
  camera,
  scene,
  clock,
  minimapCanvas,
  miniCtx,
  mapState,
  visitor,
  movement,
  getConfig: () => config,
  updateMovement,
  updateFocusOrientation,
  updateCamera,
  afterCameraUpdate: () => {
    updatePathPlayback();
    updateEditModeVisuals();
    dragMeasureOverlay.update();
    refreshGalleryMapObserverIfNeeded();
  },
  drawMiniMap,
});

const { inferPaintingDimensions, resolvePaintingAspectRatio, applyPaintingDimensions, applyPaintingImage } = createPaintingImageOps({
  app: appContext,
  CM_PER_M,
  artCardImage,
  applyPaintingPlacement,
  getShowEditPanelForEntry: () => showEditPanelForEntry,
});

const buildPainting = createPaintingBuilder({
  app: appContext,
  placementOps: {
    applyPaintingPlacement,
  },
  imageOps: {
    inferPaintingDimensions,
    applyPaintingDimensions,
    applyPaintingImage,
  },
});

const { openPaintingCard, closePaintingCard, showEditPanelForEntry } = createPaintingCardController({
  app: appContext,
  artCardDomElements,
  artEditDomElements,
  renderPaintingCardContentDom,
  resetEditPanelDom,
  fillSynopsisFieldsDom,
  getRenderFilmstrip: () => renderFilmstrip,
  resolvePaintingAspectRatio,
  mToCm,
});

const { buildWorld, rebuildSceneFromConfig, loadShowConfig, createNewCatalogPainting, importCatalogWorks } = createSceneConfigController({
  app: appContext,
  worldOps: {
    buildRoom,
    buildCustomWalls: (cfg, wallColor) => buildCustomWalls({ customWalls: cfg.customWalls ?? [] }, wallColor),
    buildPainting,
    buildNavGrid,
  clampToWalkable: movementActions.clampToWalkable,
  },
  uiOps: {
    applyVisitorConfig,
    setEditMode,
  },
  getRenderFilmstrip: () => renderFilmstrip,
  getClosePaintingCard: () => closePaintingCard,
  CM_PER_M,
});

const {
  renderFilmstrip,
  openCatalogPainting,
  onFilmstripAddClick,
  onFilmstripClick,
  onFilmstripDoubleClick,
  onFilmstripDragStart,
  onFilmstripDragOver,
  onFilmstripDrop,
} =
  createFilmstripController({
    app: appContext,
    createNewCatalogPainting,
    openPaintingCard,
    closePaintingCard,
    setEditMode,
    getDeletePaintingEntry: () => deletePaintingEntry,
  });

const { deletePaintingEntry } = createPaintingRegistryActions({
  app: appContext,
  uiActions: {
    closePaintingCard,
    renderFilmstrip,
  },
});

const onInlineEditChanged = createPaintingEditorInlineHandler({
  app: appContext,
  dom: {
    artEditId,
    artEditTitle,
    artEditDescription,
    artEditRoom,
    artEditRoomWidthCm,
    artEditRoomDepthCm,
    artEditRoomHeightCm,
    artEditWall,
    artEditOffsetCm,
    artEditWidthCm,
    artEditHeightCm,
    artEditFrameBorderCm,
    artEditFrameColor,
    artEditCenterYCm,
    artEditImageUrl,
    artEditSynopsisList,
    artCardDomElements,
  },
  numeric: {
    PAINTING_SNAP_M,
    parseNumberOrFallback,
    mToCm,
    cmToM,
    snapToStep,
    getWallSpan,
  },
  actions: {
    clampPaintingOffset,
    clampPaintingCenterY,
    resolvePaintingAspectRatio,
    applyPaintingImage,
    rebuildSceneFromConfig,
    renderPaintingCardContentDom,
    showEditPanelForEntry,
    openCatalogPainting,
    renderFilmstrip,
    inferPaintingDimensions,
    applyPaintingDimensions,
    applyPaintingPlacement,
  },
});

const paintingEditorHandlers = createPaintingEditorHandlers({
  app: appContext,
  dom: {
    artCardImage,
    artEditImageUrl,
    artEditSynopsisList,
    artCardDomElements,
  },
  numeric: {
    PAINTING_SNAP_M,
    snapToStep,
  },
  actions: {
    clampPaintingOffset,
    clampPaintingCenterY,
    applyPaintingPlacement,
    showEditPanelForEntry,
    deletePaintingEntry,
    addSynopsisFieldRowDom,
    onInlineEditChanged,
    applyPaintingImage,
    renderPaintingCardContentDom,
    openCatalogPainting,
    renderFilmstrip,
  },
});

const interactionActions = createInteractionActions({
  app: appContext,
  canvas,
  camera,
  mouseNdc,
  PAINTING_SNAP_M,
  getWallSpan,
  snapToStep,
  buildPainting,
  applyPaintingPlacement,
  openPaintingCard,
  showEditPanelForEntry,
  closePaintingCard,
  moveVisitorTo: movementActions.moveVisitorTo,
  clampToWalkable: movementActions.clampToWalkable,
});

function syncLightTargetSelectorFromPainting(paintingId: string) {
  if (!paintingId) {
    return;
  }
  if (galleryMapEditorState.selectedLightId) {
    return;
  }
  syncGalleryLightTargetOptions();
  const hasPainting = Array.from(configMapLightTargetPainting.options).some((option) => option.value === paintingId);
  if (!hasPainting) {
    return;
  }
  configMapLightTargetPainting.value = paintingId;
}

const paintingInteractions = createPaintingInteractions({
  app: appContext,
  dom: {
    artEditOffsetCm,
    artEditCenterYCm,
  },
  numeric: {
    PAINTING_SNAP_M,
    snapToStep,
  },
  actions: {
    clampPaintingOffset,
    clampPaintingCenterY,
    applyPaintingPlacement,
    setPointerRay: interactionActions.setPointerRay,
    deletePaintingEntry,
    closePaintingCard,
    openPaintingCard,
    isNearPainting: movementActions.isNearPainting,
    computePaintingViewPosition,
    moveVisitorTo: movementActions.moveVisitorTo,
    clampToWalkable: movementActions.clampToWalkable,
    onPaintingPicked: syncLightTargetSelectorFromPainting,
  },
});

const inputEventHandlers = createInputEventHandlers({
  app: appContext,
  MIN_PITCH,
  MAX_PITCH,
  paintingInteractions,
  applyPaintingImage,
  closePaintingCard,
  loadShowConfig,
  importCatalogWorks,
  setEditMode,
  renderFilmstrip,
  syncConfigPanel: () => syncConfigPanelFromConfig(),
  persistCameraViewConfig: () => persistCurrentCameraConfigToShow(),
  actions: {
    clampToWalkable: movementActions.clampToWalkable,
    moveVisitorTo: movementActions.moveVisitorTo,
    setPointerRay: interactionActions.setPointerRay,
    placeCatalogPaintingAtWall: interactionActions.placeCatalogPaintingAtWall,
    handleWallCreateClick: interactionActions.handleWallCreateClick,
    handleFloorMove: interactionActions.handleFloorMove,
  },
});

init().catch((err) => {
  console.error("Errore durante inizializzazione:", err);
});

async function fetchShowConfig(configPath: string) {
  const response = await fetch(resolveAppUrl(configPath));
  if (!response.ok) {
    throw new Error(`Impossibile caricare ${configPath}: HTTP ${response.status}`);
  }
  const loaded = await response.json();
  if (!isValidShowConfig(loaded)) {
    throw new Error(`Formato configurazione non valido: ${configPath}`);
  }
  return loaded as ShowConfig;
}

async function init() {
  try {
    config = await fetchShowConfig(requestedConfigPath);
  } catch (error) {
    if (requestedConfigPath !== "config/gallery.json") {
      console.warn(`Fallback a config/gallery.json dopo errore su ${requestedConfigPath}`, error);
      config = await fetchShowConfig("config/gallery.json");
    } else {
      throw error;
    }
  }

  applyVisitorConfig(config.visitor);
  buildWorld(config);
  attachInput();
  attachArtEditTabs();
  attachConfigPanel();
  syncConfigPanelFromConfig();
  setEditMode(false);
  onResize();

  window.addEventListener("resize", onResize);
  window.addEventListener("resize", () => {
    configLeafletMap?.invalidateSize();
    renderGalleryMapEditor();
  });

  animate();
}

function applyVisitorConfig(visitorCfg: import("./gallery/types").VisitorConfig = {}) {
  visitor.eyeHeight = visitorCfg.eyeHeight ?? visitor.eyeHeight;
  visitor.moveSpeed = visitorCfg.moveSpeed ?? visitor.moveSpeed;
  visitor.wallClearance = visitorCfg.wallClearance ?? visitor.wallClearance;
  visitor.minPaintingDistance = visitorCfg.minPaintingDistance ?? visitor.minPaintingDistance;
  navGrid.cellSize = visitorCfg.navCellSize ?? navGrid.cellSize;
  movement.speedScale = THREE.MathUtils.clamp(visitorCfg.initialSpeedScale ?? movement.speedScale, 0.5, 3);

  const start = visitorCfg.start ?? { x: 0, z: 0, yaw: 0 };
  const startX = Number(start.x);
  const startY = Number(start.y);
  const startZ = Number(start.z);
  visitor.position.set(
    Number.isFinite(startX) ? startX : 0,
    Number.isFinite(startY) ? startY : visitor.eyeHeight,
    Number.isFinite(startZ) ? startZ : 0
  );

  const targetX = Number(start.targetX);
  const targetY = Number(start.targetY);
  const targetZ = Number(start.targetZ);
  if (Number.isFinite(targetX) && Number.isFinite(targetY) && Number.isFinite(targetZ)) {
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    movement.focusTarget = target.clone();
    const toTarget = target.clone().sub(visitor.position);
    const horizontal = Math.hypot(toTarget.x, toTarget.z);
    if (horizontal > 0.0001) {
      movement.yaw = Math.atan2(toTarget.x, toTarget.z);
      movement.pitch = THREE.MathUtils.clamp(Math.atan2(toTarget.y, horizontal), MIN_PITCH, MAX_PITCH);
    } else {
      movement.yaw = Number.isFinite(Number(start.yaw)) ? Number(start.yaw) : 0;
      movement.pitch = THREE.MathUtils.clamp(Number(start.pitch ?? 0), MIN_PITCH, MAX_PITCH);
    }
    return;
  }

  movement.focusTarget = null;
  movement.yaw = Number.isFinite(Number(start.yaw)) ? Number(start.yaw) : 0;
  movement.pitch = THREE.MathUtils.clamp(Number(start.pitch ?? 0), MIN_PITCH, MAX_PITCH);
}

function setEditMode(enabled: boolean) {
  uiState.editMode = readOnlyMode ? false : Boolean(enabled);
  configEditorShell.hidden = !uiState.editMode;
  editModeToggle.textContent = uiState.editMode ? "✎ Edit: ON" : "✎ Edit: OFF";
  editModeToggle.classList.toggle("edit-on", uiState.editMode);
  editModeToggle.setAttribute("aria-pressed", uiState.editMode ? "true" : "false");
  editModeToggle.disabled = readOnlyMode;
  editModeToggle.title = readOnlyMode ? "Modalita sola lettura" : "";
  filmstrip.hidden = !uiState.editMode;
  updateEditModeVisuals();
  if (uiState.editMode) {
    renderFilmstrip();
  } else {
    setActiveArtEditTab("general");
  }
}

function setActiveArtEditTab(tabId: string) {
  artEditTabButtons.forEach((button) => {
    const selected = button.dataset.artEditTab === tabId;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  artEditTabPanels.forEach((panel) => {
    const selected = panel.dataset.artEditTabPanel === tabId;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  });
}

function getCurrentVisitorRoomId() {
  for (let i = config.rooms.length - 1; i >= 0; i -= 1) {
    const room = config.rooms[i];
    if (
      visitor.position.x >= room.x &&
      visitor.position.x <= room.x + room.width &&
      visitor.position.z >= room.z &&
      visitor.position.z <= room.z + room.depth
    ) {
      return room.id;
    }
  }
  return null;
}

function attachArtEditTabs() {
  artEditTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.artEditTab;
      if (!uiState.editMode || !tabId) {
        return;
      }
      setActiveArtEditTab(tabId);
    });
  });
  setActiveArtEditTab("general");
}

function updateEditModeVisuals() {
  const currentRoomId = uiState.editMode ? getCurrentVisitorRoomId() : null;
  paintingRegistry.forEach((entry) => {
    const entryRoomId = entry.painting.roomId ?? entry.room?.id ?? "";
    const handlesVisible = Boolean(currentRoomId) && entryRoomId === currentRoomId;
    if (entry.deleteHandle) {
      entry.deleteHandle.visible = handlesVisible;
    }
    if (entry.moveHandle) {
      entry.moveHandle.visible = handlesVisible;
    }
  });
}

function ensureCustomWallsArray() {
  config.customWalls = Array.isArray(config.customWalls) ? config.customWalls : [];
  return config.customWalls;
}

function ensureGalleryLightsArray() {
  config.galleryLights = Array.isArray(config.galleryLights) ? config.galleryLights : [];
  return config.galleryLights;
}

function snapPlanValue(value: number) {
  return snapToStep(value, GALLERY_GRID_SNAP_M);
}

function applyGridSnap(value: number) {
  if (!galleryMapEditorState.snapToGrid) {
    return value;
  }
  return snapPlanValue(value);
}

function magnetValue(value: number, candidates: number[], threshold: number) {
  let best = value;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate) => {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  });
  if (bestDistance <= threshold) {
    return best;
  }
  return value;
}

function collectMagnetAxisCandidates(ignoreRoomId?: string) {
  const xCandidates: number[] = [];
  const zCandidates: number[] = [];

  config.rooms.forEach((room) => {
    if (ignoreRoomId && room.id === ignoreRoomId) {
      return;
    }
    xCandidates.push(room.x, room.x + room.width, room.x + room.width * 0.5);
    zCandidates.push(room.z, room.z + room.depth, room.z + room.depth * 0.5);
  });

  ensureCustomWallsArray().forEach((wall) => {
    xCandidates.push(Number(wall.x1 ?? 0), Number(wall.x2 ?? 0));
    zCandidates.push(Number(wall.z1 ?? 0), Number(wall.z2 ?? 0));
  });

  return { xCandidates, zCandidates };
}

function collectRoomSizeMagnetCandidates(ignoreRoomId?: string) {
  const widths: number[] = [];
  const depths: number[] = [];
  const ratios: number[] = [];
  config.rooms.forEach((room) => {
    if (ignoreRoomId && room.id === ignoreRoomId) {
      return;
    }
    if (room.width > 0.01) {
      widths.push(room.width);
    }
    if (room.depth > 0.01) {
      depths.push(room.depth);
    }
    if (room.width > 0.01 && room.depth > 0.01) {
      ratios.push(room.width / room.depth);
    }
  });
  return { widths, depths, ratios };
}

function applyPlanPointAssist(
  rawPoint: PlanPoint,
  mode: PlanAssistMode,
  options: { anchor?: PlanPoint; ignoreRoomId?: string } = {}
): PlanPoint {
  let x = applyGridSnap(rawPoint.x);
  let z = applyGridSnap(rawPoint.z);

  if (!galleryMapEditorState.magnet) {
    return { x, z };
  }

  const { xCandidates, zCandidates } = collectMagnetAxisCandidates(options.ignoreRoomId);
  x = magnetValue(x, xCandidates, GALLERY_MAGNET_THRESHOLD_M);
  z = magnetValue(z, zCandidates, GALLERY_MAGNET_THRESHOLD_M);

  if (mode === "room-create" && options.anchor) {
    const anchor = options.anchor;
    const signX = x >= anchor.x ? 1 : -1;
    const signZ = z >= anchor.z ? 1 : -1;
    const width = Math.abs(x - anchor.x);
    const depth = Math.abs(z - anchor.z);
    const sizeCandidates = collectRoomSizeMagnetCandidates(options.ignoreRoomId);

    const snappedWidth = magnetValue(width, sizeCandidates.widths, GALLERY_SIZE_MAGNET_THRESHOLD_M);
    if (Math.abs(snappedWidth - width) > 0.0001) {
      x = anchor.x + signX * snappedWidth;
    }
    const snappedDepth = magnetValue(depth, sizeCandidates.depths, GALLERY_SIZE_MAGNET_THRESHOLD_M);
    if (Math.abs(snappedDepth - depth) > 0.0001) {
      z = anchor.z + signZ * snappedDepth;
    }

    const finalWidth = Math.abs(x - anchor.x);
    const finalDepth = Math.abs(z - anchor.z);
    if (finalWidth > 0.1 && finalDepth > 0.1) {
      const ratio = finalWidth / finalDepth;
      let bestRatio = ratio;
      let bestDelta = Number.POSITIVE_INFINITY;
      sizeCandidates.ratios.forEach((candidateRatio) => {
        const delta = Math.abs(candidateRatio - ratio);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestRatio = candidateRatio;
        }
      });
      if (bestDelta <= 0.18) {
        const adjustedDepth = finalWidth / bestRatio;
        const adjustedWidth = finalDepth * bestRatio;
        const deltaDepth = Math.abs(adjustedDepth - finalDepth);
        const deltaWidth = Math.abs(adjustedWidth - finalWidth);
        if (deltaDepth < deltaWidth && deltaDepth <= GALLERY_SIZE_MAGNET_THRESHOLD_M) {
          z = anchor.z + signZ * adjustedDepth;
        } else if (deltaWidth <= GALLERY_SIZE_MAGNET_THRESHOLD_M) {
          x = anchor.x + signX * adjustedWidth;
        }
      }
    }
  }

  if (galleryMapEditorState.snapToGrid) {
    x = snapPlanValue(x);
    z = snapPlanValue(z);
  }
  return { x, z };
}

function assistMovedRoomPosition(room: GalleryRoom, rawX: number, rawZ: number) {
  let x = applyGridSnap(rawX);
  let z = applyGridSnap(rawZ);
  if (!galleryMapEditorState.magnet) {
    return { x, z };
  }
  const { xCandidates, zCandidates } = collectMagnetAxisCandidates(room.id);

  let bestX = x;
  let bestXDelta = Number.POSITIVE_INFINITY;
  const xEdges = [x, x + room.width];
  xCandidates.forEach((candidate) => {
    xEdges.forEach((edge, index) => {
      const delta = Math.abs(edge - candidate);
      if (delta < bestXDelta && delta <= GALLERY_MAGNET_THRESHOLD_M) {
        bestXDelta = delta;
        bestX = candidate - (index === 0 ? 0 : room.width);
      }
    });
  });

  let bestZ = z;
  let bestZDelta = Number.POSITIVE_INFINITY;
  const zEdges = [z, z + room.depth];
  zCandidates.forEach((candidate) => {
    zEdges.forEach((edge, index) => {
      const delta = Math.abs(edge - candidate);
      if (delta < bestZDelta && delta <= GALLERY_MAGNET_THRESHOLD_M) {
        bestZDelta = delta;
        bestZ = candidate - (index === 0 ? 0 : room.depth);
      }
    });
  });

  if (galleryMapEditorState.snapToGrid) {
    bestX = snapPlanValue(bestX);
    bestZ = snapPlanValue(bestZ);
  }
  return { x: bestX, z: bestZ };
}

function nextRoomId() {
  let index = 1;
  while (config.rooms.some((room) => room.id === `room_${index}`)) {
    index += 1;
  }
  return `room_${index}`;
}

function nextGalleryLightId() {
  return `gallery_light_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function setSelectedGalleryMapRoom(roomId: string | null) {
  if (galleryMapEditorState.selectedLightId) {
    galleryMapEditorState.selectedLightId = null;
    syncGalleryLightTargetOptions();
    syncSelectedGalleryLightControls();
  }
  if (!roomId || !config.rooms.some((room) => room.id === roomId)) {
    galleryMapEditorState.selectedRoomId = null;
  } else {
    galleryMapEditorState.selectedRoomId = roomId;
  }
  galleryMapEditorState.selectedCustomWallIndex = null;
  galleryMapEditorState.selectedPathPointIndex = null;
  setSelectedGalleryMapOpening(null);
  if (configMapDeleteRoomBtn) {
    configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
  }
}

function setSelectedGalleryMapCustomWall(wallIndex: number | null) {
  const walls = ensureCustomWallsArray();
  if (!Number.isInteger(wallIndex) || wallIndex == null || wallIndex < 0 || wallIndex >= walls.length) {
    galleryMapEditorState.selectedCustomWallIndex = null;
    return;
  }
  galleryMapEditorState.selectedCustomWallIndex = wallIndex;
  galleryMapEditorState.selectedRoomId = null;
  galleryMapEditorState.selectedPathPointIndex = null;
  setSelectedGalleryMapOpening(null);
  if (configMapDeleteRoomBtn) {
    configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
  }
}

function setSelectedGalleryMapOpening(openingRef: GalleryMapOpeningRef | null) {
  if (!openingRef || !resolveOpeningGeometryFromRef(openingRef)) {
    galleryMapEditorState.selectedOpening = null;
    syncSelectedOpeningControls();
    return;
  }
  galleryMapEditorState.selectedPathPointIndex = null;
  galleryMapEditorState.selectedOpening = openingRef;
  syncSelectedOpeningControls();
}

function getSelectedGalleryLight() {
  const selectedId = galleryMapEditorState.selectedLightId;
  if (!selectedId) {
    return null;
  }
  return ensureGalleryLightsArray().find((light) => light.id === selectedId) ?? null;
}

function setSelectedGalleryMapLight(lightId: string | null) {
  const lights = ensureGalleryLightsArray();
  if (!lightId || !lights.some((light) => light.id === lightId)) {
    galleryMapEditorState.selectedLightId = null;
  } else {
    galleryMapEditorState.selectedLightId = lightId;
    galleryMapEditorState.selectedRoomId = null;
    galleryMapEditorState.selectedCustomWallIndex = null;
    galleryMapEditorState.selectedPathPointIndex = null;
  }
  setSelectedGalleryMapOpening(null);
  if (configMapDeleteRoomBtn) {
    configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
  }
  syncGalleryLightTargetOptions();
  syncSelectedGalleryLightControls();
}

function findRoomAtPlanPoint(point: PlanPoint) {
  for (let idx = config.rooms.length - 1; idx >= 0; idx -= 1) {
    const room = config.rooms[idx];
    if (point.x < room.x || point.x > room.x + room.width || point.z < room.z || point.z > room.z + room.depth) {
      continue;
    }
    return room;
  }
  return null;
}

function getPaintingPlanPointById(paintingId?: string | null): PlanPoint | null {
  if (!paintingId) {
    return null;
  }
  const painting = config.paintings.find((candidate) => candidate.id === paintingId && candidate.placed !== false);
  if (!painting) {
    return null;
  }
  const customWallId = (painting.customWallId ?? "").trim();
  if (customWallId) {
    const customWall = ensureCustomWallsArray().find((wall) => (wall.id ?? "").trim() === customWallId);
    if (!customWall) {
      return null;
    }
    const x1 = Number(customWall.x1 ?? 0);
    const z1 = Number(customWall.z1 ?? 0);
    const x2 = Number(customWall.x2 ?? 0);
    const z2 = Number(customWall.z2 ?? 0);
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length < 0.05) {
      return null;
    }
    const along = clampNumber(Number(painting.customWallOffset ?? painting.offset ?? 0), 0, length);
    const ux = (x2 - x1) / length;
    const uz = (z2 - z1) / length;
    return { x: x1 + ux * along, z: z1 + uz * along };
  }
  const room = config.rooms.find((candidate) => candidate.id === painting.roomId);
  if (!room) {
    return null;
  }
  const wall = (painting.wall ?? "north") as WallSide;
  const span = getWallSpan(room, wall);
  const offset = clampNumber(Number(painting.offset ?? 0), 0, span);
  if (wall === "north") {
    return { x: room.x + offset, z: room.z };
  }
  if (wall === "south") {
    return { x: room.x + offset, z: room.z + room.depth };
  }
  if (wall === "west") {
    return { x: room.x, z: room.z + offset };
  }
  return { x: room.x + room.width, z: room.z + offset };
}

function getPaintingDimensionsCm(painting: (typeof config)["paintings"][number]) {
  const widthFromCm = Number(painting.widthCm);
  const heightFromCm = Number(painting.heightCm);
  const widthFromM = Number(painting.width);
  const heightFromM = Number(painting.height);
  const safeWidthCm = Number.isFinite(widthFromCm) && widthFromCm > 0
    ? Math.round(widthFromCm)
    : Number.isFinite(widthFromM) && widthFromM > 0
      ? Math.max(1, Math.round(mToCm(widthFromM)))
      : 100;
  const safeHeightCm = Number.isFinite(heightFromCm) && heightFromCm > 0
    ? Math.round(heightFromCm)
    : Number.isFinite(heightFromM) && heightFromM > 0
      ? Math.max(1, Math.round(mToCm(heightFromM)))
      : Math.max(1, Math.round(safeWidthCm * 0.75));
  return { widthCm: safeWidthCm, heightCm: safeHeightCm };
}

function estimatePaintingHalfHeightM(painting: (typeof config)["paintings"][number]) {
  const { heightCm } = getPaintingDimensionsCm(painting);
  return Math.max(0.2, heightCm / CM_PER_M * 0.5 + 0.1);
}

function clampAllPaintingsToCurrentGeometry() {
  config.paintings.forEach((painting) => {
    if (painting.placed === false) {
      return;
    }
    const half = estimatePaintingHalfHeightM(painting);
    const customWallId = (painting.customWallId ?? "").trim();
    if (customWallId) {
      const customWall = ensureCustomWallsArray().find((wall) => (wall.id ?? "").trim() === customWallId);
      if (!customWall) {
        return;
      }
      const dx = Number(customWall.x2 ?? 0) - Number(customWall.x1 ?? 0);
      const dz = Number(customWall.z2 ?? 0) - Number(customWall.z1 ?? 0);
      const length = Math.hypot(dx, dz);
      const margin = Math.max(0.45, getPaintingDimensionsCm(painting).widthCm / CM_PER_M * 0.5 + 0.12);
      const offset = clampNumber(Number(painting.customWallOffset ?? painting.offset ?? 0), margin, Math.max(margin, length - margin));
      painting.customWallOffset = offset;
      painting.customWallOffsetCm = Math.round(offset * CM_PER_M);
      painting.offset = offset;
      const wallHeight = Math.max(0.2, Number(customWall.height ?? 3));
      painting.centerY = clampNumber(Number(painting.centerY ?? 1.65), half, Math.max(half, wallHeight - half));
      return;
    }
    const room = config.rooms.find((candidate) => candidate.id === painting.roomId);
    if (!room) {
      return;
    }
    const wall = (painting.wall ?? "north") as WallSide;
    const span = getWallSpan(room, wall);
    const margin = Math.max(0.45, getPaintingDimensionsCm(painting).widthCm / CM_PER_M * 0.5 + 0.12);
    painting.offset = clampNumber(Number(painting.offset ?? 0), margin, Math.max(margin, span - margin));
    painting.centerY = clampNumber(Number(painting.centerY ?? 1.65), half, Math.max(half, room.height - half));
  });
}

function applyGlobalWallParamsFromInputs(source: "room" | "wall" = "room") {
  const rawHeightCm = source === "wall" ? Number(configMapWallHeightCmWall.value) : Number(configMapWallHeightCm.value);
  const rawThicknessCm = source === "wall" ? Number(configMapWallThicknessCmWall.value) : Number(configMapWallThicknessCm.value);
  const heightCm = Math.max(100, rawHeightCm || 300);
  const thicknessCm = Math.max(5, rawThicknessCm || 16);
  const roundedHeight = String(Math.round(heightCm));
  const roundedThickness = String(Math.round(thicknessCm));
  configMapWallHeightCm.value = roundedHeight;
  configMapWallThicknessCm.value = roundedThickness;
  configMapWallHeightCmWall.value = roundedHeight;
  configMapWallThicknessCmWall.value = roundedThickness;
  config.rooms.forEach((room) => {
    room.height = heightCm / CM_PER_M;
    room.heightCm = Math.round(heightCm);
  });
  ensureCustomWallsArray().forEach((wall) => {
    wall.height = heightCm / CM_PER_M;
    wall.heightCm = Math.round(heightCm);
    wall.thickness = thicknessCm / CM_PER_M;
    wall.thicknessCm = Math.round(thicknessCm);
  });
  const rendering = ensureRenderingConfig();
  rendering.wallThickness = thicknessCm / CM_PER_M;
  rendering.wallThicknessCm = Math.round(thicknessCm);
  clampAllPaintingsToCurrentGeometry();
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function resolveOpeningSpanMForRoomOpening(room: GalleryRoom, opening: GalleryRoomOpening) {
  const wall = toWallSide(opening.wall) ?? "north";
  return wall === "north" || wall === "south" ? room.width : room.depth;
}

function resolveOpeningSpanMForCustomWall(wall: { x1?: number; z1?: number; x2?: number; z2?: number }) {
  const x1 = Number(wall.x1 ?? 0);
  const z1 = Number(wall.z1 ?? 0);
  const x2 = Number(wall.x2 ?? 0);
  const z2 = Number(wall.z2 ?? 0);
  return Math.hypot(x2 - x1, z2 - z1);
}

function applyOpeningParamSet(
  opening: GalleryRoomOpening,
  values: { type: "door" | "window" | "opening"; widthM: number; baseM: number; heightM: number },
  wallSpanM: number,
  wallHeightM: number
) {
  const width = clampNumber(values.widthM, 0.05, Math.max(0.05, wallSpanM));
  const centerPrev = getOpeningCenterM(opening);
  const center = clampNumber(centerPrev, width * 0.5, Math.max(width * 0.5, wallSpanM - width * 0.5));
  const base = clampNumber(values.baseM, 0, Math.max(0, wallHeightM - 0.05));
  const height = clampNumber(values.heightM, 0.05, Math.max(0.05, wallHeightM - base));
  opening.type = values.type;
  opening.width = width;
  opening.widthCm = Math.round(width * CM_PER_M);
  opening.center = center;
  opening.centerCm = Math.round(center * CM_PER_M);
  opening.base = base;
  opening.baseCm = Math.round(base * CM_PER_M);
  opening.height = height;
  opening.heightCm = Math.round(height * CM_PER_M);
}

function getSelectedOpeningContext() {
  const ref = galleryMapEditorState.selectedOpening;
  if (!ref) {
    return null;
  }
  if (ref.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === ref.roomId);
    if (!room || !Array.isArray(room.openings) || ref.openingIndex < 0 || ref.openingIndex >= room.openings.length) {
      return null;
    }
    const opening = room.openings[ref.openingIndex];
    const wall = toWallSide(opening.wall) ?? ref.wall;
    const span = resolveOpeningSpanMForRoomOpening(room, opening);
    const wallHeight = Math.max(0.1, Number(room.height ?? 3));
    return { ref, opening, room, wall, span, wallHeight } as const;
  }
  const walls = ensureCustomWallsArray();
  if (ref.wallIndex < 0 || ref.wallIndex >= walls.length) {
    return null;
  }
  const wall = walls[ref.wallIndex];
  if (!Array.isArray(wall.openings) || ref.openingIndex < 0 || ref.openingIndex >= wall.openings.length) {
    return null;
  }
  const opening = wall.openings[ref.openingIndex];
  const span = resolveOpeningSpanMForCustomWall(wall);
  const wallHeight = Math.max(0.1, Number(wall.height ?? 3));
  return { ref, opening, wallConfig: wall, span, wallHeight } as const;
}

function syncSelectedOpeningControls() {
  const selected = getSelectedOpeningContext();
  const disabled = !selected;
  configMapOpeningType.disabled = disabled;
  configMapOpeningWidthCm.disabled = disabled;
  configMapOpeningBaseCm.disabled = disabled;
  configMapOpeningHeightCm.disabled = disabled;
  if (!selected) {
    return;
  }
  configMapOpeningType.value = resolveOpeningType(selected.opening);
  configMapOpeningWidthCm.value = String(Math.round(getOpeningWidthM(selected.opening) * CM_PER_M || 120));
  configMapOpeningBaseCm.value = String(Math.round(getOpeningBaseM(selected.opening) * CM_PER_M || 0));
  configMapOpeningHeightCm.value = String(Math.round(getOpeningHeightM(selected.opening) * CM_PER_M || 220));
}

function applySelectedOpeningParamsFromInputs() {
  const selected = getSelectedOpeningContext();
  if (!selected) {
    return;
  }
  const type = (configMapOpeningType.value as "door" | "window" | "opening") || "opening";
  const widthCm = Math.max(20, Number(configMapOpeningWidthCm.value) || 120);
  const baseCm = Math.max(0, Number(configMapOpeningBaseCm.value) || 0);
  const heightCm = Math.max(20, Number(configMapOpeningHeightCm.value) || 220);
  configMapOpeningWidthCm.value = String(Math.round(widthCm));
  configMapOpeningBaseCm.value = String(Math.round(baseCm));
  configMapOpeningHeightCm.value = String(Math.round(heightCm));
  const values = { type, widthM: widthCm / CM_PER_M, baseM: baseCm / CM_PER_M, heightM: heightCm / CM_PER_M };
  if (selected.ref.kind === "room") {
    const previous = {
      type: resolveOpeningType(selected.opening),
      wall: selected.wall,
      center: getOpeningCenterM(selected.opening),
      width: getOpeningWidthM(selected.opening),
      base: getOpeningBaseM(selected.opening),
      height: getOpeningHeightM(selected.opening),
    };
    applyOpeningParamSet(selected.opening, values, selected.span, selected.wallHeight);
    removeMirroredOpeningOnAdjacentRooms(selected.room, selected.wall, previous);
    mirrorOpeningOnAdjacentRooms(selected.room, selected.wall, {
      type: resolveOpeningType(selected.opening),
      center: getOpeningCenterM(selected.opening),
      width: getOpeningWidthM(selected.opening),
      base: getOpeningBaseM(selected.opening),
      height: getOpeningHeightM(selected.opening),
    });
  } else {
    applyOpeningParamSet(selected.opening, values, selected.span, selected.wallHeight);
  }
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function getGalleryMapObserverSignature() {
  return `${visitor.position.x.toFixed(2)}|${visitor.position.z.toFixed(2)}|${movement.yaw.toFixed(3)}`;
}

function isConfigTabActive(tabId: string) {
  return configTabButtons.some((button) => button.dataset.configTab === tabId && button.classList.contains("active"));
}

function isGalleryMapSubTabActive(tabId: string) {
  return configGalleryMapSubTabButtons.some((button) => button.dataset.galleryMapSubtab === tabId && button.classList.contains("active"));
}

function resolveConfigCameraStartPlanPoint(): PlanPoint {
  const start = config.visitor?.start ?? {};
  const x = Number(start.x);
  const z = Number(start.z);
  return {
    x: Number.isFinite(x) ? x : visitor.position.x,
    z: Number.isFinite(z) ? z : visitor.position.z,
  };
}

function resolveConfigCameraTargetPlanPoint(startPointArg?: PlanPoint): PlanPoint {
  const startPoint = startPointArg ?? resolveConfigCameraStartPlanPoint();
  const start = config.visitor?.start ?? {};
  const targetX = Number(start.targetX);
  const targetZ = Number(start.targetZ);
  if (Number.isFinite(targetX) && Number.isFinite(targetZ)) {
    return { x: targetX, z: targetZ };
  }
  const yaw = Number(start.yaw);
  const fallbackYaw = Number.isFinite(yaw) ? yaw : movement.yaw;
  return {
    x: startPoint.x + Math.sin(fallbackYaw) * 3,
    z: startPoint.z + Math.cos(fallbackYaw) * 3,
  };
}

function syncConfigCameraFieldsFromState() {
  const start = ensureVisitorStartConfig();
  setCameraFieldValue(configCameraStartX, Number(start.x), 2);
  setCameraFieldValue(configCameraStartY, Number(start.y), 2);
  setCameraFieldValue(configCameraStartZ, Number(start.z), 2);
  setCameraFieldValue(configCameraTargetX, Number(start.targetX), 2);
  setCameraFieldValue(configCameraTargetY, Number(start.targetY), 2);
  setCameraFieldValue(configCameraTargetZ, Number(start.targetZ), 2);
}

function syncConfigCameraOrientationFromPoints(startPoint: PlanPoint, targetPoint: PlanPoint) {
  const start = ensureVisitorStartConfig();
  const startYRaw = Number(start.y);
  const targetYRaw = Number(start.targetY);
  const startY = Number.isFinite(startYRaw) ? startYRaw : visitor.eyeHeight;
  const targetY = Number.isFinite(targetYRaw) ? targetYRaw : startY;
  const dx = targetPoint.x - startPoint.x;
  const dz = targetPoint.z - startPoint.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal <= 0.0001) {
    return;
  }
  start.yaw = roundConfigNumber(Math.atan2(dx, dz), 6);
  start.pitch = roundConfigNumber(clampNumber(Math.atan2(targetY - startY, horizontal), MIN_PITCH, MAX_PITCH), 6);
}

function applyCameraPointFromMapDrag(rawPoint: PlanPoint, handle: "start" | "target") {
  const point = applyPlanPointAssist(rawPoint, "generic");
  const start = ensureVisitorStartConfig();
  if (handle === "start") {
    start.x = roundConfigNumber(point.x);
    start.z = roundConfigNumber(point.z);
    if (!Number.isFinite(Number(start.y))) {
      start.y = roundConfigNumber(visitor.eyeHeight);
    }
  } else {
    start.targetX = roundConfigNumber(point.x);
    start.targetZ = roundConfigNumber(point.z);
    if (!Number.isFinite(Number(start.targetY))) {
      const fallbackStartY = Number(start.y);
      start.targetY = roundConfigNumber(Number.isFinite(fallbackStartY) ? fallbackStartY : visitor.eyeHeight);
    }
  }

  const startPoint = resolveConfigCameraStartPlanPoint();
  const targetPoint = resolveConfigCameraTargetPlanPoint(startPoint);
  syncConfigCameraOrientationFromPoints(startPoint, targetPoint);
  const startCfg = ensureVisitorStartConfig();
  const runtimeStartY = Number.isFinite(Number(startCfg.y)) ? Number(startCfg.y) : visitor.eyeHeight;
  const runtimeTargetY = Number.isFinite(Number(startCfg.targetY)) ? Number(startCfg.targetY) : runtimeStartY;
  const dx = targetPoint.x - startPoint.x;
  const dz = targetPoint.z - startPoint.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal > 0.0001) {
    movement.yaw = Math.atan2(dx, dz);
    movement.pitch = clampNumber(Math.atan2(runtimeTargetY - runtimeStartY, horizontal), MIN_PITCH, MAX_PITCH);
  }
  visitor.position.set(startPoint.x, visitor.eyeHeight, startPoint.z);
  movement.focusTarget = new THREE.Vector3(targetPoint.x, runtimeTargetY, targetPoint.z);
  movement.route = [];
  movement.destination = null;
  movement.finalDestination = null;
  syncConfigCameraFieldsFromState();
  renderGalleryMapEditor();
}

function refreshGalleryMapObserverIfNeeded(force = false) {
  if (!isConfigTabActive("gallery-map")) {
    return;
  }
  const start = ensureVisitorStartConfig();
  start.x = roundConfigNumber(visitor.position.x);
  start.y = roundConfigNumber(visitor.position.y);
  start.z = roundConfigNumber(visitor.position.z);
  const liveTarget = movement.focusTarget
    ? movement.focusTarget.clone()
    : new THREE.Vector3(
        visitor.position.x + Math.sin(movement.yaw) * 3,
        visitor.position.y + Math.sin(movement.pitch) * 3,
        visitor.position.z + Math.cos(movement.yaw) * 3
      );
  start.targetX = roundConfigNumber(liveTarget.x);
  start.targetY = roundConfigNumber(liveTarget.y);
  start.targetZ = roundConfigNumber(liveTarget.z);
  start.yaw = roundConfigNumber(movement.yaw, 6);
  start.pitch = roundConfigNumber(movement.pitch, 6);
  if (isGalleryMapSubTabActive("camera")) {
    syncConfigCameraFieldsFromState();
  }
  const signature = getGalleryMapObserverSignature();
  if (!force && signature === lastGalleryMapObserverSignature) {
    return;
  }
  renderGalleryMapEditor();
}

function focusPaintingFromGalleryMap(paintingId: string) {
  const painting = config.paintings.find((candidate) => candidate.id === paintingId && candidate.placed !== false);
  if (!painting) {
    return false;
  }
  uiState.selectedPaintingId = painting.id;
  const entry = paintingRegistry.get(painting.id);
  if (entry) {
    closePaintingCard();
    const viewPos = computePaintingViewPosition(entry.paintingSpot);
    if (viewPos) {
      movementActions.moveVisitorTo(viewPos, entry.paintingSpot.center.clone());
    }
  }
  syncLightTargetSelectorFromPainting(painting.id);
  renderFilmstrip();
  renderGalleryMapEditor();
  return true;
}

function moveVisitorToPlanPointFromMap(rawPoint: PlanPoint) {
  const assisted = applyPlanPointAssist(rawPoint, "generic");
  const target = new THREE.Vector3(assisted.x, visitor.eyeHeight, assisted.z);
  const clamped = movementActions.clampToWalkable(target);
  if (!clamped) {
    return false;
  }
  movementActions.moveVisitorTo(clamped, null);
  return true;
}

function resolveRoomIdAtPlanPoint(point: PlanPoint) {
  for (let idx = config.rooms.length - 1; idx >= 0; idx -= 1) {
    const room = config.rooms[idx];
    if (point.x >= room.x && point.x <= room.x + room.width && point.z >= room.z && point.z <= room.z + room.depth) {
      return room.id;
    }
  }
  return null;
}

function resolvePaintingRoomId(entry: PaintingRegistryEntry) {
  return resolveRoomIdAtPlanPoint({
    x: Number(entry.paintingSpot.center.x),
    z: Number(entry.paintingSpot.center.z),
  });
}

function findNearestPaintingEntryToPoint(point: PlanPoint, toleranceM = Number.POSITIVE_INFINITY, roomId: string | null = null) {
  let best: { id: string; distance: number } | null = null;
  paintingRegistry.forEach((entry, id) => {
    if (roomId && resolvePaintingRoomId(entry) !== roomId) {
      return;
    }
    const dx = Number(entry.paintingSpot.center.x) - point.x;
    const dz = Number(entry.paintingSpot.center.z) - point.z;
    const distance = Math.hypot(dx, dz);
    if (Number.isFinite(toleranceM) && distance > toleranceM) {
      return;
    }
    if (!best || distance < best.distance) {
      best = { id, distance };
    }
  });
  return best ? paintingRegistry.get(best.id) ?? null : null;
}

function findPaintingAssignedToKeyframe(points: PlanPoint[], keyframeIndex: number, roomId: string | null = null) {
  if (keyframeIndex < 0 || keyframeIndex >= points.length) {
    return null;
  }
  const targetPoint = points[keyframeIndex];
  let bestForThisKeyframe: { id: string; distance: number } | null = null;
  paintingRegistry.forEach((entry, id) => {
    if (roomId && resolvePaintingRoomId(entry) !== roomId) {
      return;
    }
    let nearestIdx = -1;
    let nearestDist = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const distance = Math.hypot(Number(entry.paintingSpot.center.x) - point.x, Number(entry.paintingSpot.center.z) - point.z);
      if (distance < nearestDist) {
        nearestDist = distance;
        nearestIdx = index;
      }
    });
    if (nearestIdx !== keyframeIndex) {
      return;
    }
    const distanceToCurrent = Math.hypot(
      Number(entry.paintingSpot.center.x) - targetPoint.x,
      Number(entry.paintingSpot.center.z) - targetPoint.z
    );
    if (!bestForThisKeyframe || distanceToCurrent < bestForThisKeyframe.distance) {
      bestForThisKeyframe = { id, distance: distanceToCurrent };
    }
  });
  return bestForThisKeyframe ? paintingRegistry.get(bestForThisKeyframe.id) ?? null : null;
}

function stopPathPlayback() {
  if (!pathPlaybackState.active) {
    return;
  }
  pathPlaybackState.active = false;
  pathPlaybackState.nextIndex = 0;
  pathPlaybackState.waitingUntilMs = 0;
  pathPlaybackState.cardCloseAtMs = 0;
  pathPlaybackState.lastMoveIssuedAtMs = 0;
  movement.speedScale = pathPlaybackState.baseSpeedScale;
  closePaintingCard();
}

function moveToPathIndex(index: number) {
  const points = getPathTourKeyframes();
  const tour = ensureVisitorPathTourConfig();
  const loop = tour.loop === true;
  if (index < 0 || index >= points.length) {
    if (loop && points.length > 0) {
      pathPlaybackState.nextIndex = 0;
      moveToPathIndex(0);
      return;
    }
    stopPathPlayback();
    return;
  }
  const walkSeconds = clampNumber(Number.isFinite(Number(tour.walkSeconds)) ? Number(tour.walkSeconds) : 4, 0.2, 60);
  const point = points[index];
  const target = new THREE.Vector3(point.x, visitor.eyeHeight, point.z);
  const clamped = movementActions.clampToWalkable(target);
  if (!clamped) {
    pathPlaybackState.nextIndex = index + 1;
    moveToPathIndex(pathPlaybackState.nextIndex);
    return;
  }
  const segmentDistance = Math.max(0.01, visitor.position.distanceTo(clamped));
  movement.speedScale = clampNumber(segmentDistance / walkSeconds / Math.max(0.01, visitor.moveSpeed), 0.2, 6);
  movementActions.moveVisitorTo(clamped, null);
  pathPlaybackState.lastMoveIssuedAtMs = performance.now();
}

function startPathPlayback() {
  const points = getPathTourKeyframes();
  if (!points.length) {
    return;
  }
  stopPathPlayback();
  pathPlaybackState.baseSpeedScale = movement.speedScale;
  pathPlaybackState.active = true;
  pathPlaybackState.nextIndex = 0;
  pathPlaybackState.waitingUntilMs = 0;
  pathPlaybackState.cardCloseAtMs = 0;
  pathPlaybackState.lastMoveIssuedAtMs = 0;
  closePaintingCard();
  moveToPathIndex(0);
}

function updatePathPlayback() {
  if (!pathPlaybackState.active) {
    return;
  }
  const nowMs = performance.now();
  const tour = ensureVisitorPathTourConfig();
  const currentRoomId = resolveRoomIdAtPlanPoint({ x: visitor.position.x, z: visitor.position.z });
  const autoTarget = tour.autoTargetNearestPainting !== false;
  if (autoTarget) {
    const nearest = findNearestPaintingEntryToPoint({ x: visitor.position.x, z: visitor.position.z }, Number.POSITIVE_INFINITY, currentRoomId);
    if (nearest) {
      movement.focusTarget = nearest.paintingSpot.center.clone();
    }
  }
  if (pathPlaybackState.cardCloseAtMs > 0 && nowMs >= pathPlaybackState.cardCloseAtMs) {
    closePaintingCard();
    pathPlaybackState.cardCloseAtMs = 0;
  }
  if (pathPlaybackState.waitingUntilMs > 0) {
    if (nowMs < pathPlaybackState.waitingUntilMs) {
      return;
    }
    pathPlaybackState.waitingUntilMs = 0;
    pathPlaybackState.nextIndex += 1;
    moveToPathIndex(pathPlaybackState.nextIndex);
    return;
  }
  if (movement.route.length || movement.destination) {
    return;
  }
  const points = getPathTourKeyframes();
  if (pathPlaybackState.nextIndex < 0 || pathPlaybackState.nextIndex >= points.length) {
    if (tour.loop === true && points.length > 0) {
      pathPlaybackState.nextIndex = 0;
      moveToPathIndex(0);
      return;
    }
    stopPathPlayback();
    return;
  }
  const point = points[pathPlaybackState.nextIndex];
  const keyframeRoomId = resolveRoomIdAtPlanPoint(point);
  const roomConstraint = keyframeRoomId ?? currentRoomId;
  const entry = findPaintingAssignedToKeyframe(points, pathPlaybackState.nextIndex, roomConstraint);
  const stopSeconds = clampNumber(Number.isFinite(Number(tour.stopOnPaintingSeconds)) ? Number(tour.stopOnPaintingSeconds) : 1.5, 0, 60);
  const cardSeconds = clampNumber(Number.isFinite(Number(tour.cardSeconds)) ? Number(tour.cardSeconds) : 2.5, 0, 60);
  const shouldOpenCard = tour.openPaintingCard !== false;
  let waitSeconds = 0;
  if (entry) {
    movement.focusTarget = entry.paintingSpot.center.clone();
    waitSeconds = stopSeconds;
    if (shouldOpenCard && cardSeconds > 0) {
      openPaintingCard(entry.paintingSpot);
      pathPlaybackState.cardCloseAtMs = nowMs + cardSeconds * 1000;
      waitSeconds = Math.max(waitSeconds, cardSeconds);
    }
  }
  if (waitSeconds > 0) {
    pathPlaybackState.waitingUntilMs = nowMs + waitSeconds * 1000;
    return;
  }
  pathPlaybackState.nextIndex += 1;
  moveToPathIndex(pathPlaybackState.nextIndex);
}

function getGalleryLightTargetPlanPoint(light: GallerySpotLightConfig) {
  const preview = getMovingLightTargetPreview(light);
  if (preview) {
    return preview;
  }
  const byPainting = getPaintingPlanPointById(light.targetPaintingId);
  if (byPainting) {
    return byPainting;
  }
  const targetX = Number(light.targetX);
  const targetZ = Number(light.targetZ);
  if (Number.isFinite(targetX) && Number.isFinite(targetZ)) {
    return { x: targetX, z: targetZ };
  }
  return null;
}

function syncGalleryLightTargetOptions() {
  const previousValue = configMapLightTargetPainting.value;
  const selectedLight = getSelectedGalleryLight();
  const options: Array<{ value: string; label: string }> = [{ value: "", label: "Nessuna opera" }];
  config.paintings
    .filter((painting) => painting.placed !== false)
    .forEach((painting) => {
      const title = (painting.title ?? "").trim() || painting.id;
      options.push({ value: painting.id, label: title });
    });
  configMapLightTargetPainting.innerHTML = "";
  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    configMapLightTargetPainting.appendChild(option);
  });
  const preferredValue = selectedLight?.targetPaintingId ?? previousValue;
  const hasPreferred = options.some((option) => option.value === preferredValue);
  configMapLightTargetPainting.value = hasPreferred ? preferredValue : "";
}

function findNearestGalleryLight(point: PlanPoint, toleranceM = GALLERY_LIGHT_PICK_TOLERANCE_M) {
  let best: { index: number; light: GallerySpotLightConfig; distance: number } | null = null;
  ensureGalleryLightsArray().forEach((light, index) => {
    const x = Number(light.x ?? 0);
    const z = Number(light.z ?? 0);
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance > toleranceM) {
      return;
    }
    if (!best || distance < best.distance) {
      best = { index, light, distance };
    }
  });
  return best;
}

function syncSelectedGalleryLightControls() {
  const selectedLight = getSelectedGalleryLight();
  if (!selectedLight) {
    configMapLightTargetPainting.disabled = false;
    configMapLightTargetPainting.title = "Scegli opera target prima di aggiungere uno spot";
    return;
  }

  const heightCm = Math.max(120, Number.isFinite(Number(selectedLight.yCm)) ? Number(selectedLight.yCm) : Number(selectedLight.y ?? 2.9) * 100);
  const intensity = Math.max(0, Number(selectedLight.intensity ?? 8));
  const angleDeg = clampNumber(
    Number.isFinite(Number(selectedLight.angleDeg))
      ? Number(selectedLight.angleDeg)
      : THREE.MathUtils.radToDeg(Number(selectedLight.angle ?? THREE.MathUtils.degToRad(28))),
    5,
    80
  );
  const distance = Math.max(1, Number(selectedLight.distance ?? 12));
  const penumbra = clampNumber(Number(selectedLight.penumbra ?? 0.22), 0, 1);

  configMapLightHeightCm.value = String(Math.round(heightCm));
  configMapLightIntensity.value = intensity.toFixed(2).replace(/\.00$/, "");
  configMapLightAngleDeg.value = String(Math.round(angleDeg));
  configMapLightDistanceM.value = distance.toFixed(2).replace(/\.00$/, "");
  configMapLightPenumbra.value = penumbra.toFixed(2).replace(/\.00$/, "");

  const targetPaintingId = selectedLight.targetPaintingId ?? "";
  if (targetPaintingId && Array.from(configMapLightTargetPainting.options).some((option) => option.value === targetPaintingId)) {
    configMapLightTargetPainting.value = targetPaintingId;
  } else {
    configMapLightTargetPainting.value = "";
  }
  configMapLightTargetPainting.disabled = true;
  configMapLightTargetPainting.title = "Target bloccato per la luce selezionata";
}

function applySelectedGalleryLightParams() {
  const selectedLight = getSelectedGalleryLight();
  if (!selectedLight) {
    return;
  }

  const rawHeightCm = Number(configMapLightHeightCm.value);
  const rawIntensity = Number(configMapLightIntensity.value);
  const rawAngleDeg = Number(configMapLightAngleDeg.value);
  const rawDistance = Number(configMapLightDistanceM.value);
  const rawPenumbra = Number(configMapLightPenumbra.value);
  const heightCm = Math.max(120, Number.isFinite(rawHeightCm) ? rawHeightCm : Number(selectedLight.yCm ?? 290));
  const intensity = Math.max(0, Number.isFinite(rawIntensity) ? rawIntensity : Number(selectedLight.intensity ?? 8));
  const angleDeg = clampNumber(Number.isFinite(rawAngleDeg) ? rawAngleDeg : Number(selectedLight.angleDeg ?? 28), 5, 80);
  const distance = Math.max(1, Number.isFinite(rawDistance) ? rawDistance : Number(selectedLight.distance ?? 12));
  const penumbra = clampNumber(Number.isFinite(rawPenumbra) ? rawPenumbra : Number(selectedLight.penumbra ?? 0.22), 0, 1);

  selectedLight.y = heightCm / 100;
  selectedLight.yCm = Math.round(heightCm);
  selectedLight.intensity = intensity;
  selectedLight.distance = distance;
  selectedLight.angleDeg = angleDeg;
  selectedLight.angle = THREE.MathUtils.degToRad(angleDeg);
  selectedLight.penumbra = penumbra;
  selectedLight.decay = Number.isFinite(Number(selectedLight.decay)) ? Math.max(0, Number(selectedLight.decay)) : 1.2;
  const targetPoint = getPaintingPlanPointById(selectedLight.targetPaintingId);
  if (targetPoint) {
    selectedLight.targetX = targetPoint.x;
    selectedLight.targetZ = targetPoint.z;
    selectedLight.targetY = 1.65;
    selectedLight.targetXCm = Math.round(targetPoint.x * 100);
    selectedLight.targetZCm = Math.round(targetPoint.z * 100);
    selectedLight.targetYCm = 165;
  } else if (!selectedLight.targetPaintingId && !Number.isFinite(Number(selectedLight.targetX)) && !Number.isFinite(Number(selectedLight.targetZ))) {
    const x = Number(selectedLight.x ?? 0);
    const z = Number(selectedLight.z ?? 0);
    selectedLight.targetX = x;
    selectedLight.targetZ = z;
    selectedLight.targetY = 1.65;
    selectedLight.targetXCm = Math.round(x * 100);
    selectedLight.targetZCm = Math.round(z * 100);
    selectedLight.targetYCm = 165;
  }

  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function getMovingLightPreview(light: GallerySpotLightConfig): PlanPoint | null {
  const moving = galleryMapEditorState.movingLight;
  const pointer = galleryMapEditorState.dragCurrent;
  if (!moving || !pointer || galleryMapEditorState.dragAction !== "moveLight" || moving.lightId !== light.id) {
    return null;
  }
  const deltaX = pointer.x - moving.startPointer.x;
  const deltaZ = pointer.z - moving.startPointer.z;
  return applyPlanPointAssist({ x: moving.startX + deltaX, z: moving.startZ + deltaZ }, "generic");
}

function getMovingLightTargetPreview(light: GallerySpotLightConfig): PlanPoint | null {
  const moving = galleryMapEditorState.movingLightTarget;
  const pointer = galleryMapEditorState.dragCurrent;
  if (!moving || !pointer || galleryMapEditorState.dragAction !== "moveLightTarget" || moving.lightId !== light.id) {
    return null;
  }
  const deltaX = pointer.x - moving.startPointer.x;
  const deltaZ = pointer.z - moving.startPointer.z;
  return applyPlanPointAssist({ x: moving.startX + deltaX, z: moving.startZ + deltaZ }, "generic");
}

function getGalleryLightPlanPoint(light: GallerySpotLightConfig): PlanPoint {
  const preview = getMovingLightPreview(light);
  if (preview) {
    return preview;
  }
  return { x: Number(light.x ?? 0), z: Number(light.z ?? 0) };
}

function addGalleryLightAtPoint(point: PlanPoint) {
  const lights = ensureGalleryLightsArray();
  const rawHeightCm = Number(configMapLightHeightCm.value);
  const rawIntensity = Number(configMapLightIntensity.value);
  const rawAngleDeg = Number(configMapLightAngleDeg.value);
  const rawDistance = Number(configMapLightDistanceM.value);
  const rawPenumbra = Number(configMapLightPenumbra.value);
  const heightCm = Math.max(120, Number.isFinite(rawHeightCm) ? rawHeightCm : 290);
  const intensity = Math.max(0, Number.isFinite(rawIntensity) ? rawIntensity : 8);
  const angleDeg = clampNumber(Number.isFinite(rawAngleDeg) ? rawAngleDeg : 28, 5, 80);
  const distance = Math.max(1, Number.isFinite(rawDistance) ? rawDistance : 12);
  const penumbra = clampNumber(Number.isFinite(rawPenumbra) ? rawPenumbra : 0.22, 0, 1);
  const targetPaintingId = configMapLightTargetPainting.value || "";
  const targetPoint = getPaintingPlanPointById(targetPaintingId);
  const nearestWall = findNearestPlanWall(point, Number.POSITIVE_INFINITY);
  const nearestWallTarget = nearestWall ? projectPointToSegment(point, nearestWall.wall.from, nearestWall.wall.to) : null;
  const fallbackTarget = nearestWallTarget ? { x: nearestWallTarget.x, z: nearestWallTarget.z } : point;
  const light: GallerySpotLightConfig = { id: nextGalleryLightId() };
  light.x = point.x;
  light.z = point.z;
  light.y = heightCm / 100;
  light.xCm = Math.round(point.x * 100);
  light.zCm = Math.round(point.z * 100);
  light.yCm = heightCm;
  light.intensity = intensity;
  light.distance = distance;
  light.angle = THREE.MathUtils.degToRad(angleDeg);
  light.angleDeg = angleDeg;
  light.penumbra = penumbra;
  light.decay = 1.2;
  light.targetPaintingId = targetPoint ? targetPaintingId : "";
  light.targetX = targetPoint ? targetPoint.x : fallbackTarget.x;
  light.targetZ = targetPoint ? targetPoint.z : fallbackTarget.z;
  light.targetY = 1.65;
  light.targetXCm = Math.round((targetPoint ? targetPoint.x : fallbackTarget.x) * 100);
  light.targetZCm = Math.round((targetPoint ? targetPoint.z : fallbackTarget.z) * 100);
  light.targetYCm = 165;
  lights.push(light);
  setSelectedGalleryMapLight(light.id ?? null);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function deleteGalleryLightAtPoint(point: PlanPoint) {
  const nearest = findNearestGalleryLight(point);
  if (!nearest) {
    return;
  }
  const lights = ensureGalleryLightsArray();
  lights.splice(nearest.index, 1);
  if (galleryMapEditorState.selectedLightId === nearest.light.id) {
    setSelectedGalleryMapLight(null);
  }
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function applyGalleryLightMoveFromDrag(end: PlanPoint) {
  const moving = galleryMapEditorState.movingLight;
  if (!moving) {
    return;
  }
  const light = ensureGalleryLightsArray().find((candidate) => candidate.id === moving.lightId);
  if (!light) {
    setSelectedGalleryMapLight(null);
    return;
  }
  const deltaX = end.x - moving.startPointer.x;
  const deltaZ = end.z - moving.startPointer.z;
  const moved = applyPlanPointAssist({ x: moving.startX + deltaX, z: moving.startZ + deltaZ }, "generic");
  const nextX = moved.x;
  const nextZ = moved.z;
  if (Math.abs(nextX - Number(light.x ?? 0)) < 0.0001 && Math.abs(nextZ - Number(light.z ?? 0)) < 0.0001) {
    return;
  }
  light.x = nextX;
  light.z = nextZ;
  light.xCm = Math.round(nextX * 100);
  light.zCm = Math.round(nextZ * 100);
  if (!light.targetPaintingId && !Number.isFinite(Number(light.targetX)) && !Number.isFinite(Number(light.targetZ))) {
    light.targetX = nextX;
    light.targetZ = nextZ;
    light.targetY = Number.isFinite(Number(light.targetY)) ? Number(light.targetY) : 1.65;
    light.targetXCm = Math.round(nextX * 100);
    light.targetZCm = Math.round(nextZ * 100);
    light.targetYCm = Math.round(Number(light.targetY) * 100);
  }
  rebuildSceneFromConfig();
}

function applyGalleryLightTargetMoveFromDrag(end: PlanPoint) {
  const moving = galleryMapEditorState.movingLightTarget;
  if (!moving) {
    return;
  }
  const light = ensureGalleryLightsArray().find((candidate) => candidate.id === moving.lightId);
  if (!light) {
    setSelectedGalleryMapLight(null);
    return;
  }
  const deltaX = end.x - moving.startPointer.x;
  const deltaZ = end.z - moving.startPointer.z;
  const moved = applyPlanPointAssist({ x: moving.startX + deltaX, z: moving.startZ + deltaZ }, "generic");
  const nextX = moved.x;
  const nextZ = moved.z;
  if (Math.abs(nextX - Number(light.targetX ?? 0)) < 0.0001 && Math.abs(nextZ - Number(light.targetZ ?? 0)) < 0.0001) {
    return;
  }
  light.targetPaintingId = "";
  light.targetX = nextX;
  light.targetZ = nextZ;
  light.targetY = Number.isFinite(Number(light.targetY)) ? Number(light.targetY) : 1.65;
  light.targetXCm = Math.round(nextX * 100);
  light.targetZCm = Math.round(nextZ * 100);
  light.targetYCm = Math.round(Number(light.targetY) * 100);
  rebuildSceneFromConfig();
  syncSelectedGalleryLightControls();
}

function getMovingRoomPreview(room: GalleryRoom): { x: number; z: number } | null {
  const moving = galleryMapEditorState.movingRoom;
  const pointer = galleryMapEditorState.dragCurrent;
  if (!moving || !pointer || galleryMapEditorState.dragAction !== "moveRoom" || moving.roomId !== room.id) {
    return null;
  }
  const deltaX = pointer.x - moving.startPointer.x;
  const deltaZ = pointer.z - moving.startPointer.z;
  return assistMovedRoomPosition(room, moving.startX + deltaX, moving.startZ + deltaZ);
}

function computeResizedRoomFromState(resizing: GalleryMapRoomResizeState, rawPointer: PlanPoint) {
  const minSize = GALLERY_GRID_SNAP_M;
  let anchor: PlanPoint = { x: resizing.startX, z: resizing.startZ };
  if (resizing.corner === "nw") {
    anchor = { x: resizing.startX + resizing.startWidth, z: resizing.startZ + resizing.startDepth };
  } else if (resizing.corner === "ne") {
    anchor = { x: resizing.startX, z: resizing.startZ + resizing.startDepth };
  } else if (resizing.corner === "sw") {
    anchor = { x: resizing.startX + resizing.startWidth, z: resizing.startZ };
  } else {
    anchor = { x: resizing.startX, z: resizing.startZ };
  }

  const assisted = applyPlanPointAssist(rawPointer, "room-create", { anchor, ignoreRoomId: resizing.roomId });
  if (resizing.corner === "nw") {
    const x = Math.min(assisted.x, anchor.x - minSize);
    const z = Math.min(assisted.z, anchor.z - minSize);
    return { x, z, width: anchor.x - x, depth: anchor.z - z };
  }
  if (resizing.corner === "ne") {
    const x2 = Math.max(assisted.x, anchor.x + minSize);
    const z = Math.min(assisted.z, anchor.z - minSize);
    return { x: anchor.x, z, width: x2 - anchor.x, depth: anchor.z - z };
  }
  if (resizing.corner === "sw") {
    const x = Math.min(assisted.x, anchor.x - minSize);
    const z2 = Math.max(assisted.z, anchor.z + minSize);
    return { x, z: anchor.z, width: anchor.x - x, depth: z2 - anchor.z };
  }
  const x2 = Math.max(assisted.x, anchor.x + minSize);
  const z2 = Math.max(assisted.z, anchor.z + minSize);
  return { x: anchor.x, z: anchor.z, width: x2 - anchor.x, depth: z2 - anchor.z };
}

function getResizingRoomPreview(room: GalleryRoom): { x: number; z: number; width: number; depth: number } | null {
  const resizing = galleryMapEditorState.resizingRoom;
  const pointer = galleryMapEditorState.dragCurrent;
  if (!resizing || !pointer || galleryMapEditorState.dragAction !== "resizeRoom" || resizing.roomId !== room.id) {
    return null;
  }
  return computeResizedRoomFromState(resizing, pointer);
}

function getRoomEditorGeometry(room: GalleryRoom): { x: number; z: number; width: number; depth: number } {
  const resized = getResizingRoomPreview(room);
  if (resized) {
    return resized;
  }
  const moved = getMovingRoomPreview(room);
  return {
    x: moved?.x ?? room.x,
    z: moved?.z ?? room.z,
    width: room.width,
    depth: room.depth,
  };
}

function computeResizedCustomWallFromState(resizing: GalleryMapWallResizeState, rawPointer: PlanPoint) {
  const anchor =
    resizing.handle === "start" ? { x: resizing.startX2, z: resizing.startZ2 } : { x: resizing.startX1, z: resizing.startZ1 };
  const moved = applyPlanPointAssist(rawPointer, "wall-create", { anchor });
  const next =
    resizing.handle === "start"
      ? { x1: moved.x, z1: moved.z, x2: resizing.startX2, z2: resizing.startZ2 }
      : { x1: resizing.startX1, z1: resizing.startZ1, x2: moved.x, z2: moved.z };
  return next;
}

function getCustomWallEditorGeometry(wall: { x1?: number; z1?: number; x2?: number; z2?: number }, wallIndex: number) {
  const x1 = Number(wall.x1 ?? 0);
  const z1 = Number(wall.z1 ?? 0);
  const x2 = Number(wall.x2 ?? 0);
  const z2 = Number(wall.z2 ?? 0);
  const resizing = galleryMapEditorState.resizingWall;
  const pointer = galleryMapEditorState.dragCurrent;
  const dragging =
    galleryMapEditorState.dragAction === "resizeWallStart" || galleryMapEditorState.dragAction === "resizeWallEnd";
  if (!dragging || !resizing || !pointer || resizing.wallIndex !== wallIndex) {
    return { x1, z1, x2, z2 };
  }
  return computeResizedCustomWallFromState(resizing, pointer);
}

function getGalleryMapEditorSize() {
  const width = Math.max(280, Math.floor(configGalleryMapEditor.clientWidth || 360));
  const height = Math.max(240, Math.floor(configGalleryMapEditor.clientHeight || 360));
  galleryMapEditorState.widthPx = width;
  galleryMapEditorState.heightPx = height;
  configGalleryMapEditor.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { width, height };
}

function getGalleryPlanBounds() {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const include = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };

  config.rooms.forEach((room) => {
    const preview = getRoomEditorGeometry(room);
    include(preview.x, preview.z);
    include(preview.x + preview.width, preview.z + preview.depth);
  });
  ensureCustomWallsArray().forEach((wall, wallIndex) => {
    const preview = getCustomWallEditorGeometry(wall, wallIndex);
    include(preview.x1, preview.z1);
    include(preview.x2, preview.z2);
  });
  ensureGalleryLightsArray().forEach((light) => {
    const source = getGalleryLightPlanPoint(light);
    include(source.x, source.z);
    const target = getGalleryLightTargetPlanPoint(light);
    if (target) {
      include(target.x, target.z);
    }
  });
  getPathTourKeyframes().forEach((point) => {
    include(point.x, point.z);
  });
  config.paintings
    .filter((painting) => painting.placed !== false)
    .forEach((painting) => {
      const point = getPaintingPlanPointById(painting.id);
      if (point) {
        include(point.x, point.z);
      }
    });
  include(visitor.position.x, visitor.position.z);
  include(visitor.position.x + Math.sin(movement.yaw) * 1.2, visitor.position.z + Math.cos(movement.yaw) * 1.2);
  if (isGalleryMapSubTabActive("camera")) {
    const cameraStart = resolveConfigCameraStartPlanPoint();
    const cameraTarget = resolveConfigCameraTargetPlanPoint(cameraStart);
    include(cameraStart.x, cameraStart.z);
    include(cameraTarget.x, cameraTarget.z);
  }
  if (galleryMapEditorState.dragStart) {
    include(galleryMapEditorState.dragStart.x, galleryMapEditorState.dragStart.z);
  }
  if (galleryMapEditorState.dragCurrent) {
    include(galleryMapEditorState.dragCurrent.x, galleryMapEditorState.dragCurrent.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    minX = -GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    maxX = GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    minZ = -GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    maxZ = GALLERY_EDITOR_MIN_SPAN_M * 0.5;
  }

  let spanX = maxX - minX;
  let spanZ = maxZ - minZ;
  if (spanX < GALLERY_EDITOR_MIN_SPAN_M) {
    const c = (minX + maxX) * 0.5;
    minX = c - GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    maxX = c + GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    spanX = maxX - minX;
  }
  if (spanZ < GALLERY_EDITOR_MIN_SPAN_M) {
    const c = (minZ + maxZ) * 0.5;
    minZ = c - GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    maxZ = c + GALLERY_EDITOR_MIN_SPAN_M * 0.5;
    spanZ = maxZ - minZ;
  }

  minX -= GALLERY_EDITOR_PADDING_M;
  maxX += GALLERY_EDITOR_PADDING_M;
  minZ -= GALLERY_EDITOR_PADDING_M;
  maxZ += GALLERY_EDITOR_PADDING_M;
  return { minX, maxX, minZ, maxZ };
}

function createPlanTransforms(width: number, height: number) {
  const contentBounds = getGalleryPlanBounds();
  const spanX = contentBounds.maxX - contentBounds.minX;
  const spanZ = contentBounds.maxZ - contentBounds.minZ;
  const padPx = 12;
  const baseScale = Math.max(0.08, Math.min((width - padPx * 2) / spanX, (height - padPx * 2) / spanZ));
  const zoom = clampNumber(galleryMapEditorState.viewZoom, GALLERY_MAP_ZOOM_MIN, GALLERY_MAP_ZOOM_MAX);
  const scale = Math.max(0.05, baseScale * zoom);
  const baseCenterX = (contentBounds.minX + contentBounds.maxX) * 0.5;
  const baseCenterZ = (contentBounds.minZ + contentBounds.maxZ) * 0.5;
  const centerX = baseCenterX + galleryMapEditorState.viewPanX;
  const centerZ = baseCenterZ + galleryMapEditorState.viewPanZ;

  const toScreen = (point: PlanPoint) => ({
    x: width * 0.5 + (point.x - centerX) * scale,
    y: height * 0.5 + (point.z - centerZ) * scale,
  });
  const toPlan = (sx: number, sy: number): PlanPoint => ({
    x: centerX + (sx - width * 0.5) / scale,
    z: centerZ + (sy - height * 0.5) / scale,
  });

  const cornerA = toPlan(0, 0);
  const cornerB = toPlan(width, height);
  const bounds = {
    minX: Math.min(cornerA.x, cornerB.x),
    maxX: Math.max(cornerA.x, cornerB.x),
    minZ: Math.min(cornerA.z, cornerB.z),
    maxZ: Math.max(cornerA.z, cornerB.z),
  };
  return { toScreen, toPlan, bounds, contentBounds, scale, baseScale, centerX, centerZ };
}

function collectPlanWalls(): PlanWallRef[] {
  const walls: PlanWallRef[] = [];
  config.rooms.forEach((room) => {
    walls.push({
      kind: "room",
      roomId: room.id,
      wall: "north",
      from: { x: room.x, z: room.z },
      to: { x: room.x + room.width, z: room.z },
      length: room.width,
    });
    walls.push({
      kind: "room",
      roomId: room.id,
      wall: "south",
      from: { x: room.x, z: room.z + room.depth },
      to: { x: room.x + room.width, z: room.z + room.depth },
      length: room.width,
    });
    walls.push({
      kind: "room",
      roomId: room.id,
      wall: "west",
      from: { x: room.x, z: room.z },
      to: { x: room.x, z: room.z + room.depth },
      length: room.depth,
    });
    walls.push({
      kind: "room",
      roomId: room.id,
      wall: "east",
      from: { x: room.x + room.width, z: room.z },
      to: { x: room.x + room.width, z: room.z + room.depth },
      length: room.depth,
    });
  });
  ensureCustomWallsArray().forEach((wall, wallIndex) => {
    const x1 = Number(wall.x1 ?? 0);
    const z1 = Number(wall.z1 ?? 0);
    const x2 = Number(wall.x2 ?? 0);
    const z2 = Number(wall.z2 ?? 0);
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length < 0.05) {
      return;
    }
    walls.push({
      kind: "customWall",
      wallId: String(wall.id ?? ""),
      wallIndex,
      from: { x: x1, z: z1 },
      to: { x: x2, z: z2 },
      length,
    });
  });
  return walls;
}

function projectPointToSegment(point: PlanPoint, from: PlanPoint, to: PlanPoint) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 0.000001) {
    return { t: 0, x: from.x, z: from.z, distance: Math.hypot(point.x - from.x, point.z - from.z), length: 0 };
  }
  const tRaw = ((point.x - from.x) * dx + (point.z - from.z) * dz) / lenSq;
  const t = clampNumber(tRaw, 0, 1);
  const px = from.x + dx * t;
  const pz = from.z + dz * t;
  return { t, x: px, z: pz, distance: Math.hypot(point.x - px, point.z - pz), length: Math.sqrt(lenSq) };
}

function findNearestPlanWall(point: PlanPoint, toleranceM = 0.35) {
  let best: { wall: PlanWallRef; along: number; distance: number } | null = null;
  collectPlanWalls().forEach((wall) => {
    const projected = projectPointToSegment(point, wall.from, wall.to);
    if (projected.distance > toleranceM) {
      return;
    }
    const along = projected.t * wall.length;
    if (!best || projected.distance < best.distance) {
      best = { wall, along, distance: projected.distance };
    }
  });
  return best;
}

function getOppositeWallSide(wall: WallSide): WallSide {
  if (wall === "north") {
    return "south";
  }
  if (wall === "south") {
    return "north";
  }
  if (wall === "west") {
    return "east";
  }
  return "west";
}

function getRoomWallLine(room: GalleryRoom, wall: WallSide) {
  if (wall === "north") {
    return {
      axis: "x" as const,
      coord: room.z,
      from: room.x,
      to: room.x + room.width,
      start: room.x,
    };
  }
  if (wall === "south") {
    return {
      axis: "x" as const,
      coord: room.z + room.depth,
      from: room.x,
      to: room.x + room.width,
      start: room.x,
    };
  }
  if (wall === "west") {
    return {
      axis: "z" as const,
      coord: room.x,
      from: room.z,
      to: room.z + room.depth,
      start: room.z,
    };
  }
  return {
    axis: "z" as const,
    coord: room.x + room.width,
    from: room.z,
    to: room.z + room.depth,
    start: room.z,
  };
}

function getOpeningCenterM(opening: GalleryRoomOpening) {
  const center = Number(opening.center);
  if (Number.isFinite(center)) {
    return center;
  }
  const centerCm = Number(opening.centerCm);
  if (Number.isFinite(centerCm)) {
    return centerCm / CM_PER_M;
  }
  return 0;
}

function getOpeningWidthM(opening: GalleryRoomOpening) {
  const width = Number(opening.width);
  if (Number.isFinite(width) && width > 0) {
    return width;
  }
  const widthCm = Number(opening.widthCm);
  if (Number.isFinite(widthCm) && widthCm > 0) {
    return widthCm / CM_PER_M;
  }
  return 0;
}

function getOpeningBaseM(opening: GalleryRoomOpening) {
  const base = Number(opening.base);
  if (Number.isFinite(base)) {
    return base;
  }
  const baseCm = Number(opening.baseCm);
  if (Number.isFinite(baseCm)) {
    return baseCm / CM_PER_M;
  }
  return 0;
}

function getOpeningHeightM(opening: GalleryRoomOpening) {
  const height = Number(opening.height);
  if (Number.isFinite(height) && height > 0) {
    return height;
  }
  const heightCm = Number(opening.heightCm);
  if (Number.isFinite(heightCm) && heightCm > 0) {
    return heightCm / CM_PER_M;
  }
  return 0;
}

function toWallSide(value: unknown): WallSide | null {
  if (value === "north" || value === "south" || value === "west" || value === "east") {
    return value;
  }
  return null;
}

function resolveOpeningType(opening: GalleryRoomOpening): "door" | "window" | "opening" {
  if (opening.type === "door" || opening.type === "window" || opening.type === "opening") {
    return opening.type;
  }
  return "opening";
}

function openingRefMatches(a: GalleryMapOpeningRef, b: GalleryMapOpeningRef) {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "room" && b.kind === "room") {
    return a.roomId === b.roomId && a.wall === b.wall && a.openingIndex === b.openingIndex;
  }
  if (a.kind === "customWall" && b.kind === "customWall") {
    return a.wallIndex === b.wallIndex && a.openingIndex === b.openingIndex;
  }
  return false;
}

function computeOpeningAlongMetrics(centerArg: number, widthArg: number, wallLengthArg: number, minWidthArg = GALLERY_OPENING_MIN_WIDTH_M) {
  const wallLength = Math.max(0.01, wallLengthArg);
  const minWidth = Math.min(Math.max(0.05, minWidthArg), wallLength);
  const rawWidth = Number(widthArg);
  const width = clampNumber(Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : minWidth, minWidth, wallLength);
  const rawCenter = Number(centerArg);
  const centerMin = width * 0.5;
  const centerMax = Math.max(centerMin, wallLength - width * 0.5);
  const center = clampNumber(Number.isFinite(rawCenter) ? rawCenter : centerMin, centerMin, centerMax);
  return {
    center,
    width,
    fromAlong: center - width * 0.5,
    toAlong: center + width * 0.5,
    wallLength,
    minWidth,
  };
}

function openingPointsFromAlong(wallFrom: PlanPoint, wallTo: PlanPoint, wallLengthArg: number, fromAlong: number, toAlong: number) {
  const wallLength = Math.max(0.0001, wallLengthArg);
  const ux = (wallTo.x - wallFrom.x) / wallLength;
  const uz = (wallTo.z - wallFrom.z) / wallLength;
  const clampedFrom = clampNumber(fromAlong, 0, wallLength);
  const clampedTo = clampNumber(toAlong, 0, wallLength);
  return {
    from: { x: wallFrom.x + ux * clampedFrom, z: wallFrom.z + uz * clampedFrom },
    to: { x: wallFrom.x + ux * clampedTo, z: wallFrom.z + uz * clampedTo },
  };
}

function buildRoomOpeningGeometry(
  room: GalleryRoom,
  opening: GalleryRoomOpening,
  openingIndex: number,
  wallHint?: WallSide
): GalleryMapOpeningGeometry {
  const preview = getRoomEditorGeometry(room);
  const wall = wallHint ?? toWallSide(opening.wall) ?? "north";
  let wallFrom: PlanPoint = { x: preview.x, z: preview.z };
  let wallTo: PlanPoint = { x: preview.x + preview.width, z: preview.z };
  if (wall === "south") {
    wallFrom = { x: preview.x, z: preview.z + preview.depth };
    wallTo = { x: preview.x + preview.width, z: preview.z + preview.depth };
  } else if (wall === "west") {
    wallFrom = { x: preview.x, z: preview.z };
    wallTo = { x: preview.x, z: preview.z + preview.depth };
  } else if (wall === "east") {
    wallFrom = { x: preview.x + preview.width, z: preview.z };
    wallTo = { x: preview.x + preview.width, z: preview.z + preview.depth };
  }
  const wallLength = Math.hypot(wallTo.x - wallFrom.x, wallTo.z - wallFrom.z);
  const metrics = computeOpeningAlongMetrics(getOpeningCenterM(opening), getOpeningWidthM(opening), wallLength);
  return {
    ref: { kind: "room", roomId: room.id, wall, openingIndex },
    type: resolveOpeningType(opening),
    center: metrics.center,
    width: metrics.width,
    base: getOpeningBaseM(opening),
    height: getOpeningHeightM(opening),
    wallFrom,
    wallTo,
    wallLength,
  };
}

function buildCustomWallOpeningGeometry(
  wall: { x1?: number; z1?: number; x2?: number; z2?: number; openings?: GalleryRoomOpening[] },
  wallIndex: number,
  opening: GalleryRoomOpening,
  openingIndex: number
): GalleryMapOpeningGeometry | null {
  const wallFrom: PlanPoint = { x: Number(wall.x1 ?? 0), z: Number(wall.z1 ?? 0) };
  const wallTo: PlanPoint = { x: Number(wall.x2 ?? 0), z: Number(wall.z2 ?? 0) };
  const wallLength = Math.hypot(wallTo.x - wallFrom.x, wallTo.z - wallFrom.z);
  if (wallLength < 0.05) {
    return null;
  }
  const metrics = computeOpeningAlongMetrics(getOpeningCenterM(opening), getOpeningWidthM(opening), wallLength);
  return {
    ref: { kind: "customWall", wallIndex, openingIndex },
    type: resolveOpeningType(opening),
    center: metrics.center,
    width: metrics.width,
    base: getOpeningBaseM(opening),
    height: getOpeningHeightM(opening),
    wallFrom,
    wallTo,
    wallLength,
  };
}

function resolveOpeningGeometryFromRef(ref: GalleryMapOpeningRef): GalleryMapOpeningGeometry | null {
  if (ref.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === ref.roomId);
    if (!room || !Array.isArray(room.openings) || ref.openingIndex < 0 || ref.openingIndex >= room.openings.length) {
      return null;
    }
    const opening = room.openings[ref.openingIndex];
    return buildRoomOpeningGeometry(room, opening, ref.openingIndex, ref.wall);
  }
  const walls = ensureCustomWallsArray();
  if (ref.wallIndex < 0 || ref.wallIndex >= walls.length) {
    return null;
  }
  const wall = walls[ref.wallIndex];
  if (!Array.isArray(wall.openings) || ref.openingIndex < 0 || ref.openingIndex >= wall.openings.length) {
    return null;
  }
  return buildCustomWallOpeningGeometry(wall, ref.wallIndex, wall.openings[ref.openingIndex], ref.openingIndex);
}

function computeResizedOpeningMetricsFromPointer(
  geometry: GalleryMapOpeningGeometry,
  resizing: GalleryMapOpeningResizeState,
  rawPointer: PlanPoint
) {
  const pointer = applyPlanPointAssist(rawPointer, "opening");
  const projected = projectPointToSegment(pointer, geometry.wallFrom, geometry.wallTo);
  const along = clampNumber(projected.t * geometry.wallLength, 0, geometry.wallLength);
  const base = computeOpeningAlongMetrics(resizing.startCenter, resizing.startWidth, geometry.wallLength);
  const deltaAlong = along - resizing.startAlong;
  let fromAlong = base.fromAlong;
  let toAlong = base.toAlong;
  if (resizing.handle === "start") {
    const maxStart = Math.max(0, base.toAlong - base.minWidth);
    fromAlong = clampNumber(base.fromAlong + deltaAlong, 0, maxStart);
  } else {
    const minEnd = Math.min(geometry.wallLength, base.fromAlong + base.minWidth);
    toAlong = clampNumber(base.toAlong + deltaAlong, minEnd, geometry.wallLength);
  }
  const center = (fromAlong + toAlong) * 0.5;
  const width = Math.max(base.minWidth, toAlong - fromAlong);
  return computeOpeningAlongMetrics(center, width, geometry.wallLength);
}

function resolveOpeningDisplayMetrics(geometry: GalleryMapOpeningGeometry) {
  const resizing = galleryMapEditorState.resizingOpening;
  const pointer = galleryMapEditorState.dragCurrent;
  const dragging =
    galleryMapEditorState.dragAction === "resizeOpeningStart" || galleryMapEditorState.dragAction === "resizeOpeningEnd";
  if (!dragging || !resizing || !pointer || !openingRefMatches(geometry.ref, resizing.ref)) {
    return computeOpeningAlongMetrics(geometry.center, geometry.width, geometry.wallLength);
  }
  return computeResizedOpeningMetricsFromPointer(geometry, resizing, pointer);
}

function applyOpeningResizeFromDrag(rawPointer: PlanPoint) {
  const resizing = galleryMapEditorState.resizingOpening;
  if (!resizing) {
    return;
  }
  const ref = resizing.ref;
  const geometry = resolveOpeningGeometryFromRef(resizing.ref);
  if (!geometry) {
    return;
  }
  const nextMetrics = computeResizedOpeningMetricsFromPointer(geometry, resizing, rawPointer);
  if (ref.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === ref.roomId);
    if (!room || !Array.isArray(room.openings) || ref.openingIndex < 0 || ref.openingIndex >= room.openings.length) {
      return;
    }
    const opening = room.openings[ref.openingIndex];
    const previousCenter = getOpeningCenterM(opening);
    const previousWidth = getOpeningWidthM(opening);
    const previousBase = getOpeningBaseM(opening);
    const previousHeight = getOpeningHeightM(opening);
    const previousType = resolveOpeningType(opening);
    if (Math.abs(previousCenter - nextMetrics.center) < 0.0001 && Math.abs(previousWidth - nextMetrics.width) < 0.0001) {
      return;
    }
    opening.wall = ref.wall;
    opening.center = nextMetrics.center;
    opening.centerCm = Math.round(nextMetrics.center * CM_PER_M);
    opening.width = nextMetrics.width;
    opening.widthCm = Math.round(nextMetrics.width * CM_PER_M);
    removeMirroredOpeningOnAdjacentRooms(room, ref.wall, {
      type: previousType,
      wall: ref.wall,
      center: previousCenter,
      width: previousWidth,
      base: previousBase,
      height: previousHeight,
    });
    mirrorOpeningOnAdjacentRooms(room, ref.wall, {
      type: resolveOpeningType(opening),
      center: nextMetrics.center,
      width: nextMetrics.width,
      base: getOpeningBaseM(opening),
      height: getOpeningHeightM(opening),
    });
  } else {
    const walls = ensureCustomWallsArray();
    if (ref.wallIndex < 0 || ref.wallIndex >= walls.length) {
      return;
    }
    const wall = walls[ref.wallIndex];
    if (!Array.isArray(wall.openings) || ref.openingIndex < 0 || ref.openingIndex >= wall.openings.length) {
      return;
    }
    const opening = wall.openings[ref.openingIndex];
    const previousCenter = getOpeningCenterM(opening);
    const previousWidth = getOpeningWidthM(opening);
    if (Math.abs(previousCenter - nextMetrics.center) < 0.0001 && Math.abs(previousWidth - nextMetrics.width) < 0.0001) {
      return;
    }
    opening.center = nextMetrics.center;
    opening.centerCm = Math.round(nextMetrics.center * CM_PER_M);
    opening.width = nextMetrics.width;
    opening.widthCm = Math.round(nextMetrics.width * CM_PER_M);
  }
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function distanceToInterval(value: number, from: number, to: number) {
  if (value < from) {
    return from - value;
  }
  if (value > to) {
    return value - to;
  }
  return 0;
}

function mirrorOpeningOnAdjacentRooms(
  room: GalleryRoom,
  wall: WallSide,
  opening: { type: "door" | "window" | "opening"; center: number; width: number; base: number; height: number }
) {
  const matchEps = 0.001;
  const roomLine = getRoomWallLine(room, wall);
  const oppositeWall = getOppositeWallSide(wall);
  const openingWorldFrom = roomLine.start + opening.center - opening.width * 0.5;
  const openingWorldTo = roomLine.start + opening.center + opening.width * 0.5;

  config.rooms.forEach((candidateRoom) => {
    if (candidateRoom.id === room.id) {
      return;
    }
    const candidateLine = getRoomWallLine(candidateRoom, oppositeWall);
    if (candidateLine.axis !== roomLine.axis || Math.abs(candidateLine.coord - roomLine.coord) > matchEps) {
      return;
    }

    const sharedFrom = Math.max(roomLine.from, candidateLine.from);
    const sharedTo = Math.min(roomLine.to, candidateLine.to);
    if (sharedTo - sharedFrom <= matchEps) {
      return;
    }

    const mirroredFrom = Math.max(sharedFrom, openingWorldFrom);
    const mirroredTo = Math.min(sharedTo, openingWorldTo);
    if (mirroredTo - mirroredFrom <= matchEps) {
      return;
    }

    const mirroredCenterWorld = (mirroredFrom + mirroredTo) * 0.5;
    const mirroredCenter = mirroredCenterWorld - candidateLine.start;
    const mirroredWidth = mirroredTo - mirroredFrom;
    const mirroredBase = opening.base;
    const mirroredHeight = opening.height;
    candidateRoom.openings = Array.isArray(candidateRoom.openings) ? candidateRoom.openings : [];
    const alreadyExists = candidateRoom.openings.some((candidate) => {
      return (
        candidate.wall === oppositeWall &&
        Math.abs((candidate.center ?? 0) - mirroredCenter) < 0.02 &&
        Math.abs((candidate.width ?? 0) - mirroredWidth) < 0.02 &&
        Math.abs((candidate.base ?? 0) - mirroredBase) < 0.02 &&
        Math.abs((candidate.height ?? 0) - mirroredHeight) < 0.02
      );
    });
    if (alreadyExists) {
      return;
    }
    candidateRoom.openings.push({
      id: `op_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type: opening.type,
      wall: oppositeWall,
      center: mirroredCenter,
      centerCm: Math.round(mirroredCenter * 100),
      width: mirroredWidth,
      widthCm: Math.round(mirroredWidth * 100),
      base: mirroredBase,
      baseCm: Math.round(mirroredBase * 100),
      height: mirroredHeight,
      heightCm: Math.round(mirroredHeight * 100),
    });
  });
}

function removeMirroredOpeningOnAdjacentRooms(room: GalleryRoom, wall: WallSide, opening: GalleryRoomOpening) {
  const matchEps = 0.001;
  const center = getOpeningCenterM(opening);
  const width = getOpeningWidthM(opening);
  if (width <= matchEps) {
    return;
  }
  const base = getOpeningBaseM(opening);
  const height = getOpeningHeightM(opening);
  const roomLine = getRoomWallLine(room, wall);
  const oppositeWall = getOppositeWallSide(wall);
  const openingWorldFrom = roomLine.start + center - width * 0.5;
  const openingWorldTo = roomLine.start + center + width * 0.5;

  config.rooms.forEach((candidateRoom) => {
    if (candidateRoom.id === room.id || !Array.isArray(candidateRoom.openings) || candidateRoom.openings.length === 0) {
      return;
    }
    const candidateLine = getRoomWallLine(candidateRoom, oppositeWall);
    if (candidateLine.axis !== roomLine.axis || Math.abs(candidateLine.coord - roomLine.coord) > matchEps) {
      return;
    }

    const sharedFrom = Math.max(roomLine.from, candidateLine.from);
    const sharedTo = Math.min(roomLine.to, candidateLine.to);
    if (sharedTo - sharedFrom <= matchEps) {
      return;
    }

    candidateRoom.openings = candidateRoom.openings.filter((candidateOpening) => {
      if (candidateOpening.wall !== oppositeWall) {
        return true;
      }
      if (opening.type && candidateOpening.type && opening.type !== candidateOpening.type) {
        return true;
      }
      const candidateCenter = getOpeningCenterM(candidateOpening);
      const candidateWidth = getOpeningWidthM(candidateOpening);
      if (candidateWidth <= matchEps) {
        return true;
      }
      const candidateWorldFrom = candidateLine.start + candidateCenter - candidateWidth * 0.5;
      const candidateWorldTo = candidateLine.start + candidateCenter + candidateWidth * 0.5;
      const overlapFrom = Math.max(sharedFrom, openingWorldFrom, candidateWorldFrom);
      const overlapTo = Math.min(sharedTo, openingWorldTo, candidateWorldTo);
      if (overlapTo - overlapFrom <= 0.01) {
        return true;
      }
      const candidateBase = getOpeningBaseM(candidateOpening);
      const candidateHeight = getOpeningHeightM(candidateOpening);
      const baseDelta = Math.abs(candidateBase - base);
      const heightDelta = Math.abs(candidateHeight - height);
      if (baseDelta > 0.05 || heightDelta > 0.05) {
        return true;
      }
      return false;
    });
  });
}

function findNearestOpeningOnWall(target: { wall: PlanWallRef; along: number }) {
  const alongToleranceM = 0.45;

  if (target.wall.kind === "room") {
    const wallRef = target.wall;
    const room = config.rooms.find((candidate) => candidate.id === wallRef.roomId);
    if (!room) {
      return null;
    }
    const openings = Array.isArray(room.openings) ? room.openings : [];
    let best: { openingIndex: number; distance: number } | null = null;
    openings.forEach((opening, openingIndex) => {
      if (opening.wall !== wallRef.wall) {
        return;
      }
      const center = getOpeningCenterM(opening);
      const width = Math.max(0, getOpeningWidthM(opening));
      const from = center - width * 0.5;
      const to = center + width * 0.5;
      const distance = distanceToInterval(target.along, from, to);
      if (!best || distance < best.distance) {
        best = { openingIndex, distance };
      }
    });
    if (!best || best.distance > alongToleranceM) {
      return null;
    }
    return { kind: "room" as const, room, wall: wallRef.wall, openingIndex: best.openingIndex };
  }

  const wallRef = target.wall;
  if (wallRef.kind !== "customWall") {
    return null;
  }
  const wall = ensureCustomWallsArray()[wallRef.wallIndex];
  if (!wall) {
    return null;
  }
  const openings = Array.isArray(wall.openings) ? wall.openings : [];
  let best: { openingIndex: number; distance: number } | null = null;
  openings.forEach((opening, openingIndex) => {
    const center = getOpeningCenterM(opening);
    const width = Math.max(0, getOpeningWidthM(opening));
    const from = center - width * 0.5;
    const to = center + width * 0.5;
    const distance = distanceToInterval(target.along, from, to);
    if (!best || distance < best.distance) {
      best = { openingIndex, distance };
    }
  });
  if (!best || best.distance > alongToleranceM) {
    return null;
  }
  return { kind: "customWall" as const, wallIndex: wallRef.wallIndex, openingIndex: best.openingIndex };
}

function findOpeningRefAtPoint(point: PlanPoint) {
  const nearest = findNearestPlanWall(point, 0.45);
  if (!nearest) {
    return null;
  }
  const target = findNearestOpeningOnWall(nearest);
  if (!target) {
    return null;
  }
  if (target.kind === "room") {
    return {
      kind: "room" as const,
      roomId: target.room.id,
      wall: target.wall,
      openingIndex: target.openingIndex,
    };
  }
  return {
    kind: "customWall" as const,
    wallIndex: target.wallIndex,
    openingIndex: target.openingIndex,
  };
}

function renderGalleryMapEditor() {
  const { width, height } = getGalleryMapEditorSize();
  const { toScreen, scale, bounds } = createPlanTransforms(width, height);
  const draggingCameraHandle =
    galleryMapEditorState.dragAction === "moveCameraStart" || galleryMapEditorState.dragAction === "moveCameraTarget";
  const draggingOpeningHandle =
    galleryMapEditorState.dragAction === "resizeOpeningStart" || galleryMapEditorState.dragAction === "resizeOpeningEnd";
  const draggingWallHandle =
    galleryMapEditorState.dragAction === "resizeWallStart" || galleryMapEditorState.dragAction === "resizeWallEnd";
  const draggingPaintingMarker = galleryMapEditorState.dragAction === "movePaintingOnMap";
  const draggingLightHandle =
    galleryMapEditorState.dragAction === "moveLight" || galleryMapEditorState.dragAction === "moveLightTarget";
  const draggingPathPoint = galleryMapEditorState.dragAction === "movePathPoint";
  configGalleryMapEditor.style.cursor =
    galleryMapEditorState.panning ||
    draggingCameraHandle ||
    draggingOpeningHandle ||
    draggingWallHandle ||
    draggingPaintingMarker ||
    draggingLightHandle ||
    draggingPathPoint
      ? "grabbing"
      : "crosshair";
  const walls = ensureCustomWallsArray();
  if (
    galleryMapEditorState.selectedCustomWallIndex != null &&
    (galleryMapEditorState.selectedCustomWallIndex < 0 || galleryMapEditorState.selectedCustomWallIndex >= walls.length)
  ) {
    galleryMapEditorState.selectedCustomWallIndex = null;
  }
  if (galleryMapEditorState.selectedOpening && !resolveOpeningGeometryFromRef(galleryMapEditorState.selectedOpening)) {
    setSelectedGalleryMapOpening(null);
  }

  const gridLines: string[] = [];
  const step = GALLERY_GRID_SNAP_M;
  const isMajorGridLine = (value: number) => {
    const ratio = value / GALLERY_GRID_MAJOR_STEP_M;
    return Math.abs(ratio - Math.round(ratio)) < 0.0001;
  };
  const xStart = Math.floor(bounds.minX / step) * step;
  const xEnd = Math.ceil(bounds.maxX / step) * step;
  const zStart = Math.floor(bounds.minZ / step) * step;
  const zEnd = Math.ceil(bounds.maxZ / step) * step;
  for (let x = xStart; x <= xEnd + 0.0001; x += step) {
    const a = toScreen({ x, z: bounds.minZ });
    const b = toScreen({ x, z: bounds.maxZ });
    const major = isMajorGridLine(x);
    gridLines.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${
        major ? "#9ca3af" : "#d3d3d3"
      }" stroke-width="${major ? 1.2 : 1}" />`
    );
  }
  for (let z = zStart; z <= zEnd + 0.0001; z += step) {
    const a = toScreen({ x: bounds.minX, z });
    const b = toScreen({ x: bounds.maxX, z });
    const major = isMajorGridLine(z);
    gridLines.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${
        major ? "#9ca3af" : "#d3d3d3"
      }" stroke-width="${major ? 1.2 : 1}" />`
    );
  }

  const roomsSvg = config.rooms
    .map((room) => {
      const preview = getRoomEditorGeometry(room);
      const roomX = preview.x;
      const roomZ = preview.z;
      const roomWidth = preview.width;
      const roomDepth = preview.depth;
      const selected = room.id === galleryMapEditorState.selectedRoomId;
      const a = toScreen({ x: roomX, z: roomZ });
      const b = toScreen({ x: roomX + roomWidth, z: roomZ + roomDepth });
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const widthPx = Math.abs(b.x - a.x);
      const heightPx = Math.abs(b.y - a.y);
      const label = room.name ?? room.id;
      const handles = selected
        ? ([
            { corner: "nw" as const, point: { x: roomX, z: roomZ } },
            { corner: "ne" as const, point: { x: roomX + roomWidth, z: roomZ } },
            { corner: "sw" as const, point: { x: roomX, z: roomZ + roomDepth } },
            { corner: "se" as const, point: { x: roomX + roomWidth, z: roomZ + roomDepth } },
          ] as Array<{ corner: RoomCorner; point: PlanPoint }>)
            .map(({ corner, point }) => {
              const p = toScreen(point);
              return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(
                1
              )}" r="5.2" class="gallery-map-room-handle corner-${corner}" data-room-handle-room-id="${
                room.id
              }" data-room-handle-corner="${corner}" fill="#f8fafc" stroke="#c2410c" stroke-width="2" />`;
            })
            .join("")
        : "";
      return `
        <rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${widthPx.toFixed(1)}" height="${heightPx.toFixed(1)}" data-room-id="${
          room.id
        }" fill="${
          selected ? "rgba(251,146,60,0.18)" : "rgba(14,116,144,0.15)"
        }" stroke="${selected ? "#ea580c" : "rgba(15,23,42,0.88)"}" stroke-width="${selected ? 3 : 2}" />
        <text x="${(left + 6).toFixed(1)}" y="${(top + 14).toFixed(1)}" font-size="11" fill="#0f172a">${label}</text>
        ${handles}
      `;
    })
    .join("");

  const customWalls = ensureCustomWallsArray()
    .map((wall, wallIndex) => {
      const preview = getCustomWallEditorGeometry(wall, wallIndex);
      const a = toScreen({ x: preview.x1, z: preview.z1 });
      const b = toScreen({ x: preview.x2, z: preview.z2 });
      const selected = wallIndex === galleryMapEditorState.selectedCustomWallIndex;
      const resizing =
        (galleryMapEditorState.dragAction === "resizeWallStart" || galleryMapEditorState.dragAction === "resizeWallEnd") &&
        galleryMapEditorState.resizingWall?.wallIndex === wallIndex;
      const strokeWidth = Math.max(2, Number((Number(wall.thickness ?? 0.16) * scale).toFixed(2)));
      const lineSvg = `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
        1
      )}" stroke="${selected || resizing ? "#9a3412" : "#7c2d12"}" stroke-width="${selected || resizing ? strokeWidth + 1.6 : strokeWidth}" stroke-linecap="round" data-custom-wall-index="${wallIndex}" class="gallery-map-custom-wall-line" />`;
      if (galleryMapEditorState.tool !== "wall" || (!selected && !resizing)) {
        return lineSvg;
      }
      const startActive = resizing && galleryMapEditorState.resizingWall?.handle === "start";
      const endActive = resizing && galleryMapEditorState.resizingWall?.handle === "end";
      const handlesSvg = `
        <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${startActive ? 7 : 5.8}" class="gallery-map-wall-handle start" data-custom-wall-index="${wallIndex}" data-custom-wall-handle-side="start" />
        <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${endActive ? 7 : 5.8}" class="gallery-map-wall-handle end" data-custom-wall-index="${wallIndex}" data-custom-wall-handle-side="end" />
      `;
      return `${lineSvg}${handlesSvg}`;
    })
    .join("");

  const openingColor = (type: "door" | "window" | "opening") => (type === "window" ? "#0284c7" : type === "door" ? "#16a34a" : "#b45309");
  const openingToolActive = galleryMapEditorState.tool === "opening";
  const openingGeometries: GalleryMapOpeningGeometry[] = [];
  config.rooms.forEach((room) => {
    (room.openings ?? []).forEach((opening, openingIndex) => {
      openingGeometries.push(buildRoomOpeningGeometry(room, opening, openingIndex));
    });
  });
  ensureCustomWallsArray().forEach((wall, wallIndex) => {
    (wall.openings ?? []).forEach((opening, openingIndex) => {
      const geometry = buildCustomWallOpeningGeometry(wall, wallIndex, opening, openingIndex);
      if (geometry) {
        openingGeometries.push(geometry);
      }
    });
  });
  const openingsSvg = openingGeometries
    .map((geometry) => {
      const metrics = resolveOpeningDisplayMetrics(geometry);
      const points = openingPointsFromAlong(geometry.wallFrom, geometry.wallTo, geometry.wallLength, metrics.fromAlong, metrics.toAlong);
      const a = toScreen(points.from);
      const b = toScreen(points.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.8) {
        return "";
      }
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const isDoor = geometry.type === "door";
      const isOpening = geometry.type === "opening";
      const strokeMain = isDoor ? 5.8 : isOpening ? 5 : 4.8;
      const strokeHalo = strokeMain + 4.2;
      const capHalf = strokeMain + 2.4;
      const capWidth = Math.max(2.2, strokeMain * 0.72);
      const color = openingColor(geometry.type);
      const startCapA = { x: a.x + nx * capHalf, y: a.y + ny * capHalf };
      const startCapB = { x: a.x - nx * capHalf, y: a.y - ny * capHalf };
      const endCapA = { x: b.x + nx * capHalf, y: b.y + ny * capHalf };
      const endCapB = { x: b.x - nx * capHalf, y: b.y - ny * capHalf };
      const resizing = galleryMapEditorState.resizingOpening;
      const selected = Boolean(galleryMapEditorState.selectedOpening && openingRefMatches(geometry.ref, galleryMapEditorState.selectedOpening));
      const isResizingThis =
        (galleryMapEditorState.dragAction === "resizeOpeningStart" || galleryMapEditorState.dragAction === "resizeOpeningEnd") &&
        resizing &&
        openingRefMatches(geometry.ref, resizing.ref);
      const emphasized = selected || isResizingThis;
      const startHandleActive = isResizingThis && resizing?.handle === "start";
      const endHandleActive = isResizingThis && resizing?.handle === "end";
      const handleBaseAttrs =
        geometry.ref.kind === "room"
          ? `data-opening-kind="room" data-opening-room-id="${geometry.ref.roomId}" data-opening-wall="${geometry.ref.wall}" data-opening-index="${geometry.ref.openingIndex}"`
          : `data-opening-kind="custom" data-opening-wall-index="${geometry.ref.wallIndex}" data-opening-index="${geometry.ref.openingIndex}"`;
      const handlesSvg = openingToolActive
        ? `
          <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${startHandleActive ? 7 : 5.8}" class="gallery-map-opening-handle start" ${handleBaseAttrs} data-opening-handle-side="start" />
          <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${endHandleActive ? 7 : 5.8}" class="gallery-map-opening-handle end" ${handleBaseAttrs} data-opening-handle-side="end" />
        `
        : "";
      const widthLabel = (() => {
        if (!isResizingThis) {
          return "";
        }
        const widthText = `${Math.round(metrics.width * CM_PER_M)} cm`;
        const labelW = Math.max(42, widthText.length * 6.7 + 10);
        const labelH = 18;
        const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
        const labelX = mid.x + nx * (capHalf + 9);
        const labelY = mid.y + ny * (capHalf + 9);
        return `
          <g class="gallery-map-opening-width">
            <rect x="${(labelX - labelW * 0.5).toFixed(1)}" y="${(labelY - labelH * 0.5).toFixed(1)}" width="${labelW.toFixed(
              1
            )}" height="${labelH.toFixed(1)}" rx="5.5" fill="rgba(15,23,42,0.9)" />
            <text x="${labelX.toFixed(1)}" y="${(labelY + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#f8fafc">${widthText}</text>
          </g>
        `;
      })();
      return `
        <g class="gallery-map-opening opening-${geometry.type}" ${handleBaseAttrs} data-opening-select="1">
          <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
            1
          )}" stroke="${emphasized ? "rgba(15,23,42,0.36)" : "rgba(15,23,42,0.26)"}" stroke-width="${
            emphasized ? (strokeHalo + 1.1).toFixed(2) : strokeHalo.toFixed(2)
          }" stroke-linecap="round" />
          <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
            1
          )}" stroke="${color}" stroke-width="${emphasized ? (strokeMain + 1.1).toFixed(2) : strokeMain.toFixed(2)}" stroke-linecap="round" />
          <line x1="${startCapA.x.toFixed(1)}" y1="${startCapA.y.toFixed(1)}" x2="${startCapB.x.toFixed(1)}" y2="${startCapB.y.toFixed(
            1
          )}" stroke="${color}" stroke-width="${capWidth.toFixed(2)}" stroke-linecap="round" />
          <line x1="${endCapA.x.toFixed(1)}" y1="${endCapA.y.toFixed(1)}" x2="${endCapB.x.toFixed(1)}" y2="${endCapB.y.toFixed(
            1
          )}" stroke="${color}" stroke-width="${capWidth.toFixed(2)}" stroke-linecap="round" />
          ${handlesSvg}
          ${widthLabel}
        </g>
      `;
    })
    .join("");

  const paintingMarkersSvg = config.paintings
    .filter((painting) => painting.placed !== false)
    .map((painting) => {
      const previewPoint =
        galleryMapEditorState.dragAction === "movePaintingOnMap" && galleryMapEditorState.movingPainting?.paintingId === painting.id
          ? galleryMapEditorState.dragCurrent
          : null;
      const point = previewPoint ?? getPaintingPlanPointById(painting.id);
      if (!point) {
        return "";
      }
      const marker = toScreen(point);
      const { widthCm, heightCm } = getPaintingDimensionsCm(painting);
      const isSelected = painting.id === uiState.selectedPaintingId;
      const label = `${widthCm}x${heightCm} cm`;
      return `
        <g data-map-painting-id="${painting.id}" class="gallery-map-painting-marker">
          <circle cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="${isSelected ? 5.8 : 4.6}" fill="${
            isSelected ? "#0ea5e9" : "#38bdf8"
          }" stroke="${isSelected ? "#0c4a6e" : "#075985"}" stroke-width="${isSelected ? 1.8 : 1.2}" />
          <text x="${(marker.x + 8).toFixed(1)}" y="${(marker.y - 6).toFixed(1)}" font-size="10.6" fill="#0f172a">${label}</text>
        </g>
      `;
    })
    .join("");

  const galleryLightLinks = ensureGalleryLightsArray()
    .map((light) => {
      const source = getGalleryLightPlanPoint(light);
      const target = getGalleryLightTargetPlanPoint(light);
      if (!target) {
        return "";
      }
      const a = toScreen(source);
      const b = toScreen(target);
      const selected = light.id === galleryMapEditorState.selectedLightId;
      const movingSource = galleryMapEditorState.dragAction === "moveLight" && galleryMapEditorState.movingLight?.lightId === light.id;
      const movingTarget = galleryMapEditorState.dragAction === "moveLightTarget" && galleryMapEditorState.movingLightTarget?.lightId === light.id;
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
        1
      )}" stroke="rgba(245,158,11,0.75)" stroke-width="1.8" stroke-dasharray="5 4" />
      <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" class="gallery-map-light-handle target" data-gallery-light-id="${light.id ?? ""}" data-gallery-light-handle="target" r="${
        movingTarget ? 6.8 : selected ? 6 : 5
      }" fill="${movingTarget ? "#f97316" : "#fdba74"}" stroke="${selected ? "#7c2d12" : "#9a3412"}" stroke-width="${
        movingTarget ? 2.3 : 1.8
      }" />`;
    })
    .join("");

  const galleryLightsSvg = ensureGalleryLightsArray()
    .map((light) => {
      const source = getGalleryLightPlanPoint(light);
      const selected = light.id === galleryMapEditorState.selectedLightId;
      const movingSource = galleryMapEditorState.dragAction === "moveLight" && galleryMapEditorState.movingLight?.lightId === light.id;
      const s = toScreen(source);
      return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" class="gallery-map-light-handle source" data-gallery-light-id="${light.id ?? ""}" data-gallery-light-handle="source" r="${
        movingSource ? 7.2 : selected ? 6.5 : 5
      }" fill="${
        selected ? "#f59e0b" : "#facc15"
      }" stroke="${selected ? "#7c2d12" : "#92400e"}" stroke-width="${movingSource ? 2.4 : selected ? 2 : 1.4}" />`;
    })
    .join("");

  const pathPoints = getPathTourKeyframes();
  const pathPolylineSvg = pathPoints.length >= 2
    ? `<polyline points="${pathPoints
        .map((point) => {
          const p = toScreen(point);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(" ")}" fill="none" stroke="rgba(79,70,229,0.92)" stroke-width="2.2" stroke-dasharray="7 5" />`
    : "";
  const pathPointsSvg = pathPoints
    .map((point, index) => {
      const preview =
        galleryMapEditorState.dragAction === "movePathPoint" && galleryMapEditorState.movingPathPoint?.pointIndex === index
          ? galleryMapEditorState.dragCurrent
          : null;
      const drawPoint = preview ?? point;
      const p = toScreen(drawPoint);
      const selected = galleryMapEditorState.selectedPathPointIndex === index;
      const moving = galleryMapEditorState.dragAction === "movePathPoint" && galleryMapEditorState.movingPathPoint?.pointIndex === index;
      return `
        <g data-path-point-index="${index}">
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${moving ? 7.4 : selected ? 6.6 : 5.2}" fill="${
            selected ? "#4f46e5" : "#a5b4fc"
          }" stroke="${selected ? "#312e81" : "#3730a3"}" stroke-width="${moving ? 2.5 : 1.9}" />
          <text x="${(p.x + 7).toFixed(1)}" y="${(p.y - 6).toFixed(1)}" font-size="10.6" fill="#312e81">P${index + 1}</text>
        </g>
      `;
    })
    .join("");

  const observerPoint = toScreen({ x: visitor.position.x, z: visitor.position.z });
  const observerDirPoint = toScreen({
    x: visitor.position.x + Math.sin(movement.yaw) * 1.25,
    z: visitor.position.z + Math.cos(movement.yaw) * 1.25,
  });
  const observerSvg = `
    <line x1="${observerPoint.x.toFixed(1)}" y1="${observerPoint.y.toFixed(1)}" x2="${observerDirPoint.x.toFixed(
      1
    )}" y2="${observerDirPoint.y.toFixed(1)}" stroke="#7f1d1d" stroke-width="2.4" stroke-linecap="round" />
    <circle cx="${observerPoint.x.toFixed(1)}" cy="${observerPoint.y.toFixed(1)}" r="5.6" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5" />
  `;
  const cameraDragSvg = (() => {
    const start = resolveConfigCameraStartPlanPoint();
    const target = resolveConfigCameraTargetPlanPoint(start);
    const a = toScreen(start);
    const b = toScreen(target);
    const movingStart = galleryMapEditorState.dragAction === "moveCameraStart";
    const movingTarget = galleryMapEditorState.dragAction === "moveCameraTarget";
    return `
      <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
        1
      )}" class="gallery-map-camera-link" stroke="rgba(14,116,144,0.9)" stroke-width="2.2" stroke-dasharray="6 4" />
      <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${movingStart ? 8.4 : 7.2}" class="gallery-map-camera-handle start" data-camera-handle="start" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="2" />
      <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${movingTarget ? 8.4 : 7.2}" class="gallery-map-camera-handle target" data-camera-handle="target" fill="#10b981" stroke="#065f46" stroke-width="2" />
    `;
  })();

  let preview = "";
  if (galleryMapEditorState.dragStart && galleryMapEditorState.dragCurrent) {
    const a = galleryMapEditorState.dragStart;
    const b = galleryMapEditorState.dragCurrent;
    if (galleryMapEditorState.dragAction === "createRoom") {
      const s1 = toScreen(a);
      const s2 = toScreen(b);
      const left = Math.min(s1.x, s2.x);
      const top = Math.min(s1.y, s2.y);
      preview = `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.abs(s2.x - s1.x).toFixed(1)}" height="${Math.abs(
        s2.y - s1.y
      ).toFixed(1)}" fill="rgba(15,118,110,0.2)" stroke="#0f766e" stroke-dasharray="5 4" stroke-width="2" />`;
    } else if (galleryMapEditorState.dragAction === "createWall") {
      const s1 = toScreen(a);
      const s2 = toScreen(b);
      preview = `<line x1="${s1.x.toFixed(1)}" y1="${s1.y.toFixed(1)}" x2="${s2.x.toFixed(1)}" y2="${s2.y.toFixed(
        1
      )}" stroke="#7c2d12" stroke-dasharray="5 4" stroke-width="3" stroke-linecap="round" />`;
    }
  }

  configGalleryMapEditor.innerHTML = `
    ${gridLines.join("")}
    ${roomsSvg}
    ${customWalls}
    ${openingsSvg}
    ${paintingMarkersSvg}
    ${galleryLightLinks}
    ${galleryLightsSvg}
    ${pathPolylineSvg}
    ${pathPointsSvg}
    ${observerSvg}
    ${cameraDragSvg}
    ${preview}
  `;
  lastGalleryMapObserverSignature = getGalleryMapObserverSignature();
}

function getPlanPointFromEditorEvent(event: PointerEvent): PlanPoint {
  const { width, height } = getGalleryMapEditorSize();
  const { toPlan } = createPlanTransforms(width, height);
  const rect = configGalleryMapEditor.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const plan = toPlan(x, y);
  return { x: plan.x, z: plan.z };
}

function applyRoomFromDrag(start: PlanPoint, end: PlanPoint) {
  const x1 = Math.min(start.x, end.x);
  const z1 = Math.min(start.z, end.z);
  const width = Math.abs(end.x - start.x);
  const depth = Math.abs(end.z - start.z);
  if (width < GALLERY_GRID_SNAP_M || depth < GALLERY_GRID_SNAP_M) {
    return;
  }
  const heightCm = Math.max(220, Number(configMapWallHeightCm.value) || 300);
  const roomId = nextRoomId();
  config.rooms.push({
    id: roomId,
    name: `Stanza ${config.rooms.length + 1}`,
    x: x1,
    z: z1,
    width,
    depth,
    height: heightCm / 100,
    widthCm: Math.round(width * 100),
    depthCm: Math.round(depth * 100),
    heightCm,
    openings: [],
  });
  setSelectedGalleryMapRoom(roomId);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function applyRoomMoveFromDrag(end: PlanPoint) {
  const moving = galleryMapEditorState.movingRoom;
  if (!moving) {
    return;
  }
  const room = config.rooms.find((candidate) => candidate.id === moving.roomId);
  if (!room) {
    setSelectedGalleryMapRoom(null);
    return;
  }
  const deltaX = end.x - moving.startPointer.x;
  const deltaZ = end.z - moving.startPointer.z;
  const moved = assistMovedRoomPosition(room, moving.startX + deltaX, moving.startZ + deltaZ);
  const nextX = moved.x;
  const nextZ = moved.z;
  if (Math.abs(nextX - room.x) < 0.0001 && Math.abs(nextZ - room.z) < 0.0001) {
    return;
  }
  room.x = nextX;
  room.z = nextZ;
  rebuildSceneFromConfig();
}

function applyRoomResizeFromDrag(end: PlanPoint) {
  const resizing = galleryMapEditorState.resizingRoom;
  if (!resizing) {
    return;
  }
  const room = config.rooms.find((candidate) => candidate.id === resizing.roomId);
  if (!room) {
    setSelectedGalleryMapRoom(null);
    return;
  }
  const next = computeResizedRoomFromState(resizing, end);
  if (
    Math.abs(next.x - room.x) < 0.0001 &&
    Math.abs(next.z - room.z) < 0.0001 &&
    Math.abs(next.width - room.width) < 0.0001 &&
    Math.abs(next.depth - room.depth) < 0.0001
  ) {
    return;
  }
  room.x = next.x;
  room.z = next.z;
  room.width = next.width;
  room.depth = next.depth;
  room.widthCm = Math.round(next.width * 100);
  room.depthCm = Math.round(next.depth * 100);
  config.paintings.forEach((painting) => {
    if (painting.roomId !== room.id) {
      return;
    }
    const wall = (painting.wall ?? "north") as WallSide;
    const span = getWallSpan(room, wall);
    painting.offset = clampNumber(Number(painting.offset ?? 0), 0, span);
  });
  rebuildSceneFromConfig();
}

function placePaintingAtPlanPoint(paintingId: string, point: PlanPoint) {
  const painting = config.paintings.find((candidate) => candidate.id === paintingId);
  if (!painting) {
    return false;
  }
  const nearest = findNearestPlanWall(point, 0.5);
  if (!nearest) {
    return false;
  }
  if (nearest.wall.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === nearest.wall.roomId);
    if (!room) {
      return false;
    }
    const wall = nearest.wall.wall;
    const span = getWallSpan(room, wall);
    const dimensions = getPaintingDimensionsCm(painting);
    const margin = Math.max(0.45, dimensions.widthCm / CM_PER_M * 0.5 + 0.12);
    const offset = snapToStep(clampNumber(nearest.along, margin, Math.max(margin, span - margin)), PAINTING_SNAP_M);
    painting.roomId = room.id;
    painting.wall = wall;
    painting.offset = offset;
    painting.customWallId = undefined;
    painting.customWallOffset = undefined;
    painting.customWallOffsetCm = undefined;
    painting.customWallSide = undefined;
    painting.placed = true;
    return true;
  }
  const customWall = ensureCustomWallsArray()[nearest.wall.wallIndex];
  if (!customWall) {
    return false;
  }
  const dx = Number(customWall.x2 ?? 0) - Number(customWall.x1 ?? 0);
  const dz = Number(customWall.z2 ?? 0) - Number(customWall.z1 ?? 0);
  const length = Math.hypot(dx, dz);
  if (length < 0.05) {
    return false;
  }
  const projected = projectPointToSegment(
    point,
    { x: Number(customWall.x1 ?? 0), z: Number(customWall.z1 ?? 0) },
    { x: Number(customWall.x2 ?? 0), z: Number(customWall.z2 ?? 0) }
  );
  const ux = dx / length;
  const uz = dz / length;
  const px = Number(customWall.x1 ?? 0) + ux * (projected.t * length);
  const pz = Number(customWall.z1 ?? 0) + uz * (projected.t * length);
  const perpX = -uz;
  const perpZ = ux;
  const side = (point.x - px) * perpX + (point.z - pz) * perpZ >= 0 ? 1 : -1;
  const dimensions = getPaintingDimensionsCm(painting);
  const margin = Math.max(0.45, dimensions.widthCm / CM_PER_M * 0.5 + 0.12);
  const offset = snapToStep(clampNumber(nearest.along, margin, Math.max(margin, length - margin)), PAINTING_SNAP_M);
  painting.roomId = "";
  painting.wall = "north";
  painting.offset = offset;
  painting.customWallId = customWall.id ?? "";
  painting.customWallOffset = offset;
  painting.customWallOffsetCm = Math.round(offset * CM_PER_M);
  painting.customWallSide = side;
  painting.placed = true;
  return true;
}

function applyPaintingMoveFromMapDrag(end: PlanPoint) {
  const moving = galleryMapEditorState.movingPainting;
  if (!moving) {
    return;
  }
  if (!placePaintingAtPlanPoint(moving.paintingId, end)) {
    return;
  }
  rebuildSceneFromConfig();
  renderFilmstrip();
  renderGalleryMapEditor();
}

function applyCustomWallResizeFromDrag(end: PlanPoint) {
  const resizing = galleryMapEditorState.resizingWall;
  if (!resizing) {
    return;
  }
  const walls = ensureCustomWallsArray();
  if (resizing.wallIndex < 0 || resizing.wallIndex >= walls.length) {
    setSelectedGalleryMapCustomWall(null);
    return;
  }
  const wall = walls[resizing.wallIndex];
  const next = computeResizedCustomWallFromState(resizing, end);
  if (Math.hypot(next.x2 - next.x1, next.z2 - next.z1) < GALLERY_GRID_SNAP_M) {
    return;
  }
  wall.x1 = next.x1;
  wall.z1 = next.z1;
  wall.x2 = next.x2;
  wall.z2 = next.z2;
  wall.x1Cm = Math.round(next.x1 * CM_PER_M);
  wall.z1Cm = Math.round(next.z1 * CM_PER_M);
  wall.x2Cm = Math.round(next.x2 * CM_PER_M);
  wall.z2Cm = Math.round(next.z2 * CM_PER_M);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function deleteSelectedGalleryRoom() {
  const selectedRoomId = galleryMapEditorState.selectedRoomId;
  if (!selectedRoomId) {
    return;
  }
  const roomIndex = config.rooms.findIndex((room) => room.id === selectedRoomId);
  if (roomIndex < 0) {
    setSelectedGalleryMapRoom(null);
    renderGalleryMapEditor();
    return;
  }
  const linkedPaintings = config.paintings.filter((painting) => painting.roomId === selectedRoomId).length;
  if (linkedPaintings > 0) {
    const shouldDelete = window.confirm(
      `La stanza selezionata contiene ${linkedPaintings} opere. Eliminare la stanza e rimettere queste opere nel filmstrip?`
    );
    if (!shouldDelete) {
      return;
    }
  }

  config.rooms.splice(roomIndex, 1);
  const fallbackRoomId = config.rooms[0]?.id ?? "";
  config.paintings.forEach((painting) => {
    if (painting.roomId === selectedRoomId) {
      painting.roomId = fallbackRoomId;
      painting.placed = false;
    }
  });

  closePaintingCard();
  setSelectedGalleryMapRoom(null);
  rebuildSceneFromConfig();
  renderFilmstrip();
  renderGalleryMapEditor();
}

function applyCustomWallFromDrag(start: PlanPoint, end: PlanPoint) {
  const x1 = start.x;
  const z1 = start.z;
  const x2 = end.x;
  const z2 = end.z;
  if (Math.hypot(x2 - x1, z2 - z1) < GALLERY_GRID_SNAP_M) {
    return;
  }
  const heightCm = Math.max(100, Number(configMapWallHeightCm.value) || 300);
  const thicknessCm = Math.max(5, Number(configMapWallThicknessCm.value) || 16);
  const walls = ensureCustomWallsArray();
  walls.push({
    id: `custom_wall_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    x1,
    z1,
    x2,
    z2,
    x1Cm: Math.round(x1 * 100),
    z1Cm: Math.round(z1 * 100),
    x2Cm: Math.round(x2 * 100),
    z2Cm: Math.round(z2 * 100),
    height: heightCm / 100,
    heightCm,
    thickness: thicknessCm / 100,
    thicknessCm,
    openings: [],
  });
  setSelectedGalleryMapCustomWall(walls.length - 1);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function addOpeningAtPoint(point: PlanPoint) {
  const nearest = findNearestPlanWall(point);
  if (!nearest) {
    return;
  }
  const widthCm = Math.max(20, Number(configMapOpeningWidthCm.value) || 120);
  const baseCm = Math.max(0, Number(configMapOpeningBaseCm.value) || 0);
  const heightCm = Math.max(20, Number(configMapOpeningHeightCm.value) || 220);
  const width = widthCm / 100;
  const base = baseCm / 100;
  const height = heightCm / 100;
  const type = configMapOpeningType.value as "door" | "window" | "opening";
  const center = clampNumber(nearest.along, width * 0.5, Math.max(width * 0.5, nearest.wall.length - width * 0.5));
  let createdRef: GalleryMapOpeningRef | null = null;
  let roomToSelect: string | null = null;

  const targetWall = nearest.wall;
  if (targetWall.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === targetWall.roomId);
    if (!room) {
      return;
    }
    room.openings = Array.isArray(room.openings) ? room.openings : [];
    const openingIndex = room.openings.length;
    room.openings.push({
      id: `op_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      wall: targetWall.wall,
      center,
      centerCm: Math.round(center * 100),
      width,
      widthCm,
      base,
      baseCm,
      height,
      heightCm,
    });
    createdRef = {
      kind: "room",
      roomId: room.id,
      wall: targetWall.wall,
      openingIndex,
    };
    roomToSelect = room.id;
    mirrorOpeningOnAdjacentRooms(room, targetWall.wall, { type, center, width, base, height });
  } else {
    const wall = ensureCustomWallsArray()[targetWall.wallIndex];
    if (!wall) {
      return;
    }
    wall.openings = Array.isArray(wall.openings) ? wall.openings : [];
    const openingIndex = wall.openings.length;
    wall.openings.push({
      id: `op_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      center,
      centerCm: Math.round(center * 100),
      width,
      widthCm,
      base,
      baseCm,
      height,
      heightCm,
    });
    createdRef = {
      kind: "customWall",
      wallIndex: targetWall.wallIndex,
      openingIndex,
    };
  }
  if (roomToSelect) {
    setSelectedGalleryMapRoom(roomToSelect);
  }
  setSelectedGalleryMapOpening(createdRef);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function removeOpeningAtPoint(point: PlanPoint) {
  const nearestWall = findNearestPlanWall(point);
  if (!nearestWall) {
    return;
  }
  const target = findNearestOpeningOnWall(nearestWall);
  if (!target) {
    return;
  }

  if (target.kind === "room") {
    target.room.openings = Array.isArray(target.room.openings) ? target.room.openings : [];
    const [removedOpening] = target.room.openings.splice(target.openingIndex, 1);
    if (removedOpening) {
      removeMirroredOpeningOnAdjacentRooms(target.room, target.wall, removedOpening);
    }
  } else {
    const wall = ensureCustomWallsArray()[target.wallIndex];
    if (!wall) {
      return;
    }
    wall.openings = Array.isArray(wall.openings) ? wall.openings : [];
    wall.openings.splice(target.openingIndex, 1);
  }

  setSelectedGalleryMapOpening(null);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function removeCustomWallAtPoint(point: PlanPoint) {
  const nearestWall = findNearestPlanWall(point);
  if (!nearestWall || nearestWall.wall.kind !== "customWall") {
    return;
  }
  const walls = ensureCustomWallsArray();
  if (nearestWall.wall.wallIndex < 0 || nearestWall.wall.wallIndex >= walls.length) {
    return;
  }
  walls.splice(nearestWall.wall.wallIndex, 1);
  setSelectedGalleryMapCustomWall(null);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function deleteSelectedGalleryLight() {
  const selectedId = galleryMapEditorState.selectedLightId;
  if (!selectedId) {
    return false;
  }
  const lights = ensureGalleryLightsArray();
  const index = lights.findIndex((light) => light.id === selectedId);
  if (index < 0) {
    setSelectedGalleryMapLight(null);
    return false;
  }
  lights.splice(index, 1);
  setSelectedGalleryMapLight(null);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
  return true;
}

function deleteSelectedGalleryOpening() {
  const selected = galleryMapEditorState.selectedOpening;
  if (!selected) {
    return false;
  }
  if (selected.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === selected.roomId);
    if (!room || !Array.isArray(room.openings) || selected.openingIndex < 0 || selected.openingIndex >= room.openings.length) {
      setSelectedGalleryMapOpening(null);
      return false;
    }
    const [removedOpening] = room.openings.splice(selected.openingIndex, 1);
    if (removedOpening) {
      removeMirroredOpeningOnAdjacentRooms(room, selected.wall, removedOpening);
    }
  } else {
    const wall = ensureCustomWallsArray()[selected.wallIndex];
    if (!wall || !Array.isArray(wall.openings) || selected.openingIndex < 0 || selected.openingIndex >= wall.openings.length) {
      setSelectedGalleryMapOpening(null);
      return false;
    }
    wall.openings.splice(selected.openingIndex, 1);
  }
  setSelectedGalleryMapOpening(null);
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
  return true;
}

function deleteSelectedPaintingFromMap() {
  const selectedPaintingId = uiState.selectedPaintingId;
  if (!selectedPaintingId) {
    return false;
  }
  const entry = paintingRegistry.get(selectedPaintingId);
  if (!entry) {
    return false;
  }
  deletePaintingEntry(entry);
  renderFilmstrip();
  renderGalleryMapEditor();
  return true;
}

function deleteSelectedElementFromGalleryMap() {
  if (deleteSelectedPathPoint()) {
    return true;
  }
  if (deleteSelectedGalleryOpening()) {
    return true;
  }
  if (deleteSelectedGalleryLight()) {
    return true;
  }
  if (deleteSelectedPaintingFromMap()) {
    return true;
  }
  if (galleryMapEditorState.selectedCustomWallIndex != null) {
    const walls = ensureCustomWallsArray();
    if (galleryMapEditorState.selectedCustomWallIndex >= 0 && galleryMapEditorState.selectedCustomWallIndex < walls.length) {
      walls.splice(galleryMapEditorState.selectedCustomWallIndex, 1);
      setSelectedGalleryMapCustomWall(null);
      rebuildSceneFromConfig();
      renderGalleryMapEditor();
      return true;
    }
  }
  if (galleryMapEditorState.selectedRoomId) {
    deleteSelectedGalleryRoom();
    return true;
  }
  return false;
}

function setActiveGalleryMapTool(tool: GalleryMapTool) {
  galleryMapEditorState.tool = tool;
  if (tool !== "opening") {
    setSelectedGalleryMapOpening(null);
    galleryMapEditorState.resizingOpening = null;
  }
  if (tool !== "wall") {
    galleryMapEditorState.selectedCustomWallIndex = null;
    galleryMapEditorState.resizingWall = null;
  }
  if (tool !== "path") {
    galleryMapEditorState.movingPathPoint = null;
  }
  configMapToolButtons.forEach((button) => {
    const active = button.dataset.mapTool === tool;
    button.classList.toggle("active", active);
  });
}

function syncGalleryMapAssistToggles() {
  const snapActive = galleryMapEditorState.snapToGrid;
  const magnetActive = galleryMapEditorState.magnet;
  configMapToggleSnapBtn.classList.toggle("active", snapActive);
  configMapToggleSnapBtn.setAttribute("aria-pressed", snapActive ? "true" : "false");
  configMapToggleMagnetBtn.classList.toggle("active", magnetActive);
  configMapToggleMagnetBtn.setAttribute("aria-pressed", magnetActive ? "true" : "false");
}

function resetGalleryMapView() {
  galleryMapEditorState.viewZoom = 1;
  galleryMapEditorState.viewPanX = 0;
  galleryMapEditorState.viewPanZ = 0;
  galleryMapEditorState.panning = null;
  renderGalleryMapEditor();
}

function attachGalleryMapEditor() {
  configMapDeleteRoomBtn?.addEventListener("click", () => {
    deleteSelectedGalleryRoom();
  });

  configMapToolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.mapTool as GalleryMapTool | undefined;
      if (tool) {
        setActiveGalleryMapTool(tool);
      }
    });
  });

  configMapToggleSnapBtn.addEventListener("click", () => {
    galleryMapEditorState.snapToGrid = !galleryMapEditorState.snapToGrid;
    syncGalleryMapAssistToggles();
    renderGalleryMapEditor();
  });

  configMapToggleMagnetBtn.addEventListener("click", () => {
    galleryMapEditorState.magnet = !galleryMapEditorState.magnet;
    syncGalleryMapAssistToggles();
    renderGalleryMapEditor();
  });

  configMapResetViewBtn.addEventListener("click", () => {
    resetGalleryMapView();
  });

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    const wantsPan = event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey);
    if (wantsPan) {
      galleryMapEditorState.panning = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: galleryMapEditorState.viewPanX,
        startPanZ: galleryMapEditorState.viewPanZ,
      };
      if (configGalleryMapEditor.hasPointerCapture(event.pointerId)) {
        configGalleryMapEditor.releasePointerCapture(event.pointerId);
      }
      configGalleryMapEditor.setPointerCapture(event.pointerId);
      renderGalleryMapEditor();
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const lightHandleTarget = (event.target as Element | null)?.closest<SVGElement>("[data-gallery-light-handle]");
    const lightHandle = lightHandleTarget?.getAttribute("data-gallery-light-handle");
    const lightHandleId = lightHandleTarget?.getAttribute("data-gallery-light-id");
    if (lightHandleId && (lightHandle === "source" || lightHandle === "target")) {
      setActiveGalleryMapSubTab("lights");
      setSelectedGalleryMapLight(lightHandleId);
      if (galleryMapEditorState.tool !== "light") {
        renderGalleryMapEditor();
        return;
      }
      const selectedLight = ensureGalleryLightsArray().find((candidate) => candidate.id === lightHandleId);
      if (selectedLight) {
        const rawPoint = getPlanPointFromEditorEvent(event);
        galleryMapEditorState.dragAction = lightHandle === "source" ? "moveLight" : "moveLightTarget";
        galleryMapEditorState.movingLight =
          lightHandle === "source"
            ? {
                lightId: lightHandleId,
                startPointer: rawPoint,
                startX: Number(selectedLight.x ?? 0),
                startZ: Number(selectedLight.z ?? 0),
              }
            : null;
        galleryMapEditorState.movingLightTarget =
          lightHandle === "target"
            ? {
                lightId: lightHandleId,
                startPointer: rawPoint,
                startX: Number(selectedLight.targetX ?? 0),
                startZ: Number(selectedLight.targetZ ?? 0),
              }
            : null;
        galleryMapEditorState.movingRoom = null;
        galleryMapEditorState.resizingRoom = null;
        galleryMapEditorState.resizingWall = null;
        galleryMapEditorState.resizingOpening = null;
        galleryMapEditorState.movingPainting = null;
        galleryMapEditorState.dragStart = rawPoint;
        galleryMapEditorState.dragCurrent = rawPoint;
        galleryMapEditorState.panning = null;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
      }
      renderGalleryMapEditor();
      return;
    }
    const lightTarget = (event.target as Element | null)?.closest<SVGElement>("[data-gallery-light-id]");
    const lightId = lightTarget?.getAttribute("data-gallery-light-id");
    if (lightId) {
      setActiveGalleryMapSubTab("lights");
      setSelectedGalleryMapLight(lightId);
      renderGalleryMapEditor();
      if (galleryMapEditorState.tool !== "light") {
        return;
      }
    }
    const openingHandleTarget = (event.target as Element | null)?.closest<SVGElement>("[data-opening-handle-side]");
    const openingHandleSide = openingHandleTarget?.getAttribute("data-opening-handle-side");
    const openingSelectTarget = (event.target as Element | null)?.closest<SVGElement>("[data-opening-select]");
    if (openingSelectTarget && !(galleryMapEditorState.tool === "opening" && (openingHandleSide === "start" || openingHandleSide === "end"))) {
      const openingKind = openingSelectTarget.getAttribute("data-opening-kind");
      let openingRef: GalleryMapOpeningRef | null = null;
      if (openingKind === "room") {
        const roomId = openingSelectTarget.getAttribute("data-opening-room-id") ?? "";
        const wallRaw = openingSelectTarget.getAttribute("data-opening-wall");
        const openingIndexRaw = Number(openingSelectTarget.getAttribute("data-opening-index"));
        const wall = toWallSide(wallRaw);
        if (roomId && wall && Number.isInteger(openingIndexRaw) && openingIndexRaw >= 0) {
          openingRef = { kind: "room", roomId, wall, openingIndex: openingIndexRaw };
        }
      } else if (openingKind === "custom") {
        const wallIndexRaw = Number(openingSelectTarget.getAttribute("data-opening-wall-index"));
        const openingIndexRaw = Number(openingSelectTarget.getAttribute("data-opening-index"));
        if (Number.isInteger(wallIndexRaw) && wallIndexRaw >= 0 && Number.isInteger(openingIndexRaw) && openingIndexRaw >= 0) {
          openingRef = { kind: "customWall", wallIndex: wallIndexRaw, openingIndex: openingIndexRaw };
        }
      }
      if (openingRef) {
        setActiveGalleryMapSubTab("opening");
        if (galleryMapEditorState.tool !== "opening") {
          setActiveGalleryMapTool("opening");
        }
        if (openingRef.kind === "room") {
          setSelectedGalleryMapRoom(openingRef.roomId);
        } else {
          setSelectedGalleryMapCustomWall(openingRef.wallIndex);
        }
        setSelectedGalleryMapOpening(openingRef);
        renderGalleryMapEditor();
      }
      if (galleryMapEditorState.tool !== "opening") {
        return;
      }
    }
    const roomRectTarget = (event.target as Element | null)?.closest<SVGElement>("[data-room-id]");
    const roomRectId = roomRectTarget?.getAttribute("data-room-id");
    if (roomRectId && galleryMapEditorState.tool === "room") {
      setActiveGalleryMapSubTab("room");
      setSelectedGalleryMapRoom(roomRectId);
      renderGalleryMapEditor();
    }
    const handleTarget = (event.target as Element | null)?.closest<SVGElement>("[data-room-handle-room-id]");
    const handleRoomId = handleTarget?.getAttribute("data-room-handle-room-id");
    const handleCornerRaw = handleTarget?.getAttribute("data-room-handle-corner");
    if (
      galleryMapEditorState.tool === "room" &&
      handleRoomId &&
      (handleCornerRaw === "nw" || handleCornerRaw === "ne" || handleCornerRaw === "sw" || handleCornerRaw === "se")
    ) {
      const room = config.rooms.find((candidate) => candidate.id === handleRoomId);
      if (room) {
        const rawPoint = getPlanPointFromEditorEvent(event);
        setSelectedGalleryMapRoom(room.id);
        galleryMapEditorState.dragAction = "resizeRoom";
        galleryMapEditorState.movingLight = null;
        galleryMapEditorState.movingLightTarget = null;
        galleryMapEditorState.movingRoom = null;
        galleryMapEditorState.resizingOpening = null;
        galleryMapEditorState.resizingRoom = {
          roomId: room.id,
          corner: handleCornerRaw,
          startX: room.x,
          startZ: room.z,
          startWidth: room.width,
          startDepth: room.depth,
        };
        galleryMapEditorState.dragStart = rawPoint;
        galleryMapEditorState.dragCurrent = rawPoint;
        galleryMapEditorState.panning = null;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
        renderGalleryMapEditor();
      }
      return;
    }
    const customWallHandleTarget = (event.target as Element | null)?.closest<SVGElement>("[data-custom-wall-handle-side]");
    const customWallHandleSide = customWallHandleTarget?.getAttribute("data-custom-wall-handle-side");
    const customWallIndexRaw = Number(customWallHandleTarget?.getAttribute("data-custom-wall-index"));
    if (
      galleryMapEditorState.tool === "wall" &&
      (customWallHandleSide === "start" || customWallHandleSide === "end") &&
      Number.isInteger(customWallIndexRaw) &&
      customWallIndexRaw >= 0
    ) {
      const wall = ensureCustomWallsArray()[customWallIndexRaw];
      if (wall) {
        const rawPoint = getPlanPointFromEditorEvent(event);
        setSelectedGalleryMapCustomWall(customWallIndexRaw);
        galleryMapEditorState.dragAction = customWallHandleSide === "start" ? "resizeWallStart" : "resizeWallEnd";
        galleryMapEditorState.movingLight = null;
        galleryMapEditorState.movingLightTarget = null;
        galleryMapEditorState.movingRoom = null;
        galleryMapEditorState.resizingRoom = null;
        galleryMapEditorState.resizingWall = {
          wallIndex: customWallIndexRaw,
          handle: customWallHandleSide,
          startX1: Number(wall.x1 ?? 0),
          startZ1: Number(wall.z1 ?? 0),
          startX2: Number(wall.x2 ?? 0),
          startZ2: Number(wall.z2 ?? 0),
        };
        galleryMapEditorState.resizingOpening = null;
        galleryMapEditorState.movingPainting = null;
        galleryMapEditorState.dragStart = rawPoint;
        galleryMapEditorState.dragCurrent = rawPoint;
        galleryMapEditorState.panning = null;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
        renderGalleryMapEditor();
      }
      return;
    }
    const markerTarget = (event.target as Element | null)?.closest<SVGElement>("[data-map-painting-id]");
    const markerPaintingId = markerTarget?.getAttribute("data-map-painting-id");
    if (markerPaintingId && (galleryMapEditorState.tool === "wall" || galleryMapEditorState.tool === "room")) {
      setActiveGalleryMapSubTab("room");
      const rawPoint = getPlanPointFromEditorEvent(event);
      galleryMapEditorState.dragAction = "movePaintingOnMap";
      galleryMapEditorState.movingLight = null;
      galleryMapEditorState.movingLightTarget = null;
      galleryMapEditorState.movingRoom = null;
      galleryMapEditorState.resizingRoom = null;
      galleryMapEditorState.resizingWall = null;
      galleryMapEditorState.resizingOpening = null;
      galleryMapEditorState.movingPainting = { paintingId: markerPaintingId };
      galleryMapEditorState.dragStart = rawPoint;
      galleryMapEditorState.dragCurrent = rawPoint;
      galleryMapEditorState.panning = null;
      configGalleryMapEditor.setPointerCapture(event.pointerId);
      renderGalleryMapEditor();
      return;
    }
    if (markerPaintingId) {
      setActiveGalleryMapSubTab("room");
      event.preventDefault();
      focusPaintingFromGalleryMap(markerPaintingId);
      return;
    }
    const pathPointTarget = (event.target as Element | null)?.closest<SVGElement>("[data-path-point-index]");
    const pathPointIndexRaw = Number(pathPointTarget?.getAttribute("data-path-point-index"));
    if (Number.isInteger(pathPointIndexRaw) && pathPointIndexRaw >= 0) {
      setActiveGalleryMapSubTab("path");
      setSelectedGalleryPathPoint(pathPointIndexRaw);
      if (galleryMapEditorState.tool === "path") {
        const points = getPathTourKeyframes();
        const selectedPoint = points[pathPointIndexRaw];
        if (selectedPoint) {
          const rawPoint = getPlanPointFromEditorEvent(event);
          galleryMapEditorState.dragAction = "movePathPoint";
          galleryMapEditorState.movingPathPoint = {
            pointIndex: pathPointIndexRaw,
            startPointer: rawPoint,
            startX: selectedPoint.x,
            startZ: selectedPoint.z,
          };
          galleryMapEditorState.movingLight = null;
          galleryMapEditorState.movingLightTarget = null;
          galleryMapEditorState.movingRoom = null;
          galleryMapEditorState.resizingOpening = null;
          galleryMapEditorState.resizingRoom = null;
          galleryMapEditorState.resizingWall = null;
          galleryMapEditorState.movingPainting = null;
          galleryMapEditorState.dragStart = rawPoint;
          galleryMapEditorState.dragCurrent = rawPoint;
          galleryMapEditorState.panning = null;
          configGalleryMapEditor.setPointerCapture(event.pointerId);
        }
      }
      renderGalleryMapEditor();
      return;
    }
    const cameraHandleTarget = (event.target as Element | null)?.closest<SVGElement>("[data-camera-handle]");
    const cameraHandle = cameraHandleTarget?.getAttribute("data-camera-handle");
    if (cameraHandle === "start" || cameraHandle === "target") {
      setActiveGalleryMapSubTab("camera");
      const rawPoint = getPlanPointFromEditorEvent(event);
      galleryMapEditorState.dragAction = cameraHandle === "start" ? "moveCameraStart" : "moveCameraTarget";
      galleryMapEditorState.movingLight = null;
      galleryMapEditorState.movingLightTarget = null;
      galleryMapEditorState.movingRoom = null;
      galleryMapEditorState.resizingOpening = null;
      galleryMapEditorState.resizingRoom = null;
      galleryMapEditorState.dragStart = rawPoint;
      galleryMapEditorState.dragCurrent = rawPoint;
      galleryMapEditorState.panning = null;
      configGalleryMapEditor.setPointerCapture(event.pointerId);
      renderGalleryMapEditor();
      return;
    }
    if (galleryMapEditorState.tool === "opening" && (openingHandleSide === "start" || openingHandleSide === "end")) {
      const openingKind = openingHandleTarget?.getAttribute("data-opening-kind");
      let openingRef: GalleryMapOpeningRef | null = null;
      if (openingKind === "room") {
        const roomId = openingHandleTarget?.getAttribute("data-opening-room-id") ?? "";
        const wallRaw = openingHandleTarget?.getAttribute("data-opening-wall");
        const openingIndexRaw = Number(openingHandleTarget?.getAttribute("data-opening-index"));
        const wall = toWallSide(wallRaw);
        if (roomId && wall && Number.isInteger(openingIndexRaw) && openingIndexRaw >= 0) {
          openingRef = {
            kind: "room",
            roomId,
            wall,
            openingIndex: openingIndexRaw,
          };
        }
      } else if (openingKind === "custom") {
        const wallIndexRaw = Number(openingHandleTarget?.getAttribute("data-opening-wall-index"));
        const openingIndexRaw = Number(openingHandleTarget?.getAttribute("data-opening-index"));
        if (Number.isInteger(wallIndexRaw) && wallIndexRaw >= 0 && Number.isInteger(openingIndexRaw) && openingIndexRaw >= 0) {
          openingRef = {
            kind: "customWall",
            wallIndex: wallIndexRaw,
            openingIndex: openingIndexRaw,
          };
        }
      }

      if (openingRef) {
        const geometry = resolveOpeningGeometryFromRef(openingRef);
        if (geometry) {
          const rawPoint = getPlanPointFromEditorEvent(event);
          const assistedStart = applyPlanPointAssist(rawPoint, "opening");
          const projected = projectPointToSegment(assistedStart, geometry.wallFrom, geometry.wallTo);
          const startAlong = clampNumber(projected.t * geometry.wallLength, 0, geometry.wallLength);
          const currentMetrics = computeOpeningAlongMetrics(geometry.center, geometry.width, geometry.wallLength);
          galleryMapEditorState.dragAction = openingHandleSide === "start" ? "resizeOpeningStart" : "resizeOpeningEnd";
          galleryMapEditorState.movingLight = null;
          galleryMapEditorState.movingLightTarget = null;
          galleryMapEditorState.movingRoom = null;
          galleryMapEditorState.resizingRoom = null;
          galleryMapEditorState.resizingOpening = {
            ref: openingRef,
            handle: openingHandleSide,
            startCenter: currentMetrics.center,
            startWidth: currentMetrics.width,
            startAlong,
          };
          galleryMapEditorState.dragStart = rawPoint;
          galleryMapEditorState.dragCurrent = rawPoint;
          galleryMapEditorState.panning = null;
          if (openingRef.kind === "room") {
            setSelectedGalleryMapRoom(openingRef.roomId);
          }
          setSelectedGalleryMapOpening(openingRef);
          configGalleryMapEditor.setPointerCapture(event.pointerId);
          renderGalleryMapEditor();
        }
      }
      return;
    }
    const rawPoint = getPlanPointFromEditorEvent(event);
    if (galleryMapEditorState.tool === "opening") {
      galleryMapEditorState.resizingOpening = null;
      const openingPoint = applyPlanPointAssist(rawPoint, "opening");
      const existingOpeningRef = findOpeningRefAtPoint(openingPoint);
      if (existingOpeningRef) {
        if (existingOpeningRef.kind === "room") {
          setSelectedGalleryMapRoom(existingOpeningRef.roomId);
        }
        setSelectedGalleryMapOpening(existingOpeningRef);
        renderGalleryMapEditor();
        return;
      }
      setSelectedGalleryMapOpening(null);
      addOpeningAtPoint(openingPoint);
      return;
    }
    const customWallTarget = (event.target as Element | null)?.closest<SVGElement>("[data-custom-wall-index]");
    const customWallLineIndexRaw = Number(customWallTarget?.getAttribute("data-custom-wall-index"));
    if (
      galleryMapEditorState.tool !== "light" &&
      galleryMapEditorState.tool !== "path" &&
      Number.isInteger(customWallLineIndexRaw) &&
      customWallLineIndexRaw >= 0 &&
      !Number.isNaN(customWallLineIndexRaw)
    ) {
      const wasWallTool = galleryMapEditorState.tool === "wall";
      setActiveGalleryMapSubTab("wall");
      setSelectedGalleryMapCustomWall(customWallLineIndexRaw);
      if (!wasWallTool) {
        setActiveGalleryMapTool("wall");
      }
      renderGalleryMapEditor();
      return;
    }
    if (galleryMapEditorState.tool === "delete-opening") {
      galleryMapEditorState.resizingOpening = null;
      removeOpeningAtPoint(applyPlanPointAssist(rawPoint, "opening"));
      return;
    }
    if (galleryMapEditorState.tool === "delete-wall") {
      galleryMapEditorState.resizingOpening = null;
      removeCustomWallAtPoint(applyPlanPointAssist(rawPoint, "generic"));
      return;
    }
    if (galleryMapEditorState.tool === "light") {
      const nearest = findNearestGalleryLight(rawPoint);
      if (nearest) {
        const lightId = nearest.light.id ?? nextGalleryLightId();
        nearest.light.id = lightId;
        setSelectedGalleryMapLight(lightId);
        galleryMapEditorState.dragAction = "moveLight";
        galleryMapEditorState.movingLight = {
          lightId,
          startPointer: rawPoint,
          startX: Number(nearest.light.x ?? 0),
          startZ: Number(nearest.light.z ?? 0),
        };
        galleryMapEditorState.movingLightTarget = null;
        galleryMapEditorState.resizingOpening = null;
        galleryMapEditorState.resizingRoom = null;
        galleryMapEditorState.dragStart = rawPoint;
        galleryMapEditorState.dragCurrent = rawPoint;
        galleryMapEditorState.panning = null;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
        renderGalleryMapEditor();
        return;
      }
      addGalleryLightAtPoint(applyPlanPointAssist(rawPoint, "generic"));
      return;
    }
    if (galleryMapEditorState.tool === "path") {
      addPathPoint(applyPlanPointAssist(rawPoint, "generic"));
      return;
    }
    if (galleryMapEditorState.tool === "delete-light") {
      galleryMapEditorState.resizingOpening = null;
      deleteGalleryLightAtPoint(applyPlanPointAssist(rawPoint, "generic"));
      return;
    }

    if (galleryMapEditorState.tool === "room") {
      const clickedRoom = findRoomAtPlanPoint(rawPoint);
      if (clickedRoom) {
        setSelectedGalleryMapRoom(clickedRoom.id);
        galleryMapEditorState.dragAction = "moveRoom";
        galleryMapEditorState.movingLight = null;
        galleryMapEditorState.movingLightTarget = null;
        galleryMapEditorState.resizingOpening = null;
        galleryMapEditorState.resizingRoom = null;
        galleryMapEditorState.movingRoom = {
          roomId: clickedRoom.id,
          startPointer: rawPoint,
          startX: clickedRoom.x,
          startZ: clickedRoom.z,
        };
        galleryMapEditorState.dragStart = rawPoint;
        galleryMapEditorState.dragCurrent = rawPoint;
        galleryMapEditorState.panning = null;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
        renderGalleryMapEditor();
        return;
      }
      setSelectedGalleryMapRoom(null);
      galleryMapEditorState.dragAction = "createRoom";
      galleryMapEditorState.movingLight = null;
      galleryMapEditorState.movingLightTarget = null;
      galleryMapEditorState.resizingOpening = null;
      galleryMapEditorState.resizingRoom = null;
      const start = applyPlanPointAssist(rawPoint, "room-create");
      galleryMapEditorState.dragStart = start;
      galleryMapEditorState.dragCurrent = start;
    } else {
      setSelectedGalleryMapCustomWall(null);
      galleryMapEditorState.dragAction = "createWall";
      galleryMapEditorState.movingLight = null;
      galleryMapEditorState.movingLightTarget = null;
      galleryMapEditorState.resizingOpening = null;
      galleryMapEditorState.resizingRoom = null;
      galleryMapEditorState.resizingWall = null;
      galleryMapEditorState.movingPainting = null;
      const start = applyPlanPointAssist(rawPoint, "wall-create");
      galleryMapEditorState.dragStart = start;
      galleryMapEditorState.dragCurrent = start;
    }

    configGalleryMapEditor.setPointerCapture(event.pointerId);
    renderGalleryMapEditor();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (galleryMapEditorState.panning && galleryMapEditorState.panning.pointerId === event.pointerId) {
      event.preventDefault();
      const { width, height } = getGalleryMapEditorSize();
      const { scale } = createPlanTransforms(width, height);
      const deltaX = event.clientX - galleryMapEditorState.panning.startClientX;
      const deltaY = event.clientY - galleryMapEditorState.panning.startClientY;
      galleryMapEditorState.viewPanX = galleryMapEditorState.panning.startPanX - deltaX / Math.max(0.01, scale);
      galleryMapEditorState.viewPanZ = galleryMapEditorState.panning.startPanZ - deltaY / Math.max(0.01, scale);
      renderGalleryMapEditor();
      return;
    }
    if (!galleryMapEditorState.dragStart) {
      return;
    }
    event.preventDefault();
    const rawPoint = getPlanPointFromEditorEvent(event);
    if (galleryMapEditorState.dragAction === "moveCameraStart") {
      galleryMapEditorState.dragCurrent = rawPoint;
      applyCameraPointFromMapDrag(rawPoint, "start");
      return;
    }
    if (galleryMapEditorState.dragAction === "moveCameraTarget") {
      galleryMapEditorState.dragCurrent = rawPoint;
      applyCameraPointFromMapDrag(rawPoint, "target");
      return;
    }
    if (galleryMapEditorState.dragAction === "resizeOpeningStart" || galleryMapEditorState.dragAction === "resizeOpeningEnd") {
      galleryMapEditorState.dragCurrent = rawPoint;
      renderGalleryMapEditor();
      return;
    }
    if (galleryMapEditorState.dragAction === "resizeWallStart" || galleryMapEditorState.dragAction === "resizeWallEnd") {
      galleryMapEditorState.dragCurrent = rawPoint;
      renderGalleryMapEditor();
      return;
    }
    if (galleryMapEditorState.dragAction === "movePaintingOnMap") {
      galleryMapEditorState.dragCurrent = rawPoint;
      renderGalleryMapEditor();
      return;
    }
    if (galleryMapEditorState.dragAction === "createRoom") {
      galleryMapEditorState.dragCurrent = applyPlanPointAssist(rawPoint, "room-create", {
        anchor: galleryMapEditorState.dragStart,
      });
    } else if (galleryMapEditorState.dragAction === "createWall") {
      galleryMapEditorState.dragCurrent = applyPlanPointAssist(rawPoint, "wall-create", {
        anchor: galleryMapEditorState.dragStart,
      });
    } else {
      galleryMapEditorState.dragCurrent = rawPoint;
    }
    renderGalleryMapEditor();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (galleryMapEditorState.panning && galleryMapEditorState.panning.pointerId === event.pointerId) {
      event.preventDefault();
      galleryMapEditorState.panning = null;
      if (configGalleryMapEditor.hasPointerCapture(event.pointerId)) {
        configGalleryMapEditor.releasePointerCapture(event.pointerId);
      }
      renderGalleryMapEditor();
      return;
    }
    if (!galleryMapEditorState.dragStart || !galleryMapEditorState.dragCurrent) {
      return;
    }
    event.preventDefault();
    const start = galleryMapEditorState.dragStart;
    const rawEnd = getPlanPointFromEditorEvent(event);
    const dragDistance = Math.hypot(rawEnd.x - start.x, rawEnd.z - start.z);
    if (galleryMapEditorState.dragAction === "createRoom") {
      if (dragDistance < GALLERY_GRID_SNAP_M * 0.6) {
        moveVisitorToPlanPointFromMap(rawEnd);
      } else {
        const end = applyPlanPointAssist(rawEnd, "room-create", { anchor: start });
        applyRoomFromDrag(start, end);
      }
    } else if (galleryMapEditorState.dragAction === "createWall") {
      if (dragDistance < GALLERY_GRID_SNAP_M * 0.6) {
        moveVisitorToPlanPointFromMap(rawEnd);
      } else {
        const end = applyPlanPointAssist(rawEnd, "wall-create", { anchor: start });
        applyCustomWallFromDrag(start, end);
      }
    } else if (galleryMapEditorState.dragAction === "moveRoom") {
      applyRoomMoveFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "resizeRoom") {
      applyRoomResizeFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "moveLight") {
      applyGalleryLightMoveFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "moveLightTarget") {
      applyGalleryLightTargetMoveFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "movePaintingOnMap") {
      applyPaintingMoveFromMapDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "resizeWallStart" || galleryMapEditorState.dragAction === "resizeWallEnd") {
      applyCustomWallResizeFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "resizeOpeningStart" || galleryMapEditorState.dragAction === "resizeOpeningEnd") {
      applyOpeningResizeFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "moveCameraStart") {
      applyCameraPointFromMapDrag(rawEnd, "start");
    } else if (galleryMapEditorState.dragAction === "moveCameraTarget") {
      applyCameraPointFromMapDrag(rawEnd, "target");
    } else if (galleryMapEditorState.dragAction === "movePathPoint") {
      applyPathPointMoveFromDrag(rawEnd);
    }
    if (configGalleryMapEditor.hasPointerCapture(event.pointerId)) {
      configGalleryMapEditor.releasePointerCapture(event.pointerId);
    }
    galleryMapEditorState.dragAction = "none";
    galleryMapEditorState.dragStart = null;
    galleryMapEditorState.dragCurrent = null;
    galleryMapEditorState.movingRoom = null;
    galleryMapEditorState.resizingRoom = null;
    galleryMapEditorState.resizingWall = null;
    galleryMapEditorState.movingPainting = null;
    galleryMapEditorState.movingLight = null;
    galleryMapEditorState.movingLightTarget = null;
    galleryMapEditorState.movingPathPoint = null;
    galleryMapEditorState.resizingOpening = null;
    galleryMapEditorState.panning = null;
    renderGalleryMapEditor();
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const { width, height } = getGalleryMapEditorSize();
    const rect = configGalleryMapEditor.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const before = createPlanTransforms(width, height).toPlan(sx, sy);
    const nextZoom = clampNumber(
      galleryMapEditorState.viewZoom * Math.exp(-event.deltaY * 0.0016),
      GALLERY_MAP_ZOOM_MIN,
      GALLERY_MAP_ZOOM_MAX
    );
    if (Math.abs(nextZoom - galleryMapEditorState.viewZoom) < 0.00001) {
      return;
    }
    galleryMapEditorState.viewZoom = nextZoom;
    const after = createPlanTransforms(width, height).toPlan(sx, sy);
    galleryMapEditorState.viewPanX += before.x - after.x;
    galleryMapEditorState.viewPanZ += before.z - after.z;
    renderGalleryMapEditor();
  };

  const isEditingTextInput = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) {
      return false;
    }
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      return true;
    }
    return el.isContentEditable;
  };

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if ((event.key === "p" || event.key === "P") && !event.repeat) {
      if (isEditingTextInput(event.target)) {
        return;
      }
      if (pathPlaybackState.active) {
        stopPathPlayback();
      } else {
        startPathPlayback();
      }
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && pathPlaybackState.active) {
      stopPathPlayback();
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }
    if (isEditingTextInput(event.target)) {
      return;
    }
    if (!isConfigTabActive("gallery-map")) {
      return;
    }
    if (deleteSelectedElementFromGalleryMap()) {
      event.preventDefault();
    }
  };

  configGalleryMapEditor.addEventListener("pointerdown", onPointerDown);
  configGalleryMapEditor.addEventListener("pointermove", onPointerMove);
  configGalleryMapEditor.addEventListener("pointerup", onPointerUp);
  configGalleryMapEditor.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onWindowKeyDown);
  configGalleryMapEditor.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  configGalleryMapEditor.addEventListener("pointercancel", (event) => {
    if (configGalleryMapEditor.hasPointerCapture(event.pointerId)) {
      configGalleryMapEditor.releasePointerCapture(event.pointerId);
    }
    galleryMapEditorState.dragAction = "none";
    galleryMapEditorState.dragStart = null;
    galleryMapEditorState.dragCurrent = null;
    galleryMapEditorState.movingRoom = null;
    galleryMapEditorState.resizingRoom = null;
    galleryMapEditorState.resizingWall = null;
    galleryMapEditorState.movingPainting = null;
    galleryMapEditorState.movingLight = null;
    galleryMapEditorState.movingLightTarget = null;
    galleryMapEditorState.movingPathPoint = null;
    galleryMapEditorState.resizingOpening = null;
    galleryMapEditorState.panning = null;
    renderGalleryMapEditor();
  });
  setSelectedGalleryMapRoom(null);
  setActiveGalleryMapTool("room");
  syncGalleryMapAssistToggles();
}

function ensureExhibitionConfig() {
  config.exhibition = config.exhibition ?? {};
  config.exhibition.location = config.exhibition.location ?? {};
  return config.exhibition;
}

function ensureVisitorConfig() {
  config.visitor = config.visitor ?? {};
  return config.visitor;
}

function ensureVisitorPathTourConfig() {
  const visitorCfg = ensureVisitorConfig();
  visitorCfg.pathTour = visitorCfg.pathTour ?? {};
  visitorCfg.pathTour.keyframes = Array.isArray(visitorCfg.pathTour.keyframes) ? visitorCfg.pathTour.keyframes : [];
  return visitorCfg.pathTour;
}

function getPathTourKeyframes(): PlanPoint[] {
  const tour = ensureVisitorPathTourConfig();
  const raw = Array.isArray(tour.keyframes) ? tour.keyframes : [];
  return raw
    .map((point) => {
      const xRaw = Number(point.x);
      const zRaw = Number(point.z);
      const xCmRaw = Number(point.xCm);
      const zCmRaw = Number(point.zCm);
      const x = Number.isFinite(xRaw) ? xRaw : Number.isFinite(xCmRaw) ? xCmRaw / CM_PER_M : Number.NaN;
      const z = Number.isFinite(zRaw) ? zRaw : Number.isFinite(zCmRaw) ? zCmRaw / CM_PER_M : Number.NaN;
      return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
    })
    .filter((point): point is PlanPoint => point != null);
}

function writePathTourKeyframes(points: PlanPoint[]) {
  const tour = ensureVisitorPathTourConfig();
  tour.keyframes = points.map((point) => ({
    x: roundConfigNumber(point.x),
    z: roundConfigNumber(point.z),
    xCm: Math.round(point.x * CM_PER_M),
    zCm: Math.round(point.z * CM_PER_M),
  }));
}

function setSelectedGalleryPathPoint(index: number | null) {
  galleryMapEditorState.selectedRoomId = null;
  galleryMapEditorState.selectedCustomWallIndex = null;
  galleryMapEditorState.selectedLightId = null;
  setSelectedGalleryMapOpening(null);
  const keyframes = getPathTourKeyframes();
  if (!Number.isInteger(index) || index == null || index < 0 || index >= keyframes.length) {
    galleryMapEditorState.selectedPathPointIndex = null;
  } else {
    galleryMapEditorState.selectedPathPointIndex = index;
  }
  syncPathTourInspectorControls();
}

function syncPathTourInspectorControls() {
  const tour = ensureVisitorPathTourConfig();
  const walkSecondsRaw = Number(tour.walkSeconds);
  const stopSecondsRaw = Number(tour.stopOnPaintingSeconds);
  const cardSecondsRaw = Number(tour.cardSeconds);
  const walkSeconds = Number.isFinite(walkSecondsRaw) ? clampNumber(walkSecondsRaw, 0.2, 60) : 4;
  const stopSeconds = Number.isFinite(stopSecondsRaw) ? clampNumber(stopSecondsRaw, 0, 60) : 1.5;
  const cardSeconds = Number.isFinite(cardSecondsRaw) ? clampNumber(cardSecondsRaw, 0, 60) : 2.5;
  const autoTarget = tour.autoTargetNearestPainting !== false;
  const loop = tour.loop === true;
  tour.walkSeconds = walkSeconds;
  tour.stopOnPaintingSeconds = stopSeconds;
  tour.cardSeconds = cardSeconds;
  tour.openPaintingCard = tour.openPaintingCard !== false;
  tour.autoTargetNearestPainting = autoTarget;
  configMapPathWalkSeconds.value = walkSeconds.toFixed(1).replace(/\.0$/, "");
  configMapPathStopSeconds.value = stopSeconds.toFixed(1).replace(/\.0$/, "");
  configMapPathCardSeconds.value = cardSeconds.toFixed(1).replace(/\.0$/, "");
  configMapPathOpenCard.checked = tour.openPaintingCard;
  configMapPathAutoTarget.checked = autoTarget;
  configMapPathLoop.checked = loop;
  const points = getPathTourKeyframes();
  const selected = galleryMapEditorState.selectedPathPointIndex;
  configMapPathDeletePointBtn.disabled = !(selected != null && selected >= 0 && selected < points.length);
  const selectedLabel = selected != null && selected >= 0 && selected < points.length ? `Selezionato: #${selected + 1}` : "Selezionato: nessuno";
  configMapPathStatus.textContent = `${points.length} keyframe • ${selectedLabel}`;
}

function applyPathPointMoveFromDrag(end: PlanPoint) {
  const moving = galleryMapEditorState.movingPathPoint;
  if (!moving) {
    return;
  }
  const points = getPathTourKeyframes();
  if (moving.pointIndex < 0 || moving.pointIndex >= points.length) {
    return;
  }
  const deltaX = end.x - moving.startPointer.x;
  const deltaZ = end.z - moving.startPointer.z;
  const assisted = applyPlanPointAssist({ x: moving.startX + deltaX, z: moving.startZ + deltaZ }, "generic");
  points[moving.pointIndex] = assisted;
  writePathTourKeyframes(points);
  setSelectedGalleryPathPoint(moving.pointIndex);
  renderGalleryMapEditor();
}

function addPathPoint(point: PlanPoint) {
  const points = getPathTourKeyframes();
  points.push(point);
  writePathTourKeyframes(points);
  setSelectedGalleryPathPoint(points.length - 1);
  renderGalleryMapEditor();
}

function deleteSelectedPathPoint() {
  const selected = galleryMapEditorState.selectedPathPointIndex;
  const points = getPathTourKeyframes();
  if (selected == null || selected < 0 || selected >= points.length) {
    return false;
  }
  points.splice(selected, 1);
  writePathTourKeyframes(points);
  setSelectedGalleryPathPoint(points.length ? Math.max(0, Math.min(selected, points.length - 1)) : null);
  renderGalleryMapEditor();
  return true;
}

function ensureVisitorStartConfig() {
  const visitorCfg = ensureVisitorConfig();
  visitorCfg.start = visitorCfg.start ?? {};
  return visitorCfg.start;
}

function ensureRenderingConfig() {
  config.rendering = config.rendering ?? {};
  return config.rendering;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampCameraFov(value: number) {
  return clampNumber(value, 20, 120);
}

function normalizeColorInputValue(value: unknown, fallback: string) {
  const normalizedFallback = /^#[0-9a-f]{6}$/i.test(fallback) ? fallback.toLowerCase() : "#000000";
  if (typeof value !== "string") {
    return normalizedFallback;
  }
  const raw = value.trim();
  const shortHexMatch = raw.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  return normalizedFallback;
}

function roundConfigNumber(value: number, digits = 3) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveCurrentViewTarget() {
  if (movement.focusTarget) {
    return movement.focusTarget.clone();
  }
  const lookDir = new THREE.Vector3(
    Math.cos(movement.pitch) * Math.sin(movement.yaw),
    Math.sin(movement.pitch),
    Math.cos(movement.pitch) * Math.cos(movement.yaw)
  ).normalize();
  return visitor.position.clone().add(lookDir.multiplyScalar(3));
}

function persistCurrentCameraConfigToShow() {
  const rendering = ensureRenderingConfig();
  rendering.cameraFov = roundConfigNumber(clampCameraFov(Number(camera.fov)), 2);

  const start = ensureVisitorStartConfig();
  const target = resolveCurrentViewTarget();
  start.x = roundConfigNumber(visitor.position.x);
  start.y = roundConfigNumber(visitor.position.y);
  start.z = roundConfigNumber(visitor.position.z);
  start.yaw = roundConfigNumber(movement.yaw, 6);
  start.pitch = roundConfigNumber(movement.pitch, 6);
  start.targetX = roundConfigNumber(target.x);
  start.targetY = roundConfigNumber(target.y);
  start.targetZ = roundConfigNumber(target.z);
}

function setCameraFieldValue(input: HTMLInputElement, value: number | undefined, digits = 2) {
  if (Number.isFinite(value)) {
    input.value = Number(value).toFixed(digits);
  } else {
    input.value = "";
  }
}

function parseIsoDate(value: string | undefined | null) {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateIt(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toUtcDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function normalizeWhenInputsOrder() {
  const start = parseIsoDate(configWhenStartDate.value);
  const end = parseIsoDate(configWhenEndDate.value);
  if (!start || !end) {
    return;
  }
  if (start.getTime() <= end.getTime()) {
    return;
  }
  configWhenStartDate.value = toIsoDate(end);
  configWhenEndDate.value = toIsoDate(start);
}

function setExhibitionWhenRangeFromInputs() {
  normalizeWhenInputsOrder();
  const exhibition = ensureExhibitionConfig();
  exhibition.startDate = configWhenStartDate.value || undefined;
  exhibition.endDate = configWhenEndDate.value || undefined;
}

function ensureWhenCalendarViewMonth() {
  const start = parseIsoDate(configWhenStartDate.value);
  const end = parseIsoDate(configWhenEndDate.value);
  const pivot = start ?? end ?? new Date();
  whenCalendarViewMonth = new Date(pivot.getFullYear(), pivot.getMonth(), 1);
}

function getResolvedWhenRange() {
  const start = parseIsoDate(configWhenStartDate.value);
  const end = parseIsoDate(configWhenEndDate.value);
  if (start && end && start.getTime() > end.getTime()) {
    return { start: end, end: start };
  }
  return { start, end };
}

function renderWhenCalendarRangeLabel(start: Date | null, end: Date | null) {
  if (!start && !end) {
    configWhenCalendarRangeLabel.textContent = "Seleziona data inizio e data fine della mostra.";
    return;
  }
  if (start && !end) {
    configWhenCalendarRangeLabel.textContent = `Inizio selezionato: ${formatDateIt(start)}. Seleziona la data fine.`;
    return;
  }
  if (!start && end) {
    configWhenCalendarRangeLabel.textContent = `Fine selezionata: ${formatDateIt(end)}. Seleziona la data inizio.`;
    return;
  }
  const days = Math.max(1, toUtcDayNumber(end!) - toUtcDayNumber(start!) + 1);
  configWhenCalendarRangeLabel.textContent = `Periodo mostra: ${formatDateIt(start!)} - ${formatDateIt(end!)} (${days} giorni).`;
}

function renderWhenCalendar() {
  const view = new Date(whenCalendarViewMonth.getFullYear(), whenCalendarViewMonth.getMonth(), 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  configWhenCalendarLabel.textContent = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(view);

  const monthStart = new Date(year, month, 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const todayIso = toIsoDate(today);

  const { start, end } = getResolvedWhenRange();
  const startMs = start ? start.getTime() : NaN;
  const endMs = end ? end.getTime() : NaN;

  const cells: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    let cellYear = year;
    let cellMonth = month;
    let day = 1;
    let outsideMonth = false;

    if (i < firstWeekday) {
      outsideMonth = true;
      cellMonth = month - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
      day = daysInPrevMonth - firstWeekday + 1 + i;
    } else if (i >= firstWeekday + daysInMonth) {
      outsideMonth = true;
      cellMonth = month + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
      day = i - (firstWeekday + daysInMonth) + 1;
    } else {
      day = i - firstWeekday + 1;
    }

    const cellDate = new Date(cellYear, cellMonth, day);
    const iso = toIsoDate(cellDate);
    const cellMs = cellDate.getTime();
    const isInRange = Number.isFinite(startMs) && Number.isFinite(endMs) && cellMs >= startMs && cellMs <= endMs;
    const isRangeStart = Number.isFinite(startMs) && cellMs === startMs;
    const isRangeEnd = Number.isFinite(endMs) && cellMs === endMs;
    const isSingleDay = isRangeStart && isRangeEnd;
    const classes = ["when-calendar-day"];
    if (outsideMonth) {
      classes.push("is-outside-month");
    }
    if (iso === todayIso) {
      classes.push("is-today");
    }
    if (isInRange) {
      classes.push("is-in-range");
    }
    if (isRangeStart) {
      classes.push("is-range-start");
    }
    if (isRangeEnd) {
      classes.push("is-range-end");
    }
    if (isSingleDay) {
      classes.push("is-single-day");
    }

    cells.push(
      `<button type="button" role="gridcell" class="${classes.join(" ")}" data-when-date="${iso}" aria-label="${formatDateIt(
        cellDate
      )}">${day}</button>`
    );
  }

  configWhenCalendarGrid.innerHTML = cells.join("");
  renderWhenCalendarRangeLabel(start, end);
}

function applyWhenCalendarDateSelection(isoDate: string) {
  const picked = parseIsoDate(isoDate);
  if (!picked) {
    return;
  }

  const start = parseIsoDate(configWhenStartDate.value);
  const end = parseIsoDate(configWhenEndDate.value);

  if (!start || (start && end)) {
    configWhenStartDate.value = isoDate;
    configWhenEndDate.value = "";
  } else if (picked.getTime() < start.getTime()) {
    configWhenEndDate.value = configWhenStartDate.value;
    configWhenStartDate.value = isoDate;
  } else {
    configWhenEndDate.value = isoDate;
  }

  whenCalendarViewMonth = new Date(picked.getFullYear(), picked.getMonth(), 1);
  setExhibitionWhenRangeFromInputs();
  renderWhenCalendar();
}

function resolveExhibitionLocation() {
  const exhibition = ensureExhibitionConfig();
  const location = exhibition.location ?? {};
  const latRaw = Number(location.lat);
  const lngRaw = Number(location.lng);
  const zoomRaw = Number(location.zoom);
  const lat = Number.isFinite(latRaw) ? clampNumber(latRaw, -90, 90) : DEFAULT_EXHIBITION_LAT;
  const lng = Number.isFinite(lngRaw) ? clampNumber(lngRaw, -180, 180) : DEFAULT_EXHIBITION_LNG;
  const zoom = Number.isFinite(zoomRaw) ? clampNumber(zoomRaw, 2, 19) : DEFAULT_EXHIBITION_ZOOM;
  return { lat, lng, zoom };
}

function buildWhereGeocodeQueries(rawAddress: string) {
  const normalized = rawAddress.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const queries = [normalized];
  if (parts.length > 1) {
    queries.push(parts.slice(1).join(", "));
    queries.push(parts.slice(-2).join(", "));
    queries.push(parts[parts.length - 2]);
    queries.push(parts[parts.length - 1]);
  }
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = query.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

type WhereGeocodeHit = {
  lat: number;
  lng: number;
  displayName: string;
  className: string;
  typeName: string;
  addressType: string;
};

async function geocodeWhereQuery(query: string): Promise<WhereGeocodeHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "it,en",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const first = payload[0] ?? {};
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return {
    lat,
    lng,
    displayName: String(first.display_name ?? query),
    className: String(first.class ?? ""),
    typeName: String(first.type ?? ""),
    addressType: String(first.addresstype ?? ""),
  };
}

function guessWhereZoomFromHit(hit: WhereGeocodeHit) {
  const marker = `${hit.className}:${hit.typeName}:${hit.addressType}`.toLowerCase();
  if (marker.includes("country")) {
    return 6;
  }
  if (marker.includes("state") || marker.includes("region") || marker.includes("province")) {
    return 8;
  }
  if (marker.includes("city") || marker.includes("town") || marker.includes("municipality")) {
    return 12;
  }
  if (marker.includes("village") || marker.includes("hamlet")) {
    return 13;
  }
  if (marker.includes("road") || marker.includes("street")) {
    return 16;
  }
  if (marker.includes("house") || marker.includes("building")) {
    return 17;
  }
  return 15;
}

async function searchWhereAddressOnMap() {
  const rawAddress = configWhereAddress.value.trim();
  if (!rawAddress) {
    window.alert("Inserisci un indirizzo prima di cercare.");
    return;
  }

  const queries = buildWhereGeocodeQueries(rawAddress);
  if (!queries.length) {
    window.alert("Indirizzo non valido.");
    return;
  }

  const previousLabel = configWhereSearchBtn.textContent ?? "Cerca";
  configWhereSearchBtn.disabled = true;
  configWhereSearchBtn.textContent = "Cerco...";
  try {
    let matchedQuery = "";
    let hit: WhereGeocodeHit | null = null;
    for (const query of queries) {
      const candidate = await geocodeWhereQuery(query);
      if (candidate) {
        matchedQuery = query;
        hit = candidate;
        break;
      }
    }

    if (!hit) {
      window.alert("Nessun risultato trovato per indirizzo o citta.");
      return;
    }

    ensureConfigLeafletMap();
    applyExhibitionLocation(hit.lat, hit.lng, guessWhereZoomFromHit(hit));
    if (matchedQuery !== rawAddress) {
      window.alert(`Indirizzo completo non trovato. Mappa agganciata almeno alla citta/area: "${matchedQuery}".`);
    }
  } catch (error) {
    console.error("Errore ricerca indirizzo mappa:", error);
    window.alert("Errore durante la ricerca indirizzo.");
  } finally {
    configWhereSearchBtn.disabled = false;
    configWhereSearchBtn.textContent = previousLabel;
  }
}

function applyExhibitionLocation(latArg: number, lngArg: number, zoomArg?: number) {
  const lat = clampNumber(latArg, -90, 90);
  const lng = clampNumber(lngArg, -180, 180);
  const nextZoom = clampNumber(zoomArg ?? configLeafletMap?.getZoom() ?? DEFAULT_EXHIBITION_ZOOM, 2, 19);
  const exhibition = ensureExhibitionConfig();
  exhibition.location = exhibition.location ?? {};
  exhibition.location.lat = lat;
  exhibition.location.lng = lng;
  exhibition.location.zoom = nextZoom;
  configWhereLat.value = lat.toFixed(6);
  configWhereLng.value = lng.toFixed(6);

  if (configLeafletMarker) {
    configLeafletMarker.setLatLng([lat, lng]);
  }
  if (configLeafletMap) {
    configLeafletMap.setView([lat, lng], nextZoom);
  }
}

function ensureConfigLeafletMap() {
  if (configLeafletMap) {
    return;
  }
  const { lat, lng, zoom } = resolveExhibitionLocation();
  configLeafletMap = L.map(configWhereMap, { zoomControl: true }).setView([lat, lng], zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(configLeafletMap);

  configLeafletMarker = L.marker([lat, lng], { draggable: true }).addTo(configLeafletMap);
  configLeafletMap.on("click", (event: L.LeafletMouseEvent) => {
    applyExhibitionLocation(event.latlng.lat, event.latlng.lng);
  });
  configLeafletMarker.on("dragend", () => {
    const pos = configLeafletMarker?.getLatLng();
    if (!pos) {
      return;
    }
    applyExhibitionLocation(pos.lat, pos.lng);
  });
  configLeafletMap.on("zoomend", () => {
    const exhibition = ensureExhibitionConfig();
    exhibition.location = exhibition.location ?? {};
    exhibition.location.zoom = configLeafletMap?.getZoom();
  });
}

function setActiveGalleryMapSubTab(tabId: string) {
  const normalizedTab = tabId === "editor" ? "room" : tabId;
  configGalleryMapSubTabButtons.forEach((button) => {
    const selected = button.dataset.galleryMapSubtab === normalizedTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  configGalleryMapSubTabPanels.forEach((panel) => {
    const panelId = panel.dataset.galleryMapSubtabPanel ?? "";
    const selected = panelId === normalizedTab;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  });
  if (normalizedTab === "lights") {
    syncGalleryLightTargetOptions();
    syncSelectedGalleryLightControls();
    if (galleryMapEditorState.tool !== "light") {
      setActiveGalleryMapTool("light");
    }
  }
  if (normalizedTab === "path") {
    syncPathTourInspectorControls();
    if (galleryMapEditorState.tool !== "path") {
      setActiveGalleryMapTool("path");
    }
  }
  if (normalizedTab === "room" && galleryMapEditorState.tool !== "room") {
    setActiveGalleryMapTool("room");
  } else if (normalizedTab === "wall" && galleryMapEditorState.tool !== "wall") {
    setActiveGalleryMapTool("wall");
  } else if (normalizedTab === "opening" && galleryMapEditorState.tool !== "opening") {
    setActiveGalleryMapTool("opening");
  }
  if (normalizedTab !== "lights" && galleryMapEditorState.tool === "light") {
    setActiveGalleryMapTool("room");
  }
  if (normalizedTab !== "path" && galleryMapEditorState.tool === "path") {
    setActiveGalleryMapTool("room");
  }
  window.setTimeout(() => {
    renderGalleryMapEditor();
  }, 0);
}

function setActiveConfigTab(tabId: string) {
  configTabButtons.forEach((button) => {
    const selected = button.dataset.configTab === tabId;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  configTabPanels.forEach((panel) => {
    const selected = panel.dataset.configTabPanel === tabId;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  });
  if (tabId === "where") {
    ensureConfigLeafletMap();
    window.setTimeout(() => {
      configLeafletMap?.invalidateSize();
    }, 0);
  }
  if (tabId === "when") {
    window.setTimeout(() => {
      renderWhenCalendar();
    }, 0);
  }
  if (tabId === "gallery-map") {
    window.setTimeout(() => {
      renderGalleryMapEditor();
    }, 0);
  }
}

function syncConfigPanelFromConfig() {
  const exhibition = ensureExhibitionConfig();
  configWhenStartDate.value = exhibition.startDate ?? "";
  configWhenEndDate.value = exhibition.endDate ?? "";
  configWhenTextMd.value = exhibition.whenText ?? "";
  configWhereAddress.value = exhibition.indirizzoCompleto ?? exhibition.location?.name ?? "";
  configWhereTextMd.value = exhibition.doveText ?? "";
  configIntroMd.value = exhibition.introductionMd ?? "";
  const rendering = ensureRenderingConfig();
  configMapFloorColor.value = normalizeColorInputValue(rendering.floorColor, "#c7c7c7");
  configMapWallColor.value = normalizeColorInputValue(rendering.wallColor, "#ffffff");
  const firstRoomHeightCm = Number(config.rooms[0]?.heightCm ?? Number(config.rooms[0]?.height ?? 3) * CM_PER_M);
  const firstCustomWallThicknessCm = Number(
    ensureCustomWallsArray()[0]?.thicknessCm ??
      Number(ensureCustomWallsArray()[0]?.thickness ?? rendering.wallThickness ?? 0.16) * CM_PER_M
  );
  const firstOpening =
    config.rooms.flatMap((room) => room.openings ?? [])[0] ??
    ensureCustomWallsArray().flatMap((wall) => wall.openings ?? [])[0] ??
    null;
  configMapWallHeightCm.value = String(Math.round(clampNumber(firstRoomHeightCm || 300, 100, 1000)));
  configMapWallThicknessCm.value = String(Math.round(clampNumber(firstCustomWallThicknessCm || 16, 5, 200)));
  configMapWallHeightCmWall.value = configMapWallHeightCm.value;
  configMapWallThicknessCmWall.value = configMapWallThicknessCm.value;
  configMapOpeningType.value = resolveOpeningType(firstOpening ?? {});
  configMapOpeningWidthCm.value = String(Math.round(getOpeningWidthM(firstOpening ?? {}) * CM_PER_M || 120));
  configMapOpeningBaseCm.value = String(Math.round(getOpeningBaseM(firstOpening ?? {}) * CM_PER_M || 0));
  configMapOpeningHeightCm.value = String(Math.round(getOpeningHeightM(firstOpening ?? {}) * CM_PER_M || 220));
  syncSelectedOpeningControls();
  const configuredMinPaintingDistance = Number(config.visitor?.minPaintingDistance);
  const minPaintingDistance = clampNumber(
    Number.isFinite(configuredMinPaintingDistance) ? configuredMinPaintingDistance : visitor.minPaintingDistance,
    0.2,
    5
  );
  configMapMinPaintingDistanceM.value = minPaintingDistance.toFixed(2).replace(/\.00$/, "");
  const configuredFov = Number(config.rendering?.cameraFov);
  configCameraFov.value = String(Math.round(clampCameraFov(Number.isFinite(configuredFov) ? configuredFov : camera.fov)));
  const start = config.visitor?.start ?? {};
  setCameraFieldValue(configCameraStartX, Number(start.x), 2);
  setCameraFieldValue(configCameraStartY, Number(start.y), 2);
  setCameraFieldValue(configCameraStartZ, Number(start.z), 2);
  setCameraFieldValue(configCameraTargetX, Number(start.targetX), 2);
  setCameraFieldValue(configCameraTargetY, Number(start.targetY), 2);
  setCameraFieldValue(configCameraTargetZ, Number(start.targetZ), 2);

  const { lat, lng, zoom } = resolveExhibitionLocation();
  configWhereLat.value = lat.toFixed(6);
  configWhereLng.value = lng.toFixed(6);
  if (configLeafletMarker) {
    configLeafletMarker.setLatLng([lat, lng]);
  }
  if (configLeafletMap) {
    configLeafletMap.setView([lat, lng], zoom);
  }
  ensureWhenCalendarViewMonth();
  renderWhenCalendar();
  syncGalleryLightTargetOptions();
  syncPathTourInspectorControls();
  setSelectedGalleryMapRoom(null);
  syncSelectedGalleryLightControls();
  renderGalleryMapEditor();
}

function attachConfigPanel() {
  attachGalleryMapEditor();
  configTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.configTab;
      if (tabId) {
        setActiveConfigTab(tabId);
      }
    });
  });
  configGalleryMapSubTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.galleryMapSubtab;
      if (tabId) {
        setActiveGalleryMapSubTab(tabId);
      }
    });
  });

  configWhenStartDate.addEventListener("change", () => {
    setExhibitionWhenRangeFromInputs();
    ensureWhenCalendarViewMonth();
    renderWhenCalendar();
  });
  configWhenEndDate.addEventListener("change", () => {
    setExhibitionWhenRangeFromInputs();
    ensureWhenCalendarViewMonth();
    renderWhenCalendar();
  });
  configWhenCalendarPrevBtn.addEventListener("click", () => {
    whenCalendarViewMonth = new Date(whenCalendarViewMonth.getFullYear(), whenCalendarViewMonth.getMonth() - 1, 1);
    renderWhenCalendar();
  });
  configWhenCalendarNextBtn.addEventListener("click", () => {
    whenCalendarViewMonth = new Date(whenCalendarViewMonth.getFullYear(), whenCalendarViewMonth.getMonth() + 1, 1);
    renderWhenCalendar();
  });
  configWhenCalendarGrid.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const dayButton = target?.closest<HTMLButtonElement>("[data-when-date]");
    const isoDate = dayButton?.dataset.whenDate;
    if (!isoDate) {
      return;
    }
    applyWhenCalendarDateSelection(isoDate);
  });
  configWhenTextMd.addEventListener("input", () => {
    const exhibition = ensureExhibitionConfig();
    exhibition.whenText = configWhenTextMd.value || undefined;
  });
  configWhereAddress.addEventListener("input", () => {
    const exhibition = ensureExhibitionConfig();
    exhibition.location = exhibition.location ?? {};
    const value = configWhereAddress.value.trim();
    exhibition.indirizzoCompleto = value || undefined;
    exhibition.location.name = value || undefined;
  });
  configWhereSearchBtn.addEventListener("click", () => {
    void searchWhereAddressOnMap();
  });
  configWhereAddress.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void searchWhereAddressOnMap();
  });
  configWhereTextMd.addEventListener("input", () => {
    const exhibition = ensureExhibitionConfig();
    exhibition.doveText = configWhereTextMd.value || undefined;
  });
  configIntroMd.addEventListener("input", () => {
    const exhibition = ensureExhibitionConfig();
    exhibition.introductionMd = configIntroMd.value || undefined;
  });
  const applyRenderingColorsFromInputs = () => {
    const rendering = ensureRenderingConfig();
    rendering.floorColor = normalizeColorInputValue(configMapFloorColor.value, "#c7c7c7");
    rendering.wallColor = normalizeColorInputValue(configMapWallColor.value, "#ffffff");
    configMapFloorColor.value = rendering.floorColor;
    configMapWallColor.value = rendering.wallColor;
    rebuildSceneFromConfig();
    if (isConfigTabActive("gallery-map")) {
      renderGalleryMapEditor();
    }
  };
  let renderingColorRafId: number | null = null;
  const scheduleRenderingColorsFromInputs = () => {
    if (renderingColorRafId != null) {
      return;
    }
    renderingColorRafId = window.requestAnimationFrame(() => {
      renderingColorRafId = null;
      applyRenderingColorsFromInputs();
    });
  };
  configMapFloorColor.addEventListener("input", scheduleRenderingColorsFromInputs);
  configMapWallColor.addEventListener("input", scheduleRenderingColorsFromInputs);
  configMapFloorColor.addEventListener("change", applyRenderingColorsFromInputs);
  configMapWallColor.addEventListener("change", applyRenderingColorsFromInputs);
  configMapWallHeightCm.addEventListener("change", () => applyGlobalWallParamsFromInputs("room"));
  configMapWallThicknessCm.addEventListener("change", () => applyGlobalWallParamsFromInputs("room"));
  configMapWallHeightCmWall.addEventListener("change", () => applyGlobalWallParamsFromInputs("wall"));
  configMapWallThicknessCmWall.addEventListener("change", () => applyGlobalWallParamsFromInputs("wall"));
  configMapOpeningType.addEventListener("change", applySelectedOpeningParamsFromInputs);
  configMapOpeningWidthCm.addEventListener("change", applySelectedOpeningParamsFromInputs);
  configMapOpeningBaseCm.addEventListener("change", applySelectedOpeningParamsFromInputs);
  configMapOpeningHeightCm.addEventListener("change", applySelectedOpeningParamsFromInputs);
  configMapMinPaintingDistanceM.addEventListener("change", () => {
    const parsed = Number(configMapMinPaintingDistanceM.value);
    const next = clampNumber(Number.isFinite(parsed) ? parsed : visitor.minPaintingDistance, 0.2, 5);
    ensureVisitorConfig().minPaintingDistance = next;
    visitor.minPaintingDistance = next;
    configMapMinPaintingDistanceM.value = next.toFixed(2).replace(/\.00$/, "");
  });
  configCameraCaptureViewBtn.addEventListener("click", () => {
    persistCurrentCameraConfigToShow();
    syncConfigPanelFromConfig();
  });
  configCameraFov.addEventListener("change", () => {
    const parsed = Number(configCameraFov.value);
    if (!Number.isFinite(parsed)) {
      configCameraFov.value = String(Math.round(clampCameraFov(camera.fov)));
      return;
    }
    const nextFov = clampCameraFov(parsed);
    ensureRenderingConfig().cameraFov = nextFov;
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
    configCameraFov.value = String(Math.round(nextFov));
  });
  const syncCameraStartFromInputs = () => {
    const start = ensureVisitorStartConfig();
    const setIfFinite = (input: HTMLInputElement, key: keyof typeof start) => {
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        start[key] = value;
      } else {
        delete start[key];
      }
    };
    setIfFinite(configCameraStartX, "x");
    setIfFinite(configCameraStartY, "y");
    setIfFinite(configCameraStartZ, "z");
    setIfFinite(configCameraTargetX, "targetX");
    setIfFinite(configCameraTargetY, "targetY");
    setIfFinite(configCameraTargetZ, "targetZ");
    const startPoint = resolveConfigCameraStartPlanPoint();
    const targetPoint = resolveConfigCameraTargetPlanPoint(startPoint);
    syncConfigCameraOrientationFromPoints(startPoint, targetPoint);
    if (isConfigTabActive("gallery-map")) {
      renderGalleryMapEditor();
    }
  };
  configCameraStartX.addEventListener("change", syncCameraStartFromInputs);
  configCameraStartY.addEventListener("change", syncCameraStartFromInputs);
  configCameraStartZ.addEventListener("change", syncCameraStartFromInputs);
  configCameraTargetX.addEventListener("change", syncCameraStartFromInputs);
  configCameraTargetY.addEventListener("change", syncCameraStartFromInputs);
  configCameraTargetZ.addEventListener("change", syncCameraStartFromInputs);
  const onLocationInputChanged = () => {
    const lat = Number(configWhereLat.value);
    const lng = Number(configWhereLng.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      syncConfigPanelFromConfig();
      return;
    }
    applyExhibitionLocation(lat, lng);
  };
  configWhereLat.addEventListener("change", onLocationInputChanged);
  configWhereLng.addEventListener("change", onLocationInputChanged);
  const onGalleryLightParamsChanged = () => {
    applySelectedGalleryLightParams();
  };
  configMapLightTargetPainting.addEventListener("change", () => {
    if (getSelectedGalleryLight()) {
      syncSelectedGalleryLightControls();
    }
  });
  configMapLightHeightCm.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightIntensity.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightAngleDeg.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightDistanceM.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightPenumbra.addEventListener("change", onGalleryLightParamsChanged);
  const onPathTourParamsChanged = () => {
    const tour = ensureVisitorPathTourConfig();
    tour.walkSeconds = clampNumber(Number(configMapPathWalkSeconds.value) || 4, 0.2, 60);
    tour.stopOnPaintingSeconds = clampNumber(Number(configMapPathStopSeconds.value) || 0, 0, 60);
    tour.openPaintingCard = configMapPathOpenCard.checked;
    tour.autoTargetNearestPainting = configMapPathAutoTarget.checked;
    tour.loop = configMapPathLoop.checked;
    tour.cardSeconds = clampNumber(Number(configMapPathCardSeconds.value) || 0, 0, 60);
    syncPathTourInspectorControls();
  };
  configMapPathWalkSeconds.addEventListener("change", onPathTourParamsChanged);
  configMapPathStopSeconds.addEventListener("change", onPathTourParamsChanged);
  configMapPathOpenCard.addEventListener("change", onPathTourParamsChanged);
  configMapPathAutoTarget.addEventListener("change", onPathTourParamsChanged);
  configMapPathLoop.addEventListener("change", onPathTourParamsChanged);
  configMapPathCardSeconds.addEventListener("change", onPathTourParamsChanged);
  configMapPathAddPointBtn.addEventListener("click", () => {
    addPathPoint({ x: visitor.position.x, z: visitor.position.z });
  });
  configMapPathDeletePointBtn.addEventListener("click", () => {
    deleteSelectedPathPoint();
  });
  configMapPathClearBtn.addEventListener("click", () => {
    writePathTourKeyframes([]);
    setSelectedGalleryPathPoint(null);
    renderGalleryMapEditor();
  });
  setActiveGalleryMapSubTab("room");
  setActiveConfigTab("intro");
}

function attachInput() {
  attachGalleryInput(
    {
      canvas,
      minimapCanvas,
      configPanel,
      configSaveLocalBtn,
      configLoadLocalBtn,
      configExportJsonBtn,
      configImportJsonBtn,
      configImportCatalogJsonBtn,
      artCardClose,
      editModeToggle,
      artEditMoveLeft,
      artEditMoveRight,
      artEditMoveUp,
      artEditMoveDown,
      artEditDelete,
      artEditFields: [
        artEditId,
        artEditTitle,
        artEditDescription,
        artEditRoom,
        artEditRoomWidthCm,
        artEditRoomDepthCm,
        artEditRoomHeightCm,
        artEditWall,
        artEditOffsetCm,
        artEditWidthCm,
        artEditHeightCm,
        artEditFrameBorderCm,
        artEditFrameColor,
        artEditCenterYCm,
        artEditImageUrl,
      ],
      artEditSynopsisList,
      artEditSynopsisAdd,
      filmstrip,
      filmstripItems,
      filmstripAdd,
      artCardImage,
    },
    {
      onMouseDown: inputEventHandlers.onMouseDown,
      onMouseMove: inputEventHandlers.onMouseMove,
      onMouseUp: inputEventHandlers.onMouseUp,
      onClick: inputEventHandlers.onClick,
      onDoubleClick: inputEventHandlers.onDoubleClick,
      onWheel: inputEventHandlers.onWheel,
      onTouchStart: inputEventHandlers.onTouchStart,
      onTouchMove: inputEventHandlers.onTouchMove,
      onTouchEnd: inputEventHandlers.onTouchEnd,
      onTouchCancel: inputEventHandlers.onTouchCancel,
      onCanvasDragOver: inputEventHandlers.onCanvasDragOver,
      onCanvasDrop: inputEventHandlers.onCanvasDrop,
      onMinimapClick: inputEventHandlers.onMinimapClick,
      onConfigPanelDragOver: inputEventHandlers.onConfigPanelDragOver,
      onConfigPanelDragLeave: inputEventHandlers.onConfigPanelDragLeave,
      onConfigPanelDrop: inputEventHandlers.onConfigPanelDrop,
      onSaveLocalShow: inputEventHandlers.onSaveLocalShow,
      onLoadLocalShow: inputEventHandlers.onLoadLocalShow,
      onExportShowJson: inputEventHandlers.onExportShowJson,
      onImportShowJson: inputEventHandlers.onImportShowJson,
      onImportCatalogJson: inputEventHandlers.onImportCatalogJson,
      closePaintingCard,
      onToggleEditMode: () => setEditMode(!uiState.editMode),
      onEditMoveLeft: () => paintingEditorHandlers.onEditMove(-1, 0),
      onEditMoveRight: () => paintingEditorHandlers.onEditMove(1, 0),
      onEditMoveUp: () => paintingEditorHandlers.onEditMove(0, 1),
      onEditMoveDown: () => paintingEditorHandlers.onEditMove(0, -1),
      onEditDelete: paintingEditorHandlers.onEditDelete,
      onInlineEditChanged,
      onSynopsisAddField: paintingEditorHandlers.onSynopsisAddField,
      onSynopsisListClick: paintingEditorHandlers.onSynopsisListClick,
      onFilmstripClick,
      onFilmstripDoubleClick,
      onFilmstripDragStart,
      onFilmstripDragOver,
      onFilmstripDrop,
      onFilmstripAddClick,
      onCardImageDragOver: paintingEditorHandlers.onCardImageDragOver,
      onCardImageDragLeave: paintingEditorHandlers.onCardImageDragLeave,
      onCardImageDrop: paintingEditorHandlers.onCardImageDrop,
    }
  );
}
