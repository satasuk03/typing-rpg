# TODO: after the Chapter I slice

The slice is done: every DoD line is met and the PO signed off on "typing feels juicy" on 2026-10-10. These items are for a later session. For context, read `docs/HANDOFF.md` and `docs/STATUS.md`.

## Needs the PO
- **Frontend:** deployed on 2026-10-10. Every push to `main` deploys it to https://satasuk03.github.io/typing-rpg/ (`.github/workflows/deploy-pages.yml`). The workflow runs typecheck, lint and unit tests first. It is local-only: there is no `VITE_API_URL`, so saves stay in IndexedDB and there's no leaderboard.
- **Deploy the backend.**
  - **Cloudflare IDs:** create the D1 database and the KV namespace, then replace the placeholder `database_id` and KV id in `workers/api/wrangler.toml`.
  - **Secrets:** `wrangler secret put JWT_SECRET` and `wrangler secret put TICKET_SECRET`.
  - **CORS:** set `ALLOWED_ORIGINS`.
  - **Game build:** set `VITE_API_URL`. Until then the game runs local-only (IndexedDB save, no requests).
- **Turnstile:** verify the anti-bot check against the real deployment.
- **Word blocklist:** a human reviews it before release.

## Cleanup round
Done on 2026-10-10. Save v2 (journal notes, New Game `resetEpoch`), L10 hollow vocab, stale docs, visual nits, and the HUD lint fix are all merged.
- **Lint:** about 63 Biome warnings remain outside the HUD (`level/bot.ts`, `render/post/pipeline.ts`, …). They don't fail the check.
- **New Game:** there's no e2e test for New Game → reload (unit tests cover it). Two devices that each reset offline from the same epoch tie and merge normally (see interfaces v1.8).

## PO feedback 2026-10-10 (done)
- The title logo now reads "Typing Adventure" in pixel art. The skill icons are now 16×16 pixel art.
- **Guard leak (option G, `docs/qa/block-chance-analysis.md`).** Typed guards always work. A stronger attack leaks `clamp(1 − armor/attack, 0, 50%)`.
  - In Ch1 only the Golem and its adds leak (P = 1.25× par). `BOSS_LEVEL_HIT_MULT` went 1.3 → 1.15.
  - The HUD shows a cracked-shield badge, a crimson leak pop, and a hint on the results screen.
  - Reachable fix: armor +3 costs 1,148 gold in Gear; L1-L9 first-clear gold with 1 star each is about 1,210, so the Golem leak drops from 20% to 3% (test in `apps/game/tests/app/ops.test.ts`).
- **For Ch2:** set grunt attack power around 1.07× par and elites/bosses 1.25–1.35×. Re-solve `HIT_MULT` per chapter. Check that par−3 upgrades land near 1.3× the damage budget.

## PO feedback 2026-10-10: starter kit (not started; do after T1.1 merges)
- **Smaller starter kit.**
  - New players start with only **1 active and 1 passive** (Fireball + Clean Cut is a suggestion). Today they start with Fireball + Aegis and Clean Cut + Steady Hands + Iron Will.
  - Move the other starter skills (Aegis, Steady Hands, Iron Will) into `unlockLevel` slots.
  - **Every skill must unlock before the L10 boss** (the latest is the L9 clear), so the boss balance barely changes.
- **No balance retune.** The PO thinks the game is easy enough. Report the `pnpm balance` and bot results, but don't retune knobs.
- **Fix the Iron Will text.** "Blocking a hit leaves you almost unharmed." oversells it: the real effect is that blocked hits deal 15% instead of 20%. Make the text state the real effect.
- **Model:** a small Sonnet task. Files: `packages/content/src/data/skills.ts`, the new-profile kit in `apps/game/src/meta/ops.ts`, and any tests or HUD/onboarding that assume the 2-active starter kit.

## Ch2 art backlog (polish later, per PO 2026-10-10; doesn't block milestones)
- **T2.1 hushwood/grove** (`docs/qa/ch2-t2.1/`):
  - Moss on oaks and the root arch still uses thin strands; move it to `lock`.
  - The Willow core is a stand-in (T2.3).
  - Firefly blink is missing.
  - Hush motes are only in the dev scene.
  - Fog cards for mixed-biome levels are needed per segment (T2.2/T2.4).
  - The hero's fill/rim should be set per mood. The hushwood hero silhouette scores 0.79, a thin margin.
  - Back-row oaks are very dark.
  - Cobweb veil and waystone variants are still to do.
- **T2.2 fen + water** (`docs/qa/ch2-t2.2/`):
  - Firefly blink is still missing: `PARTICLE_FS` is shared with Ch1 and the typing VFX pools and has no per-particle phase.
  - Layouts: add `fen` to `LAYOUT_BIOMES` and to the ground-kind enum in `render/world/layout.ts` (T2.4). `WorldBuilder` already calls `addGround(.., "fen")`, which builds the water.
  - Backdrop kinds `skyDusk|mountainsDusk|treelineDusk` need adding to the layout backdrop enum too (T2.4).
  - The mock's warm gold dusk haze behind the far cypresses is a little greener here; the dusk backdrop tint wants a pass.
  - Reflections of far cypresses and reeds are mostly hidden by fog and reeds in the battle framing; tier 0 vs 1 differ only slightly. A second pool visible between the reeds would show them off.
  - Lily pads are a flat decal: no sway and no flower variants. Boardwalk planks have no per-plank warp or moss.
  - Cypress and reed sprites are the mock's, with no outline pass; the sunken columns are barely visible.
  - Hero rim in the fen: the dev scene sets `caveRim` 0.9 (caveK is 0.3). The game layer should set it per mood (hero silhouette 0.79).
  - The perf figures are for the bare diorama (no HUD, sim or combat VFX). Re-measure on a real fen level once T2.4 lands (T5.3).
- **T2.3 sprites** (`docs/qa/ch2-t2.3/`):
  - **Willow face:** washed out by the grove's violet key light. Lower it or add a face rim. The Willow also needs breath, sway and lash animation on stage.
  - **Shade mask:** can read as a skull at 1×. PO look needed.
  - **Toad:** separate the legs and toes more, and add a hop frame.
  - **Wolf:** shaggier ruff, and a howl muzzle.
  - **Moth and Wisp:** more detail, plus flicker and hurt/die frames.
  - **Elite:** add an outline pulse, and bind `ELITE_FX` in `stage.ts`.
  - **Hurt poses:** every enemy needs one.
  - **Willow freed state:** the blossoms and canopy curtains aren't drawn yet.
- **T2.4 layouts** (`docs/qa/ch2-t2.4/`):
  - **Fen variety:** fen L5, L7 and L8 look nearly identical at the battle camera. Vary the framing, props and light per level.
  - **Hushwood lighting:** the levels are darker than the T2.1 diorama, and lanterns blow nearby oaks out to orange.
  - **Visibility:** the L6 sunken columns barely read, and the pool placement can't be authored because the pool mask is noise-driven in the shader.
  - **Grove:** the roots ground reads glittery cyan.
  - **Riddle layout:** check that the leaf positions and the add slots don't overlap on screen at L10.
- **T3.2 VFX** (`docs/qa/ch2-t3.2/`):
  - **For the HUD:**
    - a green "+N" heal pop and a green HP-bar fill on heal (add `EnemyHealed` to `HUD_HANDLED`);
    - Fading words: letter alpha, a 0.85 floor on the next letter, and the violet underline;
    - a gold mix on the capital-letter pop.
  - **World-side gaps:** Fading-shade world cues; death/slam FX for the wisp, shade and toad; fen water ripples; the Reveal skill puff.
  - **Willow ambience:** a grove-dawn mood crossfade on the finale; a frond tint per right answer; leaf-storm rates.
  - **Riddle readability:** the wrong-answer wither barely reads. Make the flakes larger.
  - **Probe margin:** the freed-finale keep-out probe is at 208 against a 215 limit and could flake.
  - **Re-tune** against the real Ch2 biomes once T4.3 lands. The stills were taken on the Ch1 forest.
- **Ch1 flipped-normal fix (proposal).** Mirrored Ch1 props are lit from the wrong side. Negate `nn.x` for mirrored meshes. The effect is subtle in daylight. This changes the Ch1 look, so it needs a before/after (`docs/qa/ch2-t2.1/proposal-ch1-flipped-normal.jpg`).

## Tech debt
- **Re-measure on a quiet machine with no agents running.** `apps/game/tests/hud/typingPerf.spec.ts` read 0.65 ms/key against the 0.45 budget during T3.1, but `main` read 0.649 under the same load, so no regression is proven. Get a quiet-machine number before Ch2 sign-off.
- **Ch2 HUD follow-ups:** the 250 ms slide-in for the riddle panel, gold trim on elite-owned plates, and possibly a ✚ pulse on the healer's word plate (art §5).
- The bot doesn't model the extra cost of Shift for capitals. That matters for the Ch2 Hush Spells, so do it in T5.1.
- The `tools/content` validator has no riddle-boss pool rule yet; it's only a comment. T4.3 should add it.
- `tools/balance/src/gear.ts` copies the sim's upgrade-step rule and the `guardLeakBp` formula, because the sim exports neither. Export them from `packages/sim` and have the tool import them, so they can't drift.

## Next big step
- Chapter 2 content and systems, per `docs/IMPLEMENTATION_PLAN.md` and the brainstorm docs.
