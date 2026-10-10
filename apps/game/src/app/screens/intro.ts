/**
 * Chapter intro card (T3.4): before the first level of a chapter above 1, the player types the chapter's `uses: intro`
 * lines. It is exact case (it teaches Shift) unless "Ignore capitals" is on, and nobody can fail it: a wrong key only
 * shakes the line. Finishing it once saves a flag (`introSeen`); from then on Enter or Esc skips it.
 */
import type { App, Screen, ScreenArg } from "../app";
import { introLines } from "../chapters";
import { el, esc } from "../dom";

const IGNORED = [
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Tab",
  "Escape",
  "Enter",
  "Backspace",
];

/** Fallback if the bundle has no intro lines (should not happen once Ch2 ships). */
const FALLBACK = ["Hold Shift to type a Capital letter."];

export function introScreen(app: App, arg: ScreenArg): Screen {
  const root = el("app-screen intro");
  const card = el("hd-panel intro-card");
  root.append(card);
  const chapter = Number(arg.chapter) || 2;
  const levelId = String(arg.levelId ?? `ch${chapter}-l01`);
  const seen = arg.seen === true;
  const lines = introLines(app.bundle, chapter).map((w) => w.text);
  const texts = lines.length > 0 ? lines : FALLBACK;
  const fold = app.store.save.settings.caseAssist === true;
  const same = (a: string, b: string): boolean =>
    fold ? a.toLowerCase() === b.toLowerCase() : a === b;

  let line = 0;
  let pos = 0;
  let finished = false;

  const go = (): void => {
    if (finished) return;
    finished = true;
    app.sfx("uiConfirm");
    void app.play(levelId, { skipIntro: true });
  };

  const draw = (): void => {
    const t = texts[line] ?? "";
    const next = t[pos] ?? "";
    const shiftCue =
      !fold && next !== "" && next !== next.toLowerCase() && next === next.toUpperCase();
    const ok = esc(t.slice(0, pos));
    const cur =
      next === "" ? "" : `<span class="cur">${next === " " ? "&nbsp;" : esc(next)}</span>`;
    const rest = esc(t.slice(pos + 1));
    card.dataset.line = String(line + 1);
    card.innerHTML = `<div class="hd-eyebrow">Chapter ${"I".repeat(chapter)}</div>
      <h1 class="hd-title intro-h">Type to Begin</h1>
      <div class="hd-rule"></div>
      <div class="intro-line" id="intro-line" aria-label="Type: ${esc(t)}"><span class="ok">${ok}</span>${cur}${rest}</div>
      <div class="intro-hint" id="intro-hint" aria-live="polite">${shiftCue ? `Hold <span class="hd-kbd">Shift</span> and press <span class="hd-kbd">${esc(next)}</span>` : ""}</div>
      <div class="story-dots" aria-label="Line ${line + 1} of ${texts.length}">${texts.map((_, k) => `<i class="${k <= line ? "on" : ""}"></i>`).join("")}</div>
      <div class="story-keys">${
        seen
          ? `<span><span class="hd-kbd">Enter</span> / <span class="hd-kbd">Esc</span> skip</span>`
          : `<span>No penalty for typos</span><span><span class="hd-kbd">Esc</span> back</span>`
      }</div>`;
  };
  draw();

  const onKey = (e: KeyboardEvent): void => {
    if (finished || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (seen && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      go();
      return;
    }
    if (IGNORED.includes(e.key) || e.key.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const t = texts[line] ?? "";
    if (same(e.key, t[pos] ?? "")) {
      app.sfx("uiClick");
      pos++;
      if (pos >= t.length) {
        line++;
        pos = 0;
        if (line >= texts.length) {
          app.store.markIntroSeen(chapter);
          finished = true;
          card.dataset.done = "1";
          const id = window.setTimeout(() => {
            finished = false;
            go();
          }, 500);
          app.track(() => window.clearTimeout(id));
          return;
        }
      }
      draw();
    } else {
      app.sfx("typo");
      const l = card.querySelector<HTMLElement>("#intro-line");
      l?.classList.remove("bad");
      void l?.offsetWidth;
      l?.classList.add("bad");
    }
  };
  window.addEventListener("keydown", onKey, true);
  app.track(() => window.removeEventListener("keydown", onKey, true));

  return {
    root,
    focus: () => undefined,
    back: () => {
      if (seen) {
        go();
        return true;
      }
      return undefined; // default: back to the map
    },
  };
}
