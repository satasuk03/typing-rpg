/**
 * Pure cutscene evaluation. No DOM, no three.js, no clocks, no Math.random: `evaluate(tl, t, lineClock, env)` is a
 * pure function, so `seek(t)` twice gives identical state. Node-tested.
 */
import { SFX_IDS } from "../audio/types";
import type { CameraPose } from "../render/camera";
import {
  type ActiveVfx,
  type ActorRef,
  type ActorState,
  type CameraAnchor,
  type Cue,
  type CutsceneState,
  type Ease,
  type EvalEnv,
  HERO_CUTSCENE_ANIMS,
  type HudState,
  type Ms,
  NUL_ANIMS,
  PROLOGUE_VFX_IDS,
  type Registries,
  type Timeline,
} from "./types";

export const DEFAULT_VFX_MS = 2000;
export const DEFAULT_CAPTION_MS = 2500;
export const DEFAULT_SHAKE_MS = 300;
export const MOOD_EASE_MS_DEFAULT = 0;
/** Max words in a cutscene line (plan §3.2). */
export const MAX_LINE_WORDS = 8;
/** Without an A2 list, any single word longer than this is rejected. */
export const MAX_WORD_LETTERS = 10;
/** Fixed particle step: 1/60 s. */
export const PARTICLE_STEP_MS = 1000 / 60;

export const DEFAULT_REGISTRIES: Registries = {
  vfx: new Set<string>(PROLOGUE_VFX_IDS),
  sfx: new Set<string>(SFX_IDS),
  heroAnims: new Set<string>(HERO_CUTSCENE_ANIMS),
  nulAnims: new Set<string>(NUL_ANIMS),
};

const FALLBACK_ENV: EvalEnv = {
  basePose: { x: 0, y: 1.75, dist: 19.5, pitch: 11, fov: 32 },
};

// ---------------------------------------------------------------------------------------------- helpers

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function applyEase(ease: Ease, u: number): number {
  const k = clamp01(u);
  switch (ease) {
    case "cut":
      return 1;
    case "linear":
      return k;
    case "in":
      return k * k * k;
    case "out":
      return 1 - (1 - k) ** 3;
    case "inOut":
      return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  }
}

/** Hold time of a line: `max(2200, 1200 + 60 * chars)` ms. */
export function lineHoldMs(text: string): Ms {
  return Math.max(2200, 1200 + 60 * text.length);
}

export function wordCount(text: string): number {
  const w = text.trim().split(/\s+/);
  return w.length === 1 && w[0] === "" ? 0 : w.length;
}

/** Small seeded RNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string plus two ints. */
export function hashSeed(id: string, at: number, index: number): number {
  let h = 2166136261;
  const s = `${id}|${Math.round(at)}|${index}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function lerpPose(a: CameraPose, b: CameraPose, k: number): CameraPose {
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    dist: lerp(a.dist, b.dist, k),
    pitch: lerp(a.pitch, b.pitch, k),
    fov: lerp(a.fov, b.fov, k),
  };
}

type CamCue = Extract<Cue, { kind: "camera" }>;

function resolveTarget(prev: CameraPose, cue: CamCue, env: EvalEnv): CameraPose {
  const p = cue.pose;
  if ("anchor" in p) {
    const base = env.anchors?.[p.anchor as CameraAnchor] ?? env.basePose;
    const o = p.offset ?? {};
    return {
      x: base.x + (o.x ?? 0),
      y: base.y + (o.y ?? 0),
      dist: base.dist + (o.dist ?? 0),
      pitch: base.pitch + (o.pitch ?? 0),
      fov: base.fov + (o.fov ?? 0),
    };
  }
  return { ...prev, ...p };
}

interface CamSeg {
  at: Ms;
  dur: Ms;
  ease: Ease;
  from: CameraPose;
  to: CameraPose;
}

function segPose(s: CamSeg, t: Ms): CameraPose {
  if (s.dur <= 0 || s.ease === "cut") return s.to;
  return lerpPose(s.from, s.to, applyEase(s.ease, (t - s.at) / s.dur));
}

function cameraAt(cues: readonly Cue[], t: Ms, env: EvalEnv): CameraPose {
  const reduced = env.reducedMotion === true;
  let segPrev: CamSeg | null = null;
  let cur: CameraPose = env.basePose;
  for (const c of cues) {
    if (c.kind !== "camera") continue;
    if (c.at > t) break;
    // continue from wherever the previous segment is at this cue's start (an overlapped ease stays continuous)
    const from: CameraPose = segPrev ? segPose(segPrev, c.at) : env.basePose;
    const to = resolveTarget(from, c, env);
    const seg: CamSeg = {
      at: c.at,
      dur: reduced ? 0 : (c.dur ?? 0),
      ease: reduced ? "cut" : c.ease,
      from,
      to,
    };
    segPrev = seg;
    cur = segPose(seg, t);
  }
  return cur;
}

function shakeAt(cues: readonly Cue[], t: Ms, env: EvalEnv): { x: number; y: number } {
  if (env.reducedMotion === true) return { x: 0, y: 0 };
  const scale = env.effectsIntensity ?? 1;
  let x = 0;
  let y = 0;
  for (const c of cues) {
    if (c.kind !== "camera" || c.shake === undefined || c.shake <= 0) continue;
    if (c.at > t) break;
    const len = c.shakeMs ?? DEFAULT_SHAKE_MS;
    const age = t - c.at;
    if (age >= len) continue;
    const env01 = Math.min(1, ((len - age) / len) * 4) * (1 - age / len);
    const s = t / 1000;
    const m = c.shake * scale * 0.12 * env01;
    x += Math.sin(s * 97.3) * Math.cos(s * 41.7) * m;
    y += Math.sin(s * 83.1 + 1.3) * Math.cos(s * 53.9) * m;
  }
  return { x, y };
}

function moodTarget(to: "base" | "unwritten" | number): number {
  if (to === "base") return 0;
  if (to === "unwritten") return 1;
  return clamp01(to);
}

function moodAt(cues: readonly Cue[], t: Ms, env: EvalEnv): number {
  const reduced = env.reducedMotion === true;
  let from = 0;
  let value = 0;
  let segAt = 0;
  let segDur = 0;
  let segTo = 0;
  for (const c of cues) {
    if (c.kind !== "mood") continue;
    if (c.at > t) break;
    // blend continues from the value at this cue's start
    from = segDur > 0 ? lerp(from, segTo, applyEase("out", (c.at - segAt) / segDur)) : segTo;
    segAt = c.at;
    segDur = reduced ? 0 : (c.dur ?? MOOD_EASE_MS_DEFAULT);
    segTo = moodTarget(c.to);
    value = segDur > 0 ? lerp(from, segTo, applyEase("out", (t - segAt) / segDur)) : segTo;
  }
  return value;
}

function actorsAt(cues: readonly Cue[], t: Ms): Record<string, ActorState> {
  const out: Record<string, ActorState> = {};
  const get = (who: ActorRef): ActorState => {
    let a = out[who];
    if (!a) {
      a = { dx: 0, dz: 0, visible: true, anim: null, animAgeMs: 0, tint: null };
      out[who] = a;
    }
    return a;
  };
  for (const c of cues) {
    if (c.kind !== "actor") continue;
    if (c.at > t) break;
    const a = get(c.who);
    if (c.move) {
      const k = applyEase("inOut", c.dur && c.dur > 0 ? (t - c.at) / c.dur : 1);
      a.dx += c.move.dx * k;
      a.dz += c.move.dz * k;
    }
    if (c.anim !== undefined) {
      a.anim = c.anim;
      a.animAgeMs = t - c.at;
    }
    if (c.visible !== undefined) a.visible = c.visible;
    if (c.tint !== undefined) a.tint = c.tint;
  }
  return out;
}

function hudAt(cues: readonly Cue[], t: Ms): HudState {
  let caption: string | null = null;
  let ink: HudState["ink"] = null;
  const kit: number[] = [];
  let dim = false;
  let swirl = false;
  let shards: number | null = null;
  for (const c of cues) {
    if (c.kind !== "hud") continue;
    if (c.at > t) break;
    const h = c.cue;
    switch (h.id) {
      case "caption":
        if (t < c.at + (c.dur ?? DEFAULT_CAPTION_MS)) caption = h.text;
        break;
      case "ink": {
        const n = h.charMs > 0 ? Math.floor((t - c.at) / h.charMs) + 1 : h.text.length;
        ink = { text: h.text, shown: h.text.slice(0, Math.min(h.text.length, Math.max(0, n))) };
        break;
      }
      case "kitShatter":
        if (!kit.includes(h.index)) kit.push(h.index);
        break;
      case "passivesDim":
        dim = true;
        break;
      case "colourSwirl":
        swirl = h.on;
        break;
      case "shardsReturn":
        shards = t - c.at;
        break;
    }
  }
  kit.sort((a, b) => a - b);
  return {
    caption,
    ink,
    kitShattered: kit,
    passivesDim: dim,
    colourSwirl: swirl,
    shardsReturnAgeMs: shards,
  };
}

function musicAt(cues: readonly Cue[], t: Ms): CutsceneState["music"] {
  let state: CutsceneState["music"]["state"] = null;
  let silence = 0;
  let sFrom = 0;
  let sTo = 0;
  let sAt = 0;
  let sDur = 0;
  for (const c of cues) {
    if (c.kind !== "music") continue;
    if (c.at > t) break;
    if (c.state !== undefined) state = c.state;
    if (c.silence !== undefined) {
      sFrom = sDur > 0 ? lerp(sFrom, sTo, clamp01((c.at - sAt) / sDur)) : sTo;
      sAt = c.at;
      sDur = c.dur ?? 0;
      sTo = clamp01(c.silence);
      silence = sDur > 0 ? lerp(sFrom, sTo, clamp01((t - sAt) / sDur)) : sTo;
    }
  }
  return { state, silence };
}

function vfxAt(cues: readonly Cue[], t: Ms): ActiveVfx[] {
  const out: ActiveVfx[] = [];
  cues.forEach((c, index) => {
    if (c.kind !== "vfx" || c.at > t) return;
    if (t >= c.at + (c.dur ?? DEFAULT_VFX_MS)) return;
    const v: ActiveVfx = {
      index,
      id: c.id,
      ageMs: t - c.at,
      seed: hashSeed(c.id, c.at, index),
    };
    if (c.from !== undefined) v.from = c.from;
    if (c.to !== undefined) v.to = c.to;
    if (c.params !== undefined) v.params = c.params;
    out.push(v);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------- public API

/**
 * The state at timeline time `tMs`. `lineClock` is ms since the current line started while the player is held on a
 * line (then `tMs` equals that line's `at`); pass -1 (or omit) when no line is showing.
 */
export function evaluate(
  tl: Timeline,
  tMs: Ms,
  lineClock = -1,
  env: EvalEnv = FALLBACK_ENV,
): CutsceneState {
  const t = Math.min(Math.max(tMs, 0), tl.durationMs);
  const cues = tl.cues;
  const cam = cameraAt(cues, t, env);
  const shake = shakeAt(cues, t, env);
  let line: CutsceneState["line"] = null;
  if (lineClock >= 0) {
    for (const c of cues) {
      if (c.kind === "line" && c.at === t) {
        line = { speaker: c.speaker, text: c.text, ageMs: lineClock, holdMs: lineHoldMs(c.text) };
        break;
      }
    }
  }
  let playStarted = false;
  let ended = t >= tl.durationMs;
  for (const c of cues) {
    if (c.at > t) break;
    if (c.kind === "startPlay") playStarted = true;
    if (c.kind === "end") ended = true;
  }
  return {
    t,
    camera: { ...cam, x: cam.x + shake.x, y: cam.y + shake.y },
    shake,
    moodBlend: moodAt(cues, t, env),
    actors: actorsAt(cues, t),
    vfx: vfxAt(cues, t),
    hud: hudAt(cues, t),
    music: musicAt(cues, t),
    line,
    playStarted,
    ended,
  };
}

/** Where a skip lands: everything applied, nothing mid-flight, no line, no active VFX. */
export function endState(tl: Timeline, env: EvalEnv = FALLBACK_ENV): CutsceneState {
  const s = evaluate(tl, tl.durationMs, -1, env);
  return { ...s, vfx: [], line: null, ended: true, playStarted: s.playStarted };
}

/** Cues whose `at` is in (t0, t1], plus those at 0 when `t0 < 0`. Used for edge-triggered cues (sfx, music, ...). */
export function cuesBetween(tl: Timeline, t0: Ms, t1: Ms): Cue[] {
  return tl.cues.filter((c) => (c.at > t0 || (t0 < 0 && c.at === 0)) && c.at <= t1);
}

// ---------------------------------------------------------------------------------------------- particles

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 at birth, 0 at death. */
  life: number;
}

/**
 * Deterministic particle replay: integrates a fixed 1/60 s step from the cue start with a seeded RNG. The same
 * (seed, ageMs, count) always gives the same particles, however the playhead got there. (P3.2's VFX use the same
 * contract; this is the reference implementation tests lock.)
 */
export function simulateParticles(seed: number, ageMs: Ms, count: number): Particle[] {
  const rng = mulberry32(seed);
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const sp = 0.5 + rng() * 1.5;
    ps.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.8, life: 1 });
  }
  const steps = Math.max(0, Math.floor(ageMs / PARTICLE_STEP_MS + 1e-9));
  const dt = 1 / 60;
  for (let s = 0; s < steps; s++) {
    for (const p of ps) {
      p.vy -= 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life = Math.max(0, p.life - dt / 1.5);
    }
  }
  return ps;
}

// ---------------------------------------------------------------------------------------------- validation

/** Returns a list of problems (empty = valid). */
export function validate(tl: Timeline, registries: Registries = DEFAULT_REGISTRIES): string[] {
  const errs: string[] = [];
  const err = (i: number, msg: string): void => {
    errs.push(`${tl.id} cue #${i}: ${msg}`);
  };
  if (!(tl.durationMs > 0) || !Number.isFinite(tl.durationMs)) {
    errs.push(`${tl.id}: durationMs must be a positive number`);
  }
  let prevAt = -Infinity;
  let prevCamEnd = -Infinity;
  let startPlays = 0;
  tl.cues.forEach((c, i) => {
    if (!Number.isFinite(c.at) || c.at < 0) err(i, `bad at ${c.at}`);
    else if (c.at > tl.durationMs) err(i, `at ${c.at} is after durationMs ${tl.durationMs}`);
    if (c.at < prevAt) err(i, `cues not sorted by at (${c.at} after ${prevAt})`);
    prevAt = Math.max(prevAt, c.at);
    if (c.dur !== undefined && !(c.dur >= 0)) err(i, `bad dur ${c.dur}`);
    switch (c.kind) {
      case "camera": {
        if (c.at < prevCamEnd && c.ease === "cut") {
          err(i, `camera cue overlaps the previous move but has ease "cut"`);
        }
        prevCamEnd = c.at + (c.dur ?? 0);
        if (c.shake !== undefined && !(c.shake >= 0)) err(i, `bad shake ${c.shake}`);
        break;
      }
      case "actor":
        if (c.who.startsWith("prop:") && c.who.length <= 5) err(i, `empty prop id`);
        if (c.anim !== undefined) {
          const ok =
            c.who === "hero"
              ? registries.heroAnims.has(c.anim)
              : c.who === "boss"
                ? registries.nulAnims.has(c.anim)
                : false;
          if (!ok) err(i, `unknown anim "${c.anim}" for ${c.who}`);
        }
        break;
      case "vfx":
        if (!registries.vfx.has(c.id)) err(i, `unknown vfx id "${c.id}"`);
        break;
      case "sfx":
        if (!registries.sfx.has(c.id)) err(i, `unknown sfx id "${c.id}"`);
        break;
      case "music":
        if (c.silence !== undefined && !(c.silence >= 0 && c.silence <= 1)) {
          err(i, `music silence ${c.silence} not in 0..1`);
        }
        break;
      case "mood":
        if (typeof c.to === "number" && !(c.to >= 0 && c.to <= 1)) {
          err(i, `mood blend ${c.to} not in 0..1`);
        }
        break;
      case "hud": {
        const h = c.cue;
        if (h.id === "kitShatter" && !(Number.isInteger(h.index) && h.index >= 0)) {
          err(i, `kitShatter index ${h.index}`);
        }
        if (h.id === "ink" && !(h.charMs > 0)) err(i, `ink charMs must be > 0`);
        if ((h.id === "caption" || h.id === "ink") && h.text.trim() === "") err(i, `empty text`);
        break;
      }
      case "line": {
        const n = wordCount(c.text);
        if (n === 0) err(i, `empty line`);
        if (n > MAX_LINE_WORDS) err(i, `line has ${n} words (max ${MAX_LINE_WORDS}): "${c.text}"`);
        for (const raw of c.text.split(/\s+/)) {
          const w = raw.toLowerCase().replace(/[^a-z']/g, "");
          if (w === "") continue;
          if (registries.a2Words) {
            if (!registries.a2Words.has(w)) err(i, `word "${w}" is not on the A2 list`);
          } else if (w.length > MAX_WORD_LETTERS) {
            err(i, `word "${w}" is too long for A2 English`);
          }
        }
        break;
      }
      case "startPlay":
        startPlays++;
        if (startPlays > 1) err(i, `more than one startPlay`);
        break;
      case "end":
        break;
    }
  });
  return errs;
}
