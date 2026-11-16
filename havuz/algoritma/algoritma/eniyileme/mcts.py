"""Monte Carlo ağaç araması (UCT, temel): rastgele oyunlarla en iyi hamleyi tahmin eder.

Fikir:
    Her yinelemede dört adım: (1) Seçim: tüm çocukları açılmış düğümlerde UCT puanı en yüksek
    çocuğa in: kazanma_oranı + c · √(ln(ebeveyn_ziyaret) / çocuk_ziyaret) — ilk terim sömürü,
    ikincisi keşif. (2) Genişletme: denenmemiş bir hamleyle yeni çocuk aç. (3) Benzetim: oyun
    bitene dek RASTGELE oyna. (4) Geri yayma: sonucu yol boyunca istatistiklere ekle (her düğüm,
    kendisine hamle yapan oyuncunun bakışından kazanç tutar). Sonunda kökte en çok ziyaret
    edilen hamle seçilir; değerlendirme fonksiyonu GEREKMEZ.
    Örnek oyun "taş alma": sırayla 1–3 taş alınır, son taşı alan kazanır; kuramsal doğru hamle
    yığını 4'ün katına indirmektir.

Karmaşıklık: zaman O(yineleme · (ağaç derinliği + benzetim uzunluğu)); yer O(açılan düğüm)
Ne zaman: dallanması büyük ve iyi değerlendirme fonksiyonu olmayan oyunlar (Go, kart oyunları),
    planlama problemleri; "her an durdurulabilir" (anytime) karar gerektiğinde.
Ne zaman değil: küçük oyunlarda kesin sonuç için `minimax.py`; tek oyunculu en iyilemede
    `simulated_annealing.py` daha basittir. Rastgele benzetim gürültülüdür — ölçüm (testlerde):
    taş almada 15 taşa kadar 10 000 yineleme doğru hamleyi buluyor, 18–19 taşta bulamıyor.
Bağımlılık: yok
Genişletme: başka oyun için `Game` protokolünü (`moves`, `play`, `winner`, `to_move`) uygulayan
    bir sınıf yazın; `TakeStones` örneğini kopyalayın.

Örnek:
    >>> import random
    >>> mcts_best_move(TakeStones(), 10, iterations=3000, rng=random.Random(1))  # 10 → 8: 4'ün katı
    2
"""

from __future__ import annotations

import math
import random
from collections.abc import Hashable
from typing import Generic, Protocol, TypeVar

S = TypeVar("S", bound=Hashable)


class Game(Protocol[S]):
    """MCTS'nin bir oyundan beklediği arayüz (oyuncular 0 ve 1)."""

    def moves(self, state: S) -> list[int]: ...
    def play(self, state: S, move: int) -> S: ...
    def winner(self, state: S) -> int | None: ...
    def to_move(self, state: S) -> int: ...


class TakeStones:
    """Durum: (kalan taş, sıradaki oyuncu). 1–3 taş alınır; son taşı alan kazanır."""

    def moves(self, state: tuple[int, int]) -> list[int]:
        return [k for k in (1, 2, 3) if k <= state[0]]

    def play(self, state: tuple[int, int], move: int) -> tuple[int, int]:
        return state[0] - move, 1 - state[1]

    def winner(self, state: tuple[int, int]) -> int | None:
        return 1 - state[1] if state[0] == 0 else None  # son hamleyi yapan kazandı

    def to_move(self, state: tuple[int, int]) -> int:
        return state[1]


class _Node(Generic[S]):
    __slots__ = ("children", "move", "parent", "state", "untried", "visits", "wins")

    def __init__(self, state: S, parent: _Node[S] | None, move: int, untried: list[int]) -> None:
        self.state, self.parent, self.move = state, parent, move
        self.children: list[_Node[S]] = []
        self.untried = untried
        self.visits = 0
        self.wins = 0.0  # bu düğüme hamle yapan oyuncunun kazanç toplamı


def mcts(
    game: Game[S], root_state: S, iterations: int, rng: random.Random, exploration: float = 1.4
) -> dict[int, int]:
    """Kök hamlelerinin ziyaret sayıları (çok ziyaret = iyi hamle)."""
    root: _Node[S] = _Node(root_state, None, -1, game.moves(root_state))
    for _ in range(iterations):
        node = root
        while not node.untried and node.children:  # 1. seçim (UCT)
            log_n = math.log(node.visits)
            node = max(
                node.children,
                key=lambda c: c.wins / c.visits + exploration * math.sqrt(log_n / c.visits),
            )
        if node.untried:  # 2. genişletme
            move = node.untried.pop(rng.randrange(len(node.untried)))
            state = game.play(node.state, move)
            child = _Node(state, node, move, game.moves(state))
            node.children.append(child)
            node = child
        state = node.state  # 3. benzetim
        while game.winner(state) is None and game.moves(state):
            state = game.play(state, rng.choice(game.moves(state)))
        result = game.winner(state)
        current: _Node[S] | None = node
        while current is not None:  # 4. geri yayma
            current.visits += 1
            mover = 1 - game.to_move(current.state)  # bu duruma getiren hamleyi yapan oyuncu
            current.wins += 1.0 if result == mover else (0.5 if result is None else 0.0)
            current = current.parent
    return {child.move: child.visits for child in root.children}


def mcts_best_move(
    game: TakeStones, stones: int, iterations: int = 2000, rng: random.Random | None = None
) -> int:
    """Taş alma oyununda, sıradaki oyuncu için MCTS'nin önerdiği hamle."""
    visits = mcts(game, (stones, 0), iterations, rng if rng is not None else random.Random(0))
    return max(visits, key=lambda move: (visits[move], -move))
