export function getFirstImageFile(dataTransfer?: DataTransfer | null): File | null {
  if (!dataTransfer?.files?.length) {
    return null;
  }
  for (const file of dataTransfer.files) {
    if (file.type?.startsWith("image/")) {
      return file;
    }
  }
  return null;
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
