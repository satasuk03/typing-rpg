import type { BiomeMood } from "../biomes";
import { makeRng } from "../util";
import type { Particles } from "./particles";

export interface FlameRef {
  x: number;
  y: number;
  z: number;
  /** True for flames in the blurred foreground layer (fewer embers). */
  foreground: boolean;
}

/**
 * Biome ambience: torch embers, cave ember drift + glints, forest pollen / fireflies / falling leaves, and the
 * Ch2 night kinds (wisps, fireflies, leaves).
 * Ported from the POC `updateEnvironment`; spawn decisions use a seeded RNG and the `dt` passed in.
 */
export class AmbientDirector {
  private readonly rnd = makeRng(0xa11ce);
  /** 0..1 multiplier from the quality tier. */
  density = 1;

  constructor(
    private readonly additive: Particles,
    private readonly normal: Particles,
  ) {}

  private rr(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  update(
    dt: number,
    camX: number,
    mood: BiomeMood,
    flames: readonly FlameRef[],
    time: number,
  ): void {
    void time;
    const rnd = this.rnd;
    const rr = (a: number, b: number): number => this.rr(a, b);
    const d = this.density;
    const PA = this.additive;
    const PB = this.normal;
    // torch embers
    for (const f of flames) {
      if (Math.abs(f.x - camX) > 16) continue;
      if (rnd() < dt * (f.foreground ? 4 : 7) * d) {
        PA.spawn({
          x: f.x + (rnd() - 0.5) * 0.15,
          y: f.y + 0.55,
          z: f.z + 0.05,
          vx: (rnd() - 0.5) * 0.8,
          vy: 1.2 + rnd() * 1.6,
          vz: (rnd() - 0.5) * 0.3,
          life: 0.9 + rnd() * 1.1,
          size: 0.035,
          st: 0.16,
          kind: 2,
          r: 4,
          g: 1.5,
          b: 0.35,
          a: 1,
          drag: 0.6,
          sway: 1.2,
          ph: rnd() * 6,
        });
      }
    }
    if (mood.ambient === "embers") {
      const caveK = Math.max(0.2, mood.caveK);
      const n = dt * 26 * caveK * d;
      for (let i = 0; i < n || rnd() < n - i; i++) {
        const z = rnd() < 0.6 ? rr(-1.5, 2.5) : rr(2.5, 8.5);
        const side = rnd() < 0.5;
        PA.spawn({
          x: camX + rr(-12, 12) + (side ? 4 : 0),
          y: rr(-0.5, 4),
          z,
          vx: -rr(1.5, 4.2),
          vy: rr(1.4, 3.2),
          vz: rr(-0.2, 0.2),
          life: rr(1.2, 2.4),
          size: z > 4 ? 0.05 : 0.032,
          st: 0.22,
          kind: 2,
          r: 4.2,
          g: 1.4,
          b: 0.3,
          a: rr(0.6, 1),
          sway: 1.5,
          ph: rnd() * 6,
          drag: 0.2,
        });
      }
      if (rnd() < dt * 3.5 * caveK * d) {
        PA.spawn({
          x: camX + rr(-6, 12),
          y: rr(-1, 3),
          z: rr(5, 9),
          vx: -rr(4, 7),
          vy: rr(2.5, 4.5),
          life: rr(0.8, 1.4),
          size: 0.07,
          st: 0.3,
          kind: 2,
          r: 4.5,
          g: 1.6,
          b: 0.35,
          sway: 2,
          ph: rnd() * 6,
        });
      }
      if (rnd() < dt * 6 * caveK * d) {
        PA.spawn({
          x: camX + rr(-12, 12),
          y: rr(0, 5),
          z: rr(-6, 2),
          vy: 0.12,
          life: 2.5,
          size: 0.05,
          kind: 0,
          r: 0.6,
          g: 1.4,
          b: 2.2,
          sway: 0.3,
          fadeIn: 0.4,
        });
      }
    } else if (
      mood.ambient === "wisps" ||
      mood.ambient === "fireflies" ||
      mood.ambient === "leaves"
    ) {
      this.night(dt, camX, mood);
    } else if (mood.ambient === "pollen") {
      const dusk = mood.fill > 0.1 && mood.caveK < 0.5 ? 1 : 0;
      if (rnd() < dt * 14 * d) {
        PA.spawn({
          x: camX + rr(-12, 12),
          y: rr(0.3, 6),
          z: rr(-6, 5),
          vx: rr(0.05, 0.25),
          vy: rr(-0.1, 0.1),
          life: rr(3, 5),
          size: rr(0.03, 0.06),
          kind: 0,
          r: 1.6,
          g: 1.4,
          b: 1.0,
          a: 0.8,
          sway: 0.4,
          ph: rnd() * 6,
          fadeIn: 0.3,
        });
      }
      if (rnd() < dt * 5 * d) {
        PA.spawn({
          x: camX + rr(-10, 10),
          y: rr(0.4, 2.8),
          z: rr(-4, 3),
          vx: rr(-0.3, 0.3),
          vy: rr(-0.2, 0.2),
          life: rr(2, 4),
          size: 0.09,
          kind: 0,
          r: 2.0,
          g: 2.8,
          b: 0.8,
          sway: 1.2,
          ph: rnd() * 6,
          fadeIn: 0.4,
        });
      }
      if (rnd() < dt * 2.2 * d) {
        PB.spawn({
          x: camX + rr(-12, 14),
          y: 8,
          z: rr(-4, 4),
          vx: rr(-0.6, 0.2),
          vy: -0.7,
          life: 9,
          size: 0.08,
          kind: 1,
          r: dusk ? 0.85 : 0.5,
          g: dusk ? 0.45 : 0.75,
          b: 0.2,
          sway: 1.6,
          ph: rnd() * 6,
          spin: 3,
        });
      }
    }
  }

  /**
   * Ch2 ambience (C0.2 brief 1.5). `wisps` (hushwood): teal motes, a few big drifting lights, sparse DARK night leaves.
   * `fireflies` (fen): yellow-green fireflies plus slow pollen. `leaves` (grove): the silver-teal leaf storm (12% gold).
   * Night leaves are dark normal-blend colours (unlit): the Ch1 orange would glow at night.
   */
  private night(dt: number, camX: number, mood: BiomeMood): void {
    const rnd = this.rnd;
    const rr = (a: number, b: number): number => this.rr(a, b);
    const d = this.density;
    const PA = this.additive;
    const PB = this.normal;
    const every = (rate: number, fn: () => void): void => {
      const n = rate * dt * d;
      for (let i = 0; i < n || rnd() < n - i; i++) fn();
    };
    if (mood.ambient === "wisps") {
      every(16, () =>
        PA.spawn({
          x: camX + rr(-13, 13),
          y: rr(0.3, 4.5),
          z: rr(-7, 4),
          vx: rr(-0.08, 0.12),
          vy: rr(0.04, 0.2),
          life: rr(4, 6),
          size: rr(0.03, 0.06),
          kind: 0,
          r: 0.45,
          g: 1.3,
          b: 1.6,
          a: 0.8,
          sway: 0.7,
          ph: rnd() * 6,
          fadeIn: 0.5,
        }),
      );
      every(1.6, () =>
        PA.spawn({
          x: camX + rr(-12, 12),
          y: rr(0.8, 3.5),
          z: rr(-6, 3),
          vx: rr(-0.15, 0.15),
          vy: rr(-0.05, 0.12),
          life: rr(5, 7),
          size: rr(0.1, 0.15),
          kind: 0,
          r: 0.5,
          g: 1.5,
          b: 1.9,
          a: 0.75,
          sway: 1.1,
          ph: rnd() * 6,
          fadeIn: 0.8,
        }),
      );
      every(1.4, () =>
        PB.spawn({
          x: camX + rr(-12, 14),
          y: 8,
          z: rr(-4, 4),
          vx: rr(-0.5, 0.2),
          vy: -0.6,
          life: 10,
          size: 0.08,
          kind: 1,
          r: 0.24,
          g: 0.13,
          b: 0.09,
          sway: 1.6,
          ph: rnd() * 6,
          spin: 3,
        }),
      );
    } else if (mood.ambient === "fireflies") {
      every(9, () =>
        PA.spawn({
          x: camX + rr(-13, 13),
          y: rr(0.3, 2.6),
          z: rr(-7, 4),
          vx: rr(-0.25, 0.25),
          vy: rr(-0.15, 0.2),
          life: rr(2, 4),
          size: rr(0.06, 0.1),
          kind: 0,
          r: 1.5,
          g: 2.2,
          b: 0.45,
          a: 1,
          sway: 1.3,
          ph: rnd() * 6,
          fadeIn: 0.4,
        }),
      );
      every(8, () =>
        PA.spawn({
          x: camX + rr(-13, 13),
          y: rr(0.3, 5),
          z: rr(-7, 4),
          vx: rr(0.05, 0.2),
          vy: rr(-0.05, 0.08),
          life: rr(4, 6),
          size: rr(0.025, 0.045),
          kind: 0,
          r: 1.3,
          g: 1.1,
          b: 0.55,
          a: 0.6,
          sway: 0.4,
          ph: rnd() * 6,
          fadeIn: 0.4,
        }),
      );
    } else {
      every(9, () => {
        const gold = rnd() < 0.12;
        PB.spawn({
          x: camX + rr(-13, 14),
          y: rr(8, 10),
          z: rr(-6, 5),
          vx: rr(-0.5, 0.3),
          vy: -rr(0.55, 0.8),
          life: 12,
          size: rr(0.07, 0.1),
          kind: 1,
          r: gold ? 0.7 : 0.16,
          g: gold ? 0.5 : 0.34,
          b: gold ? 0.12 : 0.32,
          sway: 1.6,
          ph: rnd() * 6,
          spin: 3,
        });
      });
    }
  }

  /** Pre-roll so the first frame already has particles in the air (screenshots, biome changes). */
  warmUp(seconds: number, camX: number, mood: BiomeMood, flames: readonly FlameRef[]): void {
    const step = 1 / 30;
    for (let t = 0; t < seconds; t += step) {
      this.update(step, camX, mood, flames, t);
      this.additive.update(step);
      this.normal.update(step);
    }
  }
}
