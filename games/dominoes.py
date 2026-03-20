"""Dominoes - Classic tile matching game with block and draw variations."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


class DominoesGame(BaseGame):
    """Dominoes: Match tiles end-to-end on a shared chain."""

    name = "Dominoes"
    description = "Classic tile matching game"
    min_players = 2
    max_players = 2
    variations = {
        "block": "Block Game (draw all tiles, no boneyard)",
        "draw": "Draw Game (draw from boneyard when stuck)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "block")
        self.hands = [[], []]        # hands[0] = Player 1, hands[1] = Player 2
        self.chain = []              # list of (high, low, side_played) tuples
        self.left_end = None         # pip value at left end of chain
        self.right_end = None        # pip value at right end of chain
        self.boneyard = []           # remaining tiles (draw variation)
        self.scores = [0, 0]
        self.passed = [False, False] # track consecutive passes for block detection
        self._last_action = None     # track last action for draw/switch logic

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Create double-six set, shuffle, deal 7 tiles each."""
        tiles = []
        for i in range(7):
            for j in range(i, 7):
                tiles.append((i, j))
        random.shuffle(tiles)

        self.hands[0] = tiles[0:7]
        self.hands[1] = tiles[7:14]
        self.boneyard = tiles[14:]
        self.chain = []
        self.left_end = None
        self.right_end = None
        self.scores = [0, 0]
        self.passed = [False, False]

    # ---------------------------------------------------------------- display
    def display(self):
        """Display board, chain, and current player's hand."""
        var_label = "Block Game" if self.variation == "block" else "Draw Game"
        print(f"\n  === Dominoes ({var_label}) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Show tile counts for opponent
        opp = 2 if self.current_player == 1 else 1
        print(f"  {self.players[opp - 1]} has {len(self.hands[opp - 1])} tile(s)")
        if self.variation == "draw":
            print(f"  Boneyard: {len(self.boneyard)} tile(s)")
        print()

        # Show the chain
        self._display_chain()
        print()

        # Show current player's hand
        hand = self.hands[self.current_player - 1]
        print(f"  {self.players[self.current_player - 1]}'s hand:")
        if hand:
            tiles_str = "  "
            for i, (a, b) in enumerate(hand):
                tiles_str += f"  [{a}|{b}]"
            print(tiles_str)
        else:
            print("    (empty)")
        print()

        # Show ends
        if self.chain:
            print(f"  Left end: {self.left_end}   Right end: {self.right_end}")
            print()

    def _display_chain(self):
        """Render the chain of played tiles."""
        if not self.chain:
            print("  Board: (empty - play first tile)")
            return

        print("  Board:")
        # Build a text representation of the chain
        # Doubles shown as [X], others as [a|b]
        parts = []
        for a, b, is_double in self.chain:
            if is_double:
                parts.append(f"[{a}]")
            else:
                parts.append(f"[{a}|{b}]")

        # Display chain in rows if it gets long
        line = "  "
        lines = []
        for p in parts:
            if len(line) + len(p) + 1 > 76:
                lines.append(line)
                line = "  "
            line += p + " "
        if line.strip():
            lines.append(line)
        for ln in lines:
            print(ln)

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get tile and side from current player.

        Returns:
            dict with keys:
                'action': 'play' | 'draw' | 'pass'
                'tile': (a, b) for play
                'side': 'left' | 'right' for play
        """
        hand = self.hands[self.current_player - 1]

        # Check if player can play any tile
        can_play = self._can_play(hand)

        while True:
            if not self.chain:
                prompt = f"  Play a tile (e.g. '3-5'): "
            elif can_play:
                prompt = f"  Play a tile and side (e.g. '3-5 left' or '3-5 right'): "
            elif self.variation == "draw" and self.boneyard:
                prompt = f"  No playable tiles. Type 'draw' to draw from boneyard: "
            else:
                prompt = f"  No playable tiles. Type 'pass' to pass: "

            raw = input_with_quit(prompt).strip().lower()

            # Handle draw
            if raw == "draw":
                if self.variation != "draw":
                    print("  Drawing is not allowed in Block Game. Type 'pass' to pass.")
                    continue
                if not self.boneyard:
                    print("  Boneyard is empty. Type 'pass' to pass.")
                    continue
                return {"action": "draw"}

            # Handle pass
            if raw == "pass":
                if can_play:
                    print("  You have playable tiles - you must play one.")
                    continue
                if self.variation == "draw" and self.boneyard:
                    print("  You must draw from the boneyard first.")
                    continue
                return {"action": "pass"}

            # Parse tile play: "3-5 left" or "3-5 right" or just "3-5" for first tile
            parts = raw.split()
            if not parts:
                print("  Invalid input. Enter tile as 'a-b side' (e.g. '3-5 left').")
                continue

            tile_str = parts[0]
            # Parse tile
            tile_parts = tile_str.replace("|", "-").split("-")
            if len(tile_parts) != 2:
                print("  Invalid tile format. Use 'a-b' (e.g. '3-5').")
                continue
            try:
                a, b = int(tile_parts[0]), int(tile_parts[1])
            except ValueError:
                print("  Invalid tile format. Use numbers (e.g. '3-5').")
                continue

            # Normalize: check if player has this tile in either orientation
            tile = None
            if (a, b) in hand:
                tile = (a, b)
            elif (b, a) in hand:
                tile = (b, a)
            else:
                print(f"  You don't have tile [{a}|{b}].")
                continue

            # Determine side
            if not self.chain:
                # First tile - no side needed
                return {"action": "play", "tile": tile, "side": "right"}

            if len(parts) >= 2:
                side = parts[1]
                if side not in ("left", "right", "l", "r"):
                    print("  Side must be 'left' or 'right'.")
                    continue
                side = "left" if side in ("left", "l") else "right"
            else:
                # Try to figure out which side works
                left_ok = self._tile_matches(tile, self.left_end)
                right_ok = self._tile_matches(tile, self.right_end)
                if left_ok and right_ok:
                    print("  Tile can go on either side. Specify 'left' or 'right'.")
                    continue
                elif left_ok:
                    side = "left"
                elif right_ok:
                    side = "right"
                else:
                    print(f"  Tile [{tile[0]}|{tile[1]}] doesn't match either end.")
                    continue

            # Validate the tile matches the chosen side
            end_val = self.left_end if side == "left" else self.right_end
            if not self._tile_matches(tile, end_val):
                print(f"  Tile [{tile[0]}|{tile[1]}] doesn't match the {side} end ({end_val}).")
                continue

            return {"action": "play", "tile": tile, "side": side}

    def _tile_matches(self, tile, end_value):
        """Check if a tile can be played against an end value."""
        return tile[0] == end_value or tile[1] == end_value

    def _can_play(self, hand):
        """Check if any tile in hand can be played."""
        if not self.chain:
            return len(hand) > 0
        for tile in hand:
            if self._tile_matches(tile, self.left_end) or self._tile_matches(tile, self.right_end):
                return True
        return False

    def switch_player(self):
        """Override to prevent switching after a draw action."""
        # After drawing, player should get another chance to play
        # We detect this by checking if the last move was a draw
        # The move_history won't have 'draw' yet at this point since
        # play() appends after make_move but before switch_player
        # We use a simpler approach: check if last recorded action was draw
        if hasattr(self, '_last_action') and self._last_action == 'draw':
            self._last_action = None
            return
        super().switch_player()

    # ------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        action = move["action"]
        player_idx = self.current_player - 1
        self._last_action = action

        if action == "draw":
            if not self.boneyard:
                return False
            drawn = self.boneyard.pop()
            self.hands[player_idx].append(drawn)
            print(f"  Drew tile [{drawn[0]}|{drawn[1]}]")
            self.passed[player_idx] = False
            input("  Press Enter to continue...")
            return True

        if action == "pass":
            self.passed[player_idx] = True
            return True

        if action == "play":
            tile = move["tile"]
            side = move["side"]

            # Remove tile from hand
            self.hands[player_idx].remove(tile)
            self.passed[player_idx] = False

            is_double = (tile[0] == tile[1])

            if not self.chain:
                # First tile played
                self.chain.append((tile[0], tile[1], is_double))
                self.left_end = tile[0]
                self.right_end = tile[1]
                return True

            if side == "left":
                end_val = self.left_end
                if tile[1] == end_val:
                    oriented = (tile[0], tile[1], is_double)
                    self.left_end = tile[0]
                else:
                    oriented = (tile[1], tile[0], is_double)
                    self.left_end = tile[1]
                self.chain.insert(0, oriented)
            else:  # right
                end_val = self.right_end
                if tile[0] == end_val:
                    oriented = (tile[0], tile[1], is_double)
                    self.right_end = tile[1]
                else:
                    oriented = (tile[1], tile[0], is_double)
                    self.right_end = tile[0]
                self.chain.append(oriented)

            return True

        return False

    # ---------------------------------------------------- check_game_over
    def check_game_over(self):
        """Game ends when a player empties their hand or both are blocked."""
        # Player emptied hand
        for i in range(2):
            if len(self.hands[i]) == 0:
                self.game_over = True
                # Winner is the player who went out
                self.winner = i + 1
                # Score: winner gets the difference in pip totals
                opp = 1 - i
                opp_pips = sum(a + b for a, b in self.hands[opp])
                winner_pips = 0  # hand is empty
                self.scores[i] += opp_pips - winner_pips
                return

        # Check for blocked game
        if not self.chain:
            return

        p1_can = self._can_play(self.hands[0])
        p2_can = self._can_play(self.hands[1])

        if self.variation == "block":
            # In block game, if neither can play, game is blocked
            if not p1_can and not p2_can:
                self._end_blocked_game()
        elif self.variation == "draw":
            # In draw game, blocked only if neither can play AND boneyard empty
            if not p1_can and not p2_can and not self.boneyard:
                self._end_blocked_game()

    def _end_blocked_game(self):
        """End a blocked game - lowest pip count wins."""
        self.game_over = True
        p1_pips = sum(a + b for a, b in self.hands[0])
        p2_pips = sum(a + b for a, b in self.hands[1])

        if p1_pips < p2_pips:
            self.winner = 1
            self.scores[0] += p2_pips - p1_pips
        elif p2_pips < p1_pips:
            self.winner = 2
            self.scores[1] += p1_pips - p2_pips
        else:
            self.winner = None  # draw

    # --------------------------------------------------------- get_state
    def get_state(self):
        """Return serializable game state."""
        return {
            "hands": [list(h) for h in self.hands],
            "chain": list(self.chain),
            "left_end": self.left_end,
            "right_end": self.right_end,
            "boneyard": list(self.boneyard),
            "scores": list(self.scores),
            "passed": list(self.passed),
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.hands = [[(a, b) for a, b in h] for h in state["hands"]]
        self.chain = [(a, b, c) for a, b, c in state["chain"]]
        self.left_end = state["left_end"]
        self.right_end = state["right_end"]
        self.boneyard = [(a, b) for a, b in state["boneyard"]]
        self.scores = list(state["scores"])
        self.passed = list(state.get("passed", [False, False]))

    # --------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial text."""
        return """
==============================================================
                   DOMINOES  TUTORIAL
==============================================================

OVERVIEW
  Dominoes is a classic tile-matching game played with
  rectangular tiles. Each tile has two ends, each marked
  with a number of pips (dots) from 0 to 6. A standard
  double-six set has 28 tiles.

--------------------------------------------------------------
SETUP
--------------------------------------------------------------
  The tiles are shuffled face-down. Each player draws 7
  tiles. In the Draw variation, remaining tiles form the
  "boneyard" (draw pile). In the Block variation, all
  remaining tiles are set aside and not used.

--------------------------------------------------------------
GAMEPLAY
--------------------------------------------------------------
  Players take turns placing one tile from their hand onto
  either end of the chain on the table. The tile must match
  the pip value on the open end where it is played.

  For example, if the chain ends look like this:

    [3|5] [5|2] [2|2] [2|6]

  The left end shows 3 and the right end shows 6. You can
  play any tile with a 3 on the left side or any tile with
  a 6 on the right side.

  DOUBLES (tiles like [3|3]) are played crosswise and are
  displayed differently in the chain.

--------------------------------------------------------------
BLOCK GAME
--------------------------------------------------------------
  If you cannot play any tile from your hand, you must pass
  your turn. If both players pass consecutively, the game
  is blocked and ends.

--------------------------------------------------------------
DRAW GAME
--------------------------------------------------------------
  If you cannot play any tile from your hand, you must draw
  tiles one at a time from the boneyard until you get one
  you can play, or the boneyard runs out. If the boneyard
  is empty and you still cannot play, you pass.

--------------------------------------------------------------
INPUT FORMAT
--------------------------------------------------------------
  To play a tile, enter it as:
    a-b side       (e.g. '3-5 left' or '3-5 right')

  You can abbreviate sides:
    a-b l          (left)
    a-b r          (right)

  If the tile only fits one side, you can omit the side:
    a-b            (auto-detects the matching side)

  For the very first tile, no side is needed:
    a-b

  To draw from the boneyard (Draw Game only):
    draw

  To pass when you cannot play:
    pass

--------------------------------------------------------------
SCORING
--------------------------------------------------------------
  When a player plays their last tile, they win the round.
  The winner scores the total pip count remaining in the
  opponent's hand.

  When the game is blocked (no one can play), the player
  with the lowest remaining pip count wins. The winner
  scores the difference in pip totals.

  If both players have equal pip counts in a blocked game,
  the round is a draw.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Track which pip values have been played and which remain.
  - Try to keep a variety of pip values in your hand.
  - Play doubles early since they are harder to match.
  - In Block Game, try to force your opponent to pass by
    controlling which pip values are at the ends.
  - In Draw Game, avoid drawing if possible; a larger hand
    means more pips if the game blocks.
  - Pay attention to what your opponent draws or passes on
    to deduce what they are holding.
==============================================================
"""
