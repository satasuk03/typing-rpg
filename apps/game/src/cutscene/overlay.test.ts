import { describe, expect, it } from "vitest";
import { CutscenePlayer, INPUT_GUARD_MS } from "./player";
import { evaluate, lineHoldMs, validate } from "./timeline";
import type { Cue, EvalEnv, Timeline } from "./types";

const ENV: EvalEnv = {
  basePose: { x: 0, y: 1.75, dist: 19.5, pitch: 11, fov: 32 },
};

const tl = (cues: Cue[], durationMs = 10000): Timeline => ({
  id: "prologue.test",
  durationMs,
  setup: "standalone",
  cues,
});

describe("overlay lines (interfaces v2.2.3)", () => {
  const OV = tl(
    [
      { at: 0, kind: "sfx", id: "key" },
      { at: 1000, kind: "line", speaker: "nul", text: "Hello there.", mode: "overlay" },
      { at: 3500, kind: "line", speaker: "knight", text: "Go away.", mode: "overlay" },
      { at: 4000, kind: "startPlay" },
      { at: 8000, kind: "end" },
    ],
    8000,
  );

  it("an overlay line never stops the clock and is on screen for its reading time", () => {
    const p = new CutscenePlayer(OV, { env: ENV });
    p.start();
    p.tick(1500);
    expect(p.isHeldOnLine).toBe(false);
    expect(p.time).toBe(1500);
    expect(p.state.line).toMatchObject({ text: "Hello there.", mode: "overlay", ageMs: 500 });
    p.tick(lineHoldMs("Hello there.") - 500 - 1);
    expect(p.state.line?.text).toBe("Hello there.");
    p.tick(1);
    expect(p.state.line).toBeNull();
    p.tick(10000);
    expect(p.isFinished).toBe(true);
  });

  it("is a pure function of t (seek shows it without a line clock)", () => {
    const p = new CutscenePlayer(OV, { env: ENV });
    expect(p.seek(1200).line).toMatchObject({ mode: "overlay", ageMs: 200 });
    expect(p.seek(900).line).toBeNull();
    expect(evaluate(OV, 3600).line?.text).toBe("Go away.");
  });

  it("Space fades the line out early, skips nothing, and the guard still applies", () => {
    const p = new CutscenePlayer(OV, { env: ENV });
    p.start();
    p.tick(1200);
    expect(p.key(" ")).toBe(false); // input guard
    p.tick(INPUT_GUARD_MS);
    expect(p.time).toBe(2700);
    expect(p.state.line?.text).toBe("Hello there.");
    expect(p.key("a")).toBe(false);
    expect(p.key(" ")).toBe(true);
    expect(p.state.line).toBeNull();
    expect(p.time).toBe(2700);
    expect(p.key(" ")).toBe(false); // nothing left to dismiss
    p.tick(1000);
    expect(p.state.line?.text).toBe("Go away."); // the next line still shows
  });

  it("validate rejects overlapping overlay windows and a window past the end; gate mode is unchanged", () => {
    const bad = tl(
      [
        { at: 1000, kind: "line", speaker: "nul", text: "Hello there.", mode: "overlay" },
        { at: 2000, kind: "line", speaker: "nul", text: "Go away.", mode: "overlay" },
        { at: 9500, kind: "line", speaker: "nul", text: "Go away.", mode: "overlay" },
        { at: 10000, kind: "end" },
      ],
      10000,
    );
    const e = validate(bad);
    expect(e.some((x) => x.includes("after the next line starts"))).toBe(true);
    expect(e.some((x) => x.includes("after durationMs"))).toBe(true);
    // gate lines may sit close together: the clock simply holds
    expect(
      validate(
        tl([
          { at: 1000, kind: "line", speaker: "nul", text: "Hello there." },
          { at: 1001, kind: "line", speaker: "nul", text: "Go away." },
        ]),
      ),
    ).toEqual([]);
  });

  it("a gate line still holds the clock next to overlay lines", () => {
    const mix = tl(
      [
        { at: 500, kind: "line", speaker: "nul", text: "Wait.", mode: "overlay" },
        { at: 4000, kind: "line", speaker: "knight", text: "Hello there." },
        { at: 9000, kind: "end" },
      ],
      9000,
    );
    const p = new CutscenePlayer(mix, { env: ENV });
    p.start();
    p.tick(6000);
    expect(p.isHeldOnLine).toBe(true);
    expect(p.time).toBe(4000);
    expect(p.state.line?.mode).toBe("gate");
  });
});
