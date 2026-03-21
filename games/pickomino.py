"""Pickomino (Heckmeck) - A push-your-luck dice game about collecting worm tiles."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Tile definitions: value -> worm count
def _worms_for_tile(value):
    """Return the number of worms a tile is worth."""
    if 21 <= value <= 24:
        return 1
    if 25 <= value <= 28:
        return 2
    if 29 <= value <= 32:
        return 3
    if 33 <= value <= 36:
        return 4
    return 0


# Dice faces: 1, 2, 3, 4, 5, W (worm)
FACE_NAMES = ['1', '2', '3', '4', '5', 'worm']
FACE_VALUES = {'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, 'worm': 5}

DICE_ART = {
    1: ["+-------+", "|       |", "|   *   |", "|       |", "+-------+"],
    2: ["+-------+", "| *     |", "|       |", "|     * |", "+-------+"],
    3: ["+-------+", "| *     |", "|   *   |", "|     * |", "+-------+"],
    4: ["+-------+", "| *   * |", "|       |", "| *   * |", "+-------+"],
    5: ["+-------+", "| *   * |", "|   *   |", "| *   * |", "+-------+"],
    'worm': ["+-------+", "| ~~~~  |", "|  ~~~~ |", "| ~~~~  |", "+-------+"],
}


def _roll_die():
    """Roll one Pickomino die, returning a face name."""
    r = random.randint(1, 6)
    if r == 6:
        return 'worm'
    return str(r)


def _render_dice_row(faces, label=""):
    """Render a row of dice as ASCII art. Returns list of strings."""
    if not faces:
        return [f"  {label}(none)"]
    lines = []
    if label:
        lines.append(f"  {label}")
    for row in range(5):
        parts = []
        for f in faces:
            key = f if f == 'worm' else int(f)
            parts.append(DICE_ART[key][row])
        lines.append("  " + "  ".join(parts))
    return lines


class PickominoGame(BaseGame):
    """Pickomino (Heckmeck) - push-your-luck dice game for 2 players."""

    name = "Pickomino"
    description = "Push-your-luck dice game - collect tiles with the most worms"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Pickomino",
        "simple": "Simple (fewer tiles)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Center tiles: list of tile values (face-up), sorted
        self.center_tiles = []
        # Face-down tiles (removed from game)
        self.facedown_tiles = []
        # Player stacks: {1: [tiles], 2: [tiles]} - last element is top
        self.player_stacks = {1: [], 2: []}
        # Turn state
        self.num_dice = 8
        self.available_dice = 0
        self.kept_dice = []          # list of face names kept so far
        self.chosen_faces = []       # face values already chosen this turn
        self.current_roll = []       # current roll result (face names)
        self.has_rolled = False
        self.turn_phase = 'roll'     # 'roll', 'choose', 'decide'
        self.bust = False

    def setup(self):
        """Initialize tiles and game state."""
        if self.variation == 'simple':
            self.center_tiles = list(range(21, 29))  # 21-28
            self.num_dice = 6
        else:
            self.center_tiles = list(range(21, 37))  # 21-36
            self.num_dice = 8

        self.facedown_tiles = []
        self.player_stacks = {1: [], 2: []}
        self.available_dice = self.num_dice
        self.kept_dice = []
        self.chosen_faces = []
        self.current_roll = []
        self.has_rolled = False
        self.turn_phase = 'roll'
        self.bust = False
        self.game_over = False
        self.winner = None

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _render_center(self):
        """Render the center tiles display."""
        lines = []
        lines.append("  CENTER TILES:")
        if not self.center_tiles:
            lines.append("    (empty)")
        else:
            row = "    "
            for t in sorted(self.center_tiles):
                w = _worms_for_tile(t)
                worm_str = "~" * w
                row += f"[{t}:{worm_str}] "
            lines.append(row)
        if self.facedown_tiles:
            lines.append(f"    Face-down (out of game): {sorted(self.facedown_tiles)}")
        return "\n".join(lines)

    def _render_player_stack(self, player):
        """Render a player's tile stack."""
        stack = self.player_stacks[player]
        if not stack:
            return f"    (no tiles)"
        parts = []
        for t in stack:
            w = _worms_for_tile(t)
            worm_str = "~" * w
            parts.append(f"[{t}:{worm_str}]")
        return "    " + " ".join(parts)

    def _total_worms(self, player):
        """Total worms for a player."""
        return sum(_worms_for_tile(t) for t in self.player_stacks[player])

    def _kept_total(self):
        """Sum of all kept dice."""
        return sum(FACE_VALUES[f] for f in self.kept_dice)

    def _has_worm_kept(self):
        """Check if at least one worm die is among kept dice."""
        return 'worm' in self.kept_dice

    def display(self):
        """Show the full game state."""
        print(f"\n{'=' * 60}")
        print(f"  PICKOMINO (Heckmeck)  -  "
              f"{self.players[self.current_player - 1]}'s turn")
        print(f"{'=' * 60}\n")

        # Center tiles
        print(self._render_center())
        print()

        # Player stacks
        for p in (1, 2):
            worms = self._total_worms(p)
            marker = " <--" if p == self.current_player else ""
            print(f"  {self.players[p - 1]} ({worms} worms):{marker}")
            print(self._render_player_stack(p))
        print()

        # Kept dice
        if self.kept_dice:
            kept_lines = _render_dice_row(self.kept_dice,
                                          f"Kept dice (total: {self._kept_total()}, "
                                          f"worm: {'YES' if self._has_worm_kept() else 'NO'}):")
            for line in kept_lines:
                print(line)
            print(f"    Chosen faces so far: {', '.join(self.chosen_faces)}")
            print()

        # Current roll
        if self.current_roll:
            roll_lines = _render_dice_row(self.current_roll, "Current roll:")
            for line in roll_lines:
                print(line)
            print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get the player's action for the current turn phase."""
        # Full turn is handled inside make_move via _play_turn
        return 'start_turn'

    def make_move(self, move):
        """Execute a full turn for the current player."""
        self._play_turn()
        return True

    def _play_turn(self):
        """Run one complete turn for the current player, with rolling and choosing."""
        self.available_dice = self.num_dice
        self.kept_dice = []
        self.chosen_faces = []
        self.current_roll = []
        self.bust = False

        while True:
            # Roll available dice
            self.current_roll = [_roll_die() for _ in range(self.available_dice)]

            clear_screen()
            self.display()

            # Check if any unchosen face is available in the roll
            available_faces = set(self.current_roll) - set(self.chosen_faces)
            if not available_faces:
                print("  *** BUST! No new face value available in your roll! ***")
                input("  Press Enter to continue...")
                self._handle_bust()
                return

            # Choose a face value
            while True:
                prompt = (f"  {self.players[self.current_player - 1]}, "
                          f"choose a face to keep (1-5 or 'worm'): ")
                try:
                    raw = input_with_quit(prompt).strip().lower()
                except (KeyboardInterrupt, EOFError):
                    raise

                if raw in ('w', 'worm'):
                    raw = 'worm'
                elif raw in ('1', '2', '3', '4', '5'):
                    pass
                else:
                    print("  Invalid choice. Enter 1-5 or 'worm'.")
                    continue

                if raw in self.chosen_faces:
                    print(f"  You already chose '{raw}' this turn! Pick a different face.")
                    continue

                if raw not in self.current_roll:
                    print(f"  No dice showing '{raw}' in your roll!")
                    continue

                # Valid choice
                chosen_face = raw
                break

            # Set aside all dice of that face
            count = self.current_roll.count(chosen_face)
            self.kept_dice.extend([chosen_face] * count)
            self.chosen_faces.append(chosen_face)
            self.available_dice -= count
            self.current_roll = []

            # Check if all dice are used
            if self.available_dice == 0:
                clear_screen()
                self.display()
                print(f"  All dice have been set aside! Total: {self._kept_total()}")
                if self._has_worm_kept():
                    self._claim_tile()
                else:
                    print("  *** BUST! No worm dice kept - cannot claim a tile! ***")
                    input("  Press Enter to continue...")
                    self._handle_bust()
                return

            # Decide: continue rolling or stop
            clear_screen()
            self.display()

            while True:
                prompt = (f"  'roll' to continue rolling ({self.available_dice} dice), "
                          f"or 'stop' to claim a tile (total: {self._kept_total()}): ")
                try:
                    raw = input_with_quit(prompt).strip().lower()
                except (KeyboardInterrupt, EOFError):
                    raise

                if raw == 'roll':
                    break  # continue outer loop
                elif raw == 'stop':
                    if not self._has_worm_kept():
                        print("  You need at least one worm die to claim a tile!")
                        print("  You must continue rolling or bust.")
                        continue
                    self._claim_tile()
                    return
                else:
                    print("  Enter 'roll' or 'stop'.")

    def _claim_tile(self):
        """Attempt to claim a tile with the current kept dice total."""
        total = self._kept_total()
        has_worm = self._has_worm_kept()

        if not has_worm:
            print("  *** BUST! No worm dice - cannot claim! ***")
            input("  Press Enter to continue...")
            self._handle_bust()
            return

        clear_screen()
        self.display()

        # Check if can steal from opponent
        opponent = 2 if self.current_player == 1 else 1
        can_steal = (self.player_stacks[opponent]
                     and self.player_stacks[opponent][-1] == total)

        # Check available center tiles
        available = [t for t in sorted(self.center_tiles) if t <= total]

        if not available and not can_steal:
            print(f"  *** BUST! No tile available for total {total}! ***")
            input("  Press Enter to continue...")
            self._handle_bust()
            return

        # If exact match for steal, offer choice
        if can_steal and available:
            while True:
                print(f"  Your total: {total}")
                print(f"  You can STEAL {self.players[opponent - 1]}'s top tile [{total}]")
                best_center = available[-1]
                print(f"  Or take center tile [{best_center}]")
                prompt = f"  Type 'steal' or 'center': "
                try:
                    raw = input_with_quit(prompt).strip().lower()
                except (KeyboardInterrupt, EOFError):
                    raise
                if raw == 'steal':
                    tile = self.player_stacks[opponent].pop()
                    self.player_stacks[self.current_player].append(tile)
                    print(f"  Stole tile [{tile}] from {self.players[opponent - 1]}!")
                    input("  Press Enter to continue...")
                    return
                elif raw == 'center':
                    tile = best_center
                    self.center_tiles.remove(tile)
                    self.player_stacks[self.current_player].append(tile)
                    print(f"  Claimed tile [{tile}] ({_worms_for_tile(tile)} worms)!")
                    input("  Press Enter to continue...")
                    return
                else:
                    print("  Enter 'steal' or 'center'.")
        elif can_steal:
            tile = self.player_stacks[opponent].pop()
            self.player_stacks[self.current_player].append(tile)
            print(f"  Stole tile [{tile}] from {self.players[opponent - 1]}!")
            input("  Press Enter to continue...")
        else:
            # Take highest available center tile <= total
            tile = available[-1]
            self.center_tiles.remove(tile)
            self.player_stacks[self.current_player].append(tile)
            print(f"  Claimed tile [{tile}] ({_worms_for_tile(tile)} worms)!")
            input("  Press Enter to continue...")

    def _handle_bust(self):
        """Handle a bust: lose top tile, highest center tile goes face-down."""
        stack = self.player_stacks[self.current_player]
        if stack:
            lost_tile = stack.pop()
            self.center_tiles.append(lost_tile)
            self.center_tiles.sort()
            print(f"  Tile [{lost_tile}] returned to center.")

        # Highest face-up center tile goes face-down
        if self.center_tiles:
            highest = max(self.center_tiles)
            self.center_tiles.remove(highest)
            self.facedown_tiles.append(highest)
            print(f"  Tile [{highest}] flipped face-down (removed from game).")
            input("  Press Enter to continue...")

    # ------------------------------------------------------------------ #
    #  Game over
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Game ends when all center tiles are gone (claimed or face-down)."""
        if not self.center_tiles:
            self.game_over = True
            w1 = self._total_worms(1)
            w2 = self._total_worms(2)
            if w1 > w2:
                self.winner = 1
            elif w2 > w1:
                self.winner = 2
            else:
                self.winner = None  # draw

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        return {
            'center_tiles': self.center_tiles,
            'facedown_tiles': self.facedown_tiles,
            'player_stacks': {str(k): v for k, v in self.player_stacks.items()},
            'num_dice': self.num_dice,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.center_tiles = state['center_tiles']
        self.facedown_tiles = state['facedown_tiles']
        self.player_stacks = {int(k): v for k, v in state['player_stacks'].items()}
        self.num_dice = state['num_dice']
        # Reset turn state for fresh turn
        self.available_dice = self.num_dice
        self.kept_dice = []
        self.chosen_faces = []
        self.current_roll = []
        self.has_rolled = False
        self.bust = False

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return tutorial text for Pickomino."""
        txt = """
==================================================
  PICKOMINO (HECKMECK) TUTORIAL
==================================================

OVERVIEW:
  Pickomino is a push-your-luck dice game where
  players roll dice to collect tiles worth worms.
  The player with the most worms wins!

COMPONENTS:
  - 16 tiles in the center, valued 21-36
    21-24 = 1 worm each
    25-28 = 2 worms each
    29-32 = 3 worms each
    33-36 = 4 worms each
  - 8 dice with faces: 1, 2, 3, 4, 5, worm
    (worm counts as 5 when summing)

ON YOUR TURN:
  1. Roll all 8 dice
  2. Choose one face value (1-5 or worm) and set
     aside ALL dice showing that value
  3. Roll the remaining dice
  4. Choose a DIFFERENT face value and set aside
     all dice of that value
  5. Continue until you stop or bust

CLAIMING A TILE:
  - You must have at least one WORM die set aside
  - Your total must match a center tile exactly,
    or you take the highest available tile <= total
  - You can STEAL the TOP tile from your opponent's
    stack if your total matches it exactly

BUSTING:
  You bust if:
  - You roll and no new face value is available
  - You stop but have no worm dice
  If you bust:
  - You lose the top tile from your stack (it goes
    back to the center)
  - The highest center tile is flipped face-down
    (removed from the game)

GAME END:
  The game ends when all center tiles are claimed
  or flipped face-down. Most worms wins!
"""
        if self.variation == 'simple':
            txt += """
SIMPLE VARIANT:
  - Only tiles 21-28 (8 tiles instead of 16)
  - Only 6 dice instead of 8
  - Faster, simpler game!
"""
        txt += """
COMMANDS:
  1-5 / worm     - Choose a face value to keep
  roll           - Continue rolling remaining dice
  stop           - Stop and claim a tile
  steal / center - Choose when both options available

  quit / q       - Quit the game
  save / s       - Save and suspend
  help / h       - Show help
  tutorial / t   - Show this tutorial
==================================================
"""
        return txt
