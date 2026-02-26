import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { PaintingRegistryEntry, WallSide } from "./types";

type DragMeasureOverlayDeps = {
  app: AppContext;
  overlaySvg: SVGSVGElement;
};

type ScreenPoint = { x: number; y: number };

type MeasureLine = {
  a: THREE_NS.Vector3;
  b: THREE_NS.Vector3;
  label: string;
  rotateLabelWithLine?: boolean;
};

export function createDragMeasureOverlay({ app, overlaySvg }: DragMeasureOverlayDeps) {
  const { camera, renderer } = app.runtime;
  const { dragPainting } = app.status;
  const { paintingRegistry } = app.collections;
  const getRoomsById = app.status.refs.getRoomsById;
  const scratchRight = new THREE_NS.Vector3();
  const scratchUp = new THREE_NS.Vector3(0, 1, 0);
  const tmp = new THREE_NS.Vector3();

  function clear() {
    overlaySvg.innerHTML = "";
  }

  function toScreen(worldPoint: THREE_NS.Vector3): ScreenPoint | null {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    tmp.copy(worldPoint).project(camera);
    if (!Number.isFinite(tmp.x) || !Number.isFinite(tmp.y) || !Number.isFinite(tmp.z)) {
      return null;
    }
    if (tmp.z < -1.2 || tmp.z > 1.2) {
      return null;
    }
    return {
      x: (tmp.x * 0.5 + 0.5) * rect.width,
      y: (-tmp.y * 0.5 + 0.5) * rect.height,
    };
  }

  function formatMeters(value: number): string {
    return `${Math.max(0, value).toFixed(2)} m`;
  }

  function wallEdgeWorldPoints(entry: PaintingRegistryEntry): { min: THREE_NS.Vector3; max: THREE_NS.Vector3 } | null {
    const room = entry.room ?? getRoomsById().get(entry.painting.roomId ?? "");
    if (!room) {
      return null;
    }
    const wall = (entry.painting.wall ?? "north") as WallSide;
    const y = entry.paintingSpot.center.y;
    const c = entry.paintingSpot.center;

    if (wall === "north" || wall === "south") {
      return {
        min: new THREE_NS.Vector3(room.x, y, c.z),
        max: new THREE_NS.Vector3(room.x + room.width, y, c.z),
      };
    }

    return {
      min: new THREE_NS.Vector3(c.x, y, room.z),
      max: new THREE_NS.Vector3(c.x, y, room.z + room.depth),
    };
  }

  function buildMeasureLines(entry: PaintingRegistryEntry): MeasureLine[] {
    const lines: MeasureLine[] = [];
    const room = entry.room ?? getRoomsById().get(entry.painting.roomId ?? "");
    if (!room) {
      return lines;
    }

    const center = entry.paintingSpot.center;
    const width = entry.paintingSpot.width;
    const height = entry.paintingSpot.height;
    scratchRight.set(1, 0, 0).applyQuaternion(entry.frame.quaternion).normalize();

    const leftCenter = center.clone().addScaledVector(scratchRight, -width * 0.5);
    const rightCenter = center.clone().addScaledVector(scratchRight, width * 0.5);
    const bottomCenter = center.clone().addScaledVector(scratchUp, -height * 0.5);
    const topCenter = center.clone().addScaledVector(scratchUp, height * 0.5);
    const topLeft = topCenter.clone().addScaledVector(scratchRight, -width * 0.5);
    const topRight = topCenter.clone().addScaledVector(scratchRight, width * 0.5);
    const bottomLeft = bottomCenter.clone().addScaledVector(scratchRight, -width * 0.5);
    const floorPoint = new THREE_NS.Vector3(bottomCenter.x, 0, bottomCenter.z);

    const edgePoints = wallEdgeWorldPoints(entry);
    if (edgePoints) {
      const leftDist = Math.max(0, (entry.painting.offset ?? 0) - width * 0.5);
      const span = (entry.painting.wall === "north" || entry.painting.wall === "south") ? room.width : room.depth;
      const rightDist = Math.max(0, span - ((entry.painting.offset ?? 0) + width * 0.5));
      lines.push({ a: edgePoints.min, b: leftCenter, label: formatMeters(leftDist) });
      lines.push({ a: rightCenter, b: edgePoints.max, label: formatMeters(rightDist) });
    }

    const floorDist = Math.max(0, (entry.painting.centerY ?? center.y) - height * 0.5);
    lines.push({ a: bottomCenter, b: floorPoint, label: formatMeters(floorDist) });

    // Artwork dimensions along its edges.
    lines.push({ a: topLeft, b: topRight, label: formatMeters(width) });
    lines.push({ a: bottomLeft, b: topLeft, label: formatMeters(height), rotateLabelWithLine: true });

    return lines;
  }

  function renderLine(line: MeasureLine): string {
    const a = toScreen(line.a);
    const b = toScreen(line.b);
    if (!a || !b) {
      return "";
    }
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) {
      return "";
    }
    const nx = -dy / len;
    const ny = dx / len;
    const lx = midX + nx * 12;
    const ly = midY + ny * 12;
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    const labelGroup = line.rotateLabelWithLine
      ? `
        <g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${angleDeg.toFixed(1)})">
          <rect x="-28" y="-10" width="56" height="20" rx="6"
            fill="rgba(255,255,255,0.92)" stroke="rgba(15,23,42,0.18)" />
          <text x="0" y="4" text-anchor="middle"
            font-size="11" font-family="Segoe UI, Tahoma, sans-serif" fill="#0f172a">${line.label}</text>
        </g>`
      : `
        <rect x="${(lx - 28).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="56" height="20" rx="6"
          fill="rgba(255,255,255,0.92)" stroke="rgba(15,23,42,0.18)" />
        <text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle"
          font-size="11" font-family="Segoe UI, Tahoma, sans-serif" fill="#0f172a">${line.label}</text>`;

    return `
      <g>
        <line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
          stroke="rgba(15,23,42,0.9)" stroke-width="1.5" stroke-dasharray="6 5" />
        <circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="2.2" fill="rgba(15,23,42,0.9)" />
        <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="2.2" fill="rgba(15,23,42,0.9)" />
        ${labelGroup}
      </g>`;
  }

  function update() {
    if (!dragPainting.active || !dragPainting.paintingId) {
      clear();
      return;
    }
    const entry = paintingRegistry.get(dragPainting.paintingId);
    if (!entry || !entry.room) {
      clear();
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    overlaySvg.setAttribute("viewBox", `0 0 ${Math.max(1, Math.round(rect.width))} ${Math.max(1, Math.round(rect.height))}`);
    const content = buildMeasureLines(entry).map(renderLine).join("");
    overlaySvg.innerHTML = content;
  }

  return {
    update,
    clear,
  };
}
