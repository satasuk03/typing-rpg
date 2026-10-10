// Fixtures and a tiny driver for typing-only levels. Shared by the unit tests, the property test, the golden replay
// and the Node/Chromium parity bundle, so it must stay pure and deterministic (no wall clock, no Math.random).
import {
  applyInput,
  below,
  createLevel,
  deriveRng,
  type EventOf,
  getView,
  type LevelOptions,
  type LevelState,
  type LevelView,
  type Loadout,
  type ResolvedBoss,
  type ResolvedEnemy,
  type ResolvedLevel,
  type ResolvedSegment,
  type SimEvent,
  type SimEventType,
  step,
} from "../src/index.ts";

export const POOL_CURRENT = [
  "apple",
  "bird",
  "cat",
  "door",
  "eagle",
  "fish",
  "gold",
  "hill",
  "iron",
  "jump",
  "kite",
  "lamp",
  "moon",
  "nest",
  "owl",
  "pond",
  "quiz",
  "rope",
  "star",
  "tree",
  "urn",
  "vase",
  "wolf",
  "yarn",
  "zone",
  "acorn",
  "brook",
  "cloud",
  "dream",
  "ember",
  "frost",
  "glow",
  "haze",
  "isle",
  "jade",
  "knot",
  "leaf",
  "mist",
  "note",
  "oak",
  "pine",
  "quill",
  "rain",
  "sand",
  "tide",
  "umber",
  "vine",
  "wind",
  "yew",
  "zest",
];
export const POOL_REVIEW = [
  "ant",
  "bell",
  "coin",
  "dust",
  "elm",
  "fern",
  "gate",
  "herb",
  "ink",
  "joy",
];
export const POOL_BIOME = ["moss", "root", "bark", "fungus", "lichen", "thorn", "willow", "acorn"];
export const POOL_WEAK = ["rhythm", "queue", "yacht"];
export const POOL_GUARD = [
  "arm",
  "bar",
  "cap",
  "dig",
  "end",
  "fin",
  "gap",
  "hit",
  "ice",
  "jab",
  "key",
  "log",
  "map",
  "net",
  "oak",
  "pad",
  "ram",
  "sip",
  "tap",
  "use",
  "van",
  "web",
  "yes",
  "zip",
];

export const ENEMIES: Record<string, ResolvedEnemy> = {
  slime: {
    id: "slime",
    archetype: "grunt",
    baseIntervalTicks: 540,
    heavy: false,
    plateLength: [3, 7],
    weaknesses: ["slash"],
    shield: 0,
    hpWeightBp: 10_000,
    hitWeightBp: 10_000,
  },
  bat: {
    id: "bat",
    archetype: "speedster",
    baseIntervalTicks: 300,
    heavy: false,
    plateLength: [3, 6],
    weaknesses: ["fire"],
    shield: 0,
    hpWeightBp: 10_000,
    hitWeightBp: 10_000,
  },
  brute: {
    id: "brute",
    archetype: "brute",
    baseIntervalTicks: 720,
    heavy: true,
    plateLength: [4, 8],
    weaknesses: [],
    shield: 2,
    hpWeightBp: 10_000,
    hitWeightBp: 10_000,
  },
  golem: {
    id: "golem",
    archetype: "boss",
    baseIntervalTicks: 600,
    heavy: true,
    plateLength: [4, 8],
    weaknesses: [],
    shield: 0,
    hpWeightBp: 10_000,
    hitWeightBp: 10_000,
  },
};

export const BOSS: ResolvedBoss = {
  id: "ruinGolem",
  name: "Ruin Golem",
  title: "Guardian of the Hollow",
  enemyId: "golem",
  hpM: 300_000,
  hitM: 20_000,
  attackPowerBp: 10_000,
  plateLength: [4, 8],
  phase1: { endAtHpBp: 6600, adds: [] },
  phase2: { endAtHpBp: 3300, doomEveryTicks: 900, minDoomSpells: 2 },
  phase3: {
    minigame: {
      kind: "fallingRubble",
      lanes: 3,
      spawnEveryTicks: 120,
      fallTicks: 240,
      clearAtkMultBp: 20_000,
      missHitM: 5000,
    },
    finisherText: "the old stones fall silent",
  },
  breatherTicks: 120,
  introTicks: 120,
};

/** BOSS without phases: no adds, both gates at the final gate, no Doom Spells owed, 1-tick breathers (reaches the Finisher fast). */
export const FLAT_BOSS: ResolvedBoss = {
  ...BOSS,
  phase1: { endAtHpBp: 0, adds: [] },
  phase2: { endAtHpBp: 0, doomEveryTicks: 900, minDoomSpells: 0 },
  breatherTicks: 1,
};

export const SEGMENTS: ResolvedSegment[] = [
  { kind: "walk", ticks: 120, heal: false },
  {
    kind: "encounter",
    name: "Forest Edge",
    hpPoolM: 90_000,
    gruntHitM: 6000,
    attackPowerBp: 10_000,
    waves: [["slime"], ["slime", "bat"]].map((w) =>
      w.map((enemyId) => ({ enemyId, gimmick: null })),
    ),
  },
  { kind: "walk", ticks: 120, heal: true },
  {
    kind: "encounter",
    name: "Old Road",
    hpPoolM: 120_000,
    gruntHitM: 7000,
    attackPowerBp: 10_000,
    waves: [["slime", "bat", "brute"]].map((w) => w.map((enemyId) => ({ enemyId, gimmick: null }))),
  },
  { kind: "walk", ticks: 60, heal: false },
  { kind: "boss", bossId: "ruinGolem" },
];

export function mkDef(over: Partial<ResolvedLevel> = {}): ResolvedLevel {
  return {
    levelId: "fx-1",
    chapter: 1,
    index: 1,
    isBoss: true,
    contentVersion: "fixture",
    segments: SEGMENTS.map((s) => ({ ...s })),
    enemies: ENEMIES,
    boss: BOSS,
    words: {
      current: POOL_CURRENT,
      review: POOL_REVIEW,
      biome: POOL_BIOME,
      weak: POOL_WEAK,
      guard: POOL_GUARD,
      doom: [],
      finisher: [BOSS.phase3.finisherText],
      secondWind: [],
      minigame: [],
    },
    tierMixBp: { current: 6000, review: 2000, biome: 1500, weak: 500 },
    plateLength: [3, 8],
    goldTotal: 100,
    parHpM: 100_000,
    parArmorBp: 10_000,
    star3: { kind: "perfectWords", target: 5 } as unknown as ResolvedLevel["star3"],
    parRefTicks: 9000,
    tutorial: false,
    foldSentences: false,
    ...over,
  };
}

/** A one-encounter level with the given enemies in a single wave and an explicit word pool. */
export function mkSimpleDef(
  enemyIds: string[],
  pool: {
    current: string[];
    guard?: string[];
    review?: string[];
    biome?: string[];
    weak?: string[];
  },
  over: Partial<ResolvedLevel> = {},
  waveCount = 1,
  hp: { poolM: number; hitM: number } = { poolM: 300_000, hitM: 5000 },
): ResolvedLevel {
  const wave = enemyIds.map((enemyId) => ({ enemyId, gimmick: null }));
  return mkDef({
    isBoss: false,
    boss: null,
    segments: [
      {
        kind: "encounter",
        name: "Test",
        hpPoolM: hp.poolM,
        gruntHitM: hp.hitM,
        attackPowerBp: 10_000,
        waves: Array.from({ length: waveCount }, () => wave),
      },
    ],
    words: {
      current: pool.current,
      review: pool.review ?? [],
      biome: pool.biome ?? [],
      weak: pool.weak ?? [],
      guard: pool.guard ?? POOL_GUARD,
      doom: [],
      finisher: [],
      secondWind: [],
      minigame: [],
    },
    ...over,
  });
}

export const mkLoadout = (
  archetype: "sword" | "dagger" | "staff" | "hammer" = "sword",
): Loadout => ({
  weapon: { tier: 1, rarity: "C", upgrade: 0, archetype },
  armor: { tier: 1, rarity: "C", upgrade: 0 },
  charm: { tier: 1, rarity: "C", upgrade: 0 },
  actives: [null, null],
  activeModes: ["smart", "smart"],
  passives: [null, null, null],
});

export const mkOptions = (over: Partial<LevelOptions> = {}): LevelOptions => ({
  pace: 35,
  difficulty: "standard",
  comboMode: "gentle",
  caseMode: "auto",
  autoUnlockAfterTypos: 0,
  firstClear: true,
  frontierChapter: 1,
  goldMultBp: 10_000,
  allowExternalRevive: false,
  tutorial: false,
  ...over,
});

/** Drives a level one tick/key at a time and records every event. */
export class Driver {
  state: LevelState;
  all: SimEvent[] = [];
  def: ResolvedLevel;
  seed: number;
  constructor(
    def: ResolvedLevel = mkDef(),
    seed = 1,
    options: Partial<LevelOptions> = {},
    loadout: Loadout = mkLoadout(),
  ) {
    this.def = def;
    this.seed = seed;
    this.state = createLevel(def, loadout, seed, mkOptions(options));
  }
  step(n = 1): SimEvent[] {
    const ev = step(this.state, n);
    this.all.push(...ev);
    return ev;
  }
  /** Applies one key at the current tick (does not advance time). */
  key(k: string): SimEvent[] {
    const ev = applyInput(this.state, { tick: this.state.tick, key: k });
    this.all.push(...ev);
    return ev;
  }
  /** Types every char of s, one key per tick. */
  type(s: string, gap = 1): SimEvent[] {
    const out: SimEvent[] = [];
    for (const c of s) {
      out.push(...this.key(c));
      out.push(...this.step(gap));
    }
    return out;
  }
  view(): LevelView {
    return getView(this.state);
  }
  /** Steps until the phase is "combat". */
  toCombat(): this {
    for (let i = 0; i < 2000 && this.state.phase !== "combat"; i++) this.step();
    if (this.state.phase !== "combat") throw new Error("never reached combat");
    return this;
  }
  plates(): LevelView["plates"] {
    return this.view().plates;
  }
  ofType<T extends SimEventType>(type: T, from: readonly SimEvent[] = this.all): EventOf<T>[] {
    return from.filter((e): e is EventOf<T> => e.type === type);
  }
  /** Steps until an event of `type` is emitted (returns it) or `max` ticks pass (throws). */
  until<T extends SimEventType>(type: T, max = 5000): EventOf<T> {
    for (let i = 0; i < max; i++) {
      const ev = this.step();
      const hit = ev.find((e) => e.type === type);
      if (hit !== undefined) return hit as EventOf<T>;
    }
    throw new Error(`no ${type} within ${max} ticks`);
  }
}

/** Seeded scripted typist: reads the view, types the next letter (or a typo / Escape sometimes). Returns the input log. */
export function scriptedSession(
  seed: number,
  def: ResolvedLevel,
  maxTicks = 20_000,
  options: Partial<LevelOptions> = {},
): {
  inputs: { tick: number; key: string }[];
  driver: Driver;
} {
  const r = deriveRng(seed, "meta");
  const d = new Driver(def, seed, options);
  const inputs: { tick: number; key: string }[] = [];
  const press = (k: string): void => {
    inputs.push({ tick: d.state.tick, key: k });
    d.key(k);
  };
  while (d.state.phase !== "cleared" && d.state.phase !== "failed" && d.state.tick < maxTicks) {
    if (d.state.phase === "combat" && below(r, 100) < 22) {
      const v = d.view();
      const target = v.plates.find((p) => p.isTarget);
      const roll = below(r, 100);
      if (roll < 4) {
        press("Escape");
      } else if (target !== undefined) {
        if (roll < 12) press("q");
        else press(target.text.charAt(target.typedIndex));
      } else if (v.plates.length > 0) {
        // prefer a guard plate, else a random plate
        const guard = v.plates.find((p) => p.kind === "guard");
        const pick = guard ?? (v.plates[below(r, v.plates.length)] as (typeof v.plates)[number]);
        press(pick.text.charAt(0));
      }
    }
    d.step(1);
  }
  return { inputs, driver: d };
}
