"""Palm Island - Card-flipping resource management game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"
GREEN = "\033[92m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"

# Resources
RESOURCES = ["Wood", "Stone", "Fish"]
RES_COLOR = {"Wood": YELLOW, "Stone": DIM, "Fish": BLUE}
RES_SYMBOL = {"Wood": "W", "Stone": "S", "Fish": "F"}

# Card states: each card has 4 states (0-3)
# State 0: default, State 1: rotated, State 2: flipped, State 3: rotated+flipped
# Each state has: resources_produced, score, upgrade_cost
CARD_TEMPLATES = [
    {
        "name": "Lumber Mill",
        "states": [
            {"produces": ["Wood"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Wood"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Wood", "Wood"], "score": 2, "label": "Advanced"},
            {"produces": ["Wood", "Wood", "Stone"], "score": 4, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1},
            {"Wood": 2},
            {"Wood": 2, "Stone": 1},
        ],
    },
    {
        "name": "Quarry",
        "states": [
            {"produces": ["Stone"], "score": 0, "label": "Basic"},
            {"produces": ["Stone", "Stone"], "score": 1, "label": "Improved"},
            {"produces": ["Stone", "Stone", "Stone"], "score": 3, "label": "Advanced"},
            {"produces": ["Stone", "Stone", "Wood"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Stone": 1},
            {"Stone": 2},
            {"Stone": 2, "Wood": 1},
        ],
    },
    {
        "name": "Fishing Dock",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Fish", "Fish"], "score": 1, "label": "Improved"},
            {"produces": ["Fish", "Fish", "Fish"], "score": 2, "label": "Advanced"},
            {"produces": ["Fish", "Fish", "Wood"], "score": 4, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Fish": 1},
            {"Fish": 2},
            {"Fish": 1, "Wood": 1},
        ],
    },
    {
        "name": "Market",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Fish"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Stone", "Fish"], "score": 3, "label": "Advanced"},
            {"produces": ["Wood", "Wood", "Fish", "Fish"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1},
            {"Fish": 2},
            {"Stone": 2},
        ],
    },
    {
        "name": "Workshop",
        "states": [
            {"produces": ["Wood"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Stone"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Wood", "Stone"], "score": 3, "label": "Advanced"},
            {"produces": ["Stone", "Stone", "Stone", "Wood"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1, "Stone": 1},
            {"Wood": 2},
            {"Stone": 3},
        ],
    },
    {
        "name": "Hut",
        "states": [
            {"produces": [], "score": 1, "label": "Basic"},
            {"produces": ["Wood"], "score": 2, "label": "Improved"},
            {"produces": ["Wood", "Stone"], "score": 3, "label": "Advanced"},
            {"produces": ["Wood", "Stone", "Fish"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 2},
            {"Stone": 2},
            {"Fish": 2},
        ],
    },
    {
        "name": "Temple",
        "states": [
            {"produces": [], "score": 2, "label": "Basic"},
            {"produces": [], "score": 4, "label": "Improved"},
            {"produces": ["Stone"], "score": 6, "label": "Advanced"},
            {"produces": ["Stone", "Stone"], "score": 8, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Stone": 2},
            {"Stone": 3},
            {"Stone": 3, "Wood": 1},
        ],
    },
    {
        "name": "Storehouse",
        "states": [
            {"produces": ["Wood"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Fish"], "score": 1, "label": "Improved"},
            {"produces": ["Fish", "Fish", "Fish"], "score": 2, "label": "Advanced"},
            {"produces": ["Wood", "Wood", "Fish", "Fish"], "score": 4, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Fish": 1},
            {"Wood": 1, "Fish": 1},
            {"Wood": 2, "Fish": 2},
        ],
    },
    {
        "name": "Watchtower",
        "states": [
            {"produces": [], "score": 1, "label": "Basic"},
            {"produces": ["Stone"], "score": 2, "label": "Improved"},
            {"produces": ["Stone", "Stone"], "score": 4, "label": "Advanced"},
            {"produces": ["Wood", "Stone", "Stone"], "score": 6, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1, "Stone": 1},
            {"Stone": 2},
            {"Wood": 1, "Stone": 2},
        ],
    },
    {
        "name": "Trading Post",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Fish"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Stone", "Fish"], "score": 3, "label": "Advanced"},
            {"produces": ["Wood", "Wood", "Stone", "Fish"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Fish": 2},
            {"Wood": 1, "Fish": 1},
            {"Wood": 2, "Stone": 1},
        ],
    },
    {
        "name": "Shrine",
        "states": [
            {"produces": [], "score": 1, "label": "Basic"},
            {"produces": [], "score": 3, "label": "Improved"},
            {"produces": ["Fish"], "score": 5, "label": "Advanced"},
            {"produces": ["Fish", "Fish"], "score": 7, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Fish": 2},
            {"Fish": 3},
            {"Fish": 2, "Stone": 1},
        ],
    },
    {
        "name": "Farm",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Fish", "Fish"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Fish", "Fish"], "score": 2, "label": "Advanced"},
            {"produces": ["Wood", "Fish", "Fish", "Fish"], "score": 4, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1},
            {"Wood": 1, "Fish": 1},
            {"Wood": 2, "Fish": 1},
        ],
    },
    {
        "name": "Forge",
        "states": [
            {"produces": ["Stone"], "score": 0, "label": "Basic"},
            {"produces": ["Wood", "Stone"], "score": 1, "label": "Improved"},
            {"produces": ["Wood", "Wood", "Stone"], "score": 3, "label": "Advanced"},
            {"produces": ["Wood", "Wood", "Stone", "Stone"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 2},
            {"Wood": 1, "Stone": 1},
            {"Wood": 2, "Stone": 2},
        ],
    },
    {
        "name": "Harbor",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Fish", "Stone"], "score": 1, "label": "Improved"},
            {"produces": ["Fish", "Fish", "Stone"], "score": 3, "label": "Advanced"},
            {"produces": ["Fish", "Fish", "Stone", "Stone"], "score": 5, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Stone": 1},
            {"Fish": 1, "Stone": 1},
            {"Fish": 2, "Stone": 1},
        ],
    },
    {
        "name": "Garden",
        "states": [
            {"produces": [], "score": 1, "label": "Basic"},
            {"produces": ["Wood"], "score": 2, "label": "Improved"},
            {"produces": ["Wood", "Fish"], "score": 4, "label": "Advanced"},
            {"produces": ["Wood", "Fish", "Stone"], "score": 6, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1, "Fish": 1},
            {"Wood": 2, "Fish": 1},
            {"Wood": 1, "Fish": 1, "Stone": 1},
        ],
    },
    {
        "name": "Monument",
        "states": [
            {"produces": [], "score": 2, "label": "Basic"},
            {"produces": [], "score": 4, "label": "Improved"},
            {"produces": [], "score": 7, "label": "Advanced"},
            {"produces": [], "score": 10, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 2, "Stone": 2},
            {"Wood": 3, "Stone": 3},
            {"Wood": 3, "Stone": 3, "Fish": 2},
        ],
    },
    {
        "name": "Canoe",
        "states": [
            {"produces": ["Fish"], "score": 0, "label": "Basic"},
            {"produces": ["Fish", "Fish"], "score": 0, "label": "Improved"},
            {"produces": ["Fish", "Fish", "Wood"], "score": 1, "label": "Advanced"},
            {"produces": ["Fish", "Fish", "Fish", "Wood"], "score": 3, "label": "Master"},
        ],
        "upgrade_costs": [
            {"Wood": 1},
            {"Wood": 2},
            {"Wood": 2, "Fish": 1},
        ],
    },
]


def res_str(resources):
    """Format a list of resources for display."""
    if not resources:
        return f"{DIM}(none){RESET}"
    parts = []
    for r in resources:
        parts.append(f"{RES_COLOR[r]}{RES_SYMBOL[r]}{RESET}")
    return " ".join(parts)


def cost_str(cost_dict):
    """Format a cost dictionary for display."""
    parts = []
    for res, count in cost_dict.items():
        parts.append(f"{RES_COLOR[res]}{count}{RES_SYMBOL[res]}{RESET}")
    return " ".join(parts)


class PalmIslandGame(BaseGame):
    """Palm Island - Card-flipping resource management."""

    name = "Palm Island"
    description = "Cycle through cards, gathering resources and upgrading buildings"
    min_players = 1
    max_players = 1
    variations = {
        "standard": "Standard game - 8 rounds through the deck",
        "quick": "Quick game - 5 rounds through the deck",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_rounds = 8 if self.variation != "quick" else 5
        self.cards = []  # List of {template_idx, state}
        self.current_card_idx = 0
        self.resources = {"Wood": 0, "Stone": 0, "Fish": 0}
        self.round_num = 1
        self.cards_seen_this_round = 0
        self.log = []
        self.total_cards = 17

    def setup(self):
        """Initialize the deck of 17 cards."""
        # Pick 17 cards from templates
        indices = list(range(len(CARD_TEMPLATES)))
        random.shuffle(indices)
        selected = indices[:self.total_cards]

        self.cards = []
        for idx in selected:
            self.cards.append({"template_idx": idx, "state": 0})

        random.shuffle(self.cards)
        self.current_card_idx = 0
        self.resources = {"Wood": 0, "Stone": 0, "Fish": 0}
        self.round_num = 1
        self.cards_seen_this_round = 0
        self.log = []

    def _get_card_info(self, card):
        """Get the current state info for a card."""
        template = CARD_TEMPLATES[card["template_idx"]]
        state_info = template["states"][card["state"]]
        return {
            "name": template["name"],
            "label": state_info["label"],
            "produces": state_info["produces"],
            "score": state_info["score"],
            "state": card["state"],
            "can_upgrade": card["state"] < 3,
            "upgrade_cost": (template["upgrade_costs"][card["state"]]
                             if card["state"] < 3 else None),
        }

    def _can_afford(self, cost):
        """Check if player can afford a cost."""
        if not cost:
            return False
        for res, amount in cost.items():
            if self.resources.get(res, 0) < amount:
                return False
        return True

    def _pay_cost(self, cost):
        """Pay a resource cost."""
        for res, amount in cost.items():
            self.resources[res] -= amount

    def _collect_resources(self, produces):
        """Collect resources from a card. Cap at 5 each."""
        for res in produces:
            self.resources[res] = min(5, self.resources[res] + 1)

    def _total_score(self):
        """Calculate total score from all cards."""
        total = 0
        for card in self.cards:
            info = self._get_card_info(card)
            total += info["score"]
        return total

    def display(self):
        """Display the game state."""
        clear_screen()
        print(f"{BOLD}=== PALM ISLAND ==={RESET}")
        print(f"Round {self.round_num}/{self.max_rounds} | "
              f"Card {self.cards_seen_this_round + 1}/{len(self.cards)} | "
              f"Score: {self._total_score()}")
        print()

        # Resources
        print(f"{BOLD}Resources:{RESET}", end="")
        for res in RESOURCES:
            amt = self.resources[res]
            bar = "#" * amt + "." * (5 - amt)
            print(f"  {RES_COLOR[res]}{res}: [{bar}] {amt}{RESET}", end="")
        print()
        print()

        # Current card
        card = self.cards[self.current_card_idx]
        info = self._get_card_info(card)
        print(f"{BOLD}--- Current Card ---{RESET}")
        print(f"  {CYAN}{info['name']}{RESET} ({info['label']} - "
              f"State {info['state'] + 1}/4)")
        print(f"  Produces: {res_str(info['produces'])}")
        print(f"  Score: {info['score']} pts")

        if info["can_upgrade"]:
            affordable = self._can_afford(info["upgrade_cost"])
            marker = f" {GREEN}<< CAN AFFORD{RESET}" if affordable else ""
            print(f"  Upgrade cost: {cost_str(info['upgrade_cost'])}{marker}")

            # Show what upgrade gives
            next_state = CARD_TEMPLATES[card["template_idx"]]["states"][card["state"] + 1]
            print(f"  Upgrade to: {next_state['label']} "
                  f"(Produces: {res_str(next_state['produces'])}, "
                  f"Score: {next_state['score']})")
        else:
            print(f"  {DIM}(Fully upgraded){RESET}")
        print()

        # Upcoming cards preview
        print(f"{BOLD}--- Upcoming Cards ---{RESET}")
        for offset in range(1, min(4, len(self.cards))):
            idx = (self.current_card_idx + offset) % len(self.cards)
            preview = self._get_card_info(self.cards[idx])
            print(f"  {offset}. {preview['name']} ({preview['label']}) "
                  f"- {res_str(preview['produces'])} "
                  f"[{preview['score']} pts]")
        print()

        # All cards summary
        print(f"{BOLD}--- All Cards Summary ---{RESET}")
        state_counts = [0, 0, 0, 0]
        for c in self.cards:
            state_counts[c["state"]] += 1
        print(f"  Basic: {state_counts[0]} | Improved: {state_counts[1]} | "
              f"Advanced: {state_counts[2]} | Master: {state_counts[3]}")
        print()

        if self.log:
            print(f"{DIM}Last: {self.log[-1]}{RESET}")

    def get_move(self):
        """Get player action for current card."""
        card = self.cards[self.current_card_idx]
        info = self._get_card_info(card)

        print("Choose action:")
        print("  [G] Gather resources from this card")
        if info["can_upgrade"] and self._can_afford(info["upgrade_cost"]):
            print(f"  [U] Upgrade this card ({cost_str(info['upgrade_cost'])})")
        elif info["can_upgrade"]:
            print(f"  {DIM}[U] Upgrade (need {cost_str(info['upgrade_cost'])}){RESET}")
        print("  [S] Skip this card")

        choice = input_with_quit("Your choice: ").strip().upper()
        return (choice,)

    def make_move(self, move):
        """Process a move."""
        card = self.cards[self.current_card_idx]
        info = self._get_card_info(card)
        choice = move[0]

        if choice == "G":
            # Gather resources
            self._collect_resources(info["produces"])
            if info["produces"]:
                self.log.append(
                    f"Gathered {res_str(info['produces'])} "
                    f"from {info['name']}")
            else:
                self.log.append(f"No resources from {info['name']}")

        elif choice == "U":
            if not info["can_upgrade"]:
                self.log.append("Card is fully upgraded!")
                return False
            if not self._can_afford(info["upgrade_cost"]):
                self.log.append("Can't afford upgrade!")
                return False

            self._pay_cost(info["upgrade_cost"])
            card["state"] += 1
            new_info = self._get_card_info(card)
            self.log.append(
                f"Upgraded {info['name']} to {new_info['label']}! "
                f"(Score: {new_info['score']})")

        elif choice == "S" or choice == "":
            self.log.append(f"Skipped {info['name']}")

        else:
            return False

        # Advance to next card
        self.cards_seen_this_round += 1
        if self.cards_seen_this_round >= len(self.cards):
            # End of round
            self.round_num += 1
            self.cards_seen_this_round = 0
            self.current_card_idx = 0
            if self.round_num <= self.max_rounds:
                self.log.append(
                    f"=== Round {self.round_num} begins! "
                    f"Score: {self._total_score()} ===")
        else:
            self.current_card_idx = (
                (self.current_card_idx + 1) % len(self.cards))

        return True

    def switch_player(self):
        """Override - single player game, no switching."""
        pass

    def check_game_over(self):
        """Check if all rounds are complete."""
        if self.round_num > self.max_rounds:
            self.game_over = True
            score = self._total_score()
            self.winner = 1  # Solo game - always "win"
            self.log.append(f"Final Score: {score}")

    def get_state(self):
        """Return serializable game state."""
        return {
            "cards": self.cards,
            "current_card_idx": self.current_card_idx,
            "resources": self.resources,
            "round_num": self.round_num,
            "cards_seen_this_round": self.cards_seen_this_round,
            "log": self.log,
            "max_rounds": self.max_rounds,
            "total_cards": self.total_cards,
        }

    def load_state(self, state):
        """Restore game state."""
        self.cards = state["cards"]
        self.current_card_idx = state["current_card_idx"]
        self.resources = state["resources"]
        self.round_num = state["round_num"]
        self.cards_seen_this_round = state["cards_seen_this_round"]
        self.log = state.get("log", [])
        self.max_rounds = state.get("max_rounds", 8)
        self.total_cards = state.get("total_cards", 17)

    def get_tutorial(self):
        """Return tutorial text."""
        return f"""{BOLD}=== PALM ISLAND - Tutorial ==={RESET}

Palm Island is a solo card-flipping resource management game.
You cycle through a hand of {self.total_cards} cards for {self.max_rounds} rounds,
gathering resources and upgrading cards.

{BOLD}GOAL:{RESET}
  Maximize your score by upgrading cards to higher states.
  Each card has 4 states: Basic -> Improved -> Advanced -> Master.

{BOLD}RESOURCES:{RESET}
  {YELLOW}Wood (W){RESET}  - Produced by mills, workshops, forests
  {DIM}Stone (S){RESET} - Produced by quarries, forges
  {BLUE}Fish (F){RESET}  - Produced by docks, markets, farms
  Max 5 of each resource at a time.

{BOLD}ON YOUR TURN:{RESET}
  Look at the current card and choose:
  [G] Gather - Collect the resources it produces
  [U] Upgrade - Pay the upgrade cost to improve the card
  [S] Skip - Move to the next card without acting

{BOLD}UPGRADING:{RESET}
  Each card can be upgraded 3 times (4 states total).
  Higher states produce better resources AND score more points.
  Upgrade costs increase with each level.

{BOLD}SCORING:{RESET}
  Your score is the sum of all card score values.
  Basic cards score 0-2, Master cards score 3-10!

{BOLD}STRATEGY:{RESET}
  - Early rounds: Focus on gathering resources
  - Middle rounds: Start upgrading resource-producing cards
  - Late rounds: Upgrade high-scoring cards (Temple, Monument)
  - Balance gathering with upgrading
  - Resource-producing cards should be upgraded first

Score Guide:
  0-20: Novice    |  21-35: Apprentice
  36-50: Builder  |  51-70: Architect
  71+: Island Master!

Type 'q' to quit, 's' to save, 'h' for help during play.
"""
