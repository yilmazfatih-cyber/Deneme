"""Eğitim akışı: veri seti → özellikler → train/test etiketleri → bandit → test ölçümü → günlük."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from ..ayarlar import Ayarlar, Piyasa
from ..veri.bolme import Bolme
from ..veri.saatlik import SaatlikVeriSeti
from .ozellikler import egitim_seti, gidis_donus_maliyet, ozellik_tablosu
from .rl import BanditModel, Olcum, egit, esik_taramasi, olc


@dataclass
class EgitimSonucu:
    kayma_dk: int
    hisse_sayisi: int
    train: Olcum
    test: Olcum
    ridge_skoru: float
    esik_taramasi: pd.DataFrame
    model_yolu: Path

    def metin(self, esik: float) -> str:
        satirlar = [
            f"Kayma {self.kayma_dk} dk, {self.hisse_sayisi} hisse, eşik %{esik * 100:.2f} (masraf sonrası)",
            self.train.metin(),
            self.test.metin(),
            "Eşik taraması (yalnız train):",
            self.esik_taramasi.to_string(index=False, float_format=lambda v: f"{v:.4f}"),
            f"Model: {self.model_yolu}",
        ]
        if self.test.ort_net_getiri is None:
            satirlar.append("Sonuç: test günlerinde eşiği geçen hiç karar yok. Model henüz işlem önermiyor.")
        elif self.test.toplam_net_getiri <= 0 or (self.test.korelasyon or 0) <= 0:
            satirlar.append("Sonuç: test günlerinde masraf sonrası kazanç YOK. Gerçek parayla kullanmayın.")
        else:
            satirlar.append("Sonuç: test günlerinde pozitif; en az 2 ay canlı sanal işlemle doğrulanmalı.")
        return "\n".join(satirlar)


def veri_hazirla(
    vs: SaatlikVeriSeti, piyasa: Piyasa, hisseler: list[str], kayma_dk: int, bolme: Bolme,
    baslangic: pd.Timestamp | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list[tuple[str, pd.Timestamp]]]:
    """Tüm hisseleri tek havuzda birleştirir. (X, ham getiri, ödül, test maskesi, (hisse, zaman))."""
    gosterge = vs.saatlik(piyasa.gosterge, kayma_dk)
    maliyet = gidis_donus_maliyet(piyasa)
    Xler, gler, kimler = [], [], []
    for h in hisseler:
        df = vs.saatlik(piyasa.sembol(h), kayma_dk)
        if baslangic is not None:
            df = df[df.index >= baslangic]
        if len(df) < 120:
            continue
        X, g, z = egitim_seti(ozellik_tablosu(df, gosterge))
        if len(X) == 0:
            continue
        bolme.guncelle(list({t.date() for t in z}))
        Xler.append(X)
        gler.append(g)
        kimler += [(h, t) for t in z]
    if not Xler:
        raise ValueError("Eğitilecek veri yok; önce `veri-cek` çalıştırın")
    X = np.vstack(Xler)
    g = np.concatenate(gler)
    zamanlar = pd.DatetimeIndex([t for _, t in kimler])
    test = bolme.maske(zamanlar, "test")
    return X, g, g - maliyet, test, kimler


def egit_ve_olc(
    ayarlar: Ayarlar,
    piyasa: Piyasa,
    hisseler: list[str],
    kayma_dk: int = 0,
    db: sqlite3.Connection | None = None,
    baslangic: pd.Timestamp | None = None,
) -> EgitimSonucu:
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    bolme = Bolme(Path(ayarlar.veri_klasoru) / "etiketler.csv", ayarlar.test_orani, ayarlar.tohum)
    X, ham, odul, test, kimler = veri_hazirla(vs, piyasa, hisseler, kayma_dk, bolme, baslangic)
    tr = ~test
    model, skor = egit(X[tr], odul[tr])
    esik = ayarlar.risk.min_net_getiri
    yol = Path(ayarlar.veri_klasoru) / f"model_{piyasa.kod}_kayma{kayma_dk}.json"
    model.kaydet(yol)
    zamanlar = np.array([t.value for _, t in kimler])  # saat anahtarı (ns)
    sonuc = EgitimSonucu(
        kayma_dk=kayma_dk,
        hisse_sayisi=len({h for h, _ in kimler}),
        train=olc(model, X[tr], odul[tr], ham[tr], esik, "train", zamanlar[tr]),
        test=olc(model, X[test], odul[test], ham[test], esik, "test", zamanlar[test]),
        ridge_skoru=skor,
        esik_taramasi=esik_taramasi(model, X[tr], odul[tr], (0.0, 0.0025, 0.005, 0.0075, 0.01, 0.015)),
        model_yolu=yol,
    )
    if db is not None:
        q = model.q(X)
        satirlar = [
            (piyasa.kod, h, t.isoformat(), kayma_dk, "test" if test[i] else "train",
             "AL" if q[i] >= esik else "BEKLE", float(q[i]), float(ham[i]),
             float(odul[i]) if q[i] >= esik else 0.0, model.surum)
            for i, (h, t) in enumerate(kimler)
        ]  # fmt: skip
        db.execute("DELETE FROM odul_gunlugu WHERE piyasa = ? AND kayma_dk = ?", (piyasa.kod, kayma_dk))
        db.executemany(
            "INSERT INTO odul_gunlugu (piyasa, hisse, zaman, kayma_dk, etiket, eylem, tahmin, gerceklesen, odul, model_surumu)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            satirlar,
        )
        db.commit()
    return sonuc


def kayma_karsilastir(ayarlar: Ayarlar, piyasa: Piyasa, hisseler: list[str], kaymalar=(0, 15, 30, 45)) -> pd.DataFrame:
    """Kaymaları yalnız TRAIN ölçümüyle sıralar. Test sütunu bilgi içindir, seçimde kullanılmaz.

    Kaymalı setler 5 dakikalık veriden gelir ve daha kısadır; adil kıyas için kayma 0 da
    5 dakikalık verinin başladığı tarihten itibaren alınır.
    """
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    baslar = [vs.yukle(piyasa.sembol(h), "5m").index.min() for h in hisseler]
    baslar = [b for b in baslar if pd.notna(b)]
    baslangic = min(baslar) if baslar else None
    satirlar = []
    for k in kaymalar:
        try:
            s = egit_ve_olc(ayarlar, piyasa, hisseler, k, baslangic=baslangic)
        except ValueError:
            continue
        satirlar.append({"kayma_dk": k, "train_kor": s.train.korelasyon, "train_islem": s.train.islem_sayisi,
                         "train_ort_net": s.train.ort_net_getiri, "test_ort_net(bilgi)": s.test.ort_net_getiri})
    return pd.DataFrame(satirlar).sort_values("train_kor", ascending=False)


def model_yukle(ayarlar: Ayarlar, piyasa: Piyasa, kayma_dk: int = 0) -> BanditModel | None:
    yol = Path(ayarlar.veri_klasoru) / f"model_{piyasa.kod}_kayma{kayma_dk}.json"
    return BanditModel.yukle(yol) if yol.exists() else None


def simdi_iso() -> str:
    return datetime.now().astimezone().isoformat()
