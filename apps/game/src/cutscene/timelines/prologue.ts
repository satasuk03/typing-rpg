/**
 * The real prologue timelines (P3.6): Part A "cold open" and Part C "The Unwriting" (docs/PROLOGUE_PLAN.md §2, camera
 * keyframes and the theft ramp in docs/vfx/prologue-art-direction.md §2.3, §4, §5). Part B (the playable) is the sim.
 *
 * Times are ms on the TIMELINE clock. A `line` cue holds that clock (and every scripted cue with it) until the reader
 * presses Space/Enter or `lineHoldMs` passes, so a line is placed at the END of the shot it belongs to (the camera has
 * arrived, the effect has played), and the next move starts after it. Everything else is verbatim from the beat sheet.
 *
 * World constants come from `assets/levels/prologue.json` (`hero` stop and the boss slot of encounter 2, the `gate` /
 * `sword` markers): `cutscene/timelines/prologue.test.ts` checks them against the loaded layout.
 */
import { THEFT_RAMP } from "../../render/biomes";
import type { Cue, Timeline } from "../types";

/** The Word Gate layout's stage: the knight's stop (enc 1 / 2 hero), Nul's slot (enc 2 boss), the gate, the sword. */
export const WORD_GATE = {
  hx: 24,
  nx: 34,
  /** (hx + nx) / 2 */
  mid: 29,
  gx: 34.625,
  /** Where the encounter-1 slots are (ink pools of Part A open here). */
  slots: [
    { x: 29, z: -0.875 },
    { x: 31.6875, z: 0.875 },
    { x: 34.3125, z: -0.3125 },
  ],
} as const;
const { hx, nx, mid } = WORD_GATE;
/** The hero's home before Part A is the layout `start` marker (x 0); the cold open walk begins 8 m along the road. */
const HERO_WALK_FROM = 8;

/** The beat-sheet lines (≤ 8 words each). The unit test pins them. */
export const LINES = {
  nulOpen: "So. The last Ember Knight.",
  nulEnough: "Enough.",
  nulBright: "Your words are bright, little knight.",
  knightEnds: "Your Silence ends here!",
  ink: "I unwrite you.",
  nulQuiet: "Now the world will be quiet.",
  nulNoMore: "No more stories. No more words.",
  knightGone: "My words... are gone.",
  knightSpark: "No. One spark is left.",
  caption: "Long ago, words had power.",
  end: "Find your words again.",
} as const;

/** Part A is 8000 ms; `startPlay` and `end` are the same instant so the stage takes the hero and camera over cleanly. */
export const OPEN_END_MS = 8000;

const sortCues = (cues: Cue[]): Cue[] =>
  cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
    .map((x) => x.c);

// ================================================================================================ Part A

const openCues: Cue[] = [
  // ---- 0.0 black, wind; the caption fades in; the camera is placed under the black
  { at: 0, kind: "camera", pose: { x: hx - 6, y: 2.5, dist: 32, pitch: 26, fov: 30 }, ease: "cut" },
  { at: 0, kind: "hud", cue: { id: "fade", to: 1 } },
  { at: 0, kind: "actor", who: "hero", anim: "idle" },
  { at: 300, dur: 2400, kind: "hud", cue: { id: "caption", text: LINES.caption } },
  // ---- 2.5 fade in, the high crane pushes in, the knight walks up the road at full power
  { at: 2500, dur: 1000, kind: "hud", cue: { id: "fade", to: 0 } },
  {
    at: 2500,
    dur: 3000,
    kind: "camera",
    pose: { x: hx - 2, y: 2.3, dist: 26, pitch: 21, fov: 30 },
    ease: "inOut",
  },
  // the knight starts the walk already on the road in frame (8 m on from the start marker) and arrives at the stop
  { at: 0, kind: "actor", who: "hero", move: { dx: HERO_WALK_FROM, dz: 0 } },
  {
    at: 2500,
    dur: 5400,
    kind: "actor",
    who: "hero",
    anim: "walk",
    move: { dx: hx - HERO_WALK_FROM, dz: 0 },
  },
  { at: 2500, kind: "music", state: "walk" },
  { at: 2500, dur: 5500, kind: "vfx", id: "surgeAura", params: { mult: 1 } },
  // ---- 5.5 the sky darkens, ink drips up, three pools open on the road, a reverse swell and a whisper
  {
    at: 5500,
    dur: 1500,
    kind: "camera",
    pose: { x: mid, y: 2.1, dist: 22, pitch: 18, fov: 31 },
    ease: "inOut",
    shake: 0.15,
    shakeMs: 250,
  },
  { at: 5500, kind: "sfx", id: "skyTear" },
  ...WORD_GATE.slots.flatMap((s, i): Cue[] => [
    { at: 5900 + i * 400, kind: "sfx", id: "inkPool" },
    {
      at: 5900 + i * 400,
      dur: 1300,
      kind: "vfx",
      id: "inkRise",
      params: { x: s.x, z: s.z },
    },
  ]),
  // ---- 7.0 Nul, off screen (the line holds the shot), then the camera settles into the battle pose
  { at: 7000, kind: "line", speaker: "nul", text: LINES.nulOpen },
  { at: 7000, dur: 1000, kind: "camera", pose: { anchor: "battle" }, ease: "out" },
  // ---- 8.0 the sim starts (Hush Shades and Wisps rise out of the ink pools; the stage takes the camera)
  { at: OPEN_END_MS, kind: "startPlay" },
  { at: OPEN_END_MS, kind: "end" },
];

export const OPEN_TIMELINE: Timeline = {
  id: "prologue.open",
  durationMs: OPEN_END_MS,
  setup: "standalone",
  cues: sortCues(openCues),
};

// ================================================================================================ Part C

/** The theft table (art direction §2.3): beat k starts at 13000 + 1100 k, its stream arrives 820 ms later. */
export const THEFT = {
  startMs: 13000,
  beatMs: 1100,
  arriveMs: 820,
  /** Kit order: Fireball, Aegis, Slash Wave, Piercing Thrust, Mending Light, Frost Lock. */
  kit: ["fireball", "aegis", "slashWave", "piercingThrust", "mendingLight", "frostLock"],
} as const;
const beatAt = (k: number): number => THEFT.startMs + THEFT.beatMs * k;
const COLLAPSE_AT = 20000;
/** Glyphs of the Word Gate prop (`GATE_GLYPH_COUNT` in render/vfx/prologue/cues.ts; the unit test pins it). */
export const GATE_GLYPHS = 41;
export const UNWRITING_END_MS = 54500;

const theftCues = (): Cue[] => {
  const out: Cue[] = [];
  for (let k = 0; k < 6; k++) {
    const t = beatAt(k);
    const ramp = THEFT_RAMP[k + 1] ?? 1;
    out.push(
      { at: t, kind: "hud", cue: { id: "kitShatter", index: k } },
      { at: t, kind: "sfx", id: "theftCrack", count: k },
      { at: t + 120, kind: "sfx", id: "theftWhoosh", count: k },
      {
        at: t,
        dur: 1100,
        kind: "vfx",
        id: "theftStream",
        from: "hero",
        to: "boss",
        params: { k: k + 1 },
      },
      { at: t, kind: "actor", who: "boss", anim: "reach" },
      // the world steps one sixth toward UNWRITTEN when the stream reaches the mask (280 ms, easeOutCubic)
      { at: t + THEFT.arriveMs, dur: 280, kind: "mood", to: ramp },
    );
  }
  return out;
};

/** The slow dolly toward the knight (13.0 -> 20.0, x 1.5 m toward the knight, who stands left of centre) with a small shake on each arrival, as chained linear moves. */
const dollyCues = (): Cue[] => {
  const out: Cue[] = [
    {
      at: THEFT.startMs,
      dur: THEFT.arriveMs,
      kind: "camera",
      pose: { x: mid - 0.2, y: 2.4, dist: 21.8, pitch: 12, fov: 30 },
      ease: "linear",
    },
  ];
  for (let k = 0; k < 6; k++) {
    const t = beatAt(k) + THEFT.arriveMs;
    const end = k === 5 ? COLLAPSE_AT : beatAt(k + 1) + THEFT.arriveMs;
    const u = (end - THEFT.startMs) / (COLLAPSE_AT - THEFT.startMs);
    out.push({
      at: t,
      dur: end - t,
      kind: "camera",
      pose: { x: mid - 1.5 * u, y: 2.4 - 0.2 * u, dist: 22 - 2 * u, pitch: 12 - u, fov: 30 },
      ease: "linear",
      shake: 0.25,
      shakeMs: 120,
    });
  }
  return out;
};

const gateCues = (): Cue[] => {
  const out: Cue[] = [];
  for (let i = 0; i < GATE_GLYPHS; i++)
    out.push({ at: 26500 + i * 120, kind: "sfx", id: "gateDark", count: i });
  return out;
};

const quillCues = (): Cue[] => {
  const out: Cue[] = [];
  for (let i = 0; i < LINES.ink.length; i++)
    out.push({ at: 10500 + i * 110, kind: "sfx", id: "quillScratch", count: i });
  return out;
};

const heartbeatCues = (): Cue[] =>
  [36600, 37550, 38500, 39450, 40400].map((at): Cue => ({ at, kind: "sfx", id: "heartbeat" }));

const unwritingCues: Cue[] = [
  // ---- 0.0 the last Fireball is caught: a 160 ms hit-stop, Nul's palm, the Fireball turns to grey ink and crumbles
  { at: 0, kind: "camera", pose: {}, ease: "linear", shake: 0.2, shakeMs: 150 },
  { at: 0, kind: "actor", who: "hero", anim: "idle" },
  { at: 0, kind: "actor", who: "boss", anim: "catch" },
  { at: 0, dur: 2600, kind: "vfx", id: "catchFireball", from: "hero", to: "boss" },
  { at: 0, kind: "music", drone: 38 },
  { at: 500, kind: "sfx", id: "catchHiss" },
  // ---- 1.5 the slow push to Nul's mask (arrives as he speaks)
  {
    at: 1500,
    dur: 2900,
    kind: "camera",
    pose: { x: nx + 0.4, y: 3.4, dist: 18, pitch: 7, fov: 19 },
    ease: "inOut",
  },
  { at: 4400, kind: "line", speaker: "nul", text: LINES.nulEnough },
  { at: 4401, kind: "line", speaker: "nul", text: LINES.nulBright },
  // ---- 7.5 cut to the knight, low: he raises the sword and the aura flares to tier 4
  {
    at: 6000,
    dur: 1500,
    kind: "camera",
    pose: { x: hx + 0.3, y: 1.1, dist: 14, pitch: 5, fov: 24 },
    ease: "inOut",
    shake: 0.2,
    shakeMs: 300,
  },
  { at: 6000, kind: "actor", who: "hero", anim: "raise" },
  { at: 6000, dur: COLLAPSE_AT - 6000, kind: "vfx", id: "surgeAura", params: { mult: 16 } },
  { at: 7500, kind: "line", speaker: "knight", text: LINES.knightEnds },
  // ---- 10.5 the two-shot; Nul writes in the air, one letter every 110 ms (HUD ink line + nib sparks + a quill scratch each)
  {
    at: 9300,
    dur: 1200,
    kind: "camera",
    pose: { x: mid, y: 2.4, dist: 22, pitch: 12, fov: 30 },
    ease: "inOut",
  },
  { at: 9600, kind: "music", swell: true },
  { at: 10500, kind: "actor", who: "boss", anim: "write" },
  { at: 10500, kind: "hud", cue: { id: "ink", text: LINES.ink, charMs: 110 } },
  {
    at: 10500,
    dur: 1700,
    kind: "vfx",
    id: "inkWrite",
    params: { charMs: 110, chars: LINES.ink.length },
  },
  ...quillCues(),
  // ---- 13.0 - 20.0 the theft: six beats, 1.1 s apart, in kit order; the dolly with a small shake on each arrival
  ...theftCues(),
  ...dollyCues(),
  { at: 19600, kind: "hud", cue: { id: "passivesDim" } },
  { at: 19600, kind: "actor", who: "boss", anim: "idle" },
  // ---- 20.0 the aura collapses (kept to the end of Part C), the blade gutters, he drops to one knee, the world goes silent
  { at: COLLAPSE_AT, dur: UNWRITING_END_MS - COLLAPSE_AT - 1, kind: "vfx", id: "auraCollapse" },
  { at: COLLAPSE_AT, kind: "sfx", id: "auraCollapse" },
  { at: COLLAPSE_AT, dur: 1200, kind: "music", silence: 1 },
  { at: 20700, kind: "music", drone: null },
  { at: 20700, kind: "camera", pose: {}, ease: "linear", shake: 0.5, shakeMs: 400 },
  { at: 20800, kind: "actor", who: "hero", anim: "kneel" },
  { at: 20900, kind: "actor", who: "prop:prop.prologue.sword", visible: true },
  { at: 21000, kind: "sfx", id: "swordClang" },
  // ---- 23.0 close on Nul: the stolen colours swirl inside his cloak (HUD layer: the grade cannot grey them)
  {
    at: 21800,
    dur: 1200,
    kind: "camera",
    pose: { x: nx + 0.2, y: 2.6, dist: 15, pitch: 8, fov: 22 },
    ease: "out",
  },
  { at: 23000, kind: "hud", cue: { id: "colourSwirl", on: true } },
  { at: 23000, kind: "line", speaker: "nul", text: LINES.nulQuiet },
  // ---- 26.5 pull back wide and high; the Word Gate's letters go dark one by one, 120 ms apart
  {
    at: 24000,
    dur: 2500,
    kind: "camera",
    pose: { x: mid + 1, y: 3.0, dist: 30, pitch: 22, fov: 30 },
    ease: "inOut",
  },
  { at: 26500, kind: "line", speaker: "nul", text: LINES.nulNoMore },
  { at: 26500, dur: 5600, kind: "vfx", id: "gateDarken" },
  ...gateCues(),
  // ---- 31.0 Nul rises into the sky tear in a vortex of letters; the tear closes with a muffled boom; the fog wall rolls in
  { at: 31000, kind: "hud", cue: { id: "colourSwirl", on: false } },
  { at: 31000, dur: 3600, kind: "actor", who: "boss", anim: "rise", move: { dx: 0.6, dz: -5.6 } },
  { at: 31000, kind: "sfx", id: "skyTear" },
  { at: 31000, dur: 5700, kind: "vfx", id: "skyTear", params: { closeAt: 3600 } },
  { at: 31000, dur: 5700, kind: "vfx", id: "letterVortex" },
  { at: 31000, dur: UNWRITING_END_MS - 31000 - 1, kind: "vfx", id: "silenceFog" },
  {
    at: 31000,
    dur: 4000,
    kind: "camera",
    pose: { x: mid + 1, y: 4.3, dist: 30, pitch: 19, fov: 30 },
    ease: "inOut",
  },
  { at: 34900, kind: "sfx", id: "skyTearClose" },
  { at: 35000, kind: "actor", who: "boss", visible: false },
  // ---- 37.0 the knight, close and low, in silence with a faint heartbeat
  {
    at: 35000,
    dur: 1500,
    kind: "camera",
    pose: { x: hx, y: 0.9, dist: 12, pitch: 4, fov: 20 },
    ease: "inOut",
    shake: 0.3,
    shakeMs: 300,
  },
  ...heartbeatCues(),
  { at: 37000, kind: "line", speaker: "knight", text: LINES.knightGone },
  // ---- 41.0 two small shards drift down into his open hand, a tiny ember lights, the one warm light left

  { at: 39800, kind: "actor", who: "hero", anim: "reach" },
  { at: 40000, kind: "hud", cue: { id: "shardsReturn" } },
  {
    at: 40000,
    dur: 4000,
    kind: "camera",
    pose: { x: hx, y: 0.8, dist: 11, pitch: 4, fov: 19 },
    ease: "linear",
  },
  {
    at: 42000,
    dur: UNWRITING_END_MS - 42000 - 1,
    kind: "vfx",
    id: "ember",
    params: { closeAt: 2000 },
  },
  { at: 42000, kind: "sfx", id: "emberChime" },
  { at: 42000, dur: 2000, kind: "music", silence: 0.75 },
  { at: 42600, kind: "music", motif: "spark" },
  { at: 44000, kind: "actor", who: "hero", anim: "kneel" },
  { at: 44000, kind: "line", speaker: "knight", text: LINES.knightSpark },
  // ---- 47.0 he stands, pulls the sword out of the ground and walks into the grey; the crane up and away
  { at: 47000, kind: "actor", who: "hero", anim: "rise" },
  {
    at: 47000,
    dur: 6000,
    kind: "camera",
    pose: { x: hx + 3, y: 2.0, dist: 40, pitch: 30, fov: 30 },
    ease: "inOut",
  },
  { at: 47000, dur: 5500, kind: "hud", cue: { id: "caption", text: LINES.end } },
  { at: 48200, kind: "actor", who: "hero", anim: "swordOut" },
  { at: 48200, kind: "actor", who: "prop:prop.prologue.sword", visible: false },
  { at: 49400, dur: 4600, kind: "actor", who: "hero", anim: "walk", move: { dx: 7, dz: 0 } },
  // ---- 53.0 fade to black over 1.5 s; the two-note motif
  { at: 53000, dur: 1500, kind: "hud", cue: { id: "fade", to: 1 } },
  { at: 53000, kind: "music", motif: "sparkEnd" },
  { at: UNWRITING_END_MS, kind: "end" },
];

export const UNWRITING_TIMELINE: Timeline = {
  id: "prologue.unwriting",
  durationMs: UNWRITING_END_MS,
  setup: "continue",
  cues: sortCues(unwritingCues),
};

/** Part C keyframes of the plan §6 (the stills): name -> timeline ms (a held line shows when the time equals its `at`). */
export const PART_C_KEYFRAMES = {
  catch: 300,
  maskPush: 3600,
  knightFlare: 7500,
  inkLine: 12100,
  theft3: 15700,
  theft6: 19900,
  collapseKneel: 21500,
  colourSwirl: 23000,
  vortexFog: 33000,
  shards: 41500,
  ember: 43000,
} as const;
export const PART_A_KEYFRAMES = { crane: 4000, inkDrips: 6600 } as const;
