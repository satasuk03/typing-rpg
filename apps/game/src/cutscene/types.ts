/**
 * Cutscene timeline types (interfaces.md v2.2 §14.4). Presentation only: nothing here touches the sim.
 * Names (cue kinds, ids, `StageDirector` methods) are binding across P3.1..P3.6.
 */
import type { MusicState, Sfx } from "../audio/types";
import type { CameraPose } from "../render/camera";
import type { HeroAnim, HeroCutsceneAnimKey } from "../render/sprites/artTypes";

export type Ms = number;
export type Ease = "cut" | "linear" | "in" | "out" | "inOut";
/** Poses the StageDirector resolves from the layout/stage (BATTLE_POSE, BOSS_INTRO_POSE, anchors). */
export type CameraAnchor = "walk" | "battle" | "bossIntro" | "hero" | "boss" | "gate";
export type ActorRef = "hero" | "boss" | `prop:${string}`;

/** World VFX (render/vfx/prologue, P3.2). One P0.2 spec row per id. */
export const PROLOGUE_VFX_IDS = [
  "inkRise",
  "skyTear",
  "hushBolt",
  "ward",
  "surgeAura",
  "catchFireball",
  "inkWrite",
  "theftStream",
  "auraCollapse",
  "gateDarken",
  "letterVortex",
  "silenceFog",
  "ember",
] as const;
export type PrologueVfxId = (typeof PROLOGUE_VFX_IDS)[number];

/** HUD cues (hud/prologue, P3.3). Drawn on the HUD canvas, above WebGL. */
export type PrologueHudCue =
  | { id: "kitShatter"; index: number }
  | { id: "passivesDim" }
  | { id: "caption"; text: string }
  | { id: "ink"; text: string; charMs: Ms }
  | { id: "colourSwirl"; on: boolean }
  | { id: "shardsReturn" };

export type HeroCutsceneAnim = HeroAnim | HeroCutsceneAnimKey;
export type NulAnim = "idle" | "cast" | "write" | "catch" | "hurt" | "rise";
export type Speaker = "nul" | "knight";

export const HERO_CUTSCENE_ANIMS: readonly HeroCutsceneAnim[] = [
  "idle",
  "walk",
  "raise",
  "slash",
  "cast",
  "hurt",
  "win",
  "kneel",
  "rise",
  "reach",
  "swordOut",
];
export const NUL_ANIMS: readonly NulAnim[] = ["idle", "cast", "write", "catch", "hurt", "rise"];

/**
 * Optional fields: `shakeMs` (camera cues) is how long the shake lasts (default 300). `dur` is the ease time into
 * the pose on `camera`; the blend time on `mood`; the move time on `actor`; and how long the cue stays active on
 * `vfx` (default 2000) and `hud caption` (default 2500).
 */
export type Cue = { at: Ms; dur?: Ms } & (
  | {
      kind: "camera";
      pose: Partial<CameraPose> | { anchor: CameraAnchor; offset?: Partial<CameraPose> };
      ease: Ease;
      shake?: number;
      shakeMs?: Ms;
    }
  | {
      kind: "actor";
      who: ActorRef;
      anim?: HeroCutsceneAnim | NulAnim;
      move?: { dx: number; dz: number };
      visible?: boolean;
      tint?: string;
    }
  | {
      kind: "vfx";
      id: PrologueVfxId;
      from?: ActorRef;
      to?: ActorRef;
      params?: Readonly<Record<string, number | string>>;
    }
  | { kind: "sfx"; id: Sfx }
  | { kind: "music"; state?: MusicState; motif?: "spark"; silence?: number }
  | { kind: "mood"; to: "base" | "unwritten" | number }
  | { kind: "hud"; cue: PrologueHudCue }
  | { kind: "line"; speaker: Speaker; text: string }
  | { kind: "startPlay" }
  | { kind: "end" }
);
export type CueKind = Cue["kind"];

/** "standalone": hero and Nul at their layout anchors, no adds (stills, replay jumps). "continue": take over the live stage. */
export interface Timeline {
  id: "prologue.open" | "prologue.unwriting" | "prologue.test";
  durationMs: Ms;
  setup: "standalone" | "continue";
  cues: readonly Cue[];
}

// ---------------------------------------------------------------------------------------------- evaluation I/O

/** What the world gives the pure evaluator (anchor poses etc.). All plain data. */
export interface EvalEnv {
  /** The pose before any camera cue (the stage's own). */
  basePose: CameraPose;
  /** Resolved anchor poses. Missing anchors fall back to `basePose`. */
  anchors?: Partial<Record<CameraAnchor, CameraPose>>;
  /** Reduced motion: camera moves become cuts, no shake. */
  reducedMotion?: boolean;
  /** Scales the shake (accessibility `effectsIntensity`, 0..1). */
  effectsIntensity?: number;
}

export interface ActorState {
  dx: number;
  dz: number;
  visible: boolean;
  anim: HeroCutsceneAnim | NulAnim | null;
  /** ms since `anim` was set (drives the frame). */
  animAgeMs: Ms;
  tint: string | null;
}

export interface ActiveVfx {
  index: number;
  id: PrologueVfxId;
  from?: ActorRef;
  to?: ActorRef;
  params?: Readonly<Record<string, number | string>>;
  ageMs: Ms;
  /** Fixed per cue: hash of (id, at, index). Feed to `simulateParticles`. */
  seed: number;
}

export interface HudState {
  caption: string | null;
  /** The visible part of the ink text (one letter per `charMs`). */
  ink: { text: string; shown: string } | null;
  kitShattered: readonly number[];
  passivesDim: boolean;
  colourSwirl: boolean;
  /** ms since `shardsReturn` started, or null. */
  shardsReturnAgeMs: Ms | null;
}

export interface CutsceneState {
  t: Ms;
  camera: CameraPose;
  /** World-unit camera shake offset (x, y), already scaled by motion settings. */
  shake: { x: number; y: number };
  /** 0 = the layout's own mood, 1 = UNWRITTEN. */
  moodBlend: number;
  actors: Readonly<Record<string, ActorState>>;
  vfx: readonly ActiveVfx[];
  hud: HudState;
  music: { state: MusicState | null; silence: number };
  line: { speaker: Speaker; text: string; ageMs: Ms; holdMs: Ms } | null;
  /** True once `startPlay` has been reached. */
  playStarted: boolean;
  ended: boolean;
}

/** Validation registries (injectable so tests can pass bad ones). */
export interface Registries {
  vfx: ReadonlySet<string>;
  sfx: ReadonlySet<string>;
  heroAnims: ReadonlySet<string>;
  nulAnims: ReadonlySet<string>;
  /** Optional A2 allow-list (lowercase). When absent, words are checked for length only. */
  a2Words?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------------------------- the seam

/** Narrow world-side seam implemented by `LevelStage.director()` (and by the dev scene's standalone director). */
export interface StageDirector {
  heroActor(): unknown;
  bossActor(): unknown;
  prop(id: string): unknown;
  setCameraOverride(pose: CameraPose | null): void;
  /** A BiomeMood blend; null = the layout's own. */
  setMood(mood: unknown | null): void;
  setLetterbox(on: boolean): void;
  setHeroAnim(anim: HeroCutsceneAnim | null, ageMs?: Ms): void;
  /** P3.1 addition: the player's evaluated actor state (offset from home, visibility, tint). null clears. */
  setActorState(
    who: ActorRef,
    state: Pick<ActorState, "dx" | "dz" | "visible" | "tint"> | null,
  ): void;
}
