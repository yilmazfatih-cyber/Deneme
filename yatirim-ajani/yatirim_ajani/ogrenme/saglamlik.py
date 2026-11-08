"""Sağlamlık (ezber/aşırı uyum) testleri ve parametre bütçesi.

Finans verisi gürültülüdür; küçük bir model bile yüzlerce denemeden sonra "kazanır". Bu modül,
bir sonucun şans mı sinyal mi olduğunu ayırt etmek için şu testleri bir arada verir:

* Etiket karıştırma : hedefler karıştırılıp model yeniden eğitilir; hâlâ kazanıyorsa sızıntı var.
* Rejim kırılımı    : boğa / ayı / yatay dönemlerde ayrı getiri; kazanç tek dönemden geliyorsa kırılgan.
* Maliyet stresi    : komisyon + kayma 2×; dayanamıyorsa kırılgan.
* Deneme günlüğü    : her deneme kaydedilir; seçilen sonuç Deflated Sharpe Ratio (Bailey & López de
                      Prado, 2014) ile deneme sayısına göre düzeltilir.
* Parametre bütçesi : her model için öğrenilmiş parametreler okunabilir biçimde dökülür ve sayılır;
                      kural: her 100 karar anına en fazla 1 parametre.
"""

from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd

from .simulasyon import Panel, SimSonuc, Strateji, simule

# ----------------------------------------------------------------------------------------------
# Deneme günlüğü ve Deflated Sharpe
# ----------------------------------------------------------------------------------------------
SEMA = """
CREATE TABLE IF NOT EXISTS denemeler (
    id INTEGER PRIMARY KEY,
    zaman TEXT NOT NULL,
    aile TEXT NOT NULL,
    ad TEXT NOT NULL,
    parametreler TEXT NOT NULL,
    pencere TEXT NOT NULL,
    gun_sayisi INTEGER NOT NULL,
    getiri REAL NOT NULL,
    sharpe REAL,
    max_dusus REAL NOT NULL,
    maliyet REAL NOT NULL,
    not_ TEXT
);
"""


def deneme_kaydet(db: sqlite3.Connection, aile: str, sonuc: SimSonuc, parametreler: dict, pencere: str, not_: str = "") -> None:
    db.executescript(SEMA)
    sr = gunluk_sharpe(sonuc.egri)
    db.execute(
        "INSERT INTO denemeler (zaman, aile, ad, parametreler, pencere, gun_sayisi, getiri, sharpe, max_dusus, maliyet, not_)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (datetime.now().astimezone().isoformat(), aile, sonuc.ad, json.dumps(parametreler, ensure_ascii=False), pencere,
         len(sonuc.egri), sonuc.getiri, sr, sonuc.max_dusus, sonuc.islem_maliyeti, not_),  # fmt: skip
    )
    db.commit()


def deneme_sayisi(db: sqlite3.Connection, pencere: str | None = None) -> int:
    db.executescript(SEMA)
    if pencere:
        return int(db.execute("SELECT COUNT(*) FROM denemeler WHERE pencere = ?", (pencere,)).fetchone()[0])
    return int(db.execute("SELECT COUNT(*) FROM denemeler").fetchone()[0])


def gunluk_getiriler(egri: pd.Series) -> np.ndarray:
    return egri.pct_change().dropna().to_numpy(dtype=float)


def gunluk_sharpe(egri: pd.Series) -> float | None:
    r = gunluk_getiriler(egri)
    if len(r) < 5 or r.std() == 0:
        return None
    return float(r.mean() / r.std() * np.sqrt(252))


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_ppf(p: float) -> float:
    """Acklam yaklaşımı (hata < 1e-9); scipy bağımlılığı olmadan."""
    if not 0 < p < 1:
        raise ValueError("p (0,1) aralığında olmalı")
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02, 1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02, 6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00, -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00, 3.754408661907416e00]
    pl, ph = 0.02425, 1 - 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > ph:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def deflated_sharpe(secilen_sharpe: float, deneme_sharpeleri: list[float], getiriler: np.ndarray) -> dict[str, float]:
    """Deflated Sharpe Ratio: seçilen Sharpe'ın, N denemeden beklenen en büyük şans Sharpe'ını aşma olasılığı.

    Girdiler yıllıklaştırılmış Sharpe'lardır; hesap günlük Sharpe'a indirilir (T = gözlem sayısı).
    Dönen `dsr` 0,95 üstündeyse sonuç deneme sayısına rağmen anlamlıdır; 0,5 civarıysa şansla ayırt edilemez.
    """
    T = len(getiriler)
    if T < 10:
        return {"dsr": float("nan"), "beklenen_max_sharpe": float("nan"), "deneme": len(deneme_sharpeleri)}
    gun = np.sqrt(252)
    sr = secilen_sharpe / gun
    srs = np.array([s for s in deneme_sharpeleri if s is not None], dtype=float) / gun
    N = max(len(srs), 1)
    var = float(srs.var()) if N > 1 else 0.0
    gamma = 0.5772156649
    if N > 1 and var > 0:
        sr0 = math.sqrt(var) * ((1 - gamma) * _norm_ppf(1 - 1 / N) + gamma * _norm_ppf(1 - 1 / (N * math.e)))
    else:
        sr0 = 0.0
    g = getiriler - getiriler.mean()
    s = getiriler.std() or 1e-12
    skew = float((g**3).mean() / s**3)
    kurt = float((g**4).mean() / s**4)
    payda = math.sqrt(max(1 - skew * sr + (kurt - 1) / 4 * sr**2, 1e-12))
    dsr = _norm_cdf((sr - sr0) * math.sqrt(T - 1) / payda)
    return {"dsr": dsr, "beklenen_max_sharpe": sr0 * gun, "deneme": N, "carpiklik": skew, "basiklik": kurt}


# ----------------------------------------------------------------------------------------------
# Rejim kırılımı
# ----------------------------------------------------------------------------------------------
def rejimler(gosterge: pd.Series, gunler: pd.DatetimeIndex, pencere: int = 60, esik: float = 0.05) -> pd.Series:
    """Her gün için boğa / ayı / yatay: göstergenin son `pencere` günlük getirisi ±esik'e göre.

    Yalnız o güne kadarki veri kullanılır (geleceğe bakmaz)."""
    g = gosterge.reindex(gunler).ffill()
    r = g / g.shift(pencere) - 1
    out = pd.Series("yatay", index=gunler)
    out[r > esik] = "boga"
    out[r < -esik] = "ayi"
    out[r.isna()] = "belirsiz"
    return out


def rejim_kirilimi(egri: pd.Series, rejim: pd.Series) -> pd.DataFrame:
    r = egri.pct_change().dropna()
    rj = rejim.reindex(r.index).fillna("belirsiz")
    satirlar = []
    for ad in ("boga", "ayi", "yatay", "belirsiz"):
        m = rj == ad
        if not m.any():
            continue
        x = r[m]
        satirlar.append({"rejim": ad, "gun": int(m.sum()), "toplam": float(np.prod(1 + x) - 1), "gunluk_ort": float(x.mean()),
                         "sharpe": float(x.mean() / x.std() * np.sqrt(252)) if x.std() > 0 else np.nan})  # fmt: skip
    return pd.DataFrame(satirlar)


# ----------------------------------------------------------------------------------------------
# Parametre bütçesi
# ----------------------------------------------------------------------------------------------
@dataclass
class ParametreRaporu:
    ad: str
    karar_sayisi: int
    parametreler: list[tuple[str, float | int | str]]  # (anlam, değer)
    veri_turevi: int = 0  # standartlaştırma gibi veriden türeyen ama öğrenilmeyen sabitler
    notlar: list[str] = field(default_factory=list)

    @property
    def sayi(self) -> int:
        return len(self.parametreler)

    @property
    def butce(self) -> int:
        return max(self.karar_sayisi // 100, 1)

    @property
    def butce_icinde(self) -> bool:
        return self.sayi + self.veri_turevi <= self.butce

    def metin(self) -> str:
        durum = "BÜTÇE İÇİNDE" if self.butce_icinde else "BÜTÇEYİ AŞIYOR"
        s = [f"{self.ad}: {self.sayi} öğrenilmiş + {self.veri_turevi} veri türevi parametre; karar anı {self.karar_sayisi:,}; "
             f"bütçe (1/100) = {self.butce} → {durum}"]  # fmt: skip
        for anlam, deger in self.parametreler[:40]:
            s.append(f"  - {anlam}: {deger:+.5f}" if isinstance(deger, float) else f"  - {anlam}: {deger}")
        if self.sayi > 40:
            s.append(f"  … ve {self.sayi - 40} parametre daha")
        s += [f"  Not: {n}" for n in self.notlar]
        return "\n".join(s)


def ridge_parametreleri(model, ozellikler: list[str], karar_sayisi: int) -> ParametreRaporu:
    p = [(f"ağırlık[{a}] (standart birim başına beklenen getiri)", float(w)) for a, w in zip(ozellikler, model.agirlik)]
    p.append(("sabit (ortalama hedef)", float(model.sabit)))
    p.append(("ridge katsayısı (seçildi)", float(model.ridge)))
    return ParametreRaporu("ridge", karar_sayisi, p, veri_turevi=2 * len(ozellikler),
                           notlar=["Doğrusal: her özelliğin işareti ve büyüklüğü doğrudan okunur ve sorgulanır."])  # fmt: skip


def mlp_parametreleri(model, ozellikler: list[str], karar_sayisi: int) -> ParametreRaporu:
    W1, W2 = np.asarray(model.W1), np.asarray(model.W2)
    p: list[tuple[str, float | int | str]] = []
    # Okunabilirlik: her girişin çıktıya toplam etkisi (W1 @ W2) özet olarak; tüm ağırlıklar sayıma girer
    etki = W1 @ W2
    for a, e in zip(ozellikler, etki):
        p.append((f"toplam etki[{a}] (W1·W2)", float(e)))
    toplam = W1.size + model.b1.size + W2.size + 1
    p += [(f"gizli ağırlık #{i}", "…") for i in range(toplam - len(ozellikler))]
    return ParametreRaporu("mlp", karar_sayisi, p, veri_turevi=2 * len(ozellikler) + 2,
                           notlar=[f"Toplam {toplam} ağırlık; gizli katman tek tek okunmaz, yalnız toplam etki özetlenir."])  # fmt: skip


def kural_parametreleri(ad: str, parametreler: dict[str, float | int], karar_sayisi: int) -> ParametreRaporu:
    return ParametreRaporu(ad, karar_sayisi, [(k, v) for k, v in parametreler.items()],
                           notlar=["Kural tabanlı: parametreler elle seçilmiş eşikler; veriden öğrenilmedi ama seçimde veri kullanıldıysa sayılır."])  # fmt: skip


# ----------------------------------------------------------------------------------------------
# Kıyas: "haber olumluysa al"
# ----------------------------------------------------------------------------------------------
def haber_kurali(olaylar: pd.DataFrame, tutma_gun: int = 20) -> Strateji:
    """Bilgi veritabanındaki tarihli METİN olaylarından: yönü `olumlu` olan bir olayın bitişinden sonraki
    `tutma_gun` gün boyunca o hisseyi tut (eşit ağırlık). Olay bitişi karar gününe eşit ya da önce olmalı."""
    # YALNIZ saf metin olayları: sayısal tespitli olayların varlığı tüm örneklemden bulunur (geleceğe bakar),
    # bu yüzden "birlesik" kayıtlar da dışarıda. Yön, haberin yayın anındaki algısıdır; LLM tarafından
    # sonradan etiketlendiği için yine geriye bakış riski taşır (raporda işaretlenir).
    ol = olaylar[(olaylar["kapsam"] == "sirket") & (olaylar["kaynak_tipi"] == "metin") & (olaylar.get("yon", "notr") == "olumlu")]
    ol = ol.assign(bitis=pd.to_datetime(ol["bitis"]))

    def strateji(p: Panel, t: int) -> tuple[pd.Series, pd.Series]:
        gun = p.gunler[t]
        aktif = ol[(ol["bitis"] <= gun) & (ol["bitis"] > gun - pd.Timedelta(days=int(tutma_gun * 1.5)))]
        secim = pd.Series(False, index=p.hisseler)
        for h in aktif["hisse"].dropna().unique():
            if h in secim.index:
                secim[h] = True
        from .simulasyon import _esit

        w = _esit(p.hisseler, secim)
        return w, w

    return strateji


# ----------------------------------------------------------------------------------------------
# İsim maskeleme (LLM hafıza testi)
# ----------------------------------------------------------------------------------------------
def maske_haritasi(hisseler: list[str], tohum: int = 7) -> dict[str, str]:
    rng = np.random.default_rng(tohum)
    sira = rng.permutation(len(hisseler))
    return {h: f"H{int(i) + 1:02d}" for h, i in zip(hisseler, sira)}


def maskele_metin(metin: str, harita: dict[str, str]) -> str:
    for h, m in sorted(harita.items(), key=lambda x: -len(x[0])):
        metin = metin.replace(h, m)
    return metin


# ----------------------------------------------------------------------------------------------
# Toplu çalıştırıcı
# ----------------------------------------------------------------------------------------------
def stres_ve_rejim(
    panel: Panel, strateji: Strateji, ad: str, nakit: float, maliyet: float, rejim: pd.Series, bas: int = 0
) -> dict[str, object]:
    normal = simule(panel, strateji, ad, nakit, maliyet, bas=bas)
    iki_kat = simule(panel, strateji, ad + "_2x", nakit, 2 * maliyet, bas=bas)
    return {"normal": normal, "maliyet_2x": iki_kat, "rejim": rejim_kirilimi(normal.egri, rejim)}
