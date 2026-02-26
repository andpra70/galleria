import * as THREE_NS from "three";
import type { MapState, NavGridState, VisitorState } from "./appStatus";

type NavigationDeps = {
  THREE: typeof import("three");
  navGrid: NavGridState;
  mapState: MapState;
  visitor: VisitorState;
  isPositionSafe: (point: THREE_NS.Vector3) => boolean;
  clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
};

export function createNavigationHelpers({ THREE, navGrid, mapState, visitor, isPositionSafe, clampToWalkable }: NavigationDeps) {
  function cellKey(cx: number, rz: number): number {
    return rz * navGrid.cols + cx;
  }

  function inGrid(cx: number, rz: number): boolean {
    return cx >= 0 && rz >= 0 && cx < navGrid.cols && rz < navGrid.rows;
  }

  function worldToCell(point: THREE_NS.Vector3): { cx: number; rz: number } {
    const cx = Math.round((point.x - navGrid.minX) / navGrid.cellSize);
    const rz = Math.round((point.z - navGrid.minZ) / navGrid.cellSize);
    return { cx, rz };
  }

  function cellToWorld(cx: number, rz: number): THREE_NS.Vector3 {
    return new THREE.Vector3(navGrid.minX + cx * navGrid.cellSize, visitor.eyeHeight, navGrid.minZ + rz * navGrid.cellSize);
  }

  function nearestWalkableCell(point: THREE_NS.Vector3): { cx: number; rz: number } | null {
    const origin = worldToCell(point);
    if (inGrid(origin.cx, origin.rz) && navGrid.walkable[cellKey(origin.cx, origin.rz)]) {
      return origin;
    }

    const maxRadius = Math.max(navGrid.cols, navGrid.rows);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) {
            continue;
          }
          const cx = origin.cx + dx;
          const rz = origin.rz + dz;
          if (inGrid(cx, rz) && navGrid.walkable[cellKey(cx, rz)]) {
            return { cx, rz };
          }
        }
      }
    }

    return null;
  }

  function lineWalkable(from: THREE_NS.Vector3, to: THREE_NS.Vector3): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.001) {
      return true;
    }
    const steps = Math.ceil(dist / (navGrid.cellSize * 0.45));
    for (let i = 0; i <= steps; i += 1) {
      const p = from.clone().lerp(to, i / steps);
      p.y = visitor.eyeHeight;
      if (!isPositionSafe(p)) {
        return false;
      }
    }
    return true;
  }

  function reconstructPath(cameFrom: Map<number, number>, currentKey: number) {
    const keys = [currentKey];
    let cursor = currentKey;
    while (cameFrom.has(cursor)) {
      cursor = cameFrom.get(cursor)!;
      keys.push(cursor);
    }
    keys.reverse();
    return keys.map((k: number) => {
      const rz = Math.floor(k / navGrid.cols);
      const cx = k % navGrid.cols;
      return cellToWorld(cx, rz);
    });
  }

  function smoothPath(points: THREE_NS.Vector3[]): THREE_NS.Vector3[] {
    if (points.length <= 2) {
      return points;
    }

    const out = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let next = anchor + 1;
      for (let i = anchor + 2; i < points.length; i += 1) {
        if (lineWalkable(points[anchor], points[i])) {
          next = i;
        } else {
          break;
        }
      }
      out.push(points[next]);
      anchor = next;
    }
    return out;
  }

  function heuristic(cx: number, cz: number, tx: number, tz: number): number {
    return Math.hypot(tx - cx, tz - cz) * navGrid.cellSize;
  }

  function buildNavGrid() {
    navGrid.minX = mapState.minX;
    navGrid.minZ = mapState.minZ;
    navGrid.cols = Math.ceil((mapState.maxX - mapState.minX) / navGrid.cellSize) + 1;
    navGrid.rows = Math.ceil((mapState.maxZ - mapState.minZ) / navGrid.cellSize) + 1;
    navGrid.walkable = new Array(navGrid.cols * navGrid.rows).fill(false);

    for (let rz = 0; rz < navGrid.rows; rz += 1) {
      for (let cx = 0; cx < navGrid.cols; cx += 1) {
        const p = cellToWorld(cx, rz);
        p.y = visitor.eyeHeight;
        navGrid.walkable[cellKey(cx, rz)] = isPositionSafe(p);
      }
    }
  }

  function computeRoute(startPoint: THREE_NS.Vector3, endPoint: THREE_NS.Vector3): THREE_NS.Vector3[] {
    const startSafe = clampToWalkable(startPoint);
    const endSafe = clampToWalkable(endPoint);
    if (!startSafe || !endSafe) {
      return [];
    }

    if (lineWalkable(startSafe, endSafe)) {
      return [endSafe];
    }

    const startCell = nearestWalkableCell(startSafe);
    const endCell = nearestWalkableCell(endSafe);
    if (!startCell || !endCell) {
      return [];
    }

    const startKey = cellKey(startCell.cx, startCell.rz);
    const endKey = cellKey(endCell.cx, endCell.rz);
    const open = [startKey];
    const openSet = new Set([startKey]);
    const cameFrom = new Map<number, number>();
    const g = new Map<number, number>([[startKey, 0]]);
    const f = new Map<number, number>([[startKey, heuristic(startCell.cx, startCell.rz, endCell.cx, endCell.rz)]]);

    const dirs = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
      { x: 1, z: -1 },
      { x: -1, z: -1 },
    ];

    while (open.length) {
      let bestIndex = 0;
      let bestF = Infinity;
      for (let i = 0; i < open.length; i += 1) {
        const score = f.get(open[i]) ?? Infinity;
        if (score < bestF) {
          bestF = score;
          bestIndex = i;
        }
      }

      const current = open.splice(bestIndex, 1)[0]!;
      openSet.delete(current);
      if (current === endKey) {
        const nodes = reconstructPath(cameFrom, current);
        const full = [startSafe, ...nodes.slice(1), endSafe];
        const smooth = smoothPath(full);
        return smooth.slice(1);
      }

      const cz = Math.floor(current / navGrid.cols);
      const cx = current % navGrid.cols;

      dirs.forEach((d) => {
        const nx = cx + d.x;
        const nz = cz + d.z;
        if (!inGrid(nx, nz) || !navGrid.walkable[cellKey(nx, nz)]) {
          return;
        }

        if (d.x !== 0 && d.z !== 0) {
          const sideA = cellKey(cx + d.x, cz);
          const sideB = cellKey(cx, cz + d.z);
          if (!navGrid.walkable[sideA] || !navGrid.walkable[sideB]) {
            return;
          }
        }

        const neighbor = cellKey(nx, nz);
        const currentG = g.get(current) ?? Infinity;
        const tentative = currentG + Math.hypot(d.x, d.z) * navGrid.cellSize;
        if (tentative >= (g.get(neighbor) ?? Infinity)) {
          return;
        }

        cameFrom.set(neighbor, current);
        g.set(neighbor, tentative);
        f.set(neighbor, tentative + heuristic(nx, nz, endCell.cx, endCell.rz));
        if (!openSet.has(neighbor)) {
          open.push(neighbor);
          openSet.add(neighbor);
        }
      });
    }

    return [];
  }

  return {
    buildNavGrid,
    computeRoute,
  };
}
