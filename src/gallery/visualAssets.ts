import * as THREE_NS from "three";
import type { RenderingConfigWithFloorTexture } from "./types";

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
  return new THREE.MeshStandardMaterial({
    color: floorColor,
    roughness: 0.9,
    metalness: 0.03,
  });
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
