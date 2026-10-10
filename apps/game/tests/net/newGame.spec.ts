// New Game vs the cloud (interfaces v1.8 `resetEpoch`), through the REAL app against `wrangler dev`: the old cloud
// save must never resurrect, neither on reload nor from a stale second device. See playwright.config.ts.
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { seedProgress } from "../app/seed.ts";

const API = `http://localhost:${process.env.NET_API_PORT ?? 8793}`;
const APP = `/?api=${encodeURIComponent(API)}&audio=0&dev=1&onboard=0`;

// biome-ignore lint/suspicious/noExplicitAny: browser-side hooks are untyped
type W = any;

async function openApp(ctx: BrowserContext): Promise<Page> {
  const p = await ctx.newPage();
  await p.goto(APP);
  await p.waitForFunction(
    () =>
      (window as W).__app?.route() === "title" &&
      document.querySelector("#app-ui .app-screen[data-ready]") !== null,
    undefined,
    { timeout: 60_000 },
  );
  return p;
}

/** Full sync round trip; `snap` then reads the persisted local copy (what a reload would boot from). */
const sync = (p: Page) =>
  p.evaluate(async () => {
    const w = window as W;
    const r = await w.__app.app.net.sync.sync();
    return r.status as string;
  });

const snap = (p: Page) =>
  p.evaluate(async () => {
    const s = await (window as W).__app.app.net.sync.getLocal();
    return {
      gold: s.wallet.gold as number,
      levels: Object.keys(s.progress.levels).length,
      epoch: s.resetEpoch as number,
    };
  });

test("New Game on the real title screen: the old cloud save never resurrects (reload, stale second device)", async ({
  browser,
}) => {
  // device A: build progress and push it to the cloud
  const ctxA = await browser.newContext();
  const A = await openApp(ctxA);
  await seedProgress(A, { cleared: 3, caches: 1, gold: 4321 });
  await A.evaluate(() =>
    (window as W).__dev.mutate((s: W) => {
      s.playtimeSec = 3600;
    }),
  ); // real play time: the merge prefers the longer-played profile
  expect(await sync(A)).toBe("synced");
  expect(await snap(A)).toEqual({ gold: 4321, levels: 3, epoch: 0 });
  const identity = await A.evaluate(() => (window as W).__app.app.net.auth.exportIdentity());

  // device B (same identity) pulls the old progress
  const ctxB = await browser.newContext();
  const B = await openApp(ctxB);
  await B.evaluate(async (id) => {
    const n = (window as W).__app.app.net;
    await n.sync.sync(); // settle the boot-time sync first
    await n.auth.importIdentity(id);
  }, identity);
  expect(await sync(B)).toBe("synced");
  expect(await snap(B)).toMatchObject({ gold: 4321, levels: 3 });

  // A: New Game through the real title menu, then sync the tombstone to the cloud
  await A.reload(); // the title only offers New game once the profile has progress
  await A.waitForFunction(() => (window as W).__app?.route() === "title", undefined, {
    timeout: 60_000,
  });
  await A.bringToFront();
  await A.keyboard.press("Space");
  await A.waitForSelector("#menu:not([hidden])", { timeout: 60_000 });
  await A.locator("[data-act=new]").focus();
  await A.keyboard.press("Enter");
  await A.locator("[data-act=erase]").focus();
  await A.keyboard.press("Enter");
  await A.waitForFunction(() => (window as W).__app.route() === "map", undefined, {
    timeout: 60_000,
  });
  expect(await sync(A)).toBe("synced");
  const fresh = await snap(A);
  expect(fresh.levels).toBe(0);
  expect(fresh.epoch).toBe(1);
  expect(fresh.gold).not.toBe(4321);

  // stale device B (old epoch) earns more gold and syncs: it must adopt the reset, not overwrite it
  await B.evaluate(() => (window as W).__dev.grant({ gold: 500 }));
  expect(await sync(B)).toBe("synced");
  const b = await snap(B);
  expect(b.levels).toBe(0);
  expect(b.epoch).toBe(1);
  expect(b.gold).toBeLessThan(4321);

  // A reloads: boot pulls the cloud and the old progress stays gone
  await A.reload();
  await A.waitForFunction(() => (window as W).__app?.route() === "title", undefined, {
    timeout: 60_000,
  });
  const after = await snap(A);
  expect(after.levels).toBe(0);
  expect(after.epoch).toBe(1);
  expect(after.gold).toBeLessThan(4321);
  await ctxA.close();
  await ctxB.close();
});
