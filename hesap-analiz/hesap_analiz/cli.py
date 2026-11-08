"""Komut satırı girişi: `python -m hesap_analiz girdi/` ya da `hesap-analiz girdi/`."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from . import guvenlik
from .analiz import (aylik_akis, duzenli_odemeler, en_buyuk_karsi_taraflar, genel_ozet,
                     kategori_aylik, kategori_dagilimi)
from .denge import kisi_dengesi, kisi_zaman_cizelgesi
from .kategori import kategorile, kurallari_yukle, kurum_ima_eder
from .kisiler import karsi_taraflari_bul
from .metin import sade
from .okuma import klasor_oku
from .rapor import excel_yaz, html_yaz

KOK = Path(__file__).resolve().parent.parent


def calistir(girdi: Path, cikti: Path, bankalar: Path, kurallar: Path, kisiler: Path,
             ag_kilidi: bool = True, sessiz: bool = False) -> dict[str, Path]:
    if ag_kilidi:
        guvenlik.ag_kilidini_tak()

    def yaz(m: str) -> None:
        if not sessiz:
            print(m)

    tablo, okumalar = klasor_oku(girdi, bankalar)
    uyarilar: list[str] = []
    for o in okumalar:
        yaz(f"  okundu  {o.dosya:40s} {o.banka:18s} {o.satir_sayisi:5d} satır")
        uyarilar += [f"{o.dosya}: {u}" for u in o.uyarilar]

    kural_listesi = kurallari_yukle(kurallar)
    kart_var = bool((tablo["hesap_turu"] == "kart").any())
    # Kart satırları ve bir kategori kuralına uyan satırlar kurumdur; kişi araması yalnızca kalanlarda
    kural_uyan = pd.Series(
        [kurum_ima_eder(sade(a), y, kural_listesi) for a, y in zip(tablo["aciklama"], tablo["yon"])],
        index=tablo.index,
    )
    kurum_ipucu = kural_uyan | (tablo["hesap_turu"] == "kart")
    tablo, kisiler_tablosu = karsi_taraflari_bul(tablo, kisiler, kurum_ipucu)
    tablo = kategorile(tablo, kural_listesi, kart_var)

    bekleyen = kisiler_tablosu[kisiler_tablosu["onay"].str.lower() == "bekliyor"]
    bekleyen_kisi = int((bekleyen["tur"] == "kisi").sum())
    if bekleyen_kisi:
        uyarilar.append(
            f"{bekleyen_kisi} kişi onay bekliyor. {kisiler.name} dosyasında kanonik_ad ve tur "
            "sütunlarını düzeltip onay sütununa 'evet' yazın; bir sonraki çalıştırmada uygulanır."
        )
    if kart_var:
        uyarilar.append(
            "Kart ekstresi de okunduğu için kredi kartı ödemeleri iç transfer sayıldı; "
            "gelir/gider toplamlarına katılmadı (kart harcamaları zaten gider olarak sayılıyor)."
        )

    sayilan = tablo[tablo["sayilir"]]
    ozet = genel_ozet(sayilan)
    denge = kisi_dengesi(tablo)
    bolumler = {
        "Kişi Dengesi": denge,
        "Kişi Zaman Çizelgesi": kisi_zaman_cizelgesi(tablo),
        "Aylık Akış": aylik_akis(sayilan),
        "Kategori Dağılımı": kategori_dagilimi(sayilan),
        "Kategori Aylık (giden)": kategori_aylik(sayilan),
        "Düzenli Ödemeler": duzenli_odemeler(tablo),
        "En Büyük Karşı Taraflar": en_buyuk_karsi_taraflar(sayilan),
    }

    cikti.mkdir(parents=True, exist_ok=True)
    excel_yolu = cikti / "hesap-analizi.xlsx"
    html_yolu = cikti / "hesap-analizi.html"
    islemler = tablo.drop(columns=["ham_ad"]).sort_values("tarih")
    excel_yaz(excel_yolu, {
        "Özet": pd.DataFrame(list(ozet.items()), columns=["Alan", "Değer"]),
        **bolumler,
        "Onay Bekleyen": bekleyen,
        "Tüm İşlemler": islemler,
    })
    html_yaz(html_yolu, ozet, bolumler, uyarilar)

    yaz("")
    for k, v in ozet.items():
        yaz(f"  {k:24s} {v}")
    yaz("")
    for u in uyarilar:
        yaz(f"  ! {u}")
    yaz(f"\n  Excel : {excel_yolu}\n  HTML  : {html_yolu}\n  Kişiler: {kisiler}")
    return {"excel": excel_yolu, "html": html_yolu, "kisiler": kisiler}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="hesap-analiz",
        description="Banka ve kart ekstrelerini tamamen yerel analiz eder. Ağa çıkmaz.",
    )
    p.add_argument("girdi", nargs="?", default=str(KOK / "girdi"), help="Ekstre klasörü (xlsx/csv)")
    p.add_argument("--cikti", default=str(KOK / "rapor"), help="Rapor klasörü")
    p.add_argument("--bankalar", default=str(KOK / "bankalar"), help="Banka şablonları klasörü")
    p.add_argument("--kurallar", default=str(KOK / "kurallar" / "kategoriler.yaml"))
    p.add_argument("--kisiler", default=str(KOK / "kisiler.csv"), help="Kişi eşleme/onay dosyası")
    p.add_argument("--ag-kilidi-yok", action="store_true",
                   help="Ağ kilidini takma (önerilmez; yalnızca hata ayıklama için)")
    a = p.parse_args(argv)
    try:
        calistir(Path(a.girdi), Path(a.cikti), Path(a.bankalar), Path(a.kurallar), Path(a.kisiler),
                 ag_kilidi=not a.ag_kilidi_yok)
    except (FileNotFoundError, ValueError) as e:
        print(f"Hata: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
