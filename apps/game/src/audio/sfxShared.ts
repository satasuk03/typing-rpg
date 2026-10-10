import type { Synth } from "./synth";

/** Heavy low impact shared by Ch1 and Ch2 voices (moved verbatim from sfx.ts in T3.3). */
export const impact = (s: Synth, t: number, heavy: number, pan: number): void => {
  s.osc("sine", 170 + heavy * 20, 42, t, 0.3 + heavy * 0.2, 0.75, { slide: 0.18, wet: 0.2, pan });
  s.noise(t, 0.12 + heavy * 0.1, 0.55, "lowpass", 2400, 300, { wet: 0.2, pan });
  s.osc("square", 900, 200, t, 0.03, 0.08, { lp: 3000, wet: 0, pan });
};
