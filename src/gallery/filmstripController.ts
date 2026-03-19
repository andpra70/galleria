import type { AppContext } from "./appServices";
import { getImageFiles, hasImagePayload } from "./files";
import { applyImportedFileMetadataToPainting } from "./importedPaintingMetadata";
import { createPseudoPaintingCardViewModel, toFilmstripItemViewModel } from "./paintingModels";
import type { GalleryPainting, PaintingRegistryEntry, PaintingSpot } from "./types";

type DeletePaintingEntryOptions = {
  closePaintingCard?: boolean;
  refreshFilmstrip?: boolean;
  deferResourceDisposal?: boolean;
};

type FilmstripControllerDeps = {
  app: AppContext;
  createNewCatalogPainting: () => GalleryPainting;
  openPaintingCard: (paintingSpot: PaintingSpot) => void;
  showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
  closePaintingCard: () => void;
  setEditMode: (enabled: boolean) => void;
  computePaintingViewPosition: (paintingSpot: PaintingSpot) => import("three").Vector3 | null;
  moveVisitorTo: (target: import("three").Vector3, focusTarget: import("three").Vector3 | null) => void;
  getDeletePaintingEntry: () => ((entry: PaintingRegistryEntry, options?: DeletePaintingEntryOptions) => void) | undefined;
};

export function createFilmstripController(deps: FilmstripControllerDeps) {
  const {
    app,
    createNewCatalogPainting,
    openPaintingCard,
    showEditPanelForEntry,
    closePaintingCard,
    setEditMode,
    computePaintingViewPosition,
    moveVisitorTo,
    getDeletePaintingEntry,
  } = deps;
  const { status } = app;
  const { uiState, movement, visitor, cardState } = status;
  const { THREE } = app.runtime;
  const { filmstripItems } = app.dom;
  const { paintingRegistry } = app.collections;
  const { createPlaceholderPaintingImage, cmToM } = app.helpers;
  const CLICK_DELAY_MS = 220;
  let pendingClickTimer: number | null = null;

  function clearPendingClick() {
    if (pendingClickTimer === null) {
      return;
    }
    window.clearTimeout(pendingClickTimer);
    pendingClickTimer = null;
  }

  async function addCatalogPaintingsFromFiles(files: File[]) {
    if (!files.length) {
      return [];
    }
    const config = app.status.refs.getConfig();
    if (!uiState.editMode) {
      setEditMode(true);
    }
    const created: GalleryPainting[] = [];
    for (const file of files) {
      const painting = createNewCatalogPainting();
      await applyImportedFileMetadataToPainting(painting, file);
      config.paintings.push(painting);
      created.push(painting);
    }
    uiState.selectedPaintingId = created[created.length - 1]?.id ?? null;
    renderFilmstrip();
    closePaintingCard();
    return created;
  }

  function renderFilmstrip() {
    if (!filmstripItems) {
      return;
    }
    const config = app.status.refs.getConfig();
    filmstripItems.innerHTML = "";
    const fallbackImage = app.status.refs.getNoImagePlaceholder() || createPlaceholderPaintingImage("No image");
    config.paintings.forEach((painting: GalleryPainting) => {
      const itemModel = toFilmstripItemViewModel(painting, uiState.selectedPaintingId, fallbackImage);
      const button = document.createElement("div");
      button.className = "filmstrip-item";
      if (itemModel.isSelected) {
        button.classList.add("selected");
      }
      if (!itemModel.isPlaced) {
        button.classList.add("unplaced");
      }
      button.dataset.paintingId = itemModel.id;
      button.draggable = true;

      const remove = document.createElement("span");
      remove.className = "filmstrip-remove";
      remove.setAttribute("role", "button");
      remove.setAttribute("aria-label", `Elimina ${itemModel.title}`);
      remove.title = "Elimina opera";
      remove.textContent = "×";

      const img = document.createElement("img");
      img.src = itemModel.image;
      img.alt = itemModel.title;

      const title = document.createElement("div");
      title.className = "filmstrip-title";
      title.textContent = itemModel.title;

      button.append(remove, img, title);
      filmstripItems.appendChild(button);
    });
  }

  function openCatalogPainting(painting: GalleryPainting) {
    const entry = paintingRegistry.get(painting.id);
    if (entry) {
      movement.focusTarget = entry.paintingSpot.center.clone();
      openPaintingCard(entry.paintingSpot);
      return;
    }
    const pseudoSpot = createPseudoPaintingCardViewModel({
      THREE,
      painting,
      visitorPosition: visitor.position,
      cmToM,
      noImagePlaceholder: app.status.refs.getNoImagePlaceholder(),
      createPlaceholderPaintingImage,
    });
    openPaintingCard(pseudoSpot);
  }

  function onFilmstripAddClick() {
    if (!uiState.editMode) {
      return;
    }
    const config = app.status.refs.getConfig();
    const painting = createNewCatalogPainting();
    config.paintings.push(painting);
    uiState.selectedPaintingId = painting.id;
    renderFilmstrip();
    closePaintingCard();
  }

  function onFilmstripClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const removeBtn = target?.closest(".filmstrip-remove") as HTMLElement | null;
    if (removeBtn) {
      clearPendingClick();
      if (!uiState.editMode) {
        return;
      }
      const item = removeBtn.closest(".filmstrip-item") as HTMLElement | null;
      const paintingId = item?.dataset.paintingId;
      if (!paintingId) {
        return;
      }
      const config = app.status.refs.getConfig();
      const idx = config.paintings.findIndex((p: GalleryPainting) => p.id === paintingId);
      if (idx < 0) {
        return;
      }
      const entry = paintingRegistry.get(paintingId);
      if (entry) {
        getDeletePaintingEntry()?.(entry, { closePaintingCard: false, refreshFilmstrip: false, deferResourceDisposal: true });
      }
      config.paintings.splice(idx, 1);
      if (uiState.selectedPaintingId === paintingId) {
        uiState.selectedPaintingId = null;
      }
      if (cardState.paintingId === paintingId) {
        closePaintingCard();
      }
      item.remove();
      return;
    }
    const item = target?.closest(".filmstrip-item") as HTMLElement | null;
    if (!item) {
      return;
    }
    const config = app.status.refs.getConfig();
    const paintingId = item.dataset.paintingId;
    const painting = config.paintings.find((p: GalleryPainting) => p.id === paintingId);
    if (!painting) {
      return;
    }
    clearPendingClick();
    pendingClickTimer = window.setTimeout(() => {
      pendingClickTimer = null;
      uiState.selectedPaintingId = painting.id;
      renderFilmstrip();
      const entry = paintingRegistry.get(painting.id);
      if (!entry) {
        return;
      }
      closePaintingCard();
      const viewPos = computePaintingViewPosition(entry.paintingSpot);
      if (!viewPos) {
        return;
      }
      moveVisitorTo(viewPos, entry.paintingSpot.center.clone());
    }, CLICK_DELAY_MS);
  }

  function onFilmstripDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const item = target?.closest(".filmstrip-item") as HTMLElement | null;
    if (!item) {
      return;
    }
    clearPendingClick();
    const config = app.status.refs.getConfig();
    const paintingId = item.dataset.paintingId;
    const painting = config.paintings.find((p: GalleryPainting) => p.id === paintingId);
    if (!painting) {
      return;
    }
    uiState.selectedPaintingId = painting.id;
    renderFilmstrip();
    const entry = paintingRegistry.get(painting.id);
    if (entry) {
      if (uiState.editMode) {
        openPaintingCard(entry.paintingSpot);
        showEditPanelForEntry(entry);
        return;
      }
      openPaintingCard(entry.paintingSpot);
      return;
    }
    if (uiState.editMode) {
      openCatalogPainting(painting);
    }
  }

  function onFilmstripDragStart(event: DragEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".filmstrip-remove")) {
      event.preventDefault();
      return;
    }
    const item = target?.closest(".filmstrip-item") as HTMLElement | null;
    if (!item || !uiState.editMode || !event.dataTransfer) {
      return;
    }
    const paintingId = item.dataset.paintingId;
    if (!paintingId) {
      return;
    }
    event.dataTransfer.setData("application/x-gallery-painting-id", paintingId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onFilmstripDragOver(event: DragEvent) {
    if (!hasImagePayload(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
  }

  async function onFilmstripDrop(event: DragEvent) {
    const files = getImageFiles(event.dataTransfer);
    if (!files.length) {
      return;
    }
    event.preventDefault();
    await addCatalogPaintingsFromFiles(files);
  }

  return {
    renderFilmstrip,
    openCatalogPainting,
    addCatalogPaintingsFromFiles,
    onFilmstripAddClick,
    onFilmstripClick,
    onFilmstripDoubleClick,
    onFilmstripDragStart,
    onFilmstripDragOver,
    onFilmstripDrop,
  };
}
