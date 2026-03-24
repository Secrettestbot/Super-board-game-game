"""Codenames Duet - Cooperative 2-player word guessing game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
DIM = '\033[2m'
WHITE = '\033[97m'
BG_GREEN = '\033[42m'
BG_RED = '\033[41m'
BG_YELLOW = '\033[43m'

WORD_LIST = [
    "AFRICA", "AGENT", "AIR", "ALIEN", "ALPS", "AMAZON", "ANGEL", "ANT",
    "APPLE", "ARM", "ATLANTIS", "AUSTRALIA", "BACK", "BALL", "BAND", "BANK",
    "BAR", "BAT", "BATTERY", "BEACH", "BEAR", "BEAT", "BED", "BELL",
    "BELT", "BERLIN", "BERRY", "BOARD", "BOLT", "BOMB", "BOND", "BOOM",
    "BOOT", "BOTTLE", "BOW", "BOX", "BRIDGE", "BRUSH", "BUCK", "BUFFALO",
    "BUG", "BUGLE", "BUTTON", "CALF", "CANADA", "CAP", "CAPITAL", "CAR",
    "CARD", "CARROT", "CASINO", "CAST", "CAT", "CELL", "CENTER", "CHAIR",
    "CHANGE", "CHARGE", "CHECK", "CHEST", "CHICK", "CHINA", "CHURCH", "CIRCLE",
    "CLIFF", "CLOAK", "CLUB", "CODE", "COLD", "COMIC", "COMPOUND", "CONCERT",
    "CONDUCTOR", "CONTRACT", "COOK", "COPPER", "COTTON", "COUNT", "COURT", "COVER",
    "CRANE", "CRASH", "CRICKET", "CROSS", "CROWN", "CYCLE", "CZECH", "DANCE",
    "DATE", "DAY", "DEATH", "DECK", "DEGREE", "DIAMOND", "DICE", "DINOSAUR",
    "DISEASE", "DOCTOR", "DOG", "DRAFT", "DRAGON", "DRESS", "DRILL", "DROP",
    "DRUM", "DUCK", "DWARF", "EAGLE", "EGYPT", "ENGINE", "ENGLAND", "EUROPE",
    "EYE", "FACE", "FAIR", "FALL", "FAN", "FENCE", "FIELD", "FIGHTER",
    "FIGURE", "FILE", "FILM", "FIRE", "FISH", "FLY", "FOOT", "FORCE",
    "FOREST", "FORK", "FRANCE", "FROST", "GAME", "GAS", "GENIUS", "GERMANY",
    "GHOST", "GIANT", "GLASS", "GLOVE", "GOLD", "GRACE", "GRASS", "GREECE",
    "GREEN", "GROUND", "GUARD", "GUM", "HAM", "HAND", "HAWK", "HEAD",
    "HEART", "HELICOPTER", "HIDE", "HIT", "HOLE", "HOLLYWOOD", "HONEY", "HOOD",
    "HOOK", "HORN", "HORSE", "HOSPITAL", "HOTEL", "ICE", "IRON", "IVORY",
    "JACK", "JAM", "JET", "JUPITER", "KANGAROO", "KETCHUP", "KEY", "KID",
    "KING", "KIWI", "KNIFE", "KNIGHT", "LAB", "LAP", "LASER", "LAWYER",
    "LEAD", "LEMON", "LEPRECHAUN", "LIFE", "LIGHT", "LIMOUSINE", "LINE", "LINK",
    "LION", "LOCH", "LOCK", "LOG", "LONDON", "LUCK", "MAIL", "MAMMOTH",
]


def _select_words(count):
    return random.sample(WORD_LIST, min(count, len(WORD_LIST)))


class CodenamesDuetGame(BaseGame):
    name = "Codenames Duet"
    description = "Cooperative 2-player word guessing game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard (25 words, 9 turns)',
        'mini': 'Mini (16 words, 7 turns)',
    }

    def setup(self):
        if self.variation == 'mini':
            self.grid_size = 4  # 4x4 = 16
            self.max_turns = 7
            self.num_agents = 5  # per side
            self.num_assassins = 2  # per side
        else:
            self.grid_size = 5  # 5x5 = 25
            self.max_turns = 9
            self.num_agents = 9  # per side
            self.num_assassins = 3  # per side

        total = self.grid_size * self.grid_size
        self.words = _select_words(total)
        self.revealed = [False] * total
        self.turns_left = self.max_turns

        # Generate key cards for each player
        # Player 1's key: which words are agents for P2 to find
        # Player 2's key: which words are agents for P1 to find
        indices = list(range(total))
        random.shuffle(indices)

        self.keys = {1: {}, 2: {}}
        # Some agents are shared between both keys
        shared = min(3, self.num_agents - 2)
        shared_agents = indices[:shared]
        for i in shared_agents:
            self.keys[1][i] = 'agent'
            self.keys[2][i] = 'agent'

        idx = shared
        # Remaining agents for key 1
        for _ in range(self.num_agents - shared):
            self.keys[1][indices[idx]] = 'agent'
            idx += 1
        # Remaining agents for key 2
        for _ in range(self.num_agents - shared):
            self.keys[2][indices[idx]] = 'agent'
            idx += 1
        # Assassins for key 1
        for _ in range(self.num_assassins):
            if idx < len(indices):
                self.keys[1][indices[idx]] = 'assassin'
                idx += 1
        # Assassins for key 2
        for _ in range(self.num_assassins):
            if idx < len(indices):
                self.keys[2][indices[idx]] = 'assassin'
                idx += 1

        self.agents_found = {1: 0, 2: 0}
        self.total_agents_needed = self.num_agents * 2 - shared
        self.clue_phase = True  # True = giving clue, False = guessing
        self._guesses_left = 0

    def _all_agents_found(self):
        for i in range(len(self.words)):
            if not self.revealed[i]:
                if self.keys[1].get(i) == 'agent' or self.keys[2].get(i) == 'agent':
                    return False
        return True

    def display(self):
        cp = self.current_player
        opp = 3 - cp
        gs = self.grid_size

        print(f"\n{'=' * 55}")
        print(f"  CODENAMES DUET  (Cooperative)")
        print(f"  Turns left: {self.turns_left}")
        print(f"  Agents remaining: {self.total_agents_needed - self.agents_found[1] - self.agents_found[2]}")
        print(f"{'=' * 55}")

        # Show grid
        max_word_len = max(len(w) for w in self.words)
        col_width = max(max_word_len + 2, 12)

        # Column headers
        header = "    "
        for c in range(gs):
            header += f" {c+1:^{col_width}}"
        print(header)

        for r in range(gs):
            row_label = chr(ord('A') + r)
            line = f"  {row_label} "
            for c in range(gs):
                idx = r * gs + c
                word = self.words[idx]
                if self.revealed[idx]:
                    # Show result
                    is_agent = (self.keys[1].get(idx) == 'agent' or self.keys[2].get(idx) == 'agent')
                    if is_agent:
                        line += f" {BG_GREEN}{WHITE}{word:^{col_width}}{RESET}"
                    else:
                        line += f" {DIM}{word:^{col_width}}{RESET}"
                else:
                    # Current player can see their own key
                    key_type = self.keys[cp].get(idx, 'bystander')
                    if key_type == 'agent':
                        line += f" {GREEN}{word:^{col_width}}{RESET}"
                    elif key_type == 'assassin':
                        line += f" {RED}{word:^{col_width}}{RESET}"
                    else:
                        line += f" {word:^{col_width}}"
            print(line)

        print(f"\n  {GREEN}Green{RESET}=your agents  {RED}Red{RESET}=assassins  Plain=unknown")
        print(f"  You are {self.players[cp-1]} (giving clue for {self.players[opp-1]} to guess)")

    def get_move(self):
        cp = self.current_player

        if self.clue_phase:
            while True:
                clue = input_with_quit("  Give a one-word clue and number (e.g. 'ANIMAL 3'): ").strip()
                parts = clue.split()
                if len(parts) == 2 and parts[1].isdigit():
                    word = parts[0].upper()
                    count = int(parts[1])
                    if count >= 1:
                        return ('clue', word, count)
                print("  Format: WORD NUMBER (e.g. 'OCEAN 2')")
        else:
            while True:
                raw = input_with_quit("  Guess a word (row col, e.g. 'A 3') or 'pass': ").strip().upper()
                if raw in ('PASS', 'P', 'DONE', 'D'):
                    return ('pass',)
                parts = raw.split()
                if len(parts) == 2:
                    row_ch = parts[0]
                    col_ch = parts[1]
                    if len(row_ch) == 1 and row_ch.isalpha() and col_ch.isdigit():
                        r = ord(row_ch) - ord('A')
                        c = int(col_ch) - 1
                        gs = self.grid_size
                        if 0 <= r < gs and 0 <= c < gs:
                            idx = r * gs + c
                            if not self.revealed[idx]:
                                return ('guess', idx)
                            else:
                                print("  Already revealed!")
                                continue
                print(f"  Format: ROW COL (e.g. 'A 3') or 'pass'")

    def make_move(self, move):
        cp = self.current_player
        opp = 3 - cp

        if move[0] == 'clue':
            clue_word, clue_count = move[1], move[2]
            print(f"\n  Clue: {clue_word} {clue_count}")
            print(f"  {self.players[opp-1]}, it's your turn to guess!")
            self.clue_phase = False
            self._guesses_left = clue_count + 1
            return True  # switch to guesser

        if move[0] == 'guess':
            idx = move[1]
            self.revealed[idx] = True
            word = self.words[idx]

            # Check what was revealed
            is_agent_1 = self.keys[1].get(idx) == 'agent'
            is_agent_2 = self.keys[2].get(idx) == 'agent'
            is_assassin_1 = self.keys[1].get(idx) == 'assassin'
            is_assassin_2 = self.keys[2].get(idx) == 'assassin'

            if is_assassin_1 or is_assassin_2:
                print(f"\n  {RED}ASSASSIN! '{word}' was an assassin!{RESET}")
                self.game_over = True
                self.winner = None  # cooperative loss
                return False

            if is_agent_1 or is_agent_2:
                if is_agent_1:
                    self.agents_found[1] += 1
                if is_agent_2:
                    self.agents_found[2] += 1
                print(f"\n  {GREEN}CORRECT! '{word}' is an agent!{RESET}")
                self._guesses_left -= 1
                if self._guesses_left <= 0:
                    self.clue_phase = True
                    self.turns_left -= 1
                    return True  # switch back to clue giver
                return False  # keep guessing
            else:
                print(f"\n  {YELLOW}'{word}' is a bystander.{RESET}")
                self.clue_phase = True
                self.turns_left -= 1
                return True  # end turn, switch

        if move[0] == 'pass':
            self.clue_phase = True
            self.turns_left -= 1
            return True

        return False

    def check_game_over(self):
        if self.game_over:
            return  # already set (assassin)

        if self._all_agents_found():
            self.game_over = True
            self.winner = 1  # cooperative win (represented as P1 winning)
            print(f"\n  {GREEN}ALL AGENTS FOUND! You win together!{RESET}")
            return

        if self.turns_left <= 0:
            self.game_over = True
            self.winner = None  # cooperative loss
            print(f"\n  {RED}Out of turns! You lose.{RESET}")

    def get_state(self):
        return {
            'grid_size': self.grid_size,
            'max_turns': self.max_turns,
            'num_agents': self.num_agents,
            'num_assassins': self.num_assassins,
            'words': self.words,
            'revealed': self.revealed,
            'turns_left': self.turns_left,
            'keys': {str(k): {str(i): v for i, v in key.items()} for k, key in self.keys.items()},
            'agents_found': {str(k): v for k, v in self.agents_found.items()},
            'total_agents_needed': self.total_agents_needed,
            'clue_phase': self.clue_phase,
            'guesses_left': getattr(self, '_guesses_left', 0),
        }

    def load_state(self, state):
        self.grid_size = state['grid_size']
        self.max_turns = state['max_turns']
        self.num_agents = state['num_agents']
        self.num_assassins = state['num_assassins']
        self.words = state['words']
        self.revealed = state['revealed']
        self.turns_left = state['turns_left']
        self.keys = {int(k): {int(i): v for i, v in key.items()} for k, key in state['keys'].items()}
        self.agents_found = {int(k): v for k, v in state['agents_found'].items()}
        self.total_agents_needed = state['total_agents_needed']
        self.clue_phase = state['clue_phase']
        self._guesses_left = state.get('guesses_left', 0)

    def get_tutorial(self):
        return """
  ============================================================
    CODENAMES DUET - Tutorial
  ============================================================

  OVERVIEW
    Cooperative word game! Work together to identify all agents
    hidden in a grid of words before running out of turns.

  HOW IT WORKS
    Each player has a secret key card showing which words are
    agents (green) and assassins (red) for the OTHER player.
    Take turns giving one-word clues to help your partner guess.

  GIVING CLUES
    Give a single word and a number. The number tells your
    partner how many words relate to your clue.
    Example: 'OCEAN 2' means 2 words relate to oceans.

  GUESSING
    After a clue, guess words by entering coordinates (e.g. A 3).
    You can guess up to clue_number + 1 times.
    - Agent: correct! Keep guessing.
    - Bystander: turn ends.
    - Assassin: GAME OVER! You lose.

  WINNING
    Find ALL agents before running out of turns.
    Both players win or lose together!"""
