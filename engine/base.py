"""Base game class that all games inherit from."""

import os
import json
import time
from abc import ABC, abstractmethod


SAVE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'saves')


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def input_with_quit(prompt=""):
    """Get input, handling suspend requests."""
    val = input(prompt)
    if val.strip().lower() in ('quit', 'exit', 'q'):
        raise QuitGame()
    if val.strip().lower() in ('suspend', 'save', 's'):
        raise SuspendGame()
    if val.strip().lower() in ('help', 'h', '?'):
        raise ShowHelp()
    if val.strip().lower() in ('tutorial', 't'):
        raise ShowTutorial()
    return val


class QuitGame(Exception):
    pass


class SuspendGame(Exception):
    pass


class ShowHelp(Exception):
    pass


class ShowTutorial(Exception):
    pass


class BaseGame(ABC):
    """Base class for all board games."""

    name = "Unknown Game"
    description = "No description"
    min_players = 2
    max_players = 2
    variations = {}  # {name: description}

    def __init__(self, variation=None):
        self.variation = variation or "standard"
        self.current_player = 1
        self.players = ["Player 1", "Player 2"]
        self.game_over = False
        self.winner = None
        self.move_history = []
        self.turn_number = 0

    @abstractmethod
    def setup(self):
        """Initialize the game board and state."""
        pass

    @abstractmethod
    def display(self):
        """Display the current game state."""
        pass

    @abstractmethod
    def get_move(self):
        """Get a move from the current player. Returns the move."""
        pass

    @abstractmethod
    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        pass

    @abstractmethod
    def check_game_over(self):
        """Check if the game is over. Sets self.game_over and self.winner."""
        pass

    @abstractmethod
    def get_state(self):
        """Return serializable game state for saving."""
        pass

    @abstractmethod
    def load_state(self, state):
        """Restore game state from saved data."""
        pass

    def get_tutorial(self):
        """Return tutorial text for this game."""
        return f"No tutorial available for {self.name}."

    def show_help(self):
        """Show in-game help."""
        print(f"\n{'='*50}")
        print(f"  {self.name} - In-Game Help")
        print(f"{'='*50}")
        print(f"  Type your move as prompted")
        print(f"  'quit' or 'q'  - Quit game (unsaved progress lost)")
        print(f"  'save' or 's'  - Suspend and save game")
        print(f"  'help' or 'h'  - Show this help")
        print(f"  'tutorial' or 't' - Show tutorial")
        print(f"{'='*50}")
        input("\nPress Enter to continue...")

    def switch_player(self):
        """Switch to the next player."""
        self.current_player = 2 if self.current_player == 1 else 1

    def save_game(self, slot_name=None):
        """Save game state to file."""
        os.makedirs(SAVE_DIR, exist_ok=True)
        if not slot_name:
            slot_name = f"{self.name.lower().replace(' ', '_')}_{int(time.time())}"
        state = {
            'game_type': self.__class__.__module__ + '.' + self.__class__.__name__,
            'game_name': self.name,
            'variation': self.variation,
            'current_player': self.current_player,
            'players': self.players,
            'turn_number': self.turn_number,
            'move_history': self.move_history,
            'game_state': self.get_state(),
            'timestamp': time.time()
        }
        filepath = os.path.join(SAVE_DIR, f"{slot_name}.json")
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)
        return slot_name

    @classmethod
    def load_game(cls, filepath):
        """Load game state from file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return data

    def play(self):
        """Main game loop."""
        self.setup()
        while not self.game_over:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except QuitGame:
                print("\nGame ended.")
                input("Press Enter to return to menu...")
                return None
            except SuspendGame:
                slot = self.save_game()
                print(f"\nGame saved as '{slot}'")
                input("Press Enter to return to menu...")
                return 'suspended'
            except ShowHelp:
                self.show_help()
                continue
            except ShowTutorial:
                clear_screen()
                print(self.get_tutorial())
                input("\nPress Enter to continue...")
                continue

            if self.make_move(move):
                self.move_history.append(str(move))
                self.turn_number += 1
                self.check_game_over()
                if not self.game_over:
                    self.switch_player()
            else:
                print("Invalid move! Try again.")
                input("Press Enter to continue...")

        clear_screen()
        self.display()
        if self.winner:
            print(f"\n*** {self.players[self.winner - 1]} wins! ***")
        else:
            print("\n*** It's a draw! ***")
        input("\nPress Enter to return to menu...")
        return self.winner
