const EXTERNAL_OR_SPECIAL_URL_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

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
