/**
 * The real prologue timelines (P3.6, retimed in P4.2 WP-B): Part A "cold open" and Part C "The Unwriting" (docs/PROLOGUE_PLAN.md §2,
 * camera keyframes and the theft ramp in docs/vfx/prologue-art-direction.md §2.3, §4, §5; pacing in docs/qa/prologue-review-1.md §4).
 * Part B (the playable) is the sim.
 *
 * Times are ms on the TIMELINE clock. Every prologue line is an OVERLAY line (interfaces v2.2.3): it never stops the clock, it
 * shows for its minimum reading time from its `at`, and the camera, VFX and fog keep running underneath it, so no frame is a
 * freeze-frame and Part C is 57.0 s of timeline (58 s on the wall with the handover; 74.2 s before). `validate()` rejects overlapping windows.
 * Every shot that carries a line gets a slow creep (fov / dist) over the line.
 *
 * World constants come from `assets/levels/prologue.json` (`hero` stop and the boss slot of encounter 2, the `gate` /
 * `sword` markers): `tests/app/prologueTimelines.test.ts` checks them against the loaded layout.
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
  /** Where the encounter-1 slots are (ink pools of Part A open here). P4.2 (P2-10): the first Shade is 3 m from the knight. */
  slots: [
    { x: 31, z: -0.875 },
    { x: 33.1875, z: 0.875 },
    { x: 35.3125, z: -0.3125 },
  ],
} as const;
const { hx, nx, mid } = WORD_GATE;
/** The hero's home before Part A is the layout `start` marker (x 0); the cold open walk begins 16 m along the road. */
const HERO_WALK_FROM = 16;

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

/** An overlay line (never stops the clock). */
const say = (at: number, speaker: "nul" | "knight", text: string): Cue => ({
  at,
  kind: "line",
  speaker,
  text,
  mode: "overlay",
});

// ================================================================================================ Part A

const openCues: Cue[] = [
  // ---- 0.0 black, wind; the caption fades in; the camera is placed under the black (P2-1: the whole arch with sky above it)
  { at: 0, kind: "camera", pose: { x: 25.5, y: 6.4, dist: 23.5, pitch: 8, fov: 34 }, ease: "cut" },
  { at: 0, kind: "hud", cue: { id: "fade", to: 1 } },
  { at: 0, kind: "actor", who: "hero", anim: "idle" },
  { at: 300, dur: 2400, kind: "hud", cue: { id: "caption", text: LINES.caption } },
  // ---- 2.5 fade in, the crane pushes in, the knight walks up the road at full power
  { at: 2500, dur: 1000, kind: "hud", cue: { id: "fade", to: 0 } },
  {
    at: 2500,
    dur: 3000,
    kind: "camera",
    pose: { x: 27.2, y: 5.8, dist: 22.5, pitch: 8, fov: 33 },
    ease: "inOut",
  },
  // the knight starts the walk already on the road in frame (16 m on from the start marker) and arrives at the stop
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
  // ---- 5.3 the sky above the gate darkens, ink drips up, three pools open on the road, a reverse swell and a whisper
  {
    at: 5300,
    dur: 1700,
    kind: "camera",
    pose: { x: mid - 1, y: 2.9, dist: 22, pitch: 15, fov: 31 },
    ease: "inOut",
    shake: 0.15,
    shakeMs: 250,
  },
  { at: 5300, kind: "sfx", id: "skyTear" },
  ...WORD_GATE.slots.flatMap((s, i): Cue[] => [
    { at: 5500 + i * 350, kind: "sfx", id: "inkPool" },
    {
      at: 5500 + i * 350,
      dur: 1300,
      kind: "vfx",
      id: "inkRise",
      params: { x: s.x, z: s.z },
    },
  ]),
  // ---- 5.2 Nul, off screen: his line shows over the settle into the battle pose (no hold: the camera never stops)
  say(5200, "nul", LINES.nulOpen),
  { at: 6600, dur: 1400, kind: "camera", pose: { anchor: "battle" }, ease: "inOut" },
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

/** The theft table (art direction §2.3): beat k starts at 16000 + 1100 k, its stream arrives 820 ms later. */
export const THEFT = {
  startMs: 16000,
  beatMs: 1100,
  arriveMs: 820,
  /** Kit order: Fireball, Aegis, Slash Wave, Piercing Thrust, Mending Light, Frost Lock. */
  kit: ["fireball", "aegis", "slashWave", "piercingThrust", "mendingLight", "frostLock"],
} as const;
const beatAt = (k: number): number => THEFT.startMs + THEFT.beatMs * k;
/** The dolly ends and the push-in to the knight begins; the aura collapses 400 ms later. */
const PUSH_IN_AT = 22800;
const COLLAPSE_AT = 23200;
/** The knight's recoil (a 1-frame `hurt`) on each theft departure. */
const RECOIL_MS = 150;
/** Glyphs of the Word Gate prop (`GATE_GLYPH_COUNT` in render/vfx/prologue/cues.ts; the unit test pins it). */
export const GATE_GLYPHS = 41;
export const UNWRITING_END_MS = 57000;
/** `gateDarken` starts with "No more stories." and sweeps the 41 glyphs 120 ms apart (31.0 -> 35.9 s). */
const GATE_AT = 31000;

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
      // P1-7: the knight recoils for one frame as the stream leaves his chest, then braces again
      { at: t, kind: "actor", who: "hero", anim: "hurt" },
      { at: t + RECOIL_MS, kind: "actor", who: "hero", anim: "raise" },
      // the world steps one sixth toward UNWRITTEN when the stream reaches the mask (280 ms, easeOutCubic)
      { at: t + THEFT.arriveMs, dur: 280, kind: "mood", to: ramp },
    );
  }
  return out;
};

/** The slow dolly toward the knight (x 1.5 m toward him, who stands left of centre) with a small shake on each arrival, as chained linear moves. */
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
    const end = k === 5 ? PUSH_IN_AT : beatAt(k + 1) + THEFT.arriveMs;
    const u = (end - THEFT.startMs) / (PUSH_IN_AT - THEFT.startMs);
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
    out.push({ at: GATE_AT + i * 120, kind: "sfx", id: "gateDark", count: i });
  return out;
};

const INK_AT = 13200;
const quillCues = (): Cue[] => {
  const out: Cue[] = [];
  for (let i = 0; i < LINES.ink.length; i++)
    out.push({ at: INK_AT + i * 110, kind: "sfx", id: "quillScratch", count: i });
  return out;
};

const HEART_AT = 40000;
const heartbeatCues = (): Cue[] =>
  [0, 950, 1900, 2850, 3800].map((d): Cue => ({ at: HEART_AT + d, kind: "sfx", id: "heartbeat" }));

const unwritingCues: Cue[] = [
  // ---- 0.0 the last Fireball is caught: a 160 ms hit-stop, Nul's palm, the Fireball turns to grey ink and crumbles
  { at: 0, kind: "camera", pose: {}, ease: "linear", shake: 0.2, shakeMs: 150 },
  { at: 0, kind: "actor", who: "hero", anim: "idle" },
  { at: 0, kind: "actor", who: "boss", anim: "catch" },
  { at: 0, dur: 2600, kind: "vfx", id: "catchFireball", from: "hero", to: "boss" },
  { at: 0, kind: "music", drone: 38 },
  { at: 500, kind: "sfx", id: "catchHiss" },
  // ---- 1.5 the slow push to Nul's mask, which keeps creeping (fov 19 -> 17.5) through both of his lines
  {
    at: 1500,
    dur: 2900,
    kind: "camera",
    pose: { x: nx + 0.4, y: 3.4, dist: 18, pitch: 7, fov: 19 },
    ease: "inOut",
  },
  say(3000, "nul", LINES.nulEnough),
  { at: 4400, dur: 4200, kind: "camera", pose: { fov: 17.5 }, ease: "linear" },
  say(5300, "nul", LINES.nulBright),
  // ---- 8.6 cut to the knight, low: he raises the sword; the aura flares to tier 4 at 9.6
  {
    at: 8600,
    dur: 1200,
    kind: "camera",
    pose: { x: hx + 0.3, y: 1.1, dist: 14, pitch: 5, fov: 24 },
    ease: "inOut",
    shake: 0.2,
    shakeMs: 300,
  },
  { at: 8600, kind: "actor", who: "hero", anim: "raise" },
  { at: 9600, dur: COLLAPSE_AT - 9600, kind: "vfx", id: "surgeAura", params: { mult: 16 } },
  say(9900, "knight", LINES.knightEnds),
  { at: 9800, dur: 2200, kind: "camera", pose: { dist: 13.2 }, ease: "linear" },
  // ---- 12.0 the two-shot, the reverse swell; 13.2 Nul writes in the air, one letter every 110 ms (HUD ink line + nib sparks
  // + a quill scratch each); the Grimoire slides in at the ink line
  {
    at: 12000,
    dur: 1200,
    kind: "camera",
    pose: { x: mid, y: 2.4, dist: 22, pitch: 12, fov: 30 },
    ease: "inOut",
  },
  // 13.2 - 16.0 the two-shot creeps toward the theft dolly's first pose (no static frame)
  {
    at: INK_AT,
    dur: THEFT.startMs - INK_AT,
    kind: "camera",
    pose: { x: mid - 0.2, y: 2.4, dist: 21.8, pitch: 12, fov: 30 },
    ease: "linear",
  },
  { at: INK_AT - 900, kind: "music", swell: true },
  { at: INK_AT, kind: "actor", who: "boss", anim: "write" },
  { at: INK_AT, kind: "hud", cue: { id: "ink", text: LINES.ink, charMs: 110 } },
  {
    at: INK_AT,
    dur: 1700,
    kind: "vfx",
    id: "inkWrite",
    params: { charMs: 110, chars: LINES.ink.length },
  },
  ...quillCues(),
  // ---- 16.0 - 22.8 the theft: six beats, 1.1 s apart, in kit order; the dolly with a small shake on each arrival
  ...theftCues(),
  ...dollyCues(),
  { at: PUSH_IN_AT, kind: "hud", cue: { id: "passivesDim" } },
  { at: PUSH_IN_AT, kind: "actor", who: "boss", anim: "idle" },
  // ---- 22.8 push in on the knight (P1-6), 23.2 the aura collapses (kept to the end of Part C), the blade gutters, he drops
  // to one knee, the world goes silent; the knight holds the frame through the kneel and the sword clang
  {
    at: PUSH_IN_AT,
    dur: 400,
    kind: "camera",
    pose: { x: hx + 0.3, y: 1.0, dist: 13, pitch: 6, fov: 24 },
    ease: "inOut",
  },
  { at: COLLAPSE_AT, dur: UNWRITING_END_MS - COLLAPSE_AT - 1, kind: "vfx", id: "auraCollapse" },
  { at: COLLAPSE_AT, kind: "sfx", id: "auraCollapse" },
  { at: COLLAPSE_AT, dur: 1200, kind: "music", silence: 1 },
  { at: COLLAPSE_AT + 700, kind: "music", drone: null },
  { at: COLLAPSE_AT, dur: 500, kind: "camera", pose: { dist: 12.75 }, ease: "linear" },
  {
    at: COLLAPSE_AT + 500,
    dur: 1200,
    kind: "camera",
    pose: { dist: 12.3 },
    ease: "linear",
    shake: 0.5,
    shakeMs: 400,
  },
  { at: 24000, kind: "actor", who: "hero", anim: "kneel" },
  { at: 24050, kind: "actor", who: "prop:prop.prologue.sword", visible: true },
  { at: 24100, kind: "sfx", id: "swordClang" },
  // ---- 24.9 close on Nul; 26.0 "Now the world will be quiet." with the stolen colours swirling inside his cloak (HUD layer:
  // the grade cannot grey them); the shot creeps in over the line
  {
    at: 24900,
    dur: 1100,
    kind: "camera",
    pose: { x: nx + 0.2, y: 2.6, dist: 15, pitch: 8, fov: 22 },
    ease: "out",
  },
  { at: 26000, kind: "hud", cue: { id: "colourSwirl", on: true } },
  say(26000, "nul", LINES.nulQuiet),
  { at: 26000, dur: 2600, kind: "camera", pose: { fov: 20.5 }, ease: "linear" },
  // ---- 28.6 pull back (dist 24, the gate stays in frame); 31.0 the words go dark WHILE he says it, one glyph per 120 ms
  {
    at: 28600,
    dur: 2400,
    kind: "camera",
    pose: { x: mid + 1, y: 3.0, dist: 24, pitch: 22, fov: 30 },
    ease: "inOut",
  },
  say(GATE_AT, "nul", LINES.nulNoMore),
  { at: GATE_AT, dur: UNWRITING_END_MS - GATE_AT - 1, kind: "vfx", id: "gateDarken" },
  ...gateCues(),
  { at: GATE_AT, dur: 4800, kind: "camera", pose: { y: 3.3, dist: 22.8 }, ease: "linear" },
  // ---- 36.0 Nul rises into the sky tear in a vortex of letters; the tear closes with a muffled boom (39.8); the fog wall
  // rolls in and peaks here (33 -> 36.2 s), well before the knight's close-up
  { at: 36000, kind: "hud", cue: { id: "colourSwirl", on: false } },
  { at: 36000, dur: 3600, kind: "actor", who: "boss", anim: "rise", move: { dx: 0.6, dz: -5.6 } },
  { at: 36000, kind: "sfx", id: "skyTear" },
  { at: 36000, dur: 5700, kind: "vfx", id: "skyTear", params: { closeAt: 3600 } },
  { at: 36000, dur: 5700, kind: "vfx", id: "letterVortex" },
  { at: 33000, dur: UNWRITING_END_MS - 33000 - 1, kind: "vfx", id: "silenceFog" },
  {
    at: 36000,
    dur: 3500,
    kind: "camera",
    pose: { x: mid + 1, y: 3.6, dist: 22, pitch: 14, fov: 30 },
    ease: "inOut",
  },
  { at: 39800, kind: "sfx", id: "skyTearClose" },
  { at: 39700, kind: "actor", who: "boss", visible: false },
  // ---- 39.5 the knight, close and low, in silence with a faint heartbeat from 40.0; 41.0 "My words... are gone."
  {
    at: 39500,
    dur: 1500,
    kind: "camera",
    pose: { x: hx, y: 0.9, dist: 12, pitch: 4, fov: 20 },
    ease: "inOut",
    shake: 0.3,
    shakeMs: 300,
  },
  ...heartbeatCues(),
  say(41000, "knight", LINES.knightGone),
  { at: 41000, dur: 2600, kind: "camera", pose: { dist: 11.4, fov: 19.5 }, ease: "linear" },
  // ---- 43.6 two small shards fall from where the tear closed into his open hand (2.2 s); 45.8 a tiny ember lights, the one
  // warm light left
  { at: 43600, kind: "actor", who: "hero", anim: "reach" },
  { at: 43600, kind: "hud", cue: { id: "shardsReturn" } },
  {
    at: 43600,
    dur: 4200,
    kind: "camera",
    pose: { x: hx, y: 0.8, dist: 11, pitch: 4, fov: 19 },
    ease: "linear",
  },
  {
    at: 45800,
    dur: UNWRITING_END_MS - 45800 - 1,
    kind: "vfx",
    id: "ember",
    params: { closeAt: 2000 },
  },
  { at: 45800, kind: "sfx", id: "emberChime" },
  { at: 45800, dur: 2000, kind: "music", silence: 0.75 },
  { at: 46400, kind: "music", motif: "spark" },
  // ---- 47.8 the hand closes; "No. One spark is left."
  { at: 47800, kind: "actor", who: "hero", anim: "kneel" },
  say(47800, "knight", LINES.knightSpark),
  { at: 47800, dur: 2500, kind: "camera", pose: { dist: 10.4, fov: 18 }, ease: "linear" },
  // ---- 50.3 he stands, pulls the sword out of the ground and walks into the grey; the crane up and away
  { at: 50300, kind: "actor", who: "hero", anim: "rise" },
  {
    at: 50300,
    dur: 6000,
    kind: "camera",
    pose: { x: hx + 3, y: 2.0, dist: 40, pitch: 30, fov: 30 },
    ease: "inOut",
  },
  { at: 50300, dur: 5500, kind: "hud", cue: { id: "caption", text: LINES.end } },
  { at: 51500, kind: "actor", who: "hero", anim: "swordOut" },
  { at: 51500, kind: "actor", who: "prop:prop.prologue.sword", visible: false },
  { at: 52700, dur: 4200, kind: "actor", who: "hero", anim: "walk", move: { dx: 7, dz: 0 } },
  // ---- 55.5 fade to black over 1.5 s; the two-note motif
  { at: 55500, dur: 1500, kind: "hud", cue: { id: "fade", to: 1 } },
  { at: 55500, kind: "music", motif: "sparkEnd" },
  { at: UNWRITING_END_MS, kind: "end" },
];

export const UNWRITING_TIMELINE: Timeline = {
  id: "prologue.unwriting",
  durationMs: UNWRITING_END_MS,
  setup: "continue",
  cues: sortCues(unwritingCues),
};

/** Part C keyframes of the plan §6 (the stills): name -> timeline ms. Overlay lines show whenever their window is on. */
export const PART_C_KEYFRAMES = {
  catch: 300,
  maskPush: 3600,
  knightFlare: 10400,
  inkLine: 14500,
  theft3: 18900,
  theft6: 22500,
  collapseKneel: 24500,
  colourSwirl: 26800,
  vortexFog: 37500,
  shards: 44800,
  ember: 46500,
} as const;
export const PART_A_KEYFRAMES = { crane: 4000, inkDrips: 6600 } as const;
