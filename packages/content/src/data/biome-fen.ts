import type { WordEntry } from "../schemas.ts";
import { ch2PlateWords } from "./ch2.ts";

// Chapter 2 biome vocabulary: the Whisper Fen (marsh, still water, reeds, lost words).
// Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3). Every entry is chapter 2.
const SOURCE = `
beaver | an animal that builds dams | A beaver gnaws a log.
dam | a wall that holds back water | The beaver builds a dam.
lodge | the home of a beaver | The lodge sits in the pond.
lizard | a small animal with a long tail and scales | A lizard sits on the stone.
snail | a small animal with a shell on its back | A snail crosses the path.
worm | a long soft animal without legs | A worm wriggles in the mud.
stork | a tall bird with long legs and a long beak | A stork stands on one leg.
pelican | a big water bird with a large beak | A pelican dives for fish.
kingfisher | a bright blue bird that catches fish | A kingfisher flashes past.
peat | dark soil from wet land | They dig peat from the bog.
dock | a wooden platform by the water | We tie the boat to the dock.
anchor | a heavy hook that holds a boat in place | Drop the anchor here.
hook | a bent piece of metal for catching | A fish took the hook.
bait | food used to catch fish | We use worms as bait.
rod | a long thin pole for fishing | He holds the rod still.
net | a web of string for catching fish | The net is full of fish.
lagoon | a shallow pool beside the sea | The lagoon is warm and calm.
creek | a small stream | We cross the creek.
cranberry | a small red berry that grows in wet land | A cranberry grows in the bog.
frogspawn | the eggs of a frog | Frogspawn floats in the pond.
sunken | lying under the water | A sunken boat rests below.
flooded | covered with water | The flooded path is closed.
overgrown | covered with wild plants | The yard is overgrown.
fragile | easy to break | The ice is thin and fragile.
whirlpool | water that spins in a circle | A whirlpool pulls the leaf down.
waterfall | water that falls from a high place | A waterfall roars in the hills.
rainfall | the amount of rain that falls | The rainfall is heavy this week.
raindrop | one drop of rain | A raindrop lands on my nose.
snowfall | snow that falls from the sky | Snowfall covers the reeds.
reed | a tall thin plant that grows in water | A reed bends in the wind.
marsh | wet, soft land | We cross the marsh at dawn.
fen | low, wet land with plants | The fen is full of mist.
heron | a tall bird with long legs | A heron stands in the water.
ripple | a small wave on water | A ripple spreads on the pond.
swamp | a wet forest with soft ground | The swamp smells of mud.
bog | very wet, soft ground | Do not step in the bog.
puddle | a small pool of water | A puddle lies on the path.
splash | water that flies up | A splash wakes the frog.
newt | a small animal like a lizard that swims | A newt crawls on the log.
tadpole | a baby frog that swims | A tadpole wiggles past.
minnow | a very small fish | A minnow darts away.
eel | a long fish like a snake | An eel hides in the mud.
otter | a playful animal that swims | An otter dives under the log.
goose | a large water bird | A goose honks loudly.
swan | a big white water bird with a long neck | A swan glides on the lake.
crane | a tall bird with a long neck | A crane waits in the reeds.
dragonfly | an insect with long thin wings | A dragonfly rests on the reed.
cattail | a tall water plant with a brown top | A cattail sways by the shore.
lily | a flower that floats on water | A lily opens at dawn.
algae | green plants without roots in water | Algae turns the pond green.
sedge | a grass-like plant in wet ground | Sedge grows along the bank.
rush | a plant like grass that grows in water | A rush bends over the stream.
shore | the land at the edge of water | The boat reaches the shore.
brook | a small stream | A brook runs through the wood.
drizzle | light rain | A drizzle falls all day.
soggy | very wet and soft | My boots are soggy.
muddy | covered with wet earth | The muddy road is slow.
slimy | wet and slippery | The rock is slimy.
slippery | so smooth that you slide | The log is slippery.
raft | a flat boat made of logs | A raft floats on the pond.
oar | a pole with a flat end for rowing | Pull on the oar.
paddle | to move a boat with a short oar | We paddle across the lake.
sink | to go down under water | The boat will sink.
float | to stay on top of water | Leaves float on the pond.
wade | to walk through water | We wade across the brook.
dive | to jump into water head first | The duck will dive.
flow | to move like water | The stream will flow on.
current | water that moves in one direction | The current is strong.
tide | the rise and fall of the sea | The tide comes in.
reflect | to show an image back | The lake will reflect the moon.
reflection | an image you see in water or glass | I see my reflection in the pond.
bubble | a thin ball of air in water | A bubble pops.
foam | a mass of tiny bubbles | Foam floats on the stream.
depth | how deep something is | The depth is hard to see.
shallow | not deep | The brook is shallow here.
mosquito | a small insect that bites | A mosquito buzzes near my ear.
glowworm | a small insect that gives off light | A glowworm shines in the grass.
buzz | a low humming sound | I hear a buzz near the reeds.
croak | the deep sound a frog makes | A croak comes from the reeds.
honk | the loud sound a goose makes | The goose gives a honk.
quack | the sound a duck makes | I hear a quack.
feather | a light part of a bird's wing | A feather floats down.
beak | the hard mouth of a bird | The heron has a long beak.
webbed | with skin joining the toes | The duck has webbed feet.
lure | to pull someone with a trick | The light will lure us in.
guide | to show someone the way | A frog will guide us.
lost | not able to find the way | We are lost in the fen.
mirage | something that seems real but is not | The lights are a mirage.
secluded | quiet and far from people | A secluded pond lies ahead.
tranquil | calm and peaceful | The tranquil water is still.
wetland | land covered with shallow water | The wetland is full of life.
waterlily | a flower that floats on a pond | A waterlily floats on the pond.
bulrush | a tall plant that grows in water | A bulrush leans in the wind.
shallows | the part of water that is not deep | We play in the shallows.
`;

const CLUES = `
reed | I am a tall thin plant that grows in shallow water.
marsh | I am wet, soft land where tall plants and frogs live.
heron | I am a tall bird that stands still on long legs and catches fish.
ripple | I am a little wave made when you drop a stone in a pond.
otter | I am a playful furry animal that swims and eats fish.
swan | I am a large white bird with a long, curved neck.
lily | I am a flower that sits on top of a pond.
bubble | I am a round ball of air that floats and pops.
feather | I grow on a bird and help it to fly.
puddle | I am a small pool of rain on the road.
raft | I am a flat boat made by tying logs together.
eel | I am a long, slippery fish that looks like a snake.
goose | I am a big bird that honks and flies in a V shape.
cattail | I am a tall plant with a brown, furry top like a sausage.
beaver | I cut down trees with my teeth and build walls across streams.
snail | I carry my home on my back and I move very slowly.
lizard | I am a small, scaly animal that sits in the sun and has a long tail.
stork | I am a tall white bird with long red legs and I carry babies in stories.
dock | Boats stop at me and people walk out on me to reach the water.
anchor | A ship drops me to the bottom so that it does not drift away.
net | A fisher throws me into the water to catch many fish at once.
worm | I am long, soft, and pink, and I wriggle through the soil.
kingfisher | I am a small blue bird that dives into rivers for fish.
peat | I am dark, wet soil from a bog that people can burn.
hook | I am a bent piece of metal on a line, and a fish may bite me.
waterfall | I am a river that falls over a high cliff.
`;

export const FEN: WordEntry[] = ch2PlateWords(SOURCE, "fen", CLUES);
