"""Ağaç doğrulayıcı ve çizici: değişmezleri tek tek denetler, ağacı katman katman metne döker.

`check(tree)` bir bozukluk bulursa `InvariantError` fırlatır (iletide bütün bulgular yazar):
denge (her yaprak aynı derinlikte), sıra ve ayırıcı sınırları, doluluk (kök dışı >= capacity/4),
yaprak zinciri, anahtar sayacı ve sayfa muhasebesi (her sayfa ya ağaçta ya boş listede, sızıntı
yok).

Genişletme: yeni bir değişmez eklerken `_walk`'a bir denetim ve testlerde onu bozan bir örnek
ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .node import Node
from .tree import BPlusTree


class InvariantError(AssertionError):
    """B+ ağacı değişmezlerinden biri bozuk."""


@dataclass
class _Walk:
    problems: list[str] = field(default_factory=list)
    leaves: list[Node] = field(default_factory=list)
    leaf_depths: set[int] = field(default_factory=set)
    pages: list[int] = field(default_factory=list)


def _walk(
    tree: BPlusTree, page_id: int, lo: bytes | None, hi: bytes | None, depth: int, out: _Walk
) -> None:
    node = tree.load(page_id)
    out.pages.append(page_id)
    where = f"sayfa {page_id}"
    if any(a >= b for a, b in zip(node.keys, node.keys[1:], strict=False)):
        out.problems.append(f"{where}: anahtarlar kesin artan değil")
    for key in node.keys:
        if (lo is not None and key < lo) or (hi is not None and key >= hi):
            out.problems.append(f"{where}: {key!r} ayırıcı sınırlarının dışında")
    size = node.entries_size()
    is_root = page_id == tree.pager.root
    if size > tree.capacity:
        out.problems.append(f"{where}: taşmış ({size} > {tree.capacity})")
    if not is_root and size < tree.min_fill:
        out.problems.append(f"{where}: çeyrekten az dolu ({size} < {tree.min_fill})")
    if node.is_leaf:
        out.leaves.append(node)
        out.leaf_depths.add(depth)
        return
    if is_root and not node.keys:
        out.problems.append(f"{where}: iç kökün en az bir anahtarı olmalı")
    bounds = [lo, *node.keys, hi]
    for index, child in enumerate(node.children):
        _walk(tree, child, bounds[index], bounds[index + 1], depth + 1, out)


def check(tree: BPlusTree) -> None:
    """Bütün değişmezleri denetler; bozukluk varsa hepsini listeleyen InvariantError fırlatır."""
    out = _Walk()
    _walk(tree, tree.pager.root, None, None, 0, out)
    if len(out.leaf_depths) > 1:
        out.problems.append(f"denge bozuk: yaprak derinlikleri {sorted(out.leaf_depths)}")
    for left, right in zip(out.leaves, out.leaves[1:], strict=False):
        if left.next_leaf != right.page_id:
            out.problems.append(f"yaprak zinciri kopuk: {left.page_id} → {left.next_leaf}")
    if out.leaves and out.leaves[-1].next_leaf != 0:
        out.problems.append("son yaprağın sonraki işaretçisi 0 olmalı")
    keys = sum(len(leaf.keys) for leaf in out.leaves)
    if keys != len(tree):
        out.problems.append(f"anahtar sayacı {len(tree)}, ağaçta {keys} anahtar var")
    free = tree.pager.free_pages()
    used = out.pages + free
    if len(used) != len(set(used)):
        out.problems.append("bir sayfa hem ağaçta hem boş listede (ya da iki kez) görünüyor")
    if set(used) != set(range(1, tree.pager.page_count)):
        out.problems.append("sayfa sızıntısı: ne ağaçta ne boş listede olan sayfa var")
    if out.problems:
        raise InvariantError("; ".join(out.problems))


def height(tree: BPlusTree) -> int:
    """Kökten yaprağa düğüm sayısı (yalnız kök yapraksa 1)."""
    levels = 1
    node = tree.load(tree.pager.root)
    while not node.is_leaf:
        node = tree.load(node.children[0])
        levels += 1
    return levels


def render(tree: BPlusTree, max_keys: int = 4) -> str:
    """Ağacı katman katman çizer: `[s3 | b'k' b'm']` = 3. sayfa, ayırıcılar k ve m."""
    lines: list[str] = []
    level = [tree.pager.root]
    while level:
        nodes = [tree.load(page_id) for page_id in level]
        cells = []
        for node in nodes:
            shown = " ".join(key.decode(errors="replace") for key in node.keys[:max_keys])
            more = " …" if len(node.keys) > max_keys else ""
            cells.append(f"[s{node.page_id} | {shown}{more}]")
        lines.append("  ".join(cells))
        level = [child for node in nodes if not node.is_leaf for child in node.children]
    return "\n".join(lines)
