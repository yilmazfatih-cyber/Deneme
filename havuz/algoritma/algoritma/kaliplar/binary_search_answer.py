"""Kalıp — yanıt üzerinde ikili arama: "en küçük yeterli / en büyük mümkün" değeri ara.

Fikir:
    Yanıtı doğrudan bulmak zor ama "yanıt X olabilir mi?" sorusu kolaysa (açgözlü bir denetim),
    ve bu soru TEKDÜZE ise (X yeterliyse X'ten büyük her değer de yeterlidir), olası yanıt
    aralığında ikili arama yapılır: O(log aralık) kez denetim çağrılır. Denetim genellikle
    açgözlü bir tarama (O(n)) olduğundan toplam O(n log aralık).
    Kurgu: (1) yanıtın alt ve üst sınırını bul, (2) `feasible(x)` yaz, (3) ilk True'yu (en küçük
    yeterli) ya da son True'yu (en büyük mümkün) ara.
    Akla gelmeli: "en büyüğün en küçüğü", "en küçüğün en büyüğü", "en az kapasite/hız/süre",
    "en az k parça olacak şekilde en uzun".

Karmaşıklık: O(denetim · log(üst − alt)); yer denetimin yeri kadar
Ne zaman: denetim tekdüze ve ucuz; yanıt aralığı büyük (10⁹'a kadar bile 30 adım).
Ne zaman değil: denetim tekdüze değilse (X olur ama X+1 olmaz, X+2 olur) ikili arama yanlış yanıt
    verir; o zaman DP ya da tam tarama.
Bağımlılık: yok (ikili aramanın kısa kopyası içeride; tam sürüm:
    `algoritma/siralama/binary_search.py`)
Genişletme: gerçel yanıtlarda tamsayı aralığı yerine sabit sayıda (ör. 100) yarılama yapın.

Örnek:
    >>> min_largest_workload([30, 10, 40, 20, 50], 2)  # [30, 10, 40] | [20, 50]
    80
    >>> max_min_tower_gap([1, 2, 4, 8, 9], 3), longest_equal_piece([802, 743, 457, 539], 11)
    (3, 200)
"""

from __future__ import annotations

from collections.abc import Callable, Sequence


def first_true(lo: int, hi: int, feasible: Callable[[int], bool]) -> int:
    """İSKELET: [lo, hi] içinde feasible'ın True olduğu en küçük değer (hiç yoksa hi + 1).

    feasible tekdüze olmalı: False … False True … True.
    """
    hi += 1
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo


def min_largest_workload(chapters: Sequence[int], translators: int) -> int:
    """Problem: Bir kitabın bölümleri (sayfa sayılarıyla) sırayla `translators` çevirmene
    dağıtılacak; her çevirmen ARDIŞIK bölümler alır, sıra bozulmaz. En çok sayfa alan çevirmenin
    yükü en az ne olabilir?
    Denetim (limit yeterli mi?): soldan topla, limit aşılınca yeni çevirmene geç; çevirmen sayısı
    yetiyorsa evet. Limit büyüdükçe gereken çevirmen azalır: tekdüze.
    """
    if translators < 1 or not chapters:
        raise ValueError("en az bir çevirmen ve bir bölüm gerekir")

    def enough(limit: int) -> bool:
        used, load = 1, 0
        for pages in chapters:
            if load + pages > limit:
                used, load = used + 1, 0
            load += pages
        return used <= translators

    return first_true(max(chapters), sum(chapters), enough)


def max_min_tower_gap(positions: Sequence[int], towers: int) -> int:
    """Problem: Bir sahil yolu boyunca uygun konumlar (km) verili. `towers` cankurtaran kulesi
    bu konumlara kurulacak; birbirine en yakın iki kule arasındaki mesafe EN BÜYÜK ne olabilir?
    Denetim (en az d aralıkla kurulabilir mi?): soldan açgözlü kur. d büyüdükçe zorlaşır, bu yüzden
    "d yapılamaz" sorusu tekdüzedir; ilk yapılamayan d'nin bir eksiği yanıttır.
    """
    if not 2 <= towers <= len(positions):
        raise ValueError("kule sayısı 2 ile konum sayısı arasında olmalı")
    spots = sorted(positions)

    def impossible(gap: int) -> bool:
        count, last = 1, spots[0]
        for spot in spots[1:]:
            if spot - last >= gap:
                count, last = count + 1, spot
        return count < towers

    return first_true(1, spots[-1] - spots[0] + 1, impossible) - 1


def longest_equal_piece(boards: Sequence[int], pieces: int) -> int:
    """Problem: Bir marangozun elindeki tahtaların boyları (cm) verili. En az `pieces` tane EŞİT
    boylu parça kesilecek (tahtalar birleştirilemez, artanlar atılır). Parça boyu en çok kaç cm
    (tam sayı) olabilir? Hiç olmuyorsa 0.
    Denetim: L boyla Σ ⌊tahta / L⌋ ≥ pieces mi? L büyüdükçe parça sayısı azalır.
    """
    if pieces < 1:
        raise ValueError("en az bir parça gerekir")
    longest = max(boards, default=0)
    too_long = first_true(1, longest + 1, lambda size: sum(b // size for b in boards) < pieces)
    return too_long - 1
