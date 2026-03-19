import * as THREE_NS from "three";
import { getFirstJsonFile, getImageFiles, hasImagePayload } from "./files";
import {
  createFileserverClient,
  extractFileserverTextContent,
  getFileserverBaseName,
  getFileserverDirectoryPath,
  hasFileserverDirectoryChild,
} from "./fileserverClient";
import { applyImportedFileMetadataToPainting } from "./importedPaintingMetadata";
import { optimizeImportedPaintingImage } from "./importedPaintingImage";
import { inferProjectNameFromFilePath, normalizeProjectName, projectNameToFilename, projectNameToFileserverPath } from "./projectName";
import { isBlobUrl } from "./url";
import type { AppContext } from "./appServices";
import type { GalleryPainting, PaintingRegistryEntry, PaintingSpot } from "./types";

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
  placeCatalogPaintingAtWall: (
    paintingId: string,
    clientX: number,
    clientY: number,
    options?: { openCard?: boolean }
  ) => boolean;
  handleWallCreateClick: (clientX: number, clientY: number) => boolean;
  handleFloorMove: (clientX: number, clientY: number) => boolean;
};

type InputEventHandlersDeps = {
  app: AppContext;
  MIN_PITCH: number;
  MAX_PITCH: number;
  createNewCatalogPainting: () => GalleryPainting;
  paintingInteractions: PaintingInteractionsApi;
  applyPaintingImage: (entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl?: boolean) => void;
  closePaintingCard: () => void;
  loadShowConfig: (nextConfig: unknown) => void;
  importCatalogWorks: (
    catalogData: unknown,
    options?: { replaceExisting?: boolean }
  ) => { total: number; imported: number; skipped: number; replacedExisting: boolean };
  setEditMode: (enabled: boolean) => void;
  renderFilmstrip: () => void;
  syncConfigPanel: () => void;
  persistCameraViewConfig?: () => void;
  actions: InteractionActions;
};

export function createInputEventHandlers(deps: InputEventHandlersDeps) {
  const {
    app,
    MIN_PITCH,
    MAX_PITCH,
    createNewCatalogPainting,
    paintingInteractions,
    applyPaintingImage,
    closePaintingCard,
    loadShowConfig,
    importCatalogWorks,
    setEditMode,
    renderFilmstrip,
    syncConfigPanel,
    persistCameraViewConfig,
    actions,
  } = deps;
  const { status } = app;
  const { mapState, visitor, movement, touchState, dragPainting, uiState } = status;
  const { THREE, raycaster } = app.runtime;
  const { minimapCanvas, configPanel } = app.dom;
  const { paintingPickMeshes, paintingRegistry } = app.collections;
  const { minimapClientToWorld } = app.helpers;
  const { clampToWalkable, moveVisitorTo, setPointerRay, placeCatalogPaintingAtWall, handleWallCreateClick, handleFloorMove } = actions;
  const saveProgressEl = configPanel.querySelector<HTMLElement>("#config-save-progress");
  const saveButtonEl = configPanel.querySelector<HTMLButtonElement>("#config-save-local");
  const toastHostEl = document.getElementById("toast-host");
  let lastTapTimeMs = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  const readWalkDebugFlag = () => {
    try {
      return (window as Window & { __walkDebug?: boolean }).__walkDebug === true || window.localStorage.getItem("walk_debug") === "1";
    } catch {
      return false;
    }
  };
  const walkDebug = (...args: unknown[]) => {
    if (readWalkDebugFlag()) {
      console.debug("[walk]", ...args);
    }
  };

  function setSaveProgress(message: string, state: "idle" | "busy" | "error" = "idle") {
    if (saveProgressEl) {
      saveProgressEl.textContent = message;
      saveProgressEl.classList.toggle("busy", state === "busy");
      saveProgressEl.classList.toggle("error", state === "error");
    }
    if (saveButtonEl) {
      saveButtonEl.disabled = state === "busy";
      saveButtonEl.textContent = state === "busy" ? "Salvataggio..." : "Salva";
      saveButtonEl.setAttribute("aria-busy", state === "busy" ? "true" : "false");
    }
  }

  function showToast(message: string, tone: "success" | "error" = "success") {
    if (!toastHostEl) {
      return;
    }
    const toast = document.createElement("div");
    toast.className = `toast ${tone}`;
    toast.textContent = message;
    toastHostEl.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 2600);
    window.setTimeout(() => {
      toast.remove();
    }, 2900);
  }

  function isCatalogPayload(value: unknown): boolean {
    if (!value || typeof value !== "object") {
      return false;
    }
    const candidate = value as { works?: unknown; catalog?: { works?: unknown } };
    return Array.isArray(candidate.works) || Array.isArray(candidate.catalog?.works);
  }

  function askReplaceExistingPaintings(): boolean {
    return window.confirm(
      "Eliminare le opere gia presenti prima di importare catalogo.json?\n\nOK = elimina le opere esistenti\nAnnulla = mantieni le opere esistenti"
    );
  }

  function applyCatalogImport(loaded: unknown, replaceExisting: boolean) {
    const report = importCatalogWorks(loaded, { replaceExisting });
    if (!uiState.editMode) {
      setEditMode(true);
    } else if (!report.replacedExisting) {
      renderFilmstrip();
    }
    syncConfigPanel();
    window.alert(
      `Catalogo caricato: ${report.imported}/${report.total} opere importate${report.skipped ? `, ${report.skipped} gia presenti` : ""}.`
    );
  }

  const DEFAULT_FILESERVER_API_BASE = (import.meta.env.VITE_FILESERVER_API_BASE || "/fileserver/api").trim();
  const DEFAULT_FILESERVER_SHOW_DIRECTORY = (import.meta.env.VITE_FILESERVER_SHOW_DIRECTORY || "galleria").trim();

  function createPersistableShowConfig() {
    const cloned = JSON.parse(JSON.stringify(status.refs.getConfig()));
    cloned.projectName = normalizeProjectName(cloned.projectName);
    cloned.paintings = Array.isArray(cloned.paintings) ? cloned.paintings : [];
    cloned.paintings.forEach((painting: { image?: unknown }) => {
      if (typeof painting.image === "string" && isBlobUrl(painting.image)) {
        painting.image = "";
      }
    });
    return cloned;
  }

  function getCurrentProjectName() {
    return normalizeProjectName(status.refs.getConfig().projectName);
  }

  function getFileserverShowPath() {
    return projectNameToFileserverPath(getCurrentProjectName(), DEFAULT_FILESERVER_SHOW_DIRECTORY);
  }

  function createShowFileserverClient() {
    return createFileserverClient({ apiBase: DEFAULT_FILESERVER_API_BASE });
  }

  async function ensureFileserverDirectory(client: ReturnType<typeof createFileserverClient>, filePath: string) {
    const directoryPath = getFileserverDirectoryPath(filePath);
    if (!directoryPath || directoryPath === "/") {
      return;
    }

    const segments = directoryPath.split("/").filter(Boolean);
    let parentPath = "";
    for (const segment of segments) {
      setSaveProgress(`Verifica cartella: ${parentPath ? `${parentPath}/` : ""}${segment}`, "busy");
      const listing = await client.listDirectory(parentPath);
      if (!hasFileserverDirectoryChild(listing, segment)) {
        setSaveProgress(`Creazione cartella: ${parentPath ? `${parentPath}/` : ""}${segment}`, "busy");
        await client.createFolder(parentPath, segment);
      }
      parentPath = parentPath ? `${parentPath}/${segment}` : segment;
    }
  }

  async function saveCurrentShowToFileserver() {
    const path = getFileserverShowPath();
    const client = createShowFileserverClient();
    setSaveProgress("Preparazione mostra.json", "busy");
    const serialized = JSON.stringify(createPersistableShowConfig(), null, 2);
    await ensureFileserverDirectory(client, path);
    try {
      setSaveProgress(`Scrittura file: ${getFileserverBaseName(path)}`, "busy");
      await client.saveFileContent(path, serialized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/ENOENT/i.test(message)) {
        throw error;
      }
      setSaveProgress(`Creazione file: ${getFileserverBaseName(path)}`, "busy");
      await client.uploadTextFile(getFileserverDirectoryPath(path), getFileserverBaseName(path), serialized);
    }
    setSaveProgress(`Salvataggio completato:\n${path}`);
    return path;
  }

  async function loadShowFromFileserver() {
    const path = getFileserverShowPath();
    const client = createShowFileserverClient();
    let rawText: string;
    try {
      const response = await client.loadFileContent(path);
      rawText = extractFileserverTextContent(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/File too large to edit/i.test(message)) {
        throw error;
      }
      rawText = await client.loadRawFileText(path);
    }
    const loaded = JSON.parse(rawText) as { projectName?: unknown };
    loaded.projectName = normalizeProjectName(loaded.projectName, inferProjectNameFromFilePath(path));
    return loaded;
  }

  async function importShowJsonFromFile(file: File) {
    const raw = await file.text();
    const loaded = JSON.parse(raw) as { projectName?: unknown };
    if (!app.helpers.isValidShowConfig(loaded)) {
      throw new Error("Formato mostra.json non valido");
    }
    loaded.projectName = normalizeProjectName(loaded.projectName, inferProjectNameFromFilePath(file.name));
    loadShowConfig(loaded);
    syncConfigPanel();
  }

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
    handleFloorMove(event.clientX, event.clientY);
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

    const nowMs = performance.now();
    const tapDx = changed.clientX - lastTapX;
    const tapDy = changed.clientY - lastTapY;
    const isDoubleTap = nowMs - lastTapTimeMs <= 320 && tapDx * tapDx + tapDy * tapDy <= 24 * 24;
    lastTapTimeMs = nowMs;
    lastTapX = changed.clientX;
    lastTapY = changed.clientY;

    if (isDoubleTap) {
      if (paintingInteractions.handlePaintingInstantMoveOnDoubleClick(changed.clientX, changed.clientY)) {
        return;
      }
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
    const draggedPaintingId = event.dataTransfer?.getData("application/x-gallery-painting-id");
    if (draggedPaintingId || hasImagePayload(event.dataTransfer)) {
      event.preventDefault();
    }
  }

  async function onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    const draggedPaintingId = event.dataTransfer?.getData("application/x-gallery-painting-id");
    if (draggedPaintingId) {
      if (!uiState.editMode) {
        return;
      }
      if (placeCatalogPaintingAtWall(draggedPaintingId, event.clientX, event.clientY, { openCard: false })) {
        renderFilmstrip();
      }
      return;
    }

    const imageFiles = getImageFiles(event.dataTransfer);
    if (!imageFiles.length) {
      return;
    }

    if (!uiState.editMode) {
      setEditMode(true);
    }

    const config = app.status.refs.getConfig();
    const created: GalleryPainting[] = [];
    for (const file of imageFiles) {
      const painting = createNewCatalogPainting();
      await applyImportedFileMetadataToPainting(painting, file);
      config.paintings.push(painting);
      if (!placeCatalogPaintingAtWall(painting.id, event.clientX, event.clientY, { openCard: false })) {
        const index = config.paintings.indexOf(painting);
        if (index >= 0) {
          config.paintings.splice(index, 1);
        }
        if (painting.image && isBlobUrl(painting.image)) {
          URL.revokeObjectURL(painting.image);
        }
        break;
      }
      created.push(painting);
    }

    if (created.length) {
      uiState.selectedPaintingId = created[created.length - 1]?.id ?? null;
      renderFilmstrip();
      closePaintingCard();
      return;
    }

    const file = imageFiles[0];
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

    const optimizedImage = await optimizeImportedPaintingImage(file);
    entry.painting.aspectRatio = optimizedImage.width / optimizedImage.height;
    applyPaintingImage(entry, optimizedImage.dataUrl, false);
    renderFilmstrip();
    closePaintingCard();
  }

  function onConfigPanelDragOver(event: DragEvent) {
    const jsonFile = getFirstJsonFile(event.dataTransfer);
    if (!jsonFile) {
      return;
    }
    event.preventDefault();
    configPanel.classList.add("drop-target");
  }

  function onConfigPanelDragLeave(event: DragEvent) {
    event.preventDefault();
    configPanel.classList.remove("drop-target");
  }

  async function onConfigPanelDrop(event: DragEvent) {
    const jsonFile = getFirstJsonFile(event.dataTransfer);
    event.preventDefault();
    configPanel.classList.remove("drop-target");
    if (!jsonFile) {
      return;
    }

    try {
      const raw = await jsonFile.text();
      const loaded = JSON.parse(raw) as { projectName?: unknown };
      if (app.helpers.isValidShowConfig(loaded)) {
        loaded.projectName = normalizeProjectName(loaded.projectName, inferProjectNameFromFilePath(jsonFile.name));
        loadShowConfig(loaded);
        syncConfigPanel();
        return;
      }
      if (isCatalogPayload(loaded)) {
        const replaceExisting = askReplaceExistingPaintings();
        applyCatalogImport(loaded, replaceExisting);
        return;
      }
      throw new Error("Formato JSON non supportato");
    } catch (error) {
      console.error("Errore caricamento JSON dal pannello:", error);
      window.alert("JSON non valido. Usa mostra.json o catalogo.json.");
    }
  }

  async function onSaveLocalShow() {
    try {
      persistCameraViewConfig?.();
      const savedPath = await saveCurrentShowToFileserver();
      if (!savedPath) {
        setSaveProgress("");
        return;
      }
      showToast(`Mostra salvata su fileserver:\n${savedPath}`, "success");
    } catch (error) {
      console.error("Errore salvataggio fileserver:", error);
      setSaveProgress(`Errore salvataggio:\n${error instanceof Error ? error.message : String(error)}`, "error");
      showToast(`Salvataggio fileserver fallito.\n${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function onLoadLocalShow() {
    try {
      const loaded = await loadShowFromFileserver();
      if (!loaded) {
        return;
      }
      if (!app.helpers.isValidShowConfig(loaded)) {
        return;
      }
      loadShowConfig(loaded);
      syncConfigPanel();
      showToast(`Mostra caricata da fileserver:\n${projectNameToFileserverPath(normalizeProjectName(loaded.projectName), DEFAULT_FILESERVER_SHOW_DIRECTORY)}`, "success");
    } catch (error) {
      console.error("Errore caricamento fileserver:", error);
      showToast(`Caricamento fileserver fallito.\n${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  function onExportShowJson() {
    persistCameraViewConfig?.();
    const serialized = JSON.stringify(createPersistableShowConfig(), null, 2);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = projectNameToFilename(getCurrentProjectName());
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportShowJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        await importShowJsonFromFile(file);
      } catch (error) {
        console.error("Errore import mostra.json:", error);
        window.alert("JSON non valido. Seleziona un file mostra.json.");
      }
    };
    input.click();
  }

  function onImportCatalogJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        const raw = await file.text();
        const loaded = JSON.parse(raw);
        if (!isCatalogPayload(loaded)) {
          throw new Error("Formato catalogo non valido");
        }
        const replaceExisting = askReplaceExistingPaintings();
        applyCatalogImport(loaded, replaceExisting);
      } catch (error) {
        console.error("Errore import catalogo.json da file:", error);
        window.alert("JSON catalogo non valido.");
      }
    };
    input.click();
  }

  function onMinimapClick(event: MouseEvent) {
    if (dragPainting.active) {
      return;
    }
    const pos = minimapClientToWorld(event.clientX, event.clientY, minimapCanvas, mapState);
    if (!pos) {
      walkDebug("minimap click: invalid world pos", { clientX: event.clientX, clientY: event.clientY });
      return;
    }
    const target = new THREE.Vector3(pos.x, visitor.eyeHeight, pos.z);
    const clamped = clampToWalkable(target);
    if (!clamped) {
      walkDebug("minimap click: target not walkable", {
        x: Number(target.x.toFixed(3)),
        z: Number(target.z.toFixed(3)),
      });
      return;
    }
    walkDebug("minimap click -> moveVisitorTo", {
      x: Number(clamped.x.toFixed(3)),
      z: Number(clamped.z.toFixed(3)),
    });
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
    onConfigPanelDragOver,
    onConfigPanelDragLeave,
    onConfigPanelDrop,
    onSaveLocalShow,
    onLoadLocalShow,
    onExportShowJson,
    onImportShowJson,
    onImportCatalogJson,
    onMinimapClick,
  };
}
