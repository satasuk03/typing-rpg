# Chapter 2 Plan: "Chapter II: The Hushwood" (for PO approval)

> **PO decisions (2026-10-10). The plan is approved with these answers:**
> 1. **Boss signature:** the Riddle of Leaves. Leaf rain is the fallback only.
> 2. **Capitals:** Shift and capitals start in Ch2, in boss sentences only. Show a ⇧ cue and offer an "Ignore capitals" assist; enemy words stay lowercase.
> 3. **New mechanics:** only the healer and the elite tier. *(Default taken, per the recommendation.)*
> 4. **Leagues and Survival:** not in Ch2. They become a separate milestone after the backend deploy.
> 5. **Art:** keep the procedural pipeline, but **at production quality**. The procedural art must be good enough to ship as-is, not a placeholder for a later Aseprite pass. The art bar applies in full: match or beat `poc/v2-*.png` and Ch1, and Opus art reviews gate every M2 merge.
> 6. **Beginner boss clear:** 75–90% at par and 55–70% with no upgrades. *(Default taken, per the recommendation.)*


**Status:** draft for the PO. No building starts until the PO answers §7.
**Mirrors:** `docs/IMPLEMENTATION_PLAN.md` (milestones, roles, gates, DoD). Locked decisions in `docs/brainstorm/00-overview.md` §6
and the PO log in `docs/STATUS.md` still apply. Nothing here re-opens them.
**Sources:** doc 01 §4–6 (enemies, bosses, tiers, pacing), doc 02 §4–6 (par curve, gold, prices), doc 03 §6 (unlock timing),
`docs/balance-ch1.md` §7–9, `docs/qa/block-chance-analysis.md` §5. The gold and leak numbers in §4 come from the real sim
functions (`levelGold`, `upgradeCost`, `itemScoreBp`, `parArmorBp`) on main, not from the brainstorm tables.

---

## 1. Pitch

### 1.1 Story beat and tone
- **Ch1 recap:** the Ember Road, the Silence that makes words vanish, and the Ruin Golem in the Hollow.
- **Ch2 beat:** the Golem's last words point the hero out of the Hollow and into the **Hushwood**. It is a moonlit forest where
  the Silence pools like fog. Lost words drift there as shades. At its heart, the **Whispering Willow** was once the forest's
  storyteller. The Silence has turned it into a thief that whispers words out of the world.
  - The hero does not destroy the Willow. The finisher frees it: *"Speak again, old Willow, and let the forest sing."*
  - The chapter ends with the lantern road lit again. That is the hook to Ch3, the coast (doc 01 boss #3).
- **Tone:** melancholy and eerie, never horror (all ages). The palette is cool moonlight in violet and teal, with warm lantern
  accents. It is the deliberate opposite of Ch1's amber and ember look, so the two chapters never read the same.
- **Map name:** "The Lantern Road". The chapter title card reads "Chapter II: The Hushwood".

### 1.2 Biomes (3 moods, 2 of them new terrain)
| Biome id | Levels | Look | New render work |
|---|---|---|---|
| `hushwood` | L1–L4 | Night forest: twisted hollow oaks, hanging lanterns, glowing mushroom rings, waystones, root arches, moss curtains in the foreground, moon god-rays through fog | Ground variant (leaf litter, moss, root-veined path); wisp and leaf ambient particles; moonlight key + lantern point lights |
| `fen` | L5–L9 | Lantern Fen: boardwalks over black water, reeds, lily pads, dead cypress, sunken shrine columns, stilt lanterns, fireflies, green-gold dusk fog | **Still-water ground with fake reflections**, tier-gated (§2, S9); reed and firefly foreground |
| `grove` (boss) | L10 | Willow's Heart: a ring of lanterns around a vast willow, roots across the arena, a storm of falling leaves, letterbox on the intro | Boss mood (like Ch1's `hollow` off `cave`), a falling-leaves layer, lantern-ring lighting |

### 1.3 Roster (5 new types + 2 Ch1 returns for review)
| Enemy | Role / archetype | Plates | Notes | Weak to | Attack Power P (× par armor) |
|---|---|---|---|---|---|
| Lantern Wisp | grunt, flying, fragile | 3–4 | A fast little chime attack | pierce, arcane | 1.07 |
| Hush Shade | grunt | 4–6 | A lost word. It often carries the **Fading** gimmick, which fits the lore | arcane, fire | 1.07 |
| Moth Mender | **healer (new archetype)** | 4–5 | Heals the other living enemies 15% every 10 s (pace-scaled). Its plate shows a ✚. It teaches **target priority** (doc 01 §4.1, Healer) | fire, slash | 1.07 |
| Mire Toad | brute (heavy, 12 s) | 5–7 | A slow splash slam; guarding it is worth it | pierce, slash | 1.07 |
| Gloom Wolf | **elite** (new tag) | 5–7 | Last encounter of L4, L7, L9 and a pre-boss wave. It has a howl telegraph and a gold name tag | fire, blunt | **1.25** |
| Murk Slime, Cave Bat | Ch1 grunts (review) | as Ch1 | L1–L3 only, for a gentle start | as Ch1 | 1.07 |

Gimmicks: **Fading** and **Scrambled** return as review. Healer is a new *archetype*, not a gimmick, so the budget of 2 gimmicks
per encounter is unchanged (doc 01 §4.1). Each new thing debuts **alone**, with a one-line banner.

### 1.4 Boss: the Whispering Willow ("Keeper of the Hush")
Doc 01 §4.3 boss #2, on the standard three-phase template (doc 01 §4.2):

| Phase | HP band | What happens |
|---|---|---|
| Intro | — | The lantern ring ignites, leaves swirl and the Willow opens its eyes. HUD hidden (the Ch1 boss intro rule) |
| 1 | 100–66% | Normal plates + 2 adds: a **Hush Shade (Fading)** and a **Moth Mender** (healer, heals adds only, never the boss). P = 1.25 on the adds |
| 2 | 66–33% | **Hush Spells**, the Doom-Spell slot: a sentence across the top with a timer. The sentences are **exact case**, e.g. *"Hush now, Ember Knight, and forget your name."* Failure costs 15% of par HP (as Ch1) |
| 3 | <33% | **Riddle of Leaves** (new signature minigame, see below), then the finisher sentence (exact case, no timer) |

**Why a new signature and not doc 01's "leaf rain":** the Ruin Golem's Falling Rubble already *is* a rain-of-words minigame.
Reskinning it as falling leaves would be cheap, but it would make Ch2's climax a repeat of Ch1's (fallback in §7 Q1).

**Riddle of Leaves.**
- The Willow whispers a riddle: a word's *simple-English definition* from our own `WordEntry.definition`, e.g. "a small light
  that flies at night".
- Three leaf plates drift down. One is the answer; two are decoys. All three have distinct first letters, as the plate rule
  requires.
- Type the right word: a heavy hit on the Willow (`clearAtkMult`), and the leaf blooms.
- Type a wrong word or run out of time: a mild hit (`missHit`), and the leaf withers.
- Five riddles, then the finisher. Timer = a read allowance plus the typing time, both scaled by `BOSS_SCRIPT_PACE_SCALE`.
- It turns the English-learning pillar (doc 01 §5) into the climax. The data already exists in the Journal definitions.
- It is deterministic: the riddle and decoy picks come from a seeded content stream.

### 1.5 What Ch2 teaches at the keyboard
Doc 01 §5.1 keeps **T1 lowercase words for Ch1–3**, and capitals as plate content belong to T5 (Ch13). Ch2 does not pull that
forward. It teaches four things:
1. **Shift, in sentences only.** Ch1 folded case on sentences (PO ruling 2026-10-09: "exact case comes in a later chapter").
   The sim already makes sentences exact-case from Ch2 on (`SENTENCE_FOLD_CASE_MAX_CHAPTER = 1`). That covers Hush Spells,
   the finisher, Second Wind and the new typed chapter-intro card. Plates stay lowercase. Support: a ⇧ cue on an uppercase
   next letter, a typed intro card in L1 (no fail) and an "Ignore capitals" assist (§2, S4).
2. **Target priority:** kill the Moth Mender first.
3. **Word meaning:** the Riddle of Leaves, plus Journal definitions shown on the results screen.
4. **Slightly longer words:** biome plates grow from 3–6 to up to 3–8 letters late in the chapter. This is the doc 01 §5.5
   sawtooth: a dip at L1, a peak at L9/L10.

---

## 2. New systems: required or deferrable

| # | System | Ch2? | Why |
|---|---|---|---|
| S1 | **Multi-chapter plumbing.** Map with chapter tabs (I / II), Ch1 clear → frontier 2, chapter-complete → Ch2 intro, content bundle filtered per chapter, `Biome` enum + render `BiomeId` extended, per-chapter knob tables, balance/bot tools take a chapter argument | **Required** | Ch2 cannot exist without it. Today the map, `PLAN_TARGETS`, `pymodel.ts` and `solveHits.ts` are Ch1-only |
| S2 | **Per-chapter knobs.** `ENC_HP_MULT`, `HIT_MULT` and `BOSS_LEVEL_HIT_MULT` become per chapter (`levels-ch2.ts`) | **Required** | Ch1 must stay byte-identical (31/31 PASS). `balance-ch1.md` §7 says to re-solve per chapter |
| S3 | **Guard leak on grunts + elites.** Data: grunts P 1.07, elites and boss adds 1.25, Willow 1.30. Schema: optional `attackPower` per `EnemyRef` (today it is per encounter) and an `elite` flag for the name tag | **Required** | PO feedback 2026-10-10: make "upgrade armor" a real lever from Ch2. The mechanism exists (v1.9); this is data plus one optional field |
| S4 | **Exact-case sentences: the player-facing half.** ⇧ cue on the next letter, typed intro card, Second Wind sentences checked for exact case, "Ignore capitals" assist in Settings (story only, default off; Trial stays case-sensitive) | **Required** | The sim half already ships. Without the HUD cue a Beginner fails Second Wind on a capital and calls it a bug |
| S5 | **Healer archetype** (sim + HUD ✚ + VFX) | **Required** | The one new enemy mechanic. Cheap (no new plate rule) and teaches priority |
| S6 | **Riddle of Leaves** minigame (`MinigameDef` gets `kind: "riddle"`, `WordEntry.usage` gets `"riddle"`) | **Required** (or Q1 fallback) | The boss signature. It is the biggest new sim item, about 2 agent-days |
| S7 | **Ch2 skill unlocks:** **Reveal** (active: strips plate gimmicks for 8 s), **Calm Mind** (passive: telegraph +0.5 s), **Scholar** (passive: +1 skill charge per new-word plate) | **Required** (Scholar deferrable) | Ch1 unlocked something on almost every level. A Ch2 with no unlocks feels flat. Reveal fits a chapter of fading words. Calm Mind gives Beginners a non-gear defensive answer |
| S8 | **Balance tool gear offsets** (`--gear par`, `par-2`, `armor+N`) | **Required** | Today the tool "does not model gear upgrades" (`balance-ch1.md` §9). Without it the upgrade lever cannot be proved |
| S9 | **Still-water reflections** (fen): a mirrored billboard pass with a ripple shader on water decals; tier 2 falls back to matte bog | **Required, tier-gated** | The fen's signature depth cue, at the art bar. The fallback keeps perf safe |
| D1 | Survival mode + **weekly Leagues** (doc 03 §6: "Survival at 1-10, Leagues at chapter 2") | **Defer** to a separate Meta-1 milestone | Leagues are Survival brackets. They need Survival, a cron, league tables and the deployed backend (still a PO TODO). That is half a slice of its own. Ch2 shows no dead buttons |
| D2 | Heavy (unguardable) telegraphs (`block-chance-analysis.md` option B) | Defer to Ch3+ | The leak lever needs to land first. Two new defense rules in one chapter would muddy the lesson |
| D3 | New gear tier | Not needed | T1 lasts until Ch4 (doc 02 §6.3). Ch2 progress = upgrades + rarity from chests and caches |
| D4 | Hand-drawn Aseprite art | Defer (Q5) | The procedural pipeline earned the PO sign-off. `SpriteSource` keeps the swap open |
| D5 | Hard mode, gem revive, word-of-the-day signposts | Defer | Open decision (00 §6b) or out of scope since the slice |

---

## 3. Content list

### 3.1 Levels (10, Ch1 structure: L1–L2 have 2 encounters, L3–L9 have 3, L10 has 2 waves + boss)
| L | Name | Biome | Plates | Encounters (high level) | Debut / beat | ★★★ |
|---|---|---|---|---|---|---|
| 1 | Moonward Trail | hushwood | 3–5 | wisp+slime · wisp+shade+bat | Typed intro card (Shift lesson, no fail); dip in the sawtooth | streak 10 |
| 2 | Lantern Path | hushwood | 3–6 | wisp+shade+slime · **mender**+wisp+shade | **Healer debuts alone** (banner) | parTime 1.2 |
| 3 | Hollow Oaks | hushwood | 3–6 | 3× mixed, shade(fading) in enc 2 | Fading review; unlock **Reveal** | untouched 4 |
| 4 | Owl's Rest | hushwood | 3–6 | … enc 3: **Gloom Wolf** + 2 | **Elite debuts**; cracked-shield banner "Armor below this foe's power" | guardian 4 |
| 5 | Mirewater Edge | fen | 3–6 | **toad** debuts in enc 3 | Brute; unlock **Calm Mind** | streak 15 |
| 6 | Sunken Shrine | fen | 3–7 | mender + scrambled wisp in enc 2 | Healer + gimmick | noSkills |
| 7 | Reedmaze | fen | 3–7 | fading and scrambled (separate encounters); wolf in enc 3 | unlock **Scholar** | parTime 1.1 |
| 8 | Firefly Crossing | fen | 3–7 | one encounter with both gimmicks + mender | Peak gimmick density (≤2 per encounter) | guardian 5 |
| 9 | Weeping Reach | fen | 3–8 | 2 elites across the level; hardest normal (≈1.45× L1) | — | untouched 3 |
| 10 | Willow's Heart | grove | 3–8 | waves (wisp, shade, mender) → (wolf, toad, shade·fading) → Willow | Boss | guardian 6 |

Tier mix stays 60/20/15/5 (current / review / biome / weak). Here, review = Ch1 biome words. Guard words stay T1.

### 3.2 Words and text
| Pool | New entries (est.) | Notes |
|---|---|---|
| `biome-hushwood` | ~75 | lantern, moss, owl, hollow, whisper, … with ≥12 distinct first letters per plate band |
| `biome-fen` | ~75 | reed, marsh, heron, ripple, … reaching 8 letters for L9–L10 |
| `biome-grove` | ~60 | willow, root, leaf, bark, … (the Ch1 lesson: a boss biome needs its own pool) |
| Riddle tag | ~60 tagged words (T1 + Ch2 biome) | The definition must be guessable without the word in it. Decoys come from the same tag set |
| Hush Spells | 16 sentences, 28–60 chars | Exact case: a capital at the start plus 1 proper noun ("Ember Knight", "Willow") |
| Finisher | 3 | The canonical one first |
| Second Wind (Ch2 set) | ~10 | Exact case, 10–24 chars |
| Chapter intro card | 3 typed lines | Exact case, no fail |
| **Total** | **~250 entries** | Each has a definition and an example. Validator + blocklist (blocklist still needs a human pass) |

### 3.3 Art (procedural pipeline, `SpriteSource`; normal and emissive maps as in Ch1)
| Item | Count | Detail |
|---|---|---|
| Enemy sprites | 5 | idle + attack frames each, normal maps. Silhouettes readable at 1280 px; each type distinct from the Ch1 roster |
| Willow boss | 1 large multi-part sprite | idle sway, branch-lash attack, Hush-Spell cast, phase-change shudder, hurt, freed/dissolve. About 2× the Golem's screen area, but it must leave plate space (readability) |
| Riddle leaf | 1 sprite, 3 tints | Plate carrier for the minigame |
| Biome moods | 3 | `BiomeMood` entries (`hushwood`, `fen`, `grove`) + grades. New ambient flavours: `wisps`, `leaves`, `fireflies` |
| Ground variants | 3 | Leaf-litter path, mud with water decals (reflection), root-covered arena |
| Backdrop sets | 2 | Hushwood (moon, misty dead-forest far layer, giant oaks mid); Fen (dusk sky, cypress line, fog bank) |
| Props | ~16 generators | twisted oak ×3 variants, hanging lantern, stilt lantern, waystone, mushroom ring, root arch, cobweb veil, boardwalk, reed clump, lily pad, cypress, sunken column (ruins pillar recoloured), lantern ring (boss) |
| Foreground depth layers | ~6 | moss curtain, near trunks, fern/reed clumps, hanging vines, fog cards, falling-leaf sheet |
| Layouts (LDtk subset) | 10 | `ch2-l01..l10.json` with anchors for plates, waves, boss adds and the riddle lane |

The bar: match or beat `poc/v2-*.png` and the Ch1 sign-off deck (`docs/qa/po-signoff/`). Octopath-level depth means near
foreground framing, DOF, god-rays and point-light scatter in every level. All screens are desktop 16:9 at 1280–2560 px.

### 3.4 VFX (new; existing typing VFX carry over unchanged)
- **Enemies:** healer motes and heal beam + green heal number; elite gold rim aura, howl telegraph ring and name-tag shimmer;
  wisp death chime-puff; toad splash slam; shade fade-out.
- **Willow:** intro (lantern ring ignites), branch-lash arc, Hush-Spell violet-teal aura, phase-change leaf storm, riddle
  bloom (right answer) and wither (wrong answer), freed finisher (leaves rise, light returns).
- **Typing:** a **capital-letter accent**, a small crown-gold spark plus a deeper click when an uppercase letter is typed.
  It rewards the Shift lesson.
- **World:** fog volumes, fireflies, wisps, water ripples under feet and hits.
- **Readability:** all of it obeys the existing keep-out and readability invariants (next letter, plates, boss bar, panels).

### 3.5 Audio (procedural, like Ch1; the PO listens)
- **Music:**
  - 2 biome loops: Hushwood (slow dorian, celesta-like) and Fen (lydian drone and plucks).
  - 1 boss theme with battle layers.
  - A chapter-complete sting variant.
- **Ambience:** night forest (owls, crickets, wind) and fen (frogs, drips, insects).
- **SFX (~14):** wisp chime, shade hiss, moth flutter and heal chime, toad croak and splash, wolf howl and bite, willow creak,
  Hush-Spell whisper loop, leaf storm, riddle right and wrong stingers, capital-key accent, Willow freed sigh.

---

## 4. Balance targets

### 4.1 Par build and authored numbers (doc 02 §4.1; `economy_sim.py level_spec`)
| Quantity | Ch1 (shipped) | **Ch2** |
|---|---|---|
| Par build | T1/1/1 Common +0 | **T1/1/1 Common +2** (`PAR_UPG[2] = 2`, already in `balance.ts`) |
| Par armor score / HP / ATK | 1.00 / 100 / 10.0 | **1.14 / 121.7 / 12.2** |
| Reference typist | 35 WPM, 92% | 35.2 WPM (REF_WPM piecewise) |
| `DMG_FRAC` (damage budget ÷ par HP) | 0.40 | **0.525** → budget ≈ 64 (L1) to 77 (L9) per level |
| `BOSS_ENC_DMG` | 1.4 | **1.7** |
| Encounter HP L1 → L9 (authored, before `ENC_HP_MULT`) | 199 → 231 | **244 → 284** |
| Boss HP | 753 | **≈923** |
| Grunt hit / boss hit (Py, 2-encounter model) | 8.1–9.8 / 8.0 | 13.0–15.6 / 12.8. Re-solved on the real layouts, as Ch1 was |
| Knobs to solve | `ENC_HP_MULT` 1.2, `HIT_MULT` 1.34, `BOSS_LEVEL_HIT_MULT` 1.15 | **New per-chapter values.** Solve `HIT_MULT` *with leak on, at par gear*; do not reuse Ch1's |

### 4.2 Time, clear and feel targets (200 seeds; plan §9 ranges ±15%, Ch1 boss rule)
| Metric | Beginner 20 | Average 40 | Fast 75 |
|---|---|---|---|
| Normal level active, L1–L9 mean | 3.0–4.5 min | 2.4–3.0 | 1.7–2.2 |
| Boss level active | ~8.1 min | ~4.4 | ~2.8 |
| First-try clear normal, **at par** | ≥ 90% (worst level ≥ 85%) | ≥ 97% | ≥ 99% |
| First-try clear boss, **at par** | **75–90% window** | ≥ 90% | ≥ 95% |
| Parity vs Py Ch2 model on this content | ±15% per cell, like Ch1 | | |
| Skill share | 15–20% | 15–20% | 15–20% |
| Reference auto-attacks per encounter | ~11 ±15% | | |

The Ch1 boss targets (8.1 / 4.4 / 2.8) are kept for Ch2. The riddle phase replaces rubble at about equal time, and the boss
HP-to-DPS ratio is unchanged by construction (HP is authored from par DPS). Ch2 L1 is a sawtooth dip, so it should feel easier
than Ch1 L9.

### 4.3 Guard leak: `leak = clamp(1 − G/P, 0, 50%)`, G = equipped armor score, P = class multiple × Ch2 par (1.14)
| Armor | G | Grunt (P 1.07) | Elite / boss adds (P 1.25) | **Willow (P 1.30)** |
|---|---|---|---|---|
| C+0 (no upgrades, "par−2") | 1.00 | 18.0% | 29.8% | 32.5% |
| C+1 | 1.07 | 12.3% | 24.9% | 27.8% |
| **C+2 (par)** | 1.14 | **6.5%** | **20.0%** | **23.1%** |
| C+3 | 1.21 | 0.8% | 15.1% | 18.4% |
| C+4 | 1.28 | 0 | 10.2% | 13.6% |
| C+5 (Common cap) | 1.35 | 0 | 5.3% | 8.9% |
| U+3 (shop or chest Uncommon) | 1.355 | 0 | 4.9% | 8.6% |

Checks the balance agent must report (S8):
- **Reference at par:** damage = **1.00× budget ±5%** with leak on. That defines `HIT_MULT`.
- **Reference at par−2 (C+0 everywhere):** **1.25–1.35× budget.** This is "par−3 ≈ 1.3×" from `block-chance-analysis.md`
  adapted to Ch2, where par is only +2. Expected mechanism: about ×1.22 hits from 18% slower kills, times about ×1.07 from the
  extra leak on guarded hits.
- **Beginner boss clear, by gear:** C+0: 55–70%; par: 75–90%; armor C+5: ≥ 85%.
- **Average and Fast:** at C+0 they still clear ≥ 95%. They feel the leak as damage, not as walls.

### 4.4 Gold and upgrade curve (sim functions on main; GU ch2 = 113, Common upgrade steps 288 / 374 / 486 / 632 / 821)
| | Gold |
|---|---|
| Ch1 first-clear income: level 1,389 + 1★ star gold 278 + chests ≈ 750 (measured 2,110–2,180 level+chest) | **≈ 2,400** |
| Ch2 par from scratch: +2 on all 3 slots = 3 × 662 | **1,986** |
| …or along the Ch1 hint path (armor +3 already bought for the Golem leak, 1,148), then weapon +2 and charm +2 (1,324) | 2,472 in total, ≈ Ch1 income |
| Ch2 first-clear income: level 1,564 + 1★ 313 + chests ≈ 845 | **≈ 2,700** |
| Ch2 spend on the lever: armor +4, +5 (632 + 821) takes the Willow leak 23% → 9% | 1,453 |
| Left for caches (1,582) or a Ch3 head start (Ch3 par is Uncommon +3) | ≈ 1,250 |

**Verdict:** the reference typist can buy par from Ch1 income alone, with about 430 gold to spare (or exactly break even on
the hint path). Ch2 income then funds the armor lever to the Common cap. The squeeze moves to Ch3 (the Uncommon par), which is
doc 02's intended saw. **Watch:** a player who spends Ch1 gold on 2 Gear Caches (2,800) arrives under par. The cache reveal
keeps the published odds; the results hint ("Upgrade Armor in Gear") already points at the fix. Add a Ch2 economy test like
the Ch1 one in `apps/game/tests/app/ops.test.ts`: Ch1 first-clear gold at 1★ ≥ 1,986.

---

## 5. Milestones and tasks

Rules (unchanged):
- **Concurrency:** at most 3 agents at once.
- **Models:** each task uses the cheapest model that fits. **Haiku** only for mechanical work from a finished spec,
  **Sonnet** for normal implementation, **Opus** for design, balance analysis and reviews.
- **Worktrees:** every agent runs `git merge main` first.
- **Sim purity:** `packages/sim` stays pure and deterministic.
- **Contracts:** contract changes go via `docs/interfaces.md` (v2.0 = the Ch2 entry).
- **Art evidence:** render, VFX and HUD changes attach before/after shots.
- **Gate:** every task ends with `scripts/check.sh` green plus AC evidence.

**New art modules go in new files** (`render/sprites/ch2Monsters.ts`, `ch2Props.ts`, `render/biomes` entries), not in
`proceduralArt.ts`, so render agents rarely collide.

### M0 — Contracts and direction (≈1 day)
| Task | Owner (model) | Writes | Deps | AC + evidence |
|---|---|---|---|---|
| C0.1 Ch2 contracts, interfaces v2.0 | Deep reasoner (**Opus**) | `docs/interfaces.md` | PO answers | Specifies `Biome`/`BiomeId` additions; `EnemyRef.attackPower?`, `elite?`; healer fields + `EnemyHealed` event; `MinigameDef` `riddle` variant + riddle events; `WordEntry.usage` `riddle`; per-chapter knob tables; `caseAssist` option. Code blocks typecheck with `extract-interface-blocks.mjs`. Reviewer (Opus) approves |
| C0.2 Art + audio direction brief | Art director (**Opus**) | `docs/vfx/ch2-art-direction.md` | — | Numbers per mood (fog, grade, bloom, light colours), prop list with silhouettes, reflection spec, VFX spec rows (in the style of `typing-vfx-spec.md`), SFX/music brief. Mock stills from a POC-style scratch scene |
| C0.3 Publish contract stubs | Sim (**Haiku**) | `packages/content/src/schemas.ts`, `packages/sim/src/{events,view,types}.ts` | C0.1 | Types exactly as written in v2.0; no behaviour; check.sh green; golden hashes unchanged |

### M1 — Sim (≈3.5 days; one sim agent at a time on `packages/sim`)
| Task | Owner (model) | Writes | Deps | AC |
|---|---|---|---|---|
| T1.1 Chapter plumbing + per-chapter knobs | Sim (**Sonnet**) | `packages/sim`, `packages/content/src/data/levels.ts` (split to `levels-ch1.ts`), `tools/balance`, `tools/bot` | C0.3 | Ch1 **byte-identical**: goldens, 31/31 balance cells, bot output unchanged. `pnpm balance --chapter 2` and `pnpm bot --chapter 2` run on stub levels |
| T1.2 Healer + elite + per-ref attackPower | Sim (**Sonnet**) | `packages/sim` | T1.1 | Rule-named tests: heal cadence pace-scaled, heals only living non-boss allies, never above max; leak per ref; property test (no first-letter collisions) with healers; Chromium parity |
| T1.3 Riddle of Leaves + Willow flow | Sim (**Sonnet**) | `packages/sim` | T1.2 | Phase tests: riddle pick and decoys deterministic with distinct first letters; right → `clearAtkMult`, wrong/timeout → `missHit`; 5 riddles then finisher; exact-case Hush Spells; golden boss replay + Chromium parity |
| T1.4 Reveal, Calm Mind, Scholar | Sim (**Sonnet**) | `packages/sim`, `packages/content/src/data/skills.ts` | T1.2 | Effect tests; skill share still 15–20% in the bot; unlock levels per §3.1 |
| T1.5 Balance tool gear offsets | QA/balance (**Sonnet**) | `tools/balance` | T1.1 | `--gear par|par-2|armor+N`; reproduces Ch1 numbers at `--gear par` |

### M2 — World and art (≈4 days, parallel with M1)
| Task | Owner (model) | Writes | Deps | AC |
|---|---|---|---|---|
| T2.1 Hushwood + grove biome | Render (**Sonnet**) | `render/biomes.ts`, `render/sprites/ch2Props.ts`, `render/ambient` | C0.2 | Test scene stills at 1280/1920 next to `poc/v2-*` and Ch1 forest: clearly different and at least as rich; hero silhouette ≥ 0.75; fps at tier 0/2 |
| T2.2 Fen biome + still-water reflections | Render (**Sonnet**) | `render/biomes.ts` (fen entry only), `render/materials/water*`, `render/post` (if needed) | T2.1 merged | Before/after stills; tier 2 fallback; Metal p95 ≤ 16.8 ms at tier 0; tier 2 at 4× throttle ≥ 45 fps |
| T2.3 Enemy + Willow sprites | Render (**Sonnet**) | `render/sprites/ch2Monsters.ts`, `artTypes.ts` (ids) | C0.2 | Contact sheet of all 6 with normal maps, against the Ch1 roster; Willow anim strip; readable at 1280 px |
| T2.4 Ch2 layouts ×10 | Render (**Sonnet**) | `apps/game/src/assets/levels/ch2-*.json` | T2.1, T2.2 | Validator green; contact sheet of 10 layouts; anchors for adds and the riddle lane; no coordinate literals in code |
| R2 Art review, round 1 | Art director (**Opus**) | `docs/qa/ch2-review-1.md` | T2.1–T2.4 | Graded backlog (P1/P2) with stills |

### M3 — Presentation (≈3 days)
| Task | Owner (model) | Writes | Deps | AC |
|---|---|---|---|---|
| T3.1 HUD Ch2 | UI (**Sonnet**) | `apps/game/src/hud` | C0.3 | Riddle panel (definition text never overlaps plates); ⇧ next-letter cue; ✚ healer badge; elite name tag; readability sweeps extended with the new elements (0 violations at max FX) |
| T3.2 VFX Ch2 | VFX (**Sonnet**) | `render/vfx`, `level/eventBindings.ts` | T1.2, T1.3, T2.3 | Every new event bound (enumeration test); capital accent within the 0.45 ms/key budget; keep-out probes green; before/after stills |
| T3.3 Audio Ch2 | Audio (**Sonnet**) | `apps/game/src/audio` | C0.2 | Bindings drift test; no audio errors in a full run; listen checklist for the PO |
| T3.4 Flow + screens | UI (**Sonnet**) | `apps/game/src/app`, `meta/` | T1.1, T3.1 | Map chapter tabs; Ch1 complete → Ch2 unlock + intro card (typed, exact case, skippable after first); "Ignore capitals" assist; save v2 → Ch2 progress survives reload + cloud sync; keyboard-only spec |

### M4 — Content (≈2 days)
| Task | Owner (model) | Writes | Deps | AC |
|---|---|---|---|---|
| T4.1 Ch2 vocabulary + riddle tags | Content (**Sonnet**) | `packages/content/src/data/biome-{hushwood,fen,grove}.ts`, `tools/content` | C0.3 | Validator: ≥12 distinct first letters per band per biome; riddle definitions don't contain the answer; orchestrator samples 30 entries |
| T4.2 Boss script data entry | Content (**Haiku**) | `packages/content/src/data/boss-willow.ts`, second-wind set | C0.1 script approved | Rows exactly as approved; validator green |
| T4.3 Ch2 levels, enemies, Willow | Content (**Sonnet**) | `levels-ch2.ts`, `enemies.ts`, `bosses.ts` | T1.2, T1.3, T2.4, T4.1 | Fits layout anchors; authored numbers from §4.1; star3 per §3.1; CONTENT_VERSION bump |

### M5 — Balance, QA, polish, sign-off (≈3 days)
| Task | Owner (model) | Writes | Deps | AC |
|---|---|---|---|---|
| T5.1 Ch2 balance solve | Balance (**Opus**) | `levels-ch2.ts` knobs, `docs/balance-ch2.md`, `tools/balance` targets | T4.3, T1.4, T1.5 | Every §4.2 cell PASS (200 seeds; boss window at 1,000); §4.3 gear checks reported; Ch1 31/31 unchanged |
| T5.2 Bots + browser bot | QA (**Sonnet**) | `tools/bot`, `apps/game/tests` | T5.1, T3.4 | `pnpm bot` 20 levels × 3 personas × 20 seeds in check.sh; Playwright plays L2-1, L2-5, L2-10 and a full Ch1 → Ch2 run with 0 console errors |
| T5.3 Perf + soak | QA (**Sonnet**) | `docs/perf.md` | T2.2, T3.2 | Real-GPU p95 per tier on fen + grove; 30 min soak with no leaks |
| R5 Art review, rounds 2–3 | Art director (**Opus**) | `docs/qa/ch2-review-*.md` | T3.2, T5.2 | Backlog closed or accepted; PO deck `docs/qa/ch2-signoff/` |
| W/H polish | VFX / UI (**Sonnet**) | as T3.1 / T3.2 | R2, R5 | Each item with before/after |

### Batches (≤3 agents; ordered to avoid shared files)
| Batch | Agents |
|---|---|
| 1 | C0.1 contracts (Opus) · C0.2 art direction (Opus) |
| 2 | C0.3 stubs (Haiku) → then T1.1 plumbing (Sonnet) · T2.1 Hushwood (Sonnet) · T4.1 vocab (Sonnet) |
| 3 | T1.2 healer/elite (Sonnet) · T2.3 sprites (Sonnet) · T3.3 audio (Sonnet) |
| 4 | T1.3 riddle/Willow (Sonnet) · T2.2 fen + water (Sonnet) · T3.1 HUD (Sonnet) |
| 5 | T1.4 skills (Sonnet) · T2.4 layouts (Sonnet) · T1.5 gear offsets (Sonnet) |
| 6 | T4.2 boss data (Haiku) · T4.3 levels (Sonnet) · T3.4 flow (Sonnet) |
| 7 | T3.2 VFX (Sonnet) · R2 art review (Opus) · T5.1 balance (Opus) |
| 8 | T5.2 bots (Sonnet) · T5.3 perf (Sonnet) · W/H polish (Sonnet) |
| 9 | R5 art review + PO deck (Opus) → PO sign-off |

Rough total: about 15 working days of agent time across 9 batches.
- One sim agent at a time, because the sim tasks all touch `packages/sim`.
- Render tasks are serialised on `biomes.ts`.
- HUD and VFX never run in the same batch, because they share keep-out code.

---

## 6. Definition of Done (Ch2)

1. **Bots:**
   - `pnpm bot` clears all 20 levels (Ch1 + Ch2) at 20/40/75 WPM.
   - `pnpm balance --chapter 2` passes every §4.2 cell within ±15%, and the §4.3 gear checks are reported.
   - Ch1 stays 31/31 PASS, byte-identical.
2. **Upgrade lever proven:**
   - The reference typist at par takes the budget ±5%; at par−2 it takes 1.25–1.35×.
   - The Beginner boss clear rises from C+0 to par to C+5, and each armor step visibly cuts the leak (test + HUD still).
   - Ch1 first-clear gold buys Ch2 par (test).
3. **Perf:** 60 fps at 1080p, tier 0, Apple silicon, on every Ch2 biome, including water. Tier 2 holds ≥ 45 fps at 4× CPU
   throttle. A 30 min soak shows no leaks.
4. **Zero console errors** in a full Title → Ch1 → Ch2 complete run (browser bot).
5. **Save:** Ch2 progress survives a reload and a second browser through cloud sync. Old saves with Ch1 cleared open Ch2.
6. **Readability and juice:**
   - All readability invariants are green with max FX on L2-1, L2-5 and L2-10, including the riddle panel and the ⇧ cue.
   - The next-letter pixel test passes; per-key cost stays ≤ 0.45 ms.
   - The PO signs off a Ch2 deck that matches or beats `poc/v2-*.png` and the Ch1 deck.
7. **Gates:** `scripts/check.sh` is green, with determinism and Chromium parity including healer and riddle replays.
   `docs/interfaces.md` v2.0 is approved; `STATUS.md` has one line per task with evidence.

---

## 7. Risks and PO questions

### 7.1 Risks
| Risk | Mitigation |
|---|---|
| Riddles are too hard for ESL Beginners (reading plus recall under a timer) | Simple-English definitions only; read allowance; wrong = mild hit; 5 riddles, not more; the bot gets a "knows it" rate (85/92/96%); the Q1 fallback is ready |
| Exact case trips Beginners (Second Wind on a capital) | ⇧ cue, typed intro card, "Ignore capitals" assist. The balance bot models a Shift cost on sentences |
| Healers make fights drag (the Beginner is already at 4.31 of 4.5 min) | Heal is pace-scaled and capped; the mender is fragile (hp 0.9); at most 1 per encounter; watch Beginner time in T5.1 |
| Leak on every grunt feels like a bug at par | 6.5% only; cracked-shield badge plus the L4 banner; results hint "Upgrade Armor in Gear" |
| The water pass costs perf | Tier-gated, matte fallback, measured in T2.2 before content builds on it |
| Hushwood reads like Ch1's forest | Night palette, distinct silhouettes; Opus art gate R2 before layouts are polished |
| Ch1 regressions from shared code | Per-chapter knobs; the T1.1 AC requires byte-identical Ch1 goldens and balance |
| The bot is optimistic about gimmicks and riddles (`balance-ch1.md` §6) | Browser playtests at 20 and 40 WPM on L2-5 and L2-10 |

### 7.2 Questions for the PO (my recommendation in bold)
1. **Boss signature.** The Whispering Willow with a new *Riddle of Leaves* phase (type the word that matches a definition), or
   doc 01's leaf rain, which is a reskin of the Golem's rubble and about 2 days cheaper?
   **Riddle of Leaves.** It puts the learning pillar at the climax, and a repeat of Ch1's minigame would undercut the "wow".
2. **The Ch2 typing lesson.** Should exact case (Shift) start in Ch2, in sentences only (Hush Spells, finisher, Second Wind,
   intro card), with plates still lowercase until T5?
   **Yes, with the ⇧ cue and an "Ignore capitals" assist (story only, default off).** The sim already does this from Ch2, so
   the work is the player-facing support.
3. **The new enemy mechanic.** Should the Healer archetype (Moth Mender) and an elite tier (Gloom Wolf, guard-leak P 1.25) be
   the only new mechanics?
   **Yes.** Keep Bomber, Lexicon Slime and Heavy telegraphs for Ch3+. One new rule plus the leak lever is enough to learn in
   one chapter.
4. **Leagues and Survival.** Doc 03 teases them for 1-10 and chapter 2. Should they ship with Ch2?
   **No.** Make them a separate Meta-1 milestone after the backend deploy (still a PO TODO), and show no dead buttons in Ch2.
5. **Art pipeline.** Should Ch2 stay on the procedural sprite pipeline that the Ch1 sign-off used, or start hand-drawn Aseprite
   now?
   **Stay procedural for Ch2,** with the Opus art gate. Plan a dedicated Aseprite pass for the Ch1 + Ch2 heroes, bosses and
   enemies later, since `SpriteSource` keeps that swap cheap.
6. **The difficulty bar.** Should the Beginner's boss first-try at par be 75–90% (Ch1: 80–90%), with par−2 at 55–70%, so that
   skipping upgrades is felt but not a wall?
   **Yes.** It makes "upgrade armor" a real lever, and Average and Fast stay at 100% or near it.
