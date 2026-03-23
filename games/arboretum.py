"""Arboretum - Card-laying tree path game.

10 tree species, cards numbered 1-8 per species. Play cards to personal
tableaus forming paths. Score points for paths between matching species.
But you can only score a species if your hand total for that species
beats your opponent's.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

ALL_SPECIES = ["Maple", "Oak", "Cherry", "Birch", "Willow",
               "Dogwood", "Jacaranda", "Cassia", "Pine", "Spruce"]
SPECIES_ABBREV = {
    "Maple": "Ma", "Oak": "Ok", "Cherry": "Ch", "Birch": "Bi",
    "Willow": "Wi", "Dogwood": "Do", "Jacaranda": "Ja",
    "Cassia": "Ca", "Pine": "Pi", "Spruce": "Sp",
}


def _card_str(card):
    """Format a card as 'Species-Number'."""
    if card is None:
        return "  .  "
    species, num = card
    return f"{SPECIES_ABBREV[species]}{num}"


class ArboretumGame(BaseGame):
    """Arboretum - Card-laying tree path game."""

    name = "Arboretum"
    description = "Card-laying tree path game with hand management and scoring rights"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (6 species, 48 cards)",
        "quick": "Quick game (4 species, 32 cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.num_species = 4
            self.hand_limit = 5
        else:
            self.num_species = 6
            self.hand_limit = 7
        self.species_in_game = []
        self.deck = []
        self.hands = {}
        self.discard_piles = {}  # player -> list of cards (face up)
        self.tableaus = {}  # player -> dict of (row,col) -> card
        self.log = []

    def setup(self):
        # Select species for this game
        all_sp = list(ALL_SPECIES)
        random.shuffle(all_sp)
        self.species_in_game = sorted(all_sp[:self.num_species])

        # Build deck: each species has cards 1-8
        self.deck = []
        for species in self.species_in_game:
            for num in range(1, 9):
                self.deck.append([species, num])
        random.shuffle(self.deck)

        # Deal hands
        for p in ["1", "2"]:
            self.hands[p] = []
            self.discard_piles[p] = []
            self.tableaus[p] = {}
            for _ in range(self.hand_limit):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

        self.log = [f"Game started with species: {', '.join(self.species_in_game)}"]

    def _get_tableau_bounds(self, player):
        """Get the bounding box of a player's tableau."""
        sp = str(player) if isinstance(player, int) else player
        tableau = self.tableaus[sp]
        if not tableau:
            return 0, 0, 0, 0
        positions = [list(map(int, k.split(","))) for k in tableau.keys()]
        min_r = min(p[0] for p in positions)
        max_r = max(p[0] for p in positions)
        min_c = min(p[1] for p in positions)
        max_c = max(p[1] for p in positions)
        return min_r, max_r, min_c, max_c

    def _find_paths(self, player, species):
        """Find the best scoring path for a species in the player's tableau.
        Path must start and end with the given species, values must be ascending,
        and path follows orthogonal adjacency."""
        sp = str(player) if isinstance(player, int) else player
        tableau = self.tableaus[sp]
        if not tableau:
            return 0

        # Find all cards of this species
        species_positions = []
        for key, card in tableau.items():
            if card[0] == species:
                r, c = map(int, key.split(","))
                species_positions.append((r, c, card[1]))

        if len(species_positions) < 2:
            return 0

        best_score = 0
        # Try all pairs of species cards as start and end
        for start_r, start_c, start_num in species_positions:
            for end_r, end_c, end_num in species_positions:
                if (start_r, start_c) == (end_r, end_c):
                    continue
                if start_num >= end_num:
                    continue
                # BFS/DFS to find longest ascending path from start to end
                score = self._find_best_path(sp, start_r, start_c, start_num,
                                             end_r, end_c, end_num)
                if score > best_score:
                    best_score = score
        return best_score

    def _find_best_path(self, player, sr, sc, sval, er, ec, eval_num):
        """Find the best scoring ascending path from (sr,sc) to (er,ec)."""
        tableau = self.tableaus[player]
        best = [0]

        def dfs(r, c, prev_val, length, visited):
            if r == er and c == ec:
                card = tableau.get(f"{r},{c}")
                if card and card[1] > prev_val:
                    best[0] = max(best[0], length + 1)
                return

            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                key = f"{nr},{nc}"
                if key in visited:
                    continue
                if key not in tableau:
                    continue
                card = tableau[key]
                if card[1] <= prev_val:
                    continue
                visited.add(key)
                dfs(nr, nc, card[1], length + 1, visited)
                visited.remove(key)

        start_key = f"{sr},{sc}"
        dfs(sr, sc, sval - 1, 0, {start_key})
        return best[0]

    def _calculate_final_scores(self):
        """Calculate final scores considering scoring rights."""
        scores = {"1": 0, "2": 0}
        for species in self.species_in_game:
            # Determine who has scoring rights
            hand_total = {}
            for p in ["1", "2"]:
                total = sum(card[1] for card in self.hands[p] if card[0] == species)
                hand_total[p] = total

            # Special rule: if you have the 8 but opponent has the 1,
            # your 8 counts as 0
            for p in ["1", "2"]:
                opp = "2" if p == "1" else "1"
                has_8 = any(card[0] == species and card[1] == 8 for card in self.hands[p])
                opp_has_1 = any(card[0] == species and card[1] == 1 for card in self.hands[opp])
                if has_8 and opp_has_1:
                    hand_total[p] -= 8

            # Both can score if tied, otherwise only the leader
            can_score = {"1": False, "2": False}
            if hand_total["1"] > hand_total["2"]:
                can_score["1"] = True
            elif hand_total["2"] > hand_total["1"]:
                can_score["2"] = True
            else:
                can_score["1"] = True
                can_score["2"] = True

            for p in ["1", "2"]:
                if can_score[p]:
                    path_score = self._find_paths(p, species)
                    scores[p] += path_score
        return scores

    def display(self):
        clear_screen()
        print(f"{'=' * 70}")
        print(f"  ARBORETUM - {self.variation.title()} | Turn {self.turn_number + 1}")
        print(f"{'=' * 70}")
        print(f"  Species in game: {', '.join(self.species_in_game)}")
        print(f"  Deck: {len(self.deck)} cards remaining")
        print()

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            print(f"  {self.players[p-1]}{marker}")
            # Show tableau
            tableau = self.tableaus[sp]
            if tableau:
                min_r, max_r, min_c, max_c = self._get_tableau_bounds(p)
                # Add padding
                min_r -= 1
                max_r += 1
                min_c -= 1
                max_c += 1
                print(f"    Tableau:")
                # Column headers
                hdr = "      "
                for c in range(min_c, max_c + 1):
                    hdr += f" {c:>4} "
                print(hdr)
                for r in range(min_r, max_r + 1):
                    row_str = f"    {r:>2}"
                    for c in range(min_c, max_c + 1):
                        key = f"{r},{c}"
                        if key in tableau:
                            card = tableau[key]
                            row_str += f" {_card_str(card):>4} "
                        else:
                            row_str += "   .  "
                    print(row_str)
            else:
                print("    Tableau: (empty)")
            # Show discard pile top
            if self.discard_piles[sp]:
                top = self.discard_piles[sp][-1]
                print(f"    Discard pile: {_card_str(top)} ({len(self.discard_piles[sp])} cards)")
            else:
                print(f"    Discard pile: (empty)")
            print()

        # Show current player's hand
        cp = str(self.current_player)
        print(f"  Your hand:")
        hand = self.hands[cp]
        for i, card in enumerate(sorted(hand, key=lambda c: (c[0], c[1]))):
            print(f"    [{i+1}] {card[0]} {card[1]}")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)
        hand = self.hands[cp]
        sorted_hand = sorted(hand, key=lambda c: (c[0], c[1]))

        # Phase 1: Draw 2 cards (from deck or opponent's discard)
        drawn = []
        for draw_num in range(2):
            sources = ["deck"]
            opp = "2" if cp == "1" else "1"
            if self.discard_piles[opp]:
                sources.append("opponent_discard")
            if self.discard_piles[cp]:
                sources.append("own_discard")

            print(f"  Draw card {draw_num + 1}/2:")
            print(f"    [d] Draw from deck ({len(self.deck)} remaining)")
            if "opponent_discard" in sources:
                top = self.discard_piles[opp][-1]
                print(f"    [o] Take from opponent's discard ({_card_str(top)})")
            if "own_discard" in sources:
                top = self.discard_piles[cp][-1]
                print(f"    [m] Take from own discard ({_card_str(top)})")

            source = input_with_quit("    Source (d/o/m): ").strip().lower()
            if source == 'd':
                if not self.deck:
                    print("    Deck is empty!")
                    return None
                drawn.append({"source": "deck"})
            elif source == 'o' and "opponent_discard" in sources:
                drawn.append({"source": "opponent_discard"})
            elif source == 'm' and "own_discard" in sources:
                drawn.append({"source": "own_discard"})
            else:
                return None

        # Phase 2: Play 1 card to tableau
        print(f"\n  Play a card to your tableau:")
        # Re-sort after potential draws (but we haven't applied yet)
        # Show hand indices
        for i, card in enumerate(sorted_hand):
            print(f"    [{i+1}] {card[0]} {card[1]}")
        play_input = input_with_quit("  Card to play (number): ").strip()
        try:
            play_idx = int(play_input) - 1
            if play_idx < 0 or play_idx >= len(sorted_hand):
                return None
        except ValueError:
            return None

        play_card_ref = list(sorted_hand[play_idx])

        # Position
        tableau = self.tableaus[cp]
        if not tableau:
            print("  First card goes at (0,0).")
            pos = "0,0"
        else:
            print("  Place at position (row,col). Must be adjacent to existing card.")
            pos = input_with_quit("  Position: ").strip()

        # Phase 3: Discard 1 card
        print(f"\n  Discard a card:")
        remaining = list(sorted_hand)
        remaining.pop(play_idx)
        for i, card in enumerate(remaining):
            print(f"    [{i+1}] {card[0]} {card[1]}")
        disc_input = input_with_quit("  Card to discard (number): ").strip()
        try:
            disc_idx = int(disc_input) - 1
            if disc_idx < 0 or disc_idx >= len(remaining):
                return None
        except ValueError:
            return None
        disc_card_ref = list(remaining[disc_idx])

        return {
            "action": "turn",
            "draws": drawn,
            "play_card": play_card_ref,
            "position": pos,
            "discard_card": disc_card_ref,
        }

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)

        if move.get("action") != "turn":
            return False

        # Process draws
        for draw in move["draws"]:
            source = draw["source"]
            if source == "deck":
                if not self.deck:
                    return False
                card = self.deck.pop()
                self.hands[cp].append(card)
            elif source == "opponent_discard":
                opp = "2" if cp == "1" else "1"
                if not self.discard_piles[opp]:
                    return False
                card = self.discard_piles[opp].pop()
                self.hands[cp].append(card)
            elif source == "own_discard":
                if not self.discard_piles[cp]:
                    return False
                card = self.discard_piles[cp].pop()
                self.hands[cp].append(card)

        # Play card to tableau
        play_card = move["play_card"]
        pos_str = move["position"]

        # Find and remove the card from hand
        found = False
        for i, card in enumerate(self.hands[cp]):
            if card[0] == play_card[0] and card[1] == play_card[1]:
                self.hands[cp].pop(i)
                found = True
                break
        if not found:
            return False

        try:
            parts = pos_str.split(",")
            row, col = int(parts[0]), int(parts[1])
        except (ValueError, IndexError):
            return False

        key = f"{row},{col}"
        if key in self.tableaus[cp]:
            # Put card back
            self.hands[cp].append(play_card)
            return False

        # Check adjacency (except for first card)
        if self.tableaus[cp]:
            adjacent = False
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                adj_key = f"{row + dr},{col + dc}"
                if adj_key in self.tableaus[cp]:
                    adjacent = True
                    break
            if not adjacent:
                self.hands[cp].append(play_card)
                return False

        self.tableaus[cp][key] = play_card

        # Discard card
        disc_card = move["discard_card"]
        found = False
        for i, card in enumerate(self.hands[cp]):
            if card[0] == disc_card[0] and card[1] == disc_card[1]:
                self.hands[cp].pop(i)
                self.discard_piles[cp].append(disc_card)
                found = True
                break
        if not found:
            return False

        self.log.append(f"{self.players[self.current_player-1]} played "
                        f"{_card_str(play_card)} at ({row},{col}), "
                        f"discarded {_card_str(disc_card)}")
        return True

    def check_game_over(self):
        if not self.deck:
            self.game_over = True
            scores = self._calculate_final_scores()
            s1 = scores["1"]
            s2 = scores["2"]
            self.log.append(f"Final scores - {self.players[0]}: {s1}, {self.players[1]}: {s2}")
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "species_in_game": list(self.species_in_game),
            "deck": [list(c) for c in self.deck],
            "hands": {k: [list(c) for c in v] for k, v in self.hands.items()},
            "discard_piles": {k: [list(c) for c in v] for k, v in self.discard_piles.items()},
            "tableaus": {
                k: {pos: list(card) for pos, card in v.items()}
                for k, v in self.tableaus.items()
            },
            "log": self.log,
        }

    def load_state(self, state):
        self.species_in_game = state["species_in_game"]
        self.num_species = len(self.species_in_game)
        self.deck = [list(c) for c in state["deck"]]
        self.hands = {k: [list(c) for c in v] for k, v in state["hands"].items()}
        self.discard_piles = {k: [list(c) for c in v] for k, v in state["discard_piles"].items()}
        self.tableaus = {
            k: {pos: list(card) for pos, card in v.items()}
            for k, v in state["tableaus"].items()
        }
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  ARBORETUM - Tutorial
============================================================

  OVERVIEW:
  Arboretum is a card game about planting trees and creating
  beautiful paths through your personal arboretum. But having
  the right to SCORE a species depends on what's in your hand!

  CARDS:
  - Each species has cards numbered 1-8
  - Standard: 6 species (48 cards), Quick: 4 species (32 cards)

  ON YOUR TURN:
  1. DRAW 2 cards (from deck or top of any discard pile)
  2. PLAY 1 card to your tableau (adjacent to existing cards)
  3. DISCARD 1 card to your personal discard pile

  TABLEAU:
  - Cards are placed in a grid, always adjacent to existing cards
  - First card goes at position (0,0)
  - Build paths of ascending values between matching species

  SCORING (at game end):
  For each species:
  1. Check SCORING RIGHTS: compare hand totals for that species
     - Only the player with higher total can score it
     - Tied: both can score
     - Special: if you hold the 8 but opponent holds the 1,
       your 8 counts as 0 for rights purposes!

  2. Find best PATH: starting and ending with that species
     - Path must follow orthogonal adjacency
     - Card values must be strictly ascending along the path
     - Score = number of cards in the path

  STRATEGY:
  - Keep high-value cards in hand to secure scoring rights
  - But play cards to build long ascending paths
  - The 1 card is powerful: it neutralizes opponent's 8!
  - Watch what opponents discard and pick up

  ABBREVIATIONS:
  Ma=Maple, Ok=Oak, Ch=Cherry, Bi=Birch, Wi=Willow
  Do=Dogwood, Ja=Jacaranda, Ca=Cassia, Pi=Pine, Sp=Spruce
============================================================
"""
