import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import type { AppDebug } from "../../src/app/app";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const shot = (name: string): string => path.join(dir, "__shots__", `${name}.png`);

export interface Run {
  errors: string[];
}

/** Opens the real game (title screen). Fonts load, the local save is the IndexedDB of this browser context. */
export async function openApp(page: Page, query = "api=off&audio=0&dev=1"): Promise<Run> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    errors.push(String(e));
    console.log("PAGEERROR", String(e));
  });
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("http://localhost") && !u.startsWith("data:") && !u.startsWith("blob:"))
      errors.push(`external request: ${u}`);
  });
  await page.goto(`/?${query}`);
  await waitRoute(page, "title");
  return { errors };
}

export async function waitRoute(page: Page, route: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(
    (r) => {
      const a = window.__app;
      return a?.route() === r && document.querySelector("#app-ui .app-screen[data-ready]") !== null;
    },
    route,
    { timeout },
  );
}

export const route = (page: Page): Promise<string> =>
  page.evaluate(() => (window.__app as AppDebug).route());

/** Currently focused element's `data-key` / text, for focus assertions. */
export const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return "";
    return e.dataset.key ?? e.dataset.act ?? e.id ?? e.textContent?.trim() ?? e.tagName;
  });

/** Title: press a key, then Enter on Continue/Start -> map. */
export async function toMap(page: Page): Promise<void> {
  await page.keyboard.press("Space");
  await page.waitForSelector("#menu:not([hidden])");
  await page.keyboard.press("Enter");
  await waitRoute(page, "map");
}

export const save = (page: Page) => page.evaluate(() => (window.__app as AppDebug).store.save);

export async function settle(page: Page, ms = 450): Promise<void> {
  await page.waitForTimeout(ms);
}

export { expect };
