import { expect, test } from "@playwright/test";

test("page loads with both canvases and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.locator("canvas#gl")).toBeVisible();
  await expect(page.locator("canvas#hud")).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
