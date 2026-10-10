// Ch1 byte-identity gate (docs/interfaces.md §13.1): resolveLevel of every Ch1 level, with contentVersion blanked,
// must hash to the committed fixture forever. Ch2 content, knobs and pool scoping must never leak into Ch1.
import { contentBundle } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { canonicalJson, fnv1a32, resolveLevel } from "../src/index.ts";
import fixture from "./fixtures/ch1-resolved.json" with { type: "json" };

export const ch1ResolvedHashes = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const lv of contentBundle.levels.filter((l) => l.chapter === 1)) {
    const r = { ...resolveLevel(contentBundle, lv.id, { dueWeakWords: [] }), contentVersion: "" };
    out[lv.id] = fnv1a32(canonicalJson(r)).toString(16).padStart(8, "0");
  }
  return out;
};

describe("Ch1 resolveLevel fixture (byte-identity, §13.1)", () => {
  it("covers all 10 Ch1 levels", () => {
    expect(Object.keys(fixture)).toHaveLength(10);
  });
  it("matches the committed hashes", () => {
    expect(ch1ResolvedHashes()).toEqual(fixture);
  });
});
