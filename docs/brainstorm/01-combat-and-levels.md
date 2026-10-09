# 01 — Core Gameplay: Combat, Typing Mechanics & Level Design

> Status: brainstorm / proposal. Owner: gameplay design. All numbers marked **(proposal)** are starting points; the economy agent owns final HP/gold/drop balance.
> Reference player for timings: **35 WPM, 92% accuracy** ("Pace 35"). 1 word = 5 chars.

---

## 0. Design pillars

1. **Every keystroke is an action.** A correct key visibly does something right away: a spark, gauge tick, or chip hit. Typing should never feel like filling out a form while a cutscene plays.
2. **Accuracy beats panic.** We reward clean typing more than raw speed. That way the game builds good habits, beginners have a path to power, and mashing is pointless.
3. **Pressure is relative, not absolute.** Enemy speed adapts to the player's own measured pace. A 20 WPM learner and a 90 WPM typist should both feel "just barely keeping up" on default difficulty.
4. **Gentle failure.** Typos cost momentum, not progress. You never need Backspace and you never get a "game over" from a single bad word.
5. **Learn while fighting.** Words are curated content (graded vocabulary, themed per biome, spaced repetition), not random filler.

---

## 1. Typing → Combat Mapping

### 1.1 What the player types
- Each **enemy displays its own "word plate"** floating above its head, set in a large, high-contrast font on a parchment banner that fits the HD-2D look.
- The plate content depends on chapter tier (section 5): a single word early on, then collocations ("heavy rain"), then short sentences ("The gate is locked.").
- A plate is **consumed** when completed, and the enemy gets a new one immediately (≈150 ms swap animation).
- **No space or Enter is needed** to submit. The word fires on its last correct character. Spaces only matter *inside* multi-word plates.

### 1.2 Targeting (multiple monsters)
- **First-letter lock:** the first keystroke picks the enemy whose plate starts with that letter. The word generator guarantees **unique first letters among all visible plates** (including guard words, see 1.5). One keypress is always unambiguous, a pattern players know from *Typing of the Dead* and *ZType*.
- When locked, the plate glows, the hero turns toward that enemy, and the typed letters fill in gold.
- **Switching target:** `Esc` (or `Tab`) drops the lock with no penalty. Beginners can also enable "auto-unlock": three consecutive wrong keys drop the lock.
- **Focus target:** the enemy whose plate you **last completed** becomes the hero's *Focus*. ATB auto-attacks and single-target skills hit the Focus. So **targeting means choosing which plates to type.** That's the main tactical decision (kill the Healer first, interrupt the caster, and so on).
- If the Focus dies, Focus moves to the frontmost enemy.

### 1.3 Immediate feedback per word: "Word Strike"
Completing any plate deals a **Word Strike**, a small chip hit to that enemy: **(proposal) 15% of hero ATK**, or 25% for a Perfect word. That keeps typing tactile between the bigger ATB attacks. Chip damage can't kill bosses below their phase thresholds.

### 1.4 Accuracy vs. speed rewards
| Signal | Definition | Reward |
|---|---|---|
| **Correct char** | Key matches the next expected char | +ATB (weapon-based), gold letter fill |
| **Perfect word** | Plate completed with 0 errors | ×1.25 ATB for that word, +1 Combo, 25% Word Strike, crit roll bonus |
| **Swift word** | Perfect word typed at ≥ 1.3× the player's Pace (per-word CPS) | +5 ATB flat, "Swift!" popup. Rewards speed only when it comes with accuracy |
| **Error** | Wrong key | Cursor does **not** advance (stop-on-error, so no Backspace). Combo cracks (see below). Key flashes red/orange with a shake icon |

Accuracy is also the main **damage** lever (crit), and speed is the main **tempo** lever (more ATB fills per minute). Both matter, but accuracy is weighted heavier.

### 1.5 Combo / streak
- **Combo = consecutive Perfect words.** It shows as a counter by the hero ("x12").
- Combo tiers: **Bronze 5 / Silver 15 / Gold 30 / Radiant 50**. Each tier adds an aura VFX and an ATB multiplier.
- **(proposal)** `ComboMult = 1 + 0.02 × min(Combo, 25)`, which caps at ×1.5.
- **Typo penalty (default "Gentle"):** Combo is halved (rounded down). One typo at x20 leaves x10, not 0. This is the single most important beginner-friendliness rule.
- **Strict** (opt-in, unlocks harder content): a typo resets Combo to 0 and removes 5 ATB.
- **Zen**: typos have no combat penalty and only count toward accuracy stats.

### 1.6 Enemy attacks (real-time pressure)
- Every enemy has its **own ATB bar** shown under its HP. The bar fills in **real time**, independent of typing.
- **(proposal)** `EnemyInterval = BaseInterval × (35 / Pace)^0.7`, clamped to 0.6×–1.8×.
  - `Pace` = the player's rolling median net WPM over their last 10 levels. A 3-minute calibration at first launch seeds it. It's clamped to 15–120 and is **not** updated mid-level, so players can't sandbag.
  - The 0.7 exponent means faster typists get slightly more breathing room than strict proportionality would give, so speed still feels powerful.
- Base intervals: Grunt 9 s, Brute 12 s, Speedster 5 s, Boss specials see section 4.

### 1.7 Defense: Guard words (parry)
- **2.5 s before** an enemy attacks (scaled by the same Pace factor, minimum 1.5 s), its plate **flips to a Guard word**: a short 3–5-letter word on a **red, jagged, shield-icon banner**. Shape and icon carry the meaning, not only color.
- Typing the Guard word before the hit lands gives:
  - **Block:** damage taken ×0.2.
  - **Perfect Parry** (0 errors): 0 damage + **Counter** (a free Word Strike at 50% ATK) + 10 ATB.
- If you ignore it, you take full damage and the plate goes back to normal after the hit.
- Guard words are always drawn from the **easiest** tier the player has (top-300 words). Defense should test reaction, not vocabulary.
- **Multiple simultaneous telegraphs** are staggered by at least 0.8 s by the encounter director, so two guards never resolve on the same frame.
- Heavy/unblockable attacks (bosses) use a **Guard sentence** instead (section 4).

This gives the player a constant micro-decision: *keep attacking the Focus, or switch and guard?* Pausing offense to guard is the main skill expression.

### 1.8 Hero HP and failure
- Hero HP persists across the encounters of a level and partially restores between them (**(proposal)** +25% max HP during the scene-break walk).
- At 0 HP you get a **"Second Wind"** prompt: type one sentence within 8 s to revive at 30% HP, once per level. If that fails, the level is lost. You keep 50% of the gold collected and **all word-learning progress**. Learning is never lost.

---

## 2. ATB Design

### 2.1 Gauge
- Hero ATB: 0 → **100**. When full, the hero auto-attacks the Focus (≈0.6 s animation; typing continues during it, so input is **never blocked**) and the gauge resets to 0. Overflow carries over, capped at 30.
- **Idle typing earns nothing:** the gauge does not fill on time, only on correct characters. Passives can break this rule as a deliberate exception.

### 2.2 Charge formula (proposal)
```
ATB_per_char  = WeaponCharge × ComboMult × PassiveMods
ATB_per_word  = (WeaponWordBonus + Σ ATB_per_char) × (Perfect ? 1.25 : 1.0)  [+5 if Swift]
```
Applied per character as you type, with the word bonus applied on completion.

| Weapon | Char charge | Word bonus | Attack | Hits | Signature |
|---|---|---|---|---|---|
| **Sword** (balanced) | 8 | 10 | 1.0× | 1 | Perfect Parry also adds +1 Combo |
| **Dagger** (fast) | 11 | 6 | 0.45× | 2 | Every 3rd attack applies Bleed (DoT) |
| **Staff** (skill) | 6 | 8 | 0.8× (magic) | 1 | Skill charge ×1.5 (see 2.3) |
| **Hammer** (heavy) | 5 | 14 | 2.2× | 1 | Attack knocks back target enemy ATB −30% |
| *Bow* (later) | 8 | 10 | 0.7× | 1 | Every attack also hits a 2nd enemy for 50%; long words (8+) give +50% word bonus |
| *Tome* (later) | 7 | 7 | 0.6× | 1 | Each attack heals 3% HP; Guard words give +20 ATB |

**Worked example (Sword, Pace 35, 5-letter words, 92% accuracy, ~Combo 10):**
- Per Perfect word: (10 + 5×8×1.2) × 1.25 = **72.5 ATB**. An imperfect word gives ≈ 58.
- Effective typing speed during combat is about 2.4 chars/s once reading and target switching are counted, so ~2.1 s per word.
- That works out to **one auto-attack every ~3 s**, and around 20 attacks per minute.
- At 70 WPM the same math gives an attack every ~1.5 s. Faster players clear faster, but enemy intervals also shrink by (35/70)^0.7 ≈ 0.62×.

Hammer at the same pace attacks about every 5 s but hits for 2.2× and staggers. It feels like a heavy rhythm where you can "hold" the gauge timing. Dagger attacks about every 2.2 s for two small hits, so it feels like a constant flurry.

### 2.3 Active skills: auto-cast via a "Word Charge" cooldown
- Each of the 2 active slots has a **cooldown measured in words, not seconds** (e.g., "Charge 8"). Each completed plate adds 1, a Perfect word adds 1.5, and Staff multiplies by 1.5.
- When charged, the skill **auto-casts at the next sensible moment**, using simple rules: heals wait until HP < 60%, AoE waits until ≥ 2 enemies, interrupts wait for an enemy telegraph. A tiny toggle lets the player set "Cast ASAP" vs "Smart" per slot.
- Why words and not seconds: idle time never charges skills (it's a typing game), slow typists aren't punished relative to the content they actually type, and it's easy to read ("8 more words → Fireball").
- Skill icons around the hero portrait fill like rune circles. A full ring pulses.

### 2.4 Solo hero vs. party
**Recommendation: one hero for MVP. Add a Companion slot from Chapter 6 (proposal).**
- A single hero keeps visual focus where the words are. Octopath's 4-person party would split attention and bloat the UI.
- The **Companion** is a non-typing ally with its own slow ATB, filled **by the player's Combo tier** (Bronze 0.5×, Gold 1.5×). That makes the companion a reward for consistency. Companions have one fixed skill each (e.g., the Cleric heals 10% on every fill, the Archer focuses the lowest-HP enemy). Companions are also an obvious collection/monetization layer without any pay-to-win typing advantage. The economy agent should cap their power.

---

## 3. Skills, Passives, Weapons

### 3.1 Active skills (16) — 2 equipped, auto-cast
| # | Skill | Charge (words) | Effect | Typing hook |
|---|---|---|---|---|
| 1 | **Slash Wave** | 8 | 1.5× ATK to all enemies | — |
| 2 | **Piercing Thrust** | 6 | 2.5× ATK to Focus, ignores shields | Long plates (8+ chars) count as 2 charge |
| 3 | **Fireball** | 10 | 2× magic + Burn 6 s | Burn doubles if cast at Combo ≥ 15 |
| 4 | **Frost Lock** | 9 | Freezes all enemy ATB 4 s | — |
| 5 | **Mending Light** | 12 | Heal 25% HP | Smart-casts below 60% HP |
| 6 | **Aegis** | 10 | Shield absorbs next 2 hits | — |
| 7 | **Interrupt Bolt** | 7 | Cancels the next enemy telegraph (auto Perfect Parry) | Waits for a telegraph |
| 8 | **Spell Echo** | 14 | Next 3 completed plates each deal a full Word Strike ×3 | — |
| 9 | **Tempo Surge** | 10 | ATB charge ×2 for 6 s | Best with Swift typists |
| 10 | **Chain Lightning** | 11 | Bounces 4×, 0.8× each | — |
| 11 | **Reveal** | 6 | Removes plate gimmicks for 8 s (unscrambles Mimics, solidifies Ghosts) | Anti-gimmick utility |
| 12 | **Execution** | 8 | Kills a non-boss under 20% HP; otherwise 2× | — |
| 13 | **Word Storm** | 16 | 10 hits of 0.3× spread across enemies; +1 hit per 5 Combo | Scales with Combo |
| 14 | **Steal** | 7 | 1.2× damage + bonus gold/material drop | Economy-flavored |
| 15 | **Taunt Break** | 9 | Strips armor/shield phase from Focus | Counter to Armored/Shielded |
| 16 | **Second Pulse** | 12 | Refills hero ATB to 100 instantly | — |

### 3.2 Passives (20) — 3 equipped
| # | Passive | Effect |
|---|---|---|
| 1 | **Clean Cut** | Perfect words: +10% crit chance on the next auto-attack |
| 2 | **Bulwark Streak** | Every 10 Combo: gain a 1-hit shield |
| 3 | **Steady Hands** | First typo in each encounter does not crack Combo |
| 4 | **Long Reach** | Plates of 8+ chars give +50% word bonus |
| 5 | **Quick Study** | Words from your Weak list give double ATB and +1 skill charge |
| 6 | **Riposte** | Perfect Parry counter deals 150% instead of 50% |
| 7 | **Iron Will** | Block reduces damage to 0.1× instead of 0.2× |
| 8 | **Momentum** | ComboMult cap raised to ×1.7 |
| 9 | **Capital Gains** | Each capital letter typed correctly: +3 ATB |
| 10 | **Punctuator** | Each punctuation mark typed correctly: +4 ATB, +2% damage (stack 10, resets per encounter) |
| 11 | **Swiftblade** | Swift threshold lowered to 1.15× Pace |
| 12 | **Vampiric Ink** | Auto-attacks heal 2% of damage dealt per Combo tier |
| 13 | **Opening Gambit** | Start each encounter with 50 ATB |
| 14 | **Last Stand** | Under 30% HP: ATB charge +40% |
| 15 | **Scholar** | +1 charge to all skills for every "New word" plate (first time seen) |
| 16 | **Focus Fire** | Consecutive plates on the same enemy: +5% damage per plate (max +40%) |
| 17 | **Ricochet** | Word Strike also hits a random other enemy for 50% |
| 18 | **Calm Mind** | Enemy telegraph windows +0.5 s |
| 19 | **Treasure Sense** | +15% gold; chests show one extra item choice (economy agent to cap) |
| 20 | **Comeback** | After a typo, your next Perfect word restores half the Combo lost |

Passives are tagged by playstyle (**Precision / Speed / Defense / Tech / Economy**). Players should naturally build "a precision build" or "a punctuation build", and each style teaches a typing habit.

### 3.3 Weapon archetypes and how they change play
- **Sword:** all-rounder. Rewards guarding well (Parry → Combo). Default starter.
- **Dagger:** high tempo. Feels great at high WPM and suits players who want constant feedback. Weak against Armored (low per-hit damage).
- **Staff:** you are the skill engine. Low auto damage but skills cycle about 1.5× faster. Suits accurate, steady typists (Perfect words feed skills).
- **Hammer:** slow, heavy, stuns enemy ATB. Suits slower or deliberate typists, and it's the **recommended beginner alternate**: fewer attacks, but every one matters and staggers the enemies that would pressure them.
- Weapons have rarity tiers and may roll one **affix** (e.g., "of Echoes: Perfect word 5% chance to double Word Strike"). Values belong to the economy agent.

---

## 4. Enemy Design

### 4.1 Archetypes with typing mechanics
| Archetype | Plate mechanic | Combat role | Intro chapter |
|---|---|---|---|
| **Grunt** | Normal word | Baseline | 1 |
| **Brute** | Normal word, slow heavy attack (guard is worth it) | Teaches guarding | 1 |
| **Shielded** | Shield breaks only on a **long word (8+)** plate; then normal plates | Teaches long words | 3 |
| **Speedster** | Short words, **attack interval 5 s**, short guard window | Pressure | 4 |
| **Mimic** | Plate letters **scrambled** while unlocked; they unscramble as you type the correct first letter (you must know the word) | Vocabulary recognition | 5 |
| **Ghost** | Plate **fades** 1.5 s after appearing; letters reappear one at a time on correct input | Memory / reading speed | 6 |
| **Healer** | Heals allies 15% every 10 s; plate shows a ✚ icon | Priority target | 4 |
| **Splitter** | On death splits into 2 minis with 2–3-letter plates | Burst typing | 7 |
| **Armored** | Only takes damage from plates containing **capitals or punctuation** ("Iron.", "McGuire") | Teaches shift/punctuation | 13 |
| **Mirror** | Plate is shown **reversed** ("drow"); you type the real word | Fun twist; later chapters | 15 |
| **Caster** | Telegraphs a spell with a **Guard sentence** (5–8 words); fail = AoE + debuff | Sentence typing under pressure | 19 |
| **Bomber** | Plate has a 6 s fuse; if it's not completed, explodes for big damage but dies | Priority/triage | 9 |
| **Leech** | Each typo you make heals it 5% | Punishes sloppiness (mild) | 10 |
| **Numerologist** | Plates contain numbers/dates ("1,250", "3:45 pm") | Number row practice | 20 |
| **Echo Twins** | Two enemies share the same plate; must be typed twice in a row (once each) | Rhythm | 12 |
| **Lexicon Slime** | Plate grows by 1 letter each time it attacks ("run" → "runs" → "runner") | Morphology learning | 8 |

**Gimmick budget:** at most **2 distinct gimmicks per encounter**, and a new gimmick is always introduced **alone** first with a one-line tutorial banner ("Ghost words fade! Start typing to reveal them.").

### 4.2 Boss pattern
Every boss uses a **three-phase template** (proposal):
1. **Phase 1 (100–66% HP):** normal plates + 1 gimmick from the chapter + 1–2 adds.
2. **Phase 2 (66–33%): "Incantation."** The boss periodically casts a **Doom Spell**: a full sentence shown across the top of the screen with a timer (`timer = chars / (Pace_cps × 0.8) + 2 s`). Finish it to cancel the spell and stagger the boss for 4 s (all damage ×1.5). Fail and the spell hits hard but isn't lethal (≤ 40% max HP).
3. **Phase 3 (<33%): Signature minigame**, unique per boss (below). After that, a **Finisher**: the boss's "true name" or a chapter quote, typed for a cinematic kill (HD-2D camera tilt, depth-of-field zoom).

Phase transitions are hard gates: chip damage can't skip a phase. Each transition gives a 2 s breather plus a heal pickup.

### 4.3 Ten boss concepts (for chapter bosses; later chapters remix and escalate them)
| # | Boss / Biome | Signature mechanic |
|---|---|---|
| 1 | **Gorrak the Gatekeeper**, Meadow Village (Ch1) | Tutorial boss. Big slow guard telegraphs; Doom Spell is a 4-word sentence. Finisher: "Open the gate!" |
| 2 | **The Whispering Willow**, Haunted Forest | Leaves rain down carrying letters; type the falling words before they hit the ground (rain minigame). Ghost-plate adds |
| 3 | **Captain Brine**, Pirate Coast | **Call-and-response shanty:** boss sings a line, you type the response line in rhythm (beat markers give a Swift bonus) |
| 4 | **Sphinx of Sand**, Desert Ruins | **Riddle phase:** a riddle is shown; pick and type one of 3 answer words (wrong answer = mild hit). Vocab/meaning check |
| 5 | **Mirror Queen**, Crystal Caves | Spawns reflections with reversed plates; only the real one's plate is un-mirrored. Mirror archetype climax |
| 6 | **Clockwork Colossus**, Steam City | **Numbers & symbols:** gears show times/dates/prices; Armored plating breaks only on punctuation |
| 7 | **The Librarian Lich**, Forbidden Archive | **Quote phase:** famous public-domain quotes; each correct clause tears a page from its spellbook (visual shield) |
| 8 | **Twin Dragons Ember & Frost**, Volcano/Glacier | Two bosses with alternating telegraphs; the Guard word for one is the attack word for the other. Targeting mastery |
| 9 | **The Scrambler**, Chaos Carnival | Mimic master. Plates scramble every 3 s; Reveal skill is strong here. Final phase: unscramble an idiom |
| 10 | **The Silent Author**, Tower of Words (Ch30) | Uses every earlier gimmick in sequence. Final phase: type the opening line of the game's own story as the Finisher. Narrative payoff |

Bosses 11–30 reuse these signatures with new skins plus a second gimmick layered on, and they are tuned up through word tier (section 5).

---

## 5. English Learning Content

### 5.1 Word tiers by chapter (proposal)
| Chapters | Tier | Content | Example plates |
|---|---|---|---|
| 1–3 | T1 | Top 500 English words, 3–5 letters, lowercase | `cat`, `run`, `house` |
| 4–6 | T2 | Top 1000, up to 7 letters | `friend`, `window`, `answer` |
| 7–9 | T3 | Top 2000, 6–10 letters, common suffixes (-tion, -ly, -ness) | `adventure`, `quietly` |
| 10–12 | T4 | Two-word collocations / phrasal verbs | `heavy rain`, `give up` |
| 13–15 | T5 | **Capitals**: proper nouns, sentence starts, days/months | `Monday`, `New York`, `The end` |
| 16–18 | T6 | **Punctuation**: `, . ' - ? !`, contractions | `don't`, `well-known`, `Wait!` |
| 19–21 | T7 | Short sentences (5–8 words), **numbers** | `I have 3 cats.` |
| 22–24 | T8 | Academic Word List / CEFR B2 vocabulary | `significant`, `analyze` |
| 25–27 | T9 | Idioms, phrasal verbs with meaning | `break the ice`, `on the fence` |
| 28–30 | T10 | Proverbs, public-domain quotes, symbols (`; : " ( )`) | `"Knowledge is power."` |

**Mix rule (proposal):** each level draws **60% current tier, 20% previous tiers (review), 15% biome-themed words, 5% Weak-list words**. Guard words always come from T1.

### 5.2 Themed biome vocabulary
Each chapter has a curated set of 60–120 themed words, for example:
- Pirate Coast: `anchor`, `harbor`, `compass`, `treasure`, `storm`
- Steam City: `engine`, `factory`, `pressure`, `invention`
- Forest: `branch`, `mushroom`, `owl`, `moss`, `lantern`

Themed words are tagged by CEFR level so the tier rules still apply. Enemy names also double as vocabulary ("Wolf", "Lantern Wisp").

### 5.3 Post-battle learning card
After each level, the **Word Journal** results screen shows:
- "New words" (first time seen): definition (simple English), **optional L1 translation** (Thai, Japanese, Spanish, etc., chosen in settings), an example sentence, and TTS pronunciation 🔊.
- "Weak words": words typo'd this level, with the problem letters highlighted (`rec**ie**ve` → `rec**ei**ve`).
- A 3-second skip is always available. Learning cards are **never forced** beyond one tap.

### 5.4 Spaced repetition: the Weak Words list
- A word enters the Weak list after a typo in it, or if it was typed at < 50% of Pace.
- Leitner boxes 1–5. A word is promoted after a Perfect typing and demoted on a typo. Review intervals: 1, 2, 4, 8, 16 levels played.
- Due words get injected into plates (5% mix; up to 15% in the **Training Grounds**, a no-fail practice arena made of Weak-word enemies that gives small XP).
- Mastering a word (leaving box 5) adds it to the **Lexicon collection** (a Pokédex-like meta collection with completion rewards). This makes learning a collectible.

### 5.5 Difficulty knobs (used by the level generator)
| Knob | Range | Notes |
|---|---|---|
| Word length | 3–14 chars | avg tracked per level |
| Frequency rank | top 300 → top 10,000 | rarer = harder |
| Capitals | 0–40% of chars | |
| Punctuation | 0–15% of chars | |
| Numbers/symbols | 0–10% | |
| Plate length | 1 word → 12-word sentence | |
| Gimmick density | 0–2 per encounter | |
| Enemy interval multiplier | 0.6×–1.8× | Pace-adaptive |

A **Level Difficulty Score** combining these (proposal: `LDS = avgLen×1 + rarityTier×2 + caps%×0.3 + punct%×0.5 + gimmicks×3`) should rise smoothly, with a **saw-tooth**: dip at each chapter start, peak at the boss.

---

## 6. Level Pacing (reference player: 35 WPM)

Effective combat typing is about 2.4 chars/s, roughly one 5-letter plate every 2.1 s.

### 6.1 Normal level (3 encounters), target ~2:40
| Time (s) | Beat |
|---|---|
| 0–6 | Auto-walk intro; chapter/level banner; parallax HD-2D scenery |
| 6–8 | Enemies appear, plates fade in ("Ready… Type!") |
| 8–40 | **Encounter 1**: 2 Grunts + 1 Brute (≈15 plates, ≈10 attacks, 1–2 guards) |
| 40–45 | Rewards drop: gold coins burst and get auto-collected, item pops |
| 45–53 | Scene-break walk (+25% HP regen, a word-of-the-day signpost sometimes appears; typing it gives bonus gold) |
| 53–95 | **Encounter 2**: 3 enemies incl. chapter gimmick (≈18 plates) |
| 95–100 | Rewards |
| 100–108 | Walk |
| 108–155 | **Encounter 3**: "elite" group, e.g. Healer + 2 (≈20 plates) |
| 155–165 | Mission End: chest, star tally, Word Journal |

About **55–65 plates per level** (~300 chars), which is a meaningful practice session. Early levels (1–20) use 2 encounters, ~1:45.

### 6.2 Boss level (chapter end), target ~4:00
| Time (s) | Beat |
|---|---|
| 0–8 | Walk, ominous music shift, boss silhouette in background |
| 8–50 | Wave 1 (adds) |
| 50–60 | Rewards + walk to arena; boss intro dialogue (typed "taunt reply" optional for bonus) |
| 60–110 | Boss Phase 1 |
| 110–112 | Phase transition breather |
| 112–175 | Phase 2: 2–3 Doom Spells (sentences of 6–10 words) |
| 175–177 | Transition |
| 177–225 | Phase 3: signature minigame |
| 225–235 | Finisher sentence + cinematic |
| 235–250 | Loot chest, stars, chapter-clear story beat |

### 6.3 Star rating (per level)
- ★ **Clear** the level.
- ★★ **Accuracy** ≥ threshold: 90% in Ch1–10, 93% in Ch11–20, 95% in Ch21–30 (proposal).
- ★★★ **Level Challenge**, rotating per level so 300 levels don't feel samey:
  - "Untouched": take ≤ 1 hit
  - "Par Time": finish under `ParTime` computed from *your* Pace (so it's fair at any WPM)
  - "Streak": reach Combo 30
  - "Guardian": 5 Perfect Parries
  - "No Skills": win without active skills firing

Stars are independent: you can earn the 3rd star without the 2nd and collect them on separate runs.
**Replay value:** star totals unlock chests per chapter (10/20/30 stars). Replays also feed the SRS, so replaying old levels injects your current Weak words. **Hard mode** (+1 tier of words, Strict combo) unlocks per chapter after 30 stars.

---

## 7. Survival Mode (endless)

### 7.1 Rules
- Continuous waves with **no scene-break heal**, only +10% HP between waves.
- Every wave: 2–5 enemies. **Every 5 waves**: card draft. **Every 10 waves**: a mini-boss (a remixed story boss, phase 2 only). **Every 25 waves**: biome shift (new vocabulary + gimmick pool).
- Uses the **player's equipped gear**, but **ranked runs normalize gear** to a fixed "Survival Kit" stat line (choose weapon archetype + passives only). That keeps leaderboards skill-based, not wallet-based.

### 7.2 Scaling (proposal)
- Enemy HP ×(1 + 0.08 × wave). Enemy interval ×max(0.55, 1 − 0.012 × wave).
- Word tier starts at T1 and rises one tier every 8 waves, capped at T10. After wave 80, everything mixes.
- Gimmick count: 0 (waves 1–5), 1 (6–20), 2 (21+), plus elite modifiers after 40.

### 7.3 Between-wave roguelite cards (pick 1 of 3)
Examples:
- **Glass Quill:** +60% damage; typos deal 3% max HP to you.
- **Metronome:** Swift words give +15 ATB.
- **Lexicographer:** long words (8+) appear 2× as often and give +1 skill charge.
- **Second Heart:** one extra Second Wind.
- **Capital Punishment:** Armored enemies take double damage from capitals.
- **Patience:** enemy intervals +15%, your ATB −10%.
- **Echo Skill:** your first active skill casts twice.
- **Clean Slate:** heal 40%.

There are 3 rarities and roughly 40 cards at launch. Cards stack into builds, which gives each run a different story.

### 7.4 Score and leaderboards
- `Score = Σ(chars typed correctly × ComboMult) × accuracy² + 500 × waves cleared + boss bonuses` (proposal). Squaring accuracy makes mashing worthless.
- Leaderboards: **highest wave** (primary display) and **score**. Brackets are split by **Pace band** (≤30, 31–50, 51–70, 71+ WPM), so learners compete with peers. Boards are also Friends, Global, and Weekly.
- **Daily Seed Run:** same word sequence and card offers for everyone, 1 ranked attempt per day plus unlimited practice.
- **Anti-cheat:** server-side replay validation of keystroke timing. Flag runs with inhuman inter-key consistency or > 200 WPM sustained, and block paste/IME injection.

### 7.5 Anti-frustration
- **Checkpoint starts** (unranked): begin at wave 11/21/31 once you've reached it.
- Death screen shows "Personal best progress" and Weak words gained. The run still pays gold (economy agent: pay per wave with diminishing returns) and feeds the SRS.
- Rewards are never gated behind leaderboard rank, only behind personal milestones.

---

## 8. Accessibility & Difficulty

- **Difficulty presets:**
  - **Story** (enemy intervals ×1.4, guard window +1 s, Gentle combo)
  - **Standard**
  - **Hard** (Strict combo, +1 word tier)
  - **Custom** sliders: enemy speed 50–200%, guard window, typo penalty, word tier offset ±2, allow Backspace
- **Zen Mode:** enemies don't attack. No stars beyond ★1, but full gold at 50% and full learning. Ideal for pure practice and for younger or anxious learners.
- **Visual:**
  - Telegraphs use **shape + icon + color** (jagged red shield banner with an "!" glyph).
  - Color-blind palettes (Deuteranopia/Protanopia/Tritanopia).
  - High-contrast plate mode (black on white, no parchment texture).
  - Font options: default pixel-serif, a clean sans, and a **dyslexia-friendly font**. Plate text size 100–200%.
  - Reduce-motion toggle (screen shake, parallax, flashes).
- **Keyboard layouts:** matching uses the produced **character** (`key`), not the physical key code, so QWERTY/AZERTY/QWERTZ/Dvorak/Colemak work automatically. Settings include a layout picker for the optional on-screen keyboard hint overlay (shows the next key's finger position, which is great for beginners). Dead keys and IME are handled for accented characters, though story content is ASCII-only by default.
- **Input options:** "Ignore case" toggle for beginners. The Armored archetype is then disabled or replaced. Optional "Space required between words" for players who want monkeytype-style habits.
- **Audio:** TTS reads plates aloud as an optional listening practice mode. Separate volume sliders.
- **Session friendliness:** pause anytime (Esc twice). Levels autosave between encounters.

---

## 9. Top 5 Risks to Fun & Mitigations

| # | Risk | Why it hurts | Mitigation |
|---|---|---|---|
| 1 | **Split attention:** players stare at plates and miss the beautiful HD-2D action, or watch the action and lose typing flow | Combat feels like a spreadsheet; art is wasted | Plates sit **on** the enemies at eye level. Hit feedback is peripheral (screen flash, hit-stop ≤ 60 ms, sound). Big moments (crits, skills, finishers) get a 0.3 s slow-mo that doesn't block input. Playtest eye-tracking with a simple webcam heatmap |
| 2 | **Skill-gap extremes:** 15 WPM players overwhelmed, 100 WPM players bored | Lose both ends of the audience | Pace-adaptive enemy intervals + personal ParTime. Difficulty sliders, Zen mode, Pace-bracketed leaderboards. Re-calibrate Pace automatically, with a manual override |
| 3 | **"Auto-battle" passivity:** auto-attacks + auto-skills make players feel like spectators | No agency, so no engagement | Agency comes from **target choice** (Focus), **guard timing**, **priority enemies** (Healer, Bomber, Caster), and **build choices** (weapon × 2 skills × 3 passives). Smart/ASAP toggle per skill. Bosses demand active interrupts (Doom Spells) |
| 4 | **300-level monotony:** "type words, hit monster" repeated forever | Churn mid-game | New archetype or gimmick roughly every 1–2 chapters. Rotating 3rd-star challenges. Boss signatures. Word-tier progression that *feels* like leveling up in English. Biome vocab. Lexicon collection. Companions from Ch6. Hard mode replays |
| 5 | **Learning vs. punishing tension:** strict typo rules cause anxiety; obscure words feel unfair; or content is so easy nobody learns | Learners quit, or the "learning game" promise is hollow | Gentle combo (halve, not reset). No Backspace needed. Guard words always easy. Weak-word SRS turns mistakes into collectible progress. Definitions/L1 tooltips. CEFR-graded word lists curated by hand (no random dictionary dumps, profanity-filtered). Accuracy-weighted rewards so careful learners are strong |

---

## 10. Open Questions for Other Agents
- **Economy:** HP curve vs. expected attacks per encounter. Target ≈10 hero auto-attacks per normal encounter at Pace 35 with on-curve gear. Gold per plate vs. per kill. Survival payout curve. Companion power cap.
- **Content:** sourcing CEFR-tagged word lists and public-domain quotes; L1 translation licensing.
- **Tech:** keystroke timing precision in the browser (`performance.now()`), replay validation for Survival, IME handling.
