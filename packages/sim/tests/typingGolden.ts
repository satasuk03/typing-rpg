// Golden replays shared by the Node determinism test and the Chromium parity bundle (node-tests/browser-entry.ts), so
// this file must stay pure and deterministic.
//  - scripted typing sessions on the boss fixture level (T1.2, now with combat on)
//  - T1.3 combat replays: a reference bot plays six scenarios (three with skills and passives, T1.4); the recorded inputs are replayed through replay()
import {
  type ActiveSkillId,
  canonicalJson,
  fnv1a32,
  type PassiveId,
  replay,
} from "../src/index.ts";
import { runBot } from "./bot/refBot.ts";
import {
  ENEMIES,
  mkDef,
  mkLoadout,
  mkOptions,
  mkSimpleDef,
  scriptedSession,
} from "./typingHarness.ts";

export const TYPING_GOLDEN_SEEDS = [1, 42, 2024, 0xdeadbeef] as const;

export interface TypingGolden {
  /** fnv1a32 hash of the final LevelState (the sim's own `hash`). */
  state: string;
  /** fnv1a32(canonicalJson(events)) over the whole event stream. */
  events: string;
  inputs: number;
  endTick: number;
  outcome: string;
}

export function typingGolden(seed: number): TypingGolden {
  const def = mkDef();
  const { inputs } = scriptedSession(seed, def);
  const res = replay(def, mkLoadout(), seed, mkOptions(), inputs);
  return {
    state: res.hash,
    events: fnv1a32(canonicalJson(res.events)).toString(16).padStart(8, "0"),
    inputs: inputs.length,
    endTick: res.finalState.tick,
    outcome: res.result?.outcome ?? "none",
  };
}

export const typingGoldens = (): Record<string, TypingGolden> => {
  const out: Record<string, TypingGolden> = {};
  for (const s of TYPING_GOLDEN_SEEDS) out[String(s)] = typingGolden(s);
  return out;
};

// ---------------------------------------------------------------- T1.3 combat replays

export const COMBAT_GOLDEN_SCENARIOS = [
  "boss-sword",
  "dagger-shields",
  "glass-hero",
  // T1.4: skills + passives on (all 6 actives and 8 passives are exercised across the three)
  "kit-starter",
  "kit-dagger-crowd",
  "kit-hammer-hurt",
] as const;
type Scenario = (typeof COMBAT_GOLDEN_SCENARIOS)[number];

export interface CombatGolden extends TypingGolden {
  autoAttacks: number;
  secondWindUsed: boolean;
  skillsCast: number;
}

const withKit = (
  archetype: "sword" | "dagger" | "staff" | "hammer",
  actives: [ActiveSkillId | null, ActiveSkillId | null],
  passives: [PassiveId | null, PassiveId | null, PassiveId | null],
  modes: ["smart" | "asap", "smart" | "asap"] = ["smart", "smart"],
) => ({ ...mkLoadout(archetype), actives, passives, activeModes: modes });

function combatScenario(name: Scenario) {
  const slime = ENEMIES.slime as NonNullable<(typeof ENEMIES)[string]>;
  const bat = ENEMIES.bat as NonNullable<(typeof ENEMIES)[string]>;
  const shielded = {
    ...ENEMIES,
    slime: { ...slime, weaknesses: ["slash", "pierce"] as typeof slime.weaknesses, shield: 2 },
    bat: { ...bat, weaknesses: ["pierce"] as typeof bat.weaknesses, shield: 1 },
  };
  const pool = ["apple", "bird", "cat", "door", "eagle", "fish"];
  switch (name) {
    case "boss-sword": {
      const base = mkDef();
      return {
        def: mkDef({ boss: { ...(base.boss as NonNullable<typeof base.boss>), hpM: 60_000 } }),
        loadout: mkLoadout("sword"),
        wpm: 45,
        accuracy: 0.93,
      };
    }
    case "dagger-shields":
      return {
        def: mkSimpleDef(["slime", "bat", "slime"], { current: pool }, { enemies: shielded }, 2, {
          poolM: 90_000,
          hitM: 8000,
        }),
        loadout: mkLoadout("dagger"),
        wpm: 40,
        accuracy: 0.94,
      };
    case "glass-hero":
      // heavy hits and a slow, sloppy typist: exercises block/parry misses, Second Wind and defeat
      return {
        def: mkSimpleDef(["slime", "bat"], { current: pool }, { enemies: shielded }, 1, {
          poolM: 400_000,
          hitM: 80_000,
        }),
        loadout: mkLoadout("hammer"),
        wpm: 25,
        accuracy: 0.85,
      };
    case "kit-starter":
      // the ch1 starter kit on the shielded fixture: Fireball + Aegis, Clean Cut + Steady Hands + Iron Will
      return {
        def: mkSimpleDef(["slime", "bat", "slime"], { current: pool }, { enemies: shielded }, 2, {
          poolM: 90_000,
          hitM: 8000,
        }),
        loadout: withKit("sword", ["fireball", "aegis"], ["cleanCut", "steadyHands", "ironWill"]),
        wpm: 40,
        accuracy: 0.94,
      };
    case "kit-dagger-crowd":
      // crowds for Slash Wave, telegraphs for Frost Lock, Dagger bleed, Opening Gambit / Bulwark Streak / Last Stand
      return {
        def: mkSimpleDef(["slime", "bat", "slime"], { current: pool }, { enemies: shielded }, 2, {
          poolM: 120_000,
          hitM: 12_000,
        }),
        loadout: withKit(
          "dagger",
          ["slashWave", "frostLock"],
          ["openingGambit", "bulwarkStreak", "lastStand"],
        ),
        wpm: 45,
        accuracy: 0.93,
      };
    case "kit-hammer-hurt":
      // a sloppy typist taking hits: Mending Light, Piercing Thrust, Riposte, Comeback, Hammer knockback
      return {
        def: mkSimpleDef(["slime", "bat"], { current: pool }, { enemies: shielded }, 2, {
          poolM: 150_000,
          hitM: 14_000,
        }),
        loadout: withKit(
          "hammer",
          ["piercingThrust", "mendingLight"],
          ["riposte", "comeback", "lastStand"],
        ),
        wpm: 30,
        accuracy: 0.88,
      };
  }
}

export function combatGolden(name: Scenario): CombatGolden {
  const { def, loadout, wpm, accuracy } = combatScenario(name);
  const seed = 4242;
  const bot = runBot(def, loadout, seed, mkOptions(), { wpm, accuracy, maxTicks: 40_000 });
  const res = replay(def, loadout, seed, mkOptions(), bot.inputs);
  return {
    state: res.hash,
    events: fnv1a32(canonicalJson(res.events)).toString(16).padStart(8, "0"),
    inputs: bot.inputs.length,
    endTick: res.finalState.tick,
    outcome: res.result?.outcome ?? "none",
    autoAttacks: res.result?.stats.autoAttacks ?? 0,
    secondWindUsed: res.result?.stats.secondWindUsed ?? false,
    skillsCast: res.result?.stats.skillsCast ?? 0,
  };
}

export const combatGoldens = (): Record<string, CombatGolden> => {
  const out: Record<string, CombatGolden> = {};
  for (const n of COMBAT_GOLDEN_SCENARIOS) out[n] = combatGolden(n);
  return out;
};
