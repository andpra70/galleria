import type { CustomWallConfig, ShowConfig, GalleryRoom } from "./types";
import type { MapState, MovementState, VisitorState } from "./appStatus";

type MiniMapWorldPoint = { x: number; z: number };

export function calculateMapBounds(rooms: GalleryRoom[], customWalls: CustomWallConfig[] | undefined, mapState: MapState): void {
  const xs: number[] = [];
  const zs: number[] = [];
  rooms.forEach((r) => {
    xs.push(r.x, r.x + r.width);
    zs.push(r.z, r.z + r.depth);
  });
  (customWalls ?? []).forEach((w) => {
    xs.push(Number(w.x1 ?? 0), Number(w.x2 ?? 0));
    zs.push(Number(w.z1 ?? 0), Number(w.z2 ?? 0));
  });
  if (!xs.length || !zs.length) {
    mapState.minX = -1;
    mapState.maxX = 1;
    mapState.minZ = -1;
    mapState.maxZ = 1;
    return;
  }
  mapState.minX = Math.min(...xs);
  mapState.maxX = Math.max(...xs);
  mapState.minZ = Math.min(...zs);
  mapState.maxZ = Math.max(...zs);
}

export function minimapClientToWorld(
  clientX: number,
  clientY: number,
  minimapCanvas: HTMLCanvasElement,
  mapState: MapState
): MiniMapWorldPoint | null {
  const rect = minimapCanvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height || mapState.scale <= 0) {
    return null;
  }
  const worldX = mapState.minX + (x - mapState.offsetX) / mapState.scale;
  const worldZ = mapState.minZ + (y - mapState.offsetY) / mapState.scale;
  return { x: worldX, z: worldZ };
}

export function drawMiniMap({
  minimapCanvas,
  miniCtx,
  mapState,
  config,
  visitor,
  movement,
}: {
  minimapCanvas: HTMLCanvasElement;
  miniCtx: CanvasRenderingContext2D;
  mapState: MapState;
  config: ShowConfig;
  visitor: VisitorState;
  movement: MovementState;
}): void {
  // Keep canvas backing size aligned to CSS size to avoid aspect-ratio distortion.
  const clientWidth = Math.max(1, Math.round(minimapCanvas.clientWidth || minimapCanvas.width));
  const clientHeight = Math.max(1, Math.round(minimapCanvas.clientHeight || minimapCanvas.height));
  if (minimapCanvas.width !== clientWidth || minimapCanvas.height !== clientHeight) {
    minimapCanvas.width = clientWidth;
    minimapCanvas.height = clientHeight;
  }

  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const w = mapState.maxX - mapState.minX;
  const h = mapState.maxZ - mapState.minZ;
  const usableW = width - mapState.pad * 2;
  const usableH = height - mapState.pad * 2;

  mapState.scale = Math.min(usableW / w, usableH / h);
  mapState.offsetX = (width - w * mapState.scale) * 0.5;
  mapState.offsetY = (height - h * mapState.scale) * 0.5;

  miniCtx.clearRect(0, 0, width, height);
  miniCtx.fillStyle = "#f8fafc";
  miniCtx.fillRect(0, 0, width, height);

  miniCtx.strokeStyle = "#8d99ae";
  miniCtx.lineWidth = 1;
  config.rooms.forEach((room: GalleryRoom) => {
    const x = mapState.offsetX + (room.x - mapState.minX) * mapState.scale;
    const y = mapState.offsetY + (room.z - mapState.minZ) * mapState.scale;
    miniCtx.fillStyle = room.id === "connector" ? "#e2e8f0" : "#edf2f7";
    miniCtx.fillRect(x, y, room.width * mapState.scale, room.depth * mapState.scale);
    miniCtx.strokeStyle = "#8d99ae";
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(x, y, room.width * mapState.scale, room.depth * mapState.scale);
  });

  (config.customWalls ?? []).forEach((wall: CustomWallConfig) => {
    const x1 = mapState.offsetX + ((wall.x1 ?? 0) - mapState.minX) * mapState.scale;
    const y1 = mapState.offsetY + ((wall.z1 ?? 0) - mapState.minZ) * mapState.scale;
    const x2 = mapState.offsetX + ((wall.x2 ?? 0) - mapState.minX) * mapState.scale;
    const y2 = mapState.offsetY + ((wall.z2 ?? 0) - mapState.minZ) * mapState.scale;
    miniCtx.strokeStyle = "#334155";
    miniCtx.lineWidth = 2;
    miniCtx.beginPath();
    miniCtx.moveTo(x1, y1);
    miniCtx.lineTo(x2, y2);
    miniCtx.stroke();

    miniCtx.fillStyle = "#475569";
    miniCtx.beginPath();
    miniCtx.arc(x1, y1, 3, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.beginPath();
    miniCtx.arc(x2, y2, 3, 0, Math.PI * 2);
    miniCtx.fill();
  });

  const px = mapState.offsetX + (visitor.position.x - mapState.minX) * mapState.scale;
  const pz = mapState.offsetY + (visitor.position.z - mapState.minZ) * mapState.scale;

  miniCtx.fillStyle = "#b91c1c";
  miniCtx.beginPath();
  miniCtx.arc(px, pz, 5, 0, Math.PI * 2);
  miniCtx.fill();

  miniCtx.strokeStyle = "#7f1d1d";
  miniCtx.lineWidth = 2;
  miniCtx.beginPath();
  miniCtx.moveTo(px, pz);
  miniCtx.lineTo(px + Math.sin(movement.yaw) * 16, pz + Math.cos(movement.yaw) * 16);
  miniCtx.stroke();
}
