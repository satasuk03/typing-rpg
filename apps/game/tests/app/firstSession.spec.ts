/**
 * AC (b): the first-session timing run. A beginner-ish 30 WPM typist goes from a fresh profile to *starting* L1-3:
 * title, story skip, calibration (typed for real at 30 WPM), L1, results, map, L2, results, map, L3 start.
 * Levels run in real time with the browser bot at 30 WPM. Target: under 10 minutes.
 */
import { test } from "@playwright/test";
import { expect, openApp, save, typeCalibration, waitRoute } from "./helpers";

test.setTimeout(25 * 60_000);

const WPM = 30;

test("first session: fresh profile to the start of L1-3 in under 10 minutes (30 WPM)", async ({
  page,
}) => {
  const marks: [string, number][] = [];
  const t0 = Date.now();
  const mark = (name: string): void => {
    marks.push([name, (Date.now() - t0) / 1000]);
  };
  const run = await openApp(
    page,
    `api=off&audio=0&dev=1&onboard=1&wpm-bot=${WPM}&bot-seed=11&bot-acc=0.95`,
  );
  mark("title ready");
  await page.keyboard.press("Space"); // press any key
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter"); // Start game
  await waitRoute(page, "story");
  await page.keyboard.press("Escape"); // skip the story card (a reader would take about 10 s for the 3 panels)
  await waitRoute(page, "calibrate");
  mark("story skipped");
  await typeCalibration(page, WPM);
  await page.waitForSelector(".calibrate[data-state=done]");
  const calWpm = Number(await page.locator("#cal-wpm").textContent());
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  mark(`calibration done (${calWpm} WPM)`);

  let started3 = false;
  for (const id of ["ch1-l01", "ch1-l02"]) {
    await page.waitForFunction((lv) => window.__play?.config().levelId === lv, id, {
      timeout: 60_000,
    });
    mark(`${id} started`);
    let cleared = false;
    for (let attempt = 0; attempt < 3 && !cleared; attempt++) {
      await page.waitForFunction(
        (lv) => window.__play?.config().levelId === lv && window.__play.resultsShown(),
        id,
        {
          timeout: 600_000,
          polling: 500,
        },
      );
      const title = await page.locator("#r-title").textContent();
      if (id === "ch1-l01" && attempt === 0) {
        // T3.2 gap: the subtitle is the level name, not the raw id
        expect(await page.locator("#play-ui .panel .hd-sub").first().textContent()).toBe(
          "Level 1 · Sunlit Glade",
        );
      }
      if (title === "LEVEL CLEAR") {
        cleared = true;
        mark(`${id} cleared`);
        await page.keyboard.press("Enter");
      } else {
        mark(`${id} FAILED (retry)`);
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => window.__play?.resultsShown() === false, undefined, {
          timeout: 20_000,
        });
      }
    }
    expect(cleared, `${id} cleared`).toBe(true);
    await waitRoute(page, "map");
    await page.waitForFunction(
      (want) => document.activeElement?.getAttribute("data-id") === want,
      id === "ch1-l01" ? "ch1-l02" : "ch1-l03",
      {
        timeout: 20_000,
      },
    );
    await page.keyboard.press("Enter"); // the map focuses the next open level
    if (id === "ch1-l02") {
      await page.waitForFunction(() => window.__play?.config().levelId === "ch1-l03", undefined, {
        timeout: 60_000,
      });
      mark("ch1-l03 started");
      started3 = true;
    }
  }
  expect(started3).toBe(true);
  const total = (Date.now() - t0) / 1000;
  console.log(
    `FIRST SESSION (30 WPM bot) to the start of L1-3: ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} (${total.toFixed(0)} s)`,
  );
  for (const [n, t] of marks) console.log(`  ${t.toFixed(0).padStart(4)} s  ${n}`);
  expect(total).toBeLessThan(10 * 60);
  const s = await save(page);
  expect(s.progress.levels["ch1-l01"]?.cleared).toBe(true);
  expect(s.progress.levels["ch1-l02"]?.cleared).toBe(true);
  expect(run.errors).toEqual([]);
});
