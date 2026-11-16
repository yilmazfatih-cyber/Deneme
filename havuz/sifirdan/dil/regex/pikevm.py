"""Pike VM: NFA programını eşzamanlı durum kümesiyle çalıştırır (geri izleme YOK).

Her metin konumunda öncelik sırasıyla bir "iş parçacığı" listesi tutulur; her iş parçacığı bir
komut ve kendi yakalama konumlarıdır. ε-geçişler (SPLIT/JMP/SAVE/ASSERT/ENTER/BACK) `add`
içinde açık bir yığınla izlenir; aynı adımda aynı duruma ikinci kez gelinmez (`visited`).
Böylece adım başına iş program boyuyla (× iç içe döngü düzeyi) sınırlıdır: toplam süre
O(metin × desen) — `(a+)+b` gibi felaket desenlerde bile doğrusal. Öncelik sırası korunduğu
için sonuç, Python `re`'nin (geri izleyen) sonucuyla aynıdır.
Genişletme: yeni çapa türü için `assertion_holds` içine bir dal ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass

from .compiler import ANY, ASSERT, BACK, CHAR, CLASS, ENTER, JMP, MATCH, SAVE, SPLIT, Inst
from .nodes import CharClass, is_word

Caps = tuple[int | None, ...]
CONSUMERS = (CHAR, ANY, CLASS, MATCH)


@dataclass
class Stats:
    """Ölçüm: toplam iş parçacığı adımı (doğrusallık testinde kullanılır)."""

    steps: int = 0


def assertion_holds(kind: object, text: str, pos: int) -> bool:
    n = len(text)
    if kind == "^" or kind == "A":
        return pos == 0
    if kind == "Z":
        return pos == n
    if kind == "$":  # Python: metin sonunda ya da sondaki tek "\n"den hemen önce
        return pos == n or (pos == n - 1 and text[pos] == "\n")
    before = pos > 0 and is_word(text[pos - 1])
    after = pos < n and is_word(text[pos])
    return (before != after) == (kind == "b")


def add(
    prog: list[Inst],
    threads: list[tuple[int, Caps]],
    visited: set[object],
    start_pc: int,
    caps: Caps,
    text: str,
    pos: int,
) -> None:
    """`start_pc`'den ε-geçişlerle ulaşılan tüketici komutları öncelik sırasıyla ekler."""
    stack: list[tuple[int, Caps, frozenset[int]]] = [(start_pc, caps, frozenset())]
    while stack:
        pc, caps, entered = stack.pop()
        inst = prog[pc]
        op = inst.op
        # Ziyaret anahtarı: tüketici komutta yalnız konum; ε-komutta (konum, açık döngüler) —
        # aynı komuta "bu ε-yolunda girilmiş döngüler" farklıyken gelmek farklı bir durumdur.
        key: object = pc if op in CONSUMERS else (pc, entered)
        if key in visited:
            continue
        visited.add(key)
        if op == JMP:
            stack.append((inst.x, caps, entered))
        elif op == SPLIT:
            stack.append((inst.y, caps, entered))  # düşük öncelik önce itilir, sonra çıkar
            stack.append((inst.x, caps, entered))
        elif op == SAVE:
            slot = inst.x
            stack.append((pc + 1, (*caps[:slot], pos, *caps[slot + 1 :]), entered))
        elif op == ASSERT:
            if assertion_holds(inst.arg, text, pos):
                stack.append((pc + 1, caps, entered))
        elif op == ENTER:
            stack.append((pc + 1, caps, entered | {inst.x}))
        elif op == BACK:
            loop = inst.arg
            assert isinstance(loop, int)
            target = inst.y if loop in entered else inst.x  # boş tur: döngüden çık
            stack.append((target, caps, entered - {loop}))
        else:
            threads.append((pc, caps))


def consumes(inst: Inst, ch: str) -> bool:
    if inst.op == CHAR:
        return inst.arg == ch
    if inst.op == ANY:
        return ch != "\n"
    if inst.op == CLASS:
        assert isinstance(inst.arg, CharClass)
        return inst.arg.matches(ch)
    return False


def run(
    prog: list[Inst],
    ngroups: int,
    text: str,
    start: int,
    *,
    anchored: bool,
    full: bool,
    reject_empty_at: int | None = None,
    stats: Stats | None = None,
) -> Caps | None:
    """`start`'tan başlayarak en soldaki (ve öncelikli) eşleşmenin yakalama konumlarını döndürür.

    anchored: yalnız `start`'ta başlayan eşleşme (match/fullmatch); full: eşleşme metin sonunda
    bitmeli (fullmatch); reject_empty_at: o konumda başlayan BOŞ eşleşme sayılmaz (findall/sub
    boş eşleşmeden sonra ilerlesin diye — `re`'nin kuralı).
    """
    empty: Caps = (None,) * (2 * (ngroups + 1))
    n = len(text)
    clist: list[tuple[int, Caps]] = []
    add(prog, clist, set(), 0, empty, text, start)
    best: Caps | None = None
    pos = start
    while True:
        nlist: list[tuple[int, Caps]] = []
        visited: set[object] = set()
        ch = text[pos] if pos < n else ""
        for pc, caps in clist:
            if stats is not None:
                stats.steps += 1
            inst = prog[pc]
            if inst.op == MATCH:
                if full and pos != n:
                    continue
                if reject_empty_at is not None and caps[0] == pos == reject_empty_at:
                    continue
                best = caps
                break  # daha düşük öncelikli iş parçacıkları kesilir
            if ch and consumes(inst, ch):
                add(prog, nlist, visited, pc + 1, caps, text, pos + 1)
        if pos >= n:
            break
        if best is None and not anchored:
            add(prog, nlist, visited, 0, empty, text, pos + 1)
        elif not nlist:
            break  # ne süren iş parçacığı ne de yeni başlangıç var
        clist = nlist
        pos += 1
    return best
