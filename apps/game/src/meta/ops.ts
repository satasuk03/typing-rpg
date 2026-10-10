/**
 * Pure save mutations (T3.2). Every function takes a SaveBlob and returns a new one; nothing here touches the DOM,
 * the network or a clock (callers pass `nowMs` and `today`). `SaveStore` (save.ts) is the single owner that persists
 * the result through `net.sync.setLocal`.
 */
import {
  type ContentBundle,
  contentBundle,
  type GearDef,
  type GearSlot,
  type Rarity,
  type WeaponArchetype,
} from "@hd2d/content";
import type { SaveBlob } from "@hd2d/shared";
import {
  applyLevelUnlocks,
  buildLoadout,
  type ChestContents,
  cacheGoldPrice,
  computeHeroStats,
  computePace,
  deriveRng,
  evaluateStars,
  type GearRoll,
  type LevelResult,
  type Loadout,
  levelGold,
  median7dAccuracyBp,
  NEW_PITY,
  NEW_SRS,
  parLoadout,
  type ResolvedLevel,
  type RngState,
  recordReplay,
  replayGoldMultBp,
  replaysToday,
  rollCache,
  type ShopOffer,
  salvageValue,
  shopOffer,
  srsUpdate,
  starGold,
  transferUpgrade,
  upgradeCap,
  upgradeCost,
} from "@hd2d/sim";

export type Save = SaveBlob;
export type GearInstance = SaveBlob["inventory"]["gear"][number];

/** Local calendar day key "YYYY-MM-DD" (the client may read a clock; the sim may not). */
export function dayKey(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const clone = (s: Save): Save => structuredClone(s);

// ------------------------------------------------------------------------------------------------ new save

export const DEFAULT_VOLUMES = {
  master: 0.8,
  sfx: 0.9,
  ambience: 0.6,
  music: 0.5,
  ui: 0.8,
} as const;

/** A fresh profile: par Chapter 1 gear (Common, +0), the starter skills, default settings. */
export function newSave(nowMs: number, seed: number, bundle: ContentBundle = contentBundle): Save {
  const par = parLoadout(1);
  const gear: GearInstance[] = [
    { uid: 1, defId: "sword-t1", rarity: par.weapon.rarity, upgrade: par.weapon.upgrade },
    { uid: 2, defId: "armor-t1", rarity: par.armor.rarity, upgrade: par.armor.upgrade },
    { uid: 3, defId: "charm-t1", rarity: par.charm.rarity, upgrade: par.charm.upgrade },
  ];
  const actives = bundle.actives.filter((a) => a.unlockLevel === undefined).map((a) => a.id);
  const passives = bundle.passives.filter((p) => p.unlockLevel === undefined).map((p) => p.id);
  return {
    schemaVersion: 2,
    resetEpoch: 0,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    playtimeSec: 0,
    settings: {
      comboMode: "gentle",
      difficulty: "standard",
      caseMode: "auto",
      autoUnlock: false,
      effectsIntensity: 1,
      reducedMotion: false,
      reducedFlash: false,
      volumes: { ...DEFAULT_VOLUMES },
      translationLang: null,
      caseAssist: false,
    },
    progress: { frontierChapter: 1, levels: {}, starChestsClaimed: {} },
    pace: { calibrationWpm: null, recentNetWpm: [] },
    accuracyDaily: [],
    wallet: { gold: 0 },
    inventory: { gear, nextGearUid: 4, unopenedCaches: 0 },
    equipped: { weapon: 1, armor: 2, charm: 3 },
    loadout: {
      actives: [actives[0] ?? null, actives[1] ?? null],
      activeModes: ["smart", "smart"],
      passives: [passives[0] ?? null, passives[1] ?? null, passives[2] ?? null],
    },
    unlocks: { actives, passives },
    cachePity: { ...NEW_PITY },
    metaRng: deriveRng(seed >>> 0, "meta") as [number, number, number, number],
    srs: structuredClone(NEW_SRS),
    journal: { firstSeen: {}, notes: {} },
    replays: { day: "", count: 0 },
    lifetime: { words: 0, chars: 0, typos: 0 },
  };
}

// ------------------------------------------------------------------------------------------------ lookups

export const gearDef = (
  defId: string,
  bundle: ContentBundle = contentBundle,
): GearDef | undefined => bundle.gear.find((g) => g.id === defId);

export function instanceOf(save: Save, uid: number): GearInstance | undefined {
  return save.inventory.gear.find((g) => g.uid === uid);
}

/** The content def that a rolled piece (slot, tier, archetype) maps to; falls back to the lowest tier. */
export function defForRoll(roll: GearRoll, bundle: ContentBundle = contentBundle): GearDef {
  const match = (tier: number): GearDef | undefined =>
    bundle.gear.find(
      (g) =>
        g.slot === roll.slot &&
        g.tier === tier &&
        (roll.slot !== "weapon" || g.archetype === roll.archetype),
    );
  for (let t = roll.tier; t >= 1; t--) {
    const d = match(t);
    if (d) return d;
  }
  const any = bundle.gear.find((g) => g.slot === roll.slot);
  if (!any) throw new Error(`no gear def for ${roll.slot}`);
  return any;
}

export const equippedArchetype = (
  save: Save,
  bundle: ContentBundle = contentBundle,
): WeaponArchetype =>
  gearDef(instanceOf(save, save.equipped.weapon)?.defId ?? "", bundle)?.archetype ?? "sword";

export const slotOf = (inst: GearInstance, bundle: ContentBundle = contentBundle): GearSlot => {
  const d = gearDef(inst.defId, bundle);
  if (!d) throw new Error(`unknown gear ${inst.defId}`);
  return d.slot;
};

export const loadoutOf = (save: Save, bundle: ContentBundle = contentBundle): Loadout =>
  buildLoadout(save, bundle);

export function heroStatsOf(
  save: Save,
  bundle: ContentBundle = contentBundle,
): { atk: number; maxHp: number } {
  const s = computeHeroStats(loadoutOf(save, bundle));
  return { atk: s.atk / 1000, maxHp: s.maxHp / 1000 };
}

/** Hero stats if `uid` were equipped in its slot. */
export function heroStatsWith(
  save: Save,
  uid: number,
  bundle: ContentBundle = contentBundle,
): { atk: number; maxHp: number } {
  const inst = instanceOf(save, uid);
  if (!inst) return heroStatsOf(save, bundle);
  const slot = slotOf(inst, bundle);
  return heroStatsOf({ ...save, equipped: { ...save.equipped, [slot]: uid } }, bundle);
}

/** Whole gold invested in upgrade levels 0..upgrade-1 of a tier. */
export function upgradeInvested(tier: number, upgrade: number): number {
  let g = 0;
  for (let l = 0; l < upgrade; l++) g += upgradeCost(tier, l);
  return g;
}

/** Gold returned when a piece is replaced: half of the invested upgrade gold is lost to the transfer (UPG_TRANSFER 50%). */
export function replaceSalvage(inst: GearInstance, bundle: ContentBundle = contentBundle): number {
  const d = gearDef(inst.defId, bundle);
  if (!d) return 0;
  const invested = upgradeInvested(d.tier, inst.upgrade);
  return salvageValue(
    { slot: d.slot, tier: d.tier, rarity: inst.rarity, upgrade: inst.upgrade },
    { fromChestUnwanted: false, nonTransferredUpgradeGold: invested - Math.floor(invested / 2) },
  );
}

export function dropSalvage(inst: GearInstance, bundle: ContentBundle = contentBundle): number {
  const d = gearDef(inst.defId, bundle);
  if (!d) return 0;
  return salvageValue(
    { slot: d.slot, tier: d.tier, rarity: inst.rarity, upgrade: inst.upgrade },
    { fromChestUnwanted: true, nonTransferredUpgradeGold: 0 },
  );
}

// ------------------------------------------------------------------------------------------------ level results

export interface LevelCommit {
  firstClear: boolean;
  stars: [boolean, boolean, boolean];
  newStars: number;
  /** Total gold added to the wallet by this attempt. */
  gold: number;
  starGold: number;
  chestGold: number;
  chests: ChestContents[];
  gearGained: { uid: number; defId: string; rarity: Rarity }[];
  cachesGained: number;
  unlocked: { actives: string[]; passives: string[] };
  /** wordKeys met for the first time in this save (before this commit). */
  newWordKeys: string[];
}

export interface CommitCtx {
  def: ResolvedLevel;
  pace: number;
  today: string;
  nowMs: number;
  bundle?: ContentBundle;
}

/** The gold multiplier a level attempt is paid with: 100% on first clear, else the replay rules (day key from the caller). */
export function goldMultFor(
  save: Save,
  levelId: string,
  today: string,
  bundle: ContentBundle = contentBundle,
): { firstClear: boolean; goldMultBp: number } {
  const lv = bundle.levels.find((l) => l.id === levelId);
  const firstClear = !(save.progress.levels[levelId]?.cleared ?? false);
  if (!lv) return { firstClear, goldMultBp: 10_000 };
  return {
    firstClear,
    goldMultBp: replayGoldMultBp({
      firstClear,
      chapter: lv.chapter,
      frontierChapter: save.progress.frontierChapter,
      replaysToday: replaysToday(save.replays, today),
    }),
  };
}

/** Stars a result earns for this save (median of the last 7 days of accuracy, difficulty aware). */
export function starsOf(
  save: Save,
  result: LevelResult,
  def: ResolvedLevel,
  pace: number,
  today: string,
): [boolean, boolean, boolean] {
  return evaluateStars({
    result,
    star3: def.star3,
    parRefTicks: def.parRefTicks,
    pace,
    median7dAccuracyBp: median7dAccuracyBp(save.accuracyDaily, today),
    difficulty: save.settings.difficulty,
  });
}

/** Applies one finished level attempt. Returns the new save and a summary for the results screen. */
export function applyLevelResult(
  save: Save,
  result: LevelResult,
  ctx: CommitCtx,
): { save: Save; summary: LevelCommit } {
  const bundle = ctx.bundle ?? contentBundle;
  const s = clone(save);
  const lv = bundle.levels.find((l) => l.id === result.levelId);
  const cleared = result.outcome === "cleared";
  const prev = s.progress.levels[result.levelId] ?? {
    cleared: false,
    stars: [false, false, false] as [boolean, boolean, boolean],
    bestTicks: null,
    attempts: 0,
  };
  const firstClear = cleared && !prev.cleared;
  const stars = starsOf(save, result, ctx.def, ctx.pace, ctx.today);
  const merged: [boolean, boolean, boolean] = [
    prev.stars[0] || stars[0],
    prev.stars[1] || stars[1],
    prev.stars[2] || stars[2],
  ];
  const count = (a: readonly boolean[]): number => a.filter(Boolean).length;
  const newStars = cleared ? count(merged) - count(prev.stars) : 0;

  // ---- rewards
  let gold = result.gold;
  const chests = cleared ? result.chests : [];
  const chestGold = chests.reduce((a, c) => a + c.gold, 0);
  const sg = cleared && lv ? starGold(newStars, levelGold(lv.chapter, lv.index)) : 0;
  gold += chestGold + sg;
  s.wallet.gold += gold;

  const gearGained: LevelCommit["gearGained"] = [];
  let cachesGained = 0;
  for (const c of chests) {
    cachesGained += c.caches;
    if (c.gear) {
      const def = defForRoll(c.gear, bundle);
      const uid = s.inventory.nextGearUid++;
      s.inventory.gear.push({ uid, defId: def.id, rarity: c.gear.rarity, upgrade: 0 });
      gearGained.push({ uid, defId: def.id, rarity: c.gear.rarity });
    }
  }
  s.inventory.unopenedCaches += cachesGained;

  // ---- unlocks (first clear only)
  const un = applyLevelUnlocks(bundle, result.levelId, firstClear, s.unlocks);
  s.unlocks = un.unlocks;

  // ---- words: journal, SRS, lifetime
  const newWordKeys: string[] = [];
  const before = s.srs.levelsPlayed;
  for (const w of result.words) {
    if (w.kind !== "word") continue;
    if (s.journal.firstSeen[w.wordKey] === undefined) {
      s.journal.firstSeen[w.wordKey] = before;
      newWordKeys.push(w.wordKey);
    }
  }
  if (result.words.length > 0) s.srs = srsUpdate(s.srs, result.words, ctx.pace);
  s.lifetime.words += result.stats.wordsCompleted;
  s.lifetime.chars += result.stats.correctChars;
  s.lifetime.typos += result.stats.typos;

  // ---- progress
  s.progress.levels[result.levelId] = {
    cleared: prev.cleared || cleared,
    stars: merged,
    bestTicks: cleared
      ? Math.min(prev.bestTicks ?? Number.MAX_SAFE_INTEGER, result.durationTicks)
      : prev.bestTicks,
    attempts: prev.attempts + 1,
  };
  if (cleared) {
    s.pace.recentNetWpm = [...s.pace.recentNetWpm, Math.round(result.stats.netWpmX100 / 100)].slice(
      -10,
    );
    const acc = result.stats.accuracyBp;
    const day = s.accuracyDaily.find((d) => d.day === ctx.today);
    if (day) day.accuracyBp = Math.max(day.accuracyBp, acc);
    else s.accuracyDaily = [...s.accuracyDaily, { day: ctx.today, accuracyBp: acc }].slice(-14);
    if (!firstClear) s.replays = recordReplay(s.replays, ctx.today);
  }
  s.playtimeSec += Math.round(result.durationTicks / 60);
  s.updatedAtMs = ctx.nowMs;

  return {
    save: s,
    summary: {
      firstClear,
      stars,
      newStars,
      gold,
      starGold: sg,
      chestGold,
      chests,
      gearGained,
      cachesGained,
      unlocked: un.added,
      newWordKeys,
    },
  };
}

// ------------------------------------------------------------------------------------------------ caches

export interface CacheOpen {
  uid: number;
  defId: string;
  roll: GearRoll;
  guaranteed: "none" | "rare" | "epic" | "legendary";
}

export const cachePrice = (save: Save): number => cacheGoldPrice(save.progress.frontierChapter);

export function buyCache(save: Save, nowMs: number): Save | null {
  const price = cachePrice(save);
  if (save.wallet.gold < price) return null;
  const s = clone(save);
  s.wallet.gold -= price;
  s.inventory.unopenedCaches += 1;
  s.updatedAtMs = nowMs;
  return s;
}

/** Opens one cache with the save's pity and `metaRng`; the new piece joins the inventory unequipped. */
export function openCache(
  save: Save,
  nowMs: number,
  bundle: ContentBundle = contentBundle,
): { save: Save; open: CacheOpen } | null {
  if (save.inventory.unopenedCaches <= 0) return null;
  const s = clone(save);
  const rng = [...s.metaRng] as RngState;
  const r = rollCache(rng, s.cachePity, {
    frontierChapter: s.progress.frontierChapter,
    equippedArchetype: equippedArchetype(save, bundle),
  });
  const def = defForRoll(r.roll, bundle);
  const uid = s.inventory.nextGearUid++;
  s.inventory.gear.push({ uid, defId: def.id, rarity: r.roll.rarity, upgrade: 0 });
  s.inventory.unopenedCaches -= 1;
  s.cachePity = { ...r.pity };
  s.metaRng = rng as [number, number, number, number];
  s.updatedAtMs = nowMs;
  return {
    save: s,
    open: {
      uid,
      defId: def.id,
      roll: r.roll,
      guaranteed: r.event.type === "CacheRolled" ? r.event.guaranteed : "none",
    },
  };
}

// ------------------------------------------------------------------------------------------------ gear

export function equip(save: Save, uid: number, nowMs: number): Save | null {
  const inst = instanceOf(save, uid);
  if (!inst) return null;
  const s = clone(save);
  s.equipped[slotOf(inst)] = uid;
  s.updatedAtMs = nowMs;
  return s;
}

export function upgradeGear(save: Save, uid: number, nowMs: number): Save | null {
  const inst = instanceOf(save, uid);
  const def = inst && gearDef(inst.defId);
  if (!inst || !def) return null;
  if (inst.upgrade >= upgradeCap(inst.rarity)) return null;
  const cost = upgradeCost(def.tier, inst.upgrade);
  if (save.wallet.gold < cost) return null;
  const s = clone(save);
  s.wallet.gold -= cost;
  const t = instanceOf(s, uid) as GearInstance;
  t.upgrade += 1;
  s.updatedAtMs = nowMs;
  return s;
}

export interface TransferPreview {
  newUpgrade: number;
  capped: boolean;
  salvageGold: number;
  /** Upgrade levels of the old piece (it is salvaged). */
  oldUpgrade: number;
}

/** Upgrade Transfer: the new piece inherits half the old piece's levels (capped by its rarity); the old one is salvaged. */
export function previewTransfer(
  save: Save,
  newUid: number,
  oldUid: number,
): TransferPreview | null {
  const n = instanceOf(save, newUid);
  const o = instanceOf(save, oldUid);
  if (!n || !o) return null;
  const t = transferUpgrade(o.upgrade, n.rarity);
  return {
    newUpgrade: Math.max(n.upgrade, t),
    capped: Math.floor(o.upgrade / 2) > t,
    salvageGold: replaceSalvage(o),
    oldUpgrade: o.upgrade,
  };
}

/** Equip `newUid` in place of the equipped piece of its slot with Upgrade Transfer; the old piece is salvaged for gold. */
export function replaceWithTransfer(save: Save, newUid: number, nowMs: number): Save | null {
  const n = instanceOf(save, newUid);
  if (!n) return null;
  const slot = slotOf(n);
  const oldUid = save.equipped[slot];
  if (oldUid === newUid) return null;
  const pv = previewTransfer(save, newUid, oldUid);
  if (!pv) return null;
  const s = clone(save);
  (instanceOf(s, newUid) as GearInstance).upgrade = pv.newUpgrade;
  s.wallet.gold += pv.salvageGold;
  s.inventory.gear = s.inventory.gear.filter((g) => g.uid !== oldUid);
  s.equipped[slot] = newUid;
  s.updatedAtMs = nowMs;
  return s;
}

export function salvagePiece(save: Save, uid: number, nowMs: number): Save | null {
  const inst = instanceOf(save, uid);
  if (!inst) return null;
  if (isEquipped(save, uid)) return null;
  const s = clone(save);
  s.wallet.gold += dropSalvage(inst);
  s.inventory.gear = s.inventory.gear.filter((g) => g.uid !== uid);
  s.updatedAtMs = nowMs;
  return s;
}

export const isEquipped = (save: Save, uid: number): boolean =>
  save.equipped.weapon === uid || save.equipped.armor === uid || save.equipped.charm === uid;

// ------------------------------------------------------------------------------------------------ shop

export function offerFor(save: Save, slot: GearSlot, rarity: "C" | "U" | "R"): ShopOffer {
  const cur = instanceOf(save, save.equipped[slot]);
  return shopOffer(slot, rarity, {
    frontierChapter: save.progress.frontierChapter,
    currentUpgrade: cur?.upgrade ?? 0,
  });
}

/** Buys the deterministic shop piece and equips it in place of the current one (Upgrade Transfer + salvage). */
export function buyShopGear(
  save: Save,
  slot: GearSlot,
  rarity: "C" | "U" | "R",
  archetype: WeaponArchetype | null,
  nowMs: number,
  bundle: ContentBundle = contentBundle,
): Save | null {
  const offer = offerFor(save, slot, rarity);
  if (save.wallet.gold < offer.price) return null;
  const def = defForRoll(
    {
      slot,
      tier: offer.tier,
      rarity,
      archetype: slot === "weapon" ? (archetype ?? equippedArchetype(save, bundle)) : null,
    },
    bundle,
  );
  const s = clone(save);
  const oldUid = s.equipped[slot];
  const old = instanceOf(s, oldUid);
  s.wallet.gold -= offer.price;
  if (old) s.wallet.gold += replaceSalvage(old, bundle);
  const uid = s.inventory.nextGearUid++;
  s.inventory.gear = s.inventory.gear.filter((g) => g.uid !== oldUid);
  s.inventory.gear.push({ uid, defId: def.id, rarity, upgrade: offer.startUpgrade });
  s.equipped[slot] = uid;
  s.updatedAtMs = nowMs;
  return s;
}

// ------------------------------------------------------------------------------------------------ loadout & settings

export function setActive(save: Save, slot: 0 | 1, id: string | null, nowMs: number): Save | null {
  if (id !== null && !save.unlocks.actives.includes(id)) return null;
  const s = clone(save);
  const other = slot === 0 ? 1 : 0;
  if (id !== null && s.loadout.actives[other] === id)
    s.loadout.actives[other] = s.loadout.actives[slot];
  s.loadout.actives[slot] = id;
  s.updatedAtMs = nowMs;
  return s;
}

export function setActiveMode(
  save: Save,
  slot: 0 | 1,
  mode: "smart" | "asap",
  nowMs: number,
): Save {
  const s = clone(save);
  s.loadout.activeModes[slot] = mode;
  s.updatedAtMs = nowMs;
  return s;
}

export function setPassive(
  save: Save,
  slot: 0 | 1 | 2,
  id: string | null,
  nowMs: number,
): Save | null {
  if (id !== null && !save.unlocks.passives.includes(id)) return null;
  const s = clone(save);
  if (id !== null) {
    const at = s.loadout.passives.indexOf(id);
    if (at >= 0 && at !== slot) s.loadout.passives[at] = s.loadout.passives[slot] ?? null;
  }
  s.loadout.passives[slot] = id;
  s.updatedAtMs = nowMs;
  return s;
}

export function patchSettings(
  save: Save,
  patch: Partial<Omit<Save["settings"], "volumes">> & {
    volumes?: Partial<Save["settings"]["volumes"]>;
  },
  nowMs: number,
): Save {
  const s = clone(save);
  const { volumes, ...rest } = patch;
  s.settings = { ...s.settings, ...rest, volumes: { ...s.settings.volumes, ...(volumes ?? {}) } };
  s.updatedAtMs = nowMs;
  return s;
}

/**
 * First-run calibration (T3.3): stores the measured WPM, clamped to PACE_MIN..PACE_MAX (computePace does the clamp).
 * It is the initial pace; once a level has been played the median of the recent levels takes over.
 */
export function setCalibration(save: Save, wpm: number, nowMs: number): Save {
  const s = clone(save);
  s.pace = { ...s.pace, calibrationWpm: computePace([], Math.round(wpm)) };
  s.updatedAtMs = nowMs;
  return s;
}

/** A brand-new profile that has not played or calibrated yet: the first-run flow applies. */
export const isFirstRun = (save: Save): boolean =>
  !hasProgress(save) && save.pace.calibrationWpm === null;

// ------------------------------------------------------------------------------------------------ queries

export const levelUnlocked = (save: Save, bundle: ContentBundle, levelId: string): boolean => {
  const i = bundle.levels.findIndex((l) => l.id === levelId);
  if (i < 0) return false;
  if (i === 0) return true;
  const prev = bundle.levels[i - 1];
  return prev !== undefined && (save.progress.levels[prev.id]?.cleared ?? false);
};

export const totalStars = (save: Save): number =>
  Object.values(save.progress.levels).reduce((a, l) => a + l.stars.filter(Boolean).length, 0);

/** Whether this save has any progress worth continuing. */
export const hasProgress = (save: Save): boolean =>
  Object.keys(save.progress.levels).length > 0 || save.srs.levelsPlayed > 0;
