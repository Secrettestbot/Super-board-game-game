"""Star Realms - A deck-building card game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen

# Factions
TRADE_FED = "Trade Federation"
BLOB = "Blob"
STAR_EMPIRE = "Star Empire"
MACHINE_CULT = "Machine Cult"
UNALIGNED = "Unaligned"

FACTION_SYMBOLS = {
    TRADE_FED: "[TF]",
    BLOB: "[BL]",
    STAR_EMPIRE: "[SE]",
    MACHINE_CULT: "[MC]",
    UNALIGNED: "[--]",
}


def _make_card(name, faction, cost, trade=0, combat=0, authority=0,
               ally_trade=0, ally_combat=0, ally_authority=0, ally_draw=0,
               scrap_trade=0, scrap_combat=0, scrap_authority=0, scrap_draw=0,
               is_base=False, base_defense=0):
    """Create a card dictionary."""
    return {
        "name": name,
        "faction": faction,
        "cost": cost,
        "trade": trade,
        "combat": combat,
        "authority": authority,
        "ally_trade": ally_trade,
        "ally_combat": ally_combat,
        "ally_authority": ally_authority,
        "ally_draw": ally_draw,
        "scrap_trade": scrap_trade,
        "scrap_combat": scrap_combat,
        "scrap_authority": scrap_authority,
        "scrap_draw": scrap_draw,
        "is_base": is_base,
        "base_defense": base_defense,
    }


def _starter_deck():
    """Each player starts with 8 Scouts (1 trade) and 2 Vipers (1 combat)."""
    deck = []
    for _ in range(8):
        deck.append(_make_card("Scout", UNALIGNED, 0, trade=1))
    for _ in range(2):
        deck.append(_make_card("Viper", UNALIGNED, 0, combat=1))
    random.shuffle(deck)
    return deck


def _explorer_card():
    """Explorer: available in unlimited supply from the explorer pile."""
    return _make_card("Explorer", UNALIGNED, 2, trade=2,
                      scrap_combat=2)


def _trade_deck():
    """Generate the central trade deck with cards from all factions."""
    cards = []

    # Trade Federation cards
    cards.append(_make_card("Federation Shuttle", TRADE_FED, 1, trade=2,
                            ally_authority=4))
    cards.append(_make_card("Cutter", TRADE_FED, 2, trade=2, authority=4,
                            ally_combat=4))
    cards.append(_make_card("Embassy Yacht", TRADE_FED, 3, trade=2, authority=3,
                            ally_draw=1))
    cards.append(_make_card("Freighter", TRADE_FED, 4, trade=4,
                            ally_trade=4))
    cards.append(_make_card("Trade Escort", TRADE_FED, 5, combat=4, authority=4,
                            ally_draw=1))
    cards.append(_make_card("Flagship", TRADE_FED, 6, combat=5, trade=3,
                            ally_authority=5))
    cards.append(_make_card("Port of Call", TRADE_FED, 6, trade=3,
                            is_base=True, base_defense=6,
                            scrap_draw=1, scrap_trade=2))
    cards.append(_make_card("Trading Post", TRADE_FED, 3, authority=1, trade=1,
                            is_base=True, base_defense=4,
                            scrap_combat=3))
    cards.append(_make_card("Barter World", TRADE_FED, 4, authority=2, trade=2,
                            is_base=True, base_defense=4,
                            scrap_combat=5))

    # Blob cards
    cards.append(_make_card("Blob Fighter", BLOB, 1, combat=3,
                            ally_draw=1))
    cards.append(_make_card("Trade Pod", BLOB, 2, trade=3,
                            ally_combat=2))
    cards.append(_make_card("Battle Pod", BLOB, 2, combat=4,
                            ally_combat=2, scrap_trade=3))
    cards.append(_make_card("Ram", BLOB, 3, combat=5,
                            ally_combat=2, scrap_trade=3))
    cards.append(_make_card("Blob Destroyer", BLOB, 4, combat=6,
                            ally_draw=1, scrap_combat=3))
    cards.append(_make_card("Battle Blob", BLOB, 6, combat=8,
                            ally_draw=1, scrap_combat=4))
    cards.append(_make_card("Mothership", BLOB, 7, combat=6,
                            ally_draw=1))
    cards.append(_make_card("Blob Wheel", BLOB, 3, combat=1,
                            is_base=True, base_defense=5,
                            scrap_trade=3))
    cards.append(_make_card("The Hive", BLOB, 5, combat=3,
                            is_base=True, base_defense=5,
                            ally_draw=1))

    # Star Empire cards
    cards.append(_make_card("Imperial Fighter", STAR_EMPIRE, 1, combat=2,
                            ally_combat=2, scrap_draw=1))
    cards.append(_make_card("Corvette", STAR_EMPIRE, 2, combat=1,
                            ally_combat=2, scrap_draw=1))
    cards.append(_make_card("Survey Ship", STAR_EMPIRE, 3, trade=1,
                            ally_combat=2, scrap_draw=1))
    cards.append(_make_card("Battlecruiser", STAR_EMPIRE, 6, combat=5,
                            ally_draw=1, scrap_draw=1, scrap_combat=3))
    cards.append(_make_card("Dreadnaught", STAR_EMPIRE, 7, combat=7,
                            ally_draw=1, scrap_combat=5))
    cards.append(_make_card("War World", STAR_EMPIRE, 5, combat=3,
                            is_base=True, base_defense=4,
                            ally_combat=4))
    cards.append(_make_card("Royal Redoubt", STAR_EMPIRE, 6, combat=3,
                            is_base=True, base_defense=6,
                            ally_combat=3))
    cards.append(_make_card("Space Station", STAR_EMPIRE, 4, combat=2,
                            is_base=True, base_defense=4,
                            ally_combat=2, scrap_trade=4))

    # Machine Cult cards
    cards.append(_make_card("Trade Bot", MACHINE_CULT, 1, trade=1, combat=1,
                            ally_combat=2))
    cards.append(_make_card("Missile Bot", MACHINE_CULT, 2, combat=2,
                            ally_combat=2, scrap_draw=1))
    cards.append(_make_card("Supply Bot", MACHINE_CULT, 3, trade=2,
                            ally_combat=2, scrap_draw=1))
    cards.append(_make_card("Patrol Mech", MACHINE_CULT, 4, trade=3, combat=5,
                            ally_combat=3))
    cards.append(_make_card("Mech World", MACHINE_CULT, 5, combat=0,
                            is_base=True, base_defense=6,
                            ally_trade=3, scrap_combat=6))
    cards.append(_make_card("Stealth Needle", MACHINE_CULT, 4, combat=4,
                            ally_trade=1, scrap_combat=4))
    cards.append(_make_card("Battle Station", MACHINE_CULT, 3, combat=0,
                            is_base=True, base_defense=5,
                            scrap_combat=5))
    cards.append(_make_card("Brain World", MACHINE_CULT, 8, combat=0,
                            is_base=True, base_defense=6,
                            scrap_draw=2))

    random.shuffle(cards)
    return cards


def _card_short(card):
    """Short display of a card."""
    sym = FACTION_SYMBOLS.get(card["faction"], "[??]")
    parts = []
    if card["trade"]:
        parts.append(f"+{card['trade']}T")
    if card["combat"]:
        parts.append(f"+{card['combat']}C")
    if card["authority"]:
        parts.append(f"+{card['authority']}A")
    stat = " ".join(parts) if parts else "special"
    base_tag = f" DEF:{card['base_defense']}" if card["is_base"] else ""
    return f"{sym} {card['name']} (${card['cost']}) [{stat}]{base_tag}"


class StarRealms(BaseGame):
    """Star Realms - A deck-building card game for 2 players."""

    name = "Star Realms"
    description = (
        "A deck-building card game where players acquire ships and bases "
        "to build a powerful deck and reduce their opponent's authority to 0."
    )
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 50 authority each, full trade deck",
        "quick": "Quick game - 30 authority each, smaller trade deck for faster play",
    }

    def setup(self):
        starting_authority = 50 if self.variation == "standard" else 30
        self.authority = [0, starting_authority, starting_authority]  # idx 0 unused

        # Each player has: deck, hand, discard, in_play, bases_in_play
        self.decks = [None, _starter_deck(), _starter_deck()]
        self.hands = [None, [], []]
        self.discards = [None, [], []]
        self.in_play = [None, [], []]
        self.bases = [None, [], []]

        # Trade row and trade deck
        self.trade_deck = _trade_deck()
        if self.variation == "quick":
            self.trade_deck = self.trade_deck[:20]
        self.trade_row = []
        for _ in range(5):
            if self.trade_deck:
                self.trade_row.append(self.trade_deck.pop())

        self.explorers_remaining = 10

        # Turn resources
        self.trade_pool = 0
        self.combat_pool = 0
        self.authority_gained = 0
        self.cards_drawn_extra = 0
        self.played_factions = []

        # Draw initial hands
        self._draw_cards(1, 3)  # Player 1 draws 3 on first turn
        self._draw_cards(2, 5)

        self.first_turn = True
        self.phase = "play"  # play or buy

    def _draw_cards(self, player, count):
        """Draw cards from deck into hand, reshuffling discard if needed."""
        for _ in range(count):
            if not self.decks[player]:
                if not self.discards[player]:
                    return
                self.decks[player] = self.discards[player][:]
                self.discards[player] = []
                random.shuffle(self.decks[player])
            if self.decks[player]:
                self.hands[player].append(self.decks[player].pop())

    def _refill_trade_row(self):
        """Refill trade row to 5 cards."""
        while len(self.trade_row) < 5 and self.trade_deck:
            self.trade_row.append(self.trade_deck.pop())

    def _apply_card(self, card, player):
        """Apply primary abilities of a card."""
        self.trade_pool += card["trade"]
        self.combat_pool += card["combat"]
        self.authority[player] += card["authority"]

        # Check ally abilities
        faction = card["faction"]
        if faction != UNALIGNED and faction in self.played_factions:
            self.trade_pool += card["ally_trade"]
            self.combat_pool += card["ally_combat"]
            self.authority[player] += card["ally_authority"]
            if card["ally_draw"]:
                self._draw_cards(player, card["ally_draw"])

        if faction != UNALIGNED:
            # Retroactively apply ally bonuses for cards already played
            for c in self.in_play[player]:
                if c["faction"] == faction and c is not card:
                    if faction not in self.played_factions:
                        self.trade_pool += c["ally_trade"]
                        self.combat_pool += c["ally_combat"]
                        self.authority[player] += c["ally_authority"]
                        if c["ally_draw"]:
                            self._draw_cards(player, c["ally_draw"])

            self.played_factions.append(faction)

    def _scrap_card(self, card, player):
        """Apply scrap abilities of a card, then remove it from the game."""
        self.trade_pool += card["scrap_trade"]
        self.combat_pool += card["scrap_combat"]
        self.authority[player] += card["scrap_authority"]
        if card["scrap_draw"]:
            self._draw_cards(player, card["scrap_draw"])

    def display(self):
        p = self.current_player
        opp = 2 if p == 1 else 1
        print("=" * 60)
        print(f"  STAR REALMS  -  Turn {self.turn_number + 1}")
        print("=" * 60)

        # Opponent info
        print(f"\n  {self.players[opp - 1]} (Authority: {self.authority[opp]})")
        opp_bases_str = ", ".join(
            f"{b['name']}(DEF:{b['base_defense']})" for b in self.bases[opp]
        )
        if opp_bases_str:
            print(f"  Bases: {opp_bases_str}")
        print(f"  Deck: {len(self.decks[opp])} | Discard: {len(self.discards[opp])}")

        # Trade row
        print(f"\n  {'─' * 56}")
        print("  TRADE ROW:")
        for i, card in enumerate(self.trade_row):
            print(f"    [{i + 1}] {_card_short(card)}")
        if self.explorers_remaining > 0:
            print(f"    [E] Explorer ($2) [+2T] (scrap: +2C) x{self.explorers_remaining}")
        print(f"  Trade deck remaining: {len(self.trade_deck)}")

        # Current player info
        print(f"\n  {'─' * 56}")
        print(f"  {self.players[p - 1]} (Authority: {self.authority[p]})")
        print(f"  Trade: {self.trade_pool} | Combat: {self.combat_pool}")
        print(f"  Deck: {len(self.decks[p])} | Discard: {len(self.discards[p])}")

        # Bases in play
        if self.bases[p]:
            print("  Your Bases:")
            for i, b in enumerate(self.bases[p]):
                print(f"    <{i}> {_card_short(b)}")

        # Cards in play this turn
        if self.in_play[p]:
            print("  In Play:")
            for c in self.in_play[p]:
                print(f"    * {_card_short(c)}")

        # Hand
        print("  Hand:")
        if self.hands[p]:
            for i, card in enumerate(self.hands[p]):
                print(f"    [{i + 1}] {_card_short(card)}")
        else:
            print("    (empty)")

        print(f"  {'─' * 56}")

    def get_move(self):
        p = self.current_player
        print("\n  Actions:")
        print("    play <#>    - Play a card from hand (e.g., 'play 1')")
        print("    buy <#>     - Buy card from trade row (e.g., 'buy 3')")
        print("    buy e       - Buy an Explorer")
        print("    attack <#>  - Attack opponent's base (e.g., 'attack 0')")
        print("    attack face - Attack opponent directly")
        print("    scrap <#>   - Scrap a card in play for its scrap ability")
        print("    end         - End your turn")

        move = input_with_quit("\n  Your action: ").strip().lower()
        return move

    def make_move(self, move):
        p = self.current_player
        opp = 2 if p == 1 else 1
        parts = move.split()
        if not parts:
            return False

        action = parts[0]

        if action == "play":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.hands[p]):
                return False
            card = self.hands[p].pop(idx)
            if card["is_base"]:
                self.bases[p].append(card)
            else:
                self.in_play[p].append(card)
            self._apply_card(card, p)
            return True

        elif action == "buy":
            if len(parts) < 2:
                return False
            target = parts[1]
            if target == "e":
                if self.explorers_remaining <= 0:
                    print("  No explorers left!")
                    return False
                if self.trade_pool < 2:
                    print("  Not enough trade!")
                    return False
                self.trade_pool -= 2
                self.explorers_remaining -= 1
                self.discards[p].append(_explorer_card())
                return True
            try:
                idx = int(target) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.trade_row):
                return False
            card = self.trade_row[idx]
            if self.trade_pool < card["cost"]:
                print(f"  Not enough trade! Need {card['cost']}, have {self.trade_pool}")
                return False
            self.trade_pool -= card["cost"]
            self.discards[p].append(self.trade_row.pop(idx))
            self._refill_trade_row()
            return True

        elif action == "attack":
            if len(parts) < 2:
                return False
            target = parts[1]

            # Must attack bases first if opponent has any
            if target == "face":
                if self.bases[opp]:
                    print("  Must destroy opponent's bases first!")
                    return False
                if self.combat_pool <= 0:
                    print("  No combat to attack with!")
                    return False
                dmg = self.combat_pool
                self.combat_pool = 0
                self.authority[opp] -= dmg
                print(f"  Dealt {dmg} damage to {self.players[opp - 1]}!")
                input("  Press Enter to continue...")
                return True
            else:
                try:
                    idx = int(target)
                except ValueError:
                    return False
                if idx < 0 or idx >= len(self.bases[opp]):
                    return False
                base = self.bases[opp][idx]
                if self.combat_pool < base["base_defense"]:
                    print(f"  Need {base['base_defense']} combat, have {self.combat_pool}")
                    return False
                self.combat_pool -= base["base_defense"]
                destroyed = self.bases[opp].pop(idx)
                self.discards[opp].append(destroyed)
                print(f"  Destroyed {destroyed['name']}!")
                input("  Press Enter to continue...")
                return True

        elif action == "scrap":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1])
            except ValueError:
                return False
            # Scrap from in_play
            all_scrappable = list(self.in_play[p]) + list(self.bases[p])
            if idx < 0 or idx >= len(self.in_play[p]) + len(self.bases[p]):
                return False
            if idx < len(self.in_play[p]):
                card = self.in_play[p].pop(idx)
            else:
                card = self.bases[p].pop(idx - len(self.in_play[p]))
            has_scrap = (card["scrap_trade"] or card["scrap_combat"] or
                         card["scrap_authority"] or card["scrap_draw"])
            if not has_scrap:
                print("  That card has no scrap ability!")
                # Put it back
                if card["is_base"]:
                    self.bases[p].append(card)
                else:
                    self.in_play[p].append(card)
                return False
            self._scrap_card(card, p)
            # Card is removed from game (not put in discard)
            print(f"  Scrapped {card['name']} for its ability!")
            input("  Press Enter to continue...")
            return True

        elif action == "end":
            # End of turn: discard hand and in-play, draw 5
            for card in self.in_play[p]:
                self.discards[p].append(card)
            self.in_play[p] = []
            for card in self.hands[p]:
                self.discards[p].append(card)
            self.hands[p] = []
            self._draw_cards(p, 5)
            self.trade_pool = 0
            self.combat_pool = 0
            self.played_factions = []
            self.first_turn = False
            return True

        return False

    def check_game_over(self):
        for player in [1, 2]:
            if self.authority[player] <= 0:
                self.game_over = True
                self.winner = 2 if player == 1 else 1
                return

    def get_state(self):
        return {
            "authority": self.authority,
            "decks": self.decks,
            "hands": self.hands,
            "discards": self.discards,
            "in_play": self.in_play,
            "bases": self.bases,
            "trade_deck": self.trade_deck,
            "trade_row": self.trade_row,
            "explorers_remaining": self.explorers_remaining,
            "trade_pool": self.trade_pool,
            "combat_pool": self.combat_pool,
            "played_factions": self.played_factions,
            "first_turn": self.first_turn,
            "phase": self.phase,
        }

    def load_state(self, state):
        self.authority = state["authority"]
        self.decks = state["decks"]
        self.hands = state["hands"]
        self.discards = state["discards"]
        self.in_play = state["in_play"]
        self.bases = state["bases"]
        self.trade_deck = state["trade_deck"]
        self.trade_row = state["trade_row"]
        self.explorers_remaining = state["explorers_remaining"]
        self.trade_pool = state["trade_pool"]
        self.combat_pool = state["combat_pool"]
        self.played_factions = state["played_factions"]
        self.first_turn = state["first_turn"]
        self.phase = state["phase"]

    def get_tutorial(self):
        return """
============================================================
  STAR REALMS - Tutorial
============================================================

  Star Realms is a deck-building card game for 2 players.

  OBJECTIVE:
    Reduce your opponent's Authority (health) to 0.

  SETUP:
    - Each player starts with 50 Authority (30 in quick mode)
    - Starting deck: 8 Scouts (+1 Trade) and 2 Vipers (+1 Combat)
    - A shared Trade Row of 5 cards is available to buy from

  TURN STRUCTURE:
    1. Play cards from your hand to generate Trade and Combat
    2. Use Trade to buy new cards from the Trade Row
    3. Use Combat to attack opponent's bases or Authority
    4. End turn: discard everything, draw 5 new cards

  CARD TYPES:
    - Ships: Played for one turn, then discarded
    - Bases: Stay in play until destroyed by opponent

  FACTIONS:
    [TF] Trade Federation - Trade and Authority (healing)
    [BL] Blob            - Raw Combat power
    [SE] Star Empire     - Combat and card draw
    [MC] Machine Cult    - Deck thinning (scrap)

  ALLY ABILITIES:
    When you play 2+ cards of the same faction, their ally
    abilities trigger, giving bonus effects!

  SCRAP ABILITIES:
    Some cards can be permanently removed from your deck
    (scrapped) for a powerful one-time effect.

  COMMANDS:
    play <#>     - Play card from hand
    buy <#>      - Buy card from trade row
    buy e        - Buy an Explorer
    attack <#>   - Attack opponent's base
    attack face  - Attack opponent directly
    scrap <#>    - Scrap a card in play
    end          - End your turn
============================================================
"""
