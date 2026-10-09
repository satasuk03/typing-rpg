/**
 * Shop: the deterministic fallback (`shopOffer`: pick slot + rarity, known premium price) and Gear Caches for gold.
 * Epic and Legendary gear are not sold: they come only from Gear Caches (fixed, published odds).
 */
import { RARITY_INFO, type WeaponArchetype } from "@hd2d/content";
import {
  buyShopGear,
  defForRoll,
  equippedArchetype,
  heroStatsOf,
  instanceOf,
  offerFor,
} from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc, fmt, header, stat } from "../dom";
import { iconHtml } from "../icons";
import { openOddsDialog } from "./odds";

const SLOTS = ["weapon", "armor", "charm"] as const;
const RARS = ["C", "U", "R"] as const;
const ARCH: WeaponArchetype[] = ["sword", "dagger", "staff", "hammer"];

export function shopScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen shop");
  root.append(header(app, "Merchant", "Shop"));
  const body = el("shop-body");
  root.append(body);
  let arch: WeaponArchetype = equippedArchetype(app.store.save, app.bundle);
  let keep: string | null = null;

  const draw = (): void => {
    const s = app.store.save;
    const cur = heroStatsOf(s, app.bundle);
    const cols = SLOTS.map((slot) => {
      const eq = instanceOf(s, s.equipped[slot]);
      const cards = RARS.map((r) => {
        const o = offerFor(s, slot, r);
        const def = defForRoll(
          { slot, tier: o.tier, rarity: r, archetype: slot === "weapon" ? arch : null },
          app.bundle,
        );
        // stats of the piece after the purchase (ignoring gold so the preview is always shown)
        const after = buyShopGear({ ...s, wallet: { gold: 1e12 } }, slot, r, arch, 0, app.bundle);
        const hs = after ? heroStatsOf(after, app.bundle) : cur;
        const can = s.wallet.gold >= o.price;
        const better = after ? hs.atk + hs.maxHp > cur.atk + cur.maxHp : false;
        return `<div class="shop-card" data-r="${r}">
          ${iconHtml(def.spriteId, { rarity: r, level: o.startUpgrade, alt: def.name })}
          <div class="grow"><div class="nm">${esc(def.name)}</div>
            <div style="color:${RARITY_INFO[r].color}">${RARITY_INFO[r].name} <span class="hd-dim">&middot; T${o.tier} &middot; starts +${o.startUpgrade}${eq ? ` (from +${eq.upgrade})` : ""}</span></div>
            <div class="hd-dim">ATK ${stat(hs.atk)} &middot; HP ${stat(hs.maxHp)} ${better ? `<span class="hd-good">better</span>` : `<span class="hd-dim">no gain</span>`}</div></div>
          <button class="hd-btn sm${can ? "" : ""}" data-act="buy" data-slot="${slot}" data-r="${r}" data-key="b-${slot}-${r}" aria-disabled="${!can}"
            aria-label="Buy ${esc(def.name)} for ${o.price} gold${can ? "" : ", not enough gold"}"><span class="hd-coin">${fmt(o.price)}</span></button></div>`;
      }).join("");
      const archSel =
        slot === "weapon"
          ? `<div class="hd-seg shop-arch" role="group" aria-label="Weapon type">${ARCH.map((a) => `<button class="hd-btn sm" data-act="arch" data-a="${a}" data-key="a-${a}" aria-pressed="${a === arch}">${a}</button>`).join("")}</div>`
          : "";
      return `<section class="hd-panel flat shop-col"><h2 class="hd-h">${slot}</h2>${archSel}<div class="shop-cards">${cards}</div></section>`;
    }).join("");
    const price = app.store.save.wallet.gold;
    const cp = cachePriceOf();
    body.innerHTML = `<div class="shop-cols">${cols}</div>
      <section class="hd-panel flat shop-cache">
        ${iconHtml("cache", { rarity: "R", size: "lg", alt: "Gear Cache" })}
        <div class="grow"><h2 class="hd-h" style="margin:0">Gear Cache</h2>
          <div class="hd-dim">One random piece of gear. Fixed odds, published, with pity: Rare+ within 8 opens, Epic+ within 30, Legendary within 120.</div>
          <div class="hd-dim">You own <b id="owned">${s.inventory.unopenedCaches}</b> unopened.</div></div>
        <button class="hd-btn primary" data-act="buycache" data-key="buycache" aria-disabled="${price < cp}"><span class="hd-coin">${fmt(cp)}</span></button>
        <button class="hd-btn" data-act="odds" data-key="odds">Odds</button>
        <button class="hd-btn" data-act="opencache" data-key="opencache">Open caches</button>
      </section>
      <p class="hd-dim shop-note">Epic and Legendary gear come only from Gear Caches. Shop pieces replace the one you wear with Upgrade Transfer (half your levels carry over).</p>`;
    if (keep) {
      (body.querySelector(`[data-key="${keep}"]`) as HTMLElement | null)?.focus();
      keep = null;
    }
  };
  const cachePriceOf = (): number => app.store.cachePrice();
  draw();
  app.track(app.store.onChange(() => draw()));

  actions(root, {
    arch: (t) => {
      arch = t.dataset.a as WeaponArchetype;
      keep = `a-${arch}`;
      draw();
    },
    buy: (t) => {
      const slot = t.dataset.slot as (typeof SLOTS)[number];
      const r = t.dataset.r as (typeof RARS)[number];
      const o = offerFor(app.store.save, slot, r);
      keep = `b-${slot}-${r}`;
      if (app.store.save.wallet.gold < o.price) {
        app.sfx("typo");
        app.toast(`Not enough gold (${fmt(o.price)} needed)`);
        return;
      }
      if (app.store.buyShop(slot, r, slot === "weapon" ? arch : null)) {
        app.sfx("coin");
        app.toast("Purchased and equipped");
      }
    },
    buycache: () => {
      keep = "buycache";
      if (app.store.buyCache()) {
        app.sfx("coin");
        app.toast("Gear Cache bought");
      } else {
        app.sfx("typo");
        app.toast(`Not enough gold (${fmt(cachePriceOf())} needed)`);
      }
    },
    odds: () => openOddsDialog(app),
    opencache: () => app.go("cache"),
  });
  return {
    root,
    focus: () => (body.querySelector("[data-key^=b-]") as HTMLElement | null)?.focus(),
  };
}
