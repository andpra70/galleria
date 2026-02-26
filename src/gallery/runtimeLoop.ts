import * as THREE_NS from "three";
import type { MovementState, VisitorState } from "./appStatus";
import type { MapState } from "./appStatus";
import type { ShowConfig } from "./types";

type RuntimeLoopDeps = {
  renderer: THREE_NS.WebGLRenderer;
  camera: THREE_NS.PerspectiveCamera;
  scene: THREE_NS.Scene;
  clock: THREE_NS.Clock;
  minimapCanvas: HTMLCanvasElement;
  miniCtx: CanvasRenderingContext2D;
  mapState: MapState;
  visitor: VisitorState;
  movement: MovementState;
  getConfig: () => ShowConfig;
  updateMovement: (dt: number) => void;
  updateFocusOrientation: (dt: number) => void;
  updateCamera: () => void;
  afterCameraUpdate?: () => void;
  drawMiniMap: (args: {
    minimapCanvas: HTMLCanvasElement;
    miniCtx: CanvasRenderingContext2D;
    mapState: MapState;
    config: ShowConfig;
    visitor: VisitorState;
    movement: MovementState;
  }) => void;
};

export function createRuntimeLoop(deps: RuntimeLoopDeps) {
  const {
    renderer,
    camera,
    scene,
    clock,
    minimapCanvas,
    miniCtx,
    mapState,
    visitor,
    movement,
    getConfig,
    updateMovement,
    updateFocusOrientation,
    updateCamera,
    afterCameraUpdate,
    drawMiniMap,
  } = deps;

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.033);
    updateMovement(dt);
    updateFocusOrientation(dt);
    updateCamera();
    afterCameraUpdate?.();
    drawMiniMap({ minimapCanvas, miniCtx, mapState, config: getConfig(), visitor, movement });
    renderer.render(scene, camera);
  }

  return {
    onResize,
    animate,
  };
}
