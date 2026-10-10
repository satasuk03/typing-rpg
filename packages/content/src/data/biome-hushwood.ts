import type { WordEntry } from "../schemas.ts";
import { ch2PlateWords, ch2Sentences } from "./ch2.ts";

// Chapter 2 biome vocabulary: the Hushwood (moonlit haunted forest: lanterns, whispers, silence, lost words).
// Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3). Every entry is chapter 2.
const SOURCE = `
phantom | a ghost | A phantom drifts down the hall.
wraith | a pale ghost-like spirit | A wraith floats between the trees.
lurk | to hide and wait quietly | Something may lurk in the dark.
stalk | to follow quietly | A cat will stalk the mouse.
tiptoe | to walk quietly on your toes | We tiptoe past the sleeping owl.
hoot | the call of an owl | I hear a hoot in the dark.
web | a net that a spider spins | A web shines with dew.
silk | a soft shiny cloth or thread | The scarf is made of silk.
ink | a dark liquid for writing | The ink is still wet.
quill | a big feather used as a pen | She writes with a quill.
poem | a piece of writing with rhythm | He reads a poem aloud.
verse | a line or group of lines in a poem | I know the first verse.
rhyme | words that end with the same sound | Moon and soon make a rhyme.
tune | a short song | I hum a quiet tune.
hum | to sing with your mouth closed | I hum as I walk.
speech | the act of speaking | Her speech is soft and slow.
language | the words that people use to talk | We share one language.
sentence | a group of words that makes a full thought | Type the whole sentence.
alphabet | all the letters of a language | I know the alphabet by heart.
vowel | the letters a, e, i, o and u | Every word needs a vowel.
spelling | the right order of letters in a word | Her spelling is perfect.
softly | in a quiet gentle way | The snow falls softly.
gently | in a kind and soft way | She gently opens the door.
quietly | with very little sound | We walk quietly.
hushed | made quiet | A hushed voice calls from the trees.
moonrise | the time when the moon comes up | Moonrise paints the lake silver.
moonlight | the light from the moon | Moonlight fills the clearing.
nightfall | the time when it gets dark | We camp at nightfall.
firelight | the light of a fire | Firelight dances on the wall.
torchlight | the light from a torch | Torchlight shows the way.
cottage | a small house in the country | A cottage stands by the road.
chimney | a pipe that lets smoke out | Smoke rises from the chimney.
attic | a room under the roof | The attic is full of old boxes.
keyhole | the small hole in a lock | I peek through the keyhole.
shutter | a wooden cover for a window | The shutter bangs in the wind.
porch | a covered area at a door | An old chair sits on the porch.
hound | a hunting dog | The hound sniffs the trail.
hoof | the hard foot of a horse | A hoof clicks on the stones.
claw | a sharp curved nail on an animal | The cat has a sharp claw.
fang | a long sharp tooth | The snake shows a fang.
mole | a small animal that digs tunnels | A mole digs under the lawn.
lark | a small brown bird that sings | A lark sings at sunrise.
robin | a small bird with a red chest | A robin hops on the fence.
finch | a small songbird | A finch sits on the wire.
swallow | a bird with a forked tail | A swallow dips over the stream.
cuckoo | a bird that calls its own name | A cuckoo calls from the wood.
pigeon | a gray bird that lives in towns | A pigeon sits on the roof.
magpie | a black and white bird | A magpie steals a shiny coin.
tulip | a spring flower shaped like a cup | A red tulip grows by the wall.
poppy | a bright red flower | A poppy sways in the field.
violet | a small purple flower | A violet hides in the grass.
thistle | a purple flower with sharp points | A thistle grows by the road.
heather | a small purple plant on hills | Heather covers the hill.
bracken | a tall fern that grows on hills | We push through the bracken.
foxglove | a tall flower with bell shapes | A foxglove stands by the fence.
lavender | a purple plant with a sweet smell | The lavender smells sweet.
daffodil | a yellow spring flower | A daffodil nods in the breeze.
jasmine | a white flower with a sweet scent | Jasmine climbs the old wall.
stem | the long part of a plant | The stem is thin.
parchment | old paper made from skin | The map is on parchment.
diary | a book where you write each day | She writes in her diary.
fog | thick cloud close to the ground | Fog fills the path.
silence | no sound at all | Silence fills the wood.
murmur | a soft low sound | A murmur drifts through the trees.
spooky | a little scary | The wood feels spooky.
haunted | visited by ghosts | The haunted house is empty.
ghost | the spirit of a dead person | A ghost floats past.
spirit | a soul that is not a body | A kind spirit guides us.
clearing | an open space among trees | A clearing lies ahead.
twilight | the soft light after sunset | Twilight turns the sky purple.
midnight | twelve o'clock at night | At midnight the bell rings.
starlight | light that comes from the stars | Starlight guides the way.
moonlit | lit by the moon | We cross the moonlit field.
wick | the string in a candle | The wick burns low.
flame | the bright part of a fire | The flame leans in the wind.
cloak | a long coat with no sleeves | She wears a dark cloak.
hood | a cover for the head | Pull up your hood.
rumor | a story that may not be true | I heard a rumor today.
breath | the air you take in and out | I held my breath.
sigh | a long soft breath of sadness | He gave a sigh.
footstep | the sound of one step | A footstep creaked behind me.
creak | a long squeaking sound | The old door will creak.
shiver | to shake from cold or fear | I shiver in the cold.
chill | a cold feeling | A chill runs down my back.
frost | thin white ice on things | Frost covers the grass.
pale | light in color, almost white | Her face is pale.
linger | to stay a little longer | Mist will linger here.
drift | to move slowly with the air | Smoke will drift away.
vanish | to disappear | The ghost will vanish.
fade | to become less bright | The light will fade.
haze | a light mist | A haze hangs over the hill.
antler | a branch-like horn on a deer | The antler is covered in moss.
shelter | a place that keeps you safe | We find shelter under a tree.
stillness | the state of being calm and quiet | A stillness fills the air.
whispering | speaking in a very soft voice | The whispering trees tell secrets.
forgotten | not remembered | A forgotten song plays.
wandering | walking with no set goal | The wandering light leads us on.
`;

const CLUES = `
cloak | I am a long warm coat with a hood and no sleeves.
frost | I turn the grass white on a very cold morning.
web | A spider weaves me to catch flies.
quill | I am a big feather that people used to write with, dipped in ink.
tulip | I am a spring flower shaped like a small cup.
poppy | I am a bright red flower that grows in wheat fields.
violet | I am a small purple flower and also the name of a color.
thistle | I am a purple flower with sharp prickles on my leaves.
lavender | I am a purple plant with a sweet smell, used in soap.
daffodil | I am a yellow spring flower with a trumpet in the middle.
hound | I am a dog that hunts by following a smell.
hoof | A horse has four of me and I make a clip-clop sound.
claw | I am a sharp curved nail on a cat or a bird.
fang | I am a long sharp tooth that a snake or wolf uses to bite.
mole | I am a small furry animal that digs tunnels and has tiny eyes.
lark | I am a small brown bird that sings high in the sky at dawn.
robin | I am a small bird with a red chest.
swallow | I am a fast bird with a forked tail and I fly south for winter.
cuckoo | I am a bird that calls my own name, and I am also a kind of clock.
pigeon | I am a gray bird that coos and lives in city squares.
magpie | I am a black and white bird that likes shiny things.
chimney | Smoke goes up through me from the fireplace.
attic | I am the room right under the roof where people keep old boxes.
keyhole | You look through me to see inside a locked door.
shutter | I am a wooden cover that closes over a window.
silk | I am a soft shiny cloth that is made from a worm's cocoon.
parchment | I am old paper made from animal skin, used for scrolls.
diary | You write your secret thoughts in me every day.
cottage | I am a small cozy house in the country.
`;

export const HUSHWOOD: WordEntry[] = ch2PlateWords(SOURCE, "hushwood", CLUES);

/** Chapter II intro card: 3 typed lines (exact case, no fail). The second teaches Shift (CH2_PLAN 3.2, review note 3). */
const INTRO_SRC = `
Welcome to the Hushwood, Ember Knight. | The first line of the chapter card. | Welcome to the Hushwood, Ember Knight.
Hold Shift to type a Capital letter. | A lesson: use Shift for big letters. | Hold Shift to type a Capital letter.
Every lost word is waiting for you. | The goal of the chapter. | Every lost word is waiting for you.
`;

export const HUSHWOOD_INTRO: WordEntry[] = ch2Sentences(INTRO_SRC, "intro", "hushwood");
