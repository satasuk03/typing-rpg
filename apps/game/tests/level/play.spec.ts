import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentBundle } from "@hd2d/content";
import { replay, resolveLevel } from "@hd2d/sim";
import { expect, type Page, test } from "@playwright/test";
import { makeRunConfig } from "../../src/level/config";
import type { PlayDebug } from "../../src/level/session";

const dir = path.dirname(fileURLToPath(import.meta.url));
const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);

interface Run {
  errors: string[];
}

async function open(page: Page, query: string): Promise<Run> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("http://localhost") && !u.startsWith("data:") && !u.startsWith("blob:"))
      errors.push(`external request: ${u}`);
  });
  await page.goto(`/?scene=play&${query}`);
  await page.waitForFunction(() => window.__play?.ready === true, undefined, { timeout: 30_000 });
  return { errors };
}

/** Poll in-page (every animation frame) until `cond` is true. */
async function until(
  page: Page,
  cond: (p: PlayDebug) => boolean,
  timeout: number,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (src) => {
        const p = window.__play;
        // biome-ignore lint/security/noGlobalEval: test-only predicate shipped as source
        return p ? globalThis.eval(`(${src})`)(p) : false;
      },
      cond.toString(),
      { timeout, polling: "raf" },
    );
    return true;
  } catch {
    return false;
  }
}

async function finish(page: Page, timeout: number): Promise<void> {
  await page.waitForFunction(() => window.__play?.resultsShown() === true, undefined, {
    timeout,
    polling: 500,
  });
}

test.describe("level runner in the browser", () => {
  test("L1 at 60 WPM: bot plays to completion, results screen, replay hash matches", async ({
    page,
  }) => {
    const run = await open(page, "level=ch1-l01&wpm-bot=60&bot-seed=11");

    // walk
    const sawWalk = await until(
      page,
      (p) => p.view().phase === "walk" && p.view().tick > 90,
      20_000,
    );
    if (sawWalk) await page.screenshot({ path: shot("l1-walk") });
    else console.log("walk phase not observed (slow start under load)");

    // battle with plates (some letters already typed)
    expect(
      await until(
        page,
        (p) => {
          const v = p.view();
          return v.phase === "combat" && v.plates.length >= 2 && v.tick > 0;
        },
        60_000,
      ),
    ).toBe(true);
    await page.screenshot({ path: shot("l1-battle") });

    // a guard word
    const sawGuard = await until(
      page,
      (p) => p.view().plates.some((pl) => pl.kind === "guard"),
      120_000,
    );
    if (sawGuard) await page.screenshot({ path: shot("l1-guard") });

    await finish(page, 360_000);

    const info = await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      return {
        title: document.querySelector("#r-title")?.textContent,
        stars: document.querySelectorAll("#r-stars .on").length,
        time: document.querySelector("#r-time")?.textContent,
        wpm: document.querySelector("#r-wpm")?.textContent,
        acc: document.querySelector("#r-acc")?.textContent,
        gold: document.querySelector("#r-gold")?.textContent,
        hash: p.hash(),
        log: p.log(),
        cfg: p.config(),
        result: p.result(),
        seen: p.seen(),
        errors: p.consoleErrors,
      };
    });
    await page.screenshot({ path: shot("l1-results") });

    expect(info.title).toBe("LEVEL CLEAR");
    expect(info.result?.outcome).toBe("cleared");
    expect(info.stars).toBeGreaterThanOrEqual(1);
    expect(run.errors, run.errors.join("\n")).toEqual([]);
    expect(info.errors).toEqual([]);

    // Determinism: the browser's logged inputs, replayed in Node, reproduce the live final state hash.
    const cfg = makeRunConfig({ levelId: "ch1-l01", pace: info.cfg.pace, seed: info.cfg.seed });
    const def = resolveLevel(contentBundle, "ch1-l01", { dueWeakWords: [] });
    const rep = replay(
      def,
      cfg.loadout,
      info.cfg.seed,
      cfg.options,
      info.log.map((l) => l.input),
    );
    console.log(
      `L1 results: ${info.title} ${info.time} ${info.wpm} ${info.acc} gold=${info.gold} stars=${info.stars}; ` +
        `inputs=${info.log.length} browserHash=${info.hash} nodeHash=${rep.hash}`,
    );
    expect(rep.hash).toBe(info.hash);
    expect(rep.result?.outcome).toBe("cleared");
  });

  test("walk segment screenshot (no bot)", async ({ page }) => {
    const run = await open(page, "level=ch1-l01");
    expect(await until(page, (p) => p.view().phase === "walk" && p.view().tick > 100, 30_000)).toBe(
      true,
    );
    await page.screenshot({ path: shot("l1-walk") });
    expect(run.errors, run.errors.join("\n")).toEqual([]);
  });

  test("L5 at 60 WPM: clears with zero console errors", async ({ page }) => {
    const run = await open(page, "level=ch1-l05&wpm-bot=60&bot-seed=3");
    const sawBreak = await until(page, (p) => (p.seen().Break ?? 0) > 0, 240_000);
    if (sawBreak) await page.screenshot({ path: shot("l5-break") });
    await finish(page, 480_000);
    const res = await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      const r = p.result();
      return {
        outcome: r?.outcome,
        title: document.querySelector("#r-title")?.textContent,
        time: document.querySelector("#r-time")?.textContent,
        crit: p.seen().AutoAttack,
        errors: p.consoleErrors,
      };
    });
    console.log(`L5 results: ${JSON.stringify(res)}`);
    expect(res.outcome).toBe("cleared");
    expect(run.errors, run.errors.join("\n")).toEqual([]);
    expect(res.errors).toEqual([]);
  });

  test("L10 at 75 WPM: boss intro, Doom Spell, rubble, finisher", async ({ page }) => {
    const run = await open(page, "level=ch1-l10&wpm-bot=75&bot-acc=0.97&bot-seed=21");
    const t0 = Date.now();
    const reached: string[] = [];
    const mark = async (
      name: string,
      cond: (p: PlayDebug) => boolean,
      ms: number,
      file?: string,
    ) => {
      const ok = await until(page, cond, ms);
      if (ok) {
        reached.push(`${name}@${Math.round((Date.now() - t0) / 1000)}s`);
        if (file) await page.screenshot({ path: shot(file) });
      }
      return ok;
    };
    await mark("bossIntro", (p) => p.view().phase === "bossIntro", 300_000, "l10-boss-intro");
    await mark("doom", (p) => p.view().doom !== null, 240_000, "l10-doom");
    await mark(
      "rubble",
      (p) => p.view().minigame !== null && p.view().plates.some((pl) => pl.kind === "minigame"),
      240_000,
      "l10-rubble",
    );
    await mark("finisher", (p) => p.view().plates.some((pl) => pl.kind === "finisher"), 240_000);
    let done = true;
    try {
      await finish(page, 240_000);
    } catch {
      done = false;
    }
    const res = await page.evaluate(() => {
      const p = window.__play as PlayDebug;
      return {
        outcome: p.result()?.outcome ?? null,
        reason: p.result()?.failReason ?? null,
        phase: p.phase(),
        tick: p.view().tick,
        errors: p.consoleErrors,
      };
    });
    if (done) await page.screenshot({ path: shot("l10-results") });
    console.log(
      `L10: reached ${reached.join(", ")}; end=${JSON.stringify(res)}; elapsed=${Math.round((Date.now() - t0) / 1000)}s`,
    );
    expect(run.errors, run.errors.join("\n")).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(reached).toContain(reached.find((r) => r.startsWith("bossIntro")));
  });
});
