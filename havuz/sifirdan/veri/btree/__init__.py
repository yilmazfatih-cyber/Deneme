"""btree: sayfalı dosya üstünde B+ ağacı (yalnız standart kitaplık).

Kullanım:
    from btree import BPlusTree, check
    tree = BPlusTree.open("agac.db", page_size=4096)
    tree.put(b"elma", b"1")
    list(tree.range(b"a", b"f"))   # [(b"elma", b"1")]
    check(tree)                     # değişmezler bozuksa InvariantError
    tree.close()

Genişletme: yeni bir genel API ekleyince buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .invariants import InvariantError, check, height, render
from .pager import Pager, PagerError
from .tree import BPlusTree

__all__ = ["BPlusTree", "InvariantError", "Pager", "PagerError", "check", "height", "render"]
