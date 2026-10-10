# ICP v2.0.3: Chapter 2 skills (T1.4)

Status: **proposed**, implemented on the T1.4 branch. Resolves Review note 7 of v2.0 for `reveal` and `calmMind`.
Scholar is **deferred** (see the end). SIM_VERSION stays 1.

## 1. Ids and unlocks (data-driven in `packages/content/src/data/skills.ts`)

| id | kind | tag | unlockLevel (first clear) |
|---|---|---|---|
| `reveal` | active | | `ch2-l03` (CH2_PLAN §3.1: Hollow Oaks, Fading review) |
| `calmMind` | passive | defense | `ch2-l05` (Mirewater Edge, Brute) |
| `scholar` | passive | | still reserved, would unlock `ch2-l07` |

`ActiveSkillId` gains `"reveal"`, `PassiveId` gains `"calmMind"`. New type `DamageSkillId = Exclude<ActiveSkillId, "reveal">`:
`RunState.stats.damageBySkillM` and `Result.stats.damageBySkillM` are `Record<DamageSkillId, number>`. Reveal never deals damage,
so the table keeps exactly its Ch1 six keys. `ActiveSkillDef.id` / `PassiveDef.id` (zod enums) gain the two ids.

## 2. Reveal (active)

Intent (CH2_PLAN §2 S7): strips plate gimmicks for 8 s. Helps with Fading words; riddle leaf plates are untouched (the answer stays hidden until resolution, §3.6).

- BALANCE: `SKILLS.reveal = { charge: 8, duration_s: 8, cast: "whenGimmick" }` -> `K.SKILL_CHARGE_M.reveal = 8000`, `K.REVEAL_T = 480`.
- Charge: as every active (per word / per 5 chars from tier T4, Staff x1.5, perfect x1.5).
- Cast (step 6, live combat only):
  - smart: no Reveal running **and** some plate is hiding its letters now (`plate.faded || plate.scrambled`).
  - asap: no Reveal running **and** some alive enemy carries a gimmick.
  - Never casts with no gimmick in the fight, so no charge is wasted on a pointless cast.
- Effect:
  - `SkillCast{skillId:"reveal", targetIds:[], impactTick}` as for other skills; at `impactTick` every plate in the encounter has `fadeAt = null`, `faded = false`, and scrambled plates unscramble (`display = text`, `WordUnscrambled` per plate). No damage, no `Hit`.
  - `RunState.revealUntil = impactTick + REVEAL_T` is set **at cast** (so it cannot be recast during the 0.4 s impact delay) and again at impact (same value). While `tick < revealUntil`, plates created by `addPlateFor` (encounter.ts) are plain: no scramble (no `gimmickRng` draw), no `fadeAt`, `plate.gimmick = null`. Guard plates were never gimmick plates.
  - Fading plates keep their typed state; a plate already faded gets its letters back (the view reads `PlateView.faded`).
- Determinism: integer ticks, no RNG. While Reveal runs the encounter's `gimmickRng` is not drawn for new plates. That changes the gimmick stream position only in runs that cast Reveal.

## 3. Calm Mind (passive)

Intent: a non-gear defensive answer for Beginners. Telegraph +0.5 s (CH2_PLAN §2).

- BALANCE: `PASSIVES.calmMind = { guard_bonus_s: 0.5 }` -> `K.CALM_MIND_GUARD_T = 30`.
- Effect: `guardSpanTicks` adds `CALM_MIND_GUARD_T` when equipped (applied after the story bonus and the tutorial multiplier). The guard word appears 0.5 s earlier (windup, guard plate and its deadline), the impact tick is unchanged. Applies to all enemies including bosses (they use `scheduleAttack`). Stacks with Story's +1 s.
- No event: it is a rule, like Iron Will's multiplier. (No `PassiveTriggered`: it would fire on every guard.)

## 4. Events and view fields

None added. `SkillCast`, `SkillCharged`, `WordUnscrambled` and `SkillView{id:"reveal"}` carry everything. Consequently `level/eventBindings.ts` and `audio/bindings.ts` need no change. A "Reveal is running" HUD marker is **not** provided (v2.0.3 keeps view unchanged); if the PO wants one, add `HeroView.revealTicksLeft?: number` (absent unless active) in a later ICP.

## 5. State and byte-identity

- `RunState.revealUntil?: Tick` is **absent** until Reveal is first cast (v2.0 rule: new optional keys are absent unless used), so Ch1 state/hash is unchanged.
- `damageBySkillM` keeps its six keys (see section 1).
- `CONTENT_VERSION` changes because `skills.ts` gained two entries. Ch1 tests, goldens, `pnpm balance` and `pnpm bot --quick` Ch1 output are otherwise identical (checked by diff). A merge conflict on `content-version.generated.ts` is expected (regenerate).
- Ch1 never unlocks the new skills (`ch2-l03` / `ch2-l05`), and a Ch1 loadout can't equip them.

## 6. Tables updated

| Table | Change |
|---|---|
| `packages/sim/src/balance.ts` BALANCE.SKILLS / PASSIVES / K | rows and constants above |
| `packages/sim/src/meta/loadout.ts` ACTIVES / PASSIVES | ids accepted |
| `packages/content/src/schemas.ts` enums | ids |
| `apps/game/src/hud/skillIcons.ts` | `reveal` pixel icon (an eye), accent `#ffe08a` |
| `apps/game/src/hud/panels.ts` skillName | `REVEAL` |
| `apps/game/src/render/vfx/combat/params.ts` SKILL_STYLE | pale-gold hero cast-up swirl; **no** impact body (no damage). `SkillFx.skillHit` already ignores unknown ids |
| `tools/balance/src/runner.ts` | `--kit ch2` (Fireball + Reveal, Clean Cut + Calm Mind + Iron Will) |
| `sfxId` of Reveal | reuses `skillMagic` (no new SFX; a bespoke chime is a polish item for T3.3-style audio) |

Not touched (other agents' paths): `apps/game/src/app/icons.ts` has no `skill.reveal` / `passive.calmMind` glyph (menu icons use a fallback; the owner of `app/**` should add them), `app/skillText.ts` `{secs}` reads only `burn_s`/`freeze_s`, so Reveal's description states "eight seconds" literally. `tools/content/src/rules-content.ts` `ruleSkills` lists the required ids (A/P arrays): add `reveal` / `calmMind` there when convenient (the rule passes without).

## 7. Scholar: deferred

Rule asked for: +1 skill charge per new-word plate. The sim has no notion of a "new" word during a level: `ResolvedLevel.words` pools are flat string lists and the player's journal/SRS state is not an input of `createLevel` (only `dueWeakWords` goes to `resolveLevel`). Doing it right needs (a) a `newWords` set in `ResolvedLevel` fed from the save (new input, new golden), (b) a per-plate flag and a new event or a `PlateView` field for the VFX, and (c) a definition of "new" (never completed? not mastered?) the PO has not decided. That is more than a modest amount of work and touches resolve and the save contract. Proposal: ship Ch2 with Reveal and Calm Mind; the `ch2-l07` unlock slot stays empty (or grants a gear/lore reward, a content decision); implement Scholar in a later ICP once (c) is decided.
