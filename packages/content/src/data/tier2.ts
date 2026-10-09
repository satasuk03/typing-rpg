import { parseRows, plateWords } from "./lines.ts";

// Tier 2: the next band of common words, up to 7 letters, lowercase (doc 01 section 5.1).
// Row format: word | definition | example
const SOURCE = `
accept | to take what is offered | She will accept the gift.
across | from one side to the other | We swam across the lake.
action | the doing of something | The action movie was fun.
advice | words that help you decide | Ask Dad for advice.
afraid | feeling fear | Do not be afraid.
almost | nearly | We are almost home.
always | at all times | She always smiles.
amount | how much there is | A small amount of salt.
animal | a living thing that is not a plant | A fox is a wild animal.
answer | what you say to a question | Write your answer here.
appear | to come into view | Stars appear at night.
around | on all sides; near | We sat around the fire.
arrive | to reach a place | The train will arrive soon.
attack | to start a fight against | The wolf will attack at night.
autumn | the season after summer | Leaves fall in autumn.
anyone | any person | Does anyone know the way?
baker | a person who makes bread | The baker opens at six.
balloon | a thin bag filled with air | The balloon floated up.
banana | a long yellow fruit | I ate a banana.
basket | a container made of woven strips | A basket of apples.
battle | a fight between two groups | The knights won the battle.
beach | sand beside the sea | We played on the beach.
beauty | the quality of being lovely | The beauty of the lake.
became | past of become | He became a teacher.
become | to start to be | Seeds become plants.
before | earlier than | Wash your hands before lunch.
begin | to start | Let us begin.
behind | at the back of | The dog is behind the door.
better | more good | This soup is better.
between | in the middle of two things | Sit between us.
bridge | a way over water | We crossed the bridge.
bright | giving a lot of light | The sun is bright.
broken | in pieces; not working | The broken cup is on the floor.
brother | a boy with the same parents | My brother plays chess.
butter | a soft yellow food from milk | Put butter on the toast.
button | a small round part of a shirt | A button fell off.
beyond | on the far side of | The farm is beyond the hill.
bottle | a tall container for drinks | A bottle of water.
bottom | the lowest part | The key is at the bottom.
camera | a tool for taking photos | She holds a camera.
candle | a stick of wax with a flame | Light the candle.
carpet | a thick cover for a floor | The carpet is soft.
castle | a big stone home for a king | The castle has tall towers.
center | the middle | Stand in the center.
chance | a possibility | Give me a chance.
change | to make different | Change your shirt.
chapter | one part of a book | Read the first chapter.
cheese | a food made from milk | Cheese and bread.
chicken | a farm bird | The chicken laid an egg.
circle | a round shape | Draw a circle.
coffee | a hot brown drink | He drinks coffee.
color | red, blue or green, for example | What color is your hat?
corner | where two sides meet | Wait at the corner.
cotton | a soft plant fiber | A cotton shirt.
country | a land with its own people | Which country do you live in?
couple | two things | A couple of apples.
course | a path or a class | We took a cooking course.
create | to make something new | Create a story.
cousin | a child of your aunt or uncle | My cousin visits in May.
danger | something that can hurt you | The sign warns of danger.
decide | to make up your mind | Decide what to eat.
desert | a dry sandy land | The desert is hot.
detail | a small part | Tell me every detail.
dinner | the evening meal | Dinner is ready.
direct | straight; to show the way | Take the direct road.
doctor | a person who helps sick people | The doctor was kind.
double | two times as much | A double sandwich.
dragon | a big fire animal in stories | The dragon breathed fire.
during | at the same time as | We slept during the storm.
eagle | a large bird of prey | An eagle flew over us.
early | before the usual time | Wake up early.
easily | without trouble | She won easily.
effort | hard work to do something | It takes effort.
either | one or the other | Take either road.
energy | power to do things | I have lots of energy.
engine | a machine that makes things move | The engine is loud.
enough | as much as needed | I have enough.
enter | to go in | Enter the room.
entire | whole | I read the entire book.
escape | to get away | The bird will escape.
evening | the end of the day | We walk in the evening.
except | not including | All except one came.
explain | to make clear | Explain the rule.
family | parents, children and relatives | My family is large.
farmer | a person who grows food | The farmer feeds the cows.
father | a male parent | My father cooks well.
fellow | a person or friend | A fellow traveler.
figure | a number or shape | I cannot figure it out.
finger | a part of the hand | She has a ring on her finger.
finish | to complete | Finish your lunch.
flower | the colorful part of a plant | A red flower.
follow | to go after | Follow me.
forget | to not remember | Do not forget your key.
forward | toward the front | Step forward.
friend | a person you like and know well | She is my best friend.
future | the time to come | In the future we will fly.
further | more far | Go no further.
frozen | turned to ice | The pond is frozen.
garden | a place where flowers grow | We work in the garden.
gather | to bring together | Gather the sticks.
gentle | soft and kind | A gentle touch.
ground | the earth under your feet | Sit on the ground.
growth | the act of getting bigger | The growth of a tree.
guitar | a musical instrument with strings | He plays the guitar.
giant | very big; a huge person in stories | A giant lives there.
golden | made of or like gold | A golden crown.
guest | a person who visits | A guest arrived.
handle | the part you hold | The handle is hot.
happen | to take place | What will happen next?
health | the state of the body | Good health is a gift.
heavy | hard to lift | The bag is heavy.
helper | a person who helps | The helper carries the box.
hidden | not seen | A hidden door.
history | the story of the past | We study history.
honey | a sweet food made by bees | Honey on toast.
hunter | a person who looks for animals | The hunter walked quietly.
hundred | the number 100 | A hundred birds.
however | but | I like tea. However, I prefer milk.
husband | a married man | Her husband cooks.
inside | in the middle of | Come inside.
island | land with water all around | We sailed to the island.
itself | the same thing | The cat washed itself.
indeed | truly | It is cold indeed.
instead | in place of | Have tea instead.
insect | a small animal with six legs | An insect crawled on the leaf.
invite | to ask to come | Invite your friends.
jacket | a short coat | Wear a jacket.
jungle | a thick hot forest | Monkeys live in the jungle.
journey | a long trip | A long journey.
junior | younger | A junior player.
jewel | a precious stone | The jewel is blue.
kettle | a pot for boiling water | Fill the kettle.
kitten | a baby cat | The kitten naps.
kitchen | the room where you cook | Mom is in the kitchen.
kingdom | a land ruled by a king | The kingdom is peaceful.
knight | a brave soldier of old times | The knight rode away.
knock | to hit a door | Knock before you enter.
keeper | a person who looks after something | The keeper feeds the lions.
ladder | steps you climb | Lean the ladder on the wall.
leader | a person in front | The leader raised a hand.
learn | to get new skills | We learn every day.
leave | to go away | We leave at nine.
legend | an old story | A legend about a dragon.
lesson | something you learn in class | Today's lesson was short.
letter | a message on paper; a, b or c | I wrote a letter.
listen | to pay attention to sound | Listen to the rain.
little | small | A little bird.
lonely | sad to be alone | He felt lonely.
longer | more long | A longer road.
lovely | very pretty | A lovely day.
library | a place with many books | I borrow books from the library.
liquid | something that flows | Water is a liquid.
market | a place to buy and sell | We went to the market.
matter | something that is important | It does not matter.
member | a person in a group | A member of the club.
memory | the ability to remember | She has a good memory.
method | a way of doing something | A new method.
middle | the center | Stand in the middle.
minute | sixty seconds | Wait one minute.
mirror | glass that shows your face | Look in the mirror.
modern | of the present time | A modern house.
moment | a very short time | Wait a moment.
monkey | an animal that climbs trees | A monkey ate a banana.
mother | a female parent | My mother sings.
muscle | a part of the body that moves it | A strong muscle.
myself | me | I made it myself.
magic | power to do wonders | The magic worked.
machine | a tool with moving parts | The machine is loud.
manage | to be able to do | I can manage.
marble | a small glass ball | A blue marble.
narrow | not wide | A narrow path.
nature | plants, animals and the land | We love nature.
nearby | close | A shop nearby.
needle | a thin sharp tool for sewing | The needle is sharp.
neither | not one or the other | Neither road is safe.
nobody | no person | Nobody is home.
normal | usual | A normal day.
notice | to see | Did you notice the bird?
number | a count | Pick a number.
object | a thing you can touch | A strange object.
office | a room where people work | She works in an office.
orange | a round sweet fruit; a color | An orange for lunch.
others | the rest | Where are the others?
outside | not in the house | Play outside.
oxygen | the air gas we need | Plants give oxygen.
oyster | a sea animal with a shell | An oyster has a pearl.
owner | the person who has something | The owner of the shop.
origin | where something starts | The origin of the word.
packet | a small box | A packet of seeds.
palace | a big home of a king | The palace is huge.
parent | a mother or father | Ask a parent.
pencil | a tool for writing | Sharpen your pencil.
people | men, women and children | Many people came.
person | one human | A kind person.
picnic | a meal eaten outside | We have a picnic.
picture | a drawing or photo | Paint a picture.
pillow | a soft cushion for the head | A soft pillow.
planet | a world that goes around a star | Mars is a planet.
player | a person who plays | The player scored.
please | a polite word to ask | Please sit.
pocket | a small bag sewn in clothes | Keep it in your pocket.
polite | having good manners | Be polite.
potato | a round brown vegetable | A baked potato.
powder | very fine dust | Flour is a powder.
prince | the son of a king | The prince smiled.
problem | something hard to solve | I have a problem.
proud | feeling very glad about something | We are proud of you.
public | for everyone | A public park.
puppy | a baby dog | The puppy plays.
purple | a color mixed from red and blue | A purple flower.
pretty | nice to look at | A pretty dress.
prefer | to like better | I prefer tea.
pepper | a hot spice | Add some pepper.
quarter | one of four equal parts | A quarter of the cake.
quickly | in a fast way | Run quickly.
quilt | a blanket made of cloth pieces | A warm quilt.
quote | words said by someone | A quote from a book.
quest | a long search | A quest for gold.
rabbit | a small animal with long ears | A rabbit hopped by.
rather | more willingly | I would rather stay.
reader | a person who reads | A good reader.
really | truly | I really like it.
reason | why something happens | What is the reason?
record | to write down or save | Record the numbers.
remain | to stay | Please remain here.
remind | to help someone remember | Remind me to call.
repeat | to say again | Repeat the word.
reply | to answer | Reply to the letter.
rescue | to save from danger | Rescue the kitten.
result | what happens in the end | The result was good.
return | to go back | Return the book.
rhythm | a pattern of beats | Clap to the rhythm.
ribbon | a long thin band of cloth | A red ribbon.
rocket | a tube that flies into space | The rocket took off.
rubber | a stretchy material | A rubber ball.
runner | a person who runs | The runner is fast.
rarely | not often | I rarely eat sweets.
region | an area | A dry region.
repair | to fix | Repair the roof.
safety | being safe | Safety first.
salad | a dish of cold vegetables | A fresh salad.
sailor | a person who works on a ship | The sailor saw land.
school | a place to learn | We walk to school.
season | spring, summer, autumn or winter | Winter is my favorite season.
second | after the first | The second page.
secret | something not told | Keep a secret.
settle | to make a home | We will settle here.
shadow | a dark shape made by light | My shadow is long.
shower | a quick rain; washing under spray | I take a shower.
signal | a sign that gives a message | A light signal.
silver | a shiny white metal | A silver spoon.
simple | easy | A simple rule.
single | only one | A single drop.
sister | a girl with the same parents | My sister sings.
slowly | not fast | Walk slowly.
smooth | flat and even | Smooth stone.
socks | clothes you wear on your feet | Warm socks.
spring | the season after winter | Flowers bloom in spring.
square | a shape with four equal sides | Draw a square.
station | a place where trains stop | The station is busy.
steady | not moving or shaking | Keep it steady.
strong | having power | A strong wind.
summer | the hot season | We swim in summer.
supper | an evening meal | Supper is soup.
surface | the outside of something | The surface is smooth.
sudden | quick and not expected | A sudden noise.
system | a set of parts that work together | The system works.
spider | an animal with eight legs | A spider spun a web.
sunset | when the sun goes down | We watched the sunset.
stream | a small river | A cold stream.
street | a road in a town | Our street is quiet.
student | a person who learns | Each student has a pen.
teacher | a person who helps you learn | The teacher smiled.
thanks | words of being grateful | Thanks for the gift.
though | but | It is cold though sunny.
thread | a thin string for sewing | A red thread.
ticket | a paper that lets you in | I have a ticket.
tiger | a big cat with stripes | A tiger sleeps.
today | this day | Today is Friday.
toward | in the direction of | Walk toward the gate.
travel | to go to far places | We travel by train.
trouble | a problem | He is in trouble.
turtle | a slow animal with a shell | A turtle crossed the road.
twelve | the number 12 | Twelve eggs.
twenty | the number 20 | Twenty people.
tomato | a red juicy fruit | A ripe tomato.
tonight | this evening | See you tonight.
uncle | the brother of a parent | My uncle visits us.
unless | if not | Unless it rains.
unusual | not common | An unusual bird.
upward | toward a higher place | The smoke rises upward.
useful | helping to do something | A useful tool.
usual | normal | The usual time.
upper | higher | The upper shelf.
unable | not able | He is unable to come.
valley | low land between hills | A green valley.
velvet | a very soft cloth | A velvet dress.
village | a very small town | The village is quiet.
violin | a musical instrument played with a bow | She plays the violin.
visit | to go to see | We visit Grandma.
visitor | a person who comes to see you | A visitor at the door.
voyage | a long trip by sea | A long voyage.
vision | the ability to see | Good vision.
wagon | a cart pulled by a horse | A wagon full of hay.
wander | to walk with no plan | Wander through the woods.
wealth | a lot of money | Wealth is not everything.
weather | rain, sun or wind | The weather is nice.
weekend | Saturday and Sunday | See you this weekend.
weight | how heavy something is | The weight of a stone.
welcome | a kind greeting | Welcome home.
wheat | a grain used for bread | A field of wheat.
whale | a huge sea animal | A whale jumped.
whisper | to speak very softly | Whisper in my ear.
window | an opening with glass in a wall | Open the window.
winner | a person who wins | The winner smiled.
wonder | to want to know | I wonder why.
wooden | made of wood | A wooden box.
worker | a person who does a job | The worker is tired.
worry | to feel afraid something is wrong | Do not worry.
writer | a person who writes | A famous writer.
wrong | not right | The wrong road.
wizard | a man who does magic | The wizard waved his staff.
wisdom | good sense from what you have learned | Wisdom comes with age.
within | inside | Within the walls.
without | not having | Tea without sugar.
yellow | the color of a lemon | A yellow bird.
yogurt | a sour milk food | Yogurt with fruit.
yearly | once a year | A yearly party.
zebra | a horse-like animal with stripes | A zebra ran by.
zigzag | a line with sharp turns | A zigzag path.
zipper | a tool that closes clothes | The zipper is stuck.
`;

export const TIER2 = plateWords(parseRows(SOURCE), { tier: 2 });
