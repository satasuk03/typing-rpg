/** Accessibility / intensity settings consumed by the HUD (UI screens come later). */
export interface HudSettings {
  /** 0..1 scales glow, spark counts and pop size punch. */
  effectsIntensity: number;
  /** No full-screen flashes, no blinking, flash alpha capped. */
  reducedFlash: boolean;
  /** No shake, bob, bounce or slide-in animations. */
  reducedMotion: boolean;
}
export const DEFAULT_HUD_SETTINGS: HudSettings = {
  effectsIntensity: 1,
  reducedFlash: false,
  reducedMotion: false,
};
export function normalizeSettings(s: Partial<HudSettings>, base: HudSettings): HudSettings {
  const v = s.effectsIntensity ?? base.effectsIntensity;
  return {
    effectsIntensity: Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1)),
    reducedFlash: s.reducedFlash ?? base.reducedFlash,
    reducedMotion: s.reducedMotion ?? base.reducedMotion,
  };
}
