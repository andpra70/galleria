const EXTERNAL_OR_SPECIAL_URL_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const BLOB_URL_RE = /^blob:/i;

function getAppBaseUrl() {
  const baseUrl = import.meta.env.BASE_URL || "./";
  return new URL(baseUrl, document.baseURI);
}

export function resolveAppUrl(url: string | null | undefined): string {
  const candidate = (url ?? "").trim();
  if (!candidate) {
    return "";
  }
  if (EXTERNAL_OR_SPECIAL_URL_RE.test(candidate)) {
    return candidate;
  }
  const relativeCandidate = candidate.startsWith("/") ? candidate.slice(1) : candidate;
  return new URL(relativeCandidate, getAppBaseUrl()).toString();
}

export function resolveFileserverRawUrl(path: string | null | undefined): string {
  const candidate = (path ?? "").trim();
  if (!candidate) {
    return "";
  }
  if (EXTERNAL_OR_SPECIAL_URL_RE.test(candidate)) {
    return candidate;
  }
  const apiBase = String(import.meta.env.VITE_FILESERVER_API_BASE || "/fileserver/api").replace(/\/+$/, "");
  const url = new URL(`${apiBase}/raw`, document.baseURI);
  url.searchParams.set("path", candidate);
  return url.toString();
}

export function isBlobUrl(url: string | null | undefined): boolean {
  return BLOB_URL_RE.test((url ?? "").trim());
}
