"""Orc-lympics - Competitive event dice game with unique event mechanics."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


DICE_ART = {
    1: ["+-----+", "|     |", "|  *  |", "|     |", "+-----+"],
    2: ["+-----+", "| *   |", "|     |", "|   * |", "+-----+"],
    3: ["+-----+", "| *   |", "|  *  |", "|   * |", "+-----+"],
    4: ["+-----+", "| * * |", "|     |", "| * * |", "+-----+"],
    5: ["+-----+", "| * * |", "|  *  |", "| * * |", "+-----+"],
    6: ["+-----+", "| * * |", "| * * |", "| * * |", "+-----+"],
}

STANDARD_EVENTS = [
    {
        "name": "Rock Throw",
        "desc": "Roll 3d6. Highest total distance wins.",
        "dice": 3,
        "sides": 6,
        "mechanic": "total",
        "rerolls": 1,
    },
    {
        "name": "Mud Wrestling",
        "desc": "Roll 4d6. Most matching dice (pairs/trips/quads) wins. Tiebreak by highest match value.",
        "dice": 4,
        "sides": 6,
        "mechanic": "matches",
        "rerolls": 1,
    },
    {
        "name": "Boar Racing",
        "desc": "Roll 2d6 three times (3 laps). Total across all laps wins. Can re-roll one lap.",
        "dice": 2,
        "sides": 6,
        "mechanic": "laps",
        "rerolls": 1,
    },
    {
        "name": "Troll Toss",
        "desc": "Roll 5d6. Only count dice showing 4+. Most qualifying dice wins, tiebreak by sum.",
        "dice": 5,
        "sides": 6,
        "mechanic": "threshold",
        "rerolls": 2,
    },
    {
        "name": "Barrel Roll",
        "desc": "Roll 3d6. Must get a straight (consecutive numbers). Score = highest value in straight. No straight = 0.",
        "dice": 3,
        "sides": 6,
        "mechanic": "straight",
        "rerolls": 2,
    },
]

EXTRA_EVENTS = [
    {
        "name": "Goblin Sprint",
        "desc": "Roll 2d6 repeatedly until you stop or bust (roll doubles). Total of non-bust rolls wins.",
        "dice": 2,
        "sides": 6,
        "mechanic": "push_luck",
        "rerolls": 0,
    },
    {
        "name": "Dragon Dodge",
        "desc": "Roll 4d6. Remove lowest die. Remaining total minus any 1s penalty. Highest wins.",
        "dice": 4,
        "sides": 6,
        "mechanic": "drop_lowest",
        "rerolls": 1,
    },
]


def render_dice_row(dice_values):
    """Render a row of dice as ASCII art."""
    lines = ["", "", "", "", ""]
    for val in dice_values:
        art = DICE_ART.get(val, DICE_ART[1])
        for i in range(5):
            lines[i] += " " + art[i]
    return "\n".join("    " + line for line in lines)


def score_matches(dice):
    """Score based on matching dice. Returns (max_match_count, match_value, total)."""
    counts = {}
    for d in dice:
        counts[d] = counts.get(d, 0) + 1
    max_count = max(counts.values())
    # Find highest value with max_count
    best_val = max(v for v, c in counts.items() if c == max_count)
    return max_count * 10 + best_val  # composite score


def score_threshold(dice, threshold=4):
    """Score dice above threshold. Returns (qualifying_count, qualifying_sum)."""
    qualifying = [d for d in dice if d >= threshold]
    return len(qualifying) * 100 + sum(qualifying)


def find_straight(dice):
    """Find longest consecutive run in dice. Returns highest value in longest straight."""
    unique = sorted(set(dice))
    if len(unique) < 2:
        return 0
    best_run = 1
    current_run = 1
    best_high = unique[0]
    for i in range(1, len(unique)):
        if unique[i] == unique[i - 1] + 1:
            current_run += 1
            if current_run >= best_run:
                best_run = current_run
                best_high = unique[i]
        else:
            current_run = 1
    if best_run >= 3:
        return best_high
    elif best_run >= 2:
        return best_high  # partial straight still scores something
    return 0


class OrcLympicsGame(BaseGame):
    """Orc-lympics: Compete in wild events using dice mechanics."""

    name = "Orc-lympics"
    description = "Competitive dice game with unique event mechanics and re-rolls"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "5 classic events",
        "tournament": "7 events including Goblin Sprint and Dragon Dodge",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.events = []
        self.current_event_idx = 0
        self.medals = [0, 0]  # medals per player
        self.total_scores = [0, 0]  # total scores across events for tiebreak
        self.event_results = []  # list of {event, scores: [p1, p2], winner}
        self.event_phase = "rolling"  # "rolling", "rerolling", "done"
        self.current_dice = []
        self.rerolls_left = 0
        self.player_event_scores = [0, 0]  # scores for current event
        self.current_event_player = 0  # which player is rolling (0 or 1)
        self.lap_scores = []  # for Boar Racing
        self.push_luck_total = 0  # for Goblin Sprint
        self.push_luck_busted = False

    def setup(self):
        if self.variation == "tournament":
            self.events = [dict(e) for e in STANDARD_EVENTS + EXTRA_EVENTS]
        else:
            self.events = [dict(e) for e in STANDARD_EVENTS]
        random.shuffle(self.events)
        self.current_event_idx = 0
        self.medals = [0, 0]
        self.total_scores = [0, 0]
        self.event_results = []
        self.player_event_scores = [0, 0]
        self.current_event_player = 0
        self._setup_event()

    def _setup_event(self):
        """Set up the current event for the first player."""
        self.current_event_player = 0
        self.player_event_scores = [0, 0]
        self.event_phase = "rolling"
        self.current_dice = []
        self.lap_scores = []
        self.push_luck_total = 0
        self.push_luck_busted = False
        event = self.events[self.current_event_idx]
        self.rerolls_left = event["rerolls"]

    def display(self):
        clear_screen()
        event = self.events[self.current_event_idx]
        print(f"{'=' * 60}")
        print(f"  ORC-LYMPICS - Event {self.current_event_idx + 1}/{len(self.events)}")
        print(f"{'=' * 60}")

        # Medal standings
        print(f"\n  Medal Standings:")
        for pi in range(2):
            marker = " <--" if pi == self.current_event_player else ""
            print(f"    {self.players[pi]}: {self.medals[pi]} medals "
                  f"(total: {self.total_scores[pi]}){marker}")

        # Previous event results
        if self.event_results:
            print(f"\n  Previous Events:")
            for res in self.event_results:
                winner_str = res["winner"] if res["winner"] else "Tie"
                print(f"    {res['event']}: {res['scores'][0]} vs {res['scores'][1]} -> {winner_str}")

        # Current event
        print(f"\n  {'*' * 40}")
        print(f"  Current Event: {event['name']}")
        print(f"  {event['desc']}")
        print(f"  {'*' * 40}")

        p = self.current_event_player
        print(f"\n  {self.players[p]}'s turn to compete!")

        if self.current_dice:
            print(f"\n  Your dice:")
            print(render_dice_row(self.current_dice))
            vals = ", ".join(str(d) for d in self.current_dice)
            print(f"    Values: [{vals}]  Total: {sum(self.current_dice)}")

        if event["mechanic"] == "laps" and self.lap_scores:
            print(f"\n  Lap scores: {self.lap_scores}")
            print(f"  Running total: {sum(self.lap_scores)}")

        if event["mechanic"] == "push_luck":
            print(f"\n  Running total: {self.push_luck_total}")
            if self.push_luck_busted:
                print(f"  BUSTED! Score: 0")

        if self.rerolls_left > 0 and self.event_phase == "rerolling":
            print(f"\n  Re-rolls remaining: {self.rerolls_left}")

        # Show other player's score if they've already gone
        if self.current_event_player == 1:
            print(f"\n  {self.players[0]}'s score: {self.player_event_scores[0]}")

        print(f"\n{'=' * 60}")

    def get_move(self):
        event = self.events[self.current_event_idx]
        mechanic = event["mechanic"]

        if self.event_phase == "rolling":
            if mechanic == "laps":
                lap_num = len(self.lap_scores) + 1
                print(f"  Lap {lap_num}/3 - Press Enter to roll {event['dice']}d{event['sides']}!")
                input_with_quit("  > ")
                return ("roll_lap", "")
            elif mechanic == "push_luck":
                if self.push_luck_busted:
                    input_with_quit("  Press Enter to continue...")
                    return ("push_done", "")
                if self.push_luck_total > 0:
                    print(f"  (r)oll again or (s)top and keep {self.push_luck_total}?")
                    choice = input_with_quit("  > ").strip().lower()
                    if choice in ("s", "stop"):
                        return ("push_stop", "")
                    return ("push_roll", "")
                else:
                    print(f"  Press Enter to roll!")
                    input_with_quit("  > ")
                    return ("push_roll", "")
            else:
                print(f"  Press Enter to roll {event['dice']}d{event['sides']}!")
                input_with_quit("  > ")
                return ("roll", "")

        elif self.event_phase == "rerolling":
            if self.rerolls_left <= 0:
                return ("done_rerolling", "")
            if mechanic == "laps":
                print(f"  Re-roll a lap? Enter lap number (1-3) or 'k' to keep:")
                choice = input_with_quit("  > ").strip().lower()
                if choice in ("k", "keep", "n", "no"):
                    return ("keep_laps", "")
                return ("reroll_lap", choice)
            else:
                print(f"  Re-roll which dice? Enter positions (e.g., '1 3') or 'k' to keep all:")
                choice = input_with_quit("  > ").strip().lower()
                if choice in ("k", "keep", "n", "no"):
                    return ("keep", "")
                return ("reroll", choice)

        elif self.event_phase == "done":
            input_with_quit("  Press Enter to continue...")
            return ("next", "")

        return ("invalid", "")

    def _roll_dice(self, count, sides):
        return [random.randint(1, sides) for _ in range(count)]

    def _calculate_event_score(self, event, dice, lap_scores=None, push_total=0):
        """Calculate score for an event given the dice/results."""
        mechanic = event["mechanic"]
        if mechanic == "total":
            return sum(dice)
        elif mechanic == "matches":
            return score_matches(dice)
        elif mechanic == "threshold":
            return score_threshold(dice)
        elif mechanic == "straight":
            return find_straight(dice)
        elif mechanic == "laps":
            return sum(lap_scores) if lap_scores else 0
        elif mechanic == "push_luck":
            return push_total
        elif mechanic == "drop_lowest":
            sorted_dice = sorted(dice)
            kept = sorted_dice[1:]  # drop lowest
            ones_penalty = sum(1 for d in kept if d == 1) * 2
            return sum(kept) - ones_penalty
        return 0

    def make_move(self, move):
        action, data = move
        event = self.events[self.current_event_idx]
        p = self.current_event_player

        if action == "roll":
            self.current_dice = self._roll_dice(event["dice"], event["sides"])
            if event["rerolls"] > 0:
                self.event_phase = "rerolling"
                self.rerolls_left = event["rerolls"]
            else:
                score = self._calculate_event_score(event, self.current_dice)
                self.player_event_scores[p] = score
                self._advance_player()
            return True

        elif action == "roll_lap":
            lap_dice = self._roll_dice(event["dice"], event["sides"])
            self.current_dice = lap_dice
            lap_total = sum(lap_dice)
            self.lap_scores.append(lap_total)
            if len(self.lap_scores) >= 3:
                if event["rerolls"] > 0:
                    self.event_phase = "rerolling"
                    self.rerolls_left = event["rerolls"]
                else:
                    score = self._calculate_event_score(event, [], self.lap_scores)
                    self.player_event_scores[p] = score
                    self._advance_player()
            return True

        elif action == "push_roll":
            dice = self._roll_dice(event["dice"], event["sides"])
            self.current_dice = dice
            if dice[0] == dice[1]:  # doubles = bust
                self.push_luck_busted = True
                self.push_luck_total = 0
                self.event_phase = "rolling"  # will show bust message
            else:
                self.push_luck_total += sum(dice)
            return True

        elif action == "push_stop":
            self.player_event_scores[p] = self.push_luck_total
            self._advance_player()
            return True

        elif action == "push_done":
            self.player_event_scores[p] = 0
            self._advance_player()
            return True

        elif action == "reroll":
            try:
                indices = [int(x) - 1 for x in data.split()]
                for idx in indices:
                    if idx < 0 or idx >= len(self.current_dice):
                        return False
                for idx in indices:
                    self.current_dice[idx] = random.randint(1, event["sides"])
                self.rerolls_left -= 1
                if self.rerolls_left <= 0:
                    score = self._calculate_event_score(event, self.current_dice)
                    self.player_event_scores[p] = score
                    self._advance_player()
            except (ValueError, IndexError):
                return False
            return True

        elif action == "reroll_lap":
            try:
                lap_idx = int(data) - 1
                if lap_idx < 0 or lap_idx >= len(self.lap_scores):
                    return False
                new_dice = self._roll_dice(event["dice"], event["sides"])
                self.current_dice = new_dice
                self.lap_scores[lap_idx] = sum(new_dice)
                self.rerolls_left -= 1
                if self.rerolls_left <= 0:
                    score = self._calculate_event_score(event, [], self.lap_scores)
                    self.player_event_scores[p] = score
                    self._advance_player()
            except (ValueError, IndexError):
                return False
            return True

        elif action in ("keep", "keep_laps", "done_rerolling"):
            if event["mechanic"] == "laps":
                score = self._calculate_event_score(event, [], self.lap_scores)
            else:
                score = self._calculate_event_score(event, self.current_dice)
            self.player_event_scores[p] = score
            self._advance_player()
            return True

        elif action == "next":
            return True

        return False

    def _advance_player(self):
        """Move to next player or finish event."""
        if self.current_event_player == 0:
            # Player 2's turn
            self.current_event_player = 1
            self.event_phase = "rolling"
            self.current_dice = []
            self.lap_scores = []
            self.push_luck_total = 0
            self.push_luck_busted = False
            event = self.events[self.current_event_idx]
            self.rerolls_left = event["rerolls"]
        else:
            # Both done - determine winner
            event = self.events[self.current_event_idx]
            s0, s1 = self.player_event_scores
            self.total_scores[0] += s0
            self.total_scores[1] += s1

            if s0 > s1:
                winner_name = self.players[0]
                self.medals[0] += 1
            elif s1 > s0:
                winner_name = self.players[1]
                self.medals[1] += 1
            else:
                winner_name = None

            self.event_results.append({
                "event": event["name"],
                "scores": [s0, s1],
                "winner": winner_name,
            })

            self.event_phase = "done"

    def check_game_over(self):
        # After finishing an event, move to next
        if self.event_phase == "done":
            self.current_event_idx += 1
            if self.current_event_idx >= len(self.events):
                self.game_over = True
                # Determine overall winner
                if self.medals[0] > self.medals[1]:
                    self.winner = 1
                elif self.medals[1] > self.medals[0]:
                    self.winner = 2
                else:
                    # Tiebreak by total score
                    if self.total_scores[0] > self.total_scores[1]:
                        self.winner = 1
                    elif self.total_scores[1] > self.total_scores[0]:
                        self.winner = 2
                    else:
                        self.winner = None
            else:
                self._setup_event()

    def switch_player(self):
        """Override - we handle player switching internally."""
        pass

    def get_state(self):
        return {
            "events": self.events,
            "current_event_idx": self.current_event_idx,
            "medals": self.medals,
            "total_scores": self.total_scores,
            "event_results": self.event_results,
            "event_phase": self.event_phase,
            "current_dice": self.current_dice,
            "rerolls_left": self.rerolls_left,
            "player_event_scores": self.player_event_scores,
            "current_event_player": self.current_event_player,
            "lap_scores": self.lap_scores,
            "push_luck_total": self.push_luck_total,
            "push_luck_busted": self.push_luck_busted,
        }

    def load_state(self, state):
        self.events = state["events"]
        self.current_event_idx = state["current_event_idx"]
        self.medals = state["medals"]
        self.total_scores = state["total_scores"]
        self.event_results = state["event_results"]
        self.event_phase = state["event_phase"]
        self.current_dice = state["current_dice"]
        self.rerolls_left = state["rerolls_left"]
        self.player_event_scores = state["player_event_scores"]
        self.current_event_player = state["current_event_player"]
        self.lap_scores = state["lap_scores"]
        self.push_luck_total = state["push_luck_total"]
        self.push_luck_busted = state["push_luck_busted"]

    def get_tutorial(self):
        return """
====================================
  ORC-LYMPICS - Tutorial
====================================

OVERVIEW:
  Compete in a series of wild orc sporting events!
  Each event uses unique dice mechanics.
  Win an event to earn a medal. Most medals wins!

EVENTS:
  Rock Throw     - Roll 3d6. Highest total wins.
  Mud Wrestling  - Roll 4d6. Most matching dice wins.
  Boar Racing    - Roll 2d6 for 3 laps. Best total wins.
  Troll Toss     - Roll 5d6. Count dice showing 4+.
  Barrel Roll    - Roll 3d6. Find a straight (consecutive numbers).

TOURNAMENT EXTRA EVENTS:
  Goblin Sprint  - Roll 2d6 repeatedly. Stop or bust on doubles!
  Dragon Dodge   - Roll 4d6, drop lowest, minus penalty for 1s.

RE-ROLLS:
  Most events give you 1-2 re-rolls.
  Choose which dice to re-roll by entering their positions.
  Or keep all dice with 'k'.

WINNING:
  Most medals after all events wins.
  Tiebreak: highest total score across all events.

COMMANDS:
  Type 'help' for controls, 'quit' to exit
"""
