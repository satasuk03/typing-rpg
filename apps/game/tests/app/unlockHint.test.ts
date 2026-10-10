// Slow drip (PO 2026-10-10): the loadout picker's locked-skill hint names the chapter and level, and skills held for a
// later chapter (FUTURE_UNLOCK) read "Regain later in your journey".
import { contentBundle, FUTURE_UNLOCK } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { unlockHint } from "../../src/app/screens/loadout";

describe("loadout locked-skill hint", () => {
  it("names the level and chapter of the unlock", () => {
    expect(unlockHint(contentBundle, "ch1-l04")).toBe("Clear Level 4 of Chapter I to unlock");
    expect(unlockHint(contentBundle, "ch2-l08")).toBe("Clear Level 8 of Chapter II to unlock");
  });
  it("reads as a later regain for skills held for future chapters", () => {
    expect(unlockHint(contentBundle, FUTURE_UNLOCK)).toBe("Regain later in your journey");
    const frost = contentBundle.actives.find((a) => a.id === "frostLock");
    expect(unlockHint(contentBundle, frost?.unlockLevel)).toBe("Regain later in your journey");
  });
});
