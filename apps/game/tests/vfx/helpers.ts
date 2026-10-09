import type { Page } from "@playwright/test";

export const PORT = Number(process.env.PW_PORT ?? 5173);

/** Opens ?scene=typing-vfx paused and waits until the world and HUD are ready. */
export async function openTyping(page: Page, params: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = r.url();
    if (
      !u.startsWith(`http://localhost:${PORT}`) &&
      !u.startsWith("data:") &&
      !u.startsWith("blob:")
    )
      errors.push(`external request: ${u}`);
  });
  await page.goto(`/?scene=typing-vfx&pause=1&${params}`);
  await page.waitForFunction(() => window.__typingVfx?.ready === true, undefined, {
    timeout: 150000,
  });
  await page.waitForTimeout(120);
  return errors;
}
