"""Patchwork - A two-player quilt-building board game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Patches: (button_cost, time_cost, button_income, shape)
# Shape is a list of (row, col) offsets representing filled cells
STANDARD_PATCHES = [
    (2, 1, 0, [(0, 0), (0, 1)]),
    (3, 2, 1, [(0, 0), (0, 1), (1, 0)]),
    (1, 2, 0, [(0, 0), (1, 0), (2, 0)]),
    (2, 2, 0, [(0, 0), (0, 1), (1, 0), (1, 1)]),
    (3, 3, 1, [(0, 0), (0, 1), (0, 2), (1, 1)]),
    (7, 1, 1, [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)]),
    (1, 3, 0, [(0, 0), (0, 1), (1, 1), (2, 1)]),
    (5, 4, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1)]),
    (10, 3, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0)]),
    (4, 2, 1, [(0, 0), (0, 1), (0, 2)]),
    (2, 3, 1, [(0, 0), (1, 0), (1, 1)]),
    (1, 2, 0, [(0, 0), (0, 1)]),
    (3, 4, 1, [(0, 0), (0, 1), (1, 0), (2, 0), (2, 1)]),
    (7, 2, 2, [(0, 0), (0, 1), (0, 2), (0, 3)]),
    (5, 3, 1, [(0, 0), (0, 1), (1, 1), (2, 1), (2, 2)]),
    (10, 5, 3, [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2)]),
    (1, 4, 1, [(0, 0), (1, 0), (2, 0), (3, 0)]),
    (2, 2, 0, [(0, 0), (0, 1), (1, 1)]),
    (3, 6, 2, [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (2, 1)]),
    (4, 2, 0, [(0, 0), (0, 1), (0, 2), (1, 1)]),
    (5, 5, 2, [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)]),
    (0, 3, 1, [(0, 0), (1, 0)]),
    (1, 2, 0, [(0, 0)]),
    (2, 1, 0, [(0, 0), (1, 0)]),
    (7, 4, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1)]),
    (8, 6, 3, [(0, 0), (0, 1), (0, 2), (0, 3), (1, 0), (1, 1)]),
    (6, 5, 2, [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)]),
    (3, 1, 0, [(0, 0), (0, 1), (1, 0)]),
    (10, 4, 3, [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (2, 0)]),
    (4, 6, 2, [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0), (2, 1)]),
    (2, 3, 0, [(0, 0), (0, 1), (0, 2), (1, 0)]),
    (5, 4, 2, [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)]),
    (1, 5, 1, [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]),
]

# Simpler set for simple variation
SIMPLE_PATCHES = [
    (1, 1, 0, [(0, 0), (0, 1)]),
    (2, 2, 1, [(0, 0), (0, 1), (1, 0)]),
    (1, 2, 0, [(0, 0), (1, 0), (2, 0)]),
    (2, 2, 0, [(0, 0), (0, 1), (1, 0), (1, 1)]),
    (3, 3, 1, [(0, 0), (0, 1), (0, 2), (1, 1)]),
    (5, 3, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1)]),
    (4, 2, 1, [(0, 0), (0, 1), (0, 2)]),
    (1, 2, 0, [(0, 0), (0, 1)]),
    (3, 3, 1, [(0, 0), (0, 1), (1, 0), (2, 0), (2, 1)]),
    (5, 2, 2, [(0, 0), (0, 1), (0, 2), (0, 3)]),
    (2, 4, 1, [(0, 0), (0, 1), (1, 1), (2, 1), (2, 2)]),
    (0, 3, 1, [(0, 0), (1, 0)]),
    (1, 2, 0, [(0, 0)]),
    (6, 4, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (2, 0), (2, 1)]),
    (3, 5, 1, [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)]),
    (7, 3, 2, [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2)]),
    (1, 3, 0, [(0, 0), (1, 0), (1, 1)]),
    (4, 2, 1, [(0, 0), (0, 1), (1, 1)]),
    (2, 1, 0, [(0, 0), (1, 0)]),
    (3, 4, 1, [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0)]),
]

# Time track length
STANDARD_TRACK_LENGTH = 54
SIMPLE_TRACK_LENGTH = 40

# Button income marker positions on the time track (0-indexed)
STANDARD_BUTTON_MARKERS = [5, 11, 17, 23, 29, 35, 41, 47, 53]
SIMPLE_BUTTON_MARKERS = [5, 11, 17, 23, 29, 35, 39]

# 1x1 leather patch positions on time track (0-indexed)
STANDARD_LEATHER_PATCHES = [20, 26, 32, 44, 50]
SIMPLE_LEATHER_PATCHES = [15, 24, 33]


class PatchworkGame(BaseGame):
    """Patchwork: A two-player quilt-building board game."""

    name = "Patchwork"
    description = "A two-player quilt-building board game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Patchwork (9x9 board)",
        "simple": "Simplified (fewer patches, 7x7 board)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.board_size = 9
        self.track_length = STANDARD_TRACK_LENGTH
        self.button_markers = list(STANDARD_BUTTON_MARKERS)
        self.leather_positions = list(STANDARD_LEATHER_PATCHES)
        self.patches = []
        self.patch_marker = 0  # index into circular patch list
        # Per-player state (indexed 0 and 1)
        self.quilts = [[], []]  # each: board_size x board_size bool grid
        self.buttons = [5, 5]  # starting buttons
        self.positions = [0, 0]  # position on time track
        self.button_income = [0, 0]  # accumulated button income from patches
        self.bonus_tile_claimed = None  # player index who claimed 7x7 bonus (or None)

    def setup(self):
        """Initialize the game for a new session."""
        if self.variation == "simple":
            self.board_size = 7
            self.track_length = SIMPLE_TRACK_LENGTH
            self.button_markers = list(SIMPLE_BUTTON_MARKERS)
            self.leather_positions = list(SIMPLE_LEATHER_PATCHES)
            self.patches = [list(p) for p in SIMPLE_PATCHES]
        else:
            self.board_size = 9
            self.track_length = STANDARD_TRACK_LENGTH
            self.button_markers = list(STANDARD_BUTTON_MARKERS)
            self.leather_positions = list(STANDARD_LEATHER_PATCHES)
            self.patches = [list(p) for p in STANDARD_PATCHES]

        random.shuffle(self.patches)
        self.patch_marker = 0

        self.quilts = [
            [[False] * self.board_size for _ in range(self.board_size)]
            for _ in range(2)
        ]
        self.buttons = [5, 5]
        self.positions = [0, 0]
        self.button_income = [0, 0]
        self.bonus_tile_claimed = None
        self.current_player = 1

    def _get_active_player(self):
        """Return 0-indexed player who is behind (or current player on tie)."""
        if self.positions[0] < self.positions[1]:
            return 0
        elif self.positions[1] < self.positions[0]:
            return 1
        else:
            # On tie, current_player goes (the one who got there last stays)
            return self.current_player - 1

    def _available_patches(self):
        """Return the 3 patches available from the current marker position."""
        if not self.patches:
            return []
        available = []
        n = len(self.patches)
        for i in range(min(3, n)):
            idx = (self.patch_marker + i) % n
            available.append((idx, self.patches[idx]))
        return available

    def _can_place_patch(self, p, shape, row_off, col_off):
        """Check if a patch shape can be placed at given offset on player p's quilt."""
        for r, c in shape:
            nr, nc = r + row_off, c + col_off
            if nr < 0 or nr >= self.board_size or nc < 0 or nc >= self.board_size:
                return False
            if self.quilts[p][nr][nc]:
                return False
        return True

    def _place_patch(self, p, shape, row_off, col_off):
        """Place a patch on the quilt."""
        for r, c in shape:
            self.quilts[p][r + row_off][c + col_off] = True

    def _rotate_shape(self, shape, times=1):
        """Rotate a shape 90 degrees clockwise, the given number of times."""
        s = list(shape)
        for _ in range(times % 4):
            s = [(c, -r) for r, c in s]
            # Normalize to non-negative coordinates
            min_r = min(r for r, c in s)
            min_c = min(c for r, c in s)
            s = [(r - min_r, c - min_c) for r, c in s]
        return s

    def _flip_shape(self, shape):
        """Flip a shape horizontally."""
        s = [(r, -c) for r, c in shape]
        min_c = min(c for r, c in s)
        s = [(r, c - min_c) for r, c in s]
        return s

    def _transform_shape(self, shape, rotation, flip):
        """Apply rotation (0-3) and optional flip to a shape."""
        s = list(shape)
        if flip:
            s = self._flip_shape(s)
        s = self._rotate_shape(s, rotation)
        return s

    def _has_any_valid_placement(self, p, shape):
        """Check if any placement exists for this shape on player p's quilt."""
        for rot in range(4):
            for flip in [False, True]:
                transformed = self._transform_shape(shape, rot, flip)
                for row_off in range(self.board_size):
                    for col_off in range(self.board_size):
                        if self._can_place_patch(p, transformed, row_off, col_off):
                            return True
        return False

    def _check_7x7_bonus(self, p):
        """Check if player p has completed any 7x7 area on their quilt."""
        if self.bonus_tile_claimed is not None:
            return
        if self.board_size < 7:
            return
        for sr in range(self.board_size - 6):
            for sc in range(self.board_size - 6):
                filled = True
                for r in range(sr, sr + 7):
                    for c in range(sc, sc + 7):
                        if not self.quilts[p][r][c]:
                            filled = False
                            break
                    if not filled:
                        break
                if filled:
                    self.bonus_tile_claimed = p
                    return

    def _count_empty_spaces(self, p):
        """Count empty spaces on player p's quilt."""
        count = 0
        for row in self.quilts[p]:
            for cell in row:
                if not cell:
                    count += 1
        return count

    def _advance_and_collect(self, p, new_pos):
        """Advance player p to new_pos, collecting button income and leather patches."""
        old_pos = self.positions[p]
        # Collect button income for each button marker passed
        for marker in self.button_markers:
            if old_pos < marker <= new_pos:
                self.buttons[p] += self.button_income[p]
        # Collect leather patches (1x1) for each leather position passed
        for lpos in list(self.leather_positions):
            if old_pos < lpos <= new_pos:
                # Award a 1x1 leather patch - place in first empty space
                self._place_1x1_patch(p)
                self.leather_positions.remove(lpos)
        self.positions[p] = min(new_pos, self.track_length)

    def _place_1x1_patch(self, p):
        """Place a 1x1 leather patch on the first available space."""
        for r in range(self.board_size):
            for c in range(self.board_size):
                if not self.quilts[p][r][c]:
                    self.quilts[p][r][c] = True
                    self._check_7x7_bonus(p)
                    return

    def _shape_to_ascii(self, shape):
        """Convert a shape to a small ASCII representation."""
        if not shape:
            return "?"
        max_r = max(r for r, c in shape)
        max_c = max(c for r, c in shape)
        grid = [['.' for _ in range(max_c + 1)] for _ in range(max_r + 1)]
        for r, c in shape:
            grid[r][c] = '#'
        return '  '.join([''.join(row) for row in grid])

    def display(self):
        """Display the full game state."""
        var_label = "Standard" if self.variation != "simple" else "Simple"
        active = self._get_active_player()
        print(f"\n  === Patchwork ({var_label}) ===")
        print(f"  {self.players[0]} (P1): {self.buttons[0]} buttons, pos {self.positions[0]}/{self.track_length}   |   "
              f"{self.players[1]} (P2): {self.buttons[1]} buttons, pos {self.positions[1]}/{self.track_length}")
        print(f"  Current turn: {self.players[active]} (player behind goes)")

        # Time track summary
        self._display_time_track()

        # Available patches
        print("\n  --- Available Patches ---")
        available = self._available_patches()
        if available:
            for i, (idx, patch) in enumerate(available):
                cost, time_cost, income, shape = patch
                shape_str = self._shape_to_ascii(shape)
                affordable = "OK" if self.buttons[active] >= cost else "!!"
                print(f"  Patch {i + 1}: Cost={cost} buttons, Time={time_cost}, Income={income}  "
                      f"[{affordable}]  Shape: {shape_str}")
        else:
            print("  No patches remaining.")

        # Bonus tile
        if self.bonus_tile_claimed is not None:
            print(f"\n  7x7 Bonus Tile: Claimed by {self.players[self.bonus_tile_claimed]}")
        else:
            print(f"\n  7x7 Bonus Tile: Still available!")

        # Both quilts
        for p in range(2):
            empty = self._count_empty_spaces(p)
            print(f"\n  --- {self.players[p]} (P{p + 1}) --- "
                  f"Buttons: {self.buttons[p]}, Income: {self.button_income[p]}, "
                  f"Empty: {empty}")
            self._display_quilt(p)

    def _display_time_track(self):
        """Display a compact time track showing both players' positions."""
        track_display = ['.'] * (self.track_length + 1)
        for m in self.button_markers:
            if m <= self.track_length:
                track_display[m] = 'B'
        for l in self.leather_positions:
            if l <= self.track_length:
                track_display[l] = 'L'

        p1_pos = min(self.positions[0], self.track_length)
        p2_pos = min(self.positions[1], self.track_length)
        if p1_pos == p2_pos:
            track_display[p1_pos] = '='
        else:
            track_display[p1_pos] = '1'
            track_display[p2_pos] = '2'

        # Show track in segments
        print(f"\n  --- Time Track (1=P1, 2=P2, B=button income, L=leather patch) ---")
        seg_len = 27
        for start in range(0, self.track_length + 1, seg_len):
            end = min(start + seg_len, self.track_length + 1)
            segment = ''.join(track_display[start:end])
            print(f"  {start:3d}|{segment}|{end - 1}")

    def _display_quilt(self, p):
        """Display a player's quilt board."""
        bs = self.board_size
        header = "  " + "  " + " ".join(str(c) for c in range(bs))
        print(header)
        for r in range(bs):
            row_str = ""
            for c in range(bs):
                row_str += "#" if self.quilts[p][r][c] else "."
                if c < bs - 1:
                    row_str += " "
            print(f"  {r} {row_str}")

    def get_move(self):
        """Get move from current player."""
        active = self._get_active_player()
        # Sync current_player for save/load
        self.current_player = active + 1
        print(f"\n  {self.players[active]}, choose an action:")
        print("  'A' = Advance (pass, get buttons equal to spaces jumped)")
        print("  '1', '2', '3' = Buy that patch, then place it")
        print("  Format for placement: rotation(0-3) flip(y/n) row col")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        active = self._get_active_player()
        move_upper = move.upper().strip()

        if move_upper == 'A':
            # Advance: move to one space ahead of the other player, gain that many buttons
            other = 1 - active
            other_pos = self.positions[other]
            if self.positions[active] >= self.track_length:
                return False
            new_pos = min(other_pos + 1, self.track_length)
            spaces_moved = new_pos - self.positions[active]
            if spaces_moved <= 0:
                # Already ahead or tied - advance by 1
                new_pos = min(self.positions[active] + 1, self.track_length)
                spaces_moved = new_pos - self.positions[active]
                if spaces_moved <= 0:
                    return False
            self.buttons[active] += spaces_moved
            self._advance_and_collect(active, new_pos)
            self._check_7x7_bonus(active)
            return True

        elif move_upper in ('1', '2', '3'):
            choice = int(move_upper) - 1
            available = self._available_patches()
            if choice >= len(available):
                return False

            idx, patch = available[choice]
            cost, time_cost, income, shape = patch

            # Check if player can afford it
            if self.buttons[active] < cost:
                print(f"  Not enough buttons! You have {self.buttons[active]}, need {cost}.")
                input("  Press Enter to continue...")
                return False

            # Check if any valid placement exists
            if not self._has_any_valid_placement(active, shape):
                print("  No valid placement exists for this patch on your quilt!")
                input("  Press Enter to continue...")
                return False

            # Get placement
            placement = self._get_placement(active, shape)
            if placement is None:
                return False

            rotation, flip, row_off, col_off = placement
            transformed = self._transform_shape(shape, rotation, flip)

            if not self._can_place_patch(active, transformed, row_off, col_off):
                print("  Invalid placement! Patch doesn't fit there.")
                input("  Press Enter to continue...")
                return False

            # Apply the move
            self.buttons[active] -= cost
            self.button_income[active] += income
            self._place_patch(active, transformed, row_off, col_off)

            # Remove patch from circle and adjust marker
            self.patches.pop(idx)
            if self.patches:
                self.patch_marker = idx % len(self.patches)
            else:
                self.patch_marker = 0

            # Advance on time track
            new_pos = min(self.positions[active] + time_cost, self.track_length)
            self._advance_and_collect(active, new_pos)
            self._check_7x7_bonus(active)
            return True

        return False

    def _get_placement(self, p, shape):
        """Interactive prompt to get placement details for a patch."""
        print(f"\n  Place the patch on your quilt.")
        print(f"  Current shape: {self._shape_to_ascii(shape)}")
        print(f"  Enter: rotation(0-3) flip(n/y) row col")
        print(f"  Example: '0 n 3 4' = no rotation, no flip, at row 3, col 4")
        print(f"  Or 'C' to cancel and choose a different action.")

        # Show shape with different rotations
        for rot in range(4):
            for fl in [False, True]:
                t = self._transform_shape(shape, rot, fl)
                label = f"rot={rot} flip={'y' if fl else 'n'}"
                print(f"    {label}: {self._shape_to_ascii(t)}")

        try:
            resp = input_with_quit("  Placement: ").strip().upper()
        except Exception:
            return None

        if resp == 'C':
            return None

        try:
            parts = resp.split()
            if len(parts) != 4:
                return None
            rotation = int(parts[0])
            flip = parts[1].upper() == 'Y'
            row_off = int(parts[2])
            col_off = int(parts[3])
            if rotation < 0 or rotation > 3:
                return None
            return (rotation, flip, row_off, col_off)
        except (ValueError, IndexError):
            return None

    def check_game_over(self):
        """Check if both players have reached the end of the time track."""
        if self.positions[0] >= self.track_length and self.positions[1] >= self.track_length:
            self._end_game()

    def _end_game(self):
        """Calculate final scores and determine winner."""
        scores = [0, 0]
        for p in range(2):
            empty = self._count_empty_spaces(p)
            scores[p] = self.buttons[p] - (2 * empty)
            if self.bonus_tile_claimed == p:
                scores[p] += 7

        self.game_over = True
        self.final_scores = scores
        if scores[0] > scores[1]:
            self.winner = 1
        elif scores[1] > scores[0]:
            self.winner = 2
        else:
            self.winner = None  # draw

    def switch_player(self):
        """Override: in Patchwork, the player behind always goes.
        The base play() loop calls this, but turn order is determined
        by _get_active_player(), so this is effectively a no-op."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "board_size": self.board_size,
            "track_length": self.track_length,
            "button_markers": list(self.button_markers),
            "leather_positions": list(self.leather_positions),
            "patches": [list(p) for p in self.patches],
            "patch_marker": self.patch_marker,
            "quilts": [
                [list(row) for row in self.quilts[p]] for p in range(2)
            ],
            "buttons": list(self.buttons),
            "positions": list(self.positions),
            "button_income": list(self.button_income),
            "bonus_tile_claimed": self.bonus_tile_claimed,
        }

    def load_state(self, state):
        """Restore game state."""
        self.board_size = state["board_size"]
        self.track_length = state["track_length"]
        self.button_markers = list(state["button_markers"])
        self.leather_positions = list(state["leather_positions"])
        self.patches = [list(p) for p in state["patches"]]
        self.patch_marker = state["patch_marker"]
        self.quilts = [
            [list(row) for row in state["quilts"][p]] for p in range(2)
        ]
        self.buttons = list(state["buttons"])
        self.positions = list(state["positions"])
        self.button_income = list(state["button_income"])
        self.bonus_tile_claimed = state["bonus_tile_claimed"]

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Patchwork - Tutorial
==================================================

  OVERVIEW:
  Patchwork is a two-player game where you build
  a quilt by purchasing fabric patches and placing
  them on your personal 9x9 grid. The player with
  the most buttons (currency) at the end wins.

  TURN ORDER:
  The player whose token is BEHIND on the time
  track takes the turn. If both are on the same
  space, the player on top (who arrived last) goes.

  ON YOUR TURN, choose one action:

  1. ADVANCE (pass):
     Move your token to 1 space ahead of your
     opponent. Gain 1 button for each space moved.

  2. BUY A PATCH:
     Choose one of the 3 patches ahead of the
     marker in the circle. You must:
     - Pay its button cost
     - Place it on your quilt (may rotate/flip)
     - Advance on the time track by its time cost

  PATCHES:
  Each patch has:
  - Button cost: how many buttons to pay
  - Time cost: how many spaces to advance
  - Button income: buttons earned at each income
    marker you pass on the time track
  - Shape: the cells it fills on your quilt

  Patches can be rotated (0-3 times 90 degrees)
  and flipped before placement.

  TIME TRACK EVENTS:
  - B (Button Income): Earn buttons equal to the
    total income value of patches on your quilt.
  - L (Leather Patch): Receive a free 1x1 patch
    placed on the first empty space of your quilt.

  7x7 BONUS TILE:
  The first player to completely fill a 7x7 area
  on their quilt receives a +7 point bonus tile.

  GAME END:
  The game ends when both players reach the end
  of the time track.

  SCORING:
  - Start with buttons remaining
  - Subtract 2 points for each empty space
  - Add 7 if you have the bonus tile
  Highest score wins!

  HOW TO ENTER MOVES:
  - 'A' = Advance (pass and collect buttons)
  - '1', '2', '3' = Buy patch 1, 2, or 3

  When placing a patch:
  Format: rotation flip row col
  - rotation: 0, 1, 2, or 3 (90-degree turns)
  - flip: n (no flip) or y (flip horizontally)
  - row col: top-left position on your quilt
  Example: "1 n 2 3" = rotate once, no flip,
           place at row 2, column 3

  STRATEGY HINTS:
  - Balance cost vs time: cheap patches with low
    time cost let you take more turns.
  - Button income patches pay off over time.
  - Plan placements carefully to avoid gaps.
  - Aim for the 7x7 bonus tile!
  - Sometimes advancing is better than buying a
    patch that doesn't fit well.

  SIMPLE VARIATION:
  Uses a 7x7 board, fewer patches, and a shorter
  time track for a quicker game.

==================================================
"""
