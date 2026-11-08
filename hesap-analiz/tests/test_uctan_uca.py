import sys
from pathlib import Path

import pandas as pd

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "ornek"))

from ornek_uret import uret  # noqa: E402

from hesap_analiz import guvenlik  # noqa: E402
from hesap_analiz.cli import calistir  # noqa: E402


def test_tam_akis(tmp_path):
    girdi, cikti = tmp_path / "girdi", tmp_path / "rapor"
    uret(girdi)
    try:
        yollar = calistir(girdi, cikti, KOK / "bankalar", KOK / "kurallar" / "kategoriler.yaml",
                          tmp_path / "kisiler.csv", sessiz=True)
    finally:
        guvenlik.ag_kilidini_cikar()

    assert yollar["excel"].exists() and yollar["html"].exists() and yollar["kisiler"].exists()
    sayfalar = pd.read_excel(yollar["excel"], sheet_name=None)
    assert {"Özet", "Kişi Dengesi", "Aylık Akış", "Tüm İşlemler", "Onay Bekleyen"} <= set(sayfalar)

    islemler = sayfalar["Tüm İşlemler"]
    assert islemler["kaynak"].nunique() == 3
    assert islemler["banka"].nunique() == 2
    # CSV, xlsx'in ilk yarısının tekrarıydı: aynı banka içinde tekrar ayıklandı
    assert (islemler["aciklama"].str.contains("MAAS")).sum() == 12
    # Kurumlar kişi dengesine sızmamalı
    kisi_satirlari = islemler[islemler["karsi_taraf_turu"] == "kisi"]
    assert set(kisi_satirlari["karsi_taraf"]) <= {"AHMET YILMAZ", "AYSE KAYA", "MEHMET DEMIR", "FATMA CELIK"}
    # Kart varken kart ödemesi iç transfer: sayılmaz
    assert not islemler.loc[islemler["kategori"] == "Kredi Kartı Ödemesi", "sayilir"].any()

    denge = sayfalar["Kişi Dengesi"].set_index("kisi")
    assert "AHMET YILMAZ" in denge.index
    ahmet = denge.loc["AHMET YILMAZ"]
    assert ahmet["gonderilen"] == 20000.0 and ahmet["alinan"] == 15000.0 and ahmet["net"] == -5000.0
    # "AYSE KAYA" ile "AYŞE KAYA" tek kişi olarak birleşmeli
    assert denge.index.str.contains("AY.E KAYA").sum() == 1
    ayse = denge[denge.index.str.contains("AY.E KAYA")].iloc[0]
    assert ayse["alinan"] == 15000.0 and ayse["gonderilen"] == 4000.0

    kategoriler = set(islemler["kategori"])
    assert {"Maaş", "Kira", "Fatura", "Market", "Kişi Transferi", "Kredi Kartı Ödemesi"} <= kategoriler

    duzenli = sayfalar["Düzenli Ödemeler"]
    assert (duzenli["periyot"] == "aylık").any()

    html = yollar["html"].read_text(encoding="utf-8")
    assert "http://" not in html and "https://" not in html  # dış kaynak yok


def test_kisi_onayi_uygulanir(tmp_path):
    girdi, cikti = tmp_path / "girdi", tmp_path / "rapor"
    uret(girdi)
    kisiler = tmp_path / "kisiler.csv"
    try:
        calistir(girdi, cikti, KOK / "bankalar", KOK / "kurallar" / "kategoriler.yaml", kisiler, sessiz=True)
        k = pd.read_csv(kisiler, dtype=str).fillna("")
        maske = k["ham_ad"].str.contains("MEHMET DEMIR")
        assert maske.any()
        k.loc[maske, ["kanonik_ad", "tur", "onay"]] = ["EV SAHİBİ", "kurum", "evet"]
        k.to_csv(kisiler, index=False, encoding="utf-8-sig")
        calistir(girdi, cikti, KOK / "bankalar", KOK / "kurallar" / "kategoriler.yaml", kisiler, sessiz=True)
    finally:
        guvenlik.ag_kilidini_cikar()
    islemler = pd.read_excel(cikti / "hesap-analizi.xlsx", sheet_name="Tüm İşlemler")
    assert (islemler["karsi_taraf"] == "EV SAHİBİ").any()
    denge = pd.read_excel(cikti / "hesap-analizi.xlsx", sheet_name="Kişi Dengesi")
    assert "EV SAHİBİ" not in set(denge["kisi"])  # kurum sayıldı, kişi dengesinden çıktı
