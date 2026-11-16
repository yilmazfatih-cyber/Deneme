"""Dış sıralama: belleğe sığmayan bir metin dosyasını parça parça sıralayıp birleştirir.

Fikir:
    1. Parçala: dosyadan belleğe sığacak kadar satır (`chunk_lines`) oku, bellekte sırala,
       geçici bir "koşu" (run) dosyasına yaz. Sonuç: her biri kendi içinde sıralı R dosya.
    2. Birleştir: R sıralı dosyayı aynı anda okuyup bir öncelik kuyruğuyla (`heapq.merge`)
       tek sıralı akışa çevir. Aynı anda açık dosya sayısı sınırlıysa (`fan_in`), koşular
       gruplar hâlinde birleştirilip daha az sayıda yeni koşu üretilir; tek koşu kalana dek
       tekrarlanır (çok geçişli birleştirme).
    Bu, veritabanlarının ve `sort` komutunun büyük dosyalar için kullandığı yöntemin küçük ama
    çalışan bir taslağıdır: satırlar Python dizgi sırasıyla (Unicode kod noktası) sıralanır.

Karmaşıklık: zaman O(N log N) karşılaştırma; disk G/Ç ≈ 2·N·(1 + ⌈log_fan_in(R)⌉);
    bellek O(chunk_lines + fan_in)
Ne zaman: veri belleğe sığmıyorsa (günlük dosyaları, büyük CSV); sıralı akış çıktısı gerekiyorsa.
Ne zaman değil: veri belleğe sığıyorsa `sorted(open(...))` çok daha basit ve hızlıdır.
Bağımlılık: yok
Genişletme: Türkçe alfabetik sıra için `sorted` ve `heapq.merge` çağrılarına aynı `key`
    fonksiyonunu verin (ör. `algoritma.dizgi.turkish_text.sort_key_tr`).

Örnek:
    >>> import tempfile, pathlib
    >>> with tempfile.TemporaryDirectory() as tmp:
    ...     folder = pathlib.Path(tmp)
    ...     source = folder / "girdi.txt"
    ...     _ = source.write_text("muz\\nelma\\nkivi\\narmut\\nnar", encoding="utf-8")
    ...     runs = external_sort(source, folder / "cikti.txt", 2, work_dir=folder)
    ...     result = (folder / "cikti.txt").read_text(encoding="utf-8").split()
    >>> runs, result
    (3, ['armut', 'elma', 'kivi', 'muz', 'nar'])
"""

from __future__ import annotations

import heapq
from contextlib import ExitStack
from pathlib import Path


def _write_run(lines: list[str], work_dir: Path, number: int) -> Path:
    path = work_dir / f"kosu-{number:06d}.txt"
    with path.open("w", encoding="utf-8", newline="") as out:
        out.writelines(sorted(lines))
    return path


def _merge_files(sources: list[Path], target: Path) -> None:
    with ExitStack() as stack, target.open("w", encoding="utf-8", newline="") as out:
        readers = [stack.enter_context(p.open(encoding="utf-8", newline="")) for p in sources]
        out.writelines(heapq.merge(*readers))


def external_sort(
    input_path: Path, output_path: Path, chunk_lines: int, work_dir: Path, fan_in: int = 16
) -> int:
    """Dosyayı satır satır sıralar; oluşturulan ilk koşu sayısını döndürür."""
    if chunk_lines < 1 or fan_in < 2:
        raise ValueError("chunk_lines ≥ 1 ve fan_in ≥ 2 olmalı")
    runs: list[Path] = []
    chunk: list[str] = []
    with input_path.open(encoding="utf-8", newline="") as source:
        for line in source:
            chunk.append(line if line.endswith("\n") else line + "\n")  # son satır da \n'li olsun
            if len(chunk) == chunk_lines:
                runs.append(_write_run(chunk, work_dir, len(runs)))
                chunk = []
    if chunk:
        runs.append(_write_run(chunk, work_dir, len(runs)))
    first_run_count = len(runs)
    counter = len(runs)
    while len(runs) > fan_in:  # çok geçişli birleştirme: açık dosya sayısı fan_in'i aşmasın
        next_runs = []
        for start in range(0, len(runs), fan_in):
            group = runs[start : start + fan_in]
            merged = work_dir / f"kosu-{counter:06d}.txt"
            counter += 1
            _merge_files(group, merged)
            for path in group:
                path.unlink()
            next_runs.append(merged)
        runs = next_runs
    _merge_files(runs, output_path)
    for path in runs:
        path.unlink()
    return first_run_count
