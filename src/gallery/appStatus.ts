import * as THREE_NS from "three";
import type { GalleryRoom, ShowConfig } from './types';

export interface UiState {
  editMode: boolean;
  selectedPaintingId: string | null;
}

export interface EditorState {
  suspend: boolean;
}

export interface CardState {
  paintingId: string | null;
}

export interface MovementState {
  destination: THREE_NS.Vector3 | null;
  route: THREE_NS.Vector3[];
  finalDestination: THREE_NS.Vector3 | null;
  speedScale: number;
  yaw: number;
  pitch: number;
  focusTarget: THREE_NS.Vector3 | null;
  dragging: boolean;
  mouseDownX: number;
  mouseDownY: number;
  movedWhileDrag: boolean;
  prevMouseX: number;
  prevMouseY: number;
}

export interface TouchState {
  active: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  prevX: number;
  prevY: number;
}

export interface VisitorState {
  position: THREE_NS.Vector3;
  eyeHeight: number;
  moveSpeed: number;
  wallClearance: number;
  minPaintingDistance: number;
}

export interface DragPaintingState {
  active: boolean;
  pointerType: string | null;
  paintingId: string | null;
  plane: THREE_NS.Plane;
}

export interface MapState {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  pad: number;
}

export interface NavGridState {
  cellSize: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  walkable: boolean[];
}

export interface GallerySettingsState {
  defaultPaintingHeight: number;
}

export interface AppMutableRefs {
  getConfig(): ShowConfig;
  setConfig(nextConfig: ShowConfig): void;
  getRoomsById(): Map<string, GalleryRoom>;
  setRoomsById(nextRoomsById: Map<string, GalleryRoom>): void;
  getDeleteHandleTexture(): THREE_NS.Texture | null;
  setDeleteHandleTexture(nextTexture: THREE_NS.Texture | null): void;
  getMoveHandleTexture(): THREE_NS.Texture | null;
  setMoveHandleTexture(nextTexture: THREE_NS.Texture | null): void;
  getNoImagePlaceholder(): string | null;
  setNoImagePlaceholder(nextPlaceholder: string | null): void;
  getSceneHemisphereLight(): THREE_NS.HemisphereLight | null;
  setSceneHemisphereLight(light: THREE_NS.HemisphereLight | null): void;
  getSceneAmbientLight(): THREE_NS.AmbientLight | null;
  setSceneAmbientLight(light: THREE_NS.AmbientLight | null): void;
  getSuppressNextPrimaryClick(): boolean;
  setSuppressNextPrimaryClick(value: boolean): void;
}

export interface AppStatus {
  uiState: UiState;
  editorState: EditorState;
  cardState: CardState;
  movement: MovementState;
  touchState: TouchState;
  visitor: VisitorState;
  dragPainting: DragPaintingState;
  mapState: MapState;
  navGrid: NavGridState;
  gallerySettings: GallerySettingsState;
  refs: AppMutableRefs;
}
