"""Watergate - Asymmetric 2-player card game about the Watergate scandal."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Cards: (name, strength, special_power)
# Editor cards focus on investigation
EDITOR_CARDS = [
    ("Deep Throat", 4, "pull_evidence"),
    ("Woodward", 3, "pull_evidence"),
    ("Bernstein", 3, "pull_evidence"),
    ("Informant", 2, "pull_evidence"),
    ("Anonymous Source", 2, "pull_evidence"),
    ("FOIA Request", 3, "block_momentum"),
    ("Wiretap", 4, "block_momentum"),
    ("Senate Hearing", 5, "pull_two"),
    ("Grand Jury", 4, "pull_two"),
    ("Public Outrage", 3, "block_momentum"),
    ("Leak to Press", 2, "pull_evidence"),
    ("Whistleblower", 3, "pull_evidence"),
]

# Nixon cards focus on cover-up and momentum
NIXON_CARDS = [
    ("Executive Privilege", 5, "push_evidence"),
    ("Haldeman", 4, "push_evidence"),
    ("Ehrlichman", 4, "push_evidence"),
    ("Mitchell", 3, "push_evidence"),
    ("Dean (before flip)", 2, "push_evidence"),
    ("Campaign Funds", 3, "gain_momentum"),
    ("Dirty Tricks", 3, "gain_momentum"),
    ("Stonewall", 4, "push_evidence"),
    ("Saturday Night Massacre", 5, "gain_momentum"),
    ("Cover-Up", 3, "push_evidence"),
    ("Plumbers", 2, "gain_momentum"),
    ("18-Minute Gap", 4, "gain_momentum"),
]

EVIDENCE_NAMES = [
    "Money Trail", "Tapes", "Break-in Report",
    "Witness Testimony", "Phone Records", "Memo", "Photos"
]


class WatergateGame(BaseGame):
    """Watergate - an asymmetric 2-player card game about the Watergate scandal."""

    name = "Watergate"
    description = "Editor vs Nixon: investigate or cover up the scandal"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (5 evidence to win, 5 rounds)",
        "quick": "Quick game (3 evidence to win, 3 rounds)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.players = ["Editor", "Nixon"]
        if self.variation == "quick":
            self.evidence_to_win = 3
            self.max_rounds = 3
            self.num_evidence = 5
        else:
            self.evidence_to_win = 5
            self.max_rounds = 5
            self.num_evidence = 7
        # Evidence track: positions from -3 (Nixon side) to +3 (Editor side)
        # 0 = neutral. Evidence at +3 is "connected to Nixon" (Editor scores).
        # Evidence at -3 is "buried" (removed from play).
        self.evidence_positions = []
        self.evidence_connected = 0  # evidence connected by Editor
        self.evidence_buried = 0     # evidence buried by Nixon
        self.nixon_momentum = 0      # momentum track 0-5
        self.momentum_to_win = 5
        self.round_number = 0
        self.hands = {1: [], 2: []}
        self.editor_deck = []
        self.nixon_deck = []
        self.played_this_round = {1: [], 2: []}
        self.round_phase = "play"  # play or resolve
        self.current_contest = 0  # which evidence token we're contesting
        self.contest_strengths = {1: 0, 2: 0}
        self.cards_played_in_contest = 0
        self.log = []
        self.round_evidence_indices = []

    def _build_decks(self):
        self.editor_deck = list(range(len(EDITOR_CARDS)))
        self.nixon_deck = list(range(len(NIXON_CARDS)))
        random.shuffle(self.editor_deck)
        random.shuffle(self.nixon_deck)

    def _deal_hands(self):
        hand_size = 5
        self.hands[1] = []
        self.hands[2] = []
        for _ in range(hand_size):
            if self.editor_deck:
                self.hands[1].append(self.editor_deck.pop())
            if self.nixon_deck:
                self.hands[2].append(self.nixon_deck.pop())

    def _start_round(self):
        self.round_number += 1
        self._build_decks()
        self._deal_hands()
        self.played_this_round = {1: [], 2: []}
        # Pick evidence tokens to contest this round
        active = [i for i in range(self.num_evidence)
                  if self.evidence_positions[i] is not None]
        random.shuffle(active)
        contest_count = min(3, len(active))
        self.round_evidence_indices = active[:contest_count]
        self.current_contest = 0
        self.contest_strengths = {1: 0, 2: 0}
        self.cards_played_in_contest = 0
        self.current_player = 1
        self.log.append(f"--- Round {self.round_number} ---")

    def _resolve_contest(self):
        """Resolve current evidence contest."""
        if self.current_contest >= len(self.round_evidence_indices):
            return
        eidx = self.round_evidence_indices[self.current_contest]
        if self.evidence_positions[eidx] is None:
            return
        diff = self.contest_strengths[1] - self.contest_strengths[2]
        if diff > 0:
            # Editor pulls evidence toward Nixon connection
            self.evidence_positions[eidx] = min(3, self.evidence_positions[eidx] + diff)
            self.log.append(f"Editor wins contest for {EVIDENCE_NAMES[eidx]} (+{diff})")
        elif diff < 0:
            # Nixon pushes evidence away
            self.evidence_positions[eidx] = max(-3, self.evidence_positions[eidx] + diff)
            self.log.append(f"Nixon wins contest for {EVIDENCE_NAMES[eidx]} ({diff})")
        else:
            self.log.append(f"Contest for {EVIDENCE_NAMES[eidx]} is a tie (no movement)")

        # Check if evidence reached endpoints
        if self.evidence_positions[eidx] is not None and self.evidence_positions[eidx] >= 3:
            self.evidence_connected += 1
            self.evidence_positions[eidx] = None
            self.log.append(f"*** {EVIDENCE_NAMES[eidx]} connected to Nixon! ***")
        elif self.evidence_positions[eidx] is not None and self.evidence_positions[eidx] <= -3:
            self.evidence_buried += 1
            self.evidence_positions[eidx] = None
            self.log.append(f"*** {EVIDENCE_NAMES[eidx]} buried by Nixon! ***")

    def setup(self):
        self.evidence_positions = [0] * self.num_evidence
        self.evidence_connected = 0
        self.evidence_buried = 0
        self.nixon_momentum = 0
        self._start_round()

    def display(self):
        clear_screen()
        print("=" * 60)
        print("  WATERGATE  ")
        print(f"  Round {self.round_number}/{self.max_rounds}")
        print("=" * 60)
        print(f"  Editor evidence connected: {self.evidence_connected}/{self.evidence_to_win}")
        print(f"  Nixon momentum: {'#' * self.nixon_momentum}{'.' * (self.momentum_to_win - self.nixon_momentum)} ({self.nixon_momentum}/{self.momentum_to_win})")
        print()

        # Evidence track display
        print("  Evidence Track:")
        print("  " + "-" * 50)
        labels = "  Nixon Side  <---  Neutral  --->  Editor Side"
        print(labels)
        print("  Pos: -3  -2  -1   0   +1  +2  +3")
        print()
        for i in range(self.num_evidence):
            pos = self.evidence_positions[i]
            if pos is None:
                status = "(removed)"
            else:
                track = [" . "] * 7  # positions -3 to +3
                idx = pos + 3
                track[idx] = "[" + EVIDENCE_NAMES[i][0] + "]"
                status = "".join(track)
            name = EVIDENCE_NAMES[i][:16].ljust(16)
            print(f"  {name} {status}")
        print()

        # Current contest info
        if self.current_contest < len(self.round_evidence_indices):
            eidx = self.round_evidence_indices[self.current_contest]
            print(f"  >> Contesting: {EVIDENCE_NAMES[eidx]} (contest {self.current_contest + 1}/{len(self.round_evidence_indices)})")
            print(f"     Editor strength: {self.contest_strengths[1]}  |  Nixon strength: {self.contest_strengths[2]}")
            print()

        # Current player hand
        p = self.current_player
        cards = EDITOR_CARDS if p == 1 else NIXON_CARDS
        print(f"  {self.players[p - 1]}'s hand:")
        for i, cidx in enumerate(self.hands[p]):
            c = cards[cidx]
            print(f"    {i + 1}. {c[0]} (Str: {c[1]}, Power: {c[2]})")
        print()

        # Recent log
        if self.log:
            print("  Recent events:")
            for entry in self.log[-5:]:
                print(f"    {entry}")
            print()

    def get_move(self):
        p = self.current_player
        if not self.hands[p]:
            return "pass"
        prompt = f"  {self.players[p - 1]}, play a card (1-{len(self.hands[p])}), or 'pass': "
        move = input_with_quit(prompt).strip().lower()
        return move

    def make_move(self, move):
        p = self.current_player
        cards = EDITOR_CARDS if p == 1 else NIXON_CARDS

        if move == "pass":
            self.cards_played_in_contest += 1
            self._after_card_played()
            return True

        try:
            idx = int(move) - 1
            if idx < 0 or idx >= len(self.hands[p]):
                return False
        except ValueError:
            return False

        cidx = self.hands[p].pop(idx)
        card = cards[cidx]
        self.played_this_round[p].append(cidx)

        # Add strength to contest
        self.contest_strengths[p] += card[1]

        # Apply special power
        power = card[2]
        if power == "pull_evidence" and p == 1:
            # Pull a random active evidence toward Editor
            active = [i for i in range(self.num_evidence)
                      if self.evidence_positions[i] is not None
                      and i not in self.round_evidence_indices[:self.current_contest + 1]]
            if active:
                target = random.choice(active)
                self.evidence_positions[target] = min(3, self.evidence_positions[target] + 1)
                self.log.append(f"  {card[0]} pulls {EVIDENCE_NAMES[target]} toward Editor")
                if self.evidence_positions[target] >= 3:
                    self.evidence_connected += 1
                    self.evidence_positions[target] = None
                    self.log.append(f"  *** {EVIDENCE_NAMES[target]} connected! ***")
        elif power == "push_evidence" and p == 2:
            active = [i for i in range(self.num_evidence)
                      if self.evidence_positions[i] is not None
                      and i not in self.round_evidence_indices[:self.current_contest + 1]]
            if active:
                target = random.choice(active)
                self.evidence_positions[target] = max(-3, self.evidence_positions[target] - 1)
                self.log.append(f"  {card[0]} pushes {EVIDENCE_NAMES[target]} toward Nixon")
                if self.evidence_positions[target] <= -3:
                    self.evidence_buried += 1
                    self.evidence_positions[target] = None
                    self.log.append(f"  *** {EVIDENCE_NAMES[target]} buried! ***")
        elif power == "gain_momentum" and p == 2:
            self.nixon_momentum = min(self.momentum_to_win, self.nixon_momentum + 1)
            self.log.append(f"  {card[0]} gains Nixon momentum (+1)")
        elif power == "block_momentum" and p == 1:
            self.nixon_momentum = max(0, self.nixon_momentum - 1)
            self.log.append(f"  {card[0]} blocks Nixon momentum (-1)")
        elif power == "pull_two" and p == 1:
            active = [i for i in range(self.num_evidence)
                      if self.evidence_positions[i] is not None]
            for target in active[:2]:
                self.evidence_positions[target] = min(3, self.evidence_positions[target] + 1)
                self.log.append(f"  {card[0]} pulls {EVIDENCE_NAMES[target]} +1")
                if self.evidence_positions[target] >= 3:
                    self.evidence_connected += 1
                    self.evidence_positions[target] = None
                    self.log.append(f"  *** {EVIDENCE_NAMES[target]} connected! ***")

        self.log.append(f"{self.players[p - 1]} plays {card[0]} (Str {card[1]})")
        self.cards_played_in_contest += 1
        self._after_card_played()
        return True

    def _after_card_played(self):
        """After both players have played, resolve contest and advance."""
        if self.cards_played_in_contest >= 2:
            self._resolve_contest()
            self.current_contest += 1
            self.contest_strengths = {1: 0, 2: 0}
            self.cards_played_in_contest = 0
            self.current_player = 1  # Editor starts each contest

            # Check if round is over
            if self.current_contest >= len(self.round_evidence_indices):
                # End of round - check for momentum bonus
                if self.nixon_momentum >= self.momentum_to_win:
                    self.game_over = True
                    self.winner = 2
                    return
                if self.evidence_connected >= self.evidence_to_win:
                    self.game_over = True
                    self.winner = 1
                    return
                if self.round_number >= self.max_rounds:
                    self.game_over = True
                    if self.evidence_connected >= self.evidence_to_win:
                        self.winner = 1
                    else:
                        self.winner = 2  # Nixon wins by default
                    return
                # Start next round
                self._start_round()

    def check_game_over(self):
        if self.evidence_connected >= self.evidence_to_win:
            self.game_over = True
            self.winner = 1
        elif self.nixon_momentum >= self.momentum_to_win:
            self.game_over = True
            self.winner = 2
        elif self.round_number >= self.max_rounds and self.current_contest >= len(self.round_evidence_indices):
            self.game_over = True
            self.winner = 2 if self.evidence_connected < self.evidence_to_win else 1

    def get_state(self):
        return {
            "evidence_positions": self.evidence_positions,
            "evidence_connected": self.evidence_connected,
            "evidence_buried": self.evidence_buried,
            "nixon_momentum": self.nixon_momentum,
            "round_number": self.round_number,
            "hands": {str(k): v for k, v in self.hands.items()},
            "editor_deck": self.editor_deck,
            "nixon_deck": self.nixon_deck,
            "played_this_round": {str(k): v for k, v in self.played_this_round.items()},
            "current_contest": self.current_contest,
            "contest_strengths": {str(k): v for k, v in self.contest_strengths.items()},
            "cards_played_in_contest": self.cards_played_in_contest,
            "round_evidence_indices": self.round_evidence_indices,
            "log": self.log[-20:],
        }

    def load_state(self, state):
        self.evidence_positions = state["evidence_positions"]
        self.evidence_connected = state["evidence_connected"]
        self.evidence_buried = state["evidence_buried"]
        self.nixon_momentum = state["nixon_momentum"]
        self.round_number = state["round_number"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.editor_deck = state["editor_deck"]
        self.nixon_deck = state["nixon_deck"]
        self.played_this_round = {int(k): v for k, v in state["played_this_round"].items()}
        self.current_contest = state["current_contest"]
        self.contest_strengths = {int(k): v for k, v in state["contest_strengths"].items()}
        self.cards_played_in_contest = state["cards_played_in_contest"]
        self.round_evidence_indices = state["round_evidence_indices"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  WATERGATE - Tutorial
==================================================

  OVERVIEW:
  Watergate is an asymmetric 2-player card game.
  Player 1 is the EDITOR trying to connect evidence to Nixon.
  Player 2 is NIXON trying to build momentum and block investigations.

  GAMEPLAY:
  Each round, evidence tokens are contested in a tug-of-war.
  Players alternate playing cards with strength values.
  The higher total strength wins each contest and moves
  the evidence token on the track.

  EVIDENCE TRACK:
  Each evidence token sits on a track from -3 to +3.
  - If it reaches +3, the Editor has connected it (scores for Editor).
  - If it reaches -3, Nixon has buried it (removed from play).

  CARD POWERS:
  - pull_evidence / push_evidence: Move a random evidence token
  - gain_momentum / block_momentum: Affect Nixon's momentum track
  - pull_two: Editor pulls two evidence tokens toward connection

  WINNING:
  - Editor wins by connecting enough evidence tokens.
  - Nixon wins by filling the momentum track or surviving all rounds.

  Standard: 5 evidence needed, 5 rounds
  Quick: 3 evidence needed, 3 rounds

  COMMANDS:
  Enter card number (1-5) to play, or 'pass' to skip.
  Type 'quit' to quit, 'save' to save, 'help' for help.
==================================================
"""
