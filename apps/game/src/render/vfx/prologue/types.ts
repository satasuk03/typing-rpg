/** Shared types of the prologue VFX (P3.2). Pure: no three.js. */
import type { ActorRef, PrologueVfxId } from "../../../cutscene/types";

export type { PrologueVfxId };

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** The Word Gate prop: its foot centre and the layout scale (0.85). */
export interface GateInfo extends V3 {
  scale: number;
}

/** A runestone prop (`prop.prologue.runestone.<n>`): its foot, layout scale and flip. */
export interface RuneStone extends V3 {
  /** 0..2: which of the three stones (it picks the glyph column). */
  n: number;
  scale: number;
  flip: boolean;
}

/** Where things are in the world. The level stage (or the dev scene) supplies it each frame; the cues never place themselves. */
export interface PrologueAnchors {
  /** Hero foot position. */
  hero(out: V3): void;
  /** Nul's foot position (including any lift while he rises). False when he is not on stage. */
  boss(out: V3): boolean;
  /** The Word Gate foot and prop scale. */
  gate(out: GateInfo): void;
  /** The sky-tear anchor (layout marker `tear`). */
  tear(out: V3): void;
  /** Centre of enemy `id`'s feet (for `inkRise` on a spawn). False when unknown. */
  enemy(id: number, out: V3): boolean;
  /** The runestones (their lit letters go dark with the gate's). Optional: absent = the gate only. Returns how many were written. */
  runes?(out: RuneStone[]): number;
}

/** One live cue for a frame: what the cutscene engine's `ActiveVfx` carries, plus nothing else. */
export interface CueInstance {
  id: PrologueVfxId;
  /** Ms since the cue started. */
  ageMs: number;
  /** Fixed per cue (`hashSeed(id, at, index)`); the same seed + age is the same picture. */
  seed: number;
  params?: Readonly<Record<string, number | string>>;
  from?: ActorRef;
  to?: ActorRef;
}

/** What the cues ask of the rest of the render stack for this frame (the host applies it). */
export interface PrologueOut {
  /** Extra post vignette (`PostEffects.vignetteBoost`), max over the cues. */
  vignette: number;
  /** Post flash mix (capped), max over the cues, already scaled by reducedFlash. */
  flash: number;
  /** Mood fog density override (`silenceFog`), or null. */
  fogDensity: number | null;
  /** Hero rim flash (`hushBolt` impact): amount 0..1. */
  heroRim: number;
  /** `HeroAura` requests: the surge multiplier of a scripted `surgeAura`, the collapse age, or null. */
  auraSurge: number | null;
  auraCollapseMs: number | null;
}

export type CueRenderer = (c: import("./ctx").FxCtx, i: CueInstance) => void;
