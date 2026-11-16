"""Kalıp — DP durumu tasarlama: "geleceği belirlemek için geçmişten neyi bilmem gerekiyor?"

Fikir:
    Dinamik programlamanın zor kısmı formül değil DURUM seçimidir. Tarif:
      1. Kararları sıraya koy (gün gün, ev ev, basamak basamak).
      2. Bir sonraki kararın geçerliliği ve maliyeti için geçmişten neyin bilinmesi gerektiğini
         sor: "son rengi", "art arda kaç gün", "kaç basamak kaldı". Durum = (konum, o bilgi).
      3. Geçişi yaz: durum → olası kararlar → sonraki durum. Başlangıç ve bitiş durumlarını belirle.
      4. Durum sayısı × geçiş sayısı = karmaşıklık; çok büyükse bilgiyi sıkıştır.
      5. Yanıtın KENDİSİ isteniyorsa her durumda seçilen kararı sakla ve sondan geri yürü.
    Önce tanımı doğrudan özyinelemeyle (önbellekli) yazmak, sonra tabloya çevirmek güvenlidir.
    Akla gelmeli: "kaç yolla", "en az/en çok … öyle ki komşular/art arda … olmasın", seçimler
    birbirini yalnız sınırlı bir geçmişle etkiliyorsa.

Karmaşıklık: O(durum sayısı × geçiş başına seçenek); yer O(durum sayısı) (geri izleme için)
Ne zaman: alt problemler örtüşüyor ve en iyi çözüm alt problemlerin en iyilerinden kuruluyor.
Ne zaman değil: durum uzayı patlıyorsa (ör. "hangi öğeleri seçtim" kümesi büyükse) ve n büyükse
    → sezgisel/yaklaşık yöntemler; tüm çözümler isteniyorsa geri izleme.
Bağımlılık: yok
Genişletme: yeni bir problem için önce `durum = (…)` satırını yorum olarak yazın; geçişi ondan
    türetin; kaba kuvvetle küçük girdide karşılaştırın (testlerdeki gibi).

Örnek:
    >>> stair_ways(5, broken={2})  # 0 → 5, 1 ya da 2 basamak; 2. basamak kırık
    2
    >>> paint_signs([[17, 2, 17], [16, 16, 5], [14, 3, 19]])
    (10, [1, 2, 1])
    >>> work_plan([5, 1, 6, 8, 2], max_streak=2)
    (19, [True, False, True, True, False])
"""

from __future__ import annotations

from collections.abc import Sequence


def stair_ways(steps: int, broken: set[int]) -> int:
    """Problem: n basamaklı bir merdivende bazı basamaklar kırık (basılamaz). Her adımda 1 ya da 2
    basamak çıkılır. Zeminden (0) en üste (n) kaç farklı yolla çıkılır?
    Durum: (bulunduğum basamak). Geçiş: ways[i] = ways[i−1] + ways[i−2] (i kırık değilse).
    """
    if steps < 0:
        raise ValueError("basamak sayısı negatif olamaz")
    ways = [0] * (steps + 1)
    ways[0] = 1
    for i in range(1, steps + 1):
        if i in broken:
            continue
        ways[i] = ways[i - 1] + (ways[i - 2] if i >= 2 else 0)
    return ways[steps]


def paint_signs(costs: Sequence[Sequence[int]]) -> tuple[int, list[int]]:
    """Problem: Bir sokaktaki n dükkânın tabelası k renkten biriyle boyanacak; costs[i][r] = i.
    dükkânı r rengine boyamanın fiyatı. Yan yana iki dükkân aynı renk olamaz. En ucuz plan?
    Durum: (dükkân, son kullanılan renk). best[i][r] = costs[i][r] + min_{q ≠ r} best[i−1][q].
    Geri izleme: her durumda seçilen önceki renk saklanır.
    """
    if not costs:
        return 0, []
    k = len(costs[0])
    if k < 2 and len(costs) > 1:
        raise ValueError("komşular farklı renk olacaksa en az 2 renk gerekir")
    best = [list(costs[0])]
    came_from: list[list[int]] = [[-1] * k]
    for i in range(1, len(costs)):
        row, links = [], []
        for r in range(k):
            q = min((q for q in range(k) if q != r), key=lambda q: best[i - 1][q])
            row.append(costs[i][r] + best[i - 1][q])
            links.append(q)
        best.append(row)
        came_from.append(links)
    color = min(range(k), key=lambda r: best[-1][r])
    total = best[-1][color]
    plan = [color]
    for i in range(len(costs) - 1, 0, -1):
        color = came_from[i][color]
        plan.append(color)
    return total, plan[::-1]


def work_plan(earnings: Sequence[int], max_streak: int) -> tuple[int, list[bool]]:
    """Problem: Bir mevsimlik işçi her gün ya çalışır (o günün kazancı) ya da dinlenir; sağlığı
    için art arda en çok `max_streak` gün çalışabilir. En çok toplam kazanç ve hangi günler?
    Durum: (gün, şu ana dek art arda çalışılan gün sayısı s). Geçiş: dinlen → s = 0;
    çalış → s + 1 (yalnız s < max_streak ise).
    """
    if max_streak < 0:
        raise ValueError("art arda gün sınırı negatif olamaz")
    minus = float("-inf")
    best = [0.0] + [minus] * max_streak  # best[s]: bugüne dek, son s gün çalışılmış
    history: list[list[int]] = []  # her gün, her s için bir önceki s
    for gain in earnings:
        new = [minus] * (max_streak + 1)
        link = [-1] * (max_streak + 1)
        for s, value in enumerate(best):
            if value == minus:
                continue
            if value > new[0]:  # dinlen
                new[0], link[0] = value, s
            if s < max_streak and value + gain > new[s + 1]:  # çalış
                new[s + 1], link[s + 1] = value + gain, s
        best = new
        history.append(link)
    streak = max(range(max_streak + 1), key=lambda s: best[s])
    total = int(best[streak])
    plan: list[bool] = []
    for links in reversed(history):
        plan.append(streak > 0)
        streak = links[streak]
    return total, plan[::-1]
