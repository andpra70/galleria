import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { CustomWallConfig, PaintingRegistryEntry, PaintingSpot, WallSide } from "./types";

type PaintingInteractionsDeps = {
  app: AppContext;
  dom: {
    artEditOffsetCm: HTMLInputElement;
    artEditCenterYCm: HTMLInputElement;
  };
  numeric: {
    PAINTING_SNAP_M: number;
    snapToStep: (value: number, step: number) => number;
  };
  actions: {
    clampPaintingOffset: (entry: PaintingRegistryEntry, rawOffset: number) => number;
    clampPaintingCenterY: (entry: PaintingRegistryEntry, rawCenterY: number) => number;
    applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
    setPointerRay: (clientX: number, clientY: number) => void;
    deletePaintingEntry: (entry: PaintingRegistryEntry) => void;
    closePaintingCard: () => void;
    openPaintingCard: (spot: PaintingSpot) => void;
    isNearPainting: (spot: PaintingSpot) => boolean;
    computePaintingViewPosition: (spot: PaintingSpot) => THREE_NS.Vector3 | null;
    moveVisitorTo: (target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) => void;
    clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
    onPaintingPicked?: (paintingId: string) => void;
  };
};

export function createPaintingInteractions(deps: PaintingInteractionsDeps) {
  const {
    app,
    dom,
    numeric,
    actions,
  } = deps;
  const { artEditOffsetCm, artEditCenterYCm } = dom;
  const { PAINTING_SNAP_M, snapToStep } = numeric;
  const {
    clampPaintingOffset,
    clampPaintingCenterY,
    applyPaintingPlacement,
    setPointerRay,
    deletePaintingEntry,
    closePaintingCard,
    openPaintingCard,
    isNearPainting,
    computePaintingViewPosition,
    moveVisitorTo,
    clampToWalkable,
    onPaintingPicked,
  } = actions;
  const { THREE, raycaster } = app.runtime;
  const { uiState, cardState, movement, visitor, dragPainting } = app.status;
  const { paintingDeleteMeshes, paintingMoveMeshes, paintingPickMeshes, paintingRegistry, wallMeshes } = app.collections;
  const { artEditPanel } = app.dom;
  const { mToCm } = app.helpers;
  const getConfig = app.status.refs.getConfig;
  const getRoomsById = app.status.refs.getRoomsById;

  type RoomWallIntersection = THREE_NS.Intersection<THREE_NS.Object3D> & {
    object: THREE_NS.Object3D & { userData: { roomId?: string; wall?: WallSide } };
  };
  type CustomWallIntersection = THREE_NS.Intersection<THREE_NS.Object3D> & {
    object: THREE_NS.Object3D & { userData: { wallType?: string; customWallId?: string } };
  };
  type GalleryWallPlacementTarget =
    | { kind: "room"; room: import("./types").GalleryRoom; wall: WallSide; point: THREE_NS.Vector3 }
    | { kind: "custom"; customWall: CustomWallConfig; along: number; side: number; point: THREE_NS.Vector3 };

  function toWallSide(value: unknown): WallSide | null {
    if (value === "north" || value === "south" || value === "west" || value === "east") {
      return value;
    }
    return null;
  }

  function getFirstRoomWallHit(intersections: THREE_NS.Intersection<THREE_NS.Object3D>[]): RoomWallIntersection | null {
    const nearDistanceEps = 0.002;
    const nearestHits: RoomWallIntersection[] = [];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < intersections.length; i += 1) {
      const hit = intersections[i] as RoomWallIntersection;
      const roomId = hit.object?.userData?.roomId;
      const wall = toWallSide(hit.object?.userData?.wall);
      if (!roomId || !wall) {
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
      const roomHit = genericHit as RoomWallIntersection;
      const roomId = roomHit.object?.userData?.roomId;
      const roomWall = toWallSide(roomHit.object?.userData?.wall);
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

  function getPaintingIdFromIntersection(hit: THREE_NS.Intersection<THREE_NS.Object3D> | undefined) {
    if (!hit) {
      return null;
    }
    const explicitId = hit.object.userData.paintingId as string | undefined;
    if (explicitId) {
      return explicitId;
    }
    return (hit.object.userData.paintingSpot as PaintingSpot | undefined)?.id ?? null;
  }

  function isPaintingVisibleForDrag(entry: PaintingRegistryEntry, visitorRoomId: string) {
    const hasCustomWall = Boolean((entry.painting.customWallId ?? "").trim());
    const paintingRoomId = entry.painting.roomId ?? entry.room?.id ?? "";
    if (!hasCustomWall) {
      if (!paintingRoomId || paintingRoomId !== visitorRoomId) {
        return false;
      }
    }
    const toVisitor = visitor.position.clone().sub(entry.paintingSpot.center);
    const facingDepth = toVisitor.dot(entry.paintingSpot.normal);
    if (facingDepth <= 0.02) {
      return false;
    }
    return true;
  }

  function handleDeleteHandleClick(clientX: number, clientY: number) {
    if (!uiState.editMode) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const hit = raycaster.intersectObjects(paintingDeleteMeshes, false)[0];
    if (!hit) {
      return false;
    }
    const paintingId = hit.object.userData.paintingId as string | undefined;
    if (!paintingId) {
      return false;
    }
    const entry = paintingRegistry.get(paintingId);
    if (!entry) {
      return false;
    }
    deletePaintingEntry(entry);
    return true;
  }

  function startPaintingDrag(clientX: number, clientY: number, pointerType: string) {
    if (!uiState.editMode) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const visitorRoomId = getCurrentVisitorRoomId();
    if (!visitorRoomId) {
      return false;
    }
    const allHits = raycaster.intersectObjects([...paintingMoveMeshes, ...paintingPickMeshes, ...wallMeshes], false);
    const wallObjects = new Set<THREE_NS.Object3D>(wallMeshes as THREE_NS.Object3D[]);
    let paintingId: string | null = null;
    for (let i = 0; i < allHits.length; i += 1) {
      const candidate = allHits[i];
      const candidateId = getPaintingIdFromIntersection(candidate);
      if (!candidateId) {
        if (wallObjects.has(candidate.object)) {
          break;
        }
        continue;
      }
      const candidateEntry = paintingRegistry.get(candidateId);
      if (!candidateEntry) {
        continue;
      }
      if (!isPaintingVisibleForDrag(candidateEntry, visitorRoomId)) {
        continue;
      }
      paintingId = candidateId;
      break;
    }
    if (!paintingId) {
      return false;
    }
    const entry = paintingRegistry.get(paintingId);
    if (!entry) {
      return false;
    }

    onPaintingPicked?.(paintingId);
    dragPainting.active = true;
    dragPainting.pointerType = pointerType;
    dragPainting.paintingId = paintingId;
    dragPainting.plane.setFromNormalAndCoplanarPoint(entry.paintingSpot.normal.clone(), entry.paintingSpot.center.clone());
    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = null;
    return true;
  }

  function stopPaintingDrag() {
    dragPainting.active = false;
    dragPainting.pointerType = null;
    dragPainting.paintingId = null;
    app.status.refs.setSuppressNextPrimaryClick(true);
  }

  function updatePaintingDrag(clientX: number, clientY: number) {
    if (!dragPainting.active) {
      return;
    }
    if (!dragPainting.paintingId) {
      stopPaintingDrag();
      return;
    }
    const entry = paintingRegistry.get(dragPainting.paintingId);
    if (!entry) {
      stopPaintingDrag();
      return;
    }

    setPointerRay(clientX, clientY);
    const roomsById = getRoomsById();
    const wallHit = getFirstGalleryWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (wallHit) {
      if (wallHit.kind === "room") {
        const nextRoom = wallHit.room;
        const nextWall = wallHit.wall;
        entry.room = nextRoom;
        entry.painting.roomId = nextRoom.id;
        entry.painting.wall = nextWall;
        entry.painting.customWallId = undefined;
        entry.painting.customWallOffset = undefined;
        entry.painting.customWallOffsetCm = undefined;
        entry.painting.customWallSide = undefined;
        const rawOffset = nextWall === "north" || nextWall === "south" ? wallHit.point.x - nextRoom.x : wallHit.point.z - nextRoom.z;
        entry.painting.offset = clampPaintingOffset(entry, snapToStep(rawOffset, PAINTING_SNAP_M));
        entry.painting.centerY = clampPaintingCenterY(entry, snapToStep(wallHit.point.y, PAINTING_SNAP_M));
      } else {
        const customWall = wallHit.customWall;
        entry.room = undefined;
        entry.painting.roomId = "";
        entry.painting.customWallId = customWall.id ?? "";
        entry.painting.customWallOffset = wallHit.along;
        entry.painting.customWallOffsetCm = Math.round(wallHit.along * 100);
        entry.painting.customWallSide = wallHit.side;
        entry.painting.offset = clampPaintingOffset(entry, snapToStep(wallHit.along, PAINTING_SNAP_M));
        entry.painting.centerY = clampPaintingCenterY(entry, snapToStep(wallHit.point.y, PAINTING_SNAP_M));
      }
    } else {
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(dragPainting.plane, point)) {
        return;
      }
      if ((entry.painting.customWallId ?? "").trim()) {
        return;
      }
      const room = entry.room ?? roomsById.get(entry.painting.roomId ?? "");
      if (!room) {
        return;
      }
      const wall = (entry.painting.wall ?? "north") as WallSide;
      const rawOffset = wall === "north" || wall === "south" ? point.x - room.x : point.z - room.z;
      entry.painting.offset = clampPaintingOffset(entry, snapToStep(rawOffset, PAINTING_SNAP_M));
      entry.painting.centerY = clampPaintingCenterY(entry, snapToStep(point.y, PAINTING_SNAP_M));
    }

    applyPaintingPlacement(entry);
    dragPainting.plane.setFromNormalAndCoplanarPoint(entry.paintingSpot.normal.clone(), entry.paintingSpot.center.clone());

    if (cardState.paintingId === entry.painting.id && !artEditPanel.hidden) {
      artEditOffsetCm.value = String(Math.round(mToCm(entry.painting.offset)));
      artEditCenterYCm.value = String(Math.round(mToCm(entry.painting.centerY)));
    }
  }

  function handlePaintingClick(clientX: number, clientY: number) {
    setPointerRay(clientX, clientY);
    const paintingHits = raycaster.intersectObjects(paintingPickMeshes, false);
    if (!paintingHits.length) {
      closePaintingCard();
      return false;
    }

    const hit = paintingHits[0].object.userData.paintingSpot as PaintingSpot | undefined;
    if (!hit) {
      return false;
    }
    onPaintingPicked?.(hit.id);
    closePaintingCard();
    let viewPos: THREE_NS.Vector3 | null = null;
    for (let extra = 0; extra <= 1.2; extra += 0.1) {
      const tryPos = hit.center
        .clone()
        .add(hit.normal.clone().multiplyScalar(visitor.minPaintingDistance + extra))
        .setY(visitor.eyeHeight);
      const clamped = clampToWalkable(tryPos);
      if (clamped) {
        viewPos = clamped;
        break;
      }
    }
    if (!viewPos && isNearPainting(hit)) {
      movement.route = [];
      movement.destination = null;
      movement.finalDestination = null;
      movement.focusTarget = hit.center.clone();
      return true;
    }
    if (!viewPos) {
      viewPos = computePaintingViewPosition(hit);
    }
    if (!viewPos) {
      return false;
    }
    moveVisitorTo(viewPos, hit.center.clone());
    return true;
  }

  function handlePaintingInstantMoveOnDoubleClick(clientX: number, clientY: number) {
    setPointerRay(clientX, clientY);
    const paintingHit = raycaster.intersectObjects(paintingPickMeshes, false)[0];
    if (!paintingHit) {
      return false;
    }

    const hit = paintingHit.object.userData.paintingSpot as PaintingSpot | undefined;
    if (!hit) {
      return false;
    }

    onPaintingPicked?.(hit.id);
    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = hit.center.clone();
    if (!isNearPainting(hit)) {
      const viewPos = computePaintingViewPosition(hit);
      if (viewPos) {
        moveVisitorTo(viewPos, hit.center.clone());
      }
    }
    openPaintingCard(hit);
    return true;
  }

  return {
    handleDeleteHandleClick,
    startPaintingDrag,
    updatePaintingDrag,
    stopPaintingDrag,
    handlePaintingClick,
    handlePaintingInstantMoveOnDoubleClick,
  };
}
