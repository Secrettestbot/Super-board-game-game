"""Battleship - Find and sink your opponent's fleet."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Cell states
EMPTY = '~'
SHIP = 'S'
HIT = 'X'
MISS = 'O'
SUNK = '#'

SHIP_DEFS = {
    "standard": [
        ("Carrier", 5),
        ("Battleship", 4),
        ("Cruiser", 3),
        ("Submarine", 3),
        ("Destroyer", 2),
    ],
    "small": [
        ("Battleship", 4),
        ("Cruiser", 3),
        ("Destroyer", 2),
    ],
}

BOARD_SIZES = {
    "standard": 10,
    "small": 7,
}


class BattleshipGame(BaseGame):
    """Battleship - two-phase naval combat game."""

    name = "Battleship"
    description = "Find and sink your opponent's fleet"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (10x10)",
        "small": "Small (7x7)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.size = BOARD_SIZES.get(self.variation, 10)
        self.ship_defs = SHIP_DEFS.get(self.variation, SHIP_DEFS["standard"])
        # Each player has an own board and a tracking board
        # own_board stores ships; tracking_board records shots against opponent
        self.boards = {1: None, 2: None}          # own boards
        self.tracking = {1: None, 2: None}         # what each player sees of opponent
        self.ships = {1: [], 2: []}                # list of ship dicts per player
        self.phase = "placement"                   # "placement" or "shooting"
        self.placement_player = 1                  # who is currently placing
        self.placement_index = 0                   # which ship they're placing next

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize empty boards."""
        for p in (1, 2):
            self.boards[p] = [[EMPTY] * self.size for _ in range(self.size)]
            self.tracking[p] = [[EMPTY] * self.size for _ in range(self.size)]
            self.ships[p] = []
        self.phase = "placement"
        self.placement_player = 1
        self.placement_index = 0
        self.current_player = 1

    # --------------------------------------------------------------- display
    def display(self):
        if self.phase == "placement":
            self._display_placement()
        else:
            self._display_shooting()

    def _col_labels(self):
        return [chr(ord('A') + i) for i in range(self.size)]

    def _display_placement(self):
        p = self.placement_player
        ship_name, ship_len = self.ship_defs[self.placement_index]
        print(f"{'='*50}")
        print(f"  BATTLESHIP - Ship Placement")
        print(f"  {self.players[p - 1]}, place your {ship_name} (length {ship_len})")
        print(f"{'='*50}\n")
        self._print_board(self.boards[p], show_ships=True)
        remaining = self.ship_defs[self.placement_index:]
        print(f"\n  Ships to place:")
        for i, (sn, sl) in enumerate(remaining):
            marker = " >> " if i == 0 else "    "
            print(f"  {marker}{sn} ({sl})")

    def _display_shooting(self):
        p = self.current_player
        print(f"{'='*50}")
        print(f"  BATTLESHIP - {self.players[p - 1]}'s Turn")
        print(f"{'='*50}\n")
        print("  YOUR FLEET:                  OPPONENT WATERS:")
        own_lines = self._board_lines(self.boards[p], show_ships=True)
        opp_lines = self._board_lines(self.tracking[p], show_ships=False)
        for ol, tl in zip(own_lines, opp_lines):
            print(f"  {ol}     {tl}")
        # Ship status
        opp = 2 if p == 1 else 1
        print(f"\n  Opponent ships remaining:")
        for ship in self.ships[opp]:
            status = "SUNK" if ship["sunk"] else f"{ship['hits']}/{ship['length']} hit"
            print(f"    {ship['name']}: {status}")

    def _print_board(self, board, show_ships=True):
        for line in self._board_lines(board, show_ships):
            print(f"  {line}")

    def _board_lines(self, board, show_ships=True):
        cols = self._col_labels()
        lines = []
        header = "   " + " ".join(f"{c}" for c in cols)
        lines.append(header)
        for r in range(self.size):
            row_label = f"{r+1:2}"
            cells = []
            for c in range(self.size):
                val = board[r][c]
                if val == SHIP and not show_ships:
                    cells.append(EMPTY)
                else:
                    cells.append(val)
            lines.append(f"{row_label} " + " ".join(cells))
        return lines

    # --------------------------------------------------------------- get_move
    def get_move(self):
        if self.phase == "placement":
            return self._get_placement_move()
        else:
            return self._get_shot_move()

    def _get_placement_move(self):
        ship_name, ship_len = self.ship_defs[self.placement_index]
        print(f"\n  Enter placement as: <col><row> <H/V>")
        print(f"  Example: A1 H (horizontal) or A1 V (vertical)")
        raw = input_with_quit(f"  Place {ship_name} ({ship_len}): ").strip().upper()
        parts = raw.split()
        if len(parts) != 2:
            return None
        pos_str, orient = parts
        if orient not in ('H', 'V'):
            return None
        coord = self._parse_coord(pos_str)
        if coord is None:
            return None
        r, c = coord
        return ("place", r, c, orient, ship_name, ship_len)

    def _get_shot_move(self):
        print(f"\n  Enter target coordinate (e.g. A5):")
        raw = input_with_quit(f"  {self.players[self.current_player - 1]}, fire at: ").strip().upper()
        coord = self._parse_coord(raw)
        if coord is None:
            return None
        r, c = coord
        return ("shoot", r, c)

    def _parse_coord(self, s):
        """Parse a coordinate like 'A5' into (row, col). Returns None on failure."""
        if not s or len(s) < 2:
            return None
        col_ch = s[0]
        if not col_ch.isalpha():
            return None
        c = ord(col_ch) - ord('A')
        try:
            r = int(s[1:]) - 1
        except ValueError:
            return None
        if 0 <= r < self.size and 0 <= c < self.size:
            return (r, c)
        return None

    # --------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False
        if move[0] == "place":
            return self._do_placement(move)
        elif move[0] == "shoot":
            return self._do_shot(move)
        return False

    def _do_placement(self, move):
        _, r, c, orient, ship_name, ship_len = move
        p = self.placement_player
        # Compute cells
        cells = []
        for i in range(ship_len):
            nr = r + (i if orient == 'V' else 0)
            nc = c + (i if orient == 'H' else 0)
            if nr < 0 or nr >= self.size or nc < 0 or nc >= self.size:
                return False
            if self.boards[p][nr][nc] != EMPTY:
                return False
            cells.append((nr, nc))
        # Place ship
        for nr, nc in cells:
            self.boards[p][nr][nc] = SHIP
        self.ships[p].append({
            "name": ship_name,
            "length": ship_len,
            "cells": cells,
            "hits": 0,
            "sunk": False,
        })
        self.placement_index += 1
        # Check if this player finished placing
        if self.placement_index >= len(self.ship_defs):
            if self.placement_player == 1:
                # Switch to player 2 placement
                self.placement_player = 2
                self.placement_index = 0
                print(f"\n  {self.players[0]} has placed all ships!")
                print(f"  Hand the device to {self.players[1]}.")
                input("  Press Enter when ready...")
                clear_screen()
            else:
                # Both players done, move to shooting phase
                self.phase = "shooting"
                self.current_player = 1
                print(f"\n  All ships placed! Battle begins!")
                print(f"  Hand the device to {self.players[0]}.")
                input("  Press Enter when ready...")
                clear_screen()
        return True

    def _do_shot(self, move):
        _, r, c = move
        p = self.current_player
        opp = 2 if p == 1 else 1
        # Check if already shot there
        if self.tracking[p][r][c] != EMPTY:
            print("  You already fired there!")
            input("  Press Enter to try again...")
            return False
        # Check hit or miss
        if self.boards[opp][r][c] == SHIP:
            self.boards[opp][r][c] = HIT
            self.tracking[p][r][c] = HIT
            # Find which ship was hit
            sunk_ship = None
            for ship in self.ships[opp]:
                if (r, c) in ship["cells"]:
                    ship["hits"] += 1
                    if ship["hits"] >= ship["length"]:
                        ship["sunk"] = True
                        sunk_ship = ship
                        # Mark sunk on boards
                        for sr, sc in ship["cells"]:
                            self.boards[opp][sr][sc] = SUNK
                            self.tracking[p][sr][sc] = SUNK
                    break
            if sunk_ship:
                print(f"\n  *** HIT and SUNK! You sank the {sunk_ship['name']}! ***")
            else:
                print(f"\n  *** HIT! ***")
        else:
            self.boards[opp][r][c] = MISS
            self.tracking[p][r][c] = MISS
            print(f"\n  Miss.")
        input("  Press Enter to continue...")
        # Clear screen before switching turns
        clear_screen()
        print(f"\n  Hand the device to {self.players[(p % 2)]}")
        input("  Press Enter when ready...")
        return True

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if self.ships[p] and all(s["sunk"] for s in self.ships[p]):
                self.game_over = True
                self.winner = 2 if p == 1 else 1
                return

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        def serialize_ships(ship_list):
            return [
                {
                    "name": s["name"],
                    "length": s["length"],
                    "cells": s["cells"],
                    "hits": s["hits"],
                    "sunk": s["sunk"],
                }
                for s in ship_list
            ]
        return {
            "boards": {str(k): v for k, v in self.boards.items()},
            "tracking": {str(k): v for k, v in self.tracking.items()},
            "ships": {str(k): serialize_ships(v) for k, v in self.ships.items()},
            "phase": self.phase,
            "placement_player": self.placement_player,
            "placement_index": self.placement_index,
            "size": self.size,
        }

    def load_state(self, state):
        self.size = state.get("size", self.size)
        self.phase = state.get("phase", "placement")
        self.placement_player = state.get("placement_player", 1)
        self.placement_index = state.get("placement_index", 0)
        for p in (1, 2):
            self.boards[p] = state["boards"][str(p)]
            self.tracking[p] = state["tracking"][str(p)]
            raw_ships = state["ships"][str(p)]
            self.ships[p] = []
            for s in raw_ships:
                self.ships[p].append({
                    "name": s["name"],
                    "length": s["length"],
                    "cells": [tuple(c) for c in s["cells"]],
                    "hits": s["hits"],
                    "sunk": s["sunk"],
                })

    # ------------------------------------------------------------ play override
    def play(self):
        """Custom play loop to handle two-phase game and turn switching."""
        self.setup()
        while not self.game_over:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception as e:
                # Re-raise engine exceptions (QuitGame, SuspendGame, etc.)
                from engine.base import QuitGame, SuspendGame, ShowHelp, ShowTutorial
                if isinstance(e, (QuitGame, SuspendGame, ShowHelp, ShowTutorial)):
                    if isinstance(e, QuitGame):
                        print("\nGame ended.")
                        input("Press Enter to return to menu...")
                        return None
                    elif isinstance(e, SuspendGame):
                        slot = self.save_game()
                        print(f"\nGame saved as '{slot}'")
                        input("Press Enter to return to menu...")
                        return 'suspended'
                    elif isinstance(e, ShowHelp):
                        self.show_help()
                        continue
                    elif isinstance(e, ShowTutorial):
                        clear_screen()
                        print(self.get_tutorial())
                        input("\nPress Enter to continue...")
                        continue
                raise

            if self.make_move(move):
                self.move_history.append(str(move))
                self.turn_number += 1
                self.check_game_over()
                if not self.game_over and self.phase == "shooting":
                    self.switch_player()
            else:
                if move is not None:
                    print("  Invalid move! Try again.")
                    input("  Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! All enemy ships sunk! ***")
        input("\nPress Enter to return to menu...")
        return self.winner

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        size = self.size
        ships = ", ".join(f"{n} ({l})" for n, l in self.ship_defs)
        return f"""
{'='*60}
  BATTLESHIP - Tutorial
{'='*60}

  OBJECTIVE:
  Sink all of your opponent's ships before they sink yours.

  BOARD:
  {size}x{size} grid. Columns are labeled A-{chr(ord('A') + size - 1)},
  rows are numbered 1-{size}.

  SHIPS:
  {ships}

  PLACEMENT PHASE:
  Each player takes turns placing ships on their board.
  Enter placement as: <col><row> <H/V>
    Example: A1 H  - places ship horizontally starting at A1
    Example: C3 V  - places ship vertically starting at C3
  Ships cannot overlap or go off the board.

  SHOOTING PHASE:
  Players alternate firing shots at the opponent's grid.
  Enter a coordinate like: A5, B10, etc.

  SYMBOLS:
  ~  Water (empty)
  S  Your ship (only visible on your own board)
  X  Hit
  O  Miss
  #  Sunk ship

  The game ends when all ships of one player are sunk.

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'='*60}
"""
