"""Undaunted - Deck-building tactical combat game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Card types with (name, move_range, attack_range, attack_value, special)
CARD_TYPES = {
    "Rifleman":         {"move": 1, "attack_range": 1, "attack": 2, "special": None},
    "Scout":            {"move": 3, "attack_range": 0, "attack": 0, "special": "scout"},
    "Sniper":           {"move": 0, "attack_range": 3, "attack": 3, "special": None},
    "Squad Leader":     {"move": 0, "attack_range": 0, "attack": 0, "special": "draw"},
    "Platoon Sergeant": {"move": 0, "attack_range": 0, "attack": 0, "special": "recruit"},
}

TERRAIN_TYPES = {
    "open":     {"defense": 0, "symbol": "."},
    "forest":   {"defense": 1, "symbol": "T"},
    "building": {"defense": 2, "symbol": "#"},
}


class UndauntedGame(BaseGame):
    """Undaunted - Deck-building tactical combat."""

    name = "Undaunted"
    description = "Deck-building tactical combat on a grid with terrain"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4x4 grid, 30-card starting decks)",
        "skirmish": "Skirmish (3x3 grid, 20-card starting decks)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.grid_size = 4 if self.variation != "skirmish" else 3
        self.grid = []          # 2D list of terrain types
        self.objectives = []    # list of (row, col) objective positions
        self.obj_control = {}   # (row, col) -> player who controls it, or None
        self.units = {1: [], 2: []}  # list of unit dicts per player
        self.decks = {1: [], 2: []}
        self.hands = {1: [], 2: []}
        self.discard_piles = {1: [], 2: []}
        self.supply = {1: {}, 2: {}}  # cards available to recruit
        self.played_card = None  # the card currently being played
        self.log = []
        self.phase = "play_card"  # play_card or done

    # ---------------------------------------------------------------- helpers
    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    def _opponent(self, player=None):
        if player is None:
            player = self.current_player
        return 2 if player == 1 else 1

    def _draw_cards(self, player, count):
        """Draw cards from deck into hand. Reshuffle discard if needed."""
        for _ in range(count):
            if not self.decks[player]:
                if not self.discard_piles[player]:
                    break
                self.decks[player] = list(self.discard_piles[player])
                random.shuffle(self.decks[player])
                self.discard_piles[player] = []
            if self.decks[player]:
                self.hands[player].append(self.decks[player].pop())

    def _unit_at(self, row, col):
        """Return (player, unit_index) for unit at position, or None."""
        for p in (1, 2):
            for i, u in enumerate(self.units[p]):
                if u["row"] == row and u["col"] == col and u["hp"] > 0:
                    return (p, i)
        return None

    def _distance(self, r1, c1, r2, c2):
        """Manhattan distance."""
        return abs(r1 - r2) + abs(c1 - c2)

    def _alive_units(self, player):
        return [u for u in self.units[player] if u["hp"] > 0]

    def _matching_units(self, player, card_type):
        """Return alive units matching the card type."""
        return [(i, u) for i, u in enumerate(self.units[player])
                if u["type"] == card_type and u["hp"] > 0]

    # ---------------------------------------------------------------- setup
    def setup(self):
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.log = []
        gs = self.grid_size

        # Generate grid with terrain
        self.grid = []
        for r in range(gs):
            row = []
            for c in range(gs):
                roll = random.random()
                if roll < 0.5:
                    row.append("open")
                elif roll < 0.8:
                    row.append("forest")
                else:
                    row.append("building")
            self.grid.append(row)

        # Place objectives (center tiles + a couple more)
        self.objectives = []
        self.obj_control = {}
        mid = gs // 2
        if gs == 4:
            obj_positions = [(1, 1), (1, 2), (2, 1), (2, 2), (0, 3), (3, 0)]
        else:
            obj_positions = [(0, 2), (1, 1), (2, 0)]
        for pos in obj_positions:
            if pos[0] < gs and pos[1] < gs:
                self.objectives.append(pos)
                self.obj_control[pos] = None

        # Place starting units
        self.units = {1: [], 2: []}
        if gs == 4:
            # Player 1 starts bottom rows, Player 2 top rows
            p1_starts = [
                {"type": "Rifleman", "row": 3, "col": 0, "hp": 3, "max_hp": 3},
                {"type": "Rifleman", "row": 3, "col": 1, "hp": 3, "max_hp": 3},
                {"type": "Scout",    "row": 3, "col": 2, "hp": 2, "max_hp": 2},
                {"type": "Sniper",   "row": 3, "col": 3, "hp": 2, "max_hp": 2},
            ]
            p2_starts = [
                {"type": "Rifleman", "row": 0, "col": 2, "hp": 3, "max_hp": 3},
                {"type": "Rifleman", "row": 0, "col": 3, "hp": 3, "max_hp": 3},
                {"type": "Scout",    "row": 0, "col": 1, "hp": 2, "max_hp": 2},
                {"type": "Sniper",   "row": 0, "col": 0, "hp": 2, "max_hp": 2},
            ]
        else:
            p1_starts = [
                {"type": "Rifleman", "row": 2, "col": 0, "hp": 3, "max_hp": 3},
                {"type": "Scout",    "row": 2, "col": 1, "hp": 2, "max_hp": 2},
                {"type": "Sniper",   "row": 2, "col": 2, "hp": 2, "max_hp": 2},
            ]
            p2_starts = [
                {"type": "Rifleman", "row": 0, "col": 2, "hp": 3, "max_hp": 3},
                {"type": "Scout",    "row": 0, "col": 1, "hp": 2, "max_hp": 2},
                {"type": "Sniper",   "row": 0, "col": 0, "hp": 2, "max_hp": 2},
            ]
        self.units[1] = p1_starts
        self.units[2] = p2_starts

        # Build starting decks
        if self.variation == "skirmish":
            deck_comp = {
                "Rifleman": 6, "Scout": 4, "Sniper": 3,
                "Squad Leader": 4, "Platoon Sergeant": 3,
            }
        else:
            deck_comp = {
                "Rifleman": 8, "Scout": 5, "Sniper": 5,
                "Squad Leader": 6, "Platoon Sergeant": 6,
            }

        for p in (1, 2):
            deck = []
            for card_type, count in deck_comp.items():
                for _ in range(count):
                    deck.append(card_type)
            random.shuffle(deck)
            self.decks[p] = deck
            self.hands[p] = []
            self.discard_piles[p] = []
            self._draw_cards(p, 4)

        # Supply for recruiting
        for p in (1, 2):
            self.supply[p] = {
                "Rifleman": 4, "Scout": 3, "Sniper": 2,
            }

        self.phase = "play_card"

    # ---------------------------------------------------------------- display
    def display(self):
        clear_screen()
        cp = self.current_player
        opp = self._opponent()
        gs = self.grid_size

        print(f"\n{'=' * 60}")
        print(f"  UNDAUNTED  |  Turn {self.turn_number + 1}  |  {self.players[cp - 1]}'s turn")
        print(f"  Variation: {self.variation.title()}")
        print(f"{'=' * 60}")

        # Objective control summary
        p1_obj = sum(1 for v in self.obj_control.values() if v == 1)
        p2_obj = sum(1 for v in self.obj_control.values() if v == 2)
        total_obj = len(self.objectives)
        majority = total_obj // 2 + 1
        print(f"\n  Objectives: {self.players[0]}: {p1_obj}  |  {self.players[1]}: {p2_obj}  |  Need {majority} to win")

        # Grid display
        print(f"\n     ", end="")
        for c in range(gs):
            print(f"  {c}  ", end="")
        print()
        print(f"    +" + "----+" * gs)

        for r in range(gs):
            print(f"  {r} |", end="")
            for c in range(gs):
                terrain = self.grid[r][c]
                terrain_sym = TERRAIN_TYPES[terrain]["symbol"]
                unit_info = self._unit_at(r, c)
                is_obj = (r, c) in self.objectives

                if unit_info:
                    p, idx = unit_info
                    u = self.units[p][idx]
                    type_char = u["type"][0]  # R, S, etc.
                    player_marker = str(p)
                    cell = f"{player_marker}{type_char}{u['hp']}"
                elif is_obj:
                    ctrl = self.obj_control.get((r, c))
                    if ctrl:
                        cell = f"*{ctrl}*"
                    else:
                        cell = f"*{terrain_sym}*"
                else:
                    cell = f" {terrain_sym} "

                print(f"{cell:^4}|", end="")
            print()
            print(f"    +" + "----+" * gs)

        # Legend
        print(f"\n  Terrain: . = open, T = forest (+1 def), # = building (+2 def)")
        print(f"  Units: [player][Type initial][HP]   * = objective")

        # Units summary
        for p in (1, 2):
            alive = self._alive_units(p)
            print(f"\n  {self.players[p - 1]}'s units:")
            if alive:
                for u in alive:
                    print(f"    {u['type']:18s} at ({u['row']},{u['col']})  HP: {u['hp']}/{u['max_hp']}")
            else:
                print(f"    (no units alive)")

        # Current player's hand
        print(f"\n  Your hand ({self.players[cp - 1]}):")
        if self.hands[cp]:
            for i, card in enumerate(self.hands[cp], 1):
                info = CARD_TYPES[card]
                desc_parts = []
                if info["move"] > 0:
                    desc_parts.append(f"move {info['move']}")
                if info["attack"] > 0:
                    desc_parts.append(f"atk {info['attack']} rng {info['attack_range']}")
                if info["special"] == "draw":
                    desc_parts.append("draw 2 cards")
                elif info["special"] == "recruit":
                    desc_parts.append("add card to deck")
                elif info["special"] == "scout":
                    desc_parts.append("fast movement")
                desc = ", ".join(desc_parts) if desc_parts else "command"
                print(f"    {i}. {card} ({desc})")
        else:
            print(f"    (empty)")

        print(f"  Deck: {len(self.decks[cp])} | Discard: {len(self.discard_piles[cp])}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-6:]:
                print(f"  {line}")

        print()

    # ---------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if not self.hands[cp]:
            # No cards in hand, end turn
            return ("end_turn",)

        print(f"  Play a card (1-{len(self.hands[cp])}) or 'end' to end turn and draw:")

        while True:
            move_input = input_with_quit("  Your choice: ").strip().lower()

            if move_input in ("end", "e"):
                return ("end_turn",)

            if not move_input.isdigit():
                print(f"  Enter a card number (1-{len(self.hands[cp])}) or 'end'.")
                continue

            card_choice = int(move_input)
            if card_choice < 1 or card_choice > len(self.hands[cp]):
                print(f"  Invalid. Choose 1-{len(self.hands[cp])}.")
                continue

            card_name = self.hands[cp][card_choice - 1]
            info = CARD_TYPES[card_name]

            # Handle special cards
            if info["special"] == "draw":
                return ("play_card", card_choice - 1, "draw")

            if info["special"] == "recruit":
                return self._get_recruit_move(card_choice - 1)

            # For combat cards, need to choose a unit and action
            return self._get_unit_action_move(cp, card_choice - 1, card_name, info)

    def _get_recruit_move(self, card_idx):
        """Get recruit action details."""
        cp = self.current_player
        available = {k: v for k, v in self.supply[cp].items() if v > 0}
        if not available:
            print("  No cards available to recruit. Card will be discarded.")
            return ("play_card", card_idx, "recruit_none")

        print("  Choose a card type to add to your deck:")
        options = list(available.keys())
        for i, name in enumerate(options, 1):
            count = available[name]
            print(f"    {i}. {name} ({count} available)")
        print(f"    [C] Cancel")

        while True:
            choice = input_with_quit("  Recruit: ").strip().lower()
            if choice in ("c", "cancel"):
                return self.get_move()  # re-prompt
            if choice.isdigit() and 1 <= int(choice) <= len(options):
                recruit_type = options[int(choice) - 1]
                return ("play_card", card_idx, "recruit", recruit_type)
            print("  Invalid choice.")

    def _get_unit_action_move(self, cp, card_idx, card_name, info):
        """Get action for a combat/movement card."""
        matching = self._matching_units(cp, card_name)

        if not matching and card_name in ("Rifleman", "Scout", "Sniper"):
            print(f"  No alive {card_name} units to activate. Card will be discarded.")
            return ("play_card", card_idx, "no_unit")

        if not matching:
            print(f"  No matching units. Card will be discarded.")
            return ("play_card", card_idx, "no_unit")

        # Choose which unit to activate
        if len(matching) == 1:
            unit_idx = matching[0][0]
            unit = matching[0][1]
            print(f"  Activating {card_name} at ({unit['row']},{unit['col']})")
        else:
            print(f"  Choose which {card_name} to activate:")
            for i, (idx, u) in enumerate(matching, 1):
                print(f"    {i}. {card_name} at ({u['row']},{u['col']}) HP:{u['hp']}")
            while True:
                choice = input_with_quit("  Unit: ").strip()
                if choice.isdigit() and 1 <= int(choice) <= len(matching):
                    unit_idx = matching[int(choice) - 1][0]
                    unit = matching[int(choice) - 1][1]
                    break
                print("  Invalid choice.")

        # Choose action: move, attack, or both (Rifleman)
        actions = []
        if info["move"] > 0:
            actions.append("move")
        if info["attack"] > 0:
            actions.append("attack")

        if not actions:
            return ("play_card", card_idx, "no_unit")

        if len(actions) == 1:
            action = actions[0]
        else:
            print(f"  Choose action:")
            print(f"    [M] Move (range {info['move']})")
            print(f"    [A] Attack (atk {info['attack']}, range {info['attack_range']})")
            print(f"    [C] Cancel")
            while True:
                choice = input_with_quit("  Action: ").strip().lower()
                if choice in ("c", "cancel"):
                    return self.get_move()
                if choice in ("m", "move") and "move" in actions:
                    action = "move"
                    break
                if choice in ("a", "attack") and "attack" in actions:
                    action = "attack"
                    break
                print("  Enter M, A, or C.")

        if action == "move":
            gs = self.grid_size
            move_range = info["move"]
            print(f"  Move to (row,col) within range {move_range}:")
            while True:
                dest = input_with_quit("  Destination (row,col): ").strip()
                if dest.lower() in ("c", "cancel"):
                    return self.get_move()
                parts = dest.replace(" ", "").split(",")
                if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
                    print("  Enter as row,col (e.g. 2,3).")
                    continue
                dr, dc = int(parts[0]), int(parts[1])
                if dr < 0 or dr >= gs or dc < 0 or dc >= gs:
                    print(f"  Out of bounds. Grid is {gs}x{gs}.")
                    continue
                dist = self._distance(unit["row"], unit["col"], dr, dc)
                if dist > move_range or dist == 0:
                    print(f"  Out of move range ({move_range}). Distance is {dist}.")
                    continue
                if self._unit_at(dr, dc):
                    print(f"  That tile is occupied.")
                    continue
                return ("play_card", card_idx, "move", unit_idx, dr, dc)

        if action == "attack":
            opp = self._opponent()
            targets = []
            for i, u in enumerate(self.units[opp]):
                if u["hp"] > 0:
                    dist = self._distance(unit["row"], unit["col"], u["row"], u["col"])
                    if dist <= info["attack_range"]:
                        targets.append((i, u, dist))
            if not targets:
                print("  No enemy units in range. Card will be discarded.")
                return ("play_card", card_idx, "no_target")

            print("  Choose target:")
            for i, (idx, u, dist) in enumerate(targets, 1):
                terrain = self.grid[u["row"]][u["col"]]
                tdef = TERRAIN_TYPES[terrain]["defense"]
                print(f"    {i}. {u['type']} at ({u['row']},{u['col']}) HP:{u['hp']} "
                      f"terrain:{terrain}(+{tdef}def) dist:{dist}")
            while True:
                choice = input_with_quit("  Target: ").strip()
                if choice.lower() in ("c", "cancel"):
                    return self.get_move()
                if choice.isdigit() and 1 <= int(choice) <= len(targets):
                    target_idx = targets[int(choice) - 1][0]
                    return ("play_card", card_idx, "attack", unit_idx, target_idx)
                print("  Invalid choice.")

        return ("play_card", card_idx, "no_unit")

    # ---------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player
        opp = self._opponent()

        if move[0] == "end_turn":
            # Discard remaining hand, draw new hand
            self.discard_piles[cp].extend(self.hands[cp])
            self.hands[cp] = []
            self._draw_cards(cp, 4)
            self._add_log(f"{self.players[cp - 1]} ends turn and draws cards.")
            # Control objectives: if a player's unit is on an uncontrolled/enemy objective
            self._update_objective_control()
            return True

        if move[0] == "play_card":
            card_hand_idx = move[1]
            card_name = self.hands[cp][card_hand_idx]
            action = move[2]

            # Remove card from hand to discard
            self.hands[cp].pop(card_hand_idx)
            self.discard_piles[cp].append(card_name)

            if action == "draw":
                self._draw_cards(cp, 2)
                self._add_log(f"{self.players[cp - 1]} plays Squad Leader: draws 2 cards.")
                return True

            if action == "recruit":
                recruit_type = move[3]
                if self.supply[cp].get(recruit_type, 0) > 0:
                    self.supply[cp][recruit_type] -= 1
                    self.discard_piles[cp].append(recruit_type)
                    self._add_log(f"{self.players[cp - 1]} plays Platoon Sergeant: recruits {recruit_type}.")
                return True

            if action == "recruit_none":
                self._add_log(f"{self.players[cp - 1]} plays Platoon Sergeant: nothing to recruit.")
                return True

            if action == "no_unit" or action == "no_target":
                self._add_log(f"{self.players[cp - 1]} plays {card_name}: no valid target/unit.")
                return True

            if action == "move":
                unit_idx = move[3]
                dest_r, dest_c = move[4], move[5]
                unit = self.units[cp][unit_idx]
                old_r, old_c = unit["row"], unit["col"]
                unit["row"] = dest_r
                unit["col"] = dest_c
                self._add_log(f"{self.players[cp - 1]} moves {card_name} "
                              f"({old_r},{old_c})->({dest_r},{dest_c}).")
                self._update_objective_control()
                return True

            if action == "attack":
                unit_idx = move[3]
                target_idx = move[4]
                attacker = self.units[cp][unit_idx]
                target = self.units[opp][target_idx]
                info = CARD_TYPES[card_name]

                # Roll attack: 1d6 + attack_value vs defense_roll(1d6) + terrain_defense
                atk_roll = random.randint(1, 6)
                def_roll = random.randint(1, 6)
                terrain = self.grid[target["row"]][target["col"]]
                terrain_def = TERRAIN_TYPES[terrain]["defense"]

                atk_total = atk_roll + info["attack"]
                def_total = def_roll + terrain_def

                if atk_total > def_total:
                    damage = 1
                    target["hp"] -= damage
                    result = "HIT"
                    if target["hp"] <= 0:
                        target["hp"] = 0
                        result = "ELIMINATED"
                else:
                    result = "MISS"

                self._add_log(
                    f"{self.players[cp - 1]}'s {card_name} attacks {target['type']} "
                    f"at ({target['row']},{target['col']}): "
                    f"atk {atk_roll}+{info['attack']}={atk_total} vs "
                    f"def {def_roll}+{terrain_def}={def_total} -> {result}"
                )

                if result == "ELIMINATED":
                    self._add_log(f"  {target['type']} eliminated!")

                self._update_objective_control()
                return True

        return False

    def _update_objective_control(self):
        """Update objective control based on unit positions."""
        for obj_pos in self.objectives:
            r, c = obj_pos
            unit_info = self._unit_at(r, c)
            if unit_info:
                player, _ = unit_info
                self.obj_control[obj_pos] = player
            # If no unit on it and already controlled, keep control

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        total = len(self.objectives)
        majority = total // 2 + 1

        p1_obj = sum(1 for v in self.obj_control.values() if v == 1)
        p2_obj = sum(1 for v in self.obj_control.values() if v == 2)

        if p1_obj >= majority:
            self.game_over = True
            self.winner = 1
            return
        if p2_obj >= majority:
            self.game_over = True
            self.winner = 2
            return

        # Also check if a player has no alive units
        if not self._alive_units(1):
            self.game_over = True
            self.winner = 2
            return
        if not self._alive_units(2):
            self.game_over = True
            self.winner = 1
            return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "grid_size": self.grid_size,
            "grid": self.grid,
            "objectives": [list(o) for o in self.objectives],
            "obj_control": {f"{r},{c}": v for (r, c), v in self.obj_control.items()},
            "units": {
                str(p): [dict(u) for u in units]
                for p, units in self.units.items()
            },
            "decks": {str(p): list(d) for p, d in self.decks.items()},
            "hands": {str(p): list(h) for p, h in self.hands.items()},
            "discard_piles": {str(p): list(d) for p, d in self.discard_piles.items()},
            "supply": {str(p): dict(s) for p, s in self.supply.items()},
            "log": list(self.log),
            "phase": self.phase,
        }

    def load_state(self, state):
        self.grid_size = state["grid_size"]
        self.grid = state["grid"]
        self.objectives = [tuple(o) for o in state["objectives"]]
        self.obj_control = {}
        for key, v in state["obj_control"].items():
            r, c = key.split(",")
            self.obj_control[(int(r), int(c))] = v
        self.units = {
            int(p): [dict(u) for u in units]
            for p, units in state["units"].items()
        }
        self.decks = {int(p): list(d) for p, d in state["decks"].items()}
        self.hands = {int(p): list(h) for p, h in state["hands"].items()}
        self.discard_piles = {int(p): list(d) for p, d in state["discard_piles"].items()}
        self.supply = {int(p): dict(s) for p, s in state["supply"].items()}
        self.log = list(state.get("log", []))
        self.phase = state.get("phase", "play_card")

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        return (
            f"\n{'=' * 60}\n"
            f"  UNDAUNTED - Tutorial ({self.variation.title()})\n"
            f"{'=' * 60}\n\n"
            f"  OVERVIEW:\n"
            f"  A deck-building tactical combat game on a "
            f"{'4x4' if self.variation != 'skirmish' else '3x3'} grid.\n"
            f"  Build your deck to command squads and control objectives.\n"
            f"  First to control a majority of objectives wins!\n\n"
            f"  CARD TYPES:\n"
            f"  - Rifleman:  Move 1 tile + Attack (atk 2, range 1)\n"
            f"  - Scout:     Move up to 3 tiles (fast recon)\n"
            f"  - Sniper:    Long-range attack (atk 3, range 3)\n"
            f"  - Squad Leader:     Draw 2 extra cards\n"
            f"  - Platoon Sergeant: Add a card from supply to your deck\n\n"
            f"  TERRAIN:\n"
            f"  - Open (.):     No defense bonus\n"
            f"  - Forest (T):   +1 defense bonus\n"
            f"  - Building (#): +2 defense bonus\n\n"
            f"  COMBAT:\n"
            f"  Attack roll: 1d6 + attack value\n"
            f"  Defense roll: 1d6 + terrain defense\n"
            f"  If attack > defense, the target takes 1 damage.\n\n"
            f"  OBJECTIVES:\n"
            f"  Marked with * on the grid. Move a unit onto an objective\n"
            f"  to control it. Control a majority to win!\n\n"
            f"  TURN:\n"
            f"  Play cards from your hand to activate units.\n"
            f"  Type 'end' to discard remaining cards and draw 4 new ones.\n\n"
            f"  COMMANDS:\n"
            f"  Type card number to play, 'end' to end turn.\n"
            f"  Type 'quit' to exit, 'save' to suspend, 'help' for help.\n"
            f"{'=' * 60}"
        )
