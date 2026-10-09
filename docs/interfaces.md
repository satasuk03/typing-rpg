# Interfaces — the contract every implementation agent builds against

| | |
|---|---|
| **Doc version** | **1.2** (2026-10-09) |
| **SIM_VERSION** | `1` (nothing is implemented yet, so v1.1 does not bump it) |
| **Authority** | Plan §12 step 3. Overrides nothing in `00-overview.md` §6. Choices made where the brainstorm docs were ambiguous are listed in §12. |
| **Change process** | §11. Agents never edit this file directly; they propose. |

**Changelog**
- **1.2** (2026-10-09): T5.2 follow-ups, all in §9.
  - auth/anon device secret: `AuthAnonRequest.deviceSecret`; a known `deviceId` no longer yields tokens by itself.
  - `compress.ts` helpers exported from `@hd2d/shared`.
  - `PUT /save` with `If-Match` ≠ 0 and no save returns 404.
  - HTTP status table for every `ErrorCode`.
- **1.1** (2026-10-09): applies the PO decisions and the reviewer findings.
  - **PO decisions:**
    - Hybrid combo: the mechanical combo counts perfect words (tiers 5/15/30/50); the VFX colour tiers count a per-key streak (10/25/50/100), exposed as `keyStreak`, `keyStreakTier` and the `KeyStreakTierChanged` event.
    - Cache weapon odds favour the equipped archetype (40%, the other three 20% each), and the odds are published.
    - The Trial requires typed spaces.
    - Break stays; encounter HP is retuned in T6.1.
  - **Reviewer B1:** Escape keeps `perfect` and has no combo effect; an imperfect completion leaves the combo unchanged.
  - **Reviewer M1–M10:**
    - `parHpM`, plus `parLoadout` and `buildLoadout` in sim/meta.
    - `canonicalContentJson`, and `deepClone` in place of `structuredClone`.
    - Client lag ticks; the stall time goes to pause.
    - Replay is terminal-safe, the Trial end tick is defined, and the decoder has limits.
    - The server infers the timer grain.
    - The AC is restated, and the submit idempotency is now race-safe.
    - Three-way save merge.
    - Content text regex built from `TYPABLE_CHARS`.
  - **Minor fixes:**
    - Banned `localeCompare`; `%` only on non-negative operands; a normative damage chain; `chance()` always draws.
    - `Resolved*` types defined; zod 4 idioms; `Record<never, never>` in `Ev`.
    - `Hit.origin` + `skillId`; chip VFX comes only from `Hit`; `lane` added to `PlateView` and `kind` to `Typo`.
    - Trial: a pool of ≥ 30 passages and one open ticket per user.
    - Cache pity ownership stated; a requirement to extend the purity guard.
- **1.0** (2026-10-09): initial contract.

### Packages
Internal packages are consumed as TS source; imports use `.ts` extensions, as in the M0 scaffold.
```text
@hd2d/content  (packages/content)  zod schemas + data + the TYPABLE_CHARS constant. Depends on: zod.
@hd2d/sim      (packages/sim)      pure deterministic TS. Depends on @hd2d/content: `import type` for schema types,
                                   plus the pure constant TYPABLE_CHARS. It never imports the data bundle itself
                                   (bundles are passed in as arguments). package.json: "@hd2d/content": "workspace:*".
@hd2d/shared   (packages/shared)   zod API + save schemas, compression. Depends on: zod, @hd2d/sim (types + log codec), @hd2d/content (types).
apps/game      client              depends on all three.
workers/api    Hono Worker         depends on shared + sim + content.
```
There are no cycles: `sim` never imports `shared`, and `content` imports nothing internal.

| File | Contents | Owner |
|---|---|---|
| `packages/sim/src/time.ts` | `TICK_HZ`, `msToTick`, `tickStartMs`, client lag constants | Sim |
| `packages/sim/src/fixed.ts` | fixed-point helpers | Sim |
| `packages/sim/src/rng.ts` | sfc32 + stream derivation (replaces the M0 placeholder) | Sim |
| `packages/sim/src/hash.ts` | `canonicalJson`, `canonicalContentJson`, `fnv1a32`, `hash`, `deepClone` | Sim |
| `packages/sim/src/input.ts` | `SimInput`, `normalizeKey` | Sim |
| `packages/sim/src/logcodec.ts` | `hdk1` keystroke log encode/decode (no compression) | Sim |
| `packages/sim/src/events.ts` | `SimEvent`, `ALL_EVENT_TYPES`, `MetaEvent` | Sim (publish **before batch 3**) |
| `packages/sim/src/view.ts` | `LevelView`, `TrialView` | Sim |
| `packages/sim/src/index.ts` | public API (§3) | Sim |
| `packages/sim/src/balance.ts`, `tables.generated.ts`, `scripts/gen-tables.ts` | §7 | Sim |
| `packages/sim/src/resolve.ts` | `resolveLevel`, `resolveTrial` | Sim |
| `packages/sim/src/meta/*.ts` | §8 meta/reward functions, `buildLoadout`, `parLoadout` | Sim |
| `packages/content/src/schemas.ts` | §6 | Content |
| `packages/shared/src/{api,save,errors,compress}.ts` | §9 | Backend |

Code-block tags: blocks tagged `ts sim`, `ts content` or `ts shared` are normative and typecheck together (strict, tsc 7, zod 4.6). Blocks tagged `ts client` are illustrative.

---

## 1. Sim invariants

### 1.1 Time
```ts sim
// packages/sim/src/time.ts
export const TICK_HZ = 60;
/** Integer >= 0. The ONLY time unit inside the sim. Tick 0 = createLevel/createTrial. */
export type Tick = number;
/** Shared by client and Worker so both derive identical ticks from logged milliseconds. ms is an integer >= 0. */
export const msToTick = (ms: number): Tick => Math.floor((ms * 3) / 50);
/** First integer ms that maps to tick t (msToTick(tickStartMs(t)) === t). */
export const tickStartMs = (t: Tick): number => Math.ceil((t * 50) / 3);
/** Client frame stepping trails the clock by this many ticks (§2). Keys still step immediately. */
export const CLIENT_LAG_TICKS = 3;
/** A frame that would need more catch-up than this is treated as a stall: auto-pause instead (§2). */
export const MAX_CATCHUP_TICKS = 600;
```
- The sim never sees milliseconds, frames or wall-clock time. Seconds in `BALANCE`/content are converted to ticks (`Math.round(s * 60)`), either once at module init or in `resolveLevel`.
- **Hit-stop, slow-mo, the 0.1 s "time-slow before the dash", and camera punches are render-only.** They dilate animation time, never the sim clock, and never block input.
- **Pause is a client concern:** the sim simply isn't stepped. There is no pause state in the sim.

### 1.2 Numeric policy (D1)
All **hashed state is integers** (`Number.isSafeInteger`). There are never floats in state.

| Kind | Unit | Example |
|---|---|---|
| Quantities (HP, ATK, damage, heal, ATB) | **milli-points** (`MILLI = 1000`) | 100 HP → `100_000`; full ATB → `100_000` |
| Ratios, multipliers, probabilities | **basis points** (`BP = 10_000`) | ×1.25 → `12_500`; 30% → `3_000` |
| Gold, gems, counts, ticks, chars | plain integers | — |

```ts sim
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
/** Code-unit string order. The ONLY string comparison logic may use (no localeCompare). */
export const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
```
**Why this is deterministic.** ECMAScript specifies these operations exactly, so V8 (Chrome, Workers, Node), JSC and SpiderMonkey agree bit-for-bit:
- IEEE-754 `+ - * /`
- `Math.floor/ceil/round/trunc/imul/max/min`
- `Number#toString`
- the `<` comparison on strings (UTF-16 code units)

What is **banned in `packages/sim/src`**, and why:
- `Math.pow/exp/expm1/log*/sin/cos/tan/asin/acos/atan*/sinh/cosh/tanh/sqrt/cbrt/hypot` and `**`: they are implementation-approximated.
- `localeCompare` and `Intl`: their results depend on locale and ICU version.

Also, `%` may only be used with **non-negative** operands. The sim never relies on the sign of a negative remainder.

**Curves become tables.** `(35/Pace)^0.7` (clamped 0.6–1.8) is the table `PACE_FACTOR_BP[pace]` for integer pace 15..120. All other curves are generated integer tables in `tables.generated.ts`, produced by `packages/sim/scripts/gen-tables.ts`. That script may use `Math.pow`, because it is not sim runtime. A unit test regenerates the tables and diffs them.

**Purity-guard requirement (Sim engineer implements it in T1.1):**
- Extend the `packages/sim/**` Biome override and the `scripts/check.sh` grep to reject the banned `Math.*` members, the `**` operator (`\*\*` outside comments), `localeCompare`, `Intl.` and `structuredClone`.
- The grep must **ignore comments**: strip `//…` and `/*…*/` before matching, for example by running the regex over a comment-stripped copy. Comments in the sim can then say "window" or "Date" freely.
- The existing `Date`/`performance`/`window`/`document`/timer bans stay.

### 1.3 RNG: sfc32 with explicit streams (D2)
The M0 placeholder (closures) is replaced: RNG state must be plain data so that it can live in state and be hashed. The algorithm stays the same: splitmix32 → 4×u32 → sfc32 with 12 warm-up draws.
```ts sim
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
/** ALWAYS consumes exactly one below(s, BP) draw, even when p <= 0 or p >= BP (keeps streams aligned). */
export const chance = (s: RngState, p: Bp): boolean => below(s, BP) < p;
/** Weighted pick, one below() draw; iteration order is the explicit `order` array, never object-key order. */
export declare function pickWeighted<K extends string>(s: RngState, w: Readonly<Record<K, number>>, order: readonly K[]): K;
```
There are no float draws.

**Stream rules**
- **Per encounter:** each encounter `e` gets fresh `words`, `combat`, `enemyAi` and `gimmick` streams (`index = e`) at `EncounterStarted`; a boss encounter also gets `boss`. A change in encounter 1 never shifts rolls in encounter 2.
- **Loot:** `loot` is derived **at roll time** (`deriveRng(seed, "loot", e)`). Loot is therefore independent of how the fight went.
- **Trial and meta:** `trial` serves the Typing Trial. `meta` is never used in a level; the save's `metaRng` (§9.1) drives cache rolls and story attempt seeds.
- **Adding or changing consumers:** a new randomness consumer gets a **new stream name**. Removing or reordering draws inside a stream bumps `SIM_VERSION`.

### 1.4 State, clone, snapshot, hash (D3)
- **Plain data only.** All sim state (`LevelState`, `TrialState`) is plain JSON: safe integers, strings, booleans, `null`, arrays and plain objects. There are no classes, `Map`/`Set`, `undefined` (use `null`), closures or floats. Content defs are referenced by id.
- **Mutated in place.** The sim mutates state in place to stay within the per-key budget. "Pure" means no I/O, no ambient time or randomness, and the same inputs always give the same outputs.
- **Cloning.** The sim uses `deepClone`, never `structuredClone`. `structuredClone` is unavailable or behaves differently in some runtimes, and it would silently accept non-plain data.
```ts sim
// packages/sim/src/hash.ts
/** Sorted keys (cmpStr), no whitespace. Throws on non-safe-integer numbers, NaN, undefined, functions, non-plain objects. */
export declare function canonicalJson(v: unknown): string;
/** Same, but finite non-integer numbers are allowed and printed with Number#toString. For CONTENT_VERSION only (content has decimals). */
export declare function canonicalContentJson(v: unknown): string;
/** Plain-JSON deep copy. Asserts plain data exactly as canonicalJson does (throws on violations). */
export declare function deepClone<T>(v: T): T;
/** FNV-1a 32 over UTF-16 code units, low byte then high byte of each unit. Offset 0x811c9dc5, prime 0x01000193 via Math.imul. */
export declare function fnv1a32(s: string): number;
/** 8 lowercase hex chars of fnv1a32(canonicalJson(state)). */
export declare function hash(state: LevelState | TrialState): string;
```
32 bits is enough. The hash is for regression and client↔Worker parity, and anti-cheat compares the re-simulated **outcomes** directly (§10).

### 1.5 Purity checklist (Reviewer enforces)
- No DOM and no three.js.
- No `Math.random` and no wall-clock time.
- No banned `Math.*`, `**`, `localeCompare` or `Intl`.
- No `%` on possibly-negative operands.
- No floats in state.
- No `async`.
- No module-level mutable state.
- No logic ordered by object-key iteration; use arrays, and sort with `cmpStr`.

---

## 2. Input format and client clock protocol

```ts sim
// packages/sim/src/input.ts
import { TYPABLE_CHARS } from "@hd2d/content"; // single source of truth (also builds the content text regex, §6)
export type SimKey = "Escape" | string; // string = exactly one char of TYPABLE_CHARS
export type KeyInput = { tick: Tick; key: SimKey };
export type CommandInput =
  | { tick: Tick; cmd: "abandon" }                                  // quit from pause menu -> LevelFailed{abandoned}
  | { tick: Tick; cmd: "revive"; source: "gem" | "feather" };      // hook; ignored unless options.allowExternalRevive
export type SimInput = KeyInput | CommandInput;
export const isTypable = (k: string): boolean => k.length === 1 && TYPABLE_CHARS.includes(k);

/** Pure mapping from a keydown-like record. Returns null = ignore (not logged, not sent). */
export declare function normalizeKey(e: {
  key: string; repeat: boolean; isComposing: boolean;
  ctrlKey: boolean; metaKey: boolean; altKey: boolean;
}): SimKey | null;
```
`normalizeKey` rules:
1. `repeat` → null; key auto-repeat is ignored. `isComposing`, `"Dead"` and `"Process"` → null.
2. `ctrlKey || metaKey` → null, **except** `ctrlKey && altKey` (Windows AltGr produces characters).
3. `"Escape"` → `"Escape"`. `"Tab"` → `"Escape"`; the client must `preventDefault`.
4. Typographic normalization: `’ ‘` → `'`, `“ ”` → `"`, `–` → `-`, NBSP → space.
5. A single char that is in `TYPABLE_CHARS` → itself, **case preserved**. Anything else → null.

**Case (D5).** `caseMode: "auto"` (the default) compares case-insensitively when the plate text has no uppercase letters, which covers all of Ch1, and case-sensitively otherwise. `"strict"` always compares exactly. Logged keys keep their real case.

**Escape vs. pause (D6, a client rule).**
- Escape while the view has a locked target is sent to the sim, which drops the target.
- Escape with no target opens the pause menu and is not sent.
- Tab always drops the target.
- In the Trial, Escape opens "abandon run?".

**Client clock protocol.** This is apps/game `level/runner.ts`. It is illustrative except for how ticks are derived and stepped, which is normative.
```ts client
// clockOriginMs = performance.now() at createLevel (story) or at the first accepted keydown (Trial).
// pausedTotalMs accumulates while paused (including auto-pauses for stalls and hidden tabs).
function onKeyDown(e: KeyboardEvent) {
  const key = normalizeKey(e);
  if (key === null || paused) return;
  let ms = Math.round(e.timeStamp - clockOriginMs - pausedTotalMs);
  ms = Math.max(ms, tickStartMs(state.tick), lastLoggedMs);  // never earlier than what is already simulated
  const tick = msToTick(ms);
  dispatch(step(state, tick - state.tick));                    // keys step the sim immediately (lag does not apply)
  dispatch(applyInput(state, { tick, key }));
  log.push({ ms, input: { tick, key } }); lastLoggedMs = ms;
}
function onFrame(now: number) {
  if (paused) return render(getView(state), 0);
  const ms = now - clockOriginMs - pausedTotalMs;
  const target = msToTick(Math.max(0, Math.floor(ms))) - CLIENT_LAG_TICKS;
  if (target - state.tick > MAX_CATCHUP_TICKS) {               // tab stall / debugger / sleep
    pausedTotalMs += ms - tickStartMs(state.tick + CLIENT_LAG_TICKS); // the stall becomes paused time
    return pause("stall");
  }
  if (target > state.tick) dispatch(step(state, target - state.tick));
  render(getView(state), Math.min(1, Math.max(0, ms * 0.06 - CLIENT_LAG_TICKS - state.tick)));
}
```
- **Ticks come from logged ms (D4).** The log stores integer game-time ms (pauses excluded), and ticks are always re-derived with `msToTick`.
  - Frames trail the clock by `CLIENT_LAG_TICKS` (about 50 ms). Most keydown events, whose OS timestamps precede the frame, therefore land at their true tick instead of being clamped forward.
  - Keys are still applied in the handler, so the click and the letter pop happen within 10 ms.
- **Same-tick inputs** are applied in log order. `applyInput` requires `input.tick === state.tick` and throws otherwise; a mismatch is a programming error.
- **Auto-pause:** `visibilitychange → hidden` auto-pauses story levels and aborts the Trial.

---

## 3. Public sim API

```ts sim
// packages/sim/src/index.ts
export const SIM_VERSION = 1 as const;
// Shared vocabulary comes from content (single source): DamageType, Rarity, GearSlot, WeaponArchetype.
import type { DamageType, Rarity, GearSlot, WeaponArchetype, ContentBundle, StarChallenge } from "@hd2d/content";

export type ActiveSkillId = "slashWave" | "piercingThrust" | "fireball" | "frostLock" | "mendingLight" | "aegis";
export type PassiveId =
  | "cleanCut" | "bulwarkStreak" | "steadyHands" | "riposte"
  | "ironWill" | "openingGambit" | "lastStand" | "comeback";
export type CastMode = "smart" | "asap";
export type ComboMode = "gentle" | "strict" | "zen";
export type Difficulty = "story" | "standard" | "hard" | "zen"; // zen: enemies never attack
export type Gimmick = "fading" | "scrambled";

export interface GearStats { tier: number; rarity: Rarity; upgrade: number }
/** Flattened, sim-ready loadout. Built by buildLoadout (§8) or parLoadout (tools). */
export interface Loadout {
  weapon: GearStats & { archetype: WeaponArchetype };
  armor: GearStats;
  charm: GearStats;
  actives: [ActiveSkillId | null, ActiveSkillId | null];
  activeModes: [CastMode, CastMode];
  passives: [PassiveId | null, PassiveId | null, PassiveId | null];
}

export interface LevelOptions {
  pace: number;                 // integer net WPM; createLevel clamps to 15..120. Locked for the level.
  difficulty: Difficulty;
  comboMode: ComboMode;
  caseMode: "auto" | "strict";
  autoUnlockAfterTypos: 0 | 3;  // beginner auto-unlock (doc 01 §1.2); 0 = off
  firstClear: boolean;          // chest odds 30% vs 15%, boss chest 100% vs 50%
  frontierChapter: number;      // chest gear tier
  goldMultBp: Bp;               // replay/stale/soft-cap multiplier from meta; 10_000 on first clear
  allowExternalRevive: boolean; // slice: false (gem revive hook)
  tutorial: boolean;            // L1-1: TutorialCue events, gentler first guard (BALANCE.TUTORIAL_*)
}

// ---- Resolved (sim-input) data: integers only, produced by resolveLevel/resolveTrial ----
export interface ResolvedEnemyRef { enemyId: string; gimmick: Gimmick | null }
export type ResolvedSegment =
  | { kind: "walk"; ticks: number; heal: boolean }
  | { kind: "encounter"; name: string; hpPoolM: Milli; gruntHitM: Milli; waves: ResolvedEnemyRef[][] }
  | { kind: "boss"; bossId: string };
export interface ResolvedEnemy {
  id: string; archetype: "grunt" | "brute" | "speedster" | "boss";
  baseIntervalTicks: number; heavy: boolean;
  plateLength: [min: number, max: number];
  weaknesses: DamageType[]; shield: number;
  hpWeightBp: Bp; hitWeightBp: Bp;      // enemy HP = hpPoolM * hpWeightBp / Σ weights in its wave; hit = gruntHitM * hitWeightBp / BP
}
export interface ResolvedBoss {
  id: string; name: string; title: string; enemyId: string;
  hpM: Milli; hitM: Milli; plateLength: [min: number, max: number];
  phase1: { endAtHpBp: Bp; adds: ResolvedEnemyRef[] };
  phase2: { endAtHpBp: Bp; doomEveryTicks: number; minDoomSpells: number };
  phase3: {
    minigame: { kind: "fallingRubble"; lanes: number; spawnEveryTicks: number; fallTicks: number; clearAtkMultBp: Bp; missHitM: Milli };
    finisherText: string;
  };
  breatherTicks: number; introTicks: number;
}
export interface ResolvedLevel {
  levelId: string; chapter: number; index: number; isBoss: boolean; contentVersion: string;
  segments: ResolvedSegment[];
  enemies: Record<string, ResolvedEnemy>;   // by EnemyDef.id (lookup only; never iterated for logic)
  boss: ResolvedBoss | null;
  words: {
    current: string[]; review: string[]; biome: string[]; weak: string[]; // weak = SRS due list for this attempt
    guard: string[]; doom: string[]; finisher: string[]; secondWind: string[]; minigame: string[];
  };
  tierMixBp: { current: Bp; review: Bp; biome: Bp; weak: Bp }; // 6000/2000/1500/500; an empty pool's weight goes to current
  plateLength: [min: number, max: number];
  goldTotal: number;                        // levelGold(chapter, index); options.goldMultBp applies on top
  parHpM: Milli;                            // computeHeroStats(parLoadout(chapter)).maxHp (Doom Spell damage base)
  star3: StarChallenge; parRefTicks: number;
  tutorial: boolean;
}
/** Deterministic given (bundle contents, levelId, ctx). Fixtures are keyed on (contentVersion, levelId, ctx). */
export declare function resolveLevel(bundle: ContentBundle, levelId: string, ctx: { dueWeakWords: string[] }): ResolvedLevel;

export declare function createLevel(def: ResolvedLevel, loadout: Loadout, seed: number, options: LevelOptions): LevelState;
/** Precondition: input.tick === state.tick. Applied before that tick's step processing. No-op (returns []) on a terminal state. */
export declare function applyInput(state: LevelState, input: SimInput): SimEvent[];
/** Advance n >= 0 ticks. A terminal state ('cleared' | 'failed') does not advance and returns []. */
export declare function step(state: LevelState, n?: number): SimEvent[];
export declare function getView(state: Readonly<LevelState>): LevelView;   // fresh object; floats allowed (never hashed)
export declare function getResult(state: Readonly<LevelState>): LevelResult | null; // non-null once terminal
export declare function computeHeroStats(loadout: Loadout): { atk: Milli; maxHp: Milli };

export interface Snapshot<S> { simVersion: typeof SIM_VERSION; state: S }
export declare function snapshot<S extends LevelState | TrialState>(state: S): Snapshot<S>; // deepClone
export declare function restore<S extends LevelState | TrialState>(snap: Snapshot<S>): S;   // deepClone; throws on version mismatch

export interface ReplayResult<S, R> { finalState: S; events: SimEvent[]; hash: string; result: R | null }
/**
 * Steps to each input's tick and applies it; STOPS consuming inputs once the state is terminal (later inputs are
 * ignored, not errors). After the last input keeps stepping until terminal, `untilTick`, or BALANCE.MAX_LEVEL_S
 * (-> LevelFailed{timeout}). Throws on non-monotonic ticks.
 */
export declare function replay(
  def: ResolvedLevel, loadout: Loadout, seed: number, options: LevelOptions,
  inputs: readonly SimInput[], opts?: { untilTick?: Tick; collectEvents?: boolean },
): ReplayResult<LevelState, LevelResult>;

// ---- Typing Trial (the slice's only leaderboard) ----
export interface ResolvedTrial { trialId: string; durationTicks: number; passages: string[]; contentVersion: string }
export declare function resolveTrial(bundle: ContentBundle, trialId: string): ResolvedTrial;
/** passage = passages[below(deriveRng(seed, "trial"), passages.length)]. Tick 0 = the first key. */
export declare function createTrial(def: ResolvedTrial, seed: number): TrialState;
/** Inputs with tick >= durationTicks never count: the trial is terminal once state.tick === durationTicks. */
export declare function applyTrialInput(state: TrialState, input: SimInput): SimEvent[];
export declare function stepTrial(state: TrialState, n?: number): SimEvent[];
export declare function getTrialView(state: Readonly<TrialState>): TrialView;
export declare function getTrialResult(state: Readonly<TrialState>): TrialResult | null;
/** Same terminal rule as replay(); always steps to durationTicks. */
export declare function replayTrial(def: ResolvedTrial, seed: number, inputs: readonly SimInput[]): ReplayResult<TrialState, TrialResult>;
export interface TrialResult {
  correctChars: number; typos: number;     // spaces count as chars (D25)
  wpmX100: number;      // floor(correctChars * 60 * 100 * TICK_HZ / (5 * durationTicks)) = correctChars*20 for 60 s
  accuracyBp: Bp;       // floor(correct * BP / (correct + typos)); BP if no keys
  durationTicks: number;
}
```

### 3.1 State shape (run-level vs. encounter-level)
The internals belong to the Sim engineer. This shape is the agreed split. Everything outside the sim reads **`LevelView` only**.
```ts sim
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
  run: RunState;                       // whole level: hero HP, combo + latch, keyStreak, skill charge, stats, gold, chests, word results
  enc: EncounterState | null;          // current encounter: enemies, plates, target, focus, ATB, encounter rng streams, boss script
}
export interface TrialState { kind: "trial"; simVersion: 1; tick: Tick; seed: number /* ...sim-internal */ }
/** Sim-internal shapes (plain data); not part of the contract beyond "plain JSON". */
export interface RunState { readonly _run?: never }
export interface EncounterState { readonly _enc?: never }
```
**Persistence rules (D18):**
- **Across the whole level:** hero HP, Second Wind used, combo with its penalty latch, keyStreak, skill charge, stats, gold collected, chests.
- **Per encounter:** hero ATB resets to 0 at `EncounterStarted` (Opening Gambit sets it to 50). Target, focus, plates, statuses and enemy timers are also per encounter.

### 3.2 Tick processing order (normative)
For tick `t`, the client applies all inputs with `tick === t` in order. `step` then processes `t` and sets `state.tick = t + 1`. Events carry `tick: t`. Inside `step`:
1. Expire statuses and timers.
2. Resolve scheduled hero impacts (auto-attack hits, skill impacts, DoT ticks).
3. Run enemy timers: a windup start emits `EnemyAttackWindup` + `GuardWordShown`; an impact emits `EnemyAttack`.
4. Run gimmick timers.
5. Run the boss script: doom deadline, minigame spawns and landings, phase gates.
6. Check skills for auto-cast.
7. Handle deaths, re-pick the focus, then run encounter, wave, phase and segment transitions.

### 3.3 Typing rules (normative)

**Targeting.**
- With no target, the first key must equal the case-folded first char of a targetable plate. That emits `TargetAcquired` + `CharCorrect(index 0)`.
- Targetable plates (enemy words, guard words, doom, minigame words) have **distinct first letters**.
- Second Wind and Finisher plates are exclusive and auto-targeted.
- With no target, a space is ignored. Any other key that matches no plate is a stray `Typo` (`plateId: null`).

**While a target is locked.**
- The right char advances. A wrong char is a `Typo` with no advance.
- Other plates' letters do not switch the target; Escape/Tab does.

**Escape (B1).**
- Escape emits `TargetDropped{escape}` and resets that plate's typed progress to 0.
- It **keeps** the plate's `perfect` flag (still true unless a typo already happened) and has **no combo effect**.
- Anti-farm rule: chars at indices `< maxPaidIndex` on that plate pay no ATB again.

**Combo, mechanical (D7, PO hybrid).**
- The combo counts consecutive Perfect words. A Perfect `WordCompleted` gives +1, and a Sword Perfect Parry gives +1 more. An **imperfect completion leaves the combo unchanged** (no +1 and no extra penalty).
- Typo penalties by mode: gentle halves the combo (floor); strict resets it to 0 and costs −5 ATB; zen has no penalty.
- The penalty applies **at most once per plate attempt**, and stray typos share one latch that clears on the next correct char (D8).
- `ComboMult = 1 + COMBO_PER × min(combo, COMBO_CAP)`.
- `comboTier`: 0 below 5; Bronze 1 at ≥ 5; Silver 2 at ≥ 15; Gold 3 at ≥ 30; Radiant 4 at ≥ 50. The tier shows in the HUD combo counter and the hero aura.

**Key streak, VFX only (PO hybrid).**
- `keyStreak` counts consecutive correct keys. It resets to 0 on **any** typo, stray ones included, in every combo mode, and it persists across plates and encounters within a level.
- `keyStreakTier` (`KEY_STREAK_TIERS = [10, 25, 50, 100]`): 0 white; 1 gold at ≥ 10; 2 ember at ≥ 25; 3 azure at ≥ 50; 4 prismatic at ≥ 100. It drives plate/letter colour, trails, embers and the click pitch.
- It has no mechanical effect. The sim computes it so that the HUD and VFX never derive it themselves.

**ATB.**
- Per correct char: `char_charge × ComboMult × passive mods`.
- On completion: `word_bonus × (perfect ? 1.25 : 1)`, plus `0.25 × Σ chars paid on this plate` if perfect, plus `SWIFT_ATB` if swift.
- Full at 100. On full: auto-attack, keeping the overflow up to a cap of 30.

**Swift (D30).** A word is swift when it is Perfect and `wordWpm × BP ≥ pace × SWIFT_THRESHOLD_BP`, with `wordWpm = floor((L-1) × 720 / max(1, tLast − tFirst))`.

**Word Strike (chip).**
- At completion, `CHIP_NORMAL` or `CHIP_PERFECT` × ATK hits the plate's owner.
- It emits **`Hit{kind:"chip"}`**, and the VFX for chip damage binds to that `Hit` only. `WordCompleted` carries no damage, so there is no double pop.
- A chip cannot push a boss past a phase gate, and chips never remove shield points.

**Focus.** The focus is the owner of the last completed enemy plate. If the focus dies, it moves to the lowest-slot living enemy.

**Crit (D10).**
- Auto-attack crit chance = `BASE_CRIT + PERFECT_CRIT_BONUS × perfectWords / wordsCompleted`, counted since the previous auto-attack.
- If `wordsCompleted = 0` the share is 0 and the chance is `BASE_CRIT`.
- Clean Cut adds +10% if the last word was perfect.
- The roll always draws from the `combat` stream.

**Auto-attack (D12).** `AtbFilled` → `AutoAttack{impactTick = t + ATTACK_IMPACT_T}` → `Hit` × the weapon's hits at impact. Typing continues during the dash.

**Damage chain (normative order; every step is `mulBp` with floor):**
```text
dmgM = mulBp(atkM, sourceMultBp)       // weapon atk_mult per hit | skill mult | chip 15/25% | counter 50/150% | minigame clear mult
if crit:      dmgM = mulBp(dmgM, CRIT_MULT_BP)
if weak:      dmgM = mulBp(dmgM, WEAK_MULT_BP)
if broken:    dmgM = mulBp(dmgM, BREAK_DMG_MULT_BP)
if staggered: dmgM = mulBp(dmgM, DOOM_STAGGER_DMG_MULT_BP)
for each equipped passive damage mod, in loadout slot order 0..2: dmgM = mulBp(dmgM, modBp)
dmgM = max(dmgM, 1); then clamp so the target's HP does not cross an active phase gate
incoming: hitM -> mulBp(hitM, BLOCK_MULT_BP | IRON_WILL_BLOCK_MULT_BP) if blocked; 0 if parried or absorbed by barrier
```
There is no random variance (`DMG_VARIANCE = 0`, D31).

**Weakness, shield and Break (D11; kept by the PO).**
- Each `auto`, `skill` or `counter` hit whose `DamageType` is in the enemy's weaknesses removes 1 shield point, and a crit removes 1 more. The first such hit emits `WeaknessRevealed`.
- At 0 shield the enemy gets `Break` for `BREAK_S`: its attack timer resets and pauses, any windup or guard is cancelled, and it takes ×`BREAK_DMG_MULT` damage. The shield refills when the Break ends.
- **Encounter HP is retuned for this added DPS in T6.1.**

**Guard (D13).**
- At `impactTick − guardTicks` the enemy's plate is **replaced** by a guard word. `guardTicks = max(1.5 s, 2.5 s × paceFactor)`, plus 1 s on the story preset. If that plate was the target, `TargetDropped{plateChanged}` fires.
- Typing the guard word emits `GuardWordTyped{block|parry}`, and the normal word returns as a fresh plate.
- At impact:
  - Parry → 0 damage, a counter `Hit` (`PARRY_COUNTER`, or 1.5 with Riposte) and +10 ATB.
  - Block → `BLOCK_MULT` (0.1 with Iron Will).
  - Ignored → full damage, and the plate reverts after the hit.
- Impacts from different enemies are kept ≥ `TELEGRAPH_STAGGER_S` (0.8 s) apart.

**Enemy timers.** `interval = baseInterval × PACE_FACTOR_BP[pace] × PRESET_INTERVAL_MULT[difficulty]`. Each enemy starts at a random progress of 0–30% (`enemyAi` stream).

**Second Wind (D17).**
- The first time hero HP drops to 0 or below in a level, the sim emits `HeroDowned` + `SecondWindStarted`. The encounter freezes, and one sentence plate is shown with a deadline of `SECOND_WIND_S` (8 s).
- Success emits `SecondWindSucceeded` and restores HP to 30% of max.
- If the deadline passes, `SecondWindFailed` is followed by `LevelFailed{defeated}`, or by `phase = "downed"` when `allowExternalRevive` is set; a `revive` command then emits `Revived` and restores 50% HP.
- A second death in the same level is always `LevelFailed`.

**Fail.** `goldKept = floor(goldCollected × FAIL_GOLD_KEEP)`. `LevelResult.words` is always reported.

**Walk.** A walk with `heal: true` emits `HeroHealed{walk}` for +25% max HP at `WalkStarted`.

**Gold.** `mulBp(goldTotal, goldMultBp)` is split evenly across encounters, with the remainder going to the last one. Each share is paid at `EncounterCleared` as `GoldGained`.

**Chests.** Each normal encounter rolls for a chest on the `loot` stream. The boss always drops one on first clear, and has a 50% chance on replay. Contents are rolled at drop and reported in `LevelResult.chests`.

### 3.4 Boss (Ruin Golem) flow
- **Phase 1 (100–66%):** the boss has word plates and the adds spawn.
- **Phase 2, "Incantation" (66–33%):**
  - Every `doomEveryTicks` the boss casts a Doom Spell. Its deadline is `ceil(chars × 900 / pace) + 120` ticks.
  - Success: the boss is staggered for 4 s and takes ×1.5 damage.
  - Failure: the hero takes `mulBp(parHpM, DOOM_DMG_BP)`. It is **non-lethal**: HP is clamped at 1 (D14).
  - The boss's HP clamps at the 33% gate until `minDoomSpells` have resolved (D16).
- **Phase 3, "Falling Rubble" (below 33%):**
  - Words fall in lanes. A cleared word deals a minigame hit to the boss; a missed word deals `missHitM` to the hero.
  - Auto-attacks and skills keep hitting the boss. The boss's own attacks are suspended.
  - The boss's HP clamps at 1 milli; when the wave in progress ends with HP at 1 milli, `FinisherShown` fires.
  - The Finisher has no timer. Completing it emits `FinisherCompleted`, then `EnemyDeath{byKind: "finisher"}` (D15).
- **Between phases:** `BossPhaseChanged`, a breather of `breatherTicks`, and `HeroHealed{phase}` for `PHASE_HEAL`.

---

## 4. Events: `packages/sim/src/events.ts`

Conventions:
- Every event has `type` and `tick`.
- `EntityId`: the hero is 0 and enemies are ≥ 1. `PlateId` is unique per level.
- **Amounts in events are display integers** (`toDisplay`), except fields suffixed `M`, which are milli.
- Presentation may stagger events (hit-stop and so on) but never reorders causally related ones.

```ts sim
import type { DamageType, Rarity, GearSlot, WeaponArchetype } from "@hd2d/content";

export type EntityId = number;
export type PlateId = number;
export type PlateKind = "word" | "guard" | "doom" | "minigame" | "finisher" | "secondWind" | "trial";
export type ComboTier = 0 | 1 | 2 | 3 | 4;     // mechanical: none, bronze 5, silver 15, gold 30, radiant 50 (perfect words)
export type KeyStreakTier = 0 | 1 | 2 | 3 | 4; // VFX: white, gold 10, ember 25, azure 50, prismatic 100 (correct keys)
export type HitKind = "auto" | "chip" | "skill" | "counter" | "dot" | "minigame" | "finisher";
/** What a damage instance is attributed to (skill-share metric). DoT inherits its applier: bleed -> weapon, burn -> skill. */
export type HitOrigin = "weapon" | "chip" | "skill" | "counter" | "minigame" | "finisher";
export type StatusId = "burn" | "bleed" | "freeze" | "stagger" | "barrier";
export type ChestTier = "Wooden" | "Iron" | "Gold" | "Mythic";
export type TargetDropReason = "escape" | "autoUnlock" | "plateChanged" | "ownerDied" | "phaseChanged";

type Ev<T extends string, P extends object = Record<never, never>> = { type: T; tick: Tick } & P;

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
  // ---- plates & typing (plateId + index locate the letter; keyStreakTier drives colour, combo drives aura) ----
  | Ev<"PlateShown", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; text: string; display: string; lane: number | null; replacesPlateId: PlateId | null }>
  | Ev<"PlateRemoved", { plateId: PlateId; reason: "completed" | "replaced" | "ownerDied" | "expired" | "phaseEnded" }>
  | Ev<"TargetAcquired", { plateId: PlateId; ownerId: EntityId | null }>
  | Ev<"TargetDropped", { plateId: PlateId; ownerId: EntityId | null; reason: TargetDropReason }>
  | Ev<"CharCorrect", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; index: number; char: string; isLast: boolean; combo: number; comboTier: ComboTier; keyStreak: number; keyStreakTier: KeyStreakTier; atbGainM: number }>
  | Ev<"Typo", { plateId: PlateId | null; ownerId: EntityId | null; kind: PlateKind | null; index: number; expected: string | null; got: string; comboBefore: number; combo: number; keyStreakBefore: number; penalty: "halved" | "reset" | "none" | "latched" | "forgiven" }>
  | Ev<"WordCompleted", { plateId: PlateId; ownerId: EntityId | null; kind: PlateKind; text: string; wordKey: string; perfect: boolean; swift: boolean; atbGainM: number; combo: number }>
  | Ev<"SentenceWordDone", { plateId: PlateId; kind: PlateKind; wordIndex: number; wordCount: number }> // projectile per word (T2.6)
  | Ev<"ComboTierChanged", { from: ComboTier; to: ComboTier; combo: number }>
  | Ev<"KeyStreakTierChanged", { from: KeyStreakTier; to: KeyStreakTier; keyStreak: number }>
  | Ev<"BurstWpm", { wpm: number; band: "swift" | "blazing" }>
  // ---- defense ----
  | Ev<"EnemyAttackWindup", { enemyId: EntityId; impactTick: Tick; heavy: boolean }>
  | Ev<"GuardWordShown", { enemyId: EntityId; plateId: PlateId; text: string; impactTick: Tick; spanTicks: number }>
  | Ev<"GuardWordTyped", { enemyId: EntityId; plateId: PlateId; perfect: boolean; result: "block" | "parry" }>
  | Ev<"GuardBlocked", { enemyId: EntityId; damage: number }>
  | Ev<"GuardParried", { enemyId: EntityId; counterDamage: number }> // the counter itself is Hit{kind:"counter"}
  // ---- ATB & hero offense ----
  | Ev<"AtbFilled", { overflowM: number }>
  | Ev<"AutoAttack", { targetId: EntityId; archetype: WeaponArchetype; hits: number; impactTick: Tick; crit: boolean }>
  | Ev<"Hit", { sourceId: EntityId; targetId: EntityId; kind: HitKind; origin: HitOrigin; skillId: ActiveSkillId | null; damageType: DamageType | null; damage: number; damageM: number; hpAfter: number; maxHp: number; crit: boolean; weak: boolean; broken: boolean; atbKnockback: boolean; hitIndex: number; hitCount: number; killed: boolean }>
  | Ev<"WeaknessRevealed", { enemyId: EntityId; damageType: DamageType }>
  | Ev<"ShieldDamaged", { enemyId: EntityId; shield: number; shieldMax: number }>
  | Ev<"Break", { enemyId: EntityId; untilTick: Tick }>
  | Ev<"BreakEnded", { enemyId: EntityId }>
  | Ev<"StatusApplied", { targetId: EntityId; status: StatusId; untilTick: Tick | null; stacks: number; origin: HitOrigin | null; skillId: ActiveSkillId | null }>
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
  | Ev<"SecondWindFailed">
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
  "WordCompleted", "SentenceWordDone", "ComboTierChanged", "KeyStreakTierChanged", "BurstWpm",
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
type MissingEventTypes = Exclude<SimEvent["type"], SimEventType>;
export const EVENT_TYPES_EXHAUSTIVE: [MissingEventTypes] extends [never] ? true : MissingEventTypes = true;

/** T2.3: level/eventBindings.ts must provide a full map (missing keys = type error). */
export type EventHandlers = { [K in SimEventType]: (e: EventOf<K>) => void };

// ---- Meta events: produced by §8 meta functions (cache-opening screen), not by the level stream. No tick. ----
export type MetaEvent =
  | { type: "CacheRolled"; rarity: Rarity; slot: GearSlot; tier: number; archetype: WeaponArchetype | null; guaranteed: "none" | "rare" | "epic" | "legendary"; pity: CachePity }
  | { type: "ChestOpened"; tier: ChestTier; gold: number; gearCount: number; caches: number }
  | { type: "GearUpgraded"; gearUid: number; upgrade: number; cost: number };
export const ALL_META_EVENT_TYPES = ["CacheRolled", "ChestOpened", "GearUpgraded"] as const satisfies readonly MetaEvent["type"][];
```
- **Crit and weakness** are flags on `Hit`, not separate events. `WeaknessRevealed` is a one-shot that unveils the weakness icon.
- **Chip damage** is only ever `Hit{kind:"chip"}`.
- **Skill-share metric:** sum `Hit.damageM` by `origin`; `LevelResult.stats.damageByOriginM` already does this.

---

## 5. Read-only view: `packages/sim/src/view.ts`

**Rules.**
- The renderer, HUD and audio read `getView(state)` once per frame, together with the event stream.
- They **never mutate sim state** and never derive game logic. That includes combo or streak tiers, which the view and events already provide.
- **Interpolation:** keep the previous frame's view, and lerp bar values and positions with the frame's `alpha` (§2).
- Discrete facts (typedIndex, text, alive) are never interpolated.
- View values may be floats; they are never hashed.

```ts sim
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type HeroPose = "walk" | "idle" | "attack" | "cast" | "hurt" | "guard" | "downed" | "victory";
export type EnemyPose = "enter" | "idle" | "windup" | "attack" | "hurt" | "broken" | "dead";

export interface PlateView {
  id: PlateId; ownerId: EntityId | null; kind: PlateKind;
  text: string;            // the answer
  display: string;         // what to draw (== text unless scrambled and not yet unlocked)
  typedIndex: number;      // chars [0, typedIndex) are typed (gold); text[typedIndex] is the next letter
  isTarget: boolean;
  faded: boolean;          // fading gimmick: draw only typed chars + blanks (the gimmick overrides the next-letter rule)
  hadTypo: boolean;        // current attempt is not perfect
  lastTypoTick: Tick | null;
  lane: number | null;     // minigame lane; null for other plates
  expiresAtTick: Tick | null; // guard impact / doom deadline / minigame landing / second wind deadline
  totalTicks: number | null;  // for timer strips
}
export interface StatusView { id: StatusId; ticksLeft: number | null; stacks: number }
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
  statuses: StatusView[];
  isFocus: boolean;
  pose: EnemyPose; poseSinceTick: Tick;
}
export interface HeroView {
  hp: number; maxHp: number; hpFrac: number;
  atbFrac: number; archetype: WeaponArchetype; weaponDamageType: DamageType;
  barrierCharges: number; statuses: StatusView[];
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
  combo: number; comboTier: ComboTier; comboMult: number; comboMode: ComboMode; // mechanical
  keyStreak: number; keyStreakTier: KeyStreakTier;                              // VFX colour tiers
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
  keyStreak: number; keyStreakTier: KeyStreakTier;
  lastTypoTick: Tick | null; netWpm: number; accuracy: number; done: boolean;
}
```

---

## 6. Content data types: `packages/content/src/schemas.ts` (zod 4)

**Content conventions.**
- Numbers are in human units: seconds and whole HP points, with decimals allowed. `resolveLevel` converts them to ticks and milli.
- **Skill and passive numbers live in `BALANCE`** (D19). Content holds names, text templates and art ids.
- Every schema `X` also exports `type X = z.infer<typeof X>` under the same name.

```ts content
import { z } from "zod";

/** Every char content may contain and the sim accepts as a key (single source of truth). */
export const TYPABLE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,'-?!;:\"()";
const escapeForCharClass = (s: string): string => s.replace(/[\\\]^-]/g, "\\$&");
export const TypableText = z.string().regex(new RegExp(`^[${escapeForCharClass(TYPABLE_CHARS)}]+$`));

export const Biome = z.enum(["forest", "ruins", "cave", "hollow"]);
export type Biome = z.infer<typeof Biome>;
export const WordTier = z.number().int().min(1).max(10);
export const DamageType = z.enum(["slash", "pierce", "blunt", "arcane", "fire", "ice", "light"]);
export type DamageType = z.infer<typeof DamageType>;
export const Rarity = z.enum(["C", "U", "R", "E", "L"]);
export type Rarity = z.infer<typeof Rarity>;
export const GearSlot = z.enum(["weapon", "armor", "charm"]);
export type GearSlot = z.infer<typeof GearSlot>;
export const WeaponArchetype = z.enum(["sword", "dagger", "staff", "hammer"]);
export type WeaponArchetype = z.infer<typeof WeaponArchetype>;

export const WordEntry = z.object({
  text: TypableText.max(120),
  key: z.string().min(1),                    // SRS/journal key; = text.toLowerCase() for single words
  kind: z.enum(["word", "collocation", "sentence"]),
  tier: WordTier,
  freqRank: z.number().int().positive().optional(),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  biomes: z.array(Biome).default([]),
  uses: z.array(z.enum(["plate", "guard", "doom", "finisher", "secondWind", "minigame", "trial"])).min(1),
  definition: z.string().min(1).max(140),     // simple English
  example: z.string().min(1).max(160),
  translations: z.record(z.string(), z.string()).default({}), // BCP-47 tag -> text (optional, Journal only)
});
export type WordEntry = z.infer<typeof WordEntry>;

export const Gimmick = z.enum(["fading", "scrambled"]);
export const EnemyDef = z.object({
  id: z.string(), name: z.string(),
  archetype: z.enum(["grunt", "brute", "speedster", "boss"]),
  spriteId: z.string(), scale: z.number().positive().default(1), flying: z.boolean().default(false),
  baseIntervalS: z.number().positive(),       // grunt 9, brute 12, speedster 5 (scaled by pace factor)
  heavy: z.boolean().default(false),
  plateLength: z.tuple([z.number().int().min(2), z.number().int().max(14)]),
  weaknesses: z.array(DamageType).min(1),
  shield: z.number().int().min(1).max(9),
  hpWeight: z.number().positive().default(1), // share of the wave's HP pool
  hitWeight: z.number().positive().default(1),// x encounter gruntHit
});
export type EnemyDef = z.infer<typeof EnemyDef>;

export const EnemyRef = z.object({ enemy: z.string(), gimmick: Gimmick.optional() });
export const EncounterDef = z.object({
  name: z.string(),
  hp: z.number().positive(),                  // HP pool per wave (generated by tools/balance, D32)
  gruntHit: z.number().positive(),
  waves: z.array(z.array(EnemyRef).min(1).max(4)).min(1), // >1 wave -> WaveStarted
}).refine((e) => new Set(e.waves.flat().flatMap((r) => (r.gimmick ? [r.gimmick] : []))).size <= 2, "max 2 gimmicks/encounter");

export const MinigameDef = z.object({
  kind: z.literal("fallingRubble"),
  lanes: z.number().int().min(2).max(4),
  spawnEveryS: z.number().positive(), fallS: z.number().positive(),
  clearAtkMult: z.number().positive(),
  missHit: z.number().positive(),
});
export const BossDef = z.object({
  id: z.string(), name: z.string(), title: z.string(), enemyId: z.string(),
  hp: z.number().positive(), hit: z.number().positive(),
  plateLength: z.tuple([z.number().int(), z.number().int()]),
  phase1: z.object({ endAtHpPct: z.number().default(66), adds: z.array(EnemyRef).max(2) }),
  phase2: z.object({ endAtHpPct: z.number().default(33), doomEveryS: z.number().positive(), minDoomSpells: z.number().int().min(1) }),
  phase3: z.object({ minigame: MinigameDef, finisherText: TypableText }),
  breatherS: z.number().default(2),
  introS: z.number().default(4),
});
export type BossDef = z.infer<typeof BossDef>;

export const StarChallenge = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("untouched"), maxHits: z.number().int().min(0) }),
  z.object({ kind: z.literal("parTime"), slack: z.number().default(1.15) }), // par = parRefS * 35/pace * slack
  z.object({ kind: z.literal("streak"), combo: z.number().int().positive() }),
  z.object({ kind: z.literal("guardian"), parries: z.number().int().positive() }),
  z.object({ kind: z.literal("noSkills") }),
]);
export type StarChallenge = z.infer<typeof StarChallenge>;
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
    .refine((m) => m.current + m.review + m.biome + m.weak === 100).default({ current: 60, review: 20, biome: 15, weak: 5 }),
  plateLength: z.tuple([z.number().int(), z.number().int()]),
  segments: z.array(Segment).min(2),
  star3: StarChallenge,
  parRefS: z.number().positive(),             // active time of the 35-WPM reference typist
  tutorial: z.boolean().default(false),
});
export type LevelDef = z.infer<typeof LevelDef>;

export const GearDef = z.object({
  id: z.string(), slot: GearSlot, archetype: WeaponArchetype.optional(), // required iff slot === "weapon"
  tier: z.number().int().min(1).max(10), name: z.string(), spriteId: z.string(), flavor: z.string().optional(),
  // Stats are derived (BALANCE): score = TIER_GROWTH^(tier-1) * RARITY_MULT[rarity] * (1 + UPG_STEP*upgrade).
  // weapon -> ATK, armor -> HP, charm -> sqrt into both. Rarity/upgrade are per instance (save GearInstance).
}).refine((g) => (g.slot === "weapon") === (g.archetype !== undefined));
export type GearDef = z.infer<typeof GearDef>;

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
  // Standardized pool (same for everyone); the run seed picks one. >= 1600 chars covers 60 s at 300+ WPM.
  passages: z.array(TypableText.min(1600)).min(30),
});

export const ContentBundle = z.strictObject({
  words: z.array(WordEntry), enemies: z.array(EnemyDef), bosses: z.array(BossDef), levels: z.array(LevelDef),
  gear: z.array(GearDef), actives: z.array(ActiveSkillDef), passives: z.array(PassiveDef), trials: z.array(TrialDef),
});
export type ContentBundle = z.infer<typeof ContentBundle>;
/** fnv1a32(canonicalContentJson(bundle)) as 8 hex chars; emitted by tools/content at build time. */
export declare const CONTENT_VERSION: string;
```
`tools/content` validators check:
- every encounter can produce distinct first letters (the pool has more distinct initials than the encounter has visible plates)
- plate length bands
- the profanity/sensitive filter
- guard words are ≤ 5 chars and tier 1
- every level's segments start with a walk
- passages contain no double spaces.

---

## 7. Balance table: `packages/sim/src/balance.ts`

**Structure.**
- One `as const` object. **Keys copy the `economy_sim.py` names exactly**, including snake_case inner keys.
- Values are human-readable floats.
- `deriveConstants(BALANCE)` converts them **once at module init** into integer constants `K.*`, with unit suffixes `_BP`, `_M` (milli) and `_T` (ticks).
- Logic uses only `K` and `tables.generated.ts`.

```ts sim
export const BALANCE = {
  // ---- Structure (economy_sim: Story structure / Non-typing time) -- tools/balance level generator
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
  CACHE_SLOT_ODDS: { weapon: 1, armor: 1, charm: 1 },               // uniform weights (published)
  CACHE_ARCHETYPE_ODDS: { equipped: 0.40, other_each: 0.20 },       // PO 2026-10-09 (published, fixed)
  WEAPONS: {                                   // doc 01 §2.2
    sword: { char_charge: 8, word_bonus: 10, atk_mult: 1.0, hits: 1, damage_type: "slash" },
    dagger: { char_charge: 11, word_bonus: 6, atk_mult: 0.45, hits: 2, damage_type: "pierce", bleed_every: 3 },
    staff: { char_charge: 6, word_bonus: 8, atk_mult: 0.8, hits: 1, damage_type: "arcane", skill_charge_mult: 1.5 },
    hammer: { char_charge: 5, word_bonus: 14, atk_mult: 2.2, hits: 1, damage_type: "blunt", atb_knockback: 0.30 },
  },
  ATB_OVERFLOW_CAP: 30, STRICT_TYPO_ATB: 5, SWIFT_THRESHOLD: 1.3, BURST_BANDS: { swift: 1.3, blazing: 1.6 }, BURST_CHARS: 16, BURST_COOLDOWN_S: 5,
  COMBO_TIERS: [5, 15, 30, 50],                // mechanical (perfect words)
  KEY_STREAK_TIERS: [10, 25, 50, 100],         // VFX colour tiers (correct keys), PO 2026-10-09
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
**Python names deliberately not ported.** These are persona and model abstractions; they live in `tools/balance/src/model.ts`.
- **Persona learning and noise:** `PERSONAS`, `LEARN_TAU_H`, `ACC_TAU_H`, `GUARD_TAU_H`, `PERF_SD`, `ACC_SD`, `GUARD_SD`, `COMBAT_RNG_SD`.
- **Typing-efficiency abstractions:** `COMBAT_TYPING_EFF`, `SWIFT_RATE`, `SKILL_DMG_PER_CHARGE`.
- **Doom and word-tier modelling:** `DOOM_FAIL_*`, `WORD_TIERS`, `TIER_MIX_CURRENT`, `*_SPEED_PEN`, `*_ACC_PEN`.
- **Economy groups:** missions, gems, boxes, pass and survival.
- **Spending heuristics:** `SATCHEL_RESERVE_GU`, `MIN_POWER_AS_NEEDED`, `AS_NEEDED_TARGET`, `CACHE_GOLD_EFF_BIAS`.

**Generated integer tables** (`tables.generated.ts`):
- `PACE_FACTOR_BP[15..120]`
- `TIER_GROWTH_BP[1..10]`
- `TIER_PRICE[1..10]`
- `UPG_COST[tier][0..14]`
- `GOLD_UNIT[1..30]`
- `LEVEL_GOLD[ch][1..10]`

---

## 8. Meta / rewards API (pure; `@hd2d/sim`, `packages/sim/src/meta/`)

All functions here are deterministic. Functions that take an `RngState` mutate it, and the caller persists it (`save.metaRng`). Gold amounts are integers.

```ts sim
export interface CachePity { sinceRare: number; sinceEpic: number; sinceLegendary: number }
export const NEW_PITY: CachePity = { sinceRare: 0, sinceEpic: 0, sinceLegendary: 0 };
export interface GearRoll { slot: GearSlot; tier: number; rarity: Rarity; archetype: WeaponArchetype | null }
export interface ChestContents { tier: ChestTier; gold: number; gear: GearRoll | null; caches: number; gemsUncredited: number }

// ---- loadouts (used by the client, tools/balance and tools/bot) ----
/** Structural subset of the save blob (SaveBlob from @hd2d/shared is assignable to it; shared has a type test). */
export interface LoadoutSource {
  inventory: { gear: readonly { uid: number; defId: string; rarity: Rarity; upgrade: number }[] };
  equipped: { weapon: number; armor: number; charm: number };
  loadout: {
    actives: readonly [string | null, string | null];
    activeModes: readonly [CastMode, CastMode];
    passives: readonly [string | null, string | null, string | null];
  };
}
/** Throws SimError if an equipped uid/def is missing, a slot mismatches, or a skill/passive id is unknown. */
export declare function buildLoadout(src: LoadoutSource, bundle: ContentBundle): Loadout;
/** Par build of chapter c: slotTier(slot, c) at PAR_RARITY_BY_CH/PAR_RARITY, PAR_UPG/PAR_UPG_DEFAULT; sword; no skills/passives. */
export declare function parLoadout(chapter: number): Loadout;

// ---- chests (used in-level by the sim with the `loot` stream; exported for tests/tools) ----
export declare function rollEncounterChest(rng: RngState, ctx: { boss: boolean; firstClear: boolean }): ChestTier | null;
export declare function openChest(rng: RngState, tier: ChestTier, ctx: { chapter: number; frontierChapter: number }): ChestContents;

// ---- Gear Caches: fixed odds + published pity, exactly economy_sim.roll_cache_rarity ----
// 1) increment all three counters; 2) if sinceLegendary >= 120 -> L;
// else if sinceEpic >= 30 -> pick from {E,L} by CACHE_ODDS; else if sinceRare >= 8 -> pick from {R,E,L};
// else pick from CACHE_ODDS; 3) reset sinceRare on R+, sinceEpic on E+, sinceLegendary on L.
// Draw order (normative): rarity, then slot (uniform), then archetype if weapon
// (equipped 40%, each other archetype 20%, order sword/dagger/staff/hammer). tier = slotTier(slot, frontierChapter).
export declare function rollCache(
  rng: RngState, pity: CachePity, ctx: { frontierChapter: number; equippedArchetype: WeaponArchetype },
): { roll: GearRoll; pity: CachePity; event: MetaEvent };
/** Data for the published-odds screen; the UI must render from this, never from hand-written copy. */
export declare function publishedCacheOdds(): {
  rarityBp: Record<Rarity, Bp>;
  pity: { rare: number; epic: number; legendary: number };       // 8 / 30 / 120
  effectiveRarityBp: Record<Rarity, Bp>;                         // from the 200k-roll sim (02 §6.5), regenerated by tools/balance
  slotBp: Record<GearSlot, Bp>;                                  // 3334 / 3333 / 3333
  weaponArchetypeBp: { equipped: Bp; otherEach: Bp };            // 4000 / 2000
};

// ---- gear & gold ----
export declare function slotTier(slot: GearSlot, chapter: number): number;        // economy_sim.slot_tier
export declare function itemScoreBp(tier: number, rarity: Rarity, upgrade: number): Bp;
export declare function goldUnit(chapter: number): number;
export declare function levelGold(chapter: number, index: number): number;
export declare function tierPrice(tier: number): number;
export declare function shopPrice(tier: number, rarity: "C" | "U" | "R"): number;
export declare function cacheGoldPrice(frontierChapter: number): number;          // 14 GU
export declare function upgradeCap(rarity: Rarity): number;
export declare function upgradeCost(tier: number, fromLevel: number): number;     // 0.25 * price * 1.3^level (table)
export declare function transferUpgrade(oldUpgrade: number, newRarity: Rarity): number; // min(floor(old/2), cap)
export declare function salvageValue(item: GearStats & { slot: GearSlot }, ctx: { fromChestUnwanted: boolean; nonTransferredUpgradeGold: number }): number;
export declare function replayGoldMultBp(ctx: { firstClear: boolean; chapter: number; frontierChapter: number; replaysToday: number }): Bp;

// ---- pace & stars ----
export declare function computePace(lastLevelNetWpm: readonly number[], calibrationWpm: number | null): number; // median of last 10, else calibration, else 35; clamp 15..120
export declare function median7dAccuracyBp(daily: readonly { day: string; accuracyBp: Bp }[], today: string): Bp | null;
export declare function evaluateStars(input: {
  result: LevelResult; star3: StarChallenge; parRefTicks: number; pace: number; median7dAccuracyBp: Bp | null;
}): [boolean, boolean, boolean];
// ★ = cleared. ★★ = cleared && accuracyBp >= clamp(median + STAR2_REL_MARGIN, 8800, 9700) (no history -> 8800).
// ★★★ = cleared && challenge met; parTime: activeTicks <= ceil(parRefTicks * 35/pace * slack).

// ---- SRS: Leitner 5 boxes, intervals in levels played [1,2,4,8,16] ----
export interface SrsEntry { box: 1 | 2 | 3 | 4 | 5; due: number; lapses: number }
export interface SrsState { levelsPlayed: number; entries: Record<string, SrsEntry>; mastered: string[] }
export declare function srsDue(srs: SrsState, limit: number): string[]; // due <= levelsPlayed, sort (due, box, key by cmpStr)
export declare function srsUpdate(srs: SrsState, words: readonly WordResult[], pace: number): SrsState;
// typo or wpm < 50% pace: absent -> box 1 (due +1); present -> box = max(1, box-1), lapses++ (D29).
// perfect && present && due: box 5 -> mastered (Lexicon); else box+1, due = levelsPlayed + interval[box-1].
// levelsPlayed++ after applying.

export interface WordResult { wordKey: string; text: string; kind: PlateKind; perfect: boolean; typos: number; wpm: number }
export interface LevelResult {
  levelId: string; outcome: "cleared" | "failed"; failReason: "defeated" | "abandoned" | "timeout" | null;
  durationTicks: number; activeTicks: number; gold: number; chests: ChestContents[];
  stats: {
    correctChars: number; typos: number; wordsCompleted: number; perfectWords: number; maxCombo: number; maxKeyStreak: number;
    netWpmX100: number; accuracyBp: Bp; hitsTaken: number; blocks: number; perfectParries: number;
    autoAttacks: number; skillsCast: number; secondWindUsed: boolean;
    damageByOriginM: Record<HitOrigin, number>;   // skill share = skill / Σ (T1.4 AC)
  };
  words: WordResult[];                             // every completed or typo'd word/guard plate, in order
}
```
**Pity ownership.**
- **Gear-Cache pity (`CachePity`) is client-owned.** It lives in the save blob, like gold and gear, which the client also owns.
- **Cosmetic-box pity is server-owned** (the D1 `pity` table, doc 03).
- **Future gem caches (out of the slice):**
  - The Worker debits gems in the ledger and records a `gem_cache` entitlement.
  - The client claims it through a later endpoint and increments `save.inventory.unopenedCaches`.
  - Opening uses `rollCache` with the save's pity and `metaRng`, exactly like any other cache.
  - The server never rolls gear.

---

## 9. `@hd2d/shared`: save blob + HTTP API (zod 4)

### 9.1 Save blob (client-owned; stored opaquely by the server)
```ts shared
// packages/shared/src/save.ts
import { z } from "zod";
import { Rarity } from "@hd2d/content";
import type { LoadoutSource } from "@hd2d/sim";

export const SAVE_SCHEMA_VERSION = 1;
const U32 = z.number().int().min(0).max(0xffffffff);
const Vol = z.number().min(0).max(1);
const Mode = z.enum(["smart", "asap"]);
export const GearInstance = z.object({ uid: z.number().int().positive(), defId: z.string(), rarity: Rarity, upgrade: z.number().int().min(0).max(15) });
export const SaveSummary = z.object({ schemaVersion: z.number().int(), levelMax: z.number().int().min(0), stars: z.number().int().min(0).max(900), playtimeSec: z.number().int().min(0) });
export type SaveSummary = z.infer<typeof SaveSummary>;
export const SaveBlobV1 = z.object({
  schemaVersion: z.literal(1),
  createdAtMs: z.number().int(), updatedAtMs: z.number().int(), playtimeSec: z.number().int().min(0),
  settings: z.object({
    comboMode: z.enum(["gentle", "strict", "zen"]), difficulty: z.enum(["story", "standard", "hard", "zen"]),
    caseMode: z.enum(["auto", "strict"]), autoUnlock: z.boolean(), effectsIntensity: z.number().min(0).max(1),
    reducedMotion: z.boolean(), reducedFlash: z.boolean(),
    volumes: z.object({ master: Vol, sfx: Vol, ambience: Vol, music: Vol, ui: Vol }),
    translationLang: z.string().nullable(),
  }),
  progress: z.object({
    frontierChapter: z.number().int().min(1),
    levels: z.record(z.string(), z.object({ cleared: z.boolean(), stars: z.tuple([z.boolean(), z.boolean(), z.boolean()]), bestTicks: z.number().int().nullable(), attempts: z.number().int() })),
    starChestsClaimed: z.record(z.string(), z.array(z.number().int())), // chapter -> claimed milestones [10,20,30]
  }),
  pace: z.object({ calibrationWpm: z.number().int().nullable(), recentNetWpm: z.array(z.number().int()).max(10) }),
  accuracyDaily: z.array(z.object({ day: z.string(), accuracyBp: z.number().int() })).max(14),
  wallet: z.object({ gold: z.number().int().min(0) }),
  inventory: z.object({ gear: z.array(GearInstance), nextGearUid: z.number().int().positive(), unopenedCaches: z.number().int().min(0) }),
  equipped: z.object({ weapon: z.number().int(), armor: z.number().int(), charm: z.number().int() }), // gear uids
  loadout: z.object({
    actives: z.tuple([z.string().nullable(), z.string().nullable()]),
    activeModes: z.tuple([Mode, Mode]),
    passives: z.tuple([z.string().nullable(), z.string().nullable(), z.string().nullable()]),
  }),
  unlocks: z.object({ actives: z.array(z.string()), passives: z.array(z.string()) }),
  cachePity: z.object({ sinceRare: z.number().int(), sinceEpic: z.number().int(), sinceLegendary: z.number().int() }), // client-owned
  metaRng: z.tuple([U32, U32, U32, U32]),     // drives cache rolls and per-attempt story seeds
  srs: z.object({
    levelsPlayed: z.number().int(),
    entries: z.record(z.string(), z.object({ box: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), due: z.number().int(), lapses: z.number().int() })),
    mastered: z.array(z.string()),
  }),
  journal: z.object({ firstSeen: z.record(z.string(), z.number().int()) }), // wordKey -> levelsPlayed index
  replays: z.object({ day: z.string(), count: z.number().int() }),
  lifetime: z.object({ words: z.number().int(), chars: z.number().int(), typos: z.number().int() }),
});
export const SaveBlob = SaveBlobV1;                         // alias to the latest version
export type SaveBlob = z.infer<typeof SaveBlob>;
/** Compile-time proof that a save can feed buildLoadout. */
export const saveIsLoadoutSource = (s: SaveBlob): LoadoutSource => s;
/** Runs MIGRATIONS[v] for v = raw.schemaVersion .. latest-1, then SaveBlob.parse. */
export declare function migrateSave(raw: unknown): SaveBlob;
export declare const MIGRATIONS: Readonly<Record<number, (old: unknown) => unknown>>; // MIGRATIONS[1]: v1 -> v2, ...
export declare function summarize(save: SaveBlob): SaveSummary;
/** Three-way merge; `base` = last blob this client synced with the server (null if never synced). */
export declare function mergeSaves(base: SaveBlob | null, local: SaveBlob, server: SaveBlob): { merged: SaveBlob; needsUserChoice: boolean };
```
**Migrations.**
- Any shape change bumps `schemaVersion` and adds `MIGRATIONS[n]` (n → n+1). Old migrations are never edited or deleted.
- There is one fixture blob per version in `packages/shared/tests/fixtures/`, with a test that each fixture migrates to the latest version and parses.
- A blob with a **newer** version than the client knows puts the client in read-only mode: it never PUTs, and it shows "please refresh".

**Sync and merge (409).**
- The client stores the **last-synced server blob** (`base`) in IndexedDB next to its revision.
- On a 409 it runs `mergeSaves(base, local, server.blob)`, then PUTs the merged blob with `If-Match` set to the server revision.
- **Monotonic fields, per field:**
  - `progress.levels`: `cleared` OR, `stars` OR elementwise, `bestTicks` min, `attempts` max.
  - `frontierChapter`: max.
  - **`starChestsClaimed`: per-chapter set union** (so no milestone can be claimed twice).
  - `unlocks`: union.
  - `journal.firstSeen`: min per key.
  - `lifetime`, `playtimeSec`: max.
  - `accuracyDaily`: union by day, keeping the higher accuracy.
- **SRS:**
  - Start from the side with the higher `srs.levelsPlayed`.
  - Add any `entries` keys found only on the other side.
  - `mastered` = union, with mastered keys removed from `entries`.
  - `levelsPlayed` = max.
- **Fungible group** (`wallet`, `inventory`, `equipped`, `loadout`, `cachePity`, `metaRng`, `replays`), merged as a **single unit**:
  - If only one side changed it relative to `base`, take that side.
  - If both changed, or `base` is null, take the side with the higher `playtimeSec`.
  - If both sides gained more than 30 min of `playtimeSec` since `base`, set `needsUserChoice`.
- **Settings:** take local.

**Wire encoding.** `blob = base64(gzip(utf8(JSON.stringify(save))))` via `CompressionStream("gzip")` (`packages/shared/src/compress.ts`). The decoded blob must be ≤ 256 KiB.

### 9.2 HTTP API

**General rules.**
- Bodies are JSON.
- **Access token:** sent as `Authorization: Bearer <JWT>`. It is HS256, lasts 15 min, and has claims `{sub, ageBand, region, iat, exp}`.
- **Refresh token:** opaque, valid for 90 days and stored hashed. It rotates on every use, and reusing an old one revokes the whole token family.
- `POST /runs/submit` requires `Idempotency-Key: <runId>`.
- Every non-2xx response uses the error envelope. A 409 save conflict also includes `server`.

**HTTP status per error code** (`workers/api/src/lib/errors.ts` `STATUS_OF`). `error.code` is the contract; the status is for HTTP-level handling.

| `error.code` | HTTP | Client reaction |
|---|---|---|
| `bad_request` | 400 | Bug or schema drift. Do not retry unchanged. |
| `unauthorized` | 401 | Missing or invalid access token, or `/auth/anon` device authentication failed. Refresh once, then re-login. |
| `token_expired` | 401 | `POST /auth/refresh`, then retry. |
| `refresh_invalid` | 401 | Unknown or expired refresh token. Re-login via `/auth/anon` with the stored `deviceId` + `deviceSecret`. |
| `refresh_reused` | 401 | Token family revoked (possible theft). Same recovery as `refresh_invalid`. |
| `forbidden` | 403 | Not allowed. |
| `not_found` | 404 | No save yet (`GET /save`), or `PUT /save` with `If-Match` ≠ 0 and no save. |
| `run_not_found` | 404 | Unknown run, or not the caller's. Start a new run. |
| `save_conflict` | 409 | Merge with `server`, then PUT again. |
| `run_already_submitted` | 409 | The run is finished and this log differs from the stored one. Do not retry. |
| `version_mismatch` | 409 | Client sim/content version is stale (terminal for the run). Prompt a reload. |
| `run_expired` | 410 | Ticket expired (terminal). Start a new run. |
| `bad_signature` | 403 | Ticket signature invalid (non-terminal). |
| `payload_too_large` | 413 | Save blob > 256 KiB decoded, or run log field over its size limit. |
| `log_invalid` | 422 | Terminal for the run. |
| `resim_mismatch` | 422 | Terminal for the run (the claim differs from the re-simulation). |
| `timing_impossible` | 422 | Terminal for the run. |
| `precondition_required` | 428 | Send `If-Match`. |
| `rate_limited` | 429 | Back off and retry later. |
| `internal` | 500 | Retry with backoff. |

A submit that fails with a terminal code is replayed verbatim (same status and body) when the same log is resubmitted with the same `runId`.

```ts shared
// packages/shared/src/errors.ts
import { z } from "zod";
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
// deviceSecret: random 256-bit value (base64url, 43 chars), generated once at first launch and kept in IndexedDB.
// The server stores only sha256(deviceSecret). Unknown deviceId -> account + device + token family are created.
// Known deviceId -> tokens ONLY if the secret matches (constant-time compare); wrong, malformed or missing secret -> 401
// `unauthorized` (never 400/409, so there is no device-existence oracle). Normal sessions use /auth/refresh, not /auth/anon.
export const DeviceSecret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const AuthAnonRequest = z.object({ deviceId: z.uuid(), deviceSecret: DeviceSecret, turnstileToken: z.string().optional() });
export const AuthTokens = z.object({ accessToken: z.string(), accessExpiresAt: z.number().int(), refreshToken: z.string() });
export const AuthAnonResponse = AuthTokens.extend({ userId: z.string() });
// POST /auth/refresh          401 refresh_invalid | refresh_reused
export const AuthRefreshRequest = z.object({ refreshToken: z.string().min(32) });
export const AuthRefreshResponse = AuthTokens;

// GET /save  -> 200 SaveRecord + `ETag: "<revision>"` | 404 not_found
// PUT /save  -> header `If-Match: "<revision>"` ("0" when no save exists yet; missing -> 428 precondition_required)
//            -> 200 SavePutResponse | 409 SaveConflictResponse | 413 payload_too_large   (rate 2/min)
//            If-Match != "0" while NO save exists -> 404 not_found (there is no server copy to merge against; the client
//            should re-PUT with If-Match "0"). A 409 always carries `server`.
export const SaveRecord = z.object({ revision: z.number().int().min(1), updatedAt: z.number().int(), blob: B64, summary: SaveSummary });
export const SavePutRequest = z.object({ blob: B64, summary: SaveSummary });
export const SavePutResponse = z.object({ revision: z.number().int(), updatedAt: z.number().int() });
export const SaveConflictResponse = ErrorEnvelope.extend({ server: SaveRecord });

// POST /runs/start            (rate 10/min). ONE open trial ticket per user: starting a new run marks any
// previous 'open' trial run of that user 'abandoned' in the same batch.
export const RunStartRequest = z.object({ mode: z.literal("trial"), boardId: z.literal("trial_wpm") });
export const RunTicket = z.object({
  runId: z.string(), mode: z.literal("trial"), boardId: z.literal("trial_wpm"), trialId: z.string(),
  seed: z.number().int().min(0).max(0xffffffff), issuedAt: z.number().int(), expiresAt: z.number().int(),
  simVersion: z.number().int(), contentVersion: Hex8,
  sig: z.string(), // base64url HMAC-SHA256(secret, "v1|runId|userId|mode|boardId|seed|trialId|issuedAt|expiresAt|simVersion|contentVersion")
});

// POST /runs/submit           (rate 10/min; Idempotency-Key: runId)
export const TRIAL_MAX_EVENTS = 3000;
export const ClaimedTrialResult = z.object({
  correctChars: z.number().int().min(0), typos: z.number().int().min(0),
  wpmX100: z.number().int().min(0), accuracyBp: z.number().int().min(0).max(10000),
  finalHash: Hex8,
});
export const RunSubmitRequest = z.object({
  runId: z.string(), sig: z.string(),
  logFormat: z.literal("hdk1"), log: B64.max(43_692),     // deflate-raw(hdk1 bytes), <= 32 KiB
  eventCount: z.number().int().min(1).max(TRIAL_MAX_EVENTS),
  claimed: ClaimedTrialResult,
  simVersion: z.number().int(), contentVersion: Hex8, clientVersion: z.string(),
  timerResolutionMs: z.number().min(0).max(1000),         // context only (stored with flags); never trusted (M6)
});
export const RunSubmitResponse = z.object({
  status: z.literal("accepted"),             // shadow-flagged runs ALSO return "accepted" (D28)
  runId: z.string(),
  verified: z.object({ wpmX100: z.number().int(), accuracyBp: z.number().int(), score: z.number().int() }),
  pb: z.boolean(), rank: z.number().int().positive().nullable(),
});
// Rejections: ErrorEnvelope. See §10 for which codes are terminal for the run.

// GET /lb/trial?scope=season|all&around=me    (top-100 from KV, 60 s cron; `around` = live D1 query)
export const LbTrialQuery = z.object({ scope: z.enum(["season", "all"]).default("season"), around: z.literal("me").optional() });
export const LbEntry = z.object({
  rank: z.number().int().positive(), userId: z.string(), displayName: z.string(),
  wpmX100: z.number().int(), accuracyBp: z.number().int(), achievedAt: z.number().int(), isMe: z.boolean(),
});
export const LbTrialResponse = z.object({
  scope: z.enum(["season", "all"]), periodKey: z.string(),   // "S1" | "all"
  updatedAt: z.number().int(),
  top: z.array(LbEntry).max(100),
  me: LbEntry.nullable(),                                     // the owner sees their own flagged entry here only
  around: z.array(LbEntry).max(21).optional(),                // present iff around=me: me ±10
});
```
The leaderboard `score` column is `wpmX100 * 10_000 + accuracyBp`. Higher wins; ties go to the earlier `achieved_at`.

### 9.3 Keystroke log format `hdk1`
Encoding and decoding live in `packages/sim/src/logcodec.ts` and work on pure bytes. deflate-raw and base64 are in `packages/shared/src/compress.ts`.
```text
bytes  := magic "HDK1" (48 44 4B 31) · varint count · count × record
record := varint dtMs · varint code
dtMs   := ms since previous record; first record = ms since clock origin (Trial: always 0)
code   := 0 Escape | 1..95 printable ASCII (charCode - 31; space = 1) | 200 cmd:abandon | 201 revive:gem | 202 revive:feather
varint := unsigned LEB128, <= 5 bytes, value < 2^32
wire   := base64(deflateRaw(bytes))
```
```ts sim
export interface LoggedInput { ms: number; input: SimInput }   // invariant: input.tick === msToTick(ms)
export interface LogLimits { maxEvents: number; maxTotalMs: number }
export const TRIAL_LOG_LIMITS: LogLimits = { maxEvents: 3000, maxTotalMs: 60_000 };
export const LEVEL_LOG_LIMITS: LogLimits = { maxEvents: 50_000, maxTotalMs: 1_200_000 };
/** Throws LogError if ms is non-monotonic or input.tick !== msToTick(ms). */
export declare function encodeLog(entries: readonly LoggedInput[]): Uint8Array;
/** Throws LogError: bad magic/varint/code, count > maxEvents, cumulative ms > maxTotalMs, trailing bytes. */
export declare function decodeLog(bytes: Uint8Array, limits: LogLimits): LoggedInput[];
```

---

## 10. Anti-cheat re-sim contract (Worker, `POST /runs/submit`)

**What the T5.2 AC means (M7):**

| Tampering | Expected outcome |
|---|---|
| Altered **score or result** (the claim no longer matches the log) | **422 `resim_mismatch`**, and no leaderboard row is written |
| Altered **timing** (log re-timed, self-consistent claim) | Re-sim matches, so the run is **`flagged`** by the heuristics: a shadow row visible only to its owner. If the timing is physically impossible: **422 `timing_impossible`**. |
| Replaying the same submission | Returns the stored response (idempotent) |

The integration tests assert exactly these three cases.

**Submit steps, in order.** The first failure wins. In the table, *non-terminal* means the run row is left untouched; *terminal* means the run becomes `rejected` and the error is stored.

| # | Step | Failure → code |
|---|---|---|
| 1 | Validate auth and the zod body. `Idempotency-Key` must equal `runId`. | `bad_request` / `unauthorized` — non-terminal |
| 2 | Load the run. It must exist and be owned by `sub`. | `run_not_found` — non-terminal |
| 2a | If status ≠ `open`: if the stored `log_sha256` equals `sha256(log)`, return the **stored response** (success or error); otherwise 409 `run_already_submitted`. `rejected`, `accepted`, `flagged`, `abandoned` and `expired` are all terminal states. | — |
| 2b | If `now > expiresAt`, set status `expired`. | `run_expired` |
| 3 | Verify the HMAC `sig` (constant time). | `bad_signature` — non-terminal (the request may not come from the ticket holder) |
| 4 | `simVersion === SIM_VERSION` and `contentVersion === CONTENT_VERSION`. | `version_mismatch` — terminal |
| 5 | Decode the log with `decodeLog(inflate(b64), TRIAL_LOG_LIMITS)`. Also require `count === eventCount`, first `dtMs === 0`, and no commands other than `abandon`. | `log_invalid` — terminal |
| 6 | Timing plausibility: `lastMs <= (now − issuedAt) + AC_CLOCK_SLACK_MS` and `now − issuedAt >= 60_000 − AC_CLOCK_SLACK_MS`. | `timing_impossible` (422) — terminal |
| 7 | **Re-sim.** `replayTrial(resolveTrial(CONTENT, ticket.trialId), ticket.seed, decoded.map(d => d.input))`. `correctChars`, `typos`, `wpmX100`, `accuracyBp` and `finalHash` must **all equal** the claimed values. | `resim_mismatch` (422) — terminal |
| 8 | Run the heuristics (below). Any hit → status `flagged`; otherwise `accepted`. | — |
| 9 | Persist (below). | — |

**Race-safe persistence (M8).** Everything goes in one D1 `batch()`, which runs as a single transaction:
1. `UPDATE runs SET status=?, submitted_at=?, log_sha256=?, submit_nonce=?, response=? WHERE id=? AND status='open'`. `submit_nonce` is a fresh random value per request.
2. The leaderboard PB upsert, for `period_key ∈ {season, 'all'}`, using the **verified** values. It is guarded by `WHERE EXISTS (SELECT 1 FROM runs WHERE id=? AND submit_nonce=?)`.
3. The `run_replays` insert (top 1,000 or flagged; 90-day TTL), with the same guard.

After the batch:
- If the UPDATE changed 0 rows, another request won the race. Re-read the run and answer as in step 2a.
- Terminal error paths (steps 4–7) use the same conditional UPDATE, with `status='rejected'` and the stored error body.
- If the score enters the top 100, rebuild the KV top-100.

The claimed numbers are never written.

**Heuristics.** Thresholds are Worker env vars (`wrangler.toml [vars]`). **IKI-based thresholds are provisional:** tune them on real data before the season starts, and log every heuristic value to `flags` for that purpose.

**Preprocessing:**
- Use key records only (Escape excluded).
- `IKI` = consecutive `dtMs` values.
- A run of records with `dtMs = 0` (identical timestamps) counts as **one jank cluster**. It is coalesced into a single interval and excluded from the CV, fast-share and quantization statistics.
- **Timer grain (M6):** the grain `g` is the GCD of all non-zero IKIs. If `g ≥ 2` the browser timer is coarse, so the quantization rule is skipped and `g` is recorded. The other rules still catch macros.

| Env var | Default | Rule |
|---|---|---|
| `AC_RUN_TTL_MS` | 600000 | ticket lifetime |
| `AC_CLOCK_SLACK_MS` | 5000 | clock slack in step 6 |
| `AC_MAX_SUSTAINED_WPM` / `AC_SUSTAINED_SPAN_MS` | 220 / 30000 | net WPM over any 30 s span |
| `AC_MAX_BURST_WPM` / `AC_BURST_SPAN_MS` | 300 / 5000 | net WPM over any 5 s span |
| `AC_MIN_IKI_CV` *(provisional)* | 0.15 | coefficient of variation of the IKIs (humans: 0.35–0.7) |
| `AC_FAST_IKI_MS` / `AC_MAX_FAST_IKI_SHARE` *(provisional)* | 15 / 0.02 | share of IKIs below 15 ms |
| `AC_QUANT_MIN_PERIOD_MS` / `AC_QUANT_MAX_SHARE` *(provisional)* | 8 / 0.6 | share of IKIs that are exact multiples of one period p ∈ [8, 50] ms; only when g = 1 |
| `AC_MAX_JANK_SHARE` *(provisional)* | 0.10 | share of keys inside jank clusters |
| `AC_PERFECT_MIN_KEYS` / `AC_PERFECT_MIN_WPM` | 400 / 150 | 100% accuracy over ≥ N keys at ≥ W WPM |
| `AC_PB_JUMP_REVIEW_WPM` | 35 | PB jump vs. the previous verified best → `flags` row for **review** only (no shadow flag) |
| `AC_MIN_KEYS` | 20 | fewer keys → accepted but not ranked |

Story levels are not verified in the slice. `replay()` and `LEVEL_LOG_LIMITS` exist so the same contract can extend to Boss of the Week.

**Parity tests (gate §8.1).**
- **Golden fixtures** cover two cases:
  - Trial: `(contentVersion, trialId, seed, hdk1 log) → TrialResult + hash`.
  - Level: `(contentVersion, levelId, ctx, loadout, seed, options, log) → LevelResult + hash`.
- They run in Node (vitest), in Chromium (Playwright) and under `wrangler dev`.
- A `SIM_VERSION` or `CONTENT_VERSION` change regenerates the affected fixtures, and the commit message says why.

---

## 11. Change process

1. **Versioning.** This doc is versioned `MAJOR.MINOR`.
   - **MINOR** covers additive changes: a new event type, a new optional field or a new BALANCE key.
   - **MAJOR** covers renaming, removing or changing the meaning of an existing contract.
   - **`SIM_VERSION`** is bumped whenever the same inputs could produce a different state, event list or result. That includes any rule, number, RNG draw order or stream change, even one made only in BALANCE.
   - **`SAVE_SCHEMA_VERSION`** is bumped for save shape changes.
2. **Proposals.** Agents **never edit this file**. They put an *Interface Change Proposal* in their task report:
   ```text
   ICP: <title>
   Section: §N    Kind: additive | breaking    Bumps: SIM_VERSION? SAVE_SCHEMA_VERSION? doc MINOR/MAJOR
   Change: <exact TS/zod diff>
   Why: <one paragraph>
   Affected owners: <roles / files>
   ```
3. **Approval.** The orchestrator approves (MAJOR changes also get an Opus review), edits this doc and updates the changelog at the top. The owning agent then implements the change, and consumers are told about it in their next brief.
4. **While an ICP is pending,** implement against the current doc. Local workarounds stay inside your own package.
5. **New event types.** Adding an event type requires the same commit to update `ALL_EVENT_TYPES` (compile-checked) and to stub a binding in `level/eventBindings.ts` (VFX owner, via the orchestrator).

---

## 12. Decisions taken (review me)

| # | Decision | Why / alternative |
|---|---|---|
| D1 | Integer fixed point: quantities in milli, ratios in bp. Generated tables replace every power curve. The banned set is listed in §1.2. | Removes every cross-engine float question. |
| D2 | The sfc32 state is plain data. Streams are keyed by (seed, name, encounter index). Loot is derived at roll time. | "Adding a feature doesn't shift loot." |
| D3 | FNV-1a 32 over sorted canonical JSON. `deepClone`, not `structuredClone`. | Simple and fast. Security comes from comparing outcomes, not from the hash. |
| D4 | The log stores integer ms, and ticks are derived from it. Frames lag 3 ticks behind the clock, and keys step the sim immediately. | Keeps ms timing for the heuristics without making the sim depend on ms. |
| D5 | `caseMode: "auto"` is case-insensitive for plates that contain no capitals. | Kind to beginners. T5+ stays strict. |
| D6 | Escape drops the target, or pauses when nothing is targeted (client side). Tab always drops. | Merges doc 01's two Escape uses. |
| D7 | **Hybrid combo (PO 2026-10-09).** The mechanical combo counts perfect words, with tiers 5/15/30/50. The VFX colour tiers count the per-key `keyStreak`, with tiers 10/25/50/100. Both are exposed in events and the view. | Keeps economy parity and gives T2.6 its per-keystroke juice. |
| D8 | The combo penalty applies at most once per plate attempt (stray typos share a latch). | Matches the economy sim's halve-per-imperfect-word. |
| D9 | **(B1)** Escape resets progress but keeps `perfect` and leaves the combo untouched. Already-paid char indices pay no ATB again. An imperfect completion leaves the combo unchanged. | Escape is free per doc 01. The anti-farm rule closes the exploit. |
| D10 | Crit = 5% + 15% × the perfect share since the last auto-attack (5% when there were no words). | Equals the economy's expected crit rate. |
| D11 | Weakness ×1.3, shields, Break 4.5 s at ×1.8. Chips never break shields. **Kept by the PO; encounter HP is retuned in T6.1.** | Already shown in the POC. |
| D12 | Fixed impact delays. Hit-stop and slow-mo are render-only. | The sim never slows, and input is never blocked. |
| D13 | The guard word replaces the enemy's plate. Block or parry resolves at impact. | Keeps the first-letter uniqueness rule simple. |
| D14 | A failed Doom Spell does 15% of par HP but is non-lethal. | Doc 01 + C4. |
| D15 | The Ruin Golem's signature is Falling Rubble, followed by a finisher with no timer. | Reuses the plate system. |
| D16 | Phase-2 HP clamps until 2 Doom Spells have resolved. | Delivers the doom count the economy expects. |
| D17 | Second Wind: 8 s, freezes the encounter, restores 30% HP. Gem revive exists only as a disabled hook command. | The hook is there without building gems. |
| D18 | Skill charge, combo and keyStreak persist across encounters; ATB resets each encounter. | Opening Gambit implies an ATB reset. |
| D19 | Skill and passive numbers live in BALANCE; content holds text and art. | One parameter table. |
| D20 | The slice has 6 actives and 8 passives (ids in §3). | T1.4 may swap ids via an ICP. |
| D21 | Damage types: Sword slash, Dagger pierce, Staff arcane, Hammer blunt. | Maps the POC's weakness tags. |
| D22 | Gear slots are weapon / armor / **charm** (the plan's "accessory"). | Matches the economy sim. |
| D23 | **Cache weapon archetype (PO 2026-10-09):** equipped 40%, each of the other three 20%. Fixed and published via `publishedCacheOdds()`. Slot stays uniform. | Kinder to players while staying transparent. |
| D24 | Meta outcomes are a separate `MetaEvent` union. | Caches open outside levels. |
| D25 | **Trial (PO confirmed typed spaces):** stop-on-error, a 60 s clock that starts at the first key, and a standardized pool of ≥ 30 passages (≥ 1600 chars each) picked by the seed. A key at tick ≥ 3600 does not count. One open ticket per user. | Standard WPM, fair and replayable. |
| D26 | `PUT /save` uses an `If-Match` ETag; the merge is three-way against the last-synced base. | As briefed + reviewer M9. |
| D27 | `POST /runs/submit` takes `runId` in the body. Idempotency = runId + sha256(log) + a conditional UPDATE. | Race-safe (M8). |
| D28 | A shadow-flagged run gets an identical "accepted" response. | Doc 03. |
| D29 | SRS: a typo demotes one box; promotion only when the word is due. | Gentle-failure pillar. |
| D30 | Swift and BurstWpm thresholds are relative to the player's Pace. | Fair at every WPM. |
| D31 | No damage variance (it stays a tunable). | Parity with the economy sim. |
| D32 | Encounter HP pools and grunt hits are explicit in level data, generated by `tools/balance`. | Tunable and reviewable. |
| D33 | Chest gems are reported as `gemsUncredited`. Gear-cache pity is client-owned. | The server owns gems and cosmetic pity. |

**Rejected or adjusted reviewer items:** none rejected. Two were adjusted:
- `buildLoadout` takes a structural `LoadoutSource` rather than `SaveBlob`. The sim cannot import `@hd2d/shared` without creating a cycle; `shared` proves at compile time that a save is assignable to it.
- The sim imports one pure **value** from content (`TYPABLE_CHARS`) in addition to its types, so that the regex and the key filter share a single source.

**Open questions:** none blocking. Two items will be revisited with real data: the IKI heuristic thresholds (§10) and the T6.1 HP retune for D11.
