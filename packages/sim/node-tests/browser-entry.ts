import { goldenHashes } from "../tests/toy.ts";
import {
  type CombatGolden,
  combatGoldens,
  type TypingGolden,
  typingGoldens,
} from "../tests/typingGolden.ts";

(
  globalThis as unknown as {
    __parity: {
      goldenHashes: () => Record<string, string>;
      typingGoldens: () => Record<string, TypingGolden>;
      combatGoldens: () => Record<string, CombatGolden>;
    };
  }
).__parity = {
  goldenHashes,
  typingGoldens,
  combatGoldens,
};
