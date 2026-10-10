import { goldenHashes } from "../tests/toy.ts";
import { type TrialGolden, trialGoldens } from "../tests/trialHarness.ts";
import {
  type CombatGolden,
  combatGoldens,
  type TypingGolden,
  typingGoldens,
} from "../tests/typingGolden.ts";
import { type WillowGolden, willowGoldens } from "../tests/willowGolden.ts";

(
  globalThis as unknown as {
    __parity: {
      goldenHashes: () => Record<string, string>;
      typingGoldens: () => Record<string, TypingGolden>;
      combatGoldens: () => Record<string, CombatGolden>;
      trialGoldens: () => Record<string, TrialGolden>;
      willowGoldens: () => Record<string, WillowGolden>;
    };
  }
).__parity = {
  goldenHashes,
  typingGoldens,
  combatGoldens,
  trialGoldens,
  willowGoldens,
};
