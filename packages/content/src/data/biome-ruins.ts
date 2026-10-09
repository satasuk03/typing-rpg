import { parseRows, plateWords } from "./lines.ts";

// Chapter 1 biome vocabulary: Ruined Gate. Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3).
const SOURCE = `
pillar | a tall stone post that holds up a roof | A pillar stands by the gate.
relic | an old object from long ago | The relic is made of gold.
glyph | a carved symbol | A glyph glows on the wall.
arch | a curved top over a door | We walked under the arch.
ruin | the broken remains of an old building | The ruin sits on the hill.
altar | a table in a temple | A candle burns on the altar.
vault | a strong room or a curved ceiling | The vault is locked.
statue | a figure carved from stone | The statue has no head.
temple | a building for worship | The temple is quiet.
shrine | a small holy place | We left a flower at the shrine.
throne | a special chair for a king | The throne is covered in dust.
carving | a shape cut into stone or wood | A carving of a bird.
column | a tall round pillar | The column leans to one side.
crumble | to break into small pieces | The old wall will crumble.
dome | a round roof | The dome shines in the sun.
engrave | to cut words into a hard surface | They engrave names on stone.
fallen | having dropped down | A fallen stone blocks the way.
fragment | a small broken piece | A fragment of a bowl.
gargoyle | a stone creature on a roof | A gargoyle watches from the tower.
golem | a giant made of stone in stories | The golem sleeps below.
inscribe | to write words on a surface | They inscribe a name on stone.
keystone | the top stone of an arch | Remove the keystone and the arch falls.
mosaic | a picture made of small tiles | The mosaic shows a bird.
moat | a ditch of water around a castle | A moat circles the fort.
monument | a building that remembers something | The monument is very old.
obelisk | a tall pointed stone pillar | An obelisk rises from the sand.
ornament | a pretty object for decoration | A gold ornament.
pedestal | a base for a statue | The statue stands on a pedestal.
plaque | a flat sign on a wall | The plaque has old words.
portal | a grand doorway | A glowing portal.
rune | a letter from an old alphabet | Each rune tells a tale.
sandstone | a soft rock made of sand | The wall is made of sandstone.
scroll | a roll of paper with writing | He unrolled the scroll.
seal | a mark pressed in wax | The letter has a red seal.
sigil | a magic sign | A sigil is carved above the gate.
spire | a thin pointed tower | The spire touches the clouds.
stairs | steps that lead up or down | Climb the stairs.
tablet | a flat piece of stone with writing | An old stone tablet.
tower | a tall narrow building | The tower leans.
torch | a stick with a flame | Hold the torch high.
tile | a flat square piece for floors | A blue tile.
tapestry | a large cloth with a picture | A tapestry hangs in the hall.
weathered | worn down by wind and rain | The weathered stone is smooth.
worn | damaged by use | The steps are worn.
banner | a long flag | A banner hangs from the tower.
chisel | a tool for carving stone | He used a chisel.
courtyard | an open space inside walls | A fountain in the courtyard.
archway | a passage under an arch | The archway is dark.
rampart | a wall for defense | We walked on the rampart.
crest | a badge or symbol | The crest shows a lion.
curse | a spell that brings bad luck | The curse is old.
doorway | an opening for a door | A cat sat in the doorway.
empire | many lands under one ruler | The empire was huge.
fresco | a painting on a wall | A fresco of a river.
idol | a statue that people honor | A golden idol.
mural | a large painting on a wall | A mural covers the wall.
oracle | a person who tells the future | The oracle spoke softly.
riddle | a tricky question | Solve the riddle.
ritual | a set of actions done in the same way | An ancient ritual.
scribe | a person who copies writing | The scribe wrote all day.
sundial | a clock that uses the sun | The sundial shows noon.
symbol | a sign that means something | A symbol of peace.
rubble | broken pieces of stone | We climbed over the rubble.
slab | a thick flat piece of stone | A slab covers the stairs.
pave | to cover a path with stone | They pave the road.
lintel | the beam above a door | A lintel of stone.
chamber | a large room | A hidden chamber.
cloister | a covered walk around a courtyard | We walked through the cloister.
hearth | the floor of a fireplace | A cold hearth.
motto | words that guide a group | The motto is carved in stone.
sentry | a guard who watches | A sentry stood at the gate.
`;

export const RUINS = plateWords(parseRows(SOURCE), { biome: "ruins" });
