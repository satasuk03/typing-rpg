import { GUARD_KEYS } from "./guard.ts";
import { parseRows, plateWords } from "./lines.ts";

// Tier 1: very common words, 3-5 letters, lowercase (doc 01 section 5.1, chapters 1-3).
// Row format: word | definition | example
const SOURCE = `
about | on the subject of; around | We talk about the trip.
above | higher than something | A bird flies above the tree.
add | to put one thing with another | Add two eggs to the bowl.
after | later than something | We eat lunch after the game.
again | one more time | Please say it again.
air | what we breathe | The air is cold today.
also | too; as well | She also likes tea.
ant | a tiny insect that lives in a group | An ant carries a crumb home.
apple | a round red or green fruit | I ate an apple at lunch.
arm | the body part between shoulder and hand | He raised his arm to wave.
ask | to say words that need an answer | Ask your teacher for help.
away | to another place; not here | The dog ran away.
aunt | the sister of your mother or father | My aunt lives by the sea.
able | having the power to do something | She is able to swim far.
alone | with no one else | He sat alone on the bench.
along | forward on a path | We walked along the river.
angry | very upset or mad | The angry cat hissed.
baby | a very young child | The baby is asleep.
back | the rear part; to go the other way | Come back soon.
bag | a soft case for carrying things | Put the books in your bag.
ball | a round toy used in games | He kicked the ball.
bank | a place that keeps money | Dad went to the bank.
bath | washing the body in water | She took a warm bath.
bean | a small seed that you can cook | I like green bean soup.
bear | a large furry wild animal | A bear walked through the woods.
bed | the place where you sleep | Go to bed at nine.
bee | an insect that makes honey | A bee landed on the flower.
bell | a metal object that rings | The bell rang at noon.
belt | a strap worn around the waist | His belt is brown.
big | large in size | A big dog sat there.
bird | an animal with wings and feathers | A bird sang at dawn.
bike | a two-wheeled ride you pedal | I ride my bike to school.
bite | to cut with the teeth | Do not bite your nails.
black | the color of night | She wore a black coat.
block | a solid piece; to stop something | Use your shield to block the hit.
blow | to push air out of the mouth | Blow on the soup.
blue | the color of a clear sky | The sea looks blue.
boat | a small vessel on water | The boat floats on the lake.
bone | a hard part inside the body | The dog has a bone.
book | pages with words that you read | I read a good book.
boot | a shoe that covers the ankle | Wear a boot in the snow.
both | the two together | Both of us are tired.
bowl | a deep dish for food | A bowl of rice, please.
box | a container with straight sides | The box is empty.
boy | a young male person | The boy plays outside.
brave | not afraid of danger | The brave knight stepped forward.
bread | food made from baked flour | We bake bread every Sunday.
bring | to carry something here | Bring your coat.
brown | the color of earth | A brown bear walked by.
bus | a large vehicle for many people | The bus is late.
busy | having a lot to do | Mom is busy today.
buy | to get something for money | I want to buy milk.
cake | a sweet baked food | We cut the cake.
call | to speak to someone by phone or voice | Call me tonight.
calm | quiet and not worried | Stay calm and breathe.
camp | to sleep outside in a tent | We camp by the lake.
cap | a soft hat | He wore a red cap.
car | a vehicle with four wheels | Dad washed the car.
card | a small piece of stiff paper | She sent a card.
care | to look after; to worry about | Take care of the plants.
cat | a small pet that purrs | The cat sleeps all day.
chair | a seat with a back | Pull up a chair.
cheap | not costing much | The hat was cheap.
child | a young boy or girl | Each child got a gift.
chin | the front of the lower face | He rested his chin on his hand.
city | a big town | The city is full of lights.
clap | to hit hands together | We clap after the song.
clean | free of dirt | Keep your room clean.
clear | easy to see through or understand | The water is clear.
clock | a tool that shows the time | The clock says ten.
close | to shut; near | Close the door.
cloud | a white or gray shape in the sky | One cloud covers the sun.
coat | a warm piece of clothing | Wear your coat.
cold | not warm | The soup is cold.
come | to move toward here | Come and sit with us.
cook | to make food hot and ready | I cook rice every day.
cool | a little cold; nice | The wind feels cool.
copy | to make the same again | Copy the words on the board.
corn | a tall plant with yellow seeds | We grow corn on the farm.
cost | the price of something | What is the cost of this hat?
cover | to put one thing over another | Cover the pot with a lid.
cow | a farm animal that gives milk | The cow eats grass.
crab | a sea animal with claws | A crab walked on the sand.
cry | to let tears fall | Do not cry.
cup | a small bowl with a handle | Pour tea into the cup.
cut | to divide with a knife | Cut the bread.
dad | a father | Dad is making dinner.
dance | to move to music | We dance at the party.
dark | with little light | It is dark outside.
date | a day on the calendar | What is the date today?
day | the time from sunrise to sunset | It was a sunny day.
deep | going far down | The lake is deep.
desk | a table for work | She sat at her desk.
dish | a plate or bowl for food | Wash the dish.
dodge | to move quickly out of the way | Dodge the rock.
dog | a pet that barks | The dog wags its tail.
doll | a toy that looks like a person | She hugged her doll.
door | a way into a room | Open the door.
down | toward a lower place | The ball rolled down the hill.
draw | to make a picture with a pen | Draw a cat.
dream | pictures in your mind when you sleep | I had a happy dream.
dress | a piece of clothing for girls and women | She wore a blue dress.
drink | to take liquid into the mouth | Drink some water.
drive | to control a car | Dad will drive us home.
drop | to let something fall | Do not drop the glass.
dry | not wet | The towel is dry.
duck | a water bird; to bend down fast | Duck under the branch.
each | every one alone | Each child has a book.
ear | the part of the head you hear with | She whispered in my ear.
earth | the planet we live on | The Earth goes around the sun.
east | where the sun comes up | The sun rises in the east.
easy | not hard | The test was easy.
eat | to put food in your mouth | We eat at six.
edge | the outer line of a thing | Stay away from the edge.
egg | an oval food from a hen | I had an egg for breakfast.
empty | with nothing inside | The box is empty.
end | the last part | This is the end of the road.
even | flat; also; not odd | Even the cat is tired.
ever | at any time | Have you ever seen snow?
every | each one of all | Every day is new.
eye | the part of the body you see with | She closed one eye.
face | the front of the head | He has a kind face.
fact | something that is true | That is a fact.
fair | just and equal | Be fair to everyone.
fall | to drop down | Leaves fall in autumn.
farm | land where food and animals are raised | They live on a farm.
fast | very quick | The horse is fast.
fear | the feeling when you are afraid | He felt fear in the dark.
feet | more than one foot | Her feet are cold.
fight | to try to beat someone | The knight will fight bravely.
fill | to make full | Fill the glass with milk.
find | to see something you looked for | I cannot find my key.
fine | very good; well | I am fine, thanks.
fire | heat and light from burning | We sat by the fire.
fish | an animal that lives in water | The fish swims fast.
five | the number after four | I have five coins.
flag | a cloth with a design | The flag waves in the wind.
floor | the bottom of a room | The cat sat on the floor.
fly | to move through the air | Birds fly south.
food | what we eat | The food smells good.
foot | the part of the leg you stand on | My foot hurts.
fork | a tool with points for eating | Use a fork.
four | the number after three | A table has four legs.
free | not costing money; not locked | The ticket is free.
fresh | new and clean | The bread is fresh.
frog | a small green jumping animal | The frog sat on a leaf.
from | starting at a place | I got a gift from Mom.
fruit | a sweet food that grows on trees | Fruit is good for you.
full | holding all it can | The cup is full.
fun | enjoyable | The game is fun.
game | a play with rules | Let us play a game.
gate | a door in a fence | Close the gate.
gift | something you give | She gave me a gift.
girl | a young female person | The girl reads a book.
give | to hand something to someone | Give me the pen.
glad | happy | I am glad you came.
glass | a clear hard material; a cup for drinks | A glass of water, please.
goat | a farm animal with horns | The goat ate the grass.
gold | a shiny yellow metal | The ring is gold.
good | nice; well done | That was a good meal.
grass | a green plant that covers the ground | The grass is wet.
gray | the color of rain clouds | A gray cat sat there.
great | very good; big | We had a great day.
green | the color of leaves | The leaves are green.
grow | to get bigger | Plants grow in the sun.
guard | to watch and keep safe | The knight will guard the gate.
guess | to try to know without being sure | Can you guess my age?
hair | the strands that grow on the head | She has long hair.
half | one of two equal parts | Eat half of the apple.
hall | a long room or path inside a building | The hall is dark.
hand | the part at the end of your arm | Wave your hand.
happy | feeling glad | The happy kids sang.
hard | not soft; not easy | The rock is hard.
hat | something you wear on your head | He lost his hat.
have | to own or hold | We have a dog.
head | the top part of the body | Put a hat on your head.
hear | to take in sound | I can hear a bird.
heart | the body part that pumps blood | Her heart beat fast.
help | to make a job easier | Please help me.
here | in this place | Put the bag here.
hide | to go where no one can see | Hide behind the tree.
high | far above the ground | The kite is high.
hill | a small mountain | We climbed the hill.
hold | to keep in your hands | Hold my hand.
home | where you live | We walk home.
hope | to want something good | I hope it is sunny.
horse | a large animal people ride | The horse ran across the field.
hot | very warm | The tea is hot.
house | a building where people live | Our house is blue.
hug | to hold someone close | Give me a hug.
hurry | to move fast | We must hurry.
ice | frozen water | The pond has ice.
idea | a thought or plan | That is a good idea.
inch | a small length measure | The worm was one inch long.
into | going to the inside | She jumped into the pool.
iron | a hard gray metal | The gate is made of iron.
jam | sweet fruit spread | I put jam on my bread.
jar | a glass container | The jar is full of honey.
jet | a fast plane | A jet flew overhead.
job | work that you do | He has a new job.
join | to come together | Join us for lunch.
joke | something funny you say | He told a joke.
joy | great happiness | The puppy brings joy.
juice | the drink from fruit | I like orange juice.
jump | to push off the ground | The frog can jump far.
just | only; right now | I just got here.
keep | to hold on to | Keep the change.
key | a tool that opens a lock | I lost my key.
kick | to hit with the foot | Kick the ball.
kid | a child | The kid ran outside.
kind | nice to others | She is kind to everyone.
king | the male ruler of a country | The king wore a gold crown.
kite | a toy that flies on a string | The kite flew high.
knee | the joint in the middle of the leg | He fell and hurt his knee.
knife | a tool for cutting | Cut the cheese with a knife.
know | to have in your mind | I know the answer.
lake | a large body of still water | We swim in the lake.
lamp | a light you can move | Turn on the lamp.
land | the ground; to come down | The plane will land soon.
last | after all others | She was the last to arrive.
late | after the right time | We are late.
laugh | to make a happy sound | The joke made us laugh.
lead | to go first | Lead us to the gate.
leaf | a flat green part of a plant | A leaf fell from the tree.
left | the opposite of right | Turn left at the shop.
leg | the body part you walk on | The table has a broken leg.
life | the time you are alive | Life is good.
lift | to raise up | Lift the box with both hands.
light | what lets you see | The light is bright.
like | to enjoy | I like music.
line | a long thin mark | Draw a line.
lion | a big wild cat | The lion roared.
list | words written one under another | Make a list of things to buy.
live | to have your home somewhere | We live near the park.
lock | to close with a key | Lock the door.
long | not short | The road is long.
look | to use your eyes | Look at the sky.
loud | making a lot of noise | The music is loud.
love | a strong caring feeling | I love my family.
low | not high | The sun is low.
luck | good things that happen by chance | Good luck on the test.
lunch | the meal in the middle of the day | We eat lunch at noon.
made | built or created | She made a cake.
mail | letters you send or get | The mail came early.
make | to build or create | Make a wish.
many | a large number of | Many birds live here.
map | a drawing of a place | Read the map.
meal | food eaten at one time | Dinner is my favorite meal.
mean | to have a meaning | What does this word mean?
meat | food that comes from animals | We cook meat on the grill.
meet | to see someone for the first time | Nice to meet you.
milk | a white drink from cows | Drink your milk.
mind | the part of you that thinks | Clear your mind.
mix | to stir together | Mix the eggs and flour.
moon | the bright ball in the night sky | The moon is full tonight.
more | a greater amount | May I have more rice?
most | the largest part | Most of the kids came.
mouse | a small animal with a long tail | A mouse ran under the bed.
mouth | the part of the face you eat with | Open your mouth.
move | to change place | Move the chair.
much | a large amount | Thank you very much.
mud | wet soft earth | The pigs play in the mud.
music | sounds that you sing or play | We listen to music.
name | what you are called | What is your name?
near | not far | The shop is near.
neck | the part between head and body | A giraffe has a long neck.
need | to require; must have | I need a pen.
nest | a bird home | The bird sat in its nest.
never | not at any time | I never eat late.
new | not old | I have a new bike.
news | information about what is happening | The news is good.
next | coming after this one | See you next week.
nice | pleasant | What a nice day.
night | the dark time of day | The stars come out at night.
nine | the number after eight | The class starts at nine.
nose | the part of the face you smell with | A cold nose.
note | a short message | I left you a note.
now | at this time | Come here now.
ocean | a very large sea | Whales live in the ocean.
odd | strange | What an odd sound.
off | not on | Turn off the light.
often | many times | We often walk to school.
oil | a thick liquid | Cook with a little oil.
old | not new | The old man smiled.
once | one time | I went once.
one | the number 1 | I have one brother.
only | no more than | There is only one left.
open | not closed | The door is open.
other | not this one | Take the other road.
over | above; finished | The game is over.
owl | a night bird with big eyes | The owl hooted at midnight.
page | one side of a sheet in a book | Turn the page.
pair | two things that go together | A pair of shoes.
pan | a pot for cooking | Heat the pan.
park | a green place to play | We play in the park.
part | a piece of a whole | This is the best part.
pass | to go by; to hand | Pass the salt.
path | a narrow way for walking | The path goes into the woods.
pay | to give money | I will pay for lunch.
pea | a small round green vegetable | Eat your pea soup.
pen | a tool for writing with ink | Write with a pen.
pet | an animal you keep at home | My pet is a rabbit.
pick | to choose; to pull from a plant | Pick a card.
piece | a part of something | A piece of cake, please.
pig | a farm animal that says oink | The pig rolled in the mud.
pink | the color of a pale rose | The flower is pink.
place | a spot; to put | Place the cup here.
plan | an idea for what to do | We have a plan.
plant | a living thing that grows in soil | Water the plant.
play | to have fun | The kids play outside.
point | to show with a finger | Point to the door.
pond | a small lake | Ducks swim in the pond.
pool | a place to swim | We swim in the pool.
pull | to move toward you | Pull the rope.
push | to move away from you | Push the door.
put | to place | Put it on the table.
queen | the female ruler of a country | The queen waved.
quick | fast | Take a quick bath.
quiet | making little sound | Please be quiet.
quit | to stop | Do not quit now.
quiz | a short test | We had a quiz today.
rain | water that falls from clouds | The rain is heavy.
read | to look at words and say them | I read every night.
red | the color of a ripe tomato | The apple is red.
rest | to relax | Rest for a while.
rice | small white grains you cook | We ate rice and beans.
rich | having a lot of money | The king is rich.
ride | to sit on and travel | We ride the bus.
right | correct; the opposite of left | That is the right answer.
ring | a circle for the finger; the sound of a bell | The ring is gold.
river | a long stream of water | The river flows to the sea.
road | a path for cars | The road is long.
rock | a hard piece of stone | He threw a rock.
roll | to turn over and over | The ball can roll.
roof | the top of a house | The cat is on the roof.
room | a space in a house | My room is small.
root | the part of a plant under the ground | The root drinks water.
rope | a thick strong cord | Pull the rope.
rose | a flower with thorns | A red rose.
round | shaped like a circle | The ball is round.
row | a line of things | Sit in the front row.
rule | something you must follow | Follow the rule.
run | to move fast on foot | We run every morning.
sad | not happy | The sad boy cried.
safe | not in danger | Stay safe.
sail | to travel by boat | We sail on Sunday.
salt | a white seasoning | Add a little salt.
same | not different | We have the same hat.
sand | tiny grains at the beach | The sand is warm.
save | to keep safe | Save some cake for me.
say | to speak | Say hello.
sea | a large body of salt water | The sea is calm.
seat | a place to sit | Take a seat.
see | to look at with the eyes | I see a bird.
seed | a tiny part that grows into a plant | Plant the seed.
sell | to give for money | They sell fresh bread.
send | to make go somewhere | Send me a letter.
shape | the outline of a thing | A circle is a shape.
share | to give a part to others | Share your toys.
sheep | a farm animal with wool | The sheep ate grass.
ship | a big boat | The ship left the port.
shirt | clothing for the top half of the body | He wore a white shirt.
shoe | something you wear on your foot | Tie your shoe.
shop | a place where you buy things | The shop opens at nine.
short | not long | The story is short.
show | to let someone see | Show me the picture.
shut | to close | Shut the window.
side | the left or right part | Sit by my side.
sing | to make music with your voice | We sing together.
sit | to rest on a seat | Sit here.
six | the number after five | I have six pens.
skin | the outer cover of the body | Her skin is soft.
sky | the space above the earth | The sky is clear.
sleep | to rest with your eyes closed | Sleep well.
slow | not fast | The turtle is slow.
small | little | A small bird sat there.
smile | a happy look on the face | She has a nice smile.
snow | white flakes of frozen rain | The snow is deep.
soap | something for washing | Wash with soap.
some | a few | Have some tea.
song | words with music | We sing a song.
soon | in a short time | The bus will come soon.
sound | what you hear | I hear a sound.
soup | a hot liquid meal | The soup is hot.
south | the opposite of north | Birds fly south.
speak | to say words | Speak slowly.
stand | to be on your feet | Stand up.
star | a bright light in the night sky | Look at that star.
start | to begin | Let us start.
stay | to remain | Stay here.
step | one move of the foot | Take one step.
stone | a small rock | He threw a stone.
stop | to not go on | Stop at the red light.
store | a place where you buy things | The store is closed.
storm | strong wind and rain | A storm is coming.
story | words that tell what happened | Tell me a story.
sun | the star that gives us light | The sun is hot.
sweet | tasting like sugar | The cake is sweet.
swim | to move through water | We swim in the lake.
table | a flat top with legs | Put the plate on the table.
take | to get and carry | Take your bag.
talk | to speak with someone | Let us talk.
tall | high | The tree is tall.
tea | a hot drink made from leaves | Drink some tea.
team | a group that plays together | Our team won.
tell | to say to someone | Tell me the truth.
ten | the number after nine | Count to ten.
tent | a cloth home for camping | We slept in a tent.
test | a set of questions | The test was short.
thank | to say you are grateful | Thank you.
that | the one over there | I like that hat.
them | those people | I see them.
then | after that | Eat, then sleep.
there | in that place | Put it there.
they | those people | They are friends.
thin | not thick | A thin book.
thing | an object | What is that thing?
think | to use your mind | Think before you speak.
this | the one here | This is my room.
three | the number after two | Three birds sat on a wire.
time | what a clock shows | What time is it?
tiny | very small | A tiny ant.
toe | a finger of the foot | He hurt his toe.
told | said to someone | She told me a story.
tool | something you use to do work | A hammer is a tool.
tooth | a hard white part in the mouth | Brush every tooth.
top | the highest part | We reached the top.
town | a small city | The town is quiet.
toy | something to play with | The toy is on the shelf.
tree | a tall plant with a trunk | A bird sat in the tree.
trip | a journey | We took a trip to the sea.
true | right; not false | The story is true.
try | to make an effort | Try again.
turn | to change direction | Turn left.
two | the number 2 | I have two cats.
under | below | The cat is under the table.
until | up to the time of | Wait until noon.
upon | on top of | Once upon a time.
use | to do a job with | Use a spoon.
van | a large box-shaped car | The van is white.
very | to a high degree | It is very cold.
view | what you can see from a place | The view is lovely.
voice | the sound you make when you speak | She has a sweet voice.
vote | to choose by raising a hand or paper | We vote on Friday.
wait | to stay until something happens | Wait here.
walk | to move on foot | We walk to school.
wall | a side of a room | A picture hangs on the wall.
want | to wish for | I want some tea.
warm | a little hot | The room is warm.
wash | to clean with water | Wash your hands.
watch | to look at for a while | Watch the birds.
water | the clear liquid we drink | Drink water.
wave | to move the hand; a swell of the sea | Wave goodbye.
way | a road or method | Which way is the park?
wear | to have on the body | Wear a coat.
week | seven days | See you next week.
well | in a good way | She sings well.
went | past of go | We went home.
west | where the sun goes down | The sun sets in the west.
wet | covered with water | The grass is wet.
what | used to ask about a thing | What is that?
wheel | a round part that turns | The wheel is round.
when | at what time | When does it start?
where | in what place | Where is my hat?
which | what one | Which hat is yours?
white | the color of snow | A white cat.
wide | far from side to side | The river is wide.
wild | living free in nature | A wild fox ran by.
will | used to talk about the future | I will go.
wind | moving air | The wind is strong.
wing | the part of a bird used to fly | The bird has a hurt wing.
wish | to want something to happen | Make a wish.
with | together | Come with me.
wolf | a wild animal like a big dog | A wolf howled.
wood | the hard part of a tree | The table is made of wood.
word | a unit of language | Spell the word.
work | a job; to do a task | I go to work at eight.
world | the earth and all its people | The world is big.
would | used to ask politely | Would you help me?
write | to put words on paper | Write your name.
yard | the ground near a house | The kids play in the yard.
year | twelve months | It was a good year.
yell | to shout | Do not yell.
yes | the opposite of no | Yes, please.
yet | up to now | It is not dark yet.
you | the person I speak to | You are kind.
young | not old | A young bird.
your | belonging to you | Is this your hat?
zero | the number 0 | Zero is not a big number.
zone | an area | This is a quiet zone.
zoo | a place where animals are kept | We saw a lion at the zoo.
`;

export const TIER1 = plateWords(parseRows(SOURCE), { tier: 1, guardKeys: GUARD_KEYS });
