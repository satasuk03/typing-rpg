/**
 * Mock sim driver: produces a scripted `LevelView` + `SimEvent` stream (60 Hz ticks) for the HUD
 * test scene. NOT the real sim: just enough behaviour to exercise every HUD feature with scripted
 * typing at a given WPM (with typos). Deterministic for a given (scenario, wpm, seed).
 */
import type { DamageType } from "@hd2d/content";
import type {
  ComboTier,
  EnemyView,
  KeyStreakTier,
  LevelView,
  PlateKind,
  PlateView,
  SimEvent,
  SkillView,
} from "@hd2d/sim";

export type MockScenario = "forest" | "cave" | "boss" | "stress";

export interface MockOpts {
  scenario: MockScenario;
  wpm: number;
  seed?: number;
  /** Typo probability per key (default 0.06 at <= 50 wpm, 0.04 above). */
  typoRate?: number;
}

interface MEnemy {
  id: number;
  defId: string;
  slot: number;
  maxHp: number;
  hp: number;
  shield: number;
  shieldMax: number;
  weak: { type: DamageType; revealed: boolean }[];
  brokenUntil: number;
  plateId: number | null;
  words: string[];
  wordIdx: number;
  alive: boolean;
  isBoss: boolean;
  guardWords: boolean;
  cycle: number;
  cycleStart: number;
  guardPlateId: number | null;
  guardWindowStart: number;
  nextPlateAt: number;
  name: string;
  title: string;
  phase: 1 | 2 | 3;
}

interface MPlate {
  id: number;
  ownerId: number | null;
  kind: PlateKind;
  text: string;
  typed: number;
  hadTypo: boolean;
  lastTypoTick: number | null;
  expiresAt: number | null;
  total: number | null;
  shownTick: number;
  faded: boolean;
  scrambled: string | null;
}

const WORDS = [
  "dance",
  "wolf",
  "snow",
  "river",
  "ember",
  "stone",
  "light",
  "frost",
  "grove",
  "tide",
  "spark",
  "blade",
  "storm",
  "raven",
  "cloud",
  "vine",
  "moss",
  "flame",
  "quiet",
  "brook",
];
const GUARD_WORDS = ["block", "shield", "guard", "ward", "brace", "parry"];
const SENTENCES = ["the old stone wakes", "ancient embers will rise", "none shall pass the hollow"];

function rngFactory(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KS_T = [10, 25, 50, 100];
const CB_T = [5, 15, 30, 50];
const ksTier = (n: number): KeyStreakTier => {
  let t = 0;
  for (const x of KS_T) if (n >= x) t++;
  return t as KeyStreakTier;
};
const cbTier = (n: number): ComboTier => {
  let t = 0;
  for (const x of CB_T) if (n >= x) t++;
  return t as ComboTier;
};

export class MockDriver {
  tick = 0;
  view: LevelView;
  private rng: () => number;
  private enemies: MEnemy[] = [];
  private plates = new Map<number, MPlate>();
  private nextPlateId = 1;
  private nextEnemyId = 1;
  private events: SimEvent[] = [];
  private heroHp = 140;
  private readonly heroMax = 140;
  private atb = 0;
  private combo = 0;
  private keyStreak = 0;
  private target: number | null = null;
  private nextKeyTick = 0;
  private typingFrom = 0;
  private cps: number;
  private typoRate: number;
  private skillCharge = [0.55, 0.3];
  private skillReady = [false, false];
  private barrier = 0;
  private gold = 0;
  private correct = 0;
  private typos = 0;
  private keyTicks: number[] = [];
  private wave = 0;
  private autoCount = 0;
  private phase: LevelView["phase"] = "encounterIntro";
  private phaseEnd = 0;
  private respawnAt = -1;
  private bossIntroTicks = 0;

  constructor(private opts: MockOpts) {
    this.rng = rngFactory(opts.seed ?? 7);
    this.cps = (Math.max(10, opts.wpm) * 5) / 60;
    this.typoRate = opts.typoRate ?? (opts.wpm <= 50 ? 0.06 : 0.04);
    this.spawnWave();
    this.view = this.buildView();
  }

  // ------------------------------------------------------------ public

  /** Advance one tick; returns the events emitted during it. */
  step(): SimEvent[] {
    this.tick++;
    this.events = [];
    this.run();
    this.view = this.buildView();
    return this.events;
  }

  /** Initial events (LevelStarted etc.), call once before the first step. */
  start(): SimEvent[] {
    const out = this.startEvents;
    this.startEvents = [];
    return out;
  }
  private startEvents: SimEvent[] = [];

  // ------------------------------------------------------------ setup

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private spawnWave(): void {
    const sc = this.opts.scenario;
    const t = this.tick;
    this.enemies = [];
    this.plates.clear();
    this.target = null;
    const ev: SimEvent[] = [];
    const pick = (n: number) => {
      const out: string[] = [];
      for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(this.rng() * WORDS.length)] ?? "word");
      return out;
    };
    const mk = (o: Partial<MEnemy> & { defId: string; slot: number; maxHp: number }): MEnemy => ({
      id: this.nextEnemyId++,
      hp: o.maxHp,
      shield: 0,
      shieldMax: 0,
      weak: [],
      brokenUntil: 0,
      plateId: null,
      words: pick(6),
      wordIdx: 0,
      alive: true,
      isBoss: false,
      guardWords: false,
      cycle: 540,
      cycleStart: t + 60,
      guardPlateId: null,
      guardWindowStart: 0,
      nextPlateAt: t + 40,
      name: "",
      title: "",
      phase: 1,
      ...o,
    });
    if (sc === "forest" || sc === "stress") {
      this.enemies.push(
        mk({
          defId: "slime",
          slot: 0,
          maxHp: 220,
          shield: 2,
          shieldMax: 2,
          weak: [{ type: "fire", revealed: false }],
          words: ["dance", ...pick(5)],
          cycleStart: t + 200,
        }),
        mk({
          defId: "bat",
          slot: 1,
          maxHp: 190,
          shield: 1,
          shieldMax: 1,
          weak: [{ type: "slash", revealed: false }],
          words: ["wolf", ...pick(5)],
          guardWords: true,
          cycleStart: t + 60,
          cycle: 420,
        }),
        mk({
          defId: "slime2",
          slot: 2,
          maxHp: 240,
          shield: 2,
          shieldMax: 2,
          weak: [{ type: "slash", revealed: false }],
          words: ["snow", ...pick(5)],
          cycleStart: t + 300,
        }),
      );
      this.phase = "encounterIntro";
      this.typingFrom = t + 90;
      ev.push({
        type: "EncounterStarted",
        tick: t,
        encounterIndex: 0,
        name: "Whispering Woods",
        isBoss: false,
        waveCount: 2,
        typingFromTick: this.typingFrom,
      });
    } else if (sc === "cave") {
      this.enemies.push(
        mk({
          defId: "crystalBat",
          slot: 0,
          maxHp: 320,
          shield: 1,
          shieldMax: 1,
          weak: [
            { type: "slash", revealed: false },
            { type: "ice", revealed: false },
          ],
          words: ["ember", ...pick(5)],
          cycleStart: t + 400,
        }),
        mk({
          defId: "cavern",
          slot: 1,
          maxHp: 420,
          shield: 3,
          shieldMax: 3,
          weak: [
            { type: "slash", revealed: true },
            { type: "fire", revealed: false },
          ],
          words: ["crystal", "glow", ...pick(4)],
          cycleStart: t + 450,
          cycle: 600,
        }),
      );
      this.atb = 0.55;
      this.skillCharge = [0.9, 0.5];
      this.phase = "encounterIntro";
      this.typingFrom = t + 60;
      ev.push({
        type: "EncounterStarted",
        tick: t,
        encounterIndex: 1,
        name: "Crystal Cave",
        isBoss: false,
        waveCount: 1,
        typingFromTick: this.typingFrom,
      });
    } else {
      this.enemies.push(
        mk({
          defId: "ruinGolem",
          slot: 1,
          maxHp: 1100,
          shield: 6,
          shieldMax: 6,
          weak: [
            { type: "slash", revealed: true },
            { type: "fire", revealed: true },
          ],
          words: [...SENTENCES],
          isBoss: true,
          guardWords: true,
          cycle: 480,
          cycleStart: t + 420,
          name: "Ruin Golem",
          title: "Warden of the Hollow",
          nextPlateAt: t + 200,
        }),
      );
      this.bossIntroTicks = 150;
      this.phase = "bossIntro";
      this.phaseEnd = t + this.bossIntroTicks;
      this.typingFrom = t + this.bossIntroTicks + 30;
      ev.push({
        type: "EncounterStarted",
        tick: t,
        encounterIndex: 2,
        name: "Ruin Golem",
        isBoss: true,
        waveCount: 1,
        typingFromTick: this.typingFrom,
      });
    }
    this.phaseEnd = this.typingFrom;
    const first: SimEvent[] = [];
    if (this.wave === 0)
      first.push({
        type: "LevelStarted",
        tick: t,
        levelId: `mock-${sc}`,
        chapter: 1,
        isBossLevel: sc === "boss",
        encounterCount: 3,
      });
    else
      first.push({
        type: "WaveStarted",
        tick: t,
        encounterIndex: 0,
        waveIndex: this.wave,
        enemyIds: this.enemies.map((e) => e.id),
      });
    for (const e of this.enemies) {
      first.push({
        type: "EnemySpawned",
        tick: t,
        enemyId: e.id,
        defId: e.defId,
        slot: e.slot,
        maxHp: e.maxHp,
        isBoss: e.isBoss,
        shieldMax: e.shieldMax,
      });
    }
    if (this.wave === 0) first.push(...ev);
    else first.push(...ev.filter((x) => x.type !== "EncounterStarted"));
    if (this.enemies[0]?.isBoss)
      first.push({
        type: "BossIntroStarted",
        tick: t,
        enemyId: this.enemies[0].id,
        bossId: "ruinGolem",
        name: "Ruin Golem",
        title: "Warden of the Hollow",
        untilTick: t + this.bossIntroTicks,
      });
    this.startEvents.push(...first);
    this.wave++;
    this.nextKeyTick = this.typingFrom;
  }

  // ------------------------------------------------------------ plates

  private showPlate(
    e: MEnemy,
    kind: PlateKind,
    text: string,
    expires: number | null,
    total: number | null,
  ): MPlate {
    const p: MPlate = {
      id: this.nextPlateId++,
      ownerId: e.id,
      kind,
      text,
      typed: 0,
      hadTypo: false,
      lastTypoTick: null,
      expiresAt: expires,
      total,
      shownTick: this.tick,
      faded: false,
      scrambled: null,
    };
    this.plates.set(p.id, p);
    this.emit({
      type: "PlateShown",
      tick: this.tick,
      plateId: p.id,
      ownerId: e.id,
      kind,
      text,
      display: text,
      lane: null,
      replacesPlateId: null,
    });
    return p;
  }

  private removePlate(
    p: MPlate,
    reason: "completed" | "replaced" | "ownerDied" | "expired" | "phaseEnded",
  ): void {
    this.plates.delete(p.id);
    this.emit({ type: "PlateRemoved", tick: this.tick, plateId: p.id, reason });
    if (this.target === p.id) this.target = null;
  }

  // ------------------------------------------------------------ simulation

  private run(): void {
    const t = this.tick;
    if (this.startEvents.length) {
      this.events.push(...this.startEvents);
      this.startEvents = [];
    }
    if (this.phase !== "combat" && t >= this.phaseEnd) this.phase = "combat";
    if (this.opts.scenario === "stress" && t % 20 === 0) {
      const e = this.enemies[(t / 20) % this.enemies.length];
      if (e) {
        const crit = (t / 20) % 3 === 0;
        this.emit({
          type: "Hit",
          tick: t,
          sourceId: 0,
          targetId: e.id,
          kind: "auto",
          origin: "weapon",
          skillId: null,
          damageType: "slash",
          damage: 40 + (t % 17),
          damageM: 0,
          hpAfter: e.hp,
          maxHp: e.maxHp,
          crit,
          weak: crit,
          broken: false,
          atbKnockback: false,
          hitIndex: 0,
          hitCount: 1,
          killed: false,
        });
      }
    }

    if (this.respawnAt >= 0 && t >= this.respawnAt) {
      this.respawnAt = -1;
      this.spawnWave();
      this.events.push(...this.startEvents);
      this.startEvents = [];
    }

    // break expiry
    for (const e of this.enemies) {
      if (e.alive && e.brokenUntil > 0 && t >= e.brokenUntil) {
        e.brokenUntil = 0;
        e.shield = e.shieldMax;
        this.emit({ type: "BreakEnded", tick: t, enemyId: e.id });
      }
    }

    if (this.phase === "combat") {
      // plates appear
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.plateId === null && t >= e.nextPlateAt) {
          const text = e.words[e.wordIdx % e.words.length] ?? "word";
          e.wordIdx++;
          const p = this.showPlate(e, "word", text, null, null);
          e.plateId = p.id;
        }
        this.enemyCycle(e);
      }
      // typing
      if (t >= this.nextKeyTick && t >= this.typingFrom) {
        this.pressKey();
        const period = 60 / this.cps;
        this.nextKeyTick = t + Math.max(1, Math.round(period * (0.75 + 0.5 * this.rng())));
      }
      // keys-per-5s window for wpm
      while (this.keyTicks.length && (this.keyTicks[0] ?? 0) < t - 300) this.keyTicks.shift();
      // skills
      for (let i = 0; i < 2; i++) {
        if (!this.skillReady[i] && (this.skillCharge[i] ?? 0) >= 1) {
          this.skillReady[i] = true;
          this.emit({
            type: "SkillCharged",
            tick: t,
            slot: i as 0 | 1,
            skillId: i === 0 ? "fireball" : "aegis",
          });
        }
      }
      if (this.skillReady[0] && this.live().length > 0 && this.atb > 0.35) this.castSkill(0);
      if (this.skillReady[1] && this.live().length > 0) this.castSkill(1);
      if (this.atb >= 1) this.autoAttack();
    }

    // wave over
    if (this.enemies.length > 0 && this.enemies.every((e) => !e.alive) && this.respawnAt < 0) {
      this.emit({ type: "EncounterCleared", tick: t, encounterIndex: 0, durationTicks: t });
      this.phase = "rewards";
      this.respawnAt = t + 150;
      this.phaseEnd = t + 150;
    }
  }

  private live(): MEnemy[] {
    return this.enemies.filter((e) => e.alive);
  }

  private enemyCycle(e: MEnemy): void {
    const t = this.tick;
    if (e.brokenUntil > 0) {
      e.cycleStart = t - Math.round(e.cycle * 0.1);
      return;
    }
    const frac = (t - e.cycleStart) / e.cycle;
    if (e.guardWords && e.guardPlateId === null && frac >= 0.74 && frac < 1) {
      const total = Math.round(e.cycle * 0.26);
      const text = GUARD_WORDS[Math.floor(this.rng() * GUARD_WORDS.length)] ?? "guard";
      const impact = t + total;
      this.emit({
        type: "EnemyAttackWindup",
        tick: t,
        enemyId: e.id,
        impactTick: impact,
        heavy: e.isBoss,
      });
      const p = this.showPlate(e, "guard", text, impact, total);
      e.guardPlateId = p.id;
      e.guardWindowStart = t;
      this.emit({
        type: "GuardWordShown",
        tick: t,
        enemyId: e.id,
        plateId: p.id,
        text,
        impactTick: impact,
        spanTicks: total,
      });
    }
    if (frac >= 1) {
      // impact
      const gp = e.guardPlateId === null ? undefined : this.plates.get(e.guardPlateId);
      const dmg = e.isBoss ? 22 : 12;
      if (
        e.guardPlateId !== null &&
        !this.plates.has(e.guardPlateId) &&
        this.guardResult.has(e.id)
      ) {
        const res = this.guardResult.get(e.id);
        this.guardResult.delete(e.id);
        if (res === "parry") {
          this.emit({ type: "GuardParried", tick: this.tick, enemyId: e.id, counterDamage: 26 });
          this.emit({
            type: "EnemyAttack",
            tick: this.tick,
            enemyId: e.id,
            outcome: "parried",
            damage: 0,
          });
          this.hit(e, 26, "counter", { crit: false });
        } else {
          this.emit({ type: "GuardBlocked", tick: this.tick, enemyId: e.id, damage: dmg });
          this.emit({
            type: "EnemyAttack",
            tick: this.tick,
            enemyId: e.id,
            outcome: "blocked",
            damage: dmg,
          });
        }
      } else {
        if (gp) this.removePlate(gp, "expired");
        if (this.barrier > 0) {
          this.barrier--;
          this.emit({
            type: "EnemyAttack",
            tick: this.tick,
            enemyId: e.id,
            outcome: "barrier",
            damage: 0,
          });
        } else {
          this.emit({
            type: "EnemyAttack",
            tick: this.tick,
            enemyId: e.id,
            outcome: "hit",
            damage: dmg,
          });
          this.heroHp = Math.max(0, this.heroHp - dmg);
          this.emit({
            type: "HeroDamaged",
            tick: this.tick,
            sourceId: e.id,
            cause: "attack",
            damage: dmg,
            hpAfter: this.heroHp,
            maxHp: this.heroMax,
            blocked: false,
          });
          if (this.heroHp <= 20) {
            this.heroHp = this.heroMax;
            this.emit({
              type: "HeroHealed",
              tick: this.tick,
              cause: "revive",
              amount: this.heroMax - 20,
              hpAfter: this.heroHp,
              maxHp: this.heroMax,
            });
          }
        }
      }
      e.guardPlateId = null;
      e.cycleStart = this.tick;
    }
  }
  private guardResult = new Map<number, "block" | "parry">();

  // ------------------------------------------------------------ typing

  private pressKey(): void {
    const t = this.tick;
    // guard plates take priority after a short reaction delay
    let plate: MPlate | undefined = this.target === null ? undefined : this.plates.get(this.target);
    const urgent = [...this.plates.values()]
      .filter((p) => p.kind === "guard" && t - p.shownTick >= 22)
      .sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0))[0];
    if (urgent && plate?.id !== urgent.id) plate = urgent;
    if (!plate) {
      const e = this.live().find((x) => x.plateId !== null && this.plates.has(x.plateId));
      plate = e && e.plateId !== null ? this.plates.get(e.plateId) : undefined;
    }
    if (!plate) return;
    if (this.target !== plate.id) {
      if (this.target !== null) {
        const old = this.plates.get(this.target);
        this.emit({
          type: "TargetDropped",
          tick: t,
          plateId: this.target,
          ownerId: old?.ownerId ?? null,
          reason: "plateChanged",
        });
      }
      this.target = plate.id;
      this.emit({ type: "TargetAcquired", tick: t, plateId: plate.id, ownerId: plate.ownerId });
      if (plate.ownerId !== null && plate.kind !== "guard") this.focus = plate.ownerId;
    }
    this.keyTicks.push(t);
    const idx = plate.typed;
    const expected = plate.text[idx] ?? "";
    if (this.rng() < this.typoRate) {
      const wrong = String.fromCharCode(97 + Math.floor(this.rng() * 26));
      const before = this.keyStreak;
      const comboBefore = this.combo;
      this.typos++;
      plate.hadTypo = true;
      plate.lastTypoTick = t;
      const oldTier = ksTier(this.keyStreak);
      this.keyStreak = 0;
      this.combo = Math.floor(this.combo / 2);
      this.emit({
        type: "Typo",
        tick: t,
        plateId: plate.id,
        ownerId: plate.ownerId,
        kind: plate.kind,
        index: idx,
        expected,
        got: wrong === expected ? "q" : wrong,
        comboBefore,
        combo: this.combo,
        keyStreakBefore: before,
        penalty: "halved",
      });
      if (oldTier !== 0)
        this.emit({ type: "KeyStreakTierChanged", tick: t, from: oldTier, to: 0, keyStreak: 0 });
      return;
    }
    this.correct++;
    const oldTier = ksTier(this.keyStreak);
    this.keyStreak++;
    const newTier = ksTier(this.keyStreak);
    plate.typed++;
    const isLast = plate.typed >= plate.text.length;
    const gain = this.opts.scenario === "cave" ? 0.07 : 0.035;
    this.atb = Math.min(1, this.atb + gain);
    this.emit({
      type: "CharCorrect",
      tick: t,
      plateId: plate.id,
      ownerId: plate.ownerId,
      kind: plate.kind,
      index: idx,
      char: expected,
      isLast,
      combo: this.combo,
      comboTier: cbTier(this.combo),
      keyStreak: this.keyStreak,
      keyStreakTier: newTier,
      atbGainM: Math.round(gain * 1000),
    });
    if (newTier !== oldTier)
      this.emit({
        type: "KeyStreakTierChanged",
        tick: t,
        from: oldTier,
        to: newTier,
        keyStreak: this.keyStreak,
      });
    if (plate.text[plate.typed] === " " && !isLast) {
      // sentence word boundary: auto-advance over the space
      const words = plate.text.slice(0, plate.typed).split(" ").length;
      this.emit({
        type: "SentenceWordDone",
        tick: t,
        plateId: plate.id,
        kind: plate.kind,
        wordIndex: words - 1,
        wordCount: plate.text.split(" ").length,
      });
      plate.typed++;
    }
    if (isLast) this.completePlate(plate);
  }
  private focus: number | null = null;

  private completePlate(p: MPlate): void {
    const t = this.tick;
    const owner = this.enemies.find((e) => e.id === p.ownerId);
    const perfect = !p.hadTypo;
    const oldCombo = cbTier(this.combo);
    this.combo = perfect ? this.combo + 1 : 0;
    const swift = this.cps > 5.5;
    this.emit({
      type: "WordCompleted",
      tick: t,
      plateId: p.id,
      ownerId: p.ownerId,
      kind: p.kind,
      text: p.text,
      wordKey: p.text,
      perfect,
      swift,
      atbGainM: 100,
      combo: this.combo,
    });
    if (cbTier(this.combo) !== oldCombo)
      this.emit({
        type: "ComboTierChanged",
        tick: t,
        from: oldCombo,
        to: cbTier(this.combo),
        combo: this.combo,
      });
    this.removePlate(p, "completed");
    this.skillCharge[0] = (this.skillCharge[0] ?? 0) + 0.1;
    this.skillCharge[1] = (this.skillCharge[1] ?? 0) + 0.07;
    this.atb = Math.min(1, this.atb + 0.1);
    if (!owner) return;
    if (p.kind === "guard") {
      this.emit({
        type: "GuardWordTyped",
        tick: t,
        enemyId: owner.id,
        plateId: p.id,
        perfect,
        result: perfect ? "parry" : "block",
      });
      this.guardResult.set(owner.id, perfect ? "parry" : "block");
      return;
    }
    owner.plateId = null;
    owner.nextPlateAt = t + 35;
    const sentence = owner.isBoss;
    this.hit(owner, sentence ? 40 : 14, sentence ? "finisher" : "chip", { crit: false });
  }

  // ------------------------------------------------------------ combat

  private pickTarget(): MEnemy | undefined {
    return this.live().find((e) => e.id === this.focus) ?? this.live()[0];
  }

  private autoAttack(): void {
    const t = this.tick;
    const e = this.pickTarget();
    if (!e) return;
    this.atb = 0;
    this.autoCount++;
    const crit =
      this.opts.scenario === "cave" ? this.autoCount % 2 === 1 : this.autoCount % 4 === 0;
    this.emit({ type: "AtbFilled", tick: t, overflowM: 0 });
    this.emit({
      type: "AutoAttack",
      tick: t,
      targetId: e.id,
      archetype: "sword",
      hits: 1,
      impactTick: t + 12,
      crit,
    });
    this.hit(e, crit ? 58 : 32, "auto", { crit, type: "slash" });
  }

  private castSkill(slot: 0 | 1): void {
    const t = this.tick;
    const e = this.pickTarget();
    this.skillReady[slot] = false;
    this.skillCharge[slot] = 0;
    if (slot === 1) {
      this.barrier = 1;
      this.emit({
        type: "SkillCast",
        tick: t,
        slot,
        skillId: "aegis",
        targetIds: [],
        impactTick: t + 10,
      });
      return;
    }
    if (!e) return;
    this.emit({
      type: "SkillCast",
      tick: t,
      slot,
      skillId: "fireball",
      targetIds: [e.id],
      impactTick: t + 20,
    });
    this.hit(e, 64, "skill", { crit: false, type: "fire", skillId: "fireball" });
  }

  private hit(
    e: MEnemy,
    dmgIn: number,
    kind: "auto" | "chip" | "skill" | "counter" | "finisher",
    o: { crit: boolean; type?: DamageType; skillId?: "fireball" },
  ): void {
    const t = this.tick;
    if (!e.alive) return;
    const wk = o.type ? e.weak.find((w) => w.type === o.type) : undefined;
    const weak = !!wk;
    let dmg = dmgIn;
    if (e.brokenUntil > 0) dmg = Math.round(dmg * 1.5);
    let brokeNow = false;
    if (weak && e.shield > 0 && e.brokenUntil === 0) {
      if (wk && !wk.revealed) {
        wk.revealed = true;
        this.emit({ type: "WeaknessRevealed", tick: t, enemyId: e.id, damageType: wk.type });
      }
      e.shield--;
      this.emit({
        type: "ShieldDamaged",
        tick: t,
        enemyId: e.id,
        shield: e.shield,
        shieldMax: e.shieldMax,
      });
      if (e.shield === 0) brokeNow = true;
    }
    e.hp = Math.max(0, e.hp - dmg);
    const killed = e.hp === 0;
    this.emit({
      type: "Hit",
      tick: t,
      sourceId: 0,
      targetId: e.id,
      kind,
      origin:
        kind === "skill"
          ? "skill"
          : kind === "chip"
            ? "chip"
            : kind === "counter"
              ? "counter"
              : kind === "finisher"
                ? "finisher"
                : "weapon",
      skillId: o.skillId ?? null,
      damageType: o.type ?? null,
      damage: dmg,
      damageM: dmg * 1000,
      hpAfter: e.hp,
      maxHp: e.maxHp,
      crit: o.crit,
      weak,
      broken: brokeNow,
      atbKnockback: false,
      hitIndex: 0,
      hitCount: 1,
      killed,
    });
    if (brokeNow) {
      e.brokenUntil = t + 180;
      this.emit({ type: "Break", tick: t, enemyId: e.id, untilTick: e.brokenUntil });
      const gp = e.guardPlateId === null ? undefined : this.plates.get(e.guardPlateId);
      if (gp) this.removePlate(gp, "phaseEnded");
      e.guardPlateId = null;
    }
    if (e.isBoss && !killed) {
      const frac = e.hp / e.maxHp;
      const np: 1 | 2 | 3 = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
      if (np !== e.phase) {
        this.emit({
          type: "BossPhaseChanged",
          tick: t,
          enemyId: e.id,
          from: e.phase,
          to: np,
          breatherUntilTick: t + 120,
        });
        e.phase = np;
      }
    }
    if (killed) {
      e.alive = false;
      this.emit({
        type: "EnemyDeath",
        tick: t,
        enemyId: e.id,
        defId: e.defId,
        isBoss: e.isBoss,
        byKind: kind,
      });
      for (const p of [...this.plates.values()])
        if (p.ownerId === e.id) this.removePlate(p, "ownerDied");
      this.gold += e.isBoss ? 200 : 25;
      this.emit({
        type: "GoldGained",
        tick: t,
        amount: e.isBoss ? 200 : 25,
        source: "encounter",
        total: this.gold,
      });
      if (this.focus === e.id) this.focus = null;
    }
  }

  // ------------------------------------------------------------ view

  /** Stress scenario: one plate of every look (guard, doom, finisher, fading, scrambled). */
  private stressPlates(t: number): PlateView[] {
    const mk = (
      id: number,
      owner: number,
      kind: PlateKind,
      text: string,
      o: Partial<PlateView> = {},
    ): PlateView => ({
      id,
      ownerId: owner,
      kind,
      text,
      display: text,
      typedIndex: 0,
      isTarget: false,
      faded: false,
      hadTypo: false,
      lastTypoTick: null,
      lane: null,
      expiresAtTick: null,
      totalTicks: null,
      ...o,
    });
    const cyc = 300;
    const left = cyc - (t % cyc);
    return [
      mk(1001, 1, "guard", "shield", { typedIndex: 2, expiresAtTick: t + left, totalTicks: cyc }),
      mk(1002, 3, "doom", "obliterate", {
        typedIndex: 3,
        expiresAtTick: t + left,
        totalTicks: cyc,
      }),
      mk(1003, 2, "finisher", "finish", { typedIndex: 1 }),
      mk(1004, 3, "word", "vanish", { typedIndex: 2, faded: true }),
      mk(1005, 1, "word", "garble", { display: "bglroe" }),
    ];
  }

  private buildView(): LevelView {
    const t = this.tick;
    const enemies: EnemyView[] = this.enemies.map((e) => {
      const gp = e.guardPlateId === null ? undefined : this.plates.get(e.guardPlateId);
      return {
        id: e.id,
        defId: e.defId,
        slot: e.slot,
        isBoss: e.isBoss,
        alive: e.alive,
        hp: e.hp,
        maxHp: e.maxHp,
        hpFrac: e.hp / e.maxHp,
        atbFrac: e.brokenUntil > 0 ? 0 : Math.min(1, Math.max(0, (t - e.cycleStart) / e.cycle)),
        plateId: e.plateId,
        isGuard: !!gp,
        guardTicksLeft: gp?.expiresAt ? Math.max(0, gp.expiresAt - t) : 0,
        guardTotalTicks: gp?.total ?? 0,
        guardResult: null,
        shield: e.shield,
        shieldMax: e.shieldMax,
        weaknesses: e.weak.map((w) => ({ ...w })),
        brokenTicksLeft: Math.max(0, e.brokenUntil - t),
        statuses: [],
        isFocus: this.focus === e.id,
        pose: e.alive ? "idle" : "dead",
        poseSinceTick: 0,
      };
    });
    const plates: PlateView[] = [...this.plates.values()].map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      kind: p.kind,
      text: p.text,
      display: p.scrambled ?? p.text,
      typedIndex: p.typed,
      isTarget: p.id === this.target,
      faded: p.faded,
      hadTypo: p.hadTypo,
      lastTypoTick: p.lastTypoTick,
      lane: null,
      expiresAtTick: p.expiresAt,
      totalTicks: p.total,
    }));
    if (this.opts.scenario === "stress") plates.push(...this.stressPlates(t));
    const skills: SkillView[] = [0, 1].map((i) => ({
      slot: i as 0 | 1,
      id: i === 0 ? "fireball" : "aegis",
      chargeFrac: Math.min(1, this.skillCharge[i] ?? 0),
      ready: !!this.skillReady[i],
      mode: "smart",
    }));
    const boss = this.enemies.find((e) => e.isBoss && e.alive);
    const secs = Math.max(1, t - 0) / 60;
    const wpm = (this.keyTicks.length / 5) * (60 / Math.min(5, secs));
    const total = this.correct + this.typos;
    return {
      tick: t,
      phase: this.phase,
      phaseProgress:
        this.phase === "combat" ? 1 : Math.min(1, Math.max(0, 1 - (this.phaseEnd - t) / 150)),
      levelId: `mock-${this.opts.scenario}`,
      chapter: 1,
      isBossLevel: this.opts.scenario === "boss",
      encounterIndex: this.opts.scenario === "cave" ? 1 : this.opts.scenario === "boss" ? 2 : 0,
      encounterCount: 3,
      waveIndex: this.wave - 1,
      hero: {
        hp: this.heroHp,
        maxHp: this.heroMax,
        hpFrac: this.heroHp / this.heroMax,
        atbFrac: this.atb,
        archetype: "sword",
        weaponDamageType: "slash",
        barrierCharges: this.barrier,
        statuses: [],
        secondWindAvailable: true,
        pose: "idle",
        poseSinceTick: 0,
      },
      enemies,
      plates,
      targetPlateId: this.target,
      focusEnemyId: this.focus,
      combo: this.combo,
      comboTier: cbTier(this.combo),
      comboMult: 1 + Math.floor(this.combo / 5) * 0.1,
      comboMode: "gentle",
      keyStreak: this.keyStreak,
      keyStreakTier: ksTier(this.keyStreak),
      skills,
      passives: [],
      boss: boss
        ? {
            enemyId: boss.id,
            name: boss.name,
            title: boss.title,
            phase: boss.phase,
            gateHpFrac: boss.phase < 3 ? (boss.phase === 1 ? 0.66 : 0.33) : null,
          }
        : null,
      doom: null,
      minigame: null,
      secondWind: null,
      stats: {
        netWpm: wpm,
        accuracy: total === 0 ? 10000 : Math.round((this.correct / total) * 10000),
        burstWpm: wpm,
        elapsedTicks: t,
        activeTicks: t,
      },
      goldCollected: this.gold,
    };
  }
}
