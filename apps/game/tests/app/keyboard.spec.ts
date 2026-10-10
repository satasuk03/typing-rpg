/**
 * AC (b): every screen is reachable and operable with the keyboard alone. Only keyboard events are sent after load
 * (no clicks, no mouse). Asserts that focus moves, Enter activates, Escape goes back, and the focus ring is visible.
 */
import { test } from "@playwright/test";
import { expect, focused, openApp, route, toMap, waitRoute } from "./helpers";
import { seedProgress } from "./seed";

const ringVisible = (page: import("@playwright/test").Page): Promise<boolean> =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return false;
    const cs = getComputedStyle(e.querySelector(".gem") ?? e);
    return cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && cs.outlineWidth !== "0px");
  });

test("title, map and every hub screen with the keyboard only", async ({ page }) => {
  const run = await openApp(page);
  await seedProgress(page, { cleared: 3, caches: 2 });
  await page.waitForTimeout(300);
  await page.reload();
  await waitRoute(page, "title");

  // ---- title: any key, then the menu
  await page.keyboard.press("x");
  await page.waitForSelector("#menu:not([hidden])");
  await expect.poll(() => focused(page)).toBe("continue");
  expect(await ringVisible(page)).toBe(true);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("new");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("trial");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("settings");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => focused(page)).toBe("continue");

  // settings from the title, Escape returns to the title
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await waitRoute(page, "settings");
  await page.keyboard.press("Escape");
  await waitRoute(page, "title");
  await page.keyboard.press("x");
  await page.waitForSelector("#menu:not([hidden])");

  // "new game" asks first: Escape cancels and nothing is erased
  await page.keyboard.press("ArrowDown"); // from continue -> new
  await page.keyboard.press("Enter");
  await page.waitForSelector(".app-confirm");
  await expect.poll(() => focused(page)).toBe("cancel");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".app-confirm", { state: "detached" });
  await expect.poll(() => focused(page)).toBe("new");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");

  // ---- map: walk the road with Left/Right, drop to the hub menu with Down
  const nodeId = (): Promise<string> =>
    page.evaluate(() => document.activeElement?.getAttribute("data-id") ?? "");
  await expect.poll(nodeId).toBe("ch1-l04"); // first open level
  await page.keyboard.press("ArrowLeft");
  await expect.poll(nodeId).toBe("ch1-l03");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(nodeId).toBe("ch1-l05"); // locked, still focusable
  await page.keyboard.press("Enter"); // locked: stays on the map
  expect(await route(page)).toBe("map");
  expect(await ringVisible(page)).toBe(true);
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-act"))).toBe(
    "loadout",
  );
  await page.keyboard.press("ArrowUp");
  await expect.poll(nodeId).toBe("ch1-l05");
  await page.keyboard.press("ArrowDown");

  // ---- loadout: pick an active skill with the keyboard
  await page.keyboard.press("Enter");
  await waitRoute(page, "loadout");
  await expect.poll(() => focused(page)).toBe("g-weapon");
  await page.keyboard.press("ArrowRight");
  const f1 = await focused(page);
  expect(f1).toMatch(/^(a|m|p)-/);
  await page.locator('[data-key="a-0"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".app-pick");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // choose the 2nd option (an unlocked skill)
  await page.waitForSelector(".app-pick", { state: "detached" });
  expect(await page.evaluate(() => window.__app?.store.save.loadout.actives[0])).not.toBeNull();
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  // ---- the other hub screens: Down to the menu, Right along it, Enter, Escape back
  const hub = async (act: string, screen: string): Promise<void> => {
    await page.locator(`#menu [data-act=${act}]`).focus();
    await page.keyboard.press("Enter");
    await waitRoute(page, screen);
  };

  await hub("inventory", "inventory");
  await expect.poll(() => focused(page)).not.toBe("");
  const before = await focused(page);
  await page.keyboard.press("ArrowDown");
  const after = await focused(page);
  expect(after).not.toBe(before);
  await page.keyboard.press("ArrowRight"); // into the detail actions
  expect(await page.evaluate(() => !!document.activeElement?.closest("#detail"))).toBe(true);
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  await hub("shop", "shop");
  await expect.poll(() => focused(page)).toMatch(/^b-weapon-C/);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("b-weapon-U");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focused(page)).toMatch(/^b-armor/);
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  await hub("cache", "cache");
  await expect.poll(() => focused(page)).toBe("open");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focused(page)).toBe("odds");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#odds-dialog");
  // focus is trapped in the dialog; Escape closes it and returns focus to Odds
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("#odds-dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#odds-dialog", { state: "detached" });
  await expect.poll(() => focused(page)).toBe("odds");
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  await hub("journal", "journal");
  await expect.poll(() => focused(page)).not.toBe("");
  const w1 = await focused(page);
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).not.toBe(w1);
  await page.keyboard.press("Enter"); // select -> translation field
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("jr-tr");
  await page.keyboard.type("hola");
  await page.keyboard.press("Escape"); // leaves the text field first
  expect(await route(page)).toBe("journal");
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  await hub("settings", "settings");
  await page.locator('[data-key="sw-reducedFlash"]').focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__app?.store.save.settings.reducedFlash)).toBe(true);
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.__app?.store.save.settings.reducedFlash)).toBe(false);
  await page.locator("#fx-range").focus();
  await page.keyboard.press("ArrowLeft"); // sliders keep Left/Right
  expect(
    await page.evaluate(() => window.__app?.store.save.settings.effectsIntensity),
  ).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");

  // trial entry navigates to the trial scene
  await page.locator("#menu [data-act=trial]").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/scene=trial/);
  expect(page.url()).toContain("from=app");

  expect(run.errors.filter((e) => !/Failed to load resource|ERR_/.test(e))).toEqual([]);
});

test("Escape on the map returns to the title", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
  await page.keyboard.press("Escape");
  await waitRoute(page, "title");
});

test("Q2: Willow loadout hint is keyboard-operable, skippable and shows once per run start", async ({
  page,
}) => {
  await openApp(page);
  await seedProgress(page, { cleared: 3, caches: 0 });
  await page.evaluate(() => {
    const dev = (window as unknown as { __dev: { mutate(fn: (s: never) => void): void } }).__dev;
    dev.mutate(((s: { loadout: { actives: (string | null)[] } }) => {
      s.loadout.actives = ["fireball", null];
    }) as never);
  });
  await toMap(page);
  const play = (): Promise<void> =>
    page.evaluate(() => {
      void (
        window as unknown as { __app: { app: { play(id: string): Promise<void> } } }
      ).__app.app.play("ch2-l10");
    });
  await play();
  await page.waitForSelector(".willow-hint");
  await expect.poll(() => focused(page)).toBe("hint-play");
  // keyboard: move to "Open loadout" and confirm -> the loadout screen, no run started
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focused(page)).toBe("hint-loadout");
  await page.keyboard.press("Enter");
  await waitRoute(page, "loadout");
  expect(await page.locator(".willow-hint").count()).toBe(0);
  // Esc on the hint skips it and starts the level; the hint does not come back within that run start
  await page.keyboard.press("Escape");
  await waitRoute(page, "map");
  await play();
  await page.waitForSelector(".willow-hint");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => (window as unknown as { __app: { route(): string } }).__app.route() === "play",
    undefined,
    { timeout: 60_000 },
  );
  expect(await page.locator(".willow-hint").count()).toBe(0);
});
