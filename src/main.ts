import "./styles.css";
import { renderAppShell } from "./components/appShell";
import { createFileserverClient, extractFileserverFileNames } from "./gallery/fileserverClient";

type GalleryUiFlags = {
  showConfig: boolean;
  showBirdview: boolean;
};

type GalleryBootstrap = {
  routeId: string | null;
  configPath: string;
  readOnly: boolean;
};

type ProjectListState = {
  loading: boolean;
  projects: string[];
  error: string | null;
};

function parseFlag(raw: unknown): boolean | null {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (["1", "true", "yes", "on", "show"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off", "hide"].includes(value)) {
    return false;
  }
  return null;
}

function resolveUiFlags(appEl: HTMLElement): GalleryUiFlags {
  const params = new URLSearchParams(window.location.search);
  const globalFlags = ((window as Window & { __GALLERIA_UI_FLAGS__?: Partial<GalleryUiFlags> }).__GALLERIA_UI_FLAGS__ ??
    {}) as Partial<GalleryUiFlags>;

  const fromDataShowConfig = parseFlag(appEl.dataset.showConfig);
  const fromDataShowBirdview = parseFlag(appEl.dataset.showBirdview);
  const fromGlobalShowConfig = parseFlag(globalFlags.showConfig);
  const fromGlobalShowBirdview = parseFlag(globalFlags.showBirdview);

  let fromQueryShowConfig = parseFlag(params.get("showConfig") ?? params.get("config"));
  let fromQueryShowBirdview = parseFlag(params.get("showBirdview") ?? params.get("birdview"));
  const fromQueryHideConfig = parseFlag(params.get("hideConfig"));
  const fromQueryHideBirdview = parseFlag(params.get("hideBirdview"));
  if (fromQueryHideConfig !== null) {
    fromQueryShowConfig = !fromQueryHideConfig;
  }
  if (fromQueryHideBirdview !== null) {
    fromQueryShowBirdview = !fromQueryHideBirdview;
  }

  const showConfig =
    fromQueryShowConfig ?? fromDataShowConfig ?? fromGlobalShowConfig ?? true;
  const showBirdview =
    fromQueryShowBirdview ?? fromDataShowBirdview ?? fromGlobalShowBirdview ?? true;

  return {
    showConfig,
    showBirdview,
  };
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }
  const compact = trimmed.replace(/\/{2,}/g, "/");
  if (compact === "/") {
    return "/";
  }
  return compact.endsWith("/") ? compact.slice(0, -1) : compact;
}

function removePathPrefix(pathname: string, prefix: string): string | null {
  const normalizedPath = normalizePath(pathname);
  const normalizedPrefix = normalizePath(prefix);
  if (normalizedPrefix === "/") {
    return normalizedPath === "/" ? "" : normalizedPath.slice(1);
  }
  if (normalizedPath === normalizedPrefix) {
    return "";
  }
  if (!normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return null;
  }
  return normalizedPath.slice(normalizedPrefix.length + 1);
}

function stripBaseFromPath(pathname: string): string {
  const baseFromDocument = new URL(".", document.baseURI).pathname;
  const baseFromEnv = new URL(import.meta.env.BASE_URL || "/", window.location.origin).pathname;
  const candidates = [baseFromDocument, baseFromEnv]
    .map((candidate) => normalizePath(candidate))
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const withoutPrefix = removePathPrefix(pathname, candidate);
    if (withoutPrefix !== null) {
      return withoutPrefix;
    }
  }

  const normalized = normalizePath(pathname);
  return normalized === "/" ? "" : normalized.slice(1);
}

function resolveRouteIdFromQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const explicitId = (params.get("id") ?? "").trim();
  if (explicitId) {
    return decodeURIComponent(explicitId);
  }
  const reserved = new Set(["showconfig", "config", "showbirdview", "birdview", "hideconfig", "hidebirdview", "id"]);
  for (const [key, value] of params.entries()) {
    const keyTrimmed = key.trim();
    if (!keyTrimmed) {
      continue;
    }
    if (reserved.has(keyTrimmed.toLowerCase())) {
      continue;
    }
    if ((value ?? "").trim() !== "") {
      continue;
    }
    return decodeURIComponent(keyTrimmed);
  }
  return null;
}

function encodeRouteIdAsPath(routeId: string): string {
  return routeId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveBootstrapFromRoute(): GalleryBootstrap {
  const relativePath = stripBaseFromPath(window.location.pathname);
  const segments = relativePath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments[0]?.toLowerCase() === "index.html") {
    segments.shift();
  }
  const routeIdFromPath = segments.length > 0 ? segments.map((segment) => decodeURIComponent(segment)).join("/") : null;
  const routeIdFromQuery = resolveRouteIdFromQuery(window.location.search);
  const routeId = routeIdFromPath || routeIdFromQuery;
  const fallbackConfigPath = "config/gallery.json";
  if (!routeId) {
    return {
      routeId: null,
      configPath: fallbackConfigPath,
      readOnly: false,
    };
  }
  return {
    routeId,
    configPath: `config/${encodeRouteIdAsPath(routeId)}.json`,
    readOnly: true,
  };
}

function createProjectHref(routeId: string): string {
  const appUrl = new URL(import.meta.env.BASE_URL || "/", document.baseURI);
  const encodedQueryToken = encodeURIComponent(routeId);
  const normalizedPath = appUrl.pathname || "/";
  return `${normalizedPath}?${encodedQueryToken}`;
}

function normalizeProjectIdFromFilename(filename: string): string {
  return filename.replace(/\.json$/i, "").trim();
}

async function loadAvailableProjects(): Promise<string[]> {
  const apiBase = (import.meta.env.VITE_FILESERVER_API_BASE || "/fileserver/api").trim();
  const projectsDirectory = (import.meta.env.VITE_FILESERVER_SHOW_DIRECTORY || "galleria").trim();
  const client = createFileserverClient({ apiBase });
  const listing = await client.listDirectory(projectsDirectory);
  return extractFileserverFileNames(listing)
    .filter((fileName) => /\.json$/i.test(fileName))
    .map((fileName) => normalizeProjectIdFromFilename(fileName))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}

function clearChildren(node: HTMLElement) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function renderProjectListPage(appEl: HTMLElement, state: ProjectListState) {
  appEl.classList.add("project-bootstrap-page");
  clearChildren(appEl);

  const shell = document.createElement("section");
  shell.className = "project-bootstrap-shell";
  const title = document.createElement("h1");
  title.textContent = "Progetti disponibili";
  shell.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "project-bootstrap-subtitle";
  subtitle.textContent = "Seleziona un progetto per aprire la galleria.";
  shell.appendChild(subtitle);

  if (state.loading) {
    const loading = document.createElement("p");
    loading.className = "project-bootstrap-status";
    loading.textContent = "Caricamento elenco progetti...";
    shell.appendChild(loading);
    appEl.appendChild(shell);
    return;
  }

  if (state.error) {
    const error = document.createElement("p");
    error.className = "project-bootstrap-status project-bootstrap-error";
    error.textContent = `Impossibile recuperare i progetti: ${state.error}`;
    shell.appendChild(error);
    appEl.appendChild(shell);
    return;
  }

  if (state.projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "project-bootstrap-status";
    empty.textContent = "Nessun progetto trovato sul fileserver.";
    shell.appendChild(empty);
    appEl.appendChild(shell);
    return;
  }

  const list = document.createElement("ul");
  list.className = "project-bootstrap-list";
  state.projects.forEach((projectId) => {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = createProjectHref(projectId);
    link.textContent = projectId;
    row.appendChild(link);
    list.appendChild(row);
  });
  shell.appendChild(list);
  appEl.appendChild(shell);
}

async function bootstrapProjectListPage(appEl: HTMLElement) {
  renderProjectListPage(appEl, { loading: true, projects: [], error: null });
  try {
    const projects = await loadAvailableProjects();
    renderProjectListPage(appEl, { loading: false, projects, error: null });
  } catch (error) {
    renderProjectListPage(appEl, {
      loading: false,
      projects: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}


function showProjectLoadingOverlay(appEl: HTMLElement, routeId: string) {
  const existing = appEl.querySelector<HTMLElement>('#project-loading-overlay');
  if (existing) {
    const label = existing.querySelector<HTMLElement>('.project-loading-label');
    if (label) {
      label.textContent = `Loading... ${routeId}`;
    }
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'project-loading-overlay';
  overlay.className = 'project-loading-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');

  const label = document.createElement('div');
  label.className = 'project-loading-label';
  label.textContent = `Loading... ${routeId}`;
  overlay.appendChild(label);

  appEl.appendChild(overlay);
}

function hideProjectLoadingOverlay(appEl: HTMLElement) {
  const overlay = appEl.querySelector<HTMLElement>('#project-loading-overlay');
  if (!overlay) {
    return;
  }
  overlay.classList.add('is-hidden');
  window.setTimeout(() => {
    overlay.remove();
  }, 220);
}
const app = document.getElementById("app")!;
const bootstrap = resolveBootstrapFromRoute();
const uiFlags = resolveUiFlags(app);
(window as Window & { __GALLERIA_BOOTSTRAP__?: GalleryBootstrap }).__GALLERIA_BOOTSTRAP__ = bootstrap;

if (!bootstrap.routeId) {
  bootstrapProjectListPage(app).catch((error) => {
    console.error("Errore caricamento lista progetti:", error);
  });
} else {
  app.classList.remove("project-bootstrap-page");
  if (bootstrap.readOnly) {
    uiFlags.showConfig = false;
    uiFlags.showBirdview = false;
  }

  app.innerHTML = renderAppShell();
  const shell = app.querySelector<HTMLElement>("#app-shell");
  if (shell) {
    shell.classList.toggle("hide-config", !uiFlags.showConfig);
    shell.classList.toggle("hide-birdview", !uiFlags.showBirdview);
    shell.dataset.showConfig = uiFlags.showConfig ? "1" : "0";
    shell.dataset.showBirdview = uiFlags.showBirdview ? "1" : "0";
    shell.dataset.readOnly = bootstrap.readOnly ? "1" : "0";
    if (bootstrap.routeId) {
      shell.dataset.routeId = bootstrap.routeId;
    } else {
      delete shell.dataset.routeId;
    }
  }

  showProjectLoadingOverlay(app, bootstrap.routeId);
  import("./galleryApp")
    .then(() => {
      window.requestAnimationFrame(() => {
        hideProjectLoadingOverlay(app);
      });
    })
    .catch((error) => {
      console.error("Errore caricamento galleria:", error);
      const overlayLabel = app.querySelector<HTMLElement>("#project-loading-overlay .project-loading-label");
      if (overlayLabel) {
        overlayLabel.textContent = "Errore caricamento progetto";
      }
    });
}
