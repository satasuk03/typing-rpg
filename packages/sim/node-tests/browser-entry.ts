import { goldenHashes } from "../tests/toy.ts";
import { type TrialGolden, trialGoldens } from "../tests/trialHarness.ts";
import { type TypingGolden, typingGoldens } from "../tests/typingGolden.ts";

(
  globalThis as unknown as {
    __parity: {
      goldenHashes: () => Record<string, string>;
      typingGoldens: () => Record<string, TypingGolden>;
      trialGoldens: () => Record<string, TrialGolden>;
    };
  }
).__parity = {
  goldenHashes,
  typingGoldens,
  trialGoldens,
};
