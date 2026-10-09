/** §2.1 letter pop curve: pure, writes into a reused LetterFxState (no allocation). */
import { easeOutQuad, POP } from "../../../level/typingFxParams";
import type { LetterFxState } from "../../fx";
import type { HudSettings } from "../../settings";

/**
 * @param ageMs       time since the keystroke
 * @param isSentence  sentence plates (18 px font): scale excess x0.7, lift x0.5
 * Fills `scale`, `flash` (white mix), `glowPx` and `liftPx`; other fields are left untouched.
 * Past 200 ms everything is neutral (scale 1, flash 0, glowPx 0 = "use the resting glow").
 */
export function letterPopCurve(
  ageMs: number,
  isSentence: boolean,
  s: HudSettings,
  out: LetterFxState,
): void {
  const k = s.effectsIntensity;
  const T = POP.t;
  if (ageMs >= T[4] || ageMs < 0) {
    out.scale = 1;
    out.flash = 0;
    out.glowPx = 0;
    out.liftPx = 0;
    return;
  }
  let i = 0;
  while (i < 3 && ageMs >= (T[i + 1] as number)) i++;
  const t0 = T[i] as number;
  const t1 = T[i + 1] as number;
  const e = easeOutQuad((ageMs - t0) / (t1 - t0));
  const lerp = (a: readonly number[]): number =>
    (a[i] as number) + ((a[i + 1] as number) - (a[i] as number)) * e;
  const excess = (lerp(POP.scale) - 1) * k * (isSentence ? POP.sentenceExcess : 1);
  out.scale = s.reducedMotion ? 1 : 1 + excess;
  const cap = s.reducedFlash ? POP.reducedFlashWhiteCap : 1;
  out.flash = Math.min(cap, lerp(POP.white) * k);
  out.glowPx = lerp(POP.glow) * (0.5 + 0.5 * k);
  out.liftPx = s.reducedMotion ? 0 : lerp(POP.lift) * k * (isSentence ? 0.5 : 1);
}
