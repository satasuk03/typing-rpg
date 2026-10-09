// Sim-internal state shapes (plain JSON; docs/interfaces.md §1.4, §3.1). Not part of the published contract beyond
// "plain data": consumers read getView() only. Everything here is integers, strings, booleans, null, arrays, objects.
import type { ComboTier, EntityId, KeyStreakTier, PlateId, PlateKind } from "./events.ts";
import type { RngState } from "./rng.ts";
import type { Tick } from "./time.ts";
import type { LevelOptions, Loadout, ResolvedLevel, WordResult } from "./types.ts";

export interface PlateState {
  id: PlateId;
  ownerId: EntityId | null;
  kind: PlateKind;
  text: string;
  display: string;
  fold: boolean; // compare case-insensitively (caseMode "auto" and no uppercase in text)
  typed: number; // chars [0, typed) are typed in the current attempt
  perfect: boolean; // no typo yet (kept across Escape, B1)
  typos: number;
  lastTypoTick: Tick | null;
  penalized: boolean; // combo typo penalty already taken on this plate (D8)
  maxPaid: number; // anti-farm: chars at index < maxPaid pay no ATB again (B1)
  paidChars: number;
  paidAtbM: number; // sum of per-char ATB paid on this plate
  tFirst: Tick | null; // tick of char index 0 in the current attempt
  shownTick: Tick;
  expiresAt: Tick | null;
  totalTicks: number | null;
  lane: number | null;
  wordsDone: number; // sentence words finished (for SentenceWordDone)
}

export interface EnemyState {
  id: EntityId;
  defId: string;
  slot: number;
  isBoss: boolean;
  alive: boolean;
  hpM: number;
  maxHpM: number;
  plateId: PlateId | null;
  spawnTick: Tick;
  intervalTicks: number;
  cycleStart: Tick;
  nextImpact: Tick | null; // null = no attack scheduled (zen, broken, boss phases, dead)
  guardTicks: number; // guard span for the scheduled impact
  windupShown: boolean; // guard word shown for the scheduled impact
  guardResult: "block" | "parry" | null; // typed, waiting for impact
  wordsDone: number;
}

export interface EncounterState {
  index: number; // encounter counter (encounter + boss segments), 0-based
  isBoss: boolean;
  startTick: Tick;
  typingFromTick: Tick;
  waveIndex: number;
  waveCount: number;
  enemies: EnemyState[]; // current + dead of this encounter, stable slot order
  plates: PlateState[];
  targetPlateId: PlateId | null;
  focusEnemyId: EntityId | null;
  atbM: number;
  wordsRng: RngState;
  aiRng: RngState;
  combatRng: RngState;
  gimmickRng: RngState;
  recent: string[]; // recently assigned plate texts (anti-repeat)
  finisherShown: boolean;
}

export interface RunStats {
  correctChars: number;
  typos: number;
  wordsCompleted: number;
  perfectWords: number;
  maxCombo: number;
  maxKeyStreak: number;
  blocks: number;
  perfectParries: number;
  hitsTaken: number;
  autoAttacks: number;
  chipDamageM: number;
}

export interface RunState {
  def: ResolvedLevel;
  loadout: Loadout;
  options: LevelOptions; // pace clamped
  started: boolean;
  phaseStart: Tick; // tick the current phase began (view phaseProgress)
  combo: number;
  comboTier: ComboTier;
  keyStreak: number;
  keyStreakTier: KeyStreakTier;
  strayLatch: boolean; // stray typo already penalized since the last correct char
  wrongStreak: number; // consecutive wrong keys (auto-unlock)
  stats: RunStats;
  activeTicks: number;
  words: WordResult[];
  burstTicks: number[]; // ticks of the last <= BURST_CHARS correct chars
  burstWpm: number;
  lastBurstTick: Tick | null;
  heroMaxHpM: number;
  heroHpM: number;
  guardsShown: number;
  encountersStarted: number;
  endTick: Tick | null;
  failReason: "defeated" | "abandoned" | "timeout" | null;
}
