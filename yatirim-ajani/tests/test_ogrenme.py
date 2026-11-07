from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from yatirim_ajani.ayarlar import PIYASALAR, Ayarlar
from yatirim_ajani.depo import baglan
from yatirim_ajani.ogrenme.egitim import egit_ve_olc
from yatirim_ajani.ogrenme.ozellikler import OZELLIK_ADLARI, egitim_seti, ozellik_tablosu
from yatirim_ajani.ogrenme.rl import egit, olc
from yatirim_ajani.veri.bolme import Bolme, gunleri_etiketle
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.saatlik import SaatlikVeriSeti, kaymali_saat, temizle

BIST = PIYASALAR["bist"]


def test_bolme_tohumlu_ve_sabit(tmp_path):
    gunler = [date(2025, 1, 1) + pd.Timedelta(days=i) for i in range(200)]
    a = gunleri_etiketle(gunler, 0.2, 7)
    b = gunleri_etiketle(gunler, 0.2, 7)
    assert a.equals(b)
    assert 0.1 < (a == "test").mean() < 0.3
    bol = Bolme(tmp_path / "e.csv", 0.2, 7)
    assert bol.guncelle(gunler) == 200
    assert Bolme(tmp_path / "e.csv", 0.2, 7).ozet() == bol.ozet()
    # Yeni tohum yeni etiket üretir, eski dosya değişmez
    assert bol.guncelle(gunler) == 0


def test_kaymali_saat_tam_cubuk_ve_zaman_damgasi():
    bes = SentetikKaynak().cubuklar("THYAO.IS", datetime(2025, 3, 3).astimezone(), datetime(2025, 3, 5).astimezone(), "5m")
    k = kaymali_saat(bes, 30)
    assert k.index[0].strftime("%H:%M") == "10:30"
    assert (k.index.minute == 30).all()
    assert len(k) == 2 * 7  # 10:30..17:30 → 7 tam saat/gün (17:30 çubuğu eksik kalır)
    with pytest.raises(ValueError):
        kaymali_saat(bes, 7)


def test_temizle_cift_ve_gecersiz():
    df = SentetikKaynak().cubuklar("THYAO.IS", datetime(2025, 3, 3).astimezone(), datetime(2025, 3, 10).astimezone(), "1h")
    kirli = pd.concat([df, df.iloc[:3]])
    kirli.iloc[5, kirli.columns.get_loc("dusuk")] = 1e9
    temiz, rapor = temizle(kirli)
    assert rapor["cift_zaman"] == 3 and rapor["gecersiz_fiyat"] == 1
    assert len(temiz) == len(df) - 1


def test_ozellikler_gelecegi_kullanmaz():
    df = SentetikKaynak().cubuklar("THYAO.IS", datetime(2025, 1, 1).astimezone(), datetime(2025, 3, 1).astimezone(), "1h")
    t = ozellik_tablosu(df)
    X, y, z = egitim_seti(t)
    assert X.shape[1] == len(OZELLIK_ADLARI) and len(X) == len(y) == len(z)
    # Son çubuğun ileri getirisi yok; gün sonu çubukları (17:00) ertesi güne taşınmaz
    assert (z.hour != 17).all()
    # İleri getiri = sonraki çubuğun açılış→kapanış'ı
    i = z[10]
    konum = df.index.get_loc(i)
    beklenen = df["kapanis"].iloc[konum + 1] / df["acilis"].iloc[konum + 1] - 1
    assert y[10] == pytest.approx(beklenen)


def test_bandit_ogrenir_ve_esik_kapisi_calisir():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(3000, len(OZELLIK_ADLARI)))
    y = 0.01 * X[:, 0] + rng.normal(0, 0.005, 3000)  # ilk özellik gerçekten bilgi taşıyor
    m, skor = egit(X[:2000], y[:2000])
    assert skor > 0.5
    o = olc(m, X[2000:], y[2000:], y[2000:], 0.005, "test")
    assert o.islem_sayisi > 0 and o.ort_net_getiri > 0.005
    sert = olc(m, X[2000:], y[2000:], y[2000:], 0.05, "test")
    assert sert.islem_sayisi == 0 and sert.ort_net_getiri is None


def test_egitim_akisi_sentetik(tmp_path):
    a = Ayarlar(veri_klasoru=str(tmp_path / "saatlik"), veritabani=str(tmp_path / "a.db"))
    vs = SaatlikVeriSeti(a.veri_klasoru)
    hisseler = ["THYAO", "ASELS"]
    vs.cek(SentetikKaynak(), [BIST.sembol(h) for h in hisseler] + [BIST.gosterge],
           datetime(2025, 1, 1).astimezone(), datetime(2025, 9, 1).astimezone(), bes_dakika=False)  # fmt: skip
    db = baglan(a.veritabani)
    s = egit_ve_olc(a, BIST, hisseler, 0, db)
    assert s.test.karar_sayisi > 0 and s.train.karar_sayisi > s.test.karar_sayisi
    assert Path(s.model_yolu).exists()
    n = db.execute("SELECT COUNT(*) FROM odul_gunlugu").fetchone()[0]
    assert n == s.train.karar_sayisi + s.test.karar_sayisi
    assert "Sonuç:" in s.metin(a.risk.min_net_getiri)
