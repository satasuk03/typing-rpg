import { describe, expect, it } from "vitest";
import { PROLOGUE_TIMELINES } from "../../src/app/prologueTimelines";
import {
  DEFAULT_REGISTRIES,
  evaluate,
  MAX_LINE_WORDS,
  validate,
  wordCount,
} from "../../src/cutscene/timeline";
import {
  GATE_GLYPHS,
  LINES,
  OPEN_END_MS,
  OPEN_TIMELINE,
  THEFT,
  UNWRITING_END_MS,
  UNWRITING_TIMELINE,
  WORD_GATE,
} from "../../src/cutscene/timelines/prologue";
import type { Cue } from "../../src/cutscene/types";
import { THEFT_RAMP } from "../../src/render/biomes";
import { GATE_GLYPH_COUNT } from "../../src/render/vfx/prologue/cues";
import { loadLevel } from "../../src/render/world/registry";

const A = OPEN_TIMELINE.cues;
const C = UNWRITING_TIMELINE.cues;
const of = <K extends Cue["kind"]>(cues: readonly Cue[], kind: K): Extract<Cue, { kind: K }>[] =>
  cues.filter((c): c is Extract<Cue, { kind: K }> => c.kind === kind);
const lines = (cues: readonly Cue[]): string[] => of(cues, "line").map((c) => c.text);

describe("the real prologue timelines (P3.6)", () => {
  it("are the ones the flow plays, and validate() is green with the real registries", () => {
    expect(PROLOGUE_TIMELINES.open).toBe(OPEN_TIMELINE);
    expect(PROLOGUE_TIMELINES.unwriting).toBe(UNWRITING_TIMELINE);
    expect(validate(OPEN_TIMELINE, DEFAULT_REGISTRIES)).toEqual([]);
    expect(validate(UNWRITING_TIMELINE, DEFAULT_REGISTRIES)).toEqual([]);
  });

  it("Part A starts the sim exactly once, at its end; Part C continues the live stage", () => {
    expect(of(A, "startPlay")).toHaveLength(1);
    expect(of(A, "startPlay")[0]?.at).toBe(OPEN_END_MS);
    expect(OPEN_TIMELINE.setup).toBe("standalone");
    expect(of(C, "startPlay")).toHaveLength(0);
    expect(UNWRITING_TIMELINE.setup).toBe("continue");
    expect(UNWRITING_TIMELINE.durationMs).toBe(UNWRITING_END_MS);
  });

  it("Part A beat order: black -> caption -> fade in -> walk -> pools -> Nul's line -> startPlay", () => {
    const first = (pred: (c: Cue) => boolean): number => A.find(pred)?.at ?? Number.NaN;
    const fade0 = first((c) => c.kind === "hud" && c.cue.id === "fade" && c.cue.to === 1);
    const caption = first((c) => c.kind === "hud" && c.cue.id === "caption");
    const fadeIn = first((c) => c.kind === "hud" && c.cue.id === "fade" && c.cue.to === 0);
    const walk = first((c) => c.kind === "actor" && c.anim === "walk");
    const pool = first((c) => c.kind === "vfx" && c.id === "inkRise");
    const nul = first((c) => c.kind === "line");
    expect(fade0).toBe(0);
    expect(fade0).toBeLessThan(caption);
    expect(caption).toBeLessThan(fadeIn);
    expect(fadeIn).toBe(2500);
    expect(walk).toBe(2500);
    expect(pool).toBeGreaterThanOrEqual(5300);
    expect(nul).toBeGreaterThanOrEqual(5200); // the line overlays the pools (it never holds the clock)
    expect(nul).toBeLessThan(OPEN_END_MS);
    expect(of(A, "vfx").filter((c) => c.id === "inkRise")).toHaveLength(3);
    // the crane opens on the plan's pose and settles into the battle pose
    const cams = of(A, "camera");
    // P2-1: it opens high and wide, with the whole arch (and sky above it) in frame
    const crane = (cams[0]?.pose ?? {}) as { y?: number; dist?: number };
    expect(crane.y ?? 0).toBeGreaterThanOrEqual(3);
    expect(crane.dist ?? 0).toBeGreaterThanOrEqual(22);
    expect(cams.at(-1)?.pose).toEqual({ anchor: "battle" });
  });

  it("the lines are the plan's, in order, and every one is at most 8 words of short words", () => {
    expect(lines(A)).toEqual([LINES.nulOpen]);
    expect(lines(C)).toEqual([
      LINES.nulEnough,
      LINES.nulBright,
      LINES.knightEnds,
      LINES.nulQuiet,
      LINES.nulNoMore,
      LINES.knightGone,
      LINES.knightSpark,
    ]);
    expect(lines(C).map((t) => wordCount(t))).toEqual([1, 6, 4, 6, 6, 4, 5]);
    for (const t of [...lines(A), ...lines(C), LINES.ink, LINES.caption, LINES.end]) {
      expect(wordCount(t), t).toBeLessThanOrEqual(MAX_LINE_WORDS);
      for (const w of t.split(/\s+/))
        expect(w.replace(/[^A-Za-z']/g, "").length, w).toBeLessThanOrEqual(10);
    }
    // speakers: Nul speaks the first, second, fourth, fifth; the Knight the rest
    expect(of(C, "line").map((c) => c.speaker)).toEqual([
      "nul",
      "nul",
      "knight",
      "nul",
      "nul",
      "knight",
      "knight",
    ]);
    // P4.2: every prologue line is an OVERLAY line (the clock never stops), and no two reading windows overlap
    for (const c of [...of(A, "line"), ...of(C, "line")]) expect(c.mode, c.text).toBe("overlay");
    const ats = of(C, "line").map((c) => c.at);
    expect(new Set(ats).size).toBe(ats.length);
    // Part C is <= 58 s on the wall now that nothing holds the clock; Part A is 8 s
    expect(UNWRITING_END_MS).toBeLessThanOrEqual(58000);
    expect(OPEN_END_MS).toBe(8000);
  });

  it("no frame is static: every camera gap between moves is at most 1.5 s outside the black and the fade", () => {
    for (const tl of [UNWRITING_TIMELINE]) {
      const cams = of(tl.cues, "camera");
      let end = 0;
      for (const c of cams) {
        if (c.at > end)
          expect(c.at - end, `${tl.id} camera idle ${end}..${c.at}`).toBeLessThanOrEqual(
            // the catch (0 - 1.5 s) is held by the hit-stop and the Fireball crumble VFX; the end walk is a crane
            1500,
          );
        end = Math.max(end, c.at + (c.dur ?? 0));
      }
    }
  });

  it("Part C beat order (plan §2 Part C)", () => {
    const at = (pred: (c: Cue) => boolean): number => C.find(pred)?.at ?? Number.NaN;
    const catchAt = at((c) => c.kind === "vfx" && c.id === "catchFireball");
    const drone = at((c) => c.kind === "music" && c.drone === 38);
    const maskPush = at(
      (c) => c.kind === "camera" && c.pose && "fov" in c.pose && c.pose.fov === 19,
    );
    const enough = at((c) => c.kind === "line");
    const flare = at((c) => c.kind === "vfx" && c.id === "surgeAura");
    const swell = at((c) => c.kind === "music" && c.swell === true);
    const ink = at((c) => c.kind === "hud" && c.cue.id === "ink");
    const inkWrite = at((c) => c.kind === "vfx" && c.id === "inkWrite");
    const theft1 = at((c) => c.kind === "hud" && c.cue.id === "kitShatter");
    const dim = at((c) => c.kind === "hud" && c.cue.id === "passivesDim");
    const collapse = at((c) => c.kind === "vfx" && c.id === "auraCollapse");
    const kneel = at((c) => c.kind === "actor" && c.who === "hero" && c.anim === "kneel");
    const swirl = at((c) => c.kind === "hud" && c.cue.id === "colourSwirl" && c.cue.on);
    const gate = at((c) => c.kind === "vfx" && c.id === "gateDarken");
    const vortex = at((c) => c.kind === "vfx" && c.id === "letterVortex");
    const shards = at((c) => c.kind === "hud" && c.cue.id === "shardsReturn");
    const ember = at((c) => c.kind === "vfx" && c.id === "ember");
    const caption = at((c) => c.kind === "hud" && c.cue.id === "caption");
    const fade = at((c) => c.kind === "hud" && c.cue.id === "fade");
    const seq = [
      catchAt,
      maskPush,
      enough,
      flare,
      swell,
      ink,
      theft1,
      dim,
      collapse,
      kneel,
      swirl,
      gate,
      vortex,
      shards,
      ember,
      caption,
      fade,
    ];
    expect(seq.every(Number.isFinite)).toBe(true);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(drone).toBe(0);
    expect(catchAt).toBe(0);
    expect(inkWrite).toBe(ink);
    expect(swell).toBe(ink - 900); // a reverse swell leads into the ink line (art direction §5.2: C 9.6 s)
    expect(ink).toBe(13200);
    expect(theft1).toBe(16000);
    expect(collapse).toBe(23200);
    expect(gate).toBe(31000);
    expect(vortex).toBe(36000);
    expect(caption).toBe(50300);
    expect(fade).toBe(55500);
    expect(C.at(-1)).toMatchObject({ kind: "end", at: UNWRITING_END_MS });
  });

  it("the theft: 6 beats 1.1 s apart in kit order, each with its stream, sounds and a THEFT_RAMP step", () => {
    const shatter = of(C, "hud").filter((c) => c.cue.id === "kitShatter");
    expect(shatter.map((c) => (c.cue.id === "kitShatter" ? c.cue.index : -1))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(shatter.map((c) => c.at)).toEqual([0, 1, 2, 3, 4, 5].map((k) => 16000 + 1100 * k));
    const streams = of(C, "vfx").filter((c) => c.id === "theftStream");
    expect(streams.map((c) => c.params?.k)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(streams.every((c) => c.from === "hero" && c.to === "boss")).toBe(true);
    const crack = of(C, "sfx").filter((c) => c.id === "theftCrack");
    expect(crack.map((c) => c.count)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(of(C, "sfx").filter((c) => c.id === "theftWhoosh")).toHaveLength(6);
    const ramp = of(C, "mood");
    expect(ramp.map((c) => c.to)).toEqual([1, 2, 3, 4, 5, 6].map((k) => THEFT_RAMP[k]));
    expect(ramp.map((c) => c.at)).toEqual(shatter.map((c) => c.at + THEFT.arriveMs));
    expect(ramp.every((c) => c.dur === 280)).toBe(true);
    expect(THEFT.kit).toHaveLength(6);
    // the world is fully UNWRITTEN once the last stream arrives (before the collapse)
    expect(evaluate(UNWRITING_TIMELINE, 23000).moodBlend).toBe(1);
    expect(evaluate(UNWRITING_TIMELINE, 16000).moodBlend).toBe(0);
    // the passive chips dim together after beat 6
    expect(evaluate(UNWRITING_TIMELINE, 22900).hud.passivesDim).toBe(true);
    expect(evaluate(UNWRITING_TIMELINE, 22700).hud.passivesDim).toBe(false);
  });

  it("P1-7 / P1-6: the knight recoils for one frame on every theft departure; the camera pushes in on him before the collapse", () => {
    const hurt = of(C, "actor").filter((c) => c.who === "hero" && c.anim === "hurt");
    expect(hurt.map((c) => c.at)).toEqual([0, 1, 2, 3, 4, 5].map((k) => 16000 + 1100 * k));
    for (const h of hurt) {
      const back = of(C, "actor").find((c) => c.who === "hero" && c.at === h.at + 150);
      expect(back?.anim, `braces again after the recoil at ${h.at}`).toBe("raise");
    }
    const push = of(C, "camera").find((c) => c.at === 22800);
    expect(push?.pose).toMatchObject({ dist: 13, fov: 24, pitch: 6 });
    // the push-in lands before the collapse, and the kneel happens inside the same shot
    expect((push?.at ?? 0) + (push?.dur ?? 0)).toBeLessThanOrEqual(23200);
  });

  it("the music arc: drone at C 0, swell, silence at the collapse, the spark motifs", () => {
    const m = of(C, "music");
    expect(m.find((c) => c.drone === 38)?.at).toBe(0);
    expect(m.find((c) => c.drone === null)?.at).toBe(23900);
    expect(m.find((c) => c.silence === 1)).toMatchObject({ at: 23200, dur: 1200 });
    expect(m.find((c) => c.silence === 0.75)).toMatchObject({ at: 45800, dur: 2000 });
    expect(m.filter((c) => c.motif).map((c) => c.motif)).toEqual(["spark", "sparkEnd"]);
    expect(of(A, "music").map((c) => c.state)).toEqual(["walk"]);
  });

  it("the collapse, the carved gate and the fog stay active to the end of Part C", () => {
    const keep = ["auraCollapse", "gateDarken", "silenceFog", "ember"] as const; // P1-5: the gate stays carved to the end
    for (const id of keep) {
      const c = of(C, "vfx").find((v) => v.id === id);
      expect(c, id).toBeDefined();
      expect((c?.at ?? 0) + (c?.dur ?? 2000), id).toBeGreaterThanOrEqual(UNWRITING_END_MS - 1);
      expect(
        evaluate(UNWRITING_TIMELINE, UNWRITING_END_MS - 2).vfx.some((v) => v.id === id),
        id,
      ).toBe(true);
    }
  });

  it("the black fades: open on black, fade in at 2.5 s; Part C fades out at 55.5 s", () => {
    expect(evaluate(OPEN_TIMELINE, 0).hud.fade).toBe(1);
    expect(evaluate(OPEN_TIMELINE, 2400).hud.fade).toBe(1);
    expect(evaluate(OPEN_TIMELINE, 3000).hud.fade).toBeCloseTo(0.5, 5);
    expect(evaluate(OPEN_TIMELINE, 4000).hud.fade).toBe(0);
    expect(evaluate(UNWRITING_TIMELINE, 55000).hud.fade).toBe(0);
    expect(evaluate(UNWRITING_TIMELINE, UNWRITING_END_MS).hud.fade).toBe(1);
  });

  it("the sword appears for the fall beat and leaves when the knight pulls it out", () => {
    const sw = of(C, "actor").filter((c) => c.who === "prop:prop.prologue.sword");
    expect(sw.map((c) => c.visible)).toEqual([true, false]);
    expect(sw[0]?.at).toBeGreaterThan(23200);
    expect(sw[1]?.at).toBeGreaterThan(50300);
  });

  it("the stage constants match the Word Gate layout", () => {
    const l = loadLevel("prologue");
    const a = (n: string) => l.anchors.find((x) => x.name === n);
    expect(a("enc1.hero")?.x).toBe(WORD_GATE.hx);
    expect(a("enc2.hero")?.x).toBe(WORD_GATE.hx);
    expect(a("enc2.slot0")?.x).toBe(WORD_GATE.nx);
    expect(a("gate")?.x).toBeCloseTo(WORD_GATE.gx, 3);
    expect(a("sword")).toBeDefined();
    expect((WORD_GATE.hx + WORD_GATE.nx) / 2).toBe(WORD_GATE.mid);
    WORD_GATE.slots.forEach((s, i) => {
      expect(a(`enc1.slot${i}`)?.x).toBeCloseTo(s.x, 2);
      expect(a(`enc1.slot${i}`)?.z).toBeCloseTo(s.z, 2);
    });
    expect(GATE_GLYPHS).toBe(GATE_GLYPH_COUNT);
  });
});
