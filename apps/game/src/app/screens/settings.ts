/**
 * Settings: audio (the shared `createAudioSettingsPanel`), effects intensity, reduced flash / motion, combo mode,
 * case mode, difficulty, auto-unlock, quality tier (per device) and the Journal translation language.
 */
import { createAudioSettingsPanel } from "../../audio";
import { HOW_TO_PLAY_HTML } from "../../hud/howToPlay";
import type { QualityTier } from "../../render";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, header } from "../dom";
import { FIRST_LEVEL } from "./calibrate";

export const QUALITY_KEY = "hd2d.quality";

export function readQuality(): QualityTier {
  try {
    const v = Number(localStorage.getItem(QUALITY_KEY));
    return v === 1 || v === 2 ? v : 0;
  } catch {
    return 0;
  }
}

interface SegDef<T extends string> {
  key: string;
  label: string;
  help: string;
  options: { v: T; label: string; help?: string }[];
}

export function settingsScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen settings");
  root.append(header(app, "Options", "Settings"));
  const body = el("set-body");
  root.append(body);
  let keep: string | null = null;
  let audioPanel: { destroy(): void } | null = null;

  const seg = <T extends string>(d: SegDef<T>, cur: T): string =>
    `<div class="set-row seg-row" data-setting="${d.key}"><div class="set-l"><b>${d.label}</b><span class="hd-dim">${d.help}</span></div>
      <div class="hd-seg" role="group" aria-label="${d.label}">${d.options
        .map(
          (o) =>
            `<button class="hd-btn sm" data-act="seg" data-k="${d.key}" data-v="${o.v}" data-key="${d.key}-${o.v}" aria-pressed="${o.v === cur}" ${o.help ? `title="${o.help}"` : ""}>${o.label}</button>`,
        )
        .join("")}</div></div>`;
  const sw = (key: string, label: string, help: string, on: boolean): string =>
    `<div class="set-row"><div class="set-l"><b>${label}</b><span class="hd-dim">${help}</span></div>
      <button class="hd-btn sm" role="switch" aria-checked="${on}" data-act="switch" data-k="${key}" data-key="sw-${key}">${on ? "On" : "Off"}</button></div>`;

  const draw = (): void => {
    const st = app.store.save.settings;
    audioPanel?.destroy();
    audioPanel = null;
    body.innerHTML = `
      <section class="hd-panel flat set-col"><h2 class="hd-h">Sound</h2><div id="audio-host" class="audio-host"></div></section>
      <section class="hd-panel flat set-col"><h2 class="hd-h">Display</h2>
        <div class="set-row"><div class="set-l"><b>Effects intensity</b><span class="hd-dim">Glow, sparks and screen punch</span></div>
          <input id="fx-range" type="range" min="0" max="100" step="10" value="${Math.round(st.effectsIntensity * 100)}" data-key="fx" aria-label="Effects intensity"><span class="set-val" id="fx-val">${Math.round(st.effectsIntensity * 100)}%</span></div>
        ${sw("reducedFlash", "Reduced flash", "No full-screen flashes", st.reducedFlash)}
        ${sw("reducedMotion", "Reduced motion", "No camera drift, shake or slide-ins", st.reducedMotion)}
        ${seg<"0" | "1" | "2">(
          {
            key: "quality",
            label: "Quality",
            help: "Lower it if the game stutters",
            options: [
              { v: "0", label: "High" },
              { v: "1", label: "Medium" },
              { v: "2", label: "Low" },
            ],
          },
          String(app.tier) as "0" | "1" | "2",
        )}
      </section>
      <section class="hd-panel flat set-col"><h2 class="hd-h">Typing</h2>
        ${seg<"gentle" | "strict" | "zen">(
          {
            key: "comboMode",
            label: "Combo mode",
            help: "What a typo does to your combo",
            options: [
              { v: "gentle", label: "Gentle", help: "A typo halves the combo" },
              { v: "strict", label: "Strict", help: "A typo resets the combo and costs charge" },
              { v: "zen", label: "Zen", help: "Typos never hurt the combo" },
            ],
          },
          st.comboMode,
        )}
        ${seg<"auto" | "strict">(
          {
            key: "caseMode",
            label: "Case mode",
            help: "Auto ignores capitals in Chapter 1 sentences. For no capitals at all, turn on Ignore capitals.",
            options: [
              { v: "auto", label: "Auto" },
              { v: "strict", label: "Exact" },
            ],
          },
          st.caseMode,
        )}
        ${sw("caseAssist", "Ignore capitals", "Accessibility. From Chapter II, sentences count a capital as its lowercase letter, so you never need Shift. Free: stars and rewards do not change.", st.caseAssist === true)}
        ${seg<"story" | "standard" | "hard" | "zen">(
          {
            key: "difficulty",
            label: "Difficulty",
            help: "Zen: enemies never attack, one star per level",
            options: [
              { v: "story", label: "Story" },
              { v: "standard", label: "Standard" },
              { v: "hard", label: "Hard" },
              { v: "zen", label: "Zen" },
            ],
          },
          st.difficulty,
        )}
        ${sw("autoUnlock", "Auto-unlock target", "Three wrong keys in a row drop the lock", st.autoUnlock)}
        <div class="set-row"><div class="set-l"><b>Journal translation language</b><span class="hd-dim">A tag like es or pt-BR, shown in the Word Journal</span></div>
          <input id="lang" class="hd-input sm" type="text" maxlength="12" autocomplete="off" spellcheck="false" value="${st.translationLang ?? ""}" data-key="lang" aria-label="Translation language"></div>
      </section>
      <section class="hd-panel flat set-help"><h2 class="hd-h">Help</h2>
        <div class="set-row"><div class="set-l"><b>How to play</b><span class="hd-dim">Controls and combat in one page</span></div>
          <button class="hd-btn sm" data-act="help" data-key="help">Open</button></div>
        <div class="set-row"><div class="set-l"><b>Replay tutorial</b><span class="hd-dim">Play Level 1 again with the guided tips</span></div>
          <button class="hd-btn sm" data-act="replay-tutorial" data-key="replay-tutorial">Play</button></div>
      </section>`;
    const host = body.querySelector("#audio-host") as HTMLElement;
    if (app.audio) {
      const p = createAudioSettingsPanel(app.audio);
      p.el.classList.add("audio-themed");
      host.append(p.el);
      audioPanel = p;
    } else {
      host.innerHTML = `<p class="hd-dim">Audio is turned off for this session.</p>`;
    }
    if (keep) {
      (body.querySelector(`[data-key="${keep}"]`) as HTMLElement | null)?.focus();
      keep = null;
    }
  };
  draw();

  // the audio panel writes straight into the engine; mirror it into the save (volumes are part of the profile)
  const offAudio = app.audio?.onSettingsChange((a) => {
    app.store.patchSettings({
      volumes: {
        master: a.master.volume,
        sfx: a.sfx.volume,
        ambience: a.ambience.volume,
        music: a.music.volume,
        ui: a.ui.volume,
      },
    });
  });
  if (offAudio) app.track(offAudio);

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "fx-range") {
      const v = Number(t.value) / 100;
      (body.querySelector("#fx-val") as HTMLElement).textContent = `${t.value}%`;
      app.store.patchSettings({ effectsIntensity: v });
    } else if (t.id === "lang") {
      app.store.patchSettings({ translationLang: t.value.trim() === "" ? null : t.value.trim() });
    }
  });

  actions(root, {
    help: () => {
      const box = el("hd-panel app-confirm");
      box.style.width = "700px";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "How to play");
      box.innerHTML = `${HOW_TO_PLAY_HTML}<div class="btns" style="margin-top:14px"><button class="hd-btn primary" data-act="close" data-autofocus>Close (Esc)</button></div>`;
      const close = app.openModal(box);
      actions(box, { close: () => close() });
    },
    "replay-tutorial": () => {
      app.sfx("uiConfirm");
      void app.play(FIRST_LEVEL);
    },
    seg: (t) => {
      const k = t.dataset.k as string;
      const v = t.dataset.v as string;
      keep = `${k}-${v}`;
      if (k === "quality") {
        const tier = Number(v) as QualityTier;
        app.tier = tier;
        try {
          localStorage.setItem(QUALITY_KEY, String(tier));
        } catch {
          /* private mode */
        }
        app.rebuildBackdrop();
      } else {
        app.store.patchSettings({ [k]: v } as never);
      }
      app.sfx("uiClick");
      draw();
    },
    switch: (t) => {
      const k = t.dataset.k as "reducedFlash" | "reducedMotion" | "autoUnlock" | "caseAssist";
      const next = !app.store.save.settings[k];
      keep = `sw-${k}`;
      app.store.patchSettings({ [k]: next });
      if (k === "reducedMotion") app.setBackdropMotion(next);
      app.sfx("uiClick");
      draw();
    },
  });
  return {
    root,
    focus: () => (body.querySelector("[data-key=fx]") as HTMLElement | null)?.focus(),
    back: () => {
      app.go(app.from);
      return true;
    },
    dispose: () => audioPanel?.destroy(),
  };
}
