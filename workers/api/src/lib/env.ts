// Worker bindings + tunables. Every AC_* threshold is a wrangler [vars] string with the §10 default.

export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  LB_CACHE: KVNamespace;
  // secrets (wrangler secret / .dev.vars; never committed)
  JWT_SECRET?: string;
  TICKET_SECRET?: string;
  // Workers Rate Limiting bindings (optional: absent in tests / plain `wrangler dev` without them)
  RL_AUTH?: RateLimitBinding;
  RL_SAVE?: RateLimitBinding;
  RL_RUN?: RateLimitBinding;
  // [vars]
  SEASON_KEY?: string;
  [k: `AC_${string}`]: string | undefined;
}

export interface AcConfig {
  runTtlMs: number;
  clockSlackMs: number;
  maxSustainedWpm: number;
  sustainedSpanMs: number;
  maxBurstWpm: number;
  burstSpanMs: number;
  minIkiCv: number;
  fastIkiMs: number;
  maxFastIkiShare: number;
  quantMinPeriodMs: number;
  quantMaxShare: number;
  maxJankShare: number;
  perfectMinKeys: number;
  perfectMinWpm: number;
  pbJumpReviewWpm: number;
  minKeys: number;
}

const num = (v: string | undefined, d: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function readAcConfig(env: Partial<Env>): AcConfig {
  return {
    runTtlMs: num(env.AC_RUN_TTL_MS, 600_000),
    clockSlackMs: num(env.AC_CLOCK_SLACK_MS, 5000),
    maxSustainedWpm: num(env.AC_MAX_SUSTAINED_WPM, 220),
    sustainedSpanMs: num(env.AC_SUSTAINED_SPAN_MS, 30_000),
    maxBurstWpm: num(env.AC_MAX_BURST_WPM, 300),
    burstSpanMs: num(env.AC_BURST_SPAN_MS, 5000),
    minIkiCv: num(env.AC_MIN_IKI_CV, 0.15),
    fastIkiMs: num(env.AC_FAST_IKI_MS, 15),
    maxFastIkiShare: num(env.AC_MAX_FAST_IKI_SHARE, 0.02),
    quantMinPeriodMs: num(env.AC_QUANT_MIN_PERIOD_MS, 8),
    quantMaxShare: num(env.AC_QUANT_MAX_SHARE, 0.6),
    maxJankShare: num(env.AC_MAX_JANK_SHARE, 0.1),
    perfectMinKeys: num(env.AC_PERFECT_MIN_KEYS, 400),
    perfectMinWpm: num(env.AC_PERFECT_MIN_WPM, 150),
    pbJumpReviewWpm: num(env.AC_PB_JUMP_REVIEW_WPM, 35),
    minKeys: num(env.AC_MIN_KEYS, 20),
  };
}

export const BOARD_ID = "trial_wpm";
export const seasonKey = (env: Partial<Env>): string => env.SEASON_KEY || "S1";
export type Scope = "season" | "all";
export const periodKeyFor = (env: Partial<Env>, scope: Scope): string =>
  scope === "all" ? "all" : seasonKey(env);
