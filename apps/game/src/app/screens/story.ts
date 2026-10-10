/** First-run story card (T3.3): three short panels over the diorama. Any key advances, Esc skips. */
import type { App, Screen, ScreenArg } from "../app";
import { el } from "../dom";

export const STORY_PANELS = [
  {
    eyebrow: "The Silence",
    title: "The Words Are Fading",
    text: "Nul, the Silent King, took your power. Now his Silence spreads, and words vanish from the world.",
  },
  {
    eyebrow: "Your gift",
    title: "Your Blade Is Your Voice",
    text: "One spark is left. Here, a sword answers to your fingers. Every letter you type becomes power. Every word you finish becomes a strike.",
  },
  {
    eyebrow: "The road ahead",
    title: "Take the Road",
    text: "A Gatekeeper waits at the end of the Ember Road. First, a short warm-up, so the road can meet you at your own speed.",
  },
] as const;

const IGNORED = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape"];

export function storyScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen story");
  const card = el("hd-panel story-card");
  root.append(card);
  let i = 0;
  const done = (): void => {
    app.sfx("uiConfirm");
    app.go("calibrate", {});
  };
  const draw = (): void => {
    const p = STORY_PANELS[i];
    if (!p) return;
    card.dataset.panel = String(i + 1);
    card.innerHTML = `<div class="hd-eyebrow">${p.eyebrow}</div>
      <h1 class="hd-title story-t">${p.title}</h1>
      <div class="hd-rule"></div>
      <p class="story-p">${p.text}</p>
      <div class="story-dots" aria-label="Panel ${i + 1} of ${STORY_PANELS.length}">${STORY_PANELS.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="story-keys"><span><span class="hd-kbd">any key</span> ${i === STORY_PANELS.length - 1 ? "start" : "next"}</span><span><span class="hd-kbd">Esc</span> skip</span></div>`;
  };
  draw();
  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || IGNORED.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    app.sfx("uiClick");
    i++;
    if (i >= STORY_PANELS.length) done();
    else draw();
  };
  window.addEventListener("keydown", onKey, true);
  app.track(() => window.removeEventListener("keydown", onKey, true));
  return {
    root,
    focus: () => undefined,
    back: () => {
      done();
      return true;
    },
  };
}
