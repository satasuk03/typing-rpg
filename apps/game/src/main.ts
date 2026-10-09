/** Touch-only devices are blocked: the game needs a keyboard. */
export function isTouchOnly(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches
  );
}

function boot(): void {
  const params = new URLSearchParams(location.search);
  const scene = params.get("scene");
  if (isTouchOnly() || params.get("force-touch") === "1") {
    void import("./app/screens/touch").then((m) => m.showTouchBlock());
    return;
  }

  const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;

  // Dev-only route: ?scene=render-test renders the hard-coded diorama (src/dev/renderTestScene.ts).
  if (scene === "render-test") {
    void import("./dev/renderTestScene").then((m) => m.start(glCanvas));
    return;
  }

  // Dev-only route: ?scene=audio-test (src/dev/audioTestScene.ts).
  if (scene === "audio-test") {
    void import("./dev/audioTestScene").then((m) => m.start(glCanvas));
    return;
  }

  // The Typing Trial + leaderboard (src/dev/trialScene.ts). The app links here with `from=app`: Esc then returns to
  // the app unless a run is in progress.
  if (scene === "trial") {
    void import("./dev/trialScene").then((m) => m.start(glCanvas));
    if (params.get("from") === "app") {
      window.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const phase = (window as unknown as { __trial?: { phase: string } }).__trial?.phase;
        if (phase === "running" || phase === "abandon") return;
        void import("./app/trialLink").then((m) => location.assign(m.appUrl()));
      });
      const hint = document.createElement("div");
      hint.id = "trial-back-hint";
      hint.textContent = "Esc: back to the menu (not during a run)";
      hint.style.cssText =
        "position:fixed;right:14px;bottom:10px;z-index:60;font:12px Silkscreen,monospace;color:#b9ad8c;letter-spacing:.08em;pointer-events:none";
      document.body.append(hint);
    }
    return;
  }

  // Dev-only route: ?scene=hud-test (src/dev/hudTestScene.ts).
  if (scene === "hud-test") {
    void import("./dev/hudTestScene").then((m) => m.start(glCanvas));
    return;
  }

  // Dev-only route: ?scene=typing-vfx (src/dev/typingVfxScene.ts): T2.6 typing VFX over the real world.
  if (scene === "typing-vfx") {
    void import("./dev/typingVfxScene").then((m) => m.start(glCanvas));
    return;
  }

  // Playable level: ?scene=play&level=ch1-l03[&wpm-bot=40] (src/dev/playScene.ts).
  if (scene === "play") {
    void import("./dev/playScene").then((m) => m.start(glCanvas));
    return;
  }

  // Dev-only route: ?scene=level&id=ch1-l03&pose=walk|battle:1|boss renders a level from its layout data.
  if (scene === "level") {
    void import("./dev/levelScene").then((m) => m.start(glCanvas));
    return;
  }

  // The real game: title -> map -> levels (src/app/).
  void import("./app/boot").then((m) => m.start(glCanvas, hudCanvas));
}

boot();
