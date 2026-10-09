import type { ActiveSkillDef, PassiveDef } from "../schemas.ts";

/**
 * The slice set: 6 actives and 8 passives (interfaces D20). Numbers live in BALANCE.SKILLS / BALANCE.PASSIVES (D19).
 * Description placeholders are filled by the UI from BALANCE.SKILLS[id]:
 *   {dmg}    = atk_mult (or atk_mult_all) as a percent of ATK, e.g. "120%"
 *   {charge} = charge (words)
 *   {secs}   = burn_s or freeze_s
 * `iconId` / `vfxId` are forward keys for the HUD (T2.4) and the VFX library (T2.3). `sfxId` is an existing procedural
 * sound (apps/game/src/audio/types.ts SFX_IDS; tools/content checks it).
 * `unlockLevel` is the level whose first clear unlocks the skill (absent = part of the starter kit).
 * Starter kit: actives Fireball + Aegis (the HUD mock's pair), passives Clean Cut + Steady Hands + Iron Will.
 */
export const ACTIVES: ActiveSkillDef[] = [
  {
    id: "fireball",
    name: "Fireball",
    description: "Hurls a fireball for {dmg} of your ATK and sets the target ablaze for {secs} s.",
    iconId: "icon.skill.fireball",
    vfxId: "vfx.skill.fireball",
    sfxId: "skillFire",
  },
  {
    id: "aegis",
    name: "Aegis",
    description: "A rune barrier soaks the next enemy attacks. It casts as a guard word appears.",
    iconId: "icon.skill.aegis",
    vfxId: "vfx.skill.aegis",
    sfxId: "guard",
  },
  {
    id: "slashWave",
    name: "Slash Wave",
    description:
      "A crescent of steel hits every enemy for {dmg} of your ATK. It waits for a crowd.",
    iconId: "icon.skill.slashWave",
    vfxId: "vfx.skill.slashWave",
    sfxId: "slash",
    unlockLevel: "ch1-l03",
  },
  {
    id: "piercingThrust",
    name: "Piercing Thrust",
    description: "A focused lunge for {dmg} of your ATK that cracks through enemy shields.",
    iconId: "icon.skill.piercingThrust",
    vfxId: "vfx.skill.piercingThrust",
    sfxId: "slash",
    unlockLevel: "ch1-l04",
  },
  {
    id: "mendingLight",
    name: "Mending Light",
    description: "Warm light restores a good part of your HP. It casts when you are hurt.",
    iconId: "icon.skill.mendingLight",
    vfxId: "vfx.skill.mendingLight",
    sfxId: "heal",
    unlockLevel: "ch1-l06",
  },
  {
    id: "frostLock",
    name: "Frost Lock",
    description:
      "Ice freezes every enemy's attack gauge for {secs} s. It casts as an attack winds up.",
    iconId: "icon.skill.frostLock",
    vfxId: "vfx.skill.frostLock",
    sfxId: "skillMagic",
    unlockLevel: "ch1-l08",
  },
];

export const PASSIVES: PassiveDef[] = [
  {
    id: "cleanCut",
    name: "Clean Cut",
    description: "Perfect words raise the crit chance of your next auto-attack.",
    tag: "precision",
    iconId: "icon.passive.cleanCut",
  },
  {
    id: "steadyHands",
    name: "Steady Hands",
    description: "Your first typo in each fight does not crack your combo.",
    tag: "precision",
    iconId: "icon.passive.steadyHands",
  },
  {
    id: "ironWill",
    name: "Iron Will",
    description: "Blocking a hit leaves you almost unharmed.",
    tag: "defense",
    iconId: "icon.passive.ironWill",
  },
  {
    id: "openingGambit",
    name: "Opening Gambit",
    description: "Every fight begins with your attack gauge half full.",
    tag: "speed",
    iconId: "icon.passive.openingGambit",
    unlockLevel: "ch1-l02",
  },
  {
    id: "bulwarkStreak",
    name: "Bulwark Streak",
    description: "A streak of perfect words conjures a one-hit barrier.",
    tag: "defense",
    iconId: "icon.passive.bulwarkStreak",
    unlockLevel: "ch1-l03",
  },
  {
    id: "riposte",
    name: "Riposte",
    description: "A perfect parry answers with a much harder counter.",
    tag: "tech",
    iconId: "icon.passive.riposte",
    unlockLevel: "ch1-l05",
  },
  {
    id: "lastStand",
    name: "Last Stand",
    description: "When your HP runs low, your attack gauge charges faster.",
    tag: "speed",
    iconId: "icon.passive.lastStand",
    unlockLevel: "ch1-l07",
  },
  {
    id: "comeback",
    name: "Comeback",
    description: "After a typo, your next perfect word wins back half the combo you lost.",
    tag: "tech",
    iconId: "icon.passive.comeback",
    unlockLevel: "ch1-l09",
  },
];
