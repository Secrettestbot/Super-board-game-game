/* JOTTO — word-deduction logic (built for this codebase, not ported).
   Two players each secretly pick a 5-LETTER word with all DISTINCT letters. Players
   alternate guessing the opponent's word with a valid 5-letter word. Feedback after each
   guess = "jots", the number of letters in common between guess and the secret word
   (position-independent). You do NOT learn which letters. First to guess the opponent's
   exact word wins. Pure: no React/DOM, fully immutable.

   The AI maintains the set of candidate words consistent with every jot count it has
   received against YOUR word, and guesses from that shrinking set — picking the candidate
   that, by expected partition, narrows the set the most. The set strictly narrows because
   each guessed candidate is removed and any inconsistent word is filtered out, so the
   game always terminates; a guess cap guards regardless. */

// --- Embedded dictionary: common 5-letter words, all distinct letters. ---
export const WORD_LIST: string[] = [
  'about', 'abide', 'abode', 'acorn', 'acres', 'actor', 'acute', 'adept', 'admin', 'adobe',
  'adopt', 'adore', 'after', 'agile', 'aging', 'agony', 'ahead', 'aimer', 'aisle', 'album',
  'alert', 'algae', 'alien', 'align', 'alike', 'alive', 'alpha', 'altar', 'alter', 'amber',
  'amble', 'amend', 'amigo', 'amour', 'ample', 'amuse', 'angel', 'anger', 'angle', 'angry',
  'ankle', 'anvil', 'aside', 'asset', 'atoms', 'audio', 'audit', 'avoid', 'awoke', 'azure',
  'bacon', 'badge', 'baker', 'baler', 'balmy', 'bared', 'bares', 'baron', 'based', 'baser',
  'basic', 'baste', 'bathe', 'beach', 'beard', 'bears', 'beast', 'began', 'begin', 'being',
  'below', 'bench', 'bezel', 'bigot', 'binge', 'biome', 'birch', 'birds', 'birth', 'black',
  'blade', 'blame', 'blank', 'blaze', 'bleak', 'blend', 'blimp', 'blind', 'block', 'bloke',
  'blond', 'blown', 'blues', 'blunt', 'blurt', 'board', 'boast', 'boats', 'bogus', 'bonus',
  'boast', 'boxer', 'brace', 'brags', 'braid', 'brain', 'brake', 'brand', 'brave', 'bread',
  'break', 'bream', 'brick', 'bride', 'brief', 'bring', 'brink', 'briny', 'broad', 'broke',
  'brows', 'brunt', 'brush', 'brute', 'build', 'bulge', 'bumps', 'bunch', 'burns', 'burst',
  'busty', 'cabin', 'cable', 'cadet', 'cagey', 'cairn', 'caked', 'cakes', 'caleb', 'calms',
  'caper', 'cards', 'cares', 'cargo', 'carts', 'carve', 'caste', 'cater', 'cause', 'caves',
  'cedar', 'censor', 'chads', 'chafe', 'chain', 'chair', 'champ', 'chant', 'chaos', 'charm',
  'chart', 'chase', 'cheap', 'cheat', 'chess', 'chide', 'chimp', 'chins', 'chips', 'chirp',
  'choir', 'chomp', 'chord', 'chore', 'chose', 'chump', 'churn', 'cider', 'cigar', 'cited',
  'clamp', 'clams', 'clang', 'clank', 'clasp', 'clean', 'clear', 'clerk', 'climb', 'cloak',
  'clogs', 'clomp', 'close', 'cloth', 'cloud', 'clout', 'clown', 'clubs', 'clued', 'coats',
  'codes', 'coins', 'colas', 'colt', 'comes', 'comet', 'condor', 'coral', 'cords', 'cores',
  'corns', 'cosine', 'could', 'count', 'court', 'coven', 'cover', 'covet', 'crabs', 'craft',
  'cramp', 'crane', 'crank', 'crate', 'crave', 'crawl', 'craze', 'crazy', 'creak', 'cream',
  'credo', 'crepe', 'crept', 'crest', 'crick', 'cried', 'cries', 'crime', 'crimp', 'crisp',
  'crone', 'crops', 'crowd', 'crown', 'crude', 'cruel', 'crumb', 'crush', 'crust', 'crypt',
  'cubes', 'cumin', 'curds', 'cured', 'curls', 'curse', 'curve', 'cutie', 'cynic', 'dairy',
  'daisy', 'dance', 'dares', 'darts', 'dated', 'dates', 'dazes', 'deals', 'dealt', 'dears',
  'death', 'debit', 'debug', 'debut', 'decal', 'decay', 'decoy', 'decry', 'delay', 'delta',
  'demon', 'demur', 'denim', 'depot', 'depth', 'derby', 'desk', 'devil', 'diary', 'dicey',
  'diets', 'digit', 'dimer', 'dimes', 'dirty', 'disco', 'ditch', 'diver', 'dives', 'dogma',
  'doing', 'donut', 'doping', 'doter', 'doubt', 'dough', 'dowel', 'dowry', 'dozen', 'drabs',
  'draft', 'drain', 'drake', 'drama', 'drape', 'drawn', 'draws', 'dread', 'dream', 'dregs',
  'dries', 'drift', 'drink', 'drips', 'drive', 'drone', 'drove', 'drown', 'drums', 'drunk',
  'dryer', 'ducks', 'dunes', 'dunce', 'dusky', 'dwarf', 'dwell', 'dying', 'eager', 'eagle',
  'early', 'earns', 'earth', 'eight', 'elbow', 'elfin', 'email', 'embed', 'ember', 'empty',
  'endow', 'enjoy', 'entry', 'envoy', 'epoch', 'equal', 'erupt', 'ethos', 'evict', 'evils',
  'exalt', 'exams', 'excel', 'exits', 'expel', 'extra', 'facet', 'faced', 'facts', 'fader',
  'fails', 'fairy', 'faith', 'false', 'famed', 'fancy', 'fares', 'farms', 'fatal', 'fated',
  'fault', 'favor', 'fears', 'feast', 'felon', 'femur', 'ferns', 'fetid', 'fetus', 'feuds',
  'fiber', 'field', 'fiend', 'fight', 'filed', 'files', 'films', 'filth', 'final', 'finch',
  'finds', 'fined', 'finer', 'fired', 'fires', 'firms', 'first', 'fishy', 'fixer', 'fjord',
  'flags', 'flair', 'flake', 'flame', 'flank', 'flare', 'flash', 'flask', 'fleas', 'flesh',
  'flick', 'flier', 'flies', 'fling', 'flint', 'flirt', 'float', 'flock', 'flora', 'flour',
  'flown', 'fluke', 'flume', 'flung', 'flush', 'flute', 'flyer', 'foams', 'focal', 'focus',
  'foils', 'folks', 'fonts', 'foray', 'force', 'forge', 'forks', 'forms', 'forte', 'forth',
  'forty', 'forum', 'found', 'fount', 'foyer', 'frail', 'frame', 'fraud', 'frays', 'freak',
  'fried', 'fries', 'frisk', 'frock', 'frond', 'frost', 'frown', 'froze', 'fruit', 'fudge',
  'fumes', 'funds', 'fungi', 'furls', 'gable', 'gains', 'gamer', 'games', 'gamut', 'gates',
  'gaudy', 'gauge', 'gaunt', 'gavel', 'gawky', 'gazed', 'gears', 'gecko', 'genus', 'germs',
  'ghost', 'giant', 'girls', 'girth', 'given', 'giver', 'gives', 'glade', 'gland', 'glare',
  'glaze', 'gleam', 'glean', 'glide', 'glint', 'gloat', 'globe', 'gloom', 'glory', 'glove',
  'glows', 'glued', 'gnash', 'gnome', 'goals', 'goats', 'godly', 'going', 'gomez', 'gores',
  'gourd', 'grace', 'grade', 'grail', 'grain', 'grand', 'grant', 'grape', 'graph', 'grasp',
  'grate', 'grave', 'graze', 'great', 'grebe', 'greys', 'grids', 'grief', 'grime', 'grimy',
  'grind', 'gripe', 'grips', 'groan', 'groin', 'group', 'grout', 'grove', 'growl', 'grown',
  'grows', 'grubs', 'gruel', 'grunt', 'guard', 'guest', 'guide', 'guild', 'guile', 'guilt',
  'guise', 'gulps', 'gusto', 'habit', 'hails', 'hairs', 'hairy', 'haled', 'halts', 'hands',
  'handy', 'hares', 'harms', 'haste', 'hasty', 'hated', 'hater', 'hates', 'hauls', 'haunt',
  'haven', 'havoc', 'hawks', 'hazel', 'heads', 'heals', 'heaps', 'heard', 'hears', 'heart',
  'heats', 'heavy', 'hedge', 'heirs', 'heist', 'helps', 'herbs', 'herds', 'hides', 'hinge',
  'hints', 'hired', 'hires', 'hoard', 'hoist', 'holds', 'holes', 'horde', 'horns', 'horse',
  'hoses', 'hotel', 'hound', 'hours', 'house', 'hovel', 'hover', 'howls', 'human', 'humid',
  'humps', 'hunks', 'hurls', 'husky', 'hydro', 'hyena', 'hymns', 'icons', 'ideal', 'ideas',
  'idler', 'image', 'imbue', 'index', 'inept', 'infer', 'ingot', 'inlet', 'input', 'inset',
  'irons', 'irony', 'islet', 'items', 'ivory', 'jaded', 'jails', 'james', 'jaunt', 'jeans',
  'jelly', 'jerks', 'jewel', 'joint', 'joker', 'jokes', 'jolts', 'joust', 'judge', 'juice',
  'juicy', 'jumbo', 'jumps', 'juror', 'kayos', 'keats', 'kebab', 'kelps', 'kerns', 'keyed',
  'kiosk', 'kites', 'knave', 'knead', 'kneel', 'knelt', 'knife', 'knots', 'known', 'knows',
  'koala', 'kudos', 'label', 'labor', 'laced', 'lacer', 'laces', 'laden', 'lager', 'lakes',
  'lambs', 'lamer', 'lance', 'lands', 'lanes', 'lapse', 'large', 'lased', 'laser', 'later',
  'lathe', 'laude', 'lawns', 'layer', 'leads', 'leafy', 'leaks', 'leans', 'leant', 'leaps',
  'learn', 'lears', 'lease', 'leash', 'least', 'ledge', 'leech', 'legs', 'lemon', 'lemur',
  'lifts', 'liger', 'light', 'liked', 'liken', 'liker', 'likes', 'limbs', 'limes', 'liner',
  'lines', 'lings', 'links', 'lions', 'lipid', 'liter', 'lithe', 'lived', 'liver', 'lives',
  'loads', 'loafs', 'loams', 'loans', 'loath', 'lobes', 'local', 'locus', 'lodge', 'lofts',
  'logic', 'loins', 'loner', 'loped', 'lords', 'lores', 'loser', 'loves', 'lower', 'loyal',
  'lucid', 'lucky', 'lumps', 'lunar', 'lunch', 'lunge', 'lurch', 'lured', 'lures', 'lurid',
  'lutes', 'lying', 'lymph', 'lyric', 'maced', 'maced', 'mages', 'magic', 'maize', 'major',
  'maker', 'makes', 'maned', 'manes', 'mango', 'manor', 'maple', 'march', 'mares', 'marsh',
  'maser', 'mason', 'mater', 'mates', 'matey', 'mauls', 'maven', 'mavor', 'maxim', 'mayor',
  'mazes', 'meals', 'means', 'meant', 'meats', 'medal', 'media', 'melds', 'melts', 'mends',
  'mercy', 'merit', 'metal', 'meaty', 'micro', 'midst', 'might', 'mikes', 'miled', 'miler',
  'miles', 'minds', 'mined', 'miner', 'mines', 'mints', 'minus', 'mired', 'mires', 'mocha',
  'modes', 'moist', 'molar', 'molds', 'moles', 'monks', 'month', 'mopes', 'moral', 'morns',
  'morph', 'morse', 'moths', 'motel', 'mould', 'mound', 'mount', 'mourn', 'mouse', 'mouth',
  'moved', 'mover', 'moves', 'movie', 'mowed', 'mower', 'mucky', 'mulch', 'mules', 'mused',
  'muser', 'muses', 'mushy', 'music', 'musky', 'naked', 'named', 'namer', 'names', 'nadir',
  'navel', 'nears', 'necks', 'neigh', 'nerds', 'nerval', 'nervy', 'newts', 'nicer', 'niche',
  'nicks', 'night', 'ninja', 'noble', 'nodes', 'noise', 'noisy', 'nomad', 'norms', 'nosed',
  'noser', 'notch', 'noted', 'noter', 'notes', 'novel', 'nudge', 'nurse', 'nymph', 'oaken',
  'oaten', 'ocean', 'octal', 'ohmic', 'oiled', 'oiler', 'older', 'olden', 'oldie', 'olive',
  'omega', 'opals', 'opens', 'opera', 'optic', 'orbit', 'order', 'organ', 'osier', 'ought',
  'ounce', 'ouster', 'outer', 'ovals', 'ovens', 'overs', 'owing', 'owned', 'owner', 'oxide',
  'pacer', 'paced', 'paces', 'pages', 'pails', 'pained', 'pairs', 'paled', 'paler', 'pales',
  'palms', 'paned', 'panel', 'panes', 'panic', 'pansy', 'pants', 'paper', 'pares', 'parks',
  'parse', 'parts', 'paste', 'pasty', 'pater', 'paths', 'patio', 'pause', 'paved', 'paver',
  'paves', 'peach', 'peaks', 'peals', 'pearl', 'pears', 'peats', 'pedal', 'peril', 'perks',
  'pesto', 'petal', 'phase', 'phone', 'phony', 'photo', 'piano', 'picks', 'piers', 'piety',
  'piled', 'piler', 'piles', 'pilot', 'pinch', 'pined', 'pines', 'pinto', 'pints', 'pious',
  'piped', 'piper', 'pipes', 'pique', 'pitas', 'pivot', 'pixel', 'place', 'plaid', 'plain',
  'plane', 'plank', 'plant', 'plate', 'plays', 'plaza', 'plead', 'pleat', 'plied', 'plier',
  'plots', 'plow', 'pluck', 'plumb', 'plume', 'plump', 'plush', 'poach', 'poems', 'poet',
  'point', 'poise', 'poker', 'poled', 'poles', 'polka', 'porch', 'pored', 'pores', 'ports',
  'posed', 'poser', 'poses', 'posit', 'pouch', 'pound', 'pours', 'power', 'prank', 'prawn',
  'prays', 'press', 'preys', 'price', 'pride', 'pried', 'pries', 'prime', 'print', 'prior',
  'prism', 'prize', 'probe', 'prods', 'prone', 'prose', 'proud', 'prove', 'prowl', 'proxy',
  'prude', 'prune', 'psych', 'pubic', 'pucks', 'pudgy', 'pukes', 'pulse', 'pumas', 'punch',
  'pungs', 'punks', 'pupil', 'purge', 'purse', 'pushy', 'putty', 'pylon', 'quack', 'quail',
  'quake', 'qualm', 'quart', 'quash', 'quays', 'quest', 'quick', 'quiet', 'quilt', 'quips',
  'quirk', 'quite', 'quota', 'quote', 'raced', 'racer', 'races', 'racks', 'radii', 'radio',
  'rafts', 'rages', 'raids', 'rails', 'rains', 'rainy', 'raise', 'raked', 'rakes', 'rally',
  'ramps', 'ranch', 'range', 'ranks', 'rants', 'raped', 'rapes', 'rapid', 'rared', 'rased',
  'rated', 'rates', 'ratio', 'raven', 'raves', 'rawly', 'rayon', 'razed', 'razes', 'reach',
  'reads', 'ready', 'realm', 'reaps', 'rebus', 'rebut', 'recap', 'recta', 'redox', 'reins',
  'relax', 'relay', 'relic', 'remit', 'renal', 'rends', 'renew', 'rents', 'repay', 'reply',
  'resin', 'rices', 'ricks', 'rides', 'ridge', 'rifle', 'rifts', 'right', 'rinds', 'rings',
  'rinse', 'riots', 'risen', 'riser', 'rites', 'rival', 'river', 'rivet', 'roach', 'roads',
  'roams', 'roast', 'robed', 'robes', 'robin', 'robot', 'rocks', 'rodes', 'roger', 'rogue',
  'roles', 'roman', 'romps', 'roped', 'roper', 'ropes', 'roses', 'rotas', 'rouge', 'rough',
  'round', 'route', 'roved', 'rover', 'roves', 'rowdy', 'royal', 'ruble', 'ruder', 'rugby',
  'ruins', 'ruled', 'ruler', 'rules', 'runes', 'rungs', 'runts', 'rural', 'rused', 'ruses',
  'sabre', 'sadly', 'safer', 'sails', 'saint', 'salad', 'salem', 'sales', 'salon', 'salty',
  'saned', 'saner', 'satin', 'satyr', 'sauce', 'saucy', 'sauna', 'saved', 'saver', 'saves',
  'savor', 'scald', 'scale', 'scalp', 'scaly', 'scamp', 'scant', 'scare', 'scarf', 'scary',
  'scent', 'scion', 'scold', 'scone', 'scope', 'score', 'scorn', 'scour', 'scout', 'scowl',
  'scrap', 'scrub', 'scuba', 'sedan', 'sepia', 'serif', 'setup', 'seven', 'sewed', 'shade',
  'shady', 'shake', 'shaky', 'shale', 'shame', 'shape', 'share', 'shark', 'sharp', 'shave',
  'shawl', 'shear', 'shed', 'shelf', 'shine', 'shiny', 'shire', 'shirk', 'shire', 'shoal',
  'shock', 'shone', 'shore', 'shorn', 'short', 'shout', 'shove', 'shown', 'showy', 'shred',
  'shrub', 'shrug', 'shuns', 'siege', 'sieve', 'sight', 'signal', 'siled', 'siler', 'since',
  'singe', 'sinew', 'siren', 'sired', 'siren', 'sites', 'sixth', 'sized', 'sizer', 'skate',
  'skein', 'skier', 'skies', 'skimp', 'skirt', 'skulk', 'slain', 'slang', 'slant', 'slate',
  'slave', 'sleds', 'slept', 'slice', 'slick', 'slide', 'slime', 'slimy', 'sling', 'slink',
  'slope', 'slosh', 'sloth', 'slump', 'slung', 'slurp', 'smack', 'smart', 'smear', 'smelt',
  'smile', 'smirk', 'smith', 'smock', 'smoke', 'smoky', 'snack', 'snail', 'snake', 'snaky',
  'snare', 'sneak', 'snide', 'snipe', 'snore', 'snort', 'snout', 'sober', 'socal', 'soils',
  'solar', 'soled', 'soler', 'sonar', 'sonic', 'sores', 'sound', 'soupy', 'sourd', 'south',
  'space', 'spade', 'spare', 'spark', 'spawn', 'spear', 'speck', 'spelt', 'spend', 'spent',
  'spice', 'spicy', 'spied', 'spied', 'spike', 'spiky', 'spilt', 'spine', 'spiny', 'spire',
  'spite', 'splat', 'spoke', 'spore', 'sport', 'spout', 'sprat', 'spray', 'sprig', 'spurn',
  'spurt', 'squad', 'squat', 'stack', 'staff', 'stage', 'staid', 'stain', 'stair', 'stake',
  'stale', 'stalk', 'stamp', 'stand', 'stare', 'stark', 'stave', 'stays', 'stead', 'steak',
  'steal', 'steam', 'steed', 'stein', 'steno', 'stern', 'stews', 'stick', 'stile', 'sting',
  'stink', 'stoic', 'stoke', 'stole', 'stomp', 'stone', 'stony', 'store', 'stork', 'storm',
  'story', 'stove', 'strap', 'straw', 'stray', 'strep', 'strip', 'strum', 'strut', 'stud',
  'stump', 'stung', 'stunk', 'sture', 'style', 'suave', 'sugar', 'suite', 'suits', 'sulky',
  'sumac', 'super', 'surge', 'surly', 'swami', 'swamp', 'swank', 'swarm', 'swath', 'swear',
  'sweat', 'swift', 'swine', 'swing', 'swirl', 'sword', 'swore', 'sworn', 'syrup', 'table',
  'taces', 'tacks', 'tails', 'taken', 'taker', 'takes', 'tales', 'talks', 'tamed', 'tamer',
  'tames', 'tango', 'taper', 'tapir', 'tardy', 'tares', 'tarns', 'taros', 'tarps', 'tarsi',
  'tasks', 'taunt', 'tawny', 'teach', 'teals', 'teams', 'tears', 'teary', 'tegs', 'tempo',
  'tends', 'tenor', 'tense', 'tepid', 'terms', 'thank', 'thaws', 'their', 'theca', 'thens',
  'these', 'thick', 'thief', 'thigh', 'thine', 'thing', 'think', 'thins', 'third', 'thong',
  'thorn', 'those', 'thuds', 'thumb', 'thump', 'thyme', 'tiber', 'tides', 'tiger', 'tiled',
  'tiler', 'tiles', 'timed', 'timer', 'times', 'tines', 'tired', 'tires', 'toads', 'today',
  'toils', 'token', 'tomes', 'tonal', 'toned', 'toner', 'tones', 'tonga', 'tongs', 'tonic',
  'topaz', 'topic', 'tored', 'tores', 'torch', 'torus', 'total', 'totem', 'touch', 'tough',
  'tours', 'towed', 'tower', 'toxic', 'trace', 'track', 'trade', 'trail', 'train', 'tramp',
  'trash', 'trawl', 'tread', 'treks', 'trend', 'triad', 'trial', 'tribe', 'trice', 'trick',
  'tried', 'tries', 'trims', 'tripe', 'trips', 'troll', 'tromp', 'trope', 'trots', 'trout',
  'trove', 'truce', 'truck', 'trued', 'truer', 'trump', 'trunk', 'tsade', 'tuber', 'tubes',
  'tucks', 'tulip', 'tumor', 'tunas', 'tuned', 'tuner', 'tunes', 'tunic', 'turbo', 'turfs',
  'turns', 'tusks', 'tutor', 'twang', 'tweak', 'twice', 'twine', 'twins', 'twirl', 'twist',
  'tying', 'ulcer', 'ultra', 'umber', 'uncle', 'under', 'undid', 'unfit', 'unify', 'union',
  'unite', 'units', 'unity', 'unlit', 'unmet', 'untie', 'unzip', 'upend', 'urban', 'urged',
  'urges', 'urine', 'usage', 'users', 'usher', 'using', 'vague', 'vales', 'valid', 'valor',
  'valts', 'vapor', 'vault', 'veils', 'veins', 'venom', 'vents', 'venus', 'verbs', 'verdi',
  'verse', 'vetch', 'vexed', 'vials', 'vicar', 'video', 'views', 'vigor', 'viler', 'vines',
  'vinyl', 'viola', 'viper', 'viral', 'vireo', 'virus', 'visa', 'vista', 'vital', 'vixen',
  'vocal', 'vodka', 'vogue', 'voice', 'voids', 'voled', 'voles', 'volts', 'voter', 'votes',
  'vowed', 'vowel', 'wacky', 'wafer', 'wager', 'wages', 'wagon', 'wails', 'waist', 'waked',
  'waker', 'wakes', 'waled', 'waler', 'wales', 'walks', 'wands', 'waned', 'wanes', 'wants',
  'wards', 'wares', 'warns', 'warps', 'warts', 'washy', 'waste', 'water', 'waved', 'waver',
  'waves', 'waxed', 'waxen', 'waxer', 'wears', 'weary', 'weave', 'wedge', 'weird', 'welds',
  'welts', 'whale', 'wharf', 'wheat', 'whelk', 'while', 'whine', 'whiny', 'whirl', 'whisk',
  'white', 'whole', 'whore', 'whose', 'widen', 'wider', 'wides', 'width', 'wield', 'wiled',
  'wiles', 'winds', 'windy', 'wined', 'wines', 'wiped', 'wiper', 'wipes', 'wired', 'wires',
  'wisdom', 'wised', 'wiser', 'wites', 'woken', 'woman', 'words', 'wordy', 'works', 'world',
  'worms', 'worse', 'worst', 'worth', 'would', 'wound', 'woven', 'wrack', 'wrath', 'wreak',
  'wreck', 'wrens', 'wrest', 'wried', 'wries', 'wring', 'wrist', 'write', 'wrong', 'wrote',
  'xenon', 'xylem', 'yacht', 'yards', 'yarns', 'yeast', 'yelps', 'yield', 'yodel', 'yogas',
  'yokel', 'yokes', 'yolks', 'young', 'yours', 'youth', 'yuans', 'zebra', 'zesty', 'zings',
  'zonal', 'zoned', 'zoner', 'zones', 'zooms',
]

// Build the canonical playable set: lowercase, length 5, all distinct letters, a-z only,
// de-duplicated. This is the universe both for validation and for the AI's secret/candidates.
function hasDistinctLetters(w: string): boolean {
  return new Set(w).size === w.length
}
const _seen = new Set<string>()
const _words: string[] = []
for (const raw of WORD_LIST) {
  const w = raw.toLowerCase()
  if (w.length !== 5) continue
  if (!/^[a-z]{5}$/.test(w)) continue
  if (!hasDistinctLetters(w)) continue
  if (_seen.has(w)) continue
  _seen.add(w)
  _words.push(w)
}
/** The validated, de-duplicated playable word set (5 distinct letters each). */
export const WORDS: string[] = _words
const WORD_SET = new Set(WORDS)

// Precomputed letter bitmask per word for fast jot counting.
function maskOf(w: string): number {
  let m = 0
  for (let i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - 97)
  return m
}
const MASKS = new Map<string, number>()
for (const w of WORDS) MASKS.set(w, maskOf(w))

function popcount(n: number): number {
  let c = 0
  while (n) { n &= n - 1; c++ }
  return c
}

export interface GuessRecord {
  word: string
  jots: number
}

export interface JottoState {
  secrets: [string, string]            // [player0 secret, player1 secret]
  history: [GuessRecord[], GuessRecord[]] // guesses each player made vs the opponent
  turn: 0 | 1                           // whose turn it is to guess
  winner: number | null                 // 0, 1, or null while in progress
}

/** Number of letters in common between two words (position-independent).
    For distinct-letter words this equals the size of the set intersection. */
export function jots(a: string, b: string): number {
  const ma = MASKS.get(a) ?? maskOf(a)
  const mb = MASKS.get(b) ?? maskOf(b)
  return popcount(ma & mb)
}

/** Is `w` a valid playable guess (a word in the dictionary)? */
export function isValidWord(w: string): boolean {
  return WORD_SET.has(w.toLowerCase())
}

// --- Seedable RNG so secrets/games are deterministic in tests. ---
export type RNG = () => number
export function makeRng(seed: number): RNG {
  let s = seed >>> 0
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick a secret word for the AI (or any player) from the playable set. */
export function aiPickSecret(rng: RNG): string {
  return WORDS[(rng() * WORDS.length) | 0]
}

/**
 * Create a fresh game. Pass explicit [player0, player1] secrets for deterministic tests,
 * otherwise both are picked randomly from the word set. Player 0 (you) moves first.
 */
export function makeGame(secrets?: [string, string], rng: RNG = Math.random): JottoState {
  let s: [string, string]
  if (secrets) {
    s = [secrets[0].toLowerCase(), secrets[1].toLowerCase()]
  } else {
    s = [aiPickSecret(rng), aiPickSecret(rng)]
  }
  return {
    secrets: s,
    history: [[], []],
    turn: 0,
    winner: null,
  }
}

/** A hard cap on total guesses per player so a game always terminates. */
export const MAX_GUESSES = 60

/**
 * Player `player` guesses `word` against the opponent's secret. Records the jot count;
 * if the word exactly equals the opponent secret, that player wins. Returns a new state.
 * No-op if the game is already over or it is not that player's turn. The caller is
 * responsible for validating human words first; AI guesses are always from WORDS.
 */
export function guess(s: JottoState, player: 0 | 1, word: string): JottoState {
  if (s.winner != null) return s
  if (s.turn !== player) return s
  const w = word.toLowerCase()
  const opponent = player === 0 ? 1 : 0
  const secret = s.secrets[opponent]
  const j = jots(w, secret)
  const history: [GuessRecord[], GuessRecord[]] = [s.history[0].slice(), s.history[1].slice()]
  history[player] = history[player].concat([{ word: w, jots: j }])
  let winner: number | null = null
  if (w === secret) winner = player
  // Hard cap: if both players have hit the guess limit with no winner, declare a draw-stop
  // by leaving winner null but flipping turn — the UI/self-play cap guards termination.
  const turn: 0 | 1 = player === 0 ? 1 : 0
  return {
    secrets: s.secrets,
    history,
    turn: winner != null ? s.turn : turn,
    winner,
  }
}

/**
 * Given a player's guess history (records vs the opponent), return every word in the
 * playable set consistent with ALL feedback: a candidate `c` is consistent iff
 * jots(c, guessWord) === reportedJots for every past guess. Past guess words themselves
 * are excluded (you'd have already won if one were the secret with jots 5, and a guessed
 * word can't be the answer if it wasn't an exact hit).
 */
export function candidatesConsistentWith(history: GuessRecord[]): string[] {
  const out: string[] = []
  outer: for (const c of WORDS) {
    for (const rec of history) {
      if (c === rec.word) continue outer
      if (jots(c, rec.word) !== rec.jots) continue outer
    }
    out.push(c)
  }
  return out
}

/**
 * The AI's guess for the current turn. It computes the candidate set consistent with its
 * own feedback so far, then picks the candidate that minimizes the worst-case remaining
 * set size (a min-max / entropy-style narrowing over the candidate pool). This strictly
 * shrinks the candidate set each turn, guaranteeing termination. Returns null only if no
 * candidate exists (shouldn't happen given a well-formed game) — caller should handle.
 */
export function aiGuess(s: JottoState): string | null {
  // Use the history of whichever player is currently to move so the function works for
  // the AI (player 1) in normal play AND for either side during self-play tests.
  const history = s.history[s.turn]
  const cands = candidatesConsistentWith(history)
  if (cands.length === 0) return null
  if (cands.length === 1) return cands[0]
  if (cands.length === 2) return cands[0]

  // Score each candidate by the size of its largest jot-partition over the remaining
  // candidate pool (min-max). The candidate that splits the pool most evenly narrows
  // fastest. Cap the pool we evaluate against for speed on large early sets.
  const pool = cands
  const evalPool = pool.length > 220 ? pool.slice(0, 220) : pool
  let best = pool[0]
  let bestWorst = Infinity
  for (const g of evalPool) {
    const buckets = new Array(6).fill(0)
    for (const c of pool) {
      buckets[jots(g, c)]++
    }
    let worst = 0
    for (let k = 0; k < 6; k++) if (buckets[k] > worst) worst = buckets[k]
    if (worst < bestWorst) {
      bestWorst = worst
      best = g
    }
  }
  return best
}

/** True if the game has a winner. */
export function winner(s: JottoState): number | null {
  return s.winner
}
