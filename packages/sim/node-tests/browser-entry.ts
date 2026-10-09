import { goldenHashes } from "../tests/toy.ts";

(globalThis as unknown as { __parity: { goldenHashes: () => Record<string, string> } }).__parity = {
  goldenHashes,
};
