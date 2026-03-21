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
    ("Dominoes", "games.dominoes", "DominoesGame",
     "Classic tile matching game",
     {"block": "Block Game (no boneyard)", "draw": "Draw Game (draw from boneyard)"}),
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
    ("Abalone", "games.abalone", "AbaloneGame",
     "Push opponent's marbles off the hexagonal board",
     {"standard": "Standard Abalone (14 marbles each)",
      "small": "Small (9 marbles each, smaller board)"}),
    ("Xiangqi", "games.xiangqi", "XiangqiGame",
     "Chinese Chess - ancient strategy game",
     {"standard": "Standard Xiangqi", "small": "Half-board Xiangqi"}),
    ("Shogi", "games.shogi", "ShogiGame",
     "Japanese Chess with piece drops",
     {"standard": "Standard Shogi (9x9)", "mini": "Mini Shogi (5x5)"}),
    ("Pente", "games.pente", "PenteGame",
     "Five in a row with custodial captures",
     {"standard": "Standard Pente (19x19)", "small": "Small Pente (13x13)"}),
    ("Royal Game of Ur", "games.ur", "UrGame",
     "Ancient Mesopotamian race game",
     {"standard": "Standard Rules", "simple": "Simplified (5 pieces)"}),
    ("Hive", "games.hive", "HiveGame",
     "Insect-themed tile placement game",
     {"standard": "Standard Hive", "pocket": "Hive Pocket (with Mosquito & Ladybug)"}),
    ("Tak", "games.tak", "TakGame",
     "Build roads and control the board with stacks",
     {"5x5": "5x5 Board (Standard)", "4x4": "4x4 Board (Quick)", "6x6": "6x6 Board (Advanced)"}),
    ("Mastermind", "games.mastermind", "MastermindGame",
     "Code-breaking deduction game",
     {"standard": "Standard (4 pegs, 6 colors)", "super": "Super (5 pegs, 8 colors)",
      "mini": "Mini (3 pegs, 4 colors)"}),
    ("Quarto", "games.quarto", "QuartoGame",
     "Place pieces with shared attributes -- opponent picks your piece",
     {"standard": "Standard Quarto (lines only)", "advanced": "Advanced (lines + 2x2 squares)"}),
    ("Senet", "games.senet", "SenetGame",
     "Ancient Egyptian race game -- the oldest board game",
     {"standard": "Standard Senet (Kendall rules)", "simple": "Simplified (no special squares)"}),
    ("DVONN", "games.dvonn", "DvonnGame",
     "GIPF project stacking strategy game",
     {"standard": "Standard DVONN (49 spaces)", "quick": "Quick DVONN (smaller board)"}),
    ("Havannah", "games.havannah", "HavannahGame",
     "Hexagonal connection game -- form a ring, bridge, or fork",
     {"base4": "Base 4 (37 cells, quick)", "base5": "Base 5 (61 cells, standard)",
      "base6": "Base 6 (91 cells, advanced)", "base8": "Base 8 (169 cells, tournament)"}),
    ("Yote", "games.yote", "YoteGame",
     "West African capture game with bonus removal",
     {"standard": "Standard (5x6 board, 12 pieces)", "small": "Small (4x5 board, 8 pieces)"}),
    ("Kamisado", "games.kamisado", "KamisadoGame",
     "Color-based movement restriction strategy game",
     {"standard": "Standard Kamisado", "sumo": "Sumo Kamisado (best of 3, push mechanic)"}),
    ("Santorini", "games.santorini", "SantoriniGame",
     "Move workers and build towers -- reach the top to win",
     {"standard": "Standard Santorini", "simple": "Simple (no god powers)"}),
    ("TwixT", "games.twixt", "TwixTGame",
     "Connection game with knight-move peg links",
     {"standard": "Standard (24x24)", "small": "Small (12x12)"}),
    ("ZÈRTZ", "games.zertz", "ZertzGame",
     "GIPF project marble capture on a shrinking board",
     {"standard": "Standard (37 spaces)", "quick": "Quick (19 spaces)"}),
    ("Quixo", "games.quixo", "QuixoGame",
     "Slide border cubes to get five in a row",
     {"standard": "Standard 5x5 Quixo"}),
    ("Mijnlieff", "games.mijnlieff", "MijnlieffGame",
     "Tactical placement where your piece restricts your opponent",
     {"standard": "Standard Mijnlieff"}),
    ("Carnac", "games.carnac", "CarnacGame",
     "Domino placement with connected group scoring",
     {"standard": "Standard Carnac (6x7)", "small": "Small Carnac (5x5)"}),
    ("Blokus Duo", "games.blokus", "BlokusDuoGame",
     "Polyomino tile placement with corner adjacency",
     {"standard": "Standard Blokus Duo (14x14)", "small": "Mini Blokus (10x10, fewer pieces)"}),
    ("Stratego", "games.stratego", "StrategoGame",
     "Hidden-information military strategy game",
     {"standard": "Standard Stratego (10x10)", "quick": "Quick Stratego (8x8, fewer pieces)"}),
    ("Ataxx", "games.ataxx", "AtaxxGame",
     "Territory control with cloning and jumping",
     {"standard": "Standard Ataxx (7x7)", "small": "Small Ataxx (5x5)"}),
    ("Azul", "games.azul", "AzulGame",
     "Tile-drafting pattern-building game",
     {"standard": "Standard Azul", "simple": "Simplified (3 colors, smaller board)"}),
    ("Kalah", "games.kalah", "KalahGame",
     "Mancala variant with capture and extra-turn mechanics",
     {"standard": "Standard Kalah (6 pits, 4 seeds)", "large": "Large Kalah (6 pits, 6 seeds)",
      "small": "Small Kalah (4 pits, 3 seeds)"}),
    ("Splendor", "games.splendor", "SplendorGame",
     "Gem-trading engine-building game",
     {"standard": "Standard Splendor (15 points)", "quick": "Quick Game (10 points)"}),
    ("Blockade", "games.blockade", "BlockadeGame",
     "Wall-placement race game",
     {"standard": "Standard Blockade (11x14)", "small": "Small Blockade (7x8)"}),
    ("Cribbage", "games.cribbage", "CribbageGame",
     "Classic card game with pegging and hand scoring",
     {"standard": "Standard Cribbage (121 points)", "short": "Short Game (61 points)"}),
    ("Lines of Action", "games.lines_of_action", "LinesOfActionGame",
     "Connect all your pieces into one group",
     {"standard": "Standard (8x8)", "scrambled": "Scrambled Eggs (alternate start)"}),
    ("Hearts", "games.hearts", "HeartsGame",
     "Classic trick-taking card game -- avoid hearts",
     {"standard": "Standard Hearts (100 points)", "short": "Short Game (50 points)"}),
    ("Chinese Checkers", "games.chinese_checkers", "ChineseCheckersGame",
     "Hop and jump across the star-shaped board",
     {"standard": "Standard (10-piece triangles)", "small": "Small (6-piece triangles)"}),
    ("Yahtzee", "games.yahtzee", "YahtzeeGame",
     "Classic dice game with scoring categories",
     {"standard": "Standard Yahtzee", "triple": "Triple Yahtzee (3 score columns)"}),
    ("Tsuro", "games.tsuro", "TsuroGame",
     "Path-building tile game -- stay on the board",
     {"standard": "Standard Tsuro (6x6)", "small": "Small Tsuro (4x4)"}),
    ("Coup", "games.coup", "CoupGame",
     "Bluffing and deduction card game",
     {"standard": "Standard Coup", "reformation": "Reformation (with Inquisitor)"}),
    ("Lost Cities", "games.lost_cities", "LostCitiesGame",
     "Expedition card game -- risk vs reward",
     {"standard": "Standard Lost Cities", "extended": "Extended (6 expeditions)"}),
    ("Othello", "games.othello", "OthelloGame",
     "Classic disc-flipping strategy with valid move display",
     {"standard": "Standard (8x8)", "6x6": "Quick (6x6)", "10x10": "Grand (10x10)"}),
    ("Spades", "games.spades", "SpadesGame",
     "Trick-taking card game with bidding and trumps",
     {"standard": "Standard Spades (500 points)", "short": "Short Game (200 points)"}),
    ("Shut the Box", "games.shut_the_box", "ShutTheBoxGame",
     "Dice and tiles number-matching game",
     {"standard": "Standard (tiles 1-9)", "twelve": "Extended (tiles 1-12)"}),
    ("Pickomino", "games.pickomino", "PickominoGame",
     "Dice-rolling tile-claiming worm game",
     {"standard": "Standard Pickomino", "simple": "Simple (fewer tiles)"}),
    ("Gin Rummy", "games.gin_rummy", "GinRummyGame",
     "Classic card game with melds and knocking",
     {"standard": "Standard Gin Rummy", "oklahoma": "Oklahoma Gin (variable knock value)"}),
    ("Rummikub", "games.rummikub", "RummikubGame",
     "Tile rummy with table rearrangement",
     {"standard": "Standard Rummikub", "simple": "Simple (no jokers)"}),
    ("Mille Bornes", "games.mille_bornes", "MilleBornesGame",
     "French card racing game with hazards and safeties",
     {"standard": "Standard Mille Bornes (1000 km)", "short": "Short Race (700 km)"}),
    ("Boggle", "games.boggle", "BoggleGame",
     "Word-finding in a grid of letter dice",
     {"standard": "Standard Boggle (4x4)", "big": "Big Boggle (5x5)"}),
]


class MainMenu:
    """Main menu for the board game platform."""

    GAMES_PER_PAGE = 15

    def run(self):
        self.page = 0
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
            elif choice == 'n':
                total_pages = (len(GAME_REGISTRY) + self.GAMES_PER_PAGE - 1) // self.GAMES_PER_PAGE
                if self.page < total_pages - 1:
                    self.page += 1
            elif choice == 'p':
                if self.page > 0:
                    self.page -= 1
            elif choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(GAME_REGISTRY):
                    self.launch_game(idx)
                else:
                    print(f"\n  Invalid selection. Enter 1-{len(GAME_REGISTRY)}.")
                    input("  Press Enter to continue...")

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
        total = len(GAME_REGISTRY)
        total_pages = (total + self.GAMES_PER_PAGE - 1) // self.GAMES_PER_PAGE
        start = self.page * self.GAMES_PER_PAGE
        end = min(start + self.GAMES_PER_PAGE, total)

        print(f"\n  GAMES (Page {self.page + 1}/{total_pages})")
        print("  ---------")
        for i in range(start, end):
            name, _, _, desc, _ = GAME_REGISTRY[i]
            print(f"  {i+1:2}. {name:<24} - {desc}")
        print()
        nav_parts = []
        if self.page > 0:
            nav_parts.append("[P] Prev page")
        if self.page < total_pages - 1:
            nav_parts.append("[N] Next page")
        if nav_parts:
            print(f"  {' | '.join(nav_parts)}")
        print(f"  [R] Resume a saved game")
        print(f"  [L] List all games & variations")
        print(f"  [Q] Quit")
        print()
        return input(f"  Select (1-{total}, R, L, Q): ").strip().lower()

    def game_list_menu(self):
        page = 0
        games_per_page = 8
        total_pages = (len(GAME_REGISTRY) + games_per_page - 1) // games_per_page

        while True:
            clear_screen()
            start = page * games_per_page
            end = min(start + games_per_page, len(GAME_REGISTRY))

            print("=" * 60)
            print(f"  ALL GAMES AND VARIATIONS (Page {page + 1}/{total_pages})")
            print("=" * 60)
            for i in range(start, end):
                name, _, _, desc, variations = GAME_REGISTRY[i]
                print(f"\n  {i+1:2}. {name}")
                print(f"      {desc}")
                for vkey, vname in variations.items():
                    print(f"        - {vname}")
            print()
            nav_parts = []
            if page > 0:
                nav_parts.append("[P] Prev")
            if page < total_pages - 1:
                nav_parts.append("[N] Next")
            nav_parts.append("[B] Back to menu")
            print(f"  {' | '.join(nav_parts)}")
            print(f"  Or enter a game number (1-{len(GAME_REGISTRY)}) to play")
            print()
            choice = input("  Choice: ").strip().lower()

            if choice == 'b':
                return
            elif choice == 'n' and page < total_pages - 1:
                page += 1
            elif choice == 'p' and page > 0:
                page -= 1
            elif choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(GAME_REGISTRY):
                    self.launch_game(idx)
                    return
                else:
                    print(f"\n  Invalid selection. Enter 1-{len(GAME_REGISTRY)}.")
                    input("  Press Enter to continue...")
            else:
                print(f"\n  Invalid choice.")
                input("  Press Enter to continue...")

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
                    print(f"\n  Invalid choice. Enter 1-{len(variation_keys)}.")
                    input("  Press Enter to continue...")
                    return self.launch_game(idx)
            except ValueError:
                print(f"\n  Invalid choice.")
                input("  Press Enter to continue...")
                return self.launch_game(idx)
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
                print("\n  Invalid choice. Enter P, T, or B.")
                input("  Press Enter to continue...")
                return self.launch_game(idx)

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
        while True:
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
            choice = input("\n  Select save to resume (1-{}, D, B): ".format(len(saves))).strip().lower()

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
                    else:
                        print(f"  Invalid selection. Enter 1-{len(saves)}.")
                        input("  Press Enter to continue...")
                except ValueError:
                    print("  Invalid input.")
                    input("  Press Enter to continue...")
                except OSError as e:
                    print(f"  Error deleting save: {e}")
                    input("  Press Enter to continue...")
                continue  # Loop back to show updated list

            try:
                sidx = int(choice) - 1
                if 0 <= sidx < len(saves):
                    self.resume_save(saves[sidx])
                    return
                else:
                    print(f"\n  Invalid selection. Enter 1-{len(saves)}.")
                    input("  Press Enter to continue...")
            except ValueError:
                print("\n  Invalid input.")
                input("  Press Enter to continue...")

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
            game._resumed = True

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
