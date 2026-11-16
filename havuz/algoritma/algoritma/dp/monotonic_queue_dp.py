"""Tekdüze kuyrukla DP en iyilemesi: "son k durumun en iyisi" geçişini O(1)'e indirir.

Fikir:
    Problem (özgün): Bir patikada n durak var, her durağın puanı (negatif olabilir) belli.
    0. duraktan başlayıp son durağa varmalısınız; bir adımda en çok k durak ileri atlayabilirsiniz.
    Uğradığınız durakların puan toplamını en büyükleyin ve hangi duraklara uğradığınızı söyleyin.
    DP: best[i] = puan[i] + max(best[i−k … i−1]). Doğrudan hesap O(n · k)'dır. Tekdüze
    (monotonic) kuyruk, penceredeki dizinleri best değerleri AZALAN sırada tutar: yeni dizin
    eklenmeden önce ondan kötü olanlar sondan atılır (artık asla en iyi olamazlar), pencereden
    çıkan dizin baştan atılır. Böylece pencerenin en iyisi hep kuyruğun başındadır; her dizin
    bir kez girip bir kez çıktığından toplam O(n). Seçilen öncüller saklanıp yol geri izlenir.

Karmaşıklık: zaman O(n); yer O(n)
Ne zaman: geçişi "kayan bir penceredeki en iyi önceki durum" olan DP'ler (sınırlı atlama,
    zaman pencereli plan, kısıtlı alt dizi toplamı).
Ne zaman değil: pencere yoksa (tüm öncekiler) basit bir "şimdiye kadarki en iyi" değişkeni
    yeter; geçiş doğrusal fonksiyonlarsa dışbükey örtü hilesi (convex hull trick) gerekir.
Bağımlılık: yok
Genişletme: yalnız pencere en büyüğü gerekiyorsa `algoritma/cesitli/sliding_window_max.py`.

Örnek:
    >>> max_score_path([2, -5, -2, 4, -1, 3], 2)
    (7, [0, 2, 3, 5])
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence


def max_score_path(scores: Sequence[float], max_jump: int) -> tuple[float, list[int]]:
    """(en büyük toplam, uğranan duraklar). Atlama en çok `max_jump` durak; 0 ve son durak dahil."""
    if not scores:
        raise ValueError("en az bir durak gerekir")
    if max_jump < 1:
        raise ValueError("atlama uzunluğu en az 1 olmalı")
    n = len(scores)
    best = [0.0] * n
    previous = [-1] * n
    best[0] = scores[0]
    window: deque[int] = deque([0])  # best değeri azalan dizinler
    for i in range(1, n):
        while window[0] < i - max_jump:  # pencereden düşenler
            window.popleft()
        previous[i] = window[0]
        best[i] = scores[i] + best[window[0]]
        while window and best[window[-1]] <= best[i]:  # i'den kötüler artık hiç seçilmez
            window.pop()
        window.append(i)
    path = [n - 1]
    while previous[path[-1]] != -1:
        path.append(previous[path[-1]])
    return best[n - 1], path[::-1]
