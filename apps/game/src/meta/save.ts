/**
 * SaveStore: the single owner of the local SaveBlob (T3.2).
 *
 * Every mutation is a pure function from `ops.ts` applied to the in-memory blob, which is then written through
 * `net.sync.setLocal` (IndexedDB now, debounced upload later). Screens never write the blob themselves.
 *
 * Mutation list (each persists immediately):
 *   applyResult (gold, chests -> gear/caches, stars, unlocks, SRS, journal, replay pay, levelsPlayed, pace, accuracy)
 *   openCache (pity + metaRng), buyCache, buyShop, equip, upgrade, replaceWithTransfer, salvage,
 *   setActive, setActiveMode, setPassive, patchSettings, reset (new game).
 */
import {
  type ContentBundle,
  contentBundle,
  type GearSlot,
  type WeaponArchetype,
} from "@hd2d/content";
import { JOURNAL_NOTE_MAX_CHARS, JOURNAL_NOTES_MAX } from "@hd2d/shared";
import { computePace, type LevelOptions, type LevelResult, resolveLevel, srsDue } from "@hd2d/sim";
import { freshSeed } from "../level/config";
import type { RunConfig } from "../level/runner";
import type { Net } from "../net";
import type { CacheOpen, LevelCommit, Save, TransferPreview } from "./ops";
import * as ops from "./ops";

export type SaveListener = (save: Save) => void;

export interface SaveStoreOptions {
  now?: () => number;
  seed?: () => number;
  bundle?: ContentBundle;
}

const SRS_WEAK_PER_LEVEL = 6;

export class SaveStore {
  private cur: Save;
  private readonly listeners = new Set<SaveListener>();
  private chain: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly seed: () => number;
  readonly bundle: ContentBundle;

  private constructor(
    private readonly net: Pick<Net, "sync" | "store">,
    initial: Save,
    o: SaveStoreOptions,
  ) {
    this.cur = initial;
    this.now = o.now ?? (() => Date.now());
    this.seed = o.seed ?? freshSeed;
    this.bundle = o.bundle ?? contentBundle;
  }

  /**
   * Loads the local save (after a bounded attempt to pull the cloud copy), or creates and persists a fresh profile.
   * `syncWaitMs` bounds the boot-time pull so an offline start is never blocked.
   */
  static async open(
    net: Pick<Net, "sync" | "store">,
    o: SaveStoreOptions & { syncWaitMs?: number } = {},
  ): Promise<SaveStore> {
    const wait = o.syncWaitMs ?? 2500;
    if (wait > 0) {
      await Promise.race([
        net.sync.sync().catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, wait)),
      ]);
    }
    const now = o.now ?? (() => Date.now());
    let local = await net.sync.getLocal().catch(() => null);
    let fresh = false;
    if (!local) {
      local = ops.newSave(now(), (o.seed ?? freshSeed)(), o.bundle);
      fresh = true;
    }
    const store = new SaveStore(net, local, o);
    if (fresh) await store.persist();
    await store.importLegacyTranslations();
    return store;
  }

  get save(): Save {
    return this.cur;
  }

  get today(): string {
    return ops.dayKey(new Date(this.now()));
  }

  onChange(fn: SaveListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Resolves when every queued write has reached `net.sync.setLocal`. */
  flush(): Promise<void> {
    return this.chain;
  }

  private persist(): Promise<void> {
    const snapshot = this.cur;
    this.chain = this.chain
      .then(() => this.net.sync.setLocal(snapshot))
      .catch((e) => {
        console.warn("save write failed", e);
      });
    return this.chain;
  }

  private commit(next: Save | null): boolean {
    if (next === null) return false;
    this.cur = next;
    for (const l of this.listeners) l(next);
    void this.persist();
    return true;
  }

  /** Re-reads the local copy (after a background sync adopted the cloud save). Returns true if it changed. */
  async reloadFromLocal(): Promise<boolean> {
    const local = await this.net.sync.getLocal().catch(() => null);
    if (!local || local.updatedAtMs <= this.cur.updatedAtMs) return false;
    this.cur = local;
    for (const l of this.listeners) l(local);
    return true;
  }

  // ---------------------------------------------------------------------------------------- level runs

  /** Pace for the next level: median of the last 10 net WPM, else calibration, else 35. */
  pace(): number {
    return computePace(this.cur.pace.recentNetWpm, this.cur.pace.calibrationWpm);
  }

  /** Builds the RunConfig for a level from the save: equipped gear, loadout, settings, SRS weak words, replay pay. */
  runConfig(levelId: string, opt: { pace?: number; seed?: number } = {}): RunConfig {
    const s = this.cur;
    const def = resolveLevel(this.bundle, levelId, {
      dueWeakWords: srsDue(s.srs, SRS_WEAK_PER_LEVEL),
    });
    const { firstClear, goldMultBp } = ops.goldMultFor(s, levelId, this.today, this.bundle);
    const options: LevelOptions = {
      pace: opt.pace ?? this.pace(),
      difficulty: s.settings.difficulty,
      comboMode: s.settings.comboMode,
      caseMode: s.settings.caseMode,
      autoUnlockAfterTypos: s.settings.autoUnlock ? 3 : 0,
      firstClear,
      frontierChapter: s.progress.frontierChapter,
      goldMultBp,
      allowExternalRevive: false,
      tutorial: def.tutorial,
    };
    return {
      def,
      loadout: ops.loadoutOf(s, this.bundle),
      seed: (opt.seed ?? freshSeed()) >>> 0,
      options,
    };
  }

  /** Applies a finished attempt (always, cleared or failed). */
  applyResult(result: LevelResult, cfg: RunConfig): LevelCommit {
    const { save, summary } = ops.applyLevelResult(this.cur, result, {
      def: cfg.def,
      pace: cfg.options.pace,
      today: this.today,
      nowMs: this.now(),
      bundle: this.bundle,
    });
    this.commit(save);
    return summary;
  }

  // ---------------------------------------------------------------------------------------- caches

  cachePrice(): number {
    return ops.cachePrice(this.cur);
  }

  /** Dev/test only (`?dev=1`): edit a copy of the save and commit it. Never reachable from a screen. */
  devMutate(fn: (s: Save) => void): void {
    const s = structuredClone(this.cur);
    fn(s);
    s.updatedAtMs = this.now();
    this.commit(s);
  }

  buyCache(): boolean {
    return this.commit(ops.buyCache(this.cur, this.now()));
  }

  openCache(): CacheOpen | null {
    const r = ops.openCache(this.cur, this.now(), this.bundle);
    if (!r) return null;
    this.commit(r.save);
    return r.open;
  }

  // ---------------------------------------------------------------------------------------- gear

  buyShop(slot: GearSlot, rarity: "C" | "U" | "R", archetype: WeaponArchetype | null): boolean {
    return this.commit(ops.buyShopGear(this.cur, slot, rarity, archetype, this.now(), this.bundle));
  }
  equip(uid: number): boolean {
    return this.commit(ops.equip(this.cur, uid, this.now()));
  }
  upgrade(uid: number): boolean {
    return this.commit(ops.upgradeGear(this.cur, uid, this.now()));
  }
  replaceWithTransfer(uid: number): boolean {
    return this.commit(ops.replaceWithTransfer(this.cur, uid, this.now()));
  }
  salvage(uid: number): boolean {
    return this.commit(ops.salvagePiece(this.cur, uid, this.now()));
  }
  previewTransfer(newUid: number): TransferPreview | null {
    const n = ops.instanceOf(this.cur, newUid);
    if (!n) return null;
    return ops.previewTransfer(this.cur, newUid, this.cur.equipped[ops.slotOf(n, this.bundle)]);
  }

  // ---------------------------------------------------------------------------------------- loadout / settings

  setActive(slot: 0 | 1, id: string | null): boolean {
    return this.commit(ops.setActive(this.cur, slot, id, this.now()));
  }
  setActiveMode(slot: 0 | 1, mode: "smart" | "asap"): boolean {
    return this.commit(ops.setActiveMode(this.cur, slot, mode, this.now()));
  }
  setPassive(slot: 0 | 1 | 2, id: string | null): boolean {
    return this.commit(ops.setPassive(this.cur, slot, id, this.now()));
  }
  patchSettings(patch: Parameters<typeof ops.patchSettings>[1]): void {
    this.commit(ops.patchSettings(this.cur, patch, this.now()));
  }

  /** First-run calibration result (WPM): the initial pace, clamped. */
  setCalibration(wpm: number): void {
    this.commit(ops.setCalibration(this.cur, wpm, this.now()));
  }

  /**
   * New game: replaces the profile with a fresh one at `resetEpoch + 1`. The merge (`mergeSaves`) lets the higher
   * epoch win wholesale, so the cloud copy (or another device) at the old epoch can never bring old progress back,
   * online or offline; the next sync overwrites the cloud save with the fresh one.
   */
  reset(): void {
    const fresh = ops.newSave(this.now(), this.seed(), this.bundle);
    fresh.resetEpoch = this.cur.resetEpoch + 1;
    fresh.settings = structuredClone(this.cur.settings);
    this.commit(fresh);
  }

  // ---------------------------------------------------------------------------------------- journal notes

  /** Player translations for the Word Journal: `journal.notes` in the SaveBlob (synced; capped by the schema). */
  translations(): Record<string, string> {
    return { ...this.cur.journal.notes };
  }
  setTranslation(wordKey: string, text: string): boolean {
    const t = text.trim() === "" ? "" : text.slice(0, JOURNAL_NOTE_MAX_CHARS);
    const cur = this.cur.journal.notes;
    if ((cur[wordKey] ?? "") === t) return false;
    const notes = { ...cur };
    if (t === "") delete notes[wordKey];
    else if (Object.keys(notes).length >= JOURNAL_NOTES_MAX && !(wordKey in notes)) return false;
    else notes[wordKey] = t;
    return this.commit({
      ...this.cur,
      journal: { ...this.cur.journal, notes },
      updatedAtMs: this.now(),
    });
  }

  /** One-time import of v1-era device-local translations (IndexedDB `journal.translations`) into the blob. */
  private async importLegacyTranslations(): Promise<void> {
    const legacy = await this.net.store
      .get<Record<string, string>>("journal.translations")
      .catch(() => undefined);
    if (!legacy) return;
    for (const [k, v] of Object.entries(legacy)) {
      if (typeof v === "string" && !(k in this.cur.journal.notes)) this.setTranslation(k, v);
    }
    await this.net.store.delete("journal.translations").catch(() => undefined);
  }
}
