import * as THREE from "three";
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
const helpPanel = mustEl<HTMLDivElement>("panel");
const saveShowJsonBtn = mustEl<HTMLButtonElement>("save-show-json");
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
    helpPanel,
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

const { buildWorld, rebuildSceneFromConfig, loadShowConfig, createNewCatalogPainting } = createSceneConfigController({
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
  renderFilmstrip,
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
  setEditMode(false);
  onResize();

  window.addEventListener("resize", onResize);

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

function attachInput() {
  attachGalleryInput(
    {
      canvas,
      minimapCanvas,
      helpPanel,
      saveShowJsonBtn,
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
      onHelpPanelDragOver: inputEventHandlers.onHelpPanelDragOver,
      onHelpPanelDragLeave: inputEventHandlers.onHelpPanelDragLeave,
      onHelpPanelDrop: inputEventHandlers.onHelpPanelDrop,
      onSaveShowJson: inputEventHandlers.onSaveShowJson,
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
