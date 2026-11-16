"""Düzenleme uzaklığı + betiği: a'yı b'ye çeviren en az işlem sayısı ve işlemlerin kendisi.

Fikir:
    D[i][j] = a[:i]'yi b[:j]'ye çevirmenin en az işlem sayısı (ekle, sil, değiştir; her biri 1).
      D[i][0] = i (hepsini sil), D[0][j] = j (hepsini ekle),
      D[i][j] = D[i−1][j−1]                        a[i−1] == b[j−1] ise (dokunma),
                1 + min(D[i−1][j], D[i][j−1], D[i−1][j−1])  değilse (sil, ekle, değiştir).
    Sağ alt köşeden geri yürünerek hangi seçeneğin seçildiği izlenir ve işlem listesi (betik)
    çıkarılır. Betik soldan sağa uygulanınca a, b'ye dönüşür (`apply_edit_script`).
    Yalnız uzaklık gerekiyorsa O(min(n, m)) bellekli sürüm: `algoritma/dizgi/levenshtein.py`.

Karmaşıklık: zaman O(n · m); yer O(n · m)
Ne zaman: yazım düzeltme önerisi + "neyi değiştirdin" açıklaması, hizalama, değişiklik vurgulama.
Ne zaman değil: yalnız sayı gerekiyorsa bellek dostu `levenshtein.py`; bitişik harf yer
    değiştirmesi tek işlem sayılacaksa `damerau_levenshtein` (aynı dosyada).
Bağımlılık: yok
Genişletme: işlem maliyetlerini farklılaştırmak için (ör. değiştirme 2) iç döngüdeki 1'leri
    parametre yapın.

Örnek:
    >>> distance, script = edit_script("kitap", "kitabı")
    >>> distance, [step for step in script if step[0] != "keep"]
    (2, [('insert', 'b'), ('replace', 'ı')])
    >>> apply_edit_script("kitap", script)
    'kitabı'
"""

from __future__ import annotations

Operation = tuple[
    str, str
]  # (işlem, karakter): keep/replace/insert → yeni karakter; delete → silinen


def edit_script(a: str, b: str) -> tuple[int, list[Operation]]:
    """(uzaklık, işlemler). İşlemler: ('keep', c), ('replace', yeni), ('insert', yeni),
    ('delete', silinen)."""
    n, m = len(a), len(b)
    dist = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        dist[i][0] = i
    for j in range(m + 1):
        dist[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dist[i][j] = dist[i - 1][j - 1]
            else:
                dist[i][j] = 1 + min(dist[i - 1][j], dist[i][j - 1], dist[i - 1][j - 1])
    script: list[Operation] = []
    i, j = n, m
    while i or j:
        if i and j and a[i - 1] == b[j - 1] and dist[i][j] == dist[i - 1][j - 1]:
            script.append(("keep", a[i - 1]))
            i, j = i - 1, j - 1
        elif i and j and dist[i][j] == dist[i - 1][j - 1] + 1:
            script.append(("replace", b[j - 1]))
            i, j = i - 1, j - 1
        elif i and dist[i][j] == dist[i - 1][j] + 1:
            script.append(("delete", a[i - 1]))
            i -= 1
        else:
            script.append(("insert", b[j - 1]))
            j -= 1
    return dist[n][m], script[::-1]


def apply_edit_script(a: str, script: list[Operation]) -> str:
    """Betiği a'ya uygular; sonuç b'dir. Betik a ile uyuşmuyorsa ValueError."""
    out: list[str] = []
    position = 0
    for op, char in script:
        if op == "insert":
            out.append(char)
            continue
        if position >= len(a):
            raise ValueError("betik metinden uzun")
        if op == "keep":
            if a[position] != char:
                raise ValueError(f"{position}. karakter uyuşmuyor: {a[position]!r} ≠ {char!r}")
            out.append(char)
        elif op == "replace":
            out.append(char)
        elif op != "delete":
            raise ValueError(f"bilinmeyen işlem: {op!r}")
        position += 1
    if position != len(a):
        raise ValueError("betik metnin tamamını işlemedi")
    return "".join(out)
