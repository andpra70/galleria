type InputElements = {
  canvas: HTMLCanvasElement;
  minimapCanvas: HTMLCanvasElement;
  helpPanel: HTMLElement;
  saveShowJsonBtn: HTMLButtonElement;
  artCardClose: HTMLButtonElement;
  editModeToggle: HTMLButtonElement;
  artEditMoveLeft: HTMLButtonElement;
  artEditMoveRight: HTMLButtonElement;
  artEditMoveUp: HTMLButtonElement;
  artEditMoveDown: HTMLButtonElement;
  artEditDelete: HTMLButtonElement;
  artEditFields: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  artEditSynopsisList: HTMLElement;
  artEditSynopsisAdd: HTMLButtonElement;
  filmstrip: HTMLElement;
  filmstripItems: HTMLElement;
  filmstripAdd: HTMLButtonElement;
  artCardImage: HTMLImageElement;
};

type InputHandlers = Record<string, (...args: any[]) => void>;

export function attachGalleryInput(elements: InputElements, handlers: InputHandlers) {
  const {
    canvas,
    minimapCanvas,
    helpPanel,
    saveShowJsonBtn,
    artCardClose,
    editModeToggle,
    artEditMoveLeft,
    artEditMoveRight,
    artEditMoveUp,
    artEditMoveDown,
    artEditDelete,
    artEditFields,
    artEditSynopsisList,
    artEditSynopsisAdd,
    filmstrip,
    filmstripItems,
    filmstripAdd,
    artCardImage,
  } = elements;

  const {
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
    onMinimapClick,
    onHelpPanelDragOver,
    onHelpPanelDragLeave,
    onHelpPanelDrop,
    onSaveShowJson,
    closePaintingCard,
    onToggleEditMode,
    onEditMoveLeft,
    onEditMoveRight,
    onEditMoveUp,
    onEditMoveDown,
    onEditDelete,
    onInlineEditChanged,
    onSynopsisAddField,
    onSynopsisListClick,
    onFilmstripClick,
    onFilmstripDragStart,
    onFilmstripDragOver,
    onFilmstripDrop,
    onFilmstripAddClick,
    onCardImageDragOver,
    onCardImageDragLeave,
    onCardImageDrop,
  } = handlers;

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
  canvas.addEventListener("dragover", onCanvasDragOver);
  canvas.addEventListener("drop", onCanvasDrop);
  minimapCanvas.addEventListener("click", onMinimapClick);

  helpPanel.addEventListener("dragover", onHelpPanelDragOver);
  helpPanel.addEventListener("dragleave", onHelpPanelDragLeave);
  helpPanel.addEventListener("drop", onHelpPanelDrop);
  saveShowJsonBtn.addEventListener("click", onSaveShowJson);
  artCardClose.addEventListener("click", closePaintingCard);
  editModeToggle.addEventListener("click", onToggleEditMode);

  artEditMoveLeft.addEventListener("click", onEditMoveLeft);
  artEditMoveRight.addEventListener("click", onEditMoveRight);
  artEditMoveUp.addEventListener("click", onEditMoveUp);
  artEditMoveDown.addEventListener("click", onEditMoveDown);
  artEditDelete.addEventListener("click", onEditDelete);

  artEditFields.forEach((el) => {
    el.addEventListener("change", onInlineEditChanged);
  });
  artEditSynopsisList.addEventListener("change", onInlineEditChanged);
  artEditSynopsisAdd.addEventListener("click", onSynopsisAddField);
  artEditSynopsisList.addEventListener("click", onSynopsisListClick);
  filmstripItems.addEventListener("click", onFilmstripClick);
  filmstripItems.addEventListener("dragstart", onFilmstripDragStart);
  filmstrip.addEventListener("dragover", onFilmstripDragOver);
  filmstrip.addEventListener("drop", onFilmstripDrop);
  filmstripAdd.addEventListener("click", onFilmstripAddClick);

  artCardImage.addEventListener("dragover", onCardImageDragOver);
  artCardImage.addEventListener("dragleave", onCardImageDragLeave);
  artCardImage.addEventListener("drop", onCardImageDrop);
}
