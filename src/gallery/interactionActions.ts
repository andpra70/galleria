import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import { createPaintingConfigModel } from "./paintingModels";
import type { CustomWallConfig, GalleryPainting, GalleryRoom, PaintingRegistryEntry, WallSide } from "./types";

type InteractionActionsDeps = {
  app: AppContext;
  canvas: HTMLCanvasElement;
  camera: THREE_NS.PerspectiveCamera;
  mouseNdc: THREE_NS.Vector2;
  PAINTING_SNAP_M: number;
  getWallSpan: (room: GalleryRoom, wall: WallSide) => number;
  snapToStep: (value: number, step: number) => number;
  buildPainting: (painting: GalleryPainting) => void;
  applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
  openPaintingCard: (spot: import("./types").PaintingSpot) => void;
  showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
  closePaintingCard: () => void;
  moveVisitorTo: (target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) => void;
  clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
};

type WallIntersection = THREE_NS.Intersection<THREE_NS.Object3D> & {
  object: THREE_NS.Object3D & { userData: { roomId?: string; wall?: WallSide } };
};
type CustomWallIntersection = THREE_NS.Intersection<THREE_NS.Object3D> & {
  object: THREE_NS.Object3D & { userData: { wallType?: string; customWallId?: string } };
};
type GalleryWallPlacementTarget =
  | { kind: "room"; room: GalleryRoom; wall: WallSide; point: THREE_NS.Vector3 }
  | { kind: "custom"; customWall: CustomWallConfig; along: number; side: number; point: THREE_NS.Vector3 };

export function createInteractionActions(deps: InteractionActionsDeps) {
  const {
    app,
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
    moveVisitorTo,
    clampToWalkable,
  } = deps;
  const { THREE, raycaster } = app.runtime;
  const { movement, visitor, uiState } = app.status;
  const { floorMeshes, wallMeshes, paintingRegistry } = app.collections;
  const { nextPaintingId, createPlaceholderPaintingImage } = app.helpers;
  const getConfig = app.status.refs.getConfig;
  const getRoomsById = app.status.refs.getRoomsById;
  const readWalkDebugFlag = () => {
    try {
      return (window as Window & { __walkDebug?: boolean }).__walkDebug === true || window.localStorage.getItem("walk_debug") === "1";
    } catch {
      return false;
    }
  };
  const walkDebug = (...args: unknown[]) => {
    if (readWalkDebugFlag()) {
      console.debug("[walk]", ...args);
    }
  };

  function setPointerRay(clientX: number, clientY: number) {
    const bounds = canvas.getBoundingClientRect();
    mouseNdc.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    mouseNdc.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, camera);
  }

  function getCurrentVisitorRoomId() {
    const rooms = getConfig().rooms;
    const x = visitor.position.x;
    const z = visitor.position.z;
    for (let i = rooms.length - 1; i >= 0; i -= 1) {
      const room = rooms[i];
      if (x >= room.x && x <= room.x + room.width && z >= room.z && z <= room.z + room.depth) {
        return room.id;
      }
    }
    return null;
  }

  function getFirstRoomWallHit(intersections: THREE_NS.Intersection<THREE_NS.Object3D>[]): WallIntersection | null {
    const nearDistanceEps = 0.002;
    const nearestHits: WallIntersection[] = [];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < intersections.length; i += 1) {
      const hit = intersections[i] as WallIntersection;
      if (!hit?.object?.userData?.roomId || !hit?.object?.userData?.wall) {
        continue;
      }
      if (!nearestHits.length) {
        nearestHits.push(hit);
        nearestDistance = hit.distance;
        continue;
      }
      if (hit.distance <= nearestDistance + nearDistanceEps) {
        nearestHits.push(hit);
        continue;
      }
      break;
    }
    if (!nearestHits.length) {
      return null;
    }
    const visitorRoomId = getCurrentVisitorRoomId();
    if (visitorRoomId) {
      for (let i = 0; i < nearestHits.length; i += 1) {
        const hit = nearestHits[i];
        if (hit.object.userData.roomId === visitorRoomId) {
          return hit;
        }
      }
    }
    return nearestHits[0];
  }

  function findCustomWallById(customWallId?: string) {
    const wallId = (customWallId ?? "").trim();
    if (!wallId) {
      return null;
    }
    const walls = getConfig().customWalls ?? [];
    return walls.find((wall) => (wall.id ?? "").trim() === wallId) ?? null;
  }

  function projectPointToCustomWall(wall: CustomWallConfig, point: THREE_NS.Vector3) {
    const x1 = Number(wall.x1 ?? 0);
    const z1 = Number(wall.z1 ?? 0);
    const x2 = Number(wall.x2 ?? 0);
    const z2 = Number(wall.z2 ?? 0);
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSq = dx * dx + dz * dz;
    if (lengthSq <= 0.000001) {
      return null;
    }
    const length = Math.sqrt(lengthSq);
    const ux = dx / length;
    const uz = dz / length;
    const tRaw = ((point.x - x1) * dx + (point.z - z1) * dz) / lengthSq;
    const t = THREE.MathUtils.clamp(tRaw, 0, 1);
    const px = x1 + dx * t;
    const pz = z1 + dz * t;
    const perpX = -uz;
    const perpZ = ux;
    const signed = (point.x - px) * perpX + (point.z - pz) * perpZ;
    return {
      along: t * length,
      side: signed >= 0 ? 1 : -1,
    };
  }

  function getFirstGalleryWallHit(intersections: THREE_NS.Intersection<THREE_NS.Object3D>[]): GalleryWallPlacementTarget | null {
    for (let i = 0; i < intersections.length; i += 1) {
      const genericHit = intersections[i];
      const roomHit = genericHit as WallIntersection;
      const roomId = roomHit.object?.userData?.roomId;
      const roomWall = roomHit.object?.userData?.wall;
      if (roomId && roomWall) {
        const room = getRoomsById().get(roomId);
        if (room) {
          return { kind: "room", room, wall: roomWall, point: roomHit.point };
        }
      }
      const customHit = genericHit as CustomWallIntersection;
      if (customHit.object?.userData?.wallType !== "customSegment") {
        continue;
      }
      const customWall = findCustomWallById(customHit.object.userData.customWallId);
      if (!customWall) {
        continue;
      }
      const projected = projectPointToCustomWall(customWall, customHit.point);
      if (!projected) {
        continue;
      }
      return { kind: "custom", customWall, along: projected.along, side: projected.side, point: customHit.point };
    }
    return null;
  }

  function createPaintingFromWallHit(room: GalleryRoom, wall: WallSide, hitPoint: THREE_NS.Vector3): GalleryPainting {
    const config = getConfig();
    const id = nextPaintingId(config.paintings, paintingRegistry);
    const span = getWallSpan(room, wall);
    const defaultCenter = snapToStep(THREE.MathUtils.clamp(hitPoint.y, 1.2, Math.max(1.3, room.height - 0.6)), PAINTING_SNAP_M);
    let offset = wall === "north" || wall === "south" ? hitPoint.x - room.x : hitPoint.z - room.z;
    offset = snapToStep(THREE.MathUtils.clamp(offset, 0.8, span - 0.8), PAINTING_SNAP_M);

    const painting = createPaintingConfigModel({
      id,
      roomId: room.id,
      wall,
      offset,
      centerY: defaultCenter,
      widthCm: 140,
      heightCm: 100,
      placed: true,
      image: createPlaceholderPaintingImage("Nuova Opera"),
    });
    config.paintings.push(painting);
    return painting;
  }

  function placeCatalogPaintingAtWall(
    paintingId: string,
    clientX: number,
    clientY: number,
    options?: { openCard?: boolean }
  ) {
    const openCard = options?.openCard ?? false;
    const config = getConfig();
    const roomsById = getRoomsById();
    const painting = config.paintings.find((p) => p.id === paintingId);
    if (!painting) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const wallHit = getFirstGalleryWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (!wallHit) {
      return false;
    }
    if (wallHit.kind === "room") {
      const room = wallHit.room;
      const wall = wallHit.wall;
      const span = getWallSpan(room, wall);
      let offset = wall === "north" || wall === "south" ? wallHit.point.x - room.x : wallHit.point.z - room.z;
      offset = snapToStep(THREE.MathUtils.clamp(offset, 0.8, span - 0.8), PAINTING_SNAP_M);
      const centerY = snapToStep(THREE.MathUtils.clamp(wallHit.point.y, 1.2, Math.max(1.3, room.height - 0.6)), PAINTING_SNAP_M);
      painting.roomId = room.id;
      painting.wall = wall;
      painting.offset = offset;
      painting.centerY = centerY;
      painting.customWallId = undefined;
      painting.customWallOffset = undefined;
      painting.customWallOffsetCm = undefined;
      painting.customWallSide = undefined;
      painting.placed = true;
    } else {
      const customWall = wallHit.customWall;
      const wallHeight = Math.max(0.2, Number(customWall.height ?? 3));
      const centerY = snapToStep(THREE.MathUtils.clamp(wallHit.point.y, 1.2, Math.max(1.3, wallHeight - 0.6)), PAINTING_SNAP_M);
      const customOffset = snapToStep(Math.max(0, wallHit.along), PAINTING_SNAP_M);
      painting.customWallId = customWall.id ?? "";
      painting.customWallOffset = customOffset;
      painting.customWallOffsetCm = Math.round(customOffset * 100);
      painting.customWallSide = wallHit.side;
      painting.roomId = "";
      painting.wall = "north";
      painting.offset = customOffset;
      painting.centerY = centerY;
      painting.placed = true;
    }

    const entry = paintingRegistry.get(painting.id);
    if (entry) {
      entry.room = painting.roomId ? roomsById.get(painting.roomId) : undefined;
      entry.painting.roomId = painting.roomId;
      entry.painting.wall = painting.wall;
      entry.painting.offset = painting.offset;
      entry.painting.centerY = painting.centerY;
      entry.painting.customWallId = painting.customWallId;
      entry.painting.customWallOffset = painting.customWallOffset;
      entry.painting.customWallOffsetCm = painting.customWallOffsetCm;
      entry.painting.customWallSide = painting.customWallSide;
      applyPaintingPlacement(entry);
      uiState.selectedPaintingId = painting.id;
      if (openCard) {
        openPaintingCard(entry.paintingSpot);
        showEditPanelForEntry(entry);
      } else {
        closePaintingCard();
      }
      return true;
    }

    buildPainting(painting);
    const built = paintingRegistry.get(painting.id);
    if (!built) {
      return false;
    }
    uiState.selectedPaintingId = painting.id;
    if (openCard) {
      openPaintingCard(built.paintingSpot);
      showEditPanelForEntry(built);
    } else {
      closePaintingCard();
    }
    return true;
  }

  function handleFloorMove(clientX: number, clientY: number) {
    closePaintingCard();
    setPointerRay(clientX, clientY);
    const intersections = raycaster.intersectObjects(floorMeshes, false);
    if (!intersections.length) {
      walkDebug("floor move: no floor intersection", { clientX, clientY });
      return false;
    }
    const target = intersections[0].point.clone();
    const clamped = clampToWalkable(target);
    if (!clamped) {
      walkDebug("floor move: target not walkable", {
        x: Number(target.x.toFixed(3)),
        z: Number(target.z.toFixed(3)),
      });
      return false;
    }
    walkDebug("floor move -> moveVisitorTo", {
      x: Number(clamped.x.toFixed(3)),
      z: Number(clamped.z.toFixed(3)),
    });
    moveVisitorTo(clamped, null);
    return true;
  }

  function handleWallCreateClick(clientX: number, clientY: number) {
    if (!uiState.editMode) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const wallHit = getFirstGalleryWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (!wallHit) {
      return false;
    }
    let painting: GalleryPainting;
    if (wallHit.kind === "room") {
      painting = createPaintingFromWallHit(wallHit.room, wallHit.wall, wallHit.point);
    } else {
      const config = getConfig();
      const id = nextPaintingId(config.paintings, paintingRegistry);
      const wallHeight = Math.max(0.2, Number(wallHit.customWall.height ?? 3));
      const centerY = snapToStep(THREE.MathUtils.clamp(wallHit.point.y, 1.2, Math.max(1.3, wallHeight - 0.6)), PAINTING_SNAP_M);
      const offset = snapToStep(Math.max(0, wallHit.along), PAINTING_SNAP_M);
      painting = createPaintingConfigModel({
        id,
        roomId: "",
        wall: "north",
        offset,
        centerY,
        customWallId: wallHit.customWall.id ?? "",
        customWallOffset: offset,
        customWallOffsetCm: Math.round(offset * 100),
        customWallSide: wallHit.side,
        widthCm: 140,
        heightCm: 100,
        placed: true,
        image: createPlaceholderPaintingImage("Nuova Opera"),
      });
      config.paintings.push(painting);
    }
    buildPainting(painting);
    const entry = paintingRegistry.get(painting.id);
    if (!entry) {
      return false;
    }

    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = entry.paintingSpot.center.clone();
    closePaintingCard();
    return true;
  }

  return {
    setPointerRay,
    getFirstRoomWallHit,
    placeCatalogPaintingAtWall,
    handleFloorMove,
    handleWallCreateClick,
  };
}
