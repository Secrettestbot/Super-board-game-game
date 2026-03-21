"""Rummikub - Simplified 2-player tile rummy game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


class RummikubGame(BaseGame):
    """Rummikub: Form groups and runs to be the first to empty your hand."""

    name = "Rummikub"
    description = "Tile rummy game - form groups and runs to empty your hand"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Rummikub",
        "simple": "Simple (no jokers)",
    }

    COLORS = ['R', 'B', 'O', 'K']
    COLOR_NAMES = {'R': 'Red', 'B': 'Blue', 'O': 'Orange', 'K': 'Black'}

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.hands = [[], []]          # hands[0] = Player 1, hands[1] = Player 2
        self.pool = []                 # draw pool
        self.table_melds = []          # list of melds on the table, each meld is a list of tiles
        self.initial_meld_done = [False, False]  # whether each player has made initial 30pt meld
        # Turn state: snapshot before turn starts so we can rollback
        self._turn_snapshot_hands = None
        self._turn_snapshot_table = None
        self._turn_drew = False        # did the player draw this turn?
        self._turn_played = False      # did the player play tiles this turn?
        self._last_message = ""

    # -- Tile representation --
    # A tile is a tuple: (color, number) e.g. ('R', 7) or ('J', 0) for joker.

    @staticmethod
    def tile_str(tile):
        """Format a tile for display."""
        if tile[0] == 'J':
            return 'J'
        return f"{tile[0]}{tile[1]}"

    @staticmethod
    def tile_value(tile):
        """Point value of a tile."""
        if tile[0] == 'J':
            return 30
        return tile[1]

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Create tile set, shuffle, deal 14 tiles each."""
        tiles = []
        for _ in range(2):  # two sets
            for color in self.COLORS:
                for num in range(1, 14):
                    tiles.append((color, num))
        if self.variation == "standard":
            tiles.append(('J', 0))
            tiles.append(('J', 0))
        random.shuffle(tiles)

        self.hands[0] = sorted(tiles[0:14], key=self._tile_sort_key)
        self.hands[1] = sorted(tiles[14:28], key=self._tile_sort_key)
        self.pool = tiles[28:]
        self.table_melds = []
        self.initial_meld_done = [False, False]
        self._last_message = ""

    @staticmethod
    def _tile_sort_key(tile):
        """Sort key: by color then number, jokers last."""
        if tile[0] == 'J':
            return (5, 0)
        order = {'R': 0, 'B': 1, 'O': 2, 'K': 3}
        return (order.get(tile[0], 4), tile[1])

    # ---------------------------------------------------------------- display
    def display(self):
        """Display table melds and current player's hand."""
        var_label = self.variations.get(self.variation, self.variation)
        print(f"\n  === Rummikub ({var_label}) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        opp = 2 if self.current_player == 1 else 1
        print(f"  {self.players[opp - 1]} has {len(self.hands[opp - 1])} tile(s)")
        print(f"  Pool: {len(self.pool)} tile(s)")
        init_status = "Yes" if self.initial_meld_done[self.current_player - 1] else "No (need 30+ pts)"
        print(f"  Initial meld placed: {init_status}")
        print()

        # Table melds
        if self.table_melds:
            print("  Table melds:")
            for i, meld in enumerate(self.table_melds):
                tiles_str = " ".join(self.tile_str(t) for t in meld)
                print(f"    {i + 1}: [{tiles_str}]")
            print()
        else:
            print("  Table: (no melds yet)")
            print()

        # Current player's hand
        hand = self.hands[self.current_player - 1]
        print(f"  {self.players[self.current_player - 1]}'s hand:")
        if hand:
            tiles_str = "    "
            for i, tile in enumerate(hand):
                tiles_str += f"{i + 1}:{self.tile_str(tile)}  "
            print(tiles_str)
        else:
            print("    (empty)")
        print()

        if self._last_message:
            print(f"  >> {self._last_message}")
            print()

    # ------------------------------------------------------------- get_move
    def get_move(self):
        """Handle a full turn with multiple actions. Returns a sentinel."""
        pidx = self.current_player - 1
        # Snapshot state at start of turn
        self._turn_snapshot_hands = copy.deepcopy(self.hands[pidx])
        self._turn_snapshot_table = copy.deepcopy(self.table_melds)
        self._turn_drew = False
        self._turn_played = False
        self._last_message = ""

        while True:
            clear_screen()
            self.display()
            print("  Commands: meld <tile#s> | add <tile#> to <meld#> | rearrange")
            print("            draw | done | table")
            try:
                raw = input_with_quit("  > ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                raise

            if not raw:
                continue

            parts = raw.split()
            cmd = parts[0]

            if cmd == "draw":
                if self._turn_played:
                    self._last_message = "Cannot draw after playing tiles. Type 'done' or undo moves."
                    continue
                if not self.pool:
                    self._last_message = "Pool is empty! You must play tiles or type 'done'."
                    continue
                tile = self.pool.pop(random.randint(0, len(self.pool) - 1))
                self.hands[pidx].append(tile)
                self.hands[pidx].sort(key=self._tile_sort_key)
                self._turn_drew = True
                self._last_message = f"Drew {self.tile_str(tile)}."
                # Drawing ends the turn
                return "draw"

            elif cmd == "meld":
                if self._turn_drew:
                    self._last_message = "Already drew a tile this turn."
                    continue
                indices = self._parse_indices(parts[1:], len(self.hands[pidx]))
                if indices is None:
                    self._last_message = "Invalid tile numbers."
                    continue
                if len(indices) < 3:
                    self._last_message = "A meld needs at least 3 tiles."
                    continue
                tiles = [self.hands[pidx][i] for i in indices]
                if not self._is_valid_meld(tiles):
                    self._last_message = "Not a valid meld (must be a group or run)."
                    continue
                # Check initial meld requirement
                if not self.initial_meld_done[pidx]:
                    meld_value = sum(self.tile_value(t) for t in tiles)
                    if not self._turn_played and meld_value < 30:
                        self._last_message = f"Initial meld must total 30+ points (this is {meld_value})."
                        continue
                # Place it
                for i in sorted(indices, reverse=True):
                    self.hands[pidx].pop(i)
                self.table_melds.append(tiles)
                self._turn_played = True
                if not self.initial_meld_done[pidx]:
                    # Check cumulative value of new melds this turn
                    total_new = self._calc_new_meld_points(pidx)
                    if total_new >= 30:
                        self.initial_meld_done[pidx] = True
                self._last_message = f"Placed meld: [{' '.join(self.tile_str(t) for t in tiles)}]"

            elif cmd == "add":
                if self._turn_drew:
                    self._last_message = "Already drew a tile this turn."
                    continue
                if not self.initial_meld_done[pidx]:
                    self._last_message = "Must make initial meld (30+ pts) before adding to table melds."
                    continue
                # Parse: add <tile#> to <meld#>
                # Also support: add <tile#s> to <meld#>
                if "to" not in parts:
                    self._last_message = "Usage: add <tile#> to <meld#>"
                    continue
                to_idx = parts.index("to")
                tile_parts = parts[1:to_idx]
                meld_parts = parts[to_idx + 1:]
                if len(meld_parts) != 1:
                    self._last_message = "Usage: add <tile#> to <meld#>"
                    continue
                tile_indices = self._parse_indices(tile_parts, len(self.hands[pidx]))
                if tile_indices is None or len(tile_indices) == 0:
                    self._last_message = "Invalid tile number(s)."
                    continue
                try:
                    meld_num = int(meld_parts[0]) - 1
                except ValueError:
                    self._last_message = "Invalid meld number."
                    continue
                if meld_num < 0 or meld_num >= len(self.table_melds):
                    self._last_message = "Invalid meld number."
                    continue
                tiles_to_add = [self.hands[pidx][i] for i in tile_indices]
                new_meld = self.table_melds[meld_num] + tiles_to_add
                # Try sorting as run to see if valid
                best_meld = self._best_meld_arrangement(new_meld)
                if best_meld is None:
                    self._last_message = "Adding those tiles doesn't form a valid meld."
                    continue
                for i in sorted(tile_indices, reverse=True):
                    self.hands[pidx].pop(i)
                self.table_melds[meld_num] = best_meld
                self._turn_played = True
                self._last_message = f"Added to meld {meld_num + 1}: [{' '.join(self.tile_str(t) for t in best_meld)}]"

            elif cmd == "rearrange":
                if self._turn_drew:
                    self._last_message = "Already drew a tile this turn."
                    continue
                if not self.initial_meld_done[pidx]:
                    self._last_message = "Must make initial meld before rearranging."
                    continue
                self._do_rearrange(pidx)

            elif cmd == "table":
                # Just refresh display
                self._last_message = ""
                continue

            elif cmd == "done":
                if not self._turn_drew and not self._turn_played:
                    # Must do something
                    if self.pool:
                        self._last_message = "You must play tiles or draw. Type 'draw' to draw a tile."
                    else:
                        self._last_message = "Pool is empty. You must play tiles if you can."
                        # If truly stuck with no pool, allow passing
                        return "pass"
                    continue
                if self._turn_played:
                    # Validate all table melds
                    if not self._all_melds_valid():
                        self._last_message = "Table has invalid melds! Fix them before ending turn."
                        continue
                return "done"

            elif cmd == "undo":
                # Rollback to start of turn
                self.hands[pidx] = self._turn_snapshot_hands[:]
                self.hands[pidx] = copy.deepcopy(self._turn_snapshot_hands)
                self.table_melds = copy.deepcopy(self._turn_snapshot_table)
                self._turn_drew = False
                self._turn_played = False
                self._last_message = "Turn reset to start."

            else:
                self._last_message = "Unknown command. Use: meld, add, draw, done, rearrange, undo, table"

    def _calc_new_meld_points(self, pidx):
        """Calculate points from melds placed this turn (new melds beyond snapshot)."""
        old_count = len(self._turn_snapshot_table)
        total = 0
        for meld in self.table_melds[old_count:]:
            total += sum(self.tile_value(t) for t in meld)
        return total

    def _do_rearrange(self, pidx):
        """Interactive rearrange: pull all table tiles into a workspace, reform melds."""
        # Collect all table tiles into a temporary workspace
        workspace = []
        for meld in self.table_melds:
            workspace.extend(meld)
        self.table_melds = []
        workspace.sort(key=self._tile_sort_key)

        self._last_message = "Rearrange mode. Form new melds from workspace tiles."

        while True:
            clear_screen()
            print("\n  === REARRANGE MODE ===\n")
            # Show workspace
            if workspace:
                print("  Workspace tiles:")
                ws_str = "    "
                for i, t in enumerate(workspace):
                    ws_str += f"{i + 1}:{self.tile_str(t)}  "
                print(ws_str)
            else:
                print("  Workspace: (empty)")
            print()

            # Show formed melds
            if self.table_melds:
                print("  Formed melds:")
                for i, meld in enumerate(self.table_melds):
                    valid = self._is_valid_meld(meld)
                    mark = "OK" if valid else "!!"
                    tiles_str = " ".join(self.tile_str(t) for t in meld)
                    print(f"    {i + 1} [{mark}]: [{tiles_str}]")
            else:
                print("  Formed melds: (none)")
            print()

            # Show hand for reference
            hand = self.hands[pidx]
            if hand:
                print(f"  Your hand (for reference):")
                h_str = "    "
                for i, t in enumerate(hand):
                    h_str += f"{i + 1}:{self.tile_str(t)}  "
                print(h_str)
                print()

            print("  Commands: form <tile#s from workspace> | break <meld#> | addhand <hand tile#s>")
            print("            finish | cancel")
            try:
                raw = input_with_quit("  rearrange> ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                # Cancel rearrange
                break

            if not raw:
                continue

            parts = raw.split()
            cmd = parts[0]

            if cmd == "form":
                indices = self._parse_indices(parts[1:], len(workspace))
                if indices is None or len(indices) < 3:
                    self._last_message = "Need at least 3 valid tile numbers."
                    continue
                tiles = [workspace[i] for i in indices]
                meld = self._best_meld_arrangement(tiles)
                if meld is None:
                    meld = tiles  # place anyway, validate at finish
                for i in sorted(indices, reverse=True):
                    workspace.pop(i)
                self.table_melds.append(meld)

            elif cmd == "break":
                if len(parts) < 2:
                    continue
                try:
                    mi = int(parts[1]) - 1
                except ValueError:
                    continue
                if 0 <= mi < len(self.table_melds):
                    workspace.extend(self.table_melds.pop(mi))
                    workspace.sort(key=self._tile_sort_key)

            elif cmd == "addhand":
                # Add tiles from hand to workspace for forming melds
                h_indices = self._parse_indices(parts[1:], len(self.hands[pidx]))
                if h_indices is None:
                    continue
                for i in sorted(h_indices, reverse=True):
                    workspace.append(self.hands[pidx].pop(i))
                workspace.sort(key=self._tile_sort_key)
                self._turn_played = True

            elif cmd == "finish":
                if workspace:
                    self._last_message = "Workspace still has tiles! Form melds or cancel."
                    continue
                if not self._all_melds_valid():
                    self._last_message = "Some melds are invalid. Fix them or cancel."
                    continue
                self._turn_played = True
                self._last_message = "Rearrangement complete."
                return

            elif cmd == "cancel":
                # Rollback to snapshot
                self.hands[pidx] = copy.deepcopy(self._turn_snapshot_hands)
                self.table_melds = copy.deepcopy(self._turn_snapshot_table)
                self._last_message = "Rearrange cancelled."
                return

        # If we break out, cancel
        self.hands[pidx] = copy.deepcopy(self._turn_snapshot_hands)
        self.table_melds = copy.deepcopy(self._turn_snapshot_table)
        self._last_message = "Rearrange cancelled."

    # ------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply the completed turn. Always returns True since validation is in get_move."""
        return True

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if a player has emptied their hand or pool is empty."""
        for pidx in range(2):
            if len(self.hands[pidx]) == 0:
                self.game_over = True
                self.winner = pidx + 1
                return

        # If pool is empty, check if both players passed (stuck)
        if not self.pool:
            # We'll let the game continue until someone empties hand
            # or we detect a stalemate (both can't play).
            # For simplicity, if pool is empty the game continues;
            # the play() loop handles pass/done.
            pass

    def end_game_by_points(self):
        """End game when pool is empty and no one can play. Fewest points wins."""
        scores = [sum(self.tile_value(t) for t in h) for h in self.hands]
        if scores[0] < scores[1]:
            self.winner = 1
        elif scores[1] < scores[0]:
            self.winner = 2
        else:
            self.winner = None  # draw
        self.game_over = True

    # --------------------------------------------------------- meld validation
    def _is_valid_meld(self, tiles):
        """Check if a list of tiles forms a valid group or run."""
        if len(tiles) < 3:
            return False
        return self._is_valid_group(tiles) or self._is_valid_run(tiles)

    def _is_valid_group(self, tiles):
        """3-4 tiles of same number, different colors. Jokers fill in."""
        if len(tiles) < 3 or len(tiles) > 4:
            return False
        jokers = [t for t in tiles if t[0] == 'J']
        non_jokers = [t for t in tiles if t[0] != 'J']
        if not non_jokers:
            return len(tiles) >= 3  # all jokers is technically valid
        # All non-jokers must have same number
        numbers = set(t[1] for t in non_jokers)
        if len(numbers) != 1:
            return False
        # All non-jokers must have different colors
        colors = [t[0] for t in non_jokers]
        if len(colors) != len(set(colors)):
            return False
        # Total tiles (non-jokers + jokers) must be 3 or 4
        return True

    def _is_valid_run(self, tiles):
        """3+ consecutive numbers of same color. Jokers fill gaps."""
        if len(tiles) < 3:
            return False
        jokers = [t for t in tiles if t[0] == 'J']
        non_jokers = [t for t in tiles if t[0] != 'J']
        if not non_jokers:
            return len(tiles) >= 3  # all jokers
        # All non-jokers same color
        colors = set(t[0] for t in non_jokers)
        if len(colors) != 1:
            return False
        nums = sorted(t[1] for t in non_jokers)
        # Check for duplicates among non-jokers
        if len(nums) != len(set(nums)):
            return False
        # Need to fill gaps with jokers
        needed_jokers = 0
        for i in range(len(nums) - 1):
            gap = nums[i + 1] - nums[i] - 1
            needed_jokers += gap
        if needed_jokers > len(jokers):
            return False
        # Total length = span of numbers + any extra jokers at ends
        span = nums[-1] - nums[0] + 1
        total = span + (len(jokers) - needed_jokers)
        if total != len(tiles):
            return False
        # Numbers must be in range 1-13
        extra_before = 0
        extra_after = 0
        remaining_jokers = len(jokers) - needed_jokers
        # Try placing extra jokers at the ends
        # Check if the run stays within 1-13
        min_start = nums[0] - remaining_jokers
        max_end = nums[-1] + remaining_jokers
        # The run must fit within 1..13
        if min_start < 1 and max_end > 13:
            return False
        # As long as we can place all remaining jokers within bounds
        if remaining_jokers > 0:
            space_before = nums[0] - 1
            space_after = 13 - nums[-1]
            if space_before + space_after < remaining_jokers:
                return False
        return True

    def _best_meld_arrangement(self, tiles):
        """Try to arrange tiles into a valid meld. Return sorted meld or None."""
        if self._is_valid_group(tiles):
            # Sort group by color
            return sorted(tiles, key=self._tile_sort_key)
        # Try as run
        jokers = [t for t in tiles if t[0] == 'J']
        non_jokers = sorted([t for t in tiles if t[0] != 'J'], key=lambda t: t[1])
        if non_jokers:
            # Arrange run: place non-jokers in order, fill gaps with jokers
            arranged = []
            joker_pool = list(jokers)
            color = non_jokers[0][0]
            if all(t[0] == color for t in non_jokers):
                nums = [t[1] for t in non_jokers]
                if len(nums) == len(set(nums)):
                    # Figure out best placement
                    start = nums[0]
                    # Place jokers to extend before if needed
                    remaining_jokers = len(joker_pool)
                    # Fill gaps first
                    run = []
                    for i, t in enumerate(non_jokers):
                        if i > 0:
                            gap = t[1] - non_jokers[i-1][1] - 1
                            for g in range(gap):
                                if joker_pool:
                                    run.append(joker_pool.pop(0))
                                else:
                                    return None
                        run.append(t)
                    # Place remaining jokers at ends
                    while joker_pool:
                        j = joker_pool.pop(0)
                        # Prefer extending at the end
                        last_num = run[-1][1] if run[-1][0] != 'J' else 13
                        first_num = run[0][1] if run[0][0] != 'J' else 1
                        if last_num < 13:
                            run.append(j)
                        elif first_num > 1:
                            run.insert(0, j)
                        else:
                            return None
                    if self._is_valid_run(run):
                        return run
        elif jokers and len(jokers) >= 3:
            return list(jokers)
        return None

    def _all_melds_valid(self):
        """Check all melds on table are valid."""
        for meld in self.table_melds:
            if not self._is_valid_meld(meld):
                return False
        return True

    def _parse_indices(self, parts, max_len):
        """Parse space-separated 1-based indices. Returns 0-based sorted list or None."""
        try:
            indices = [int(p) - 1 for p in parts]
        except ValueError:
            return None
        if any(i < 0 or i >= max_len for i in indices):
            return None
        if len(indices) != len(set(indices)):
            return None
        return sorted(indices)

    # ------------------------------------------------------------ state
    def get_state(self):
        """Return serializable game state."""
        return {
            'hands': self.hands,
            'pool': self.pool,
            'table_melds': self.table_melds,
            'initial_meld_done': self.initial_meld_done,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.hands = [[(t[0], t[1]) for t in h] for h in state['hands']]
        self.pool = [(t[0], t[1]) for t in state['pool']]
        self.table_melds = [[(t[0], t[1]) for t in m] for m in state['table_melds']]
        self.initial_meld_done = state['initial_meld_done']
        self._last_message = ""

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        """Return tutorial text for Rummikub."""
        return """
================================================================================
                            RUMMIKUB TUTORIAL
================================================================================

OVERVIEW:
  Rummikub is a tile-based game where you form groups and runs to be the first
  player to empty your hand.

TILES:
  106 tiles total (104 in Simple mode):
  - 2 sets of tiles numbered 1-13 in 4 colors: Red(R), Blue(B), Orange(O), Black(K)
  - 2 Jokers (J) in Standard mode

SETUP:
  Each player receives 14 tiles. Remaining tiles form the pool.

VALID MELDS:
  Groups: 3-4 tiles of the SAME number in DIFFERENT colors
    Example: [R5 B5 K5] or [R8 B8 O8 K8]
  Runs: 3+ CONSECUTIVE numbers in the SAME color
    Example: [R1 R2 R3 R4] or [B9 B10 B11]
  Jokers can substitute for any tile.

INITIAL MELD:
  Your first meld(s) must total at least 30 points (tile face values).
  Until you meet this requirement, you cannot add to existing table melds.

ON YOUR TURN:
  Either play tiles OR draw one tile from the pool:
  - meld <tile#s>       Play tiles from your hand as a new meld
                         Example: meld 1 3 5
  - add <tile#> to <meld#>  Add hand tile(s) to an existing table meld
                         Example: add 2 to 3
  - rearrange           Enter rearrange mode to restructure all table melds
  - draw                Draw one tile from the pool (ends your turn)
  - done                End your turn (validates table state)
  - undo                Reset your turn to its starting state

REARRANGING:
  After your initial meld, you may rearrange ALL tiles on the table to form
  new valid combinations, as long as every meld is valid when you finish.

WINNING:
  First player to empty their hand wins!
  If the pool empties and no one can play, fewest remaining tile points wins.
  Jokers left in hand count as 30 points each.

================================================================================
"""
