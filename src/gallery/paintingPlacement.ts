import * as THREE_NS from "three";
import type { GalleryRoom, PaintingRegistryEntry, WallSide } from "./types";

type WallPlacementTransform = {
  position: THREE_NS.Vector3;
  quaternion: THREE_NS.Quaternion;
  normal: THREE_NS.Vector3;
};

type PaintingPlacementDeps = {
  THREE: typeof import("three");
  upAxis: THREE_NS.Vector3;
  getRoomsById: () => Map<string, GalleryRoom>;
  getWallSpan: (room: GalleryRoom, wall: WallSide) => number;
};

export function createPaintingPlacementHelpers({ THREE, upAxis, getRoomsById, getWallSpan }: PaintingPlacementDeps) {
  function getPaintingLightOffset(entry: PaintingRegistryEntry) {
    return {
      x: entry.painting.lightOffset?.x ?? 0,
      y: entry.painting.lightOffset?.y ?? 1.75,
      z: entry.painting.lightOffset?.z ?? 0.9,
    };
  }

  function applyPaintingLightConfig(entry: PaintingRegistryEntry) {
    entry.spot.intensity = 0;
    entry.spot.distance = 0;
    entry.spot.angle = 0.4;
    entry.spot.penumbra = 0;
    entry.spot.decay = 1;
    entry.spot.visible = false;
  }

  function computeWallPlacement(
    room: GalleryRoom,
    wall: WallSide,
    offset: number,
    centerY: number,
    pushOut: number
  ): WallPlacementTransform {
    const pos = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const normal = new THREE.Vector3();

    if (wall === "north") {
      pos.set(room.x + offset, centerY, room.z + pushOut);
      quaternion.setFromAxisAngle(upAxis, Math.PI);
      normal.set(0, 0, 1);
    } else if (wall === "south") {
      pos.set(room.x + offset, centerY, room.z + room.depth - pushOut);
      quaternion.setFromAxisAngle(upAxis, 0);
      normal.set(0, 0, -1);
    } else if (wall === "west") {
      pos.set(room.x + pushOut, centerY, room.z + offset);
      quaternion.setFromAxisAngle(upAxis, Math.PI / 2);
      normal.set(1, 0, 0);
    } else {
      pos.set(room.x + room.width - pushOut, centerY, room.z + offset);
      quaternion.setFromAxisAngle(upAxis, -Math.PI / 2);
      normal.set(-1, 0, 0);
    }

    return { position: pos, quaternion, normal };
  }

  function applyPaintingPlacement(entry: PaintingRegistryEntry) {
    const { painting, room, frame, canvas, spot, spotTarget, paintingSpot, frameDepth, deleteHandle, moveHandle } = entry;
    const wallThickness = 0.16;
    const transform = computeWallPlacement(
      room!,
      (painting.wall ?? "north") as WallSide,
      painting.offset ?? 0,
      painting.centerY ?? 1.65,
      wallThickness * 0.5 + frameDepth * 0.5 + 0.01
    );

    frame.position.copy(transform.position);
    frame.quaternion.copy(transform.quaternion);

    canvas.position.copy(transform.position).add(transform.normal.clone().multiplyScalar(frameDepth * 0.51));
    canvas.quaternion.copy(transform.quaternion);

    const lightOffset = getPaintingLightOffset(entry);
    applyPaintingLightConfig(entry);
    const lightRight = new THREE.Vector3(1, 0, 0).applyQuaternion(transform.quaternion).normalize();
    spot.position
      .copy(transform.position)
      .add(lightRight.multiplyScalar(lightOffset.x))
      .add(new THREE.Vector3(0, lightOffset.y, 0))
      .add(transform.normal.clone().multiplyScalar(lightOffset.z));
    spotTarget.position.copy(transform.position);

    paintingSpot.center.copy(transform.position);
    paintingSpot.normal.copy(transform.normal);

    if (deleteHandle) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(transform.quaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      deleteHandle.position
        .copy(transform.position)
        .add(right.multiplyScalar((paintingSpot.width ?? 1) * 0.5 + 0.2))
        .add(up.multiplyScalar((paintingSpot.height ?? 1) * 0.5 + 0.2))
        .add(transform.normal.clone().multiplyScalar(0.08));
      deleteHandle.quaternion.copy(transform.quaternion);
      deleteHandle.userData.paintingId = painting.id;

      if (moveHandle) {
        moveHandle.position.copy(transform.position).add(transform.normal.clone().multiplyScalar(0.08));
        moveHandle.quaternion.copy(transform.quaternion);
        moveHandle.userData.paintingId = painting.id;
      }
    }
  }

  function clampPaintingOffset(entry: PaintingRegistryEntry, rawOffset: number) {
    const roomsById = getRoomsById();
    const room = entry.room ?? roomsById.get(entry.painting.roomId ?? "");
    if (!room) {
      return rawOffset;
    }
    const span = getWallSpan(room, (entry.painting.wall ?? "north") as WallSide);
    const margin = Math.max(0.5, (entry.paintingSpot.width ?? 1) * 0.5 + 0.12);
    return THREE.MathUtils.clamp(rawOffset, margin, span - margin);
  }

  function clampPaintingCenterY(entry: PaintingRegistryEntry, rawCenterY: number) {
    const roomsById = getRoomsById();
    const room = entry.room ?? roomsById.get(entry.painting.roomId ?? "");
    if (!room) {
      return rawCenterY;
    }
    const half = Math.max(0.2, (entry.paintingSpot.height ?? 1) * 0.5 + 0.1);
    return THREE.MathUtils.clamp(rawCenterY, half, room.height - half);
  }

  return {
    computeWallPlacement,
    applyPaintingPlacement,
    clampPaintingOffset,
    clampPaintingCenterY,
  };
}
