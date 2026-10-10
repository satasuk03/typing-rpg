import type { WordEntry } from "../schemas.ts";
import { ch2PlateWords, ch2Sentences } from "./ch2.ts";

// Chapter 2 biome vocabulary: the Willow Grove (the boss level: an old willow that keeps every lost word).
// Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3). Every entry is chapter 2.
const SOURCE = `
cherry | a small round red fruit | A cherry hangs from the branch.
plum | a soft purple fruit | The plum is sweet.
pear | a sweet fruit that is wide at the bottom | A pear falls from the tree.
walnut | a nut with a hard shell | A walnut cracks open.
pumpkin | a large round orange vegetable | A pumpkin grows in the garden.
sunflower | a tall yellow flower | A sunflower turns to the sun.
dandelion | a yellow flower with a fluffy white head | A dandelion seed floats away.
ladybug | a small red beetle with black spots | A ladybug lands on my hand.
cocoon | a silk case that protects a young insect | The cocoon hangs from a twig.
hive | a home for bees | The hive hums with bees.
toadstool | a mushroom that is not safe to eat | A red toadstool grows by the root.
hazelnut | a small round brown nut | A hazelnut fell on the path.
evergreen | a tree that keeps its leaves all year | An evergreen stands in the snow.
sapling | a young tree | The sapling is thin and green.
woodland | land covered with trees | The woodland is calm.
yew | an evergreen tree with red berries | A yew grows by the church.
fir | an evergreen tree with needles | A fir stands on the hill.
jay | a noisy blue and gray bird | A jay screams in the oak.
nook | a small hidden corner | We sit in a nook of the grove.
lush | full of healthy green plants | The lush grove is cool.
mint | a green plant with a fresh smell | I pick a leaf of mint.
herb | a plant used for cooking or healing | Add an herb to the soup.
dell | a small valley with trees | A dell lies beyond the hill.
glen | a narrow valley | The glen is green and wet.
copse | a small group of trees | A copse stands in the field.
quail | a small round bird | A quail hides in the grass.
sage | a gray-green herb | Sage grows by the wall.
mossy | covered with moss | We sit on a mossy stone.
leafy | full of leaves | A leafy path leads on.
ripe | ready to eat | The fruit is ripe.
fragrant | having a sweet smell | A fragrant flower opens.
blooming | opening as flowers | The blooming grove is lovely.
renew | to make fresh again | The rain will renew the grove.
revive | to bring back to life | Spring will revive the garden.
rebirth | a new start | The grove sings of rebirth.
bough | a large branch of a tree | The bough hangs low.
bud | a young flower or leaf that is not open | A bud opens in the sun.
blossom | a flower on a tree | A blossom falls in the grass.
tangle | many things twisted together | The roots make a tangle.
weave | to cross threads or twigs together | The willow will weave a net.
curtain | a hanging cloth that covers a window | Willow branches form a green curtain.
sway | to move slowly side to side | The branches sway in the wind.
droop | to hang down | Willow branches droop to the ground.
hang | to be held up from above | Lanterns hang from the bough.
elder | older | The elder tree is wise.
wise | showing good thinking | A wise tree keeps our words.
orchard | a place where fruit trees grow | The orchard is overgrown.
moonbeam | a ray of light from the moon | A moonbeam touches the leaf.
sunlight | light from the sun | Sunlight returns to the grove.
daylight | the light of day | Daylight wakes the wood.
harvest | the time when crops are gathered | The harvest is rich this year.
butterfly | an insect with large colorful wings | A butterfly lands on the petal.
nectar | the sweet juice in a flower | A bee drinks the nectar.
songbird | a bird that sings | A songbird wakes the grove.
hedgehog | a small animal with sharp spines | A hedgehog curls up.
den | the home of a wild animal | A fox sleeps in its den.
mend | to fix something broken | The grove will mend itself.
heal | to become well again | Time will heal the wood.
restore | to bring back to how it was | We will restore the grove.
release | to let go | Release the lost words.
treasure | something precious | A word is a treasure.
precious | worth a lot | The old book is precious.
promise | to say you will do something | I promise to return.
sunrise | the time when the sun comes up | We wait for the sunrise.
peaceful | calm and quiet | The grove is peaceful now.
harmony | a pleasing sound of many parts | The birds sing in harmony.
chorus | a song sung by many voices | The grove sings a chorus.
melody | a short tune | A soft melody floats by.
lullaby | a gentle song for sleep | The willow hums a lullaby.
`;

const CLUES = `
orchard | I am a garden full of fruit trees.
cherry | I am a small red fruit with a stone inside and a long thin stem.
plum | I am a soft purple fruit and dried I become a prune.
pear | I am a sweet fruit shaped like a bell, green or yellow.
walnut | I am a hard-shelled snack with a wrinkled, brain-like inside.
pumpkin | I am a big orange vegetable and people carve my face at Halloween.
sunflower | I am a very tall yellow bloom that turns its face to follow the light all day.
dandelion | I am a yellow flower, and when I turn white you can blow my seeds away.
ladybug | I am a small red beetle with black spots.
cocoon | A caterpillar spins me around itself before it becomes a butterfly.
hive | Bees live inside me and fill me with honey.
toadstool | I look like a mushroom, but you should not eat me.
sapling | I am a very young tree.
butterfly | I start as a caterpillar and then grow big colorful wings.
`;

export const GROVE: WordEntry[] = ch2PlateWords(SOURCE, "grove", CLUES);

/** Hush Spells (phase 2 of the Whispering Willow). Exact case, 28-60 chars, a proper noun in most. */
const HUSH_SRC = `
Hush now, little Knight, the Willow is listening. | The Willow tells the hero to be quiet. | Hush now, little Knight, the Willow is listening.
Every word you lose is a leaf I keep. | The Willow says it keeps all the lost words. | Every word you lose is a leaf I keep.
Sleep beneath my branches, Ember Knight. | The Willow asks the hero to rest under it. | Sleep beneath my branches, Ember Knight.
Silence is softer than any song. | The Willow says quiet is gentler than music. | Silence is softer than any song.
No one speaks in the Hushwood after dark. | In this forest, nobody talks at night. | No one speaks in the Hushwood after dark.
My roots hold the voices of the Fen. | The Willow holds the voices of the marsh. | My roots hold the voices of the Fen.
Let the lanterns fade and the words go still. | The Willow wants the lights and words to stop. | Let the lanterns fade and the words go still.
Rest your hands, for typing is tiring. | The Willow tells you to stop typing. | Rest your hands, for typing is tiring.
Every whisper ends in my Grove. | All soft sounds end up here with the Willow. | Every whisper ends in my Grove.
Forget the road, Knight, and stay with me. | The Willow asks you to forget your path. | Forget the road, Knight, and stay with me.
The moon is tired, and so are you. | The Willow says you should sleep. | The moon is tired, and so are you.
Hear the leaves fall, one by one. | The Willow talks about falling leaves. | Hear the leaves fall, one by one.
Your voice will join the Hush at last. | The Willow says you will be quiet too. | Your voice will join the Hush at last.
Dream, little Knight, and forget your name. | The Willow wants you to dream and forget. | Dream, little Knight, and forget your name.
Under my boughs, the night never ends. | The Willow says night stays forever. | Under my boughs, the night never ends.
Quiet, quiet, the old tree sighs. | A soft rhyme about the sleepy Willow. | Quiet, quiet, the old tree sighs.
`;

/** Finisher sentences (the Willow's true name or a chapter quote). First is canonical. */
const FINISHER_SRC = `
Rest now, Willow, and let the words go home. | A kind goodbye; the lost words are set free. | Rest now, Willow, and let the words go home.
Every voice was once a whisper, so speak. | Voices begin softly, so you may speak now. | Every voice was once a whisper, so speak.
Thank you, Keeper of the Hush. | A thankful goodbye to the old tree. | Thank you, Keeper of the Hush.
`;

/** Second Wind sentences (Ch2 set): 8 s to type, so 10-24 chars; exact case. */
const SECOND_WIND_SRC = `
Stay awake, Knight. | Do not fall asleep. | Stay awake, Knight.
Not yet, Willow! | The fight is not over. | Not yet, Willow!
Light the Lantern. | Bring back the light. | Light the Lantern.
I still hear you. | You are not alone. | I still hear you.
Speak up, hero! | Say it out loud. | Speak up, hero!
Wake up, Ember. | Get up and fight. | Wake up, Ember.
Breathe, then rise. | Take a breath and stand. | Breathe, then rise.
My words are mine. | I keep my own words. | My words are mine.
Find your voice. | Speak again. | Find your voice.
The Hush ends now. | The quiet is over. | The Hush ends now.
`;

export const HUSH_SPELLS: WordEntry[] = ch2Sentences(HUSH_SRC, "doom", "grove");
export const WILLOW_FINISHERS: WordEntry[] = ch2Sentences(FINISHER_SRC, "finisher", "grove");
export const WILLOW_SECOND_WIND: WordEntry[] = ch2Sentences(SECOND_WIND_SRC, "secondWind", "grove");

/** Canonical Whispering Willow finisher for BossDef.phase3.finisherText (T4.3 uses it). */
export const WILLOW_FINISHER_TEXT: string = WILLOW_FINISHERS[0]?.text ?? "";
