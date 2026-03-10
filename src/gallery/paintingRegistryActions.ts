import type { AppContext } from "./appServices";
import type { PaintingRegistryEntry } from "./types";

type DeletePaintingEntryOptions = {
  closePaintingCard?: boolean;
  refreshFilmstrip?: boolean;
  deferResourceDisposal?: boolean;
};

type PaintingRegistryActionsDeps = {
  app: AppContext;
  uiActions: {
    closePaintingCard: () => void;
    renderFilmstrip: () => void;
  };
};

export function createPaintingRegistryActions({ app, uiActions }: PaintingRegistryActionsDeps) {
  const { world } = app.runtime;
  const { paintingMeshes, paintingPickMeshes, paintingDeleteMeshes, paintingMoveMeshes, paintingSpots, paintingRegistry } = app.collections;
  const { closePaintingCard, renderFilmstrip } = uiActions;

  function scheduleResourceDisposal(task: () => void) {
    const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(task, { timeout: 250 });
      return;
    }
    window.setTimeout(task, 0);
  }

  function deletePaintingEntry(entry: PaintingRegistryEntry, options: DeletePaintingEntryOptions = {}) {
    const {
      closePaintingCard: shouldClosePaintingCard = true,
      refreshFilmstrip: shouldRefreshFilmstrip = true,
      deferResourceDisposal = true,
    } = options;

    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
      entry.objectUrl = null;
    }

    world.remove(entry.frame, entry.canvas, entry.spot, entry.spotTarget, entry.deleteHandle, entry.moveHandle);

    const disposeResources = () => {
      entry.frame.geometry.dispose();
      entry.frame.material.dispose();
      entry.canvas.geometry.dispose();
      entry.canvas.material.map?.dispose();
      entry.canvas.material.dispose();
      entry.spot.dispose();
      entry.deleteHandle.geometry.dispose();
      entry.deleteHandle.material.dispose();
      entry.moveHandle.geometry.dispose();
      entry.moveHandle.material.dispose();
    };
    if (deferResourceDisposal) {
      scheduleResourceDisposal(disposeResources);
    } else {
      disposeResources();
    }

    const meshIdx = paintingMeshes.indexOf(entry.canvas);
    if (meshIdx >= 0) paintingMeshes.splice(meshIdx, 1);
    const pickCanvasIdx = paintingPickMeshes.indexOf(entry.canvas);
    if (pickCanvasIdx >= 0) paintingPickMeshes.splice(pickCanvasIdx, 1);
    const pickFrameIdx = paintingPickMeshes.indexOf(entry.frame);
    if (pickFrameIdx >= 0) paintingPickMeshes.splice(pickFrameIdx, 1);
    const deleteIdx = paintingDeleteMeshes.indexOf(entry.deleteHandle);
    if (deleteIdx >= 0) paintingDeleteMeshes.splice(deleteIdx, 1);
    const moveIdx = paintingMoveMeshes.indexOf(entry.moveHandle);
    if (moveIdx >= 0) paintingMoveMeshes.splice(moveIdx, 1);
    const spotIdx = paintingSpots.indexOf(entry.paintingSpot);
    if (spotIdx >= 0) paintingSpots.splice(spotIdx, 1);

    paintingRegistry.delete(entry.painting.id);
    entry.painting.placed = false;

    if (shouldClosePaintingCard) {
      closePaintingCard();
    }
    if (shouldRefreshFilmstrip) {
      renderFilmstrip();
    }
  }

  return {
    deletePaintingEntry,
  };
}
