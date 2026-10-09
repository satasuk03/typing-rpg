# 03 — Meta Systems, Monetization & Backend

Scope: cosmetics, lootboxes, daily/weekly loops, achievements, leaderboards with anti-cheat, the Cloudflare (Workers + D1) backend, retention and onboarding, and ethics. All numbers are first-pass and need tuning by the economy pass. Legal points need review by counsel before launch.

**Core principle:** money only buys *looks* and *convenience-neutral* items. Anything that affects typing practice or combat power (gear, skills, passives, levels) is earned by playing. Premium revive is the one paid item that touches gameplay, so it is limited and also has a free path (see §7).

---

## 1. Cosmetics System

### 1.1 Rarity tiers

| Tier | Color | In lootboxes? | Notes |
|---|---|---|---|
| Common | Silver-grey | Yes | Recolors, simple shapes |
| Rare | Azure | Yes | Animated accents |
| Epic | Violet | Yes | Full animation + particles |
| Legendary | Gold | Yes (low rate) | Unique VFX/SFX, reacts to typing (combo, crits) |
| Exclusive | Prismatic | **Never sold** | Earned only: top leaderboard placements, hard achievements, events. These are prestige items and must stay non-purchasable. |

### 1.2 Categories, where they show, and examples

Display surfaces: **LB** = leaderboard row, **PC** = profile card (opened from LB or friends), **BT** = in battle, **UI** = menus/typing area.

| Category | Seen on | Example items (C/R/E/L/X = Common/Rare/Epic/Legendary/Exclusive) |
|---|---|---|
| **Player Card** (profile background art) | PC, LB (thin banner strip) | Parchment Road (C), Harbor Dawn (C), Lantern Festival (R), Crystal Archive (R), Clockwork Tower (E), Sunken Library (E), Starfall Observatory (L), The Last Page (L), Quill & Thunder (X, Season 1 top 100), Founder's Map (X, launch window) |
| **Badge** (small icon next to name) | LB, PC | Ink Drop (C), Fox Seal (C), Bronze Quill (R), Comet (R), Owl Sigil (E), Twin Moons (E), Golden Keycap (L), Phoenix Feather (L), 200 WPM Crown (X, achievement), Centurion (X, 100-day streak) |
| **Profile Frame** (border around avatar) | LB, PC | Oak Ring (C), Iron Rivets (C), Vine Wreath (R), Frost Lattice (R), Runic Circle (E), Clockwork Gears (E), Dragon Coil (L), Aurora Halo (L), Champion's Laurel (X, weekly #1), Lexicon Master (X, all achievements) |
| **Aura** (glow/particles around hero) | BT, PC preview | Ember Motes (C), Soft Glow (C), Falling Leaves (R), Snow Drift (R), Arcane Glyphs (E), Storm Static (E), Inkstorm (L, letters swirl as you type), Celestial Choir (L), Perfect Form (X, 100% accuracy on a boss), Endless Flame (X, Survival wave 200) |
| **Name Color** | LB, PC, chat-less social surfaces | Sky (C), Moss (C), Coral (R), Amethyst (R), Two-tone Dusk gradient (E), Sea Glass gradient (E), Animated Sunrise (L), Shifting Prism (L), Champion Gold (X), Glitch-free White (X, verified anti-cheat-clean top 10) |
| **Title** (text under name) | LB, PC | "Apprentice Scribe" (C), "Home-row Hero" (C), "Swift Fingers" (R), "Typo Slayer" (R), "Wordsmith" (E), "Night Owl" (E), "Keeper of Keys" (L), "The Unerring" (L), "Grand Lexicon" (X), "Season 1 Vanguard" (X) |
| **Typing Cursor / Trail** (caret + letter-confirm effect in typing box) | UI, BT | Blink Bar (C), Underscore Classic (C), Feather Quill (R), Ember Caret (R), Sparkle Trail (E), Ink Splash on word complete (E), Lightning Caret (L), Sakura Burst on perfect word (L), Golden Stylus (X), Comet Tail (X) |
| **Keyboard Sound Pack** | UI, BT (local only) | Soft Membrane (C), Typewriter (C), Blue Switch Clicky (R), Wooden Blocks (R), Music Box (E, each word plays a note), 8-bit Chiptune (E), Temple Bells (L), Orchestra Strings (L, combos build a melody), Rain on Glass (X), Champion Fanfare (X) |
| **Damage-Number Font** | BT | Pixel Serif (C), Bold Block (C), Handwritten Ink (R), Runic (R), Comic Pop with outline (E), Neon Tube (E), Gilded Roman (L), Shattering Glass (L), Calligraphy Brush (X), Glitch Digits (X) |
| **Pet** (follows hero, idle animations, cosmetic only — no stats) | BT, PC | Inkling Slime (C), Paper Crane (C), Lantern Moth (R), Pocket Fox (R), Book Mimic (E), Clockwork Owl (E), Baby Wyrm (L), Star Whale (L), Golden Typewriter Golem (X), Phoenix Chick (X) |
| **Victory Pose** (boss/level clear animation) | BT, shareable clear card | Fist Pump (C), Bow (C), Sword Twirl (R), Book Snap (R), Quill Flourish (E), Spellbook Burst (E), Keyboard Shred (L), Meteor Landing (L), Champion's Banner (X), Ascension (X) |

Possible later categories: battle backdrop tint, word-highlight color, emotes for async "ghost" races.

### 1.3 Sources

| Source | What it gives |
|---|---|
| Lootboxes (gems) | C–L items in the standard pool, plus seasonal featured items |
| Rotating direct shop (gems or shards) | Specific C–L items at fixed prices |
| Achievements | Titles, badges, some frames; all Exclusive achievement items |
| Daily login 28-day calendar | One Epic per cycle (rotates), plus Commons and Rares |
| Weekly league / leaderboard | Exclusive frames, titles, name colors for each season |
| Events (2–3 weeks, themed) | Event-currency shop with 6–8 items; finishing the event track gives 1 Legendary |
| Season pass ("Chronicle", optional, see §2.5) | Cosmetics only; free track gets ~40% of the value |

### 1.4 Duplicates → Shards

Shards ("Ink Shards") are a server-tracked, non-purchasable crafting currency.

| Rarity | Duplicate gives | Craft cost |
|---|---|---|
| Common | 5 | 30 |
| Rare | 20 | 100 |
| Epic | 60 | 400 |
| Legendary | 250 | 1600 |

Crafting can target any item currently in the standard pool, plus featured items from **past** seasons once their featured window ends. Exclusives cannot be crafted. Shards cannot be bought, so the cap on crafting speed is play time and duplicates, not money.

---

## 2. Lootboxes and Shop

### 2.1 Box types

| Box | Price | Pool |
|---|---|---|
| **Scribe's Chest** (standard) | 160 gems; 10-pull 1440 (10% off, guarantees Epic+) | Full standard pool |
| **Featured Chest** (season-themed, rotates every ~6 weeks) | 200 gems; 10-pull 1800 | Season pool. Half of all Legendary hits are the featured Legendary |
| **Gold Satchel** (soft currency, client-side) | 5,000 Gold | Common/Rare only, from a separate "earned" pool; never contains premium-pool items. A gold sink, and it lets non-payers try the opening ritual |

Rough gem prices: $0.99 = 100, $4.99 = 550, $9.99 = 1,200, $19.99 = 2,500, $49.99 = 6,500. At ~190 free gems a week (§3.5), a free player gets about one standard pull a week.

### 2.2 Published rates (per pull)

| Rarity | Scribe's Chest | Featured Chest |
|---|---|---|
| Common | 62.0% | 58.0% |
| Rare | 27.0% | 29.0% |
| Epic | 9.0% | 10.0% |
| Legendary | 2.0% | 3.0% (1.5% featured item, 1.5% other) |
| Effective Legendary rate incl. pity | ~2.6% | ~3.8% |

Also publish: per-item probability within each tier, the pity rules, the shard values, and the **expected cost to get a specific Legendary** in USD equivalent. This is required in some regions (e.g., Korea's 2024 probability-disclosure rules, China) and it builds trust everywhere. Disclose in a "Rates" button on every box, at the point of sale.

### 2.3 Pity and duplicate protection (server-side counters)

- **Epic pity:** at least one Epic+ in every 10 pulls of the same box type.
- **Legendary hard pity:** 60 pulls (Scribe), 50 (Featured). **Soft pity:** from pull 45 (Scribe) or 38 (Featured), the Legendary rate goes up by 5 percentage points per pull.
- **Featured guarantee:** if a Featured Legendary hit is not the featured item, the next Legendary hit is guaranteed to be it.
- Pity counters carry over between seasons for the standard box. The Featured counter carries over to the next Featured Chest, so spent progress is never lost.
- **Duplicate protection:** Legendaries and Epics never duplicate until you own every item of that tier in the pool. Commons and Rares can duplicate, and duplicates turn into shards.
- **No "complete the set" rewards** tied to box contents (avoids Japan's *kompu gacha* rule and its predatory pattern).

### 2.4 Compliance and region handling

- **Region detection:** use `request.cf.country` in the Worker, plus the store/billing country from the payment provider. The stricter of the two wins.
- **Belgium:** paid boxes are disabled. Gems are still sold, and every box item can be bought directly in the shop or crafted. Gold Satchel stays, since Gold can't be bought. **Netherlands:** the courts have ruled more permissively, but policy is moving, so by default we treat it like Belgium. Keep this as a server-side config flag per country (`paid_lootbox_allowed`) so it can be changed without a client release.
- **Minors:** age gate at account linking or first purchase (birth year, neutral design).
  - Under 13 (COPPA/GDPR-K): no purchases, no free-text profile data, no email collection except a parent's via verifiable parental consent.
  - 13–17: **no paid lootboxes at all.** The direct shop only, with a default monthly cap of $20 that a linked parent can change (including to $0). Brazil (ECA Digital, 2025) bans loot boxes for minors outright, UK guidance points the same way, and this is an education product.
  - All ages: an optional self-set monthly spending limit, and a purchase history screen with totals.
- **No fake urgency**, no countdowns on boxes, no "near-miss" reveal animations. The reveal shows the final rarity immediately; flair is fine but it never fakes a Legendary.
- **Featured Chest windows** are announced at least 2 weeks before they end, and items return later via crafting.

### 2.5 Direct-buy rotating shop and pass

- **Daily rotation:** 4 slots (2 Common/Rare, 1 Epic, 1 Legendary). Prices: Common 80 / Rare 200 / Epic 600 / Legendary 1,800 gems. This is about 60–70% of the expected box cost of a *specific* item. Paying more for certainty beats gambling.
- **Weekly bundle:** themed set, for example Aura + Trail + Damage Font, at 20% off.
- Every shop item can also be bought with Ink Shards at craft price.
- **Chronicle Pass (optional, phase 2):** 950 gems, 40 tiers, earned by playing (XP from typing words, not from logging in). Cosmetics only. The premium track pays back 1,000 gems over the season so it renews itself, a widely accepted fair model.

---

## 3. Daily / Weekly / Long-term Loops

### 3.1 Login calendars (server-dated, UTC-reset with a local-time display)

**7-day streak calendar.** Missing a day resets the calendar to day 1, but the 28-day calendar does not reset.

| Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Reward | 500 Gold | 1 Revive Feather | 10 Gems | 800 Gold | 1 Gold Satchel | 1,000 Gold | 30 Gems + 20 Shards |

**28-day cumulative calendar.** Counts days logged in, not consecutive days, so missing a day is never punished.

| Day | Reward | Day | Reward |
|---|---|---|---|
| 3 | 1,000 Gold | 17 | Rare cosmetic (rotating) |
| 5 | Common cosmetic | 20 | 50 Shards |
| 7 | 20 Gems | 21 | 30 Gems |
| 10 | 2 Revive Feathers | 24 | 3,000 Gold |
| 12 | 1,500 Gold | 26 | 1 Scribe's Chest pull |
| 14 | 1 Gold Satchel | 28 | **Epic cosmetic** (cycle-themed) |

**Revive Feather** is a free revive token. It is the non-paid path to revives, and you can hold at most 5.

### 3.2 Daily missions

Each day, 4 missions are drawn from a pool of 15. At least 2 are typing-skill missions, and the 4th slot can be rerolled once for free. Each mission gives 300–600 Gold. **Completing all 4 gives 10 Gems.**

1. Type 500 words with 95%+ overall accuracy
2. Finish 3 story levels
3. Reach a 50-word combo with no mistakes
4. Average 40+ WPM across 3 battles (scales to your 7-day median WPM plus 5%)
5. Type 20 words containing Q, Z, X or J
6. Clear any level with 98%+ accuracy
7. Reach Survival wave 15
8. Use active skills 10 times
9. Land 30 critical hits (perfect-word crits)
10. Type for 10 minutes total
11. Finish a Typing Trial (60-second standardized test)
12. Clear a level you've already 3-starred, but faster (practice mode)
13. Type 100 words with capital letters or punctuation
14. Defeat 50 enemies
15. Practice your weakest keys: type 40 words from your personal "trouble letters" list (shown from client-side analytics)

The WPM-type missions **scale to the player's own baseline**, so a 20-WPM learner and a 120-WPM expert are both challenged.

### 3.3 Weekly missions (all 10 active; resets Monday 00:00 UTC)

| # | Mission | Reward |
|---|---|---|
| 1 | Complete 20 daily missions | 25 Gems |
| 2 | Type 5,000 words | 3,000 Gold |
| 3 | Defeat 2 bosses | 2,000 Gold |
| 4 | Improve your Typing Trial best, or hit 3 trials at 97%+ accuracy | 25 Gems |
| 5 | Reach Survival wave 30 | 2,500 Gold |
| 6 | Earn 15 story stars | 2,000 Gold |
| 7 | Play on 5 different days | 1 Gold Satchel + 30 Shards |
| 8 | 1,000 words at 97%+ accuracy | 2,000 Gold |
| 9 | Finish a weekly league match (§4) | 1 Revive Feather |
| 10 | Complete 8 of the above | **30 Gems** + Weekly Chest (Gold + Shards) |

### 3.4 Achievements (40)

Gold amounts are roughly 1k–20k. Gems are one-time. Exclusive (X) cosmetics are marked.

**Progression (8)**
- Clear chapter 1 (50 gems)
- Clear chapter 5 (Title "Wanderer")
- Clear chapter 10 (100 gems)
- Clear chapter 20 (Frame "Runic Circle")
- Clear all 300 levels (X Card "The Last Page — Gilded")
- 3-star 50 levels (Badge)
- 3-star 150 levels (50 gems)
- 3-star all 300 levels (X Title "Grand Lexicon")

**Typing speed (8)** — counts only in a verified Typing Trial:
- 30 WPM (Gold)
- 50 WPM (Title "Swift Fingers")
- 70 WPM (50 gems)
- 90 WPM (Trail)
- 110 WPM (Name color)
- 130 WPM (X Aura)
- 150 WPM (X Title "The Blur")
- 200 WPM (X Badge "200 WPM Crown")

**Accuracy (6)**
- Finish a level at 100% (Badge)
- 10 levels at 100% (Gold)
- A boss at 100% (X Aura "Perfect Form")
- 1,000-word combo (Title "The Unerring")
- 7-day average 98%+ (50 gems)
- 100 trials at 95%+ (Font)

**Survival (6)**
- Wave 25 (Gold)
- Wave 50 (Title)
- Wave 100 (50 gems)
- Wave 200 (X Aura "Endless Flame")
- Survive 30 minutes in one run (Pet)
- Weekly league top 3 (Frame)

**Consistency (4)**
- 7-day streak (Gold)
- 30 days played (Badge)
- 100 days played (X Badge "Centurion")
- 1,000,000 words typed lifetime (X Pet "Golden Typewriter Golem")

**Collection (5)**
- 10 cosmetics (Gold)
- 50 cosmetics (Shards)
- Every category equipped (Title "Stylist")
- 3 weapons at max upgrade (Gold)
- Own 25 gear pieces (Gold)

**Skill mastery (3)**
- Use every active skill (Gold)
- Kill a boss with only auto-attacks (Title)
- Clear a level with no passives (Badge)

**Social (light-touch, no chat) (4)**
- Link your account (100 gems, also protects the save)
- Join a weekly league (Gold)
- Beat a friend's ghost in Trial (Badge)
- Share a clear card (Gold)

Achievement gems add up to about 600, all one-time.

### 3.5 Free gem inflow (assumptions)

| Source | Gems per week |
|---|---|
| Daily mission completion (10 × 7) | 70 |
| 7-day login (10 + 30) | 40 |
| 28-day calendar (7 + 21 days ÷ 4) | ~12 |
| Weekly missions (25 + 25 + 30) | 80 |
| **Steady state** | **~200 per week** |

On top of that, about 600 one-time from achievements, plus leaderboard rewards (§4). This assumes a full-engagement player. A typical retained player gets about 120–150. **Server-side cap:** 250 free gems per user per ISO week, not counting one-time achievements or leaderboard rewards (see §5.6 for why).

---

## 4. Leaderboards

### 4.1 Boards

| Board | Metric | Reset | Verification |
|---|---|---|---|
| **Survival — All-time** | Best score (wave × kill score, tiebreak: earlier) | Never (season archive snapshots) | Full replay for top 1,000 |
| **Survival — Weekly League** | Best weekly score inside a 30-player league bracket, assigned by skill tier (Bronze → Diamond, Duolingo-style promote/demote) | Weekly | Replay for the top 3 in each league |
| **Typing Trial WPM** | Best net WPM on a 60-second standardized seeded passage (from a rotating weekly set of 7) | Seasonal (8 weeks) + all-time | Full replay, always |
| **Story Stars** | Total stars (max 900), tiebreak: total clear time | Never | Light checks (save-blob plausibility) |
| **Boss of the Week** | Fastest clear of one featured boss, using standardized loadout presets so gear spending (gold) can't decide it | Weekly | Full replay for the top 100 |

Per-boss permanent boards for all 30 bosses are deferred. Boss of the Week gives the same fun with 1 board instead of 30 and keeps D1 writes concentrated.

Every board has three views: **Global top 100** (cached), **Around me** (±10), and **Friends** (by friend code).

### 4.2 Seasons and rewards

- 8-week seasons. At the end, a snapshot goes into `leaderboard_archive`, and Exclusive cosmetics are granted server-side.
- **Weekly League:**
  - Top 3 get 30 / 20 / 10 gems, and the top 5 promote.
  - Everyone who finishes gets Gold.
  - League #1 earns the "Champion's Laurel" frame for that week. It is a badge-style stack showing "×N weeks".
- **Season Trial WPM:**
  - Top 100 get a season title such as "Season 1 Vanguard".
  - Every player who passes a personal-best threshold (e.g., +10 WPM over their season start) gets a progress badge. **Rewarding improvement, not just raw rank**, is the education-friendly half.
- **Survival all-time:** milestone rewards only (not rank-based), so new players aren't locked out.

### 4.3 Anti-cheat: keystroke-log replay

The server never sees keystrokes live, so every competitive run is **seeded, deterministic, and replayable**.

**Run lifecycle**
1. `POST /runs/start {mode, boardId}` returns `{runId, seed, issuedAt, sig}`. The server stores the run row, and the seed drives word selection, enemy spawns, and RNG.
2. During play, the client records a **keystroke log**, one entry per key event:
   - `dt` = ms since the previous key (varint)
   - `k` = typed char index or code
   - meta events (skill activations, pause)
   - The log is delta-encoded, then compressed with gzip/deflate via `CompressionStream`. Survival typing for 30 minutes is about 12k events, which is ~25–40 KB compressed.
3. `POST /runs/{runId}/submit {log, claimed: {score, wave, wpm, accuracy, durationMs}, clientVersion, loadoutHash}`.
4. The Worker:
   - (a) Checks the HMAC on the run, and that `durationMs ≤ now − issuedAt + slack`. Nobody can submit a 30-minute run 2 minutes after starting.
   - (b) Runs cheap statistical checks.
   - (c) Where the policy requires it, **re-simulates**: the combat/typing sim is a pure TypeScript package (`@game/sim`) shared by client and Worker. Feeding seed + loadout + log must reproduce the claimed score exactly.
   - Paid Workers allow 30 s of CPU by default, and a 12k-event sim is milliseconds. Any heavier work, or a later sim version, can be deferred to a Queue consumer.
5. Pass → write the entry. Fail or suspicious → write the entry with `status='flagged'`. A flagged entry is visible only to its owner (a shadow-flag, so no instant feedback for cheaters) until reviewed.

**Statistical flags (thresholds are tunable)**
- Sustained net WPM > 220 over ≥ 30 s, or any 5 s window > 300 WPM.
- Inter-key interval coefficient of variation < 0.15 (humans are typically 0.35–0.7). Macro typing is suspiciously even.
- More than 2% of intervals under 15 ms, or quantized intervals (all multiples of a timer tick).
- Accuracy of 100% with zero corrections over more than 1,500 keys at more than 150 WPM.
- The bigram timing profile doesn't match the player's own history. Each player has a stored per-user baseline: median WPM, CV, and top bigram latencies, kept in `users.typing_profile`.
- The Trial PB jumps by more than 35 WPM over the previous verified best (triggers a review, not an automatic flag).
- The client version or sim version does not match the run's sim version. Old versions are rejected for competitive boards.

**Storage:** compressed logs go into D1 `run_replays` only for entries in the top N or flagged entries, with a 90-day TTL via a cron purge. If volume grows, move them to R2. **Gold/gear advantage on leaderboards:** Survival allows your own gear (gear is earned, not bought), but the loadout hash is checked against the plausibility of your save. Trial and Boss of the Week use normalized loadouts, so they test typing, not grinding.

---

## 5. Cloudflare Backend

### 5.1 Authority split

| Server-authoritative (D1) | Client-authoritative (save blob) |
|---|---|
| Gem balances and ledger (paid and free buckets) | Gold, gear, weapons, upgrades |
| Purchases, refunds, chargebacks | Story progress, stars, skills, passives |
| Premium inventory: anything bought with gems, from lootboxes, crafted with shards, leaderboard/season grants, verified achievements' Exclusives | Mission progress, Gold Satchel cosmetics, settings |
| Ink Shards, pity counters | Login calendar *display* (claims are server-checked) |
| Leaderboard entries, runs, replays | Typing analytics (trouble letters) |
| Free-gem claim records and weekly cap | |

**Rule for public surfaces:** only server-inventory items can appear on the leaderboard row or public profile card. Client-earned cosmetics are usable in your own battle and UI. Achievement Exclusives move into the server inventory when claimed, after a plausibility check (e.g., WPM achievements need a verified Trial entry).

### 5.2 Auth

- `POST /auth/anon {deviceId}` creates a user and returns `{accessToken (JWT, 15 min), refreshToken (opaque, 90 d)}`. The refresh token is stored as a SHA-256 hash in `sessions` and rotated on every refresh, with reuse detection that revokes the whole family.
- JWTs are signed with EdDSA or HS256 via WebCrypto. The key lives in a Workers Secret. Claims: `{sub, ageBand, region, iat, exp}`.
- **Linking:**
  - Email magic link: a single-use token, 15 min, hashed in D1, sent through an email API.
  - OAuth with Google, Apple, and Discord (PKCE).
  - Linking merges into the existing user. If the identity is already attached to another user, the client shows "choose which save to keep". Gems/inventory are **unioned**, never discarded.
- Purchases require a linked account. Without one, money could be lost when browser storage is cleared.

### 5.3 REST API

All bodies are JSON. Auth is `Authorization: Bearer <jwt>`. Mutating calls take an `Idempotency-Key` header (UUID). Errors look like `{error: {code, message}}`.

| Method & path | Request | Response |
|---|---|---|
| POST `/auth/anon` | `{deviceId}` | `{userId, accessToken, refreshToken}` |
| POST `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` |
| POST `/auth/link/email` | `{email}` | `202` |
| POST `/auth/link/email/verify` | `{token}` | `{userId, merged: bool}` |
| GET `/auth/oauth/:provider/start` → `/callback` | — | redirect |
| GET `/me` | — | `{userId, displayName, ageBand, linked, gems:{paid,free}, shards, equipped}` |
| PATCH `/me` | `{displayName?, equipped?:{frame,badge,title,nameColor,card}}` | `{ok}` (validates ownership) |
| GET `/save` | — | `{revision, updatedAt, blob(base64 gzip)}` |
| PUT `/save` | `{baseRevision, blob, summary:{levelMax, stars, playtimeSec}}` | `200 {revision}` / `409 {serverRevision, serverBlob, serverSummary}` |
| GET `/save/history` | — | `[{revision, updatedAt, summary}]` (last 5) |
| GET `/wallet` | — | `{paid, free, shards, pity:{scribe,featured}}` |
| GET `/catalog` | — | `{skus, shopRotation, boxes, rates, regionFlags}` (edge-cached) |
| POST `/shop/checkout` | `{sku}` | `{checkoutUrl, purchaseId}` |
| POST `/webhooks/paddle` (or `/stripe`) | provider payload | `200` |
| POST `/shop/buy` | `{itemId, currency:"gems"\|"shards"}` | `{wallet, granted:[itemId]}` |
| POST `/boxes/open` | `{boxId, count:1\|10}` | `{results:[{itemId, rarity, dup, shards}], wallet, pity}` |
| POST `/rewards/claim` | `{rewardKey:"daily_all\|weekly_m10\|login7_d3\|ach_wpm70..."}` | `{granted, wallet}` / `409 already_claimed` / `429 weekly_cap` |
| POST `/revive` | `{runId?, useFeather?:bool}` | `{wallet}` |
| GET `/inventory` | — | `{items:[{itemId, source, acquiredAt}]}` |
| POST `/runs/start` | `{mode, boardId}` | `{runId, seed, issuedAt, sig}` |
| POST `/runs/:id/submit` | `{log(base64), claimed, clientVersion, loadoutHash}` | `{status:"accepted"\|"pending", rank?, pb:bool}` |
| GET `/leaderboards/:boardId?view=top\|around\|friends&period=` | — | `{entries:[{rank, userId, name, score, cosmetics}], me}` |
| GET `/profile/:userId` | — | public card (server-inventory cosmetics only) |
| POST `/account/limits` | `{monthlyCapCents}` | `{ok}` (a parent PIN is required for minors) |
| DELETE `/account` | — | `202` (GDPR erase; the ledger is pseudonymized, not deleted) |

### 5.4 D1 schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,                       -- ULID
  display_name TEXT NOT NULL,
  friend_code TEXT UNIQUE NOT NULL,
  age_band TEXT NOT NULL DEFAULT 'unknown',  -- 'u13','13_17','adult','unknown'
  region TEXT,
  monthly_cap_cents INTEGER,                 -- NULL = none
  parent_pin_hash TEXT,
  typing_profile TEXT,                       -- JSON: medianWpm, cv, bigram baseline
  flags INTEGER NOT NULL DEFAULT 0,          -- bitmask: lb_banned, spend_locked, ...
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE identities (
  provider TEXT NOT NULL,                    -- 'device','email','google','apple','discord'
  subject TEXT NOT NULL,                     -- deviceId / email hash / sub
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX idx_identities_user ON identities(user_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_family ON sessions(family_id);

CREATE TABLE saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  revision INTEGER NOT NULL,
  blob BLOB NOT NULL,                        -- gzip JSON, enforce <= 256 KB
  summary TEXT NOT NULL,                     -- JSON {levelMax, stars, playtimeSec}
  updated_at INTEGER NOT NULL
);
CREATE TABLE save_history (                  -- last 5 revisions for rollback
  user_id TEXT NOT NULL, revision INTEGER NOT NULL,
  blob BLOB NOT NULL, summary TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, revision)
);

-- Double-entry gem ledger: append-only. Every tx's entries sum to 0.
CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,                       -- 'u:{userId}:paid', 'u:{userId}:free', 'sys:purchase', 'sys:grant', 'sys:spend', 'sys:refund'
  user_id TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  CHECK (user_id IS NULL OR balance >= 0 OR id LIKE '%:paid')  -- paid may go negative only via refund
);
CREATE TABLE ledger_tx (
  id TEXT PRIMARY KEY,                       -- ULID
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- 'purchase','grant','spend','refund','chargeback','adjust'
  source_type TEXT NOT NULL,                 -- 'purchase','reward','box','shop','revive','admin'
  source_id TEXT NOT NULL,                   -- purchaseId / rewardKey+period / idempotency key
  memo TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (source_type, source_id)            -- idempotency guarantee
);
CREATE TABLE ledger_entries (
  tx_id TEXT NOT NULL REFERENCES ledger_tx(id),
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  amount INTEGER NOT NULL,                   -- signed
  PRIMARY KEY (tx_id, account_id)
);
CREATE INDEX idx_ledger_tx_user ON ledger_tx(user_id, created_at);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  gems INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,                    -- 'paddle'|'stripe'
  provider_ref TEXT UNIQUE,                  -- transaction / session id
  status TEXT NOT NULL,                      -- 'pending','completed','refunded','charged_back','failed'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_purchases_user ON purchases(user_id, created_at);

CREATE TABLE webhook_events (                -- dedupe provider retries
  provider TEXT NOT NULL, event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL, PRIMARY KEY (provider, event_id)
);

CREATE TABLE inventory (                     -- server-authoritative cosmetics
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,                      -- 'box','shop','craft','season','achievement','event','pass'
  source_tx TEXT,                            -- ledger_tx id if paid
  acquired_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE shards (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK (balance >= 0));
CREATE TABLE pity (user_id TEXT NOT NULL, box_type TEXT NOT NULL,
  since_epic INTEGER NOT NULL DEFAULT 0, since_legendary INTEGER NOT NULL DEFAULT 0,
  featured_guarantee INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, box_type));
CREATE TABLE box_opens (                     -- audit trail for odds verification
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, box_type TEXT NOT NULL,
  tx_id TEXT NOT NULL, results TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE reward_claims (
  user_id TEXT NOT NULL, reward_key TEXT NOT NULL, period_key TEXT NOT NULL, -- e.g. '2026-W41', '2026-10-08', 'once'
  gems INTEGER NOT NULL, claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, reward_key, period_key)
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mode TEXT NOT NULL, board_id TEXT NOT NULL,
  seed INTEGER NOT NULL, sim_version INTEGER NOT NULL,
  issued_at INTEGER NOT NULL, submitted_at INTEGER, status TEXT NOT NULL -- 'open','accepted','flagged','rejected'
);
CREATE INDEX idx_runs_user ON runs(user_id, issued_at);

CREATE TABLE leaderboard_entries (
  board_id TEXT NOT NULL,                    -- 'survival_all','survival_wk','trial_wpm','stars','boss_wk'
  period_key TEXT NOT NULL,                  -- 'all','2026-W41','S1'
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,                    -- higher is better (store -ms for time boards)
  run_id TEXT,
  league_id TEXT,                            -- weekly league bracket
  status TEXT NOT NULL DEFAULT 'ok',         -- 'ok','flagged','removed'
  achieved_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, period_key, user_id)  -- one best row per user per board-period
);
CREATE INDEX idx_lb_rank ON leaderboard_entries(board_id, period_key, status, score DESC, achieved_at);
CREATE INDEX idx_lb_league ON leaderboard_entries(league_id, score DESC);

CREATE TABLE run_replays (run_id TEXT PRIMARY KEY, log BLOB NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE leaderboard_archive (board_id TEXT, period_key TEXT, rank INTEGER, user_id TEXT, score INTEGER,
  PRIMARY KEY (board_id, period_key, rank));
```

### 5.5 Key flows

**Save conflict resolution**
- The write is `UPDATE saves SET ... , revision = revision + 1 WHERE user_id = ? AND revision = ?`.
- If 0 rows change, return 409 with the server copy.
- The client then auto-merges:
  - Monotonic fields take the per-field max: cleared levels, stars, achievements unlocked, lifetime words.
  - Fungible fields (gold, gear inventory) come from the save with the higher `playtimeSec`.
  - If the two diverge by more than 30 minutes of playtime on both sides, the client asks the user ("This device: Ch.12, 3h20m / Cloud: Ch.9, 5h02m").
- Before overwriting, the previous blob is copied to `save_history`.
- Autosave runs on level end and at most once every 60 s.

**Gem purchase (Paddle recommended).** Paddle is the merchant of record, so it handles global VAT and sales tax, which is the right call for a small team. Stripe with Stripe Tax is the alternative.
1. `/shop/checkout` checks the age band, region, and monthly cap (sum of the month's completed `amount_cents`), inserts a `purchases` row as `pending`, and creates a checkout with `custom_data.purchaseId`.
2. Webhook handling:
   - Verify the signature with the raw body and HMAC.
   - `INSERT` into `webhook_events`. On a unique violation, return 200 and stop.
   - Run one D1 `batch()`, which is atomic:
     - `UPDATE purchases SET status='completed' WHERE id=? AND status='pending'`
     - Insert the `ledger_tx` with source `('purchase', purchaseId)`
     - Insert entries: `sys:purchase −N`, `u:X:paid +N`
     - Update both account balances
   - The UNIQUE on `(source_type, source_id)` makes replays harmless.
3. The client polls `/wallet`, or receives the redirect back, to show the gems.
4. **Refund or chargeback:**
   - Insert a `refund` tx: `u:X:paid −N`, `sys:refund +N`. The paid balance may go negative.
   - If it does, set `spend_locked` on the user until the balance is positive again.
   - Items already bought are not revoked for refunds. For chargebacks, the items bought with those gems are revoked: `inventory.revoked_at`, traced via `source_tx`. Chargebacks also flag the account.

**Gem spending** (box, shop, revive)
- The price always comes from the server catalog and is never taken from the client.
- **Free gems are spent first**, the player-friendly choice. The ledger keeps both buckets, so paid-gem consumption gives correct revenue recognition and refund math.
- Box RNG uses `crypto.getRandomValues`. Pity is read and updated, and the results, `box_opens`, inventory, shards, and ledger are all written in one `batch()`, keyed by the `Idempotency-Key` header as `source_id`.
- `INSERT OR IGNORE` into inventory handles dupes. Dupes are detected before the insert and converted to shards.

**Revive.** Costs 30 gems, at most once per level (the client enforces the per-level rule; the server records `runId` to stop a double-charge). A Revive Feather can be used instead. Feathers are counted server-side as a simple inventory counter, since they substitute for gems.

### 5.6 Free gems: why the server caps them

Mission completion is client-side and can't be verified. `/rewards/claim` therefore enforces:
- once per `(reward_key, period_key)`, through the PK
- the server's date for the period
- daily and weekly totals, including the **250 free gems per ISO week cap**

A cheater gains at most what a perfectly engaged legitimate player gets. That's acceptable, and the economy is designed around it. Achievement gems are `period_key='once'`. Achievements that pay large amounts or Exclusives need a server-verifiable condition: a verified Trial entry, or a leaderboard entry.

### 5.7 D1 limits and scaling

Verify current numbers at build time.
- **Size:** D1 has a ~10 GB per-database cap and ~2 MB max row/BLOB. Save blobs are capped at 256 KB and replays at about 100 KB, and only top N runs or flagged runs are kept.
- **Writes:** each database is single-writer, good for roughly hundreds of writes per second of small transactions.
  - The hot write paths are save PUT (throttled to 1 per 60 s per user), run submit (only on run end, and the leaderboard is upserted only when it's a PB: `INSERT ... ON CONFLICT DO UPDATE SET score=excluded.score WHERE excluded.score > score`), and claims.
  - Rough math: at 50k DAU, that's about 10 writes per second average and about 100 at peak. Fine.
  - If it grows, shard saves into a second D1 database keyed by `hash(userId)`, and keep the ledger in its own database, kept small and critical.
- **Leaderboard reads:**
  - Top-100 per board/period lives in **KV** as JSON with cosmetics joined in. It is rebuilt by a Cron Trigger every 60 s, and immediately when a submit would enter the top 100.
  - Responses are also edge-cached with the Cache API, `s-maxage=30`.
  - "Around me" uses the index: `SELECT COUNT(*)+1 ... WHERE score > ?`, then a ±10 window. It isn't cached but it is cheap.
  - KV is eventually consistent (~60 s), which is acceptable for leaderboards. It is **never** used for wallet data.
- **Cron jobs:** weekly reset and league reassignment on Monday 00:05 UTC, the season snapshot, replay TTL purge, and session cleanup.

### 5.8 Rate limiting and abuse

- The Workers **Rate Limiting binding** is keyed by `userId`, falling back to IP:
  - auth/anon: 5/min/IP
  - save PUT: 2/min
  - runs/start: 10/min
  - submit: 10/min
  - boxes/open: 20/min
  - checkout: 5/min
- WAF rules and Turnstile on `/auth/anon` and email linking.
- Webhooks are exempt from rate limits but signature-gated.
- Admin endpoints are behind Cloudflare Access.
- Daily reconciliation cron: the sum of all ledger entries must be 0, and every account balance must equal the sum of its entries. On a mismatch, alert.

---

## 6. Retention Loop and Onboarding

### 6.1 Loop

```
            ┌───────────────────── Daily (5–20 min) ─────────────────────┐
 Login ─► Claim calendar ─► 4 daily missions (typing-skill tuned to you)
   │                              │
   │                              ▼
   │             Story levels / Survival / 60s Trial  ──► Gold, chests, gear
   │                              │                          │
   │                              ▼                          ▼
   │                  WPM & accuracy improve  ◄── stronger loadout, new chapters
   │                              │
   │                              ▼
   │        Visible progress: WPM graph, trouble letters shrinking, PB badges
   │                              │
   └──── Weekly ───► League bracket (30 peers) ─► promote/demote, weekly gems
                 └─► Weekly missions ─► ~200 free gems ─► 1 box pull / shop item
                                              │
         Season (8 wk) ─► Featured cosmetics, season titles, Exclusives ─► show off
                                              │
                    Cosmetics on leaderboard row / profile / battle aura
                                              └──► social proof ─► return
```

The intrinsic hook is **"I'm visibly getting better at typing."** Extrinsic hooks (cosmetics, leagues) decorate it and never replace it.

### 6.2 First session (10 minutes)

| Time | Beat |
|---|---|
| 0:00–0:30 | No login wall. An anonymous account is created silently. A title-screen vista (HD-2D diorama). Name entry doubles as the first typed input. |
| 0:30–1:30 | **Placement passage** framed as "reading the ancient sign" (30 s). Sets the baseline WPM/accuracy, so difficulty and mission scaling are set without a test feeling. |
| 1:30–3:00 | Level 1-1: typing fills the ATB, the hero auto-attacks, and tooltips appear one at a time. Enemy words are tuned to 70% of the baseline WPM, so the first fight is a guaranteed win. |
| 3:00–4:30 | Level 1-2: the first active skill unlocks with a big, satisfying VFX. Combo meter introduced. The first chest drops a weapon, then a forced equip. |
| 4:30–6:00 | Level 1-3: the first near-loss, then a free Revive Feather is given and explained. This teaches revives without gems. |
| 6:00–7:00 | Town: the shop buys a piece of gear with Gold. The first passive slot. |
| 7:00–8:30 | Levels 1-4 and 1-5. The post-level results screen shows **WPM/accuracy versus your placement**: "+3 WPM already!" |
| 8:30–9:30 | Daily missions panel unlocks with 1 already complete. Login calendar Day 1 claimed. A free Common aura is granted and equipped, to show the cosmetic layer. |
| 9:30–10:00 | Tease: Survival unlocks at 1-10 (boss), and Leagues at chapter 2. Soft prompt "Link account to protect your progress (+100 gems)". **No shop popup or gem offer in session 1.** |

The premium shop tab unlocks after chapter 1 is cleared. The first purchase prompt never comes before day 3.

---

## 7. Ethical Monetization for an Educational Game

1. **No pay-to-win, ever.** Gems never buy gear, stats, XP, skill unlocks, or level skips. Competitive boards use normalized loadouts where gear would matter.
2. **Revive is the risk point.** It is limited to 1 per level, free Feathers come from login/weekly rewards, and a failed level gives a "practice this passage" option instead of a revive upsell. No revive prompt appears in the Trial or on leaderboard-competitive Boss of the Week (revives are disabled there entirely).
3. **Minors:**
   - no paid lootboxes under 18
   - no purchases under 13 without verifiable parental consent
   - parental caps and a parent PIN
   - no push notifications with offers for minors
   - school/classroom builds can disable the shop completely (`shop_enabled=false` via a server flag per org)
4. **Transparent odds and costs:**
   - odds, pity, and the expected cost are always shown
   - prices are shown in real currency next to gems
   - gem packs are sized so leftover "orphan gems" are minimal (box price 160 versus pack sizes with clean multiples, tuned by the economy pass)
5. **No dark patterns:** no fake scarcity timers on boxes, no near-miss animations, no "your friends bought this", no loss-framed streaks (the 28-day calendar is cumulative, and streak loss is gentle), and no confirm-shaming on decline buttons.
6. **Self-regulation tools:**
   - monthly spending caps for all users
   - a spend history page
   - a "take a break" reminder after 60 minutes of continuous play (typing ergonomics also matter: wrist-rest tips)
7. **Learning comes first in reward design:**
   - Missions reward accuracy and personal improvement, not just volume.
   - Leaderboards include improvement-based rewards so slower learners also win something.
   - Mission targets scale to the individual.
8. **Data minimization:** keystroke logs are kept only for verification (90-day TTL, top N or flagged runs), never sold, and never used for ad targeting. No third-party ad SDKs.
9. **Consumer law:**
   - EU 14-day withdrawal is waived only with explicit consent at checkout for immediate digital delivery (the merchant of record handles this)
   - unspent paid gems are refundable on account deletion where required
   - all box items are reachable without paid randomness (shards and direct shop)
