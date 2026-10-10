import type { LevelDef } from "../schemas.ts";
import { LEVELS_CH1 } from "./levels-ch1.ts";
import { LEVELS_CH2 } from "./levels-ch2.ts";

// Per-chapter level tables (docs/interfaces.md §13.2): levels-ch1.ts, levels-ch2.ts, knobs in knobs.ts.
export {
  BOSS_ATTACK_POWER,
  BOSS_LEVEL_HIT_MULT,
  bossLevelHit,
  CH1_REF_WPM,
  ENC_HP_MULT,
  HIT_MULT,
  LEVELS_CH1,
} from "./levels-ch1.ts";
export { CH2_STUB_LEVELS, LEVELS_CH2 } from "./levels-ch2.ts";

/** Ch1 then Ch2, sorted by (chapter, index). */
export const LEVELS: LevelDef[] = [...LEVELS_CH1, ...LEVELS_CH2];
