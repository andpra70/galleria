import * as THREE_NS from "three";
import type { MovementState, VisitorState } from "./appStatus";
import type { PaintingSpot } from "./types";

type RuntimeMotionDeps = {
  THREE: typeof import("three");
  camera: THREE_NS.PerspectiveCamera;
  movement: MovementState;
  visitor: VisitorState;
  MIN_PITCH: number;
  MAX_PITCH: number;
  clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
  lerpAngle: (from: number, to: number, t: number) => number;
};

export function createRuntimeMotion({ THREE, camera, movement, visitor, MIN_PITCH, MAX_PITCH, clampToWalkable, lerpAngle }: RuntimeMotionDeps) {
  function updateMovement(dt: number) {
    if (!movement.route.length) {
      return;
    }

    const current = visitor.position.clone();
    const waypoint = movement.route[0];
    const toDest = waypoint.clone().sub(current);
    toDest.y = 0;
    const dist = toDest.length();

    if (dist < 0.04) {
      movement.route.shift();
      if (!movement.route.length) {
        movement.destination = null;
        movement.finalDestination = null;
      }
      return;
    }

    const step = visitor.moveSpeed * movement.speedScale * dt;
    const dir = toDest.normalize();
    const next = current.add(dir.multiplyScalar(Math.min(step, dist)));

    const safe = clampToWalkable(next);
    if (safe) {
      visitor.position.copy(safe);
    } else {
      movement.destination = null;
      movement.route = [];
      movement.finalDestination = null;
    }
  }

  function computePaintingViewPosition(paintingSpot: PaintingSpot) {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * camera.aspect);
    const halfHeight = paintingSpot.height * 0.5;
    const halfWidth = paintingSpot.width * 0.5;
    const topDelta = Math.abs((paintingSpot.center.y + halfHeight) - visitor.eyeHeight);
    const bottomDelta = Math.abs((paintingSpot.center.y - halfHeight) - visitor.eyeHeight);
    const verticalHalfSpanFromEye = Math.max(topDelta, bottomDelta, halfHeight);
    const fitDistVertical = verticalHalfSpanFromEye / Math.tan(verticalFov * 0.5);
    const fitDistHorizontal = halfWidth / Math.tan(horizontalFov * 0.5);
    const fitDist = Math.max(fitDistVertical, fitDistHorizontal);
    const frameMargin = 1.18;
    const ideal = Math.max(visitor.minPaintingDistance + 0.2, fitDist * frameMargin);
    for (let extra = 0; extra <= 2.5; extra += 0.2) {
      const tryPos = paintingSpot.center
        .clone()
        .add(paintingSpot.normal.clone().multiplyScalar(ideal + extra));
      tryPos.y = visitor.eyeHeight;
      const clamped = clampToWalkable(tryPos);
      if (clamped) {
        return clamped;
      }
    }

    return null;
  }

  function updateFocusOrientation(dt: number) {
    if (!movement.focusTarget) {
      return;
    }
    const toTarget = movement.focusTarget.clone().sub(visitor.position);
    const horizontal = Math.hypot(toTarget.x, toTarget.z);
    if (horizontal < 0.001) {
      return;
    }

    const yawTarget = Math.atan2(toTarget.x, toTarget.z);
    const pitchTarget = Math.atan2(toTarget.y, horizontal);
    const blend = THREE.MathUtils.clamp(dt * 6, 0.06, 0.2);
    movement.yaw = lerpAngle(movement.yaw, yawTarget, blend);
    movement.pitch = THREE.MathUtils.clamp(THREE.MathUtils.lerp(movement.pitch, pitchTarget, blend), MIN_PITCH, MAX_PITCH);
  }

  function updateCamera() {
    const lookDir = new THREE.Vector3(
      Math.cos(movement.pitch) * Math.sin(movement.yaw),
      Math.sin(movement.pitch),
      Math.cos(movement.pitch) * Math.cos(movement.yaw)
    ).normalize();

    camera.position.copy(visitor.position);
    camera.lookAt(visitor.position.clone().add(lookDir));
  }

  return {
    updateMovement,
    computePaintingViewPosition,
    updateFocusOrientation,
    updateCamera,
  };
}
