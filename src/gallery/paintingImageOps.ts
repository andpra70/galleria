import type { AppContext } from "./appServices";
import type { PaintingRegistryEntry, PaintingSpot, GalleryPainting } from "./types";
type MeshLike = any;

type PaintingDimensions = { width: number; height: number };

type PaintingImageOpsDeps = {
  app: AppContext;
  CM_PER_M: number;
  artCardImage: HTMLImageElement;
  applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
  getShowEditPanelForEntry: () => ((entry: PaintingRegistryEntry) => void) | undefined;
};

export function createPaintingImageOps(deps: PaintingImageOpsDeps) {
  const {
    app,
    CM_PER_M,
    artCardImage,
    applyPaintingPlacement,
    getShowEditPanelForEntry,
  } = deps;
  const { THREE, loader, renderer } = app.runtime;
  const { gallerySettings, cardState, uiState } = app.status;
  const { cmToM } = app.helpers;

  function resolvePaintingAspectRatio(painting: GalleryPainting, image: any) {
    const imageWidth = image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0;
    const imageHeight = image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0;
    if (imageWidth > 0 && imageHeight > 0) {
      const ratioFromImage = imageWidth / imageHeight;
      painting.aspectRatio = ratioFromImage;
      return ratioFromImage;
    }
    const knownRatio = Number(painting.aspectRatio);
    if (Number.isFinite(knownRatio) && knownRatio > 0) {
      return knownRatio;
    }
    if (painting.width && painting.height && painting.height > 0) {
      const ratioFromLegacy = painting.width / painting.height;
      painting.aspectRatio = ratioFromLegacy;
      return ratioFromLegacy;
    }
    if (painting.widthCm && painting.heightCm && painting.heightCm > 0) {
      const ratioFromCm = painting.widthCm / painting.heightCm;
      painting.aspectRatio = ratioFromCm;
      return ratioFromCm;
    }
    painting.aspectRatio = 4 / 3;
    return painting.aspectRatio;
  }

  function inferPaintingDimensions(painting: GalleryPainting, image: any): PaintingDimensions {
    const ratio = resolvePaintingAspectRatio(painting, image);
    if (painting.widthCm != null) {
      const widthCm = Math.max(1, Number(painting.widthCm));
      const heightCm = Math.max(1, Math.round(widthCm / ratio));
      painting.widthCm = widthCm;
      painting.heightCm = heightCm;
      const width = Math.max(0.01, cmToM(widthCm));
      const height = Math.max(0.01, cmToM(heightCm));
      return { width, height };
    }

    const baseHeight = painting.baseHeight ?? gallerySettings.defaultPaintingHeight;
    const scale = painting.scale ?? 1;
    const desiredHeight = Math.max(0.2, baseHeight * scale);
    const width = desiredHeight * ratio;
    const height = desiredHeight;
    painting.widthCm = Math.max(1, Math.round(width * CM_PER_M));
    painting.heightCm = Math.max(1, Math.round(height * CM_PER_M));
    return { width, height };
  }

  function applyPaintingDimensions(
    frame: MeshLike,
    canvas: MeshLike,
    dimensions: PaintingDimensions,
    border: number,
    frameDepth: number,
    paintingSpot: PaintingSpot
  ) {
    frame.geometry.dispose();
    frame.geometry = new THREE.BoxGeometry(dimensions.width + border * 2, dimensions.height + border * 2, frameDepth);

    canvas.geometry.dispose();
    canvas.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);

    paintingSpot.width = dimensions.width;
    paintingSpot.height = dimensions.height;
  }

  function applyPaintingImage(entry: PaintingRegistryEntry, imageUrl: string, isObjectUrl = false) {
    const texture = loader.load(
      imageUrl,
      (loaded: any) => {
        const updated = inferPaintingDimensions(entry.painting, loaded.image);
        applyPaintingDimensions(entry.frame, entry.canvas, updated, entry.border, entry.frameDepth, entry.paintingSpot);
        applyPaintingPlacement(entry);
        if (cardState.paintingId === entry.painting.id) {
          artCardImage.src = imageUrl;
          if (uiState.editMode) {
            getShowEditPanelForEntry()?.(entry);
          }
        }
      },
      undefined,
      () => {
        console.warn(`Impossibile caricare l'immagine ${imageUrl}`);
        const noImagePlaceholder = app.status.refs.getNoImagePlaceholder();
        if (noImagePlaceholder && imageUrl !== noImagePlaceholder) {
          applyPaintingImage(entry, noImagePlaceholder, false);
          entry.hasSourceImage = false;
        }
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const mat = entry.canvas.material;
    const oldMap = mat.map;
    mat.map = texture;
    mat.needsUpdate = true;
    if (oldMap && oldMap !== texture) {
      oldMap.dispose();
    }

    if (isObjectUrl) {
      if (entry.objectUrl && entry.objectUrl !== imageUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
      entry.objectUrl = imageUrl;
    }
    entry.painting.image = imageUrl;
    entry.paintingSpot.image = imageUrl;
    entry.hasSourceImage = imageUrl !== app.status.refs.getNoImagePlaceholder();
  }

  return {
    inferPaintingDimensions,
    resolvePaintingAspectRatio,
    applyPaintingDimensions,
    applyPaintingImage,
  };
}
