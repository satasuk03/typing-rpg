# Interfaces — the contract every implementation agent builds against

| | |
|---|---|
| **Doc version** | **1.0** (2026-10-09) — first cut, pending orchestrator/PO review |
| **SIM_VERSION** | `1` |
| **Authority** | Plan §12 step 3. Overrides nothing in `00-overview.md` §6; where brainstorm docs were ambiguous, the choice made is listed in §12 "Decisions taken (review me)". |
| **Change process** | §11. Agents never edit this file directly; they propose. |

Packages (internal packages are consumed as TS source; imports use `.ts` extensions as in the M0 scaffold):

```
@hd2d/content  (packages/content)  zod schemas + data. Depends on: zod.
@hd2d/sim      (packages/sim)      pure deterministic TS. Depends on: @hd2d/content (TYPES ONLY, `import type`).
@hd2d/shared   (packages/shared)   zod API + save schemas, compression helpers. Depends on: zod, @hd2d/sim (types + log codec), @hd2d/content (types).
apps/game      client              depends on all three.
workers/api    Hono Worker         depends on shared + sim + content.
```
No cycles: `sim` never imports `shared`; `content` imports nothing internal.

File map for the contracts below:

| File | Contents | Owner |
|---|---|---|
| `packages/sim/src/time.ts` | `TICK_HZ`, `msToTick`, `tickStartMs` | Sim |
| `packages/sim/src/fixed.ts` | fixed-point helpers | Sim |
| `packages/sim/src/rng.ts` | sfc32 + stream derivation (replaces the M0 placeholder) | Sim |
| `packages/sim/src/hash.ts` | canonical JSON, FNV-1a, `hash` | Sim |
| `packages/sim/src/input.ts` | `SimInput`, `normalizeKey` | Sim |
| `packages/sim/src/logcodec.ts` | `hdk1` binary keystroke log encode/decode (no compression) | Sim |
| `packages/sim/src/events.ts` | `SimEvent`, `ALL_EVENT_TYPES`, `MetaEvent` | Sim (publish **before batch 3**) |
| `packages/sim/src/view.ts` | `LevelView`, `TrialView` | Sim |
| `packages/sim/src/index.ts` | public API (§3) | Sim |
| `packages/sim/src/balance.ts`, `tables.generated.ts`, `scripts/gen-tables.ts` | §7 | Sim |
| `packages/sim/src/resolve.ts` | `resolveLevel`, `resolveTrial` (content bundle → sim input) | Sim |
| `packages/sim/src/meta/*.ts` | §8 pure meta/reward functions | Sim |
| `packages/content/src/schemas.ts` | §6 | Content |
| `packages/shared/src/{api,save,errors,compress}.ts` | §9 | Backend |

---

## 1. Sim invariants

### 1.1 Time
```ts
// packages/sim/src/time.ts
export const TICK_HZ = 60;
/** Integer >= 0. The ONLY time unit inside the sim. Tick 0 = createLevel/createTrial. */
export type Tick = number;
/** Shared by client and Worker so both derive identical ticks from logged milliseconds. ms is an integer. */
export const msToTick = (ms: number): Tick => Math.floor((ms * 3) / 50);
/** First integer ms that maps to tick t (msToTick(tickStartMs(t)) === t). */
export const tickStartMs = (t: Tick): number => Math.ceil((t * 50) / 3);
```
- The sim never sees milliseconds, frames, or wall-clock time. Seconds in `BALANCE`/content are converted to ticks once at module init or at `resolveLevel` (`Math.round(s * 60)`).
- **Hit-stop, slow-mo, the 0.1 s "time-slow before the dash", camera punches: render-only.** They dilate animation time, never the sim clock, and never block input.
- **Pause is a client concern**: the sim simply isn't stepped. There is no pause state in the sim.

### 1.2 Numeric policy (decision D1)
All **hashed state is integers** (`Number.isSafeInteger`). No floats in state, ever.

| Kind | Unit | Example |
|---|---|---|
| Quantities: HP, ATK, damage, heal, ATB, shield-free amounts | **milli-points** (`MILLI = 1000`) | 100 HP → `100_000`; ATB full → `100_000` |
| Ratios, multipliers, probabilities | **basis points** (`BP = 10_000`) | ×1.25 → `12_500`; 30% → `3_000` |
| Gold, gems, counts, ticks, chars | plain integers | — |

```ts
// packages/sim/src/fixed.ts
export const BP = 10_000;
export const MILLI = 1_000;
export type Bp = number;
export type Milli = number;
/** floor(x * bp / BP). Caller guarantees |x * bp| < 2^53 (assert in dev builds). */
export const mulBp = (x: Milli, bp: Bp): Milli => Math.floor((x * bp) / BP);
export const mulDiv = (a: number, b: number, c: number): number => Math.floor((a * b) / c);
/** floor(sqrt(n)) for a safe integer n >= 0 via integer Newton iteration (no Math.sqrt). */
export declare function isqrt(n: number): number;
/** Module-init conversion of BALANCE literals ONLY (never on state). */
export const bp = (x: number): Bp => Math.round(x * BP);
export const milli = (x: number): Milli => Math.round(x * MILLI);
/** Display rounding for events/view: positive amounts never show as 0. */
export const toDisplay = (m: Milli): number => (m <= 0 ? 0 : Math.max(1, Math.round(m / MILLI)));
```
Why it's deterministic: IEEE-754 `+ - * /` and `Math.floor/ceil/round/trunc/imul` are exactly specified in ECMAScript, so V8 (Chrome, Workers, Node) and JSC/SpiderMonkey agree bit-for-bit. `Math.pow/exp/log/sin/cos/tan/sqrt/cbrt/hypot/atan*` and `**` are "implementation-approximated", so they are **banned in `packages/sim/src`** (add to the Biome override + `check.sh` grep: `Math\.(pow|exp|log|sin|cos|tan|sqrt|cbrt|hypot|atan)|\*\*`).
- `(35/Pace)^0.7` (clamped 0.6–1.8) → **precomputed table** `PACE_FACTOR_BP[pace]` for integer pace 15..120 in `tables.generated.ts`.
- All other curves (`TIER_GROWTH^(t-1)`, `PRICE_GROWTH^(t-1)`, `UPG_COST_GROWTH^lvl`, `GOLD_GROWTH_CH^(c-1)`) → generated integer tables too.
- `tables.generated.ts` is produced by `packages/sim/scripts/gen-tables.ts` (may use `Math.pow`; it is a script, not sim runtime). A unit test regenerates and diffs it.
- Gotcha: `check.sh` greps the bare words `Date`, `window`, `document`, `performance.` in `packages/sim/src` **including comments**. Say "span"/"interval", not "window".

### 1.3 RNG — sfc32 with explicit streams (decision D2)
The M0 placeholder (`sfc32(seed)` returning closures) is replaced: RNG state must be plain data so it can live in state and be hashed. The algorithm (splitmix32 → 4×u32 → sfc32, 12 warm-up draws) is unchanged.

```ts
// packages/sim/src/rng.ts
export type RngState = [a: number, b: number, c: number, d: number]; // uint32 each
export const RNG_STREAMS = ["words", "combat", "enemyAi", "gimmick", "boss", "loot", "trial", "meta"] as const;
export type RngStream = (typeof RNG_STREAMS)[number];
/** splitmix32 seeded with (seed ^ fnv1a32(stream) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0, 4 draws, 12 warm-up. */
export declare function deriveRng(seed: number, stream: RngStream, index?: number): RngState;
/** Mutates s. */
export declare function nextU32(s: RngState): number;
/** Unbiased integer in [0, n) via rejection sampling. 1 <= n <= 2^32. */
export declare function below(s: RngState, n: number): number;
export const chance = (s: RngState, p: Bp): boolean => below(s, BP) < p;
/** Weighted pick; iteration order is the explicit `order` array, never object-key order. */
export declare function pickWeighted<K extends string>(s: RngState, w: Readonly<Record<K, number>>, order: readonly K[]): K;
```
No float draws (`next()` is removed from the sim API).

**Stream rules**
- Each encounter (index `e`) gets fresh streams at `EncounterStarted`: `words`, `combat`, `enemyAi`, `gimmick`, and `boss` for the boss encounter, all with `index = e`. A change in encounter 1 never shifts rolls in encounter 2.
- `loot` is derived **at roll time** with `index = e` (`deriveRng(seed, "loot", e)`). Loot is independent of how the fight went, and adding combat features never shifts loot.
- `trial` is for the Typing Trial. `meta` is not used in-level; the save's `metaRng` (§9.1) drives cache rolls and story seeds.
- Adding a new randomness consumer means **adding a new stream name**, never borrowing an existing one. Removing or reordering draws inside a stream bumps `SIM_VERSION`.

### 1.4 State, snapshot, hash (decision D3)
- All sim state (`LevelState`, `TrialState`) is **plain JSON data**: safe integers, strings, booleans, `null`, arrays, plain objects. There are no classes, `Map`/`Set`, `undefined` (use `null`), closures or floats. Content defs are referenced by id, not embedded.
- The sim **mutates state in place** (60 Hz, per-key cost < 0.3 ms). "Pure" means no I/O, no ambient time or randomness, and same inputs → same outputs.
```ts
// packages/sim/src/hash.ts
/** Sorted keys, no whitespace. Throws on non-safe-integer numbers, NaN, undefined, functions, non-plain objects. */
export declare function canonicalJson(v: unknown): string;
/** FNV-1a 32 over UTF-16 code units, low byte then high byte of each unit. Offset 0x811c9dc5, prime 0x01000193 via Math.imul. */
export declare function fnv1a32(s: string): number;
/** 8 lowercase hex chars of fnv1a32(canonicalJson(state)). */
export declare function hash(state: LevelState | TrialState): string;
```
32 bits is enough: the hash is for regression and client↔Worker parity tests. Anti-cheat compares re-simulated **outcomes** directly (§10), so it never trusts a hash for security.

### 1.5 Purity checklist (Reviewer enforces)
No DOM, no three.js, no `Math.random`, no wall-clock time, no banned `Math.*`/`**`, no floats in state, no `async`, no module-level mutable state (everything lives in the state object), no iteration over object keys for logic order (use arrays).

---

## 2. Input format and client clock protocol

```ts
// packages/sim/src/input.ts
/** Printable ASCII the content may use. */
export const TYPABLE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,'-?!;:\"()";
export type SimKey = "Escape" | string; // string = exactly one char of TYPABLE_CHARS
export type KeyInput = { tick: Tick; key: SimKey };
export type CommandInput =
  | { tick: Tick; cmd: "abandon" }                                  // quit from pause menu -> LevelFailed{abandoned}
  | { tick: Tick; cmd: "revive"; source: "gem" | "feather" };      // hook; rejected unless options.allowExternalRevive
export type SimInput = KeyInput | CommandInput;

/** Pure mapping from a keydown-like record. Returns null = ignore (not logged, not sent). */
export declare function normalizeKey(e: {
  key: string; repeat: boolean; isComposing: boolean;
  ctrlKey: boolean; metaKey: boolean; altKey: boolean;
}): SimKey | null;
```
`normalizeKey` rules:
1. `repeat` → null (auto-repeat is ignored). `isComposing` or `key === "Dead"` or `"Process"` → null.
2. `ctrlKey || metaKey` → null, **except** `ctrlKey && altKey` (Windows AltGr produces characters).
3. `"Escape"` → `"Escape"`. `"Tab"` → `"Escape"` (the client must `preventDefault`).
4. Typographic normalization: `’ ‘` → `'`, `“ ”` → `"`, `–` → `-`, NBSP → space.
5. A single char in `TYPABLE_CHARS` → itself (**case preserved**). Anything else → null.

**Case (D5):** `LevelOptions.caseMode = "auto"` (default) compares case-insensitively when the plate text contains no uppercase letters (all of Ch1), and case-sensitively otherwise (T5+ capitals). `"strict"` always compares exactly. Logged keys keep their real case.

**Escape vs pause (D6):** this is a client rule. Escape while the view has a locked target is sent to the sim (drop). Escape with no target opens the pause menu and is not sent. Tab always drops. In the Trial, Escape opens "abandon run?".

**Client clock protocol** (apps/game `level/runner.ts`, illustrative but normative for tick derivation):
```ts
// clockOriginMs = performance.now() at createLevel (story) or at the first keydown (Trial).
// pausedTotalMs accumulates while paused. Inputs are applied in the keydown handler (not on the next
// frame) so the key click and letter pop fire with < 10 ms latency.
function onKeyDown(e: KeyboardEvent) {
  const key = normalizeKey(e);
  if (key === null || paused) return;
  let ms = Math.round(e.timeStamp - clockOriginMs - pausedTotalMs);
  ms = Math.max(ms, tickStartMs(state.tick), lastLoggedMs); // never earlier than what is already simulated
  const tick = msToTick(ms);
  dispatch(step(state, tick - state.tick));
  dispatch(applyInput(state, { tick, key }));
  log.push({ ms, key }); lastLoggedMs = ms;
}
function onFrame(now: number) {
  const ms = now - clockOriginMs - pausedTotalMs;
  const target = msToTick(Math.floor(ms));
  dispatch(step(state, Math.min(target - state.tick, 600))); // > 10 s stall: auto-pause instead of catching up
  render(getView(state), /* alpha */ Math.min(1, Math.max(0, ms * 0.06 - state.tick)));
}
```
- The **log stores integer ms** (game-time, pauses excluded); ticks are always re-derived with `msToTick`. This keeps sub-tick timing for the anti-cheat heuristics while the sim stays tick-based (D4).
- Same-tick inputs are applied in log order. `applyInput` requires `input.tick === state.tick` (it throws otherwise; that is a programming error).
- `visibilitychange → hidden` auto-pauses story levels and aborts the Trial.

---

## 3. Public sim API

```ts
// packages/sim/src/index.ts
export const SIM_VERSION = 1 as const;

export type WeaponArchetype = "sword" | "dagger" | "staff" | "hammer";
export type DamageType = "slash" | "pierce" | "blunt" | "arcane" | "fire" | "ice" | "light";
export type Rarity = "C" | "U" | "R" | "E" | "L";
export type GearSlot = "weapon" | "armor" | "charm";
export type ActiveSkillId = "slashWave" | "piercingThrust" | "fireball" | "frostLock" | "mendingLight" | "aegis";
export type PassiveId =
  | "cleanCut" | "bulwarkStreak" | "steadyHands" | "riposte"
  | "ironWill" | "openingGambit" | "lastStand" | "comeback";
export type CastMode = "smart" | "asap";
export type ComboMode = "gentle" | "strict" | "zen";
export type Difficulty = "story" | "standard" | "hard" | "zen"; // zen: enemies never attack

export interface GearStats { tier: number; rarity: Rarity; upgrade: number }
/** Flattened, sim-ready loadout. The client builds it from save + content (`buildLoadout` in apps/game/meta). */
export interface Loadout {
  weapon: GearStats & { archetype: WeaponArchetype };
  armor: GearStats;
  charm: GearStats;
  actives: [ActiveSkillId | null, ActiveSkillId | null];
  activeModes: [CastMode, CastMode];
  passives: [PassiveId | null, PassiveId | null, PassiveId | null];
}

export interface LevelOptions {
  pace: number;                 // integer net WPM; createLevel clamps it to 15..120. Locked for the level.
  difficulty: Difficulty;
  comboMode: ComboMode;
  caseMode: "auto" | "strict";
  autoUnlockAfterTypos: 0 | 3;  // beginner "auto-unlock" (doc 01 §1.2); 0 = off
  firstClear: boolean;          // chest odds 30% vs 15%, boss chest 100% vs 50%
  frontierChapter: number;      // chest gear tier
  goldMultBp: Bp;               // replay / stale / soft-cap multiplier from meta; 10_000 on first clear
  allowExternalRevive: boolean; // slice: false (gem revive hook)
  tutorial: boolean;            // L1-1: emits TutorialCue, gentler first guard (BALANCE.TUTORIAL_*)
}

/** Produced by resolveLevel(bundle, levelId, ctx). Everything the sim needs; strings only for words. */
export interface ResolvedLevel {
  levelId: string; chapter: number; index: number; isBoss: boolean; contentVersion: string;
  segments: ResolvedSegment[];          // walk | encounter (1..n waves) | boss; seconds already converted to ticks
  enemies: Record<string, ResolvedEnemy>; // by EnemyDef.id; hp/hit in Milli, intervals in ticks
  boss: ResolvedBoss | null;
  words: {
    current: string[]; review: string[]; biome: string[]; weak: string[]; // weak = SRS due list for this attempt
    guard: string[]; doom: string[]; finisher: string[]; secondWind: string[]; minigame: string[];
  };
  tierMixBp: { current: Bp; review: Bp; biome: Bp; weak: Bp };  // 6000/2000/1500/500; an empty pool's weight goes to current
  plateLength: [min: number, max: number];
  goldTotal: number;                    // levelGold(chapter, index); options.goldMultBp is applied on top
}
export declare function resolveLevel(bundle: ContentBundle, levelId: string, ctx: { dueWeakWords: string[] }): ResolvedLevel;

export declare function createLevel(def: ResolvedLevel, loadout: Loadout, seed: number, options: LevelOptions): LevelState;
/** Precondition: input.tick === state.tick. Applied before that tick's step processing. */
export declare function applyInput(state: LevelState, input: SimInput): SimEvent[];
/** Advance n >= 0 ticks. A terminal state ('cleared' | 'failed') does not advance and returns []. */
export declare function step(state: LevelState, n?: number): SimEvent[];
export declare function getView(state: Readonly<LevelState>): LevelView;   // fresh object; floats allowed (never hashed)
export declare function getResult(state: Readonly<LevelState>): LevelResult | null; // non-null once terminal
export declare function computeHeroStats(loadout: Loadout): { atk: Milli; maxHp: Milli };

export interface Snapshot<S> { simVersion: typeof SIM_VERSION; state: S }
export declare function snapshot<S extends LevelState | TrialState>(state: S): Snapshot<S>; // structuredClone
export declare function restore<S extends LevelState | TrialState>(snap: Snapshot<S>): S;   // throws on version mismatch
export { hash } from "./hash.ts";

export interface ReplayResult<S, R> { finalState: S; events: SimEvent[]; hash: string; result: R | null }
/** Applies inputs in order, then keeps stepping until terminal, `untilTick`, or BALANCE.MAX_LEVEL_S (-> LevelFailed timeout). */
export declare function replay(
  def: ResolvedLevel, loadout: Loadout, seed: number, options: LevelOptions,
  inputs: readonly SimInput[], opts?: { untilTick?: Tick; collectEvents?: boolean },
): ReplayResult<LevelState, LevelResult>;

// ---- Typing Trial (the slice's only leaderboard) ----
export interface ResolvedTrial { trialId: string; durationTicks: number; passages: string[]; contentVersion: string }
export declare function resolveTrial(bundle: ContentBundle, trialId: string): ResolvedTrial;
export declare function createTrial(def: ResolvedTrial, seed: number): TrialState; // passage = passages[below(trialRng, n)]
export declare function applyTrialInput(state: TrialState, input: SimInput): SimEvent[];
export declare function stepTrial(state: TrialState, n?: number): SimEvent[];
export declare function getTrialView(state: Readonly<TrialState>): TrialView;
export declare function getTrialResult(state: Readonly<TrialState>): TrialResult | null;
export declare function replayTrial(def: ResolvedTrial, seed: number, inputs: readonly SimInput[]): ReplayResult<TrialState, TrialResult>;
export interface TrialResult {
  correctChars: number; typos: number;
  wpmX100: number;      // floor(correctChars * 60 * 100 * TICK_HZ / (5 * durationTicks)) = correctChars*20 for 60 s
  accuracyBp: Bp;       // floor(correct * BP / (correct + typos)); BP if no keys
  durationTicks: number;
}
```

### 3.1 State shape (run-level vs encounter-level)
Internals belong to the Sim engineer; this shape is the agreed split. Everything outside the sim reads **`LevelView` only**.
```ts
export type LevelPhase =
  | "walk"            // auto-walk segment; keys ignored
  | "encounterIntro"  // enemies enter, "Ready… Type!"; keys ignored until typingFromTick
  | "bossIntro"       // keys ignored
  | "combat"          // typing live
  | "bossBreather"    // 2 s phase-transition breather; keys ignored
  | "secondWind"      // only the Second Wind plate accepts keys; encounter frozen
  | "downed"          // awaiting a 'revive' command (only if allowExternalRevive)
  | "rewards"         // post-encounter loot burst; keys ignored
  | "cleared" | "failed"; // terminal

export interface LevelState {
  kind: "level"; simVersion: 1; tick: Tick; seed: number;
  phase: LevelPhase; phaseUntil: Tick | null; segmentIndex: number;
  nextId: number;                      // id allocator for enemies (>= 1) and plates
  run: RunState;                       // whole level: hero HP, combo, skill charge, stats, gold, chests, word results
  enc: EncounterState | null;          // current encounter: enemies, plates, target, focus, ATB, encounter rng streams, boss script
  // ...plus def/options copies needed for logic (ids and integers only)
}
```
Persistence rules (D18):
- **Across the whole level:** hero HP, Second Wind used, combo (plus its penalty latch), skill charge, stats, gold collected, chests.
- **Per encounter:** hero ATB resets to 0 at `EncounterStarted` (Opening Gambit sets it to 50). Also per encounter: target, focus, plates, statuses and enemy timers.

### 3.2 Tick processing order (normative)
For tick `t`, the client applies all inputs with `tick === t` in order, then `step` processes `t` and finally sets `state.tick = t + 1`. Every event carries `tick: t`. Within `step`:
1. Expire statuses and timers (break, stagger, freeze, burn/bleed ticks).
2. Resolve scheduled hero impacts (auto-attack hits, skill impacts).
3. Enemy timers: windup start → `EnemyAttackWindup` + `GuardWordShown`; impact → `EnemyAttack`.
4. Gimmick timers (fade, scramble).
5. Boss script (doom deadline, minigame spawns/landings, phase gates).
6. Smart/ASAP skill auto-cast checks.
7. Deaths, focus re-pick, encounter/wave/phase/segment transitions.

### 3.3 Typing rules (normative summary of doc 01 §1 + decisions)
- **Targeting:** with no target, the first key must equal the (case-folded) first char of a targetable plate, which gives `TargetAcquired` + `CharCorrect(index 0)`. All targetable plates have **distinct first letters** (enemy words, guard words, doom, minigame words). Second Wind and Finisher plates are exclusive and auto-targeted.
- **No target + space:** ignored. **No target + a key that matches no plate:** stray `Typo` (plateId null).
- **Locked:** the right char advances. A wrong char is a `Typo` with no advance. Other plates' letters do not switch target; the player must press Escape/Tab first.
- **Escape (D9):** `TargetDropped{escape}`. The plate's typed progress resets to 0 and the attempt is no longer perfect. Chars at indices that already paid ATB on this plate pay no ATB again (`maxPaidIndex`), so drop/re-type farming gives nothing.
- **Combo (D7, D8):** combo = consecutive Perfect words. +1 on a Perfect `WordCompleted`, and a Sword Perfect Parry adds +1 more.
  - Typo penalty by mode: gentle = halve (floor), strict = reset to 0 and −5 ATB, zen = none.
  - The penalty applies **at most once per plate attempt**, and stray typos share one latch that clears on the next correct char.
  - `ComboMult = 1 + COMBO_PER × min(combo, COMBO_CAP)` (Momentum not in the slice).
  - Tiers: 0 below 5; 1 Bronze ≥ 5; 2 Silver ≥ 15; 3 Gold ≥ 30; 4 Radiant ≥ 50.
  - `streak` = consecutive correct chars (resets on any typo). It is for audio pitch and trails only and has no mechanical effect.
- **ATB:**
  - Per correct char: `char_charge × ComboMult × passive mods`.
  - On completion: `+ word_bonus × (perfect ? 1.25 : 1) + (perfect ? 0.25 × Σchars paid on this plate : 0) + (swift ? SWIFT_ATB : 0)`.
  - Full at 100. On full: auto-attack, and the ATB keeps the overflow up to a cap of 30.
- **Swift (D30):** Perfect and `wordWpm × BP ≥ pace × SWIFT_THRESHOLD_BP` (1.3×), where `wordWpm = floor((L-1) × 720 / max(1, tLast − tFirst))`.
- **Word Strike (chip):** at completion, `CHIP_NORMAL`/`CHIP_PERFECT` × ATK to the plate's owner. It cannot push a boss past a phase gate. Chips never remove shield points.
- **Focus:** the owner of the last completed enemy plate. If the focus dies, focus moves to the lowest-slot living enemy.
- **Crit (D10):** an auto-attack crits with chance `BASE_CRIT + PERFECT_CRIT_BONUS × perfectWords / wordsCompleted` (both counted since the previous auto-attack). Clean Cut adds +10% if the last word was perfect. Crit damage ×`CRIT_MULT`.
- **Auto-attack (D12):** `AtbFilled` → `AutoAttack{impactTick = t + ATTACK_IMPACT_TICKS}` → `Hit` × weapon hits at impact. Typing continues during the dash.
- **Damage:** `ATK × mult(source) × (crit ? 1.5) × (weak ? WEAK_MULT) × (broken ? BREAK_DMG_MULT) × (staggered ? DOOM_STAGGER_DMG_MULT)`. There is no random variance (`DMG_VARIANCE = 0`, D31).
- **Weakness / shield / Break (D11, Octopath-style as in the POC):**
  - Every auto, skill or counter hit whose `DamageType` is in the enemy's weaknesses removes 1 shield point (+1 if crit). The first such hit emits `WeaknessRevealed`.
  - At 0 shield the enemy gets `Break` for `BREAK_S`: its attack timer resets and pauses, any windup or guard is cancelled, and it takes ×`BREAK_DMG_MULT` damage.
  - The shield refills when the break ends.
- **Guard (D13):**
  - At `impactTick − guardTicks` the enemy's plate is **replaced** by a guard word. `guardTicks = max(1.5 s, 2.5 s × paceFactor)`, plus 1 s on the story preset and plus Calm Mind (not in slice). If that plate was the target, `TargetDropped{plateChanged}` fires.
  - Typing the guard word → `GuardWordTyped{block|parry}`. The normal word returns as a fresh plate, and the result is held until impact.
  - At impact: parry → 0 damage, counter Hit at `PARRY_COUNTER` × ATK (Riposte 150%), +10 ATB. Block → `BLOCK_MULT` (Iron Will 0.1). Ignored → full damage, and the plate reverts after the hit.
  - The director keeps impacts of different enemies ≥ `TELEGRAPH_STAGGER_S` (0.8 s) apart.
- **Enemy timers:** `interval = baseInterval × PACE_FACTOR_BP[pace] × PRESET_INTERVAL_MULT[difficulty]`. Initial progress is random in 0–30% from the `enemyAi` stream.
- **Second Wind (D17):**
  - The first time hero HP ≤ 0 in a level → `HeroDowned` + `SecondWindStarted`. The encounter freezes (no timers, no impacts). One sentence plate is shown with a deadline of `SECOND_WIND_S` (8 s).
  - Complete it → `SecondWindSucceeded`, HP = 30% max, and combat resumes.
  - Deadline missed → `SecondWindFailed`. Then `LevelFailed{defeated}`, or `phase = 'downed'` if `allowExternalRevive` (a `revive` command → `Revived`, HP = 50%).
  - A second death in the same level → `LevelFailed` directly.
- **Fail:** `goldKept = floor(goldCollected × FAIL_GOLD_KEEP)`. Word-learning progress (`LevelResult.words`) is always reported.
- **Walk:** walk segments with `heal: true` emit `HeroHealed{walk}` (+25% max HP) at `WalkStarted`.
- **Gold:** `goldTotal × goldMultBp` is split evenly across encounters (the remainder goes to the last). It is paid at `EncounterCleared` as `GoldGained`.
- **Chests:** each normal encounter rolls a chest (`loot` stream); the boss encounter always drops one on first clear. Contents are rolled at drop and reported in `LevelResult.chests`.

### 3.4 Boss (Ruin Golem) flow
- **Phase 1 (100–66%):** the boss has normal word plates (`plateLength` from the BossDef), and the adds spawn.
- **Phase 2 (66–33%), "Incantation":**
  - The boss casts a Doom Spell every `doomEveryS`. It is a sentence plate with deadline `ceil(chars × 900 / pace) + 120` ticks (that is `chars/(pace_cps × 0.8) + 2 s`).
  - Success: stagger the boss for 4 s at ×1.5 damage.
  - Fail: `DOOM_DMG × parHp`, **non-lethal** (it clamps the hero at 1 HP, D14).
  - HP clamps at the 33% gate until `minDoomSpells` have resolved (D16).
- **Phase 3 (< 33%), signature "Falling Rubble":**
  - Words fall in lanes; each cleared word deals a Word-Strike-class hit to the boss, and each missed word hits the hero for `missHit`.
  - Auto-attacks and skills keep hitting the boss. The boss's own attacks are suspended.
  - The boss's HP clamps at 1 milli until the minigame wave in progress ends. Once HP sits at that floor → `FinisherShown`.
  - The Finisher sentence has **no timer**. Completing it → `FinisherCompleted` → `EnemyDeath{byKind: finisher}` (D15).
- **Each transition:** `BossPhaseChanged`, a breather of `breatherS`, and `HeroHealed{phase}` for `PHASE_HEAL`.

---

## 4. Events — `packages/sim/src/events.ts`

Conventions:
- Every event has `type` and `tick`. Ids: `EntityId` (hero = 0, enemies ≥ 1), `PlateId` (unique per level).
- **Amounts in events are display integers** (`toDisplay`), except fields suffixed `M` (milli).
- Events are emitted at sim time. Presentation may stagger them (hit-stop etc.) but must not reorder causally related events.

```ts
import type { Tick } from "./time.ts";
import type { ActiveSkillId, DamageType, PassiveId, Rarity, GearSlot, WeaponArchetype, TrialResult } from "./index.ts";
import type { CachePity } from "./meta/cache.ts";

export type EntityId = number;
export type PlateId = number;
export type PlateKind = "word" | "guard" | "doom" | "minigame" | "finisher" | "secondWind" | "trial";
export type ComboTier = 0 | 1 | 2 | 3 | 4; // none, bronze 5, silver 15, gold 30, radiant 50
export type HitKind = "auto" | "chip" | "skill" | "counter" | "dot" | "minigame" | "finisher";
export type StatusId = "burn" | "bleed" | "freeze" | "stagger" | "barrier";
export type ChestTier = "Wooden" | "Iron" | "Gold" | "Mythic";
export type TargetDropReason = "escape" | "autoUnlock" | "plateChanged" | "ownerDied" | "phaseChanged";

type Ev<T extends string, P extends object = {}> = { type: T; tick: Tick } & P;

export type SimEvent =
  // ---- flow ----
  | Ev<"LevelStarted", { levelId: string; chapter: number; isBossLevel: boolean; encounterCount: number }>
  | Ev<"WalkStarted", { segmentIndex: number; untilTick: Tick; heals: boolean }>
  | Ev<"WalkEnded", { segmentIndex: number }>
  | Ev<"EncounterStarted", { encounterIndex: number; name: string; isBoss: boolean; waveCount: number; typingFromTick: Tick }>
  | Ev<"WaveStarted", { encounterIndex: number; waveIndex: number; enemyIds: EntityId[] }>
  | Ev<"EnemySpawned", { enemyId: EntityId; defId: string; slot: number; maxHp: number; isBoss: boolean; shieldMax: number }>
  | Ev<"EncounterCleared", { encounterIndex: number; durationTicks: number }>
  | Ev<"LevelCleared", { levelId: string; durationTicks: number; gold: number }>
  | Ev<"LevelFailed", { reason: "defeated" | "abandoned" | "timeout"; goldKept: number }>
  | Ev<"TutorialCue", { cue: "target" | "atb" | "guard" | "skill" | "combo" }>
  // ---- plates & typing (HUD: plateId + index locate the letter; VFX: comboTier/streak drive colour/pitch) ----
  | Ev<"PlateShown", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; text: string; display: string; replacesPlateId: PlateId | null }>
  | Ev<"PlateRemoved", { plateId: PlateId; reason: "completed" | "replaced" | "ownerDied" | "expired" | "phaseEnded" }>
  | Ev<"TargetAcquired", { plateId: PlateId; ownerId: EntityId | null }>
  | Ev<"TargetDropped", { plateId: PlateId; ownerId: EntityId | null; reason: TargetDropReason }>
  | Ev<"CharCorrect", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; index: number; char: string; isLast: boolean; combo: number; comboTier: ComboTier; streak: number; atbGainM: number }>
  | Ev<"Typo", { plateId: PlateId | null; ownerId: EntityId | null; index: number; expected: string | null; got: string; comboBefore: number; combo: number; penalty: "halved" | "reset" | "none" | "latched" | "forgiven" }>
  | Ev<"WordCompleted", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; text: string; wordKey: string; perfect: boolean; swift: boolean; chipDamage: number; atbGainM: number; combo: number }>
  | Ev<"SentenceWordDone", { plateId: PlateId; kind: PlateKind; wordIndex: number; wordCount: number }> // projectile per word (T2.6)
  | Ev<"ComboTierChanged", { from: ComboTier; to: ComboTier; combo: number }>
  | Ev<"BurstWpm", { wpm: number; band: "swift" | "blazing" }>
  // ---- defense ----
  | Ev<"EnemyAttackWindup", { enemyId: EntityId; impactTick: Tick; heavy: boolean }>
  | Ev<"GuardWordShown", { enemyId: EntityId; plateId: PlateId; text: string; impactTick: Tick; spanTicks: number }>
  | Ev<"GuardWordTyped", { enemyId: EntityId; plateId: PlateId; perfect: boolean; result: "block" | "parry" }>
  | Ev<"GuardBlocked", { enemyId: EntityId; damage: number }>
  | Ev<"GuardParried", { enemyId: EntityId; counterDamage: number }> // the counter also emits Hit{kind:"counter"}
  // ---- ATB & hero offense ----
  | Ev<"AtbFilled", { overflowM: number }>
  | Ev<"AutoAttack", { targetId: EntityId; archetype: WeaponArchetype; hits: number; impactTick: Tick; crit: boolean }>
  | Ev<"Hit", { sourceId: EntityId; targetId: EntityId; kind: HitKind; damageType: DamageType | null; damage: number; hpAfter: number; maxHp: number; crit: boolean; weak: boolean; broken: boolean; atbKnockback: boolean; hitIndex: number; hitCount: number; killed: boolean }>
  | Ev<"WeaknessRevealed", { enemyId: EntityId; damageType: DamageType }>
  | Ev<"ShieldDamaged", { enemyId: EntityId; shield: number; shieldMax: number }>
  | Ev<"Break", { enemyId: EntityId; untilTick: Tick }>
  | Ev<"BreakEnded", { enemyId: EntityId }>
  | Ev<"StatusApplied", { targetId: EntityId; status: StatusId; untilTick: Tick | null; stacks: number }>
  | Ev<"StatusEnded", { targetId: EntityId; status: StatusId }>
  | Ev<"FocusChanged", { enemyId: EntityId | null }>
  // ---- enemy offense & hero state ----
  | Ev<"EnemyAttack", { enemyId: EntityId; outcome: "hit" | "blocked" | "parried" | "barrier"; damage: number }>
  | Ev<"HeroDamaged", { sourceId: EntityId | null; cause: "attack" | "doom" | "minigame"; damage: number; hpAfter: number; maxHp: number; blocked: boolean }>
  | Ev<"HeroHealed", { cause: "walk" | "skill" | "phase" | "secondWind" | "revive" | "passive"; amount: number; hpAfter: number; maxHp: number }>
  | Ev<"EnemyDeath", { enemyId: EntityId; defId: string; isBoss: boolean; byKind: HitKind }>
  | Ev<"HeroDowned", { secondWindAvailable: boolean }>
  | Ev<"SecondWindStarted", { plateId: PlateId; text: string; deadlineTick: Tick }>
  | Ev<"SecondWindSucceeded", { hpAfter: number; maxHp: number }>
  | Ev<"SecondWindFailed", {}>
  | Ev<"Revived", { source: "gem" | "feather"; hpAfter: number }> // hook; never emitted in the slice
  // ---- skills ----
  | Ev<"SkillCharged", { slot: 0 | 1; skillId: ActiveSkillId }>
  | Ev<"SkillCast", { slot: 0 | 1; skillId: ActiveSkillId; targetIds: EntityId[]; impactTick: Tick }>
  | Ev<"PassiveTriggered", { passiveId: PassiveId; targetId: EntityId | null }>
  // ---- gimmicks ----
  | Ev<"WordFaded", { plateId: PlateId; enemyId: EntityId }>
  | Ev<"WordScrambled", { plateId: PlateId; enemyId: EntityId; display: string }>
  | Ev<"WordUnscrambled", { plateId: PlateId; enemyId: EntityId }>
  // ---- boss ----
  | Ev<"BossIntroStarted", { enemyId: EntityId; bossId: string; name: string; title: string; untilTick: Tick }>
  | Ev<"BossPhaseChanged", { enemyId: EntityId; from: 1 | 2 | 3; to: 1 | 2 | 3; breatherUntilTick: Tick }>
  | Ev<"DoomSpellStarted", { enemyId: EntityId; plateId: PlateId; text: string; deadlineTick: Tick }>
  | Ev<"DoomSpellCompleted", { enemyId: EntityId; plateId: PlateId; staggerUntilTick: Tick }>
  | Ev<"DoomSpellFailed", { enemyId: EntityId; plateId: PlateId; damage: number }>
  | Ev<"MinigameStarted", { enemyId: EntityId; kind: "fallingRubble"; lanes: number }>
  | Ev<"MinigameWordSpawned", { plateId: PlateId; text: string; lane: number; landTick: Tick }>
  | Ev<"MinigameWordCleared", { plateId: PlateId; lane: number }>
  | Ev<"MinigameWordMissed", { plateId: PlateId; lane: number; damage: number }>
  | Ev<"MinigameEnded", { cleared: number; missed: number }>
  | Ev<"FinisherShown", { enemyId: EntityId; plateId: PlateId; text: string }>
  | Ev<"FinisherCompleted", { enemyId: EntityId; plateId: PlateId }>
  // ---- rewards ----
  | Ev<"GoldGained", { amount: number; source: "encounter" | "passive"; total: number }>
  | Ev<"ChestDropped", { tier: ChestTier; encounterIndex: number; enemyId: EntityId | null }>
  // ---- trial ----
  | Ev<"TrialStarted", { trialId: string; durationTicks: number; passageLength: number }>
  | Ev<"TrialEnded", { result: TrialResult }>;

export const ALL_EVENT_TYPES = [
  "LevelStarted", "WalkStarted", "WalkEnded", "EncounterStarted", "WaveStarted", "EnemySpawned",
  "EncounterCleared", "LevelCleared", "LevelFailed", "TutorialCue",
  "PlateShown", "PlateRemoved", "TargetAcquired", "TargetDropped", "CharCorrect", "Typo",
  "WordCompleted", "SentenceWordDone", "ComboTierChanged", "BurstWpm",
  "EnemyAttackWindup", "GuardWordShown", "GuardWordTyped", "GuardBlocked", "GuardParried",
  "AtbFilled", "AutoAttack", "Hit", "WeaknessRevealed", "ShieldDamaged", "Break", "BreakEnded",
  "StatusApplied", "StatusEnded", "FocusChanged",
  "EnemyAttack", "HeroDamaged", "HeroHealed", "EnemyDeath", "HeroDowned",
  "SecondWindStarted", "SecondWindSucceeded", "SecondWindFailed", "Revived",
  "SkillCharged", "SkillCast", "PassiveTriggered",
  "WordFaded", "WordScrambled", "WordUnscrambled",
  "BossIntroStarted", "BossPhaseChanged", "DoomSpellStarted", "DoomSpellCompleted", "DoomSpellFailed",
  "MinigameStarted", "MinigameWordSpawned", "MinigameWordCleared", "MinigameWordMissed", "MinigameEnded",
  "FinisherShown", "FinisherCompleted",
  "GoldGained", "ChestDropped",
  "TrialStarted", "TrialEnded",
] as const satisfies readonly SimEvent["type"][];

export type SimEventType = (typeof ALL_EVENT_TYPES)[number];
export type EventOf<T extends SimEventType> = Extract<SimEvent, { type: T }>;
// Compile-time exhaustiveness: fails to typecheck if the union gains a type the array lacks.
type _Missing = Exclude<SimEvent["type"], SimEventType>;
export const _eventTypesExhaustive: [_Missing] extends [never] ? true : _Missing = true;

/** T2.3: level/eventBindings.ts must provide a full map (missing keys = type error). */
export type EventHandlers = { [K in SimEventType]: (e: EventOf<K>) => void };

// ---- Meta events: produced by §8 meta functions (cache-opening screen), not by the level stream. No tick. ----
export type MetaEvent =
  | { type: "CacheRolled"; rarity: Rarity; slot: GearSlot; tier: number; archetype: WeaponArchetype | null; guaranteed: "none" | "rare" | "epic" | "legendary"; pity: CachePity }
  | { type: "ChestOpened"; tier: ChestTier; gold: number; gearCount: number; caches: number }
  | { type: "GearUpgraded"; gearUid: number; upgrade: number; cost: number };
export const ALL_META_EVENT_TYPES = ["CacheRolled", "ChestOpened", "GearUpgraded"] as const satisfies readonly MetaEvent["type"][];
```
Crit and weakness are **flags on `Hit`** (`crit`, `weak`). The VFX binding branches on them, so one hit never gets double VFX. `WeaknessRevealed` is a separate one-shot (it unveils the weakness icon).

---

## 5. Read-only view — `packages/sim/src/view.ts`

Rules:
- The renderer, HUD and audio read `getView(state)` once per frame plus the event stream. They **never mutate sim state** and never compute game logic.
- **Interpolation:** keep the previous frame's view, and lerp bar values and positions with `alpha = clamp(simMs × 0.06 − view.tick, 0, 1)`. Discrete facts (typedIndex, plate text, alive) are never interpolated.
- View values are floats (UI-friendly) and are never hashed or fed back.

```ts
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type HeroPose = "walk" | "idle" | "attack" | "cast" | "hurt" | "guard" | "downed" | "victory";
export type EnemyPose = "enter" | "idle" | "windup" | "attack" | "hurt" | "broken" | "dead";

export interface PlateView {
  id: PlateId; ownerId: EntityId | null; kind: PlateKind;
  text: string;            // the answer
  display: string;         // what to draw (== text unless scrambled and not yet unlocked)
  typedIndex: number;      // chars [0, typedIndex) are typed (gold); text[typedIndex] is the next letter
  isTarget: boolean;
  faded: boolean;          // fading gimmick: draw only typed chars + blanks (gimmick overrides the next-letter rule)
  hadTypo: boolean;        // current attempt is not perfect
  lastTypoTick: Tick | null;
  expiresAtTick: Tick | null; // guard impact / doom deadline / minigame landing / second wind deadline
  totalTicks: number | null;  // for timer strips
}
export interface EnemyView {
  id: EntityId; defId: string; slot: number; isBoss: boolean; alive: boolean;
  hp: number; maxHp: number; hpFrac: number;
  atbFrac: number;                    // progress from cycle start to impact
  plateId: PlateId | null;
  isGuard: boolean; guardTicksLeft: number; guardTotalTicks: number;
  guardResult: "block" | "parry" | null; // typed, waiting for impact
  shield: number; shieldMax: number;
  weaknesses: { type: DamageType; revealed: boolean }[];
  brokenTicksLeft: number;
  statuses: { id: StatusId; ticksLeft: number | null; stacks: number }[];
  isFocus: boolean;
  pose: EnemyPose; poseSinceTick: Tick;
}
export interface HeroView {
  hp: number; maxHp: number; hpFrac: number;
  atbFrac: number; archetype: WeaponArchetype; weaponDamageType: DamageType;
  barrierCharges: number; statuses: EnemyView["statuses"];
  secondWindAvailable: boolean;
  pose: HeroPose; poseSinceTick: Tick;
}
export interface SkillView { slot: 0 | 1; id: ActiveSkillId; chargeFrac: number; ready: boolean; mode: CastMode }
export interface LevelView {
  tick: Tick; phase: LevelPhase; phaseProgress: number;    // 0..1 for timed phases (walk dolly, intros, breather)
  levelId: string; chapter: number; isBossLevel: boolean;
  encounterIndex: number | null; encounterCount: number; waveIndex: number | null;
  hero: HeroView;
  enemies: EnemyView[];                // current encounter, stable slot order, dead ones kept with alive=false
  plates: PlateView[];                 // every visible plate incl. doom/minigame/finisher/second wind
  targetPlateId: PlateId | null; focusEnemyId: EntityId | null;
  combo: number; comboTier: ComboTier; comboMult: number; streak: number; comboMode: ComboMode;
  skills: SkillView[]; passives: PassiveId[];
  boss: { enemyId: EntityId; name: string; title: string; phase: 1 | 2 | 3; gateHpFrac: number | null } | null;
  doom: { plateId: PlateId; ticksLeft: number; totalTicks: number } | null;
  minigame: { lanes: number; cleared: number; missed: number } | null;
  secondWind: { plateId: PlateId; ticksLeft: number; totalTicks: number } | null;
  stats: { netWpm: number; accuracy: number; burstWpm: number; elapsedTicks: number; activeTicks: number };
  goldCollected: number;
}
export interface TrialView {
  tick: Tick; started: boolean; ticksLeft: number; passage: string; typedIndex: number;
  lastTypoTick: Tick | null; netWpm: number; accuracy: number; done: boolean;
}
```

---

## 6. Content data types — `packages/content/src/schemas.ts` (zod 4)

Numbers in content are human units (seconds, whole HP points, decimals OK). `resolveLevel` converts them to ticks/milli. **Skill and passive numbers live in `BALANCE`, not in content** (D19); content holds names, text templates and art ids.

```ts
import { z } from "zod";

export const Biome = z.enum(["forest", "ruins", "cave", "hollow"]);
export const WordTier = z.number().int().min(1).max(10);
export const DamageType = z.enum(["slash", "pierce", "blunt", "arcane", "fire", "ice", "light"]);
export const Rarity = z.enum(["C", "U", "R", "E", "L"]);
export const GearSlot = z.enum(["weapon", "armor", "charm"]);
export const WeaponArchetype = z.enum(["sword", "dagger", "staff", "hammer"]);
const Ascii = z.string().regex(/^[\x20-\x7E]+$/);

export const WordEntry = z.object({
  text: Ascii.min(1).max(120),
  key: z.string().min(1),                    // SRS/journal key; = text.toLowerCase() for single words
  kind: z.enum(["word", "collocation", "sentence"]),
  tier: WordTier,
  freqRank: z.number().int().positive().optional(),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  biomes: z.array(Biome).default([]),
  uses: z.array(z.enum(["plate", "guard", "doom", "finisher", "secondWind", "minigame", "trial"])).min(1),
  definition: z.string().min(1).max(140),     // simple English
  example: z.string().min(1).max(160),
  translations: z.record(z.string(), z.string()).default({}), // BCP-47 -> text (optional, Journal only)
});

export const Gimmick = z.enum(["fading", "scrambled"]);
export const EnemyDef = z.object({
  id: z.string(), name: z.string(),
  archetype: z.enum(["grunt", "brute", "speedster", "boss"]),
  spriteId: z.string(), scale: z.number().positive().default(1), flying: z.boolean().default(false),
  baseIntervalS: z.number().positive(),       // grunt 9, brute 12, speedster 5 (scaled by pace factor)
  heavy: z.boolean().default(false),          // brute-style heavy attack (guard worth it)
  plateLength: z.tuple([z.number().int().min(2), z.number().int().max(14)]),
  weaknesses: z.array(DamageType).min(1),
  shield: z.number().int().min(1).max(9),
  hpWeight: z.number().positive().default(1), // share of the encounter HP pool
  hitWeight: z.number().positive().default(1),// x encounter gruntHit
});

export const EnemyRef = z.object({ enemy: z.string(), gimmick: Gimmick.optional() });
export const EncounterDef = z.object({
  name: z.string(),
  hp: z.number().positive(),                  // total HP pool of the encounter (generated by tools/balance, D32)
  gruntHit: z.number().positive(),            // hit of a hitWeight=1 enemy
  waves: z.array(z.array(EnemyRef).min(1).max(4)).min(1), // >1 wave -> WaveStarted
}).refine(e => new Set(e.waves.flat().map(r => r.gimmick).filter(Boolean)).size <= 2, "max 2 gimmicks/encounter");

export const MinigameDef = z.object({
  kind: z.literal("fallingRubble"),
  lanes: z.number().int().min(2).max(4),
  spawnEveryS: z.number().positive(), fallS: z.number().positive(),
  clearAtkMult: z.number().positive(),        // damage to boss per cleared word, x ATK
  missHit: z.number().positive(),             // hero damage per miss (points)
});
export const BossDef = z.object({
  id: z.string(), name: z.string(), title: z.string(), enemyId: z.string(), // sprite/weakness/shield/interval base
  hp: z.number().positive(), hit: z.number().positive(),
  plateLength: z.tuple([z.number().int(), z.number().int()]),
  phase1: z.object({ endAtHpPct: z.number().default(66), adds: z.array(EnemyRef).max(2) }),
  phase2: z.object({ endAtHpPct: z.number().default(33), doomEveryS: z.number().positive(), minDoomSpells: z.number().int().min(1) }),
  phase3: z.object({ minigame: MinigameDef, finisherText: Ascii }),
  breatherS: z.number().default(2),
  introS: z.number().default(4),
});

export const StarChallenge = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("untouched"), maxHits: z.number().int().min(0) }),
  z.object({ kind: z.literal("parTime"), slack: z.number().default(1.15) }), // par = parRefS * 35/pace * slack
  z.object({ kind: z.literal("streak"), combo: z.number().int().positive() }),
  z.object({ kind: z.literal("guardian"), parries: z.number().int().positive() }),
  z.object({ kind: z.literal("noSkills") }),
]);
export const Segment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("walk"), seconds: z.number().positive(), heal: z.boolean() }),
  z.object({ kind: z.literal("encounter"), encounter: EncounterDef }),
  z.object({ kind: z.literal("boss"), bossId: z.string() }),
]);
export const LevelDef = z.object({
  id: z.string().regex(/^ch\d+-l\d+$/), chapter: z.number().int().min(1).max(30), index: z.number().int().min(1).max(10),
  name: z.string(), biome: Biome, layoutId: z.string(),       // LDtk/Tiled level id (T2.2)
  kind: z.enum(["normal", "boss"]),
  wordTier: WordTier,
  tierMix: z.object({ current: z.number(), review: z.number(), biome: z.number(), weak: z.number() })
    .refine(m => m.current + m.review + m.biome + m.weak === 100).default({ current: 60, review: 20, biome: 15, weak: 5 }),
  plateLength: z.tuple([z.number().int(), z.number().int()]),
  segments: z.array(Segment).min(2),
  star3: StarChallenge,
  parRefS: z.number().positive(),             // active time of the 35-WPM reference typist
  tutorial: z.boolean().default(false),
});

export const GearDef = z.object({
  id: z.string(), slot: GearSlot, archetype: WeaponArchetype.optional(), // required iff slot === "weapon"
  tier: z.number().int().min(1).max(10), name: z.string(), spriteId: z.string(), flavor: z.string().optional(),
  // Stats are derived (BALANCE): score = TIER_GROWTH^(tier-1) * RARITY_MULT[rarity] * (1 + UPG_STEP*upgrade).
  // weapon -> ATK, armor -> HP, charm -> sqrt into both. Rarity/upgrade are per instance (save GearInstance).
}).refine(g => (g.slot === "weapon") === (g.archetype !== undefined));

export const ActiveSkillDef = z.object({
  id: z.enum(["slashWave", "piercingThrust", "fireball", "frostLock", "mendingLight", "aegis"]),
  name: z.string(), description: z.string(),  // may use {dmg},{charge},{secs} placeholders filled from BALANCE
  iconId: z.string(), vfxId: z.string(), sfxId: z.string(), unlockLevel: z.string().optional(),
});
export const PassiveDef = z.object({
  id: z.enum(["cleanCut", "bulwarkStreak", "steadyHands", "riposte", "ironWill", "openingGambit", "lastStand", "comeback"]),
  name: z.string(), description: z.string(),
  tag: z.enum(["precision", "speed", "defense", "tech", "economy"]),
  iconId: z.string(), unlockLevel: z.string().optional(),
});
export const TrialDef = z.object({
  id: z.string(), name: z.string(), durationS: z.literal(60),
  passages: z.array(Ascii.min(1200)).min(1).max(7), // standardized; seed picks one (D25)
});

export const ContentBundle = z.object({
  words: z.array(WordEntry), enemies: z.array(EnemyDef), bosses: z.array(BossDef), levels: z.array(LevelDef),
  gear: z.array(GearDef), actives: z.array(ActiveSkillDef), passives: z.array(PassiveDef), trials: z.array(TrialDef),
});
export type ContentBundle = z.infer<typeof ContentBundle>;
// ...and `export type X = z.infer<typeof X>` for every schema above.
/** fnv1a32(canonicalJson(bundle)) as 8 hex chars, emitted by tools/content at build time. */
export declare const CONTENT_VERSION: string;
```
Validators in `tools/content` cover:
- distinct first letters achievable for every encounter (pool letters ≥ visible plates + 1)
- plate length bands, ASCII only, and the profanity/sensitive filter
- each guard word ≤ 5 chars, tier 1
- level segments start with a walk.

---

## 7. Balance table — `packages/sim/src/balance.ts`

One `as const` object. **Keys copy `economy_sim.py` names exactly** (including snake_case inner keys) so diffs against the Python sim are mechanical. Values are human-readable floats. `deriveConstants()` converts them **once at module init** into integer constants with unit suffixes `_BP`, `_M` (milli), `_T` (ticks): `export const K = deriveConstants(BALANCE)`. Logic uses only `K` and `tables.generated.ts`.

```ts
export const BALANCE = {
  // ---- Structure (economy_sim: Story structure / Non-typing time) -- used by tools/balance level generator
  TWO_ENCOUNTER_LEVELS: 20, ENC_SIZES_EARLY: [[1, 2], [2, 2], [1, 3]],
  LEVEL_INTRO_S: 7, WALK_S: 8, REWARD_S: 5, LEVEL_END_S: 10, BOSS_EXTRA_S: 30,
  // ---- Combat (economy_sim "Combat") ----
  ATB_FULL: 100,
  WEAPON: { name: "Sword", char_charge: 8.0, word_bonus: 10.0, atk_mult: 1.0 }, // = WEAPONS.sword (parity)
  PERFECT_ATB_MULT: 1.25, SWIFT_ATB: 5.0, COMBO_PER: 0.02, COMBO_CAP: 25,
  CHIP_NORMAL: 0.15, CHIP_PERFECT: 0.25, BASE_CRIT: 0.05, PERFECT_CRIT_BONUS: 0.15, CRIT_MULT: 1.5,
  PERFECT_SKILL_CHARGE: 1.5, HERO_ATK0: 10.0, HERO_HP0: 100.0,
  WALK_HEAL: 0.25, PHASE_HEAL: 0.10, BLOCK_MULT: 0.2,
  ENEMY_BASE_INTERVAL: 9.0, BOSS_BASE_INTERVAL: 10.0,
  PACE_REF: 35.0, PACE_EXP: 0.7, PACE_CLAMP: [0.6, 1.8], HP_PACE_EXP: 0.0,
  PRESET_INTERVAL_MULT: { story: 1.4, standard: 1.0, hard: 1.0, zen: 1.0 }, // Python: scalar 1.0 (Standard)
  SECOND_WIND_HP: 0.30, PREMIUM_REVIVE_HP: 0.50,
  DOOM_DMG: 0.15, BOSS_HIT_MULT: 2.4,
  // ---- Enemy authoring (par curve) -- tools/balance only (generates EncounterDef.hp/gruntHit) ----
  ENC_TTK_S: 36.0, SAW_HP_STEP: 0.02, SAW_ATK_STEP: 0.025, DMG_FRAC: [[1, 0.40], [3, 0.65], [6, 0.85], [10, 0.95], [30, 1.00]],
  BOSS_WAVE_ENC: 1, BOSS_HP_ENC: 3.2, BOSS_ADDS_HP_ENC: 0.5, BOSS_ENC_DMG: [[1, 1.4], [3, 2.0], [6, 2.7], [10, 3.0]], DOOM_SPELLS: 2.5,
  REF_WPM: [[1, 35.0], [10, 37.0], [20, 39.5], [30, 42.0]], REF_ACC: [[1, 0.92], [10, 0.925], [30, 0.935]], REF_GUARD: [[1, 0.60], [10, 0.62], [30, 0.66]],
  // ---- Gear ----
  SLOTS: ["weapon", "armor", "charm"], TIER_GROWTH: 1.40, RARITIES: ["C", "U", "R", "E", "L"],
  RARITY_MULT: { C: 1.00, U: 1.12, R: 1.25, E: 1.40, L: 1.60 }, RARITY_UPG_CAP: { C: 5, U: 7, R: 11, E: 13, L: 15 },
  UPG_STEP: 0.07, SHOP_RARITY_PRICE: { C: 1.0, U: 2.2, R: 5.0 }, VALUE_RARITY_PRICE: { C: 1.0, U: 2.2, R: 5.0, E: 8.0, L: 12.0 },
  PRICE_T1: 1150, PRICE_GROWTH: 1.405, UPG_COST_BASE: 0.25, UPG_COST_GROWTH: 1.30,
  SALVAGE_RATE: 0.25, UPG_TRANSFER: 0.5, BOSS_NEXT_TIER_DROP: "C", DROP_SALVAGE_RATE: 0.10,
  PAR_RARITY: "U", PAR_RARITY_BY_CH: { 1: "C", 2: "C" }, PAR_UPG: { 1: 0, 2: 2, 3: 3 }, PAR_UPG_DEFAULT: 5,
  // ---- Gold ----
  GOLD_L1: 100, GOLD_GROWTH_CH: 1.125, GOLD_IN_CH_STEP: 0.03, BOSS_GOLD_MULT: 3.0,
  REPLAY_GOLD_MULT: 0.40, STALE_REPLAY_MULT: 0.50, REPLAY_SOFTCAP_PER_DAY: 40, REPLAY_SOFTCAP_MULT: 0.25,
  FAIL_GOLD_KEEP: 0.50, STAR_GOLD: 0.20, SATCHEL_PRICE_GU: 25,
  STAR2_ACC: [[10, 0.90], [20, 0.93], [30, 0.95]], STAR2_RELATIVE: true, STAR2_REL_MARGIN: 0.0, STAR2_REL_CLAMP: [0.88, 0.97],
  STAR_CHEST: { 10: "Iron", 20: "Gold", 30: "Gold" },
  // ---- Chests ----
  CHEST_P_ENCOUNTER: 0.30, CHEST_P_ENCOUNTER_REPLAY: 0.15,
  CHEST_TIER_NORMAL: { Wooden: 0.72, Iron: 0.24, Gold: 0.035, Mythic: 0.005 },
  CHEST_TIER_BOSS: { Wooden: 0.0, Iron: 0.55, Gold: 0.38, Mythic: 0.07 }, BOSS_CHEST_REPLAY_P: 0.5,
  CHEST: {
    Wooden: { gold: 0.5, gear: 0.10, rar: { C: 0.80, U: 0.20 }, gems: 0 },
    Iron: { gold: 1.0, gear: 0.35, rar: { C: 0.40, U: 0.45, R: 0.15 }, gems: 0 },
    Gold: { gold: 2.5, gear: 0.00, rar: {}, gems: 5 },     // v2: gear -> CACHE_FROM_CHEST
    Mythic: { gold: 6.0, gear: 0.00, rar: {}, gems: 20 },
  },
  CHEST_GEAR_TIER_DOWN_P: 0.30,
  // ---- Gear Caches ----
  CACHE_GOLD_GU: 14, CACHE_GEM_PRICE: 50, CACHE_GEM_DAILY_CAP: 1,
  CACHE_ODDS: { C: 0.40, U: 0.33, R: 0.20, E: 0.06, L: 0.01 },
  CACHE_PITY_RARE: 8, CACHE_PITY_EPIC: 30, CACHE_PITY_LEG: 120,
  CACHE_FROM_CHEST: { Wooden: 0, Iron: 0, Gold: 1, Mythic: 2 }, CACHE_FROM_STAR30: 1, CACHE_FROM_WEEKLY: 2,

  // ======== TS-only (NOT in economy_sim; tools/balance parity ignores or models them) ========
  WEAPONS: {                                   // doc 01 §2.2
    sword: { char_charge: 8, word_bonus: 10, atk_mult: 1.0, hits: 1, damage_type: "slash" },
    dagger: { char_charge: 11, word_bonus: 6, atk_mult: 0.45, hits: 2, damage_type: "pierce", bleed_every: 3 },
    staff: { char_charge: 6, word_bonus: 8, atk_mult: 0.8, hits: 1, damage_type: "arcane", skill_charge_mult: 1.5 },
    hammer: { char_charge: 5, word_bonus: 14, atk_mult: 2.2, hits: 1, damage_type: "blunt", atb_knockback: 0.30 },
  },
  ATB_OVERFLOW_CAP: 30, STRICT_TYPO_ATB: 5, SWIFT_THRESHOLD: 1.3, BURST_BANDS: { swift: 1.3, blazing: 1.6 }, BURST_CHARS: 16, BURST_COOLDOWN_S: 5,
  COMBO_TIERS: [5, 15, 30, 50],
  GUARD_S: 2.5, GUARD_MIN_S: 1.5, STORY_GUARD_BONUS_S: 1.0, TELEGRAPH_STAGGER_S: 0.8, INITIAL_ENEMY_ATB_MAX: 0.30,
  PARRY_COUNTER: 0.5, PARRY_ATB: 10, IRON_WILL_BLOCK_MULT: 0.1, RIPOSTE_COUNTER: 1.5,
  WEAK_MULT: 1.3, BREAK_DMG_MULT: 1.8, BREAK_S: 4.5, DMG_VARIANCE: 0.0,
  ATTACK_IMPACT_S: 0.30, SKILL_IMPACT_S: 0.40, ENCOUNTER_INTRO_S: 2.0, SECOND_WIND_S: 8.0,
  DOOM_TIMER_PACE_EFF: 0.8, DOOM_TIMER_BONUS_S: 2.0, DOOM_STAGGER_S: 4.0, DOOM_STAGGER_DMG_MULT: 1.5,
  SKILL_CHARGE_PER_5_CHARS_FROM_TIER: 4,       // C17
  SKILLS: {                                    // doc 01 §3.1 with ~-40% damage (C3)
    slashWave: { charge: 8, atk_mult_all: 0.9, damage_type: "slash", cast: "whenEnemiesAtLeast", min_enemies: 2 },
    piercingThrust: { charge: 6, atk_mult: 1.5, damage_type: "pierce", shield_hits: 2, cast: "asap" },
    fireball: { charge: 10, atk_mult: 1.2, damage_type: "fire", burn_s: 6, burn_atk_mult_per_s: 0.05, cast: "asap" },
    frostLock: { charge: 9, freeze_s: 4, damage_type: "ice", cast: "whenTelegraph" },
    mendingLight: { charge: 12, heal: 0.25, cast: "whenHpBelow", hp_below: 0.60 },
    aegis: { charge: 10, barrier_hits: 2, cast: "whenTelegraph" },
  },
  PASSIVES: {
    cleanCut: { crit_bonus: 0.10 }, bulwarkStreak: { every_combo: 10, barrier_hits: 1 }, steadyHands: { forgiven_per_encounter: 1 },
    riposte: { counter: 1.5 }, ironWill: { block_mult: 0.1 }, openingGambit: { start_atb: 50 },
    lastStand: { hp_below: 0.30, atb_mult: 1.4 }, comeback: { restore_frac: 0.5 },
  },
  TUTORIAL_FIRST_GUARD_MULT: 2.0, TUTORIAL_HOLD_ATTACKS_UNTIL_WORDS: 3,
  MAX_LEVEL_S: 1200, TRIAL_DURATION_S: 60,
} as const;
```
Python names **deliberately not ported** (they are persona/model abstractions; they live in `tools/balance/src/model.ts`):
- the persona model: `PERSONAS`, `LEARN_TAU_H`, `ACC_TAU_H`, `GUARD_TAU_H`, `PERF_SD`, `ACC_SD`, `GUARD_SD`, `COMBAT_RNG_SD`
- typing efficiency: `COMBAT_TYPING_EFF`, `SWIFT_RATE`, `SKILL_DMG_PER_CHARGE`
- doom fail model: `DOOM_FAIL_*`
- word-tier difficulty: `WORD_TIERS`, `TIER_MIX_CURRENT`, `*_SPEED_PEN`, `*_ACC_PEN`
- economy policy and markets: missions/gems/box/pass/survival groups, `SATCHEL_RESERVE_GU`, `MIN_POWER_AS_NEEDED`, `AS_NEEDED_TARGET`, `CACHE_GOLD_EFF_BIAS`

Generated integer tables (`tables.generated.ts`): `PACE_FACTOR_BP[15..120]`, `TIER_GROWTH_BP[1..10]`, `TIER_PRICE[1..10]`, `UPG_COST[tier][0..14]`, `GOLD_UNIT[1..30]`, `LEVEL_GOLD[ch][1..10]`.

---

## 8. Meta / rewards API (pure, in `@hd2d/sim`, `packages/sim/src/meta/`)

All functions are deterministic. Functions that take an `RngState` mutate it, and the caller persists it (`save.metaRng`). Gold amounts are integers.

```ts
export interface CachePity { sinceRare: number; sinceEpic: number; sinceLegendary: number }
export const NEW_PITY: CachePity = { sinceRare: 0, sinceEpic: 0, sinceLegendary: 0 };
export interface GearRoll { slot: GearSlot; tier: number; rarity: Rarity; archetype: WeaponArchetype | null }
export interface ChestContents { tier: ChestTier; gold: number; gear: GearRoll | null; caches: number; gemsUncredited: number }

// ---- chests (used in-level by the sim with the `loot` stream; exported for tests/tools) ----
export declare function rollEncounterChest(rng: RngState, ctx: { boss: boolean; firstClear: boolean }): ChestTier | null;
export declare function openChest(rng: RngState, tier: ChestTier, ctx: { chapter: number; frontierChapter: number }): ChestContents;

// ---- caches: fixed odds + published pity, exactly economy_sim.roll_cache_rarity ----
// 1) increment all three counters; 2) if sinceLegendary >= 120 -> L;
// else if sinceEpic >= 30 -> pick from {E,L} by CACHE_ODDS; else if sinceRare >= 8 -> pick from {R,E,L};
// else pick from CACHE_ODDS; 3) reset sinceRare on R+, sinceEpic on E+, sinceLegendary on L.
// Slot uniform over SLOTS; weapon archetype uniform over 4 (D23); tier = slotTier(slot, frontierChapter).
export declare function rollCache(rng: RngState, pity: CachePity, ctx: { frontierChapter: number }): { roll: GearRoll; pity: CachePity; event: MetaEvent };
export declare function publishedCacheOdds(): { base: Record<Rarity, Bp>; pity: { rare: 8; epic: 30; legendary: 120 } };

// ---- gear & gold ----
export declare function slotTier(slot: GearSlot, chapter: number): number;        // economy_sim.slot_tier
export declare function itemScoreBp(tier: number, rarity: Rarity, upgrade: number): Bp;
export declare function goldUnit(chapter: number): number;                         // GOLD_UNIT table
export declare function levelGold(chapter: number, index: number): number;
export declare function tierPrice(tier: number): number;
export declare function shopPrice(tier: number, rarity: "C" | "U" | "R"): number;
export declare function cacheGoldPrice(frontierChapter: number): number;          // 14 GU
export declare function upgradeCap(rarity: Rarity): number;
export declare function upgradeCost(tier: number, fromLevel: number): number;     // 0.25 * price * 1.3^level
export declare function transferUpgrade(oldUpgrade: number, newRarity: Rarity): number; // min(floor(old*0.5), cap)
export declare function salvageValue(item: GearStats & { slot: GearSlot }, ctx: { fromChestUnwanted: boolean; nonTransferredUpgradeGold: number }): number;
export declare function replayGoldMultBp(ctx: { firstClear: boolean; chapter: number; frontierChapter: number; replaysToday: number }): Bp;

// ---- pace & stars ----
export declare function computePace(lastLevelNetWpm: number[], calibrationWpm: number | null): number; // median of last 10, else calibration, else 35; clamp 15..120
export declare function median7dAccuracyBp(daily: { day: string; accuracyBp: Bp }[], today: string): Bp | null;
export declare function evaluateStars(input: {
  result: LevelResult; star3: StarChallenge; parRefS: number; pace: number; median7dAccuracyBp: Bp | null;
}): [boolean, boolean, boolean];
// ★ = cleared. ★★ = cleared && accuracyBp >= clamp(median + STAR2_REL_MARGIN, 8800, 9700) (no history -> 8800).
// ★★★ = cleared && challenge met; parTime: activeTicks <= ceil(parRefS*60 * 35/pace * slack).

// ---- SRS: Leitner 5 boxes, intervals in levels played [1,2,4,8,16] ----
export interface SrsEntry { box: 1 | 2 | 3 | 4 | 5; due: number; lapses: number }
export interface SrsState { levelsPlayed: number; entries: Record<string, SrsEntry>; mastered: string[] }
export declare function srsDue(srs: SrsState, limit: number): string[]; // due <= levelsPlayed, sort (due, box, key)
export declare function srsUpdate(srs: SrsState, words: WordResult[], pace: number): SrsState;
// typo or wpm < 50% pace: absent -> box 1 (due +1); present -> box = max(1, box-1), lapses++ (D29).
// perfect && present && due: box 5 -> mastered (Lexicon); else box+1, due = levelsPlayed + interval[box-1].
// levelsPlayed++ after applying.

export interface WordResult { wordKey: string; text: string; kind: PlateKind; perfect: boolean; typos: number; wpm: number }
export interface LevelResult {
  levelId: string; outcome: "cleared" | "failed"; failReason: "defeated" | "abandoned" | "timeout" | null;
  durationTicks: number; activeTicks: number; gold: number; chests: ChestContents[];
  stats: {
    correctChars: number; typos: number; wordsCompleted: number; perfectWords: number; maxCombo: number;
    netWpmX100: number; accuracyBp: Bp; hitsTaken: number; blocks: number; perfectParries: number;
    autoAttacks: number; skillsCast: number; secondWindUsed: boolean;
    damageDealtM: Record<HitKind, number>;   // skill damage share AC (T1.4)
  };
  words: WordResult[];                         // every completed or typo'd word/guard plate, in order
}
```

---

## 9. `@hd2d/shared`: save blob + HTTP API (zod 4)

### 9.1 Save blob (client-owned; the server stores it opaquely)
```ts
// packages/shared/src/save.ts
export const SAVE_SCHEMA_VERSION = 1;
const U32 = z.number().int().min(0).max(0xffffffff);
export const GearInstance = z.object({ uid: z.number().int().positive(), defId: z.string(), rarity: Rarity, upgrade: z.number().int().min(0).max(15) });
export const SaveBlobV1 = z.object({
  schemaVersion: z.literal(1),
  createdAtMs: z.number().int(), updatedAtMs: z.number().int(), playtimeSec: z.number().int().min(0),
  settings: z.object({
    comboMode: z.enum(["gentle", "strict", "zen"]), difficulty: z.enum(["story", "standard", "hard", "zen"]),
    caseMode: z.enum(["auto", "strict"]), autoUnlock: z.boolean(), effectsIntensity: z.number().min(0).max(1),
    reducedMotion: z.boolean(), reducedFlash: z.boolean(), volumes: z.record(z.enum(["master", "sfx", "ambience", "music", "ui"]), z.number().min(0).max(1)),
    translationLang: z.string().nullable(),
  }),
  progress: z.object({
    frontierChapter: z.number().int().min(1),
    levels: z.record(z.string(), z.object({ cleared: z.boolean(), stars: z.tuple([z.boolean(), z.boolean(), z.boolean()]), bestTicks: z.number().int().nullable(), attempts: z.number().int() })),
    starChestsClaimed: z.record(z.string(), z.array(z.number().int())), // chapter -> [10,20,30]
  }),
  pace: z.object({ calibrationWpm: z.number().int().nullable(), recentNetWpm: z.array(z.number().int()).max(10) }),
  accuracyDaily: z.array(z.object({ day: z.string(), accuracyBp: z.number().int() })).max(14),
  wallet: z.object({ gold: z.number().int().min(0) }),
  inventory: z.object({ gear: z.array(GearInstance), nextGearUid: z.number().int().positive(), unopenedCaches: z.number().int().min(0) }),
  equipped: z.object({ weapon: z.number().int(), armor: z.number().int(), charm: z.number().int() }), // gear uids
  loadout: z.object({ actives: z.tuple([z.string().nullable(), z.string().nullable()]), activeModes: z.tuple([z.enum(["smart", "asap"]), z.enum(["smart", "asap"])]), passives: z.tuple([z.string().nullable(), z.string().nullable(), z.string().nullable()]) }),
  unlocks: z.object({ actives: z.array(z.string()), passives: z.array(z.string()) }),
  cachePity: z.object({ sinceRare: z.number().int(), sinceEpic: z.number().int(), sinceLegendary: z.number().int() }),
  metaRng: z.tuple([U32, U32, U32, U32]),     // drives cache rolls and per-attempt story seeds
  srs: z.object({ levelsPlayed: z.number().int(), entries: z.record(z.string(), z.object({ box: z.number().int().min(1).max(5), due: z.number().int(), lapses: z.number().int() })), mastered: z.array(z.string()) }),
  journal: z.object({ firstSeen: z.record(z.string(), z.number().int()) }), // wordKey -> levelsPlayed index
  replays: z.object({ day: z.string(), count: z.number().int() }),
  lifetime: z.object({ words: z.number().int(), chars: z.number().int(), typos: z.number().int() }),
});
export const SaveBlob = SaveBlobV1;                 // alias to the latest
export declare function migrateSave(raw: unknown): SaveBlob; // runs MIGRATIONS[v] for v = raw.schemaVersion .. latest-1, then parses
export declare const MIGRATIONS: Record<number, (old: any) => unknown>; // MIGRATIONS[1] maps v1 -> v2, etc.
export declare function summarize(save: SaveBlob): SaveSummary;
export declare function mergeSaves(local: SaveBlob, server: SaveBlob): { merged: SaveBlob; needsUserChoice: boolean };
```
Migration rules:
- Bump `schemaVersion` on any shape change and add `MIGRATIONS[n]` (n → n+1). Never edit or delete old migrations.
- Keep a fixture blob per version in `packages/shared/tests/fixtures/` (test: fixture → latest parses).
- A blob with a **newer** version than the client knows → the client goes read-only and never PUTs ("please refresh").

Merge on 409 (doc 03 §5.5):
- Monotonic fields take the max: cleared, stars (OR), `levelsPlayed`, lifetime, mastered, journal (min firstSeen).
- Fungible fields come wholesale from the side with the higher `playtimeSec`: wallet, inventory, equipped, pity, metaRng.
- If both sides are more than 30 min of playtime apart from the common base → `needsUserChoice`.

Encoding on the wire: `blob = base64(gzip(utf8(JSON.stringify(save))))` via `CompressionStream("gzip")` (`packages/shared/src/compress.ts`). The decoded size must be ≤ 256 KiB.

### 9.2 HTTP API
General rules:
- JSON bodies. Auth via `Authorization: Bearer <access JWT>`; the JWT is HS256, 15 min, claims `{sub, ageBand, region, iat, exp}`.
- The refresh token is opaque, lasts 90 days, is stored hashed, rotates on every use, and a reused token revokes the whole family.
- `POST /runs/submit` requires `Idempotency-Key: <runId>`.
- Every non-2xx response uses the error envelope (409 save conflict adds `server`).

```ts
// packages/shared/src/errors.ts
export const ErrorCode = z.enum([
  "bad_request", "unauthorized", "token_expired", "refresh_invalid", "refresh_reused", "forbidden", "not_found",
  "save_conflict", "precondition_required", "payload_too_large", "rate_limited",
  "run_not_found", "run_expired", "run_already_submitted", "bad_signature", "version_mismatch",
  "log_invalid", "resim_mismatch", "timing_impossible", "internal",
]);
export const ErrorEnvelope = z.object({ error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }) });

// packages/shared/src/api.ts
const B64 = z.base64();
const Hex8 = z.string().regex(/^[0-9a-f]{8}$/);

// POST /auth/anon            (rate 5/min/IP, Turnstile optional in slice)
export const AuthAnonRequest = z.object({ deviceId: z.uuid(), turnstileToken: z.string().optional() });
export const AuthTokens = z.object({ accessToken: z.string(), accessExpiresAt: z.number().int(), refreshToken: z.string() });
export const AuthAnonResponse = AuthTokens.extend({ userId: z.string() });
// POST /auth/refresh          401 refresh_invalid | refresh_reused
export const AuthRefreshRequest = z.object({ refreshToken: z.string().min(32) });
export const AuthRefreshResponse = AuthTokens;

// GET /save  -> 200 SaveRecord + `ETag: "<revision>"` | 404 not_found
// PUT /save  -> header `If-Match: "<revision>"` ("0" when no save exists yet; missing -> 428 precondition_required)
//            -> 200 SavePutResponse | 409 SaveConflictResponse | 413 payload_too_large   (rate 2/min)
export const SaveSummary = z.object({ schemaVersion: z.number().int(), levelMax: z.number().int().min(0), stars: z.number().int().min(0).max(900), playtimeSec: z.number().int().min(0) });
export const SaveRecord = z.object({ revision: z.number().int().min(1), updatedAt: z.number().int(), blob: B64, summary: SaveSummary });
export const SavePutRequest = z.object({ blob: B64, summary: SaveSummary });
export const SavePutResponse = z.object({ revision: z.number().int(), updatedAt: z.number().int() });
export const SaveConflictResponse = ErrorEnvelope.extend({ server: SaveRecord });

// POST /runs/start            (rate 10/min)
export const RunStartRequest = z.object({ mode: z.literal("trial"), boardId: z.literal("trial_wpm") });
export const RunTicket = z.object({
  runId: z.string(), mode: z.literal("trial"), boardId: z.literal("trial_wpm"), trialId: z.string(),
  seed: z.number().int().min(0).max(0xffffffff), issuedAt: z.number().int(), expiresAt: z.number().int(),
  simVersion: z.number().int(), contentVersion: Hex8,
  sig: z.string(), // base64url HMAC-SHA256(secret, "v1|runId|userId|mode|boardId|seed|trialId|issuedAt|expiresAt|simVersion|contentVersion")
});

// POST /runs/submit           (rate 10/min; Idempotency-Key: runId)
export const ClaimedTrialResult = z.object({
  correctChars: z.number().int().min(0), typos: z.number().int().min(0),
  wpmX100: z.number().int().min(0), accuracyBp: z.number().int().min(0).max(10000),
  durationMs: z.number().int().min(0), finalHash: Hex8,
});
export const RunSubmitRequest = z.object({
  runId: z.string(), sig: z.string(),
  logFormat: z.literal("hdk1"), log: B64.max(174_763), // deflate-raw(hdk1 bytes), <= 128 KiB
  eventCount: z.number().int().min(1).max(50_000),
  claimed: ClaimedTrialResult,
  simVersion: z.number().int(), contentVersion: Hex8, clientVersion: z.string(),
  timerResolutionMs: z.number().min(0).max(1000), // measured by the client; > 2 disables quantization checks
});
export const RunSubmitResponse = z.object({
  status: z.literal("accepted"),             // shadow-flagged runs ALSO return "accepted" (D28)
  runId: z.string(),
  verified: z.object({ wpmX100: z.number().int(), accuracyBp: z.number().int(), score: z.number().int() }),
  pb: z.boolean(), rank: z.number().int().positive().nullable(),
});
// Rejections: 4xx ErrorEnvelope with run_not_found | run_expired | bad_signature | version_mismatch |
// log_invalid | resim_mismatch (422) | timing_impossible (422) | run_already_submitted (409, different log).

// GET /lb/trial?scope=season|all&around=me    (top-100 from KV, 60 s cron; around = live D1 query)
export const LbTrialQuery = z.object({ scope: z.enum(["season", "all"]).default("season"), around: z.literal("me").optional() });
export const LbEntry = z.object({
  rank: z.number().int().positive(), userId: z.string(), displayName: z.string(),
  wpmX100: z.number().int(), accuracyBp: z.number().int(), achievedAt: z.number().int(), isMe: z.boolean(),
});
export const LbTrialResponse = z.object({
  scope: z.enum(["season", "all"]), periodKey: z.string(),   // "S1" | "all"
  updatedAt: z.number().int(),
  top: z.array(LbEntry).max(100),
  me: LbEntry.nullable(),                                     // owner sees own flagged entry here only
  around: z.array(LbEntry).max(21).optional(),                // present iff around=me: me ±10
});
```
The leaderboard `score` column is `wpmX100 * 10_000 + accuracyBp`: higher is better, ties broken by accuracy, then by earlier `achieved_at`.

### 9.3 Keystroke log format `hdk1`
Encode and decode live in `packages/sim/src/logcodec.ts` (pure bytes). deflate-raw and base64 live in `packages/shared/src/compress.ts`.
```
bytes  := magic "HDK1" (48 44 4B 31) · varint count · count × record
record := varint dtMs · varint code
dtMs   := ms since previous record; first record = ms since clock origin (Trial: always 0)
code   := 0 Escape | 1..95 printable ASCII (charCode - 31; space = 1) | 200 cmd:abandon | 201 revive:gem | 202 revive:feather
varint := unsigned LEB128, <= 5 bytes, value < 2^32
wire   := base64(deflateRaw(bytes))    limits: raw <= 256 KiB, count <= 50_000
```
```ts
export interface LoggedInput { ms: number; input: SimInput }   // input.tick === msToTick(ms)
export declare function encodeLog(entries: readonly { ms: number; key: SimKey | CommandInput["cmd"] | `revive:${"gem" | "feather"}` }[]): Uint8Array;
export declare function decodeLog(bytes: Uint8Array): LoggedInput[]; // throws LogError on bad magic/varint/code/non-monotonic
```

---

## 10. Anti-cheat re-sim contract (Worker, `POST /runs/submit`)

Steps, in order. The first failure wins.
1. Validate auth and the zod body. `Idempotency-Key` must equal `runId`.
2. Load the run row. It must exist, be owned by `sub`, have `mode/board` = trial, and be `status = 'open'`.
   - Status `accepted`/`flagged` with the **same** `sha256(log)` → return the stored response (idempotent replay).
   - Status `accepted`/`flagged` with a different log → 409 `run_already_submitted`.
   - `now > expiresAt` (issuedAt + `AC_RUN_TTL_MS`) → `run_expired`.
3. Verify the HMAC `sig` over the ticket fields (constant-time) → `bad_signature`.
4. `simVersion === SIM_VERSION` and `contentVersion === CONTENT_VERSION` of the deployed Worker → `version_mismatch`.
5. Decode the log → `log_invalid` if any of these fail:
   - the magic, the varints, the codes, or `count === eventCount`
   - the first `dtMs === 0`
   - no commands other than abandon
6. Timing plausibility → `timing_impossible`:
   - `lastMs <= (now − issuedAt) + AC_CLOCK_SLACK_MS`
   - `now − issuedAt >= 60_000 − AC_CLOCK_SLACK_MS`
   - `claimed.durationMs === min(lastMs, 60_000)`
7. **Re-simulate:**
   ```ts
   replayTrial(resolveTrial(CONTENT, ticket.trialId), ticket.seed, decoded.map(d => d.input))
   ```
   The following must **all equal** the claimed values exactly: `correctChars`, `typos`, `wpmX100`, `accuracyBp`, and `finalHash`. Any difference → 422 `resim_mismatch`, run `status = 'rejected'`, nothing is written to the leaderboard.
8. Heuristics. Any hit → `status = 'flagged'` (a shadow flag: the response is identical to accepted, and the entry is visible only to its owner). Thresholds come from Worker env vars (`wrangler.toml [vars]`, overridable per environment):

| Env var | Default | Rule (over correct + typo key records, Escape excluded; IKI = consecutive dtMs) |
|---|---|---|
| `AC_RUN_TTL_MS` | 600000 | ticket lifetime |
| `AC_CLOCK_SLACK_MS` | 5000 | clock slack in step 6 |
| `AC_MAX_SUSTAINED_WPM` / `AC_SUSTAINED_SPAN_MS` | 220 / 30000 | net WPM over any 30 s span |
| `AC_MAX_BURST_WPM` / `AC_BURST_SPAN_MS` | 300 / 5000 | net WPM over any 5 s span |
| `AC_MIN_IKI_CV` | 0.15 | coefficient of variation of IKIs (humans 0.35–0.7) |
| `AC_FAST_IKI_MS` / `AC_MAX_FAST_IKI_SHARE` | 15 / 0.02 | share of IKIs below 15 ms |
| `AC_QUANT_MIN_PERIOD_MS` / `AC_QUANT_MAX_SHARE` | 8 / 0.6 | share of IKIs that are exact multiples of one period p in [8, 50] ms; skipped if `timerResolutionMs > 2` |
| `AC_PERFECT_MIN_KEYS` / `AC_PERFECT_MIN_WPM` | 1500 / 150 | 100% accuracy over ≥ N keys at ≥ W WPM |
| `AC_PB_JUMP_REVIEW_WPM` | 35 | PB jump vs the previous verified best → insert a `flags` row for **review** only (no shadow flag) |
| `AC_MIN_KEYS` | 20 | fewer keys → accepted, but not ranked |

9. Write everything in one D1 `batch()`:
   - the run row (`status`, `submitted_at`, `log_sha256`)
   - `leaderboard_entries` for `period_key ∈ {season, 'all'}`, using the **verified** values, PB-only upsert
   - `run_replays` if the entry lands in the top 1,000 or is flagged (90-day TTL)
   - the stored response for idempotency

   Then, if the new score enters the top 100, rebuild the KV top-100.

The claimed numbers are never written. Story levels are not verified in the slice. `replay()` exists so the same contract can extend to Boss of the Week later.

Parity tests (gate §8.1):
- Golden fixtures: `(ResolvedTrial, seed, hdk1 log) → TrialResult + hash`, and `(ResolvedLevel, loadout, seed, options, log) → LevelResult + hash`. These run in Node (vitest), in Chromium (Playwright), and in `wrangler dev` (Worker test).
- Any `SIM_VERSION` bump regenerates them, and the commit says why.

---

## 11. Change process

1. This doc is versioned `MAJOR.MINOR`.
   - **MINOR:** additive changes, such as a new event type, a new optional field, or a new BALANCE key.
   - **MAJOR:** a rename, removal or semantic change of an existing contract.
   - Bump `SIM_VERSION` whenever the same inputs could produce a different state, events or result (any rule, number, RNG draw order or stream change, even in BALANCE). Bump `SAVE_SCHEMA_VERSION` for save shape changes.
2. Agents **do not edit this file**. They put an *Interface Change Proposal* in their task report:
   ```
   ICP: <title>
   Section: §N    Kind: additive | breaking    Bumps: SIM_VERSION? SAVE_SCHEMA_VERSION? doc MINOR/MAJOR
   Change: <exact TS/zod diff>
   Why: <one paragraph>
   Affected owners: <roles / files>
   ```
3. The orchestrator approves (with an Opus review for MAJOR changes), edits this doc, and appends to the changelog below. The owning agent then implements it. Consumers are told in their next brief.
4. Until an ICP is approved, implement against the current doc. Local workarounds stay inside your own package.
5. Adding an event type requires the same commit to update `ALL_EVENT_TYPES` (compile-checked) and add a stub binding in `level/eventBindings.ts` (VFX owner, via orchestrator).

**Changelog**
- 1.0 (2026-10-09): initial contract.

---

## 12. Decisions taken (review me)

| # | Decision | Why / alternative |
|---|---|---|
| D1 | Integer fixed point: quantities in milli, ratios in bp. BALANCE floats are converted once at init. All `pow`-type curves (incl. `(35/Pace)^0.7`) come from generated integer tables. `Math.pow/exp/log/trig/sqrt` and `**` are banned in sim. | Removes every cross-engine float doubt. The alternative (floats plus a determinism argument) is fragile under review. |
| D2 | sfc32 state is a plain `[u32×4]` in state. Streams are derived from (seed, stream name, encounter index). Loot is derived at roll time, so it is independent of combat. | Satisfies "adding a feature doesn't shift loot". Replaces the M0 closure-based placeholder; the algorithm is the same. |
| D3 | FNV-1a 32 over sorted-key canonical JSON. State must be plain JSON. | Simple and fast. Security comes from outcome comparison, not the hash. |
| D4 | The keystroke log stores **integer ms**; ticks = `floor(ms*3/50)`. Late keys are clamped to the current tick's first ms. | Keeps the ms timing that the heuristics need (sub-15 ms, quantization) while the sim stays tick-only. Doc 03 had dt + key; this keeps that. |
| D5 | `caseMode: "auto"`: case-insensitive for plates without capitals. | Beginners with Shift/Caps aren't punished in T1–T4. T5+ capitals stay strict. |
| D6 | Escape drops the target if one is locked; otherwise it opens pause (client). Tab always drops. | Doc 01 has both "Esc drops" and "Esc twice pauses"; this merges them. |
| D7 | Combo = consecutive **Perfect words** (doc 01 + economy sim). Tiers are 5/15/30/50 (doc 01). A separate per-char `streak` drives audio pitch. | Plan T2.6's "10/25/50/100" was an example and looks per-keystroke; the economy parity needs per-word. **PO: confirm the tier numbers for VFX.** |
| D8 | The combo penalty applies at most once per plate attempt (stray typos share one latch). | Matches the economy sim's "halve per imperfect word". Otherwise two typos would quarter the combo. |
| D9 | Escape resets the plate's progress, and chars already paid don't pay ATB again. | Prevents drop/re-type ATB farming. |
| D10 | Crit chance = 5% + 15% × the perfect share of words since the last auto-attack. | Reproduces the economy's `5% + 15%·p_perfect` in expectation and is readable to players. |
| D11 | **New mechanic vs the economy sim:** weakness ×1.3, shield points, Break 4.5 s ×1.8 (from the POC / Octopath). Chips don't remove shields. | The POC already shows WEAK/BREAK. **T6.1 must retune encounter HP** for the added DPS. |
| D12 | Auto-attack and skill damage land at a fixed impact delay (0.30/0.40 s). Hit-stop/slow-mo are render-only. | Lets the dash animation connect without ever slowing the sim or blocking input. |
| D13 | The guard word *replaces* the enemy's plate (and drops the target if it was locked). Block/parry resolve at impact. | Matches the POC and keeps the first-letter uniqueness rule simple. |
| D14 | A failed Doom Spell does 15% of par HP but is **non-lethal** (clamped to 1 HP). | Combines doc 01's "not lethal" with C4's amount. |
| D15 | The Ruin Golem's signature is "Falling Rubble" (falling words in lanes); then a Finisher with **no timer**. | The plan names no Ch1 minigame. It reuses the plate system, and the boss's own attacks are suspended in phase 3. |
| D16 | Phase 2 HP clamps at 33% until 2 Doom Spells have resolved. | Guarantees the ~2.5 doom spells the economy expects. |
| D17 | Second Wind freezes the encounter, lasts 8 s, and gives 30% HP. The gem revive is a logged `revive` command, disabled in the slice. | The hook exists without building gems. |
| D18 | Skill charge and combo persist across encounters. ATB resets each encounter. | Opening Gambit (start with 50 ATB) implies the reset. |
| D19 | Skill and passive **numbers live in BALANCE**; content has text and art only. | One parameter table (plan T1.3). |
| D20 | Slice set: actives slashWave, piercingThrust, fireball, frostLock, mendingLight, aegis; passives cleanCut, bulwarkStreak, steadyHands, riposte, ironWill, openingGambit, lastStand, comeback. Damage is −40% vs doc 01. | T1.4 may swap ids via an ICP. |
| D21 | Damage types: Sword = slash, Dagger = pierce, Staff = arcane, Hammer = blunt; skill elements fire/ice/light. | Maps the POC's "sword/fire" weaknesses to slash/fire. |
| D22 | Gear slots are weapon/armor/**charm** (the plan's "accessory"). | Matches the economy sim. |
| D23 | A cache rolls slot uniformly, and the weapon archetype uniformly over 4 (published). | **Open:** bias toward the equipped archetype? It's kinder, but must still be published and fixed. |
| D24 | `CacheRolled` (and other meta outcomes) are a separate `MetaEvent` union with no tick. | Caches open outside levels. `ALL_EVENT_TYPES` stays level/trial-only. |
| D25 | Trial: the passage includes spaces (counted as chars) and uses stop-on-error. The clock starts at the first key, lasts 60 s, and draws from ≤ 7 fixed standardized passages picked by seed. Score = `wpmX100*10000 + accuracyBp`. | Standard WPM definition; standardized for fairness. |
| D26 | `PUT /save` uses an `If-Match` header with an ETag'd revision (not `baseRevision` in the body). | As briefed. |
| D27 | `POST /runs/submit` takes `runId` in the body. Idempotency = runId + sha256(log). | As briefed (doc 03 had `/runs/:id/submit`). |
| D28 | Shadow-flagged submissions get an identical "accepted" response. | Doc 03: no instant feedback for cheaters. |
| D29 | SRS: a typo demotes one box (min 1), not straight to box 1. Promotion only when due. | Gentle-failure pillar. |
| D30 | Swift and BurstWpm thresholds are relative to the player's Pace (1.3× / 1.6×). | Fair at every WPM. |
| D31 | No damage variance (`DMG_VARIANCE = 0`, tunable). | Cleaner parity with the economy sim. Crits supply the excitement. |
| D32 | The encounter HP pool and grunt hit are explicit in level data, generated by `tools/balance` from the ported `level_spec`. Enemies split them by weight. | Data stays tunable and reviewable. The sim doesn't run authoring formulas at runtime. |
| D33 | Chest gems are reported as `gemsUncredited`. | The server owns gems, and gems are out of scope for the slice. |

**Open questions for the PO / orchestrator**
1. Combo tier numbers for VFX (D7): 5/15/30/50 per-word, or a per-keystroke scheme?
2. Cache weapon archetype (D23): uniform, or weighted toward the equipped archetype?
3. Should the Trial require typed spaces (D25), or follow the in-game "no space" rule with words shown one at a time?
4. D11 adds DPS that the economy sim doesn't model. OK to let T6.1 absorb it by raising encounter HP (~+10–15% est.)?
