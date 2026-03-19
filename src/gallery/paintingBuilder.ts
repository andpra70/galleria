import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import { isBlobUrl, resolveAppUrl } from "./url";
import type {
  GalleryPainting,
  PaintingCanvasMesh,
  PaintingFrameMesh,
  PaintingHandleMesh,
  PaintingRegistryEntry,
  PaintingSpot,
} from "./types";

type PaintingBuilderDeps = {
  app: AppContext;
  placementOps: {
    applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
  };
  imageOps: {
    inferPaintingDimensions: (painting: GalleryPainting, image: CanvasImageSource | null) => { width: number; height: number };
    applyPaintingDimensions: (
      frame: PaintingFrameMesh,
      canvas: PaintingCanvasMesh,
      dimensions: { width: number; height: number },
      border: number,
      frameDepth: number,
      paintingSpot: PaintingSpot
    ) => void;
    applyPaintingImage: (entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl?: boolean) => void;
  };
};

export function createPaintingBuilder(deps: PaintingBuilderDeps) {
  const { app, placementOps, imageOps } = deps;
  const { THREE, loader, renderer, world } = app.runtime;
  const { uiState } = app.status;
  const { paintingSpots, paintingMeshes, paintingPickMeshes, paintingDeleteMeshes, paintingMoveMeshes, paintingRegistry } = app.collections;
  const { createPlaceholderPaintingImage } = app.helpers;
  const getRoomsById = app.status.refs.getRoomsById;
  const getNoImagePlaceholder = app.status.refs.getNoImagePlaceholder;
  const getDeleteHandleTexture = app.status.refs.getDeleteHandleTexture;
  const getMoveHandleTexture = app.status.refs.getMoveHandleTexture;
  const { inferPaintingDimensions, applyPaintingDimensions, applyPaintingImage } = imageOps;
  const { applyPaintingPlacement } = placementOps;
  const getLightOffset = (painting: GalleryPainting) => ({
    x: painting.lightOffset?.x ?? 0,
    y: painting.lightOffset?.y ?? 1.75,
    z: painting.lightOffset?.z ?? 0.9,
  });
  const applySpotLightConfig = (spot: THREE_NS.SpotLight, _painting: GalleryPainting) => {
    spot.intensity = 0;
    spot.distance = 0;
    spot.angle = 0.4;
    spot.penumbra = 0;
    spot.decay = 1;
    spot.visible = false;
  };

  return function buildPainting(painting: GalleryPainting) {
    const room = getRoomsById().get(painting.roomId ?? "");
    if (!room && !painting.customWallId) {
      return;
    }
    painting.placed = true;

    const frameDepth = 0.06;
    const border = Math.max(0, (painting.frameBorderCm ?? 6) / 100);
    const initialDimensions = inferPaintingDimensions(painting, null);
    let canvas: PaintingCanvasMesh | undefined;
    let paintingSpot: PaintingSpot | undefined;
    let entry: PaintingRegistryEntry | undefined;
    const sourceImage = (painting.image || "").trim();
    const noImagePlaceholder = getNoImagePlaceholder();
    const activeImage = sourceImage || noImagePlaceholder || createPlaceholderPaintingImage("No image");
    const resolvedActiveImage = resolveAppUrl(activeImage);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(initialDimensions.width + border * 2, initialDimensions.height + border * 2, frameDepth),
      new THREE.MeshStandardMaterial({ color: painting.frameColor ?? "#423934", roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide })
    ) as PaintingFrameMesh;

    const imageTexture = loader.load(
      resolvedActiveImage,
      (texture: THREE_NS.Texture) => {
        if (!canvas || !paintingSpot || !entry) {
          return;
        }
        const loadedImage = (texture.image ?? null) as CanvasImageSource | null;
        const updated = inferPaintingDimensions(painting, loadedImage);
        applyPaintingDimensions(frame, canvas, updated, border, frameDepth, paintingSpot);
        applyPaintingPlacement(entry);
      },
      undefined,
      () => {
        console.warn(`Impossibile caricare l'immagine ${resolvedActiveImage}`);
        const fallbackImage = getNoImagePlaceholder();
        if (entry && fallbackImage && activeImage !== fallbackImage) {
          applyPaintingImage(entry, fallbackImage, false);
          entry.hasSourceImage = false;
          return;
        }
        if (entry && isBlobUrl(sourceImage)) {
          entry.painting.image = "";
          entry.hasSourceImage = false;
        }
      }
    );
    imageTexture.colorSpace = THREE.SRGBColorSpace;
    imageTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(initialDimensions.width, initialDimensions.height),
      new THREE.MeshStandardMaterial({ map: imageTexture, roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide })
    ) as PaintingCanvasMesh;

    frame.position.set(0, 0, 0);
    frame.quaternion.identity();
    frame.castShadow = true;
    frame.userData.paintingId = painting.id;
    world.add(frame);

    canvas.position.set(0, 0, 0);
    canvas.quaternion.identity();
    canvas.userData.paintingId = painting.id;
    world.add(canvas);

    const spot = new THREE.SpotLight("#ffffff", 0, 0, 0.4, 0, 1);
    applySpotLightConfig(spot, painting);
    const lightOffset = getLightOffset(painting);
    const lightRight = new THREE.Vector3(1, 0, 0);
    spot.position
      .set(0, 0, 0)
      .add(lightRight.multiplyScalar(lightOffset.x))
      .add(new THREE.Vector3(0, lightOffset.y, 0))
      .add(new THREE.Vector3(0, 0, lightOffset.z));
    spot.target.position.set(0, 0, 0);
    spot.castShadow = false;
    world.add(spot);
    world.add(spot.target);

    const deleteHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: getDeleteHandleTexture() ?? undefined, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    ) as PaintingHandleMesh;
    deleteHandle.renderOrder = 10;
    deleteHandle.userData.paintingId = painting.id;
    deleteHandle.visible = uiState.editMode;
    world.add(deleteHandle);

    const moveHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({ map: getMoveHandleTexture() ?? undefined, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    ) as PaintingHandleMesh;
    moveHandle.renderOrder = 10;
    moveHandle.userData.paintingId = painting.id;
    moveHandle.visible = uiState.editMode;
    world.add(moveHandle);

    paintingSpot = {
      id: painting.id,
      title: painting.title,
      description: painting.description ?? "",
      synopsis: painting.synopsis ?? {},
      image: resolveAppUrl(sourceImage || activeImage),
      center: new THREE.Vector3(0, painting.centerY ?? 1.65, 0),
      normal: new THREE.Vector3(0, 0, 1),
      width: initialDimensions.width,
      height: initialDimensions.height,
    };
    paintingSpots.push(paintingSpot);
    frame.userData.paintingSpot = paintingSpot;
    canvas.userData.paintingSpot = paintingSpot;
    paintingMeshes.push(canvas);
    paintingPickMeshes.push(frame);
    paintingPickMeshes.push(canvas);
    paintingDeleteMeshes.push(deleteHandle);
    paintingMoveMeshes.push(moveHandle);

    entry = {
      painting,
      room,
      frame,
      canvas,
      spot,
      spotTarget: spot.target,
      deleteHandle,
      moveHandle,
      paintingSpot,
      border,
      frameDepth,
      objectUrl: null,
      hasSourceImage: Boolean(sourceImage),
    };
    paintingRegistry.set(painting.id, entry);
    applyPaintingPlacement(entry);
  };
}
