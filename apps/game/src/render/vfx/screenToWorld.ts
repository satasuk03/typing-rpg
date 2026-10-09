/**
 * screenToActionPlane (spec §9.1): converts a HUD point (CSS px) to the point where its view ray meets the
 * action plane z = 0. Used to hand a HUD orb over to the world (sentence bolts). Allocation-free: the
 * scratch vectors are module-level.
 */
import { type PerspectiveCamera, Vector3 } from "three";

const NEAR = new Vector3();
const FAR = new Vector3();

/**
 * @returns false when the ray never reaches z = 0 (parallel or pointing away); `out` is untouched then.
 * The camera's world matrices must be current (the world updates them in `camera.update`).
 */
export function screenToActionPlane(
  cam: PerspectiveCamera,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
  out: Vector3,
): boolean {
  const nx = (cssX / cssW) * 2 - 1;
  const ny = -((cssY / cssH) * 2 - 1);
  NEAR.set(nx, ny, -1).unproject(cam);
  FAR.set(nx, ny, 1).unproject(cam);
  const dz = FAR.z - NEAR.z;
  if (Math.abs(dz) < 1e-9) return false;
  const t = -NEAR.z / dz;
  if (t < 0) return false;
  out.set(NEAR.x + (FAR.x - NEAR.x) * t, NEAR.y + (FAR.y - NEAR.y) * t, 0);
  return true;
}
