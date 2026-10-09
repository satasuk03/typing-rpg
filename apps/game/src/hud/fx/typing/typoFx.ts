/**
 * Typo reaction (§6): readable, not punishing. Glitch on the expected letter (the one exception to
 * R2), 3 px shake, gutter crack, vignette. Zen: amber glitch only. Guard plates: stronger variant.
 */
import type { SimEvent } from "@hd2d/sim";
import { TYPO } from "../../../level/typingFxParams";
import type { Hud } from "../../hud";

export type TypoEvent = Extract<SimEvent, { type: "Typo" }>;

export function applyTypo(hud: Hud, e: TypoEvent, zen: boolean): void {
  if (e.plateId === null) {
    // stray typo: vignette and thud only
    hud.flashTypoVignette(TYPO.strayVignette);
    return;
  }
  const fx = hud.plateFx;
  const warn = !hud.getSettings().reducedFlash && hud.getSettings().effectsIntensity > 0;
  if (zen) {
    fx.glitch(e.plateId, e.index, true);
    return;
  }
  fx.glitch(e.plateId, e.index, false);
  // a brief red frame flash on top of the spec'd glitch / shake / crack: makes "which plate" obvious at a glance
  if (warn) fx.flashBorder(e.plateId, TYPO.holdMs, TYPO.fadeMs, TYPO.red);
  if (e.kind === "guard") {
    fx.shake(e.plateId, TYPO.guardShake.mag, TYPO.guardShake.sec);
    hud.flashTypoVignette(TYPO.guardVignette);
  } else {
    fx.shake(e.plateId, TYPO.shake.mag, TYPO.shake.sec);
    hud.flashTypoVignette(TYPO.vignette);
  }
  fx.crack(e.plateId, e.index);
}
