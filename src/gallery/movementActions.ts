import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import type { PaintingSpot } from "./types";

type MovementActionsDeps = {
  app: AppContext;
  getComputeRoute: () => ((startPoint: THREE_NS.Vector3, endPoint: THREE_NS.Vector3) => THREE_NS.Vector3[]) | undefined;
};

export function createMovementActions({ app, getComputeRoute }: MovementActionsDeps) {
  const { visitor, movement } = app.status;
  const { wallColliders, paintingSpots } = app.collections;
  const getConfig = app.status.refs.getConfig;
  const readWalkDebugFlag = () => {
    try {
      return (window as Window & { __walkDebug?: boolean }).__walkDebug === true || window.localStorage.getItem("walk_debug") === "1";
    } catch {
      return false;
    }
  };
  const walkDebug = (...args: unknown[]) => {
    if (readWalkDebugFlag()) {
      console.debug("[walk]", ...args);
    }
  };

  function isInsideRoom(x: number, z: number, room: { x: number; z: number; width: number; depth: number }) {
    return x >= room.x && x <= room.x + room.width && z >= room.z && z <= room.z + room.depth;
  }

  function pointInAnyRoom(x: number, z: number) {
    return getConfig().rooms.some((room) => isInsideRoom(x, z, room));
  }

  function isPositionSafeWithClearance(candidate: THREE_NS.Vector3, clearance: number) {
    if (!pointInAnyRoom(candidate.x, candidate.z)) {
      return false;
    }
    return !wallColliders.some((box) => box.distanceToPoint(candidate) < clearance);
  }

  function isPositionSafe(candidate: THREE_NS.Vector3) {
    const navigationClearance = Math.max(0.08, Math.min(visitor.wallClearance, 0.18));
    return isPositionSafeWithClearance(candidate, navigationClearance);
  }

  function pushAwayFromPaintings(position: THREE_NS.Vector3) {
    const p = position.clone();
    paintingSpots.forEach((spot) => {
      const delta = p.clone().sub(spot.center);
      const depth = delta.dot(spot.normal);
      const lateral = delta.sub(spot.normal.clone().multiplyScalar(depth)).length();
      if (depth >= 0 && depth < visitor.minPaintingDistance && lateral < spot.width * 0.7) {
        p.add(spot.normal.clone().multiplyScalar(visitor.minPaintingDistance - depth));
      }
    });
    return p;
  }

  function clampToWalkable(point: THREE_NS.Vector3) {
    const candidate = point.clone();
    candidate.y = visitor.eyeHeight;
    if (!isPositionSafe(candidate)) {
      walkDebug("clamp reject candidate", {
        x: Number(candidate.x.toFixed(3)),
        z: Number(candidate.z.toFixed(3)),
      });
      return null;
    }
    const adjusted = pushAwayFromPaintings(candidate);
    if (!isPositionSafe(adjusted)) {
      walkDebug("clamp adjusted not safe, using candidate", {
        candidate: { x: Number(candidate.x.toFixed(3)), z: Number(candidate.z.toFixed(3)) },
        adjusted: { x: Number(adjusted.x.toFixed(3)), z: Number(adjusted.z.toFixed(3)) },
      });
      return candidate;
    }
    return adjusted;
  }

  function lineWalkableWithClearance(from: THREE_NS.Vector3, to: THREE_NS.Vector3, clearance: number) {
    const dist = from.distanceTo(to);
    if (dist < 0.001) {
      return true;
    }
    const steps = Math.max(2, Math.ceil(dist / 0.22));
    for (let i = 0; i <= steps; i += 1) {
      const p = from.clone().lerp(to, i / steps);
      p.y = visitor.eyeHeight;
      if (!isPositionSafeWithClearance(p, clearance)) {
        return false;
      }
    }
    return true;
  }

  function moveVisitorTo(target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) {
    const clampedTarget = clampToWalkable(target);
    if (!clampedTarget) {
      walkDebug("move abort: clampedTarget null", {
        x: Number(target.x.toFixed(3)),
        z: Number(target.z.toFixed(3)),
      });
      return;
    }
    const computeRoute = getComputeRoute();
    if (!computeRoute) {
      walkDebug("move abort: computeRoute missing");
      return;
    }
    const route = computeRoute(visitor.position, clampedTarget);
    if (!route.length) {
      walkDebug("route not found on grid, try direct fallback", {
        from: { x: Number(visitor.position.x.toFixed(3)), z: Number(visitor.position.z.toFixed(3)) },
        to: { x: Number(clampedTarget.x.toFixed(3)), z: Number(clampedTarget.z.toFixed(3)) },
      });
      if (lineWalkableWithClearance(visitor.position, clampedTarget, 0.08)) {
        movement.route = [clampedTarget.clone()];
        movement.destination = clampedTarget.clone();
        movement.finalDestination = clampedTarget.clone();
        movement.focusTarget = focusTarget ? focusTarget.clone() : null;
        walkDebug("using direct fallback route");
      } else {
        walkDebug("direct fallback blocked");
      }
      return;
    }
    walkDebug("route ok", { points: route.length });
    movement.route = route;
    movement.destination = route[route.length - 1].clone();
    movement.finalDestination = clampedTarget.clone();
    movement.focusTarget = focusTarget ? focusTarget.clone() : null;
  }

  function isNearPainting(paintingSpot: PaintingSpot) {
    const delta = visitor.position.clone().sub(paintingSpot.center);
    const depth = delta.dot(paintingSpot.normal);
    const lateral = delta.sub(paintingSpot.normal.clone().multiplyScalar(depth)).length();
    return depth > visitor.minPaintingDistance * 0.75 && depth < 3.2 && lateral < paintingSpot.width * 1.3;
  }

  return {
    isPositionSafe,
    clampToWalkable,
    moveVisitorTo,
    isNearPainting,
  };
}
