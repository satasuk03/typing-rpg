import { ACTIVES } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { FALLBACK_ICON, ICON_DEFS, ICON_PX, SKILL_ACCENT } from "../../src/hud/skillIcons";

describe("pixel skill icons", () => {
  it("every active skill in content has an authored icon + accent", () => {
    for (const a of ACTIVES) {
      expect(ICON_DEFS[a.id], a.id).toBeDefined();
      expect(SKILL_ACCENT[a.id], a.id).toBeDefined();
    }
  });
  it("sprites are 16x16 and only use palette keys; outlined", () => {
    for (const [id, d] of [...Object.entries(ICON_DEFS), ["fallback", FALLBACK_ICON] as const]) {
      expect(d.rows.length, id).toBe(ICON_PX);
      for (const r of d.rows) {
        expect(r.length, `${id}: ${r}`).toBe(ICON_PX);
        for (const ch of r) if (ch !== ".") expect(d.pal[ch], `${id} '${ch}'`).toBeDefined();
      }
      expect(d.rows.join("")).toContain("k");
    }
  });
});
