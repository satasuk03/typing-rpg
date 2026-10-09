/** Title: press any key, then Continue / New Game / Typing Trial / Settings, over the live diorama. */
import { hasProgress } from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el } from "../dom";
import { openTrial } from "../trialLink";

export function titleScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen title");
  const progress = hasProgress(app.store.save);
  const status = (): string => {
    const st = app.net.sync.status;
    return st === "synced"
      ? "Cloud save synced"
      : st === "offline"
        ? "Offline: saved on this device"
        : "Saved on this device";
  };
  root.innerHTML = `
    <div class="title-vig"></div>
    <div class="title-logo">
      <div class="hd-eyebrow">A typing adventure</div>
      <h1 class="logo-main">HD-2D</h1>
      <div class="logo-sub">TYPING RPG</div>
      <div class="logo-orn"><i></i><b></b><i></i></div>
      <div class="hd-sub">Chapter I &middot; The Ember Road</div>
    </div>
    <div class="title-press" id="press"><span>Press any key</span></div>
    <div class="title-menu" id="menu" hidden>
      <button class="hd-btn primary block" data-act="continue" data-autofocus>${progress ? "Continue" : "Start game"}</button>
      ${progress ? `<button class="hd-btn block" data-act="new">New game</button>` : ""}
      <button class="hd-btn block" data-act="trial">Typing Trial</button>
      <button class="hd-btn block" data-act="settings">Settings</button>
    </div>
    <div class="title-foot"><span>${status()}</span><span>Desktop only &middot; keyboard required</span></div>`;

  const menu = root.querySelector<HTMLElement>("#menu") as HTMLElement;
  const press = root.querySelector<HTMLElement>("#press") as HTMLElement;
  let shown = false;
  const reveal = (): void => {
    if (shown) return;
    shown = true;
    menu.hidden = false;
    press.hidden = true;
    app.sfx("uiConfirm");
    app.nav.focusFirst("[data-autofocus]");
    root.dataset.state = "menu";
  };
  root.dataset.state = "press";
  const onKey = (e: KeyboardEvent): void => {
    if (shown) return;
    if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    reveal();
  };
  window.addEventListener("keydown", onKey, true);
  app.track(() => window.removeEventListener("keydown", onKey, true));

  actions(root, {
    continue: () => {
      app.sfx("uiConfirm");
      app.go("map", {});
    },
    new: () => confirmNew(app),
    trial: () => openTrial(),
    settings: () => {
      app.from = "title";
      app.go("settings", {});
    },
  });
  return {
    root,
    focus: () => {
      if (shown) app.nav.focusFirst("[data-autofocus]");
    },
    back: () => false,
  };
}

function confirmNew(app: App): void {
  const box = el("hd-panel app-confirm");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Erase progress");
  box.innerHTML = `<h2 class="hd-h">Start over?</h2>
    <p class="hd-sub" style="margin-bottom:16px">This erases the progress saved on this device. Cloud saves merge forward, so they keep your best stars.</p>
    <div class="btns"><button class="hd-btn" data-act="cancel" data-autofocus>Cancel</button><button class="hd-btn danger" data-act="erase">Erase and start</button></div>`;
  const close = app.openModal(box);
  actions(box, {
    cancel: () => close(),
    erase: () => {
      app.store.reset();
      close();
      app.go("map", {});
    },
  });
}
