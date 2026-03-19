"""Ludo - Classic race-around-the-board game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Board layout constants
MAIN_TRACK_SIZE = 52        # squares on the shared outer track
HOME_STRETCH_SIZE = 5       # squares in each player's home stretch (before home)

# Starting positions on the main track for each player (1-indexed player number)
START_POSITIONS = {1: 1, 2: 14, 3: 27, 4: 40}

# Safe squares on the main track (1-indexed) where pieces cannot be captured
SAFE_SQUARES = {1, 9, 14, 22, 27, 35, 40, 48}

# Entry square to home stretch: after completing the loop, a player enters their
# home column. The last main-track square before home stretch for each player.
HOME_ENTRY = {1: 51, 2: 12, 3: 25, 4: 38}

# Player symbols
PLAYER_SYMBOLS = {1: "A", 2: "B", 3: "C", 4: "D"}
PLAYER_COLORS = {1: "Red", 2: "Blue", 3: "Green", 4: "Yellow"}


class LudoGame(BaseGame):
    """Ludo - dice-based race game for 2 or 4 players."""

    name = "Ludo"
    description = "Classic race game - get all your pieces home first"
    min_players = 2
    max_players = 4
    variations = {
        "standard": "Standard (2 players, 4 pieces each)",
        "four": "Four players (4 players, 4 pieces each)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "four":
            self.num_players = 4
            self.players = ["Player 1", "Player 2", "Player 3", "Player 4"]
        else:
            self.num_players = 2
            self.players = ["Player 1", "Player 2"]
        self.pieces_per_player = 4
        # Piece state: each piece is either:
        #   "base"       - in the starting base (not yet on board)
        #   ("main", n)  - on main track square n (1..52)
        #   ("home", n)  - on home stretch square n (1..5)
        #   "finished"   - reached home
        self.pieces = {}  # {player: [piece_state, ...]}
        self.last_roll = None
        self.last_event = ""
        self.extra_turn = False  # rolling a 6 grants extra turn

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize all pieces in base."""
        for p in range(1, self.num_players + 1):
            self.pieces[p] = ["base"] * self.pieces_per_player
        self.current_player = 1
        self.last_roll = None
        self.last_event = ""
        self.extra_turn = False

    # --------------------------------------------------------------- display
    def display(self):
        p = self.current_player
        print(f"{'=' * 60}")
        print(f"  LUDO  --  Turn {self.turn_number + 1}")
        player_info = "  vs  ".join(
            f"{self.players[i]} ({PLAYER_COLORS[i + 1]})"
            for i in range(self.num_players)
        )
        print(f"  {player_info}")
        print(f"{'=' * 60}")

        if self.last_event:
            print(f"\n  Last: {self.last_event}")

        # Show each player's pieces
        print()
        for pl in range(1, self.num_players + 1):
            sym = PLAYER_SYMBOLS[pl]
            color = PLAYER_COLORS[pl]
            marker = " >> " if pl == p else "    "
            pieces_desc = []
            for i, piece in enumerate(self.pieces[pl]):
                if piece == "base":
                    pieces_desc.append(f"{sym}{i + 1}:Base")
                elif piece == "finished":
                    pieces_desc.append(f"{sym}{i + 1}:HOME")
                elif piece[0] == "main":
                    pieces_desc.append(f"{sym}{i + 1}:Sq{piece[1]}")
                elif piece[0] == "home":
                    pieces_desc.append(f"{sym}{i + 1}:H{piece[1]}")
            print(f"{marker}{self.players[pl - 1]} ({color}): {', '.join(pieces_desc)}")

        # Show simplified track
        print()
        self._draw_track()

        print(f"\n  Current turn: {self.players[p - 1]} ({PLAYER_COLORS[p]})")
        if self.last_roll is not None:
            print(f"  Last roll: {self.last_roll}")

    def _draw_track(self):
        """Draw a simplified view of the main track and home stretches."""
        # Build a map of main track positions to occupants
        track = {}
        for sq in range(1, MAIN_TRACK_SIZE + 1):
            track[sq] = []

        home_stretches = {}
        for pl in range(1, self.num_players + 1):
            home_stretches[pl] = {h: [] for h in range(1, HOME_STRETCH_SIZE + 1)}

        for pl in range(1, self.num_players + 1):
            sym = PLAYER_SYMBOLS[pl]
            for i, piece in enumerate(self.pieces[pl]):
                if piece == "base" or piece == "finished":
                    continue
                if piece[0] == "main":
                    track[piece[1]].append(f"{sym}{i + 1}")
                elif piece[0] == "home":
                    home_stretches[pl][piece[1]].append(f"{sym}{i + 1}")

        # Print occupied main track squares
        occupied = [(sq, occs) for sq, occs in sorted(track.items()) if occs]
        if occupied:
            print("  Main track (occupied squares):")
            line_parts = []
            for sq, occs in occupied:
                safe = "*" if sq in SAFE_SQUARES else ""
                line_parts.append(f"[{sq}{safe}: {','.join(occs)}]")
            # Print in rows of 4
            for i in range(0, len(line_parts), 4):
                print("    " + "  ".join(line_parts[i:i + 4]))
        else:
            print("  Main track: (empty)")

        # Print home stretches with pieces
        for pl in range(1, self.num_players + 1):
            hs = home_stretches[pl]
            occupied_hs = [(h, occs) for h, occs in sorted(hs.items()) if occs]
            if occupied_hs:
                print(f"  {PLAYER_COLORS[pl]} home stretch: ", end="")
                parts = [f"H{h}:{','.join(occs)}" for h, occs in occupied_hs]
                print("  ".join(parts))

        # Safe squares legend
        print(f"\n  Safe squares (*): {', '.join(str(s) for s in sorted(SAFE_SQUARES))}")
        print(f"  Start squares: " + ", ".join(
            f"{PLAYER_COLORS[p]}={START_POSITIONS[p]}"
            for p in range(1, self.num_players + 1)
        ))

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Roll dice, then choose which piece to move."""
        input_with_quit(f"  Press Enter to roll the dice... ")
        roll = random.randint(1, 6)
        self.last_roll = roll
        print(f"\n  You rolled a {roll}!")

        if roll == 6:
            self.extra_turn = True
            print("  (You get an extra turn after this!)")
        else:
            self.extra_turn = False

        p = self.current_player
        # Determine which pieces can move
        movable = self._get_movable_pieces(p, roll)

        if not movable:
            print("  No pieces can move with this roll.")
            input("  Press Enter to continue...")
            return ("no_move", roll)

        if len(movable) == 1:
            choice = movable[0]
            print(f"  Only piece {PLAYER_SYMBOLS[p]}{choice + 1} can move.")
            input("  Press Enter to continue...")
            return ("move", roll, choice)

        # Let player choose
        sym = PLAYER_SYMBOLS[p]
        print(f"\n  Movable pieces: ", end="")
        for idx in movable:
            piece = self.pieces[p][idx]
            if piece == "base":
                loc = "Base"
            elif piece[0] == "main":
                loc = f"Sq{piece[1]}"
            elif piece[0] == "home":
                loc = f"H{piece[1]}"
            else:
                loc = str(piece)
            print(f"  {sym}{idx + 1}({loc})", end="")
        print()

        while True:
            raw = input_with_quit(f"  Choose piece number (1-{self.pieces_per_player}): ").strip()
            try:
                choice = int(raw) - 1
                if choice in movable:
                    return ("move", roll, choice)
                print(f"  Piece {choice + 1} cannot move. Choose from: "
                      + ", ".join(str(m + 1) for m in movable))
            except ValueError:
                print("  Enter a piece number.")

    def _get_movable_pieces(self, player, roll):
        """Return list of piece indices that can legally move with this roll."""
        movable = []
        for i, piece in enumerate(self.pieces[player]):
            if piece == "finished":
                continue
            if piece == "base":
                # Need a 6 to leave base
                if roll == 6:
                    movable.append(i)
                continue
            # On the board - check if move is valid
            if piece[0] == "main":
                new_state = self._calc_new_position(player, piece, roll)
                if new_state is not None:
                    movable.append(i)
            elif piece[0] == "home":
                new_home = piece[1] + roll
                if new_home <= HOME_STRETCH_SIZE + 1:
                    movable.append(i)
        return movable

    def _calc_new_position(self, player, piece, roll):
        """Calculate the new position after moving. Returns new state or None if invalid."""
        if piece[0] == "main":
            current_sq = piece[1]
            # Convert to player-relative position (how far from start)
            start = START_POSITIONS[player]
            rel_pos = (current_sq - start) % MAIN_TRACK_SIZE
            new_rel = rel_pos + roll

            # Check if entering home stretch
            # Player completes the loop at rel_pos == 51 (one full loop)
            # Home stretch starts at rel_pos == 51
            if new_rel >= MAIN_TRACK_SIZE:
                # Entering home stretch
                home_pos = new_rel - MAIN_TRACK_SIZE + 1
                if home_pos > HOME_STRETCH_SIZE + 1:
                    return None  # overshoot
                if home_pos == HOME_STRETCH_SIZE + 1:
                    return "finished"
                return ("home", home_pos)
            else:
                new_sq = ((start + new_rel - 1) % MAIN_TRACK_SIZE) + 1
                return ("main", new_sq)

        elif piece[0] == "home":
            new_home = piece[1] + roll
            if new_home > HOME_STRETCH_SIZE + 1:
                return None
            if new_home == HOME_STRETCH_SIZE + 1:
                return "finished"
            return ("home", new_home)

        return None

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False

        action = move[0]
        roll = move[1]
        p = self.current_player

        if action == "no_move":
            self.last_event = (f"{self.players[p - 1]} rolled {roll} "
                               f"but no pieces could move.")
            return True

        piece_idx = move[2]
        piece = self.pieces[p][piece_idx]
        sym = PLAYER_SYMBOLS[p]
        piece_name = f"{sym}{piece_idx + 1}"

        if piece == "base":
            # Enter the board on start position
            start = START_POSITIONS[p]
            # Check for capture at start
            self._handle_capture(p, ("main", start))
            self.pieces[p][piece_idx] = ("main", start)
            self.last_event = (f"{self.players[p - 1]} rolled {roll}, "
                               f"{piece_name} enters at Sq{start}.")
            return True

        new_state = self._calc_new_position(p, piece, roll)
        if new_state is None:
            return False

        if new_state == "finished":
            self.pieces[p][piece_idx] = "finished"
            self.last_event = (f"{self.players[p - 1]} rolled {roll}, "
                               f"{piece_name} reached HOME!")
            return True

        # Handle capture for main track moves
        captured = ""
        if new_state[0] == "main":
            captured = self._handle_capture(p, new_state)

        self.pieces[p][piece_idx] = new_state

        loc = f"Sq{new_state[1]}" if new_state[0] == "main" else f"H{new_state[1]}"
        self.last_event = (f"{self.players[p - 1]} rolled {roll}, "
                           f"{piece_name} moved to {loc}.{captured}")
        return True

    def _handle_capture(self, player, new_state):
        """If an opponent piece is on the target main-track square, send it to base.
        Returns a description string if capture happened."""
        if new_state[0] != "main":
            return ""
        sq = new_state[1]
        if sq in SAFE_SQUARES:
            return ""

        captured_desc = ""
        for opp in range(1, self.num_players + 1):
            if opp == player:
                continue
            for i, opp_piece in enumerate(self.pieces[opp]):
                if opp_piece == ("main", sq):
                    self.pieces[opp][i] = "base"
                    opp_sym = PLAYER_SYMBOLS[opp]
                    captured_desc += (f" CAPTURED {opp_sym}{i + 1}!")
        return captured_desc

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override to support 4 players and extra turns on rolling 6."""
        if self.extra_turn:
            self.extra_turn = False
            return  # same player goes again
        if self.num_players == 2:
            self.current_player = 2 if self.current_player == 1 else 1
        else:
            self.current_player = (self.current_player % self.num_players) + 1

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in range(1, self.num_players + 1):
            if all(piece == "finished" for piece in self.pieces[p]):
                self.game_over = True
                self.winner = p
                return

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        def serialize_piece(piece):
            if piece == "base" or piece == "finished":
                return piece
            return list(piece)

        return {
            "pieces": {
                str(k): [serialize_piece(p) for p in v]
                for k, v in self.pieces.items()
            },
            "num_players": self.num_players,
            "last_roll": self.last_roll,
            "last_event": self.last_event,
            "extra_turn": self.extra_turn,
        }

    def load_state(self, state):
        def deserialize_piece(p):
            if p == "base" or p == "finished":
                return p
            return tuple(p)

        self.num_players = state.get("num_players", self.num_players)
        self.last_roll = state.get("last_roll")
        self.last_event = state.get("last_event", "")
        self.extra_turn = state.get("extra_turn", False)
        self.pieces = {}
        for k, v in state["pieces"].items():
            self.pieces[int(k)] = [deserialize_piece(p) for p in v]

    # ----------------------------------------------------------- play override
    def play(self):
        """Custom play loop to handle extra turns on 6 and multi-player cycling."""
        self.setup()
        while not self.game_over:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception as e:
                from engine.base import QuitGame, SuspendGame, ShowHelp, ShowTutorial
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
                if not self.game_over:
                    self.switch_player()
            else:
                if move is not None:
                    print("  Invalid move! Try again.")
                    input("  Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! "
                  f"All pieces reached home! ***")
        input("\nPress Enter to return to menu...")
        return self.winner

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return f"""
{'=' * 60}
  LUDO - Tutorial
{'=' * 60}

  OBJECTIVE:
  Be the first player to move all 4 of your pieces from
  your base, around the board, and into your home.

  SETUP:
  - Each player has 4 pieces that start in their base.
  - Players are assigned colors: Red, Blue, Green, Yellow.
  - The main track has {MAIN_TRACK_SIZE} squares shared by all players.
  - Each player has a private home stretch of {HOME_STRETCH_SIZE} squares.

  GAMEPLAY:
  1. Roll a single die (1-6) by pressing Enter.
  2. Choose which piece to move forward by the rolled amount.

  ENTERING THE BOARD:
  - You must roll a 6 to move a piece from base onto the
    board at your start square.
  - Rolling a 6 also grants you an EXTRA TURN.

  CAPTURING:
  - If your piece lands on a square occupied by an opponent's
    piece, the opponent's piece is sent back to their base.
  - Pieces on SAFE squares (marked with *) cannot be captured.
  - Safe squares: {', '.join(str(s) for s in sorted(SAFE_SQUARES))}

  REACHING HOME:
  - After going around the entire board, pieces enter the
    home stretch (H1-H{HOME_STRETCH_SIZE}).
  - You must roll the EXACT number to reach home.
  - Pieces in the home stretch cannot be captured.

  WINNING:
  - The first player to get all 4 pieces home wins.

  DISPLAY:
  - An = Player A's piece n (Red)
  - Bn = Player B's piece n (Blue)
  - Cn = Player C's piece n (Green)
  - Dn = Player D's piece n (Yellow)
  - Sq## = Main track square number
  - H# = Home stretch square number
  - * after a square number = Safe square

  INPUT:
  - Press Enter to roll the dice
  - Enter a piece number (1-4) to choose which piece to move

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'=' * 60}
"""
