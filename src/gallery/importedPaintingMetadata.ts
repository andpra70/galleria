import type { GalleryPainting } from "./types";
import { optimizeImportedPaintingImage } from "./importedPaintingImage";

type ParsedImportedPaintingMetadata = {
  series: string;
  title: string;
  year: string;
  technique: string;
  widthCm: number | null;
  heightCm: number | null;
};

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeTextSegment(value: string): string {
  return value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumberToken(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

export function parseImportedPaintingMetadata(fileName: string): ParsedImportedPaintingMetadata {
  const baseName = normalizeTextSegment(stripFileExtension(fileName));
  const fullPattern =
    /^(.*?)\s*-\s*(.*?)(?:\s*,\s*(\d{4}))?(?:\s*-\s*(.*?))?(?:\s*-\s*cm\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?))?$/i;
  const match = baseName.match(fullPattern);
  if (!match) {
    return {
      series: "",
      title: baseName,
      year: "",
      technique: "",
      widthCm: null,
      heightCm: null,
    };
  }

  const [, rawSeries, rawTitle, rawYear, rawTechnique, rawWidth, rawHeight] = match;
  const series = normalizeTextSegment(rawSeries ?? "");
  const title = normalizeTextSegment(rawTitle ?? "") || baseName;
  const year = normalizeTextSegment(rawYear ?? "");
  const technique = normalizeTextSegment(rawTechnique ?? "");
  return {
    series,
    title,
    year,
    technique,
    widthCm: parseNumberToken(rawWidth),
    heightCm: parseNumberToken(rawHeight),
  };
}

export function loadImageNaturalSize(imageUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      if (width > 0 && height > 0) {
        resolve({ width, height });
        return;
      }
      reject(new Error("Dimensioni immagine non disponibili"));
    };
    image.onerror = () => reject(new Error("Impossibile leggere l'immagine importata"));
    image.src = imageUrl;
  });
}

export async function applyImportedFileMetadataToPainting(painting: GalleryPainting, file: File) {
  const parsed = parseImportedPaintingMetadata(file.name);
  const optimizedImage = await optimizeImportedPaintingImage(file);
  painting.image = optimizedImage.dataUrl;
  painting.title = parsed.title || painting.title;

  const synopsis: Record<string, string> = { ...(painting.synopsis ?? {}) };
  if (parsed.series) {
    synopsis.Serie = parsed.series;
  }
  if (parsed.year) {
    synopsis.Anno = parsed.year;
  }
  if (parsed.technique) {
    synopsis.Tecnica = parsed.technique;
  }

  if (parsed.series && !(painting.description ?? "").trim()) {
    painting.description = parsed.series;
  }

  let widthCm = parsed.widthCm;
  let heightCm = parsed.heightCm;
  if (optimizedImage.width > 0 && optimizedImage.height > 0) {
    painting.aspectRatio = optimizedImage.width / optimizedImage.height;
  } else if (widthCm != null && heightCm != null) {
    painting.aspectRatio = widthCm / heightCm;
  }

  if (widthCm != null && heightCm != null) {
    painting.widthCm = Math.max(1, widthCm);
    painting.heightCm = Math.max(1, heightCm);
    synopsis.Dimensioni = `${painting.widthCm}x${painting.heightCm} cm`;
  }

  painting.synopsis = synopsis;
}
