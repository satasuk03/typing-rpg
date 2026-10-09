# Implementation Plan — Vertical Slice ("Chapter I: Ember Hollow")

**Audience:** an orchestrator session that delegates work to sub-agents. It is self-contained: read this file, then the references in §11.
**Status:** brainstorm complete; product decisions locked (`docs/brainstorm/00-overview.md` §6). No production code exists yet. The repo is not yet under git.

---

## 1. Goal

Ship a **playable, polished vertical slice** of the HD-2D typing RPG in the browser (desktop only):

- **Chapter 1** (10 levels, boss at L10) of Story mode. It plays end-to-end from a title screen to the chapter-complete screen.
- The full core loop at production quality, at the art bar set by `poc/hd2d-poc-v2.html` or better:
  - Auto-walk, then encounter(s), then type-to-fight, then loot, then walk, then level results.
- **Local meta:**
  - Gold, shop, chests and Gear Caches.
  - Gear equip and upgrade.
  - A 2-active + 3-passive loadout.
  - Stars and the Word Journal (weak-words spaced repetition).
- **Backend (Cloudflare Workers + D1):**
  - Anonymous account and cloud save.
  - **One** leaderboard (Typing Trial: a 60 s seeded passage), with keystroke-log validation.
- **One shared deterministic combat sim** (TypeScript) used by the game client, the Worker anti-cheat and the balance tooling.

**Definition of done (slice):**
- The bot playtest harness (§8.3) clears all 10 levels at 20, 40 and 75 WPM. Clear rates and level durations are within ±15% of the economy sim targets (§9).
- 60 fps at 1080p on an Apple-silicon laptop at quality tier 0. Tier 2 must hold at least 45 fps with 4× CPU throttling in Chrome DevTools.
- Zero console errors in a full Chapter 1 run.
- A save survives reload and a second browser via cloud sync.
- The leaderboard accepts a legit run and rejects a forged one.

## 2. Out of scope (later milestones, do not build now)

- Chapters 2–30.
- Survival mode.
- Real-money payments (Paddle).
- Gem shop, cosmetic lootboxes, season pass.
- Daily/weekly missions beyond a stub.
- Achievements.
- Social features.
- Localization of UI (definitions and translations in the Journal *are* in scope, English-only UI).
- Mobile.

Design these systems' data types so they can be added later, but don't implement them.

## 3. Locked decisions (do not re-litigate)

| Area | Decision |
|---|---|
| Platform | Desktop browsers only, keyboard required. Touch devices get a "please use a keyboard" screen. Layout is 16:9 at 1280–2560 px. |
| Tech | **three.js (WebGL2) + TypeScript + Vite**. No Godot or Unity. Art comes from Aseprite (sprites + normal/emissive maps); levels come from LDtk or Tiled JSON. |
| Rendering | HD-2D diorama as in `poc/hd2d-poc-v2.html`: perspective camera, billboard pixel sprites, separate blurred foreground layer, DOF, bloom, ACES, grading, per-biome moods. The HUD is drawn on its own canvas above WebGL, so VFX never cover the typing words. |
| Typing | Each enemy shows a word, and visible words start with distinct letters. The first key targets. There is no Backspace, Space or Enter submit. A typo = no advance. ESC drops the target. |
| ATB | Filled only by correct characters (weapon rate × combo mult ≤ ×1.5, plus a word bonus). A perfect word gives ×1.25. Each finished word also deals a chip hit. |
| Defense | 2.5 s before an enemy attack, its word becomes a red guard word. Typing it blocks; typing it perfectly parries. |
| Combo | Default "Gentle": a typo halves the combo. "Strict" resets it; "Zen" has no penalty. |
| Skills | 2 actives that charge per word and auto-cast (from word tier T4, they charge per 5 chars, C17), plus 3 passives. Skill damage is about 40% below doc 01's values, so skills are 15–20% of damage. |
| Stars | ★ clear. ★★ = match your own 7-day median accuracy (88–97%). ★★★ = rotating challenge with par time based on the player's own speed. |
| Revive | Free "Second Wind" (type a sentence) = 30% HP, once per level. The gem revive (50% HP) is out of scope for the slice, but leave the hook. |
| Economy | Gold Units (GU) scale per chapter. Chests drop at 30% per normal encounter (Wooden/Iron/Gold/Mythic). Gold and Mythic chests give Gear Caches. Caches roll the frontier tier with fixed odds C40/U33/R20/E6/L1 and published pity (R+ within 8, E+ within 30, L by 120). The shop is a deterministic fallback (pick slot and rarity). New gear inherits half the upgrade levels. |
| Monetization | Cosmetic-first. Fixed published odds. The season pass is cosmetic only and returns about 50 gems. Gem gear caches: 50 gems, 1/day (approved). **None of this is built in the slice.** |
| Backend | The server owns gems, purchases, leaderboards and pity. The client save blob owns gold, gear and progress. Saves are revision-checked (409 on conflict, client merges). Auth: anonymous device account + JWT (15 min access, rotating refresh). |
| Anti-cheat | The server issues a signed seed and start time. The client submits a compressed keystroke-timing log. The Worker re-simulates with the shared sim (the result must match) and flags inhuman timing. |

## 4. Repository layout (create in M0)

```
hd-2d/
  CLAUDE.md                     # conventions for every agent (exists)
  package.json, pnpm-workspace.yaml, tsconfig.base.json, biome.json (or eslint+prettier)
  apps/
    game/                       # Vite + three.js client
      src/
        main.ts                 # boot, routing between screens
        app/                    # screen state machine (title, map, level, results, shop, loadout, journal, settings)
        render/                 # diorama, materials/shaders, post pipeline, particles, VFX, camera, lights, biomes
        hud/                    # 2D HUD canvas: word plates, bars, pops, banners, panels
        audio/                  # procedural SFX + ambience (port from POC), mixer, settings
        input/                  # keyboard capture, keystroke log recorder
        level/                  # level runner: drives sim, maps sim events -> render/hud/audio
        meta/                   # inventory, shop, caches UI, loadout, stars, journal UI
        net/                    # API client, auth, save sync, leaderboard
        assets/                 # sprite atlases, LDtk/Tiled JSON, fonts
      tests/ (vitest + playwright)
  packages/
    sim/                        # PURE TS, no DOM/three: deterministic combat + level + economy rules
      src/{rng,typing,atb,combat,skills,passives,enemies,boss,level,rewards,caches,gear,stars,srs,replay}.ts
    content/                    # data: word tiers, ch1 biome vocab, definitions, enemies, levels, gear, skills (JSON/TS + zod schemas)
    shared/                     # API types + zod schemas shared by client and worker
  workers/
    api/                        # Cloudflare Worker (Hono or itty-router), D1 migrations, wrangler.toml
  tools/
    balance/                    # TS port of economy_sim persona runner using packages/sim (parity with Python sim)
    bot/                        # headless bot playtester (sim-level and browser-level)
    content/                    # validators (distinct first letters, tier rules, profanity filter)
  docs/ (existing)  poc/ (existing; reference only, never imported)
```

**Hard rule:** `packages/sim` has zero dependencies on the DOM, three.js, time or `Math.random`. It uses a seeded RNG and a fixed timestep (60 Hz ticks). Input is a list of `{tick, key}` events, and output is state plus an event stream (`WordCompleted`, `Hit`, `Crit`, `Break`, `Parry`, `EnemyAttack`, `Death`, `ChestDrop`, …). The renderer, HUD and audio only *consume* events and state. This makes the client, server re-sim and bots all agree exactly.

## 5. Milestones

Each milestone lists tasks with **owner role**, **dependencies** and **acceptance criteria (AC)**. The orchestrator should run independent tasks in parallel (see the §7 graph) and give each agent an isolated worktree with clear file ownership.

### M0 — Foundation (≈0.5 day, 1 agent)
- **T0.1 Repo bootstrap** (Platform):
  - `git init`, a pnpm workspace, TS strict, Biome/ESLint, Vitest and Playwright.
  - Vite app skeleton rendering a blank three.js canvas plus the HUD canvas.
  - `wrangler` Worker skeleton with a local D1.
  - Root scripts: `dev`, `build`, `test`, `test:e2e`, `typecheck`, `lint`, `bot`, `balance`.
  - **AC:** all scripts pass on an empty project; `pnpm dev` serves the game; `pnpm --filter api dev` serves `/health`.
- **T0.2 CI-like gate script** `scripts/check.sh` (typecheck + lint + unit tests + a sim determinism test). Every agent runs it before reporting done.

### M1 — Shared simulation core (≈3 days; 2 agents in parallel after T1.1)
- **T1.1 Sim kernel** (Sim):
  - Seeded RNG (sfc32/mulberry32).
  - Fixed-tick loop and event bus.
  - State snapshot and hash.
  - Input event format; replay runner.
  - **AC:** the same seed + inputs give an identical state hash across 1,000 runs and in Node vs browser.
- **T1.2 Typing engine** (Sim):
  - Target selection by first letter; per-char advance; typo handling; ESC.
  - Distinct-first-letter word assignment; guard-word swap at T-2.5 s; combo modes.
  - Live WPM and accuracy (net WPM = correct chars / 5 / min).
  - **AC:** unit tests for every rule in `01-combat-and-levels.md` §1. A property test checks that visible words never share a first letter.
- **T1.3 Combat** (Sim):
  - ATB, chip hits, auto-attack, crit.
  - Enemy real-time timers scaled by `(35/Pace)^0.7` with Pace locked per level.
  - Block and parry, shields/weakness/BREAK, damage formulas, HP carry-over with +25% walk heal.
  - Second Wind.
  - Port all constants from `docs/brainstorm/sim/economy_sim.py` into `packages/sim/src/balance.ts` (one parameter table, same names).
  - **AC:** a 35 WPM reference bot gives about 11 auto-attacks per encounter and a normal level lasts about 2:45 ±15%.
- **T1.4 Skills and passives** (Sim): the slice set is **6 actives, 8 passives** (pick from doc 01 §3 those relevant to Ch1), plus 4 weapon archetypes (Sword, Dagger, Staff, Hammer). **AC:** each has a unit test, and the skill damage share is 15–20% in the bot run.
- **T1.5 Enemies and boss** (Sim):
  - Ch1 roster: slime ×2 variants, bat, goblin ×2 variants, plus **2 typing gimmicks** suited to Ch1 (e.g., Fading word, Scrambled — doc 01 §4).
  - Boss **Ruin Golem** with the 3-phase template: normal → timed sentence "Doom Spell" (failed = 15% of *par* HP) → signature minigame + finishing sentence.
  - **AC:** scripted tests per phase transition.
- **T1.6 Level and rewards** (Sim):
  - The level script (encounters, walks, waves).
  - Rewards: gold (GU), chests with drop tables, Gear Cache rolls with fixed odds and pity counters.
  - Gear stats, upgrades, Upgrade Transfer.
  - Stars evaluation; SRS weak-word scheduler (5 boxes).
  - **AC:** a 10,000-roll test matches the published odds within 1% and pity is never exceeded.

### M2 — Renderer and audio port (≈3 days; 2–3 agents in parallel, can start with M1)
- **T2.1 Render core** (Render):
  - Port the POC v2 into modules: renderer setup, shared lighting uniforms, sprite material (normal map + rim), ground/wall shaders.
  - The post pipeline (DOF, foreground blur, bloom, ACES, grade, CA/zoom punch, heat, letterbox) and quality tiers + auto-fallback.
  - **AC:** a test scene matches the POC screenshots (`poc/v2-*.png`) side by side; no regressions in perf.
- **T2.2 World building from data** (Render + Content):
  - Load Ch1 biomes (forest → ruins → cave, plus the boss hollow) from LDtk/Tiled JSON: props, lights, foreground framing pieces and encounter anchors.
  - Placeholder sprites = the POC procedural generators, wrapped behind a `SpriteSource` interface so Aseprite atlases drop in later.
  - **AC:** 10 distinct level layouts from data; there are no hard-coded coordinates in code.
- **T2.3 VFX library** (VFX):
  - Port slash arcs, afterimages, particles (instanced), fx quads, fireball, guard bubble, death dissolve, chest beam and coin fountain, rune circle and boss intro, hit-stop, shake and punch.
  - Bind each one to a sim event in a single `level/eventBindings.ts`.
  - **AC:** every sim event type has a visual + audio binding (checked by a test that enumerates event types).
- **T2.4 HUD** (UI):
  - Port the word plates (readability contract: plates on top, high contrast, typed letters gold, next letter emphasized, guard words red with a timer strip).
  - Bars, combo, damage pops and tags, banners, boss plate.
  - Add an effects-intensity slider and a reduced-flash mode.
  - **AC:** readability check — screenshot at 1280 px, text ≥ 14 px effective, plates never overlap (layout test).
- **T2.5 Audio** (Audio):
  - Port the procedural SFX + ambience into a mixer with buses (sfx, ambience, music, ui) and a settings UI.
  - Keystroke click latency < 10 ms from keydown.
  - Add simple procedural music loops per biome (or placeholders) and battle/boss layers.
  - **AC:** a manual listen checklist is in the PR notes (the agent can't hear, so it flags this for a human); no audio errors in a full run.

- **T2.6 Typing VFX: "every keystroke is a spell"** (VFX, top priority; the PO asked for much more effect while typing):
  - **Per correct key:**
    - The letter pops: a scale punch, a white flash, then it settles to gold.
    - A spark burst comes off the letter, coloured by weapon or element.
    - A short light streak flies from the letter into the hero's ATB bar, which pulses on arrival.
    - The word plate does a small bounce. The key click is pitched to the combo.
  - **Combo tiers** (e.g., 10 / 25 / 50 / 100):
    - The plate border and the letters change colour (white, gold, ember, azure, prismatic).
    - The letter trails grow, and an aura builds on the hero.
    - Ember particles near the plates increase.
    - A tier-up flash and a sound sting.
  - **Speed feedback:** a rolling burst-WPM shows as a brief "BLAZING / SWIFT" plate when typing fast, and fast streaks add a subtle screen-edge speed glow.
  - **Word complete:**
    - The plate shatters into glowing letter fragments that converge on the hero's blade or staff.
    - A ring shockwave from the plate.
    - The perfect-word (no typo) variant is bigger and gold, with a "PERFECT" tag.
  - **Typo:** a red letter glitch and shake, a crack line across the plate, and a small dull thud. It's readable and not punishing. Zen mode softens it.
  - **Full ATB / auto-attack trigger:** the gauge ignites, the hero flashes, and a brief time-slow (0.1 s) runs before the dash.
  - **Guard word typed:** blue shield glyphs build letter by letter. On completion they snap into a barrier in front of the hero.
  - **Boss sentences:**
    - Each finished word in the sentence sends a projectile at the boss.
    - The final word triggers a big finisher cinematic: camera push, slash flurry, hit-stop.
  - **Constraints:**
    - All effects stay on the HUD layer or behind the plates, so the next letter to type is always legible.
    - Everything scales with the effects-intensity slider and reduced-motion.
    - Per-keystroke cost < 0.3 ms.
  - **AC:**
    - A capture of 10 s of typing at 40 and 90 WPM, showing all tiers.
    - The PO/Reviewer signs off that the typing "feels juicy".
    - A readability test still passes with all typing effects at max.

### M3 — Game flow and screens (≈2 days, after M1.1–1.3 and M2.1)
- **T3.1 Level runner**: sim ↔ render ↔ HUD ↔ audio wiring; pause; restart; fail screen with Second Wind; results screen (stars, gold, chests, new words).
- **T3.2 Screens**:
  - Title, Chapter 1 map (10 nodes, stars, boss node), loadout, shop, inventory/gear, Gear Cache opening (with odds button and pity counter shown), Word Journal (definitions + optional translation field), settings.
  - The touch-device block screen.
  - **AC:** keyboard-only navigation for all screens.
- **T3.3 Onboarding**: L1-1 doubles as the tutorial: targeting, ATB, guard word, skills. The first-session target is under 10 minutes to L1-3 (doc 03 §6).

### M4 — Content for Chapter 1 (≈1.5 days, parallel with M2/M3)
- **T4.1 Word data**: tiers T1–T2 (top-1000 words) + the Ch1 biome vocab (forest/ruins/cave) + boss sentences + guard words. Each entry gets a short definition and example sentence. Add a validator for distinct letters, length bands per level, and a profanity/sensitive filter. **AC:** `tools/content validate` passes.
- **T4.2 Level and enemy data**:
  - 10 level definitions: encounter compositions per the doc 02 tables (L1–2 have 2 encounters), word tier mix 60/20/15/5 (current/review/biome/weak), and the ★★★ challenges.
  - Gear list for tier 1–2: weapons ×4 archetypes, armor and accessory slots, rarities C–L.

### M5 — Backend slice (≈2 days, parallel from M1.1)
- **T5.1 D1 schema + migrations** (subset of doc 03 §5): `users`, `devices`, `refresh_tokens`, `saves` (revisions, keep the last 5), `leaderboard_entries` (+ indexes), `runs` (seed issuance), `flags`. Create the empty `gem_ledger` and `purchases` tables now so later work doesn't need a migration rewrite.
- **T5.2 API** (Hono on Workers, zod schemas in `packages/shared`):
  - `POST /auth/anon`, `POST /auth/refresh`
  - `GET/PUT /save` (If-Match revision → 409)
  - `POST /runs/start` (signed seed)
  - `POST /runs/submit` (keystroke log → re-sim with `packages/sim` → accept/flag)
  - `GET /lb/trial?scope=season|all&around=me`
  - Rate limiting with the Workers binding. Top-100 cache in KV with 60 s cron rebuild.
  - **AC:** integration tests via `wrangler dev` + vitest; a forged log (altered timings or score) is rejected; a replayed submission is idempotent.
- **T5.3 Client net layer**: anonymous login on first launch, save sync with offline queue and merge rules, Typing Trial screen + leaderboard UI (top 100 + around me).

### M6 — Balance, QA, polish (≈2 days)
- **T6.1 Balance parity**: `tools/balance` runs the three personas through Ch1 using `packages/sim` and compares them with the Python sim targets (§9). Tune `balance.ts` until within ±15%. Write the deltas to `docs/balance-ch1.md`.
- **T6.2 Bot playtest**:
  - A headless sim bot (fast) for every level at 20/40/75 WPM, with a ±10% WPM noise and 88/94/97% accuracy model.
  - A Playwright browser bot that plays L1-1, L1-5 and L1-10 for real, with screenshots at key moments: walk, battle, crit, guard, boss intro, loot, results.
- **T6.3 Visual QA**: compare screenshots against the POC v2 and the Octopath reference (`/private/tmp/.../images/1.png` may be gone, so use `poc/v2-*.png` as the baseline). At least two polish rounds on composition, contrast and readability.
- **T6.4 Perf and robustness**:
  - Frame-time budget per tier.
  - Memory stable over a 30 min soak (no leaked meshes/RTs).
  - Context-loss handling.
  - Zero console errors.

## 6. Agent roles (for the orchestrator)

| Role | Owns (write access) | Typical tasks |
|---|---|---|
| Platform | root configs, `scripts/`, `tools/` scaffolding | T0.x, CI gate |
| Sim engineer (×2) | `packages/sim`, `packages/shared` types for events | T1.x |
| Render engineer | `apps/game/src/render` | T2.1, T2.2 |
| VFX artist-engineer | `apps/game/src/render/vfx`, `level/eventBindings.ts` | T2.3 |
| UI engineer | `apps/game/src/hud`, `app/`, `meta/` | T2.4, T3.2 |
| Audio engineer | `apps/game/src/audio` | T2.5 |
| Content designer | `packages/content`, `tools/content` | T4.x |
| Backend engineer | `workers/api`, `apps/game/src/net`, `packages/shared` API schemas | T5.x |
| QA / balance | `tools/balance`, `tools/bot`, `apps/game/tests`, `docs/balance-ch1.md` | T6.x |
| Reviewer | read-only; reviews each merged task against AC and §3 | gate |

**Rules for agents:**
- Write only inside your owned paths. Cross-boundary changes go through the orchestrator.
- `packages/sim` and `packages/shared` public APIs change only via a short interface note in `docs/interfaces.md` that the orchestrator approves.
- Every task ends with `scripts/check.sh` green, plus a summary listing files changed, AC evidence (test names, screenshots, numbers) and known gaps.
- Use git worktrees per agent and merge to `main` via the orchestrator after review.
- **Models and concurrency (set by the PO):**
  - **Workers run on Sonnet** (`model: "sonnet"`). That covers all implementation tasks: code, content data, tests and ports.
  - **Deep reasoning runs on Opus** (`model: "opus"`), only for design and architecture decisions, hard debugging, interface design (`docs/interfaces.md`), balance-tuning analysis, the art/VFX review, and the Reviewer role.
  - **At most 3 agents run at the same time.** Queue the rest.
  - Don't use any orchestration skill; the orchestrator session coordinates directly with the Agent tool.

## 7. Dependency graph / parallelism

```
M0 ──┬─> T1.1 ─┬─> T1.2 ─┬─> T1.3 ─> T1.4 ─> T1.5 ─> T1.6 ─┐
     │         │         └──────────────(events API)───────┼─> T3.1 ─> T3.2 ─> T3.3 ─┐
     │         └─> T5.1 ─> T5.2 (needs T1.3 for re-sim) ─> T5.3 ───────────────────┤
     ├─> T2.1 ─> T2.2 ─────────────┐                                               ├─> M6
     ├─> T2.4 (HUD, against mocked events)                                         │
     ├─> T2.5 (audio)              └─> T2.3 (needs event list from T1.2/T1.3) ─────┤
     └─> T4.1 ─> T4.2 ──────────────────────────────────────────────────────────────┘
```

Run **at most 3 agents at once**. The suggested batches below are in priority order; start the next task as soon as a slot frees up:
- **Batch 1:** T0 (one agent, alone).
- **Batch 2:** T1.1 (sim kernel), T2.1 (render core), T5.1 (D1 schema).
- **Batch 3:** T1.2 (typing), T2.4 (HUD against mocks), T4.1 (word data).
- **Batch 4:** T1.3 (combat), T2.2 (world from data), T2.5 (audio).
- **Batch 5:** T1.4 (skills), T2.3 (VFX bindings), T5.2 (API + re-sim).
- **Batch 5b:** T2.6 (typing VFX). Use an Opus agent for the design pass, then a Sonnet worker to implement it.
- **Batch 6:** T1.5 (enemies/boss), T4.2 (level data), T5.3 (client net).
- **Batch 7:** T1.6 (rewards), T3.1 (level runner), then T3.2 and T3.3.
- **Batch 8:** M6 (T6.1–T6.4).

Interface design (`docs/interfaces.md`) and reviews use the Opus deep reasoner. Each counts toward the 3-agent limit while it runs.

Before batch 3, publish `packages/sim/src/events.ts` (the full event union) early so that render, VFX, HUD and audio can build against mocks.

## 8. Quality gates

1. **Determinism:** `sim` replay hash tests run on every check; client vs Worker re-sim parity test.
2. **Readability contract:** word plates are always on top, never overlap, and stay legible at 1280 px (screenshot test).
3. **Bots:** sim bot (all levels × 3 personas × 20 seeds) and browser bot (3 levels) must pass before a milestone closes.
4. **Perf:** a frame-time budget assertion in the browser bot (p95 < 16.7 ms at tier 0 on the dev machine).
5. **Art review:** for render/VFX tasks, attach screenshots; the reviewer compares them with `poc/v2-*.png` and rejects regressions.
6. **Accessibility:** reduced-motion, effects-intensity slider, combo modes, color-blind-safe guard-word cue (shape and badge, not only red).

## 9. Balance targets for Chapter 1 (from the economy sim v2)

| Metric (Ch1) | Beginner 20 WPM | Average 40 WPM | Fast 75 WPM |
|---|---|---|---|
| Normal level active time | 3.0–4.5 min | 2.4–3.0 min | 1.7–2.2 min |
| Boss level | ~5.4 min | ~4.2 min | ~3.4 min |
| First-try clear (normal / boss) | ≥ 80% / ≥ 50% | ≥ 97% / ≥ 85% | ≥ 99% / ≥ 90% |
| Auto-attacks per encounter (35 WPM ref) | — | ~11 | — |
| Skill damage share | 15–20% | 15–20% | 15–20% |

The exact numbers per level are in `docs/brainstorm/sim/economy_sim_output.md` (chapter 1 rows) and `02-economy-and-balance.md`. The parameter source of truth is `docs/brainstorm/sim/economy_sim.py`, ported to `packages/sim/src/balance.ts`.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sim/render coupling creeps in (logic in render) | Hard rule in §4; the reviewer rejects any `Math.random`/`performance.now` in `packages/sim` (lint rule). |
| Perf regression from ported post pipeline on weaker GPUs | Quality tiers + auto-fallback from day 1; test with Chrome CPU/GPU throttling. |
| Typing feel (input latency, key repeat, IME, dead keys) | Raw `keydown` capture, ignore `repeat`, and a latency test. Desktop-only simplifies things. |
| Audio quality is unverified by agents | Flag it for human listen-through in each audio PR; keep the procedural keystroke audio. |
| Placeholder art reads "programmer-y" | `SpriteSource` abstraction; art direction remains the POC bar. Plan a hand-drawn Aseprite pass after the slice (out of scope here). |
| Anti-cheat false positives | Flagged entries are visible only to the owner until reviewed; thresholds are configurable in the Worker env. |

## 11. References (read before starting)

1. `docs/brainstorm/00-overview.md`: locked decisions and conflict resolutions (authoritative over the other docs).
2. `docs/brainstorm/01-combat-and-levels.md`: mechanics, enemies, bosses, content tiers, pacing.
3. `docs/brainstorm/02-economy-and-balance.md` + `sim/`: numbers and formulas (v2).
4. `docs/brainstorm/03-meta-monetization-backend.md`: auth, saves, D1 schema, API, anti-cheat (§4–5). Note that its season pass section is superseded by 00-overview §6.4.
5. `docs/brainstorm/04-art-vfx-sfx-research.md` + `poc/hd2d-poc-v2.html`: the rendering reference implementation; port it, don't import it.
6. Published art demo: https://claude.ai/artifact/JX9mcuPRXBSBoQXz1fhSJx

## 12. First actions for the orchestrator

1. Read §3 and the references in §11.
2. Run M0 with one Platform agent, then review.
3. Have an Opus deep-reasoner agent write `docs/interfaces.md`, which holds the sim event union, the sim public API (`createLevel`, `step`, `applyInput`, `snapshot`, `hash`) and the API zod schemas. Get it reviewed.
4. Launch batch 2 (max 3 agents, Sonnet workers) in parallel worktrees. Track task status in `docs/STATUS.md`, one line per task: owner, state, AC evidence link.
5. After each batch: integrate, run `scripts/check.sh` + bots, and update STATUS.md. Report to the product owner with screenshots and any decisions needed.
