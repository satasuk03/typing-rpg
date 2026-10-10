import { describe, expect, it } from "vitest";
import { type CueSink, CutscenePlayer, INPUT_GUARD_MS } from "./player";
import { TEST_TIMELINE } from "./testTimeline";
import {
  cuesBetween,
  endState,
  evaluate,
  lineHoldMs,
  simulateParticles,
  validate,
} from "./timeline";
import type { Cue, EvalEnv, StageDirector, Timeline } from "./types";

const ENV: EvalEnv = {
  basePose: { x: 0, y: 1.75, dist: 19.5, pitch: 11, fov: 32 },
  anchors: { walk: { x: 10, y: 1.75, dist: 19.5, pitch: 11, fov: 32 } },
};

const tl = (cues: Cue[], durationMs = 10000): Timeline => ({
  id: "prologue.test",
  durationMs,
  setup: "standalone",
  cues,
});

describe("evaluate", () => {
  it("test timeline is valid", () => {
    expect(validate(TEST_TIMELINE)).toEqual([]);
  });

  it("is a pure function of t (same input, same output; order of calls irrelevant)", () => {
    const a = evaluate(TEST_TIMELINE, 3210, -1, ENV);
    evaluate(TEST_TIMELINE, 9000, -1, ENV);
    evaluate(TEST_TIMELINE, 10, -1, ENV);
    const b = evaluate(TEST_TIMELINE, 3210, -1, ENV);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("interpolates the camera, the mood blend and the actor move", () => {
    const s0 = evaluate(TEST_TIMELINE, 1000, -1, ENV);
    const sMid = evaluate(TEST_TIMELINE, 2500, -1, ENV);
    const s1 = evaluate(TEST_TIMELINE, 4000, -1, ENV);
    expect(sMid.camera.dist).toBeGreaterThan(s1.camera.dist);
    expect(sMid.camera.dist).toBeLessThan(s0.camera.dist);
    expect(sMid.moodBlend).toBeGreaterThan(0);
    expect(sMid.moodBlend).toBeLessThan(1);
    expect(evaluate(TEST_TIMELINE, 5000, -1, ENV).moodBlend).toBe(1);
    expect(s0.actors.hero?.dx).toBe(0);
    expect(sMid.actors.hero?.dx).toBeGreaterThan(0);
    expect(evaluate(TEST_TIMELINE, 6000, -1, ENV).actors.hero?.dx).toBeCloseTo(5, 6);
  });

  it("a mid-flight camera cue continues from where the previous ease is (no pop)", () => {
    const t = tl([
      { at: 0, kind: "camera", pose: { x: 0 }, ease: "cut" },
      { at: 0, dur: 1000, kind: "camera", pose: { x: 10 }, ease: "linear" },
      { at: 500, dur: 500, kind: "camera", pose: { x: 20 }, ease: "linear" },
    ]);
    const before = evaluate(t, 499, -1, ENV).camera.x;
    const after = evaluate(t, 501, -1, ENV).camera.x;
    expect(Math.abs(after - before)).toBeLessThan(0.2);
    expect(evaluate(t, 1000, -1, ENV).camera.x).toBeCloseTo(20, 6);
  });

  it("reduced motion cuts camera moves and removes shake", () => {
    const e = { ...ENV, reducedMotion: true };
    const s = evaluate(TEST_TIMELINE, 1100, -1, e);
    expect(s.shake).toEqual({ x: 0, y: 0 });
    expect(evaluate(TEST_TIMELINE, 1001, -1, e).camera).toEqual(
      evaluate(TEST_TIMELINE, 3999, -1, e).camera,
    );
    expect(evaluate(TEST_TIMELINE, 1100, -1, ENV).shake.x).not.toBe(0);
  });

  it("endState is the state at the end with nothing in flight", () => {
    const e = endState(TEST_TIMELINE, ENV);
    expect(e.ended).toBe(true);
    expect(e.vfx).toEqual([]);
    expect(e.line).toBeNull();
    expect(e.moodBlend).toBeCloseTo(0.4, 6);
    expect(e.actors.hero?.dx).toBeCloseTo(5, 6);
  });

  it("shows a line only while held (lineClock >= 0) at the line's own time", () => {
    expect(evaluate(TEST_TIMELINE, 4500, -1, ENV).line).toBeNull();
    const held = evaluate(TEST_TIMELINE, 4500, 100, ENV).line;
    expect(held?.text).toBe("The road is quiet.");
    expect(held?.holdMs).toBe(lineHoldMs("The road is quiet."));
    expect(evaluate(TEST_TIMELINE, 4600, 100, ENV).line).toBeNull();
  });

  it("hud: ink types one letter per charMs, kit shatters accumulate", () => {
    const t = tl([
      { at: 100, kind: "hud", cue: { id: "ink", text: "unwrite", charMs: 100 } },
      { at: 200, kind: "hud", cue: { id: "kitShatter", index: 2 } },
      { at: 300, kind: "hud", cue: { id: "kitShatter", index: 0 } },
    ]);
    expect(evaluate(t, 100).hud.ink?.shown).toBe("u");
    expect(evaluate(t, 450).hud.ink?.shown).toBe("unwr");
    expect(evaluate(t, 5000).hud.ink?.shown).toBe("unwrite");
    expect(evaluate(t, 350).hud.kitShattered).toEqual([0, 2]);
  });
});

describe("particles", () => {
  it("replay is reproducible from a cue start with a fixed seed and 1/60 s step", () => {
    const a = simulateParticles(1234, 733, 24);
    simulateParticles(99, 5000, 24);
    const b = simulateParticles(1234, 733, 24);
    expect(b).toEqual(a);
    expect(simulateParticles(1235, 733, 24)).not.toEqual(a);
    // 1/60 s step: 16.6 ms is still step 0, 16.7 ms is one step
    expect(simulateParticles(1, 16.6, 4)).toEqual(simulateParticles(1, 0, 4));
    expect(simulateParticles(1, 16.7, 4)).not.toEqual(simulateParticles(1, 0, 4));
  });

  it("vfx seeds are stable per cue", () => {
    const s1 = evaluate(TEST_TIMELINE, 3000, -1, ENV).vfx[0];
    const s2 = evaluate(TEST_TIMELINE, 3500, -1, ENV).vfx[0];
    expect(s1?.seed).toBe(s2?.seed);
    expect(s1?.id).toBe("ember");
  });
});

describe("validate", () => {
  it("catches an unknown vfx id, sfx id and anim", () => {
    const e = validate(
      tl([
        { at: 0, kind: "vfx", id: "nope" as never },
        { at: 10, kind: "sfx", id: "nopeSfx" as never },
        { at: 20, kind: "actor", who: "hero", anim: "moonwalk" as never },
      ]),
    );
    expect(e.some((m) => m.includes('unknown vfx id "nope"'))).toBe(true);
    expect(e.some((m) => m.includes('unknown sfx id "nopeSfx"'))).toBe(true);
    expect(e.some((m) => m.includes('unknown anim "moonwalk"'))).toBe(true);
  });

  it("catches unsorted cues", () => {
    const e = validate(
      tl([
        { at: 500, kind: "sfx", id: "key" },
        { at: 100, kind: "sfx", id: "key" },
      ]),
    );
    expect(e.some((m) => m.includes("not sorted"))).toBe(true);
  });

  it("catches a line that is too long (> 8 words)", () => {
    const e = validate(
      tl([
        {
          at: 0,
          kind: "line",
          speaker: "nul",
          text: "one two three four five six seven eight nine",
        },
      ]),
    );
    expect(e.some((m) => m.includes("9 words"))).toBe(true);
    expect(
      validate(
        tl([
          { at: 0, kind: "line", speaker: "nul", text: "one two three four five six seven eight" },
        ]),
      ),
    ).toEqual([]);
  });

  it("catches an overlapping camera cue with ease cut, and a cue after the end", () => {
    const e = validate(
      tl(
        [
          { at: 0, dur: 1000, kind: "camera", pose: { x: 1 }, ease: "linear" },
          { at: 500, kind: "camera", pose: { x: 2 }, ease: "cut" },
          { at: 99999, kind: "sfx", id: "key" },
        ],
        5000,
      ),
    );
    expect(e.some((m) => m.includes("overlaps"))).toBe(true);
    expect(e.some((m) => m.includes("after durationMs"))).toBe(true);
  });

  it("uses an injected A2 list", () => {
    const e = validate(tl([{ at: 0, kind: "line", speaker: "nul", text: "Hello obliterate" }]), {
      vfx: new Set(),
      sfx: new Set(),
      heroAnims: new Set(),
      nulAnims: new Set(),
      a2Words: new Set(["hello"]),
    });
    expect(e.some((m) => m.includes('"obliterate"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------- player

function recorder(): { sink: CueSink; cues: Cue[]; ends: number; skips: number } {
  const r = { cues: [] as Cue[], ends: 0, skips: 0, sink: {} as CueSink };
  r.sink = {
    onCue: (c) => r.cues.push(c),
    onEnd: () => {
      r.ends++;
    },
    onSkip: () => {
      r.skips++;
    },
  };
  return r;
}

const LINE_TL = tl(
  [
    { at: 0, kind: "sfx", id: "key" },
    { at: 2000, kind: "line", speaker: "nul", text: "Hello there." },
    { at: 3000, kind: "startPlay" },
    { at: 4000, kind: "end" },
  ],
  4000,
);

describe("CutscenePlayer", () => {
  it("the clock holds at a line, auto-releases after the hold, and fires cues once", () => {
    const r = recorder();
    const p = new CutscenePlayer(LINE_TL, { env: ENV, sink: r.sink });
    p.start();
    p.tick(3000); // would pass the line at 2000
    expect(p.time).toBe(2000);
    expect(p.isHeldOnLine).toBe(true);
    expect(p.state.line?.text).toBe("Hello there.");
    p.tick(lineHoldMs("Hello there.") - 1000 - 1); // 1000 ms of the hold were already spent above
    expect(p.isHeldOnLine).toBe(true);
    p.tick(1 + 1000); // release + 1 s of timeline
    expect(p.isHeldOnLine).toBe(false);
    expect(p.time).toBe(3000);
    p.tick(5000);
    expect(p.isFinished).toBe(true);
    expect(r.ends).toBe(1);
    expect(r.cues.filter((c) => c.kind === "sfx")).toHaveLength(1);
    expect(r.cues.filter((c) => c.kind === "startPlay")).toHaveLength(1);
  });

  it("Space and Enter advance a line; letter keys never do", () => {
    const p = new CutscenePlayer(LINE_TL, { env: ENV });
    p.start();
    p.tick(INPUT_GUARD_MS + 600); // t=2000 reached and the guard is over
    expect(p.isHeldOnLine).toBe(true);
    for (const k of ["a", "e", "z", "A", "Z", "w", " x", "Tab", "Escape", "ArrowRight"]) {
      expect(p.key(k)).toBe(false);
    }
    expect(p.isHeldOnLine).toBe(true);
    expect(p.key(" ")).toBe(true);
    expect(p.isHeldOnLine).toBe(false);

    const q = new CutscenePlayer(LINE_TL, { env: ENV });
    q.start();
    q.tick(INPUT_GUARD_MS + 600);
    expect(q.key("Enter")).toBe(true);
    expect(q.isHeldOnLine).toBe(false);
  });

  it("ignores all input for 1.5 s after start and after the climax", () => {
    const early = tl(
      [
        { at: 100, kind: "line", speaker: "nul", text: "Hello there my old friend, welcome back." },
        { at: 9000, kind: "end" },
      ],
      9000,
    );
    const p = new CutscenePlayer(early, { env: ENV });
    p.start();
    p.tick(200);
    expect(p.isHeldOnLine).toBe(true);
    expect(p.key(" ")).toBe(false);
    p.tick(INPUT_GUARD_MS - 200 - 1);
    expect(p.key("Enter")).toBe(false);
    p.tick(1);
    expect(p.guardRemainingMs).toBe(0);
    // climax re-arms the guard
    p.climax();
    expect(p.guardRemainingMs).toBe(INPUT_GUARD_MS);
    expect(p.key(" ")).toBe(false);
    expect(p.isHeldOnLine).toBe(true);
    p.tick(INPUT_GUARD_MS);
    expect(p.key(" ")).toBe(true);
  });

  it("does not run (or count the guard down) while paused", () => {
    const p = new CutscenePlayer(LINE_TL, { env: ENV });
    p.start();
    p.pause();
    p.tick(10000);
    expect(p.time).toBe(0);
    expect(p.guardRemainingMs).toBe(INPUT_GUARD_MS);
    p.resume();
    p.tick(500);
    expect(p.time).toBe(500);
  });

  it("skip at any t lands on endState (and still emits startPlay/end)", () => {
    for (const t of [0, 500, 2000, 2500, 3500, 3999]) {
      const r = recorder();
      const p = new CutscenePlayer(TEST_TIMELINE, { env: ENV, sink: r.sink });
      p.start();
      p.seek(t);
      p.skip();
      expect(p.isFinished).toBe(true);
      expect(p.state).toEqual(endState(TEST_TIMELINE, ENV));
      expect(r.skips).toBe(1);
      expect(r.ends).toBe(1);
    }
    const r = recorder();
    const p = new CutscenePlayer(LINE_TL, { env: ENV, sink: r.sink });
    p.start();
    p.tick(2500); // held on the line, before startPlay
    p.skip();
    expect(r.cues.some((c) => c.kind === "startPlay")).toBe(true);
    expect(p.isHeldOnLine).toBe(false);
  });

  it("seek(t) twice gives identical state and fires no edge cues", () => {
    const r = recorder();
    const p = new CutscenePlayer(TEST_TIMELINE, { env: ENV, sink: r.sink });
    p.start();
    const n = r.cues.length;
    const a = p.seek(3210);
    p.seek(8000);
    const b = p.seek(3210);
    expect(b).toEqual(a);
    expect(r.cues.length).toBe(n);
    expect(a).toEqual(evaluate(TEST_TIMELINE, 3210, -1, ENV));
  });

  it("drives the world only through the StageDirector seam", () => {
    const calls: string[] = [];
    const d: StageDirector = {
      heroActor: () => null,
      bossActor: () => null,
      prop: () => null,
      setCameraOverride: (p) => calls.push(p ? "cam" : "cam:null"),
      setMood: (m) => calls.push(m === null ? "mood:null" : "mood"),
      setLetterbox: () => calls.push("box"),
      setHeroAnim: (a) => calls.push(`anim:${a}`),
      setActorState: (who, s) => calls.push(`actor:${who}:${s ? "set" : "null"}`),
    };
    const p = new CutscenePlayer(TEST_TIMELINE, { env: ENV, director: d, moodAt: () => ({}) });
    p.start();
    p.seek(3000);
    expect(calls).toContain("cam");
    expect(calls).toContain("mood");
    expect(calls).toContain("anim:walk");
    expect(calls).toContain("actor:hero:set");
    p.release();
    expect(calls).toContain("cam:null");
    expect(calls).toContain("actor:hero:null");
  });

  it("cuesBetween is (t0, t1]", () => {
    const got = cuesBetween(LINE_TL, 0, 2000).map((c) => c.kind);
    expect(got).toEqual(["line"]);
    expect(cuesBetween(LINE_TL, -1, 0).map((c) => c.kind)).toEqual(["sfx"]);
  });
});
