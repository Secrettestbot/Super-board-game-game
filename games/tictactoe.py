"""Tic-Tac-Toe game with multiple variations."""

from engine.base import BaseGame, input_with_quit, clear_screen


class TicTacToeGame(BaseGame):
    """Tic-Tac-Toe with 3x3, 4x4, 5x5, and Ultimate variations."""

    name = "Tic-Tac-Toe"
    description = "Classic Tic-Tac-Toe with multiple board sizes and Ultimate mode"
    min_players = 2
    max_players = 2
    variations = {
        "3x3": "Standard 3x3 board, get 3 in a row to win",
        "4x4": "4x4 board, get 4 in a row to win",
        "5x5": "5x5 board, get 4 in a row to win",
        "ultimate": "9 sub-boards, must play in board matching opponent's last cell",
    }
    side_labels = ("X", "O")

    SYMBOLS = {0: " ", 1: "X", 2: "O"}

    def __init__(self, variation=None):
        super().__init__(variation or "3x3")

    # ------------------------------------------------------------------ setup
    def setup(self):
        if self.variation == "ultimate":
            # 9 sub-boards, each a 3x3 grid
            self.boards = [[0] * 9 for _ in range(9)]
            self.board_winners = [0] * 9  # winner of each sub-board
            self.active_board = None  # None means player can choose any board
            self.size = 3
            self.win_length = 3
        else:
            self.size = int(self.variation[0])  # 3, 4, or 5
            self.win_length = 3 if self.size == 3 else 4
            self.board = [0] * (self.size * self.size)
            self.active_board = None
            self.boards = None
            self.board_winners = None

    # --------------------------------------------------------------- display
    def display(self):
        symbols = self.SYMBOLS
        p = self.players[self.current_player - 1]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (X)  vs  {self.players[1]} (O)")
        print(f"  Current: {p} ({symbols[self.current_player]})\n")

        if self.variation == "ultimate":
            self._display_ultimate()
        else:
            self._display_standard()

    def _display_standard(self):
        s = self.SYMBOLS
        sz = self.size
        board = self.board
        # show numbered reference alongside the live board
        print("    Board                Reference")
        for r in range(sz):
            row_cells = []
            ref_cells = []
            for c in range(sz):
                idx = r * sz + c
                row_cells.append(f" {s[board[idx]]} ")
                ref_cells.append(f" {idx + 1} ")
            row_str = "|".join(row_cells)
            ref_str = "|".join(ref_cells)
            print(f"    {row_str}      {ref_str}")
            if r < sz - 1:
                sep = "-" * (sz * 4 - 1)
                print(f"    {sep}      {sep}")
        print()

    def _display_ultimate(self):
        s = self.SYMBOLS
        bw = self.board_winners

        # Show which board is active
        if self.active_board is not None:
            print(f"  >> You must play in board {self.active_board + 1} <<\n")
        else:
            print("  >> You may play in any open board <<\n")

        # Print the 3x3 mega-grid of sub-boards
        for mega_r in range(3):
            for sub_r in range(3):
                parts = []
                for mega_c in range(3):
                    b_idx = mega_r * 3 + mega_c
                    if bw[b_idx] != 0:
                        # Board already won: show winner symbol filling the row
                        sym = s[bw[b_idx]]
                        parts.append(f" {sym} | {sym} | {sym} ")
                    else:
                        cells = []
                        for sub_c in range(3):
                            cell_idx = sub_r * 3 + sub_c
                            cells.append(f" {s[self.boards[b_idx][cell_idx]]} ")
                        parts.append("|".join(cells))
                print("    " + " || ".join(parts))
            if mega_r < 2:
                print("    " + "=" * 47)

        # Board reference
        print("\n    Board reference:       Cell reference:")
        for r in range(3):
            b_row = " | ".join(str(r * 3 + c + 1) for c in range(3))
            c_row = " | ".join(str(r * 3 + c + 1) for c in range(3))
            print(f"      {b_row}                 {c_row}")
            if r < 2:
                print(f"      ---------                 ---------")
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        if self.variation == "ultimate":
            return self._get_move_ultimate()
        else:
            return self._get_move_standard()

    def _get_move_standard(self):
        sz = self.size
        while True:
            if sz == 3:
                raw = input_with_quit(
                    f"  {self.players[self.current_player - 1]}, enter cell (1-9): "
                )
            else:
                raw = input_with_quit(
                    f"  {self.players[self.current_player - 1]}, enter row,col (1-{sz}): "
                )
            raw = raw.strip()
            try:
                if "," in raw:
                    parts = raw.split(",")
                    r, c = int(parts[0]) - 1, int(parts[1]) - 1
                    if 0 <= r < sz and 0 <= c < sz:
                        return r * sz + c
                else:
                    idx = int(raw) - 1
                    if 0 <= idx < sz * sz:
                        return idx
            except (ValueError, IndexError):
                pass
            print(f"  Invalid input. ", end="")
            if sz == 3:
                print("Enter a number 1-9.")
            else:
                print(f"Enter row,col (each 1-{sz}) or cell number 1-{sz*sz}.")

    def _get_move_ultimate(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter board,cell (e.g. 5,3): "
            )
            raw = raw.strip()
            try:
                parts = raw.split(",")
                board_num = int(parts[0]) - 1
                cell_num = int(parts[1]) - 1
                if 0 <= board_num < 9 and 0 <= cell_num < 9:
                    return (board_num, cell_num)
            except (ValueError, IndexError):
                pass
            print("  Invalid input. Enter board,cell (each 1-9), e.g. '5,3'.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False
        if self.variation == "ultimate":
            return self._make_move_ultimate(move)
        else:
            return self._make_move_standard(move)

    def _make_move_standard(self, idx):
        if self.board[idx] != 0:
            return False
        self.board[idx] = self.current_player
        return True

    def _make_move_ultimate(self, move):
        board_idx, cell_idx = move
        # Check board constraint
        if self.active_board is not None and board_idx != self.active_board:
            print(f"  You must play in board {self.active_board + 1}!")
            return False
        # Can't play in a won board
        if self.board_winners[board_idx] != 0:
            print("  That board is already won!")
            return False
        # Cell must be empty
        if self.boards[board_idx][cell_idx] != 0:
            return False

        self.boards[board_idx][cell_idx] = self.current_player

        # Check if this move won the sub-board
        winner = self._check_3x3_winner(self.boards[board_idx])
        if winner:
            self.board_winners[board_idx] = winner

        # Set active board for next player
        if self.board_winners[cell_idx] != 0 or all(
            c != 0 for c in self.boards[cell_idx]
        ):
            # Sent to a won or full board: next player can go anywhere
            self.active_board = None
        else:
            self.active_board = cell_idx
        return True

    # ------------------------------------------------------------- get_ai_move
    def get_ai_move(self):
        import random as rand
        difficulty = getattr(self, 'ai_difficulty', 'medium')
        if self.variation == "ultimate":
            return self._ai_move_ultimate(difficulty)
        return self._ai_move_standard(difficulty)

    def _ai_move_standard(self, difficulty):
        import random as rand
        sz = self.size
        wl = self.win_length
        me = self.current_player
        opp = 3 - me
        empty = [i for i in range(sz * sz) if self.board[i] == 0]
        if not empty:
            return empty[0] if empty else 0

        if difficulty == 'easy':
            return rand.choice(empty)

        if difficulty == 'hard' and sz == 3:
            best_score = -999
            best_move = empty[0]
            for idx in empty:
                self.board[idx] = me
                s = self._minimax(self.board, sz, wl, opp, me, False, 0, -999, 999)
                self.board[idx] = 0
                if s > best_score:
                    best_score = s
                    best_move = idx
            return best_move

        scored = []
        for idx in empty:
            score = 0.0
            r, c = idx // sz, idx % sz
            cr, cc = (sz - 1) / 2.0, (sz - 1) / 2.0
            score += (1.0 - (abs(r - cr) + abs(c - cc)) / sz) * 2

            self.board[idx] = me
            if self._check_winner(self.board, sz, wl) == me:
                self.board[idx] = 0
                return idx
            self.board[idx] = 0

            self.board[idx] = opp
            if self._check_winner(self.board, sz, wl) == opp:
                self.board[idx] = 0
                score += 50
            self.board[idx] = 0

            lines = self._get_lines_through(idx, sz, wl)
            for line in lines:
                vals = [self.board[i] for i in line]
                my_count = vals.count(me)
                opp_count = vals.count(opp)
                if opp_count == 0 and my_count > 0:
                    score += my_count * 1.5
                if my_count == 0 and opp_count > 0:
                    score += opp_count * 1.0

            scored.append((score, idx))

        scored.sort(key=lambda x: -x[0])
        if difficulty == 'medium':
            top = scored[:max(1, len(scored) // 3)]
            return rand.choice(top)[1]
        return scored[0][1]

    def _minimax(self, board, sz, wl, current, ai, is_max, depth, alpha, beta):
        w = self._check_winner(board, sz, wl)
        if w == ai:
            return 10 - depth
        if w == (3 - ai):
            return depth - 10
        empty = [i for i in range(sz * sz) if board[i] == 0]
        if not empty:
            return 0
        if is_max:
            best = -999
            for idx in empty:
                board[idx] = current
                val = self._minimax(board, sz, wl, 3 - current, ai, False, depth + 1, alpha, beta)
                board[idx] = 0
                best = max(best, val)
                alpha = max(alpha, val)
                if beta <= alpha:
                    break
            return best
        else:
            best = 999
            for idx in empty:
                board[idx] = current
                val = self._minimax(board, sz, wl, 3 - current, ai, True, depth + 1, alpha, beta)
                board[idx] = 0
                best = min(best, val)
                beta = min(beta, val)
                if beta <= alpha:
                    break
            return best

    @staticmethod
    def _get_lines_through(idx, sz, wl):
        r, c = idx // sz, idx % sz
        lines = []
        dirs = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for dr, dc in dirs:
            for start in range(wl):
                line = []
                sr, sc = r - dr * start, c - dc * start
                valid = True
                for i in range(wl):
                    nr, nc = sr + dr * i, sc + dc * i
                    if not (0 <= nr < sz and 0 <= nc < sz):
                        valid = False
                        break
                    line.append(nr * sz + nc)
                if valid and idx in line:
                    lines.append(line)
        return lines

    def _ai_move_ultimate(self, difficulty):
        import random as rand
        me = self.current_player
        opp = 3 - me

        if self.active_board is not None:
            valid_boards = [self.active_board]
        else:
            valid_boards = [i for i in range(9)
                           if self.board_winners[i] == 0
                           and any(c == 0 for c in self.boards[i])]

        if not valid_boards:
            for i in range(9):
                if any(c == 0 for c in self.boards[i]):
                    valid_boards = [i]
                    break
            if not valid_boards:
                return (0, 0)

        all_moves = []
        for bi in valid_boards:
            for ci in range(9):
                if self.boards[bi][ci] == 0:
                    all_moves.append((bi, ci))

        if not all_moves:
            return (0, 0)

        if difficulty == 'easy':
            return rand.choice(all_moves)

        scored = []
        for bi, ci in all_moves:
            score = 0.0
            self.boards[bi][ci] = me
            if self._check_3x3_winner(self.boards[bi]) == me:
                score += 50
                bw_copy = self.board_winners[:]
                bw_copy[bi] = me
                if self._check_3x3_winner(bw_copy) == me:
                    score += 200
            self.boards[bi][ci] = 0

            self.boards[bi][ci] = opp
            if self._check_3x3_winner(self.boards[bi]) == opp:
                score += 40
            self.boards[bi][ci] = 0

            if ci == 4:
                score += 3
            elif ci in (0, 2, 6, 8):
                score += 2

            if self.board_winners[ci] != 0 or all(c != 0 for c in self.boards[ci]):
                score += 2
            else:
                opp_can_win = False
                for oci in range(9):
                    if self.boards[ci][oci] == 0:
                        self.boards[ci][oci] = opp
                        if self._check_3x3_winner(self.boards[ci]) == opp:
                            opp_can_win = True
                        self.boards[ci][oci] = 0
                if opp_can_win:
                    score -= 5

            scored.append((score, bi, ci))

        scored.sort(key=lambda x: -x[0])
        if difficulty == 'medium':
            top = scored[:max(1, len(scored) // 3)]
            _, bi, ci = rand.choice(top)
        else:
            _, bi, ci = scored[0]
        return (bi, ci)

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        if self.variation == "ultimate":
            self._check_game_over_ultimate()
        else:
            self._check_game_over_standard()

    def _check_game_over_standard(self):
        winner = self._check_winner(self.board, self.size, self.win_length)
        if winner:
            self.game_over = True
            self.winner = winner
            return
        if all(c != 0 for c in self.board):
            self.game_over = True
            self.winner = None

    def _check_game_over_ultimate(self):
        # Check if someone won the meta-board
        winner = self._check_3x3_winner(self.board_winners)
        if winner:
            self.game_over = True
            self.winner = winner
            return
        # Draw if all sub-boards are won or full
        all_done = True
        for i in range(9):
            if self.board_winners[i] == 0 and any(c == 0 for c in self.boards[i]):
                all_done = False
                break
        if all_done:
            self.game_over = True
            self.winner = None

    # -------------------------------------------------------- winner helpers
    @staticmethod
    def _check_winner(board, size, win_length):
        """Check for a winner on a flat board of given size."""
        lines = []
        # rows
        for r in range(size):
            for c in range(size - win_length + 1):
                lines.append([r * size + c + i for i in range(win_length)])
        # columns
        for c in range(size):
            for r in range(size - win_length + 1):
                lines.append([(r + i) * size + c for i in range(win_length)])
        # diag down-right
        for r in range(size - win_length + 1):
            for c in range(size - win_length + 1):
                lines.append([(r + i) * size + (c + i) for i in range(win_length)])
        # diag down-left
        for r in range(size - win_length + 1):
            for c in range(win_length - 1, size):
                lines.append([(r + i) * size + (c - i) for i in range(win_length)])

        for line in lines:
            vals = [board[idx] for idx in line]
            if vals[0] != 0 and all(v == vals[0] for v in vals):
                return vals[0]
        return 0

    @staticmethod
    def _check_3x3_winner(board):
        """Check winner on a standard 3x3 board (flat list of 9)."""
        wins = [
            (0, 1, 2), (3, 4, 5), (6, 7, 8),  # rows
            (0, 3, 6), (1, 4, 7), (2, 5, 8),  # cols
            (0, 4, 8), (2, 4, 6),              # diags
        ]
        for a, b, c in wins:
            if board[a] != 0 and board[a] == board[b] == board[c]:
                return board[a]
        return 0

    # ----------------------------------------------------------- state / save
    def get_state(self):
        state = {
            "variation": self.variation,
            "size": self.size if hasattr(self, "size") else 3,
            "win_length": self.win_length if hasattr(self, "win_length") else 3,
        }
        if self.variation == "ultimate":
            state["boards"] = [b[:] for b in self.boards]
            state["board_winners"] = self.board_winners[:]
            state["active_board"] = self.active_board
        else:
            state["board"] = self.board[:]
        return state

    def load_state(self, state):
        self.variation = state["variation"]
        self.size = state.get("size", 3)
        self.win_length = state.get("win_length", 3)
        if self.variation == "ultimate":
            self.boards = [b[:] for b in state["boards"]]
            self.board_winners = state["board_winners"][:]
            self.active_board = state["active_board"]
            self.board = None
        else:
            self.board = state["board"][:]
            self.boards = None
            self.board_winners = None
            self.active_board = None

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                    TIC-TAC-TOE  TUTORIAL
==============================================================

OVERVIEW
  Two players take turns placing their marks (X and O) on a
  grid.  The goal is to form an unbroken line of your marks.

--------------------------------------------------------------
VARIATION: 3x3  (Standard)
--------------------------------------------------------------
  Board : 3 rows x 3 columns (9 cells).
  Goal  : Get 3 of your marks in a row (horizontal, vertical,
          or diagonal).
  Input : Enter a cell number 1-9:
              1 | 2 | 3
             -----------
              4 | 5 | 6
             -----------
              7 | 8 | 9

--------------------------------------------------------------
VARIATION: 4x4
--------------------------------------------------------------
  Board : 4 rows x 4 columns (16 cells).
  Goal  : Get 4 in a row.
  Input : Enter row,col (each 1-4) or a cell number 1-16.

--------------------------------------------------------------
VARIATION: 5x5
--------------------------------------------------------------
  Board : 5 rows x 5 columns (25 cells).
  Goal  : Get 4 in a row.
  Input : Enter row,col (each 1-5) or a cell number 1-25.

--------------------------------------------------------------
VARIATION: Ultimate Tic-Tac-Toe
--------------------------------------------------------------
  Board : A 3x3 mega-grid where each cell contains a smaller
          3x3 Tic-Tac-Toe board (9 sub-boards total).

  Goal  : Win 3 sub-boards in a row on the mega-grid.

  Rules :
    1. On your turn you place your mark in ONE cell of ONE
       sub-board.
    2. The cell you choose determines which sub-board your
       opponent must play in next.  For example, if you play
       in cell 5 of any sub-board, your opponent must play
       in sub-board 5.
    3. If the target sub-board is already won or completely
       filled, the opponent may choose any open sub-board.
    4. A sub-board is won by the normal 3-in-a-row rule.
    5. The overall game is won by claiming 3 sub-boards in a
       row on the mega-grid.

  Input : Enter board,cell (each 1-9), e.g. "5,3" means
          board 5, cell 3.

  Board numbering (both boards and cells):
              1 | 2 | 3
             -----------
              4 | 5 | 6
             -----------
              7 | 8 | 9

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
