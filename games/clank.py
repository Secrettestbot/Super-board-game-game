"""Clank! - A deck-building dungeon delve adventure."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Card definitions: (name, cost, movement, attack, skill, clank, points, special)
STARTER_CARDS = [
    {"name": "Burgle", "cost": 0, "move": 0, "attack": 0, "skill": 1, "clank": 0, "points": 0},
    {"name": "Stumble", "cost": 0, "move": 0, "attack": 0, "skill": 0, "clank": 1, "points": 0},
    {"name": "Sidestep", "cost": 0, "move": 1, "attack": 0, "skill": 0, "clank": 0, "points": 0},
]

MARKET_CARDS = [
    {"name": "Move Boots", "cost": 3, "move": 2, "attack": 0, "skill": 0, "clank": 0, "points": 0},
    {"name": "Sneak", "cost": 2, "move": 1, "attack": 0, "skill": 1, "clank": -1, "points": 0},
    {"name": "Sword", "cost": 3, "move": 0, "attack": 2, "skill": 0, "clank": 0, "points": 0},
    {"name": "Dagger", "cost": 2, "move": 0, "attack": 1, "skill": 1, "clank": 0, "points": 0},
    {"name": "Treasure Map", "cost": 4, "move": 1, "attack": 0, "skill": 2, "clank": 0, "points": 2},
    {"name": "Pickpocket", "cost": 1, "move": 0, "attack": 0, "skill": 2, "clank": 0, "points": 0},
    {"name": "Sprint", "cost": 3, "move": 3, "attack": 0, "skill": 0, "clank": 1, "points": 0},
    {"name": "War Hammer", "cost": 5, "move": 0, "attack": 3, "skill": 0, "clank": 1, "points": 1},
    {"name": "Shadow Cloak", "cost": 4, "move": 1, "attack": 1, "skill": 1, "clank": -2, "points": 1},
    {"name": "Tunnel Guide", "cost": 3, "move": 2, "attack": 0, "skill": 1, "clank": 0, "points": 0},
    {"name": "Gem Cutter", "cost": 4, "move": 0, "attack": 0, "skill": 3, "clank": 0, "points": 2},
    {"name": "Rebel Scout", "cost": 2, "move": 1, "attack": 1, "skill": 0, "clank": 0, "points": 0},
    {"name": "Sleight of Hand", "cost": 1, "move": 0, "attack": 0, "skill": 2, "clank": 1, "points": 0},
    {"name": "Master Thief", "cost": 6, "move": 2, "attack": 2, "skill": 2, "clank": 0, "points": 3},
    {"name": "Dragon Lure", "cost": 0, "move": 0, "attack": 0, "skill": 3, "clank": 3, "points": 0},
    {"name": "Mithril Armor", "cost": 5, "move": 0, "attack": 1, "skill": 0, "clank": -2, "points": 2},
]

# Dungeon rooms: (name, depth, loot_value, has_monster, monster_attack, monster_loot)
DUNGEON_ROOMS = [
    {"name": "Entrance", "depth": 0, "loot": 0, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Crystal Cave", "depth": 1, "loot": 3, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Goblin Den", "depth": 1, "loot": 2, "monster": True, "m_atk": 1, "m_loot": 2},
    {"name": "Mushroom Grotto", "depth": 1, "loot": 4, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Troll Bridge", "depth": 2, "loot": 5, "monster": True, "m_atk": 2, "m_loot": 3},
    {"name": "Gem Vault", "depth": 2, "loot": 7, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Spider Nest", "depth": 2, "loot": 4, "monster": True, "m_atk": 2, "m_loot": 4},
    {"name": "Dragon's Hoard", "depth": 3, "loot": 10, "monster": True, "m_atk": 3, "m_loot": 5},
    {"name": "Ancient Treasury", "depth": 3, "loot": 12, "monster": False, "m_atk": 0, "m_loot": 0},
]

SUNKEN_ROOMS = [
    {"name": "Shore", "depth": 0, "loot": 0, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Coral Reef", "depth": 1, "loot": 3, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Eel Tunnel", "depth": 1, "loot": 2, "monster": True, "m_atk": 1, "m_loot": 2},
    {"name": "Pearl Beds", "depth": 1, "loot": 5, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Shark Cavern", "depth": 2, "loot": 4, "monster": True, "m_atk": 2, "m_loot": 3},
    {"name": "Sunken Temple", "depth": 2, "loot": 8, "monster": False, "m_atk": 0, "m_loot": 0},
    {"name": "Kraken Lair", "depth": 2, "loot": 5, "monster": True, "m_atk": 3, "m_loot": 5},
    {"name": "Leviathan Den", "depth": 3, "loot": 11, "monster": True, "m_atk": 3, "m_loot": 6},
    {"name": "Abyssal Vault", "depth": 3, "loot": 14, "monster": False, "m_atk": 0, "m_loot": 0},
]


class ClankGame(BaseGame):
    """Clank! A deck-building dungeon delve adventure."""

    name = "Clank!"
    description = "Deck-building dungeon delve - buy cards, grab loot, escape the dragon"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic dungeon delve with dragon attacks",
        "sunken": "Underwater theme with aquatic monsters",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.decks = [[], []]
        self.hands = [[], []]
        self.discard_piles = [[], []]
        self.positions = [0, 0]
        self.health = [10, 10]
        self.gold = [0, 0]
        self.loot = [[], []]
        self.clank_pool = [0, 0]
        self.dragon_bag = []
        self.market = []
        self.market_deck = []
        self.rooms = []
        self.rooms_looted = []
        self.escaped = [False, False]
        self.knocked_out = [False, False]
        self.phase = "play"  # play, move, buy, end_turn
        self.turn_move = 0
        self.turn_attack = 0
        self.turn_skill = 0
        self.turn_clank = 0
        self.cards_played = []
        self.dragon_attacks = 0

    def setup(self):
        """Initialize decks, dungeon, and market."""
        self.rooms = [dict(r) for r in (SUNKEN_ROOMS if self.variation == "sunken" else DUNGEON_ROOMS)]
        self.rooms_looted = [False] * len(self.rooms)
        # Build starter decks: 6 Burgle, 2 Stumble, 2 Sidestep
        for pi in range(2):
            deck = []
            for _ in range(6):
                deck.append(dict(STARTER_CARDS[0]))
            for _ in range(2):
                deck.append(dict(STARTER_CARDS[1]))
            for _ in range(2):
                deck.append(dict(STARTER_CARDS[2]))
            random.shuffle(deck)
            self.decks[pi] = deck
            self._draw_hand(pi)
        # Market deck
        self.market_deck = [dict(c) for c in MARKET_CARDS for _ in range(2)]
        random.shuffle(self.market_deck)
        self.market = [self.market_deck.pop() for _ in range(6) if self.market_deck]
        # Dragon bag starts with 24 black cubes (misses) and some dragon cubes
        self.dragon_bag = ["miss"] * 24 + ["hit"] * 6
        random.shuffle(self.dragon_bag)
        self.phase = "play"

    def _draw_hand(self, pi):
        """Draw 5 cards for player pi."""
        self.hands[pi] = []
        for _ in range(5):
            if not self.decks[pi]:
                self.decks[pi] = list(self.discard_piles[pi])
                self.discard_piles[pi] = []
                random.shuffle(self.decks[pi])
            if self.decks[pi]:
                self.hands[pi].append(self.decks[pi].pop())

    def _dragon_attack(self):
        """Resolve a dragon attack using clank cubes."""
        self.dragon_attacks += 1
        for pi in range(2):
            cubes_to_add = max(0, self.clank_pool[pi])
            for _ in range(cubes_to_add):
                self.dragon_bag.append(f"p{pi}")
            self.clank_pool[pi] = 0
        random.shuffle(self.dragon_bag)
        # Draw cubes equal to dragon rage (starts at 3, increases)
        draw_count = min(3 + self.dragon_attacks // 2, len(self.dragon_bag))
        hits = [0, 0]
        for _ in range(draw_count):
            if not self.dragon_bag:
                break
            cube = self.dragon_bag.pop()
            if cube == "p0":
                hits[0] += 1
            elif cube == "p1":
                hits[1] += 1
        for pi in range(2):
            if hits[pi] > 0:
                self.health[pi] -= hits[pi]
                if self.health[pi] <= 0:
                    self.health[pi] = 0
                    self.knocked_out[pi] = True

    def display(self):
        """Display dungeon, player status, hand, and market."""
        theme = "SUNKEN RUINS" if self.variation == "sunken" else "DUNGEON"
        print(f"\n{'='*60}")
        print(f"  CLANK! - {theme}  (Turn {self.turn_number + 1})")
        print(f"{'='*60}")
        # Dungeon map
        print(f"\n  --- {theme} MAP ---")
        for i, room in enumerate(self.rooms):
            marker = ""
            if self.positions[0] == i and self.positions[1] == i:
                marker = " [P1][P2]"
            elif self.positions[0] == i:
                marker = " [P1]"
            elif self.positions[1] == i:
                marker = " [P2]"
            looted = " (looted)" if self.rooms_looted[i] else ""
            mon = f" [Monster ATK:{room['m_atk']}]" if room["monster"] and not self.rooms_looted[i] else ""
            depth_bar = ">" * room["depth"]
            loot_str = f" Loot:{room['loot']}" if room["loot"] > 0 and not self.rooms_looted[i] else ""
            print(f"  {i}: {depth_bar} {room['name']}{loot_str}{mon}{looted}{marker}")
        # Player stats
        print(f"\n  --- PLAYER STATUS ---")
        for pi in range(2):
            status = "ESCAPED" if self.escaped[pi] else ("KO'd" if self.knocked_out[pi] else "Active")
            print(f"  P{pi+1}: HP:{self.health[pi]} Gold:{self.gold[pi]} "
                  f"Clank:{self.clank_pool[pi]} Pos:{self.rooms[self.positions[pi]]['name']} [{status}]")
            if self.loot[pi]:
                print(f"       Loot: {', '.join(self.loot[pi])}")
        # Current player hand
        pi = self.current_player - 1
        if not self.knocked_out[pi] and not self.escaped[pi]:
            print(f"\n  --- {self.players[self.current_player-1]}'s HAND ---")
            for j, card in enumerate(self.hands[pi]):
                parts = []
                if card["move"]:
                    parts.append(f"Mv:{card['move']}")
                if card["attack"]:
                    parts.append(f"Atk:{card['attack']}")
                if card["skill"]:
                    parts.append(f"Sk:{card['skill']}")
                if card["clank"] > 0:
                    parts.append(f"Clank:+{card['clank']}")
                elif card["clank"] < 0:
                    parts.append(f"Clank:{card['clank']}")
                print(f"    {j+1}. {card['name']} ({', '.join(parts)})")
            if self.cards_played:
                print(f"  Played: {', '.join(c['name'] for c in self.cards_played)}")
                print(f"  Totals - Move:{self.turn_move} Atk:{self.turn_attack} "
                      f"Skill:{self.turn_skill} Clank:{self.turn_clank}")
            # Market
            print(f"\n  --- MARKET (buy with Skill) ---")
            for j, card in enumerate(self.market):
                parts = []
                if card["move"]:
                    parts.append(f"Mv:{card['move']}")
                if card["attack"]:
                    parts.append(f"Atk:{card['attack']}")
                if card["skill"]:
                    parts.append(f"Sk:{card['skill']}")
                if card["points"]:
                    parts.append(f"Pts:{card['points']}")
                print(f"    {j+1}. {card['name']} Cost:{card['cost']} ({', '.join(parts)})")
        print(f"{'='*60}")

    def get_move(self):
        """Get player action."""
        pi = self.current_player - 1
        if self.knocked_out[pi] or self.escaped[pi]:
            input_with_quit("  (Auto-passing, press Enter) ")
            return "pass"
        print(f"\n  {self.players[self.current_player-1]}'s turn:")
        print("  Commands: play <#> | move <room#> | buy <#> | fight | end")
        return input_with_quit("  > ").strip().lower()

    def make_move(self, move):
        """Process a player action."""
        pi = self.current_player - 1
        if move == "pass":
            return True
        parts = move.split()
        if not parts:
            return False
        cmd = parts[0]

        if cmd == "play" and len(parts) == 2:
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.hands[pi]):
                return False
            card = self.hands[pi].pop(idx)
            self.cards_played.append(card)
            self.turn_move += card["move"]
            self.turn_attack += card["attack"]
            self.turn_skill += card["skill"]
            self.turn_clank += card["clank"]
            return True

        elif cmd == "move" and len(parts) == 2:
            try:
                target = int(parts[1])
            except ValueError:
                return False
            if target < 0 or target >= len(self.rooms):
                return False
            current = self.positions[pi]
            distance = abs(self.rooms[target]["depth"] - self.rooms[current]["depth"])
            if distance == 0:
                distance = 1
            if distance > self.turn_move:
                print("  Not enough movement points!")
                return False
            if target == current:
                return False
            self.turn_move -= distance
            self.positions[pi] = target
            room = self.rooms[target]
            # Auto-collect loot if available
            if room["loot"] > 0 and not self.rooms_looted[target]:
                if not room["monster"]:
                    self.gold[pi] += room["loot"]
                    self.loot[pi].append(f"{room['name']}({room['loot']}g)")
                    self.rooms_looted[target] = True
            # Deeper = more clank
            if room["depth"] >= 2:
                self.clank_pool[pi] += 1
            return True

        elif cmd == "fight":
            current = self.positions[pi]
            room = self.rooms[current]
            if not room["monster"] or self.rooms_looted[current]:
                print("  No monster here to fight!")
                return False
            if self.turn_attack < room["m_atk"]:
                print(f"  Need {room['m_atk']} attack, have {self.turn_attack}!")
                return False
            self.turn_attack -= room["m_atk"]
            self.gold[pi] += room["m_loot"]
            self.gold[pi] += room["loot"]
            self.loot[pi].append(f"{room['name']}({room['loot']+room['m_loot']}g)")
            self.rooms_looted[current] = True
            return True

        elif cmd == "buy" and len(parts) == 2:
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.market):
                return False
            card = self.market[idx]
            if self.turn_skill < card["cost"]:
                print(f"  Need {card['cost']} skill, have {self.turn_skill}!")
                return False
            self.turn_skill -= card["cost"]
            self.discard_piles[pi].append(self.market.pop(idx))
            if self.market_deck:
                self.market.append(self.market_deck.pop())
            return True

        elif cmd == "end":
            # Add clank to pool
            clank_added = max(0, self.turn_clank)
            self.clank_pool[pi] += clank_added
            # Check escape
            if self.positions[pi] == 0 and any(self.loot[pi]):
                self.escaped[pi] = True
                self.gold[pi] += 5  # escape bonus
            # Discard played cards and remaining hand
            self.discard_piles[pi].extend(self.cards_played)
            self.discard_piles[pi].extend(self.hands[pi])
            self.hands[pi] = []
            self.cards_played = []
            # Dragon attack every 3 turns
            if (self.turn_number + 1) % 3 == 0:
                self._dragon_attack()
            # Draw new hand
            self._draw_hand(pi)
            self.turn_move = 0
            self.turn_attack = 0
            self.turn_skill = 0
            self.turn_clank = 0
            return True

        return False

    def check_game_over(self):
        """Game ends when both escaped/KO'd or all loot taken."""
        both_done = all(self.escaped[i] or self.knocked_out[i] for i in range(2))
        all_looted = all(self.rooms_looted)
        if both_done or all_looted:
            self.game_over = True
            scores = [0, 0]
            for pi in range(2):
                scores[pi] = self.gold[pi]
                if self.escaped[pi]:
                    scores[pi] += 10
                # Card points
                for card in self.discard_piles[pi] + self.hands[pi] + self.decks[pi]:
                    scores[pi] += card.get("points", 0)
                if self.knocked_out[pi]:
                    scores[pi] = max(0, scores[pi] // 2)
            if scores[0] > scores[1]:
                self.winner = 1
            elif scores[1] > scores[0]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "decks": self.decks, "hands": self.hands, "discard_piles": self.discard_piles,
            "positions": self.positions, "health": self.health, "gold": self.gold,
            "loot": self.loot, "clank_pool": self.clank_pool, "dragon_bag": self.dragon_bag,
            "market": self.market, "market_deck": self.market_deck,
            "rooms": self.rooms, "rooms_looted": self.rooms_looted,
            "escaped": self.escaped, "knocked_out": self.knocked_out,
            "phase": self.phase, "turn_move": self.turn_move, "turn_attack": self.turn_attack,
            "turn_skill": self.turn_skill, "turn_clank": self.turn_clank,
            "cards_played": self.cards_played, "dragon_attacks": self.dragon_attacks,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.decks = state["decks"]
        self.hands = state["hands"]
        self.discard_piles = state["discard_piles"]
        self.positions = state["positions"]
        self.health = state["health"]
        self.gold = state["gold"]
        self.loot = state["loot"]
        self.clank_pool = state["clank_pool"]
        self.dragon_bag = state["dragon_bag"]
        self.market = state["market"]
        self.market_deck = state["market_deck"]
        self.rooms = state["rooms"]
        self.rooms_looted = state["rooms_looted"]
        self.escaped = state["escaped"]
        self.knocked_out = state["knocked_out"]
        self.phase = state["phase"]
        self.turn_move = state["turn_move"]
        self.turn_attack = state["turn_attack"]
        self.turn_skill = state["turn_skill"]
        self.turn_clank = state["turn_clank"]
        self.cards_played = state["cards_played"]
        self.dragon_attacks = state["dragon_attacks"]

    def get_tutorial(self):
        """Return tutorial text."""
        theme = "Sunken Ruins" if self.variation == "sunken" else "Dungeon"
        return f"""
==================================================
  Clank! - Tutorial ({theme})
==================================================

  OVERVIEW:
  Clank! is a deck-building dungeon adventure.
  Sneak into the dungeon, steal loot, and escape
  before the dragon destroys you! Making noise
  (clank) draws the dragon's attention.

  YOUR DECK:
  You start with 10 cards: Burgle (skill), Stumble
  (clank!), and Sidestep (movement). Buy better
  cards from the market to improve your deck.

  CARD STATS:
  - Move: movement points to traverse rooms
  - Attack: fight monsters blocking loot
  - Skill: currency to buy market cards
  - Clank: noise added to the dragon bag

  ON YOUR TURN:
  1. PLAY cards from your hand:
     Command: play <card#>

  2. MOVE through the dungeon:
     Command: move <room#>
     (costs movement points based on depth change)

  3. FIGHT monsters in your room:
     Command: fight
     (needs attack >= monster's attack value)

  4. BUY cards from the market:
     Command: buy <market#>
     (costs skill points)

  5. END your turn:
     Command: end
     (clank is added, new hand drawn)

  DUNGEON:
  Rooms have depth levels (0-3). Deeper rooms hold
  better loot but cost more movement. Depth 2+
  rooms add extra clank automatically.

  DRAGON ATTACKS:
  Every 3 turns the dragon attacks! Clank cubes
  go into the dragon bag. Drawn cubes deal damage.
  The attack grows stronger over time.

  WINNING:
  - Escape (return to room 0 with loot) for bonus
  - Gold from loot + card points = final score
  - Knocked out players lose half their score
  - Highest score wins!

  STRATEGY:
  - Buy movement and attack cards early
  - Minimize clank to avoid dragon damage
  - Go deep for big loot, but don't get greedy
  - Time your escape before dragon ramps up
  - Shadow Cloak and Sneak reduce clank

==================================================
"""
