export function getFirstImageFile(dataTransfer?: DataTransfer | null): File | null {
  return getImageFiles(dataTransfer)[0] ?? null;
}

export function hasImagePayload(dataTransfer?: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  if (getImageFiles(dataTransfer).length > 0) {
    return true;
  }
  if (dataTransfer.items?.length) {
    for (const item of dataTransfer.items) {
      if (item.kind === "file" && item.type?.startsWith("image/")) {
        return true;
      }
    }
  }
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

export function getImageFiles(dataTransfer?: DataTransfer | null): File[] {
  if (!dataTransfer?.files?.length) {
    return [];
  }
  const files: File[] = [];
  for (const file of dataTransfer.files) {
    if (file.type?.startsWith("image/")) {
      files.push(file);
    }
  }
  return files;
}

export function getFirstJsonFile(dataTransfer?: DataTransfer | null): File | null {
  if (!dataTransfer?.files?.length) {
    return null;
  }
  for (const file of dataTransfer.files) {
    if (file.type === "application/json" || file.name?.toLowerCase().endsWith(".json")) {
      return file;
    }
  }
  return null;
}

export function isValidShowConfig(value: unknown): value is { rooms: unknown[]; paintings: unknown[] } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { rooms?: unknown; paintings?: unknown };
  return Array.isArray(candidate.rooms) && Array.isArray(candidate.paintings);
}
