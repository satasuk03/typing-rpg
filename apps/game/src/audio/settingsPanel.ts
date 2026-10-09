import type { AudioEngine } from "./engine";
import { BUS_IDS, type MixerChannel, type Sfx } from "./types";

const LABELS: Record<MixerChannel, string> = {
  master: "Master",
  sfx: "Effects",
  ui: "Interface",
  ambience: "Ambience",
  music: "Music",
};

const TEST_BUTTONS: { label: string; id: Sfx; bus: string }[] = [
  { label: "Test effect", id: "perfectWord", bus: "sfx" },
  { label: "Test interface", id: "uiConfirm", bus: "ui" },
];

export interface AudioSettingsPanel {
  el: HTMLElement;
  destroy(): void;
}

/**
 * Framework-free audio settings panel: a slider and mute toggle per channel plus test buttons.
 * Uses native range/checkbox/button elements, so it is keyboard accessible (Tab, arrows, Space).
 * The UI engineer mounts `panel.el` wherever it should live.
 */
export function createAudioSettingsPanel(engine: AudioEngine): AudioSettingsPanel {
  const root = document.createElement("section");
  root.setAttribute("aria-label", "Audio settings");
  root.style.cssText =
    "display:grid;gap:8px;padding:12px 16px;min-width:280px;background:rgba(10,12,20,.92);color:#f3e7c0;font:14px system-ui,sans-serif;border:1px solid #5a4b2a;border-radius:6px";

  const title = document.createElement("h2");
  title.textContent = "Audio";
  title.style.cssText = "margin:0 0 4px;font-size:16px";
  root.append(title);

  const sliders = new Map<MixerChannel, HTMLInputElement>();
  const mutes = new Map<MixerChannel, HTMLInputElement>();

  const settings = engine.getSettings();
  for (const ch of ["master", ...BUS_IDS] as MixerChannel[]) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center";
    const id = `audio-${ch}`;

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = LABELS[ch];

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = id;
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.value = String(Math.round(settings[ch].volume * 100));
    slider.setAttribute("aria-label", `${LABELS[ch]} volume`);
    slider.addEventListener("input", () => engine.setVolume(ch, Number(slider.value) / 100));
    sliders.set(ch, slider);

    const muteLabel = document.createElement("label");
    muteLabel.style.cssText = "display:flex;gap:4px;align-items:center";
    const mute = document.createElement("input");
    mute.type = "checkbox";
    mute.checked = settings[ch].muted;
    mute.setAttribute("aria-label", `Mute ${LABELS[ch]}`);
    mute.addEventListener("change", () => engine.setMuted(ch, mute.checked));
    mutes.set(ch, mute);
    muteLabel.append(mute, document.createTextNode("Mute"));

    row.append(label, slider, muteLabel);
    root.append(row);
  }

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:8px;margin-top:4px";
  for (const b of TEST_BUTTONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    btn.addEventListener("click", () => {
      engine.ensureContext();
      engine.play(b.id);
    });
    buttons.append(btn);
  }
  root.append(buttons);

  const off = engine.onSettingsChange((s) => {
    for (const ch of sliders.keys()) {
      const sl = sliders.get(ch);
      const mu = mutes.get(ch);
      if (sl && Number(sl.value) !== Math.round(s[ch].volume * 100))
        sl.value = String(Math.round(s[ch].volume * 100));
      if (mu) mu.checked = s[ch].muted;
    }
  });

  return {
    el: root,
    destroy() {
      off();
      root.remove();
    },
  };
}
