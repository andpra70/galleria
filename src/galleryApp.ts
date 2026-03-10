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
const configMapDeleteRoomBtn = mustEl<HTMLButtonElement>("config-map-delete-room");
const configMapWallHeightCm = mustEl<HTMLInputElement>("config-map-wall-height-cm");
const configMapWallThicknessCm = mustEl<HTMLInputElement>("config-map-wall-thickness-cm");
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
const configGalleryMapEditor = mustEl<SVGSVGElement>("config-gallery-map-editor");
const configGalleryMapSubTabButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#config-gallery-map-tabs .config-subtab")
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

type GalleryMapTool = "room" | "wall" | "opening" | "delete-opening" | "delete-wall" | "light" | "delete-light";
type GalleryMapDragAction = "none" | "createRoom" | "createWall" | "moveRoom" | "resizeRoom" | "moveLight";
type PlanPoint = { x: number; z: number };
type PlanAssistMode = "room-create" | "room-move" | "wall-create" | "opening" | "generic";
type RoomCorner = "nw" | "ne" | "sw" | "se";
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
type GalleryMapLightMoveState = {
  lightId: string;
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
type PlanWallRef =
  | { kind: "room"; roomId: string; wall: WallSide; length: number; from: PlanPoint; to: PlanPoint }
  | { kind: "customWall"; wallId: string; wallIndex: number; length: number; from: PlanPoint; to: PlanPoint };

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
const galleryMapEditorState: {
  tool: GalleryMapTool;
  dragAction: GalleryMapDragAction;
  dragStart: PlanPoint | null;
  dragCurrent: PlanPoint | null;
  selectedRoomId: string | null;
  selectedLightId: string | null;
  movingRoom: GalleryMapRoomMoveState | null;
  resizingRoom: GalleryMapRoomResizeState | null;
  movingLight: GalleryMapLightMoveState | null;
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
  selectedLightId: null,
  movingRoom: null,
  resizingRoom: null,
  movingLight: null,
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

const { computeWallPlacement, applyPaintingPlacement, clampPaintingOffset, clampPaintingCenterY } = createPaintingPlacementHelpers({
  THREE,
  upAxis,
  getRoomsById: () => roomsById,
  getWallSpan,
});

const { buildRoom, buildCustomWalls } = createWorldBuilder({
  THREE,
  world,
  floorMeshes,
  wallMeshes,
  wallColliders,
  cmToM,
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
    computeWallPlacement,
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
  syncGalleryLightTargetOptions();
  const hasPainting = Array.from(configMapLightTargetPainting.options).some((option) => option.value === paintingId);
  if (!hasPainting) {
    return;
  }
  configMapLightTargetPainting.value = paintingId;
  if (galleryMapEditorState.selectedLightId) {
    applySelectedGalleryLightParams();
  }
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

async function init() {
  config = await fetch(resolveAppUrl("config/gallery.json")).then((r) => r.json());

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
  uiState.editMode = Boolean(enabled);
  configEditorShell.hidden = !uiState.editMode;
  editModeToggle.textContent = uiState.editMode ? "✎ Edit: ON" : "✎ Edit: OFF";
  editModeToggle.classList.toggle("edit-on", uiState.editMode);
  editModeToggle.setAttribute("aria-pressed", uiState.editMode ? "true" : "false");
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
  paintingRegistry.forEach((entry) => {
    if (entry.deleteHandle) {
      entry.deleteHandle.visible = uiState.editMode;
    }
    if (entry.moveHandle) {
      entry.moveHandle.visible = uiState.editMode;
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
  configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
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
  }
  configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
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

function getGalleryMapObserverSignature() {
  return `${visitor.position.x.toFixed(2)}|${visitor.position.z.toFixed(2)}|${movement.yaw.toFixed(3)}`;
}

function isConfigTabActive(tabId: string) {
  return configTabButtons.some((button) => button.dataset.configTab === tabId && button.classList.contains("active"));
}

function refreshGalleryMapObserverIfNeeded(force = false) {
  if (!isConfigTabActive("gallery-map")) {
    return;
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

function getGalleryLightTargetPlanPoint(light: GallerySpotLightConfig) {
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
  const targetPaintingId = configMapLightTargetPainting.value || undefined;
  const targetPoint = getPaintingPlanPointById(targetPaintingId);

  selectedLight.y = heightCm / 100;
  selectedLight.yCm = Math.round(heightCm);
  selectedLight.intensity = intensity;
  selectedLight.distance = distance;
  selectedLight.angleDeg = angleDeg;
  selectedLight.angle = THREE.MathUtils.degToRad(angleDeg);
  selectedLight.penumbra = penumbra;
  selectedLight.decay = Number.isFinite(Number(selectedLight.decay)) ? Math.max(0, Number(selectedLight.decay)) : 1.2;
  selectedLight.targetPaintingId = targetPaintingId;

  if (targetPoint) {
    selectedLight.targetX = targetPoint.x;
    selectedLight.targetZ = targetPoint.z;
    selectedLight.targetY = 1.65;
    selectedLight.targetXCm = Math.round(targetPoint.x * 100);
    selectedLight.targetZCm = Math.round(targetPoint.z * 100);
    selectedLight.targetYCm = 165;
  } else if (!targetPaintingId && !Number.isFinite(Number(selectedLight.targetX)) && !Number.isFinite(Number(selectedLight.targetZ))) {
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
  const targetPaintingId = configMapLightTargetPainting.value || undefined;
  const targetPoint = getPaintingPlanPointById(targetPaintingId);
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
  light.targetPaintingId = targetPaintingId;
  if (targetPoint) {
    light.targetX = targetPoint.x;
    light.targetZ = targetPoint.z;
    light.targetY = 1.65;
    light.targetXCm = Math.round(targetPoint.x * 100);
    light.targetZCm = Math.round(targetPoint.z * 100);
    light.targetYCm = 165;
  } else {
    delete light.targetX;
    delete light.targetY;
    delete light.targetZ;
    delete light.targetXCm;
    delete light.targetYCm;
    delete light.targetZCm;
  }
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
    include(Number(wall.x1 ?? 0), Number(wall.z1 ?? 0));
    include(Number(wall.x2 ?? 0), Number(wall.z2 ?? 0));
  });
  ensureGalleryLightsArray().forEach((light) => {
    const source = getGalleryLightPlanPoint(light);
    include(source.x, source.z);
    const target = getGalleryLightTargetPlanPoint(light);
    if (target) {
      include(target.x, target.z);
    }
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

function renderGalleryMapEditor() {
  const { width, height } = getGalleryMapEditorSize();
  const { toScreen, scale, bounds } = createPlanTransforms(width, height);
  configGalleryMapEditor.style.cursor = galleryMapEditorState.panning ? "grabbing" : "crosshair";

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
        <rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${widthPx.toFixed(1)}" height="${heightPx.toFixed(1)}" fill="${
          selected ? "rgba(251,146,60,0.18)" : "rgba(14,116,144,0.15)"
        }" stroke="${selected ? "#ea580c" : "rgba(15,23,42,0.88)"}" stroke-width="${selected ? 3 : 2}" />
        <text x="${(left + 6).toFixed(1)}" y="${(top + 14).toFixed(1)}" font-size="11" fill="#0f172a">${label}</text>
        ${handles}
      `;
    })
    .join("");

  const customWalls = ensureCustomWallsArray()
    .map((wall) => {
      const a = toScreen({ x: Number(wall.x1 ?? 0), z: Number(wall.z1 ?? 0) });
      const b = toScreen({ x: Number(wall.x2 ?? 0), z: Number(wall.z2 ?? 0) });
      const strokeWidth = Math.max(2, Number((Number(wall.thickness ?? 0.16) * scale).toFixed(2)));
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#7c2d12" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
    })
    .join("");

  const openingColor = (type?: string) => (type === "window" ? "#0284c7" : type === "door" ? "#16a34a" : "#b45309");
  const roomOpenings = config.rooms
    .flatMap((room) =>
      (room.openings ?? []).map((opening) => {
        const preview = getRoomEditorGeometry(room);
        const roomX = preview.x;
        const roomZ = preview.z;
        const roomWidth = preview.width;
        const roomDepth = preview.depth;
        const center = opening.center ?? 0;
        const widthM = opening.width ?? 1;
        let from: PlanPoint = { x: roomX, z: roomZ };
        let to: PlanPoint = { x: roomX, z: roomZ };
        if (opening.wall === "north") {
          from = { x: roomX + center - widthM * 0.5, z: roomZ };
          to = { x: roomX + center + widthM * 0.5, z: roomZ };
        } else if (opening.wall === "south") {
          from = { x: roomX + center - widthM * 0.5, z: roomZ + roomDepth };
          to = { x: roomX + center + widthM * 0.5, z: roomZ + roomDepth };
        } else if (opening.wall === "west") {
          from = { x: roomX, z: roomZ + center - widthM * 0.5 };
          to = { x: roomX, z: roomZ + center + widthM * 0.5 };
        } else {
          from = { x: roomX + roomWidth, z: roomZ + center - widthM * 0.5 };
          to = { x: roomX + roomWidth, z: roomZ + center + widthM * 0.5 };
        }
        const a = toScreen(from);
        const b = toScreen(to);
        return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${openingColor(opening.type)}" stroke-width="3" stroke-linecap="round" />`;
      })
    )
    .join("");

  const customWallOpenings = ensureCustomWallsArray()
    .flatMap((wall) => {
      const x1 = Number(wall.x1 ?? 0);
      const z1 = Number(wall.z1 ?? 0);
      const x2 = Number(wall.x2 ?? 0);
      const z2 = Number(wall.z2 ?? 0);
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      if (length < 0.05) {
        return [];
      }
      const ux = dx / length;
      const uz = dz / length;
      return (wall.openings ?? []).map((opening) => {
        const center = clampNumber(opening.center ?? 0, 0, length);
        const widthM = Math.max(0.2, opening.width ?? 1);
        const fromAlong = clampNumber(center - widthM * 0.5, 0, length);
        const toAlong = clampNumber(center + widthM * 0.5, 0, length);
        const from = { x: x1 + ux * fromAlong, z: z1 + uz * fromAlong };
        const to = { x: x1 + ux * toAlong, z: z1 + uz * toAlong };
        const a = toScreen(from);
        const b = toScreen(to);
        return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${openingColor(opening.type)}" stroke-width="4" stroke-linecap="round" />`;
      });
    })
    .join("");

  const paintingMarkersSvg = config.paintings
    .filter((painting) => painting.placed !== false)
    .map((painting) => {
      const point = getPaintingPlanPointById(painting.id);
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
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
        1
      )}" stroke="rgba(245,158,11,0.75)" stroke-width="1.8" stroke-dasharray="5 4" />`;
    })
    .join("");

  const galleryLightsSvg = ensureGalleryLightsArray()
    .map((light) => {
      const source = getGalleryLightPlanPoint(light);
      const selected = light.id === galleryMapEditorState.selectedLightId;
      const s = toScreen(source);
      return `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${selected ? 6.5 : 5}" fill="${
        selected ? "#f59e0b" : "#facc15"
      }" stroke="${selected ? "#7c2d12" : "#92400e"}" stroke-width="${selected ? 2 : 1.4}" />`;
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
    ${roomOpenings}
    ${customWallOpenings}
    ${paintingMarkersSvg}
    ${galleryLightLinks}
    ${galleryLightsSvg}
    ${observerSvg}
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
  ensureCustomWallsArray().push({
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

  const targetWall = nearest.wall;
  if (targetWall.kind === "room") {
    const room = config.rooms.find((candidate) => candidate.id === targetWall.roomId);
    if (!room) {
      return;
    }
    room.openings = Array.isArray(room.openings) ? room.openings : [];
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
    mirrorOpeningOnAdjacentRooms(room, targetWall.wall, { type, center, width, base, height });
  } else {
    const wall = ensureCustomWallsArray()[targetWall.wallIndex];
    if (!wall) {
      return;
    }
    wall.openings = Array.isArray(wall.openings) ? wall.openings : [];
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
  }
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
  rebuildSceneFromConfig();
  renderGalleryMapEditor();
}

function setActiveGalleryMapTool(tool: GalleryMapTool) {
  galleryMapEditorState.tool = tool;
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

function attachGalleryMapEditor() {
  configMapDeleteRoomBtn.addEventListener("click", () => {
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
        galleryMapEditorState.movingRoom = null;
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
    const markerTarget = (event.target as Element | null)?.closest<SVGElement>("[data-map-painting-id]");
    const markerPaintingId = markerTarget?.getAttribute("data-map-painting-id");
    if (markerPaintingId) {
      event.preventDefault();
      focusPaintingFromGalleryMap(markerPaintingId);
      return;
    }
    const rawPoint = getPlanPointFromEditorEvent(event);
    if (galleryMapEditorState.tool === "opening") {
      addOpeningAtPoint(applyPlanPointAssist(rawPoint, "opening"));
      return;
    }
    if (galleryMapEditorState.tool === "delete-opening") {
      removeOpeningAtPoint(applyPlanPointAssist(rawPoint, "opening"));
      return;
    }
    if (galleryMapEditorState.tool === "delete-wall") {
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
    if (galleryMapEditorState.tool === "delete-light") {
      deleteGalleryLightAtPoint(applyPlanPointAssist(rawPoint, "generic"));
      return;
    }

    if (galleryMapEditorState.tool === "room") {
      const clickedRoom = findRoomAtPlanPoint(rawPoint);
      if (clickedRoom) {
        setSelectedGalleryMapRoom(clickedRoom.id);
        galleryMapEditorState.dragAction = "moveRoom";
        galleryMapEditorState.movingLight = null;
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
      galleryMapEditorState.resizingRoom = null;
      const start = applyPlanPointAssist(rawPoint, "room-create");
      galleryMapEditorState.dragStart = start;
      galleryMapEditorState.dragCurrent = start;
    } else {
      galleryMapEditorState.dragAction = "createWall";
      galleryMapEditorState.movingLight = null;
      galleryMapEditorState.resizingRoom = null;
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
    if (galleryMapEditorState.dragAction === "createRoom") {
      const end = applyPlanPointAssist(rawEnd, "room-create", { anchor: start });
      applyRoomFromDrag(start, end);
    } else if (galleryMapEditorState.dragAction === "createWall") {
      const end = applyPlanPointAssist(rawEnd, "wall-create", { anchor: start });
      applyCustomWallFromDrag(start, end);
    } else if (galleryMapEditorState.dragAction === "moveRoom") {
      applyRoomMoveFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "resizeRoom") {
      applyRoomResizeFromDrag(rawEnd);
    } else if (galleryMapEditorState.dragAction === "moveLight") {
      applyGalleryLightMoveFromDrag(rawEnd);
    }
    if (configGalleryMapEditor.hasPointerCapture(event.pointerId)) {
      configGalleryMapEditor.releasePointerCapture(event.pointerId);
    }
    galleryMapEditorState.dragAction = "none";
    galleryMapEditorState.dragStart = null;
    galleryMapEditorState.dragCurrent = null;
    galleryMapEditorState.movingRoom = null;
    galleryMapEditorState.resizingRoom = null;
    galleryMapEditorState.movingLight = null;
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

  configGalleryMapEditor.addEventListener("pointerdown", onPointerDown);
  configGalleryMapEditor.addEventListener("pointermove", onPointerMove);
  configGalleryMapEditor.addEventListener("pointerup", onPointerUp);
  configGalleryMapEditor.addEventListener("wheel", onWheel, { passive: false });
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
    galleryMapEditorState.movingLight = null;
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
  configGalleryMapSubTabButtons.forEach((button) => {
    const selected = button.dataset.galleryMapSubtab === tabId;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  configGalleryMapSubTabPanels.forEach((panel) => {
    const selected = panel.dataset.galleryMapSubtabPanel === tabId;
    panel.classList.toggle("active", selected);
    panel.hidden = !selected;
  });
  if (tabId === "lights") {
    syncGalleryLightTargetOptions();
    syncSelectedGalleryLightControls();
    if (galleryMapEditorState.tool !== "light" && galleryMapEditorState.tool !== "delete-light") {
      setActiveGalleryMapTool("light");
    }
  }
  if (tabId === "editor") {
    if (galleryMapEditorState.tool === "light" || galleryMapEditorState.tool === "delete-light") {
      setActiveGalleryMapTool("room");
    }
    window.setTimeout(() => {
      renderGalleryMapEditor();
    }, 0);
  } else if (tabId === "lights") {
    window.setTimeout(() => {
      renderGalleryMapEditor();
    }, 0);
  }
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
  configMapLightTargetPainting.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightHeightCm.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightIntensity.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightAngleDeg.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightDistanceM.addEventListener("change", onGalleryLightParamsChanged);
  configMapLightPenumbra.addEventListener("change", onGalleryLightParamsChanged);
  setActiveGalleryMapSubTab("editor");
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
