import { PerspectiveCamera, Scene, WebGLRenderer } from "three";

/** Touch-only devices are blocked: the game needs a keyboard. */
export function isTouchOnly(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches
  );
}

function boot(): void {
  if (isTouchOnly()) {
    const msg = document.getElementById("no-touch");
    if (msg) msg.style.display = "flex";
    return;
  }

  const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;

  // Dev-only route: ?scene=render-test renders the hard-coded diorama (src/dev/renderTestScene.ts).
  if (new URLSearchParams(location.search).get("scene") === "render-test") {
    void import("./dev/renderTestScene").then((m) => m.start(glCanvas));
    return;
  }

  // Dev-only route: ?scene=audio-test (src/dev/audioTestScene.ts).
  if (new URLSearchParams(location.search).get("scene") === "audio-test") {
    void import("./dev/audioTestScene").then((m) => m.start(glCanvas));
    return;
  }

  // Dev-only route: ?scene=hud-test (src/dev/hudTestScene.ts).
  if (new URLSearchParams(location.search).get("scene") === "hud-test") {
    void import("./dev/hudTestScene").then((m) => m.start(glCanvas));
    return;
  }

  const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: false });
  renderer.setClearColor(0x080a12, 1);
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 16 / 9, 0.1, 200);
  const hud = hudCanvas.getContext("2d");

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    hudCanvas.width = Math.round(w * dpr);
    hudCanvas.height = Math.round(h * dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  const drawHud = (): void => {
    if (!hud) return;
    const dpr = hudCanvas.width / window.innerWidth;
    hud.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.clearRect(0, 0, window.innerWidth, window.innerHeight);
    hud.fillStyle = "#f3e7c0";
    hud.font = "16px system-ui, sans-serif";
    hud.fillText("HUD", 16, 28);
  };

  const frame = (): void => {
    renderer.render(scene, camera);
    drawHud();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
