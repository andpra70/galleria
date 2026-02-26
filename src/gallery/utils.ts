import type { GalleryRoom } from "./types";

export function parseNumberOrFallback(raw: unknown, fallback: number): number {
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

export function snapToStep(value: number, step: number): number {
  if (!step || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function cmToM(valueCm: number): number {
  return Number(valueCm) / 100;
}

export function mToCm(valueM: number): number {
  return Number(valueM) * 100;
}

export function getWallSpan(room: GalleryRoom, wall: string): number {
  return wall === "north" || wall === "south" ? room.width : room.depth;
}

export function lerpAngle(from: number, to: number, t: number): number {
  let diff = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}
