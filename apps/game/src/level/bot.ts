/**
 * Browser-side WPM bot for tests (`?scene=play&wpm-bot=60`), reusable by the T6.2 browser bots.
 *
 * It reads ONLY `LevelView` (the next plate letter) and "types" through `press(key)`, which the play scene wires to a
 * synthetic `keydown` on `window`: the very same path a human uses (input/keyboard.ts -> normalizeKey -> runner).
 * So a bot run exercises the client clock protocol and produces a real input log.
 *
 * Model (after packages/sim/tests/bot/refBot.ts): one keystroke every `12000 * accuracy / wpm` ms (+-15% jitter, seeded),
 * a typo with probability `1 - accuracy`, a short think-pause after each finished word, urgent plates (guard and doom
 * words) first after a reaction delay, falling-rubble words soonest-landing first, Escape to drop a long target when
 * something urgent appears.
 */
import type { LevelView, PlateView } from "@hd2d/sim";

export interface BotOptions {
  wpm: number;
  /** Probability that a keystroke is correct (default 0.96). */
  accuracy?: number;
  seed?: number;
  /** Share of time spent actually typing (default 0.9): a pause follows each finished word. */
  efficiency?: number;
  /** Probability of attempting a guard word (default 1). */
  guardAttempt?: number;
  /** Ticks before a new guard/doom plate is noticed (default 15). */
  reactionTicks?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRAY = "qzxjkvw";

export class WpmBot {
  private readonly rng: () => number;
  private readonly accuracy: number;
  private readonly eff: number;
  private readonly guardAttempt: number;
  private readonly reaction: number;
  private readonly baseMs: number;
  private nextAt = 0;
  private readonly decided = new Map<number, boolean>();
  /** Keys pressed so far (for assertions). */
  pressed = 0;

  constructor(
    private readonly opts: BotOptions,
    private readonly press: (key: string) => void,
  ) {
    this.rng = mulberry32(opts.seed ?? 0xb07);
    this.accuracy = opts.accuracy ?? 0.96;
    this.eff = opts.efficiency ?? 0.9;
    this.guardAttempt = opts.guardAttempt ?? 1;
    this.reaction = opts.reactionTicks ?? 15;
    this.baseMs = (12000 * this.accuracy) / opts.wpm;
  }

  private interval(): number {
    return this.baseMs * (0.85 + this.rng() * 0.3);
  }

  private wantsGuard(p: PlateView): boolean {
    let d = this.decided.get(p.id);
    if (d === undefined) {
      d = this.rng() < this.guardAttempt;
      this.decided.set(p.id, d);
    }
    return d;
  }

  private noticed(p: PlateView, tick: number): boolean {
    if (p.expiresAtTick === null || p.totalTicks === null) return true;
    return tick >= p.expiresAtTick - p.totalTicks + this.reaction;
  }

  /**
   * Call once per frame with a monotonic ms clock. `view` may be a getter so that several keystrokes owed during a
   * slow frame (software GL, loaded CI box) each see the state the previous one produced.
   */
  update(view: LevelView | (() => LevelView), nowMs: number): void {
    for (let i = 0; i < 8 && nowMs >= this.nextAt; i++) {
      this.step(typeof view === "function" ? view() : view, nowMs);
    }
  }

  private step(view: LevelView, nowMs: number): void {
    if (view.phase !== "combat" && view.phase !== "secondWind") {
      this.nextAt = nowMs + 30;
      return;
    }
    // keep the typing rate when frames are slow: the schedule advances from the previous due time, not from "now"
    const base = Math.max(this.nextAt, nowMs - 400);
    const plates = view.plates;
    const target = plates.find((p) => p.isTarget);
    const guard = plates.find(
      (p) => p.kind === "guard" && this.noticed(p, view.tick) && this.wantsGuard(p),
    );
    const doom = plates.find((p) => p.kind === "doom" && this.noticed(p, view.tick));
    const urgent = guard ?? doom;
    const rubble = plates
      .filter((p) => p.kind === "minigame")
      .sort((a, b) => (a.expiresAtTick ?? 0) - (b.expiresAtTick ?? 0))[0];

    let pick: PlateView | undefined;
    if (view.phase === "secondWind") {
      pick = plates.find((p) => p.kind === "secondWind");
    } else if (target !== undefined) {
      const exclusive =
        target.kind === "guard" || target.kind === "doom" || target.kind === "finisher";
      if (urgent !== undefined && !exclusive && target.text.length - target.typedIndex > 2) {
        this.send("Escape");
        this.nextAt = base + this.interval();
        return;
      }
      pick = target;
    } else if (urgent !== undefined) {
      pick = urgent;
    } else if (rubble !== undefined) {
      pick = rubble;
    } else {
      const fin = plates.find((p) => p.kind === "finisher");
      const words = plates.filter((p) => p.kind === "word");
      pick = fin ?? words.find((p) => p.ownerId === view.focusEnemyId) ?? words[0];
    }
    if (pick === undefined) {
      this.nextAt = nowMs + 50;
      return;
    }

    const want = pick.text.charAt(pick.typedIndex);
    const iv = this.interval();
    if (this.rng() >= this.accuracy) {
      const first = new Set(plates.map((p) => p.text.charAt(0).toLowerCase()));
      let wrong = "";
      if (target !== undefined) wrong = want === "e" ? "r" : "e";
      else wrong = [...STRAY].find((c) => !first.has(c)) ?? "";
      if (wrong !== "") {
        this.send(wrong);
        this.nextAt = base + iv;
        return;
      }
    }
    this.send(want);
    const done = pick.typedIndex + 1 >= pick.text.length;
    this.nextAt = base + iv + (done ? pick.text.length * iv * (1 / this.eff - 1) : 0);
  }

  private send(key: string): void {
    this.pressed++;
    this.press(key);
  }
}
