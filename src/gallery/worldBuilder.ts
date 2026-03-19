import * as THREE_NS from "three";
import type { CustomWallConfig, FloorMesh, GalleryRoom, GalleryRoomOpening, GalleryWallMesh, WallSide } from "./types";

type IntervalSegment = { from: number; to: number; base: number; top: number };
type WallAxis = "x" | "z";
type WallLineDescriptor = {
  axis: WallAxis;
  coord: number;
  from: number;
  to: number;
  span: number;
  start: number;
};
type SharedWallOverlap = {
  from: number;
  to: number;
  worldFrom: number;
  worldTo: number;
  otherRoom: GalleryRoom;
  otherWall: WallSide;
  otherStart: number;
};
type WorldBuilderDeps = {
  THREE: typeof import("three");
  world: THREE_NS.Group;
  floorMeshes: FloorMesh[];
  wallMeshes: GalleryWallMesh[];
  wallColliders: THREE_NS.Box3[];
  cmToM: (cm: number) => number;
  getRoomWallThickness: () => number;
  getRulerConfig: () => { enabled: boolean; quotaM: number; color: THREE_NS.ColorRepresentation };
};

const WALL_MATCH_EPS = 0.001;
const WALL_SEGMENT_EPS = 0.01;

export function createWorldBuilder({ THREE, world, floorMeshes, wallMeshes, wallColliders, cmToM, getRoomWallThickness, getRulerConfig }: WorldBuilderDeps) {
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

  function getOppositeWall(wall: WallSide): WallSide {
    if (wall === "north") return "south";
    if (wall === "south") return "north";
    if (wall === "west") return "east";
    return "west";
  }

  function getWallLine(room: GalleryRoom, wall: WallSide): WallLineDescriptor {
    if (wall === "north") {
      return {
        axis: "x",
        coord: room.z,
        from: room.x,
        to: room.x + room.width,
        span: room.width,
        start: room.x,
      };
    }
    if (wall === "south") {
      return {
        axis: "x",
        coord: room.z + room.depth,
        from: room.x,
        to: room.x + room.width,
        span: room.width,
        start: room.x,
      };
    }
    if (wall === "west") {
      return {
        axis: "z",
        coord: room.x,
        from: room.z,
        to: room.z + room.depth,
        span: room.depth,
        start: room.z,
      };
    }
    return {
      axis: "z",
      coord: room.x + room.width,
      from: room.z,
      to: room.z + room.depth,
      span: room.depth,
      start: room.z,
    };
  }

  function normalizeOpening(opening: GalleryRoomOpening, fallbackHeight: number): IntervalSegment | null {
    const center = Number(opening.center ?? 0);
    const width = Math.max(0, Number(opening.width ?? 0));
    if (width <= WALL_MATCH_EPS) {
      return null;
    }
    const base = Math.max(0, Number(opening.base ?? 0));
    const top = Math.max(base, base + Math.max(0, Number(opening.height ?? fallbackHeight)));
    return {
      from: center - width * 0.5,
      to: center + width * 0.5,
      base,
      top,
    };
  }

  function collectSharedWallOverlaps(
    room: GalleryRoom,
    wall: WallSide,
    allRooms: GalleryRoom[]
  ): SharedWallOverlap[] {
    const line = getWallLine(room, wall);
    const oppositeWall = getOppositeWall(wall);

    return allRooms
      .filter((otherRoom) => otherRoom.id !== room.id)
      .flatMap((otherRoom) => {
        const otherLine = getWallLine(otherRoom, oppositeWall);
        if (line.axis !== otherLine.axis || Math.abs(line.coord - otherLine.coord) > WALL_MATCH_EPS) {
          return [];
        }
        const worldFrom = Math.max(line.from, otherLine.from);
        const worldTo = Math.min(line.to, otherLine.to);
        if (worldTo - worldFrom <= WALL_MATCH_EPS) {
          return [];
        }
        return [
          {
            from: worldFrom - line.start,
            to: worldTo - line.start,
            worldFrom,
            worldTo,
            otherRoom,
            otherWall: oppositeWall,
            otherStart: otherLine.start,
          } satisfies SharedWallOverlap,
        ];
      });
  }

  function collectWallCuts(
    room: GalleryRoom,
    wall: WallSide,
    allRooms: GalleryRoom[]
  ): { cuts: IntervalSegment[]; span: number } {
    const line = getWallLine(room, wall);
    const ownOpenings = (room.openings ?? [])
      .filter((opening) => opening.wall === wall)
      .map((opening) => normalizeOpening(opening, room.height))
      .filter((opening): opening is IntervalSegment => Boolean(opening))
      .map((opening) => ({
        from: Math.max(0, opening.from),
        to: Math.min(line.span, opening.to),
        base: opening.base,
        top: Math.min(room.height, opening.top),
      }))
      .filter((opening) => opening.to - opening.from > WALL_MATCH_EPS);

    const sharedOverlaps = collectSharedWallOverlaps(room, wall, allRooms);
    const mirroredOpenings: IntervalSegment[] = [];

    sharedOverlaps.forEach((shared) => {
      const oppositeOpenings = (shared.otherRoom.openings ?? []).filter((opening) => opening.wall === shared.otherWall);
      oppositeOpenings.forEach((opening) => {
        const normalized = normalizeOpening(opening, shared.otherRoom.height);
        if (!normalized) {
          return;
        }
        const worldFrom = shared.otherStart + normalized.from;
        const worldTo = shared.otherStart + normalized.to;
        const clippedFrom = Math.max(shared.worldFrom, worldFrom);
        const clippedTo = Math.min(shared.worldTo, worldTo);
        if (clippedTo - clippedFrom <= WALL_MATCH_EPS) {
          return;
        }
        mirroredOpenings.push({
          from: clippedFrom - line.start,
          to: clippedTo - line.start,
          base: normalized.base,
          top: Math.min(room.height, normalized.top),
        });
      });
    });

    return {
      cuts: [...ownOpenings, ...mirroredOpenings],
      span: line.span,
    };
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
      wallMesh.position.set(room.x + seg.from + width * 0.5, seg.base + height * 0.5, room.z + depth * 0.5);
    } else if (wall === "south") {
      wallMesh.position.set(room.x + seg.from + width * 0.5, seg.base + height * 0.5, room.z + room.depth - depth * 0.5);
    } else if (wall === "west") {
      wallMesh.position.set(room.x + width * 0.5, seg.base + height * 0.5, room.z + seg.from + depth * 0.5);
    } else {
      wallMesh.position.set(room.x + room.width - width * 0.5, seg.base + height * 0.5, room.z + seg.from + depth * 0.5);
    }
    wallMesh.userData = {
      roomId: room.id,
      wall,
    };

    return wallMesh as GalleryWallMesh;
  }

  function addWallRulerLine(start: THREE_NS.Vector3, end: THREE_NS.Vector3) {
    const rulerCfg = getRulerConfig();
    if (!rulerCfg.enabled) {
      return;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineDashedMaterial({
      color: rulerCfg.color,
      dashSize: 0.16,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    world.add(line);
  }

  function addRoomWallRuler(room: GalleryRoom, wall: WallSide, seg: IntervalSegment, thickness: number) {
    const quotaM = getRulerConfig().quotaM;
    const surfaceOffset = Math.max(0.006, thickness * 0.5 + 0.003);
    if (wall === "north") {
      addWallRulerLine(
        new THREE.Vector3(room.x + seg.from, quotaM, room.z - surfaceOffset),
        new THREE.Vector3(room.x + seg.to, quotaM, room.z - surfaceOffset)
      );
      addWallRulerLine(
        new THREE.Vector3(room.x + seg.from, quotaM, room.z + thickness + 0.003),
        new THREE.Vector3(room.x + seg.to, quotaM, room.z + thickness + 0.003)
      );
      return;
    }
    if (wall === "south") {
      addWallRulerLine(
        new THREE.Vector3(room.x + seg.from, quotaM, room.z + room.depth - thickness - 0.003),
        new THREE.Vector3(room.x + seg.to, quotaM, room.z + room.depth - thickness - 0.003)
      );
      addWallRulerLine(
        new THREE.Vector3(room.x + seg.from, quotaM, room.z + room.depth + surfaceOffset),
        new THREE.Vector3(room.x + seg.to, quotaM, room.z + room.depth + surfaceOffset)
      );
      return;
    }
    if (wall === "west") {
      addWallRulerLine(
        new THREE.Vector3(room.x - surfaceOffset, quotaM, room.z + seg.from),
        new THREE.Vector3(room.x - surfaceOffset, quotaM, room.z + seg.to)
      );
      addWallRulerLine(
        new THREE.Vector3(room.x + thickness + 0.003, quotaM, room.z + seg.from),
        new THREE.Vector3(room.x + thickness + 0.003, quotaM, room.z + seg.to)
      );
      return;
    }
    addWallRulerLine(
      new THREE.Vector3(room.x + room.width - thickness - 0.003, quotaM, room.z + seg.from),
      new THREE.Vector3(room.x + room.width - thickness - 0.003, quotaM, room.z + seg.to)
    );
    addWallRulerLine(
      new THREE.Vector3(room.x + room.width + surfaceOffset, quotaM, room.z + seg.from),
      new THREE.Vector3(room.x + room.width + surfaceOffset, quotaM, room.z + seg.to)
    );
  }

  function addCustomWallRuler(segment: CustomWallConfig, part: IntervalSegment, length: number, thickness: number) {
    const rulerCfg = getRulerConfig();
    if (!rulerCfg.enabled) {
      return;
    }
    const x1 = Number(segment.x1);
    const z1 = Number(segment.z1);
    const x2 = Number(segment.x2);
    const z2 = Number(segment.z2);
    const dx = x2 - x1;
    const dz = z2 - z1;
    if (length < 0.05) {
      return;
    }
    const dirX = dx / length;
    const dirZ = dz / length;
    const normalX = -dirZ;
    const normalZ = dirX;
    const surfaceOffset = Math.max(0.006, thickness * 0.5 + 0.003);
    addWallRulerLine(
      new THREE.Vector3(x1 + dirX * part.from + normalX * surfaceOffset, rulerCfg.quotaM, z1 + dirZ * part.from + normalZ * surfaceOffset),
      new THREE.Vector3(x1 + dirX * part.to + normalX * surfaceOffset, rulerCfg.quotaM, z1 + dirZ * part.to + normalZ * surfaceOffset)
    );
    addWallRulerLine(
      new THREE.Vector3(x1 + dirX * part.from - normalX * surfaceOffset, rulerCfg.quotaM, z1 + dirZ * part.from - normalZ * surfaceOffset),
      new THREE.Vector3(x1 + dirX * part.to - normalX * surfaceOffset, rulerCfg.quotaM, z1 + dirZ * part.to - normalZ * surfaceOffset)
    );
  }

  function buildRoomFloorAndCeiling(
    room: GalleryRoom,
    ceilingColor: THREE_NS.ColorRepresentation,
    floorMaterial: THREE_NS.Material
  ) {
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
  }

  function buildRoom(
    room: GalleryRoom,
    wallColor: THREE_NS.ColorRepresentation,
    ceilingColor: THREE_NS.ColorRepresentation,
    floorMaterial: THREE_NS.Material,
    allRooms: GalleryRoom[] = [room],
    roomOrderArg?: Map<string, number>
  ) {
    const wallThickness = Math.max(0.02, Number(getRoomWallThickness() || 0.16));
    const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.94, metalness: 0.02 });

    buildRoomFloorAndCeiling(room, ceilingColor, floorMaterial);

    (["north", "south", "west", "east"] as WallSide[]).forEach((wall) => {
      const { cuts, span } = collectWallCuts(room, wall, allRooms);
      let segments: IntervalSegment[] = subtractIntervals([{ from: 0, to: span, base: 0, top: room.height }], cuts);

      segments.forEach((seg: IntervalSegment) => {
        if (seg.to - seg.from <= WALL_SEGMENT_EPS || seg.top - seg.base <= WALL_SEGMENT_EPS) {
          return;
        }
        const mesh = makeWallSegment(room, wall, seg, wallThickness, wallMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        world.add(mesh);
        addRoomWallRuler(room, wall, seg, wallThickness);
        cacheWallCollider(mesh);
        wallMeshes.push(mesh);
      });
    });
  }

  function buildRooms(
    rooms: GalleryRoom[],
    wallColor: THREE_NS.ColorRepresentation,
    ceilingColor: THREE_NS.ColorRepresentation,
    floorMaterial: THREE_NS.Material
  ) {
    const roomOrder = new Map(rooms.map((room, index) => [room.id, index]));
    rooms.forEach((room) => {
      buildRoom(room, wallColor, ceilingColor, floorMaterial, rooms, roomOrder);
    });
  }

  function makeCustomWallSegmentMeshes(segment: CustomWallConfig, material: THREE_NS.MeshStandardMaterial): GalleryWallMesh[] {
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
      return [];
    }
    const dirX = dx / length;
    const dirZ = dz / length;
    const centerX = (x1 + x2) * 0.5;
    const centerZ = (z1 + z2) * 0.5;
    const angleY = -Math.atan2(dz, dx);
    const cuts = Array.isArray(segment.openings) ? segment.openings : [];
    const wallSegments: IntervalSegment[] = subtractIntervals(
      [{ from: 0, to: length, base: 0, top: height }],
      cuts.map((opening) => ({
        from: Math.max(0, (opening.center ?? 0) - (opening.width ?? 0) * 0.5),
        to: Math.min(length, (opening.center ?? 0) + (opening.width ?? 0) * 0.5),
        base: Math.max(0, opening.base ?? 0),
        top: Math.min(height, (opening.base ?? 0) + (opening.height ?? height)),
      }))
    );

    return wallSegments
      .filter((part) => part.to - part.from > 0.01 && part.top - part.base > 0.01)
      .map((part) => {
        const partLength = part.to - part.from;
        const partHeight = part.top - part.base;
        const localOffset = (part.from + part.to) * 0.5 - length * 0.5;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(partLength, partHeight, thickness), material);
        mesh.position.set(centerX + dirX * localOffset, part.base + partHeight * 0.5, centerZ + dirZ * localOffset);
        mesh.rotation.y = angleY;
        mesh.userData = {
          wallType: "customSegment",
          customWallId: segment.id,
        };
        addCustomWallRuler(segment, part, length, thickness);
        return mesh as GalleryWallMesh;
      });
  }

  function buildCustomWalls(cfg: { customWalls: CustomWallConfig[] }, wallColor: THREE_NS.ColorRepresentation) {
    const material = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.94, metalness: 0.02 });
    cfg.customWalls.forEach((segment: CustomWallConfig) => {
      const meshes = makeCustomWallSegmentMeshes(segment, material);
      meshes.forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        world.add(mesh);
        cacheWallCollider(mesh);
        wallMeshes.push(mesh);
      });
    });
  }

  return {
    buildRoom,
    buildRooms,
    buildCustomWalls,
  };
}
