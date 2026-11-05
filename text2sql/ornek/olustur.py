"""Örnek dükkan veritabanını (ornek/dukkan.sqlite) oluşturur. Yalnızca standart kütüphane.

    python ornek/olustur.py [cikti.sqlite]
    text2sql ornek-db [--zorla]

Veriler sabittir: rastgele görünen kısımlar sabit tohumlu küçük bir üreteçle (LCG) üretilir,
her çalıştırmada ve her Python sürümünde aynı sonucu verir.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

SEHIRLER = [
    (1, "İstanbul", "Marmara"),
    (2, "Ankara", "İç Anadolu"),
    (3, "İzmir", "Ege"),
    (4, "Bursa", "Marmara"),
    (5, "Antalya", "Akdeniz"),
    (6, "Trabzon", "Karadeniz"),
    (7, "Diyarbakır", "Güneydoğu Anadolu"),
    (8, "Eskişehir", "İç Anadolu"),
]

MUSTERILER = [
    ("Ayşe", "Yılmaz", 1, "2024-01-15"),
    ("Mehmet", "Kaya", 2, "2024-02-03"),
    ("Fatma", "Demir", 3, "2024-02-20"),
    ("Mustafa", "Şahin", 1, "2024-03-11"),
    ("Emine", "Çelik", 4, "2024-03-28"),
    ("Ali", "Yıldız", 5, "2024-04-09"),
    ("Hatice", "Aydın", 6, "2024-05-14"),
    ("Hüseyin", "Öztürk", 2, "2024-06-01"),
    ("Zeynep", "Arslan", 1, "2024-06-22"),
    ("İbrahim", "Doğan", 7, "2024-07-07"),
    ("Elif", "Kılıç", 3, "2024-08-18"),
    ("Murat", "Aslan", 8, "2024-09-02"),
    ("Merve", "Çetin", 1, "2024-09-30"),
    ("Ömer", "Kara", 4, "2024-10-12"),
    ("Şeyma", "Koç", 5, "2024-11-05"),
    ("Burak", "Kurt", 2, "2024-12-19"),
    ("Gül", "Özdemir", 6, "2025-01-08"),
    ("Can", "Şimşek", 1, "2025-02-14"),
    ("Derya", "Polat", 3, "2025-03-03"),
    ("Kemal", "Erdoğan", 8, "2025-04-21"),
]

URUNLER = [
    ("Çay (1 kg)", "Gıda", 185.0, 120),
    ("Türk kahvesi (250 g)", "Gıda", 140.0, 80),
    ("Zeytinyağı (1 L)", "Gıda", 420.0, 45),
    ("Fındık ezmesi", "Gıda", 165.5, 0),
    ("Bal (850 g)", "Gıda", 390.0, 25),
    ("Çaydanlık", "Mutfak", 650.0, 18),
    ("Bakır cezve", "Mutfak", 310.0, 30),
    ("Döküm tava", "Mutfak", 890.0, 7),
    ("İnce belli bardak (6'lı)", "Mutfak", 220.0, 40),
    ("Pamuk havlu", "Ev tekstili", 275.0, 60),
    ("Nevresim takımı", "Ev tekstili", 1450.0, 12),
    ("Yün battaniye", "Ev tekstili", 1890.0, 5),
    ("Defter", "Kırtasiye", 45.0, 300),
    ("Dolma kalem", "Kırtasiye", 520.0, 15),
    ("Masa lambası", "Elektronik", 760.0, 0),
]

DURUMLAR = ["teslim edildi", "teslim edildi", "teslim edildi", "kargoda", "hazırlanıyor", "iptal"]
N_SIPARIS = 30


class LCG:
    """Küçük, taşınabilir sözde rastgele üreteç (Numerical Recipes sabitleri)."""

    def __init__(self, seed: int) -> None:
        self.state = seed

    def next(self, n: int) -> int:
        self.state = (1664525 * self.state + 1013904223) % 2**32
        return (self.state >> 8) % n


def build(path: str | os.PathLike) -> dict[str, int]:
    """Veritabanını ``path``e yazar (varsa üzerine) ve tablo başına satır sayısını döndürür."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    con = sqlite3.connect(tmp)
    try:
        con.executescript((HERE / "sema.sql").read_text(encoding="utf-8"))
        con.executemany("INSERT INTO sehirler VALUES (?, ?, ?)", SEHIRLER)
        con.executemany(
            "INSERT INTO musteriler VALUES (?, ?, ?, ?, ?, ?)",
            [(i, ad, soyad, f"{_ascii(ad)}.{_ascii(soyad)}@ornek.com.tr", sehir, tarih)
             for i, (ad, soyad, sehir, tarih) in enumerate(MUSTERILER, 1)],
        )
        con.executemany("INSERT INTO urunler VALUES (?, ?, ?, ?, ?)", [(i, *u) for i, u in enumerate(URUNLER, 1)])
        rng = LCG(2025)
        kalem_id = 0
        for sid in range(1, N_SIPARIS + 1):
            musteri = rng.next(len(MUSTERILER) - 2) + 1  # son iki müşterinin hiç siparişi yok
            ay, gun = (sid - 1) * 12 // N_SIPARIS + 1, rng.next(28) + 1
            durum = DURUMLAR[rng.next(len(DURUMLAR))]
            con.execute("INSERT INTO siparisler VALUES (?, ?, ?, ?)", (sid, musteri, f"2025-{ay:02d}-{gun:02d}", durum))
            used = set()
            for _ in range(rng.next(3) + 1):
                urun = rng.next(len(URUNLER)) + 1
                if urun in used:
                    continue
                used.add(urun)
                kalem_id += 1
                fiyat = URUNLER[urun - 1][2]
                con.execute("INSERT INTO siparis_kalemleri VALUES (?, ?, ?, ?, ?)", (kalem_id, sid, urun, rng.next(4) + 1, fiyat))
        con.commit()
        counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ("sehirler", "musteriler", "urunler", "siparisler", "siparis_kalemleri")}
        con.execute("VACUUM")
    finally:
        con.close()
    os.replace(tmp, path)
    return counts


def _ascii(s: str) -> str:
    table = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    return s.translate(table).lower()


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "dukkan.sqlite"
    for table, n in build(out).items():
        print(f"{table:18} {n}")
    print(f"Oluşturuldu: {out}")
