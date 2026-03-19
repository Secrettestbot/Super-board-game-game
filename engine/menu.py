"""Main menu system for the board game platform."""

import os
import sys
import json
import time
import importlib

from engine.base import clear_screen, SAVE_DIR


GAME_REGISTRY = [
    ("Chess", "games.chess", "ChessGame",
     "The classic strategy game of kings and queens",
     {"standard": "Standard Chess", "chess960": "Chess960 (Fischer Random)",
      "king_of_hill": "King of the Hill", "three_check": "Three-Check Chess"}),
    ("Checkers", "games.checkers", "CheckersGame",
     "Jump and capture your opponent's pieces",
     {"american": "American Checkers (8x8)", "international": "International Draughts (10x10)",
      "brazilian": "Brazilian Draughts (8x8)", "turkish": "Turkish Draughts"}),
    ("Go", "games.go", "GoGame",
     "Ancient strategy game of territorial control",
     {"9x9": "9x9 Board (Beginner)", "13x13": "13x13 Board (Intermediate)",
      "19x19": "19x19 Board (Standard)"}),
    ("Reversi/Othello", "games.reversi", "ReversiGame",
     "Flip your opponent's pieces to dominate the board",
     {"standard": "Standard Reversi", "small": "6x6 Board"}),
    ("Backgammon", "games.backgammon", "BackgammonGame",
     "Classic race game with dice and strategy",
     {"standard": "Standard Backgammon", "nackgammon": "Nackgammon",
      "hypergammon": "Hypergammon (3 pieces)"}),
    ("Mancala", "games.mancala", "MancalaGame",
     "Ancient seed-sowing game",
     {"kalah": "Kalah (Standard)", "oware": "Oware (Awari)", "congkak": "Congkak"}),
    ("Nine Men's Morris", "games.morris", "MorrisGame",
     "Form mills to remove opponent's pieces",
     {"nine": "Nine Men's Morris", "six": "Six Men's Morris",
      "three": "Three Men's Morris", "twelve": "Twelve Men's Morris"}),
    ("Connect Four", "games.connect_four", "ConnectFourGame",
     "Drop pieces to connect four in a row",
     {"standard": "Standard (7x6)", "five": "Connect Five (9x7)",
      "pop_out": "Pop Out"}),
    ("Tic-Tac-Toe", "games.tictactoe", "TicTacToeGame",
     "Classic X's and O's",
     {"3x3": "Standard 3x3", "4x4": "4x4 Board", "5x5": "5x5 Board",
      "ultimate": "Ultimate Tic-Tac-Toe"}),
    ("Gomoku", "games.gomoku", "GomokuGame",
     "Get five in a row on a Go-style board",
     {"standard": "Standard Gomoku", "renju": "Renju (restricted rules)"}),
    ("Battleship", "games.battleship", "BattleshipGame",
     "Find and sink your opponent's fleet",
     {"standard": "Standard (10x10)", "small": "Small (7x7)"}),
    ("Snakes and Ladders", "games.snakes_ladders", "SnakesLaddersGame",
     "Race to the finish with snakes and ladders",
     {"standard": "Standard Board", "mini": "Mini Board (5x5)"}),
    ("Ludo", "games.ludo", "LudoGame",
     "Race your pieces around the board",
     {"standard": "Standard (2 players)", "four": "Standard (4 players)"}),
    ("Nim", "games.nim", "NimGame",
     "Strategic object removal game",
     {"standard": "Standard Nim", "misere": "Misère Nim (last takes loses)"}),
    ("Dots and Boxes", "games.dots_boxes", "DotsBoxesGame",
     "Complete boxes by drawing lines",
     {"3x3": "3x3 Grid", "4x4": "4x4 Grid", "5x5": "5x5 Grid"}),
    ("Hex", "games.hex", "HexGame",
     "Connect your sides of the board",
     {"7x7": "7x7 Board", "9x9": "9x9 Board", "11x11": "11x11 Board (Standard)"}),
    ("Pong Hau K'i", "games.pong_hau_ki", "PongHauKiGame",
     "Simple Chinese blocking game",
     {"standard": "Standard"}),
    ("Alquerque", "games.alquerque", "AlquerqueGame",
     "Ancient predecessor to checkers",
     {"standard": "Standard Alquerque"}),
    ("Fox and Hounds", "games.fox_hounds", "FoxHoundsGame",
     "Asymmetric chase game on a checkerboard",
     {"standard": "Standard"}),
    ("Tablut", "games.tablut", "TablutGame",
     "Viking strategy game (Hnefatafl family)",
     {"standard": "Standard Tablut", "brandubh": "Brandubh (7x7)"}),
    ("Quoridor", "games.quoridor", "QuoridorGame",
     "Block your opponent with walls while racing across",
     {"standard": "Standard (9x9, 10 walls)", "small": "Small (5x5, 5 walls)"}),
    ("Onitama", "games.onitama", "OnitamaGame",
     "Martial arts chess with movement cards",
     {"standard": "Standard Onitama"}),
    ("Amazons", "games.amazons", "AmazonsGame",
     "Move queens and shoot arrows to trap your opponent",
     {"standard": "Standard (10x10)", "small": "Small (6x6)"}),
    ("Breakthrough", "games.breakthrough", "BreakthroughGame",
     "Race your pieces to the other side",
     {"standard": "Standard (8x8)", "small": "Small (6x6)", "large": "Large (10x10)"}),
    ("Pentago", "games.pentago", "PentagoGame",
     "Place a marble then twist a quadrant",
     {"standard": "Standard Pentago"}),
    ("Konane", "games.konane", "KonaneGame",
     "Hawaiian jumping game",
     {"6x6": "6x6 Board", "8x8": "8x8 Board (Standard)"}),
    ("Fanorona", "games.fanorona", "FanoronaGame",
     "Malagasy capture game with approach and withdrawal",
     {"standard": "Standard (9x5)", "small": "Fanoron-Telo (3x3)"}),
    ("Surakarta", "games.surakarta", "SurakartaGame",
     "Javanese game with loop captures",
     {"standard": "Standard Surakarta"}),
    ("Dara", "games.dara", "DaraGame",
     "Nigerian three-in-a-row strategy game",
     {"standard": "Standard Dara"}),
    ("Wari", "games.wari", "WariGame",
     "West African seed-sowing strategy game",
     {"standard": "Standard Wari/Awale"}),
    ("Entropy", "games.entropy", "EntropyGame",
     "Chaos vs Order - place and arrange colored pieces",
     {"standard": "Standard (5x5)", "small": "Small (4x4)"}),
    ("Cathedral", "games.cathedral", "CathedralGame",
     "Territory game with polyomino pieces",
     {"standard": "Standard Cathedral", "simple": "Simple (fewer pieces)"}),
    ("Shobu", "games.shobu", "ShobuGame",
     "Push stones across four boards",
     {"standard": "Standard Shobu"}),
    ("Yinsh", "games.yinsh", "YinshGame",
     "GIPF project ring-sliding game",
     {"standard": "Standard Yinsh", "blitz": "Blitz (3 rings)"}),
    ("Tafl/Hnefatafl", "games.tafl", "TaflGame",
     "Viking board game - king escape vs capture",
     {"hnefatafl": "Hnefatafl (11x11)", "tawlbwrdd": "Tawlbwrdd (11x11)"}),
]


class MainMenu:
    """Main menu for the board game platform."""

    def run(self):
        while True:
            clear_screen()
            self.show_banner()
            choice = self.show_main_menu()
            if choice == 'q':
                clear_screen()
                print("Thanks for playing! Goodbye.")
                sys.exit(0)
            elif choice == 'r':
                self.resume_game_menu()
            elif choice == 'l':
                self.game_list_menu()
            elif choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(GAME_REGISTRY):
                    self.launch_game(idx)

    def show_banner(self):
        print("=" * 60)
        print("   ____                        ____                      _ ")
        print("  / ___| _   _ _ __   ___ _ __|  _ \\  ___   __ _ _ __ __| |")
        print("  \\___ \\| | | | '_ \\ / _ \\ '__| |_) |/ _ \\ / _` | '__/ _` |")
        print("   ___) | |_| | |_) |  __/ |  |  _ <| (_) | (_| | | | (_| |")
        print("  |____/ \\__,_| .__/ \\___|_|  |_| \\_\\\\___/ \\__,_|_|  \\__,_|")
        print("              |_|           Game Game                       ")
        print("=" * 60)
        print(f"  {len(GAME_REGISTRY)} Classic Board Games | Tutorials | Save & Resume")
        print("=" * 60)

    def show_main_menu(self):
        print("\n  MAIN MENU")
        print("  ---------")
        for i, (name, _, _, desc, _) in enumerate(GAME_REGISTRY):
            print(f"  {i+1:2}. {name:<24} - {desc}")
        print()
        print(f"  [R] Resume a saved game")
        print(f"  [L] List all games & variations")
        print(f"  [Q] Quit")
        print()
        return input("  Select (1-{}, R, L, Q): ".format(len(GAME_REGISTRY))).strip().lower()

    def game_list_menu(self):
        clear_screen()
        print("=" * 60)
        print("  ALL GAMES AND VARIATIONS")
        print("=" * 60)
        for name, _, _, desc, variations in GAME_REGISTRY:
            print(f"\n  {name}")
            print(f"  {'-'*len(name)}")
            print(f"  {desc}")
            print(f"  Variations:")
            for vkey, vname in variations.items():
                print(f"    - {vname}")
        print()
        input("  Press Enter to return to menu...")

    def launch_game(self, idx):
        entry = GAME_REGISTRY[idx]
        name, module_path, class_name, desc, variations = entry

        # Show game info and variation selection
        clear_screen()
        print(f"{'='*60}")
        print(f"  {name}")
        print(f"{'='*60}")
        print(f"  {desc}\n")

        # Variation selection
        variation_keys = list(variations.keys())
        if len(variations) > 1:
            print("  Select a variation:")
            for i, (vkey, vname) in enumerate(variations.items()):
                print(f"    {i+1}. {vname}")
            print(f"    [T] View tutorial first")
            print(f"    [B] Back to menu")
            print()
            choice = input("  Choice: ").strip().lower()
            if choice == 'b':
                return
            if choice == 't':
                self.show_tutorial(module_path, class_name, variation_keys[0])
                return self.launch_game(idx)
            try:
                vidx = int(choice) - 1
                if 0 <= vidx < len(variation_keys):
                    variation = variation_keys[vidx]
                else:
                    return
            except ValueError:
                return
        else:
            variation = variation_keys[0]
            print("  [P] Play")
            print("  [T] View tutorial first")
            print("  [B] Back to menu")
            choice = input("  Choice: ").strip().lower()
            if choice == 'b':
                return
            if choice == 't':
                self.show_tutorial(module_path, class_name, variation)
                return self.launch_game(idx)
            if choice != 'p':
                return

        # Load and start game
        try:
            mod = importlib.import_module(module_path)
            game_class = getattr(mod, class_name)
            game = game_class(variation=variation)
            game.play()
        except Exception as e:
            print(f"\nError loading game: {e}")
            import traceback
            traceback.print_exc()
            input("Press Enter to return to menu...")

    def show_tutorial(self, module_path, class_name, variation):
        try:
            mod = importlib.import_module(module_path)
            game_class = getattr(mod, class_name)
            game = game_class(variation=variation)
            clear_screen()
            print(game.get_tutorial())
            input("\nPress Enter to continue...")
        except Exception as e:
            print(f"Error loading tutorial: {e}")
            input("Press Enter to continue...")

    def resume_game_menu(self):
        clear_screen()
        print("=" * 60)
        print("  SAVED GAMES")
        print("=" * 60)

        if not os.path.exists(SAVE_DIR):
            print("\n  No saved games found.")
            input("  Press Enter to return to menu...")
            return

        saves = []
        for f in sorted(os.listdir(SAVE_DIR)):
            if f.endswith('.json'):
                filepath = os.path.join(SAVE_DIR, f)
                try:
                    with open(filepath) as fh:
                        data = json.load(fh)
                    saves.append((f, filepath, data))
                except Exception:
                    pass

        if not saves:
            print("\n  No saved games found.")
            input("  Press Enter to return to menu...")
            return

        for i, (fname, fpath, data) in enumerate(saves):
            ts = time.strftime('%Y-%m-%d %H:%M', time.localtime(data.get('timestamp', 0)))
            gname = data.get('game_name', 'Unknown')
            var = data.get('variation', '')
            turn = data.get('turn_number', 0)
            print(f"  {i+1}. {gname} ({var}) - Turn {turn} - {ts}")

        print(f"\n  [D] Delete a save")
        print(f"  [B] Back")
        choice = input("\n  Select save to resume: ").strip().lower()

        if choice == 'b':
            return
        if choice == 'd':
            dchoice = input("  Enter number to delete: ").strip()
            try:
                didx = int(dchoice) - 1
                if 0 <= didx < len(saves):
                    os.remove(saves[didx][1])
                    print("  Save deleted.")
                    input("  Press Enter to continue...")
            except (ValueError, OSError):
                pass
            return

        try:
            sidx = int(choice) - 1
            if 0 <= sidx < len(saves):
                self.resume_save(saves[sidx])
        except ValueError:
            pass

    def resume_save(self, save_tuple):
        fname, fpath, data = save_tuple
        game_type = data.get('game_type', '')

        # Find the game in registry
        module_path = '.'.join(game_type.split('.')[:-1])
        class_name = game_type.split('.')[-1]

        try:
            mod = importlib.import_module(module_path)
            game_class = getattr(mod, class_name)
            game = game_class(variation=data.get('variation', 'standard'))
            game.setup()
            game.current_player = data.get('current_player', 1)
            game.players = data.get('players', ["Player 1", "Player 2"])
            game.turn_number = data.get('turn_number', 0)
            game.move_history = data.get('move_history', [])
            game.load_state(data.get('game_state', {}))

            result = game.play()

            # Delete save file after game completes (suspended games create new saves)
            try:
                os.remove(fpath)
            except OSError:
                pass
        except Exception as e:
            print(f"Error resuming game: {e}")
            import traceback
            traceback.print_exc()
            input("Press Enter to return to menu...")
