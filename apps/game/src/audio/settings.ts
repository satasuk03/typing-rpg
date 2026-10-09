import { MIXER_CHANNELS, type MixerChannel } from "./types";

export interface ChannelSetting {
  volume: number; // 0..1 (slider position)
  muted: boolean;
}
export type AudioSettings = Record<MixerChannel, ChannelSetting>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_KEY = "hd2d.audio.v1";

export const DEFAULT_SETTINGS: AudioSettings = {
  master: { volume: 0.8, muted: false },
  sfx: { volume: 0.9, muted: false },
  ui: { volume: 0.8, muted: false },
  ambience: { volume: 0.6, muted: false },
  music: { volume: 0.5, muted: false },
};

export const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;

/** Perceptual taper: slider position -> linear gain. Muted always yields silence. */
export function channelGain(volume: number, muted: boolean): number {
  if (muted) return 0;
  const v = clamp01(volume);
  return v * v;
}

export function cloneSettings(s: AudioSettings): AudioSettings {
  const out = {} as AudioSettings;
  for (const c of MIXER_CHANNELS) out[c] = { ...s[c] };
  return out;
}

/** localStorage adapter that never throws (private windows, blocked storage). */
export function localStorageAdapter(): StorageLike | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}

export function loadSettings(storage: StorageLike | null): AudioSettings {
  const out = cloneSettings(DEFAULT_SETTINGS);
  if (!storage) return out;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return out;
  }
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<MixerChannel, Partial<ChannelSetting>>>;
    for (const c of MIXER_CHANNELS) {
      const p = parsed?.[c];
      if (!p || typeof p !== "object") continue;
      if (typeof p.volume === "number") out[c].volume = clamp01(p.volume);
      if (typeof p.muted === "boolean") out[c].muted = p.muted;
    }
  } catch {
    /* corrupt blob: fall back to defaults */
  }
  return out;
}

export function saveSettings(storage: StorageLike | null, s: AudioSettings): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
