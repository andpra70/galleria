import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { PaintingRegistryEntry, PaintingSpot, WallSide } from "./types";

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
    const paintingRoomId = entry.painting.roomId ?? entry.room?.id ?? "";
    if (!paintingRoomId || paintingRoomId !== visitorRoomId) {
      return false;
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
    const wallHit = getFirstRoomWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (wallHit) {
      const nextRoom = roomsById.get(wallHit.object.userData.roomId ?? "");
      const nextWall = toWallSide(wallHit.object.userData.wall);
      if (nextRoom && nextWall) {
        entry.room = nextRoom;
        entry.painting.roomId = nextRoom.id;
        entry.painting.wall = nextWall;
        const rawOffset = nextWall === "north" || nextWall === "south" ? wallHit.point.x - nextRoom.x : wallHit.point.z - nextRoom.z;
        entry.painting.offset = clampPaintingOffset(entry, snapToStep(rawOffset, PAINTING_SNAP_M));
        entry.painting.centerY = clampPaintingCenterY(entry, snapToStep(wallHit.point.y, PAINTING_SNAP_M));
      }
    } else {
      const point = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(dragPainting.plane, point)) {
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

    if (isNearPainting(hit)) {
      movement.route = [];
      movement.destination = null;
      movement.finalDestination = null;
      movement.focusTarget = hit.center.clone();
      return true;
    }

    closePaintingCard();
    const viewPos = computePaintingViewPosition(hit);
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
