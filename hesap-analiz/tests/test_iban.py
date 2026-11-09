import pandas as pd

from hesap_analiz.kisiler import karsi_taraflari_bul
from hesap_analiz.metin import iban_bul, iban_maskele


def test_iban_bul_ve_maskele():
    i = iban_bul("FAST GIDEN ALICI: MEHMET DEMİR TR55 0004 6000 1111 2222 3333 44 KIRA")
    assert i == "TR550004600011112222333344"
    assert iban_maskele(i) == "TR55 **** 3344"
    assert iban_bul("MIGROS ISTANBUL") == ""


def test_ayni_iban_farkli_yazim_tek_kisi(tmp_path):
    iban = "TR55 0004 6000 1111 2222 3333 44"
    tablo = pd.DataFrame({
        "aciklama": [
            f"EFT GIDEN - ALICI: MEHMET DEMİR {iban} KIRA",
            f"EFT GIDEN - ALICI: MEHMET DEMİR {iban} KIRA",
            f"FAST GIDEN - ALICI: M DEMIR GAYRIMENKUL {iban}",
            "FAST GIDEN - ALICI: ZEYNEP ARSLAN TR11 0001 0000 9999 8888 7777 66",
        ],
        "tutar": [-100.0, -100.0, -50.0, -10.0],
    })
    sonuc, kisiler = karsi_taraflari_bul(tablo, tmp_path / "kisiler.csv")
    assert sonuc["karsi_taraf"].tolist()[:3] == ["MEHMET DEMIR"] * 3
    assert sonuc["karsi_taraf"].iloc[3] == "ZEYNEP ARSLAN"
    assert "_iban" not in sonuc.columns
    # Dosyada IBAN'ın tamamı değil maskeli hali tutulur
    metin = (tmp_path / "kisiler.csv").read_text(encoding="utf-8-sig")
    assert "TR55 **** 3344" in metin and "TR550004600011112222333344" not in metin
