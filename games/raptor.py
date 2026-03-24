"""Raptor - Asymmetric pursuit game: Raptors vs Scientists."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Action cards for both sides (1-9)
RAPTOR_POWERS = {
    1: "Mother recovers all sleep tokens",
    2: "Mother recovers all sleep tokens",
    3: "Mother moves + attacks adjacent scientist",
    4: "Baby moves 2 spaces toward edge",
    5: "Baby moves 2 spaces toward edge",
    6: "Mother moves + attacks adjacent scientist",
    7: "Mother moves 2 spaces + attacks",
    8: "Mother moves + frightens scientists (pushes back 2)",
    9: "Mother moves 3 spaces + attacks all adjacent",
}

SCIENTIST_POWERS = {
    1: "Place a new scientist on board edge",
    2: "Place a new scientist on board edge",
    3: "Tranquilizer: put 1 sleep token on mother",
    4: "Tranquilizer: put 1 sleep token on mother",
    5: "Capture: take a sleeping baby",
    6: "Jeep: move a scientist 3 spaces",
    7: "Tranquilizer x2: put 2 sleep tokens on mother",
    8: "Net: immobilize mother for 1 turn",
    9: "Helicopter: place scientist anywhere + capture adjacent sleeping baby",
}

MOTHER_MAX_SLEEP = 5  # mother tranquilized at 5 sleep tokens


class RaptorGame(BaseGame):
    """Raptor - an asymmetric pursuit game: Raptors vs Scientists."""

    name = "Raptor"
    description = "Raptors try to escape; Scientists try to capture"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (6x9 grid)",
        "small": "Small game (5x7 grid)",
        "quick": "Quick game (5x7 grid, 2 babies to escape/capture)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.players = ["Raptor", "Scientists"]
        if self.variation in ("small", "quick"):
            self.rows = 5
            self.cols = 7
        else:
            self.rows = 6
            self.cols = 9
        if self.variation == "quick":
            self.babies_to_win = 2
        else:
            self.babies_to_win = 3
        # Board positions
        self.mother_pos = None       # (row, col)
        self.mother_sleep = 0        # sleep tokens on mother
        self.mother_immobile = False  # netted this turn
        self.babies = []             # list of {"pos": (r,c), "asleep": bool}
        self.scientists = []         # list of {"pos": (r,c), "active": bool}
        self.babies_escaped = 0
        self.babies_captured = 0
        self.scientists_removed = 0
        self.max_scientists = 10
        # Cards
        self.raptor_hand = []
        self.scientist_hand = []
        self.raptor_discard = []
        self.scientist_discard = []
        self.phase = "select"  # select -> resolve -> action_points
        self.raptor_card = None
        self.scientist_card = None
        self.action_points = 0
        self.action_player = 0  # who gets action points
        self.log = []

    def _deal_cards(self):
        """Each player gets 3 cards from shuffled 1-9."""
        raptor_deck = list(range(1, 10))
        scientist_deck = list(range(1, 10))
        random.shuffle(raptor_deck)
        random.shuffle(scientist_deck)
        # Keep existing hand, add from deck, cap at 3
        while len(self.raptor_hand) < 3 and raptor_deck:
            c = raptor_deck.pop()
            if c not in self.raptor_hand:
                self.raptor_hand.append(c)
        while len(self.scientist_hand) < 3 and scientist_deck:
            c = scientist_deck.pop()
            if c not in self.scientist_hand:
                self.scientist_hand.append(c)

    def _place_initial(self):
        """Place mother, babies, and starting scientists."""
        mid_r = self.rows // 2
        mid_c = self.cols // 2
        self.mother_pos = [mid_r, mid_c]
        self.mother_sleep = 0

        # Place babies around mother
        baby_offsets = [(-1, 0), (0, -2), (0, 2)]
        self.babies = []
        for dr, dc in baby_offsets:
            br, bc = mid_r + dr, mid_c + dc
            br = max(0, min(self.rows - 1, br))
            bc = max(0, min(self.cols - 1, bc))
            self.babies.append({"pos": [br, bc], "asleep": False})

        # Place starting scientists on edges
        self.scientists = []
        edge_positions = []
        for r in range(self.rows):
            edge_positions.append([r, 0])
            edge_positions.append([r, self.cols - 1])
        for c in range(1, self.cols - 1):
            edge_positions.append([0, c])
            edge_positions.append([self.rows - 1, c])
        random.shuffle(edge_positions)
        for i in range(4):
            if i < len(edge_positions):
                self.scientists.append({"pos": edge_positions[i], "active": True})

    def setup(self):
        self._place_initial()
        self.raptor_hand = []
        self.scientist_hand = []
        self._deal_cards()
        self.phase = "select"
        self.current_player = 1

    def _cell_char(self, r, c):
        """Get character to display at position (r,c)."""
        # Mother
        if self.mother_pos and self.mother_pos[0] == r and self.mother_pos[1] == c:
            if self.mother_sleep >= MOTHER_MAX_SLEEP:
                return "X"  # tranquilized
            return "M"
        # Babies
        for b in self.babies:
            if b["pos"][0] == r and b["pos"][1] == c:
                return "z" if b["asleep"] else "b"
        # Scientists
        for s in self.scientists:
            if s["active"] and s["pos"][0] == r and s["pos"][1] == c:
                return "S"
        return "."

    def display(self):
        clear_screen()
        print("=" * 55)
        print("  RAPTOR - Raptors vs Scientists")
        print("=" * 55)
        print(f"  Babies escaped: {self.babies_escaped}/{self.babies_to_win}  |  "
              f"Babies captured: {self.babies_captured}/{self.babies_to_win}")
        print(f"  Mother sleep tokens: {self.mother_sleep}/{MOTHER_MAX_SLEEP}  |  "
              f"Scientists on board: {sum(1 for s in self.scientists if s['active'])}")
        print()

        # Board
        print("  Board: (M=Mother, b=baby, z=sleeping baby, S=Scientist)")
        col_header = "    " + " ".join(str(c) for c in range(self.cols))
        print(col_header)
        for r in range(self.rows):
            row_str = f"  {r} "
            for c in range(self.cols):
                ch = self._cell_char(r, c)
                row_str += ch + " "
            # Mark edge escapes
            print(row_str)
        print()

        # Phase info
        if self.phase == "select":
            p = self.current_player
            print(f"  Phase: Card Selection")
            if p == 1:
                print(f"  Raptor's hand: {self.raptor_hand}")
                print(f"  (Powers: {', '.join(str(c) + ':' + RAPTOR_POWERS[c][:30] for c in self.raptor_hand)})")
            else:
                print(f"  Scientist's hand: {self.scientist_hand}")
                print(f"  (Powers: {', '.join(str(c) + ':' + SCIENTIST_POWERS[c][:30] for c in self.scientist_hand)})")
        elif self.phase == "resolve":
            print(f"  Raptor played: {self.raptor_card}  |  Scientist played: {self.scientist_card}")
            diff = abs(self.raptor_card - self.scientist_card)
            if self.raptor_card < self.scientist_card:
                print(f"  >> Raptor uses power! Scientist gets {diff} action points.")
            elif self.scientist_card < self.raptor_card:
                print(f"  >> Scientist uses power! Raptor gets {diff} action points.")
            else:
                print(f"  >> Tie! No power, no action points.")
        elif self.phase == "action_points":
            print(f"  {self.players[self.action_player - 1]} has {self.action_points} action points remaining.")
            print(f"  Actions cost 1 point each. (move a piece, attack, etc.)")
        print()

        # Log
        if self.log:
            for entry in self.log[-5:]:
                print(f"  {entry}")
            print()

    def get_move(self):
        if self.phase == "select":
            p = self.current_player
            hand = self.raptor_hand if p == 1 else self.scientist_hand
            label = "Raptor" if p == 1 else "Scientist"
            print(f"  {label}, choose a card to play {hand}: ", end="")
            move = input_with_quit("").strip()
            return ("select", move)

        elif self.phase == "action_points":
            p = self.action_player
            if p == 1:
                print("  Raptor actions: move R C R2 C2 (move piece), attack R C (attack scientist),")
                print("                  done (end actions)")
            else:
                print("  Scientist actions: move R C R2 C2 (move scientist),")
                print("    shoot R C (tranq mother), capture R C (sleeping baby), done")
            move = input_with_quit("  > ").strip()
            return ("action", move)

        return ("done", "")

    def make_move(self, move):
        mtype, mdata = move

        if mtype == "select":
            try:
                card = int(mdata)
            except ValueError:
                return False

            p = self.current_player
            hand = self.raptor_hand if p == 1 else self.scientist_hand
            if card not in hand:
                return False

            if p == 1:
                self.raptor_card = card
                self.raptor_hand.remove(card)
                self.log.append("Raptor selects a card (hidden)")
                # Don't switch player yet via base class; handle internally
                self.current_player = 2
                return True
            else:
                self.scientist_card = card
                self.scientist_hand.remove(card)
                self.log.append("Scientist selects a card (hidden)")
                self.phase = "resolve"
                self._resolve_cards()
                return True

        elif mtype == "action":
            return self._handle_action(mdata)

        elif mtype == "done":
            return True

        return False

    def _resolve_cards(self):
        """Resolve simultaneously revealed cards."""
        rc = self.raptor_card
        sc = self.scientist_card
        self.log.append(f"Raptor plays {rc}, Scientist plays {sc}")

        if rc < sc:
            # Raptor uses power, scientist gets action points
            self._apply_raptor_power(rc)
            diff = sc - rc
            self.action_points = diff
            self.action_player = 2
            self.current_player = 2
            self.phase = "action_points"
        elif sc < rc:
            # Scientist uses power, raptor gets action points
            self._apply_scientist_power(sc)
            diff = rc - sc
            self.action_points = diff
            self.action_player = 1
            self.current_player = 1
            self.phase = "action_points"
        else:
            # Tie - nothing happens
            self.log.append("Tie! No effects.")
            self._end_turn()

    def _apply_raptor_power(self, card):
        """Apply raptor's special power."""
        self.log.append(f"Raptor power: {RAPTOR_POWERS[card]}")
        if card <= 2:
            self.mother_sleep = 0
            self.log.append("Mother recovers all sleep tokens!")
        elif card <= 4:
            # Move a baby toward nearest edge
            awake_babies = [b for b in self.babies if not b["asleep"]]
            if awake_babies:
                baby = awake_babies[0]
                self._move_baby_toward_edge(baby, 2)
        elif card <= 6:
            # Mother attacks adjacent scientist
            self._mother_attack()
        elif card == 7:
            self._move_mother(2)
            self._mother_attack()
        elif card == 8:
            self._move_mother(1)
            self._frighten_scientists()
        elif card == 9:
            self._move_mother(3)
            self._mother_attack_all()

    def _apply_scientist_power(self, card):
        """Apply scientist's special power."""
        self.log.append(f"Scientist power: {SCIENTIST_POWERS[card]}")
        if card <= 2:
            self._place_scientist_edge()
        elif card <= 4:
            self.mother_sleep = min(MOTHER_MAX_SLEEP, self.mother_sleep + 1)
            self.log.append(f"Tranquilizer! Mother sleep: {self.mother_sleep}")
        elif card == 5:
            self._capture_sleeping_baby()
        elif card == 6:
            # Move a scientist 3 spaces - handled in action points
            active = [s for s in self.scientists if s["active"]]
            if active:
                s = active[0]
                self.log.append(f"Jeep: scientist at ({s['pos'][0]},{s['pos'][1]}) can move 3")
        elif card == 7:
            self.mother_sleep = min(MOTHER_MAX_SLEEP, self.mother_sleep + 2)
            self.log.append(f"Double tranq! Mother sleep: {self.mother_sleep}")
        elif card == 8:
            self.mother_immobile = True
            self.log.append("Net! Mother immobilized this turn.")
        elif card == 9:
            self._place_scientist_edge()
            self._capture_sleeping_baby()

    def _move_mother(self, steps):
        if self.mother_immobile:
            self.log.append("Mother is immobilized!")
            return
        # Move mother toward nearest baby or scientist
        # Simple: move toward center of babies
        if not self.babies:
            return
        target_r = sum(b["pos"][0] for b in self.babies) // max(1, len(self.babies))
        target_c = sum(b["pos"][1] for b in self.babies) // max(1, len(self.babies))
        for _ in range(steps):
            dr = 0 if target_r == self.mother_pos[0] else (1 if target_r > self.mother_pos[0] else -1)
            dc = 0 if target_c == self.mother_pos[1] else (1 if target_c > self.mother_pos[1] else -1)
            self.mother_pos[0] = max(0, min(self.rows - 1, self.mother_pos[0] + dr))
            self.mother_pos[1] = max(0, min(self.cols - 1, self.mother_pos[1] + dc))

    def _mother_attack(self):
        """Mother attacks one adjacent scientist."""
        if self.mother_pos is None:
            return
        mr, mc = self.mother_pos
        for s in self.scientists:
            if s["active"]:
                sr, sc = s["pos"]
                if abs(sr - mr) <= 1 and abs(sc - mc) <= 1:
                    s["active"] = False
                    self.scientists_removed += 1
                    self.log.append(f"Mother attacks scientist at ({sr},{sc})!")
                    return

    def _mother_attack_all(self):
        """Mother attacks all adjacent scientists."""
        if self.mother_pos is None:
            return
        mr, mc = self.mother_pos
        for s in self.scientists:
            if s["active"]:
                sr, sc = s["pos"]
                if abs(sr - mr) <= 1 and abs(sc - mc) <= 1:
                    s["active"] = False
                    self.scientists_removed += 1
                    self.log.append(f"Mother attacks scientist at ({sr},{sc})!")

    def _frighten_scientists(self):
        """Push all scientists back 2 spaces from mother."""
        if self.mother_pos is None:
            return
        mr, mc = self.mother_pos
        for s in self.scientists:
            if s["active"]:
                sr, sc = s["pos"]
                dr = sr - mr
                dc = sc - mc
                if abs(dr) <= 2 and abs(dc) <= 2:
                    nr = max(0, min(self.rows - 1, sr + (2 if dr >= 0 else -2)))
                    nc = max(0, min(self.cols - 1, sc + (2 if dc >= 0 else -2)))
                    s["pos"] = [nr, nc]
                    self.log.append(f"Scientist frightened to ({nr},{nc})")

    def _move_baby_toward_edge(self, baby, steps):
        """Move baby toward nearest board edge."""
        r, c = baby["pos"]
        # Find nearest edge
        distances = [r, self.rows - 1 - r, c, self.cols - 1 - c]
        min_dist = min(distances)
        idx = distances.index(min_dist)
        for _ in range(steps):
            if idx == 0:
                baby["pos"][0] = max(0, baby["pos"][0] - 1)
            elif idx == 1:
                baby["pos"][0] = min(self.rows - 1, baby["pos"][0] + 1)
            elif idx == 2:
                baby["pos"][1] = max(0, baby["pos"][1] - 1)
            else:
                baby["pos"][1] = min(self.cols - 1, baby["pos"][1] + 1)
        # Check if escaped
        br, bc = baby["pos"]
        if br == 0 or br == self.rows - 1 or bc == 0 or bc == self.cols - 1:
            self.babies.remove(baby)
            self.babies_escaped += 1
            self.log.append(f"Baby escaped at ({br},{bc})!")

    def _place_scientist_edge(self):
        """Place a new scientist on a random board edge."""
        active_count = sum(1 for s in self.scientists if s["active"])
        if active_count >= self.max_scientists:
            self.log.append("Max scientists reached!")
            return
        edges = []
        for r in range(self.rows):
            edges.append([r, 0])
            edges.append([r, self.cols - 1])
        for c in range(1, self.cols - 1):
            edges.append([0, c])
            edges.append([self.rows - 1, c])
        random.shuffle(edges)
        # Pick an unoccupied edge
        for pos in edges:
            occupied = False
            for s in self.scientists:
                if s["active"] and s["pos"] == pos:
                    occupied = True
                    break
            if not occupied:
                self.scientists.append({"pos": pos, "active": True})
                self.log.append(f"New scientist placed at ({pos[0]},{pos[1]})")
                return

    def _capture_sleeping_baby(self):
        """Capture a sleeping baby adjacent to a scientist."""
        for s in self.scientists:
            if not s["active"]:
                continue
            sr, sc = s["pos"]
            for baby in self.babies[:]:
                if baby["asleep"]:
                    br, bc = baby["pos"]
                    if abs(br - sr) <= 1 and abs(bc - sc) <= 1:
                        self.babies.remove(baby)
                        self.babies_captured += 1
                        self.log.append(f"Scientist captures sleeping baby at ({br},{bc})!")
                        return

    def _handle_action(self, mdata):
        """Handle action point spending."""
        parts = mdata.split()
        if not parts:
            return False

        cmd = parts[0].lower()

        if cmd == "done":
            self._end_turn()
            return True

        if self.action_points <= 0:
            print("  No action points remaining!")
            input("  Press Enter...")
            self._end_turn()
            return True

        p = self.action_player

        if cmd == "move" and len(parts) == 5:
            try:
                r1, c1, r2, c2 = int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4])
            except ValueError:
                return False

            if p == 1:  # Raptor moves
                # Move mother or baby
                if self.mother_pos and self.mother_pos[0] == r1 and self.mother_pos[1] == c1:
                    if self.mother_immobile:
                        print("  Mother is immobilized!")
                        input("  Press Enter...")
                        return False
                    dist = abs(r2 - r1) + abs(c2 - c1)
                    if dist > 1 or r2 < 0 or r2 >= self.rows or c2 < 0 or c2 >= self.cols:
                        return False
                    self.mother_pos = [r2, c2]
                    self.action_points -= 1
                    self.log.append(f"Mother moves to ({r2},{c2})")
                    # Attack adjacent scientist after move
                    self._mother_attack()
                    return True
                else:
                    for baby in self.babies:
                        if baby["pos"][0] == r1 and baby["pos"][1] == c1 and not baby["asleep"]:
                            dist = abs(r2 - r1) + abs(c2 - c1)
                            if dist > 1 or r2 < 0 or r2 >= self.rows or c2 < 0 or c2 >= self.cols:
                                return False
                            baby["pos"] = [r2, c2]
                            self.action_points -= 1
                            self.log.append(f"Baby moves to ({r2},{c2})")
                            # Check escape
                            if r2 == 0 or r2 == self.rows - 1 or c2 == 0 or c2 == self.cols - 1:
                                self.babies.remove(baby)
                                self.babies_escaped += 1
                                self.log.append(f"Baby escaped!")
                            return True
            else:  # Scientist moves
                for s in self.scientists:
                    if s["active"] and s["pos"][0] == r1 and s["pos"][1] == c1:
                        dist = abs(r2 - r1) + abs(c2 - c1)
                        if dist > 1 or r2 < 0 or r2 >= self.rows or c2 < 0 or c2 >= self.cols:
                            return False
                        s["pos"] = [r2, c2]
                        self.action_points -= 1
                        self.log.append(f"Scientist moves to ({r2},{c2})")
                        return True
            return False

        elif cmd == "attack" and len(parts) == 3 and p == 1:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            mr, mc = self.mother_pos
            if abs(r - mr) > 1 or abs(c - mc) > 1:
                print("  Target not adjacent to mother!")
                input("  Press Enter...")
                return False
            for s in self.scientists:
                if s["active"] and s["pos"][0] == r and s["pos"][1] == c:
                    s["active"] = False
                    self.scientists_removed += 1
                    self.action_points -= 1
                    self.log.append(f"Mother attacks scientist at ({r},{c})!")
                    return True
            return False

        elif cmd == "shoot" and len(parts) == 3 and p == 2:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            if self.mother_pos and self.mother_pos[0] == r and self.mother_pos[1] == c:
                # Must have a scientist with line of sight
                has_los = False
                for s in self.scientists:
                    if s["active"]:
                        sr, sc = s["pos"]
                        if sr == r or sc == c:
                            has_los = True
                            break
                if has_los:
                    self.mother_sleep = min(MOTHER_MAX_SLEEP, self.mother_sleep + 1)
                    self.action_points -= 1
                    self.log.append(f"Tranquilizer! Mother sleep: {self.mother_sleep}")
                    return True
                else:
                    print("  No scientist has line of sight!")
                    input("  Press Enter...")
                    return False
            return False

        elif cmd == "capture" and len(parts) == 3 and p == 2:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            for baby in self.babies[:]:
                if baby["asleep"] and baby["pos"][0] == r and baby["pos"][1] == c:
                    # Must have adjacent scientist
                    has_adj = False
                    for s in self.scientists:
                        if s["active"]:
                            sr, sc = s["pos"]
                            if abs(sr - r) <= 1 and abs(sc - c) <= 1:
                                has_adj = True
                                break
                    if has_adj:
                        self.babies.remove(baby)
                        self.babies_captured += 1
                        self.action_points -= 1
                        self.log.append(f"Baby captured at ({r},{c})!")
                        return True
                    else:
                        print("  No adjacent scientist!")
                        input("  Press Enter...")
                        return False
            return False

        return False

    def _end_turn(self):
        """End current turn, prepare for next card selection."""
        self.action_points = 0
        self.raptor_card = None
        self.scientist_card = None
        self.mother_immobile = False
        self.phase = "select"
        self.current_player = 1
        self._deal_cards()

    def check_game_over(self):
        if self.babies_escaped >= self.babies_to_win:
            self.game_over = True
            self.winner = 1  # Raptor wins
        elif self.babies_captured >= self.babies_to_win:
            self.game_over = True
            self.winner = 2  # Scientists win
        elif self.mother_sleep >= MOTHER_MAX_SLEEP:
            self.game_over = True
            self.winner = 2  # Scientists win (mother tranquilized)
        elif not any(s["active"] for s in self.scientists):
            self.game_over = True
            self.winner = 1  # Raptor wins (all scientists removed)

    def get_state(self):
        return {
            "mother_pos": self.mother_pos,
            "mother_sleep": self.mother_sleep,
            "mother_immobile": self.mother_immobile,
            "babies": self.babies,
            "scientists": self.scientists,
            "babies_escaped": self.babies_escaped,
            "babies_captured": self.babies_captured,
            "scientists_removed": self.scientists_removed,
            "raptor_hand": self.raptor_hand,
            "scientist_hand": self.scientist_hand,
            "phase": self.phase,
            "raptor_card": self.raptor_card,
            "scientist_card": self.scientist_card,
            "action_points": self.action_points,
            "action_player": self.action_player,
            "log": self.log[-20:],
        }

    def load_state(self, state):
        self.mother_pos = state["mother_pos"]
        self.mother_sleep = state["mother_sleep"]
        self.mother_immobile = state["mother_immobile"]
        self.babies = state["babies"]
        self.scientists = state["scientists"]
        self.babies_escaped = state["babies_escaped"]
        self.babies_captured = state["babies_captured"]
        self.scientists_removed = state["scientists_removed"]
        self.raptor_hand = state["raptor_hand"]
        self.scientist_hand = state["scientist_hand"]
        self.phase = state["phase"]
        self.raptor_card = state["raptor_card"]
        self.scientist_card = state["scientist_card"]
        self.action_points = state["action_points"]
        self.action_player = state["action_player"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  RAPTOR - Tutorial
==================================================

  OVERVIEW:
  Raptor is an asymmetric 2-player game. Player 1 controls
  the Raptor (mother M + 3 babies b). Player 2 controls
  Scientists (S).

  GOAL:
  - Raptor wins by escaping 3 babies off board edges, or
    removing all scientists.
  - Scientists win by capturing 3 babies, or tranquilizing
    the mother (5 sleep tokens).

  EACH ROUND:
  1. Both players secretly select a card (1-9).
  2. Cards are revealed simultaneously.
  3. The LOWER card's special power activates.
  4. The HIGHER card's player gets action points equal
     to the difference between cards.

  ACTION POINTS (1 pt each):
  - Raptor: move mother/baby 1 space, attack adjacent scientist
  - Scientists: move scientist 1 space, shoot tranq at mother,
    capture adjacent sleeping baby

  BOARD:
  M = Mother raptor, b = baby, z = sleeping baby, S = scientist
  Babies escape by reaching any board edge.

  COMMANDS:
  Card selection: type the card number (1-9)
  Actions: 'move R1 C1 R2 C2', 'attack R C', 'shoot R C',
           'capture R C', 'done'
  Type 'quit' to quit, 'save' to save, 'help' for help.
==================================================
"""
