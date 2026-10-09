/** Loadout: hero stats, equipped gear, 2 active skills (+ cast mode) and 3 passives, with keyboard pickers. */
import { RARITY_INFO } from "@hd2d/content";
import { gearDef, heroStatsOf, instanceOf } from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc, header, stat } from "../dom";
import { iconHtml } from "../icons";
import { fillSkillText } from "../skillText";

const SLOT_LABEL = { weapon: "Weapon", armor: "Armor", charm: "Charm" } as const;

interface PickOption {
  id: string | null;
  name: string;
  text: string;
  icon: string;
  locked?: string;
}

export function loadoutScreen(app: App, arg: ScreenArg): Screen {
  const root = el("app-screen loadout");
  root.append(header(app, "Prepare", "Loadout"));
  const body = el("lo-body");
  root.append(body);
  let focusKey = (arg.focus as string | undefined) ?? "";

  const fill = fillSkillText;

  const draw = (): void => {
    const s = app.store.save;
    const b = app.bundle;
    const hs = heroStatsOf(s, b);
    const gearRows = (["weapon", "armor", "charm"] as const)
      .map((slot) => {
        const inst = instanceOf(s, s.equipped[slot]);
        const def = inst ? gearDef(inst.defId, b) : undefined;
        if (!inst || !def) return "";
        return `<button class="hd-item" data-act="gear" data-slot="${slot}" data-key="g-${slot}">
          ${iconHtml(def.spriteId, { rarity: inst.rarity, level: inst.upgrade, alt: def.name })}
          <span class="grow"><span class="hd-eyebrow">${SLOT_LABEL[slot]}</span><br><span class="nm">${esc(def.name)}</span><br>
          <span style="color:${RARITY_INFO[inst.rarity].color}">${RARITY_INFO[inst.rarity].name}</span> <span class="hd-dim">T${def.tier} &middot; +${inst.upgrade}</span></span>
        </button>`;
      })
      .join("");
    const activeRows = ([0, 1] as const)
      .map((i) => {
        const id = s.loadout.actives[i];
        const d = id ? b.actives.find((a) => a.id === id) : undefined;
        const mode = s.loadout.activeModes[i];
        return `<div class="slotrow"><button class="hd-item" data-act="pick-active" data-slot="${i}" data-key="a-${i}">
          ${d ? iconHtml(d.iconId, { alt: d.name }) : `<span class="hd-ico plain empty"></span>`}
          <span class="grow"><span class="hd-eyebrow">Active ${i + 1}</span><br><span class="nm">${d ? esc(d.name) : "Empty"}</span><br>
          <span class="hd-dim">${d ? esc(fill(d.description, d.id)) : "Choose a skill"}</span></span></button>
          <button class="hd-btn sm" data-act="mode" data-slot="${i}" data-key="m-${i}" aria-label="Cast mode for active ${i + 1}: ${mode}" title="Smart waits for the best moment; ASAP casts as soon as charged">${mode === "smart" ? "Smart" : "ASAP"}</button></div>`;
      })
      .join("");
    const passiveRows = ([0, 1, 2] as const)
      .map((i) => {
        const id = s.loadout.passives[i];
        const d = id ? b.passives.find((p) => p.id === id) : undefined;
        return `<button class="hd-item" data-act="pick-passive" data-slot="${i}" data-key="p-${i}">
          ${d ? iconHtml(d.iconId, { alt: d.name }) : `<span class="hd-ico plain empty"></span>`}
          <span class="grow"><span class="hd-eyebrow">Passive ${i + 1}${d ? ` &middot; ${d.tag}` : ""}</span><br><span class="nm">${d ? esc(d.name) : "Empty"}</span><br>
          <span class="hd-dim">${d ? esc(fill(d.description, d.id)) : "Choose a passive"}</span></span></button>`;
      })
      .join("");
    body.innerHTML = `
      <section class="hd-panel flat lo-gear"><h2 class="hd-h">Hero</h2>
        <div class="lo-stats"><div><span class="hd-eyebrow">Attack</span><b id="st-atk">${stat(hs.atk)}</b></div><div><span class="hd-eyebrow">Health</span><b id="st-hp">${stat(hs.maxHp)}</b></div></div>
        <div class="hd-rule"></div><div class="hd-list">${gearRows}</div>
        <p class="hd-dim" style="margin-top:10px;font-size:12px">Enter on a piece opens Gear to swap or upgrade it.</p></section>
      <section class="hd-panel flat lo-skills"><h2 class="hd-h">Active skills</h2><div class="hd-list">${activeRows}</div>
        <h2 class="hd-h" style="margin-top:14px">Passives</h2><div class="hd-list">${passiveRows}</div></section>`;
    if (focusKey) {
      (body.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
    }
  };
  draw();
  app.track(app.store.onChange(() => draw()));

  const pick = (kind: "active" | "passive", slot: number, trigger: HTMLElement): void => {
    const s = app.store.save;
    const b = app.bundle;
    const defs = kind === "active" ? b.actives : b.passives;
    const owned = kind === "active" ? s.unlocks.actives : s.unlocks.passives;
    const opts: PickOption[] = [
      { id: null, name: "Empty", text: "Leave this slot open", icon: "" },
    ];
    for (const d of defs) {
      const unlocked = owned.includes(d.id);
      const lv = d.unlockLevel ? b.levels.find((l) => l.id === d.unlockLevel) : undefined;
      opts.push({
        id: d.id,
        name: d.name,
        text: fill(d.description, d.id),
        icon: "iconId" in d ? d.iconId : "",
        locked: unlocked ? undefined : `Clear level ${lv?.index ?? "?"} to unlock`,
      });
    }
    const box = el("hd-panel app-pick");
    box.setAttribute("role", "dialog");
    box.setAttribute(
      "aria-label",
      kind === "active" ? "Choose an active skill" : "Choose a passive",
    );
    box.innerHTML = `<h2 class="hd-h">${kind === "active" ? "Active skill" : "Passive"} ${slot + 1}</h2>
      <div class="hd-list">${opts
        .map(
          (
            o,
            i,
          ) => `<button class="hd-item${o.locked ? " locked" : ""}" data-act="choose" data-i="${i}" aria-disabled="${!!o.locked}" ${i === 0 ? "data-autofocus" : ""}>
          ${o.icon ? iconHtml(o.icon, { size: "sm", alt: o.name }) : `<span class="hd-ico sm plain empty"></span>`}
          <span class="grow"><span class="nm">${esc(o.name)}</span><br><span class="hd-dim">${o.locked ? `Locked: ${esc(o.locked)}` : esc(o.text)}</span></span></button>`,
        )
        .join("")}</div>
      <p class="hd-dim" style="margin-top:10px;font-size:12px">Enter choose &middot; Esc cancel</p>`;
    const close = app.openModal(box, () => trigger.isConnected && trigger.focus());
    box.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act=choose]");
      if (!t || t.getAttribute("aria-disabled") === "true") {
        if (t) {
          app.sfx("typo");
          app.toast("Not unlocked yet");
        }
        return;
      }
      const o = opts[Number(t.dataset.i)] as PickOption;
      focusKey = `${kind === "active" ? "a" : "p"}-${slot}`;
      if (kind === "active") app.store.setActive(slot as 0 | 1, o.id);
      else app.store.setPassive(slot as 0 | 1 | 2, o.id);
      app.sfx("uiConfirm");
      close();
    });
  };

  actions(root, {
    gear: (t) => app.go("inventory", { slot: t.dataset.slot }),
    "pick-active": (t) => pick("active", Number(t.dataset.slot), t),
    "pick-passive": (t) => pick("passive", Number(t.dataset.slot), t),
    mode: (t) => {
      const i = Number(t.dataset.slot) as 0 | 1;
      focusKey = `m-${i}`;
      app.store.setActiveMode(
        i,
        app.store.save.loadout.activeModes[i] === "smart" ? "asap" : "smart",
      );
      app.sfx("uiClick");
    },
  });
  return {
    root,
    focus: () => {
      if (!focusKey) (body.querySelector("[data-key]") as HTMLElement | null)?.focus();
      else (body.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
    },
  };
}
