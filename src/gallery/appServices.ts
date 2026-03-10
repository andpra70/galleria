import * as THREE_NS from "three";
import type { AppStatus, MapState } from './appStatus';
import type { CreateFloorMaterialArgs } from './visualAssets';
import type {
  CustomWallConfig,
  FloorMesh,
  GalleryPainting,
  GalleryRoom,
  GalleryWallMesh,
  PaintingCanvasMesh,
  PaintingFrameMesh,
  PaintingHandleMesh,
  PaintingRegistryEntry,
  PaintingSpot,
} from './types';

type MinimalShowConfigShape = { rooms: unknown[]; paintings: unknown[] };
type WallIdCandidate = { id?: string };

export interface AppContext {
  status: AppStatus;
  runtime: {
    THREE: typeof import("three");
    scene: THREE_NS.Scene;
    world: THREE_NS.Group;
    camera: THREE_NS.PerspectiveCamera;
    loader: THREE_NS.TextureLoader;
    renderer: THREE_NS.WebGLRenderer;
    raycaster: THREE_NS.Raycaster;
  };
  dom: {
    configPanel: HTMLElement;
    minimapCanvas: HTMLCanvasElement;
    filmstripItems: HTMLElement | null;
    artCard: HTMLElement;
    artEditPanel: HTMLElement;
    artEditRoom: HTMLSelectElement;
  };
  collections: {
    floorMeshes: FloorMesh[];
    paintingSpots: PaintingSpot[];
    paintingMeshes: PaintingCanvasMesh[];
    paintingPickMeshes: Array<PaintingFrameMesh | PaintingCanvasMesh>;
    paintingDeleteMeshes: PaintingHandleMesh[];
    paintingMoveMeshes: PaintingHandleMesh[];
    wallMeshes: GalleryWallMesh[];
    wallColliders: THREE_NS.Box3[];
    paintingRegistry: Map<string, PaintingRegistryEntry>;
  };
  helpers: {
    cmToM: (cm: number) => number;
    mToCm: (m: number) => number;
    calculateMapBounds: (rooms: GalleryRoom[], customWalls: CustomWallConfig[] | undefined, mapState: MapState) => void;
    minimapClientToWorld: (
      clientX: number,
      clientY: number,
      minimapCanvas: HTMLCanvasElement,
      mapState: MapState
    ) => { x: number; z: number } | null;
    createFloorMaterial: (args: CreateFloorMaterialArgs) => THREE_NS.MeshStandardMaterial;
    createDeleteHandleTexture: (THREE: typeof import("three")) => THREE_NS.Texture;
    createMoveHandleTexture: (THREE: typeof import("three")) => THREE_NS.Texture;
    createPlaceholderPaintingImage: (label: string) => string;
    nextPaintingId: (paintings: GalleryPainting[], paintingRegistry: Map<string, PaintingRegistryEntry>) => string;
    generateWallId: (walls: WallIdCandidate[]) => string;
    isValidShowConfig: (value: unknown) => value is MinimalShowConfigShape;
    getFirstImageFile: (dataTransfer?: DataTransfer | null) => File | null;
  };
}
