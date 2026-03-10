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
const saveShowJsonBtn = mustEl<HTMLButtonElement>("save-show-json");
const loadCatalogJsonBtn = mustEl<HTMLButtonElement>("load-catalog-json");
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
const configMapDeleteRoomBtn = mustEl<HTMLButtonElement>("config-map-delete-room");
const configMapWallHeightCm = mustEl<HTMLInputElement>("config-map-wall-height-cm");
const configMapWallThicknessCm = mustEl<HTMLInputElement>("config-map-wall-thickness-cm");
const configMapOpeningType = mustEl<HTMLSelectElement>("config-map-opening-type");
const configMapOpeningWidthCm = mustEl<HTMLInputElement>("config-map-opening-width-cm");
const configMapOpeningBaseCm = mustEl<HTMLInputElement>("config-map-opening-base-cm");
const configMapOpeningHeightCm = mustEl<HTMLInputElement>("config-map-opening-height-cm");
const configGalleryMapEditor = mustEl<SVGSVGElement>("config-gallery-map-editor");
const configIntroMd = mustEl<HTMLTextAreaElement>("config-intro-md");

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
const GALLERY_EDITOR_PADDING_M = 1;
const GALLERY_EDITOR_MIN_SPAN_M = 4;

type GalleryMapTool = "room" | "wall" | "opening";
type GalleryMapDragAction = "none" | "createRoom" | "createWall" | "moveRoom";
type PlanPoint = { x: number; z: number };
type GalleryMapRoomMoveState = {
  roomId: string;
  startPointer: PlanPoint;
  startX: number;
  startZ: number;
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
const galleryMapEditorState: {
  tool: GalleryMapTool;
  dragAction: GalleryMapDragAction;
  dragStart: PlanPoint | null;
  dragCurrent: PlanPoint | null;
  selectedRoomId: string | null;
  movingRoom: GalleryMapRoomMoveState | null;
  widthPx: number;
  heightPx: number;
} = {
  tool: "room",
  dragAction: "none",
  dragStart: null,
  dragCurrent: null,
  selectedRoomId: null,
  movingRoom: null,
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
  afterCameraUpdate: dragMeasureOverlay.update,
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

const { openPaintingCard, closePaintingCard, showEditPanelForEntry, showEditPanelForPainting } = createPaintingCardController({
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

const { renderFilmstrip, openCatalogPainting, onFilmstripAddClick, onFilmstripClick, onFilmstripDragStart, onFilmstripDragOver, onFilmstripDrop } =
  createFilmstripController({
    app: appContext,
    createNewCatalogPainting,
    openPaintingCard,
    showEditPanelForPainting,
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
    showEditPanelForEntry,
    isNearPainting: movementActions.isNearPainting,
    computePaintingViewPosition,
    moveVisitorTo: movementActions.moveVisitorTo,
    clampToWalkable: movementActions.clampToWalkable,
  },
});

const inputEventHandlers = createInputEventHandlers({
  app: appContext,
  MIN_PITCH,
  MAX_PITCH,
  paintingInteractions,
  applyPaintingImage,
  openPaintingCard,
  showEditPanelForEntry,
  closePaintingCard,
  loadShowConfig,
  importCatalogWorks,
  setEditMode,
  renderFilmstrip,
  syncConfigPanel: () => syncConfigPanelFromConfig(),
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
  visitor.position.set(start.x ?? 0, visitor.eyeHeight, start.z ?? 0);

  movement.yaw = start.yaw ?? 0;
  movement.pitch = 0;
}

function setEditMode(enabled: boolean) {
  uiState.editMode = Boolean(enabled);
  editModeToggle.textContent = uiState.editMode ? "Edit: ON" : "Edit: OFF";
  editModeToggle.classList.toggle("edit-on", uiState.editMode);
  editModeToggle.setAttribute("aria-pressed", uiState.editMode ? "true" : "false");
  filmstrip.hidden = !uiState.editMode;
  updateEditModeVisuals();
  if (uiState.editMode) {
    renderFilmstrip();
  }
  if (!uiState.editMode) {
    resetEditPanelDom({
      ...artEditDomElements,
    });
  } else if (!artCard.hidden && cardState.paintingId) {
    const entry = paintingRegistry.get(cardState.paintingId);
    if (entry) {
      showEditPanelForEntry(entry);
    } else {
      const painting = config.paintings.find((p) => p.id === cardState.paintingId);
      if (painting) {
        showEditPanelForPainting(painting);
      }
    }
  }
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

function snapPlanValue(value: number) {
  return snapToStep(value, GALLERY_GRID_SNAP_M);
}

function nextRoomId() {
  let index = 1;
  while (config.rooms.some((room) => room.id === `room_${index}`)) {
    index += 1;
  }
  return `room_${index}`;
}

function setSelectedGalleryMapRoom(roomId: string | null) {
  if (!roomId || !config.rooms.some((room) => room.id === roomId)) {
    galleryMapEditorState.selectedRoomId = null;
  } else {
    galleryMapEditorState.selectedRoomId = roomId;
  }
  configMapDeleteRoomBtn.disabled = !galleryMapEditorState.selectedRoomId;
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

function getMovingRoomPreview(room: GalleryRoom): { x: number; z: number } | null {
  const moving = galleryMapEditorState.movingRoom;
  const pointer = galleryMapEditorState.dragCurrent;
  if (!moving || !pointer || galleryMapEditorState.dragAction !== "moveRoom" || moving.roomId !== room.id) {
    return null;
  }
  const deltaX = pointer.x - moving.startPointer.x;
  const deltaZ = pointer.z - moving.startPointer.z;
  return {
    x: snapPlanValue(moving.startX + deltaX),
    z: snapPlanValue(moving.startZ + deltaZ),
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
    const moved = getMovingRoomPreview(room);
    const roomX = moved?.x ?? room.x;
    const roomZ = moved?.z ?? room.z;
    include(roomX, roomZ);
    include(roomX + room.width, roomZ + room.depth);
  });
  ensureCustomWallsArray().forEach((wall, wallIndex) => {
    include(Number(wall.x1 ?? 0), Number(wall.z1 ?? 0));
    include(Number(wall.x2 ?? 0), Number(wall.z2 ?? 0));
  });
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
  const bounds = getGalleryPlanBounds();
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const padPx = 12;
  const scale = Math.max(1, Math.min((width - padPx * 2) / spanX, (height - padPx * 2) / spanZ));

  const toScreen = (point: PlanPoint) => ({
    x: padPx + (point.x - bounds.minX) * scale,
    y: height - (padPx + (point.z - bounds.minZ) * scale),
  });
  const toPlan = (sx: number, sy: number): PlanPoint => ({
    x: bounds.minX + (sx - padPx) / scale,
    z: bounds.minZ + (height - sy - padPx) / scale,
  });
  return { toScreen, toPlan, bounds, scale };
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

function renderGalleryMapEditor() {
  const { width, height } = getGalleryMapEditorSize();
  const { toScreen, scale, bounds } = createPlanTransforms(width, height);

  const gridLines: string[] = [];
  const step = GALLERY_GRID_SNAP_M;
  const xStart = Math.floor(bounds.minX / step) * step;
  const xEnd = Math.ceil(bounds.maxX / step) * step;
  const zStart = Math.floor(bounds.minZ / step) * step;
  const zEnd = Math.ceil(bounds.maxZ / step) * step;
  for (let x = xStart; x <= xEnd + 0.0001; x += step) {
    const a = toScreen({ x, z: bounds.minZ });
    const b = toScreen({ x, z: bounds.maxZ });
    gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(100,116,139,0.2)" stroke-width="1" />`);
  }
  for (let z = zStart; z <= zEnd + 0.0001; z += step) {
    const a = toScreen({ x: bounds.minX, z });
    const b = toScreen({ x: bounds.maxX, z });
    gridLines.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(100,116,139,0.2)" stroke-width="1" />`);
  }

  const roomsSvg = config.rooms
    .map((room) => {
      const moved = getMovingRoomPreview(room);
      const roomX = moved?.x ?? room.x;
      const roomZ = moved?.z ?? room.z;
      const selected = room.id === galleryMapEditorState.selectedRoomId;
      const a = toScreen({ x: roomX, z: roomZ });
      const b = toScreen({ x: roomX + room.width, z: roomZ + room.depth });
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const widthPx = Math.abs(b.x - a.x);
      const heightPx = Math.abs(b.y - a.y);
      const label = room.name ?? room.id;
      return `
        <rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${widthPx.toFixed(1)}" height="${heightPx.toFixed(1)}" fill="${
          selected ? "rgba(251,146,60,0.18)" : "rgba(14,116,144,0.15)"
        }" stroke="${selected ? "#ea580c" : "rgba(15,23,42,0.88)"}" stroke-width="${selected ? 3 : 2}" />
        <text x="${(left + 6).toFixed(1)}" y="${(top + 14).toFixed(1)}" font-size="11" fill="#0f172a">${label}</text>
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
        const moved = getMovingRoomPreview(room);
        const roomX = moved?.x ?? room.x;
        const roomZ = moved?.z ?? room.z;
        const center = opening.center ?? 0;
        const widthM = opening.width ?? 1;
        let from: PlanPoint = { x: roomX, z: roomZ };
        let to: PlanPoint = { x: roomX, z: roomZ };
        if (opening.wall === "north") {
          from = { x: roomX + center - widthM * 0.5, z: roomZ };
          to = { x: roomX + center + widthM * 0.5, z: roomZ };
        } else if (opening.wall === "south") {
          from = { x: roomX + center - widthM * 0.5, z: roomZ + room.depth };
          to = { x: roomX + center + widthM * 0.5, z: roomZ + room.depth };
        } else if (opening.wall === "west") {
          from = { x: roomX, z: roomZ + center - widthM * 0.5 };
          to = { x: roomX, z: roomZ + center + widthM * 0.5 };
        } else {
          from = { x: roomX + room.width, z: roomZ + center - widthM * 0.5 };
          to = { x: roomX + room.width, z: roomZ + center + widthM * 0.5 };
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
    ${preview}
  `;
}

function getPlanPointFromEditorEvent(event: PointerEvent): PlanPoint {
  const { width, height } = getGalleryMapEditorSize();
  const { toPlan } = createPlanTransforms(width, height);
  const rect = configGalleryMapEditor.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const plan = toPlan(x, y);
  return { x: snapPlanValue(plan.x), z: snapPlanValue(plan.z) };
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
  const nextX = snapPlanValue(moving.startX + deltaX);
  const nextZ = snapPlanValue(moving.startZ + deltaZ);
  if (Math.abs(nextX - room.x) < 0.0001 && Math.abs(nextZ - room.z) < 0.0001) {
    return;
  }
  room.x = nextX;
  room.z = nextZ;
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

function setActiveGalleryMapTool(tool: GalleryMapTool) {
  galleryMapEditorState.tool = tool;
  configMapToolButtons.forEach((button) => {
    const active = button.dataset.mapTool === tool;
    button.classList.toggle("active", active);
  });
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

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    const point = getPlanPointFromEditorEvent(event);
    if (galleryMapEditorState.tool === "opening") {
      addOpeningAtPoint(point);
      return;
    }

    if (galleryMapEditorState.tool === "room") {
      const clickedRoom = findRoomAtPlanPoint(point);
      if (clickedRoom) {
        setSelectedGalleryMapRoom(clickedRoom.id);
        galleryMapEditorState.dragAction = "moveRoom";
        galleryMapEditorState.movingRoom = {
          roomId: clickedRoom.id,
          startPointer: point,
          startX: clickedRoom.x,
          startZ: clickedRoom.z,
        };
        galleryMapEditorState.dragStart = point;
        galleryMapEditorState.dragCurrent = point;
        configGalleryMapEditor.setPointerCapture(event.pointerId);
        renderGalleryMapEditor();
        return;
      }
      setSelectedGalleryMapRoom(null);
      galleryMapEditorState.dragAction = "createRoom";
    } else {
      galleryMapEditorState.dragAction = "createWall";
    }

    galleryMapEditorState.dragStart = point;
    galleryMapEditorState.dragCurrent = point;
    configGalleryMapEditor.setPointerCapture(event.pointerId);
    renderGalleryMapEditor();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!galleryMapEditorState.dragStart) {
      return;
    }
    galleryMapEditorState.dragCurrent = getPlanPointFromEditorEvent(event);
    renderGalleryMapEditor();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!galleryMapEditorState.dragStart || !galleryMapEditorState.dragCurrent) {
      return;
    }
    const start = galleryMapEditorState.dragStart;
    const end = getPlanPointFromEditorEvent(event);
    if (galleryMapEditorState.dragAction === "createRoom") {
      applyRoomFromDrag(start, end);
    } else if (galleryMapEditorState.dragAction === "createWall") {
      applyCustomWallFromDrag(start, end);
    } else if (galleryMapEditorState.dragAction === "moveRoom") {
      applyRoomMoveFromDrag(end);
    }
    galleryMapEditorState.dragAction = "none";
    galleryMapEditorState.dragStart = null;
    galleryMapEditorState.dragCurrent = null;
    galleryMapEditorState.movingRoom = null;
    renderGalleryMapEditor();
  };

  configGalleryMapEditor.addEventListener("pointerdown", onPointerDown);
  configGalleryMapEditor.addEventListener("pointermove", onPointerMove);
  configGalleryMapEditor.addEventListener("pointerup", onPointerUp);
  configGalleryMapEditor.addEventListener("pointercancel", () => {
    galleryMapEditorState.dragAction = "none";
    galleryMapEditorState.dragStart = null;
    galleryMapEditorState.dragCurrent = null;
    galleryMapEditorState.movingRoom = null;
    renderGalleryMapEditor();
  });
  setSelectedGalleryMapRoom(null);
  setActiveGalleryMapTool("room");
}

function ensureExhibitionConfig() {
  config.exhibition = config.exhibition ?? {};
  config.exhibition.location = config.exhibition.location ?? {};
  return config.exhibition;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  setSelectedGalleryMapRoom(null);
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
  setActiveConfigTab("intro");
}

function attachInput() {
  attachGalleryInput(
    {
      canvas,
      minimapCanvas,
      configPanel,
      saveShowJsonBtn,
      loadCatalogJsonBtn,
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
      onSaveShowJson: inputEventHandlers.onSaveShowJson,
      onLoadCatalogJson: inputEventHandlers.onLoadCatalogJson,
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
