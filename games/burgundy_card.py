"""Castles of Burgundy: The Card Game - Set collection with project bonuses.

Draft cards, complete projects in 6 types (mines, castles, knowledge, ships,
pastures, buildings). Each completed project grants bonuses and VP.
Play over multiple rounds, most VP wins.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

PROJECT_TYPES = ["Mines", "Castles", "Knowledge", "Ships", "Pastures", "Buildings"]
TYPE_ABBREV = {"Mines": "Mi", "Castles": "Ca", "Knowledge": "Kn",
               "Ships": "Sh", "Pastures": "Pa", "Buildings": "Bu"}
TYPE_ICONS = {"Mines": "$", "Castles": "#", "Knowledge": "?",
              "Ships": "~", "Pastures": "&", "Buildings": "^"}

# Project definitions: type, cost (cards needed), VP, bonus
PROJECTS_POOL = [
    # Mines - give silver (trade goods)
    {"type": "Mines", "cost": 2, "vp": 2, "bonus": "silver", "bonus_val": 2},
    {"type": "Mines", "cost": 3, "vp": 4, "bonus": "silver", "bonus_val": 3},
    {"type": "Mines", "cost": 1, "vp": 1, "bonus": "silver", "bonus_val": 1},
    # Castles - give extra actions
    {"type": "Castles", "cost": 3, "vp": 5, "bonus": "action", "bonus_val": 1},
    {"type": "Castles", "cost": 2, "vp": 3, "bonus": "action", "bonus_val": 1},
    {"type": "Castles", "cost": 4, "vp": 7, "bonus": "action", "bonus_val": 2},
    # Knowledge - give VP at end per type collected
    {"type": "Knowledge", "cost": 2, "vp": 1, "bonus": "per_type", "bonus_val": 2},
    {"type": "Knowledge", "cost": 3, "vp": 2, "bonus": "per_type", "bonus_val": 3},
    {"type": "Knowledge", "cost": 1, "vp": 0, "bonus": "per_type", "bonus_val": 1},
    # Ships - let you draft more cards
    {"type": "Ships", "cost": 2, "vp": 2, "bonus": "draw", "bonus_val": 2},
    {"type": "Ships", "cost": 3, "vp": 3, "bonus": "draw", "bonus_val": 3},
    {"type": "Ships", "cost": 1, "vp": 1, "bonus": "draw", "bonus_val": 1},
    # Pastures - VP per same-animal set
    {"type": "Pastures", "cost": 2, "vp": 3, "bonus": "animal", "bonus_val": 2},
    {"type": "Pastures", "cost": 3, "vp": 5, "bonus": "animal", "bonus_val": 3},
    {"type": "Pastures", "cost": 1, "vp": 1, "bonus": "animal", "bonus_val": 1},
    # Buildings - various VP bonuses
    {"type": "Buildings", "cost": 2, "vp": 3, "bonus": "build_vp", "bonus_val": 2},
    {"type": "Buildings", "cost": 3, "vp": 5, "bonus": "build_vp", "bonus_val": 3},
    {"type": "Buildings", "cost": 4, "vp": 8, "bonus": "build_vp", "bonus_val": 4},
]


def make_project_card(proj, card_id):
    """Create a project card dict."""
    return {
        "id": card_id,
        "type": proj["type"],
        "cost": proj["cost"],
        "vp": proj["vp"],
        "bonus": proj["bonus"],
        "bonus_val": proj["bonus_val"],
    }


def project_str(p):
    icon = TYPE_ICONS.get(p["type"], "?")
    return f"[{TYPE_ABBREV[p['type']]} cost:{p['cost']} vp:{p['vp']} {icon}]"


def build_supply_deck():
    """Build deck of supply cards (used to complete projects)."""
    deck = []
    cid = 1000
    for ptype in PROJECT_TYPES:
        for _ in range(8):
            deck.append({"id": cid, "type": ptype, "kind": "supply"})
            cid += 1
    # Add worker (wild) cards
    for _ in range(6):
        deck.append({"id": cid, "type": "Worker", "kind": "supply"})
        cid += 1
    return deck


class BurgundyCardGame(BaseGame):
    """Castles of Burgundy: The Card Game."""

    name = "Castles of Burgundy: Card Game"
    description = "Draft supply cards and complete projects for VP across 6 project types"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "5 rounds of play with full project selection",
        "quick": "3 rounds of play with reduced project deck",
    }

    def setup(self):
        self.total_rounds = 5 if self.variation == "standard" else 3
        self.current_round = 1
        self.actions_per_turn = 2

        # Build project display (available to claim)
        all_projects = list(PROJECTS_POOL)
        if self.variation == "quick":
            all_projects = [p for p in all_projects if p["cost"] <= 3]
        random.shuffle(all_projects)
        pid = 0
        self.project_display = []
        for p in all_projects[:8]:
            self.project_display.append(make_project_card(p, pid))
            pid += 1
        self.project_reserve = []
        for p in all_projects[8:]:
            self.project_reserve.append(make_project_card(p, pid))
            pid += 1

        # Supply deck and display
        self.supply_deck = build_supply_deck()
        random.shuffle(self.supply_deck)
        self.supply_display = []
        self._refill_supply_display()

        # Player state
        self.player_hands = {1: [], 2: []}  # supply cards in hand
        self.player_projects = {1: [], 2: []}  # claimed projects (not yet complete)
        self.completed = {1: [], 2: []}  # completed projects
        self.silver = {1: 3, 2: 3}  # trade goods
        self.vp = {1: 0, 2: 0}
        self.actions_left = self.actions_per_turn
        self.message = ""

        # Deal starting hands
        for p in [1, 2]:
            for _ in range(4):
                if self.supply_deck:
                    self.player_hands[p].append(self.supply_deck.pop())

    def _refill_supply_display(self):
        while len(self.supply_display) < 6 and self.supply_deck:
            self.supply_display.append(self.supply_deck.pop())

    def _refill_project_display(self):
        while len(self.project_display) < 6 and self.project_reserve:
            self.project_display.append(self.project_reserve.pop())

    def display(self):
        clear_screen()
        print(f"=== Castles of Burgundy: Card Game - {self.variation.title()} ===")
        print(f"Round {self.current_round}/{self.total_rounds} | "
              f"Turn {self.turn_number + 1} | "
              f"{self.players[self.current_player - 1]}'s turn | "
              f"Actions: {self.actions_left}")
        print()

        # Scores
        for p in [1, 2]:
            completed_types = set(c["type"] for c in self.completed[p])
            print(f"  {self.players[p-1]}: VP={self.vp[p]}  Silver={self.silver[p]}  "
                  f"Hand={len(self.player_hands[p])} cards  "
                  f"Projects={len(self.player_projects[p])} claimed  "
                  f"Completed={len(self.completed[p])} ({len(completed_types)} types)")
        print()

        # Project display
        print("Available Projects:")
        for i, p in enumerate(self.project_display):
            print(f"  P{i+1}: {project_str(p)}")
        print()

        # Supply display
        print("Supply Display:")
        for i, s in enumerate(self.supply_display):
            marker = "*" if s["type"] == "Worker" else TYPE_ABBREV.get(s["type"], "??")
            print(f"  S{i+1}: [{marker}] {s['type']}")
        print()

        # Current player's hand
        hand = self.player_hands[self.current_player]
        if hand:
            print("Your hand:")
            for i, c in enumerate(hand):
                marker = "*" if c["type"] == "Worker" else TYPE_ABBREV.get(c["type"], "??")
                print(f"  H{i+1}: [{marker}] {c['type']}")
        else:
            print("Your hand is empty.")
        print()

        # Claimed projects
        projects = self.player_projects[self.current_player]
        if projects:
            print("Your claimed projects:")
            for i, p in enumerate(projects):
                # Count matching supply cards in hand
                matching = sum(1 for c in hand if c["type"] == p["type"] or c["type"] == "Worker")
                print(f"  C{i+1}: {project_str(p)}  ({matching}/{p['cost']} cards available)")
        print()

        print("Actions: (d)raw supply card, (c)laim project, (b)uild project, (s)ell 2 silver for 1 any supply, (p)ass")
        if self.message:
            print(self.message)
            self.message = ""

    def get_move(self):
        move = input_with_quit("> ").strip().lower()
        return move

    def make_move(self, move):
        if not move:
            self.message = "Enter an action."
            return False

        parts = move.split()
        action = parts[0]

        if action in ("d", "draw"):
            return self._do_draw(parts)
        elif action in ("c", "claim"):
            return self._do_claim(parts)
        elif action in ("b", "build"):
            return self._do_build(parts)
        elif action in ("s", "sell"):
            return self._do_sell(parts)
        elif action in ("p", "pass"):
            self.actions_left = 0
            return True
        else:
            self.message = "Unknown action. Use d/c/b/s/p."
            return False

    def _do_draw(self, parts):
        """Draw a supply card from display."""
        if len(parts) < 2:
            self.message = "Specify which: d S1-S6"
            return False
        try:
            idx = int(parts[1].replace("s", "").replace("S", "")) - 1
        except ValueError:
            self.message = "Invalid supply number."
            return False
        if idx < 0 or idx >= len(self.supply_display):
            self.message = "Invalid supply number."
            return False

        card = self.supply_display.pop(idx)
        self.player_hands[self.current_player].append(card)
        self._refill_supply_display()
        self.actions_left -= 1
        return True

    def _do_claim(self, parts):
        """Claim a project from the display."""
        if len(parts) < 2:
            self.message = "Specify which: c P1-P8"
            return False
        try:
            idx = int(parts[1].replace("p", "").replace("P", "")) - 1
        except ValueError:
            self.message = "Invalid project number."
            return False
        if idx < 0 or idx >= len(self.project_display):
            self.message = "Invalid project number."
            return False

        proj = self.project_display.pop(idx)
        self.player_projects[self.current_player].append(proj)
        self._refill_project_display()
        self.actions_left -= 1
        return True

    def _do_build(self, parts):
        """Complete a claimed project using supply cards from hand."""
        if len(parts) < 2:
            self.message = "Specify which: b C1-C..."
            return False
        try:
            idx = int(parts[1].replace("c", "").replace("C", "")) - 1
        except ValueError:
            self.message = "Invalid claimed project number."
            return False

        projects = self.player_projects[self.current_player]
        if idx < 0 or idx >= len(projects):
            self.message = "Invalid claimed project number."
            return False

        proj = projects[idx]
        hand = self.player_hands[self.current_player]

        # Find matching cards
        matching = [c for c in hand if c["type"] == proj["type"]]
        workers = [c for c in hand if c["type"] == "Worker"]

        if len(matching) + len(workers) < proj["cost"]:
            self.message = f"Need {proj['cost']} {proj['type']}/Worker cards. Have {len(matching)}+{len(workers)}."
            return False

        # Use matching first, then workers
        to_use = []
        needed = proj["cost"]
        for c in matching:
            if needed <= 0:
                break
            to_use.append(c["id"])
            needed -= 1
        for c in workers:
            if needed <= 0:
                break
            to_use.append(c["id"])
            needed -= 1

        # Remove used cards
        self.player_hands[self.current_player] = [c for c in hand if c["id"] not in to_use]

        # Complete project
        projects.pop(idx)
        self.completed[self.current_player].append(proj)
        self.vp[self.current_player] += proj["vp"]

        # Apply bonus
        self._apply_bonus(proj)
        self.actions_left -= 1
        self.message = f"Completed {project_str(proj)}! +{proj['vp']} VP"
        return True

    def _do_sell(self, parts):
        """Spend 2 silver to gain any supply card type."""
        p = self.current_player
        if self.silver[p] < 2:
            self.message = "Need at least 2 silver."
            return False

        print("Choose type: " + " ".join(f"({TYPE_ABBREV[t]})" for t in PROJECT_TYPES))
        choice = input_with_quit("Type> ").strip()

        chosen = None
        for t in PROJECT_TYPES:
            if choice.lower() in (t.lower(), TYPE_ABBREV[t].lower()):
                chosen = t
                break
        if not chosen:
            self.message = "Invalid type."
            return False

        self.silver[p] -= 2
        new_card = {"id": random.randint(10000, 99999), "type": chosen, "kind": "supply"}
        self.player_hands[p].append(new_card)
        self.actions_left -= 1
        return True

    def _apply_bonus(self, proj):
        p = self.current_player
        b = proj["bonus"]
        bv = proj["bonus_val"]

        if b == "silver":
            self.silver[p] += bv
        elif b == "action":
            self.actions_left += bv
        elif b == "draw":
            for _ in range(bv):
                if self.supply_deck:
                    self.player_hands[p].append(self.supply_deck.pop())
        elif b == "animal":
            self.vp[p] += bv
        elif b == "build_vp":
            self.vp[p] += bv

    def check_game_over(self):
        if self.actions_left > 0:
            return

        self.actions_left = self.actions_per_turn

        # Check if round is over (both players have gone)
        if self.current_player == 2:
            # End of round pair - check round end
            if self.current_round >= self.total_rounds:
                self._final_scoring()
                self.game_over = True
                return

            # Check if supply is depleted (trigger next round)
            if len(self.supply_display) == 0 and len(self.supply_deck) == 0:
                self.current_round += 1
                self.supply_deck = build_supply_deck()
                random.shuffle(self.supply_deck)
                self._refill_supply_display()
                self._refill_project_display()

        # Increment round after both players go
        if self.current_player == 2:
            turns_in_round = self.turn_number
            if turns_in_round > 0 and turns_in_round % 4 == 0:
                self.current_round = min(self.current_round + 1, self.total_rounds)

    def _final_scoring(self):
        """Add end-game bonus VP."""
        for p in [1, 2]:
            # Knowledge bonus: VP per distinct type completed
            knowledge_projects = [c for c in self.completed[p]
                                 if c["type"] == "Knowledge"]
            distinct_types = len(set(c["type"] for c in self.completed[p]))
            for kp in knowledge_projects:
                self.vp[p] += kp["bonus_val"] * distinct_types

            # Leftover silver: 1 VP per 3 silver
            self.vp[p] += self.silver[p] // 3

        if self.vp[1] > self.vp[2]:
            self.winner = 1
        elif self.vp[2] > self.vp[1]:
            self.winner = 2
        else:
            # Tiebreak: most completed projects
            if len(self.completed[1]) > len(self.completed[2]):
                self.winner = 1
            elif len(self.completed[2]) > len(self.completed[1]):
                self.winner = 2
            else:
                self.winner = None

    def switch_player(self):
        if self.actions_left > 0:
            return  # Don't switch mid-actions
        super().switch_player()

    def get_state(self):
        return {
            "total_rounds": self.total_rounds,
            "current_round": self.current_round,
            "actions_per_turn": self.actions_per_turn,
            "actions_left": self.actions_left,
            "project_display": self.project_display,
            "project_reserve": self.project_reserve,
            "supply_deck": self.supply_deck,
            "supply_display": self.supply_display,
            "player_hands": {str(k): v for k, v in self.player_hands.items()},
            "player_projects": {str(k): v for k, v in self.player_projects.items()},
            "completed": {str(k): v for k, v in self.completed.items()},
            "silver": {str(k): v for k, v in self.silver.items()},
            "vp": {str(k): v for k, v in self.vp.items()},
            "message": self.message,
        }

    def load_state(self, state):
        self.total_rounds = state["total_rounds"]
        self.current_round = state["current_round"]
        self.actions_per_turn = state["actions_per_turn"]
        self.actions_left = state["actions_left"]
        self.project_display = state["project_display"]
        self.project_reserve = state["project_reserve"]
        self.supply_deck = state["supply_deck"]
        self.supply_display = state["supply_display"]
        self.player_hands = {int(k): v for k, v in state["player_hands"].items()}
        self.player_projects = {int(k): v for k, v in state["player_projects"].items()}
        self.completed = {int(k): v for k, v in state["completed"].items()}
        self.silver = {int(k): v for k, v in state["silver"].items()}
        self.vp = {int(k): v for k, v in state["vp"].items()}
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== CASTLES OF BURGUNDY: THE CARD GAME TUTORIAL ===

OVERVIEW:
  Collect supply cards and use them to complete projects across 6 types.
  Each completed project earns VP and a bonus. Most VP wins!

PROJECT TYPES:
  Mi (Mines)     - Earn silver trade goods
  Ca (Castles)   - Earn extra actions this turn
  Kn (Knowledge) - Bonus VP at game end per distinct type completed
  Sh (Ships)     - Draw extra supply cards
  Pa (Pastures)  - Immediate bonus VP
  Bu (Buildings) - Immediate bonus VP

ACTIONS (2 per turn):
  (d)raw S#   - Take a supply card from the display
  (c)laim P#  - Claim a project from the display to work on
  (b)uild C#  - Complete a claimed project using matching supply cards
  (s)ell      - Spend 2 silver to gain any supply card type
  (p)ass      - End your turn early

COMPLETING PROJECTS:
  Each project has a cost (number of matching supply cards needed).
  Worker cards are wild and count as any type.
  When you complete a project, gain its VP and trigger its bonus.

SCORING:
  - VP from completed projects and their bonuses
  - Knowledge bonus: VP per distinct type in your completed projects
  - Leftover silver: 1 VP per 3 silver

STRATEGY:
  - Diversify types for Knowledge bonuses
  - Castles give extra actions for big combo turns
  - Ships help you draw more cards for future builds
"""
