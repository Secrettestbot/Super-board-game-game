/* BOGGLE — word-search race logic (built for this codebase, not ported).
   A 4x4 grid is filled by rolling the 16 classic Boggle dice (one die per cell). A valid
   WORD is >= 3 letters traced along a PATH of adjacent cells (8-neighborhood), where each
   cell is visited at most once. "Qu" lives on a single cell. Both YOU (player 0) and the AI
   (player 1) search the SAME grid: you type words, the AI runs a capped DFS over its
   dictionary. Scoring is classic Boggle by word length; words found by BOTH players score
   for nobody. Highest total after the configured rounds wins.

   Pure: no React/DOM, fully immutable updates. Randomness is injectable (RNG) so grids and
   games are deterministic in tests. */

// --- Embedded dictionary: common English words, length 3-8. A few thousand entries. ---
// Stored as one space-separated blob to keep the source compact, then split + validated.
const RAW_WORDS = `
the and for are but not you all any can her was one our out day get has him his how man new
now old see two way who boy did its let put say she too use dad mom add age ago aid aim air
ace act ah arm art ask ate bad bag ban bar bat bay bed bee beg bet bid big bin bit bob bog
bow box bug bun bus bye cab cap car cat cob cod cog con cop cot cow cry cub cue cup cut den
dew die dig dim din dip dog dot dry dub due dug dye ear eat ebb eel egg ego elf elk elm end
era eve eye fan far fat fax fee few fib fig fin fir fit fix flu fly foe fog for fox fry fun
fur gag gap gas gel gem get gig gin god got gum gun gut gut guy gym had ham hat hay hem hen
hid hip hit hog hop hot hub hue hug hum hut ice icy ill ink inn ion ire irk ivy jab jam jar
jaw jay jet jig job jog joy jug jut keg key kid kin kit lab lac lad lag lap law lax lay led
leg lid lie lip lit lob log lot low mad map mat may men met mix mob mod mop mud mug mum nab
nag nap net nil nip nit nod nor nub nun nut oak oar oat odd ode off oil old one orb ore our
out owe owl own pad pal pan pat paw pay pea peg pen pet pew pie pig pin pit ply pod pop pot
pry pub pug pun pup pus rag ram ran rap rat raw ray red rib rid rig rim rip rob rod rot row
rub rug rum run rut rye sad sag sap sat saw say sea set sew shy sin sip sir sit six ski sky
sly sob sod son sop sow soy spa spy sty sub sue sum sun tab tag tan tap tar tax tea ten the
thy tie tin tip toe ton too top toy try tub tug two urn use van vat vet via vie vow wad wag
war was wax way web wed wet who why wig win wit woe wok won woo wow wry yak yam yap yaw yes
yet you zag zap zip zoo
able acid aged also area army away baby back ball band bank base bath bear beat been beer
bell belt bend best bike bill bind bird bite blew blob blot blow blue blur boat body boil
bold bolt bomb bond bone book boom boot bore born boss both bowl bran brew brow buck bulb
bulk bull bump bunk burn bush bust busy cage cake calf call calm came camp cane cape card
care cart case cash cast cave cell cent chap chat chef chew chin chip chop city clad clam
clap claw clay clip clog club clue coal coat code coil coin cold colt comb come cone cook
cool cope copy cord core cork corn cost cosy cove crab crew crib crop crow cube cult curb
cure curl dale dame damp dare dark dart dash data date dawn dead deaf deal dean dear debt
deck deed deem deep deer dent desk dial dice diet dime dine ding dint dire dirt dish disk
dive dock doe does dome done doom door dorm dose dote dots dove down drag dram draw drew
drip drop drug drum dual duck dude duel duet duke dull dumb dune dung dunk dusk dust duty
each earl earn ease east easy echo edge edit envy epic euro even ever evil exam exit face
fact fade fail fair fake fall fame fang fare farm fast fate fawn fear feat feed feel feet
fell felt fend fern feud file fill film find fine fire firm fish fist five flag flak flap
flat flaw flea fled flee flew flex flip flit flop flow flue foam foe foil fold folk fond
font food fool foot ford fore fork form fort foul four fowl free fret frog from fuel full
fume fund funk fury fuse fuss gain gait gala gale gall game gang gaol gape gash gate gave
gaze gear gene gift gild gilt girl gist give glad glee glen glow glue goal goat gold golf
gone gong good goof gore gory gosh gown grab gram gray grew grey grid grim grin grip grit
grow grub gulf gull gulp gush gust guts hack hail hair half hall halo halt hand hang hard
hare hark harm harp hash haste hate haul have hawk haze head heal heap hear heat heed heel
heir held helm help herb herd here hero hide high hike hill hilt hind hint hire hiss hive
hoax hold hole holy home hone hood hoof hook hoop hoot hope horn hose host hour howl huge
hull hump hunk hunt hurl hurt hush hymn idea idle idol inch into iron isle item jade jail
jazz jeep jerk jest joey join joke jolt jolt jump junk jury just keel keen keep kelp kept
kick kill kiln kind king kiss kite knee knew knit knob knot know lace lack lady laid lair
lake lamb lame lamp land lane lard lark lash last late lava lawn laze lead leaf leak lean
leap left lend lens lent less levy liar lice lick lied lien life lift like lily limb lime
limp line link lint lion list live load loaf loan lobe lock loft logo lone long look loom
loop loot lord lore lose loss lost loud love luck lull lump lunar lung lure lurk lush lust
lute mace made maid mail main make male mall malt mane many mare mark mash mask mass mast
mate math maze mead meal mean meat meek meet melt memo mend menu mere mesh mess mice mild
mile milk mill mime mind mine mint mire miss mist mite moan moat mock mode mold mole monk
mood moon moor moot mope more morn moss most moth move much muck mule mull mush mute myth
nail name nape nave navy near neat neck need neon nest news next nice nick nine node noon
nope norm nose nosy note noun nude nuke null numb oath oboe odds ogre oily okay omen omit
once only onto onyx ooze open oral orca ouch oust oval oven over owed owls pace pack pact
page paid pail pain pair pale palm pane pang pant para pare park part pass past pate path
pave pawn peak peal pear peat peck peek peel peer pelt pend perk pest pick pier pike pile
pill pine ping pink pint pipe plan play plea plod plot plow ploy plug plum plus pock poem
poet poke pole poll pond pony pool poor pope pore pork port pose posh post pour pout pram
pray prep prey prim prod prom prop prow pull pulp puma pump punk punt pupa pure purr push
quay quid quip quit quiz race rack racy raft rage raid rail rain rake ramp rang rank rant
rare rash rasp rate rave read real ream reap rear reed reef reek reel rein rely rend rent
rest rice rich ride rife rift rile rill rime rind ring rink riot ripe rise risk rite road
roam roar robe rock rode role roll roof rook room root rope rose rosy rote rout rove rude
ruff ruin rule rump rune rung runt rush rust ruth sack safe saga sage said sail sake sale
salt same sand sane sang sank sash save scab scam scan scar scat seal seam sear seat sect
seed seek seem seen seep self sell semi send sent sept serf sewn shad shag shah sham shed
shin ship shoe shop shot show shun shut sick side sift sigh sign silk sill silo silt sing
sink sire site size skid skim skin skip skit slab slam slap slat sled slew slid slim slip
slit slob sloe slog slop slot slow slug slum slur smog smug snag snap snip snob snot snow
snub snug soak soap soar sock soda sofa soft soil sold sole solo soma some song soon soot
sore sort soul soup sour sown spam span spar spat spec sped spew spin spit spot spud spun
spur stab stag stand star stay stem step stew stir stop stow stub stud stun stye such suck
suds suit sulk sumo sung sunk sure surf swab swam swan swap swat sway swig swim swum tabs
tack tail take tale talk tall tame tang tank tape taps tare tarn task taut taxi teak teal
team tear teas teat tech teem teen tell temp tend tens tent term test text than that thaw
thee them then they thin this thru thud thug thus tick tide tidy tied tier tile till tilt
time tine ting tint tiny tire toad toe toil told toll tomb tone tong tool toot tore torn
tort toss tour tout town trace track trade trail tram trap tray tree trek trim trio trip
trod trot true tsar tuba tube tuck tuna tune turf turn tusk tutu twin twit type tyre ugly
unit upon urge urns used user uses vain vale vamp vane vase vast veal veer veil vein vend
vent verb very vest veto vial vibe vice view vile vine viol visa void volt vote wade wadi
waft wage wail wait wake walk wall waltz wand wane want ward ware warm warn warp wars wart
wary wash wasp watt wave wavy waxy weak weal wean wear weed week weep weft weigh weir weld
well welt went wept were west wham what when whet whey whip whir whit whiz whoa whom wick
wide wife wild wile will wilt wily wind wine wing wink wipe wire wise wish wisp with woad
woke wolf womb wood wool word wore work worm worn wove wrap wren writ yank yard yarn yawn
year yell yelp yoga yoke yolk your yowl zeal zero zest zinc zone zoom
about above abuse actor acute adapt admit adopt adore adult after again agent agile aglow
agree ahead aided aimed aisle alarm album alert alike alive allow alloy aloft alone along
aloof aloud alpha altar alter amaze amber amble amend amino ample amply amuse angel anger
angle angry ankle annoy anvil apart aphid apple apply apron arbor ardor arena argue arise
armor aroma array arrow arson artsy ashen aside asked asset atlas atoll attic audio audit
aunt avail avert avoid awake award aware awash awful awoke axiom azure bacon badge badly
baker baler banjo barge baron basic basil basin basis baste batch bathe baton bayou beach
beads beady beard beast began begin begun being belch belie belle belly below bench berry
berth beset betel bezel bible bicep biddy bigot bilge billy binge bingo birch birth bison
black blade blame bland blank blare blast blaze bleak bleat bleed bleep blend bless blimp
blind blink bliss blitz bloat block bloke blond blood bloom blown bluff blunt blurt blush
board boast bogus boils bonus boost booth booty booze boozy borax borne bossy botch bough
bound bowel boxer brace braid brain brake brand brash brass brave bravo brawl bread break
breed bribe brick bride brief brine bring brink briny brisk broad broke brook broom broth
brown brush brute buddy buggy bugle build built bulge bulky bully bunch bunny burly burnt
burst bushy butte buyer buzzy cabin cable cacao cache cacti caddy cadet cagey cairn camel
cameo candy canny canoe caper cards cargo carol carry carve caste catch cater catty caulk
cause cease cedar cello chafe chain chair chalk champ chant chaos chapel charm chart chase
chasm cheap cheat check cheek cheer chess chest chewy chick chief child chili chill chime
china chink chirp chock choir choke chomp chord chore chose chuck chump chunk churn chute
cider cigar cinch circa civic civil clack claim clamp clang clank clash clasp class clean
clear cleat clerk click cliff climb cling clink cloak clock clone close cloth cloud clout
clove clown cluck clued clump clung coach coast cobra cocoa colon color comet comfy comic
comma conch condo coral corgi corny couch cough could count court coupe cover covet covey
cower coyly crack craft cramp crane crank crash crass crate crave crawl craze crazy creak
cream credo creed creek creep creme crepe crept cress crest crick cried crier crime crimp
crisp croak crock crone crony crook cross croup crowd crown crude cruel crumb crush crust
crypt cubic cumin curio curly curse curve curvy cyber cycle cynic daddy daily dairy daisy
dally dance dandy datum daunt dealt death debit debut decal decay decor decoy decry defer
deity delay delta delve demon denim dense depot depth derby deter detox devil dewey diary
dicey digit dilly dimly diner dingo dingy dirge dirty disco ditch ditto ditty diver dizzy
dodge dodgy dogma doily doing dolly donor donut dopey doubt dough dowdy dowel downy dowry
dozen draft drain drake drama drank drape drawl drawn dread dream dress dried drift drill
drink drive droit droll drone drool droop dross drove drown druid drunk dryer dryly duchy
dully dummy dumpy dunce dusky dusty dutch duvet dwarf dwell dwelt dying eager eagle early
earth easel eaten eater ebony eclat edict edify eerie egret eight eject eking elate elbow
elder elect elegy elfin elide elite elope elude email embed ember emcee empty enact endow
enema enemy enjoy ennui ensue enter entry envoy epoch epoxy equal equip erase erect erode
error erupt essay ester ethic ethos etude evade event every evict evoke exact exalt excel
exert exile exist expel extol extra exult eying fable faced facet faint fairy faith false
famed fancy fanny farce fatal fatty fault fauna favor feast fecal feign fella felon femur
fence feral ferry fetal fetch fetid fetus fever fewer fiber fibre ficus field fiend fiery
fifth fifty fight filer filet filly filmy filth final finch finer first fishy fixer fizzy
fjord flack flail flair flake flaky flame flank flare flash flask fleck flesh flick flier
fling flint flirt float flock flood floor flora floss flour flout flown fluff fluid fluke
flume flung flunk flush flute foamy focal focus foggy foist folio folly foray force forge
forgo forte forth forty forum found foyer frail frame frank fraud freak freed fresh fried
frill frisk fritz frock frond front frost froth frown froze fruit fudge fully fumed funky
funny furor furry fussy fuzzy gaffe gaily gamer gamma gamut gassy gaudy gauge gaunt gauze
gavel gawky gayer gayly gazer gecko geeky geese genie genre ghost ghoul giant giddy gipsy
girly girth given giver gizmo glade gland glare glass glaze gleam glean glide glint gloat
globe gloom glory gloss glove glyph gnash gnome godly going golem golly gonad goner goody
gooey goofy goose gorge gouge gourd grace grade graft grail grain grand grant grape graph
grasp grass grate grave gravy graze great greed green greet grief grill grime grimy grind
gripe groan groin groom grope gross group grout grove growl grown gruel gruff grunt guard
guava guess guest guide guild guile guilt guise gulch gully gumbo gummy guppy gusto gusty
gypsy habit hairy halve handy happy hardy harem harpy harsh haste hasty hatch hater haunt
haven havoc hazel heady heard heart heath heave heavy hedge hefty heist hello hence heron
hilly hinge hippo hippy hitch hoard hobby hoist holly homer honey honor horde horny horse
hotel hotly hound house hovel hover howdy human humid humor humph hunch hyena hyper icily
icing ideal idiom idiot idler idyll igloo iliac image imbue impel imply inane inbox incur
index inept inert infer ingot inlay inlet inner input inter intro ionic irate irony islet
issue itchy ivory jaunt jazzy jelly jenny jerky jetty jewel jiffy joint joist joker jolly
joust judge juice juicy jumbo jumpy junta junto juror kappa karma kayak kebab khaki kinky
kiosk kitty knack knave knead kneel knelt knife knock knoll known koala krill label labor
laden ladle lager lance lanky lapel lapse large lasso latch later lathe latte laugh layer
leach leafy leaky leant leapt learn lease leash least leave ledge leech leery lefty legal
leggy lemon lemur leper level lever libel light liken lilac limbo limit linen liner lingo
lipid liter lithe lived liver livid llama loamy loath lobby local locus lodge lofty logic
login loopy loose lorry loser louse lousy lover lower lowly loyal lucid lucky lumen lumpy
lunar lunch lunge lupus lurch lurid lusty lying lymph lyric macaw macho macro madam madly
mafia magic magma maize major maker mamba mambo mango mangy mania manic manor maple march
marry marsh mason masse match matey mauve maxim maybe mayor mealy meant meaty mecca medal
media medic melee melon mercy merge merit merry messy metal meter metro micro midge midst
might milky mimic mince miner minor minty minus mirth miser missy moist molar moldy money
month moody moose moral moron morph mossy motel motif motor motto moult mound mount mourn
mouse mousy mouth mover movie mower mucky mucus muddy mulch mummy munch mural murky mushy
music musky musty myrrh nadir naive nanny nappy nasal nasty naval navel needy neigh nerdy
nerve never newer newly nicer niche niece night ninja ninny ninth noble nobly noise noisy
nomad noose north nosey notch noted novel nudge nurse nutty nylon nymph oaken obese occur
ocean octal octet odder oddly offal offer often olden older olive ombre omega onion onset
opera opine opium optic orbit order organ other otter ought ounce outdo outer outgo ovary
ovate overt ovine ovoid owing owner oxide ozone paddy padre paint paler palsy panel panic
pansy papal paper parka parry parse party pasta paste pasty patch patio patsy patty pause
payee payer peace peach pearl pecan pedal penal pence penne penny perch peril perky pesky
pesto petal petty phase phone phony photo piano picky piece piety piggy pilot pinch piney
pinky pinto piper pique pitch pithy pivot pixel pixie pizza place plaid plain plait plane
plank plant plate plaza plead pleat plied plier pluck plumb plume plump plunk plush poesy
point poise poker polar polka polyp pooch poppy porch poser posit possum pouch pound pouty
power prank prawn preen press price prick pride pried prime primo primp print prior prism
privy prize probe prone prong proof prose proud prove prowl proxy prude prune psalm pubic
pudgy puffy pulpy pulse punch pupal pupil puppy puree purer purge purse pushy putty pygmy
quack quail quake qualm quark quart quash quasi queen queer quell query quest queue quick
quiet quill quilt quirk quite quota quote quoth rabbi rabid racer radar radio rainy raise
rajah rally ralph ramen ranch randy range rapid rarer raspy ratio ratty raven rayon razor
reach react ready realm rearm rebar rebel rebus rebut recap recur redon reedy refer refit
regal rehab reign relax relay relic remit renal renew repay repel reply rerun reset resin
retch retro retry reuse revel rhino rhyme rider ridge rifle right rigid rigor rinse riper
risen riser risky rival river rivet roach roast robin robot rocky rodeo roger rogue roomy
roost rotor rouge rough round rouse route rover rowdy rower royal ruddy ruder rugby ruler
rumba rumor rupee rural rusty saber sadly safer saint salad sally salon salsa salty salve
salvo sandy saner sappy saucy sauna saute savor savoy savvy scald scale scalp scaly scamp
scant scare scarf scary scene scent scion scoff scold scone scoop scope score scorn scour
scout scowl scram scrap scree screw scrub scrum scuba sedan seedy segue seize seldom semen
sense sepia serif serum serve seven sever sewer shack shade shady shaft shake shaky shale
shall shalt shame shank shape shard share shark sharp shave shawl shear sheen sheep sheer
sheet sheik shelf shell shied shift shine shiny shire shirk shirt shoal shock shone shook
shoot shore shorn short shout shove shown showy shred shrew shrub shrug shuck shunt shush
shyly siege sieve sight sigma silky silly since sinew singe siren sissy sixth sixty skate
skier skiff skill skimp skirt skulk skull skunk slack slain slang slant slash slate sleek
sleep sleet slept slice slick slide slime slimy sling slink sloop slope slosh sloth slump
slung slunk slurp slush slyly smack small smart smash smear smell smelt smile smirk smite
smith smock smoke smoky smote snack snail snake snaky snare snarl sneak sneer snide sniff
snipe snoop snore snort snout snowy snuck snuff soapy sober soggy solar solid solve sonar
sonic sooth sooty sorry sound south sower space spade spank spare spark spasm spawn speak
spear speck speed spell spend spent sperm spice spicy spied spiel spike spiky spill spilt
spine spiny spire spite splat split spoil spoke spook spool spoon spore sport spout spray
spree sprig spunk spurn spurt squad squat squib stack staff stage staid stain stair stake
stale stalk stall stamp stand stank stare stark start stash state stave stead steak steal
steam steed steel steep steer stein stern stick stiff still stilt sting stink stint stock
stoic stoke stole stomp stone stony stood stool stoop store stork storm story stout stove
strap straw stray strip strut stuck study stuff stump stung stunk stunt style suave sugar
suing suite sulky sully sumac sunny super surer surge surly sushi swami swamp swarm swash
swath swear sweat sweep sweet swell swept swift swill swine swing swirl swish swoon swoop
sword swore sworn swung synod syrup tabby table taboo tacit tacky taffy taint taken taker
tally talon tamer tango tangy taper tapir tardy tarot taste tasty tatty taunt tawny teach
teary tease teddy teeth tempo tenet tenor tense tenth tepee tepid terra terse testy thank
theft their theme there these thick thief thigh thing think third thong thorn those three
threw throb throw thrum thumb thump thyme tiara tibia tidal tiger tight tilde timer timid
tipsy tithe title toast today toddy token tonal tonga tonic tooth topaz topic torch torso
torus total totem touch tough towel tower toxic toxin trace track tract trade trail train
trait tramp trash trawl tread treat trend trial tribe trice trick tried tripe trite troll
troop trope trout trove truce truck truly trump trunk truss trust truth tryst tubal tuber
tulip tummy tumor tunic turbo tutor twang tweak tweed tweet twice twine twirl twist twixt
udder ulcer ultra umbra uncle uncut under undid undue unfed unfit unify union unite unity
unlit unmet unset untie until unzip upend upper upset urban urine usage usher using usual
usurp utile utter vague valet valid valor value valve vapid vapor vault vaunt vegan venom
venue verge verse verso verve vicar video vigil vigor villa vinyl viola viper viral virus
visa visit visor vista vital vivid vixen vocal vodka vogue voice voila vomit voter vouch
vowel wacky wafer wager wagon waist waive waltz warty waste watch water waver waxen weary
weave wedge weedy weigh weird welch welsh whack whale wharf wheat wheel whelp where which
whiff while whine whiny whirl whisk white whole whoop whose widen wider widow width wield
wight willy wimpy wince winch windy wiser wispy witch witty woken woman women woody wooer
wooly woozy wordy world worry worse worst worth would wound woven wreck wrist write wrong
wrote wrung wryly yacht yearn yeast yield young youth zebra zesty zonal
abroad accent accept access accord across action active actor adhere adjust admire adobe
advent affair afford afraid agency aghast agreed alight allege alloys almond almost amount
animal annual answer anyone appeal arctic around arrive artist aspire assert assign assist
assume assure attach attain attend attire august author awhile backup ballad ballet ballot
banana banker banner barely barren basket batter bazaar beacon beaker beaten beauty beaver
became become before begone behalf behind belief belong beside better betray beware beyond
bigger binary birdie bishop bitter bizarre blazer bleach blight blonde bloody bloomy blouse
boiler bolder bolster bonnet borrow bother bottle bottom bought bounce bounty bovine boxcar
brace bracket brainy branch brandy breach breath breeze bridge bright broken bronco bronze
brooch brunch budget bumper bundle bunker burden bureau bushel butter button cabbage cactus
caddie called camera cancel candor canine canopy canyon carbon careen career carpet carrot
carton castle casual catnip cavity celery cellar cement census chains chalet chance change
charge charm chassis cheese cherry chewer chilly choice choose chorus chosen church cinema
circle circus clammy clause clever client climax clinic closer clover clutch coarse cobble
cobweb coddle coffee collar collie colony column combat coming common congas convey cookie
cooker cooler copper corner cosmic cosmos cotton couple course cousin coward cowboy crater
cravat craven crayon create creator credit creepy cringe critic crouch crowed cruise crumb
crunch crusty cuddle curfew cursor curtsy custom cutout cyborg cymbal dabble dagger dahlia
dampen damsel dangle danish dapper daring darken dazzle deacon deadly dealer decade deceit
decent decide deduce deeply defeat defend define defrost degree deject delete delude demand
demise denote denial depart depend deploy deputy desert design desire detail detect detour
device devour dialog differ dimple dinner direct disarm disco dismay divert divide divine
docile doctor dollar domain donate donkey doodle dorsal dotted double doubly dragon drawer
dreamy dredge drinky driver dual dubbed dugout duress during duster duties dynamo eagles
earbud earned earwig easily eaten eatery echoes eczema editor effect effort eggcup eighth
either elapse elated elbows elder eldest eleven elicit elixir embark embers emblem emerge
empire employ empower enable encode endure energy engage engine enjoy enlist enrich enroll
ensure entail entire entity entree envied equate equine equity erotic errand errant escape
escort estate esteem ethics evolve excess excite excuse expand expect expert expire export
expose extend extent fabric facade facing factor fading failed fairer fallen falter family
famine fasten fatten faulty fellow female fender ferret fervor fetish fiasco fiddle fierce
figure filter finale finder finest finger finish fiscal fixate flabby flagon flames flange
flashy fledge flight flimsy flinch florid flower fluent fluffy flurry flying foible folder
follow forbid forest forget formal format former fossil foster fought fourth frame frenzy
fridge friend fringe frisky frolic frozen frugal fueled fumble funnel furrow gadget galaxy
gallon gallop gamble garage garden garish garlic garner garret gather gentle gentry genuine
geyser ghetto gibbon gifted ginger girdle glance glassy gleaming glider glitch global gloomy
glossy glowed gnarly goblet goblin golden gopher gospel gossip govern grabby gracile grader
grainy grasp gratis gravel graven grease greasy greedy grimly grimace grocer groove grotto
ground grouse groove growth grumpy guarded guitar gulley gunman gunner gusset gutter guzzle
hacker haggle hairdo hallow hamlet hammer hamper handle hanger happen harbor harden harvest
hasten hatred hauler havoc hazard health hearth heaven heckle hectic height helmet herald
herbal hereby hermit heroic hidden hijack hinder hiring hiss hither hockey holder hollow
homage honest hoodie hooray hopeful hornet horror hosted hostel hotbed hottie housed humane
humble humbug humdrum hunger hungry hunter hurdle hurray hurricane hustle hybrid hyphen
iguana ignore impact impair impart impede impend import impose impure incite income indeed
indent indoor induce inept infant infect inflate inform infuse inhale inject injure injury
inlaid insane insect insert inside insist insult intact intake intend invade invent invest
invite invoke inward iodine ironic island itself jabber jackal jacket jaguar jangle jargon
jaunty jersey jester jigsaw jingle jockey joiner jolted jovial junior junket jurist kennel
kernel ketchup kettle keynote kidney kinder kingly kisser kitten kludge knight knower koala
ladder lagoon lament lancer landed lantern lapdog lapsed larger lariat larynx lasso lately
lather latter lattice launch lavish lawful lawyer layout leader league leaped leaper learns
ledger legacy legend legion lender length lesson lethal letter levity liable lichen likely
limber linear linger linked lintel liquid listen litter little living lizard locate locket
locust lodger logger logic lonely longer looker lookup loosen loquat loudly lounge louvre
lovely loving lowing lucent lucky lumber lumpy lunacy lurker luster luxury lyrics machine
madame madden madman magnet magnum mahout maiden makeup malady malice mallet mammal mammon
manage mandate mangle manner mantel mantle mantra manual manure marble margin marina marine
marker market maroon marrow marsh martyr marvel mascot masonry masque master matron matter
mature maybe mayhem meadow meager meddle median medic medium meekly mellow melody member
memory mended mentor mercer merger metric mettle midday midget midway mighty mildew miller
mimosa minced miners mingle minion minnow minor minted minute mirror miser misery misfit
mishap missal mister misty mister mitten mixing mobile mocha mocker modern modest module
mohair moldy molten moment monday monger monkey months mooned mopped morale morbid morgue
mortal mortar mosaic mostly mother motion motive mottled mottle mounds mourn mouse mousse
mouthy moving mucked muddle muffin mullet mumble mundane murals murder murmur muscle museum
musket mussel mustard mutate mutual muzzle myriad mystic nagged nanny napkin narrate native
nature nausea nearby nearer nearly neaten needle negate nephew nestle nettle neuron neuter
newbie nibble nicely nickel nimble nipple nobler nodule nomads nordic normal notary noting
notice notion nougat novice nozzle nuance nugget number numeral nuncio nurse nutmeg nuzzle
oakum object oblong oboist obtain occult occupy ocelot offend office offset oilcan oldest
olive ominous onion onset onward oolong oozing opaque openly operate ophthalmic opiate
optics option orange orator orbit orchid ordain ordeal organ orient origin ornate orphan
osprey ostler outage outback outcry outdid outfit outing outlaw outlay outlet output outran
outset outwit overdo overly oxford oxtail oxygen oyster pacing packed packer paddle pagoda
palace palate palette pallet pallid palmed pamper pandas panel panini panther papaya papers
parade parcel pardon parent parley parlor parody parole parrot parsec parsley parsnip parson
partly pastel pastry patchy patent patrol patron patter paunch pauper paving pawing pawnee
payday paying peachy peanut pebble pecker pectin peddle pellet pelvic pelvis pencil pepper
perish permit person petite petrol petty pewter phobia phoney phrase pickax pickle picnic
pierce piety pigeon piglet pigment pillar pillow pimple pincer pining pinion pinkie pinkly
pioneer pippin pirate pistol piston pitchy piteous pitied pixel placed placer placid plague
plaint planar planer planet plaque plasma plated platen player please pledge plenty pliers
plight plinth plover plowed plucky plumber plummet plunge plural pocket podium poetry poison
poking polar police policy polish polite pollen pommel pompom poncho pongee popgun poplar
popped porter portal poser posit posses postal poster potato potion potted pottery pouch
poultry pounce powder powwow prance prayer preach precis prefab prefer prefix prelim premix
prepay preset preside presto pretty pretzel prewar prince prison privet probate problem
profile profit prolong prompt pronto proper propel proper protect protein protest proverb
provoke prowls prudent psalm public puddle puffed pulley pullup pulpit pulsar pummel pumice
pumpkin punchy pundit punily punish punkin puny puppet purely purest purgeable purity purple
pursue purvey pushed pushup putrid putter puzzle pylons python quaint quaver quench quibble
quiche quirky quiver quorum quotas rabbit racing racket radial radish raffle ragged raglan
ragout raider railed raisin ramble rancid random ranger rankle ransom rapid raptor rarely
rascal rashly rasher ratify ration ravage ravine ravish rayon reagent really realms reaped
reason rebuke rebuild recede recent recess recipe reckon recoil record rectify reduce reefer
refill reflex reform refund refuge refuse refute regard regime region regret rehash reject
relate relay relent relief relish relive remain remake remedy remind remnant remove rename
render renege rental repair repeal repeat replay report repose reread rerun rescue resent
reside resign resin resist resort result resume retail retain retake retire retort retrace
retreat reveal revere revert review revise revive reward rewind rewire rhythm ribbon richer
riches rifle rigid rinse ripen ripple risen risers rising risky ritual ritzy rivals robins
robust rocket roller romance rookie rotary rotate rotten rotund rouge rouse router rubbed
rubber rubble rubric rudder rugged rumble runner runoff runway rupee rustic rustle sabbath
sachet sacred sadden saddle safari saggy sailed sailor salami salary saliva sallow salmon
saloon salute salvage sample sandal sander sanity sapped sapphire sashay satchel satiny
satire saucer savage savior savor scalar scaled scally scampi scanty scarab scarce scarce
scares scenic schema scheme scherzo school scoop scoped scorch scotch scotia scrawl scream
screech screen scribe script scroll scrubs sculpt scurry seabird seafloor sealant seaport
search season seaweed second secret sector secure sedate seduce seeing seemed seethe seizes
select seller seltzer senate sender senior sensor sentry sequel sequin serene serial sermon
serpent server settee settle severe sewage shabby shaded shadow shaken shaker shaman shanty
shaped sharer shaver shaving shears sheath shelfy sheriff shield shimmy shindig shiner shinto
shiver shoals shocks should shovel shower shrank shriek shrill shrimp shrine shrink shroud
shrubs shrugs shrunk shutter shyly sicken sickle sienna sierra siesta sifter signal silica
silken silver simian simile simmer simple simply singer single sinker sinner sinus sipper
sirloin sister sitcom sitter sixteen sizzle skater sketch skewer skiing skinny skirly slalom
slangy slanty slated sleazy sledge sleeky sleeve slewed slicer slider slight slimly slinky
sliver slogan sloppy slouch slowly sludge sludgy slumber slurp slush smarts smatter smiley
smithy smoggy smooch smooth snappy snatch snazzy sneaky sniffle snippet snitch snooze snore
snorkel snotty snowed snuggle social socket sodium soften softly soiree solace solder soldier
solemn solute somber sonata sonnet sooner sorbet sordid sorely sorrow sorter soothe source
souvenir spacer spaded spangle spanky sparse spatula speaker special species speech sphere
spider spigot spinal spinet spiral spirit spleen splice spline splint sponge spongy spoofy
spooky sporty spouse sprain sprawl spread spree sprigs spring sprint sprout spruce spunky
square squash squawk squeak squeal squint squire squirm stable stacks stadium staffer stages
stairs stalk stamen stamps stance stanza staple starch starer starve stasis static stator
status staved steamy steely stellar stench stereo stewed sticky stiffy stigma stilly stinky
stirry stitch stocks stodgy stoker stolid stomach stones stoned stoops stormy strafe strain
strait strand strap straps strata strawy stream street stress strewn stride strife strike
string stripe strive strobe stroll strong strove strung strut stubby studio stuffy stumble
stunts stupid sturdy stylish stymie subdue submit subset subtle subway succeed sucker suffer
suffix sugary suited sulfur sullen sultan sultry summer summit summon sunbed sundae sunder
sundry sunken sunlit sunset sunup superb supper supple supply support suppose surely surface
surfer surgeon surly surmise surplus survey suture svelte swabbed swatch sweater sweetly
swerve swivel sylvan symbol syntax syringe system tackle taffeta tailor talent talker tallow
tamale tandem tangle tanker tanned tannin tantrum taoism tapped tartan tartar tassel tasted
taught taunts tavern tawny teacup teamed teapot teaser teazel teeing teeter teethe telecom
temper tenant tender tendon tenets tenner tennis tenpin tenrec tenths tenure teosinte tequila
ternary terrace terrain terror tertian thatch thawed theirs thence theory thesis thicket
thigh thirst thirty thorax thread threat thrice thrift thrill throat throne throng through
thrown thrush thrust thumbs thwart thymus thyroid ticked ticker ticket tidbit tiding tiffin
tigers tights timber timely tinder tingle tinker tinkle tinsel tipoff tiptoe tirade tissue
titans tither titled titles toaster tobacco toddle toffee toggle toilet token tolled tomato
tomboy tomtit tongue tonight tonsil tooled tooter toothy topcoat topdog tophat topple toprank
torrid torpor torque torrent tortoise torus tossup totals totted toucan touchy toupee toured
tourist tousle tousled toward towels towhee toxins traced tracer traces tracks tractor trader
trades traffic tragic trailer trained trainer traipse traitor trance transit trapeze trapper
trashy trauma travel travail trawled treads treason treaty treble treetop trekker tremble
tremolo trench trendy trestle triage tribal tribute triceps trickle trident trifle triggy
trilby trill trinket triple tripod tripos trireme trishaw triumph trivet trivia trodden
trolley trooper trophy tropic trouble trounce troupe trouser trowel truancy truant trudge
truffle truism trumpet truncated truncate trundle trustee trusty tryout tubby tubular tucked
tugboat tugged tumble tundra tunics turban turbid turbot turkey turmoil turn turner turnip
turnkey turnoff turnout turtle tussle tussock tutored tuxedo twangy tweaked tweedle tweeter
twelfth twelve twenty twiddle twiggy twinge twinkle twirler twisty twitch twofold tycoon
typhoon typeset typhoid typhoon typical typist tyrant udders uglier ulster ultima umbrage
umlaut umpire unable unbend unbind unborn unbound uncoil uncool uncork uncouth undergo undine
undoing undress undue uneasy unequal uneven unfair unfit unfold unfurl unhand unhappy unhook
unhurt unicorn unified uniform unipod unique unisex unison united unjust unkempt unkind
unknown unlace unlatch unleash unless unlike unload unlock unlucky unmade unmask unmoved
unnamed unpack unplug unquote unravel unready unreal unrest unroll unruly unsafe unsaid
unseal unseat unseen unsold unsound untamed untidy untie untold untrue unused unusual unveil
unwary unwell unwind unwise unwrap unzip update upend upfield upgrade upheld uphill uphold
upkeep upland uplift upload upmost uppity upraise uproar uproot upsell upset upshot upside
upsilon upskill upslope upstage upstart upstate upstream uptake uptempo uptick uptown upturn
upward upwind uracil uranium urbane urchin urgent urinal urology useable usually utensil
uterus utility utopia utterly vacant vacate vaccine vacuum vagabond vagary vaguely vainly
valise valley valor value valued valve vamoose vandal vanish vanity vanquish vapor vaporize
varlet varnish varsity varying vassal vassel vatful vaulter vaunted vector veggies vehicle
veiled veined velcro velour velure velvet vendor veneer venery vengeance venison ventral
venture verbose verdant verdict verify verily verities vermin vernal versed version versus
vertex vested vestige vetting viable viaduct vibrant vibrate vicar viceroy vicious victim
victor video vienna viewer vigil vigour viking vinous vintage vinyl violate violet violin
virago virtual virtue virus visage viscid viscous viscount visible vision visit visitor
visor vista visual vitals vivace vivid vixens vizier vocab vocal vodka vogue voiced voicing
volley voltage volume vortex votary voted voter votive vowed vowel voyage vulcan vulgar
vulture vying wabble wacky waddle wading wafers waffle wagging wagons waited waiter waiver
walker walkup wallet wallop wallow walnut walrus wander wangle wanted wanton warble warden
warder warfare warily warmth warned warner warpath warrant warred warren warrior warship
warthog wartime washer washout washtub wasps wastage wasted wastrel watcher water watery
wattle wavelet wavering waxen waxing weaken weakly wealth weapon wearer weasel weather weave
webbing webcam webfoot wedded wedding wedged wedlock weeded weekday weekend weeper weevil
weighty weirdo welcome welfare welkin welled wellie welsher welter wencher wending wether
wetland wetness wetsuit wetted wexford whacky whaler wharves wheaten wheels wheeze wheezy
whereas whereby whether whichever whicker whiffle whimper whimsy whinny whirly whisker
whiskey whisper whistle whither whitey whittle whoever wholly whoosh whopper whorl wicked
wicker wicket widely widen wider widget widow widowed widower width wields wiener wifely
wiggle wiggly wigwam wilder wildly willow wilful winced winches windbag windsock windup
windy winery winged winger winker winkle winner winning winnow winter wintry wipeout wiring
wisdom wisely wishful wistful wither within without witless witness wizard wizened wobble
wobbly woeful wolves womanly wonder wonky wooded wooden woodland woolen woozy worded wordy
working workout workman worldly worms wormy worried worrier worsen worship worsted worthy
wounds wrangle wrapper wrasse wrathful wreaths wrecker wrench wrestle wretch wriggle wright
wrinkle wristy writers writing written wrongly yacht yahoo yammer yardarm yarrow yawned
yearly yearns yeasty yellow yelped yeoman yields yippee yoghurt yogurt yonder yorker younger
youthful yowling zealot zealous zebras zenith zephyr zigzag zipper zircon zither zodiac
zombie zombie zonked zoolander zoology zooming zucchini zydeco
`

// --- Classic Boggle dice. 16 dice, 6 faces each. 'Q' face is the "Qu" cell. ---
export const DICE: string[][] = [
  ['A', 'A', 'E', 'E', 'G', 'N'],
  ['A', 'B', 'B', 'J', 'O', 'O'],
  ['A', 'C', 'H', 'O', 'P', 'S'],
  ['A', 'F', 'F', 'K', 'P', 'S'],
  ['A', 'O', 'O', 'T', 'T', 'W'],
  ['C', 'I', 'M', 'O', 'T', 'U'],
  ['D', 'E', 'I', 'L', 'R', 'X'],
  ['D', 'E', 'L', 'R', 'V', 'Y'],
  ['D', 'I', 'S', 'T', 'T', 'Y'],
  ['E', 'E', 'G', 'H', 'N', 'W'],
  ['E', 'E', 'I', 'N', 'S', 'U'],
  ['E', 'H', 'R', 'T', 'V', 'W'],
  ['E', 'I', 'O', 'S', 'S', 'T'],
  ['E', 'L', 'R', 'T', 'T', 'Y'],
  ['H', 'I', 'M', 'N', 'U', 'Qu'],
  ['H', 'L', 'N', 'N', 'R', 'Z'],
]

// Build the playable word set: lowercase, a-z only, length 3..8, de-duplicated.
const _seen = new Set<string>()
const _words: string[] = []
for (const raw of RAW_WORDS.split(/\s+/)) {
  const w = raw.toLowerCase()
  if (w.length < 3 || w.length > 8) continue
  if (!/^[a-z]+$/.test(w)) continue
  if (_seen.has(w)) continue
  _seen.add(w)
  _words.push(w)
}
/** The validated, de-duplicated dictionary (length 3..8). */
export const WORDS: string[] = _words
/** Fast membership set for validation + AI search. */
export const WORD_SET: Set<string> = new Set(WORDS)

// --- Seedable RNG so grids/games are deterministic in tests (mulberry32). ---
export type RNG = () => number
export function makeRng(seed: number): RNG {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A grid is 16 cells (row-major, 4x4). Each cell is a letter token ('A'..'Z' or 'Qu'). */
export type Grid = string[]
export const SIZE = 4
export const CELLS = SIZE * SIZE

/** Roll the 16 dice into a 4x4 grid. Dice are shuffled to random positions, each showing a
    random face. Injectable RNG keeps it deterministic for tests. */
export function rollGrid(rng: RNG = Math.random): Grid {
  // Shuffle dice order (Fisher-Yates) so positions vary, then pick a random face for each.
  const order = DICE.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp
  }
  const grid: Grid = []
  for (let c = 0; c < CELLS; c++) {
    const die = DICE[order[c]]
    grid.push(die[(rng() * die.length) | 0])
  }
  return grid
}

// Precompute 8-neighborhood adjacency for every cell index.
const NEIGHBORS: number[][] = (() => {
  const out: number[][] = []
  for (let i = 0; i < CELLS; i++) {
    const r = (i / SIZE) | 0
    const c = i % SIZE
    const ns: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue
        ns.push(nr * SIZE + nc)
      }
    }
    out.push(ns)
  }
  return out
})()

/** The letters a cell contributes, lowercased ('qu' for a Qu cell, single chars otherwise). */
function cellLetters(token: string): string {
  return token.toLowerCase()
}

/**
 * Can `word` be traced on `grid` along a path of adjacent cells, each used at most once?
 * Handles the "Qu" cell (consumes the literal substring "qu" from the word). Case-insensitive.
 * Returns true iff at least one valid path spells the whole word.
 */
export function isOnGrid(grid: Grid, word: string): boolean {
  const w = word.toLowerCase()
  if (w.length === 0) return false
  const used = new Array<boolean>(CELLS).fill(false)

  function dfs(cell: number, pos: number): boolean {
    const letters = cellLetters(grid[cell])
    // The cell's letters must match the word starting at pos.
    if (!w.startsWith(letters, pos)) return false
    const next = pos + letters.length
    if (next === w.length) return true // consumed the whole word
    used[cell] = true
    for (const nb of NEIGHBORS[cell]) {
      if (used[nb]) continue
      if (dfs(nb, next)) { used[cell] = false; return true }
    }
    used[cell] = false
    return false
  }

  for (let i = 0; i < CELLS; i++) {
    if (dfs(i, 0)) return true
  }
  return false
}

/**
 * Return the actual cell-index path that spells `word` on `grid` (first one found), or null.
 * Used by the UI to highlight the traced path. Same rules as isOnGrid.
 */
export function findPath(grid: Grid, word: string): number[] | null {
  const w = word.toLowerCase()
  if (w.length === 0) return null
  const used = new Array<boolean>(CELLS).fill(false)
  const path: number[] = []

  function dfs(cell: number, pos: number): boolean {
    const letters = cellLetters(grid[cell])
    if (!w.startsWith(letters, pos)) return false
    const next = pos + letters.length
    path.push(cell)
    used[cell] = true
    if (next === w.length) return true
    for (const nb of NEIGHBORS[cell]) {
      if (used[nb]) continue
      if (dfs(nb, next)) return true
    }
    used[cell] = false
    path.pop()
    return false
  }

  for (let i = 0; i < CELLS; i++) {
    if (dfs(i, 0)) return path
    path.length = 0
  }
  return null
}

/** Classic Boggle score by word length: 3-4 -> 1, 5 -> 2, 6 -> 3, 7 -> 5, 8+ -> 11. */
export function wordScore(word: string): number {
  const n = word.length
  if (n < 3) return 0
  if (n <= 4) return 1
  if (n === 5) return 2
  if (n === 6) return 3
  if (n === 7) return 5
  return 11
}

/** A word is valid iff it is in the dictionary, >= 3 letters, and traceable on the grid. */
export function isValidWord(grid: Grid, word: string): boolean {
  const w = word.toLowerCase()
  if (w.length < 3) return false
  if (!WORD_SET.has(w)) return false
  return isOnGrid(grid, w)
}

/** A cap on how many words the AI may "find" — keeps it fast AND beatable. */
export const AI_WORD_CAP = 14

/**
 * Find dictionary words present on the grid via DFS, capped for speed + beatability.
 * Strategy: from each starting cell, DFS up to length 8, accumulating the letters spelled so
 * far; whenever the accumulated string is in WORD_SET (>=3 letters) it's recorded. A visited
 * set per path guarantees no cell is reused, so the DFS is bounded (max depth = 16 cells, max
 * word length 8) and cannot loop. Results are de-duplicated. If `rng`/`cap` are supplied the
 * AI returns a sampled subset (so the human can win); otherwise it returns ALL found words.
 */
export function aiFindWords(grid: Grid, rng?: RNG, cap: number = AI_WORD_CAP): string[] {
  const found = new Set<string>()

  function dfs(cell: number, prefix: string, used: boolean[]) {
    const next = prefix + cellLetters(grid[cell])
    if (next.length > 8) return // longest dictionary word is 8 -> prune
    if (next.length >= 3 && WORD_SET.has(next)) found.add(next)
    used[cell] = true
    for (const nb of NEIGHBORS[cell]) {
      if (!used[nb]) dfs(nb, next, used)
    }
    used[cell] = false
  }

  for (let i = 0; i < CELLS; i++) {
    dfs(i, '', new Array<boolean>(CELLS).fill(false))
  }

  let all = Array.from(found)
  if (rng == null) return all // full set (used by tests / scoring reference)

  // Sample a beatable subset: shuffle, take `cap`. Bias slightly toward shorter words so the
  // AI doesn't always grab every long high-scorer, leaving room for the human.
  for (let i = all.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = all[i]; all[i] = all[j]; all[j] = tmp
  }
  return all.slice(0, Math.min(cap, all.length))
}

export type Player = 0 | 1

export interface BoggleState {
  grid: Grid
  /** Words each player has committed this round: [you, ai]. */
  words: [string[], string[]]
  /** Cumulative match score across finished rounds: [you, ai]. */
  totals: [number, number]
  round: number          // 1-based current round
  rounds: number         // total rounds to play
  /** 'play' = human entering words; 'reveal' = AI revealing its words; 'done' = round scored. */
  phase: 'play' | 'reveal' | 'done'
  /** During 'reveal', how many of the AI's words have been shown so far. */
  revealed: number
  /** The AI's full word list for this round (computed once when the round is submitted). */
  aiPool: string[]
  /** Per-round scored breakdown after scoring (null until 'done'). */
  lastRound: { you: number; ai: number } | null
  winner: number | null  // 0, 1, -1 for a tie, or null while in progress
}

export const DEFAULT_ROUNDS = 3

/**
 * Create a fresh game. Pass an explicit grid for deterministic tests; otherwise roll one.
 * Player 0 (you) enters words first each round; the AI reveals after you finish the round.
 */
export function makeGame(grid?: Grid, rounds: number = DEFAULT_ROUNDS, rng: RNG = Math.random): BoggleState {
  return {
    grid: grid ? grid.slice() : rollGrid(rng),
    words: [[], []],
    totals: [0, 0],
    round: 1,
    rounds,
    phase: 'play',
    revealed: 0,
    aiPool: [],
    lastRound: null,
    winner: null,
  }
}

/**
 * Human (player 0) submits a word during the play phase. Validates dictionary + grid path +
 * length, and rejects duplicates already in your list. Returns { state, ok, reason }.
 */
export function submitWord(s: BoggleState, player: Player, word: string): { state: BoggleState; ok: boolean; reason?: string } {
  if (s.phase !== 'play') return { state: s, ok: false, reason: 'not accepting words' }
  const w = word.toLowerCase().trim()
  if (w.length < 3) return { state: s, ok: false, reason: 'too short (min 3)' }
  if (!WORD_SET.has(w)) return { state: s, ok: false, reason: 'not in dictionary' }
  if (!isOnGrid(s.grid, w)) return { state: s, ok: false, reason: 'no path on the grid' }
  if (s.words[player].includes(w)) return { state: s, ok: false, reason: 'already found' }
  const words: [string[], string[]] = [s.words[0].slice(), s.words[1].slice()]
  words[player] = words[player].concat([w])
  return { state: { ...s, words }, ok: true }
}

/**
 * End the human's input for the round: compute the AI's word pool (capped) and move into the
 * 'reveal' phase. rng controls the AI's sampling so tests are deterministic.
 */
export function aiTurn(s: BoggleState, rng: RNG = Math.random): BoggleState {
  if (s.phase !== 'play') return s
  const pool = aiFindWords(s.grid, rng)
  return { ...s, aiPool: pool, phase: 'reveal', revealed: 0 }
}

/** Reveal the next AI word (one step of the reveal animation). When all are shown, score. */
export function revealStep(s: BoggleState): BoggleState {
  if (s.phase !== 'reveal') return s
  if (s.revealed >= s.aiPool.length) return scoreRound(s)
  const nextWord = s.aiPool[s.revealed]
  const words: [string[], string[]] = [s.words[0].slice(), s.words[1].slice()]
  words[1] = words[1].concat([nextWord])
  const revealed = s.revealed + 1
  const ns: BoggleState = { ...s, words, revealed }
  return revealed >= s.aiPool.length ? scoreRound(ns) : ns
}

/**
 * Score the current round with the classic shared-word dedupe: any word found by BOTH players
 * scores for neither. Add each side's unique total to its match total, then either advance to
 * the next round (rolling a fresh grid) or, on the last round, decide the winner.
 */
export function scoreRound(s: BoggleState): BoggleState {
  const youSet = new Set(s.words[0])
  const aiSet = new Set(s.words[1])
  let you = 0
  for (const w of youSet) if (!aiSet.has(w)) you += wordScore(w)
  let ai = 0
  for (const w of aiSet) if (!youSet.has(w)) ai += wordScore(w)

  const totals: [number, number] = [s.totals[0] + you, s.totals[1] + ai]

  if (s.round >= s.rounds) {
    const winner = totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1
    return { ...s, totals, phase: 'done', lastRound: { you, ai }, winner }
  }
  return { ...s, totals, phase: 'done', lastRound: { you, ai }, winner: null }
}

/**
 * Begin the next round after a finished one: roll a new grid (or use the supplied one), clear
 * both word lists, and return to the play phase. No-op unless the previous round is 'done' and
 * there's a winner-less round remaining.
 */
export function nextRound(s: BoggleState, grid?: Grid, rng: RNG = Math.random): BoggleState {
  if (s.phase !== 'done' || s.winner != null) return s
  return {
    ...s,
    grid: grid ? grid.slice() : rollGrid(rng),
    words: [[], []],
    round: s.round + 1,
    phase: 'play',
    revealed: 0,
    aiPool: [],
    lastRound: null,
  }
}

/** The game winner: 0 (you), 1 (AI), -1 (tie), or null while in progress. */
export function winner(s: BoggleState): number | null {
  return s.winner
}
