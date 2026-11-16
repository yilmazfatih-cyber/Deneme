"""Euler yolu (Hierholzer): her kenardan tam bir kez geçen yolu/devreyi bulur.

Fikir:
    Varlık koşulu (kenarlı köşeler tek bileşende olmak üzere):
      * Yönsüz: tek dereceli köşe sayısı 0 (devre) ya da 2 (yol, bu ikisinden birinden başlar).
      * Yönlü: her köşede giren = çıkan; ya da tam bir köşede çıkan − giren = 1 (başlangıç) ve
        tam bir köşede giren − çıkan = 1 (bitiş).
    Hierholzer: başlangıçtan kullanılmamış kenarlarla takılana dek yürü; takılınca köşeyi yola
    yaz ve geri çekil; geri çekilirken kullanılmamış kenarı olan köşeden yeni bir tur başlat.
    Yığınla yazılmış bu sürümde yol TERS sırayla oluşur; sonda çevrilir. Kenar sayısı m+1 köşe
    çıkmazsa kenarlar bağlı değildir ve yol yoktur.

Karmaşıklık: zaman O(n + m); yer O(n + m)
Ne zaman: "kalemi kaldırmadan çiz", posta dağıtıcısı turu, De Bruijn dizisi, DNA birleştirme.
Ne zaman değil: her KÖŞEDEN bir kez geçmek (Hamilton yolu) bambaşka ve NP-zor bir sorudur
    (bkz. `tsp_held_karp.py`).
Bağımlılık: yok
Genişletme: kenar kimlikleriyle yol gerekiyorsa yığına (köşe, gelinen kenar) çiftleri koyun.

Örnek:
    >>> euler_path_undirected(4, [(0, 1), (1, 2), (2, 0), (2, 3)])
    [2, 1, 0, 2, 3]
    >>> euler_path_directed(3, [(0, 1), (1, 2), (2, 0)]), euler_path_directed(3, [(0, 1), (0, 2)])
    ([0, 1, 2, 0], None)
"""

from __future__ import annotations

from collections.abc import Sequence


def euler_path_directed(n: int, edges: Sequence[tuple[int, int]]) -> list[int] | None:
    """Yönlü Euler yolu (köşe dizisi, uzunluk m+1); yoksa None. Kenarsız grafta []."""
    if not edges:
        return []
    out_edges: list[list[int]] = [[] for _ in range(n)]
    balance = [0] * n  # çıkan − giren
    for u, v in edges:
        out_edges[u].append(v)
        balance[u] += 1
        balance[v] -= 1
    starts = [v for v in range(n) if balance[v] == 1]
    ends = [v for v in range(n) if balance[v] == -1]
    if any(abs(b) > 1 for b in balance) or len(starts) > 1 or len(starts) != len(ends):
        return None
    start = starts[0] if starts else edges[0][0]
    pointer = [0] * n
    stack, path = [start], []
    while stack:
        v = stack[-1]
        if pointer[v] < len(out_edges[v]):
            stack.append(out_edges[v][pointer[v]])
            pointer[v] += 1
        else:
            path.append(stack.pop())
    return path[::-1] if len(path) == len(edges) + 1 else None


def euler_path_undirected(n: int, edges: Sequence[tuple[int, int]]) -> list[int] | None:
    """Yönsüz Euler yolu (köşe dizisi, uzunluk m+1); yoksa None. Kenarsız grafta []."""
    if not edges:
        return []
    adj: list[list[tuple[int, int]]] = [[] for _ in range(n)]
    for edge_id, (u, v) in enumerate(edges):
        adj[u].append((v, edge_id))
        adj[v].append((u, edge_id))  # öz döngü (u == v) iki kez eklenir: derece 2 artar
    odd = [v for v in range(n) if len(adj[v]) % 2 == 1]
    if len(odd) not in (0, 2):
        return None
    start = odd[0] if odd else edges[0][0]
    used = [False] * len(edges)
    pointer = [0] * n
    stack, path = [start], []
    while stack:
        v = stack[-1]
        while pointer[v] < len(adj[v]) and used[adj[v][pointer[v]][1]]:
            pointer[v] += 1
        if pointer[v] == len(adj[v]):
            path.append(stack.pop())
        else:
            w, edge_id = adj[v][pointer[v]]
            used[edge_id] = True
            stack.append(w)
    return path[::-1] if len(path) == len(edges) + 1 else None
