import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { CustomWallConfig, GalleryPainting, GalleryRoom, GalleryRoomOpening, GallerySpotLightConfig, ShowConfig, VisitorConfig } from "./types";
import { createPaintingConfigModel } from "./paintingModels";
import { inferProjectNameFromFilePath, normalizeProjectName } from "./projectName";
import { isBlobUrl } from "./url";

type SceneConfigControllerDeps = {
  app: AppContext;
  CM_PER_M: number;
  worldOps: {
    buildRoom: (
      room: GalleryRoom,
      wallColor: THREE_NS.ColorRepresentation,
      ceilingColor: THREE_NS.ColorRepresentation,
      floorMaterial: THREE_NS.Material,
      allRooms?: GalleryRoom[],
      roomOrder?: Map<string, number>
    ) => void;
    buildCustomWalls: (cfg: { customWalls?: CustomWallConfig[] }, wallColor: THREE_NS.ColorRepresentation) => void;
    buildPainting: (painting: GalleryPainting) => void;
    buildNavGrid: () => void;
    clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
  };
  uiOps: {
    applyVisitorConfig: (visitorCfg: VisitorConfig) => void;
    setEditMode: (enabled: boolean) => void;
  };
  getRenderFilmstrip?: () => void;
  getClosePaintingCard?: () => void;
};

type CatalogImportReport = {
  total: number;
  imported: number;
  skipped: number;
  replacedExisting: boolean;
};

type CatalogImportOptions = {
  replaceExisting?: boolean;
};

export function createSceneConfigController(deps: SceneConfigControllerDeps) {
  const {
    app,
    CM_PER_M,
  } = deps;
  const { buildRoom, buildCustomWalls, buildPainting, buildNavGrid, clampToWalkable } = deps.worldOps;
  const { applyVisitorConfig, setEditMode } = deps.uiOps;
  const { status } = app;
  const { THREE, scene, world, camera, loader, renderer } = app.runtime;
  const { artEditRoom } = app.dom;
  const { floorMeshes, paintingSpots, paintingMeshes, paintingPickMeshes, paintingDeleteMeshes, paintingMoveMeshes, wallMeshes, wallColliders, paintingRegistry } =
    app.collections;
  const {
    calculateMapBounds,
    createFloorMaterial,
    createDeleteHandleTexture,
    createMoveHandleTexture,
    createPlaceholderPaintingImage,
    nextPaintingId,
    generateWallId,
    isValidShowConfig,
    cmToM,
    mToCm,
  } = app.helpers;
  const { gallerySettings, mapState, navGrid, visitor, movement, dragPainting, cardState, uiState } = status;

  function syncRoomOptions(rooms: GalleryRoom[]) {
    artEditRoom.innerHTML = "";
    rooms.forEach((room) => {
      const opt = document.createElement("option");
      opt.value = room.id;
      opt.textContent = `${room.id} (${room.name ?? "stanza"})`;
      artEditRoom.appendChild(opt);
    });
  }

  function normalizeWallOpeningsFromCm(openingsInput: unknown, wallHeight: number, defaultWall: string) {
    const openings = Array.isArray(openingsInput) ? openingsInput : [];
    openings.forEach((opening: GalleryRoomOpening) => {
      if (opening.centerCm != null) {
        opening.center = cmToM(opening.centerCm);
      } else {
        opening.centerCm = Math.round(mToCm(opening.center ?? 0));
      }
      if (opening.widthCm != null) {
        opening.width = cmToM(opening.widthCm);
      } else {
        opening.widthCm = Math.round(mToCm(opening.width ?? 0));
      }
      if (opening.heightCm != null) {
        opening.height = cmToM(opening.heightCm);
      } else {
        opening.heightCm = Math.round(mToCm(opening.height ?? wallHeight));
      }
      if (opening.baseCm != null) {
        opening.base = cmToM(opening.baseCm);
      } else {
        opening.baseCm = Math.round(mToCm(opening.base ?? 0));
      }
      opening.wall = opening.wall ?? defaultWall;
    });
    return openings;
  }

  function normalizeRoomsFromCm(rooms: GalleryRoom[]) {
    rooms.forEach((room) => {
      if (room.widthCm != null) {
        room.width = Number(room.widthCm) / CM_PER_M;
      } else {
        room.widthCm = Math.round(room.width * CM_PER_M);
      }

      if (room.depthCm != null) {
        room.depth = Number(room.depthCm) / CM_PER_M;
      } else {
        room.depthCm = Math.round(room.depth * CM_PER_M);
      }

      if (room.heightCm != null) {
        room.height = Number(room.heightCm) / CM_PER_M;
      } else {
        room.heightCm = Math.round(room.height * CM_PER_M);
      }

      room.openings = normalizeWallOpeningsFromCm(room.openings, room.height, "north");
    });
  }

  function normalizeCustomWallsFromCm(cfg: ShowConfig) {
    const customWalls = Array.isArray(cfg.customWalls) ? cfg.customWalls : [];
    cfg.customWalls = customWalls;
    customWalls.forEach((wall: CustomWallConfig) => {
      wall.id = wall.id ?? generateWallId(customWalls);
      if (wall.x1Cm != null) {
        wall.x1 = cmToM(wall.x1Cm);
      } else {
        wall.x1Cm = Math.round(mToCm(wall.x1 ?? 0));
      }
      if (wall.z1Cm != null) {
        wall.z1 = cmToM(wall.z1Cm);
      } else {
        wall.z1Cm = Math.round(mToCm(wall.z1 ?? 0));
      }
      if (wall.x2Cm != null) {
        wall.x2 = cmToM(wall.x2Cm);
      } else {
        wall.x2Cm = Math.round(mToCm(wall.x2 ?? 0));
      }
      if (wall.z2Cm != null) {
        wall.z2 = cmToM(wall.z2Cm);
      } else {
        wall.z2Cm = Math.round(mToCm(wall.z2 ?? 0));
      }
      if (wall.heightCm != null) {
        wall.height = cmToM(wall.heightCm);
      } else {
        wall.heightCm = Math.round(mToCm(wall.height ?? 300));
      }
      if (wall.thicknessCm != null) {
        wall.thickness = cmToM(wall.thicknessCm);
      } else {
        wall.thicknessCm = Math.round(mToCm(wall.thickness ?? 16));
      }
      wall.openings = normalizeWallOpeningsFromCm(wall.openings, wall.height ?? cmToM(300), "north");
    });
  }

  function normalizePaintings(paintings: GalleryPainting[]) {
    paintings.forEach((painting) => {
      if (painting.placed == null) {
        painting.placed = true;
      }
      const lightOffset = painting.lightOffset;
      if (lightOffset && typeof lightOffset === "object") {
        if (lightOffset.xCm != null) {
          lightOffset.x = cmToM(Number(lightOffset.xCm));
        } else if (lightOffset.x != null) {
          lightOffset.xCm = Math.round(mToCm(Number(lightOffset.x)));
        }
        if (lightOffset.yCm != null) {
          lightOffset.y = cmToM(Number(lightOffset.yCm));
        } else if (lightOffset.y != null) {
          lightOffset.yCm = Math.round(mToCm(Number(lightOffset.y)));
        }
        if (lightOffset.zCm != null) {
          lightOffset.z = cmToM(Number(lightOffset.zCm));
        } else if (lightOffset.z != null) {
          lightOffset.zCm = Math.round(mToCm(Number(lightOffset.z)));
        }
      }
      const light = painting.light;
      if (light && typeof light === "object") {
        if (light.intensity != null) {
          light.intensity = Math.max(0, Number(light.intensity));
        }
        if (light.distance != null) {
          light.distance = Math.max(0, Number(light.distance));
        }
        if (light.angle != null) {
          light.angle = Math.min(1.35, Math.max(0.05, Number(light.angle)));
        }
        if (light.penumbra != null) {
          light.penumbra = Math.min(1, Math.max(0, Number(light.penumbra)));
        }
        if (light.decay != null) {
          light.decay = Math.max(0, Number(light.decay));
        }
      }
      if (painting.customWallOffsetCm != null) {
        painting.customWallOffset = cmToM(Number(painting.customWallOffsetCm));
      } else if (painting.customWallOffset != null) {
        painting.customWallOffsetCm = Math.round(mToCm(Number(painting.customWallOffset)));
      }
      if (painting.customWallSide != null) {
        const side = Number(painting.customWallSide);
        painting.customWallSide = side >= 0 ? 1 : -1;
      }
    });
  }

  function normalizeGalleryLightsFromCm(cfg: ShowConfig) {
    const lights = Array.isArray(cfg.galleryLights) ? cfg.galleryLights : [];
    cfg.galleryLights = lights;
    lights.forEach((light: GallerySpotLightConfig) => {
      light.id = light.id ?? `gallery_light_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      if (light.xCm != null) {
        light.x = cmToM(Number(light.xCm));
      } else {
        light.xCm = Math.round(mToCm(Number(light.x ?? 0)));
      }
      if (light.yCm != null) {
        light.y = cmToM(Number(light.yCm));
      } else {
        light.yCm = Math.round(mToCm(Number(light.y ?? 2.9)));
      }
      if (light.zCm != null) {
        light.z = cmToM(Number(light.zCm));
      } else {
        light.zCm = Math.round(mToCm(Number(light.z ?? 0)));
      }

      if (light.targetXCm != null) {
        light.targetX = cmToM(Number(light.targetXCm));
      } else if (light.targetX != null) {
        light.targetXCm = Math.round(mToCm(Number(light.targetX)));
      }
      if (light.targetYCm != null) {
        light.targetY = cmToM(Number(light.targetYCm));
      } else if (light.targetY != null) {
        light.targetYCm = Math.round(mToCm(Number(light.targetY)));
      }
      if (light.targetZCm != null) {
        light.targetZ = cmToM(Number(light.targetZCm));
      } else if (light.targetZ != null) {
        light.targetZCm = Math.round(mToCm(Number(light.targetZ)));
      }

      light.intensity = Math.max(0, Number(light.intensity ?? 8));
      light.distance = Math.max(0.5, Number(light.distance ?? 12));
      if (light.angleDeg != null) {
        const safeDeg = Math.min(80, Math.max(5, Number(light.angleDeg)));
        light.angleDeg = safeDeg;
        light.angle = THREE.MathUtils.degToRad(safeDeg);
      } else {
        const safeRad = Math.min(1.35, Math.max(0.05, Number(light.angle ?? THREE.MathUtils.degToRad(28))));
        light.angle = safeRad;
        light.angleDeg = Math.round(THREE.MathUtils.radToDeg(safeRad));
      }
      light.penumbra = Math.min(1, Math.max(0, Number(light.penumbra ?? 0.22)));
      light.decay = Math.max(0, Number(light.decay ?? 1.2));
    });
  }

  function buildGalleryLights(cfg: ShowConfig) {
    const lights = Array.isArray(cfg.galleryLights) ? cfg.galleryLights : [];
    lights.forEach((light) => {
      const spot = new THREE.SpotLight(
        "#ffffff",
        Number(light.intensity ?? 8),
        Number(light.distance ?? 12),
        Number(light.angle ?? THREE.MathUtils.degToRad(28)),
        Number(light.penumbra ?? 0.22),
        Number(light.decay ?? 1.2)
      );
      const x = Number(light.x ?? 0);
      const y = Number(light.y ?? 2.9);
      const z = Number(light.z ?? 0);
      spot.position.set(x, y, z);
      const target = light.targetPaintingId ? paintingRegistry.get(light.targetPaintingId)?.paintingSpot.center : null;
      if (target) {
        spot.target.position.copy(target);
      } else {
        const tx = Number.isFinite(Number(light.targetX)) ? Number(light.targetX) : x;
        const ty = Number.isFinite(Number(light.targetY)) ? Number(light.targetY) : 1.6;
        const tz = Number.isFinite(Number(light.targetZ)) ? Number(light.targetZ) : z;
        spot.target.position.set(tx, ty, tz);
      }
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      world.add(spot);
      world.add(spot.target);
    });
  }

  function clearWorldObjects() {
    paintingRegistry.forEach((entry) => {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });

    while (world.children.length) {
      const obj = world.children.pop();
      if (!obj) {
        continue;
      }
      const maybeMesh = obj as THREE_NS.Mesh;
      const geometry = (maybeMesh as THREE_NS.Mesh).geometry as THREE_NS.BufferGeometry | undefined;
      if (geometry) {
        geometry.dispose?.();
      }
      const material = (maybeMesh as THREE_NS.Mesh).material as THREE_NS.Material | THREE_NS.Material[] | undefined;
      if (material) {
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose?.());
        } else {
          material.dispose?.();
        }
      }
      const maybeDisposable = obj as unknown as { dispose?: () => void };
      maybeDisposable.dispose?.();
    }

    floorMeshes.length = 0;
    paintingSpots.length = 0;
    paintingMeshes.length = 0;
    paintingPickMeshes.length = 0;
    paintingDeleteMeshes.length = 0;
    paintingMoveMeshes.length = 0;
    wallMeshes.length = 0;
    wallColliders.length = 0;
    paintingRegistry.clear();
  }

  function buildWorld(cfg: ShowConfig) {
    const renderCfg = cfg.rendering ?? {};
    if (renderCfg.wallThicknessCm != null) {
      renderCfg.wallThickness = cmToM(Number(renderCfg.wallThicknessCm));
    } else if (renderCfg.wallThickness != null) {
      renderCfg.wallThicknessCm = Math.round(mToCm(Number(renderCfg.wallThickness)));
    } else {
      renderCfg.wallThickness = cmToM(16);
      renderCfg.wallThicknessCm = 16;
    }
    if (Number.isFinite(renderCfg.cameraFov)) {
      camera.fov = Math.min(120, Math.max(20, Number(renderCfg.cameraFov)));
      camera.updateProjectionMatrix();
    }
    const wallColor = new THREE.Color(renderCfg.wallColor ?? "#ffffff");
    const ceilingColor = new THREE.Color(renderCfg.ceilingColor ?? renderCfg.wallColor ?? "#ffffff");
    const floorColor = new THREE.Color(renderCfg.floorColor ?? "#c7c7c7");
    gallerySettings.defaultPaintingHeight = renderCfg.defaultPaintingHeight ?? gallerySettings.defaultPaintingHeight;

    const previousHemisphere = status.refs.getSceneHemisphereLight();
    if (previousHemisphere) {
      scene.remove(previousHemisphere);
    }
    const previousAmbient = status.refs.getSceneAmbientLight();
    if (previousAmbient) {
      scene.remove(previousAmbient);
    }
    const hemisphere = new THREE.HemisphereLight("#ffffff", "#b3bcc6", renderCfg.ambientLight ?? 0.3);
    const ambient = new THREE.AmbientLight("#ffffff", renderCfg.diffuseAmbient ?? 0.34);
    status.refs.setSceneHemisphereLight(hemisphere);
    status.refs.setSceneAmbientLight(ambient);
    scene.add(hemisphere);
    scene.add(ambient);

    const floorMaterial = createFloorMaterial({ THREE, loader, renderer, renderCfg, floorColor });
    if (!status.refs.getDeleteHandleTexture()) {
      status.refs.setDeleteHandleTexture(createDeleteHandleTexture(THREE));
    }
    if (!status.refs.getMoveHandleTexture()) {
      status.refs.setMoveHandleTexture(createMoveHandleTexture(THREE));
    }
    if (!status.refs.getNoImagePlaceholder()) {
      status.refs.setNoImagePlaceholder(createPlaceholderPaintingImage("No image"));
    }

    normalizeRoomsFromCm(cfg.rooms);
    normalizeCustomWallsFromCm(cfg);
    normalizeGalleryLightsFromCm(cfg);
    status.refs.setRoomsById(new Map(cfg.rooms.map((room) => [room.id, room])));
    syncRoomOptions(cfg.rooms);
    normalizePaintings(cfg.paintings);

    const roomOrder = new Map(cfg.rooms.map((room, index) => [room.id, index]));
    cfg.rooms.forEach((room) => {
      buildRoom(room, wallColor, ceilingColor, floorMaterial, cfg.rooms, roomOrder);
    });
    buildCustomWalls(cfg, wallColor);

    cfg.paintings.forEach((painting) => {
      if (painting.placed === false) {
        return;
      }
      buildPainting(painting);
    });
    buildGalleryLights(cfg);

    calculateMapBounds(cfg.rooms, cfg.customWalls, mapState);
    buildNavGrid();

    const startSafe = clampToWalkable(visitor.position);
    if (startSafe) {
      visitor.position.copy(startSafe);
    }
    deps.getRenderFilmstrip?.();
  }

  function rebuildSceneFromConfig() {
    clearWorldObjects();
    buildWorld(status.refs.getConfig());
  }

  function loadShowConfig(nextConfig: unknown) {
    if (!isValidShowConfig(nextConfig)) {
      throw new Error("Formato mostra.json non valido");
    }
    const cloned = JSON.parse(JSON.stringify(nextConfig));
    cloned.rooms = Array.isArray(cloned.rooms) ? cloned.rooms : [];
    cloned.paintings = Array.isArray(cloned.paintings) ? cloned.paintings : [];
    cloned.projectName = normalizeProjectName(cloned.projectName, inferProjectNameFromFilePath("mostra.json"));
    cloned.paintings.forEach((painting: { image?: unknown }) => {
      if (typeof painting.image === "string" && isBlobUrl(painting.image)) {
        painting.image = "";
      }
    });

    status.refs.setConfig(cloned);
    cardState.paintingId = null;
    uiState.selectedPaintingId = null;
    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = null;
    dragPainting.active = false;

    applyVisitorConfig(cloned.visitor ?? {});
    deps.getClosePaintingCard?.();
    rebuildSceneFromConfig();
    setEditMode(uiState.editMode);
  }

  function createNewCatalogPainting(): GalleryPainting {
    const cfg = status.refs.getConfig();
    const rendering = cfg.rendering ?? {};
    const id = nextPaintingId(cfg.paintings, paintingRegistry);
    return createPaintingConfigModel({
      id,
      roomId: cfg.rooms[0]?.id ?? "",
      wall: "north",
      offset: 1.2,
      centerY: 1.65,
      widthCm: 140,
      heightCm: 105,
      placed: false,
      frameBorderCm: Math.max(0, Number(rendering.defaultPaintingFrameBorderCm ?? 6)),
      frameColor: typeof rendering.defaultPaintingFrameColor === "string" ? rendering.defaultPaintingFrameColor : "#423934",
      image: createPlaceholderPaintingImage("Nuova Opera"),
    });
  }

  function asNonEmptyString(value: unknown): string {
    if (typeof value !== "string") {
      return "";
    }
    return value.trim();
  }

  function parseCatalogDimensions(value: string): { widthCm: number; heightCm: number } | null {
    const normalized = value.replace(/,/g, ".").trim();
    if (!normalized) {
      return null;
    }
    const match = normalized.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (!match) {
      return null;
    }

    const widthCm = Number(match[1]);
    const heightCm = Number(match[2]);
    if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) {
      return null;
    }
    return { widthCm, heightCm };
  }

  function getCatalogWorks(payload: unknown): Array<Record<string, unknown>> {
    if (!payload || typeof payload !== "object") {
      return [];
    }

    const root = payload as { works?: unknown; catalog?: { works?: unknown } };
    const rawWorks = Array.isArray(root.works) ? root.works : Array.isArray(root.catalog?.works) ? root.catalog.works : [];
    return rawWorks.filter((work): work is Record<string, unknown> => Boolean(work) && typeof work === "object");
  }

  function buildWorkSynopsis(work: Record<string, unknown>, dimensionsLabel: string): Record<string, string> {
    const synopsis: Record<string, string> = {};
    const author = asNonEmptyString(work.author);
    const year = asNonEmptyString(work.year);
    const type = asNonEmptyString(work.type);
    const technique = asNonEmptyString(work.technique);
    const inventory = asNonEmptyString(work.inventory);
    const location = asNonEmptyString(work.location);
    const notes = asNonEmptyString(work.notes);

    if (author) {
      synopsis.Artista = author;
    }
    if (year) {
      synopsis.Anno = year;
    }
    if (type) {
      synopsis.Tipo = type;
    }
    if (technique) {
      synopsis.Tecnica = technique;
    }
    if (dimensionsLabel) {
      synopsis.Dimensioni = dimensionsLabel;
    }
    if (inventory) {
      synopsis.Inventario = inventory;
    }
    if (location) {
      synopsis.Collocazione = location;
    }
    if (notes) {
      synopsis.Note = notes;
    }
    return synopsis;
  }

  function importCatalogWorks(catalogData: unknown, options: CatalogImportOptions = {}): CatalogImportReport {
    const replaceExisting = options.replaceExisting === true;
    const works = getCatalogWorks(catalogData);
    if (!works.length) {
      throw new Error("Formato catalogo.json non valido: catalog.works non trovato");
    }

    const cfg = status.refs.getConfig();
    const rendering = cfg.rendering ?? {};
    if (replaceExisting) {
      cfg.paintings = [];
      cardState.paintingId = null;
      uiState.selectedPaintingId = null;
      deps.getClosePaintingCard?.();
    }
    const defaultRoomId = cfg.rooms[0]?.id ?? "";
    let imported = 0;
    let skipped = 0;

    works.forEach((work, index) => {
      const providedId = asNonEmptyString(work.id);
      const paintingId = providedId || nextPaintingId(cfg.paintings, paintingRegistry);
      if (cfg.paintings.some((painting) => painting.id === paintingId)) {
        skipped += 1;
        return;
      }

      const title = asNonEmptyString(work.title) || paintingId || `Opera ${index + 1}`;
      const rawDimensions = asNonEmptyString((work as { dimensioni?: unknown }).dimensioni) || asNonEmptyString(work.dimensions);
      const parsedDimensions = parseCatalogDimensions(rawDimensions);
      const dimensionsLabel = parsedDimensions ? `${parsedDimensions.widthCm}x${parsedDimensions.heightCm} cm` : rawDimensions;
      const synopsis = buildWorkSynopsis(work, dimensionsLabel);
      const summary = [
        asNonEmptyString(work.author),
        asNonEmptyString(work.year),
        asNonEmptyString(work.technique),
        asNonEmptyString(work.type),
      ].filter(Boolean);
      const notes = asNonEmptyString(work.notes);
      const description = notes || summary.join(" - ");
      const image = asNonEmptyString(work.imageUrl) || createPlaceholderPaintingImage(title || "Opera");

      cfg.paintings.push(
        createPaintingConfigModel({
          id: paintingId,
          title,
          description,
          synopsis,
          image,
          roomId: defaultRoomId,
          wall: "north",
          offset: 1.2,
          centerY: 1.65,
          widthCm: parsedDimensions?.widthCm ?? 140,
          heightCm: parsedDimensions?.heightCm ?? 105,
          frameBorderCm: Math.max(0, Number(rendering.defaultPaintingFrameBorderCm ?? 6)),
          frameColor: typeof rendering.defaultPaintingFrameColor === "string" ? rendering.defaultPaintingFrameColor : "#423934",
          placed: false,
        })
      );
      imported += 1;
    });

    if (replaceExisting) {
      rebuildSceneFromConfig();
    }

    return {
      total: works.length,
      imported,
      skipped,
      replacedExisting: replaceExisting,
    };
  }

  return {
    buildWorld,
    rebuildSceneFromConfig,
    loadShowConfig,
    createNewCatalogPainting,
    importCatalogWorks,
  };
}
