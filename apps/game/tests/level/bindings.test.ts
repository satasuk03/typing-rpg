import { ALL_EVENT_TYPES, type SimEvent } from "@hd2d/sim";
import { describe, expect, test } from "vitest";
import { AUDIO_BINDINGS, AUDIO_SILENT_EVENTS } from "../../src/audio/bindings";
import {
  BINDINGS,
  EventRouter,
  type RenderActions,
  type Sinks,
  TYPING_EVENT_TYPES,
} from "../../src/level/eventBindings";

describe("event bindings (plan T2.3 AC)", () => {
  test("every ALL_EVENT_TYPES entry has a binding, and there are no extras", () => {
    for (const t of ALL_EVENT_TYPES) expect(BINDINGS[t], `missing binding for ${t}`).toBeDefined();
    expect(Object.keys(BINDINGS).sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  test("an entry presents the event somewhere or says why it is intentionally silent", () => {
    for (const t of ALL_EVENT_TYPES) {
      const b = BINDINGS[t];
      const presented = b.render !== undefined || b.hud === "push" || b.audio === "bound";
      if (!presented) expect(b.silent, `${t} is unbound and has no silent reason`).toBeTruthy();
    }
  });

  test("the audio column agrees with the audio table", () => {
    for (const t of ALL_EVENT_TYPES) {
      if (BINDINGS[t].audio === "bound") expect(AUDIO_BINDINGS[t], t).toBeDefined();
      else expect(AUDIO_BINDINGS[t], t).toBeUndefined();
    }
    // audio's own silent list never overlaps its bound handlers
    for (const t of AUDIO_SILENT_EVENTS) expect(AUDIO_BINDINGS[t], t).toBeUndefined();
  });

  test("the router applies render, HUD, audio and hooks in that order", () => {
    const calls: string[] = [];
    const render = new Proxy({} as RenderActions, {
      get: (_t, name: string) => () => calls.push(`render.${name}`),
    });
    const sinks: Sinks = {
      render,
      hud: { pushEvent: (e) => calls.push(`hud.${e.type}`) },
      audio: { play: (id) => calls.push(`audio.${String(id)}`), setMusicState: () => {} },
      ui: { hint: () => {}, secondWind: () => {} },
    };
    const router = new EventRouter(sinks);
    router.registerTypingFx((e) => calls.push(`typingFx.${e.type}`));
    const ev: SimEvent = {
      type: "CharCorrect",
      tick: 1,
      plateId: 1,
      ownerId: 1,
      kind: "word",
      index: 0,
      char: "a",
      isLast: false,
      combo: 0,
      comboTier: 0,
      keyStreak: 1,
      keyStreakTier: 0,
      atbGainM: 0,
    };
    router.dispatch([ev]);
    expect(calls).toEqual(["hud.CharCorrect", "audio.key", "typingFx.CharCorrect"]);
    expect(TYPING_EVENT_TYPES).toContain("CharCorrect");
  });

  test("hits drive render actions without touching anything but the sinks", () => {
    const calls: string[] = [];
    const render = new Proxy({} as RenderActions, {
      get: (_t, name: string) => () => calls.push(name),
    });
    const router = new EventRouter({
      render,
      hud: { pushEvent: () => {} },
      audio: null,
      ui: { hint: () => {}, secondWind: () => {} },
    });
    router.dispatch([
      {
        type: "Hit",
        tick: 5,
        sourceId: 0,
        targetId: 2,
        kind: "auto",
        origin: "weapon",
        skillId: null,
        damageType: "slash",
        damage: 10,
        damageM: 10_000,
        hpAfter: 5,
        maxHp: 15,
        crit: true,
        weak: false,
        broken: false,
        atbKnockback: false,
        hitIndex: 0,
        hitCount: 1,
        killed: false,
      },
    ]);
    expect(calls).toContain("enemyHit");
    expect(calls).toContain("hitStop");
    expect(calls).toContain("punch");
  });
});
