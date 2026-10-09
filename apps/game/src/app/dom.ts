/** Small DOM helpers shared by the screens. */
import type { Rarity } from "@hd2d/content";
import { RARITY_INFO } from "@hd2d/content";
import type { App } from "./app";

export const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => {
    const m: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return m[c] ?? c;
  });

export function el(cls: string, html = "", tag = "div"): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

/** One click listener that dispatches on the closest `[data-act]`. Enter/Space on buttons already click natively. */
export function actions(
  root: HTMLElement,
  map: Record<string, (target: HTMLElement) => void>,
): void {
  root.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t || !root.contains(t)) return;
    if (t.getAttribute("aria-disabled") === "true") return;
    map[t.dataset.act ?? ""]?.(t);
  });
}

export const pct = (bp: number): string => `${(bp / 100).toFixed(2)}%`;

export const rarityName = (r: Rarity): string => RARITY_INFO[r].name;
export const rarityColor = (r: Rarity): string => RARITY_INFO[r].color;
export const rarityChip = (r: Rarity): string =>
  `<span class="hd-chip" style="color:${RARITY_INFO[r].color}">${RARITY_INFO[r].name}</span>`;

export const fmt = (n: number): string => n.toLocaleString("en-US");
export const stat = (n: number): string => String(Math.round(n));

/** The persistent resource strip (gold, stars, unopened caches) shown on every hub screen. */
export function resourceBar(app: App): HTMLElement {
  const bar = el("app-res");
  const draw = (): void => {
    const s = app.store.save;
    let stars = 0;
    for (const l of Object.values(s.progress.levels)) stars += l.stars.filter(Boolean).length;
    bar.innerHTML = `<span class="hd-coin" data-k="gold" title="Gold">${fmt(s.wallet.gold)}</span>
      <span class="app-res-i" data-k="stars"><span class="hd-star on"></span> ${stars}</span>
      <span class="app-res-i" data-k="caches">Caches <b>${s.inventory.unopenedCaches}</b></span>`;
  };
  draw();
  app.track(app.store.onChange(draw));
  return bar;
}

export function header(app: App, eyebrow: string, title: string, hint = "Esc Back"): HTMLElement {
  const h = el("app-head");
  h.innerHTML = `<div><div class="hd-eyebrow">${esc(eyebrow)}</div><h1 class="hd-title sm">${esc(title)}</h1></div>
    <div class="app-head-r"></div><span class="app-hint">${hint}</span>`;
  h.querySelector(".app-head-r")?.append(resourceBar(app));
  return h;
}
