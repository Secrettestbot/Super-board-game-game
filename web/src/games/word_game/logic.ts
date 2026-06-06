/* WORD DUEL — Wordle-style 5-letter deduction RACE (built for this codebase, not ported).
   ONE hidden secret 5-letter word is shared by both racers. You (player 0) and the AI
   (player 1) ALTERNATE guessing valid 5-letter dictionary words. After each guess you get
   per-letter Wordle FEEDBACK: GREEN = right letter & position, YELLOW = letter is in the
   word but wrong position, GREY = letter not in the word (with correct duplicate-letter
   handling). The FIRST racer to guess the secret EXACTLY wins; if both hit the guess cap
   with no solve, the racer with more greens (across their final-ish progress) wins, else a
   draw. Pure: no React/DOM, fully immutable.

   The AI keeps the set of dictionary words consistent with EVERY piece of its own feedback
   so far (filter by all green/yellow/grey constraints) and guesses from that strictly
   shrinking set, preferring the candidate that splits the remaining set most evenly
   (a min-max / entropy-style narrowing). It never peeks at the secret beyond its feedback.
   Because each guess is removed and inconsistent words are filtered out, the set strictly
   narrows and the game always terminates; a hard cap guards regardless. */

// --- Embedded dictionary: common 5-letter words. Hardcoded blob. ---
const WORD_BLOB =
  'about above abuse actor acute admit adopt adore adult after again agent agree ahead alarm ' +
  'album alert alike alive allow alone along alter among anger angle angry apart apple apply ' +
  'arena argue arise armor array arrow aside asset audio audit avoid award aware awful badge ' +
  'badly baker bases basic basis beach beard beast began begin begun being below bench berry ' +
  'birth black blade blame blank blast blaze bleed blend bless blind block blood bloom blown ' +
  'blues blunt board boast bonus boost booth bound brace brain brake brand brave bread break ' +
  'breed brick bride brief bring broad broke brook brown brush build built bunch burns burst ' +
  'buyer cabin cable cache camel candy cargo carry carve catch cause cease chain chair chalk ' +
  'chaos charm chart chase cheap cheat check cheek cheer chess chest chief child chill china ' +
  'chips choir chord chose civic civil claim clamp clash class clean clear clerk click cliff ' +
  'climb cloak clock clone close cloth cloud clown clubs coach coast cobra cocoa colon color ' +
  'comet comic coral couch could count court cover crack craft crane crash crawl crazy cream ' +
  'creek creep crest crime crisp cross crowd crown crude cruel crumb crush crust curve cyber ' +
  'cycle daily dairy daisy dance dated dealt death debut decay defer delay delta dense depot ' +
  'depth derby devil diary digit dimes diner dirty disco ditch dive dized dodge doing donor ' +
  'doubt dough dozen draft drain drama drank dread dream dress dried drift drill drink drive ' +
  'drone drops drove drown drums drunk dryer dusty dutch dwarf dwell eager eagle early earth ' +
  'eaten ebony edged eight elbow elder elect elite email empty enact ended enemy enjoy enter ' +
  'entry equal error essay event every exact exalt exams excel exert exist extra fable faced ' +
  'facts fairy faith false fancy fatal fault favor feast fence ferry fetch fever fewer fiber ' +
  'field fiery fifth fifty fight filed films final finch finer first fixed flag flame flank ' +
  'flash fleet flesh flick fling flint float flock flood floor flora flour flown fluid flush ' +
  'flute focal focus folks force forge forms forth forty forum found frame frank fraud freak ' +
  'fresh fried fries frost frown fruit fudge fully funny gains gamer games gauge gaunt gavel ' +
  'gazed gears gecko geese genre ghost giant gifts girls given giver gives gland glare glass ' +
  'gleam glide globe gloom glory glove glows going goods goose grace grade grain grand grant ' +
  'grape graph grasp grass grave gravy graze great greed green greet grief grill grime grind ' +
  'gripe groan groin groom group grove growl grown grows guard guess guest guide guild guilt ' +
  'gulls habit hairs hairy halls halve handy happy hardy harsh haste hatch haunt haven havoc ' +
  'heads heard heart heath heavy hedge hefty heist hello hence herbs hicks hills hinge hippo ' +
  'hired hoard hobby holds holes holly homes honey honor hoped horde horns horse hotel hound ' +
  'hours house hover human humid humor hurry icons ideal idiom idiot image inbox index inert ' +
  'infer inner input intro irate irony issue itchy ivory jeans jelly jewel joint joker jokes ' +
  'jolly judge juice juicy jumbo jumps kayak keeps kicks kills kinds kings knack knees knelt ' +
  'knife knock known koala label labor laden lakes lance lands lanes lapse large laser later ' +
  'laugh layer leads leaf leak leant leaps learn lease least leave ledge legal lemon level ' +
  'lever light liked liken likes limbs limit lined linen liner lions liver lives lobby local ' +
  'locks lodge lofty logic loops loose lorry loser louse lover lower lucid lucky lunar lunch ' +
  'lungs lured lyric macho macro madam magic major maker mango maple march marsh match mates ' +
  'mayor meals means meant medal media melon mercy merge merit merry messy metal meter midst ' +
  'might minds miner minor minus mixed model moist money month moods moral moter motor motto ' +
  'mound mount mourn mouse mouth moved mover moves movie mucky mucus muddy mummy mural music ' +
  'naive naked named names nasal nasty naval needs nerve never newer newly nicer niche niece ' +
  'night ninja ninth noble nodes noise noisy nomad north nosey notch noted notes novel nurse ' +
  'nylon oasis occur ocean offer often olive onion onset opens opera optic orbit order organ ' +
  'other otter ought ounce outer owned owner oxide ozone packs pages pains paint pairs panel ' +
  'panic paper parks party pasta paste patch paths patio pause peace peach pearl pedal peers ' +
  'penny perch peril petal petty phase phone photo piano picks piece piers piety pilot pinch ' +
  'pines pings pious pipes pitch pivot pixel pizza place plain plane plank plant plate plaza ' +
  'plead pleat plots plumb plump plush poems poet point poise poker polar poles polls pools ' +
  'porch pored ports posed poses posts pouch pound pours power press price pride prime print ' +
  'prior prism prize probe prone proof props proud prove prowl proxy prune psalm pubic pulls ' +
  'pulse punch pupil puppy purer purge purse pussy quack quail quake qualm quart quasi queen ' +
  'query quest queue quick quiet quill quilt quirk quite quota quote racks radar radio rails ' +
  'rainy raise rally ranch range ranks rapid rated rates ratio raven razor reach react ready ' +
  'realm rebel recap refer reign relax relay renew repay reply reset resin retro rhino rhyme ' +
  'rider ridge rifle right rigid rings rinse ripen risen risky rival river roads roast robes ' +
  'robin robot rocks rocky rogue roles roman rooms roots ropes roses rough round route royal ' +
  'rugby ruins ruler rules rural rusty sadly safer saint salad sales salon salsa salty sandy ' +
  'sauce sauna saved saves savor scale scalp scare scarf scary scene scent scoop scope score ' +
  'scorn scout scrap screw scrub seals seats seeds seeks seize sells sense serve seven sewer ' +
  'shade shady shaft shake shaky shall shame shape share shark sharp shave sheds sheep sheer ' +
  'sheet shelf shell shift shine shiny ships shirt shock shoes shook shoot shops shore short ' +
  'shots shout shown shows shrub shrug sided siege sight sigma signs silly since sinks sites ' +
  'sixth sixty sized sizes skate skill skirt skull slack slain slang slate slave sleek sleep ' +
  'sleet slept slice slick slide slime slope slots slump small smart smash smell smile smith ' +
  'smoke smoky snack snail snake snaky snare sneak snipe snore snowy soapy sober solar solid ' +
  'solve sonar sonic sorry sorts souls sound soups south space spade spank spare spark spawn ' +
  'speak spear speck speed spell spend spent sperm spice spicy spike spill spine spins spire ' +
  'spite split spoil spoke spoon sport spots spout spray spree sprig spurt squad squat squid ' +
  'stack staff stage stain stair stake stale stalk stall stamp stand stare stark start stash ' +
  'state stays steak steal steam steel steep steer stems steps stern stick stiff still sting ' +
  'stink stock stole stomp stone stood stool stoop store stork storm story stout stove strap ' +
  'straw stray strip strut stuck study stuff stump stung stunt style suave sugar suite sunny ' +
  'super surge sushi swamp swarm swear sweat sweep sweet swell swept swift swing swirl swiss ' +
  'sword swore sworn syrup table taboo tacit tacks taken takes tales talks tally tamed tango ' +
  'tanks tapes tardy tarot taste tasty taxes teach teams tears tease teddy teeth tempo tends ' +
  'tenor tense tenth terms terra tests texts thank theft their theme there these thick thief ' +
  'thigh thing think third those three threw throw thumb thump tidal tides tiger tight tiles ' +
  'timer times timid tired title toast today token tonal toner tones tools tooth topic torch ' +
  'total touch tough tours towel tower towns toxic trace track trade trail train trait tramp ' +
  'trash tread treat trend trial tribe trick tried tries trims trips troop trout truce truck ' +
  'truly trump trunk trust truth tubes tulip tumor tunes turbo turns tutor twang tweak tweet ' +
  'twice twins twist tying ulcer ultra uncle under undid undue unfit union unite unity until ' +
  'upper upset urban urged urges usage users using usual vague valid valor value valve vapor ' +
  'vault vegan veins venom verge verse video views villa vinyl viola viper viral virus visit ' +
  'visor vista vital vivid vocal vodka vogue voice voted voter votes vouch vowel wafer wager ' +
  'wages wagon waist waits waive waked wakes walks walls waltz wands waned wants wards wares ' +
  'warns warts waste watch water waved waver waves weary weave wedge weeds weeks weigh weird ' +
  'wells whale wharf wheat wheel where which while whine whirl whisk white whole whoop whose ' +
  'widen wider widow width wield wills winds windy wines wings wiped wiper wipes wired wires ' +
  'witch witty wives woken woman women woods woody words wordy works world worms worry worse ' +
  'worst worth would wound woven wrack wrath wreck wrist write wrong wrote yacht yards yarns ' +
  'yeast yield young yours youth zebra zonal zones'

// Build the canonical playable set: lowercase, length 5, a-z only, de-duplicated.
const _seen = new Set<string>()
const _words: string[] = []
for (const raw of WORD_BLOB.split(/\s+/)) {
  const w = raw.toLowerCase()
  if (w.length !== 5) continue
  if (!/^[a-z]{5}$/.test(w)) continue
  if (_seen.has(w)) continue
  _seen.add(w)
  _words.push(w)
}
/** The validated, de-duplicated playable word set (length 5, a-z). */
export const WORD_LIST: string[] = _words
const WORD_SET = new Set(WORD_LIST)

// --- Feedback colors ---
export type Color = 'green' | 'yellow' | 'grey'

export interface GuessRecord {
  word: string
  feedback: Color[] // length 5, per-letter
}

export interface WordGameState {
  secret: string
  history: [GuessRecord[], GuessRecord[]] // [player0 guesses, player1 (AI) guesses]
  turn: 0 | 1 // whose turn it is to guess
  winner: number | null // 0, 1, or null while in progress (-1 marks a settled draw)
}

/** A hard cap on guesses PER PLAYER so a game always terminates. */
export const MAX_GUESSES = 9

/**
 * Wordle per-letter coloring with correct duplicate-letter handling: greens are assigned
 * first; then yellows are handed out left-to-right limited by the remaining count of each
 * letter in the secret, so a guessed letter that appears more times than it does in the
 * secret gets grey for the surplus occurrences. Returns an array of 5 Colors.
 */
export function feedback(guess: string, secret: string): Color[] {
  const g = guess.toLowerCase()
  const s = secret.toLowerCase()
  const res: Color[] = ['grey', 'grey', 'grey', 'grey', 'grey']
  // Count remaining secret letters after removing exact (green) matches.
  const remaining: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (g[i] === s[i]) {
      res[i] = 'green'
    } else {
      remaining[s[i]] = (remaining[s[i]] ?? 0) + 1
    }
  }
  // Assign yellows left-to-right where the letter still has remaining count.
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'green') continue
    const ch = g[i]
    if ((remaining[ch] ?? 0) > 0) {
      res[i] = 'yellow'
      remaining[ch]--
    }
  }
  return res
}

/** Is `w` a valid playable guess (a word in the dictionary)? Case-insensitive. */
export function isValidWord(w: string): boolean {
  return WORD_SET.has(w.toLowerCase())
}

/** True iff `a` and `b` are the same length-5 color pattern. */
function sameFeedback(a: Color[], b: Color[]): boolean {
  for (let i = 0; i < 5; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Every dictionary word consistent with ALL the feedback in `history`: a candidate `c` is
 * consistent iff, for every past guess record, feedback(record.word, c) === record.feedback.
 * (i.e. if the secret were `c`, every past guess would have produced exactly the feedback we
 * actually saw.) Past exact-solve words are naturally excluded. This is the AI's deduction.
 */
export function candidatesFor(history: GuessRecord[]): string[] {
  const out: string[] = []
  outer: for (const c of WORD_LIST) {
    for (const rec of history) {
      if (!sameFeedback(feedback(rec.word, c), rec.feedback)) continue outer
    }
    out.push(c)
  }
  return out
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

/** Pick a secret word from the playable set. */
export function pickSecret(rng: RNG): string {
  return WORD_LIST[(rng() * WORD_LIST.length) | 0]
}

/**
 * Create a fresh game. Pass an explicit secret for deterministic tests, otherwise one is
 * picked at random. Player 0 (you) moves first. The SAME secret is shared by both racers.
 */
export function makeGame(secret?: string, rng: RNG = Math.random): WordGameState {
  const sec = secret ? secret.toLowerCase() : pickSecret(rng)
  return {
    secret: sec,
    history: [[], []],
    turn: 0,
    winner: null,
  }
}

/** Count greens a player has achieved in their best (last) row, for draw tie-breaking. */
function bestGreens(history: GuessRecord[]): number {
  let best = 0
  for (const rec of history) {
    let g = 0
    for (const c of rec.feedback) if (c === 'green') g++
    if (g > best) best = g
  }
  return best
}

/**
 * Player `player` guesses `word`. Records the per-letter feedback against the shared secret;
 * if the word exactly equals the secret, that player wins. If, after this guess, BOTH players
 * have hit MAX_GUESSES with no solve, the game is settled: winner = the racer with more
 * greens, or -1 for a draw. Returns a new state. No-op if the game is over or out of turn.
 * The caller validates human words first; AI guesses are always from WORD_LIST.
 */
export function guess(s: WordGameState, player: 0 | 1, word: string): WordGameState {
  if (s.winner != null) return s
  if (s.turn !== player) return s
  const w = word.toLowerCase()
  const fb = feedback(w, s.secret)
  const history: [GuessRecord[], GuessRecord[]] = [s.history[0].slice(), s.history[1].slice()]
  history[player] = history[player].concat([{ word: w, feedback: fb }])

  let winner: number | null = null
  if (w === s.secret) {
    winner = player
  } else if (history[0].length >= MAX_GUESSES && history[1].length >= MAX_GUESSES) {
    // Both racers exhausted with no solve -> settle by greens, else draw (-1).
    const g0 = bestGreens(history[0])
    const g1 = bestGreens(history[1])
    winner = g0 > g1 ? 0 : g1 > g0 ? 1 : -1
  }

  const nextTurn: 0 | 1 = player === 0 ? 1 : 0
  return {
    secret: s.secret,
    history,
    turn: winner != null ? s.turn : nextTurn,
    winner,
  }
}

/**
 * The AI's guess for the current turn. It computes the candidate set consistent with its own
 * feedback so far, then — when the set is still large — picks the candidate that minimizes the
 * worst-case remaining bucket size under Wordle feedback (a min-max split heuristic). This
 * strictly shrinks the candidate set each turn, guaranteeing termination. Returns null only if
 * no candidate exists (shouldn't happen for a well-formed game).
 *
 * Works for whichever player is currently to move (uses s.history[s.turn]) so self-play tests
 * can drive both sides. The AI never reads s.secret — only its own feedback history.
 */
export function aiGuess(s: WordGameState): string | null {
  const history = s.history[s.turn]
  const cands = candidatesFor(history)
  if (cands.length === 0) return null
  if (cands.length <= 2) return cands[0]

  // Encode each color pattern as a base-3 key for bucketing.
  function key(fb: Color[]): number {
    let k = 0
    for (let i = 0; i < 5; i++) {
      k = k * 3 + (fb[i] === 'green' ? 2 : fb[i] === 'yellow' ? 1 : 0)
    }
    return k
  }

  // Cap the pool we evaluate against for speed on large early sets.
  const evalPool = cands.length > 250 ? cands.slice(0, 250) : cands
  let best = cands[0]
  let bestWorst = Infinity
  for (const g of evalPool) {
    const buckets = new Map<number, number>()
    let worst = 0
    for (const c of cands) {
      const k = key(feedback(g, c))
      const n = (buckets.get(k) ?? 0) + 1
      buckets.set(k, n)
      if (n > worst) worst = n
    }
    if (worst < bestWorst) {
      bestWorst = worst
      best = g
    }
  }
  return best
}

/** The winner: 0, 1, -1 (draw) or null while in progress. */
export function winner(s: WordGameState): number | null {
  return s.winner
}
