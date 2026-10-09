import { goldenHashes } from "../tests/toy.ts";
import { type TypingGolden, typingGoldens } from "../tests/typingGolden.ts";

(
  globalThis as unknown as {
    __parity: {
      goldenHashes: () => Record<string, string>;
      typingGoldens: () => Record<string, TypingGolden>;
    };
  }
).__parity = {
  goldenHashes,
  typingGoldens,
};
