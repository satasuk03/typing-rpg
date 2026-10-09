import { parseRows, plateWords } from "./lines.ts";

// Chapter 1 biome vocabulary: Sunlit Forest. Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3).
const SOURCE = `
moss | soft green plant that grows on stones | Soft moss covers the old log.
fern | a green plant with feathery leaves | A fern grows by the stream.
acorn | the nut of an oak tree | A squirrel hid an acorn.
bark | the rough outer skin of a tree | The bark feels rough.
branch | a part of a tree that grows out of the trunk | An owl sat on a branch.
bush | a small plant with many stems | A rabbit hid in the bush.
canopy | the top layer of leaves in a forest | Sunlight peeks through the canopy.
cedar | a tall tree with sweet-smelling wood | The cedar smells fresh.
clover | a small plant with three round leaves | We found clover in the grass.
deer | a graceful animal with antlers | A deer drank from the stream.
dew | tiny drops of water on grass in the morning | Dew shines on every leaf.
elm | a tall tree with wide leaves | We sat under the elm.
fawn | a baby deer | The fawn stood on wobbly legs.
fox | a clever red animal with a bushy tail | A fox crept through the ferns.
glade | an open space in a forest | We rested in a sunny glade.
hare | an animal like a rabbit with long legs | The hare sprinted away.
hazel | a bush that grows small nuts | We picked nuts from the hazel.
ivy | a plant that climbs walls and trees | Ivy covers the old tree.
lantern | a light with a handle in a case | He lit a lantern.
log | a thick piece of a fallen tree | Sit on the log.
mushroom | a small fungus shaped like an umbrella | A mushroom grew by the root.
maple | a tree with red leaves in autumn | The maple turns red.
moth | an insect like a butterfly that flies at night | A moth circled the lantern.
oak | a strong tree that grows acorns | The oak is very old.
pine | a tree with needles instead of leaves | The pine smells fresh.
petal | one colored part of a flower | A petal fell on the path.
sap | the sweet liquid inside a tree | Sap dripped from the maple.
shade | a cool place out of the sun | We rested in the shade.
sprout | a new tiny plant | A green sprout pushed up.
squirrel | a small furry animal that climbs trees | The squirrel ran up the oak.
stump | the part of a tree left after it is cut | A frog sat on the stump.
thorn | a sharp point on a stem | A thorn pricked my finger.
trail | a path through the woods | We followed the trail.
trunk | the thick main stem of a tree | The trunk is wide.
twig | a small thin branch | He snapped a twig.
vine | a plant with a long climbing stem | A vine hangs from the tree.
wren | a tiny brown singing bird | A wren sang in the bush.
bramble | a prickly bush that grows berries | We picked fruit from the bramble.
berry | a small round juicy fruit | A ripe berry is sweet.
beetle | an insect with a hard shell | A beetle crawled on the bark.
breeze | a light wind | A cool breeze moved the leaves.
bluebell | a blue flower shaped like a bell | A bluebell grows in spring.
bloom | to open into flowers | The roses bloom in June.
burrow | a hole where an animal lives | A rabbit lives in the burrow.
cricket | an insect that chirps | A cricket sang all night.
daisy | a small white flower | She picked a daisy.
dawn | the first light of the day | We woke at dawn.
dusk | the time just before night | Fireflies appear at dusk.
firefly | a beetle that glows at night | A firefly blinked in the dark.
foliage | all the leaves of a plant | The foliage is thick.
grove | a small group of trees | A grove of birch trees.
hedge | a row of bushes | A hedge circles the garden.
meadow | a field of grass and flowers | Bees fly over the meadow.
mist | a thin cloud near the ground | Mist hangs over the forest.
nettle | a plant with stinging leaves | Do not touch the nettle.
pebble | a small smooth stone | The pebble is round.
raven | a large black bird | A raven called from the pine.
resin | sticky liquid from a tree | The resin is sticky.
rustle | a soft sound like dry leaves | We heard a rustle in the bush.
seedling | a very young plant | The seedling needs water.
sparrow | a small brown bird | A sparrow ate crumbs.
stag | a male deer | The stag lifted its antlers.
sunbeam | a ray of sunlight | A sunbeam lit the glade.
thicket | a dense group of bushes | A fox hid in the thicket.
timber | wood used for building | We cut timber for the hut.
toad | an animal like a frog with rough skin | A toad sat in the mud.
tracks | marks left by an animal | We saw fox tracks.
willow | a tree with long hanging branches | A willow grows by the river.
badger | an animal with a black and white face | A badger dug a den.
lichen | a flat plant that grows on rocks | Lichen grows on the stone.
campfire | a fire made outside | We sat around the campfire.
bonfire | a large fire outdoors | The bonfire glowed.
fiddle | a small violin | A fiddle played in the glade.
birch | a tree with white bark | The birch is pale.
chestnut | a shiny brown nut | We roasted a chestnut.
cobweb | a spider's web | A cobweb shone with dew.
`;

export const FOREST = plateWords(parseRows(SOURCE), { biome: "forest" });
