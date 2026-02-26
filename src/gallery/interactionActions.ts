import * as THREE_NS from "three";
import type { AppContext } from "./appServices";
import { createPaintingConfigModel } from "./paintingModels";
import type { GalleryPainting, GalleryRoom, PaintingRegistryEntry, WallSide } from "./types";

type InteractionActionsDeps = {
  app: AppContext;
  canvas: HTMLCanvasElement;
  camera: THREE_NS.PerspectiveCamera;
  mouseNdc: THREE_NS.Vector2;
  PAINTING_SNAP_M: number;
  getWallSpan: (room: GalleryRoom, wall: WallSide) => number;
  snapToStep: (value: number, step: number) => number;
  buildPainting: (painting: GalleryPainting) => void;
  applyPaintingPlacement: (entry: PaintingRegistryEntry) => void;
  openPaintingCard: (spot: import("./types").PaintingSpot) => void;
  showEditPanelForEntry: (entry: PaintingRegistryEntry) => void;
  closePaintingCard: () => void;
  moveVisitorTo: (target: THREE_NS.Vector3, focusTarget: THREE_NS.Vector3 | null) => void;
  clampToWalkable: (point: THREE_NS.Vector3) => THREE_NS.Vector3 | null;
};

type WallIntersection = THREE_NS.Intersection<THREE_NS.Object3D> & {
  object: THREE_NS.Object3D & { userData: { roomId?: string; wall?: WallSide } };
};

export function createInteractionActions(deps: InteractionActionsDeps) {
  const {
    app,
    canvas,
    camera,
    mouseNdc,
    PAINTING_SNAP_M,
    getWallSpan,
    snapToStep,
    buildPainting,
    applyPaintingPlacement,
    openPaintingCard,
    showEditPanelForEntry,
    closePaintingCard,
    moveVisitorTo,
    clampToWalkable,
  } = deps;
  const { THREE, raycaster } = app.runtime;
  const { movement, visitor, uiState } = app.status;
  const { floorMeshes, wallMeshes, paintingRegistry } = app.collections;
  const { nextPaintingId, createPlaceholderPaintingImage } = app.helpers;
  const getConfig = app.status.refs.getConfig;
  const getRoomsById = app.status.refs.getRoomsById;

  function setPointerRay(clientX: number, clientY: number) {
    const bounds = canvas.getBoundingClientRect();
    mouseNdc.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    mouseNdc.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, camera);
  }

  function getFirstRoomWallHit(intersections: THREE_NS.Intersection<THREE_NS.Object3D>[]): WallIntersection | null {
    for (let i = 0; i < intersections.length; i += 1) {
      const hit = intersections[i] as WallIntersection;
      if (hit?.object?.userData?.roomId && hit?.object?.userData?.wall) {
        return hit;
      }
    }
    return null;
  }

  function createPaintingFromWallHit(room: GalleryRoom, wall: WallSide, hitPoint: THREE_NS.Vector3): GalleryPainting {
    const config = getConfig();
    const id = nextPaintingId(config.paintings, paintingRegistry);
    const span = getWallSpan(room, wall);
    const defaultCenter = snapToStep(THREE.MathUtils.clamp(hitPoint.y, 1.2, Math.max(1.3, room.height - 0.6)), PAINTING_SNAP_M);
    let offset = wall === "north" || wall === "south" ? hitPoint.x - room.x : hitPoint.z - room.z;
    offset = snapToStep(THREE.MathUtils.clamp(offset, 0.8, span - 0.8), PAINTING_SNAP_M);

    const painting = createPaintingConfigModel({
      id,
      roomId: room.id,
      wall,
      offset,
      centerY: defaultCenter,
      widthCm: 140,
      heightCm: 100,
      placed: true,
      image: createPlaceholderPaintingImage("Nuova Opera"),
    });
    config.paintings.push(painting);
    return painting;
  }

  function placeCatalogPaintingAtWall(paintingId: string, clientX: number, clientY: number) {
    const config = getConfig();
    const roomsById = getRoomsById();
    const painting = config.paintings.find((p) => p.id === paintingId);
    if (!painting) {
      return false;
    }
    setPointerRay(clientX, clientY);
    const wallHit = getFirstRoomWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (!wallHit) {
      return false;
    }
    const roomId = wallHit.object.userData.roomId;
    const wall = wallHit.object.userData.wall;
    const room = roomId ? roomsById.get(roomId) : null;
    if (!room || !wall) {
      return false;
    }

    const span = getWallSpan(room, wall);
    let offset = wall === "north" || wall === "south" ? wallHit.point.x - room.x : wallHit.point.z - room.z;
    offset = snapToStep(THREE.MathUtils.clamp(offset, 0.8, span - 0.8), PAINTING_SNAP_M);
    const centerY = snapToStep(THREE.MathUtils.clamp(wallHit.point.y, 1.2, Math.max(1.3, room.height - 0.6)), PAINTING_SNAP_M);

    painting.roomId = room.id;
    painting.wall = wall;
    painting.offset = offset;
    painting.centerY = centerY;
    painting.placed = true;

    const entry = paintingRegistry.get(painting.id);
    if (entry) {
      entry.room = room;
      entry.painting.roomId = room.id;
      entry.painting.wall = wall;
      entry.painting.offset = offset;
      entry.painting.centerY = centerY;
      applyPaintingPlacement(entry);
      uiState.selectedPaintingId = painting.id;
      openPaintingCard(entry.paintingSpot);
      showEditPanelForEntry(entry);
      return true;
    }

    buildPainting(painting);
    const built = paintingRegistry.get(painting.id);
    if (!built) {
      return false;
    }
    uiState.selectedPaintingId = painting.id;
    openPaintingCard(built.paintingSpot);
    showEditPanelForEntry(built);
    return true;
  }

  function handleFloorMove(clientX: number, clientY: number) {
    closePaintingCard();
    setPointerRay(clientX, clientY);
    const intersections = raycaster.intersectObjects(floorMeshes, false);
    if (!intersections.length) {
      return false;
    }
    const target = intersections[0].point.clone();
    const clamped = clampToWalkable(target);
    if (!clamped) {
      return false;
    }
    moveVisitorTo(clamped, null);
    return true;
  }

  function handleWallCreateClick(clientX: number, clientY: number) {
    if (!uiState.editMode) {
      return false;
    }
    const roomsById = getRoomsById();
    setPointerRay(clientX, clientY);
    const wallHit = getFirstRoomWallHit(raycaster.intersectObjects(wallMeshes, false));
    if (!wallHit) {
      return false;
    }
    const roomId = wallHit.object.userData.roomId;
    const wall = wallHit.object.userData.wall;
    const room = roomId ? roomsById.get(roomId) : null;
    if (!room || !wall) {
      return false;
    }

    const painting = createPaintingFromWallHit(room, wall, wallHit.point);
    buildPainting(painting);
    const entry = paintingRegistry.get(painting.id);
    if (!entry) {
      return false;
    }

    movement.route = [];
    movement.destination = null;
    movement.finalDestination = null;
    movement.focusTarget = entry.paintingSpot.center.clone();
    openPaintingCard(entry.paintingSpot);
    showEditPanelForEntry(entry);
    return true;
  }

  return {
    setPointerRay,
    getFirstRoomWallHit,
    placeCatalogPaintingAtWall,
    handleFloorMove,
    handleWallCreateClick,
  };
}
