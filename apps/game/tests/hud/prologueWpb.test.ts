import { ACTIVES, PASSIVES } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { BannerSystem } from "../../src/hud/banners";
import { heroHandOffset } from "../../src/hud/prologue/geometry";
import { DEFAULT_PASSIVES } from "../../src/hud/prologue/palette";
import { PASSIVE_ICON_DEFS, PASSIVE_ICON_PX } from "../../src/hud/prologue/passiveIcons";
import { shardKick } from "../../src/hud/prologue/swirl";

describe("P4.2 WP-B HUD pieces", () => {
  it("every passive of the prologue kit has a 12x12 pixel icon that only uses its palette", () => {
    expect(ACTIVES.length).toBeGreaterThan(0);
    expect(PASSIVES.length).toBeGreaterThan(0);
    for (const id of DEFAULT_PASSIVES) {
      const d = PASSIVE_ICON_DEFS[id];
      expect(d, id).toBeDefined();
      if (!d) continue;
      expect(d.rows.length, id).toBe(PASSIVE_ICON_PX);
      for (const r of d.rows) {
        expect(r.length, `${id}: ${r}`).toBe(PASSIVE_ICON_PX);
        for (const ch of r) if (ch !== ".") expect(d.pal[ch], `${id} '${ch}'`).toBeDefined();
      }
      expect(d.rows.join("")).toContain("k");
    }
  });

  it("the knight's hand follows the reach palm and the kneel fist, one frame per 400 ms", () => {
    const a = heroHandOffset("reach", 0);
    const b = heroHandOffset("reach", 500);
    expect(a.dy).toBeGreaterThan(0.9); // the open palm is about a metre up
    expect(b.dx).toBeGreaterThan(a.dx); // the second reach frame extends the arm one texel
    const fist = heroHandOffset("kneel", 1000);
    expect(fist.dy).toBeLessThan(0.5); // the closed fist is down at the pommel
    expect(heroHandOffset(null, 0)).toEqual(heroHandOffset("idle", 0));
    expect(heroHandOffset("rise", 0).dy).toBeLessThan(0.5); // standing up, the hand is still at the pommel
  });

  it("the ember swells when each shard lands and settles back", () => {
    expect(shardKick(500, 2)).toBe(0);
    expect(shardKick(1900, 2)).toBeCloseTo(1, 5);
    expect(shardKick(1900 + 1500, 2)).toBeLessThan(0.1);
    expect(shardKick(1900 + 350, 2)).toBeGreaterThan(0.9); // the second shard lands 350 ms after the first
  });

  it("a delayed banner waits for its delay, then lives out the rest of its time", () => {
    const b = new BannerSystem();
    const card = b.show("boss", "NUL", "THE SILENT KING", 2.2, { delay: 1.8, cy: 0.86 });
    expect(card.age).toBeCloseTo(-1.8, 6);
    expect(card.cy).toBe(0.86);
    b.update(1.0);
    expect(b.banners).toHaveLength(1);
    expect(card.age).toBeLessThan(0);
    b.update(1.0); // 2.0 s: the card has been showing for 0.2 s
    expect(card.age).toBeGreaterThan(0);
    b.update(2.1);
    expect(b.banners).toHaveLength(0);
    // a plain banner is unchanged
    const plain = b.show("enc", "ENCOUNTER", "x", 1.8);
    expect(plain.age).toBeCloseTo(0, 6);
    expect(plain.cy).toBeUndefined();
  });
});
