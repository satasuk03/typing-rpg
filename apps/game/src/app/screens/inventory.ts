/** Inventory / gear: compare, equip, upgrade (sim cost), Upgrade Transfer preview when replacing, salvage. */
import { RARITY_INFO, type Rarity } from "@hd2d/content";
import { upgradeCap, upgradeCost } from "@hd2d/sim";
import {
  dropSalvage,
  type GearInstance,
  gearDef,
  heroStatsOf,
  heroStatsWith,
  instanceOf,
  isEquipped,
  slotOf,
} from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc, fmt, header, stat } from "../dom";
import { iconHtml } from "../icons";

type Filter = "all" | "weapon" | "armor" | "charm";
const RANK: Record<Rarity, number> = { C: 0, U: 1, R: 2, E: 3, L: 4 };
const FILTERS: Filter[] = ["all", "weapon", "armor", "charm"];

const delta = (a: number, b: number): string => {
  const d = Math.round(b) - Math.round(a);
  return d === 0
    ? `<span class="hd-dim">+0</span>`
    : d > 0
      ? `<span class="hd-good">+${d}</span>`
      : `<span class="hd-bad">${d}</span>`;
};

export function inventoryScreen(app: App, arg: ScreenArg): Screen {
  const root = el("app-screen inventory");
  root.append(header(app, "Armory", "Gear"));
  const body = el("inv-body");
  root.append(body);
  let filter: Filter = (FILTERS as string[]).includes(String(arg.slot))
    ? (arg.slot as Filter)
    : "all";
  let sel = app.store.save.equipped[filter === "all" ? "weapon" : filter];
  let keepFocus: string | null = null;

  const items = (): GearInstance[] => {
    const s = app.store.save;
    return s.inventory.gear
      .filter((g) => filter === "all" || slotOf(g, app.bundle) === filter)
      .sort(
        (a, b) =>
          ["weapon", "armor", "charm"].indexOf(slotOf(a, app.bundle)) -
            ["weapon", "armor", "charm"].indexOf(slotOf(b, app.bundle)) ||
          RANK[b.rarity] - RANK[a.rarity] ||
          b.upgrade - a.upgrade ||
          a.uid - b.uid,
      );
  };

  const detailHtml = (inst: GearInstance): string => {
    const s = app.store.save;
    const def = gearDef(inst.defId, app.bundle);
    if (!def) return "";
    const slot = def.slot;
    const eq = isEquipped(s, inst.uid);
    const cap = upgradeCap(inst.rarity);
    const cur = heroStatsOf(s, app.bundle);
    const withIt = heroStatsWith(s, inst.uid, app.bundle);
    const info = RARITY_INFO[inst.rarity];
    const cost = inst.upgrade < cap ? upgradeCost(def.tier, inst.upgrade) : 0;
    const canUp = inst.upgrade < cap && s.wallet.gold >= cost;
    const upText =
      inst.upgrade >= cap
        ? "Fully upgraded"
        : `Upgrade to +${inst.upgrade + 1} <span class="hd-gold">${fmt(cost)} gold</span>`;
    const oldInst = instanceOf(s, s.equipped[slot]);
    let transfer = "";
    let acts = "";
    if (!eq && oldInst) {
      const pv = app.store.previewTransfer(inst.uid);
      if (pv) {
        transfer = `<div class="hd-panel flat inv-transfer" id="transfer"><div class="hd-eyebrow">Upgrade Transfer preview</div>
          Replace <b>${esc(gearDef(oldInst.defId, app.bundle)?.name ?? "")}</b> (+${pv.oldUpgrade}):<br>
          new piece gets <b class="hd-good">+${pv.newUpgrade}</b> (half of the old levels${pv.capped ? `, capped by ${info.name}` : ""}),
          old piece salvaged for <b class="hd-gold">${fmt(pv.salvageGold)}</b> gold.</div>`;
      }
      acts += `<button class="hd-btn primary" data-act="replace" data-uid="${inst.uid}" data-key="act-replace">Replace + transfer</button>
        <button class="hd-btn" data-act="equip" data-uid="${inst.uid}" data-key="act-equip">Equip (keep old)</button>`;
    }
    acts += `<button class="hd-btn" data-act="upgrade" data-uid="${inst.uid}" aria-disabled="${!canUp}" data-key="act-upgrade">${upText}</button>`;
    if (!eq)
      acts += `<button class="hd-btn danger" data-act="salvage" data-uid="${inst.uid}" data-key="act-salvage">Salvage +${fmt(dropSalvage(inst, app.bundle))}</button>`;
    return `<div class="inv-top">${iconHtml(def.spriteId, { rarity: inst.rarity, size: "lg", level: inst.upgrade, alt: def.name })}
        <div><h2 class="hd-h" style="margin:0">${esc(def.name)}</h2>
        <div><span class="hd-chip" style="color:${info.color}">${info.name}</span> <span class="hd-dim">${slot}${def.archetype ? ` &middot; ${def.archetype}` : ""} &middot; tier ${def.tier}</span>${eq ? ` <span class="hd-chip hd-good">Equipped</span>` : ""}</div>
        <div class="hd-dim" style="margin-top:4px">${esc(info.tagline)}</div></div></div>
      <table class="inv-stats"><tr><td>Upgrade</td><td>+${inst.upgrade} / +${cap}</td></tr>
        <tr><td>Hero attack</td><td id="cmp-atk">${stat(cur.atk)} &rarr; ${stat(withIt.atk)} ${eq ? "" : delta(cur.atk, withIt.atk)}</td></tr>
        <tr><td>Hero health</td><td id="cmp-hp">${stat(cur.maxHp)} &rarr; ${stat(withIt.maxHp)} ${eq ? "" : delta(cur.maxHp, withIt.maxHp)}</td></tr></table>
      ${transfer}<div class="inv-acts">${acts}</div>
      ${def.flavor ? `<p class="hd-dim" style="font-size:12px;margin-top:10px;font-style:italic">${esc(def.flavor)}</p>` : ""}`;
  };

  const draw = (): void => {
    const s = app.store.save;
    const list = items();
    if (!instanceOf(s, sel) || !list.some((g) => g.uid === sel)) sel = list[0]?.uid ?? sel;
    const rows = list
      .map((g) => {
        const def = gearDef(g.defId, app.bundle);
        if (!def) return "";
        return `<button class="hd-item" data-act="select" data-uid="${g.uid}" data-key="i-${g.uid}" aria-pressed="${g.uid === sel}">
          ${iconHtml(def.spriteId, { rarity: g.rarity, size: "sm", level: g.upgrade, alt: def.name })}
          <span class="grow"><span class="nm">${esc(def.name)}</span><br><span style="color:${RARITY_INFO[g.rarity].color}">${RARITY_INFO[g.rarity].name}</span> <span class="hd-dim">${def.slot} T${def.tier}</span></span>
          ${isEquipped(s, g.uid) ? `<span class="hd-chip hd-good">Eq</span>` : ""}</button>`;
      })
      .join("");
    const tabs = FILTERS.map(
      (f) =>
        `<button class="hd-btn sm" data-act="filter" data-f="${f}" aria-pressed="${f === filter}" data-key="f-${f}">${f === "all" ? "All" : f}</button>`,
    ).join("");
    const selInst = instanceOf(s, sel);
    body.innerHTML = `<section class="hd-panel flat inv-list"><div class="hd-seg inv-tabs">${tabs}</div>
        <div class="hd-list inv-items" id="items">${rows || `<p class="hd-dim">Nothing here yet. Open Gear Caches or play levels to find gear.</p>`}</div></section>
      <section class="hd-panel flat inv-detail" id="detail">${selInst ? detailHtml(selInst) : ""}</section>`;
    if (keepFocus) {
      (body.querySelector(`[data-key="${keepFocus}"]`) as HTMLElement | null)?.focus();
      keepFocus = null;
    }
  };
  draw();
  app.track(app.store.onChange(() => draw()));

  const refreshDetail = (): void => {
    const inst = instanceOf(app.store.save, sel);
    const d = body.querySelector("#detail");
    if (d && inst) d.innerHTML = detailHtml(inst);
    for (const b of body.querySelectorAll<HTMLElement>("#items .hd-item"))
      b.setAttribute("aria-pressed", String(Number(b.dataset.uid) === sel));
  };
  // moving focus along the list previews the item (no click needed)
  root.addEventListener("focusin", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("#items .hd-item");
    if (b && Number(b.dataset.uid) !== sel) {
      sel = Number(b.dataset.uid);
      refreshDetail();
    }
  });

  const need = (ok: boolean, msg: string): boolean => {
    if (!ok) {
      app.sfx("typo");
      app.toast(msg);
    }
    return ok;
  };
  actions(root, {
    filter: (t) => {
      filter = t.dataset.f as Filter;
      keepFocus = `f-${filter}`;
      draw();
    },
    select: (t) => {
      sel = Number(t.dataset.uid);
      refreshDetail();
      (
        body.querySelector("#detail .hd-btn:not([aria-disabled=true])") as HTMLElement | null
      )?.focus();
    },
    equip: (t) => {
      keepFocus = `i-${t.dataset.uid}`;
      if (app.store.equip(Number(t.dataset.uid))) {
        app.sfx("uiConfirm");
        app.toast("Equipped");
      }
    },
    replace: (t) => {
      keepFocus = `i-${t.dataset.uid}`;
      if (app.store.replaceWithTransfer(Number(t.dataset.uid))) {
        app.sfx("levelUp");
        app.toast("Replaced with Upgrade Transfer");
      }
    },
    upgrade: (t) => {
      const uid = Number(t.dataset.uid);
      const inst = instanceOf(app.store.save, uid);
      const def = inst && gearDef(inst.defId, app.bundle);
      if (!inst || !def) return;
      if (!need(inst.upgrade < upgradeCap(inst.rarity), "Already at the maximum upgrade")) return;
      if (
        !need(app.store.save.wallet.gold >= upgradeCost(def.tier, inst.upgrade), "Not enough gold")
      )
        return;
      keepFocus = "act-upgrade";
      if (app.store.upgrade(uid)) app.sfx("coin");
    },
    salvage: (t) => {
      keepFocus = `f-${filter}`;
      if (app.store.salvage(Number(t.dataset.uid))) {
        app.sfx("coin");
        app.toast("Salvaged");
      }
    },
  });
  return {
    root,
    focus: () => {
      const t =
        body.querySelector(`#items [data-uid="${sel}"]`) ?? body.querySelector("#items .hd-item");
      (t as HTMLElement | null)?.focus();
    },
  };
}
