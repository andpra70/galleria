import "./styles.css";
import { renderAppShell } from "./components/appShell";

type GalleryUiFlags = {
  showConfig: boolean;
  showBirdview: boolean;
};

type GalleryBootstrap = {
  routeId: string | null;
  configPath: string;
  readOnly: boolean;
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

function stripBaseFromPath(pathname: string): string {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const basePath = new URL(baseUrl, window.location.origin).pathname.replace(/\/+$/, "");
  const normalizedPath = pathname.replace(/\/+$/, "");
  if (!basePath || basePath === "/") {
    return normalizedPath;
  }
  if (normalizedPath === basePath) {
    return "";
  }
  if (normalizedPath.startsWith(`${basePath}/`)) {
    return normalizedPath.slice(basePath.length);
  }
  return normalizedPath;
}

function resolveBootstrapFromRoute(): GalleryBootstrap {
  const relativePath = stripBaseFromPath(window.location.pathname);
  const segments = relativePath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const routeId = segments.length > 0 ? decodeURIComponent(segments[0]) : null;
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
    configPath: `config/${routeId}.json`,
    readOnly: true,
  };
}

const app = document.getElementById("app")!;
const bootstrap = resolveBootstrapFromRoute();
const uiFlags = resolveUiFlags(app);
if (bootstrap.readOnly) {
  uiFlags.showConfig = false;
  uiFlags.showBirdview = false;
}
(window as Window & { __GALLERIA_BOOTSTRAP__?: GalleryBootstrap }).__GALLERIA_BOOTSTRAP__ = bootstrap;
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

import("./galleryApp").catch((error) => {
  console.error("Errore caricamento galleria:", error);
});
