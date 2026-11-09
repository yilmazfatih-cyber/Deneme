from kap_karar.agaclar import AGACLAR
from kap_karar.motor import agac_metni, karar_ver, tum_agaclari_dogrula


def test_agaclar_tutarli():
    assert tum_agaclari_dogrula() == []
    assert len(AGACLAR) >= 25


def test_her_agac_bos_parametreyle_sonuca_ulasir():
    for tur in AGACLAR:
        k = karar_ver(tur, {})
        assert k.sonuc_kodu in AGACLAR[tur]["dugumler"]
        assert k.eksik  # parametre yokken eksik listesi dolu


def test_her_agac_cizilir():
    for tur in AGACLAR:
        m = agac_metni(tur)
        assert AGACLAR[tur]["ad"] in m


def test_tcmb_surpriz_indirim():
    k = karar_ver("tcmb_faiz_karari", {"degisim_bp": -250, "beklenti_bp": -100, "metin_tonu": "guvercin"})
    assert k.sonuc_kodu == "L_indirim_surpriz"
    k = karar_ver("tcmb_faiz_karari", {"degisim_bp": -100, "beklenti_bp": -100, "metin_tonu": "sahin"})
    assert k.sonuc_kodu == "L_indirim_sahin" and k.egilim == "olumlu"
    k = karar_ver("tcmb_faiz_karari", {"degisim_bp": 350, "beklenti_bp": 0})
    assert k.egilim == "olumsuz"


def test_enflasyon_turetilmis():
    k = karar_ver("enflasyon_verisi", {"aylik": 2.58, "beklenti_aylik": 2.2, "yillik": 29.77, "onceki_yillik": 29.73})
    assert k.sonuc_kodu == "L_yukari_kirilma"
    assert not k.eksik


def test_bedelli_borc_agir():
    k = karar_ver("bedelli_sermaye_artirimi", {"amac": "borc", "oran": 300})
    assert k.egilim == "olumsuz"


def test_temettu_yuksek_saglam():
    k = karar_ver("temettu", {"nakit": True, "temettu_verimi": 8, "dagitim_orani": 60})
    assert k.sonuc_kodu == "L_yuksek_saglam"
