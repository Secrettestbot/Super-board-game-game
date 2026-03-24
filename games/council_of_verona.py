"""Council of Verona - Quick bluffing card game with Romeo & Juliet characters (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class CouncilOfVeronaGame(BaseGame):
    """Place characters in Council or Exile, then score agendas with influence tokens."""

    name = "Council of Verona"
    description = "Bluffing card game with Romeo & Juliet characters"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (13 characters, 5 agendas)",
        "quick": "Quick (9 characters, 3 agendas)",
        "intrigue": "Intrigue (13 characters, 5 agendas, bonus powers)",
    }

    ALL_CHARACTERS = [
        {"name": "Romeo", "house": "Montague", "power": "move_one", "power_desc": "Move 1 character between areas"},
        {"name": "Juliet", "house": "Capulet", "power": "move_one", "power_desc": "Move 1 character between areas"},
        {"name": "Mercutio", "house": "Montague", "power": "swap", "power_desc": "Swap 2 characters between areas"},
        {"name": "Tybalt", "house": "Capulet", "power": "exile", "power_desc": "Move 1 Council character to Exile"},
        {"name": "Nurse", "house": "Capulet", "power": "council", "power_desc": "Move 1 Exile character to Council"},
        {"name": "Friar Lawrence", "house": "Neutral", "power": "peek", "power_desc": "Peek at opponent's influence token"},
        {"name": "Prince Escalus", "house": "Neutral", "power": "lock", "power_desc": "Lock an area - no more moves there"},
        {"name": "Benvolio", "house": "Montague", "power": "council", "power_desc": "Move 1 Exile character to Council"},
        {"name": "Lady Capulet", "house": "Capulet", "power": "exile", "power_desc": "Move 1 Council character to Exile"},
        {"name": "Lord Montague", "house": "Montague", "power": "swap", "power_desc": "Swap 2 characters between areas"},
        {"name": "Rosaline", "house": "Capulet", "power": "none", "power_desc": "No special power"},
        {"name": "Paris", "house": "Neutral", "power": "none", "power_desc": "No special power"},
        {"name": "Apothecary", "house": "Neutral", "power": "peek", "power_desc": "Peek at opponent's influence token"},
    ]

    ALL_AGENDAS = [
        {"name": "Montague Dominance", "desc": "More Montagues in Council than Capulets", "type": "montague_council"},
        {"name": "Capulet Dominance", "desc": "More Capulets in Council than Montagues", "type": "capulet_council"},
        {"name": "Romeo & Juliet Together", "desc": "Romeo and Juliet in same area", "type": "together"},
        {"name": "Romeo & Juliet Apart", "desc": "Romeo and Juliet in different areas", "type": "apart"},
        {"name": "Exile the Neutrals", "desc": "All Neutral characters in Exile", "type": "neutrals_exiled"},
    ]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.characters = []
        self.agendas = []
        self.player_hands = {1: [], 2: []}
        self.council = []
        self.exile = []
        self.locked_areas = []
        self.influence_tokens = {1: [], 2: []}  # tokens available
        self.placed_influence = []  # list of {player, agenda_idx, value}
        self.phase = "placement"  # placement, influence, scoring
        self.characters_placed = 0
        self.total_characters = 0
        self.influence_rounds = 0
        self.max_influence_rounds = 3
        self.log = []
        self.peeked_info = ""

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "quick":
            char_count = 9
            agenda_count = 3
            self.max_influence_rounds = 2
        else:
            char_count = 13
            agenda_count = 5
            self.max_influence_rounds = 3

        # Select characters
        self.characters = []
        available = list(self.ALL_CHARACTERS[:char_count])
        random.shuffle(available)
        for i, ch in enumerate(available):
            c = dict(ch)
            c["id"] = i
            self.characters.append(c)

        self.total_characters = len(self.characters)

        # Deal hands
        half = len(self.characters) // 2
        self.player_hands[1] = [c["id"] for c in self.characters[:half]]
        self.player_hands[2] = [c["id"] for c in self.characters[half:half * 2]]

        # Select agendas
        agenda_pool = list(self.ALL_AGENDAS[:agenda_count])
        self.agendas = []
        for i, a in enumerate(agenda_pool):
            ag = dict(a)
            ag["id"] = i
            self.agendas.append(ag)

        # Influence tokens
        self.influence_tokens = {1: [0, 1, 2, 3, 5], 2: [0, 1, 2, 3, 5]}

        self.council = []
        self.exile = []
        self.locked_areas = []
        self.placed_influence = []
        self.phase = "placement"
        self.characters_placed = 0
        self.influence_rounds = 0
        self.log = []
        self.peeked_info = ""
        self.game_over = False
        self.winner = None
        self._add_log("Place characters in Council or Exile!")

    def _char_by_id(self, cid):
        for c in self.characters:
            if c["id"] == cid:
                return c
        return None

    def display(self):
        clear_screen()
        print(f"{'=' * 58}")
        print(f"  COUNCIL OF VERONA  |  Phase: {self.phase.upper()}")
        print(f"{'=' * 58}")

        # Council area
        print(f"\n  COUNCIL:")
        if self.council:
            for cid in self.council:
                c = self._char_by_id(cid)
                locked = " [LOCKED]" if "council" in self.locked_areas else ""
                print(f"    - {c['name']} ({c['house']}){locked}")
        else:
            print(f"    (empty)")

        # Exile area
        print(f"\n  EXILE:")
        if self.exile:
            for cid in self.exile:
                c = self._char_by_id(cid)
                locked = " [LOCKED]" if "exile" in self.locked_areas else ""
                print(f"    - {c['name']} ({c['house']}){locked}")
        else:
            print(f"    (empty)")

        # Agendas
        print(f"\n  AGENDAS:")
        for i, a in enumerate(self.agendas):
            tokens_on = [p for p in self.placed_influence if p["agenda_idx"] == i]
            token_display = f" ({len(tokens_on)} token(s) placed)" if tokens_on else ""
            print(f"    [{i + 1}] {a['name']}: {a['desc']}{token_display}")

        # Current player info
        cp = self.current_player
        if self.phase == "placement":
            print(f"\n  {self.players[cp - 1]}'s turn - Place a character")
            hand = self.player_hands[cp]
            if hand:
                print(f"  Your hand:")
                for idx, cid in enumerate(hand):
                    c = self._char_by_id(cid)
                    print(f"    [{idx + 1}] {c['name']} ({c['house']}) - {c['power_desc']}")
            else:
                print(f"  Hand is empty.")
        elif self.phase == "influence":
            print(f"\n  {self.players[cp - 1]}'s turn - Place an influence token")
            print(f"  Available tokens: {sorted(self.influence_tokens[cp], reverse=True)}")

        if self.peeked_info:
            print(f"\n  ** {self.peeked_info} **")
            self.peeked_info = ""

        # Log
        if self.log:
            print(f"\n  {'~' * 40}")
            for entry in self.log[-5:]:
                print(f"  {entry}")

    def get_move(self):
        if self.phase == "placement":
            return self._get_placement_move()
        elif self.phase == "influence":
            return self._get_influence_move()
        elif self.phase == "scoring":
            input_with_quit("\n  Press Enter to see final scores...")
            return "score"
        return None

    def _get_placement_move(self):
        hand = self.player_hands[self.current_player]
        if not hand:
            return ["auto_pass"]

        while True:
            choice = input_with_quit(f"  Choose character (1-{len(hand)}): ")
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(hand):
                    break
            except ValueError:
                pass
            print(f"  Invalid. Enter 1-{len(hand)}.")

        while True:
            area = input_with_quit("  Place in [C]ouncil or [E]xile? ").strip().upper()
            if area in ("C", "E"):
                break
            print("  Enter C or E.")

        area_name = "council" if area == "C" else "exile"
        return ["place", idx, area_name]

    def _get_influence_move(self):
        tokens = self.influence_tokens[self.current_player]
        if not tokens:
            return ["skip_influence"]

        while True:
            choice = input_with_quit(f"  Choose agenda (1-{len(self.agendas)}) or [S]kip: ").strip().upper()
            if choice == "S":
                return ["skip_influence"]
            try:
                agenda_idx = int(choice) - 1
                if 0 <= agenda_idx < len(self.agendas):
                    break
            except ValueError:
                pass
            print(f"  Invalid. Enter 1-{len(self.agendas)} or S.")

        print(f"  Available tokens: {sorted(tokens, reverse=True)}")
        while True:
            val = input_with_quit("  Token value to place: ")
            try:
                v = int(val)
                if v in tokens:
                    return ["influence", agenda_idx, v]
            except ValueError:
                pass
            print(f"  Invalid. Choose from {sorted(tokens)}.")

    def make_move(self, move):
        if move[0] == "place":
            _, idx, area_name = move
            cp = self.current_player
            hand = self.player_hands[cp]
            cid = hand.pop(idx)
            c = self._char_by_id(cid)

            if area_name == "council":
                self.council.append(cid)
            else:
                self.exile.append(cid)

            self._add_log(f"{self.players[cp - 1]} places {c['name']} in {area_name.title()}")
            self.characters_placed += 1

            # Execute character power
            self._execute_power(c, cp)

            # Check if all characters placed
            if not self.player_hands[1] and not self.player_hands[2]:
                self.phase = "influence"
                self._add_log("All characters placed! Influence phase begins!")
                self.influence_rounds = 0

            return True

        elif move[0] == "auto_pass":
            return True

        elif move[0] == "influence":
            _, agenda_idx, value = move
            cp = self.current_player
            self.influence_tokens[cp].remove(value)
            self.placed_influence.append({
                "player": cp,
                "agenda_idx": agenda_idx,
                "value": value,
            })
            self._add_log(f"{self.players[cp - 1]} places a token on '{self.agendas[agenda_idx]['name']}'")
            self.influence_rounds += 1

            if self.influence_rounds >= self.max_influence_rounds * 2:
                self.phase = "scoring"
                self._add_log("Influence phase complete! Scoring...")
            elif not self.influence_tokens[1] and not self.influence_tokens[2]:
                self.phase = "scoring"
                self._add_log("All tokens placed! Scoring...")

            return True

        elif move[0] == "skip_influence":
            self.influence_rounds += 1
            self._add_log(f"{self.players[self.current_player - 1]} skips placing influence.")
            if self.influence_rounds >= self.max_influence_rounds * 2:
                self.phase = "scoring"
            return True

        elif move == "score":
            self._score_game()
            return True

        return False

    def _execute_power(self, character, player):
        power = character["power"]
        if power == "none":
            return
        elif power == "move_one":
            self._power_move_one(player)
        elif power == "swap":
            self._power_swap(player)
        elif power == "exile":
            self._power_exile_one(player)
        elif power == "council":
            self._power_council_one(player)
        elif power == "peek":
            self._power_peek(player)
        elif power == "lock":
            self._power_lock(player)

    def _power_move_one(self, player):
        all_placed = self.council + self.exile
        if len(all_placed) <= 1:
            return
        print(f"\n  POWER: Move a character between areas!")
        print(f"  Council: {', '.join(self._char_by_id(c)['name'] for c in self.council) or 'empty'}")
        print(f"  Exile: {', '.join(self._char_by_id(c)['name'] for c in self.exile) or 'empty'}")
        chars = [(cid, "council") for cid in self.council if "council" not in self.locked_areas]
        chars += [(cid, "exile") for cid in self.exile if "exile" not in self.locked_areas]
        if not chars:
            print("  No characters can be moved (areas locked).")
            return
        for i, (cid, area) in enumerate(chars):
            print(f"    [{i + 1}] {self._char_by_id(cid)['name']} (in {area})")
        print(f"    [0] Skip")
        while True:
            c = input_with_quit("  Move which? ")
            try:
                idx = int(c)
                if idx == 0:
                    return
                if 1 <= idx <= len(chars):
                    cid, area = chars[idx - 1]
                    if area == "council":
                        self.council.remove(cid)
                        self.exile.append(cid)
                        self._add_log(f"  {self._char_by_id(cid)['name']} moved to Exile!")
                    else:
                        self.exile.remove(cid)
                        self.council.append(cid)
                        self._add_log(f"  {self._char_by_id(cid)['name']} moved to Council!")
                    return
            except ValueError:
                pass

    def _power_swap(self, player):
        if not self.council or not self.exile:
            return
        locked_c = "council" in self.locked_areas
        locked_e = "exile" in self.locked_areas
        if locked_c or locked_e:
            print("  Cannot swap - an area is locked.")
            return
        print(f"\n  POWER: Swap two characters between areas!")
        print(f"  Council: {', '.join(self._char_by_id(c)['name'] for c in self.council)}")
        for i, cid in enumerate(self.council):
            print(f"    [{i + 1}] {self._char_by_id(cid)['name']}")
        print(f"    [0] Skip")
        while True:
            c1 = input_with_quit("  Choose from Council: ")
            try:
                idx1 = int(c1)
                if idx1 == 0:
                    return
                if 1 <= idx1 <= len(self.council):
                    break
            except ValueError:
                pass

        print(f"  Exile:")
        for i, cid in enumerate(self.exile):
            print(f"    [{i + 1}] {self._char_by_id(cid)['name']}")
        while True:
            c2 = input_with_quit("  Choose from Exile: ")
            try:
                idx2 = int(c2)
                if 1 <= idx2 <= len(self.exile):
                    break
            except ValueError:
                pass

        cid1 = self.council[idx1 - 1]
        cid2 = self.exile[idx2 - 1]
        self.council.remove(cid1)
        self.exile.remove(cid2)
        self.council.append(cid2)
        self.exile.append(cid1)
        self._add_log(f"  Swapped {self._char_by_id(cid1)['name']} and {self._char_by_id(cid2)['name']}!")

    def _power_exile_one(self, player):
        if not self.council or "council" in self.locked_areas:
            return
        print(f"\n  POWER: Move one character from Council to Exile!")
        for i, cid in enumerate(self.council):
            print(f"    [{i + 1}] {self._char_by_id(cid)['name']}")
        print(f"    [0] Skip")
        while True:
            c = input_with_quit("  Choose: ")
            try:
                idx = int(c)
                if idx == 0:
                    return
                if 1 <= idx <= len(self.council):
                    cid = self.council.pop(idx - 1)
                    self.exile.append(cid)
                    self._add_log(f"  {self._char_by_id(cid)['name']} exiled!")
                    return
            except ValueError:
                pass

    def _power_council_one(self, player):
        if not self.exile or "exile" in self.locked_areas:
            return
        print(f"\n  POWER: Move one character from Exile to Council!")
        for i, cid in enumerate(self.exile):
            print(f"    [{i + 1}] {self._char_by_id(cid)['name']}")
        print(f"    [0] Skip")
        while True:
            c = input_with_quit("  Choose: ")
            try:
                idx = int(c)
                if idx == 0:
                    return
                if 1 <= idx <= len(self.exile):
                    cid = self.exile.pop(idx - 1)
                    self.council.append(cid)
                    self._add_log(f"  {self._char_by_id(cid)['name']} brought to Council!")
                    return
            except ValueError:
                pass

    def _power_peek(self, player):
        other = 2 if player == 1 else 1
        opp_tokens = [p for p in self.placed_influence if p["player"] == other]
        if opp_tokens:
            latest = opp_tokens[-1]
            agenda_name = self.agendas[latest["agenda_idx"]]["name"]
            self.peeked_info = f"Peeked: {self.players[other - 1]} has value {latest['value']} on '{agenda_name}'"
            self._add_log(f"  {self.players[player - 1]} peeks at opponent's last token!")
        else:
            self._add_log("  No tokens to peek at yet.")

    def _power_lock(self, player):
        if len(self.locked_areas) >= 2:
            return
        print(f"\n  POWER: Lock an area (no more character moves there)!")
        options = [a for a in ["council", "exile"] if a not in self.locked_areas]
        if not options:
            return
        for i, a in enumerate(options):
            print(f"    [{i + 1}] {a.title()}")
        print(f"    [0] Skip")
        while True:
            c = input_with_quit("  Lock which area? ")
            try:
                idx = int(c)
                if idx == 0:
                    return
                if 1 <= idx <= len(options):
                    self.locked_areas.append(options[idx - 1])
                    self._add_log(f"  {options[idx - 1].title()} is now LOCKED!")
                    return
            except ValueError:
                pass

    def _score_game(self):
        """Score all agendas and determine winner."""
        scores = {1: 0, 2: 0}

        council_chars = [self._char_by_id(cid) for cid in self.council]
        exile_chars = [self._char_by_id(cid) for cid in self.exile]

        montague_council = sum(1 for c in council_chars if c["house"] == "Montague")
        capulet_council = sum(1 for c in council_chars if c["house"] == "Capulet")

        romeo_area = None
        juliet_area = None
        for c in council_chars:
            if c["name"] == "Romeo":
                romeo_area = "council"
            if c["name"] == "Juliet":
                juliet_area = "council"
        for c in exile_chars:
            if c["name"] == "Romeo":
                romeo_area = "exile"
            if c["name"] == "Juliet":
                juliet_area = "exile"

        neutrals_all_exiled = all(c["house"] != "Neutral" for c in council_chars) and \
                              any(c["house"] == "Neutral" for c in exile_chars)

        for agenda in self.agendas:
            condition_met = False
            if agenda["type"] == "montague_council":
                condition_met = montague_council > capulet_council
            elif agenda["type"] == "capulet_council":
                condition_met = capulet_council > montague_council
            elif agenda["type"] == "together":
                condition_met = romeo_area is not None and juliet_area is not None and romeo_area == juliet_area
            elif agenda["type"] == "apart":
                condition_met = romeo_area is not None and juliet_area is not None and romeo_area != juliet_area
            elif agenda["type"] == "neutrals_exiled":
                condition_met = neutrals_all_exiled

            status = "MET" if condition_met else "NOT MET"
            self._add_log(f"  Agenda '{agenda['name']}': {status}")

            # Score influence tokens on this agenda
            for token in self.placed_influence:
                if token["agenda_idx"] == agenda["id"]:
                    if condition_met:
                        scores[token["player"]] += token["value"]
                    # Tokens on unmet agendas score 0

        self._add_log(f"  Final: {self.players[0]}={scores[1]}, {self.players[1]}={scores[2]}")

        if scores[1] > scores[2]:
            self.winner = 1
        elif scores[2] > scores[1]:
            self.winner = 2
        else:
            self.winner = None

    def check_game_over(self):
        if self.phase == "scoring" and self.winner is not None or \
           (self.phase == "scoring" and any("Final:" in l for l in self.log)):
            self.game_over = True

    def get_state(self):
        return {
            "characters": self.characters,
            "agendas": self.agendas,
            "player_hands": {str(k): v for k, v in self.player_hands.items()},
            "council": self.council,
            "exile": self.exile,
            "locked_areas": self.locked_areas,
            "influence_tokens": {str(k): v for k, v in self.influence_tokens.items()},
            "placed_influence": self.placed_influence,
            "phase": self.phase,
            "characters_placed": self.characters_placed,
            "total_characters": self.total_characters,
            "influence_rounds": self.influence_rounds,
            "max_influence_rounds": self.max_influence_rounds,
            "log": self.log,
        }

    def load_state(self, state):
        self.characters = state["characters"]
        self.agendas = state["agendas"]
        self.player_hands = {int(k): v for k, v in state["player_hands"].items()}
        self.council = state["council"]
        self.exile = state["exile"]
        self.locked_areas = state["locked_areas"]
        self.influence_tokens = {int(k): v for k, v in state["influence_tokens"].items()}
        self.placed_influence = state["placed_influence"]
        self.phase = state["phase"]
        self.characters_placed = state["characters_placed"]
        self.total_characters = state["total_characters"]
        self.influence_rounds = state["influence_rounds"]
        self.max_influence_rounds = state["max_influence_rounds"]
        self.log = state["log"]

    def get_tutorial(self):
        return """
========================================
  COUNCIL OF VERONA - Tutorial
========================================

OVERVIEW:
  A quick bluffing game set in Romeo & Juliet's Verona!
  Place characters in Council or Exile, use their powers,
  then secretly bet on agendas with influence tokens.

PHASES:
  1. PLACEMENT - Take turns placing characters from your hand
     into Council or Exile. Each character has a power that
     triggers when placed:
       - Move: Relocate a character between areas
       - Swap: Exchange two characters between areas
       - Exile/Council: Force a character to that area
       - Peek: See opponent's last placed influence token
       - Lock: Prevent further moves to an area

  2. INFLUENCE - Take turns placing influence tokens (values
     0-5) face-down on agenda cards. Bluff about where
     you're investing!

  3. SCORING - Reveal tokens. Agendas check conditions about
     which characters ended up where. Tokens on met agendas
     score their value; unmet agendas score 0.

AGENDAS (examples):
  - Montague/Capulet Dominance: Which house has more in Council?
  - Together/Apart: Are Romeo and Juliet in the same area?
  - Exile Neutrals: Are all Neutral characters in Exile?

STRATEGY:
  - Use powers to set up agendas you've bet on
  - Bluff with 0-value tokens to mislead opponents
  - Place high tokens on agendas you're confident about

COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
========================================
"""
