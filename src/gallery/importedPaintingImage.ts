const MAX_IMPORTED_IMAGE_BYTES = 300 * 1024;
const MIN_SCALE = 0.2;
const SCALE_STEP = 0.85;
const QUALITY_VALUES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

type ImportedPaintingImageData = {
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
};

function measureStringBytes(value: string): number {
  return new Blob([value]).size;
}

function loadImageFromUrl(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossibile leggere l'immagine importata"));
    image.src = imageUrl;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType: string, quality?: number): string {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return canvas.toDataURL();
  }
}

export async function optimizeImportedPaintingImage(file: File, maxBytes = MAX_IMPORTED_IMAGE_BYTES): Promise<ImportedPaintingImageData> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(objectUrl);
    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context non disponibile");
    }

    let best: ImportedPaintingImageData | null = null;
    let scale = 1;
    while (scale >= MIN_SCALE) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      for (const mimeType of ["image/webp", "image/jpeg"]) {
        for (const quality of QUALITY_VALUES) {
          const dataUrl = canvasToDataUrl(canvas, mimeType, quality);
          const byteSize = measureStringBytes(dataUrl);
          const candidate = { dataUrl, width, height, byteSize };
          if (!best || byteSize < best.byteSize) {
            best = candidate;
          }
          if (byteSize <= maxBytes) {
            return candidate;
          }
        }
      }

      scale *= SCALE_STEP;
    }

    if (best) {
      return best;
    }
    throw new Error("Impossibile ottimizzare l'immagine importata");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export { MAX_IMPORTED_IMAGE_BYTES };
