// Net-layer e2e against a real `wrangler dev` Worker (see playwright.config.ts). No mocks: real D1, real re-sim.
import { expect, type Page, test } from "@playwright/test";
import { blankSave } from "../../../../packages/shared/tests/saveGen.ts";

const API = "http://localhost:8793";
const URL = `/?scene=trial&api=${encodeURIComponent(API)}`;

test.describe.configure({ mode: "parallel" });

// Page-side helpers run in the browser; typed loosely on purpose.
// biome-ignore lint/suspicious/noExplicitAny: browser-side hooks are untyped
type W = any;

const phase = (page: Page) => page.locator("#trial");
async function ready(page: Page) {
  await expect(phase(page)).toHaveAttribute("data-phase", "ready", { timeout: 30_000 });
}

function mulberry(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Types the REAL passage for the full 60 s at about 55-65 WPM with human-like jitter and a few typos. */
async function typeTrial(page: Page, seed: number) {
  const passage: string = await page.evaluate(() => (window as W).__trial.run.recorder.passage);
  const rnd = mulberry(seed);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 60_800 && i < passage.length) {
    if (rnd() < 0.03) {
      const wrong = passage.charAt(i) === "q" ? "z" : "q";
      await page.keyboard.press(wrong);
      await page.waitForTimeout(110 + rnd() * 90);
    }
    await page.keyboard.press(passage.charAt(i++));
    await page.waitForTimeout(95 + rnd() * 190); // jittered gaps, mean about 190 ms
  }
  await expect(phase(page)).toHaveAttribute("data-phase", "results", { timeout: 15_000 });
}

test("(a) fresh profile: anon login -> type the real 60 s Trial -> accepted -> on the leaderboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await ready(page); // anon login + /runs/start happened
  const userId = await page.evaluate(() => (window as W).__net.auth.currentUserId);
  expect(userId).toBeTruthy();
  await typeTrial(page, 1);

  const result = await page.evaluate(() => (window as W).__trial.result);
  expect(result.wpmX100).toBeGreaterThan(3500);
  expect(result.wpmX100).toBeLessThan(9000);
  expect(result.typos).toBeGreaterThan(0);

  await page.keyboard.press("Enter"); // submit
  await expect(phase(page)).toHaveAttribute("data-phase", "submitted", { timeout: 20_000 });
  await expect(page.locator("#t-msg")).toContainText("Accepted");
  const outcome = await page.evaluate(() => (window as W).__trial.outcome);
  expect(outcome.ok).toBe(true);
  expect(outcome.response.verified.wpmX100).toBe(result.wpmX100); // the server's re-sim agrees with the client
  expect(outcome.response.pb).toBe(true);

  // leaderboard UI: top list + around-me, my row highlighted
  const mine = page.locator("#lb-top tr.me");
  await expect(mine).toHaveCount(1);
  await expect(page.locator("#lb-around tr.me")).toHaveCount(1);
  const publicId = await mine.getAttribute("data-public-id");
  expect(publicId).toBeTruthy();
  expect(publicId).not.toBe(userId); // the internal id is never exposed

  // it is on the PUBLIC board (not just a shadow row): fetch anonymously
  const lb = await (await page.request.get(`${API}/lb/trial?scope=season`)).json();
  expect(lb.top.some((e: W) => e.publicId === publicId)).toBe(true);
  expect(JSON.stringify(lb)).not.toContain(userId);
  expect(errors).toEqual([]);
});

test("(b) a save persists across reload and a second browser profile with the same identity pulls it from the cloud", async ({
  browser,
}) => {
  const save = blankSave();
  save.wallet.gold = 1234;
  save.playtimeSec = 600;
  save.progress.levels["ch1-l01"] = {
    cleared: true,
    stars: [true, true, false],
    bestTicks: 777,
    attempts: 3,
  };
  save.progress.starChestsClaimed = { "1": [10, 20] };

  const ctxA = await browser.newContext();
  const A = await ctxA.newPage();
  await A.goto(URL);
  await ready(A);
  const synced = await A.evaluate(async (s) => {
    const n = (window as W).__net;
    await n.sync.setLocal(s);
    return n.sync.sync();
  }, save as never);
  expect(synced.status).toBe("synced");
  expect(synced.revision).toBe(1);

  // reload: the local save and the identity come back from IndexedDB; no re-registration needed
  await A.reload();
  await ready(A);
  const local = await A.evaluate(() => (window as W).__net.sync.getLocal());
  expect(local.wallet.gold).toBe(1234);
  expect(local.progress.starChestsClaimed).toEqual({ "1": [10, 20] });
  await expect(A.locator("#t-save")).toContainText("gold 1234");
  const idA = await A.evaluate(() => (window as W).__net.auth.exportIdentity());
  expect(idA.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // a different browser profile (fresh storage) that copies the device identity
  const ctxB = await browser.newContext();
  const B = await ctxB.newPage();
  await B.goto(URL);
  await ready(B);
  expect(await B.evaluate(() => (window as W).__net.sync.getLocal())).toBeNull(); // its own, empty account
  await B.evaluate(async (id) => {
    const n = (window as W).__net;
    await n.sync.sync(); // settle the boot-time sync first
    await n.auth.importIdentity(id);
  }, idA);
  const pulled = await B.evaluate(() => (window as W).__net.sync.sync());
  expect(pulled.status).toBe("synced");
  const got = await B.evaluate(() => (window as W).__net.sync.getLocal());
  expect(got.wallet.gold).toBe(1234);
  expect(got.progress.levels["ch1-l01"].bestTicks).toBe(777);
  expect(got.progress.starChestsClaimed).toEqual({ "1": [10, 20] });
  // ...and it survives B's own reload (local-first from IndexedDB)
  await B.reload();
  await ready(B);
  await expect(B.locator("#t-save")).toContainText("gold 1234");

  // B edits (claims a chest); A merges it in: no claimed chest is ever lost
  await B.evaluate(async () => {
    const n = (window as W).__net;
    const s = await n.sync.getLocal();
    s.progress.starChestsClaimed["1"].push(30);
    s.playtimeSec += 60;
    await n.sync.setLocal(s);
    await n.sync.sync();
  });
  await A.evaluate(() => (window as W).__net.sync.sync());
  const merged = await A.evaluate(() => (window as W).__net.sync.getLocal());
  expect(merged.progress.starChestsClaimed["1"].sort()).toEqual([10, 20, 30]);
  await ctxA.close();
  await ctxB.close();
});

test("(c) a forged claim from the page is rejected by the Worker and the 422 is surfaced in the UI", async ({
  page,
}) => {
  // tamper with the outgoing /runs/submit body: inflate the claimed WPM
  let forged = false;
  await page.route("**/runs/submit", async (route) => {
    const post = JSON.parse(route.request().postData() ?? "{}");
    post.claimed.wpmX100 += 5000;
    forged = true;
    await route.continue({ postData: JSON.stringify(post) });
  });
  await page.goto(URL);
  await ready(page);
  await typeTrial(page, 3);
  await page.keyboard.press("Enter");
  await expect(phase(page)).toHaveAttribute("data-phase", "submitted", { timeout: 20_000 });
  expect(forged).toBe(true);

  const msg = page.locator("#t-msg");
  await expect(msg).toContainText("Rejected");
  await expect(msg).toContainText("resim_mismatch");
  await expect(msg).toHaveAttribute("data-kind", "bad");
  const outcome = await page.evaluate(() => {
    const o = (window as W).__trial.outcome;
    return o.ok
      ? { ok: true }
      : { ok: false, code: o.error.code, status: o.error.status, needsNewTicket: o.needsNewTicket };
  });
  expect(outcome).toEqual({ ok: false, code: "resim_mismatch", status: 422, needsNewTicket: true });

  // nothing reached the leaderboard
  const lb = await page.evaluate(() => (window as W).__net.trials.leaderboard());
  expect(lb.me).toBeNull();
  await expect(page.locator("#lb-top")).toHaveCount(0);

  // the spent ticket is replaced: Enter starts a fresh run
  await page.unroute("**/runs/submit");
  await page.keyboard.press("Enter");
  await ready(page);
});
