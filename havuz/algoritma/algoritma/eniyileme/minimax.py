"""Minimax + alfa-beta budama: iki kişilik, sıfır toplamlı oyunda en iyi hamle (örnek: XOX).

Fikir:
    Oyun ağacında X en büyüğü, O en küçüğü seçer; yapraklar +1 (X kazanır), 0, −1 (O kazanır).
    Alfa-beta: α = X'in garanti ettiği en iyi değer, β = O'nunki. Bir düğümde α ≥ β olunca kalan
    çocuklar sonucu değiştiremez (rakip bu dala izin vermez) ve atlanır. Sonuç minimax ile
    AYNIDIR; iyi hamle sırasıyla gezilen düğüm O(b^d)'den ~O(b^(d/2))'ye iner.
    Ölçüm (testte): XOX'ta boş tahtadan minimax 549 946 düğüm, alfa-beta ~18 000 düğüm gezer;
    değer 0'dır (iki taraf doğru oynarsa berabere). Tahta 9 karakterlik dizgidir: "X", "O", " ".

Karmaşıklık: minimax O(b^d), alfa-beta en iyi durumda O(b^(d/2)); yer O(d) (d = derinlik ≤ 9)
Ne zaman: küçük, tam bilgili iki kişilik oyunlar (XOX, Connect-4'ün sınırlı derinlikte hâli,
    satranç motorlarının çekirdeği + değerlendirme fonksiyonu).
Ne zaman değil: dallanma çok büyükse ve iyi bir değerlendirme fonksiyonu yoksa Monte Carlo
    ağaç araması (`mcts.py`).
Bağımlılık: yok
Özyineleme: derinlik ≤ 9 (boş kare sayısı).
Genişletme: başka oyun için `_winner`, hamle üretimi ve yaprak değerini değiştirin; derin
    oyunlarda derinlik sınırı + değerlendirme fonksiyonu ve aktarım tablosu (memo) ekleyin.

Örnek:
    >>> alphabeta("         ", "X")[0]  # boş tahta: berabere
    0
    >>> score, move, _ = alphabeta("XX OO    ", "X")  # X üçüncüyü koyup kazanır
    >>> score, move
    (1, 2)
"""

from __future__ import annotations

_LINES = ((0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6))


def winner(board: str) -> str | None:
    """ "X" ya da "O" kazandıysa onu, değilse None döndürür."""
    for a, b, c in _LINES:
        if board[a] != " " and board[a] == board[b] == board[c]:
            return board[a]
    return None


def _check(board: str, player: str) -> None:
    if len(board) != 9 or set(board) - {"X", "O", " "} or player not in ("X", "O"):
        raise ValueError("tahta 9 karakter ('X', 'O', ' ') ve oyuncu 'X' ya da 'O' olmalı")


def minimax(board: str, player: str) -> tuple[int, int, int]:
    """(değer X açısından, en iyi hamle (oyun bittiyse −1), gezilen düğüm sayısı) — budamasız."""
    _check(board, player)
    nodes = 0

    def value(state: str, turn: str) -> tuple[int, int]:
        nonlocal nodes
        nodes += 1
        won = winner(state)
        if won is not None:
            return (1 if won == "X" else -1), -1
        moves = [i for i, cell in enumerate(state) if cell == " "]
        if not moves:
            return 0, -1
        best: tuple[int, int] | None = None
        for move in moves:
            child, _ = value(state[:move] + turn + state[move + 1 :], "O" if turn == "X" else "X")
            if best is None or (child > best[0] if turn == "X" else child < best[0]):
                best = (child, move)
        assert best is not None
        return best

    score, move = value(board, player)
    return score, move, nodes


def alphabeta(board: str, player: str) -> tuple[int, int, int]:
    """minimax ile aynı değer ve hamle seçimi kuralı; budamalı. (değer, hamle, düğüm sayısı)."""
    _check(board, player)
    nodes = 0

    def value(state: str, turn: str, alpha: int, beta: int) -> tuple[int, int]:
        nonlocal nodes
        nodes += 1
        won = winner(state)
        if won is not None:
            return (1 if won == "X" else -1), -1
        moves = [i for i, cell in enumerate(state) if cell == " "]
        if not moves:
            return 0, -1
        best_move = moves[0]
        best = -2 if turn == "X" else 2
        for move in moves:
            child, _ = value(
                state[:move] + turn + state[move + 1 :], "O" if turn == "X" else "X", alpha, beta
            )
            if (child > best) if turn == "X" else (child < best):
                best, best_move = child, move
            if turn == "X":
                alpha = max(alpha, best)
            else:
                beta = min(beta, best)
            if alpha >= beta:
                break  # rakip bu dala izin vermez: kalan hamleler önemsiz
        return best, best_move

    score, move = value(board, player, -2, 2)
    return score, move, nodes
