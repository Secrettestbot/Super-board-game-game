"""Parcheesi - Classic Indian board game (Pachisi) for 2 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Board constants
MAIN_TRACK_SIZE = 68
HOME_STRETCH_SIZE = 7  # 7 spaces before home

# Each player enters the main track at their start square and travels clockwise.
# Player 1 starts at square 1, Player 2 starts at square 35.
START_POSITIONS = {1: 1, 2: 35}

# Safe spaces on the main track (cannot be captured here).
# Traditionally every start square and certain cross-arm squares are safe.
SAFE_SPACES = {1, 5, 12, 17, 22, 29, 35, 39, 46, 51, 56, 63}

# The last main-track square before a player enters their home stretch.
# After this square the player turns into their private home column.
HOME_ENTRY = {1: 68, 2: 34}

PLAYER_SYMBOLS = {1: "A", 2: "B"}
PLAYER_COLORS = {1: "Blue", 2: "Red"}


class ParcheesiGame(BaseGame):
    """Parcheesi - roll two dice, race your pawns home."""

    name = "Parcheesi"
    description = "Classic race game with two dice, blockades, and captures"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Parcheesi",
        "quick": "Quick Game (2 pawns each)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.pawns_per_player = 2 if self.variation == "quick" else 4
        # Pawn state: "nest", ("main", sq), ("home", n), "finished"
        self.pawns = {}  # {player: [state, ...]}
        self.dice = [0, 0]
        self.dice_used = []  # track which dice values have been consumed this turn
        self.dice_available = []  # values still available
        self.last_event = ""
        self.doubles_count = 0  # consecutive doubles counter
        self.extra_turn = False
        self.bonus_moves = 0  # bonus spaces to assign after capture/home

    # ------------------------------------------------------------------ setup
    def setup(self):
        for p in (1, 2):
            self.pawns[p] = ["nest"] * self.pawns_per_player
        self.current_player = 1
        self.dice = [0, 0]
        self.dice_used = []
        self.dice_available = []
        self.last_event = ""
        self.doubles_count = 0
        self.extra_turn = False
        self.bonus_moves = 0

    # ---------------------------------------------------------------- helpers
    def _rel_pos(self, player, sq):
        """Return how many squares a pawn has travelled from its start."""
        start = START_POSITIONS[player]
        return (sq - start) % MAIN_TRACK_SIZE

    def _abs_sq(self, player, rel):
        """Convert player-relative distance back to absolute square."""
        start = START_POSITIONS[player]
        return ((start + rel - 1) % MAIN_TRACK_SIZE) + 1

    def _calc_new_position(self, player, state, steps):
        """Return new state after moving *steps* from *state*, or None if invalid."""
        if state[0] == "main":
            rel = self._rel_pos(player, state[1])
            new_rel = rel + steps
            # Main track completed at rel == MAIN_TRACK_SIZE (i.e. back to start - 1)
            if new_rel > MAIN_TRACK_SIZE:
                # Entering home stretch
                home_pos = new_rel - MAIN_TRACK_SIZE
                if home_pos > HOME_STRETCH_SIZE:
                    return None  # overshoot
                if home_pos == HOME_STRETCH_SIZE:
                    return "finished"
                return ("home", home_pos)
            elif new_rel == MAIN_TRACK_SIZE:
                # Exactly at home stretch entry; next step would be home 1
                # Actually at rel == MAIN_TRACK_SIZE means they've gone full loop
                # and land on home stretch space 0 which doesn't exist -- they enter
                # home stretch at home_pos = 0 which is the entry. We treat this as
                # still on the main track at the entry square.
                return ("main", self._abs_sq(player, new_rel % MAIN_TRACK_SIZE))
            else:
                new_sq = self._abs_sq(player, new_rel)
                return ("main", new_sq)
        elif state[0] == "home":
            new_home = state[1] + steps
            if new_home > HOME_STRETCH_SIZE:
                return None  # must land exactly
            if new_home == HOME_STRETCH_SIZE:
                return "finished"
            return ("home", new_home)
        return None

    def _is_blockade_at(self, sq, exclude_player=None, exclude_idx=None):
        """Check if there is a blockade (two same-player pawns) at main sq."""
        for pl in (1, 2):
            count = 0
            for i, st in enumerate(self.pawns[pl]):
                if exclude_player == pl and exclude_idx == i:
                    continue
                if st == ("main", sq):
                    count += 1
            if count >= 2:
                return True
        return False

    def _path_blocked(self, player, state, steps, pawn_idx):
        """Check if a blockade exists anywhere along the path (exclusive of start,
        inclusive of destination for opponent blockades)."""
        if state[0] == "main":
            rel = self._rel_pos(player, state[1])
            for s in range(1, steps + 1):
                check_rel = rel + s
                if check_rel > MAIN_TRACK_SIZE:
                    break  # entered home stretch, no blockades there
                if check_rel == MAIN_TRACK_SIZE:
                    check_sq = self._abs_sq(player, 0)
                else:
                    check_sq = self._abs_sq(player, check_rel)
                if self._is_blockade_at(check_sq, exclude_player=player, exclude_idx=pawn_idx):
                    return True
        return False

    def _can_enter(self, player):
        """Check if a pawn can enter from nest (need a 5 from dice)."""
        # Check if we can make 5 from one die or sum of both
        avail = list(self.dice_available)
        if 5 in avail:
            return True
        if len(avail) == 2 and sum(avail) == 5:
            return True
        return False

    def _get_enter_cost(self):
        """Return which dice values to consume when entering. Prefers single 5."""
        avail = list(self.dice_available)
        if 5 in avail:
            return [5]
        if len(avail) == 2 and sum(avail) == 5:
            return list(avail)
        return []

    def _start_sq_blocked(self, player):
        """Check if entry square has a blockade of player's own pawns."""
        sq = START_POSITIONS[player]
        count = sum(1 for st in self.pawns[player] if st == ("main", sq))
        return count >= 2

    def _pawn_can_move(self, player, pawn_idx, die_val):
        """Check if a specific pawn can move with die_val."""
        state = self.pawns[player][pawn_idx]
        if state == "nest" or state == "finished":
            return False
        new = self._calc_new_position(player, state, die_val)
        if new is None:
            return False
        # Check blockade along path
        if self._path_blocked(player, state, die_val, pawn_idx):
            return False
        # Check destination blockade for own pawns (can't form triple)
        if new not in ("finished",) and new[0] == "main":
            count = 0
            for i, st in enumerate(self.pawns[player]):
                if i == pawn_idx:
                    continue
                if st == ("main", new[1]):
                    count += 1
            if count >= 2:
                return False
        return True

    def _any_moves_available(self, player):
        """Check if any legal move exists with remaining dice."""
        for dv in set(self.dice_available):
            for i, st in enumerate(self.pawns[player]):
                if st == "finished":
                    continue
                if st == "nest":
                    continue
                if self._pawn_can_move(player, i, dv):
                    return True
        # Check entering
        if any(st == "nest" for st in self.pawns[player]):
            if self._can_enter(player) and not self._start_sq_blocked(player):
                return True
        return False

    # --------------------------------------------------------------- display
    def display(self):
        p = self.current_player
        print(f"{'=' * 60}")
        print(f"  PARCHEESI  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} ({PLAYER_COLORS[1]})  vs  "
              f"{self.players[1]} ({PLAYER_COLORS[2]})")
        print(f"{'=' * 60}")

        if self.last_event:
            print(f"\n  {self.last_event}")

        print()
        for pl in (1, 2):
            sym = PLAYER_SYMBOLS[pl]
            color = PLAYER_COLORS[pl]
            marker = " >> " if pl == p else "    "
            descs = []
            for i, st in enumerate(self.pawns[pl]):
                label = f"{sym}{i + 1}"
                if st == "nest":
                    descs.append(f"{label}:Nest")
                elif st == "finished":
                    descs.append(f"{label}:HOME")
                elif st[0] == "main":
                    descs.append(f"{label}:Sq{st[1]}")
                elif st[0] == "home":
                    descs.append(f"{label}:H{st[1]}")
            print(f"{marker}{self.players[pl - 1]} ({color}): {', '.join(descs)}")

        print()
        self._draw_track()

        print(f"\n  Current turn: {self.players[p - 1]} ({PLAYER_COLORS[p]})")
        if self.dice != [0, 0]:
            print(f"  Dice: {self.dice[0]}, {self.dice[1]}")
            if self.dice_available:
                print(f"  Available: {self.dice_available}")

    def _draw_track(self):
        track = {sq: [] for sq in range(1, MAIN_TRACK_SIZE + 1)}
        home_stretches = {pl: {h: [] for h in range(1, HOME_STRETCH_SIZE)} for pl in (1, 2)}

        for pl in (1, 2):
            sym = PLAYER_SYMBOLS[pl]
            for i, st in enumerate(self.pawns[pl]):
                if st == "nest" or st == "finished":
                    continue
                if st[0] == "main":
                    track[st[1]].append(f"{sym}{i + 1}")
                elif st[0] == "home":
                    home_stretches[pl][st[1]].append(f"{sym}{i + 1}")

        occupied = [(sq, occs) for sq, occs in sorted(track.items()) if occs]
        if occupied:
            print("  Main track (occupied):")
            parts = []
            for sq, occs in occupied:
                safe = "*" if sq in SAFE_SPACES else ""
                parts.append(f"[{sq}{safe}: {','.join(occs)}]")
            for i in range(0, len(parts), 4):
                print("    " + "  ".join(parts[i:i + 4]))
        else:
            print("  Main track: (empty)")

        for pl in (1, 2):
            hs = home_stretches[pl]
            occ = [(h, o) for h, o in sorted(hs.items()) if o]
            if occ:
                print(f"  {PLAYER_COLORS[pl]} home stretch: ", end="")
                print("  ".join(f"H{h}:{','.join(o)}" for h, o in occ))

        print(f"\n  Safe spaces (*): {', '.join(str(s) for s in sorted(SAFE_SPACES))}")
        print(f"  Start squares: {PLAYER_COLORS[1]}={START_POSITIONS[1]}, "
              f"{PLAYER_COLORS[2]}={START_POSITIONS[2]}")

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Roll dice, then let the player assign each die to a pawn."""
        p = self.current_player
        sym = PLAYER_SYMBOLS[p]

        # Roll dice
        input_with_quit("  Press Enter to roll the dice... ")
        d1 = random.randint(1, 6)
        d2 = random.randint(1, 6)
        self.dice = [d1, d2]
        self.dice_available = [d1, d2]
        is_doubles = d1 == d2

        print(f"\n  Rolled: {d1} and {d2}" + (" (DOUBLES!)" if is_doubles else ""))

        # Three consecutive doubles penalty
        if is_doubles:
            self.doubles_count += 1
            if self.doubles_count >= 3:
                print("  Three doubles in a row! Furthest pawn returns to nest.")
                input("  Press Enter to continue...")
                return ("triple_doubles",)
            self.extra_turn = True
            print("  You get another turn!")
        else:
            self.doubles_count = 0
            self.extra_turn = False

        moves = []
        while self.dice_available:
            if not self._any_moves_available(p):
                if self.dice_available:
                    print(f"  No legal moves with remaining dice {self.dice_available}.")
                    input("  Press Enter to continue...")
                break

            nest_pawns = [i for i, st in enumerate(self.pawns[p]) if st == "nest"]
            board_pawns = [i for i, st in enumerate(self.pawns[p])
                           if st not in ("nest", "finished")]

            print(f"\n  Dice available: {self.dice_available}")
            print("  Your pawns:")
            for i, st in enumerate(self.pawns[p]):
                if st == "finished":
                    print(f"    {sym}{i + 1}: HOME")
                elif st == "nest":
                    print(f"    {sym}{i + 1}: Nest")
                elif st[0] == "main":
                    print(f"    {sym}{i + 1}: Sq{st[1]}")
                elif st[0] == "home":
                    print(f"    {sym}{i + 1}: H{st[1]}")

            can_enter = (nest_pawns and self._can_enter(p)
                         and not self._start_sq_blocked(p))

            print("\n  Commands:")
            print("    <die_value> <pawn#>  - Move pawn using that die value")
            if can_enter:
                print("    enter <pawn#>        - Enter a pawn from nest (uses a 5)")
                if len(self.dice_available) == 2 and sum(self.dice_available) == 5 and 5 not in self.dice_available:
                    print(f"    enter <pawn#> {self.dice_available[0]} {self.dice_available[1]}  - Enter using both dice")
            print("    done                 - End turn (forfeit remaining dice)")

            raw = input_with_quit("  > ").strip().lower()

            if raw == "done":
                break

            parts = raw.split()

            if parts[0] == "enter":
                if not can_enter:
                    print("  Cannot enter a pawn right now (need a 5).")
                    continue
                if len(parts) < 2:
                    print("  Usage: enter <pawn#>")
                    continue
                try:
                    pidx = int(parts[1]) - 1
                except ValueError:
                    print("  Invalid pawn number.")
                    continue
                if pidx < 0 or pidx >= self.pawns_per_player:
                    print(f"  Pawn number must be 1-{self.pawns_per_player}.")
                    continue
                if self.pawns[p][pidx] != "nest":
                    print(f"  Pawn {sym}{pidx + 1} is not in the nest.")
                    continue
                cost = self._get_enter_cost()
                if not cost:
                    print("  Cannot form a 5 from available dice.")
                    continue
                moves.append(("enter", pidx, cost))
                for c in cost:
                    self.dice_available.remove(c)
                # Temporarily place pawn to update state for subsequent moves
                self.pawns[p][pidx] = ("main", START_POSITIONS[p])
                print(f"  {sym}{pidx + 1} enters at Sq{START_POSITIONS[p]}.")

            else:
                # <die_value> <pawn#>
                if len(parts) < 2:
                    print("  Usage: <die_value> <pawn#>")
                    continue
                try:
                    die_val = int(parts[0])
                    pidx = int(parts[1]) - 1
                except ValueError:
                    print("  Invalid input. Use: <die_value> <pawn#>")
                    continue
                if die_val not in self.dice_available:
                    print(f"  Die value {die_val} is not available. Available: {self.dice_available}")
                    continue
                if pidx < 0 or pidx >= self.pawns_per_player:
                    print(f"  Pawn number must be 1-{self.pawns_per_player}.")
                    continue
                if not self._pawn_can_move(p, pidx, die_val):
                    print(f"  Pawn {sym}{pidx + 1} cannot move {die_val} spaces.")
                    continue
                old_state = self.pawns[p][pidx]
                new_state = self._calc_new_position(p, old_state, die_val)
                moves.append(("move", pidx, die_val))
                self.dice_available.remove(die_val)
                # Temporarily update for subsequent decisions
                self.pawns[p][pidx] = new_state if new_state != "finished" else "finished"
                if new_state == "finished":
                    print(f"  {sym}{pidx + 1} reaches HOME!")
                elif new_state[0] == "main":
                    print(f"  {sym}{pidx + 1} moves to Sq{new_state[1]}.")
                elif new_state[0] == "home":
                    print(f"  {sym}{pidx + 1} moves to H{new_state[1]}.")

        return ("turn", moves, is_doubles)

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False

        p = self.current_player
        sym = PLAYER_SYMBOLS[p]

        if move[0] == "triple_doubles":
            # Send furthest pawn to nest
            best_idx = self._furthest_pawn(p)
            if best_idx is not None:
                self.pawns[p][best_idx] = "nest"
                self.last_event = (f"{self.players[p - 1]}: Three doubles! "
                                   f"{sym}{best_idx + 1} sent back to nest.")
            else:
                self.last_event = f"{self.players[p - 1]}: Three doubles! (no pawn to penalize)"
            self.doubles_count = 0
            self.extra_turn = False
            return True

        _, sub_moves, is_doubles = move
        events = []
        self.bonus_moves = 0

        # Pawns were already moved during get_move for interactive feedback.
        # Now handle captures and bonuses.
        for sm in sub_moves:
            if sm[0] == "enter":
                pidx = sm[1]
                sq = START_POSITIONS[p]
                cap = self._handle_capture(p, sq)
                if cap:
                    events.append(cap)
            elif sm[0] == "move":
                pidx = sm[1]
                state = self.pawns[p][pidx]
                if state == "finished":
                    events.append(f"{sym}{pidx + 1} HOME! +10 bonus.")
                    self.bonus_moves += 10
                elif state[0] == "main":
                    cap = self._handle_capture(p, state[1])
                    if cap:
                        events.append(cap)

        # Apply bonus moves
        if self.bonus_moves > 0:
            self._apply_bonus(p, self.bonus_moves)
            events.append(f"(Bonus {self.bonus_moves} applied)")
            self.bonus_moves = 0

        desc_parts = []
        for sm in sub_moves:
            if sm[0] == "enter":
                desc_parts.append(f"{sym}{sm[1] + 1} entered")
            elif sm[0] == "move":
                desc_parts.append(f"{sym}{sm[1] + 1} moved {sm[2]}")
        if not desc_parts:
            desc_parts.append("no moves")

        self.last_event = (f"{self.players[p - 1]} [{self.dice[0]},{self.dice[1]}]: "
                           + ", ".join(desc_parts)
                           + (" | " + "; ".join(events) if events else ""))

        return True

    def _furthest_pawn(self, player):
        """Return index of the pawn furthest along the track (not finished)."""
        best_idx = None
        best_dist = -1
        for i, st in enumerate(self.pawns[player]):
            if st == "nest" or st == "finished":
                continue
            if st[0] == "main":
                dist = self._rel_pos(player, st[1])
            elif st[0] == "home":
                dist = MAIN_TRACK_SIZE + st[1]
            else:
                continue
            if dist > best_dist:
                best_dist = dist
                best_idx = i
        return best_idx

    def _handle_capture(self, player, sq):
        """Capture opponent pawn at sq if not safe. Returns description or empty string."""
        if sq in SAFE_SPACES:
            return ""
        opp = 2 if player == 1 else 1
        captured = ""
        for i, st in enumerate(self.pawns[opp]):
            if st == ("main", sq):
                self.pawns[opp][i] = "nest"
                sym = PLAYER_SYMBOLS[opp]
                captured += f"CAPTURED {sym}{i + 1}! +20 bonus. "
                self.bonus_moves += 20
        return captured

    def _apply_bonus(self, player, bonus):
        """Apply bonus move spaces to a movable pawn."""
        # Try to apply to the furthest pawn that can accept the bonus
        for _ in range(bonus):
            moved = False
            for i, st in enumerate(self.pawns[player]):
                if st == "finished" or st == "nest":
                    continue
                new = self._calc_new_position(player, st, 1)
                if new is not None and not (st[0] == "main" and
                        self._path_blocked(player, st, 1, i)):
                    if new == "finished":
                        self.pawns[player][i] = "finished"
                    else:
                        self.pawns[player][i] = new
                    moved = True
                    break
            if not moved:
                break

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.extra_turn:
            self.extra_turn = False
            return
        self.current_player = 2 if self.current_player == 1 else 1

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if all(st == "finished" for st in self.pawns[p]):
                self.game_over = True
                self.winner = p
                return

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        def ser(st):
            if st in ("nest", "finished"):
                return st
            return list(st)

        return {
            "pawns": {str(k): [ser(s) for s in v] for k, v in self.pawns.items()},
            "pawns_per_player": self.pawns_per_player,
            "dice": self.dice,
            "last_event": self.last_event,
            "doubles_count": self.doubles_count,
            "extra_turn": self.extra_turn,
            "bonus_moves": self.bonus_moves,
        }

    def load_state(self, state):
        def deser(s):
            if s in ("nest", "finished"):
                return s
            return tuple(s)

        self.pawns_per_player = state.get("pawns_per_player", self.pawns_per_player)
        self.dice = state.get("dice", [0, 0])
        self.last_event = state.get("last_event", "")
        self.doubles_count = state.get("doubles_count", 0)
        self.extra_turn = state.get("extra_turn", False)
        self.bonus_moves = state.get("bonus_moves", 0)
        self.pawns = {}
        for k, v in state["pawns"].items():
            self.pawns[int(k)] = [deser(s) for s in v]

    # ----------------------------------------------------------- play override
    def play(self):
        if not self._resumed:
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
                print("  Invalid move! Try again.")
                input("  Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! "
                  f"All pawns reached home! ***")
        input("\nPress Enter to return to menu...")
        return self.winner

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return f"""
{'=' * 60}
  PARCHEESI - Tutorial
{'=' * 60}

  OBJECTIVE:
  Be the first player to move all your pawns from your nest,
  around the board, through your home stretch, and into home.

  SETUP:
  - Each player has {self.pawns_per_player} pawns starting in their nest.
  - The main track has {MAIN_TRACK_SIZE} spaces arranged in a cross shape.
  - Each player has a private home stretch of {HOME_STRETCH_SIZE} spaces.

  DICE:
  - Roll two dice each turn. You can split the values between
    different pawns or use both for one pawn.

  ENTERING THE BOARD:
  - To bring a pawn out of the nest, you need a total of 5
    (from one die showing 5, or the sum of both dice).
  - The pawn enters at your start square.

  MOVEMENT:
  - Move pawns clockwise around the main track.
  - After circling the board, enter your private home stretch.
  - You must land exactly on home (no overshooting).

  CAPTURES:
  - Land on an opponent's pawn (not on a safe space) to send
    it back to their nest. Bonus: 20 extra spaces.
  - Safe spaces: {', '.join(str(s) for s in sorted(SAFE_SPACES))}

  BLOCKADES:
  - Two of your pawns on the same space form a blockade.
  - Nothing can pass through a blockade (not even your own).

  DOUBLES:
  - Roll doubles to get an extra turn.
  - Three doubles in a row: your furthest pawn goes to nest.

  HOME BONUS:
  - Getting a pawn home earns 10 bonus spaces for another pawn.

  INPUT:
  - <die_value> <pawn#>  : Move pawn using that die value
  - enter <pawn#>        : Enter a pawn from nest (uses a 5)
  - done                 : End turn (forfeit remaining dice)

  DISPLAY:
  - A1-A{self.pawns_per_player} = {PLAYER_COLORS[1]} pawns, B1-B{self.pawns_per_player} = {PLAYER_COLORS[2]} pawns
  - Sq## = Main track square, H# = Home stretch square
  - * = Safe space (no captures)

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'=' * 60}
"""
