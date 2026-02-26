import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { GalleryRoom, PaintingRegistryEntry, PaintingSpot } from "./types";

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
    showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
    isNearPainting: (spot: PaintingSpot) => boolean;
    computePaintingViewPosition: (spot: PaintingSpot) => THREE_NS.Vector3 | null;
    moveVisitorTo: (target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) => void;
    clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
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
    showEditPanelForEntry,
    isNearPainting,
    computePaintingViewPosition,
    moveVisitorTo,
    clampToWalkable,
  } = actions;
  const { THREE, raycaster } = app.runtime;
  const { uiState, cardState, movement, visitor, dragPainting } = app.status;
  const { paintingDeleteMeshes, paintingMoveMeshes, paintingPickMeshes, paintingRegistry } = app.collections;
  const { artEditPanel } = app.dom;
  const { mToCm } = app.helpers;
  const getRoomsById = app.status.refs.getRoomsById;

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
    const hit = raycaster.intersectObjects(paintingMoveMeshes, false)[0];
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
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dragPainting.plane, point)) {
      return;
    }

    const roomsById = getRoomsById();
    const room = entry.room ?? roomsById.get(entry.painting.roomId ?? "");
    if (!room) {
      return;
    }

    const rawOffset = entry.painting.wall === "north" || entry.painting.wall === "south" ? point.x - room.x : point.z - room.z;
    entry.painting.offset = clampPaintingOffset(entry, snapToStep(rawOffset, PAINTING_SNAP_M));
    entry.painting.centerY = clampPaintingCenterY(entry, snapToStep(point.y, PAINTING_SNAP_M));
    applyPaintingPlacement(entry);

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
    const entry = paintingRegistry.get(hit.id);
    if (uiState.editMode && entry && !entry.hasSourceImage) {
      movement.route = [];
      movement.destination = null;
      movement.finalDestination = null;
      movement.focusTarget = hit.center.clone();
      openPaintingCard(hit);
      showEditPanelForEntry(entry);
      return true;
    }

    if (isNearPainting(hit)) {
      movement.route = [];
      movement.destination = null;
      movement.finalDestination = null;
      movement.focusTarget = hit.center.clone();
      openPaintingCard(hit);
      if (uiState.editMode && entry) {
        showEditPanelForEntry(entry);
      }
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
    if (!uiState.editMode) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const paintingHit = raycaster.intersectObjects(paintingPickMeshes, false)[0];
    if (!paintingHit) {
      return false;
    }

    const hit = paintingHit.object.userData.paintingSpot as PaintingSpot | undefined;
    if (!hit) {
      return false;
    }

    const viewPos = computePaintingViewPosition(hit);
    if (!viewPos) {
      return false;
    }
    const clamped = clampToWalkable(viewPos);
    if (!clamped) {
      return false;
    }

    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = hit.center.clone();
    visitor.position.copy(clamped);
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
