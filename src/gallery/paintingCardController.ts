import type { AppContext } from "./appServices";
import type { ArtCardDomElements, ArtEditDomElements } from "./domTypes";
import type { GalleryPainting, GalleryRoom, PaintingRegistryEntry, PaintingSpot } from "./types";

type PaintingCardControllerDeps = {
  app: AppContext;
  artCardDomElements: ArtCardDomElements;
  artEditDomElements: ArtEditDomElements;
  renderPaintingCardContentDom: (elements: ArtCardDomElements, paintingSpot: PaintingSpot) => void;
  resetEditPanelDom: (elements: ArtEditDomElements) => void;
  fillSynopsisFieldsDom: (listEl: HTMLElement, synopsis: Record<string, string>) => void;
  getRenderFilmstrip: () => (() => void) | undefined;
  resolvePaintingAspectRatio: (painting: GalleryPainting, image: unknown) => number;
  mToCm: (valueM: number) => number;
};

export function createPaintingCardController(deps: PaintingCardControllerDeps) {
  const {
    app,
    artCardDomElements,
    artEditDomElements,
    renderPaintingCardContentDom,
    resetEditPanelDom,
    fillSynopsisFieldsDom,
    getRenderFilmstrip,
    resolvePaintingAspectRatio,
    mToCm,
  } = deps;
  const { status } = app;
  const { uiState, editorState, cardState } = status;
  const { artCard } = app.dom;
  const { paintingRegistry } = app.collections;

  function closePaintingCard() {
    cardState.paintingId = null;
    resetEditPanelDom(artEditDomElements);
    artCardDomElements.artCardAudio.pause();
    artCardDomElements.artCardAudio.currentTime = 0;
    artCardDomElements.artCardAudio.removeAttribute("src");
    artCardDomElements.artCardAudioToggle.hidden = true;
    artCardDomElements.artCardAudioToggle.dataset.playing = "false";
    artCardDomElements.artCardAudioToggle.textContent = "🔊";
    artCard.classList.remove("is-editing");
    artCard.hidden = true;
  }

  function showEditPanelForPainting(
    painting: GalleryPainting,
    roomArg: GalleryRoom | null = null,
    imageArg: unknown = null,
    spotArg: PaintingSpot | null = null
  ) {
    if (!uiState.editMode || !artCard.classList.contains("is-editing")) {
      return;
    }
    const roomsById = app.status.refs.getRoomsById();
    const placedEntry = paintingRegistry.get(painting.id);
    editorState.suspend = true;
    artEditDomElements.artEditPanel.hidden = false;
    artEditDomElements.artEditId.value = painting.id ?? "";
    artEditDomElements.artEditTitle.value = painting.title ?? "";
    artEditDomElements.artEditDescription.value = painting.description ?? "";
    artEditDomElements.artEditRoom.value = painting.roomId ?? roomArg?.id ?? "";

    const room = roomArg ?? roomsById.get(painting.roomId ?? "");
    if (room) {
      artEditDomElements.artEditRoomWidthCm.value = String(Math.round(room.widthCm ?? mToCm(room.width)));
      artEditDomElements.artEditRoomDepthCm.value = String(Math.round(room.depthCm ?? mToCm(room.depth)));
      artEditDomElements.artEditRoomHeightCm.value = String(Math.round(room.heightCm ?? mToCm(room.height)));
    }

    const ratio = resolvePaintingAspectRatio(painting, imageArg);
    if (painting.widthCm == null) {
      painting.widthCm = Math.max(1, Math.round(mToCm(spotArg?.width ?? 1)));
    }
    painting.heightCm = Math.max(1, Math.round(painting.widthCm / ratio));
    artEditDomElements.artEditWall.value = painting.wall ?? "north";
    artEditDomElements.artEditOffsetCm.value = String(Math.round(mToCm(painting.offset ?? 0)));
    artEditDomElements.artEditWidthCm.value = String(Math.round(painting.widthCm ?? mToCm(spotArg?.width ?? 1)));
    artEditDomElements.artEditHeightCm.value = String(Math.round(painting.heightCm ?? mToCm(spotArg?.height ?? 1)));
    artEditDomElements.artEditFrameBorderCm.value = String(Math.max(0, Math.round(painting.frameBorderCm ?? 6)));
    artEditDomElements.artEditFrameColor.value = painting.frameColor ?? "#423934";
    artEditDomElements.artEditCenterYCm.value = String(Math.round(mToCm(painting.centerY ?? 1.65)));
    artEditDomElements.artEditImageUrl.value = painting.image ?? "";
    artEditDomElements.artEditAudioStatus.textContent = (painting.audioMp4 ?? "").trim() ? "File audio selezionato" : "Nessun audio";
    artEditDomElements.artEditAudioSelect.value = (painting.audioAssetId ?? "").trim();
    artEditDomElements.artEditAudioStartSec.value = String(Number.isFinite(Number(painting.audioStartSec)) ? Number(painting.audioStartSec) : 0);
    artEditDomElements.artEditAudioEndSec.value = Number.isFinite(Number(painting.audioEndSec)) ? String(Number(painting.audioEndSec)) : "";
    artEditDomElements.artEditAudioToggle.textContent = "Play audio";
    artEditDomElements.artEditAudioToggle.disabled = !(painting.audioMp4 ?? "").trim();
    artEditDomElements.artEditAudioClear.disabled = !(painting.audioMp4 ?? "").trim();
    artEditDomElements.artEditAudioFile.value = "";
    artEditDomElements.artEditAudioDropZone.classList.remove("is-drop-target");
    fillSynopsisFieldsDom(artEditDomElements.artEditSynopsisList, painting.synopsis ?? {});
    artEditDomElements.artEditDelete.disabled = !placedEntry;
    artEditDomElements.artEditMoveLeft.disabled = !placedEntry;
    artEditDomElements.artEditMoveRight.disabled = !placedEntry;
    artEditDomElements.artEditMoveUp.disabled = !placedEntry;
    artEditDomElements.artEditMoveDown.disabled = !placedEntry;
    editorState.suspend = false;
  }

  function showEditPanelForEntry(entry: PaintingRegistryEntry) {
    const roomsById = app.status.refs.getRoomsById();
    showEditPanelForPainting(entry.painting, entry.room ?? roomsById.get(entry.painting.roomId ?? ""), entry.canvas.material.map?.image, entry.paintingSpot);
  }

  function openPaintingCard(paintingSpot: PaintingSpot) {
    const config = app.status.refs.getConfig();
    cardState.paintingId = paintingSpot.id;
    uiState.selectedPaintingId = paintingSpot.id;
    artCard.classList.toggle("is-editing", uiState.editMode);
    renderPaintingCardContentDom(artCardDomElements, paintingSpot);
    getRenderFilmstrip()?.();
    if (uiState.editMode) {
      const entry = paintingRegistry.get(paintingSpot.id);
      if (entry) {
        showEditPanelForEntry(entry);
      } else {
        const painting = config.paintings.find((p: GalleryPainting) => p.id === paintingSpot.id);
        if (painting) {
          showEditPanelForPainting(painting);
        } else {
          resetEditPanelDom(artEditDomElements);
        }
      }
    } else {
      resetEditPanelDom(artEditDomElements);
    }

    artCard.hidden = false;
  }

  return {
    openPaintingCard,
    closePaintingCard,
    showEditPanelForEntry,
    showEditPanelForPainting,
  };
}
