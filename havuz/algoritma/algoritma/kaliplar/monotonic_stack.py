"""Kalıp — tekdüze yığın: "sağdaki/soldaki ilk büyük (küçük) öğe" sorularına toplam O(n)'de yanıt.

Fikir:
    Yığında, henüz "kendisinden büyüğünü bulamamış" öğelerin dizinleri tutulur; değerleri yığının
    dibinden tepesine AZALAN sıradadır. Yeni öğe geldiğinde, ondan küçük olan tepe öğeler için
    aranan "sağdaki ilk büyük" bulunmuştur: çıkarılırlar ve yanıtları yazılır. Sonra yeni öğe
    yığına girer. Her dizin bir kez girip bir kez çıktığından toplam O(n).
    Aynı kalıp "soldaki ilk küçük" (önceki küçük) için karşılaştırmayı çevirerek çalışır; ikisi
    birlikte, bir öğenin "en küçük olduğu en geniş aralığı" verir (histogram, alt dizi minimumları).
    Akla gelmeli: "bir sonraki daha büyük", "kaç gün sonra", "görüş engellenene dek", "en büyük
    dikdörtgen", "her alt dizinin en küçüğü/en büyüğü toplamı".

Karmaşıklık: O(n); ek yer O(n)
Ne zaman: her öğe için en yakın büyük/küçük komşu ya da onun sınırladığı aralık gerekiyorsa.
Ne zaman değil: kayan sabit bir pencerenin en büyüğü gerekiyorsa tekdüze KUYRUK
    (`algoritma/cesitli/sliding_window_max.py`).
Bağımlılık: yok
Genişletme: eşitlikleri hangi tarafa sayacağınızı (< ya da ≤) iki yönde farklı seçin; aksi hâlde
    eşit öğeli aralıklar iki kez sayılır (`sum_of_window_minimums`'ta görüldüğü gibi).

Örnek:
    >>> next_greater_index([3, 1, 4, 1, 5])
    [2, 2, 4, 4, -1]
    >>> visible_to_the_right([5, 2, 3, 6, 1]), largest_poster_area([2, 1, 5, 6, 2, 3])
    ([2, 0, 0, 1, 0], 10)
    >>> sum_of_window_minimums([3, 1, 2, 4])
    17
"""

from __future__ import annotations

from collections.abc import Sequence


def next_greater_index(values: Sequence[float]) -> list[int]:
    """İSKELET: her i için sağdaki ilk KESİN büyük öğenin dizini (yoksa −1)."""
    answer = [-1] * len(values)
    stack: list[int] = []  # değerleri dipten tepeye azalan (eşit olabilir) dizinler
    for i, value in enumerate(values):
        while stack and values[stack[-1]] < value:
            answer[stack.pop()] = i
        stack.append(i)
    return answer


def visible_to_the_right(heights: Sequence[float]) -> list[int]:
    """Problem: Bir caddede binalar soldan sağa sıralı. Her binanın çatısından sağa bakan biri,
    kendi boyuna EŞİT ya da daha yüksek ilk binaya kadar (o hariç) kaç binayı görür?
    (Daha yüksek bina yoksa sağdaki tüm binaları görür.)
    Çözüm: sağdaki ilk "büyük-eşit" dizin bulunur; aradaki bina sayısı yanıttır.
    """
    n = len(heights)
    blocker = [n] * n
    stack: list[int] = []
    for i, height in enumerate(heights):
        while stack and heights[stack[-1]] <= height:
            blocker[stack.pop()] = i
        stack.append(i)
    return [blocker[i] - i - 1 for i in range(n)]


def largest_poster_area(shelf_heights: Sequence[int]) -> int:
    """Problem: Bir duvara yan yana, genişliği 1 metre olan raflar dizilmiş; her rafın üstünde
    duvarın boş kalan yüksekliği verili. Rafların üstüne, birden çok rafa yayılabilen dikdörtgen
    bir afiş asılacak (afiş altındaki hiçbir boşluktan yüksek olamaz). En büyük afiş alanı?
    Çözüm: her rafın yüksekliğinin "en küçük" olduğu en geniş aralık, önceki ve sonraki daha
    kısa rafla sınırlanır; yığından çıkarken bu aralık bilinir.
    """
    best = 0
    stack: list[int] = []  # yükseklikleri artan dizinler
    extended = [*shelf_heights, 0]  # sonda 0: kalan her şeyi yığından boşalt
    for i, height in enumerate(extended):
        while stack and extended[stack[-1]] >= height:
            top = stack.pop()
            left = stack[-1] if stack else -1
            best = max(best, extended[top] * (i - left - 1))
        stack.append(i)
    return best


def sum_of_window_minimums(temperatures: Sequence[int]) -> int:
    """Problem: Günlük en düşük sıcaklıklar verili. Her ardışık gün diliminin "dilimin en soğuk
    günü" değerlerinin TOPLAMI nedir? (n(n+1)/2 dilim var; tek tek gezmek O(n²).)
    Çözüm: her gün, solundaki ilk KESİN küçük ve sağındaki ilk KÜÇÜK-EŞİT günle sınırlanan
    dilimlerin en küçüğüdür; katkısı değer × (sol seçenek) × (sağ seçenek). Eşitlikte bir yana
    kesin, öbür yana eşitli karşılaştırma, her dilimin tam bir kez sayılmasını sağlar.
    """
    n = len(temperatures)
    left_limit = [-1] * n  # soldaki ilk kesin küçük
    right_limit = [n] * n  # sağdaki ilk küçük-eşit
    stack: list[int] = []
    for i, value in enumerate(temperatures):
        while stack and temperatures[stack[-1]] >= value:
            right_limit[stack.pop()] = i
        left_limit[i] = stack[-1] if stack else -1
        stack.append(i)
    return sum(temperatures[i] * (i - left_limit[i]) * (right_limit[i] - i) for i in range(n))
