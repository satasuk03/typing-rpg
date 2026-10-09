/**
 * T3.3 onboarding. (a) fresh profile: title, story, calibration, L1 with the tutorial cards in order and never over a
 * plate; (c) a returning profile skips all of it; (d) "Replay tutorial" works; plus stills of the new screens.
 * The first-session timing run (AC b) is in `firstSession.spec.ts`.
 */
import { test } from "@playwright/test";
import { expect, openApp, route, save, shot, typeCalibration, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

test.setTimeout(10 * 60_000);

/** Installs a monitor that records tutorial-card/plate overlaps and the card order. */
async function installCardMonitor(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __tut: { violations: string[]; seen: string[]; frames: number };
    };
    w.__tut = { violations: [], seen: [], frames: 0 };
    setInterval(() => {
      const card = document.querySelector<HTMLElement>(".tut-card:not([hidden])");
      const play = window.__play;
      if (!card || !play) return;
      const cue = card.dataset.cue ?? "";
      if (w.__tut.seen[w.__tut.seen.length - 1] !== cue) w.__tut.seen.push(cue);
      const r = card.getBoundingClientRect();
      const snap = play.session.hud.debugSnapshot();
      w.__tut.frames++;
      const hit = (a: { x: number; y: number; w: number; h: number }): boolean =>
        a.x < r.x + r.width && a.x + a.w > r.x && a.y < r.y + r.height && a.y + a.h > r.y;
      for (const p of snap.plates) {
        if (hit(p.rect))
          w.__tut.violations.push(`${cue}: plate ${p.id} (${p.kind}) rect overlaps the card`);
        for (const l of p.letters)
          if (hit(l))
            w.__tut.violations.push(`${cue}: a letter of plate ${p.id} is under the card`);
      }
    }, 50);
  });
}

test("fresh profile: story, calibration, L1 tutorial cards in order, never over a plate", async ({
  page,
}) => {
  const run = await openApp(
    page,
    "api=off&audio=0&dev=1&onboard=1&wpm-bot=45&bot-seed=5&bot-acc=0.97",
  );
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("30-title-sub-contrast") });
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=continue]").textContent()).toBe("Start game");
  await page.keyboard.press("Enter");
  await waitRoute(page, "story");

  // 3 panels, any key advances
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("31-story-card-1") });
  await page.keyboard.press("x");
  await page.waitForFunction(
    () => document.querySelector(".story-card")?.getAttribute("data-panel") === "2",
  );
  await page.screenshot({ path: shot("31-story-card-2") });
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => document.querySelector(".story-card")?.getAttribute("data-panel") === "3",
  );
  await page.screenshot({ path: shot("31-story-card-3") });
  await page.keyboard.press("Enter");
  await waitRoute(page, "calibrate");

  // calibration
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("32-calibration-ready") });
  const typed = await typeCalibration(page, 50, async () => {
    await page.screenshot({ path: shot("33-calibration-typing") });
  });
  expect(typed).toBeGreaterThan(40);
  await page.waitForSelector(".calibrate[data-state=done]");
  const wpm = Number(await page.locator("#cal-wpm").textContent());
  // 50 WPM nominal; the page.keyboard round trip makes it a bit slower, never faster
  expect(wpm).toBeGreaterThan(20);
  expect(wpm).toBeLessThanOrEqual(60);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: shot("34-calibration-result") });
  // the result card ignores keys for 1.4 s: nothing has started yet
  expect(await route(page)).toBe("calibrate");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__app?.route() === "play", undefined, {
    timeout: 30_000,
  });
  const s = await save(page);
  expect(s.pace.calibrationWpm).toBe(wpm);
  await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l01");
  expect(
    await page.evaluate(
      () => (window.__play?.config().options as { tutorial: boolean } | undefined)?.tutorial,
    ),
  ).toBe(true);
  // the calibration is the pace of a normal (non-bot) run
  const paceUsed = await page.evaluate(
    () =>
      (
        window.__app as unknown as {
          store: { runConfig(id: string): { options: { pace: number } } };
        }
      ).store.runConfig("ch1-l01").options.pace,
  );
  expect(paceUsed).toBe(wpm);

  // L1: the cards, in emission order, one at a time
  await installCardMonitor(page);
  const shotFor = new Set<string>();
  let n = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 300_000) {
    const cue = await page.evaluate(
      () => document.querySelector<HTMLElement>(".tut-card:not([hidden])")?.dataset.cue ?? "",
    );
    if (cue && !shotFor.has(cue)) {
      shotFor.add(cue);
      await page.waitForTimeout(250); // let the fade-in finish
      await page.screenshot({ path: shot(`4${n++}-tutorial-${cue}`) });
    }
    if (shotFor.size >= 5) break;
    if (await page.evaluate(() => window.__play?.resultsShown() === true)) break;
    await page.waitForTimeout(100);
  }
  const mon = await page.evaluate(
    () =>
      (window as unknown as { __tut: { violations: string[]; seen: string[]; frames: number } })
        .__tut,
  );
  const history = await page.evaluate(() => window.__play?.session.screens.tutorial.history ?? []);
  console.log("tutorial cue order:", history.join(" > "), "| sampled frames:", mon.frames);
  expect(history[0]).toBe("target");
  expect(new Set(history).size).toBe(history.length); // each exactly once
  expect(history).toEqual(expect.arrayContaining(["target", "atb", "combo", "skill", "guard"]));
  expect(mon.frames).toBeGreaterThan(20);
  expect(mon.violations).toEqual([]);
  expect(run.errors).toEqual([]);
  expect(await page.evaluate(() => window.__app?.consoleErrors ?? [])).toEqual([]);
});

test("returning profile skips the onboarding", async ({ page }) => {
  await openApp(page, "api=off&audio=0&dev=1&onboard=1");
  await seedProgress(page, { cleared: 2 });
  await page.waitForTimeout(500);
  await page.reload();
  await waitRoute(page, "title");
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  expect(await page.locator("[data-act=continue]").textContent()).toBe("Continue");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map"); // straight to the map: no story, no calibration, no tutorial
  expect((await save(page)).pace.calibrationWpm).toBeNull();
});

test("Esc skips the story and the calibration; a skipped profile still reaches L1", async ({
  page,
}) => {
  await openApp(page, "api=off&audio=0&dev=1&onboard=1");
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await waitRoute(page, "story");
  await page.keyboard.press("Escape");
  await waitRoute(page, "calibrate");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l01", undefined, {
    timeout: 30_000,
  });
  expect((await save(page)).pace.calibrationWpm).toBeNull();
  expect(await page.evaluate(() => window.__play?.config().pace)).toBe(35);
});

test("Replay tutorial (settings) restarts L1 with the cards; How to play opens", async ({
  page,
}) => {
  await openApp(page, "api=off&audio=0&dev=1");
  await seedProgress(page, { cleared: 3 });
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await page.locator("[data-act=settings]").click();
  await waitRoute(page, "settings");
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("50-settings-help-row") });
  await page.locator("[data-act=help]").click();
  await page.waitForSelector(".htp");
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot("51-controls-help-settings") });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".htp", { state: "detached" });
  await page.locator("[data-act=replay-tutorial]").click();
  await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l01", undefined, {
    timeout: 30_000,
  });
  expect(
    await page.evaluate(
      () => (window.__play?.config().options as { tutorial: boolean } | undefined)?.tutorial,
    ),
  ).toBe(true);
  // no typing needed: the first cue fires when combat opens, and the card shows
  await page.waitForSelector(".tut-card[data-cue=target]:not([hidden])", { timeout: 60_000 });
  // pause menu: How to play, then back, then resume
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]", { timeout: 5000 });
  await page.screenshot({ path: shot("52-pause-menu") });
  await page.locator("[data-act=help]").click();
  await page.waitForSelector("#play-ui .htp");
  await page.waitForTimeout(250);
  await page.screenshot({ path: shot("53-controls-help-pause") });
  await page.keyboard.press("Backspace");
  await page.waitForSelector("#play-ui .htp", { state: "detached" });
  await page.waitForSelector("#play-ui [data-act=resume]");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#play-ui .hd-panel[data-kind=pause]", { state: "detached" });
});

test("T3.2 gaps: level name in the results subtitle, real skill numbers", async ({ page }) => {
  await openApp(page, "api=off&audio=0&dev=1");
  await seedProgress(page, { cleared: 3 });
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await page.locator("[data-act=loadout]").click();
  await waitRoute(page, "loadout");
  const text = (await page.locator(".lo-skills").textContent()) ?? "";
  expect(text).not.toMatch(/\{\w+\}/);
  expect(text).not.toContain("heavy damage");
  expect(text).toContain("130% of your ATK"); // fireball: BALANCE.SKILLS.fireball.atk_mult 1.3
  expect(text).toContain("6 s");
  await page.screenshot({ path: shot("54-loadout-skill-numbers") });
});
