import type { AppContext } from "./appServices";
import type { ArtCardDomElements } from "./domTypes";
import { optimizeImportedPaintingImage } from "./importedPaintingImage";
import type { GalleryPainting, PaintingRegistryEntry } from "./types";

type PaintingEditorHandlersDeps = {
  app: AppContext;
  dom: {
    artCardImage: HTMLImageElement;
    artEditImageUrl: HTMLInputElement;
    artEditSynopsisList: HTMLElement;
    artCardDomElements: ArtCardDomElements;
  };
  numeric: {
    PAINTING_SNAP_M: number;
    snapToStep: (value: number, step: number) => number;
  };
  actions: {
    clampPaintingOffset: (entry: PaintingRegistryEntry, rawOffset: number) => number;
    clampPaintingCenterY: (entry: PaintingRegistryEntry, rawCenterY: number) => number;
    applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
    showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
    deletePaintingEntry: (entry: PaintingRegistryEntry) => void;
    addSynopsisFieldRowDom: (listEl: HTMLElement, key: string, value: string, focusKey?: boolean) => void;
    onInlineEditChanged: (event: Event) => void;
    applyPaintingImage: (entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl?: boolean) => void;
    renderPaintingCardContentDom: (elements: ArtCardDomElements, paintingSpot: import("./types").PaintingSpot) => void;
    openCatalogPainting: (painting: GalleryPainting) => void;
    renderFilmstrip: () => void;
  };
};

export function createPaintingEditorHandlers(deps: PaintingEditorHandlersDeps) {
  const {
    app,
    dom,
    numeric,
    actions,
  } = deps;
  const { artCardImage, artEditImageUrl, artEditSynopsisList, artCardDomElements } = dom;
  const { PAINTING_SNAP_M, snapToStep } = numeric;
  const {
    clampPaintingOffset,
    clampPaintingCenterY,
    applyPaintingPlacement,
    showEditPanelForEntry,
    deletePaintingEntry,
    addSynopsisFieldRowDom,
    onInlineEditChanged,
    applyPaintingImage,
    renderPaintingCardContentDom,
    openCatalogPainting,
    renderFilmstrip,
  } = actions;
  const { uiState, editorState, cardState } = app.status;
  const { artCard } = app.dom;
  const { paintingRegistry } = app.collections;
  const paintings = () => app.status.refs.getConfig().paintings;

  function onEditMove(deltaOffsetDir: number, deltaHeightDir: number) {
    if (!uiState.editMode || !cardState.paintingId) {
      return;
    }
    const entry = paintingRegistry.get(cardState.paintingId);
    if (!entry) {
      return;
    }

    const offsetStep = PAINTING_SNAP_M;
    const heightStep = PAINTING_SNAP_M;
    entry.painting.offset = clampPaintingOffset(entry, snapToStep((entry.painting.offset ?? 0) + deltaOffsetDir * offsetStep, PAINTING_SNAP_M));
    entry.painting.centerY = clampPaintingCenterY(
      entry,
      snapToStep((entry.painting.centerY ?? 1.65) + deltaHeightDir * heightStep, PAINTING_SNAP_M)
    );

    applyPaintingPlacement(entry);
    showEditPanelForEntry(entry);
  }

  function onEditDelete() {
    if (!uiState.editMode || !cardState.paintingId) {
      return;
    }
    const entry = paintingRegistry.get(cardState.paintingId);
    if (!entry) {
      return;
    }
    deletePaintingEntry(entry);
  }

  function onSynopsisAddField() {
    if (!uiState.editMode || editorState.suspend) {
      return;
    }
    addSynopsisFieldRowDom(artEditSynopsisList, "", "", true);
  }

  function onSynopsisListClick(event: MouseEvent) {
    if (!uiState.editMode || editorState.suspend) {
      return;
    }
    const btn = (event.target as HTMLElement | null)?.closest("button[data-action='remove-synopsis']");
    if (!btn) {
      return;
    }
    const row = btn.closest(".synopsis-edit-row");
    if (row) {
      row.remove();
      onInlineEditChanged(event);
    }
  }

  function onCardImageDragOver(event: DragEvent) {
    if (!uiState.editMode || artCard.hidden) {
      return;
    }
    event.preventDefault();
    artCardImage.classList.add("image-drop-target");
  }

  function onCardImageDragLeave(event: DragEvent) {
    event.preventDefault();
    artCardImage.classList.remove("image-drop-target");
  }

  async function onCardImageDrop(event: DragEvent) {
    if (!uiState.editMode || artCard.hidden) {
      return;
    }
    event.preventDefault();
    artCardImage.classList.remove("image-drop-target");
    const file = app.helpers.getFirstImageFile(event.dataTransfer);
    if (!file) {
      return;
    }
    const optimizedImage = await optimizeImportedPaintingImage(file);
    const entry = cardState.paintingId ? paintingRegistry.get(cardState.paintingId) : null;
    if (entry) {
      entry.painting.aspectRatio = optimizedImage.width / optimizedImage.height;
      applyPaintingImage(entry, optimizedImage.dataUrl, false);
    } else {
      const painting = cardState.paintingId ? paintings().find((p: GalleryPainting) => p.id === cardState.paintingId) : null;
      if (!painting) {
        return;
      }
      painting.image = optimizedImage.dataUrl;
      painting.aspectRatio = optimizedImage.width / optimizedImage.height;
    }

    editorState.suspend = true;
    artEditImageUrl.value = optimizedImage.dataUrl;
    editorState.suspend = false;

    if (entry) {
      renderPaintingCardContentDom(artCardDomElements, entry.paintingSpot);
    } else {
      const painting = cardState.paintingId ? paintings().find((p: GalleryPainting) => p.id === cardState.paintingId) : null;
      if (painting) {
        openCatalogPainting(painting);
      }
    }
    renderFilmstrip();
  }

  return {
    onEditMove,
    onEditDelete,
    onSynopsisAddField,
    onSynopsisListClick,
    onCardImageDragOver,
    onCardImageDragLeave,
    onCardImageDrop,
  };
}
