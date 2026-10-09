import { EnemyDef } from "../schemas.ts";

/**
 * Chapter 1 enemy roster (plan T1.5). `spriteId` is the procedural sprite key the renderer uses
 * (apps/game/src/render/sprites/artTypes.ts MonsterArt). Numbers follow the POC monster table
 * (poc/hd2d-poc-v2.html MT) normalized to weights:
 *  - hpWeight   = POC hp / 36 (the slime)
 *  - hitWeight  = POC dmg / avg grunt dmg, with the Brute scaled by its slower 12 s interval so its DPS stays near a grunt's
 *  - intervals  = economy_sim ENEMY_BASE_INTERVAL 9 s (grunt) / 12 s (brute); BOSS_BASE_INTERVAL 10 s
 * The two typing gimmicks (fading, scrambled) are not enemy kinds: they are applied per EnemyRef in a level's encounters.
 */
export const ENEMIES: EnemyDef[] = [
  EnemyDef.parse({
    id: "moss-slime",
    name: "Moss Slime",
    archetype: "grunt",
    spriteId: "slimeG",
    scale: 1.35,
    baseIntervalS: 9,
    plateLength: [3, 5],
    weaknesses: ["fire", "blunt"],
    shield: 2,
    hpWeight: 1.0,
    hitWeight: 0.9,
  }),
  EnemyDef.parse({
    id: "murk-slime",
    name: "Murk Slime",
    archetype: "grunt",
    spriteId: "slimeP",
    scale: 1.35,
    baseIntervalS: 9,
    plateLength: [4, 5],
    weaknesses: ["slash", "arcane"],
    shield: 2,
    hpWeight: 1.0,
    hitWeight: 1.0,
  }),
  EnemyDef.parse({
    id: "cave-bat",
    name: "Cave Bat",
    archetype: "grunt",
    spriteId: "bat",
    scale: 1.35,
    flying: true,
    baseIntervalS: 9,
    plateLength: [3, 4],
    weaknesses: ["slash", "pierce"],
    shield: 1,
    hpWeight: 0.7,
    hitWeight: 0.8,
  }),
  EnemyDef.parse({
    id: "goblin-scout",
    name: "Goblin Scout",
    archetype: "grunt",
    spriteId: "goblin",
    scale: 1.35,
    baseIntervalS: 9,
    plateLength: [5, 6],
    weaknesses: ["fire", "pierce"],
    shield: 3,
    hpWeight: 1.4,
    hitWeight: 1.1,
  }),
  EnemyDef.parse({
    id: "goblin-raider",
    name: "Goblin Raider",
    archetype: "brute",
    spriteId: "goblinR",
    scale: 1.35,
    baseIntervalS: 12,
    heavy: true,
    plateLength: [5, 7],
    weaknesses: ["slash", "fire"],
    shield: 3,
    hpWeight: 1.6,
    hitWeight: 1.45,
  }),
  EnemyDef.parse({
    id: "ruin-golem",
    name: "Ruin Golem",
    archetype: "boss",
    spriteId: "golem",
    scale: 1.6,
    baseIntervalS: 10,
    heavy: true,
    plateLength: [4, 7],
    weaknesses: ["slash", "blunt", "fire"],
    shield: 6,
    hpWeight: 1,
    hitWeight: 1,
  }),
];
