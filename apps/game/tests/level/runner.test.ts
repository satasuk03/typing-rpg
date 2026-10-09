import { CLIENT_LAG_TICKS, getView, hash, MAX_CATCHUP_TICKS, msToTick, replay } from "@hd2d/sim";
import { describe, expect, test } from "vitest";
import { WpmBot } from "../../src/level/bot";
import { makeRunConfig } from "../../src/level/config";
import { LevelRunner } from "../../src/level/runner";
import { buildResultsModel, formatTime } from "../../src/level/screens";

const FRAME_MS = 1000 / 60;

/** Virtual-time session: frames every 16.67 ms; keys carry an OS timestamp 3..12 ms BEFORE the frame that sees them. */
function play(levelId: string, wpm: number, opts: { maxMs?: number; seed?: number } = {}) {
  const cfg = makeRunConfig({ levelId, pace: wpm, seed: opts.seed ?? 77 });
  const events: string[] = [];
  const runner = new LevelRunner(cfg, (evs) => {
    for (const e of evs) events.push(e.type);
  });
  let now = 1000; // performance.now() at start is arbitrary
  runner.start(now);
  let n = 0;
  const bot = new WpmBot({ wpm, accuracy: 0.97, seed: 5 }, (k) => {
    n++;
    runner.handleKey(k, now - (3 + (n % 10)));
  });
  const maxMs = opts.maxMs ?? 600_000;
  const t0 = now;
  while (!runner.terminal && now - t0 < maxMs) {
    now += FRAME_MS;
    const f = runner.frame(now);
    bot.update(f.view, now);
  }
  return { runner, cfg, events, bot };
}

describe("LevelRunner client clock protocol", () => {
  test("a bot run through the runner clears L1 and replay() of its log reproduces the final hash", () => {
    const { runner, cfg, events } = play("ch1-l01", 60);
    expect(runner.result?.outcome).toBe("cleared");
    expect(events).toContain("LevelCleared");
    const rep = replay(cfg.def, cfg.loadout, runner.seedOfAttempt(), cfg.options, runner.inputs());
    expect(rep.hash).toBe(runner.hash());
    expect(rep.result?.outcome).toBe("cleared");
    expect(rep.result?.gold).toBe(runner.result?.gold);
  });

  test("log ms are integers, monotonic, and ticks derive from ms", () => {
    const { runner } = play("ch1-l01", 60, { maxMs: 30_000 });
    let prev = 0;
    for (const l of runner.log) {
      expect(Number.isInteger(l.ms)).toBe(true);
      expect(l.ms).toBeGreaterThanOrEqual(prev);
      expect(l.input.tick).toBe(msToTick(l.ms));
      prev = l.ms;
    }
  });

  test("frames trail the clock by CLIENT_LAG_TICKS", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(1000);
    expect(r.state.tick).toBe(msToTick(1000) - CLIENT_LAG_TICKS);
  });

  test("pause does not step the sim and the paused time is excluded from game time", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(500);
    const tick = r.state.tick;
    r.pause(500, "menu");
    r.frame(5000);
    r.frame(9000);
    expect(r.state.tick).toBe(tick);
    r.resume(10_000);
    // 500 ms played + 9.5 s paused: the next frame at 10.5 s is 1000 ms of game time
    r.frame(10_500);
    expect(r.state.tick).toBe(msToTick(1000) - CLIENT_LAG_TICKS);
  });

  test("keys are ignored while paused and a repeated timestamp never goes backwards", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(300);
    r.pause(300, "blur");
    expect(r.handleKey("a", 310)).toEqual([]);
    r.resume(400);
    r.frame(500);
    r.handleKey("a", 450); // older than the simulated tick: clamped forward
    r.handleKey("b", 451);
    const ms = r.log.map((l) => l.ms);
    expect(ms).toEqual([...ms].sort((a, b) => a - b));
    expect(r.log.every((l) => l.input.tick >= 0)).toBe(true);
  });

  test("a stall (more than MAX_CATCHUP_TICKS of catch-up) auto-pauses instead of stepping", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(100);
    const tick = r.state.tick;
    r.frame(100 + ((MAX_CATCHUP_TICKS + 20) * 50) / 3);
    expect(r.paused).toBe(true);
    expect(r.pauseReason).toBe("stall");
    expect(r.state.tick).toBe(tick);
    // resuming continues from where the game was, not from the stall
    r.resume(100 + ((MAX_CATCHUP_TICKS + 20) * 50) / 3);
    r.frame(100 + ((MAX_CATCHUP_TICKS + 20) * 50) / 3 + 200);
    expect(r.state.tick - tick).toBeLessThan(30);
  });

  test("abandon fails the level with reason abandoned and stays replayable", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(2000);
    r.abandon(2100);
    expect(r.result).toMatchObject({ outcome: "failed", failReason: "abandoned" });
    const rep = replay(cfg.def, cfg.loadout, cfg.seed, cfg.options, r.inputs());
    expect(rep.hash).toBe(r.hash());
  });

  test("restart gives a fresh state with a bumped seed", () => {
    const cfg = makeRunConfig({ levelId: "ch1-l01" });
    const r = new LevelRunner(cfg, () => {});
    r.start(0);
    r.frame(1000);
    const h = hash(r.state);
    r.restart(5000);
    expect(r.state.tick).toBe(0);
    expect(r.log).toHaveLength(0);
    expect(r.seedOfAttempt()).not.toBe(cfg.seed);
    expect(hash(r.state)).not.toBe(h);
    expect(getView(r.state).phase).toBe("walk");
  });
});

describe("results model", () => {
  test("a cleared run produces a results model with stars, time and WPM", () => {
    const { runner, cfg } = play("ch1-l01", 60);
    const res = runner.result;
    expect(res).not.toBeNull();
    if (!res) return;
    const m = buildResultsModel(res, cfg.def, 60);
    expect(m.outcome).toBe("cleared");
    expect(m.stars[0]).toBe(true);
    expect(m.timeText).toBe(formatTime(res.durationTicks));
    expect(m.wpm).toBeGreaterThan(20);
    expect(m.newWords.length).toBeGreaterThan(0);
    expect(m.accuracyPct).toBeGreaterThan(80);
  });
});
