/**
 * LightSlots (spec §10.2): the typing VFX own at most 3 dynamic lights: one held aura light and two
 * flash slots, all created once. `LightRig.flash` allocates, so flashes reuse these slots instead.
 * A flash sets colour, radius and a peak intensity; `update` fades it with life^2 (like the rig does).
 */
import type { DynamicLight, LightRig } from "../lighting";

interface Slot {
  light: DynamicLight;
  peak: number;
  life: number;
  max: number;
}

export class LightSlots {
  readonly aura: DynamicLight;
  private readonly slots: Slot[] = [];
  /** Global multiplier (effectsIntensity x reducedFlash factor), applied at flash time. */
  gain = 1;

  constructor(rig: LightRig) {
    this.aura = rig.hold({
      x: 0,
      y: 1.1,
      z: 0.4,
      radius: 0,
      color: [1, 0.9, 0.5],
      intensity: 0,
      scatter: 0,
    });
    for (let i = 0; i < 2; i++) {
      const light = rig.hold({
        x: 0,
        y: 1.2,
        z: 0.6,
        radius: 0,
        color: [1, 1, 1],
        intensity: 0,
        scatter: 0,
      });
      this.slots.push({ light, peak: 0, life: 0, max: 1 });
    }
  }

  /** Take the idle slot, or steal the one that is further along. Allocation-free. */
  flash(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    radius: number,
    lifeSec: number,
  ): void {
    const a = this.slots[0] as Slot;
    const c = this.slots[1] as Slot;
    let s = a;
    if (a.life > 0 && c.life <= 0) s = c;
    else if (a.life > 0 && c.life > 0) s = a.life / a.max < c.life / c.max ? a : c;
    const L = s.light;
    L.x = x;
    L.y = y;
    L.z = z;
    L.radius = radius;
    const col = L.color as unknown as number[];
    col[0] = r;
    col[1] = g;
    col[2] = b;
    s.peak = intensity * this.gain;
    s.life = lifeSec;
    s.max = lifeSec;
    L.intensity = s.peak;
  }

  /** Aura light (held): the caller sets intensity every frame. */
  setAura(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    radius: number,
  ): void {
    const L = this.aura;
    L.x = x;
    L.y = y;
    L.z = z;
    L.radius = intensity > 0.001 ? radius : 0;
    const col = L.color as unknown as number[];
    col[0] = r;
    col[1] = g;
    col[2] = b;
    L.intensity = intensity;
  }

  /** @hot */
  update(dt: number): void {
    for (let i = 0; i < 2; i++) {
      const s = this.slots[i] as Slot;
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.light.intensity = 0;
        s.light.radius = 0;
        continue;
      }
      const f = s.life / s.max;
      s.light.intensity = s.peak * f * f;
    }
  }

  /** Number of lights that are currently lit (aura + flashes). */
  get live(): number {
    let n = this.aura.intensity > 0.001 ? 1 : 0;
    for (const s of this.slots) if (s.life > 0) n++;
    return n;
  }

  clear(): void {
    for (const s of this.slots) {
      s.life = 0;
      s.light.intensity = 0;
      s.light.radius = 0;
    }
    this.aura.intensity = 0;
    this.aura.radius = 0;
  }

  dispose(): void {
    this.aura.dead = true;
    for (const s of this.slots) s.light.dead = true;
  }
}
