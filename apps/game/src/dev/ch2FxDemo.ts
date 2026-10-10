/**
 * DEV-ONLY Chapter II VFX demo (T3.2) on the real level runner: `?scene=play&level=ch1-l05&demo=1`, then
 * `window.__play.demo("ch2:<name>")`. There are no Ch2 levels in the content bundle yet (T4.x), so the demo swaps the view the
 * stage and the combat VFX see for SYNTHETIC Ch2 enemies (Gloom Wolf elite, Cinder Moth healer, the Whispering Willow, ...) and
 * feeds synthetic events through the render and fx columns of the binding table (never the HUD / audio). The REAL plates of the
 * running Ch1 level stay on screen, which is what the keep-out probe measures against.
 *
 *   ch2:heal | ch2:elite | ch2:howl | ch2:riddle | ch2:pick:<lane> | ch2:right:<lane> | ch2:wrong:<lane> | ch2:freed | ch2:off
 *   ch2:biome:<hushwood|fen|grove>   (mood only: the layouts for Ch2 are T2.4's)
 *
 * `window.__ch2Demo.keepOut()` returns { checked, dimmed }: how many bright Ch2 spawns the keep-out gate looked at / dimmed.
 */

import type { EnemyDef } from "@hd2d/content";
import type { EnemyView, EventOf, LevelView, SimEvent, SimEventType } from "@hd2d/sim";
import { BINDINGS, type BindingCtx, type EventBinding } from "../level/eventBindings";
import type { PlaySession } from "../level/session";

declare global {
  interface Window {
    __ch2Demo?: { keepOut(): { checked: number; dimmed: number }; plates(): unknown };
  }
}

const SPRITE_SCALE: Record<string, number> = {
  wolf: 1.45,
  moth: 1.15,
  toad: 1.3,
  wisp: 1.2,
  shade: 1.1,
  willow: 1.0,
};

function view(o: Partial<EnemyView> & Pick<EnemyView, "id" | "defId" | "slot">): EnemyView {
  return {
    isBoss: false,
    alive: true,
    hp: 80,
    maxHp: 100,
    hpFrac: 0.8,
    atbFrac: 0,
    plateId: null,
    isGuard: false,
    guardTicksLeft: 0,
    guardTotalTicks: 0,
    guardResult: null,
    shield: 0,
    shieldMax: 0,
    weaknesses: [],
    brokenTicksLeft: 0,
    statuses: [],
    isFocus: false,
    pose: "idle",
    poseSinceTick: 0,
    ...o,
  };
}

export function makeCh2Demo(session: PlaySession): (name: string) => boolean {
  const stage = session.stage;
  // biome-ignore lint/suspicious/noExplicitAny: dev-only private access (the stage's def table and update)
  const st = stage as any;
  const defs = st.opts.enemies as Map<string, EnemyDef>;
  let leafIds: [number, number, number] = [901, 902, 903];
  let synth: EnemyView[] | null = null;
  let mini: LevelView["minigame"] | undefined;
  let phaseOverride: LevelView["phase"] | undefined;
  const patch = (v: LevelView): LevelView =>
    synth
      ? {
          ...v,
          enemies: synth,
          ...(mini !== undefined ? { minigame: mini } : {}),
          ...(phaseOverride ? { phase: phaseOverride } : {}),
        }
      : v;
  const stageUpdate = stage.update.bind(stage);
  stage.update = (v, a, d) => stageUpdate(patch(v), a, d);
  const combat = session.combat;
  if (combat) {
    const cu = combat.update.bind(combat);
    combat.update = (v) => cu(patch(v));
  }
  window.__ch2Demo = {
    keepOut: () => ({
      checked: combat?.fx.kit.keepOutChecked ?? 0,
      dimmed: combat?.fx.kit.keepOutDimmed ?? 0,
    }),
    plates: () => session.stage.view?.plates.map((p) => ({ id: p.id, kind: p.kind, text: p.text })),
  };

  const present = (e: SimEvent): void => {
    const b = BINDINGS[e.type as SimEventType] as EventBinding<SimEventType>;
    const ctx: BindingCtx = { render: session.stage, ui: session.screens, fx: session.combat?.fx };
    (b.render as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, ctx);
    (b.fx as ((ev: SimEvent, c: BindingCtx) => void) | undefined)?.(e, ctx);
  };
  const sched: { t: number; fn: () => void }[] = [];
  const later = (ms: number, fn: () => void): void => {
    sched.push({ t: stage.time + ms / 1000, fn });
  };
  const pump = (): void => {
    for (let i = sched.length - 1; i >= 0; i--) {
      const s = sched[i];
      if (s && stage.time >= s.t) {
        sched.splice(i, 1);
        s.fn();
      }
    }
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);

  /** Replace the stage's enemies with `list` (spawns actors for the new ones). */
  const setup = (
    list: {
      id: number;
      sprite: string;
      slot: number;
      elite?: boolean;
      boss?: boolean;
      patch?: Partial<EnemyView>;
    }[],
  ): void => {
    // drop earlier synthetic actors so a new setup starts clean
    synth = [];
    mini = undefined;
    phaseOverride = undefined;
    for (const e of list) {
      const defId = `demo-${e.sprite}`;
      if (!defs.has(defId))
        defs.set(defId, {
          id: defId,
          spriteId: e.sprite,
          scale: SPRITE_SCALE[e.sprite] ?? 1.3,
        } as unknown as EnemyDef);
      stage.spawnEnemy(e.id, defId, e.slot, e.boss === true, e.elite === true);
      synth.push(
        view({
          id: e.id,
          defId,
          slot: e.slot,
          isBoss: e.boss === true,
          ...(e.elite ? { elite: true } : {}),
          ...e.patch,
        }),
      );
    }
    session.combat?.fx.clear();
  };
  const find = (id: number): EnemyView | undefined => synth?.find((e) => e.id === id);
  const tick = (): number => session.stage.view?.tick ?? 0;

  return (name: string): boolean => {
    if (!name.startsWith("ch2:")) return false;
    const fx = session.combat?.fx;
    if (!fx || !session.stage.view) return false;
    const cmd = name.slice(4);
    const [verb, arg] = cmd.split(":");
    const t = tick();
    switch (verb) {
      case "off":
        synth = null;
        mini = undefined;
        phaseOverride = undefined;
        fx.clear();
        return true;
      case "biome":
        session.world.setBiome((arg ?? "grove") as never);
        return true;
      case "heal": {
        setup([
          { id: 9001, sprite: "wolf", slot: 0, patch: { hpFrac: 0.45, hp: 45 } },
          {
            id: 9002,
            sprite: "moth",
            slot: 1,
            patch: {
              healer: { ticksLeft: 30, totalTicks: 600, healsLeft: null },
              hpFrac: 1,
              hp: 100,
            },
          },
        ]);
        // the cast frame + ring start 600 ms out; the heal lands at 0 (the demo animates the cadence on the stage clock)
        const m = find(9002);
        if (m?.healer) m.healer = { ticksLeft: 36, totalTicks: 600, healsLeft: null };
        later(600, () => {
          if (m?.healer) m.healer = { ticksLeft: 540, totalTicks: 600, healsLeft: null };
          const w = find(9001);
          if (w) w.hpFrac = 0.62;
          present({
            type: "EnemyHealed",
            tick: t,
            sourceId: 9002,
            targetId: 9001,
            amount: 17,
            amountM: 17000,
            hpAfter: 62,
            maxHp: 100,
          } as EventOf<"EnemyHealed">);
        });
        return true;
      }
      case "elite":
        setup([
          { id: 9011, sprite: "wolf", slot: 0, elite: true },
          { id: 9012, sprite: "toad", slot: 1 },
        ]);
        return true;
      case "howl": {
        setup([{ id: 9021, sprite: "wolf", slot: 0, elite: true }]);
        const w = find(9021);
        if (w) {
          w.pose = "windup";
          w.atbFrac = 0.2;
          const t0 = stage.time;
          const ramp = (): void => {
            if (!synth || find(9021) !== w) return;
            w.atbFrac = Math.min(1, 0.2 + (stage.time - t0) / 3);
            requestAnimationFrame(ramp);
          };
          ramp();
        }
        return true;
      }
      case "riddle": {
        // the lane plates are three of the REAL on-screen plates, so the world leaves track real HUD rects
        const real = (session.stage.view?.plates ?? []).map((p) => p.id);
        leafIds = [real[0] ?? 901, real[1] ?? 902, real[2] ?? 903];
        setup([
          { id: 9100, sprite: "willow", slot: 0, boss: true, patch: { hpFrac: 0.4, hp: 40 } },
        ]);
        mini = {
          lanes: 3,
          cleared: 0,
          missed: 0,
          kind: "riddle",
          riddle: {
            riddleIndex: 0,
            riddleCount: 5,
            clue: "I fall from trees in autumn.",
            leafPlateIds: leafIds,
            ticksLeft: 900,
            totalTicks: 900,
            last: null,
          },
        };
        present({
          type: "RiddleStarted",
          tick: t,
          enemyId: 9100,
          riddleIndex: 0,
          riddleCount: 5,
          clue: "I fall from trees in autumn.",
          leafPlateIds: leafIds,
          deadlineTick: t + 900,
          totalTicks: 900,
        } as EventOf<"RiddleStarted">);
        return true;
      }
      case "pick": {
        const lane = Number(arg ?? 1);
        present({
          type: "RiddleLeafPicked",
          tick: t,
          riddleIndex: 0,
          plateId: leafIds[lane] ?? 901 + lane,
          lane,
        } as EventOf<"RiddleLeafPicked">);
        return true;
      }
      case "right":
      case "wrong": {
        const lane = Number(arg ?? 1);
        const right = verb === "right";
        present({
          type: "RiddleResolved",
          tick: t,
          enemyId: 9100,
          riddleIndex: 0,
          outcome: right ? "right" : "wrong",
          pickedPlateId: leafIds[lane] ?? 901 + lane,
          answerPlateId: leafIds[right ? lane : (lane + 1) % 3] ?? 901,
          answerText: "leaf",
          answerLane: right ? lane : (lane + 1) % 3,
        } as EventOf<"RiddleResolved">);
        if (!right) {
          present({
            type: "HeroDamaged",
            tick: t,
            sourceId: 9100,
            damage: 8,
            damageM: 8000,
            hpAfter: 80,
            cause: "minigame",
            blocked: false,
          } as unknown as SimEvent);
        }
        return true;
      }
      case "freed": {
        setup([
          { id: 9100, sprite: "willow", slot: 0, boss: true, patch: { hpFrac: 0.05, hp: 5 } },
        ]);
        // wait one beat so the setup frame exists, then run the finale: FinisherCompleted at t0, the sim death immediately,
        // EnemyDeath presented at 1060 ms (the typing handle's FINISHER_DEATH_MS)
        later(250, () => {
          const w = find(9100);
          present({
            type: "FinisherCompleted",
            tick: tick(),
            enemyId: 9100,
            plateId: 1,
          } as EventOf<"FinisherCompleted">);
          if (w) {
            w.alive = false;
            w.hp = 0;
            w.hpFrac = 0;
            w.pose = "dead";
          }
          later(1060, () => {
            present({
              type: "EnemyDeath",
              tick: tick(),
              enemyId: 9100,
              defId: "demo-willow",
              isBoss: true,
              byKind: "finisher",
            } as EventOf<"EnemyDeath">);
            fx.dissolve(9100, "finisher");
          });
        });
        return true;
      }
      default:
        return false;
    }
  };
}
