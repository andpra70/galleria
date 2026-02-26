import * as THREE_NS from "three";
import { getFirstJsonFile } from "./files";
import type { AppContext } from "./appServices";
import type { PaintingRegistryEntry, PaintingSpot } from "./types";

type PaintingInteractionsApi = {
  startPaintingDrag: (clientX: number, clientY: number, pointerType: "mouse" | "touch") => boolean;
  updatePaintingDrag: (clientX: number, clientY: number) => void;
  stopPaintingDrag: () => void;
  handleDeleteHandleClick: (clientX: number, clientY: number) => boolean;
  handlePaintingClick: (clientX: number, clientY: number) => boolean;
  handlePaintingInstantMoveOnDoubleClick: (clientX: number, clientY: number) => boolean;
};

type InteractionActions = {
  clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
  moveVisitorTo: (target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) => void;
  setPointerRay: (clientX: number, clientY: number) => void;
  placeCatalogPaintingAtWall: (paintingId: string, clientX: number, clientY: number) => boolean;
  handleWallCreateClick: (clientX: number, clientY: number) => boolean;
  handleFloorMove: (clientX: number, clientY: number) => boolean;
};

type InputEventHandlersDeps = {
  app: AppContext;
  MIN_PITCH: number;
  MAX_PITCH: number;
  paintingInteractions: PaintingInteractionsApi;
  applyPaintingImage: (entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl?: boolean) => void;
  openPaintingCard: (paintingSpot: PaintingSpot) => void;
  showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
  closePaintingCard: () => void;
  loadShowConfig: (nextConfig: unknown) => void;
  renderFilmstrip: () => void;
  actions: InteractionActions;
};

export function createInputEventHandlers(deps: InputEventHandlersDeps) {
  const {
    app,
    MIN_PITCH,
    MAX_PITCH,
    paintingInteractions,
    applyPaintingImage,
    openPaintingCard,
    showEditPanelForEntry,
    closePaintingCard,
    loadShowConfig,
    renderFilmstrip,
    actions,
  } = deps;
  const { status } = app;
  const { mapState, visitor, movement, touchState, dragPainting, uiState } = status;
  const { THREE, raycaster } = app.runtime;
  const { minimapCanvas, helpPanel } = app.dom;
  const { paintingPickMeshes, paintingRegistry } = app.collections;
  const { minimapClientToWorld } = app.helpers;
  const { clampToWalkable, moveVisitorTo, setPointerRay, placeCatalogPaintingAtWall, handleWallCreateClick, handleFloorMove } = actions;

  function clearMovementRoute() {
    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }
    if (paintingInteractions.startPaintingDrag(event.clientX, event.clientY, "mouse")) {
      movement.dragging = false;
      return;
    }
    movement.dragging = true;
    movement.movedWhileDrag = false;
    movement.mouseDownX = event.clientX;
    movement.mouseDownY = event.clientY;
    movement.prevMouseX = event.clientX;
    movement.prevMouseY = event.clientY;
  }

  function onMouseMove(event: MouseEvent) {
    if (dragPainting.active && dragPainting.pointerType === "mouse") {
      paintingInteractions.updatePaintingDrag(event.clientX, event.clientY);
      movement.movedWhileDrag = true;
      return;
    }
    if (!movement.dragging) {
      return;
    }

    const dx = event.clientX - movement.prevMouseX;
    const dy = event.clientY - movement.prevMouseY;
    const ddx = event.clientX - movement.mouseDownX;
    const ddy = event.clientY - movement.mouseDownY;
    if (ddx * ddx + ddy * ddy > 25) {
      movement.movedWhileDrag = true;
    }
    movement.prevMouseX = event.clientX;
    movement.prevMouseY = event.clientY;

    const lookSpeed = 0.0035;
    movement.yaw -= dx * lookSpeed;
    movement.pitch -= dy * lookSpeed;
    movement.pitch = THREE.MathUtils.clamp(movement.pitch, MIN_PITCH, MAX_PITCH);
    movement.focusTarget = null;
  }

  function onMouseUp(event: MouseEvent) {
    if (event.button === 0) {
      if (dragPainting.active && dragPainting.pointerType === "mouse") {
        paintingInteractions.stopPaintingDrag();
        return;
      }
      movement.dragging = false;
    }
  }

  function onClick(event: MouseEvent) {
    if (status.refs.getSuppressNextPrimaryClick()) {
      status.refs.setSuppressNextPrimaryClick(false);
      return;
    }
    if (movement.movedWhileDrag) {
      return;
    }
    if (paintingInteractions.handleDeleteHandleClick(event.clientX, event.clientY)) {
      return;
    }
    if (paintingInteractions.handlePaintingClick(event.clientX, event.clientY)) {
      return;
    }
  }

  function onDoubleClick(event: MouseEvent) {
    if (dragPainting.active) {
      return;
    }
    if (paintingInteractions.handlePaintingInstantMoveOnDoubleClick(event.clientX, event.clientY)) {
      return;
    }
    if (handleWallCreateClick(event.clientX, event.clientY)) {
      return;
    }
    handleFloorMove(event.clientX, event.clientY);
  }

  function onWheel(event: WheelEvent) {
    if (dragPainting.active) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const forward = new THREE.Vector3(Math.sin(movement.yaw), 0, Math.cos(movement.yaw)).normalize();
    const amount = THREE.MathUtils.clamp(-event.deltaY * 0.004, -0.85, 0.85);
    const next = visitor.position.clone().add(forward.multiplyScalar(amount));
    const safe = clampToWalkable(next);
    if (safe) {
      visitor.position.copy(safe);
      clearMovementRoute();
    }
  }

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      return;
    }
    event.preventDefault();
    const touch = event.touches[0];
    if (paintingInteractions.startPaintingDrag(touch.clientX, touch.clientY, "touch")) {
      touchState.active = false;
      return;
    }
    touchState.active = true;
    touchState.moved = false;
    touchState.startX = touch.clientX;
    touchState.startY = touch.clientY;
    touchState.prevX = touch.clientX;
    touchState.prevY = touch.clientY;
  }

  function onTouchMove(event: TouchEvent) {
    if (dragPainting.active && dragPainting.pointerType === "touch") {
      event.preventDefault();
      const touch = event.touches[0];
      if (touch) {
        paintingInteractions.updatePaintingDrag(touch.clientX, touch.clientY);
        touchState.moved = true;
      }
      return;
    }
    if (!touchState.active || event.touches.length !== 1) {
      return;
    }
    event.preventDefault();
    const touch = event.touches[0];
    const dx = touch.clientX - touchState.prevX;
    const dy = touch.clientY - touchState.prevY;
    const ddx = touch.clientX - touchState.startX;
    const ddy = touch.clientY - touchState.startY;
    if (ddx * ddx + ddy * ddy > 36) {
      touchState.moved = true;
    }
    touchState.prevX = touch.clientX;
    touchState.prevY = touch.clientY;

    const lookSpeed = 0.0035;
    movement.yaw -= dx * lookSpeed;
    movement.pitch -= dy * lookSpeed;
    movement.pitch = THREE.MathUtils.clamp(movement.pitch, MIN_PITCH, MAX_PITCH);
    movement.focusTarget = null;
  }

  function onTouchEnd(event: TouchEvent) {
    if (dragPainting.active && dragPainting.pointerType === "touch") {
      event.preventDefault();
      paintingInteractions.stopPaintingDrag();
      touchState.active = false;
      return;
    }
    if (!touchState.active) {
      return;
    }
    event.preventDefault();
    const changed = event.changedTouches[0];
    const wasTap = !touchState.moved;
    touchState.active = false;

    if (!wasTap || !changed) {
      return;
    }

    if (paintingInteractions.handleDeleteHandleClick(changed.clientX, changed.clientY)) {
      return;
    }
    if (paintingInteractions.handlePaintingClick(changed.clientX, changed.clientY)) {
      return;
    }
    handleFloorMove(changed.clientX, changed.clientY);
  }

  function onTouchCancel() {
    if (dragPainting.active && dragPainting.pointerType === "touch") {
      paintingInteractions.stopPaintingDrag();
    }
    touchState.active = false;
  }

  function onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    if (!uiState.editMode) {
      return;
    }
    const draggedPaintingId = event.dataTransfer?.getData("application/x-gallery-painting-id");
    if (draggedPaintingId) {
      if (placeCatalogPaintingAtWall(draggedPaintingId, event.clientX, event.clientY)) {
        renderFilmstrip();
      }
      return;
    }
    const file = app.helpers.getFirstImageFile(event.dataTransfer);
    if (!file) {
      return;
    }

    setPointerRay(event.clientX, event.clientY);
    const paintingHits = raycaster.intersectObjects(paintingPickMeshes, false);
    if (!paintingHits.length) {
      return;
    }

    const hitSpot = paintingHits[0].object.userData.paintingSpot as PaintingSpot | undefined;
    if (!hitSpot?.id) {
      return;
    }
    const entry = paintingRegistry.get(hitSpot.id);
    if (!entry) {
      return;
    }

    clearMovementRoute();
    movement.focusTarget = hitSpot.center.clone();

    const objectUrl = URL.createObjectURL(file);
    applyPaintingImage(entry, objectUrl, true);
    openPaintingCard(entry.paintingSpot);
    showEditPanelForEntry(entry);
  }

  function onHelpPanelDragOver(event: DragEvent) {
    const jsonFile = getFirstJsonFile(event.dataTransfer);
    if (!jsonFile) {
      return;
    }
    event.preventDefault();
    helpPanel.classList.add("drop-target");
  }

  function onHelpPanelDragLeave(event: DragEvent) {
    event.preventDefault();
    helpPanel.classList.remove("drop-target");
  }

  async function onHelpPanelDrop(event: DragEvent) {
    const jsonFile = getFirstJsonFile(event.dataTransfer);
    event.preventDefault();
    helpPanel.classList.remove("drop-target");
    if (!jsonFile) {
      return;
    }

    try {
      const raw = await jsonFile.text();
      const loaded = JSON.parse(raw);
      loadShowConfig(loaded);
    } catch (error) {
      console.error("Errore caricamento mostra.json:", error);
      window.alert("File mostra.json non valido.");
    }
  }

  function onSaveShowJson() {
    const serialized = JSON.stringify(status.refs.getConfig(), null, 2);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mostra.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onMinimapClick(event: MouseEvent) {
    if (dragPainting.active) {
      return;
    }
    const pos = minimapClientToWorld(event.clientX, event.clientY, minimapCanvas, mapState);
    if (!pos) {
      return;
    }
    const target = new THREE.Vector3(pos.x, visitor.eyeHeight, pos.z);
    const clamped = clampToWalkable(target);
    if (!clamped) {
      return;
    }
    closePaintingCard();
    moveVisitorTo(clamped, null);
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onDoubleClick,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onCanvasDragOver,
    onCanvasDrop,
    onHelpPanelDragOver,
    onHelpPanelDragLeave,
    onHelpPanelDrop,
    onSaveShowJson,
    onMinimapClick,
  };
}
