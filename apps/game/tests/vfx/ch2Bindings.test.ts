/**
 * T3.2 AC: every v2.0 / Chapter II event is bound (an FX, or an explicit silent reason), the bindings call real CombatFx
 * methods, the elite flag reaches the stage, and the Hush Spell capital accent stays inside its cell (never on the next
 * letter) and inside the per-key budget.
 */
import type { SimEvent } from "@hd2d/sim";
import { ALL_EVENT_TYPES } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import {
  BINDINGS,
  type BindingCtx,
  type EventBinding,
  type RenderActions,
} from "../../src/level/eventBindings";
import { CapitalAccent } from "../../src/render/vfx/CapitalAccent";
import { CombatFx } from "../../src/render/vfx/combat/CombatFx";

const CH2_EVENTS = [
  "EnemyHealed",
  "RiddleStarted",
  "RiddleLeafPicked",
  "RiddleResolved",
  "BossPhaseChanged",
  "FinisherCompleted",
  "EnemySpawned",
  "CharCorrect",
] as const;

describe("Chapter II event bindings (T3.2 enumeration)", () => {
  it("every event in ALL_EVENT_TYPES is an FX, or carries an explicit reason (render / HUD / audio / silent)", () => {
    for (const t of ALL_EVENT_TYPES) {
      const b = BINDINGS[t] as EventBinding<typeof t>;
      const reason = `${b.fxNone ?? ""}${b.silent ?? ""}`.trim();
      const presented =
        b.fx !== undefined || b.render !== undefined || b.hud === "push" || b.audio === "bound";
      expect(presented || reason.length > 15, `${t}: neither bound nor justified`).toBe(true);
      if (b.fx === undefined) expect((b.fxNone ?? "").length, `${t}: fxNone`).toBeGreaterThan(15);
    }
  });

  it("the Chapter II events are real bindings, not the C0.3 silent stubs", () => {
    for (const t of ["EnemyHealed", "RiddleStarted", "RiddleLeafPicked", "RiddleResolved"] as const)
      expect(BINDINGS[t].fx, `${t} must have a combat effect`).toBeDefined();
    expect(BINDINGS.FinisherCompleted.fx).toBeDefined();
    for (const t of CH2_EVENTS) {
      const b = BINDINGS[t] as EventBinding<typeof t>;
      expect(`${b.fxNone ?? ""}${b.silent ?? ""}`, `${t} still reads as a stub`).not.toMatch(
        /stub/i,
      );
    }
    expect(BINDINGS.CharCorrect.fxNone).toMatch(/capital accent/);
  });

  it("each new fx binding calls one method that CombatFx really has", () => {
    const methods = new Set(Object.getOwnPropertyNames(CombatFx.prototype));
    for (const t of [
      "EnemyHealed",
      "RiddleStarted",
      "RiddleLeafPicked",
      "RiddleResolved",
      "FinisherCompleted",
    ] as const) {
      const calls: string[] = [];
      const fx = new Proxy({} as NonNullable<BindingCtx["fx"]>, {
        get: (_o, name: string) => () => calls.push(name),
      });
      const b = BINDINGS[t] as EventBinding<typeof t>;
      (b.fx as (e: SimEvent, c: BindingCtx) => void)({ type: t, tick: 0 } as SimEvent, {
        render: {} as RenderActions,
        ui: { hint: () => {}, secondWind: () => {} },
        fx,
      });
      expect(calls.length, t).toBe(1);
      expect(methods.has(calls[0] as string), `${t} -> ${calls[0]}`).toBe(true);
    }
  });

  it("EnemySpawned hands the elite flag to the stage (true only when set)", () => {
    const seen: unknown[][] = [];
    const render = { spawnEnemy: (...a: unknown[]) => seen.push(a) } as unknown as RenderActions;
    const ctx: BindingCtx = { render, ui: { hint: () => {}, secondWind: () => {} } };
    const mk = (extra: object): SimEvent =>
      ({
        type: "EnemySpawned",
        tick: 0,
        enemyId: 3,
        defId: "wolf",
        slot: 1,
        maxHp: 9,
        isBoss: false,
        shieldMax: 0,
        ...extra,
      }) as SimEvent;
    (BINDINGS.EnemySpawned.render as (e: SimEvent, c: BindingCtx) => void)(
      mk({ elite: true }),
      ctx,
    );
    (BINDINGS.EnemySpawned.render as (e: SimEvent, c: BindingCtx) => void)(mk({}), ctx);
    expect(seen[0]?.[4]).toBe(true);
    expect(seen[1]?.[4]).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------- capital accent

type Rect = { x: number; y: number; w: number; h: number };

function fakeHud(rects: Map<string, Rect>, k = 1) {
  const effects: { draw: (c: unknown, f: unknown) => void }[] = [];
  const hud = {
    fx: { add: (e: never) => effects.push(e), remove: () => {} },
    getSettings: () => ({ effectsIntensity: k, reducedFlash: false, reducedMotion: false }),
    getLetterRectInto: (plateId: number, index: number, out: Rect) => {
      const r = rects.get(`${plateId}:${index}`);
      if (!r) return false;
      Object.assign(out, r);
      return true;
    },
  };
  return { hud, effects };
}

function recorder() {
  const rects: Rect[] = [];
  const c = {
    globalAlpha: 1,
    fillStyle: "",
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
  };
  return { c, rects };
}

const ev = (index: number, shifted?: boolean): SimEvent =>
  ({
    type: "CharCorrect",
    tick: 1,
    plateId: 7,
    ownerId: null,
    kind: "word",
    index,
    char: "H",
    isLast: false,
    keyStreakTier: 0,
    ...(shifted ? { shifted: true } : {}),
  }) as unknown as SimEvent;

describe("Hush Spell capital accent", () => {
  const cells = new Map<string, Rect>([
    ["7:0", { x: 100, y: 200, w: 24, h: 30 }],
    ["7:1", { x: 124, y: 200, w: 24, h: 30 }], // the NEXT letter
  ]);

  it("ignores lower-case keys and draws only for CharCorrect.shifted", () => {
    const { hud, effects } = fakeHud(cells);
    const a = new CapitalAccent(hud as never);
    a.attach();
    a.onEvent(ev(0));
    expect(a.handled).toBe(0);
    a.onEvent(ev(0, true));
    expect(a.handled).toBe(1);
    const { c, rects } = recorder();
    (effects[0] as { draw: (c: unknown, f: unknown) => void }).draw(c, { dt: 0.016, scale: 1 });
    expect(rects.length).toBeGreaterThan(5);
  });

  it("never touches the next letter's cell and stays above the typed cell", () => {
    const { hud, effects } = fakeHud(cells);
    const a = new CapitalAccent(hud as never);
    a.attach();
    a.onEvent(ev(0, true));
    const typed = cells.get("7:0") as Rect;
    const next = cells.get("7:1") as Rect;
    const draw = (effects[0] as { draw: (c: unknown, f: unknown) => void }).draw;
    for (let frame = 0; frame < 12; frame++) {
      const { c, rects } = recorder();
      draw(c, { dt: 0.016, scale: 1 });
      for (const r of rects) {
        // fully above the letter cell's rows (the HUD clips letters anyway; this proves we do not rely on it)
        expect(r.y + r.h, "accent sits above the cell").toBeLessThanOrEqual(typed.y);
        // and never inside the next letter's column band
        const overlapsNext = r.x < next.x + next.w && r.x + r.w > next.x;
        expect(overlapsNext, `rect ${JSON.stringify(r)} reaches the next letter`).toBe(false);
      }
    }
    void next;
  });

  it("costs far less than the 0.45 ms/key budget per event", () => {
    const { hud } = fakeHud(cells);
    const a = new CapitalAccent(hud as never);
    a.attach();
    const e = ev(0, true);
    for (let i = 0; i < 2000; i++) a.onEvent(e); // warm
    const t0 = performance.now();
    const N = 20000;
    for (let i = 0; i < N; i++) a.onEvent(e);
    const per = (performance.now() - t0) / N;
    console.log(`capital accent handler: ${per.toFixed(5)} ms per shifted key`);
    expect(per, `${per.toFixed(5)} ms per shifted key`).toBeLessThan(0.02);
  });

  it("is off at effectsIntensity 0 (the accent is a reward, not information)", () => {
    const { hud } = fakeHud(cells, 0);
    const a = new CapitalAccent(hud as never);
    a.attach();
    a.onEvent(ev(0, true));
    expect(a.handled).toBe(0);
  });
});
