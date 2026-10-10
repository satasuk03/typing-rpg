/** Chapter 1 map: 10 level nodes on a winding road (stars, locked/open, boss, first clear vs replay) + the hub menu. */
import type { LevelDef, StarChallenge } from "@hd2d/content";
import { levelGold } from "@hd2d/sim";
import { levelUnlocked } from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { CHAPTERS, chapterState, defaultChapter } from "../chapters";
import { actions, el, esc, header } from "../dom";
import { openTrial } from "../trialLink";

/** Node centres in % of the road area; a gentle S-curve left to right. */
const POS: readonly [number, number][] = [
  [7, 66],
  [17.5, 38],
  [28, 64],
  [38.5, 36],
  [49, 62],
  [59.5, 34],
  [70, 60],
  [80, 36],
  [89, 62],
  [95, 28],
];

export function describeStar3(c: StarChallenge): string {
  switch (c.kind) {
    case "untouched":
      return c.maxHits === 0
        ? "Take no damage"
        : `Take at most ${c.maxHits} hit${c.maxHits === 1 ? "" : "s"}`;
    case "parTime":
      return "Clear within the par time";
    case "streak":
      return `Reach a x${c.combo} word combo`;
    case "guardian":
      return `Land ${c.parries} perfect parries`;
    case "noSkills":
      return "Clear without casting skills";
  }
}

const BIOME_NAME: Record<string, string> = {
  forest: "Forest",
  ruins: "Ruins",
  cave: "Cave",
  hollow: "Hollow",
  hushwood: "Hushwood",
  fen: "Fen",
  grove: "Grove",
};

export function mapScreen(app: App, arg: ScreenArg): Screen {
  const root = el("app-screen map");
  const save = app.store.save;
  const chapter = Number(arg.chapter) || defaultChapter(save, app.bundle, arg.focus);
  const info = CHAPTERS.find((c) => c.n === chapter) ?? (CHAPTERS[0] as (typeof CHAPTERS)[number]);
  const cstate = chapterState(save, app.bundle, chapter);
  const levels = app.bundle.levels.filter((l) => l.chapter === chapter);
  const lockedMsg = (l: LevelDef): string =>
    l.index === 1 && l.chapter > 1
      ? `Clear Chapter ${"I".repeat(l.chapter - 1)} first`
      : `Clear level ${l.index - 1} first`;
  const stateOf = (l: LevelDef): "locked" | "new" | "cleared" =>
    !levelUnlocked(save, app.bundle, l.id)
      ? "locked"
      : save.progress.levels[l.id]?.cleared
        ? "cleared"
        : "new";

  // the road: segments between nodes are solid once the earlier level is cleared
  const segs = levels
    .slice(0, -1)
    .map((l, i) => {
      const a = POS[i] as [number, number];
      const b = POS[i + 1] as [number, number];
      const done = save.progress.levels[l.id]?.cleared ?? false;
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${done ? "road done" : "road"}"/>`;
    })
    .join("");

  const nodes = levels
    .map((l, i) => {
      const [x, y] = POS[i] as [number, number];
      const st = stateOf(l);
      const rec = save.progress.levels[l.id];
      const stars = [0, 1, 2]
        .map((k) => `<span class="hd-star${rec?.stars[k] ? " on" : ""}"></span>`)
        .join("");
      const tag = st === "locked" ? "LOCKED" : st === "cleared" ? "REPLAY" : "NEW";
      return `<button class="node ${st}${l.kind === "boss" ? " boss" : ""}" data-act="play" data-id="${l.id}" data-i="${i}" data-arrows="own"
        style="left:${x}%;top:${y}%" aria-disabled="${st === "locked"}" aria-label="Level ${l.index}: ${esc(l.name)}${l.kind === "boss" ? ", boss" : ""}, ${st === "locked" ? "locked" : st === "cleared" ? "cleared, replay" : "first clear"}">
        <span class="gem"><b>${l.kind === "boss" ? "&#9819;" : l.index}</b></span>
        <span class="nstars" data-stars="${rec?.stars.filter(Boolean).length ?? 0}">${stars}</span>
        <span class="ntag t-${st}">${tag}</span>
      </button>`;
    })
    .join("");

  root.append(header(app, info.label, info.title, "Esc Title"));
  const tabs = el("ch-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Chapters");
  tabs.innerHTML = CHAPTERS.map((c) => {
    const st = chapterState(save, app.bundle, c.n);
    const tag = st === "open" ? "" : st === "locked" ? "LOCKED" : "COMING SOON";
    return `<button class="hd-btn ch-tab ${st}" role="tab" data-act="tab" data-n="${c.n}" data-key="tab-${c.n}" data-arrows="own"
      aria-selected="${c.n === chapter}" tabindex="${c.n === chapter ? 0 : -1}"
      aria-label="${c.label}: ${esc(c.title)}${st === "locked" ? ", locked" : st === "soon" ? ", coming soon" : ""}">${c.label}${tag ? `<span class="ch-st">${tag}</span>` : ""}</button>`;
  }).join("");
  root.append(tabs);
  const body = el("map-body");
  const notice =
    cstate === "soon"
      ? `<div class="ch-soon hd-panel" id="ch-notice" role="status"><div class="hd-eyebrow">${info.label}</div>
          <h2 class="hd-h" style="margin:4px 0">Coming soon</h2><p class="hd-sub">${esc(info.title)} is still being written.</p></div>`
      : cstate === "locked"
        ? `<div class="ch-banner hd-panel" id="ch-notice" role="status"><div class="hd-eyebrow">${info.label} &middot; Locked</div>
          <h2 class="hd-h">${esc(info.title)}</h2><p>${esc(info.lockHint)}</p></div>`
        : "";
  if (cstate !== "open") root.classList.add("ch-dim");
  body.innerHTML = `${notice}${
    cstate === "soon"
      ? ""
      : `<div class="road-wrap"><svg class="road-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${segs}</svg>${nodes}</div>
    ${cstate === "open" ? `<div class="map-detail hd-panel flat" id="detail" aria-live="polite"></div>` : ""}`
  }
    <div class="map-menu" id="menu">
      <button class="hd-btn" data-act="loadout">Loadout</button>
      <button class="hd-btn" data-act="inventory">Gear</button>
      <button class="hd-btn" data-act="shop">Shop</button>
      <button class="hd-btn" data-act="cache">Caches${save.inventory.unopenedCaches > 0 ? ` (${save.inventory.unopenedCaches})` : ""}</button>
      <button class="hd-btn" data-act="journal">Word Journal</button>
      <button class="hd-btn" data-act="trial">Typing Trial</button>
      <button class="hd-btn" data-act="settings">Settings</button>
    </div>`;
  root.append(body);

  const detail = body.querySelector<HTMLElement>("#detail");
  const tabEls = [...tabs.querySelectorAll<HTMLElement>(".ch-tab")];
  const nodeEls = [...body.querySelectorAll<HTMLElement>(".node")];

  const showDetail = (id: string): void => {
    const l = levels.find((x) => x.id === id);
    if (!l || !detail) return;
    const st = stateOf(l);
    const rec = save.progress.levels[l.id];
    const gold = levelGold(l.chapter, l.index);
    const status =
      st === "locked"
        ? `<span class="hd-chip hd-dim">Locked</span> ${esc(lockedMsg(l))}`
        : st === "cleared"
          ? `<span class="hd-chip hd-good">Replay</span> Reduced gold, no first-clear bonus`
          : `<span class="hd-chip hd-gold">First clear</span> Full gold, better chests, unlocks`;
    const un = [
      ...app.bundle.actives.filter((a) => a.unlockLevel === l.id).map((a) => `Skill: ${a.name}`),
      ...app.bundle.passives.filter((p) => p.unlockLevel === l.id).map((p) => `Passive: ${p.name}`),
    ];
    detail.innerHTML = `<div class="md-l"><div class="hd-eyebrow">${BIOME_NAME[l.biome] ?? l.biome} &middot; Level ${l.index}${l.kind === "boss" ? " &middot; Boss" : ""}</div>
        <h2 class="hd-h" style="margin:2px 0 6px">${esc(l.name)}</h2><div class="hd-sub">${status}</div></div>
      <div class="md-r"><table>
        <tr><td>Star 1</td><td>Clear the level</td></tr>
        <tr><td>Star 2</td><td>Finish with high accuracy</td></tr>
        <tr><td>Star 3</td><td>${esc(describeStar3(l.star3))}</td></tr>
        <tr><td>Level gold</td><td class="hd-gold">${gold}${st === "cleared" ? " (replay pays less)" : ""}</td></tr>
        ${un.length ? `<tr><td>Unlocks</td><td class="hd-good">${esc(un.join(", "))}</td></tr>` : ""}
        ${rec ? `<tr><td>Attempts</td><td>${rec.attempts}</td></tr>` : ""}
      </table></div>`;
  };

  const play = (n: HTMLElement): void => {
    const id = n.dataset.id as string;
    const l = levels.find((x) => x.id === id) as LevelDef;
    if (stateOf(l) === "locked") {
      app.sfx("typo");
      app.toast(lockedMsg(l));
      return;
    }
    app.sfx("uiConfirm");
    void app.play(id);
  };

  actions(root, {
    play,
    tab: (t) => {
      const n = Number(t.dataset.n);
      if (n === chapter) return;
      app.sfx("uiClick");
      app.go("map", { chapter: n, focus: "tab" });
    },
    loadout: () => app.go("loadout"),
    inventory: () => app.go("inventory"),
    shop: () => app.go("shop"),
    cache: () => app.go("cache"),
    journal: () => app.go("journal"),
    settings: () => {
      app.from = "map";
      app.go("settings");
    },
    trial: () => openTrial(),
  });

  root.addEventListener("focusin", (e) => {
    const n = (e.target as HTMLElement).closest<HTMLElement>(".node");
    if (n?.dataset.id) showDetail(n.dataset.id);
  });
  // Left/Right walk the road; Down goes to the menu; Up from the menu returns to the current node.
  let lastNode = 0;
  const toTabs = (): void =>
    tabEls.find((x) => x.getAttribute("aria-selected") === "true")?.focus();
  root.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>(".ch-tab");
    if (tab) {
      const i = tabEls.indexOf(tab);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        tabEls[
          Math.max(0, Math.min(tabEls.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))
        ]?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        (nodeEls[lastNode] ?? (root.querySelector("#menu .hd-btn") as HTMLElement | null))?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const n = t.closest<HTMLElement>(".node");
    if (n) {
      const i = Number(n.dataset.i);
      lastNode = i;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const j = Math.max(0, Math.min(nodeEls.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
        e.preventDefault();
        e.stopPropagation();
        nodeEls[j]?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        (root.querySelector("#menu .hd-btn") as HTMLElement | null)?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        toTabs();
      }
    } else if (e.key === "ArrowUp" && t.closest("#menu")) {
      e.preventDefault();
      e.stopPropagation();
      (
        nodeEls[lastNode] ?? tabEls.find((x) => x.getAttribute("aria-selected") === "true")
      )?.focus();
    }
  });

  const firstOpen = (): number => {
    const i = levels.findIndex((l) => stateOf(l) === "new");
    return i >= 0 ? i : levels.length - 1;
  };
  return {
    root,
    focus: () => {
      if (arg.focus === "tab" || nodeEls.length === 0) return toTabs();
      const want = arg.focus ? levels.findIndex((l) => l.id === arg.focus) : firstOpen();
      const i = want >= 0 ? want : firstOpen();
      lastNode = i;
      nodeEls[i]?.focus();
    },
  };
}
