# HD-2D Typing RPG — Design Overview (synthesis)

This file summarizes four brainstorm docs and records how their conflicts are resolved. The details are in each doc:

| Doc | Owner | Scope |
|---|---|---|
| `01-combat-and-levels.md` | Combat designer | Typing→combat mapping, ATB, skills/passives, enemies, bosses, word content, Survival |
| `02-economy-and-balance.md` + `sim/` | Economist | Monte-Carlo sim of 3 personas × 300 levels, gold/gear/chests/gems |
| `03-meta-monetization-backend.md` | Live-ops + backend | Cosmetics, lootboxes, missions, achievements, leaderboards, Cloudflare Workers + D1 |
| `04-art-vfx-sfx-research.md` | Technical artist | HD-2D rendering, VFX, SFX research (v2 POC in progress) |

POCs: `poc/hd2d-poc.html` (v1, Canvas 2D) and `poc/hd2d-poc-v2.html` (WebGL diorama, in progress).

## 1. Pillars
1. **Typing is the weapon.** Every correct key charges the ATB gauge. Accuracy adds damage; it never feels like a punishment.
2. **Learning first.** Words get harder in tiers, and mistyped words come back by spaced repetition. There is no energy system.
3. **Spectacle.** The visuals aim for the Octopath HD-2D standard: diorama depth, firelight, and effects you feel on every hit.
4. **Fair monetization.** Gems buy cosmetics, convenience, and a revive. Ranked modes use standardized gear.

## 2. Core loop (locked)
- **Level:**
  - Auto-walk, then the encounter, then type to fight, then loot, then a short walk.
  - Normal levels have 3 encounters (2 in chapter 1). Boss levels have waves plus the boss.
  - At 35 WPM a normal level takes about 2:45 and a boss level about 4:10.
- **Targeting:** each enemy shows a word, and visible words start with different letters, so the first key picks the target. There's no Backspace, Space, or Enter.
- **ATB:**
  - It fills only from correct characters, at a rate set by the weapon and the combo multiplier (capped at ×1.5), plus a word bonus. A perfect word gives ×1.25.
  - About 11 auto-attacks per encounter at 35 WPM.
  - Each finished word also deals a chip hit.
- **Defense:** 2.5 s before an enemy attacks, its word becomes a red guard word. Typing it blocks; typing it perfectly parries.
- **Skills:** 2 actives charge per word and auto-cast, plus 3 passives. Solo hero; a non-typing companion arrives in chapter 6.
- **Structure:** 30 chapters × 10 levels, with a boss at every L10 and 10 word tiers (top-500 words up to proverbs and quotes).
- **Survival:** endless waves with a pick-1-of-3 roguelite card every 5 waves. Ranked runs use standardized gear, a daily seed, and leaderboards split by speed band.

## 3. Conflicts resolved (adopting the economist's resolutions unless noted)
| # | Conflict | Resolution |
|---|---|---|
| C2 | Survival never ends for fast typists | Enemy ATK +2% per wave; between-wave heal 12% |
| C3 | Skill damage in 01 makes skills >50% of DPS | Reduce damage skills by about 40%. Target: skills 15–20% of damage |
| C4 | Boss Doom Spell is a pure skill wall | Failed Doom Spell = 15% of *par* HP, so armor helps |
| C5/C6 | Flat mission gold and Satchel price in 03 | Express all of them in Gold Units that scale with the chapter (1 GU = frontier ch L1 clear gold); Satchel = 25 GU |
| C7 | Weekly "Survival wave 30" too hard | Wave 20 (or "beat your 4-week median") |
| C8 | Published Legendary rate wrong | Publish **3.16%** effective (with pity) |
| C10 | Revive HP unspecified | Gem revive 50% HP; free Second Wind 30% |
| C11 | ★★ accuracy gate locks out Beginners | ★★ = match your own 7-day median accuracy (88–97%). +1 pt would make ★★ a ~20% roll per attempt (C12), so it is reserved for Hard mode with absolute gates |
| C1 | Enemy HP does not adapt to typing speed | Keep it (fast players save time, slow players get more practice). Tunable via `HP_PACE_EXP` |

## 4. Key numbers (from sim)
| Metric | Beginner (20 WPM) | Average (40 WPM) | Fast (75 WPM) |
|---|---|---|---|
| Story completion (v2 sim) | 39.8 h | **18.8 h** | 14.6 h |
| 100% (900 ★) | — | ~44 h | — |
| First-try clear all / boss | 81% / 55% | 97% / 88% | 99% / 92% |
| Survival mean wave | ~19 | ~22 | ~29 |

- **Gold:**
  - Gear prices rise ×1.405 per tier, and upgrades cost 25% of the Common price × 1.3^level.
  - New gear inherits half the old upgrade levels.
  - Replays pay 40%, capped at 40 a day.
  - Average players spend 98% of the gold they earn, so there is no inflation.
- **Chests:**
  - Each normal encounter has a 30% drop chance: Wooden 72%, Iron 24%, Gold 3.5%, Mythic 0.5%.
  - Bosses always drop one: Iron 55%, Gold 38%, Mythic 7%.
  - Gold and Mythic chests now drop Gear Caches instead of rolling gear directly, and Epic and Legendary gear comes only from caches.
- **Gear Caches:**
  - They cost 14 GU of Gold or 50 gems, with gem purchases capped at 1 per day.
  - Fixed odds: Common 40 / Uncommon 33 / Rare 20 / Epic 6 / Legendary 1.
  - Published pity: Rare+ within 8, Epic+ within 30, Legendary by 120.
  - Average opens about 62 over the story.
- **Season pass:** 950 gems ($9.99 bundle), 40 tiers, cosmetic only, returns 50 gems. Free players can afford it each season.
- **Gems:**
  - Free players earn about 192 a week, capped at 250 on the server, which is about 5 standard boxes a month.
  - Standard box 160 gems, featured box 200, revive 30.
  - Pity: an Epic or better every 10 boxes, and a Legendary by box 60 (50 for the featured box).

## 5. Backend scope (Cloudflare Workers + D1)
- **The server owns:** the gem ledger (append-only, idempotent), purchases (Paddle webhooks), items bought with gems, pity counters, and leaderboards.
- **The client owns:** a versioned save blob holding gold, gear, and story progress. Saves are revision-checked and return 409 on conflict, which the client merges.
- **Auth:** an anonymous device account first, then email magic link or OAuth. A linked account is required before buying gems.
- **Anti-cheat:**
  - The server gives each run a signed seed, and the client uploads a keystroke-timing log.
  - The Worker re-runs the fight in a shared TypeScript simulation and flags inhuman typing timing.
- **Leaderboards:** the top 100 is cached in KV and refreshed every 60 s.

## 6. Decisions made (2026-10-08)
1. **Story length: ~20 h story** (300 levels × 2–4 min), with ~42 h for 100% completion plus Survival and Hard mode for longevity. There is no forced grind.
2. **Level-matched gear lootboxes: YES.** The product owner loves random items. Design:
   - **Gear Caches** roll weapons and equipment at the player's *frontier chapter tier* (the highest chapter unlocked), so the loot is never obsolete. Rarity rolls on fixed published odds.
   - The main currency is **Gold** (a gold sink priced in GU, which scales with chapter), and they also come from chests and missions (not the season pass).
   - A Gem price is allowed. It isn't pay-to-win where it matters because ranked Survival, Boss of the Week and the WPM Trial use standardized gear; Gem caches only speed up story PvE. Keep a daily purchase cap.
   - Epic and Legendary gear come from Gear Caches at low fixed rates (see §4; re-simulated in v2, with no power inflation).
3. **Lootboxes are kept with FIXED published rates.** The odds never change per player or over time. Pity counters stay as a published guarantee on top, not as hidden rate changes. Region and minor restrictions from doc 03 still apply.
4. **Season pass: YES, COSMETIC ONLY.**
   - 8-week seasons matching leaderboard seasons, with a free track and a premium track (Gems).
   - XP comes from typing activity (words typed, missions), never from purchases.
   - **No gear, no Gear Caches, no Gold** on either track. The gear economy stays exactly as simulated.
   - **Free track:** Ink Shards, profile items (badges, card backgrounds), and 1–2 headline cosmetics.
   - **Premium track:** themed season cosmetics (aura, typing trail, keyboard sound pack, name color, frame, victory pose, pet). It also returns about **50 Gems** in total, a small bonus that does not fund the next pass.
   - Exclusive leaderboard cosmetics stay earn-only.
5. **Platform: DESKTOP ONLY** (a physical keyboard is required). Target 16:9 layouts at 1280–2560 px. There is no mobile or touch support; the game shows a "please use a keyboard" screen on touch devices.

6. **Tech stack: three.js + TypeScript (decided 2026-10-09).**
   - Reasons: web-first; Godot's web export only gets the Compatibility renderer (weaker HD-2D post effects) and a ~30–40 MB download; the combat sim is shared with the Cloudflare Workers anti-cheat and the balance sim; payments, auth and leaderboard UI are native web.
   - Content tools: Aseprite for sprites (+ normal and emissive maps), LDtk or Tiled for level layout, all loaded from JSON.
   - A possible later Steam build would wrap the web game with Tauri or Electron, not port it to Godot.

## 6b. Remaining open decisions
1. Companion system timing (chapter 6) and the Hard mode scope.
3. ~~Gear Cache Gem price and daily cap~~ settled: 50 gems, 1 per day (C13 approved).

## 6c. v2 sim follow-ups (adopted unless noted)
- **C13 (APPROVED by PO 2026-10-09):** gem caches at the 1/day cap (~$12–13/month) save a Beginner ~7 h (18%), the biggest pay-for-speed effect. Average saves 6% and Fast 0%.
- **C14:** doc 03's self-renewing pass is superseded by §6.4. Doc 03 §2.5 needs updating.
- **C16:** the shop becomes the *deterministic fallback*: players pick slot and rarity at a premium price, while caches are the main gear source.
- **C17:** from word tier T4 on, skills charge per 5 typed characters (not per word), which keeps the skill damage share at 15–20%.

## 7. Suggested next steps
1. Approve or adjust the §6 decisions.
2. Review the v2 art POC, then lock the art pipeline (Aseprite sprites plus normal maps, palette, resolution).
3. Write a shared TypeScript combat-sim package (used by the client, the server anti-cheat, and the balancing sim). Port `economy_sim.py` formulas into it.
4. Build the vertical slice: chapter 1 (10 levels + boss), the shop, chests, save/load, and one leaderboard on Workers + D1.
5. Content pipeline: word-tier lists, biome vocab, definitions and translations.
