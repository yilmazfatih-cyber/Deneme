"""Gerçek veri içermeyen, uydurma 12 aylık örnek ekstreler üretir.

Kullanım: python ornek/ornek_uret.py [hedef_klasor]
Üretilenler: ziraat-hesap.xlsx, ziraat-hesap-ilk-yari.csv, kart-ekstresi.xlsx
"""

from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

random.seed(42)
BASLANGIC = date(2025, 11, 1)
KISILER = [("AHMET YILMAZ", "TR12 0001 0000 1234 5678 9012 34"), ("AYŞE KAYA", "TR33 0006 2000 9876 5432 1098 76"),
           ("MEHMET DEMİR", "TR55 0004 6000 1111 2222 3333 44"), ("FATMA ÇELİK", "TR77 0001 5000 5555 6666 7777 88")]
MARKETLER = ["MIGROS TIC AS", "BIM BIRLESIK MAGAZALAR", "A101 YENI MAGAZACILIK", "CARREFOURSA"]
DIGER = ["SHELL AKARYAKIT", "STARBUCKS KADIKOY", "TRENDYOL", "ECZANE MERKEZ", "BITAKSI", "LCW MAGAZACILIK"]


def _t(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def hesap_hareketleri() -> list[dict]:
    satirlar = []
    bakiye = 15000.0
    for ay in range(12):
        ay_basi = (BASLANGIC.replace(day=1) + timedelta(days=32 * ay)).replace(day=1)
        olaylar = [
            (ay_basi.replace(day=1), f"MAAS ODEMESI - ORNEK TEKNOLOJI AS", 48500.00),
            (ay_basi.replace(day=3), f"EFT GIDEN - ALICI: MEHMET DEMİR {KISILER[2][1]} KIRA", -18000.00),
            (ay_basi.replace(day=5), "OTOMATIK TALIMAT ENERJISA ELEKTRIK FATURA", -round(random.uniform(900, 1600), 2)),
            (ay_basi.replace(day=6), "OTOMATIK TALIMAT IGDAS DOGALGAZ", -round(random.uniform(400, 2200), 2)),
            (ay_basi.replace(day=7), "TURKCELL FATURA ODEME", -649.90),
            (ay_basi.replace(day=10), "KREDI KARTI ODEME BONUS 5401****1234", -round(random.uniform(9000, 16000), 2)),
            (ay_basi.replace(day=15), "NETFLIX COM", -229.99),
            (ay_basi.replace(day=20), "ATM PARA CEKME SUBE 1234", -3000.00),
            (ay_basi.replace(day=28), "HESAP ISLETIM UCRETI", -45.00),
        ]
        if ay in (1, 4):
            olaylar.append((ay_basi.replace(day=12), f"FAST GIDEN - ALICI: AHMET YILMAZ {KISILER[0][1]} BORC", -10000.00))
        if ay in (3, 6, 8):
            olaylar.append((ay_basi.replace(day=18), f"FAST GELEN - GONDEREN: AHMET YILMAZ {KISILER[0][1]} ODEME", 5000.00))
        if ay in (2, 9):
            olaylar.append((ay_basi.replace(day=22), f"HAVALE GELEN - GONDEREN: AYŞE KAYA {KISILER[1][1]}", 7500.00))
        if ay == 5:
            olaylar.append((ay_basi.replace(day=25), f"EFT GIDEN - ALICI: AYSE KAYA {KISILER[1][1]} IADE", -4000.00))
        if ay in (0, 7):
            olaylar.append((ay_basi.replace(day=14), f"FAST GIDEN - ALICI: FATMA ÇELİK {KISILER[3][1]} DUGUN", -2500.00))
        for d, acik, tutar in sorted(olaylar):
            bakiye += tutar
            satirlar.append({"Tarih": _t(d), "Açıklama": acik, "Tutar": f"{tutar:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                             "Bakiye": f"{bakiye:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), "Kanal": "Mobil"})
    return satirlar


def kart_hareketleri() -> list[dict]:
    satirlar = []
    for ay in range(12):
        ay_basi = (BASLANGIC.replace(day=1) + timedelta(days=32 * ay)).replace(day=1)
        for _ in range(random.randint(14, 22)):
            d = ay_basi + timedelta(days=random.randint(0, 27))
            if random.random() < 0.55:
                isyeri, tutar = random.choice(MARKETLER), round(random.uniform(150, 1800), 2)
            else:
                isyeri, tutar = random.choice(DIGER), round(random.uniform(80, 2500), 2)
            satirlar.append({"İşlem Tarihi": _t(d), "Açıklama": f"{isyeri} ISTANBUL TR", "Tutar": tutar, "Taksit": ""})
        satirlar.append({"İşlem Tarihi": _t(ay_basi.replace(day=10)), "Açıklama": "EKSTRE ODEME - TESEKKURLER",
                         "Tutar": -round(random.uniform(9000, 16000), 2), "Taksit": ""})
    return satirlar


def uret(hedef: Path) -> None:
    hedef.mkdir(parents=True, exist_ok=True)
    hesap = pd.DataFrame(hesap_hareketleri())
    # Ziraat: üstte 3 satır banner, sonra başlık (gerçek dökümler böyle gelir)
    with pd.ExcelWriter(hedef / "ziraat-hesap.xlsx", engine="openpyxl") as y:
        banner = pd.DataFrame([["Ziraat Bankası Hesap Hareketleri"], ["Hesap: TR00 ... 0001"], [""]])
        banner.to_excel(y, sheet_name="Hareketler", header=False, index=False)
        hesap.to_excel(y, sheet_name="Hareketler", startrow=3, index=False)
    # Aynı hesabın ilk yarısı ikinci kez, CSV olarak (örtüşen dönem → tekrar ayıklama test edilir)
    hesap.iloc[: len(hesap) // 2].to_csv(hedef / "ziraat-hesap-ilk-yari.csv", sep=";", index=False, encoding="utf-8-sig")
    pd.DataFrame(kart_hareketleri()).to_excel(hedef / "kart-ekstresi.xlsx", sheet_name="Kart Hareketleri", index=False)
    print(f"Örnek ekstreler yazıldı: {hedef}")


if __name__ == "__main__":
    uret(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "veri")
