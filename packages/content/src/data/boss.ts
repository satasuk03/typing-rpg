import type { WordEntry } from "../schemas.ts";
import { parseRows, type RawRow } from "./lines.ts";

// Ruin Golem boss content (doc 01 section 4.2, interfaces D14-D17).
// Row format: text | what it means in simple English | (example = the sentence itself for sentences)

/** Doom Spell sentences (phase 2). Timer = chars / (pace_cps * 0.8) + 2 s, so keep them 28-60 chars. */
const DOOM_SRC = `
Crumble, brave one, beneath my ancient weight. | The golem says you will be crushed by his weight. | Crumble, brave one, beneath my ancient weight.
Dust and stone shall bury your small light. | The golem says dust will cover your little light. | Dust and stone shall bury your small light.
Every gate must close and every road must end. | The golem says all paths will be shut. | Every gate must close and every road must end.
Fall, tiny hero, as the old mountain falls. | The golem says you will fall like a mountain. | Fall, tiny hero, as the old mountain falls.
Heavy rock, heavy hands, hold the sleeping dark. | A rhyme about stone hands that keep the dark. | Heavy rock, heavy hands, hold the sleeping dark.
Let the hollow shake and the ceiling break. | The golem asks the cave to shake and break. | Let the hollow shake and the ceiling break.
No torch can warm a heart of cold stone. | A fire cannot warm a heart made of stone. | No torch can warm a heart of cold stone.
Over your head the ruin begins to roar. | The old ruin makes a loud sound above you. | Over your head the ruin begins to roar.
Rise, old guardians, and break this fragile spell. | The golem calls old guards to break your magic. | Rise, old guardians, and break this fragile spell.
Silence the singer and silence the sword. | The golem wants no songs and no fighting. | Silence the singer and silence the sword.
The ground will tremble and the sky will fall. | The golem says the earth will shake. | The ground will tremble and the sky will fall.
Under this hill your story ends today. | The golem says your tale stops here. | Under this hill your story ends today.
Waken, ancient power, and shake the world. | The golem asks old magic to wake up. | Waken, ancient power, and shake the world.
Your quick fingers cannot outrun the falling rock. | The golem says you cannot type faster than rocks fall. | Your quick fingers cannot outrun the falling rock.
Bury the bright knight under a hill of stone. | The golem wants stones to cover the hero. | Bury the bright knight under a hill of stone.
Great walls of stone will rise around you. | Big stone walls will grow near you. | Great walls of stone will rise around you.
`;

/** Finisher sentences (doc 01 section 4.2: the boss's true name or a chapter quote). First is canonical. */
const FINISHER_SRC = `
Rest now, Ruin Golem, and let the old stones sleep. | A kind goodbye to the golem; the fight is over. | Rest now, Ruin Golem, and let the old stones sleep.
Every ruin was once a home, so rest now. | Old broken places were homes once. | Every ruin was once a home, so rest now.
Sleep well, guardian of the hollow. | A gentle goodbye to the cave guard. | Sleep well, guardian of the hollow.
`;

/** Second Wind sentences: 8 s to type, so 10-24 chars (a 35 WPM typist makes about 2.4 chars/s). */
const SECOND_WIND_SRC = `
Never give up. | Keep trying even when it is hard. | Never give up.
Rise and fight! | Get up and keep going. | Rise and fight!
Stand up, hero. | Get back on your feet. | Stand up, hero.
I am not done. | I still want to go on. | I am not done.
Keep on going. | Do not stop. | Keep on going.
Breathe and rise. | Take a breath and stand up. | Breathe and rise.
One more try. | Try again. | One more try.
Hold the line. | Stay strong and do not move back. | Hold the line.
Try it again. | Make another try. | Try it again.
Light the way. | Show the path with your light. | Light the way.
Be brave now. | Find your courage. | Be brave now.
Win this fight. | Do your best to win. | Win this fight.
`;

/** Falling Rubble words (phase 3): short, readable, mostly distinct initials. */
const MINIGAME_SRC = `
dust | tiny dry pieces of earth | Dust fell from the roof.
crack | a thin break in a surface | A crack ran up the wall.
brick | a block for building walls | A brick dropped.
chip | a small broken piece | A chip of stone flew off.
shard | a sharp broken piece | A shard of rock fell.
grit | very small pieces of sand | Grit got in my eye.
chunk | a thick piece | A chunk fell from the ceiling.
beam | a long thick piece of wood or stone | A beam crashed down.
clay | soft sticky earth | Clay slid down the wall.
dirt | loose earth | Dirt rained from above.
heap | a pile | A heap of stones.
lump | a small hard piece | A lump of coal.
mound | a small hill of earth | A mound of rubble.
quake | a shaking of the earth | The quake shook the hall.
rumble | a deep rolling sound | A rumble came from below.
smash | to break loudly | The stone will smash.
tumble | to fall over and over | Rocks tumble down.
wedge | a piece that is thick at one end | A wedge of stone.
jolt | a sudden shake | A jolt hit the floor.
flake | a thin light piece | A flake of plaster fell.
plank | a long flat piece of wood | A plank snapped in two.
yank | to pull with a sudden force | The rope will yank free.
`;

function sentenceEntries(source: string, use: "doom" | "finisher" | "secondWind"): WordEntry[] {
  return parseRows(source).map((r: RawRow) => ({
    text: r.text,
    key: r.text.toLowerCase(),
    kind: "sentence" as const,
    tier: 1,
    biomes: ["hollow" as const],
    uses: [use],
    definition: r.definition,
    example: r.example,
    translations: {},
  }));
}

export const DOOM_SPELLS = sentenceEntries(DOOM_SRC, "doom");
export const FINISHERS = sentenceEntries(FINISHER_SRC, "finisher");
export const SECOND_WIND = sentenceEntries(SECOND_WIND_SRC, "secondWind");

export const RUBBLE_WORDS: WordEntry[] = parseRows(MINIGAME_SRC).map((r) => ({
  text: r.text,
  key: r.text.toLowerCase(),
  kind: "word" as const,
  tier: 1,
  cefr: "A2" as const,
  biomes: ["hollow" as const],
  uses: ["minigame" as const],
  definition: r.definition,
  example: r.example,
  translations: {},
}));

/** Canonical Ruin Golem finisher for BossDef.phase3.finisherText (T4.2 uses it). */
export const RUIN_GOLEM_FINISHER_TEXT: string = FINISHERS[0]?.text ?? "";
