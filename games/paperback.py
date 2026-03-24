"""Paperback - Deck-building word game.

Use letter cards to spell words, earn money to buy better letters.
Build the best deck of letter cards to score the most points.
"""

import random
import itertools

from engine.base import BaseGame, input_with_quit, clear_screen

# Letter cards: (letter, cost, points, copies_in_supply)
COMMON_LETTERS = [
    ("E", 0, 0, 6), ("T", 0, 0, 4), ("A", 0, 0, 4),
    ("O", 0, 0, 3), ("I", 0, 0, 3), ("N", 0, 0, 3),
    ("S", 0, 0, 3), ("R", 0, 0, 3),
]

UNCOMMON_LETTERS = [
    ("L", 3, 1, 3), ("D", 3, 1, 3), ("C", 3, 1, 2),
    ("U", 3, 1, 2), ("M", 4, 1, 2), ("P", 4, 1, 2),
    ("G", 4, 2, 2), ("H", 4, 2, 2), ("B", 5, 2, 2),
    ("F", 5, 2, 2), ("Y", 5, 2, 2), ("W", 5, 2, 2),
]

RARE_LETTERS = [
    ("V", 6, 3, 2), ("K", 6, 3, 2), ("X", 7, 4, 1),
    ("J", 7, 4, 1), ("Q", 8, 5, 1), ("Z", 8, 5, 1),
]

# Simple word list for validation (common 3-7 letter words)
VALID_WORDS = {
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
    "WAS", "ONE", "OUR", "OUT", "DAY", "HAD", "HAS", "HIS", "HOW", "ITS",
    "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "BOY", "DID", "GET",
    "LET", "SAY", "SHE", "TOO", "USE", "DAD", "MOM", "RUN", "SET", "TRY",
    "ASK", "MEN", "RAN", "BIG", "END", "PUT", "TOP", "READ", "HAND",
    "HIGH", "KEEP", "LAST", "LONG", "MAKE", "MUCH", "NAME", "ONLY", "PLAY",
    "WORD", "BACK", "BEEN", "CALL", "CAME", "COME", "EACH", "FIND", "GAVE",
    "GOOD", "HAVE", "HELP", "HERE", "HOME", "JUST", "KNOW", "LIKE", "LINE",
    "LIVE", "LOOK", "MADE", "MANY", "MORE", "MOST", "MOVE", "MUST", "NEED",
    "NEXT", "OPEN", "OVER", "PART", "SAID", "SAME", "SHOW", "SIDE", "SOME",
    "SUCH", "SURE", "TAKE", "TELL", "THAN", "THEM", "THEN", "THEY", "THIS",
    "TIME", "TURN", "UPON", "VERY", "WANT", "WELL", "WENT", "WHAT", "WHEN",
    "WILL", "WITH", "WORK", "YEAR", "YOUR", "ALSO", "AREA", "AWAY", "BEST",
    "BOOK", "BOTH", "CITY", "DOWN", "EVEN", "FACT", "FEEL", "FORM", "GIVE",
    "GOING", "GREAT", "GROUP", "HOUSE", "LARGE", "LATER", "LEARN", "MIGHT",
    "NEVER", "ORDER", "OTHER", "PLACE", "PLANT", "POINT", "RIGHT", "SMALL",
    "SOUND", "SPELL", "STAND", "START", "STILL", "STORY", "STUDY", "THING",
    "THINK", "THREE", "TIMES", "UNDER", "WATER", "WORLD", "WRITE", "YOUNG",
    "BEING", "BLACK", "BROWN", "BUILT", "CHILD", "CLOSE", "COULD", "EARTH",
    "EVERY", "FIRST", "FOUND", "GREEN", "HEARD", "HUMAN", "KNOWN", "LIGHT",
    "MONEY", "MUSIC", "NIGHT", "NORTH", "OFTEN", "PAPER", "POWER", "QUITE",
    "RIVER", "ROUND", "SEVEN", "SHORT", "SINCE", "SOUTH", "STATE", "TABLE",
    "THOSE", "TOTAL", "UNTIL", "USUAL", "VALUE", "VOICE", "WHITE", "WHOLE",
    "ABOVE", "AFTER", "AGAIN", "ALONG", "BEGAN", "BELOW", "BOARD", "BREAK",
    "BRING", "CARRY", "CAUSE", "CLEAR", "COVER", "CROSS", "DRIVE", "EARLY",
    "EIGHT", "ENJOY", "EQUAL", "EXACT", "EXTRA", "FIELD", "FINAL", "FLOOR",
    "FRONT", "HAPPY", "HEART", "HEAVY", "HORSE", "IDEAL", "IMAGE", "ISSUE",
    "LARGE", "LEGAL", "LEVEL", "LOCAL", "MAJOR", "MATCH", "METAL", "MODEL",
    "MONTH", "MOUTH", "MOVED", "OFFER", "PAINT", "PARTY", "PEACE", "PHONE",
    "PIECE", "PLAIN", "PRESS", "PRICE", "PRIME", "PROVE", "QUEEN", "QUICK",
    "RAISE", "RANGE", "REACH", "REPLY", "SCENE", "SERVE", "SHAPE", "SHARE",
    "SHARP", "SIGHT", "SLEEP", "SMILE", "SOLVE", "SPACE", "SPEAK", "SPEND",
    "SPOKE", "STAGE", "STOCK", "STONE", "STORE", "STYLE", "SUGAR", "TEACH",
    "TEETH", "THREW", "TITLE", "TODAY", "TOUCH", "TOWER", "TRADE", "TRAIN",
    "TREAT", "TRIAL", "TRUCK", "TRUST", "TRUTH", "TWICE", "UNION", "UPPER",
    "URBAN", "USAGE", "VALID", "VIDEO", "VISIT", "VITAL", "WATCH", "WHEEL",
    "WOMEN", "WORRY", "WORTH", "WOULD", "WOUND", "WRONG", "WROTE", "YOUTH",
    "ACE", "ACT", "ADD", "AGE", "AGO", "AID", "AIM", "AIR", "ARM", "ART",
    "BAD", "BAG", "BAR", "BAT", "BED", "BIT", "BOX", "BUS", "BUY", "CAR",
    "CUT", "DOG", "DRY", "EAR", "EAT", "EGG", "ERA", "EYE", "FAR", "FAT",
    "FEW", "FIT", "FLY", "FUN", "GAS", "GOD", "GOT", "GUN", "GUY", "HAT",
    "HIT", "HOT", "ICE", "ILL", "JOB", "JOY", "KEY", "KID", "LAW", "LAY",
    "LED", "LEG", "LIE", "LIP", "LOG", "LOT", "LOW", "MAP", "MIX", "MUD",
    "NET", "NOR", "NUT", "ODD", "OIL", "PAY", "PEN", "PET", "PIE", "PIN",
    "POT", "RAW", "RED", "RID", "ROW", "SAD", "SAT", "SEA", "SIT", "SIX",
    "SKI", "SKY", "SON", "SUN", "TAX", "TEN", "TIE", "TIN", "TIP", "TOE",
    "TON", "TOW", "TWO", "VAN", "WAR", "WET", "WIN", "WON", "YES", "YET",
    "ZOO", "GAME", "WARM", "WALK", "TALK", "FAST", "SLOW", "SOFT", "HARD",
    "COLD", "DARK", "DEEP", "FAIR", "FLAT", "FULL", "GOLD", "GRAY", "HALF",
    "KIND", "LATE", "LEFT", "LINK", "LOST", "MARK", "MILE", "MINE", "MISS",
    "NOTE", "PACE", "PAGE", "PAIR", "PALE", "PAST", "PATH", "PEAK", "PICK",
    "PINE", "PINK", "PLAN", "PLOT", "POLE", "POLL", "POOL", "POOR", "PULL",
    "PURE", "PUSH", "RACE", "RAIN", "RANK", "RARE", "RATE", "REAL", "RENT",
    "REST", "RICE", "RICH", "RIDE", "RING", "RISE", "RISK", "ROAD", "ROCK",
    "ROLE", "ROLL", "ROOF", "ROOT", "ROPE", "ROSE", "RULE", "RUSH", "SAFE",
    "SAIL", "SAKE", "SALE", "SALT", "SAND", "SAVE", "SEAL", "SEAT", "SEED",
    "SEEK", "SEEM", "SELF", "SELL", "SEND", "SHIP", "SHOP", "SHOT", "SHUT",
    "SIGN", "SILK", "SINK", "SIZE", "SKIN", "SLIP", "SLOW", "SNOW", "SOIL",
    "SOLE", "SONG", "SOON", "SORT", "SOUL", "SPIN", "SPOT", "STAR", "STAY",
    "STEM", "STEP", "STOP", "SUIT", "SWIM", "TAIL", "TALE", "TALL", "TANK",
    "TAPE", "TASK", "TEAM", "TERM", "TEST", "TEXT", "THIN", "THUS", "TIDE",
    "TILL", "TINY", "TIRE", "TOLL", "TONE", "TOOL", "TOUR", "TOWN", "TRAP",
    "TREE", "TRIP", "TRUE", "TUBE", "TUNE", "TYPE", "UNIT", "USER", "VAST",
    "VIEW", "VOTE", "WAGE", "WAIT", "WAKE", "WALL", "WAVE", "WEAK", "WEAR",
    "WEEK", "WIDE", "WIFE", "WILD", "WINE", "WING", "WIRE", "WISE", "WISH",
    "WOOD", "WOOL", "YARD", "ZONE",
}


def _make_card(letter, cost, points):
    return {"letter": letter, "cost": cost, "points": points}


class PaperbackGame(BaseGame):
    """Paperback - Deck-building word game."""

    name = "Paperback"
    description = "Deck-building word game - spell words to earn money and points"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "coop": "Cooperative Mode",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.supply = []  # Cards available for purchase
        self.hands = {}   # player -> list of cards in hand
        self.decks = {}   # player -> draw pile
        self.discards = {}  # player -> discard pile
        self.scores = {}
        self.coop_score = 0
        self.coop_target = 30
        self.rounds_left = 10
        self.phase = "spell"  # spell, buy
        self.current_word = ""
        self.used_indices = []
        self.earned_money = 0
        self.log = []

    def setup(self):
        # Build supply
        self.supply = []
        for letter, cost, pts, copies in UNCOMMON_LETTERS:
            for _ in range(copies):
                self.supply.append(_make_card(letter, cost, pts))
        for letter, cost, pts, copies in RARE_LETTERS:
            for _ in range(copies):
                self.supply.append(_make_card(letter, cost, pts))
        random.shuffle(self.supply)
        # Keep only top 12 in offer
        self.supply = self.supply[:12]

        for p in [1, 2]:
            sp = str(p)
            # Starting deck: 5 common vowels/consonants + 2 wilds
            starter = []
            for letter, cost, pts, _ in COMMON_LETTERS[:5]:
                starter.append(_make_card(letter, cost, pts))
            starter.append(_make_card("*", 0, 0))  # wild
            starter.append(_make_card("*", 0, 0))  # wild
            random.shuffle(starter)
            self.decks[sp] = starter
            self.hands[sp] = []
            self.discards[sp] = []
            self.scores[sp] = 0
            self._draw_hand(sp)

        self.phase = "spell"
        self.current_word = ""
        self.used_indices = []
        self.earned_money = 0
        self.coop_score = 0
        self.rounds_left = 10
        self.log = ["Game started! Spell words to earn money."]

    def _draw_hand(self, sp):
        """Draw 5 cards into hand."""
        self.hands[sp] = []
        for _ in range(5):
            if not self.decks[sp]:
                if not self.discards[sp]:
                    break
                self.decks[sp] = list(self.discards[sp])
                random.shuffle(self.decks[sp])
                self.discards[sp] = []
            if self.decks[sp]:
                self.hands[sp].append(self.decks[sp].pop())

    def _hand_str(self, sp):
        return " ".join(f"[{i+1}:{c['letter']}]" for i, c in enumerate(self.hands[sp]))

    def _word_value(self, word_len):
        """Money earned = word length."""
        return max(0, word_len - 1)

    def display(self):
        clear_screen()
        coop = self.variation == "coop"
        mode = "Cooperative" if coop else "Standard"
        print(f"{'=' * 60}")
        print(f"  PAPERBACK - {mode} | Rounds left: {self.rounds_left}")
        print(f"{'=' * 60}")

        if coop:
            print(f"  Team Score: {self.coop_score}/{self.coop_target}")
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            pts = self.scores[sp]
            deck_sz = len(self.decks[sp])
            disc_sz = len(self.discards[sp])
            print(f"  {self.players[p-1]}: Points={pts} | Deck={deck_sz} | Discard={disc_sz}{marker}")
        print()

        cp = str(self.current_player)
        print(f"  Your hand: {self._hand_str(cp)}")
        if self.current_word:
            print(f"  Current word: {self.current_word} (cards used: {self.used_indices})")
        print()

        # Show supply
        print("  Supply (buy with earned money):")
        for i, card in enumerate(self.supply[:8]):
            print(f"    [{i+1}] {card['letter']} - Cost: ${card['cost']}, Points: {card['points']}")
        print()

        if self.phase == "spell":
            print("  Phase: SPELL a word using your hand cards")
            print("  (* = wild, can be any letter)")
        else:
            print(f"  Phase: BUY cards (Money earned: ${self.earned_money})")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)

        if self.phase == "spell":
            print("  Commands: type a word using hand letters, 'done' to submit, 'clear' to reset")
            print(f"  Hand: {self._hand_str(cp)}")
            word = input_with_quit("  Spell a word (or 'pass' to skip): ").strip().upper()
            if word == "PASS":
                return {"action": "pass_spell"}
            if word == "CLEAR":
                return {"action": "clear"}
            if word == "DONE":
                return {"action": "submit_word"}
            return {"action": "spell", "word": word}

        elif self.phase == "buy":
            print(f"  Money available: ${self.earned_money}")
            choice = input_with_quit("  Buy card # (or 'done'): ").strip()
            if choice.lower() == "done":
                return {"action": "end_buy"}
            try:
                idx = int(choice) - 1
                return {"action": "buy", "index": idx}
            except ValueError:
                return None
        return None

    def _can_spell(self, word, hand):
        """Check if hand can spell the word (with wilds)."""
        available = [c["letter"] for c in hand]
        wilds = available.count("*")
        needed = list(word)
        remaining = list(available)
        # Remove wilds from remaining
        remaining = [c for c in remaining if c != "*"]

        for ch in needed:
            if ch in remaining:
                remaining.remove(ch)
            elif wilds > 0:
                wilds -= 1
            else:
                return False
        return len(word) <= len(hand)

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "clear":
            self.current_word = ""
            self.used_indices = []
            return True

        if action == "pass_spell":
            self.earned_money = 0
            self.phase = "buy"
            self.log.append(f"{self.players[self.current_player-1]} passed spelling.")
            return True

        if action == "spell":
            word = move["word"]
            if len(word) < 2:
                return False
            if not self._can_spell(word, self.hands[cp]):
                return False
            if word not in VALID_WORDS:
                return False
            self.current_word = word
            self.earned_money = self._word_value(len(word))
            word_pts = sum(c["points"] for c in self.hands[cp])
            self.scores[cp] += word_pts
            if self.variation == "coop":
                self.coop_score += word_pts
            self.log.append(f"{self.players[self.current_player-1]} spelled '{word}' for ${self.earned_money}")
            self.phase = "buy"
            return True

        if action == "submit_word":
            if not self.current_word:
                return False
            return True

        if action == "buy":
            idx = move["index"]
            if idx < 0 or idx >= len(self.supply):
                return False
            card = self.supply[idx]
            if card["cost"] > self.earned_money:
                return False
            self.earned_money -= card["cost"]
            self.discards[cp].append(card)
            self.supply.pop(idx)
            self.log.append(f"{self.players[self.current_player-1]} bought '{card['letter']}' for ${card['cost']}")
            return True

        if action == "end_buy":
            # Discard hand, draw new
            self.discards[cp].extend(self.hands[cp])
            self.hands[cp] = []
            self._draw_hand(cp)
            self.current_word = ""
            self.used_indices = []
            self.earned_money = 0
            self.phase = "spell"
            self.rounds_left -= 1
            self.log.append(f"{self.players[self.current_player-1]} ended turn.")
            return True

        return False

    def check_game_over(self):
        if self.rounds_left <= 0:
            self.game_over = True
            if self.variation == "coop":
                if self.coop_score >= self.coop_target:
                    self.winner = None  # Both win
                    self.log.append(f"Cooperative victory! Score: {self.coop_score}")
                else:
                    self.winner = None
                    self.log.append(f"Fell short. Score: {self.coop_score}/{self.coop_target}")
            else:
                s1, s2 = self.scores["1"], self.scores["2"]
                if s1 > s2:
                    self.winner = 1
                elif s2 > s1:
                    self.winner = 2
                else:
                    self.winner = None
        if len(self.supply) == 0:
            self.game_over = True
            s1, s2 = self.scores["1"], self.scores["2"]
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "supply": self.supply,
            "hands": self.hands,
            "decks": self.decks,
            "discards": self.discards,
            "scores": self.scores,
            "coop_score": self.coop_score,
            "rounds_left": self.rounds_left,
            "phase": self.phase,
            "current_word": self.current_word,
            "used_indices": self.used_indices,
            "earned_money": self.earned_money,
            "log": self.log,
        }

    def load_state(self, state):
        self.supply = state["supply"]
        self.hands = state["hands"]
        self.decks = state["decks"]
        self.discards = state["discards"]
        self.scores = state["scores"]
        self.coop_score = state.get("coop_score", 0)
        self.rounds_left = state["rounds_left"]
        self.phase = state["phase"]
        self.current_word = state.get("current_word", "")
        self.used_indices = state.get("used_indices", [])
        self.earned_money = state.get("earned_money", 0)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  PAPERBACK - Tutorial
============================================================

  OVERVIEW:
  Paperback is a deck-building word game. Use letter cards
  in your hand to spell words. Longer words earn more money
  to buy better letter cards with point values.

  GAMEPLAY:
  1. SPELL: Use letters in your hand to spell a valid word
     - * cards are wilds (any letter)
     - Longer words earn more money (word length - 1)
     - Points come from the point values on your cards

  2. BUY: Spend earned money on new letter cards
     - Better letters cost more but are worth points
     - New cards go to your discard pile

  3. Cards cycle: hand -> discard -> shuffle -> draw

  VARIANTS:
  - Standard: Most points after 10 rounds wins
  - Cooperative: Work together to reach 30 points

  SCORING:
  - Each card has a point value (shown when buying)
  - Total points from all cards used each turn score
============================================================
"""
