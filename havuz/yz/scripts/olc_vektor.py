"""Vektör deposu ölçümü: parça sayısı ve boyuta göre arama süresi ve bellek.

Kullanım: OMP_NUM_THREADS=2 .venv/bin/python scripts/olc_vektor.py [--boyutlar 384 768] [--sayilar 10000 100000]
Sonuçlar docs/KARARLAR.md K-11'e elle yazılır (makineye göre değişir; ölçtüğünüz makineyi not edin).
Genişletme: başka bir arka ucu (FAISS vb.) karşılaştırmak için aynı döngüye ekleyin.
"""

from __future__ import annotations

import argparse
import time

import numpy as np

from yz.rag.vektor_deposu import VektorDeposu


def olc(sayi: int, boyut: int, tekrar: int = 20) -> tuple[float, float, float]:
    """(ekleme sn, arama ortalama ms, bellek MB) döndürür."""
    rastgele = np.random.default_rng(0)
    matris = rastgele.normal(size=(sayi, boyut)).astype(np.float32)
    depo = VektorDeposu()
    baslangic = time.perf_counter()
    depo.ekle(matris)
    depo.ara(matris[0], 5)  # birleşik matrisi hazırla
    ekleme = time.perf_counter() - baslangic
    sorgular = rastgele.normal(size=(tekrar, boyut)).astype(np.float32)
    baslangic = time.perf_counter()
    for sorgu in sorgular:
        depo.ara(sorgu, 10)
    arama_ms = (time.perf_counter() - baslangic) / tekrar * 1000
    return ekleme, arama_ms, sayi * boyut * 4 / 1024 / 1024


def main() -> None:
    ayristirici = argparse.ArgumentParser(
        description="Vektör deposu arama süresi ve bellek ölçümü."
    )
    ayristirici.add_argument("--boyutlar", type=int, nargs="+", default=[384, 768])
    ayristirici.add_argument(
        "--sayilar", type=int, nargs="+", default=[10_000, 50_000, 100_000, 200_000]
    )
    args = ayristirici.parse_args()
    print("| Parça | Boyut | Ekleme (sn) | Arama, k=10 (ms) | Matris belleği (MB) |")
    print("|---|---|---|---|---|")
    for boyut in args.boyutlar:
        for sayi in args.sayilar:
            ekleme, arama, bellek = olc(sayi, boyut)
            print(
                f"| {sayi:,} | {boyut} | {ekleme:.2f} | {arama:.1f} | {bellek:.0f} |".replace(
                    ",", "."
                )
            )


if __name__ == "__main__":
    main()
