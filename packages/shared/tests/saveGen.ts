// Test-only save generators (seeded; deterministic).
import type { SaveBlob } from "../src/index.ts";

export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function blankSave(): SaveBlob {
  return {
    schemaVersion: 2,
    resetEpoch: 0,
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    playtimeSec: 0,
    settings: {
      comboMode: "gentle",
      difficulty: "standard",
      caseMode: "auto",
      autoUnlock: true,
      effectsIntensity: 1,
      reducedMotion: false,
      reducedFlash: false,
      volumes: { master: 0.8, sfx: 0.8, ambience: 0.6, music: 0.6, ui: 0.7 },
      translationLang: null,
      caseAssist: false,
    },
    progress: { frontierChapter: 1, levels: {}, starChestsClaimed: {} },
    pace: { calibrationWpm: null, recentNetWpm: [] },
    accuracyDaily: [],
    wallet: { gold: 0 },
    inventory: { gear: [], nextGearUid: 1, unopenedCaches: 0 },
    equipped: { weapon: 0, armor: 0, charm: 0 },
    loadout: {
      actives: [null, null],
      activeModes: ["smart", "smart"],
      passives: [null, null, null],
    },
    unlocks: { actives: [], passives: [] },
    cachePity: { sinceRare: 0, sinceEpic: 0, sinceLegendary: 0 },
    metaRng: [1, 2, 3, 4],
    srs: { levelsPlayed: 0, entries: {}, mastered: [] },
    journal: { firstSeen: {}, notes: {} },
    replays: { day: "2026-01-01", count: 0 },
    lifetime: { words: 0, chars: 0, typos: 0 },
  };
}

const WORDS = ["cat", "dog", "sun", "moon", "tree", "river", "stone", "wind", "fire", "ash"];
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

/** Applies a random burst of play to a save (gains only; never removes anything). */
export function play(save: SaveBlob, r: () => number): SaveBlob {
  const s: SaveBlob = JSON.parse(JSON.stringify(save));
  const sec = Math.floor(r() * 3000);
  s.playtimeSec += sec;
  s.updatedAtMs += sec * 1000;
  const nLevels = Math.floor(r() * 4);
  for (let i = 0; i < nLevels; i++) {
    const id = `ch1-l${String(1 + Math.floor(r() * 12)).padStart(2, "0")}`;
    const cur = s.progress.levels[id] ?? {
      cleared: false,
      stars: [false, false, false] as [boolean, boolean, boolean],
      bestTicks: null,
      attempts: 0,
    };
    cur.attempts += 1 + Math.floor(r() * 3);
    if (r() < 0.7) cur.cleared = true;
    cur.stars = cur.stars.map((x) => x || r() < 0.3) as [boolean, boolean, boolean];
    if (cur.cleared && r() < 0.8) {
      const t = 600 + Math.floor(r() * 2000);
      cur.bestTicks = cur.bestTicks === null ? t : Math.min(cur.bestTicks, t);
    }
    s.progress.levels[id] = cur;
  }
  if (r() < 0.3) s.progress.frontierChapter += 1;
  if (r() < 0.4) {
    const ch = String(1 + Math.floor(r() * 2));
    const m = pick(r, [10, 20, 30]);
    const list = s.progress.starChestsClaimed[ch] ?? [];
    if (!list.includes(m)) list.push(m);
    s.progress.starChestsClaimed[ch] = list;
    // claiming grants fungible rewards
    s.wallet.gold += 100;
  }
  const nGear = Math.floor(r() * 3);
  for (let i = 0; i < nGear; i++) {
    s.inventory.gear.push({
      uid: s.inventory.nextGearUid,
      defId: pick(r, ["w-sword", "a-leather", "c-ring"]),
      rarity: pick(r, ["C", "U", "R"] as const),
      upgrade: Math.floor(r() * 3),
    });
    s.inventory.nextGearUid += 1;
  }
  s.wallet.gold += Math.floor(r() * 500);
  s.inventory.unopenedCaches += Math.floor(r() * 2);
  s.cachePity.sinceRare += Math.floor(r() * 5);
  s.metaRng = [
    Math.floor(r() * 2 ** 32),
    Math.floor(r() * 2 ** 32),
    Math.floor(r() * 2 ** 32),
    Math.floor(r() * 2 ** 32),
  ];
  if (r() < 0.5) s.unlocks.actives.push(pick(r, ["fireball", "frostLock", "aegis"]));
  s.srs.levelsPlayed += nLevels;
  for (const w of WORDS) {
    if (r() < 0.3 && !s.srs.mastered.includes(w)) {
      s.srs.entries[w] = {
        box: pick(r, [1, 2, 3, 4, 5] as const),
        due: s.srs.levelsPlayed,
        lapses: 0,
      };
    }
    if (r() < 0.1) {
      s.srs.mastered.push(w);
      delete s.srs.entries[w];
    }
    if (r() < 0.3) s.journal.firstSeen[w] = Math.floor(r() * 50);
  }
  s.lifetime.words += Math.floor(r() * 200);
  s.lifetime.chars += Math.floor(r() * 1000);
  s.lifetime.typos += Math.floor(r() * 30);
  s.accuracyDaily.push({
    day: `2026-02-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`,
    accuracyBp: 9000 + Math.floor(r() * 900),
  });
  s.accuracyDaily = s.accuracyDaily.slice(-14);
  return s;
}
