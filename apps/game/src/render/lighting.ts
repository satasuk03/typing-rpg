import { Vector2, Vector3, Vector4 } from "three";
import type { BiomeMood } from "./biomes";
import { clamp, sstep, type Vec3Tuple } from "./util";

/** Fixed light count: a constant array size avoids shader recompiles when lights come and go. */
export const MAX_LIGHTS = 16;

export const TORCH_COLOR: Vec3Tuple = [1.0, 0.52, 0.2];

type U<T> = { value: T };

/**
 * The single uniform block shared by every lit material (sprites, ground, walls, backdrops, fx).
 * Materials spread this object into their own `uniforms`, so they all reference the SAME `{ value }`
 * cells: updating a value here updates every material with no per-material work.
 */
export interface LightingUniforms {
  uLP: U<Vector4[]>; // xyz = position, w = radius (<= 0 means the slot is off)
  uLC: U<Vector4[]>; // rgb = colour * intensity, w = in-scatter strength
  uAmb: U<Vector3>;
  uGAmb: U<Vector3>;
  uSunDir: U<Vector3>;
  uSunCol: U<Vector3>;
  uFogCol: U<Vector3>;
  uFog: U<Vector3>;
  uCam: U<Vector3>;
  uScatter: U<number>;
  uTime: U<number>;
  /** 1 = unlit "raw pixels" mode (HD-2D off). */
  uFlat: U<number>;
  /** x range over which the ground blends from forest to cave. */
  uBiome: U<Vector2>;
}

export function createLightingUniforms(): LightingUniforms {
  return {
    uLP: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4()) },
    uLC: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector4()) },
    uAmb: { value: new Vector3() },
    uGAmb: { value: new Vector3() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Vector3() },
    uFogCol: { value: new Vector3() },
    uFog: { value: new Vector3(0.02, 10, 0.3) },
    uCam: { value: new Vector3() },
    uScatter: { value: 1 },
    uTime: { value: 0 },
    uFlat: { value: 0 },
    uBiome: { value: new Vector2(98, 118) },
  };
}

export interface LightDef {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: Vec3Tuple;
  intensity: number;
  /** In-scatter (volumetric halo) strength. */
  scatter?: number;
  /** Torch-style flicker. */
  flicker?: boolean;
  /** Phase offset for the flicker so neighbouring torches do not pulse together. */
  phase?: number;
}

/** A light that exists for the whole scene (torch, crystal, mushroom...). */
export interface StaticLight extends Required<LightDef> {
  /** Lights farther than this from the focus x are not considered. */
  cullDist: number;
  /** Extra sort penalty so foreground lights do not crowd out mid-ground ones. */
  sortBias: number;
}

/** A light with a lifetime (flash) or held until removed (`hold`). Created by VFX through the rig. */
export interface DynamicLight extends Required<LightDef> {
  life: number;
  max: number;
  hold: boolean;
  dead: boolean;
}

/**
 * Light rig: owns the static + dynamic light lists and packs the nearest MAX_LIGHTS into the shared
 * uniform block each update. Flicker is driven by the `time` value passed to `update` (render never
 * reads a clock itself).
 */
export class LightRig {
  readonly uniforms: LightingUniforms;
  private readonly statics: StaticLight[] = [];
  private readonly dynamics: DynamicLight[] = [];
  private readonly pick: [StaticLight | DynamicLight, number][] = [];
  private seed = 1;

  constructor(uniforms: LightingUniforms) {
    this.uniforms = uniforms;
  }

  get staticLights(): readonly StaticLight[] {
    return this.statics;
  }

  private nextPhase(): number {
    // deterministic phases (no Math.random): a golden-ratio sequence
    this.seed += 1;
    return (this.seed * 0.61803398875 * 10) % 10;
  }

  addStatic(def: LightDef, cullDist = 17, sortBias = 0): StaticLight {
    const L: StaticLight = {
      x: def.x,
      y: def.y,
      z: def.z,
      radius: def.radius,
      color: def.color,
      intensity: def.intensity,
      scatter: def.scatter ?? 0.02,
      flicker: def.flicker ?? true,
      phase: def.phase ?? this.nextPhase(),
      cullDist,
      sortBias,
    };
    this.statics.push(L);
    return L;
  }

  private addDynamic(def: LightDef, life: number, hold: boolean): DynamicLight {
    const L: DynamicLight = {
      x: def.x,
      y: def.y,
      z: def.z,
      radius: def.radius,
      color: def.color,
      intensity: def.intensity,
      scatter: def.scatter ?? 0.006,
      flicker: def.flicker ?? false,
      phase: def.phase ?? 0,
      life,
      max: life,
      hold,
      dead: false,
    };
    this.dynamics.push(L);
    return L;
  }

  /** Short-lived light (hit flashes, spell glow). Fades with life^2. */
  flash(def: LightDef, life: number): DynamicLight {
    return this.addDynamic(def, life, false);
  }

  /** Light that stays until `dead` is set (fireball, chest glow, fill light). */
  hold(def: LightDef): DynamicLight {
    return this.addDynamic(def, 1e9, true);
  }

  clearStatic(): void {
    this.statics.length = 0;
  }

  /** Set a flat "no lights" state (used before the first update). */
  clearUniforms(): void {
    for (let i = 0; i < MAX_LIGHTS; i++) {
      this.uniforms.uLP.value[i]?.set(0, 0, 0, 0);
      this.uniforms.uLC.value[i]?.set(0, 0, 0, 0);
    }
  }

  /** Apply the lighting/fog part of a biome mood to the shared uniforms. */
  applyMood(m: BiomeMood): void {
    const u = this.uniforms;
    u.uAmb.value.set(...m.amb);
    u.uGAmb.value.set(...m.gamb);
    u.uSunCol.value.set(...m.sunCol);
    u.uSunDir.value.set(...m.sunDir).normalize();
    u.uFogCol.value.set(...m.fogCol);
    u.uFog.value.set(...m.fog);
    u.uScatter.value = m.scatter;
  }

  update(dt: number, focusX: number, time: number): void {
    const dyn = this.dynamics;
    for (const L of dyn) if (!L.hold) L.life -= dt;
    for (let i = dyn.length - 1; i >= 0; i--) {
      const L = dyn[i];
      if (L && (L.life <= 0 || L.dead)) dyn.splice(i, 1);
    }
    const pick = this.pick;
    pick.length = 0;
    for (const L of dyn) pick.push([L, -1000 + Math.abs(L.x - focusX)]);
    for (const L of this.statics) {
      const d = Math.abs(L.x - focusX);
      if (d < L.cullDist) pick.push([L, d + L.sortBias + (L.z > 4 ? 3 : 0)]);
    }
    pick.sort((a, b) => a[1] - b[1]);
    const LP = this.uniforms.uLP.value;
    const LC = this.uniforms.uLC.value;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const lp = LP[i];
      const lc = LC[i];
      if (!lp || !lc) continue;
      const e = pick[i];
      if (!e) {
        lp.set(0, 0, 0, 0);
        lc.set(0, 0, 0, 0);
        continue;
      }
      const L = e[0];
      let k = L.intensity;
      if (L.flicker) {
        const p = L.phase;
        k *=
          0.82 +
          0.1 * Math.sin(time * 13 + p) +
          0.06 * Math.sin(time * 31 + p * 2) +
          0.04 * Math.sin(time * 7.3 + p);
      }
      const isDynamic = "life" in L;
      if (isDynamic && (L as DynamicLight).max < 1e8) {
        const f = clamp((L as DynamicLight).life / (L as DynamicLight).max, 0, 1);
        k *= f * f;
      }
      if (!isDynamic) k *= 1 - sstep(13, 17, Math.abs(L.x - focusX)); // fade at the cull edge
      lp.set(L.x, L.y, L.z, L.radius);
      lc.set(L.color[0] * k, L.color[1] * k, L.color[2] * k, L.scatter);
    }
  }
}
