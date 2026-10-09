import { parseRows, plateWords } from "./lines.ts";

// Chapter 1 biome vocabulary: Ember Cave. Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3).
const SOURCE = `
stalactite | a stone spike that hangs from a cave roof | A stalactite drips water.
stalagmite | a stone spike that grows up from a cave floor | A stalagmite rises from the floor.
ember | a glowing piece of burning wood | An ember glows in the ash.
crystal | a clear shiny stone | A crystal shines in the dark.
cavern | a very large cave | The cavern is huge.
tunnel | a long passage under the ground | The tunnel is dark.
echo | a sound that comes back | We heard an echo.
drip | to fall in small drops | Water will drip from the roof.
gem | a precious stone | A red gem.
geode | a rock with crystals inside | He cracked open a geode.
glow | to shine softly | The moss will glow.
grotto | a small cave | We rested in a grotto.
gravel | small pieces of rock | Gravel crunched under our boots.
lava | hot melted rock | Lava flows down the slope.
pickaxe | a tool for breaking rock | He swung a pickaxe.
miner | a person who digs for rock and metal | The miner found coal.
ore | rock that contains metal | The ore is full of silver.
quartz | a hard shiny mineral | A piece of quartz.
ruby | a red precious stone | The ruby glows.
amber | a gold-brown stone | An amber ring.
bat | a flying animal that sleeps upside down | A bat hung from the roof.
chasm | a deep crack in the earth | A chasm opens in the floor.
cliff | a steep rock wall | We stood by the cliff.
coal | a black rock that burns | The fire needs coal.
damp | a little wet | The cave is damp.
depths | the deep parts | The depths are cold.
dim | not bright | A dim light.
flint | a hard stone that makes sparks | Strike the flint.
fossil | the print of an old animal in stone | A fossil in the rock.
fungus | a plant-like living thing like a mushroom | Fungus grows in the dark.
glimmer | a faint light | A glimmer of light.
granite | a hard gray rock | The wall is granite.
jagged | with sharp points | The rocks are jagged.
ledge | a narrow shelf of rock | We rested on a ledge.
limestone | a pale rock | A cave in limestone.
magma | melted rock below the ground | Magma glows red.
mineral | a natural solid in the ground | Salt is a mineral.
obsidian | black glass formed by lava | A sharp piece of obsidian.
pit | a deep hole | Do not fall in the pit.
shaft | a narrow tunnel going down | The shaft goes deep.
shimmer | to shine with a soft light | The water will shimmer.
slate | a dark gray rock | The roof is slate.
smoky | full of smoke | The air is smoky.
soot | black powder from fire | Soot covers the wall.
spark | a tiny bit of fire | A spark jumped up.
steam | hot water in the air | Steam rises from the pool.
tremble | to shake | The ground will tremble.
vent | an opening for air or gas | Steam comes from the vent.
wisp | a thin line of smoke or light | A wisp of smoke.
cinder | a small piece of burnt coal | A cinder fell.
ashes | the gray powder left after a fire | Ashes lay in the hearth.
blaze | a big bright fire | A blaze lit the cave.
flicker | to shine in an unsteady way | The torch will flicker.
furnace | a very hot oven | The furnace roars.
heat | being hot | I feel the heat.
kindle | to start a fire | Kindle a small flame.
rockfall | rocks that fall from above | A rockfall blocks the path.
sinkhole | a hole that opens in the ground | A sinkhole opened.
slick | wet and slippery | The floor is slick.
nugget | a small lump of metal | A nugget of gold.
beacon | a bright light that guides | A beacon on the cliff.
cavity | a hollow space | A cavity in the rock.
dripstone | rock made by dripping water | The dripstone shines.
emerald | a green precious stone | An emerald glows.
fissure | a long thin crack | A fissure in the wall.
gleam | to shine brightly | The gem will gleam.
hollow | empty inside | The tree is hollow.
`;

export const CAVE = plateWords(parseRows(SOURCE), { biome: "cave" });
