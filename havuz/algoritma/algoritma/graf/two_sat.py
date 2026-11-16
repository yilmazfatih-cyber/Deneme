"""2-SAT: her koşulu "A veya B" olan mantık formülünü doğrusal zamanda çözer.

Fikir:
    Her x değişkeni için iki düğüm vardır: "x doğru" ve "x yanlış". (A ∨ B) koşulu iki çıkarım
    demektir: ¬A → B ve ¬B → A; bunlar yönlü kenar olur. Formül ancak ve ancak hiçbir x için
    "x" ile "¬x" aynı güçlü bağlı bileşende değilse sağlanabilir. Atama: bileşen grafının
    topolojik sırasında "x" düğümü "¬x"ten SONRA geliyorsa x = doğru. Tarjan bileşenleri ters
    topolojik sırayla verdiği için bu, comp[x] < comp[¬x] demektir.
    İçerideki Tarjan özyinelemesizdir (bkz. `tarjan_scc.py`).

Karmaşıklık: zaman O(n + m) (n değişken, m koşul); yer O(n + m)
Ne zaman: ikili seçimler arasında "ikisinden biri", "en çok biri", "ikisi birlikte" türü
    kısıtlar (nöbet çizelgesi, harita etiketi yerleşimi, evet/hayır yapılandırmaları).
Ne zaman değil: üç ya da daha çok değişkenli koşullar (3-SAT) NP-zordur; bu yöntem çalışmaz.
Bağımlılık: yok
Genişletme: "tam olarak biri" = (A ∨ B) ve (¬A ∨ ¬B); "x zorunlu doğru" = `require(x, True)`.

Örnek:
    >>> sat = TwoSat(3)
    >>> sat.add_clause(0, True, 1, True)    # x0 ∨ x1
    >>> sat.add_clause(0, False, 1, False)  # ¬x0 ∨ ¬x1  (tam olarak biri)
    >>> sat.require(1, True)
    >>> sat.add_clause(2, False, 0, True)   # x2 → x0
    >>> sat.solve()
    [False, True, False]
"""

from __future__ import annotations


class TwoSat:
    """n mantık değişkeni (0 … n−1) üstünde 2-SAT çözücü."""

    def __init__(self, n: int) -> None:
        self._n = n
        self._adj: list[list[int]] = [[] for _ in range(2 * n)]

    @staticmethod
    def _node(var: int, value: bool) -> int:
        return 2 * var + (0 if value else 1)

    def add_clause(self, a: int, a_value: bool, b: int, b_value: bool) -> None:
        """(x_a == a_value) ∨ (x_b == b_value) koşulunu ekler."""
        node_a, node_b = self._node(a, a_value), self._node(b, b_value)
        self._adj[node_a ^ 1].append(node_b)  # ¬A → B
        self._adj[node_b ^ 1].append(node_a)  # ¬B → A

    def require(self, var: int, value: bool) -> None:
        """x_var == value olmak zorunda."""
        self.add_clause(var, value, var, value)

    def solve(self) -> list[bool] | None:
        """Sağlayan bir atama ya da (çelişkiliyse) None."""
        comp = self._components()
        result = []
        for var in range(self._n):
            if comp[2 * var] == comp[2 * var + 1]:
                return None
            result.append(comp[2 * var] < comp[2 * var + 1])
        return result

    def _components(self) -> list[int]:
        """Tarjan (özyinelemesiz): comp[v] ters topolojik sırada bileşen numarası."""
        size = len(self._adj)
        index, low, comp = [-1] * size, [0] * size, [-1] * size
        on_stack = [False] * size
        stack: list[int] = []
        counter = count = 0
        for root in range(size):
            if index[root] != -1:
                continue
            index[root] = low[root] = counter
            counter += 1
            stack.append(root)
            on_stack[root] = True
            work = [(root, 0)]
            while work:
                v, i = work[-1]
                if i < len(self._adj[v]):
                    work[-1] = (v, i + 1)
                    w = self._adj[v][i]
                    if index[w] == -1:
                        index[w] = low[w] = counter
                        counter += 1
                        stack.append(w)
                        on_stack[w] = True
                        work.append((w, 0))
                    elif on_stack[w]:
                        low[v] = min(low[v], index[w])
                    continue
                work.pop()
                if work:
                    low[work[-1][0]] = min(low[work[-1][0]], low[v])
                if low[v] == index[v]:
                    while True:
                        w = stack.pop()
                        on_stack[w] = False
                        comp[w] = count
                        if w == v:
                            break
                    count += 1
        return comp
