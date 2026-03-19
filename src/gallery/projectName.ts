const DEFAULT_PROJECT_NAME = "galleria";
export const PROJECT_NAME_STORAGE_KEY = "galleria.projectName";

export function normalizeProjectName(value: unknown, fallback = DEFAULT_PROJECT_NAME): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate || fallback;
}

export function inferProjectNameFromFilePath(filePath: string | null | undefined, fallback = DEFAULT_PROJECT_NAME): string {
  const normalizedPath = String(filePath || "").trim().replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() || "";
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return normalizeProjectName(baseName, fallback);
}

export function projectNameToSlug(projectName: string): string {
  const ascii = normalizeProjectName(projectName)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || DEFAULT_PROJECT_NAME;
}

export function projectNameToFilename(projectName: string, extension = ".json"): string {
  return `${projectNameToSlug(projectName)}${extension}`;
}

export function projectNameToFileserverPath(projectName: string, directory = "galleria"): string {
  const normalizedDirectory = String(directory || "").trim().replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  const filename = projectNameToFilename(projectName);
  return normalizedDirectory ? `${normalizedDirectory}/${filename}` : filename;
}

export function readStoredProjectName(fallback = DEFAULT_PROJECT_NAME): string {
  try {
    return normalizeProjectName(window.localStorage.getItem(PROJECT_NAME_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function persistProjectName(projectName: string): string {
  const normalized = normalizeProjectName(projectName);
  try {
    window.localStorage.setItem(PROJECT_NAME_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures.
  }
  return normalized;
}
