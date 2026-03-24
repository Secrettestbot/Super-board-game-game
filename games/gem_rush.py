"""Gem Rush - A cooperative gem mining and crafting game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Gem types and their counts in the mine bag
GEM_BAG_STANDARD = {
    "Ruby": 8,
    "Sapphire": 8,
    "Emerald": 8,
    "Diamond": 4,
    "Amethyst": 6,
    "Quartz": 10,
    "Obsidian": 6,
}

GEM_BAG_HARD = {
    "Ruby": 7,
    "Sapphire": 7,
    "Emerald": 7,
    "Diamond": 3,
    "Amethyst": 5,
    "Quartz": 9,
    "Obsidian": 8,
}

GEM_ICONS = {
    "Ruby": "(R)",
    "Sapphire": "(S)",
    "Emerald": "(E)",
    "Diamond": "(D)",
    "Amethyst": "(A)",
    "Quartz": "(Q)",
    "Obsidian": "(X)",
}

# Jewelry recipes
RECIPES = {
    "Ring": {
        "description": "2 matching gems",
        "points": 3,
        "check": lambda gems: _check_ring(gems),
    },
    "Necklace": {
        "description": "3 different gems",
        "points": 5,
        "check": lambda gems: _check_necklace(gems),
    },
    "Crown": {
        "description": "5 gems with 3+ types",
        "points": 10,
        "check": lambda gems: _check_crown(gems),
    },
}

SAFE_GEMS = ["Ruby", "Sapphire", "Emerald", "Diamond", "Amethyst", "Quartz"]


def _check_ring(gems):
    """Check if gems can make a Ring (2 matching gems)."""
    if len(gems) != 2:
        return False
    return gems[0] == gems[1] and gems[0] in SAFE_GEMS


def _check_necklace(gems):
    """Check if gems can make a Necklace (3 different gems)."""
    if len(gems) != 3:
        return False
    return len(set(gems)) == 3 and all(g in SAFE_GEMS for g in gems)


def _check_crown(gems):
    """Check if gems can make a Crown (5 gems with 3+ types)."""
    if len(gems) != 5:
        return False
    return len(set(gems)) >= 3 and all(g in SAFE_GEMS for g in gems)


def _recipe_check(recipe_name, gems):
    """Check a recipe without lambdas."""
    if recipe_name == "Ring":
        return _check_ring(gems)
    elif recipe_name == "Necklace":
        return _check_necklace(gems)
    elif recipe_name == "Crown":
        return _check_crown(gems)
    return False


class GemRushGame(BaseGame):
    """Gem Rush - cooperative gem mining and crafting."""

    name = "Gem Rush"
    description = "Mine gems and craft jewelry together (co-op)"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard difficulty - reach 30 points to win",
        "hard": "Hard difficulty - reach 40 points with more Obsidian",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.target_score = 30 if self.variation == "standard" else 40
        self.mine_bag = []
        self.hands = {1: [], 2: []}  # gems in hand (at risk of cave-in)
        self.banked_gems = {1: [], 2: []}  # safely stored gems
        self.jewelry = []  # completed jewelry (shared score)
        self.total_score = 0
        self.cave_ins = 0
        self.mine_exhausted = False
        self.log = []

    def setup(self):
        """Initialize the game."""
        bag_def = GEM_BAG_STANDARD if self.variation == "standard" else GEM_BAG_HARD
        self.mine_bag = []
        for gem, count in bag_def.items():
            self.mine_bag.extend([gem] * count)
        random.shuffle(self.mine_bag)
        self.log.append(f"The mine is open! {len(self.mine_bag)} gems await.")
        self.log.append(f"Target: {self.target_score} points of jewelry.")

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 58)
        print(f"  GEM RUSH - Co-op Mining & Crafting")
        print("=" * 58)
        print(f"  Mine: {len(self.mine_bag)} gems remaining")
        print(f"  Score: {self.total_score}/{self.target_score} points")
        print(f"  Cave-ins: {self.cave_ins}")
        print("-" * 58)

        # Completed jewelry
        if self.jewelry:
            print("  Completed Jewelry:")
            for j in self.jewelry:
                print(f"    {j['name']}: {j['points']} pts ({', '.join(j['gems'])})")
        else:
            print("  Completed Jewelry: (none yet)")
        print("-" * 58)

        # Both players
        for pp in [p, opp]:
            marker = ">>" if pp == p else "  "
            print(f"  {marker} {self.players[pp-1]}:")
            print(f"       Hand: ", end="")
            if self.hands[pp]:
                for g in self.hands[pp]:
                    print(f"{GEM_ICONS.get(g, g)} ", end="")
                print()
            else:
                print("(empty)")
            print(f"       Bank: ", end="")
            if self.banked_gems[pp]:
                counts = {}
                for g in self.banked_gems[pp]:
                    counts[g] = counts.get(g, 0) + 1
                for g, c in counts.items():
                    print(f"{GEM_ICONS.get(g, g)}x{c} ", end="")
                print()
            else:
                print("(empty)")

        print("-" * 58)

        # Recipes reference
        print("  Recipes:")
        print("    Ring     = 2 matching gems          (3 pts)")
        print("    Necklace = 3 different gems          (5 pts)")
        print("    Crown    = 5 gems, 3+ types         (10 pts)")

        print("-" * 58)
        if self.log:
            for line in self.log[-4:]:
                print(f"  {line}")
        print("=" * 58)

    def get_move(self):
        """Get a move from the current player."""
        print("\n  Actions:")
        print("    [M]ine  - Draw a gem from the mine")
        print("    [B]ank  - Store hand gems safely (end mining)")
        print("    [C]raft - Craft jewelry from banked gems")
        print("    [G]ive  - Give banked gems to partner")
        if not self.mine_bag and not self.hands[self.current_player]:
            print("    [P]ass  - Pass turn")

        choice = input_with_quit("\n  Choose action: ").strip().upper()

        if choice in ("M", "MINE"):
            return "mine"
        elif choice in ("B", "BANK"):
            return "bank"
        elif choice in ("C", "CRAFT"):
            return self._get_craft_move()
        elif choice in ("G", "GIVE"):
            return self._get_give_move()
        elif choice in ("P", "PASS"):
            return "pass"
        return None

    def _get_craft_move(self):
        """Get crafting details."""
        p = self.current_player
        all_banked = self.banked_gems[p]
        safe_banked = [g for g in all_banked if g in SAFE_GEMS]
        if not safe_banked:
            print("  No banked gems to craft with!")
            input_with_quit("  Press Enter...")
            return None

        print(f"\n  Your banked gems: ", end="")
        for i, g in enumerate(safe_banked):
            print(f"{i+1}.{GEM_ICONS.get(g, g)} ", end="")
        print()

        print("  What to craft? (Ring/Necklace/Crown)")
        recipe_name = input_with_quit("  Recipe: ").strip().capitalize()
        if recipe_name not in RECIPES:
            print("  Unknown recipe.")
            return None

        recipe = RECIPES[recipe_name]
        print(f"  {recipe_name}: {recipe['description']}")
        print("  Select gems (comma-separated numbers):")
        choice = input_with_quit("  Gems: ").strip()
        try:
            indices = [int(x.strip()) - 1 for x in choice.split(",")]
            selected = []
            for idx in indices:
                if 0 <= idx < len(safe_banked):
                    selected.append(safe_banked[idx])
                else:
                    print("  Invalid gem number.")
                    return None
            return ("craft", recipe_name, selected, indices)
        except ValueError:
            print("  Enter numbers separated by commas.")
            return None

    def _get_give_move(self):
        """Get give details."""
        p = self.current_player
        opp = 2 if p == 1 else 1
        safe_banked = [g for g in self.banked_gems[p] if g in SAFE_GEMS]
        if not safe_banked:
            print("  No banked gems to give!")
            input_with_quit("  Press Enter...")
            return None

        print(f"\n  Your banked gems: ", end="")
        for i, g in enumerate(safe_banked):
            print(f"{i+1}.{GEM_ICONS.get(g, g)} ", end="")
        print()
        choice = input_with_quit(f"  Give which gem to {self.players[opp-1]}? (number): ").strip()
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(safe_banked):
                return ("give", safe_banked[idx], idx)
            else:
                print("  Invalid choice.")
                return None
        except ValueError:
            print("  Enter a number.")
            return None

    def make_move(self, move):
        """Apply a move to the game state."""
        if move is None:
            return False

        p = self.current_player
        opp = 2 if p == 1 else 1
        self.log = []

        if move == "mine":
            if not self.mine_bag:
                self.log.append("The mine is exhausted!")
                return False
            gem = self.mine_bag.pop()
            self.log.append(f"{self.players[p-1]} mines: {gem} {GEM_ICONS.get(gem, '')}")

            if gem == "Obsidian":
                self.cave_ins += 1
                self.log.append(f"CAVE-IN! {self.players[p-1]} loses all hand gems!")
                lost = len(self.hands[p])
                self.hands[p] = []
                self.log.append(f"  {lost} gem(s) lost in the collapse!")
            else:
                self.hands[p].append(gem)
                self.log.append(f"  {self.players[p-1]} now has {len(self.hands[p])} gem(s) in hand.")
            return True

        elif move == "bank":
            if not self.hands[p]:
                self.log.append("No gems in hand to bank.")
                return False
            count = len(self.hands[p])
            for g in self.hands[p]:
                if g in SAFE_GEMS:
                    self.banked_gems[p].append(g)
            self.hands[p] = []
            self.log.append(f"{self.players[p-1]} banks {count} gem(s) safely.")
            return True

        elif move == "pass":
            self.log.append(f"{self.players[p-1]} passes.")
            return True

        elif isinstance(move, tuple) and move[0] == "craft":
            _, recipe_name, selected_gems, indices = move
            if not _recipe_check(recipe_name, selected_gems):
                self.log.append(f"Invalid recipe! {recipe_name} requires: "
                              f"{RECIPES[recipe_name]['description']}")
                return False
            # Remove gems from bank (remove from end to preserve indices)
            safe_banked = [g for g in self.banked_gems[p] if g in SAFE_GEMS]
            sorted_indices = sorted(indices, reverse=True)
            for idx in sorted_indices:
                if 0 <= idx < len(safe_banked):
                    gem = safe_banked[idx]
                    self.banked_gems[p].remove(gem)

            points = RECIPES[recipe_name]["points"]
            self.jewelry.append({
                "name": recipe_name,
                "gems": list(selected_gems),
                "points": points,
                "crafter": p,
            })
            self.total_score += points
            self.log.append(f"{self.players[p-1]} crafts a {recipe_name} for {points} pts!")
            self.log.append(f"  Team score: {self.total_score}/{self.target_score}")
            return True

        elif isinstance(move, tuple) and move[0] == "give":
            _, gem, idx = move
            safe_banked = [g for g in self.banked_gems[p] if g in SAFE_GEMS]
            if 0 <= idx < len(safe_banked):
                actual_gem = safe_banked[idx]
                self.banked_gems[p].remove(actual_gem)
                self.banked_gems[opp].append(actual_gem)
                self.log.append(f"{self.players[p-1]} gives {actual_gem} to {self.players[opp-1]}.")
                return True
            return False

        return False

    def check_game_over(self):
        """Check if the game is over."""
        # Win: reached target score
        if self.total_score >= self.target_score:
            self.game_over = True
            self.winner = 1  # Co-op win (both win)
            self.log.append("VICTORY! You reached the target score!")
            return

        # Lose: mine exhausted and no one can craft
        if not self.mine_bag:
            can_act = False
            for pp in [1, 2]:
                if self.hands[pp]:
                    can_act = True
                safe_banked = [g for g in self.banked_gems[pp] if g in SAFE_GEMS]
                if len(safe_banked) >= 2:
                    can_act = True
            if not can_act:
                self.game_over = True
                self.winner = None  # Co-op loss
                self.log.append(f"DEFEAT! Mine exhausted. Final score: "
                              f"{self.total_score}/{self.target_score}")

    def get_state(self):
        """Return serializable game state."""
        # Convert jewelry to serializable format (no lambdas)
        jewelry_data = []
        for j in self.jewelry:
            jewelry_data.append({
                "name": j["name"],
                "gems": j["gems"],
                "points": j["points"],
                "crafter": j["crafter"],
            })
        return {
            "target_score": self.target_score,
            "mine_bag": self.mine_bag,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "banked_gems": {"1": self.banked_gems[1], "2": self.banked_gems[2]},
            "jewelry": jewelry_data,
            "total_score": self.total_score,
            "cave_ins": self.cave_ins,
            "log": self.log,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.target_score = state["target_score"]
        self.mine_bag = state["mine_bag"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.banked_gems = {1: state["banked_gems"]["1"], 2: state["banked_gems"]["2"]}
        self.jewelry = state["jewelry"]
        self.total_score = state["total_score"]
        self.cave_ins = state["cave_ins"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
============================================================
  GEM RUSH - Tutorial (Cooperative)
============================================================

  OVERVIEW:
  Work together to mine gems and craft jewelry!
  Reach the target score before the mine runs out.

  THE MINE:
  Draw gems from the mine bag. You'll find:
    (R) Ruby    (S) Sapphire   (E) Emerald
    (D) Diamond (A) Amethyst   (Q) Quartz
    (X) OBSIDIAN - Causes cave-ins!

  CAVE-INS:
  Drawing Obsidian causes a cave-in! You lose ALL gems
  currently in your hand (not banked gems).

  ACTIONS PER TURN:
  [M]ine  - Draw a gem from the mine (risky!)
  [B]ank  - Move all hand gems to your safe bank
  [C]raft - Use banked gems to make jewelry
  [G]ive  - Transfer a banked gem to your partner

  JEWELRY RECIPES:
  Ring     = 2 matching gems          =  3 points
  Necklace = 3 different gems          =  5 points
  Crown    = 5 gems with 3+ types     = 10 points

  STRATEGY:
  - Don't get greedy! Bank gems before a cave-in
  - Coordinate with your partner on who crafts what
  - Crowns are efficient but risky to collect for
  - Give gems to your partner to complete recipes
  - Obsidian gets more dangerous as the mine empties

  Standard: 30 pts to win | Hard: 40 pts to win
============================================================
"""
