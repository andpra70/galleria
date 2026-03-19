import * as THREE_NS from "three";

export type WallSide = 'north' | 'south' | 'east' | 'west';
export type WallOpeningType = "door" | "window" | "opening";

export interface PaintingLightOffset {
  x?: number;
  y?: number;
  z?: number;
  xCm?: number;
  yCm?: number;
  zCm?: number;
}

export interface PaintingLightConfig {
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
}

export interface GalleryPainting {
  id: string;
  title?: string;
  description?: string;
  synopsis?: Record<string, string>;
  image?: string;
  audioMp4?: string;
  roomId?: string;
  wall?: WallSide | string;
  offset?: number;
  customWallId?: string;
  customWallOffset?: number;
  customWallOffsetCm?: number;
  customWallSide?: number;
  centerY?: number;
  widthCm?: number;
  heightCm?: number;
  aspectRatio?: number;
  placed?: boolean;
  width?: number;
  height?: number;
  baseHeight?: number;
  scale?: number;
  frameBorderCm?: number;
  frameColor?: string;
  lightOffset?: PaintingLightOffset;
  light?: PaintingLightConfig;
}

export interface GalleryRoomOpening {
  id?: string;
  type?: WallOpeningType;
  wall?: WallSide | string;
  center?: number;
  centerCm?: number;
  width?: number;
  widthCm?: number;
  height?: number;
  heightCm?: number;
  base?: number;
  baseCm?: number;
}

export interface GalleryRoom {
  id: string;
  name?: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  widthCm?: number;
  depthCm?: number;
  heightCm?: number;
  openings?: GalleryRoomOpening[];
}

export interface CustomWallConfig {
  id?: string;
  x1?: number;
  z1?: number;
  x2?: number;
  z2?: number;
  x1Cm?: number;
  z1Cm?: number;
  x2Cm?: number;
  z2Cm?: number;
  height?: number;
  heightCm?: number;
  thickness?: number;
  thicknessCm?: number;
  openings?: GalleryRoomOpening[];
}

export interface GallerySpotLightConfig {
  id?: string;
  x?: number;
  y?: number;
  z?: number;
  xCm?: number;
  yCm?: number;
  zCm?: number;
  intensity?: number;
  distance?: number;
  angle?: number;
  angleDeg?: number;
  penumbra?: number;
  decay?: number;
  targetPaintingId?: string;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  targetXCm?: number;
  targetYCm?: number;
  targetZCm?: number;
}

export interface VisitorConfig {
  pathTour?: {
    keyframes?: Array<{
      x?: number;
      z?: number;
      xCm?: number;
      zCm?: number;
    }>;
    walkSeconds?: number;
    stopOnPaintingSeconds?: number;
    openPaintingCard?: boolean;
    cardSeconds?: number;
    autoTargetNearestPainting?: boolean;
    loop?: boolean;
  };
  eyeHeight?: number;
  moveSpeed?: number;
  wallClearance?: number;
  minPaintingDistance?: number;
  navCellSize?: number;
  initialSpeedScale?: number;
  start?: {
    x?: number;
    y?: number;
    z?: number;
    yaw?: number;
    pitch?: number;
    targetX?: number;
    targetY?: number;
    targetZ?: number;
  };
}

export interface RenderingConfig {
  wallColor?: string;
  ceilingColor?: string;
  floorColor?: string;
  wallThickness?: number;
  wallThicknessCm?: number;
  ambientLight?: number;
  diffuseAmbient?: number;
  cameraFov?: number;
  defaultPaintingHeight?: number;
  defaultPaintingFrameBorderCm?: number;
  defaultPaintingFrameColor?: string;
  showRuler?: boolean;
  quotaRulerCm?: number;
  rulerColor?: string;
}

export interface ExhibitionLocationConfig {
  name?: string;
  lat?: number;
  lng?: number;
  zoom?: number;
}

export interface ExhibitionConfig {
  startDate?: string;
  endDate?: string;
  whenText?: string;
  doveText?: string;
  indirizzoCompleto?: string;
  introductionMd?: string;
  videoUrl?: string;
  videoDescriptionMd?: string;
  location?: ExhibitionLocationConfig;
}

export interface FloorTextureConfig {
  repeatX?: number;
  repeatY?: number;
  rotation?: number;
  map?: string;
  alphaMap?: string;
  transparent?: boolean;
  alphaTest?: number;
  roughness?: number;
  metalness?: number;
}

export type RenderingConfigWithFloorTexture = RenderingConfig & {
  floorTexture?: FloorTextureConfig;
};

export interface ShowConfig {
  projectName?: string;
  rooms: GalleryRoom[];
  paintings: GalleryPainting[];
  customWalls?: CustomWallConfig[];
  galleryLights?: GallerySpotLightConfig[];
  visitor?: VisitorConfig;
  rendering?: RenderingConfig;
  exhibition?: ExhibitionConfig;
}

export interface FilmstripItemViewModel {
  id: string;
  title: string;
  image: string;
  isSelected: boolean;
  isPlaced: boolean;
}

export interface PaintingCardViewModel {
  id: string;
  title: string;
  description: string;
  synopsis: Record<string, string>;
  image: string;
  audioMp4?: string;
  center: THREE_NS.Vector3;
  normal: THREE_NS.Vector3;
  width: number;
  height: number;
}

export interface PaintingSpot {
  id: string;
  title?: string;
  description: string;
  synopsis: Record<string, string>;
  image: string;
  audioMp4?: string;
  center: THREE_NS.Vector3;
  normal: THREE_NS.Vector3;
  width: number;
  height: number;
}

export interface PaintingMeshUserData {
  paintingId?: string;
  paintingSpot?: PaintingSpot;
}

export interface WallMeshUserData {
  roomId?: string;
  wall?: WallSide;
  wallType?: "customSegment";
  customWallId?: string;
}

export type PaintingFrameMesh = THREE_NS.Mesh<THREE_NS.BoxGeometry, THREE_NS.MeshStandardMaterial> & {
  userData: PaintingMeshUserData;
};

export type PaintingCanvasMesh = THREE_NS.Mesh<THREE_NS.PlaneGeometry, THREE_NS.MeshStandardMaterial> & {
  userData: PaintingMeshUserData;
};

export type PaintingHandleMesh = THREE_NS.Mesh<THREE_NS.PlaneGeometry, THREE_NS.MeshBasicMaterial> & {
  userData: PaintingMeshUserData;
};

export type GalleryWallMesh = THREE_NS.Mesh<THREE_NS.BoxGeometry, THREE_NS.MeshStandardMaterial> & {
  userData: WallMeshUserData;
};

export type FloorMesh = THREE_NS.Mesh<THREE_NS.PlaneGeometry, THREE_NS.Material> & {
  userData: { roomId?: string };
};

export interface PaintingRegistryEntry {
  painting: GalleryPainting;
  room?: GalleryRoom;
  frame: PaintingFrameMesh;
  canvas: PaintingCanvasMesh;
  spot: THREE_NS.SpotLight;
  spotTarget: THREE_NS.Object3D;
  deleteHandle: PaintingHandleMesh;
  moveHandle: PaintingHandleMesh;
  paintingSpot: PaintingSpot;
  border: number;
  frameDepth: number;
  objectUrl: string | null;
  hasSourceImage: boolean;
}
