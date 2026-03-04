import * as THREE_NS from "three";
import type { RenderingConfigWithFloorTexture } from "./types";
import { resolveAppUrl } from "./url";
type TextureLike = THREE_NS.Texture | null | undefined;
export type CreateFloorMaterialArgs = {
  THREE: typeof import("three");
  loader: THREE_NS.TextureLoader;
  renderer: THREE_NS.WebGLRenderer;
  renderCfg: RenderingConfigWithFloorTexture;
  floorColor: THREE_NS.ColorRepresentation;
};

function must2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context non disponibile");
  }
  return ctx;
}

export function createFloorMaterial({ THREE, loader, renderer, renderCfg, floorColor }: CreateFloorMaterialArgs): THREE_NS.MeshStandardMaterial {
  const floorTextureCfg = renderCfg.floorTexture ?? {};
  const repeatX = floorTextureCfg.repeatX ?? 2.5;
  const repeatY = floorTextureCfg.repeatY ?? 2.5;
  const rotation = floorTextureCfg.rotation ?? 0;

  const configureTexture = (texture: TextureLike, colorSpace: THREE_NS.ColorSpace | null) => {
    if (!texture) {
      return null;
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.rotation = rotation;
    texture.center.set(0.5, 0.5);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (colorSpace) {
      texture.colorSpace = colorSpace;
    }
    return texture;
  };

  const colorMap = floorTextureCfg.map
    ? configureTexture(loader.load(resolveAppUrl(floorTextureCfg.map)), THREE.SRGBColorSpace)
    : configureTexture(createParquetTexture({ THREE, renderer }), THREE.SRGBColorSpace);
  const alphaMap = floorTextureCfg.alphaMap
    ? configureTexture(loader.load(resolveAppUrl(floorTextureCfg.alphaMap)), THREE.NoColorSpace)
    : null;

  return new THREE.MeshStandardMaterial({
    color: floorColor,
    map: colorMap,
    alphaMap,
    transparent: floorTextureCfg.transparent ?? Boolean(alphaMap),
    alphaTest: floorTextureCfg.alphaTest ?? (alphaMap ? 0.02 : 0),
    roughness: floorTextureCfg.roughness ?? 0.88,
    metalness: floorTextureCfg.metalness ?? 0.04,
  });
}

export function createParquetTexture({
  THREE,
  renderer,
}: {
  THREE: typeof import("three");
  renderer: THREE_NS.WebGLRenderer;
}): THREE_NS.CanvasTexture {
  const parquetCanvas = document.createElement("canvas");
  parquetCanvas.width = 1024;
  parquetCanvas.height = 1024;
  const ctx = must2d(parquetCanvas);
  const plankW = 128;
  const plankH = 64;

  for (let y = 0; y < parquetCanvas.height; y += plankH) {
    const stagger = ((y / plankH) % 2) * (plankW / 2);
    for (let x = -stagger; x < parquetCanvas.width; x += plankW) {
      const tone = 214 + Math.floor(Math.random() * 18);
      ctx.fillStyle = `rgb(${tone}, ${tone - 11}, ${tone - 28})`;
      ctx.fillRect(x, y, plankW - 2, plankH - 2);
      ctx.strokeStyle = "rgba(120, 92, 70, 0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, plankW - 3, plankH - 3);
    }
  }

  const texture = new THREE.CanvasTexture(parquetCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createPlaceholderPaintingImage(label: string) {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 900;
  const ctx = must2d(c);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#9ca3af";
  ctx.fillRect(40, 40, c.width - 80, c.height - 80);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 58px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, c.width / 2, c.height / 2);
  ctx.font = "30px sans-serif";
  ctx.fillText("Drop image to replace", c.width / 2, c.height / 2 + 52);
  return c.toDataURL("image/png");
}

export function createDeleteHandleTexture(THREE: typeof import("three")): THREE_NS.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = must2d(c);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(185, 28, 28, 0.95)";
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(42, 42);
  ctx.lineTo(86, 86);
  ctx.moveTo(86, 42);
  ctx.lineTo(42, 86);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createMoveHandleTexture(THREE: typeof import("three")): THREE_NS.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = must2d(c);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(30, 64, 175, 0.95)";
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(64, 34);
  ctx.lineTo(64, 94);
  ctx.moveTo(34, 64);
  ctx.lineTo(94, 64);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
