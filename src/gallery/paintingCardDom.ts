import type { ArtCardDomElements, ArtEditDomElements } from "./domTypes";
import type { PaintingSpot } from "./types";
import { resolveFileserverRawUrl } from "./url";

export function renderPaintingCardContentDom(elements: ArtCardDomElements, paintingSpot: PaintingSpot) {
  const { artCardTitle, artCardDescription, artCardImage, artCardSynoptic, artCardAudioToggle, artCardAudio } = elements;
  const card = artCardImage.closest<HTMLElement>("#art-card");
  if (card) {
    const isVertical = Number(paintingSpot.height) > Number(paintingSpot.width);
    card.classList.toggle("art-layout-vertical", isVertical);
    card.classList.toggle("art-layout-horizontal", !isVertical);
  }

  artCardTitle.textContent = paintingSpot.title ?? "Opera";
  artCardDescription.textContent = paintingSpot.description ?? "Descrizione non disponibile.";
  artCardImage.src = paintingSpot.image;
  artCardImage.alt = `Anteprima ${paintingSpot.title ?? "opera"}`;
  artCardAudio.pause();
  artCardAudio.currentTime = 0;
  if ((paintingSpot.audioMp4 || "").trim()) {
    artCardAudio.src = resolveFileserverRawUrl(paintingSpot.audioMp4);
    artCardAudio.dataset.startSec = String(Number.isFinite(Number(paintingSpot.audioStartSec)) ? Number(paintingSpot.audioStartSec) : 0);
    artCardAudio.dataset.endSec = Number.isFinite(Number(paintingSpot.audioEndSec)) ? String(Number(paintingSpot.audioEndSec)) : "";
    artCardAudioToggle.hidden = false;
    artCardAudioToggle.dataset.playing = "false";
    artCardAudioToggle.textContent = "🔊";
    artCardAudioToggle.title = "Riproduci audio opera";
  } else {
    artCardAudio.removeAttribute("src");
    delete artCardAudio.dataset.startSec;
    delete artCardAudio.dataset.endSec;
    artCardAudio.load();
    artCardAudioToggle.hidden = true;
    artCardAudioToggle.dataset.playing = "false";
    artCardAudioToggle.textContent = "🔊";
    artCardAudioToggle.title = "";
  }
  artCardSynoptic.innerHTML = "";

  const synoptic = paintingSpot.synopsis ?? {};
  Object.entries(synoptic).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "synoptic-row";
    const label = document.createElement("strong");
    const text = document.createElement("span");
    label.textContent = key;
    text.textContent = String(value);
    row.append(label, text);
    artCardSynoptic.appendChild(row);
  });
}

export function resetEditPanelDom(elements: ArtEditDomElements) {
  const {
    artEditPanel,
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
    artEditHeightCm,
    artEditFrameBorderCm,
    artEditFrameColor,
    artEditCenterYCm,
    artEditImageUrl,
    artEditAudioStatus,
    artEditAudioSelect,
    artEditAudioWaveform,
    artEditAudioStartSec,
    artEditAudioEndSec,
    artEditAudioToggle,
    artEditAudioFile,
    artEditAudioDropZone,
    artEditSynopsisList,
    artEditDelete,
    artEditMoveLeft,
    artEditMoveRight,
    artEditMoveUp,
    artEditMoveDown,
  } = elements;

  artEditPanel.hidden = true;
  artEditId.value = "";
  artEditTitle.value = "";
  artEditDescription.value = "";
  artEditRoom.value = "";
  artEditRoomWidthCm.value = "";
  artEditRoomDepthCm.value = "";
  artEditRoomHeightCm.value = "";
  artEditWall.value = "north";
  artEditOffsetCm.value = "";
  artEditWidthCm.value = "";
  artEditHeightCm.value = "";
  artEditFrameBorderCm.value = "";
  artEditFrameColor.value = "#423934";
  artEditCenterYCm.value = "";
  artEditImageUrl.value = "";
  artEditAudioStatus.textContent = "Nessun audio";
  artEditAudioSelect.value = "";
  const waveformCtx = artEditAudioWaveform.getContext("2d");
  waveformCtx?.clearRect(0, 0, artEditAudioWaveform.width, artEditAudioWaveform.height);
  artEditAudioStartSec.value = "0";
  artEditAudioEndSec.value = "";
  artEditAudioToggle.textContent = "Play audio";
  artEditAudioToggle.disabled = true;
  artEditAudioFile.value = "";
  artEditAudioDropZone.classList.remove("is-drop-target");
  artEditSynopsisList.innerHTML = "";
  artEditDelete.disabled = false;
  artEditMoveLeft.disabled = false;
  artEditMoveRight.disabled = false;
  artEditMoveUp.disabled = false;
  artEditMoveDown.disabled = false;
}

export function addSynopsisFieldRowDom(listEl: HTMLElement, key: string, value: string, focusKey = false) {
  const row = document.createElement("div");
  row.className = "synopsis-edit-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "Campo";
  keyInput.value = key;
  keyInput.dataset.role = "key";

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = "Valore";
  valueInput.value = value;
  valueInput.dataset.role = "value";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.dataset.action = "remove-synopsis";
  removeBtn.textContent = "Rimuovi";

  row.append(keyInput, valueInput, removeBtn);
  listEl.appendChild(row);
  if (focusKey) {
    keyInput.focus();
  }
}

export function fillSynopsisFieldsDom(listEl: HTMLElement, synopsis: Record<string, string> | null | undefined) {
  listEl.innerHTML = "";
  const entries = Object.entries(synopsis ?? {});
  if (!entries.length) {
    addSynopsisFieldRowDom(listEl, "", "");
    return;
  }
  entries.forEach(([key, value]) => {
    addSynopsisFieldRowDom(listEl, key, String(value ?? ""));
  });
}

export function collectSynopsisFromFieldsDom(listEl: HTMLElement) {
  const nextSynopsis: Record<string, string> = {};
  const rows = listEl.querySelectorAll(".synopsis-edit-row");
  rows.forEach((row: Element) => {
    const keyInput = row.querySelector<HTMLInputElement>("input[data-role='key']");
    const valueInput = row.querySelector<HTMLInputElement>("input[data-role='value']");
    const key = (keyInput?.value || "").trim();
    if (!key) {
      return;
    }
    nextSynopsis[key] = (valueInput?.value || "").trim();
  });
  return nextSynopsis;
}
