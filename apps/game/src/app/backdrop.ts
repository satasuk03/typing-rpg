/**
 * Menu backdrop: a real level diorama (Chapter 1, walk pose) rendered by RenderWorld behind the DOM screens, exactly
 * like `playScene` builds a level, with the hero idling and a slow camera drift. One backdrop lives while the player is
 * in the menus; it is disposed before a level starts (the level session owns the GL canvas then).
 */
import { type QualityTier, RenderWorld } from "../render";
import { buildWorld, loadLevel, toRenderBiome, type WorldHandle } from "../render/world";

/** The level whose walk-pose diorama backs the menus of a chapter (Ch1 forest, Ch2 Hushwood). */
export const backdropLevelFor = (chapter: number): string => (chapter >= 2 ? "ch2-l01" : "ch1-l01");

export interface BackdropOptions {
  glCanvas: HTMLCanvasElement;
  levelId?: string;
  tier?: QualityTier;
  reducedMotion?: boolean;
}

export class Backdrop {
  readonly world: RenderWorld;
  readonly levelId: string;
  private readonly handle: WorldHandle;
  private raf = 0;
  private last = 0;
  private t = 0;
  private disposed = false;
  private actor: ReturnType<RenderWorld["addActor"]> | null = null;
  private readonly baseX: number;
  private readonly heroX: number;
  private readonly camPose: ReturnType<WorldHandle["cameraPose"]>;
  reducedMotion: boolean;
  /** Frames rendered so far (test hook). */
  frames = 0;

  constructor(o: BackdropOptions) {
    this.levelId = o.levelId ?? "ch1-l01";
    const layout = loadLevel(this.levelId);
    this.reducedMotion = o.reducedMotion ?? false;
    this.world = new RenderWorld({
      biome: toRenderBiome(layout.biome),
      quality: o.tier ?? 0,
      autoQuality: false,
    });
    this.world.init(o.glCanvas);
    this.handle = buildWorld(layout, this.world, this.world.source);
    this.camPose = this.handle.cameraPose("walk");
    const shot = this.handle.hasAnchor("walkshot") ? this.handle.getAnchor("walkshot") : null;
    const hx = shot ? shot.x : this.camPose.x - 3.2;
    this.baseX = this.camPose.x;
    const a = this.world.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
    const z = this.handle.walkPath.zAtX(hx);
    a.place(hx, 0, z);
    this.world.shadowFor(a, hx, z);
    this.actor = a;
    this.heroX = hx;
    this.world.camera.setTarget({ ...this.camPose });
    this.world.camera.snap();
    this.handle.update(1 / 60, this.camPose.x);
    this.world.update(1 / 60);
    this.handle.warmUp(3, this.camPose.x);
  }

  /** Nudge the idle hero (world units: dx along the road, dz toward/away from the camera) so screen UI never covers it. */
  setHeroOffset(dx: number, dz = 0): void {
    if (!this.actor) return;
    const x = this.heroX + dx;
    const z = this.handle.walkPath.zAtX(x) + dz;
    this.actor.place(x, 0, z);
    this.world.shadowFor(this.actor, x, z);
  }

  chestUrl(open: boolean): string {
    try {
      const f = this.world.source.frames("chest", open ? "open" : "closed")[0];
      if (!f) return "";
      const cv = document.createElement("canvas");
      cv.width = f.img.width;
      cv.height = f.img.height;
      cv.getContext("2d")?.drawImage(f.img as CanvasImageSource, 0, 0);
      return cv.toDataURL("image/png");
    } catch {
      return "";
    }
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number): void => {
      if (this.disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.t += dt;
      const drift = this.reducedMotion ? 0 : Math.sin(this.t * 0.18) * 0.7;
      this.world.camera.setTarget({ ...this.camPose, x: this.baseX + drift });
      this.handle.update(dt, this.world.camera.pose.x);
      this.world.update(dt, 0);
      const frames = this.world.source.frames("hero", "idle");
      const f = frames[Math.floor(this.t * 2.5) % Math.max(1, frames.length)];
      if (f && this.actor) this.actor.setFrame(f);
      this.world.render();
      this.frames++;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.actor?.dispose();
    this.handle.dispose();
    this.world.dispose();
  }
}
