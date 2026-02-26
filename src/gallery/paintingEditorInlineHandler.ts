import type { AppContext } from "./appServices";
import type { ArtCardDomElements } from "./domTypes";
import type { GalleryPainting, GalleryRoom, PaintingCanvasMesh, PaintingFrameMesh, PaintingRegistryEntry, PaintingSpot, WallSide } from "./types";

type PaintingDims = { width: number; height: number };

type PaintingEditorInlineDeps = {
  app: AppContext;
  dom: {
    artEditId: HTMLInputElement;
    artEditTitle: HTMLInputElement;
    artEditDescription: HTMLTextAreaElement;
    artEditRoom: HTMLSelectElement;
    artEditRoomWidthCm: HTMLInputElement;
    artEditRoomDepthCm: HTMLInputElement;
    artEditRoomHeightCm: HTMLInputElement;
    artEditWall: HTMLSelectElement;
    artEditOffsetCm: HTMLInputElement;
    artEditWidthCm: HTMLInputElement;
    artEditCenterYCm: HTMLInputElement;
    artEditImageUrl: HTMLInputElement;
    artEditHeightCm: HTMLInputElement;
    artEditFrameBorderCm: HTMLInputElement;
    artEditFrameColor: HTMLInputElement;
    artEditSynopsisList: HTMLElement;
    artCardDomElements: ArtCardDomElements;
  };
  numeric: {
    PAINTING_SNAP_M: number;
    parseNumberOrFallback: (value: string, fallback: number) => number;
    mToCm: (m: number) => number;
    cmToM: (cm: number) => number;
    snapToStep: (value: number, step: number) => number;
    getWallSpan: (room: GalleryRoom, wall: WallSide) => number;
  };
  actions: {
    clampPaintingOffset: (entry: PaintingRegistryEntry, rawOffset: number) => number;
    clampPaintingCenterY: (entry: PaintingRegistryEntry, rawCenterY: number) => number;
    resolvePaintingAspectRatio: (painting: GalleryPainting, image: unknown) => number;
    applyPaintingImage: (entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl?: boolean) => void;
    rebuildSceneFromConfig: () => void;
    renderPaintingCardContentDom: (elements: ArtCardDomElements, paintingSpot: PaintingSpot) => void;
    showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
    openCatalogPainting: (painting: GalleryPainting) => void;
    renderFilmstrip: () => void;
    inferPaintingDimensions: (painting: GalleryPainting, image: unknown) => PaintingDims;
    applyPaintingDimensions: (
      frame: PaintingFrameMesh,
      canvas: PaintingCanvasMesh,
      dims: PaintingDims,
      border: number,
      frameDepth: number,
      paintingSpot: PaintingSpot
    ) => void;
    applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
  };
};

export function createPaintingEditorInlineHandler(deps: PaintingEditorInlineDeps) {
  const {
    app,
    dom,
    numeric,
    actions,
  } = deps;
  const { THREE } = app.runtime;
  const { uiState, editorState, cardState } = app.status;
  const { paintingRegistry } = app.collections;
  const getConfig = app.status.refs.getConfig;
  const getRoomsById = app.status.refs.getRoomsById;
  const {
    artEditId,
    artEditTitle,
    artEditDescription,
    artEditRoom,
    artEditRoomWidthCm,
    artEditRoomDepthCm,
    artEditRoomHeightCm,
    artEditWall,
    artEditOffsetCm,
    artEditWidthCm,
    artEditCenterYCm,
    artEditImageUrl,
    artEditHeightCm,
    artEditFrameBorderCm,
    artEditFrameColor,
    artEditSynopsisList,
    artCardDomElements,
  } = dom;
  const { PAINTING_SNAP_M, parseNumberOrFallback, mToCm, cmToM, snapToStep, getWallSpan } = numeric;
  const {
    clampPaintingOffset,
    clampPaintingCenterY,
    resolvePaintingAspectRatio,
    applyPaintingImage,
    rebuildSceneFromConfig,
    renderPaintingCardContentDom,
    showEditPanelForEntry,
    openCatalogPainting,
    renderFilmstrip,
    inferPaintingDimensions,
    applyPaintingDimensions,
    applyPaintingPlacement,
  } = actions;

  return function onInlineEditChanged(event: Event) {
    if (!uiState.editMode || editorState.suspend) {
      return;
    }
    const config = getConfig();
    const roomsById = getRoomsById();
    const painting = cardState.paintingId ? config.paintings.find((p: GalleryPainting) => p.id === cardState.paintingId) : null;
    if (!painting) {
      return;
    }
    const entry = paintingRegistry.get(painting.id) ?? null;

    const prevId = painting.id;
    const nextId = (artEditId.value || "").trim() || prevId;
    if (nextId !== prevId && config.paintings.some((p: GalleryPainting) => p.id === nextId)) {
      editorState.suspend = true;
      artEditId.value = prevId;
      editorState.suspend = false;
      return;
    }

    const nextRoomId = (artEditRoom.value || "").trim();
    const nextRoom: GalleryRoom | null = roomsById.get(nextRoomId) ?? entry?.room ?? roomsById.get(painting.roomId ?? "") ?? null;
    if (!nextRoom) {
      return;
    }
    if (event.target === artEditRoom && nextRoom) {
      editorState.suspend = true;
      artEditRoomWidthCm.value = String(Math.round(nextRoom.widthCm ?? mToCm(nextRoom.width)));
      artEditRoomDepthCm.value = String(Math.round(nextRoom.depthCm ?? mToCm(nextRoom.depth)));
      artEditRoomHeightCm.value = String(Math.round(nextRoom.heightCm ?? mToCm(nextRoom.height)));
      editorState.suspend = false;
    }
    const nextWall = (artEditWall.value || "").trim();
    if (!["north", "south", "west", "east"].includes(nextWall)) {
      return;
    }

    const nextSynopsis: Record<string, string> = {};
    const rows = artEditSynopsisList.querySelectorAll(".synopsis-edit-row");
    rows.forEach((row: Element) => {
      const keyInput = row.querySelector<HTMLInputElement>("input[data-role='key']");
      const valueInput = row.querySelector<HTMLInputElement>("input[data-role='value']");
      const key = (keyInput?.value || "").trim();
      if (!key) {
        return;
      }
      nextSynopsis[key] = (valueInput?.value || "").trim();
    });

    painting.id = nextId;
    painting.title = artEditTitle.value?.trim() || "Opera";
    painting.description = artEditDescription.value?.trim() || "";
    painting.roomId = nextRoom.id;
    const nextWallSide = nextWall as WallSide;
    painting.wall = nextWallSide;
    if (entry) {
      entry.room = nextRoom;
    }
    const fallbackOffset = mToCm(painting.offset ?? 0);
    const desiredOffset = cmToM(parseNumberOrFallback(artEditOffsetCm.value, fallbackOffset));
    if (entry) {
      painting.offset = clampPaintingOffset(entry, snapToStep(desiredOffset, PAINTING_SNAP_M));
    } else {
      const wallSpan = getWallSpan(nextRoom, nextWallSide);
      const halfWidth = cmToM(Math.max(1, parseNumberOrFallback(artEditWidthCm.value, painting.widthCm ?? 100))) * 0.5;
      const margin = Math.max(0.5, halfWidth + 0.12);
      painting.offset = snapToStep(THREE.MathUtils.clamp(desiredOffset, margin, wallSpan - margin), PAINTING_SNAP_M);
    }
    const fallbackCenter = mToCm(painting.centerY ?? 1.65);
    const desiredCenter = cmToM(parseNumberOrFallback(artEditCenterYCm.value, fallbackCenter));
    if (entry) {
      painting.centerY = clampPaintingCenterY(entry, snapToStep(desiredCenter, PAINTING_SNAP_M));
    } else {
      const halfHeight = cmToM(Math.max(1, painting.heightCm ?? 75)) * 0.5 + 0.1;
      painting.centerY = snapToStep(
        THREE.MathUtils.clamp(desiredCenter, Math.max(0.2, halfHeight), nextRoom.height - Math.max(0.2, halfHeight)),
        PAINTING_SNAP_M
      );
    }
    painting.widthCm = Math.max(1, parseNumberOrFallback(artEditWidthCm.value, painting.widthCm ?? 100));
    const ratio = resolvePaintingAspectRatio(painting, entry?.canvas.material.map?.image);
    painting.heightCm = Math.max(1, Math.round(painting.widthCm / ratio));
    painting.frameBorderCm = Math.max(0, parseNumberOrFallback(artEditFrameBorderCm.value, painting.frameBorderCm ?? 6));
    painting.frameColor = (artEditFrameColor.value || "").trim() || "#423934";
    painting.synopsis = nextSynopsis;

    const nextImageUrl = (artEditImageUrl.value || "").trim();
    if (nextImageUrl && nextImageUrl !== painting.image && entry) {
      applyPaintingImage(entry, nextImageUrl, false);
    } else if (nextImageUrl && nextImageUrl !== painting.image) {
      painting.image = nextImageUrl;
    }

    const roomWidthCm = parseNumberOrFallback(artEditRoomWidthCm.value, nextRoom.widthCm ?? mToCm(nextRoom.width));
    const roomDepthCm = parseNumberOrFallback(artEditRoomDepthCm.value, nextRoom.depthCm ?? mToCm(nextRoom.depth));
    const roomHeightCm = parseNumberOrFallback(artEditRoomHeightCm.value, nextRoom.heightCm ?? mToCm(nextRoom.height));
    const roomChanged = roomWidthCm !== nextRoom.widthCm || roomDepthCm !== nextRoom.depthCm || roomHeightCm !== nextRoom.heightCm;
    nextRoom.widthCm = Math.max(100, roomWidthCm);
    nextRoom.depthCm = Math.max(100, roomDepthCm);
    nextRoom.heightCm = Math.max(180, roomHeightCm);

    if (entry) {
      entry.paintingSpot.id = nextId;
      entry.paintingSpot.title = painting.title;
      entry.paintingSpot.description = painting.description;
      entry.paintingSpot.synopsis = nextSynopsis;
    }

    if (nextId !== prevId) {
      if (entry) {
        paintingRegistry.delete(prevId);
        paintingRegistry.set(nextId, entry);
        entry.canvas.userData.paintingId = nextId;
        entry.frame.userData.paintingId = nextId;
        entry.deleteHandle.userData.paintingId = nextId;
        entry.moveHandle.userData.paintingId = nextId;
      }
      cardState.paintingId = nextId;
      uiState.selectedPaintingId = nextId;
    }

    if (roomChanged) {
      const keepId = painting.id;
      rebuildSceneFromConfig();
      const updated = paintingRegistry.get(keepId);
      if (updated) {
        cardState.paintingId = keepId;
        renderPaintingCardContentDom(artCardDomElements, updated.paintingSpot);
        showEditPanelForEntry(updated);
      } else {
        const updatedPainting = config.paintings.find((p: GalleryPainting) => p.id === keepId);
        if (updatedPainting) {
          openCatalogPainting(updatedPainting);
        }
      }
      renderFilmstrip();
      return;
    }

    if (entry) {
      entry.border = cmToM(Math.max(0, painting.frameBorderCm ?? 0));
      if (entry.frame.material?.color) {
        entry.frame.material.color.set(painting.frameColor ?? "#423934");
      }
      const dims = inferPaintingDimensions(entry.painting, entry.canvas.material.map?.image);
      applyPaintingDimensions(entry.frame, entry.canvas, dims, entry.border, entry.frameDepth, entry.paintingSpot);
      applyPaintingPlacement(entry);
      renderPaintingCardContentDom(artCardDomElements, entry.paintingSpot);
      showEditPanelForEntry(entry);
    } else {
      openCatalogPainting(painting);
    }
    renderFilmstrip();
  };
}
