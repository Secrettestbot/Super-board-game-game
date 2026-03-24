"""Kingsburg - Dice placement strategy game for 2-4 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Advisor definitions: number -> (name, resources granted)
# Resources: gold, wood, stone, soldiers
ADVISORS = {
    1:  ("Jester",        {"gold": 1}),
    2:  ("Squire",        {"wood": 1}),
    3:  ("Architect",     {"wood": 1, "gold": 1}),
    4:  ("Merchant",      {"gold": 2}),
    5:  ("Sergeant",      {"soldiers": 1}),
    6:  ("Alchemist",     {"gold": 2, "stone": 1}),
    7:  ("Astronomer",    {"wood": 1, "stone": 1}),
    8:  ("Treasurer",     {"gold": 3}),
    9:  ("Master Hunter", {"wood": 1, "gold": 1, "soldiers": 1}),
    10: ("General",       {"soldiers": 2}),
    11: ("Swordsmith",    {"gold": 1, "soldiers": 2}),
    12: ("Duchess",       {"gold": 2, "wood": 1, "stone": 1}),
    13: ("Champion",      {"soldiers": 3}),
    14: ("Smuggler",      {"gold": 3, "wood": 1}),
    15: ("Inventor",      {"gold": 2, "wood": 1, "stone": 1}),
    16: ("Wizard",        {"gold": 1, "stone": 2, "soldiers": 1}),
    17: ("Queen",         {"gold": 2, "wood": 2, "stone": 2}),
    18: ("King",          {"gold": 3, "wood": 1, "stone": 1, "soldiers": 1}),
}

# Buildings: name -> (cost, points, ability_description)
BUILDINGS = {
    "Guard Tower":    ({"wood": 1, "gold": 1}, 1, "+1 to defense"),
    "Palisade":       ({"wood": 2}, 1, "+1 to defense"),
    "Stable":         ({"wood": 1, "stone": 1}, 2, "+1 movement die"),
    "Chapel":         ({"stone": 2, "gold": 1}, 2, "+1 to advisor influence"),
    "Barracks":       ({"stone": 1, "wood": 1, "gold": 1}, 3, "+1 soldier each winter"),
    "Inn":            ({"stone": 2, "wood": 1}, 3, "Re-roll one die per season"),
    "Market":         ({"wood": 3, "gold": 1}, 4, "+2 gold each spring"),
    "Fortress":       ({"stone": 3, "wood": 2, "gold": 2}, 6, "+2 to defense, +2 VP"),
}

# Enemy threats per year (strength, penalty_description)
ENEMIES = [
    (3, "Lose 1 VP per building gap"),
    (4, "Lose 1 gold each"),
    (5, "Lose 1 building (cheapest)"),
    (6, "Lose 2 VP"),
    (7, "Lose all soldiers"),
]


class KingsburgGame(BaseGame):
    """Kingsburg - influence the king's advisors to build your province."""

    name = "Kingsburg"
    description = "Dice placement game - influence advisors, build your province"
    min_players = 2
    max_players = 4
    variations = {
        "standard": "Standard game (5 years)",
        "short": "Short game (3 years)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_players = 2
        self.max_years = 5
        self.current_year = 0
        self.current_season = 0  # 0=spring, 1=summer, 2=autumn, 3=winter
        self.season_names = ["Spring", "Summer", "Autumn", "Winter"]
        self.resources = {}
        self.buildings = {}
        self.soldiers = {}
        self.victory_points = {}
        self.dice_rolls = {}
        self.used_dice = {}
        self.claimed_advisors = {}  # advisor_num -> player who claimed
        self.phase = "roll"  # roll, place, build, battle
        self.log = []
        self.enemy_strength = 0

    def setup(self):
        self.num_players = len(self.players)
        if self.variation == "short":
            self.max_years = 3
        else:
            self.max_years = 5
        self.current_year = 1
        self.current_season = 0
        self.resources = {
            p: {"gold": 0, "wood": 0, "stone": 0}
            for p in range(1, self.num_players + 1)
        }
        self.buildings = {p: [] for p in range(1, self.num_players + 1)}
        self.soldiers = {p: 0 for p in range(1, self.num_players + 1)}
        self.victory_points = {p: 0 for p in range(1, self.num_players + 1)}
        self.dice_rolls = {}
        self.used_dice = {}
        self.claimed_advisors = {}
        self.phase = "roll"
        self.log = []
        self.enemy_strength = 0
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1
        self._start_season()

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 15:
            self.log = self.log[-15:]

    def _start_season(self):
        """Roll dice and prepare for a new season."""
        self.claimed_advisors = {}
        if self.current_season < 3:  # Spring, Summer, Autumn
            for p in range(1, self.num_players + 1):
                self.dice_rolls[p] = sorted(
                    [random.randint(1, 6) for _ in range(3)]
                )
                self.used_dice[p] = []
            # Market bonus in spring
            if self.current_season == 0:
                for p in range(1, self.num_players + 1):
                    if "Market" in self.buildings[p]:
                        self.resources[p]["gold"] += 2
                        self._add_log(f"{self.players[p-1]}: Market gives +2 gold")
            self.phase = "place"
            self.current_player = 1
        else:
            # Winter = battle phase
            idx = min(self.current_year - 1, len(ENEMIES) - 1)
            self.enemy_strength = ENEMIES[idx][0]
            self.phase = "battle"
            self.current_player = 1

    def _available_dice(self, player):
        """Return dice not yet used by this player."""
        used = list(self.used_dice.get(player, []))
        available = list(self.dice_rolls.get(player, []))
        for d in used:
            if d in available:
                available.remove(d)
        return available

    def _can_claim_advisor(self, player, advisor_num):
        """Check if player can claim advisor with their available dice."""
        if advisor_num in self.claimed_advisors:
            return False
        if advisor_num < 1 or advisor_num > 18:
            return False
        available = self._available_dice(player)
        return self._can_sum_to(available, advisor_num)

    def _can_sum_to(self, dice, target):
        """Check if any subset of dice sums to target."""
        if target == 0:
            return True
        if not dice or target < 0:
            return False
        # Try all subsets
        n = len(dice)
        for mask in range(1, 1 << n):
            s = sum(dice[i] for i in range(n) if mask & (1 << i))
            if s == target:
                return True
        return False

    def _find_dice_for_sum(self, dice, target):
        """Find a subset of dice that sums to target. Returns the subset."""
        n = len(dice)
        for mask in range(1, 1 << n):
            subset = [dice[i] for i in range(n) if mask & (1 << i)]
            if sum(subset) == target:
                return subset
        return []

    def _grant_resources(self, player, advisor_num):
        """Grant resources from an advisor to a player."""
        _, rewards = ADVISORS[advisor_num]
        for resource, amount in rewards.items():
            if resource == "soldiers":
                self.soldiers[player] += amount
            else:
                self.resources[player][resource] += amount

    def _can_build(self, player, building_name):
        """Check if player can afford a building."""
        if building_name in self.buildings[player]:
            return False
        if building_name not in BUILDINGS:
            return False
        cost, _, _ = BUILDINGS[building_name]
        for resource, amount in cost.items():
            if self.resources[player].get(resource, 0) < amount:
                return False
        return True

    def _do_build(self, player, building_name):
        """Build a building for the player."""
        cost, points, _ = BUILDINGS[building_name]
        for resource, amount in cost.items():
            self.resources[player][resource] -= amount
        self.buildings[player].append(building_name)
        self.victory_points[player] += points
        return points

    def _defense_bonus(self, player):
        """Calculate defense bonus from buildings."""
        bonus = 0
        if "Guard Tower" in self.buildings[player]:
            bonus += 1
        if "Palisade" in self.buildings[player]:
            bonus += 1
        if "Fortress" in self.buildings[player]:
            bonus += 2
        return bonus

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 60}")
        print(f"  KINGSBURG  Year {self.current_year}/{self.max_years} "
              f"- {self.season_names[self.current_season]}")
        print(f"{'=' * 60}")

        for p in range(1, self.num_players + 1):
            marker = " <<" if p == cp else ""
            r = self.resources[p]
            blds = ", ".join(self.buildings[p]) if self.buildings[p] else "none"
            print(f"\n  {self.players[p - 1]}{marker}:")
            print(f"    Resources: {r['gold']}G {r['wood']}W {r['stone']}S "
                  f"| Soldiers: {self.soldiers[p]} | VP: {self.victory_points[p]}")
            print(f"    Buildings: {blds}")
            if self.phase == "place" and p in self.dice_rolls:
                avail = self._available_dice(p)
                used = self.used_dice.get(p, [])
                print(f"    Dice: {avail} (used: {used})")

        if self.phase == "place":
            # Show claimed advisors
            claimed_str = ", ".join(
                f"{num}({ADVISORS[num][0]})->P{pl}"
                for num, pl in sorted(self.claimed_advisors.items())
            )
            if claimed_str:
                print(f"\n  Claimed advisors: {claimed_str}")

        if self.phase == "battle":
            print(f"\n  ENEMY STRENGTH: {self.enemy_strength}")
            idx = min(self.current_year - 1, len(ENEMIES) - 1)
            print(f"  Penalty if defeated: {ENEMIES[idx][1]}")

        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")
        print()

    # ---------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "place":
            return self._get_placement_move(cp)
        elif self.phase == "build":
            return self._get_build_move(cp)
        elif self.phase == "battle":
            input_with_quit("  Press Enter to resolve battle... ")
            return "battle"
        return None

    def _get_placement_move(self, cp):
        available = self._available_dice(cp)
        if not available:
            print("  No dice remaining. Type 'done'.")
            input_with_quit("  > ")
            return "done"

        # Check if any advisor can be claimed
        can_claim_any = False
        for adv in range(1, 19):
            if self._can_claim_advisor(cp, adv):
                can_claim_any = True
                break

        if not can_claim_any:
            print("  No advisors available with your remaining dice. Type 'done'.")
            input_with_quit("  > ")
            return "done"

        print(f"  Available dice: {available}")
        print("  Advisors (number -> name, rewards):")
        for num in range(1, 19):
            if num in self.claimed_advisors:
                continue
            name, rewards = ADVISORS[num]
            rew_str = ", ".join(f"{v} {k}" for k, v in rewards.items())
            can = "*" if self._can_claim_advisor(cp, num) else " "
            print(f"    {can} {num:2d}. {name:16s} -> {rew_str}")

        print("  Enter advisor number to claim, or 'done' to finish placing.")
        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "done":
                return "done"
            if move.isdigit():
                adv_num = int(move)
                if self._can_claim_advisor(cp, adv_num):
                    return f"claim {adv_num}"
                else:
                    if adv_num in self.claimed_advisors:
                        print("  That advisor is already claimed this season.")
                    elif adv_num < 1 or adv_num > 18:
                        print("  Advisor number must be 1-18.")
                    else:
                        print("  You can't sum your available dice to that number.")
                    continue
            print("  Enter an advisor number or 'done'.")

    def _get_build_move(self, cp):
        buildable = [b for b in BUILDINGS if self._can_build(cp, b)]
        if not buildable:
            print("  No buildings affordable. Type 'pass'.")
            input_with_quit("  > ")
            return "pass"

        print("  Buildings you can afford:")
        for i, b in enumerate(buildable, 1):
            cost, pts, ability = BUILDINGS[b]
            cost_str = ", ".join(f"{v}{k[0].upper()}" for k, v in cost.items())
            print(f"    {i}. {b} (Cost: {cost_str}, VP: {pts}) - {ability}")
        print("  Enter building number to build, or 'pass' to skip.")

        while True:
            move = input_with_quit("  > ").strip().lower()
            if move == "pass":
                return "pass"
            if move.isdigit():
                idx = int(move)
                if 1 <= idx <= len(buildable):
                    return f"build {buildable[idx - 1]}"
                print(f"  Enter 1-{len(buildable)} or 'pass'.")
                continue
            print("  Enter a number or 'pass'.")

    # ---------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "done":
            return True
        elif move == "pass":
            return True
        elif move.startswith("claim"):
            adv_num = int(move.split()[1])
            return self._do_claim(cp, adv_num)
        elif move.startswith("build"):
            building_name = move[6:]
            return self._do_build_action(cp, building_name)
        elif move == "battle":
            return self._do_battle()
        return False

    def _do_claim(self, cp, adv_num):
        """Claim an advisor."""
        available = self._available_dice(cp)
        dice_used = self._find_dice_for_sum(available, adv_num)
        if not dice_used:
            return False
        for d in dice_used:
            self.used_dice.setdefault(cp, []).append(d)
        self.claimed_advisors[adv_num] = cp
        self._grant_resources(cp, adv_num)
        name, _ = ADVISORS[adv_num]
        self._add_log(f"{self.players[cp-1]} claims {name} ({adv_num}) using dice {dice_used}")
        return True

    def _do_build_action(self, cp, building_name):
        if not self._can_build(cp, building_name):
            return False
        pts = self._do_build(cp, building_name)
        self._add_log(f"{self.players[cp-1]} builds {building_name} (+{pts} VP)")
        return True

    def _do_battle(self):
        """Resolve winter battle for all players."""
        idx = min(self.current_year - 1, len(ENEMIES) - 1)
        enemy_str = ENEMIES[idx][0]

        for p in range(1, self.num_players + 1):
            defense = self.soldiers[p] + self._defense_bonus(p)
            battle_die = random.randint(1, 6)
            total = defense + battle_die
            result = ""
            if total >= enemy_str:
                bonus_vp = max(0, total - enemy_str)
                self.victory_points[p] += bonus_vp
                result = f"WIN (+{bonus_vp} VP)"
            else:
                # Apply penalty
                self.victory_points[p] = max(0, self.victory_points[p] - 1)
                result = "DEFEATED (-1 VP)"
            self.soldiers[p] = max(0, self.soldiers[p] - 1)
            # Barracks bonus
            if "Barracks" in self.buildings[p]:
                self.soldiers[p] += 1
            self._add_log(
                f"{self.players[p-1]}: defense {defense}+die {battle_die}={total} "
                f"vs {enemy_str} -> {result}"
            )

        # Advance to next year
        self.current_year += 1
        if self.current_year > self.max_years:
            self.game_over = True
            best = max(
                range(1, self.num_players + 1),
                key=lambda p: self.victory_points[p]
            )
            self.winner = best
        else:
            self.current_season = 0
            self._start_season()
        return True

    def switch_player(self):
        """Handle turn/phase transitions."""
        if self.phase == "place":
            # Check if all players have placed (or are done)
            all_done = True
            next_p = self.current_player % self.num_players + 1
            for _ in range(self.num_players):
                avail = self._available_dice(next_p)
                can_any = any(
                    self._can_claim_advisor(next_p, a) for a in range(1, 19)
                )
                if avail and can_any:
                    self.current_player = next_p
                    all_done = False
                    break
                next_p = next_p % self.num_players + 1

            if all_done:
                # Move to build phase
                self.phase = "build"
                self.current_player = 1
        elif self.phase == "build":
            if self.current_player < self.num_players:
                self.current_player += 1
            else:
                # Advance season
                self.current_season += 1
                if self.current_season > 3:
                    # Winter battle handled separately
                    pass
                else:
                    self._start_season()
        elif self.phase == "battle":
            # Battle resolves all at once, no switch needed
            pass

    def check_game_over(self):
        if self.current_year > self.max_years:
            self.game_over = True
            best = max(
                range(1, self.num_players + 1),
                key=lambda p: self.victory_points[p]
            )
            self.winner = best

    def get_state(self):
        return {
            "num_players": self.num_players,
            "max_years": self.max_years,
            "current_year": self.current_year,
            "current_season": self.current_season,
            "resources": {str(k): v for k, v in self.resources.items()},
            "buildings": {str(k): v for k, v in self.buildings.items()},
            "soldiers": {str(k): v for k, v in self.soldiers.items()},
            "victory_points": {str(k): v for k, v in self.victory_points.items()},
            "dice_rolls": {str(k): v for k, v in self.dice_rolls.items()},
            "used_dice": {str(k): v for k, v in self.used_dice.items()},
            "claimed_advisors": {str(k): v for k, v in self.claimed_advisors.items()},
            "phase": self.phase,
            "log": list(self.log),
            "enemy_strength": self.enemy_strength,
        }

    def load_state(self, state):
        self.num_players = state["num_players"]
        self.max_years = state["max_years"]
        self.current_year = state["current_year"]
        self.current_season = state["current_season"]
        self.resources = {int(k): v for k, v in state["resources"].items()}
        self.buildings = {int(k): v for k, v in state["buildings"].items()}
        self.soldiers = {int(k): v for k, v in state["soldiers"].items()}
        self.victory_points = {int(k): v for k, v in state["victory_points"].items()}
        self.dice_rolls = {int(k): v for k, v in state["dice_rolls"].items()}
        self.used_dice = {int(k): v for k, v in state["used_dice"].items()}
        self.claimed_advisors = {int(k): v for k, v in state["claimed_advisors"].items()}
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.enemy_strength = state.get("enemy_strength", 0)

    def get_tutorial(self):
        years = "3" if self.variation == "short" else "5"
        return (
            f"\n{'=' * 60}\n"
            f"  KINGSBURG - Tutorial ({self.variation.title()})\n"
            f"{'=' * 60}\n\n"
            f"  OVERVIEW:\n"
            f"  Influence the King's advisors by placing dice to gain\n"
            f"  resources. Build buildings for points and abilities.\n"
            f"  Defend against enemies each winter. Play {years} years.\n\n"
            f"  SEASONS:\n"
            f"  Spring/Summer/Autumn: Roll 3 dice, place on advisors.\n"
            f"  Winter: Battle enemies with soldiers + building bonuses.\n\n"
            f"  ADVISORS (1-18):\n"
            f"  Each advisor has a number. Use 1+ dice that sum to that\n"
            f"  number to claim the advisor's resources. Each advisor can\n"
            f"  only be claimed by one player per season.\n"
            f"  Advisors marked with * are available to you.\n\n"
            f"  BUILDINGS:\n"
            f"  Spend resources to build. Each gives VP and a special\n"
            f"  ability. You can only build each building once.\n\n"
            f"  BATTLE:\n"
            f"  Each winter, an enemy attacks. Your defense = soldiers +\n"
            f"  building bonuses + a die roll. Beat the enemy strength\n"
            f"  to earn VP; lose to suffer penalties.\n\n"
            f"  COMMANDS:\n"
            f"  <number>     - Claim advisor by number\n"
            f"  'done'       - Finish placing dice\n"
            f"  <number>     - Build building by number\n"
            f"  'pass'       - Skip building\n"
            f"  'quit'       - Exit game\n"
            f"  'save'       - Save and suspend\n"
            f"  'help'       - Show help\n"
            f"  'tutorial'   - Show this tutorial\n"
            f"{'=' * 60}"
        )
