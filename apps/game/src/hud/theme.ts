/** HUD theme: fonts, colours, contrast maths. Ported from poc/hd2d-poc-v2.html (HUD section). */

export const FONT_PIX =
  '"Press Start 2P", "Silkscreen", ui-monospace, Menlo, Consolas, "Courier New", monospace';
export const FONT_DISP = '"Cinzel", Georgia, "Times New Roman", serif';
export const FONT_UI = '"Silkscreen", "Press Start 2P", ui-monospace, Menlo, Consolas, monospace';
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Press+Start+2P&family=Silkscreen:wght@400;700&display=swap";

export const GOLD = "#e9c46a";
export const GOLD_HI = "#fff0b8";
export const INK = "#efe5cc";

/** Key-streak tier colours (VFX tiers): white, gold 10, ember 25, azure 50, prismatic 100. */
export const KEY_STREAK_THRESHOLDS = [0, 10, 25, 50, 100] as const;
export const KEY_STREAK_COLORS = ["#ffffff", "#ffd24a", "#ff8a3c", "#5cc8ff", "#ff7ad9"] as const;
export const KEY_STREAK_NAMES = ["", "GOLD", "EMBER", "AZURE", "PRISMATIC"] as const;
/** Word-combo (mechanical) tiers: none, bronze 5, silver 15, gold 30, radiant 50. */
export const COMBO_TIER_COLORS = ["#fff0c8", "#d99a62", "#dfe6ee", "#ffd25a", "#ff9ae8"] as const;
export const COMBO_TIER_NAMES = ["", "BRONZE", "SILVER", "GOLD", "RADIANT"] as const;

/** Prismatic cycles hue over time (reduced motion: fixed pink). */
export function keyStreakColor(tier: number, timeSec: number, reducedMotion = false): string {
  const t = Math.max(0, Math.min(4, Math.floor(tier)));
  if (t === 4 && !reducedMotion) return `hsl(${Math.floor((timeSec * 140) % 360)} 100% 72%)`;
  return KEY_STREAK_COLORS[t] ?? "#ffffff";
}

/** Streak progress to the next tier: { tier, frac 0..1 toward next, next threshold or null }. */
export function keyStreakProgress(streak: number): {
  tier: number;
  frac: number;
  next: number | null;
} {
  let tier = 0;
  for (let i = 0; i < KEY_STREAK_THRESHOLDS.length; i++) {
    if (streak >= (KEY_STREAK_THRESHOLDS[i] ?? 0)) tier = i;
  }
  const lo = KEY_STREAK_THRESHOLDS[tier] ?? 0;
  const hi = KEY_STREAK_THRESHOLDS[tier + 1];
  if (hi === undefined) return { tier, frac: 1, next: null };
  return { tier, frac: Math.max(0, Math.min(1, (streak - lo) / (hi - lo))), next: hi };
}

// ---- contrast ----
export function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function relLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(fg: string, bg: string): number {
  const a = relLuminance(fg);
  const b = relLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Palette of one plate style: letter colours and the plate background gradient stops. */
export interface PlatePalette {
  bg0: string;
  bg1: string;
  untyped: string;
  typed: string;
  next: string;
  border: string;
  label: string;
  labelCol: string;
}

export const PLATE_PALETTES: Record<string, PlatePalette> = {
  word: {
    bg0: "#17121f",
    bg1: "#08060b",
    untyped: "#ece3d2",
    typed: "#ffcf4a",
    next: "#ffffff",
    border: "#b8955a",
    label: "",
    labelCol: "#d8b46e",
  },
  guard: {
    bg0: "#7a1020",
    bg1: "#2e050a",
    untyped: "#ffe9e2",
    typed: "#a8e6ff",
    next: "#ffffff",
    border: "#ff7a64",
    label: "GUARD",
    labelCol: "#ffb0a0",
  },
  doom: {
    bg0: "#2c1052",
    bg1: "#0f0520",
    untyped: "#f0e2ff",
    typed: "#ffb0ff",
    next: "#ffffff",
    border: "#b070ff",
    label: "DOOM",
    labelCol: "#d8a8ff",
  },
  minigame: {
    bg0: "#2a2014",
    bg1: "#0e0a06",
    untyped: "#f2e4c8",
    typed: "#ffcf4a",
    next: "#ffffff",
    border: "#c8944a",
    label: "",
    labelCol: "#e0b070",
  },
  finisher: {
    bg0: "#4a3208",
    bg1: "#1a1002",
    untyped: "#fff4d0",
    typed: "#ffe066",
    next: "#ffffff",
    border: "#ffd25a",
    label: "FINISH",
    labelCol: "#ffe08a",
  },
  secondWind: {
    bg0: "#0c3a38",
    bg1: "#041514",
    untyped: "#e0fffa",
    typed: "#ffe066",
    next: "#ffffff",
    border: "#5af0e0",
    label: "SECOND WIND",
    labelCol: "#9ffff0",
  },
  trial: {
    bg0: "#17121f",
    bg1: "#08060b",
    untyped: "#ece3d2",
    typed: "#ffcf4a",
    next: "#ffffff",
    border: "#b8955a",
    label: "",
    labelCol: "#d8b46e",
  },
};

/** Worst-case contrast of any letter colour on the lightest plate background stop. */
export function palettePlateContrast(p: PlatePalette): number {
  const lightest = relLuminance(p.bg0) > relLuminance(p.bg1) ? p.bg0 : p.bg1;
  return Math.min(
    contrastRatio(p.untyped, lightest),
    contrastRatio(p.typed, lightest),
    contrastRatio(p.next, lightest),
  );
}
