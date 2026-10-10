import { HUSH_SPELLS } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { measurePlate, PLATE_PAD_X, SENTENCE_MAX_W } from "../../src/hud/plates";
import { layoutText } from "../../src/hud/textLayout";

/** A 2D context whose glyph width is `w` (cellWidth adds 3), so each case fixes the real cell width. */
function ctxWithGlyphWidth(w: number): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k === "measureText") return () => ({ width: w });
      return k in t ? t[k] : () => 0;
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const plateView = (text: string) =>
  ({
    id: 1,
    kind: "doom",
    text,
    display: text,
    typedIndex: 0,
    exactCase: true,
    expiresAtTick: null,
    totalTicks: null,
    faded: false,
  }) as never;

describe("sentence plate wrap vs frame width (Hush Spells)", () => {
  it("a real Hush Spell wraps with its widest line ending in a parked space (the old overflow)", () => {
    const t = HUSH_SPELLS.map((e) => e.text).find((x) => x.startsWith("Hear the leaves fall"));
    expect(t).toBeDefined();
    let reproduced = false;
    for (let maxCols = 8; maxCols <= 40; maxCols++) {
      const l = layoutText(t as string, maxCols);
      if (l.spanCols > l.cols) reproduced = true;
    }
    expect(reproduced).toBe(true);
  });

  it("every letter cell (spaces included) of every Hush Spell stays inside the frame, for any glyph width", () => {
    for (const gw of [12, 15, 18, 21, 24]) {
      const c = ctxWithGlyphWidth(gw);
      for (const e of HUSH_SPELLS) {
        const g = measurePlate(c, plateView(e.text));
        for (const cell of g.layout.cells) {
          const right = PLATE_PAD_X + (cell.col + 1) * g.cw; // cell right edge, frame-relative
          expect(right, `${e.text} @${gw}`).toBeLessThanOrEqual(g.fw - PLATE_PAD_X);
        }
        // the exact-case gutter sits on top of the frame, never in the wrap budget
        expect(g.fx + g.fw).toBeLessThanOrEqual(g.w);
        expect(g.fw).toBeLessThanOrEqual(SENTENCE_MAX_W + g.cw);
      }
    }
  });
});
