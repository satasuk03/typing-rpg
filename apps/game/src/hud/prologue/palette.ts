/**
 * Prologue HUD palette (docs/vfx/prologue-art-direction.md §1.3): the theft-only colours, the speaker colours,
 * the dialogue panel, and the passive chips. Pure data plus two contrast helpers (no DOM).
 */
import { contrastRatio } from "../theme";

/** The stolen-colour table. Used only by the shatter crack/burst, the cloak swirl, and the world `theftStream`. */
export const THEFT_COLOURS: Readonly<Record<string, string>> = {
  fireball: "#ff7a2a",
  aegis: "#ffd24a",
  slashWave: "#e8eeff",
  piercingThrust: "#4fe6ff",
  mendingLight: "#5cf08a",
  frostLock: "#6f8dff",
};
/** Kit order = story order (interfaces §14.2); the fallback when no view has been seen yet. */
export const DEFAULT_KIT: readonly string[] = [
  "fireball",
  "aegis",
  "slashWave",
  "piercingThrust",
  "mendingLight",
  "frostLock",
];
export const GREY = "#8a8794";
export const GREY_DARK = "#4a4752";

export type SpeakerId = "nul" | "knight";
export interface SpeakerStyle {
  name: string;
  /** Speaker plate fill, its ink colour, and the panel rim. */
  plate: string;
  plateInk: string;
  rim: string;
}
export const SPEAKERS: Readonly<Record<SpeakerId, SpeakerStyle>> = {
  nul: { name: "NUL", plate: "#b9a6ff", plateInk: "#120a26", rim: "#8a6cff" },
  knight: { name: "KNIGHT", plate: "#ffbe5a", plateInk: "#241200", rim: "#d8902a" },
};

export const DIALOGUE_PANEL = { top: "#0f0a1a", bottom: "#07050d", alpha: 0.95 } as const;
export const DIALOGUE_TEXT = "#f8f2e4";

const hexToRgb = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** The panel colour over the WORST backdrop (pure white world behind a 95% panel). */
export function worstCasePanel(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const a = DIALOGUE_PANEL.alpha;
  return toHex(r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a));
}

/** Dialogue text contrast vs the lighter panel stop over a white world. Must be >= 7. */
export function dialogueContrast(): number {
  return Math.min(
    contrastRatio(DIALOGUE_TEXT, worstCasePanel(DIALOGUE_PANEL.top)),
    contrastRatio(DIALOGUE_TEXT, worstCasePanel(DIALOGUE_PANEL.bottom)),
  );
}
/** Speaker plate label contrast (ink on the plate colour). Must be >= 7. */
export function speakerContrast(id: SpeakerId): number {
  const s = SPEAKERS[id];
  return contrastRatio(s.plateInk, s.plate);
}

export interface PassiveGlyph {
  code: string;
  colour: string;
  name: string;
}
/** Passive chips: 2-letter code on a coloured gem (there is no passive pixel art yet; polish backlog). */
export const PASSIVE_GLYPHS: Readonly<Record<string, PassiveGlyph>> = {
  cleanCut: { code: "CC", colour: "#ffd24a", name: "Clean Cut" },
  bulwarkStreak: { code: "BS", colour: "#8ab8ff", name: "Bulwark Streak" },
  steadyHands: { code: "SH", colour: "#7aeb90", name: "Steady Hands" },
  riposte: { code: "RP", colour: "#ff8a6a", name: "Riposte" },
  ironWill: { code: "IW", colour: "#c8c0d8", name: "Iron Will" },
  openingGambit: { code: "OG", colour: "#ffa24a", name: "Opening Gambit" },
  lastStand: { code: "LS", colour: "#ff5a6a", name: "Last Stand" },
  comeback: { code: "CB", colour: "#e08aff", name: "Comeback" },
  calmMind: { code: "CM", colour: "#6fe0e0", name: "Calm Mind" },
};
export const DEFAULT_PASSIVES: readonly string[] = [
  "cleanCut",
  "bulwarkStreak",
  "steadyHands",
  "riposte",
  "ironWill",
  "openingGambit",
  "lastStand",
  "comeback",
  "calmMind",
];
export const passiveGlyph = (id: string): PassiveGlyph =>
  PASSIVE_GLYPHS[id] ?? { code: id.slice(0, 2).toUpperCase(), colour: "#d49aff", name: id };
