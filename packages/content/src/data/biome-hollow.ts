import { parseRows, plateWords } from "./lines.ts";

// Chapter 1 biome vocabulary: Golem Hollow (L10, the boss level). Tier is implied by length (<=5 T1, 6-7 T2, 8-10 T3).
const SOURCE = `
boulder | a very big rock | A boulder fell from above.
shatter | to break into many pieces | The glass will shatter.
ancient | very old | An ancient door stands here.
crypt | a tomb under a church | The crypt is cold.
tomb | a place where a dead person lies | The king rests in a tomb.
carve | to cut a shape into stone | I will carve a name.
guardian | one who keeps a place safe | The guardian wakes up.
awake | not asleep | The golem is awake.
slumber | a deep sleep | The giant is in a slumber.
stir | to start to move | Something will stir below.
thunder | a loud sound in the sky | Thunder rolls through the hall.
boom | a very loud deep sound | A boom echoes in the hollow.
hush | a sudden quiet | A hush fell over us.
silent | with no sound | The hall is silent.
eerie | strange and a little scary | An eerie light fills the room.
gloom | a dark and sad feeling | Gloom fills the hall.
murky | dark and hard to see through | The water is murky.
abyss | a very deep hole | The abyss has no end.
void | a large empty space | We stared into the void.
vacant | not filled or used | A vacant throne.
crown | a gold ring worn by a king | The crown fell to the floor.
remnant | a small part that is left | A remnant of the wall stands.
weary | very tired | The weary guard sat down.
grim | serious and dark | The hall looks grim.
bleak | cold and without hope | The hollow is bleak.
valor | great courage | He fought with valor.
oath | a serious promise | I keep my oath.
hero | a brave person who helps others | The hero draws a sword.
final | last | This is the final room.
triumph | a big win | The hero won a triumph.
unseal | to open something that was shut | We must unseal the door.
ward | a spell that keeps danger away | A ward protects the door.
echoes | sounds that come back | Echoes fill the hall.
anvil | a heavy iron block for shaping metal | The smith struck the anvil.
chain | rings of metal joined in a line | A chain hangs from the roof.
cursed | under a bad magic spell | The hall is cursed.
dagger | a short knife | He drew a dagger.
dread | great fear | I felt dread in the dark.
dungeon | a prison under a castle | The dungeon is deep.
forge | a fire place for shaping metal | The forge is cold.
fortress | a strong building for defense | The fortress stands on a hill.
frail | weak and thin | The frail bridge shook.
hammer | a tool for hitting | The golem swung a hammer.
kneel | to go down on your knees | The knight will kneel.
lever | a bar that moves something | Pull the lever.
mighty | very strong | A mighty blow.
mystic | full of secret magic | A mystic light shone.
niche | a small space in a wall | A statue sits in the niche.
omen | a sign of things to come | The crack is a bad omen.
roar | a loud angry sound | The golem will roar.
sword | a long blade | He raised his sword.
trap | a hidden danger | Watch for a trap.
unlock | to open with a key | We cannot unlock the gate.
warden | a guard of a place | The warden holds the key.
yield | to give up | The golem will not yield.
zeal | strong energy for a goal | He fought with zeal.
jaw | the bottom part of a face | The golem opened its jaw.
mace | a heavy club with a spiked head | He swung a mace.
plague | a sickness that spreads fast | A plague hit the town.
quiver | to shake a little | His hand will quiver.
rust | red powder on old iron | Rust covers the gate.
spear | a long pole with a sharp tip | She held a spear.
wrath | very strong anger | The golem felt wrath.
fist | a closed hand | The golem raised a fist.
`;

export const HOLLOW = plateWords(parseRows(SOURCE), { biome: "hollow" });
