/**
 * Gear Cache opening: a reveal with a rarity-coloured light beam (respects reduced motion / reduced flash), the odds
 * button (published odds dialog) and the live pity counters ("Rare+ guaranteed within N").
 */
import { RARITY_INFO, type Rarity } from "@hd2d/content";
import { publishedCacheOdds } from "@hd2d/sim";
import {
  type CacheOpen,
  gearDef,
  heroStatsOf,
  heroStatsWith,
  instanceOf,
  isEquipped,
} from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc, fmt, header, stat } from "../dom";
import { iconHtml } from "../icons";
import { openOddsDialog } from "./odds";

type Phase = "idle" | "opening" | "revealed";

export function cacheScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen cache");
  root.append(header(app, "Gear Caches", "Open a Cache"));
  const body = el("cache-body");
  root.append(body);
  let phase: Phase = "idle";
  let revealed: CacheOpen | null = null;
  let timers: number[] = [];
  let raf = 0;

  const pityHtml = (): string => {
    const s = app.store.save;
    const p = publishedCacheOdds().pity;
    const rows: [string, string, number, number, string][] = [
      ["rare", "Rare or better", s.cachePity.sinceRare, p.rare, "var(--r-R)"],
      ["epic", "Epic or better", s.cachePity.sinceEpic, p.epic, "var(--r-E)"],
      ["legendary", "Legendary", s.cachePity.sinceLegendary, p.legendary, "var(--r-L)"],
    ];
    return rows
      .map(([k, label, since, max, col]) => {
        const left = Math.max(1, max - since);
        return `<div class="pity-row" id="pity-${k}" data-since="${since}" data-left="${left}">
          <div class="pity-l"><span>${label}</span><b>guaranteed within <span class="n">${left}</span> ${left === 1 ? "open" : "opens"}</b></div>
          <div class="hd-bar"><i style="width:${Math.min(100, (since / max) * 100)}%;background:${col}"></i></div></div>`;
      })
      .join("");
  };

  const draw = (): void => {
    const s = app.store.save;
    const n = s.inventory.unopenedCaches;
    body.innerHTML = `
      <section class="cache-stage" id="cstage" data-phase="${phase}">
        <div class="rays"></div><div class="beam" id="beam"></div>
        <canvas class="burst" id="burst" width="560" height="380"></canvas>
        <div class="chest" id="chest">${iconHtml("cache", { rarity: "R", size: "lg", alt: "Gear Cache" })}<div class="chest-count">x <b id="count">${n}</b></div></div>
        <div class="flash" id="flash"></div>
        <div class="reveal" id="reveal" hidden></div>
        <div class="cache-msg hd-sub" id="cmsg">${n > 0 ? "Open a Gear Cache to receive a piece of gear." : "No caches. Earn them from chests or buy one for gold."}</div>
      </section>
      <section class="cache-side">
        <div class="hd-panel flat"><h2 class="hd-h">Pity</h2><div id="pity">${pityHtml()}</div>
          <p class="hd-dim" style="font-size:12px;margin-top:8px">Each counter resets when you get that rarity or better.</p></div>
        <div class="cache-btns">
          <button class="hd-btn primary block" data-act="open" data-key="open" data-autofocus aria-disabled="${n <= 0}">Open cache</button>
          <button class="hd-btn block" data-act="buy" data-key="buy" aria-disabled="${s.wallet.gold < app.store.cachePrice()}">Buy cache <span class="hd-coin">${fmt(app.store.cachePrice())}</span></button>
          <button class="hd-btn block" data-act="odds" data-key="odds">Odds</button>
        </div></section>`;
  };
  draw();

  const clearTimers = (): void => {
    for (const t of timers) window.clearTimeout(t);
    timers = [];
    cancelAnimationFrame(raf);
  };

  const refreshCounts = (): void => {
    const pity = body.querySelector("#pity");
    if (pity) pity.innerHTML = pityHtml();
    const c = body.querySelector("#count");
    if (c) c.textContent = String(app.store.save.inventory.unopenedCaches);
    (body.querySelector('[data-act="open"]') as HTMLElement | null)?.setAttribute(
      "aria-disabled",
      String(app.store.save.inventory.unopenedCaches <= 0),
    );
    (body.querySelector('[data-act="buy"]') as HTMLElement | null)?.setAttribute(
      "aria-disabled",
      String(app.store.save.wallet.gold < app.store.cachePrice()),
    );
  };

  // ---- particles (pixel sparks in the rarity colour)
  const burst = (rarity: Rarity): void => {
    const cv = body.querySelector<HTMLCanvasElement>("#burst");
    const c = cv?.getContext("2d");
    if (!cv || !c) return;
    let seed = 0x9e3779b9;
    const rnd = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const col = RARITY_INFO[rarity].color;
    const count = rarity === "L" ? 120 : rarity === "E" ? 80 : rarity === "R" ? 56 : 34;
    const ps = Array.from({ length: count }, () => {
      const a = -Math.PI / 2 + (rnd() - 0.5) * (rarity === "L" ? 2.6 : 1.7);
      const v = 90 + rnd() * (rarity === "L" ? 360 : 240);
      return {
        x: cv.width / 2,
        y: cv.height * 0.58,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.7 + rnd() * 0.9,
        age: 0,
        sz: 2 + Math.floor(rnd() * 3),
        w: rnd() < 0.3,
      };
    });
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      c.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      for (const p of ps) {
        p.age += dt;
        if (p.age >= p.life) continue;
        alive = true;
        p.vy += 220 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.age / p.life;
        c.globalAlpha = Math.min(1, k * 1.6);
        c.fillStyle = p.w ? "#ffffff" : col;
        c.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz);
      }
      c.globalAlpha = 1;
      if (alive) raf = requestAnimationFrame(tick);
      else c.clearRect(0, 0, cv.width, cv.height);
    };
    raf = requestAnimationFrame(tick);
  };

  const showCard = (o: CacheOpen): void => {
    const s = app.store.save;
    const inst = instanceOf(s, o.uid);
    const def = gearDef(o.defId, app.bundle);
    if (!inst || !def) return;
    const info = RARITY_INFO[inst.rarity];
    const cur = heroStatsOf(s, app.bundle);
    const withIt = heroStatsWith(s, o.uid, app.bundle);
    const eq = isEquipped(s, o.uid);
    const better = withIt.atk + withIt.maxHp > cur.atk + cur.maxHp;
    const rv = body.querySelector<HTMLElement>("#reveal") as HTMLElement;
    rv.hidden = false;
    rv.dataset.rarity = inst.rarity;
    rv.style.setProperty("--rar", info.color);
    rv.innerHTML = `<div class="rv-card" id="rv-card" data-rarity="${inst.rarity}">
      ${iconHtml(def.spriteId, { rarity: inst.rarity, size: "lg", alt: def.name })}
      <div class="rv-name">${esc(def.name)}</div>
      <div class="hd-chip rv-rar" style="color:${info.color}">${info.name}</div>
      <div class="hd-dim">${def.slot}${def.archetype ? ` &middot; ${def.archetype}` : ""} &middot; tier ${def.tier}</div>
      <div class="rv-cmp">ATK ${stat(cur.atk)} &rarr; ${stat(withIt.atk)} &middot; HP ${stat(cur.maxHp)} &rarr; ${stat(withIt.maxHp)}${better ? ` <span class="hd-good">better</span>` : ""}</div>
      <div class="rv-acts"><button class="hd-btn primary sm" data-act="equip" data-key="rv-equip" ${eq ? "hidden" : ""}>Equip</button>
        <button class="hd-btn sm" data-act="again" data-key="rv-again" aria-disabled="${s.inventory.unopenedCaches <= 0}">Open another</button>
        <button class="hd-btn sm" data-act="done" data-key="rv-done">Keep it</button></div></div>`;
    phase = "revealed";
    const stage = body.querySelector<HTMLElement>("#cstage") as HTMLElement;
    stage.dataset.phase = "revealed";
    stage.dataset.rarity = inst.rarity;
    const first = rv.querySelector<HTMLElement>("button:not([hidden])");
    first?.focus();
  };

  const open = (): void => {
    if (phase === "opening") return;
    const s = app.store.save;
    if (s.inventory.unopenedCaches <= 0) {
      app.sfx("typo");
      app.toast("No caches to open");
      return;
    }
    // the roll is decided and saved NOW (pity, rng); the animation only reveals it
    const res = app.store.openCache();
    if (!res) return;
    revealed = res;
    const rarity = res.roll.rarity;
    const reduced = app.reducedMotion;
    const noFlash = app.store.save.settings.reducedFlash;
    const stage = body.querySelector<HTMLElement>("#cstage") as HTMLElement;
    const rv = body.querySelector<HTMLElement>("#reveal") as HTMLElement;
    rv.hidden = true;
    phase = "opening";
    stage.dataset.phase = "opening";
    stage.dataset.rarity = rarity;
    stage.style.setProperty("--rar", RARITY_INFO[rarity].color);
    stage.classList.toggle("reduced", reduced);
    stage.classList.toggle("noflash", noFlash);
    (body.querySelector("[data-act=open]") as HTMLElement | null)?.setAttribute(
      "aria-disabled",
      "true",
    );
    (body.querySelector("#cmsg") as HTMLElement).textContent = "";
    app.sfx("chestLand");
    const shake = reduced ? 120 : 760;
    timers.push(
      window.setTimeout(() => {
        stage.dataset.phase = "burst";
        app.sfx("chestOpen");
        if (!reduced) burst(rarity);
        timers.push(
          window.setTimeout(
            () => {
              app.sfx(rarity === "E" || rarity === "L" ? "levelUp" : "coin");
              refreshCounts();
              showCard(res);
            },
            reduced ? 80 : 520,
          ),
        );
      }, shake),
    );
  };

  actions(root, {
    open,
    again: () => {
      phase = "idle";
      const stage = body.querySelector<HTMLElement>("#cstage");
      if (stage) stage.dataset.phase = "idle";
      (body.querySelector("#reveal") as HTMLElement).hidden = true;
      open();
    },
    done: () => {
      phase = "idle";
      const stage = body.querySelector<HTMLElement>("#cstage");
      if (stage) stage.dataset.phase = "idle";
      (body.querySelector("#reveal") as HTMLElement).hidden = true;
      (body.querySelector("#cmsg") as HTMLElement).textContent =
        app.store.save.inventory.unopenedCaches > 0
          ? "Open a Gear Cache to receive a piece of gear."
          : "No caches left.";
      refreshCounts();
      (body.querySelector("[data-key=open]") as HTMLElement | null)?.focus();
    },
    equip: () => {
      if (revealed && app.store.equip(revealed.uid)) {
        app.sfx("uiConfirm");
        app.toast("Equipped");
        (body.querySelector("[data-act=equip]") as HTMLElement | null)?.setAttribute("hidden", "");
        (body.querySelector("[data-key=rv-again]") as HTMLElement | null)?.focus();
      }
    },
    buy: () => {
      if (app.store.buyCache()) {
        app.sfx("coin");
        refreshCounts();
        app.toast("Gear Cache bought");
      } else {
        app.sfx("typo");
        app.toast(`Not enough gold (${fmt(app.store.cachePrice())} needed)`);
      }
    },
    odds: () => openOddsDialog(app),
  });
  return {
    root,
    focus: () => (body.querySelector("[data-key=open]") as HTMLElement | null)?.focus(),
    dispose: clearTimers,
    back: () => {
      if (phase === "opening") return true; // let the reveal finish
      return undefined;
    },
  };
}
