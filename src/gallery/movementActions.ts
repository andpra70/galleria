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

  function isInsideRoom(x: number, z: number, room: { x: number; z: number; width: number; depth: number }) {
    return x >= room.x && x <= room.x + room.width && z >= room.z && z <= room.z + room.depth;
  }

  function pointInAnyRoom(x: number, z: number) {
    return getConfig().rooms.some((room) => isInsideRoom(x, z, room));
  }

  function isPositionSafe(candidate: THREE_NS.Vector3) {
    if (!pointInAnyRoom(candidate.x, candidate.z)) {
      return false;
    }
    return !wallColliders.some((box) => box.distanceToPoint(candidate) < visitor.wallClearance);
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
      return null;
    }
    const adjusted = pushAwayFromPaintings(candidate);
    if (!isPositionSafe(adjusted)) {
      return null;
    }
    return adjusted;
  }

  function moveVisitorTo(target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) {
    const clampedTarget = clampToWalkable(target);
    if (!clampedTarget) {
      return;
    }
    const computeRoute = getComputeRoute();
    if (!computeRoute) {
      return;
    }
    const route = computeRoute(visitor.position, clampedTarget);
    if (!route.length) {
      return;
    }
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
