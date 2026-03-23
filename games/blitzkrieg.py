"""Blitzkrieg - Token-placing theater-of-war game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
DIM = '\033[2m'
BOLD = '\033[1m'
WHITE = '\033[97m'

# Token types with strength ranges
TOKEN_TYPES = {
    'Infantry': {'symbol': 'I', 'color': GREEN, 'strengths': [1, 2, 2, 3, 3, 3, 4]},
    'Armor': {'symbol': 'A', 'color': YELLOW, 'strengths': [2, 3, 3, 4, 4, 5]},
    'Air': {'symbol': 'F', 'color': CYAN, 'strengths': [1, 2, 3, 3, 4]},
    'Naval': {'symbol': 'N', 'color': BLUE, 'strengths': [1, 2, 2, 3, 4]},
    'Wild': {'symbol': 'W', 'color': MAGENTA, 'strengths': [2, 3, 4, 5]},
}

# Theaters of war
ALL_THEATERS = [
    {
        'name': 'Western Europe',
        'slots_per_player': 3,
        'bonus': 'Armor tokens get +1 strength here',
        'bonus_type': 'Armor',
    },
    {
        'name': 'Eastern Europe',
        'slots_per_player': 3,
        'bonus': 'Infantry tokens get +1 strength here',
        'bonus_type': 'Infantry',
    },
    {
        'name': 'Pacific',
        'slots_per_player': 3,
        'bonus': 'Naval tokens get +1 strength here',
        'bonus_type': 'Naval',
    },
    {
        'name': 'Africa',
        'slots_per_player': 3,
        'bonus': 'Air tokens get +1 strength here',
        'bonus_type': 'Air',
    },
    {
        'name': 'Atlantic',
        'slots_per_player': 3,
        'bonus': 'Naval tokens get +1 strength here',
        'bonus_type': 'Naval',
    },
]

QUICK_THEATERS = ['Western Europe', 'Eastern Europe', 'Pacific']


def _make_token_pool():
    """Create the full token pool for a player."""
    pool = []
    for ttype, info in TOKEN_TYPES.items():
        for strength in info['strengths']:
            pool.append({
                'type': ttype,
                'symbol': info['symbol'],
                'strength': strength,
            })
    random.shuffle(pool)
    return pool


class BlitzkriegGame(BaseGame):
    name = "Blitzkrieg"
    description = "Token-placing theater-of-war strategy game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game: 5 theaters of war',
        'quick': 'Quick game: 3 theaters of war',
    }

    def setup(self):
        """Initialize the game."""
        if self.variation == 'quick':
            self.theaters = [t for t in ALL_THEATERS if t['name'] in QUICK_THEATERS]
        else:
            self.theaters = copy.deepcopy(ALL_THEATERS)

        self.num_theaters = len(self.theaters)

        # Theater state: each theater has slots for each player
        self.theater_slots = {}
        for i, theater in enumerate(self.theaters):
            self.theater_slots[str(i)] = {
                '1': [],  # P1's tokens placed here
                '2': [],  # P2's tokens placed here
                'resolved': False,
                'winner': None,
            }

        # Player state
        self.player_data = {}
        for p in [1, 2]:
            pool = _make_token_pool()
            # Draw initial hand of 4 tokens
            hand = pool[:4]
            remaining = pool[4:]
            self.player_data[str(p)] = {
                'hand': hand,
                'pool': remaining,
                'theaters_won': 0,
            }

        self.message = "War begins! Place tokens in theaters to control them."

    def _calc_theater_strength(self, theater_idx, player):
        """Calculate total strength of a player's tokens in a theater."""
        slots = self.theater_slots[str(theater_idx)][str(player)]
        theater = self.theaters[theater_idx]
        total = 0
        for token in slots:
            strength = token['strength']
            # Theater bonus
            if token['type'] == theater['bonus_type']:
                strength += 1
            total += strength
        return total

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        pd = self.player_data[str(p)]
        color = BLUE if p == 1 else RED

        print(f"{BOLD}{'=' * 70}")
        print(f"  BLITZKRIEG! - {self.players[p - 1]}'s Turn (Turn {self.turn_number + 1})")
        print(f"{'=' * 70}{RESET}")

        # Display theaters
        print(f"\n  {BOLD}THEATERS OF WAR:{RESET}")
        for i, theater in enumerate(self.theaters):
            slots = self.theater_slots[str(i)]
            resolved = slots['resolved']
            winner = slots['winner']
            max_slots = theater['slots_per_player']

            # Theater header
            if resolved:
                if winner:
                    wcolor = BLUE if winner == 1 else RED
                    status = f"{wcolor}Won by P{winner}{RESET}"
                else:
                    status = f"{DIM}Draw{RESET}"
            else:
                status = f"{YELLOW}Active{RESET}"

            print(f"\n  [{i + 1}] {BOLD}{theater['name']}{RESET} ({status})")
            print(f"      {DIM}{theater['bonus']}{RESET}")

            # P1 slots
            p1_slots = slots['1']
            p1_str = ""
            for j in range(max_slots):
                if j < len(p1_slots):
                    t = p1_slots[j]
                    tc = TOKEN_TYPES[t['type']]['color']
                    p1_str += f" {tc}{t['symbol']}{t['strength']}{RESET}"
                else:
                    p1_str += f" {DIM}[]{RESET}"
            p1_total = self._calc_theater_strength(i, 1)

            # P2 slots
            p2_slots = slots['2']
            p2_str = ""
            for j in range(max_slots):
                if j < len(p2_slots):
                    t = p2_slots[j]
                    tc = TOKEN_TYPES[t['type']]['color']
                    p2_str += f" {tc}{t['symbol']}{t['strength']}{RESET}"
                else:
                    p2_str += f" {DIM}[]{RESET}"
            p2_total = self._calc_theater_strength(i, 2)

            print(f"      {BLUE}P1:{RESET}{p1_str}  = {BLUE}{p1_total}{RESET}")
            print(f"      {RED}P2:{RESET}{p2_str}  = {RED}{p2_total}{RESET}")

        # Scoreboard
        p1_wins = self.player_data['1']['theaters_won']
        p2_wins = self.player_data['2']['theaters_won']
        needed = self.num_theaters // 2 + 1
        print(f"\n  {BOLD}Score:{RESET} {BLUE}P1={p1_wins}{RESET} | "
              f"{RED}P2={p2_wins}{RESET} (need {needed} theaters to win)")

        # Token types legend
        print(f"\n  Token types: "
              f"{GREEN}I{RESET}=Infantry  {YELLOW}A{RESET}=Armor  "
              f"{CYAN}F{RESET}=Air  {BLUE}N{RESET}=Naval  {MAGENTA}W{RESET}=Wild")

        # Hand
        print(f"\n  {color}Your Hand:{RESET}")
        for i, token in enumerate(pd['hand']):
            tc = TOKEN_TYPES[token['type']]['color']
            print(f"    [{i + 1}] {tc}{token['type']}{RESET} "
                  f"(Strength: {token['strength']})")

        print(f"  Remaining in pool: {len(pd['pool'])}")

        if self.message:
            print(f"\n  {YELLOW}>> {self.message}{RESET}")

    def get_move(self):
        """Get a move from the current player."""
        pd = self.player_data[str(self.current_player)]

        if not pd['hand']:
            return ('pass',)

        tidx = input_with_quit(f"\n  Choose token (1-{len(pd['hand'])}): ").strip()
        theater = input_with_quit(f"  Place in which theater? (1-{self.num_theaters}): ").strip()
        return ('place', tidx, theater)

    def make_move(self, move):
        """Apply a move to the game state."""
        pd = self.player_data[str(self.current_player)]

        if move[0] == 'pass':
            self.message = "No tokens left to place. Turn passed."
            return True

        if move[0] == 'place':
            try:
                tidx = int(move[1]) - 1
                theater_idx = int(move[2]) - 1
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            if tidx < 0 or tidx >= len(pd['hand']):
                self.message = "Invalid token number."
                return False

            if theater_idx < 0 or theater_idx >= self.num_theaters:
                self.message = "Invalid theater number."
                return False

            theater = self.theaters[theater_idx]
            slots = self.theater_slots[str(theater_idx)]

            if slots['resolved']:
                self.message = "This theater is already resolved!"
                return False

            my_slots = slots[str(self.current_player)]
            if len(my_slots) >= theater['slots_per_player']:
                self.message = "No more slots available in this theater!"
                return False

            # Place the token
            token = pd['hand'].pop(tidx)
            my_slots.append(token)

            # Draw a replacement token
            if pd['pool']:
                pd['hand'].append(pd['pool'].pop())

            # Check if theater is full (both sides)
            p1_full = len(slots['1']) >= theater['slots_per_player']
            p2_full = len(slots['2']) >= theater['slots_per_player']

            if p1_full and p2_full:
                # Resolve theater
                p1_str = self._calc_theater_strength(theater_idx, 1)
                p2_str = self._calc_theater_strength(theater_idx, 2)
                slots['resolved'] = True
                if p1_str > p2_str:
                    slots['winner'] = 1
                    self.player_data['1']['theaters_won'] += 1
                    self.message = (f"Placed {token['type']} in {theater['name']}. "
                                    f"Theater resolved! P1 wins ({p1_str} vs {p2_str})!")
                elif p2_str > p1_str:
                    slots['winner'] = 2
                    self.player_data['2']['theaters_won'] += 1
                    self.message = (f"Placed {token['type']} in {theater['name']}. "
                                    f"Theater resolved! P2 wins ({p2_str} vs {p1_str})!")
                else:
                    slots['winner'] = None
                    self.message = (f"Placed {token['type']} in {theater['name']}. "
                                    f"Theater resolved! Draw ({p1_str} vs {p2_str})!")
            else:
                bonus_note = ""
                if token['type'] == theater['bonus_type']:
                    bonus_note = " (+1 theater bonus!)"
                self.message = (f"Placed {token['type']} (str {token['strength']}) "
                                f"in {theater['name']}.{bonus_note}")

            return True

        self.message = "Unknown action."
        return False

    def check_game_over(self):
        """Check if the game is over."""
        needed = self.num_theaters // 2 + 1

        # Check if someone has won enough theaters
        for p in [1, 2]:
            if self.player_data[str(p)]['theaters_won'] >= needed:
                self.game_over = True
                self.winner = p
                return

        # Check if all theaters resolved
        all_resolved = all(
            self.theater_slots[str(i)]['resolved']
            for i in range(self.num_theaters)
        )

        if all_resolved:
            self.game_over = True
            p1w = self.player_data['1']['theaters_won']
            p2w = self.player_data['2']['theaters_won']
            if p1w > p2w:
                self.winner = 1
            elif p2w > p1w:
                self.winner = 2
            else:
                # Tiebreaker: total strength across all theaters
                p1_total = sum(self._calc_theater_strength(i, 1) for i in range(self.num_theaters))
                p2_total = sum(self._calc_theater_strength(i, 2) for i in range(self.num_theaters))
                if p1_total > p2_total:
                    self.winner = 1
                elif p2_total > p1_total:
                    self.winner = 2
                else:
                    self.winner = None
            return

        # Check if both players have no tokens left
        p1_empty = not self.player_data['1']['hand'] and not self.player_data['1']['pool']
        p2_empty = not self.player_data['2']['hand'] and not self.player_data['2']['pool']

        if p1_empty and p2_empty:
            # Resolve all remaining theaters
            for i in range(self.num_theaters):
                slots = self.theater_slots[str(i)]
                if not slots['resolved']:
                    p1_str = self._calc_theater_strength(i, 1)
                    p2_str = self._calc_theater_strength(i, 2)
                    slots['resolved'] = True
                    if p1_str > p2_str:
                        slots['winner'] = 1
                        self.player_data['1']['theaters_won'] += 1
                    elif p2_str > p1_str:
                        slots['winner'] = 2
                        self.player_data['2']['theaters_won'] += 1
                    else:
                        slots['winner'] = None

            self.game_over = True
            p1w = self.player_data['1']['theaters_won']
            p2w = self.player_data['2']['theaters_won']
            if p1w > p2w:
                self.winner = 1
            elif p2w > p1w:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            'theaters': self.theaters,
            'num_theaters': self.num_theaters,
            'theater_slots': self.theater_slots,
            'player_data': self.player_data,
            'message': self.message,
        }

    def load_state(self, state):
        """Restore game state."""
        self.theaters = state['theaters']
        self.num_theaters = state['num_theaters']
        self.theater_slots = state['theater_slots']
        self.player_data = state['player_data']
        self.message = state['message']

    def get_tutorial(self):
        return f"""{BOLD}=== BLITZKRIEG! TUTORIAL ==={RESET}

Blitzkrieg! is a token-placing theater-of-war game for 2 players.

{BOLD}OBJECTIVE:{RESET}
  Win a majority of theaters of war (3 of 5, or 2 of 3 in quick mode).

{BOLD}GAME STRUCTURE:{RESET}
  Players alternate placing military tokens into theater slots.
  Each theater has 3 slots per player.
  When both sides of a theater are full, it resolves immediately.

{BOLD}TOKEN TYPES:{RESET}
  I = Infantry  (strength 1-4)
  A = Armor     (strength 2-5)
  F = Air Force (strength 1-4)
  N = Naval     (strength 1-4)
  W = Wild      (strength 2-5)

{BOLD}THEATERS:{RESET}
  Western Europe - Armor gets +1 strength
  Eastern Europe - Infantry gets +1 strength
  Pacific        - Naval gets +1 strength
  Africa         - Air gets +1 strength
  Atlantic       - Naval gets +1 strength

{BOLD}RESOLVING THEATERS:{RESET}
  When all 6 slots (3 per player) are filled, compare total strength.
  Theater bonuses apply to matching token types.
  Higher total wins the theater.
  Ties result in no one winning that theater.

{BOLD}WINNING:{RESET}
  First to win a majority of theaters wins the game.
  If all theaters resolve with a tie in wins, total strength breaks it.

{BOLD}STRATEGY:{RESET}
  - Save strong tokens for contested theaters
  - Use theater bonuses to your advantage
  - Bluff by placing weak tokens to draw out opponent's strong ones
  - Wild tokens are flexible but limited

{BOLD}CONTROLS:{RESET}
  Type 'q' to quit, 's' to save, 'h' for help, 't' for tutorial.
"""
