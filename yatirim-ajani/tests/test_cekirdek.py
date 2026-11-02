from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from yatirim_ajani.ayarlar import PIYASALAR, RiskAyarlari
from yatirim_ajani.depo import baglan
from yatirim_ajani.geriye_test import geriye_test
from yatirim_ajani.risk.bekci import RiskBekcisi
from yatirim_ajani.strateji.kurallar import StratejiAyarlari, Tez, hedef_oran, sinyal_uret
from yatirim_ajani.tahmin.gunluk import karne, tahmin_ekle, tahminleri_coz
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.zaman_kilidi import GelecekVerisiHatasi, ZamanKilitliVeri
from yatirim_ajani.yurutme.sanal_araci import Emir, SanalAraci

IST = ZoneInfo("Europe/Istanbul")
BIST = PIYASALAR["bist"]


# --- zaman kilidi -------------------------------------------------------------------------
def test_gunluk_cubuk_gun_kapanmadan_gorunmez():
    kaynak = SentetikKaynak()
    # 2025-10-01 Çarşamba, seans içi: o günün günlük çubuğu henüz bitmedi.
    veri = ZamanKilitliVeri(kaynak, datetime(2025, 10, 1, 15, 0, tzinfo=IST))
    df = veri.cubuklar("THYAO.IS", datetime(2025, 9, 20, tzinfo=IST))
    assert df.index[-1].date().isoformat() == "2025-09-30"
    # Ertesi gün gece yarısından sonra görünür.
    veri2 = ZamanKilitliVeri(kaynak, datetime(2025, 10, 2, 0, 1, tzinfo=IST))
    assert veri2.cubuklar("THYAO.IS", datetime(2025, 9, 20, tzinfo=IST)).index[-1].date().isoformat() == "2025-10-01"


def test_dakika_cubugu_bitmeden_gorunmez():
    veri = ZamanKilitliVeri(SentetikKaynak(), datetime(2025, 10, 1, 11, 2, 30, tzinfo=IST))
    df = veri.cubuklar("THYAO.IS", datetime(2025, 10, 1, 10, 0, tzinfo=IST), aralik="1m")
    # 11:01 çubuğu 11:02'de bitti → görünür; 11:02 çubuğu 11:03'te biter → görünmez.
    assert df.index[-1] == pd.Timestamp("2025-10-01 11:01", tz=IST)


def test_gelecek_istegi_hata_verir_ve_temel_veri_kilitli():
    veri = ZamanKilitliVeri(SentetikKaynak(), datetime(2025, 10, 1, 12, 0, tzinfo=IST))
    with pytest.raises(GelecekVerisiHatasi):
        veri.cubuklar("THYAO.IS", datetime(2025, 9, 1, tzinfo=IST), datetime(2025, 10, 5, tzinfo=IST))
    with pytest.raises(GelecekVerisiHatasi):
        veri.temel("THYAO.IS")
    canli = ZamanKilitliVeri(SentetikKaynak(), datetime.now().astimezone(), canli=True)
    assert "trailingPE" in canli.temel("THYAO.IS")


# --- sanal aracı ve risk bekçisi ----------------------------------------------------------
@pytest.fixture
def araci():
    db = baglan(":memory:")
    a = SanalAraci(db, BIST)
    a.hesap_ac(100_000)
    return a


AN = datetime(2025, 10, 1, 11, 0, tzinfo=IST)


def test_alim_maliyetli_dolar_ve_ortalama_maliyet_tutulur(araci):
    d = araci.uygula(Emir("bist", "THYAO", "AL", 10, 100.0), 100.0, AN)
    assert d.fiyat == pytest.approx(100.0 * 1.0015)  # spread 10 + kayma 5 bps
    durum = araci.durum()
    assert durum.pozisyonlar["THYAO"][0] == 10
    assert durum.nakit == pytest.approx(100_000 - 10 * 100.15)
    with pytest.raises(ValueError):
        araci.uygula(Emir("bist", "THYAO", "SAT", 11, 100.0), 100.0, AN)  # açığa satış yok


def test_bekci_tek_hisse_sinirini_uygular_ve_lot_yuvarlar(araci):
    bekci = RiskBekcisi(RiskAyarlari(), BIST)
    karar = bekci.denetle(Emir("bist", "THYAO", "AL", 1000, 33.3), araci.durum(), {"THYAO": 33.3}, AN)
    assert karar.emir is not None
    assert karar.emir.adet == int(karar.emir.adet)  # BIST: tam lot
    assert karar.emir.adet * 33.3 <= 10_000  # varlığın %10'u


def test_bekci_seans_disinda_ve_durdurulmus_hesapta_alim_reddeder(araci):
    bekci = RiskBekcisi(RiskAyarlari(), BIST)
    gece = datetime(2025, 10, 1, 20, 0, tzinfo=IST)
    assert not bekci.denetle(Emir("bist", "THYAO", "AL", 10, 100.0), araci.durum(), {"THYAO": 100.0}, gece).onaylandi
    araci.uygula(Emir("bist", "THYAO", "AL", 10, 100.0), 100.0, AN)
    araci.durdur("test")
    durum = araci.durum()
    assert not bekci.denetle(Emir("bist", "ASELS", "AL", 10, 50.0), durum, {"ASELS": 50.0}, AN).onaylandi
    # Riski azaltan satış durdurulmuş hesapta da serbest.
    assert bekci.denetle(Emir("bist", "THYAO", "SAT", 10, 100.0), durum, {"THYAO": 100.0}, AN).onaylandi


def test_gunluk_zarar_siniri_yeni_alimi_durdurur(araci):
    bekci = RiskBekcisi(RiskAyarlari(gunluk_zarar_limiti=0.02), BIST)
    araci.uygula(Emir("bist", "THYAO", "AL", 100, 100.0), 100.0, AN)
    araci.gun_guncelle(AN, {"THYAO": 100.0}, 0.15)
    durum = araci.durum()
    # THYAO %30 düştü → varlık ~%3 azaldı
    karar = bekci.denetle(Emir("bist", "ASELS", "AL", 10, 50.0), durum, {"THYAO": 70.0, "ASELS": 50.0}, AN)
    assert not karar.onaylandi and "Günlük zarar" in karar.gerekce


def test_zirveden_dusus_hesabi_durdurur(araci):
    araci.uygula(Emir("bist", "THYAO", "AL", 500, 100.0), 100.0, AN)
    araci.gun_guncelle(AN, {"THYAO": 100.0}, 0.15)
    araci.gun_guncelle(AN, {"THYAO": 60.0}, 0.15)  # 50.000'lik pozisyon %40 düştü → varlık -%20
    assert araci.durum().durduruldu


# --- strateji -----------------------------------------------------------------------------
def _cubuk(fiyatlar):
    idx = pd.date_range("2025-01-01", periods=len(fiyatlar), freq="D", tz=IST)
    s = pd.Series(fiyatlar, index=idx, dtype=float)
    return pd.DataFrame({"acilis": s, "yuksek": s, "dusuk": s, "kapanis": s, "hacim": 1.0})


def test_strateji_yukselen_egilimde_al_dusende_sat():
    risk = RiskAyarlari()
    yukselen = _cubuk(range(100, 160))
    s = sinyal_uret("X", yukselen, Tez("AL", 0.7), 0, 0, risk)
    assert s is not None and s.yon == "AL" and s.hedef_oran == pytest.approx(risk.max_pozisyon_orani)
    assert sinyal_uret("X", yukselen, Tez("IZLE", 0.5), 0, 0, risk) is None
    assert sinyal_uret("X", yukselen, Tez("AL", 0.52), 0, 0, risk) is None  # eşik altı
    dusen = _cubuk(range(160, 100, -1))
    s = sinyal_uret("X", dusen, None, 10, 150, risk, StratejiAyarlari())
    assert s is not None and s.yon == "SAT"


def test_hedef_oran_olasilikla_buyur():
    risk = RiskAyarlari()
    assert hedef_oran(0.5, risk) == 0
    assert 0 < hedef_oran(0.6, risk) < hedef_oran(0.7, risk) == hedef_oran(0.9, risk)


# --- tahmin günlüğü -----------------------------------------------------------------------
def test_tahmin_cozulur_ve_brier_hesaplanir():
    db = baglan(":memory:")
    kaynak = SentetikKaynak()
    an = datetime(2025, 6, 2, 19, 0, tzinfo=IST)
    giris = ZamanKilitliVeri(kaynak, an).son_fiyat("THYAO.IS")
    assert giris
    tahmin_ekle(db, None, "bist", "THYAO", an, 30, giris, 0.0, 0.8)
    tahmin_ekle(db, None, "bist", "THYAO", an, 30, giris, 0.0, 0.2)
    simdi = ZamanKilitliVeri(kaynak, datetime(2025, 8, 1, tzinfo=IST))
    assert tahminleri_coz(db, simdi, lambda p, h: PIYASALAR[p].sembol(h)) == 2
    k = karne(db)
    assert k.adet == 2
    # Biri 0,8 biri 0,2: sonuç ne olursa olsun Brier = (0,2² + 0,8²) / 2 = 0,34
    assert k.brier == pytest.approx(0.34)
    assert "Brier" in k.metin()


# --- geriye dönük test --------------------------------------------------------------------
def test_geriye_test_calisir_ve_olcutlerle_kiyaslar():
    sonuc = geriye_test(
        SentetikKaynak(),
        BIST,
        ["THYAO", "ASELS", "BIMAS"],
        datetime(2024, 1, 1),
        datetime(2024, 12, 31),
        100_000,
    )
    assert len(sonuc.egri) > 200
    assert sonuc.gosterge is not None and sonuc.esit_agirlik is not None
    assert sonuc.islem_sayisi > 0 and sonuc.toplam_maliyet > 0
    assert sonuc.strateji.max_dusus <= 0
    assert "Strateji" in sonuc.metin("TRY")
