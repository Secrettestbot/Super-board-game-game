"""Race for the Galaxy - Simplified card game of galactic civilization."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# ANSI color codes
CYAN    = "\033[96m"
YELLOW  = "\033[93m"
GREEN   = "\033[92m"
MAGENTA = "\033[95m"
RED     = "\033[91m"
BLUE    = "\033[94m"
BOLD    = "\033[1m"
RESET   = "\033[0m"
DIM     = "\033[2m"

# Role constants
EXPLORE  = "Explore"
DEVELOP  = "Develop"
SETTLE   = "Settle"
CONSUME  = "Consume"
PRODUCE  = "Produce"

ROLES = [EXPLORE, DEVELOP, SETTLE, CONSUME, PRODUCE]

# Card types
WORLD      = "world"
DEVELOPMENT = "development"

# Good types
NOVELTY  = "novelty"
RARE     = "rare"
GENES    = "genes"
ALIEN    = "alien"
NO_GOOD  = None

# The simplified card deck
# Each card: {name, type, cost, vp, good_type, produces, consume_vp, color_tag}
CARD_POOL = [
    # Starting worlds (always available as starting tableau)
    {"name": "Old Earth",      "type": WORLD,       "cost": 0, "vp": 1, "good": NO_GOOD,  "produces": False, "consume_vp": 0, "tag": "home"},
    {"name": "Alpha Centauri", "type": WORLD,       "cost": 0, "vp": 1, "good": NO_GOOD,  "produces": False, "consume_vp": 0, "tag": "home"},

    # Worlds
    {"name": "Epsilon Eridani", "type": WORLD,      "cost": 2, "vp": 2, "good": NOVELTY,  "produces": True,  "consume_vp": 1, "tag": "military"},
    {"name": "Tau Ceti",        "type": WORLD,      "cost": 1, "vp": 1, "good": NOVELTY,  "produces": True,  "consume_vp": 1, "tag": "trade"},
    {"name": "Alien Rosetta",   "type": WORLD,      "cost": 3, "vp": 3, "good": ALIEN,    "produces": True,  "consume_vp": 3, "tag": "alien"},
    {"name": "Uplift Code",     "type": WORLD,      "cost": 2, "vp": 2, "good": GENES,    "produces": True,  "consume_vp": 2, "tag": "genes"},
    {"name": "Rare Metals",     "type": WORLD,      "cost": 2, "vp": 2, "good": RARE,     "produces": True,  "consume_vp": 2, "tag": "mining"},
    {"name": "Deserted Planet", "type": WORLD,      "cost": 1, "vp": 1, "good": NO_GOOD,  "produces": False, "consume_vp": 0, "tag": "trade"},
    {"name": "Mining World",    "type": WORLD,      "cost": 3, "vp": 3, "good": RARE,     "produces": True,  "consume_vp": 2, "tag": "mining"},
    {"name": "Gene Lab",        "type": WORLD,      "cost": 4, "vp": 4, "good": GENES,    "produces": True,  "consume_vp": 3, "tag": "genes"},
    {"name": "Alien World",     "type": WORLD,      "cost": 5, "vp": 5, "good": ALIEN,    "produces": True,  "consume_vp": 4, "tag": "alien"},
    {"name": "Novelty Suburb",  "type": WORLD,      "cost": 2, "vp": 2, "good": NOVELTY,  "produces": True,  "consume_vp": 1, "tag": "trade"},
    {"name": "Ice Planet",      "type": WORLD,      "cost": 2, "vp": 2, "good": RARE,     "produces": True,  "consume_vp": 2, "tag": "mining"},
    {"name": "Rebel Outpost",   "type": WORLD,      "cost": 3, "vp": 3, "good": NO_GOOD,  "produces": False, "consume_vp": 0, "tag": "military"},
    {"name": "Trade Hub",       "type": WORLD,      "cost": 2, "vp": 1, "good": NO_GOOD,  "produces": False, "consume_vp": 0, "tag": "trade"},
    {"name": "Galactic Refuge", "type": WORLD,      "cost": 1, "vp": 1, "good": NOVELTY,  "produces": True,  "consume_vp": 1, "tag": "trade"},

    # Developments
    {"name": "Galactic Traders",  "type": DEVELOPMENT, "cost": 2, "vp": 1, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "trade"},
    {"name": "Alien Technology",  "type": DEVELOPMENT, "cost": 6, "vp": 6, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "alien"},
    {"name": "Mining League",     "type": DEVELOPMENT, "cost": 4, "vp": 3, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "mining"},
    {"name": "Consumer Markets",  "type": DEVELOPMENT, "cost": 3, "vp": 2, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "trade"},
    {"name": "Research Labs",     "type": DEVELOPMENT, "cost": 3, "vp": 2, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "science"},
    {"name": "Galactic Genes",    "type": DEVELOPMENT, "cost": 4, "vp": 3, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "genes"},
    {"name": "Pan-Galactic League","type": DEVELOPMENT,"cost": 4, "vp": 3, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "military"},
    {"name": "Free Trade Assoc.", "type": DEVELOPMENT, "cost": 5, "vp": 4, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "trade"},
    {"name": "Galactic Survey",   "type": DEVELOPMENT, "cost": 2, "vp": 1, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "science"},
    {"name": "Deep Space Lab",    "type": DEVELOPMENT, "cost": 3, "vp": 2, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "science"},
    {"name": "Alien Uplift",      "type": DEVELOPMENT, "cost": 5, "vp": 4, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "alien"},
    {"name": "Terraforming Guild","type": DEVELOPMENT, "cost": 4, "vp": 3, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "science"},
    {"name": "Imperium Lords",    "type": DEVELOPMENT, "cost": 3, "vp": 2, "good": NO_GOOD, "produces": False, "consume_vp": 0, "tag": "military"},
]


def _card_str(card, show_good=False):
    """Return a short string description of a card."""
    t = "W" if card["type"] == WORLD else "D"
    good = f" [{card['good']}]" if show_good and card["good"] else ""
    return f"[{t}] {card['name']} (cost:{card['cost']} vp:{card['vp']}{good})"


class RaceForTheGalaxyGame(BaseGame):
    """Simplified Race for the Galaxy - role selection galactic card game."""

    name = "Race for the Galaxy"
    description = "Simultaneous role selection card game of galactic civilization"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (game ends at 12 tableau cards or VP pool empty)",
        "quick":    "Quick (game ends at 8 tableau cards or VP pool empty)",
    }

    STARTING_WORLDS = {1: "Old Earth", 2: "Alpha Centauri"}

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.deck = []
        self.discard = []
        self.hands = {1: [], 2: []}
        self.tableau = {1: [], 2: []}   # played cards
        self.goods = {1: [], 2: []}     # goods on worlds
        self.vp_pool = 0
        self.vp_chips = {1: 0, 2: 0}   # bonus VP chips from Consume
        self.phase_log = []
        self.end_trigger = 12

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.end_trigger = 8 if self.variation == "quick" else 12
        self.vp_pool = 12 * (self.end_trigger // 2)

        # Build deck (exclude starting worlds)
        starting_names = set(self.STARTING_WORLDS.values())
        pool = [c for c in CARD_POOL if c["name"] not in starting_names]
        self.deck = random.sample(pool, len(pool))
        self.discard = []

        # Starting tableau
        sw = {name: card for card in CARD_POOL for name in [card["name"]]}
        self.tableau = {
            1: [sw[self.STARTING_WORLDS[1]]],
            2: [sw[self.STARTING_WORLDS[2]]],
        }
        self.goods = {1: [], 2: []}
        self.hands = {1: [], 2: []}
        self.vp_chips = {1: 0, 2: 0}
        self.phase_log = []

        # Draw starting hands (6 cards each)
        for p in (1, 2):
            self._draw_cards(p, 6)

        self.current_player = 1
        self.game_over = False
        self.winner = None
        self.turn_number = 0

    def _draw_cards(self, player, n):
        """Draw n cards from the deck into player's hand."""
        for _ in range(n):
            if not self.deck:
                if self.discard:
                    self.deck = random.sample(self.discard, len(self.discard))
                    self.discard = []
                else:
                    return
            if self.deck:
                self.hands[player].append(self.deck.pop())

    def _discard_cards(self, player, cards):
        """Move specific cards from hand to discard."""
        for c in cards:
            if c in self.hands[player]:
                self.hands[player].remove(c)
                self.discard.append(c)

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = 2 if cp == 1 else 1

        print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
        print(f"{BOLD}{CYAN}  RACE FOR THE GALAXY  -  Turn {self.turn_number + 1}{RESET}")
        print(f"{CYAN}{'='*60}{RESET}")
        print(f"  VP Pool remaining: {YELLOW}{self.vp_pool}{RESET}  |  "
              f"End at: {self.end_trigger} tableau cards")

        for p in (1, 2):
            marker = f"{GREEN}(YOU){RESET}" if p == cp else f"{DIM}(OPP){RESET}"
            label = f"  {BOLD}{self.players[p-1]}{RESET} {marker}"
            print(f"\n{label}")
            print(f"    Cards in hand: {len(self.hands[p])}")
            print(f"    VP chips: {YELLOW}{self.vp_chips[p]}{RESET}")
            # Tableau
            print(f"    Tableau ({len(self.tableau[p])} cards):")
            for card in self.tableau[p]:
                good_info = ""
                if card["produces"]:
                    has_good = any(g[0] is card for g in self.goods[p])
                    good_info = f"  {GREEN}[has good]{RESET}" if has_good else f"  {DIM}[no good]{RESET}"
                print(f"      {_card_str(card, show_good=False)}{good_info}")
            # Goods
            if self.goods[p]:
                good_names = ", ".join(f"{g[1]}" for g in self.goods[p])
                print(f"    Goods: {MAGENTA}{good_names}{RESET}")

        # Phase log
        if self.phase_log:
            print(f"\n{DIM}  --- Recent Events ---")
            for line in self.phase_log[-8:]:
                print(f"  {line}")
            print(RESET, end="")
        print()

    # ------------------------------------------------------------ get_move
    def get_move(self):
        """A full turn: both players select roles, then execute phases."""
        # Step 1: Both players pick roles simultaneously (ask in sequence)
        roles_chosen = {}
        for p in (1, 2):
            role = self._pick_role(p)
            roles_chosen[p] = role

        return ("turn", roles_chosen)

    def _pick_role(self, player):
        """Ask player to pick a role card."""
        clear_screen()
        self.display()
        print(f"\n{BOLD}{self.players[player-1]}, choose your role:{RESET}")
        for i, role in enumerate(ROLES, 1):
            print(f"  {i}. {role}")
        print(f"  (The role you pick gets a bonus when executed.)")
        while True:
            raw = input_with_quit(f"  {self.players[player-1]} role [1-5]: ").strip()
            if raw.isdigit() and 1 <= int(raw) <= 5:
                return ROLES[int(raw) - 1]
            print("  Enter a number 1-5.")

    # ------------------------------------------------------------ make_move
    def make_move(self, move):
        if move[0] != "turn":
            return False

        _, roles_chosen = move
        self.phase_log = []

        # Determine which phases execute (union of chosen roles)
        active_roles = set(roles_chosen.values())

        # Execute phases in order
        for role in ROLES:
            if role in active_roles:
                choosers = [p for p, r in roles_chosen.items() if r == role]
                self._execute_phase(role, choosers)

        return True

    # ---------------------------------- phase execution
    def _execute_phase(self, role, choosers):
        """Execute a phase. choosers get the bonus."""
        self.phase_log.append(f"{BOLD}--- {role} phase ---{RESET}")

        if role == EXPLORE:
            self._phase_explore(choosers)
        elif role == DEVELOP:
            self._phase_develop(choosers)
        elif role == SETTLE:
            self._phase_settle(choosers)
        elif role == CONSUME:
            self._phase_consume(choosers)
        elif role == PRODUCE:
            self._phase_produce(choosers)

    def _phase_explore(self, choosers):
        """Each player draws 2 cards and keeps 1 (chooser draws 3, keeps 2)."""
        for p in (1, 2):
            draw_n = 3 if p in choosers else 2
            keep_n = 2 if p in choosers else 1
            bonus = " (bonus +1 draw)" if p in choosers else ""
            self._draw_cards(p, draw_n)
            self.phase_log.append(f"  {self.players[p-1]} draws {draw_n}{bonus}.")
            # Player discards down to keep_n from newly drawn
            # Simplification: auto-keep the best cards (by VP desc)
            # Ask player to choose which to discard
            discard_n = max(0, len(self.hands[p]) - 7)  # keep hand <= 7
            if discard_n > 0:
                chosen = self._ask_discard(p, discard_n)
                self._discard_cards(p, chosen)
        self.phase_log.append(f"  Explore complete.")

    def _ask_discard(self, player, n):
        """Ask player to choose n cards to discard from hand."""
        clear_screen()
        self.display()
        hand = self.hands[player]
        print(f"\n{BOLD}{self.players[player-1]}: Discard {n} card(s) from hand{RESET}")
        for i, c in enumerate(hand, 1):
            print(f"  {i}. {_card_str(c, show_good=True)}")
        chosen = []
        while len(chosen) < n:
            raw = input_with_quit(
                f"  Pick card #{len(chosen)+1} to discard [1-{len(hand)}]: "
            ).strip()
            if raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < len(hand) and hand[idx] not in chosen:
                    chosen.append(hand[idx])
                    continue
            print("  Invalid selection.")
        return chosen

    def _phase_develop(self, choosers):
        """Players may play one development card. Chooser pays 1 less."""
        for p in (1, 2):
            discount = 1 if p in choosers else 0
            devs = [c for c in self.hands[p] if c["type"] == DEVELOPMENT]
            if not devs:
                self.phase_log.append(f"  {self.players[p-1]}: no developments to play.")
                continue
            card = self._ask_play_card(p, devs, "development", discount)
            if card:
                # Pay cost by discarding cards from hand
                cost = max(0, card["cost"] - discount)
                self._pay_cost(p, card, cost)
                self.tableau[p].append(card)
                self.phase_log.append(
                    f"  {self.players[p-1]} developed {card['name']} (cost {cost})."
                )

    def _phase_settle(self, choosers):
        """Players may settle one world. Chooser draws 1 card after settling."""
        for p in (1, 2):
            worlds = [c for c in self.hands[p] if c["type"] == WORLD]
            if not worlds:
                self.phase_log.append(f"  {self.players[p-1]}: no worlds to settle.")
                continue
            card = self._ask_play_card(p, worlds, "world", 0)
            if card:
                cost = card["cost"]
                self._pay_cost(p, card, cost)
                self.tableau[p].append(card)
                self.phase_log.append(
                    f"  {self.players[p-1]} settled {card['name']} (cost {cost})."
                )
                # Chooser bonus: draw 1
                if p in choosers:
                    self._draw_cards(p, 1)
                    self.phase_log.append(f"  {self.players[p-1]} draws bonus card.")

    def _ask_play_card(self, player, options, card_type, discount):
        """Ask player to choose a card to play or skip."""
        clear_screen()
        self.display()
        effective = [(c, max(0, c["cost"] - discount)) for c in options]
        hand_size = len(self.hands[player])
        print(f"\n{BOLD}{self.players[player-1]}: Play a {card_type}? "
              f"(hand={hand_size} cards){RESET}")
        if discount:
            print(f"  {GREEN}Discount: -{discount} cost{RESET}")
        for i, (c, eff_cost) in enumerate(effective, 1):
            affordable = GREEN if hand_size - 1 >= eff_cost else RED
            print(f"  {i}. {_card_str(c, show_good=True)}  "
                  f"{affordable}[pay {eff_cost}]{RESET}")
        print(f"  0. Skip (don't play)")
        while True:
            raw = input_with_quit(
                f"  Choice [0-{len(options)}]: "
            ).strip()
            if raw == "0":
                return None
            if raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < len(options):
                    c, eff_cost = effective[idx]
                    if hand_size - 1 < eff_cost:
                        print(f"  Not enough cards to pay (need {eff_cost}).")
                        continue
                    return c
            print("  Invalid choice.")

    def _pay_cost(self, player, card, cost):
        """Remove card from hand and pay cost by discarding other cards."""
        self.hands[player].remove(card)
        if cost > 0:
            # Auto-discard lowest-vp cards
            candidates = sorted(self.hands[player], key=lambda c: c["vp"])
            for _ in range(min(cost, len(candidates))):
                discarded = candidates.pop(0)
                self.hands[player].remove(discarded)
                self.discard.append(discarded)

    def _phase_consume(self, choosers):
        """Players trade goods for VP chips. Chooser gets 2x VP."""
        for p in (1, 2):
            multiplier = 2 if p in choosers else 1
            earned = 0
            consumed = []
            for good_entry in list(self.goods[p]):
                card, good_type = good_entry
                consume_vp = card.get("consume_vp", 0) * multiplier
                if consume_vp > 0 and self.vp_pool > 0:
                    give = min(consume_vp, self.vp_pool)
                    self.vp_chips[p] += give
                    self.vp_pool -= give
                    earned += give
                    consumed.append(good_entry)
                    # Also draw a card for trading
                    self._draw_cards(p, 1)
            for g in consumed:
                self.goods[p].remove(g)
            if earned:
                mult_str = " (x2 bonus!)" if p in choosers else ""
                self.phase_log.append(
                    f"  {self.players[p-1]} consumed goods for {earned} VP{mult_str}."
                )
            else:
                self.phase_log.append(f"  {self.players[p-1]}: no goods to consume.")

    def _phase_produce(self, choosers):
        """Worlds without goods produce a good. Chooser's homeworld also produces."""
        for p in (1, 2):
            produced = 0
            worlds_with_goods = {g[0] for g in self.goods[p]}
            for card in self.tableau[p]:
                if card["produces"] and card not in worlds_with_goods:
                    # Chooser bonus: also produce on home world
                    self.goods[p].append((card, card["good"]))
                    produced += 1
            if produced:
                self.phase_log.append(
                    f"  {self.players[p-1]} produced {produced} good(s)."
                )
            else:
                self.phase_log.append(f"  {self.players[p-1]}: no new goods produced.")

    # ---------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if any player has reached end condition."""
        for p in (1, 2):
            if len(self.tableau[p]) >= self.end_trigger:
                self.game_over = True
                break
        if self.vp_pool <= 0:
            self.game_over = True

        if self.game_over:
            # Score: card VPs + bonus VP chips
            scores = {}
            for p in (1, 2):
                card_vp = sum(c["vp"] for c in self.tableau[p])
                scores[p] = card_vp + self.vp_chips[p]
            self.phase_log.append(
                f"{BOLD}Final scores: {self.players[0]}: {scores[1]}  "
                f"{self.players[1]}: {scores[2]}{RESET}"
            )
            if scores[1] > scores[2]:
                self.winner = 1
            elif scores[2] > scores[1]:
                self.winner = 2
            else:
                self.winner = None  # draw

    # ---------------------------------------------------- state save/load
    def get_state(self):
        def card_name(c):
            return c["name"]

        def names_to_cards(names):
            lookup = {c["name"]: c for c in CARD_POOL}
            return [lookup[n] for n in names if n in lookup]

        return {
            "deck": [card_name(c) for c in self.deck],
            "discard": [card_name(c) for c in self.discard],
            "hands": {str(p): [card_name(c) for c in self.hands[p]] for p in (1, 2)},
            "tableau": {str(p): [card_name(c) for c in self.tableau[p]] for p in (1, 2)},
            "goods": {
                str(p): [[card_name(g[0]), g[1]] for g in self.goods[p]]
                for p in (1, 2)
            },
            "vp_pool": self.vp_pool,
            "vp_chips": {str(p): self.vp_chips[p] for p in (1, 2)},
            "phase_log": self.phase_log,
            "end_trigger": self.end_trigger,
        }

    def load_state(self, state):
        lookup = {c["name"]: c for c in CARD_POOL}

        def n2c(names):
            return [lookup[n] for n in names if n in lookup]

        self.deck = n2c(state["deck"])
        self.discard = n2c(state["discard"])
        self.hands = {int(p): n2c(names) for p, names in state["hands"].items()}
        self.tableau = {int(p): n2c(names) for p, names in state["tableau"].items()}
        self.goods = {}
        for p_str, gs in state["goods"].items():
            p = int(p_str)
            self.goods[p] = [(lookup[g[0]], g[1]) for g in gs if g[0] in lookup]
        self.vp_pool = state["vp_pool"]
        self.vp_chips = {int(p): v for p, v in state["vp_chips"].items()}
        self.phase_log = state.get("phase_log", [])
        self.end_trigger = state.get("end_trigger", 12)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        limit = 8 if self.variation == "quick" else 12
        return f"""
{BOLD}{CYAN}{'='*60}
  RACE FOR THE GALAXY - Tutorial ({self.variation.title()})
{'='*60}{RESET}

{BOLD}OVERVIEW:{RESET}
  Build a galactic civilization by playing worlds and
  developments from your hand. Each turn, both players
  secretly choose a role. All chosen roles execute that turn,
  with bonus effects for the chooser.

{BOLD}ROLES:{RESET}
  1. {CYAN}Explore{RESET}  - Draw 2 extra cards, keep some (chooser: +1 draw)
  2. {GREEN}Develop{RESET} - Play a development card at -1 cost (chooser)
  3. {YELLOW}Settle{RESET}  - Play a world card; chooser draws 1 bonus card
  4. {MAGENTA}Consume{RESET} - Trade goods for VP chips; chooser gets 2x VP
  5. {RED}Produce{RESET} - Worlds without goods produce goods

{BOLD}CARDS:{RESET}
  [W] = World   (blue) - can produce goods if it has a good type
  [D] = Development - permanent bonus effects and VP

  Cost is paid by discarding other cards from your hand.
  Each card has a VP value scored at the end.

{BOLD}GOODS:{RESET}
  Producing worlds generate goods: novelty, rare, genes, alien.
  Use Consume to trade goods for VP chips (pool: {self.vp_pool}).
  Higher-value goods yield more VP.

{BOLD}WINNING:{RESET}
  Game ends when any tableau reaches {limit} cards OR VP pool empties.
  Score = sum of card VPs + VP chips earned.
  Highest score wins!

{BOLD}COMMANDS:{RESET}
  Each turn you pick a role number (1-5).
  During phases, follow prompts to play cards or skip.

  'quit' - Exit   'save' - Save   'help' - Help   'tutorial' - This text
{CYAN}{'='*60}{RESET}
"""
