/**
 * T6.3 W4 probe: hide each visible scene mesh in turn at parry +N ms and report which ones carry the clipped pixels
 * in the 290x180 hero/contact box. BIOME=cave|forest, AT=140.
 *   PW_PORT=5321 BIOME=cave pnpm exec playwright test -c tests/vfx/playwright.metal.config.ts metal-w4-bisect
 */
import { test } from "@playwright/test";
import { openTyping } from "./helpers";

test.setTimeout(300_000);

test("parry bisect", async ({ page }) => {
  const biome = process.env.BIOME ?? "cave";
  await openTyping(page, `wpm=40&tier=3&guard=1&at=0&biome=${biome}`);
  await page.evaluate(
    (at) => window.__typingVfx?.stepToEvent("GuardParried", at),
    Number(process.env.AT ?? 140),
  );
  const measure = async (): Promise<number> => {
    await page.evaluate(() => window.__typingVfx?.redraw());
    const buf = await page.screenshot();
    return page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(155, 330, 290, 180).data;
      let clip = 0;
      for (let i = 0; i < d.length; i += 4)
        if (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0) >= 240)
          clip++;
      return clip / (d.length / 4);
    }, buf.toString("base64"));
  };
  const base = await measure();
  const n = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    const api = window.__typingVfx;
    if (!api) throw new Error("no typing vfx scene");
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    const w = (api.fx.worldFx as any).world;
    const ms: unknown[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: test-only scene walk
    w.scene.traverse((o: any) => {
      if (o.visible && (o.isMesh || o.isPoints)) ms.push(o);
    });
    // biome-ignore lint/suspicious/noExplicitAny: test-only global
    (window as any).__ms = ms;
    return ms.length;
  });
  const res: string[] = [`base ${base.toFixed(3)} meshes ${n}`];
  for (let i = 0; i < n; i++) {
    await page.evaluate((j) => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      ((window as any).__ms[j] as { visible: boolean }).visible = false;
    }, i);
    const m = await measure();
    const desc = await page.evaluate((j) => {
      // biome-ignore lint/suspicious/noExplicitAny: test-only global
      const o = (window as any).__ms[j];
      o.visible = true;
      return `kind${o.material?.uniforms?.uKind?.value} ord${o.renderOrder} ${o.material?.type} y${o.position.y.toFixed(1)} sc${o.scale.x.toFixed(1)}`;
    }, i);
    if (base - m > 0.004) res.push(`-${(base - m).toFixed(3)} ${desc}`);
  }
  console.log("W4 bisect", JSON.stringify(res));
});
