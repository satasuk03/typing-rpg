/**
 * Real-game boot (the default route): fonts, net layer, save store, audio, then the title screen.
 * Query flags (all optional, mainly for tests): `api=off|<url>`, `wpm-bot=75[&bot-acc=..&bot-seed=..]`, `tier=0|1|2`,
 * `audio=0`, `fonts=0`, `onboard=0` (no first-run flow), `dev=1` (exposes `__grant`), `screen=<name>` (start on a screen).
 */
import { contentBundle } from "@hd2d/content";
import { AudioEngine } from "../audio";
import { loadHudFonts } from "../hud/fonts";
import type { Save } from "../meta/ops";
import { SaveStore } from "../meta/save";
import { createNet, type Net } from "../net";
import { isQualityTier, type QualityTier } from "../render";
import { App, type ScreenName } from "./app";
import { cacheScreen } from "./screens/cache";
import { calibrateScreen } from "./screens/calibrate";
import { completeScreen } from "./screens/complete";
import { introScreen } from "./screens/intro";
import { inventoryScreen } from "./screens/inventory";
import { journalScreen } from "./screens/journal";
import { loadoutScreen } from "./screens/loadout";
import { mapScreen } from "./screens/map";
import { readQuality, settingsScreen } from "./screens/settings";
import { shopScreen } from "./screens/shop";
import { storyScreen } from "./screens/story";
import { titleScreen } from "./screens/title";

export interface DevHooks {
  grant(g: { gold?: number; caches?: number }): void;
  mutate(fn: (s: Save) => void): void;
}

const num = (v: string | null): number | undefined => {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The API base comes from `?api=<url>` or the `VITE_API_URL` build variable. With neither (or `api=off`) the game runs
 * local-only: the save lives in IndexedDB and no request is ever made.
 */
export function apiBase(q: URLSearchParams): string | null {
  const api = q.get("api") ?? (import.meta.env.VITE_API_URL as string | undefined) ?? null;
  return api === null || api === "off" || api === "" ? null : api;
}

function makeNet(api: string | null): Net {
  const offline = api === null;
  const baseUrl = offline ? "http://offline.invalid" : api;
  return createNet({
    baseUrl,
    clientVersion: "app",
    fetch: offline ? () => Promise.reject(new TypeError("offline")) : undefined,
  });
}

export async function start(
  glCanvas: HTMLCanvasElement,
  hudCanvas: HTMLCanvasElement,
): Promise<void> {
  const q = new URLSearchParams(location.search);
  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const fonts = q.get("fonts") !== "0";
  if (fonts) await loadHudFonts();
  const api = apiBase(q);
  const net = makeNet(api);
  const bundle = contentBundle;
  const store = await SaveStore.open(net, { syncWaitMs: api === null ? 0 : 2500, bundle });
  const audio = q.get("audio") === "0" ? null : new AudioEngine();
  const tierParam = num(q.get("tier"));
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : readQuality();
  const botWpm = num(q.get("wpm-bot"));

  const app = new App({
    glCanvas,
    hudCanvas,
    net,
    store,
    audio,
    fonts,
    tier,
    bundle,
    onboarding: q.get("onboard") !== "0",
    bot:
      botWpm === undefined
        ? undefined
        : { wpm: botWpm, accuracy: num(q.get("bot-acc")), seed: num(q.get("bot-seed")) },
    factories: {
      title: titleScreen,
      map: mapScreen,
      loadout: loadoutScreen,
      inventory: inventoryScreen,
      shop: shopScreen,
      cache: cacheScreen,
      journal: journalScreen,
      settings: settingsScreen,
      complete: completeScreen,
      story: storyScreen,
      calibrate: calibrateScreen,
      intro: introScreen,
    },
  });
  app.consoleErrors = consoleErrors;
  window.__app = app.debug();
  if (q.get("dev") === "1") {
    (window as unknown as { __dev: DevHooks }).__dev = {
      grant: (g) =>
        store.devMutate((s) => {
          s.wallet.gold += g.gold ?? 0;
          s.inventory.unopenedCaches += g.caches ?? 0;
        }),
      mutate: (fn) => store.devMutate(fn),
    };
  }

  // a background pull may adopt a newer cloud save: refresh the in-memory copy while a menu is showing
  if (api !== null) {
    void net.sync
      .sync()
      .then(() => store.reloadFromLocal())
      .catch(() => undefined);
  }

  const first = (q.get("screen") as ScreenName | null) ?? "title";
  app.go(first, {});
}
