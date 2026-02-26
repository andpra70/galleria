import * as THREE_NS from "three";
import type { CustomWallConfig, FloorMesh, GalleryRoom, GalleryWallMesh, WallSide } from "./types";

type IntervalSegment = { from: number; to: number; base: number; top: number };
type WorldBuilderDeps = {
  THREE: typeof import("three");
  world: THREE_NS.Group;
  floorMeshes: FloorMesh[];
  wallMeshes: GalleryWallMesh[];
  wallColliders: THREE_NS.Box3[];
  cmToM: (cm: number) => number;
};

export function createWorldBuilder({ THREE, world, floorMeshes, wallMeshes, wallColliders, cmToM }: WorldBuilderDeps) {
  function cacheWallCollider(mesh: GalleryWallMesh): void {
    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    wallColliders.push(box);
  }

  function subtractIntervals(baseIntervals: IntervalSegment[], cuts: IntervalSegment[]): IntervalSegment[] {
    let out = [...baseIntervals];

    cuts.forEach((cut) => {
      const next: IntervalSegment[] = [];
      out.forEach((segment: IntervalSegment) => {
        const overlapFrom = Math.max(segment.from, cut.from);
        const overlapTo = Math.min(segment.to, cut.to);

        if (overlapFrom >= overlapTo) {
          next.push(segment);
          return;
        }

        if (cut.base > segment.base) {
          next.push({ from: overlapFrom, to: overlapTo, base: segment.base, top: cut.base });
        }

        if (cut.top < segment.top) {
          next.push({ from: overlapFrom, to: overlapTo, base: cut.top, top: segment.top });
        }

        if (segment.from < overlapFrom) {
          next.push({ from: segment.from, to: overlapFrom, base: segment.base, top: segment.top });
        }

        if (segment.to > overlapTo) {
          next.push({ from: overlapTo, to: segment.to, base: segment.base, top: segment.top });
        }
      });
      out = next;
    });

    return out;
  }

  function makeWallSegment(
    room: GalleryRoom,
    wall: WallSide,
    seg: IntervalSegment,
    thickness: number,
    material: THREE_NS.MeshStandardMaterial
  ): GalleryWallMesh {
    const horizontal = wall === "north" || wall === "south";
    const width = horizontal ? seg.to - seg.from : thickness;
    const depth = horizontal ? thickness : seg.to - seg.from;
    const height = seg.top - seg.base;

    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);

    if (wall === "north") {
      wallMesh.position.set(room.x + seg.from + width * 0.5, seg.base + height * 0.5, room.z);
    } else if (wall === "south") {
      wallMesh.position.set(room.x + seg.from + width * 0.5, seg.base + height * 0.5, room.z + room.depth);
    } else if (wall === "west") {
      wallMesh.position.set(room.x, seg.base + height * 0.5, room.z + seg.from + depth * 0.5);
    } else {
      wallMesh.position.set(room.x + room.width, seg.base + height * 0.5, room.z + seg.from + depth * 0.5);
    }
    wallMesh.userData = {
      roomId: room.id,
      wall,
    };

    return wallMesh as GalleryWallMesh;
  }

  function buildRoom(room: GalleryRoom, wallColor: THREE_NS.ColorRepresentation, ceilingColor: THREE_NS.ColorRepresentation, floorMaterial: THREE_NS.Material) {
    const floorGeometry = new THREE.PlaneGeometry(room.width, room.depth);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x + room.width * 0.5, 0, room.z + room.depth * 0.5);
    floor.receiveShadow = true;
    floor.userData.roomId = room.id;
    world.add(floor);
    floorMeshes.push(floor as FloorMesh);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(room.width, room.depth),
      new THREE.MeshStandardMaterial({ color: ceilingColor, roughness: 0.75, metalness: 0.03 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(room.x + room.width * 0.5, room.height, room.z + room.depth * 0.5);
    world.add(ceiling);

    const wallThickness = 0.16;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.94, metalness: 0.02 });

    (["north", "south", "west", "east"] as WallSide[]).forEach((wall) => {
      const openings = (room.openings ?? []).filter((o) => o.wall === wall);
      const spanLength = wall === "north" || wall === "south" ? room.width : room.depth;
      const segments: IntervalSegment[] = subtractIntervals(
        [{ from: 0, to: spanLength, base: 0, top: room.height }],
        openings.map((o) => ({
          from: Math.max(0, (o.center ?? 0) - (o.width ?? 0) * 0.5),
          to: Math.min(spanLength, (o.center ?? 0) + (o.width ?? 0) * 0.5),
          base: o.base ?? 0,
          top: (o.base ?? 0) + (o.height ?? room.height),
        }))
      );

      segments.forEach((seg: IntervalSegment) => {
        if (seg.to - seg.from <= 0.01 || seg.top - seg.base <= 0.01) {
          return;
        }
        const mesh = makeWallSegment(room, wall, seg, wallThickness, wallMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        world.add(mesh);
        cacheWallCollider(mesh);
        wallMeshes.push(mesh);
      });
    });
  }

  function makeCustomWallSegment(segment: CustomWallConfig, material: THREE_NS.MeshStandardMaterial): GalleryWallMesh | null {
    const x1 = Number(segment.x1);
    const z1 = Number(segment.z1);
    const x2 = Number(segment.x2);
    const z2 = Number(segment.z2);
    const height = Math.max(0.1, Number(segment.height ?? cmToM(segment.heightCm ?? 300)));
    const thickness = Math.max(0.02, Number(segment.thickness ?? cmToM(segment.thicknessCm ?? 16)));
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) {
      return null;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), material);
    mesh.position.set((x1 + x2) * 0.5, height * 0.5, (z1 + z2) * 0.5);
    mesh.rotation.y = Math.atan2(dz, dx);
    mesh.userData = {
      wallType: "customSegment",
      customWallId: segment.id,
    };
    return mesh as GalleryWallMesh;
  }

  function buildCustomWalls(cfg: { customWalls: CustomWallConfig[] }, wallColor: THREE_NS.ColorRepresentation) {
    const material = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.94, metalness: 0.02 });
    cfg.customWalls.forEach((segment: CustomWallConfig) => {
      const mesh = makeCustomWallSegment(segment, material);
      if (!mesh) {
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      world.add(mesh);
      cacheWallCollider(mesh);
      wallMeshes.push(mesh);
    });
  }

  return {
    buildRoom,
    buildCustomWalls,
  };
}
