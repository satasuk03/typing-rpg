import { PerspectiveCamera, Vector3 } from "three";
import { lerp } from "./util";

const D2R = Math.PI / 180;

/** Where the diorama camera wants to be. Pitch/fov in degrees, distance in world units. */
export interface CameraPose {
  /** Look-at x (the action plane is z = 0). */
  x: number;
  /** Look-at height. */
  y: number;
  dist: number;
  pitch: number;
  fov: number;
}

/** POC "walk" pose: low, long lens, follows the hero. */
export const WALK_POSE: Readonly<Omit<CameraPose, "x">> = {
  y: 1.75,
  dist: 19.5,
  pitch: 11,
  fov: 32,
};
/** POC battle pose. */
export const BATTLE_POSE: Readonly<Omit<CameraPose, "x">> = {
  y: 1.9,
  dist: 18.6,
  pitch: 16,
  fov: 32,
};
/** POC boss-intro close-up (narrow lens, low pitch). */
export const BOSS_INTRO_POSE: Readonly<Omit<CameraPose, "x">> = {
  y: 2.7,
  dist: 18,
  pitch: 7,
  fov: 19,
};

/**
 * Perspective diorama camera: a tilted, narrow-FOV camera looking at the action plane, with smooth
 * follow toward a target pose and additive hooks for shake / FOV punch / radial zoom and CA.
 * All motion is a function of the `dt` and `time` passed in: no clocks, no Math.random.
 */
export class DioramaCamera {
  readonly camera = new PerspectiveCamera(32, 16 / 9, 0.5, 260);
  /** Current (smoothed) pose. */
  readonly pose: CameraPose = { x: 0, y: 1.75, dist: 19.5, pitch: 11, fov: 32 };
  /** Pose being followed. */
  readonly target: CameraPose = { x: 0, y: 1.75, dist: 19.5, pitch: 11, fov: 32 };
  /** Follow rate (1/s). */
  followRate = 2.6;
  /** Scales shake/punch/zoom/CA (set to ~0.25 for prefers-reduced-motion). */
  motionScale = 1;

  // transient hooks (decay on their own)
  shakeTime = 0;
  shakeMag = 0;
  punchAmount = 0;
  caAmount = 0;
  zoomAmount = 0;
  readonly zoomCenter = { x: 0.5, y: 0.5 };
  /** Offset added to the camera position after follow (world units), e.g. for scripted dollies. */
  readonly offset = new Vector3();
  private shakeX = 0;
  private shakeY = 0;

  setTarget(t: Partial<CameraPose>): void {
    Object.assign(this.target, t);
  }

  /** Jump straight to the target (no smoothing). */
  snap(): void {
    Object.assign(this.pose, this.target);
    this.apply();
  }

  shake(duration: number, magnitude: number): void {
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeMag = Math.max(this.shakeMag, magnitude * this.motionScale);
  }

  /** FOV punch-in + chromatic aberration + radial zoom blur (decay over time). */
  punch(punch: number, ca: number, zoom: number, zoomX?: number, zoomY?: number): void {
    const s = this.motionScale;
    this.punchAmount = Math.max(this.punchAmount, punch * s);
    this.caAmount = Math.max(this.caAmount, ca * s);
    this.zoomAmount = Math.max(this.zoomAmount, zoom * s);
    if (zoomX !== undefined && zoomY !== undefined) {
      this.zoomCenter.x = zoomX;
      this.zoomCenter.y = zoomY;
    }
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Advance smoothing and transients. `time` drives the deterministic shake noise. */
  update(dt: number, time: number): void {
    const k = Math.min(1, dt * this.followRate);
    const p = this.pose;
    const t = this.target;
    p.x = lerp(p.x, t.x, k);
    p.y = lerp(p.y, t.y, k);
    p.dist = lerp(p.dist, t.dist, k);
    p.pitch = lerp(p.pitch, t.pitch, k);
    p.fov = lerp(p.fov, t.fov, k);

    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shakeMag = 0;
    const sm = this.shakeTime > 0 ? this.shakeMag * Math.min(1, this.shakeTime * 4) : 0;
    this.shakeX = Math.sin(time * 97.3) * Math.cos(time * 41.7) * 0.12 * sm;
    this.shakeY = Math.sin(time * 83.1 + 1.3) * Math.cos(time * 53.9) * 0.12 * sm;
    this.punchAmount = Math.max(0, this.punchAmount - dt * 5);
    this.caAmount = Math.max(0, this.caAmount - dt * 0.06);
    this.zoomAmount = Math.max(0, this.zoomAmount - dt * 0.35);
    this.apply();
  }

  private apply(): void {
    const p = this.pose;
    const P = p.pitch * D2R;
    const cam = this.camera;
    cam.position.set(
      p.x + this.shakeX + this.offset.x,
      p.y + Math.sin(P) * p.dist + this.shakeY + this.offset.y,
      Math.cos(P) * p.dist + this.offset.z,
    );
    cam.lookAt(p.x + this.shakeX, p.y + this.shakeY * 0.5, 0);
    cam.fov = p.fov - this.punchAmount * 2.2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Project a world point to normalised device coords (-1..1). */
  project(x: number, y: number, z: number, out = new Vector3()): Vector3 {
    return out.set(x, y, z).project(this.camera);
  }
}
