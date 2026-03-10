import type { AppContext } from "./appServices";
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
  closePaintingCard: () => void;
  setEditMode: (enabled: boolean) => void;
  getDeletePaintingEntry: () => ((entry: PaintingRegistryEntry, options?: DeletePaintingEntryOptions) => void) | undefined;
};

export function createFilmstripController(deps: FilmstripControllerDeps) {
  const { app, createNewCatalogPainting, openPaintingCard, closePaintingCard, setEditMode, getDeletePaintingEntry } = deps;
  const { status } = app;
  const { uiState, movement, visitor, cardState } = status;
  const { THREE } = app.runtime;
  const { filmstripItems } = app.dom;
  const { paintingRegistry } = app.collections;
  const { createPlaceholderPaintingImage, cmToM, getFirstImageFile } = app.helpers;

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
    if (!item || !uiState.editMode) {
      return;
    }
    const config = app.status.refs.getConfig();
    const paintingId = item.dataset.paintingId;
    const painting = config.paintings.find((p: GalleryPainting) => p.id === paintingId);
    if (!painting) {
      return;
    }
    uiState.selectedPaintingId = painting.id;
    renderFilmstrip();
  }

  function onFilmstripDoubleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const item = target?.closest(".filmstrip-item") as HTMLElement | null;
    if (!item || !uiState.editMode) {
      return;
    }
    const config = app.status.refs.getConfig();
    const paintingId = item.dataset.paintingId;
    const painting = config.paintings.find((p: GalleryPainting) => p.id === paintingId);
    if (!painting) {
      return;
    }
    uiState.selectedPaintingId = painting.id;
    renderFilmstrip();
    openCatalogPainting(painting);
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
    const file = getFirstImageFile(event.dataTransfer);
    if (!file) {
      return;
    }
    event.preventDefault();
  }

  function onFilmstripDrop(event: DragEvent) {
    const file = getFirstImageFile(event.dataTransfer);
    if (!file) {
      return;
    }
    event.preventDefault();

    const config = app.status.refs.getConfig();
    if (!uiState.editMode) {
      setEditMode(true);
    }
    const painting = createNewCatalogPainting();
    painting.image = URL.createObjectURL(file);
    painting.title = file.name.replace(/\.[^.]+$/, "") || painting.title;
    config.paintings.push(painting);
    uiState.selectedPaintingId = painting.id;
    renderFilmstrip();
    closePaintingCard();
  }

  return {
    renderFilmstrip,
    openCatalogPainting,
    onFilmstripAddClick,
    onFilmstripClick,
    onFilmstripDoubleClick,
    onFilmstripDragStart,
    onFilmstripDragOver,
    onFilmstripDrop,
  };
}
