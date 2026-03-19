import * as THREE_NS from "three";
import type { FilmstripItemViewModel, GalleryPainting, PaintingCardViewModel } from './types';
import { resolveAppUrl } from "./url";

export function toFilmstripItemViewModel(
  painting: GalleryPainting,
  selectedPaintingId: string | null,
  fallbackImage: string
): FilmstripItemViewModel {
  return {
    id: painting.id,
    title: painting.title || painting.id || 'Opera',
    image: resolveAppUrl((painting.image || '').trim()) || fallbackImage,
    isSelected: painting.id === selectedPaintingId,
    isPlaced: painting.placed !== false,
  };
}

export function createPaintingConfigModel(
  input: Partial<GalleryPainting> & Pick<GalleryPainting, 'id'>
): GalleryPainting {
  return {
    id: input.id,
    title: input.title ?? 'Nuova Opera',
    description: input.description ?? '',
    synopsis: input.synopsis ?? {},
    audioAssetId: input.audioAssetId ?? "",
    audioMp4: input.audioMp4 ?? "",
    audioStartSec: input.audioStartSec,
    audioEndSec: input.audioEndSec,
    roomId: input.roomId ?? '',
    wall: input.wall ?? 'north',
    offset: input.offset ?? 1.2,
    customWallId: input.customWallId,
    customWallOffset: input.customWallOffset,
    customWallOffsetCm: input.customWallOffsetCm,
    customWallSide: input.customWallSide,
    centerY: input.centerY ?? 1.65,
    widthCm: input.widthCm ?? 140,
    heightCm: input.heightCm ?? 105,
    frameBorderCm: input.frameBorderCm ?? 6,
    frameColor: input.frameColor ?? "#423934",
    lightOffset: input.lightOffset ? { ...input.lightOffset } : undefined,
    light: input.light
      ? {
          intensity: input.light.intensity,
          distance: input.light.distance,
          angle: input.light.angle,
          penumbra: input.light.penumbra,
          decay: input.light.decay,
        }
      : undefined,
    placed: input.placed ?? false,
    image: input.image ?? '',
  };
}

export function createPseudoPaintingCardViewModel(args: {
  THREE: typeof import("three");
  painting: GalleryPainting;
  visitorPosition: THREE_NS.Vector3;
  cmToM: (cm: number) => number;
  noImagePlaceholder: string | null;
  createPlaceholderPaintingImage: (label: string) => string;
}): PaintingCardViewModel {
  const { THREE, painting, visitorPosition, cmToM, noImagePlaceholder, createPlaceholderPaintingImage } = args;

  return {
    id: painting.id,
    title: painting.title ?? 'Opera',
    description: painting.description ?? '',
    synopsis: painting.synopsis ?? {},
    image: resolveAppUrl((painting.image || '').trim()) || noImagePlaceholder || createPlaceholderPaintingImage('No image'),
    audioMp4: (painting.audioMp4 || "").trim() || undefined,
    audioStartSec: Number.isFinite(Number(painting.audioStartSec)) ? Number(painting.audioStartSec) : undefined,
    audioEndSec: Number.isFinite(Number(painting.audioEndSec)) ? Number(painting.audioEndSec) : undefined,
    center: visitorPosition.clone(),
    normal: new THREE.Vector3(0, 0, 1),
    width: cmToM(painting.widthCm ?? 100),
    height: cmToM(painting.heightCm ?? 75),
  };
}
