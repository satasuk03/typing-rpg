import { Ambience } from "./ambience";
import { Mixer } from "./mixer";
import { Music } from "./music";
import {
  type AudioSettings,
  clamp01,
  cloneSettings,
  loadSettings,
  localStorageAdapter,
  type StorageLike,
  saveSettings,
} from "./settings";
import { busFor, SFX_VOICES } from "./sfx";
import { Synth } from "./synth";
import { mulberry32 } from "./tiers";
import type { BiomeName, MixerChannel, MusicState, Rng, Sfx, SfxParams } from "./types";

export interface AudioEngineOptions {
  /** Persistence for volume settings. Default: guarded localStorage (or none if unavailable). */
  storage?: StorageLike | null;
  /** PRNG for sound variation. Default: seeded mulberry32 (never Math.random). */
  rng?: Rng;
  /** Override context creation (tests). */
  contextFactory?: () => AudioContext;
  /** Run the internal lookahead timer. Default true; set false and call `update()` yourself. */
  autoDrive?: boolean;
}

const AMBIENCE_AHEAD = 0.6;
const MUSIC_AHEAD = 0.3;
const DRIVE_MS = 50;

/**
 * Game audio engine: lazy AudioContext (created/resumed on the first user gesture), mixer buses,
 * procedural SFX, per-biome ambience and music layers.
 *
 * Hot path: `play('key', {streak})` is synchronous, allocates only a handful of Web Audio nodes,
 * performs no awaits and no reverb sends.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private synth: Synth | null = null;
  private ambience: Ambience | null = null;
  private music: Music | null = null;
  private settings: AudioSettings;
  private readonly storage: StorageLike | null;
  private readonly rng: Rng;
  private readonly contextFactory: () => AudioContext;
  private readonly autoDrive: boolean;
  private biome: BiomeName = "forest";
  private musicState: MusicState = "walk";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: AudioSettings) => void>();
  private unlockCleanup: (() => void) | null = null;

  constructor(opts: AudioEngineOptions = {}) {
    this.storage = opts.storage === undefined ? localStorageAdapter() : opts.storage;
    this.rng = opts.rng ?? mulberry32(0x9e3779b9);
    this.contextFactory =
      opts.contextFactory ??
      (() => {
        const AC =
          globalThis.AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) throw new Error("Web Audio not supported");
        return new AC({ latencyHint: "interactive" });
      });
    this.autoDrive = opts.autoDrive ?? true;
    this.settings = loadSettings(this.storage);
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Create the context (once) and resume it. Must be called from a user gesture the first time. */
  ensureContext(): boolean {
    if (!this.ctx) {
      try {
        const ctx = this.contextFactory();
        const mixer = new Mixer(ctx, this.rng);
        const synth = new Synth(ctx, mixer, this.rng);
        this.ctx = ctx;
        this.mixer = mixer;
        this.synth = synth;
        mixer.apply(this.settings, true);
        this.ambience = new Ambience(synth);
        this.music = new Music(synth);
        this.ambience.setBiome(this.biome, 0.05);
        this.music.setBiome(this.biome);
        this.music.setState(this.musicState);
        this.music.start();
        this.drive();
      } catch (err) {
        console.warn("[audio] init failed", err);
        this.ctx = null;
        return false;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return true;
  }

  /** Create/resume the context on the first keydown or pointerdown (capture phase, so it runs first). */
  unlockOnGesture(target: EventTarget = window): () => void {
    this.unlockCleanup?.();
    const handler = (): void => {
      this.ensureContext();
    };
    target.addEventListener("keydown", handler, { capture: true });
    target.addEventListener("pointerdown", handler, { capture: true });
    const cleanup = (): void => {
      target.removeEventListener("keydown", handler, { capture: true });
      target.removeEventListener("pointerdown", handler, { capture: true });
    };
    this.unlockCleanup = cleanup;
    return cleanup;
  }

  /** Play a sound effect now. Returns false when nothing was scheduled (no context yet or bus muted). */
  play(id: Sfx, params: SfxParams = {}): boolean {
    const ctx = this.ctx;
    const synth = this.synth;
    const mixer = this.mixer;
    if (!ctx || !synth || !mixer) return false;
    if (!mixer.isAudible("master") || !mixer.isAudible(busFor(id))) return false;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    try {
      SFX_VOICES[id](synth, t, params);
      return true;
    } catch (err) {
      console.warn("[audio] play failed", id, err);
      return false;
    }
  }

  setBiome(b: BiomeName): void {
    this.biome = b;
    this.ambience?.setBiome(b);
    this.music?.setBiome(b);
  }

  setMusicState(st: MusicState): void {
    this.musicState = st;
    this.music?.setState(st);
  }

  getBiome(): BiomeName {
    return this.biome;
  }

  getMusicState(): MusicState {
    return this.musicState;
  }

  // ---- settings ----

  getSettings(): AudioSettings {
    return cloneSettings(this.settings);
  }

  setVolume(ch: MixerChannel, v: number): void {
    this.settings[ch].volume = clamp01(v);
    this.commit();
  }

  setMuted(ch: MixerChannel, m: boolean): void {
    this.settings[ch].muted = m;
    this.commit();
  }

  onSettingsChange(fn: (s: AudioSettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit(): void {
    this.mixer?.apply(this.settings);
    saveSettings(this.storage, this.settings);
    for (const fn of this.listeners) fn(this.getSettings());
  }

  // ---- scheduling ----

  /** Run the lookahead schedulers once. Called by the internal timer, or by the game loop if autoDrive=false. */
  update(): void {
    const ctx = this.ctx;
    if (ctx?.state !== "running") return;
    const now = ctx.currentTime;
    this.ambience?.schedule(now, AMBIENCE_AHEAD);
    this.music?.schedule(now, MUSIC_AHEAD);
  }

  private drive(): void {
    if (!this.autoDrive || this.timer !== null) return;
    const loop = (): void => {
      this.update();
      this.timer = setTimeout(loop, DRIVE_MS);
    };
    this.timer = setTimeout(loop, DRIVE_MS);
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.unlockCleanup?.();
    this.unlockCleanup = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.mixer = null;
    this.synth = null;
    this.ambience = null;
    this.music = null;
  }
}
