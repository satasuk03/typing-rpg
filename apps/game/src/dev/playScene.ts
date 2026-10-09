/**
 * Playable level route:
 *   ?scene=play&level=ch1-l03[&seed=N][&pace=35][&tier=0|1|2][&wpm-bot=40[&bot-acc=0.96][&bot-seed=N]]
 *     [&audio=0][&fonts=0][&difficulty=story|standard|hard|zen]
 *
 * Loads the level by id with the starter loadout (parLoadout(1) + starter kit) and plays it through the real runner,
 * stage, HUD and audio. `wpm-bot` adds a browser bot that types from the view through synthetic key events on the same
 * input path a human uses (it also sets the pace to the bot's WPM unless `pace` is given).
 *
 * Test hook: `window.__play` (see level/session.ts `PlayDebug`).
 */
import { contentBundle } from "@hd2d/content";
import type { LevelOptions } from "@hd2d/sim";
import { PlaySession } from "../level/session";

const num = (v: string | null): number | undefined => {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function start(glCanvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const levelId = q.get("level") ?? "ch1-l01";
  if (!contentBundle.levels.some((l) => l.id === levelId)) {
    document.body.textContent = `Unknown level "${levelId}"`;
    return;
  }
  const botWpm = num(q.get("wpm-bot"));
  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
  const difficulty = q.get("difficulty") as LevelOptions["difficulty"] | null;

  void PlaySession.create({
    glCanvas,
    hudCanvas,
    levelId,
    seed: num(q.get("seed")),
    pace: num(q.get("pace")) ?? botWpm,
    difficulty: difficulty ?? undefined,
    tier: num(q.get("tier")) ?? 0,
    audio: q.get("audio") !== "0",
    fonts: q.get("fonts") !== "0",
    bot:
      botWpm === undefined
        ? undefined
        : { wpm: botWpm, accuracy: num(q.get("bot-acc")), seed: num(q.get("bot-seed")) },
  })
    .then((session) => {
      window.__play = session.debugApi(consoleErrors);
    })
    .catch((err: unknown) => {
      consoleErrors.push(String(err));
      console.error(err);
    });
}
