"""Bang! The Dice Game - Western-themed Yahtzee-style dice game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Dice faces for standard game
STANDARD_FACES = ['Arrow', 'Dynamite', 'Bull1', 'Bull2', 'Beer', 'Gatling']

# Dice faces for undead variant (replaces Beer and Gatling with zombie faces)
UNDEAD_FACES = ['Arrow', 'Dynamite', 'Bull1', 'Bull2', 'BrainBeer', 'Zombie']

FACE_SYMBOLS = {
    'Arrow': '>>-->',
    'Dynamite': '(TNT)',
    'Bull1': '[B1] ',
    'Bull2': '[B2] ',
    'Beer': '{Bee}',
    'Gatling': '=GG= ',
    'BrainBeer': '{Brn}',
    'Zombie': '[ZZ] ',
}

TOTAL_ARROWS = 9


class BangDiceGame(BaseGame):
    """Bang! The Dice Game - Western-themed dice combat for 2 players."""

    name = "Bang! The Dice Game"
    description = "Western-themed Yahtzee-style dice combat - roll dice, shoot opponents, survive"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Classic Bang! Dice - Arrows, Dynamite, Bullets, Beer, and Gatling Guns",
        "undead": "Undead variant - Zombie dice faces, players can become undead",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.dice = [''] * 5
        self.locked = [False] * 5
        self.rolls_left = 3
        self.hp = {1: 0, 2: 0}
        self.max_hp = {1: 0, 2: 0}
        self.roles = {1: '', 2: ''}
        self.arrows = {1: 0, 2: 0}
        self.arrow_pile = TOTAL_ARROWS
        self.undead = {1: False, 2: False}
        self.phase = 'rolling'
        self.turn_message = ''

    def setup(self):
        """Initialize roles, HP, and arrow pile."""
        self.roles = {1: 'Sheriff', 2: 'Outlaw'}
        if self.variation == 'undead':
            self.max_hp = {1: 10, 2: 8}
        else:
            self.max_hp = {1: 8, 2: 8}
        self.hp = {1: self.max_hp[1], 2: self.max_hp[2]}
        self.arrows = {1: 0, 2: 0}
        self.arrow_pile = TOTAL_ARROWS
        self.dice = [''] * 5
        self.locked = [False] * 5
        self.rolls_left = 3
        self.phase = 'rolling'
        self.turn_message = ''
        self.undead = {1: False, 2: False}
        self.game_over = False
        self.winner = None

    def _get_faces(self):
        """Return the dice face list for the current variant."""
        if self.variation == 'undead':
            return UNDEAD_FACES
        return STANDARD_FACES

    def _roll_die(self):
        """Roll a single die and return the face."""
        faces = self._get_faces()
        return random.choice(faces)

    def _count_face(self, face):
        """Count how many dice show a given face."""
        return sum(1 for d in self.dice if d == face)

    def _take_arrow(self, player):
        """Player takes an arrow token from the pile. Returns message."""
        if self.arrow_pile <= 0:
            return ""
        self.arrows[player] += 1
        self.arrow_pile -= 1
        msg = f"  {self.players[player - 1]} takes an arrow! ({self.arrows[player]} total)\n"
        if self.arrow_pile <= 0:
            msg += self._indian_attack()
        return msg

    def _indian_attack(self):
        """Trigger Indian attack: all players lose HP equal to their arrows."""
        msg = "\n  *** INDIAN ATTACK! ***\n"
        for p in (1, 2):
            dmg = self.arrows[p]
            if dmg > 0:
                self.hp[p] = max(0, self.hp[p] - dmg)
                msg += f"  {self.players[p - 1]} hit by {dmg} arrow(s)! HP: {self.hp[p]}\n"
            self.arrows[p] = 0
        self.arrow_pile = TOTAL_ARROWS
        return msg

    def _resolve_dice(self):
        """Resolve all dice at end of rolling phase. Returns result message."""
        msg = "\n  --- Resolving Dice ---\n"
        player = self.current_player
        opponent = 2 if player == 1 else 1

        # Count faces
        arrows = self._count_face('Arrow')
        dynamite = self._count_face('Dynamite')
        bull1 = self._count_face('Bull1')
        bull2 = self._count_face('Bull2')
        beer_face = 'BrainBeer' if self.variation == 'undead' else 'Beer'
        gatling_face = 'Zombie' if self.variation == 'undead' else 'Gatling'
        beers = self._count_face(beer_face)
        gatlings = self._count_face(gatling_face)

        # Dynamite explosion check (3+ dynamite)
        if dynamite >= 3:
            self.hp[player] = max(0, self.hp[player] - dynamite)
            msg += f"  BOOM! {dynamite} Dynamite! {self.players[player - 1]} loses {dynamite} HP!\n"

        # Bull's Eye 1 - shoot adjacent (in 2-player, opponent is always adjacent)
        if bull1 > 0:
            dmg = bull1
            self.hp[opponent] = max(0, self.hp[opponent] - dmg)
            msg += f"  Bull's Eye 1: {self.players[player - 1]} shoots {self.players[opponent - 1]} for {dmg}!\n"

        # Bull's Eye 2 - shoot any player (in 2-player, always opponent)
        if bull2 > 0:
            dmg = bull2
            self.hp[opponent] = max(0, self.hp[opponent] - dmg)
            msg += f"  Bull's Eye 2: {self.players[player - 1]} shoots {self.players[opponent - 1]} for {dmg}!\n"

        # Beer - heal
        if beers > 0:
            if self.variation == 'undead' and self.undead[player]:
                # Undead players: brains deal damage to opponents instead
                self.hp[opponent] = max(0, self.hp[opponent] - beers)
                msg += f"  Brain feast! {self.players[player - 1]} (undead) devours {beers} brain(s), dealing {beers} damage!\n"
            else:
                healed = min(beers, self.max_hp[player] - self.hp[player])
                self.hp[player] = min(self.max_hp[player], self.hp[player] + beers)
                if healed > 0:
                    msg += f"  Beer: {self.players[player - 1]} heals {healed} HP!\n"
                else:
                    msg += f"  Beer: {self.players[player - 1]} already at max HP.\n"

        # Gatling / Zombie
        if gatlings >= 3:
            if self.variation == 'undead':
                # Zombie horde: damage all opponents and possibly turn player undead
                self.hp[opponent] = max(0, self.hp[opponent] - gatlings)
                msg += f"  ZOMBIE HORDE! {gatlings} zombies deal {gatlings} damage to {self.players[opponent - 1]}!\n"
                if not self.undead[player]:
                    self.undead[player] = True
                    msg += f"  {self.players[player - 1]} has become UNDEAD!\n"
            else:
                self.hp[opponent] = max(0, self.hp[opponent] - 1)
                msg += f"  GATLING GUN! {self.players[player - 1]} fires at all opponents for 1 damage!\n"
                # Gatling also discards all arrows from current player
                if self.arrows[player] > 0:
                    returned = self.arrows[player]
                    self.arrow_pile = min(TOTAL_ARROWS, self.arrow_pile + returned)
                    self.arrows[player] = 0
                    msg += f"  {self.players[player - 1]} discards all arrows (returned {returned} to pile).\n"

        return msg

    def _render_dice_row(self):
        """Render dice in a visual row."""
        lines = []
        # Top labels
        labels = ""
        for i in range(5):
            lock_tag = " LOCKED" if self.locked[i] else ""
            labels += f"  Die {i + 1}{lock_tag:<8}"
        lines.append(labels)

        # Dice boxes
        top = ""
        mid = ""
        bot = ""
        for i in range(5):
            face = self.dice[i] if self.dice[i] else '  ?  '
            sym = FACE_SYMBOLS.get(face, f'{face:^5}') if face != '  ?  ' else '  ?  '
            top += " +-------+"
            mid += f" | {sym:^5} |"
            bot += " +-------+"
        lines.append(top)
        lines.append(mid)
        lines.append(bot)
        return "\n".join(lines)

    def _render_player_status(self, player):
        """Render a player's status block."""
        role = self.roles[player]
        hp_bar_len = self.max_hp[player]
        filled = self.hp[player]
        hp_bar = '#' * filled + '.' * (hp_bar_len - filled)
        undead_tag = " [UNDEAD]" if self.undead[player] else ""
        arrow_str = f"Arrows: {'>>-- ' * self.arrows[player]}" if self.arrows[player] > 0 else "Arrows: none"
        current_tag = " << CURRENT TURN" if player == self.current_player else ""

        lines = [
            f"  {self.players[player - 1]} ({role}){undead_tag}{current_tag}",
            f"  HP: [{hp_bar}] {self.hp[player]}/{self.max_hp[player]}",
            f"  {arrow_str}",
        ]
        return "\n".join(lines)

    def display(self):
        """Display the full game state."""
        print(f"\n{'=' * 60}")
        title = "BANG! THE DICE GAME"
        if self.variation == 'undead':
            title += " (UNDEAD)"
        print(f"  {title}  -  Turn {self.turn_number + 1}")
        print(f"{'=' * 60}")

        # Arrow pile
        print(f"\n  Arrow Pile: {self.arrow_pile}/{TOTAL_ARROWS}")
        print()

        # Player statuses
        for p in (1, 2):
            print(self._render_player_status(p))
            print()

        # Dice
        if self.rolls_left < 3:
            print(self._render_dice_row())
            print(f"\n  Rolls remaining: {self.rolls_left}")
        else:
            print("  Roll the dice to begin your turn!")

        # Turn messages
        if self.turn_message:
            print(f"\n{self.turn_message}")

        print()

    def get_move(self):
        """Get the current player's action."""
        player_name = self.players[self.current_player - 1]
        while True:
            if self.rolls_left == 3:
                prompt = f"{player_name}, type 'roll' to roll the dice: "
            elif self.rolls_left > 0:
                prompt = (f"{player_name} - 'roll' to reroll, "
                          "'keep 1 3 5' to toggle keeps, or 'done' to resolve: ")
            else:
                prompt = f"{player_name} - no rolls left. Type 'done' to resolve: "

            raw = input_with_quit(prompt).strip().lower()
            if not raw:
                continue

            parts = raw.split()
            cmd = parts[0]

            if cmd == 'roll':
                if self.rolls_left <= 0:
                    print("  No rolls remaining! Type 'done' to resolve dice.")
                    continue
                return ('roll',)

            if cmd == 'keep':
                if self.rolls_left == 3:
                    print("  You must roll first!")
                    continue
                if self.rolls_left <= 0:
                    print("  No rolls left. Type 'done' to resolve.")
                    continue
                try:
                    indices = [int(x) for x in parts[1:]]
                except ValueError:
                    print("  Usage: keep 1 3 5  (dice numbers 1-5)")
                    continue
                if not indices or any(i < 1 or i > 5 for i in indices):
                    print("  Dice numbers must be 1-5.")
                    continue
                # Check if any selected die is locked
                for idx in indices:
                    if self.locked[idx - 1]:
                        print(f"  Die {idx} ({self.dice[idx - 1]}) is locked and cannot be kept/rerolled!")
                        break
                else:
                    return ('keep', indices)
                continue

            if cmd == 'done':
                if self.rolls_left == 3:
                    print("  You must roll at least once!")
                    continue
                return ('done',)

            print("  Commands: 'roll', 'keep 1 3 5', 'done'")

    def make_move(self, move):
        """Apply a move. Handles the full turn internally before returning."""
        action = move[0]

        if action == 'roll':
            self._do_roll()
            return self._continue_turn()

        if action == 'keep':
            # This shouldn't happen as first move but handle gracefully
            return False

        if action == 'done':
            result_msg = self._resolve_dice()
            self.turn_message = result_msg
            self._reset_turn()
            return True

        return False

    def _do_roll(self):
        """Roll all unlocked dice and process arrows/dynamite locks."""
        self.turn_message = ''
        arrow_msg = ''
        for i in range(5):
            if not self.locked[i]:
                self.dice[i] = self._roll_die()
        self.rolls_left -= 1

        # Lock arrows and dynamite, take arrow tokens
        for i in range(5):
            if self.dice[i] == 'Arrow' and not self.locked[i]:
                self.locked[i] = True
                arrow_msg += self._take_arrow(self.current_player)
            elif self.dice[i] == 'Dynamite':
                self.locked[i] = True

        # Check for immediate dynamite explosion (3+ dynamite = instant resolve)
        if self._count_face('Dynamite') >= 3:
            arrow_msg += "  WARNING: 3+ Dynamite! Explosion imminent!\n"

        self.turn_message = arrow_msg

    def _continue_turn(self):
        """Continue the turn loop: re-display and get actions until 'done'."""
        while True:
            # Check if current player died from arrows/Indian attack
            if self.hp[self.current_player] <= 0:
                self.turn_message += f"\n  {self.players[self.current_player - 1]} has been eliminated!\n"
                self._reset_turn()
                return True

            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise

            if move[0] == 'roll':
                self._do_roll()
                continue

            if move[0] == 'keep':
                indices = move[1]
                # Toggle keep status on non-locked dice (mark as locked to keep)
                # Actually, "keep" here means the player wants to keep those dice
                # We just note it; unlocked+unkept dice get rerolled next roll
                # For simplicity: reset all non-forced locks, then set keeps
                for i in range(5):
                    if self.dice[i] not in ('Arrow', 'Dynamite'):
                        self.locked[i] = False
                for idx in indices:
                    self.locked[idx - 1] = True
                clear_screen()
                self.display()
                continue

            if move[0] == 'done':
                result_msg = self._resolve_dice()
                self.turn_message = result_msg
                self._reset_turn()
                return True

        return False

    def _reset_turn(self):
        """Reset dice state for the next turn."""
        self.dice = [''] * 5
        self.locked = [False] * 5
        self.rolls_left = 3

    def check_game_over(self):
        """Check if any player has been eliminated."""
        if self.hp[1] <= 0 and self.hp[2] <= 0:
            self.game_over = True
            self.winner = None  # draw
        elif self.hp[1] <= 0:
            self.game_over = True
            self.winner = 2
        elif self.hp[2] <= 0:
            self.game_over = True
            self.winner = 1

    def get_state(self):
        """Return serializable game state."""
        return {
            'dice': self.dice,
            'locked': self.locked,
            'rolls_left': self.rolls_left,
            'hp': {str(k): v for k, v in self.hp.items()},
            'max_hp': {str(k): v for k, v in self.max_hp.items()},
            'roles': {str(k): v for k, v in self.roles.items()},
            'arrows': {str(k): v for k, v in self.arrows.items()},
            'arrow_pile': self.arrow_pile,
            'undead': {str(k): v for k, v in self.undead.items()},
            'phase': self.phase,
            'turn_message': self.turn_message,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.dice = state['dice']
        self.locked = state['locked']
        self.rolls_left = state['rolls_left']
        self.hp = {int(k): v for k, v in state['hp'].items()}
        self.max_hp = {int(k): v for k, v in state['max_hp'].items()}
        self.roles = {int(k): v for k, v in state['roles'].items()}
        self.arrows = {int(k): v for k, v in state['arrows'].items()}
        self.arrow_pile = state['arrow_pile']
        self.undead = {int(k): v for k, v in state['undead'].items()}
        self.phase = state.get('phase', 'rolling')
        self.turn_message = state.get('turn_message', '')

    def get_tutorial(self):
        """Return tutorial text for Bang! The Dice Game."""
        txt = ("=" * 50 + "\n  BANG! THE DICE GAME - TUTORIAL\n" + "=" * 50 + "\n\n"
               "OVERVIEW:\n"
               "  Western-themed dice combat. Roll dice to shoot\n"
               "  opponents, heal, and survive. Last one standing wins!\n\n"
               "ROLES:\n"
               "  Sheriff - Extra HP. Must eliminate the Outlaw.\n"
               "  Outlaw  - Must eliminate the Sheriff.\n\n"
               "EACH TURN:\n"
               "  1. Type 'roll' to roll all 5 dice.\n"
               "  2. Up to 3 rolls per turn. After each roll:\n"
               "     - 'roll' to reroll unlocked dice\n"
               "     - 'keep 1 3 5' to lock dice from rerolling\n"
               "     - 'done' to resolve immediately\n"
               "  Arrow and Dynamite dice lock automatically!\n\n"
               "DICE FACES:\n"
               "  >>-->  Arrow    - Take arrow token (locked). Pile empty\n"
               "                    triggers Indian Attack (lose HP = arrows).\n"
               "  (TNT)  Dynamite - Locked. 3+ = EXPLOSION (take damage)!\n"
               "  [B1]   Bull 1   - Shoot opponent for 1 damage.\n"
               "  [B2]   Bull 2   - Shoot opponent for 1 damage.\n"
               "  {Bee}  Beer     - Heal 1 HP (up to max).\n"
               "  =GG=   Gatling  - 3+ = shoot all opponents, discard arrows.\n\n"
               "TIPS:\n"
               "  - Watch the arrow pile; Indian attacks hurt!\n"
               "  - 2 Dynamite = danger. Consider stopping early.\n"
               "  - Gatling Guns are powerful but risky to chase.\n")
        if self.variation == 'undead':
            txt += ("\nUNDEAD VARIANT:\n"
                    "  {Brn} Brain/Beer - Heals living; undead deal damage.\n"
                    "  [ZZ]  Zombie - 3+ = zombie horde, you become UNDEAD.\n"
                    "  Sheriff starts with 10 HP in undead mode.\n")
        txt += ("\nCOMMANDS:\n"
                "  roll / keep 1 3 5 / done\n"
                "  quit(q) / save(s) / help(h) / tutorial(t)\n"
                + "=" * 50 + "\n")
        return txt
