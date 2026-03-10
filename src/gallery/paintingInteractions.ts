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
    for (let i = 0; i < intersections.length; i += 1) {
      const hit = intersections[i] as RoomWallIntersection;
      const roomId = hit.object?.userData?.roomId;
      const wall = toWallSide(hit.object?.userData?.wall);
      if (roomId && wall) {
        return hit;
      }
    }
    return null;
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
    const moveHandleHit = raycaster.intersectObjects(paintingMoveMeshes, false)[0];
    const paintingPickHit = moveHandleHit ? null : raycaster.intersectObjects(paintingPickMeshes, false)[0];
    const paintingId =
      (moveHandleHit?.object.userData.paintingId as string | undefined) ??
      (paintingPickHit?.object.userData.paintingId as string | undefined) ??
      ((paintingPickHit?.object.userData.paintingSpot as PaintingSpot | undefined)?.id ?? undefined);
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
