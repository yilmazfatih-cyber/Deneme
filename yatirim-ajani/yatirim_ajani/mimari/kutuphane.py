"""Saatlik strateji kütüphanesi: BIST'te saatlik/gün içi işlem yapanların yaygın kullandığı kuralların makinece tanımı.

Her strateji, bir hissenin saatlik satırları (hisse dosyası omurgası, `cozunurluk == '1h'`) üzerinde tetik indeksleri
üretir ve çıkış kuralını (hedef, stop, süre, gün sonu) taşır. Hepsi YALNIZ UZUN (bireyde açığa satış fiilen yok).
Tetik yalnız tetik çubuğu kapanana kadarki bilgiyi kullanır; giriş bir SONRAKİ çubuğun açılışındadır (ya da açıkça
belirtilmişse tetik çubuğunun kapanışında: gece taşıma).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd


@dataclass
class Strateji:
    kod: str
    ad: str
    aile: str
    tetik: Callable[[pd.DataFrame, dict], np.ndarray]  # bool dizi (tetik çubuğu)
    hedef: float | None  # +%
    stop: float | None  # -% (negatif)
    sure_cubuk: int  # en fazla kaç çubuk tutulur
    cikis: str = "sure"  # sure | gun_sonu | sonraki_acilis | hedef_fiyat
    giris: str = "sonraki_acilis"  # sonraki_acilis | kapanis
    aciklama: str = ""
    populerlik: str = "araştırmada yok"  # Fable araştırmasından (dosya_kaynak/strateji_kayit.json)
    giris_tavani: float | None = None  # giriş açılışı ≥ tetik kapanışı × bu ise işlem yok (tavanda kilitli açılış alınamaz)


def _gun_ilk(df: pd.DataFrame) -> np.ndarray:
    return (~df["gun"].duplicated()).to_numpy()


def _ema(x: pd.Series, n: int) -> pd.Series:
    return x.ewm(span=n, adjust=False).mean()


def _rsi(c: pd.Series, n: int = 14) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def _gunluk_kapanis(df: pd.DataFrame) -> pd.Series:
    """Her satır için o günün o ana kadarki son fiyatı değil, GÜN SONU satırlarında günlük kapanış dizisi."""
    return df.loc[df["gun_sonu"].astype(bool), ["gun", "kapanis"]].set_index("gun")["kapanis"]


# --- tetikler ------------------------------------------------------------------------------------
def t_acilis_kirilim(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ilk = _gun_ilk(df)
    ilk_yuksek = df["yuksek"].where(ilk).ffill()
    kir = (df["kapanis"] > ilk_yuksek) & (df["kapanis"].shift(1) <= ilk_yuksek) & ~ilk
    hacim_ok = df["hacim"] > df["hacim"].rolling(40, min_periods=20).median().shift(1)
    return (kir & hacim_ok & ~df["gun_sonu"].astype(bool)).to_numpy()


def t_gap_dolum(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ilk = _gun_ilk(df)
    return (ilk & (df["gece_getiri"] <= -0.02) & ~df["gun_sonu"].astype(bool)).to_numpy()


def t_aof_donus(df: pd.DataFrame, ek: dict) -> np.ndarray:
    tipik = (df["yuksek"] + df["dusuk"] + df["kapanis"]) / 3
    pv = (tipik * df["hacim"]).groupby(df["gun"]).cumsum()
    v = df["hacim"].groupby(df["gun"]).cumsum().replace(0, np.nan)
    vwap = pv / v
    ek["hedef_fiyat"] = vwap.to_numpy()
    return ((df["kapanis"] <= vwap * 0.985) & ~_gun_ilk(df) & ~df["gun_sonu"].astype(bool)).to_numpy()


def t_rsi_saatlik(df: pd.DataFrame, ek: dict) -> np.ndarray:
    r = _rsi(df["kapanis"], 14)
    return ((r < 30) & (r.shift(1) >= 30)).to_numpy()


def t_ema_kesisim(df: pd.DataFrame, ek: dict) -> np.ndarray:
    e9, e21 = _ema(df["kapanis"], 9), _ema(df["kapanis"], 21)
    return ((e9 > e21) & (e9.shift(1) <= e21.shift(1))).to_numpy()


def t_hacim_patlamasi(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ort = df["hacim"].rolling(40, min_periods=20).mean().shift(1)
    return ((df["hacim"] >= 3 * ort) & (df["kapanis"] >= df["acilis"] * 1.01)).to_numpy()


def t_tavan_kovalama(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return (df["gun_sonu"].astype(bool) & (df["getiri_1g"] >= 0.095)).to_numpy()


def t_taban_donusu(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return (df["gun_sonu"].astype(bool) & (df["getiri_1g"] <= -0.095)).to_numpy()


def t_gece_tasima(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return df["gun_sonu"].astype(bool).to_numpy()


def t_kirilim_20g(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gk = _gunluk_kapanis(df)
    tepe = gk.shift(1).rolling(20, min_periods=20).max()
    gun_sinyal = (gk > tepe) & (gk.shift(1) <= tepe.shift(1))
    return (df["gun_sonu"].astype(bool) & df["gun"].map(gun_sinyal).fillna(False).astype(bool)).to_numpy()


def t_ma50_trend(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    m = df["ma50_uzaklik"].where(gs)
    onceki = m.where(gs).ffill().shift(1)
    return (gs & (m > 0) & (onceki <= 0) & (df["xu100_ma200_uzaklik"] > 0)).to_numpy()


def t_zirve_52h(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    z = df["zirve_52h_yakinlik"].where(gs)
    onceki = z.ffill().shift(1)
    return (gs & (z >= 1.0) & (onceki < 1.0)).to_numpy()


def t_asiri_satim_gunluk(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gk = _gunluk_kapanis(df)
    r = _rsi(gk, 14)
    sinyal = (r < 30) & (r.shift(1) >= 30)
    return (df["gun_sonu"].astype(bool) & df["gun"].map(sinyal).fillna(False).astype(bool)).to_numpy()


def _olay_tetik(df: pd.DataFrame, olaylar: pd.DataFrame, tur_kosul: Callable[[pd.DataFrame], pd.Series], tepki_esik: float) -> np.ndarray:
    out = np.zeros(len(df), dtype=bool)
    if olaylar is None or olaylar.empty:
        return out
    O = olaylar[tur_kosul(olaylar)]
    if O.empty:
        return out
    z = df["_z"].to_numpy()
    for an in O["_an"]:
        i = int(np.searchsorted(z, np.datetime64(an), side="left"))  # habere tepki veren ilk çubuk
        if i < len(df) and df["kapanis"].iat[i] >= df["acilis"].iat[i] * (1 + tepki_esik):
            out[i] = True
    return out


def t_haber_momentum(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return _olay_tetik(df, ek.get("olaylar"), lambda O: (O["yon"] == "olumlu") & (O["tur"] != "bilanco"), 0.0)


def t_bilanco_sonrasi(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return _olay_tetik(df, ek.get("olaylar"), lambda O: O["tur"].astype(str).str.startswith("bilan"), 0.02)


def _tarihli_oncesi(df: pd.DataFrame, gunler: list[pd.Timestamp], kac_gun_once: int, ek: dict | None = None) -> np.ndarray:
    """Önceden ilan edilen bir tarihten (hak kullanım / bölünme) `kac_gun_once` işlem günü önceki gün sonunda tetik.
    Planlı çıkış: o tarihten önceki son gün sonu çubuğu (ek["planli_cikis"][tetik] = çıkış indeksi)."""
    out = np.zeros(len(df), dtype=bool)
    if not gunler:
        return out
    gs_idx = np.flatnonzero(df["gun_sonu"].astype(bool).to_numpy())
    gun_dizi = pd.to_datetime(df["gun"].to_numpy()[gs_idx])
    for g in gunler:
        k = int(np.searchsorted(gun_dizi.values, np.datetime64(pd.Timestamp(g).normalize()), side="left"))  # hak günü (ya da sonrası) indeksi
        j = k - kac_gun_once
        if 0 <= j < len(gs_idx) and k - 1 > j and k - 1 < len(gs_idx):
            out[gs_idx[j]] = True
            if ek is not None:
                ek.setdefault("planli_cikis", {})[int(gs_idx[j])] = int(gs_idx[k - 1])
    return out


def t_temettu_oncesi(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return _tarihli_oncesi(df, ek.get("temettu_gunleri", []), 5, ek)


def t_bedelsiz_oncesi(df: pd.DataFrame, ek: dict) -> np.ndarray:
    return _tarihli_oncesi(df, ek.get("bolunme_gunleri", []), 10, ek)


# --- araştırma kaydından eklenen popüler stratejiler (dosya_kaynak/strateji_kayit.json) ---------------
def _ilk_cubuk_hacim_orani(df: pd.DataFrame) -> pd.Series:
    ilk = pd.Series(_gun_ilk(df), index=df.index)
    h_ilk = df["hacim"].where(ilk)
    ort = h_ilk.dropna().rolling(20, min_periods=10).mean().shift(1).reindex(df.index)
    return h_ilk / ort


def t_acilis_ilk_saat_momentum(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ilk = _gun_ilk(df)
    ust30 = df["kapanis"] >= df["acilis"] + 0.7 * (df["yuksek"] - df["dusuk"])
    return (ilk & (df["getiri_1g"] >= 0.02) & (_ilk_cubuk_hacim_orani(df) >= 1.5) & ust30 & (df["xu100_getiri_1g"] > 0) & ~df["gun_sonu"].astype(bool)).to_numpy()


def _tavan_gunleri(df: pd.DataFrame) -> pd.Series:
    gs = df["gun_sonu"].astype(bool)
    return (gs & (df["getiri_1g"] >= 0.095))


def t_tavan_kovalama2(df: pd.DataFrame, ek: dict) -> np.ndarray:
    tv = _tavan_gunleri(df)
    gun_tv = tv[df["gun_sonu"].astype(bool)].astype(int)
    son5 = gun_tv.rolling(5, min_periods=1).sum().reindex(df.index).fillna(0)
    return (tv & (df["hacim_z_20"].fillna(0) >= 1.0) & (son5 <= 2)).to_numpy()


def t_tavan_serisi(df: pd.DataFrame, ek: dict) -> np.ndarray:
    tv = _tavan_gunleri(df)
    gun_tv = tv[df["gun_sonu"].astype(bool)].astype(int)
    ardisik = (gun_tv.rolling(2).sum() >= 2).reindex(df.index).fillna(False)
    return (tv & ardisik).to_numpy()


def t_taban_donusu2(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ilk = _gun_ilk(df)
    gs = df["gun_sonu"].astype(bool)
    dun_taban = (gs & (df["getiri_1g"] <= -0.095)).astype(float).where(gs).ffill().shift(1).fillna(0).astype(bool)
    dun_kapanis = df["kapanis"].where(gs).ffill().shift(1)
    return (ilk & dun_taban & (df["acilis"] > dun_kapanis * 0.905) & (df["kapanis"] > df["acilis"]) & (_ilk_cubuk_hacim_orani(df) >= 2.0)).to_numpy()


def _gunluk_sinyal(df: pd.DataFrame, f: Callable[[pd.Series], pd.Series]) -> np.ndarray:
    gk = _gunluk_kapanis(df)
    sinyal = f(gk).fillna(False).astype(bool)
    return (df["gun_sonu"].astype(bool) & df["gun"].map(sinyal).fillna(False).astype(bool)).to_numpy()


def t_macd(df: pd.DataFrame, ek: dict) -> np.ndarray:
    def f(gk):
        macd = _ema(gk, 12) - _ema(gk, 26)
        hist = macd - _ema(macd, 9)
        return (hist > 0) & (hist.shift(1) <= 0)
    return _gunluk_sinyal(df, f) & (df["ma50_uzaklik"] > 0).to_numpy()


def t_golden(df: pd.DataFrame, ek: dict) -> np.ndarray:
    def f(gk):
        e20, e50 = _ema(gk, 20), _ema(gk, 50)
        return (e20 > e50) & (e20.shift(1) <= e50.shift(1)) & (gk > e20)
    return _gunluk_sinyal(df, f) & (df["xu100_ma200_uzaklik"] > 0).to_numpy()


def t_rsi_asiri_satim(df: pd.DataFrame, ek: dict) -> np.ndarray:
    def f(gk):
        r = _rsi(gk, 14)
        return (r.shift(1) < 30) & (r >= 30) & (gk.pct_change() > 0)
    return _gunluk_sinyal(df, f) & (df["xu100_ma200_uzaklik"] > 0).to_numpy()


def t_kapanista_al(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    gun_yuksek = df.groupby("gun")["yuksek"].transform("max")
    return (gs & (df["kapanis"] >= df["acilis"] * 1.01) & (df["gunici_getiri"] >= 0.03) & (df["kapanis"] >= gun_yuksek * 0.99) & (df["getiri_1g"] < 0.09)).to_numpy()


def t_gap_kapatma(df: pd.DataFrame, ek: dict) -> np.ndarray:
    ilk = _gun_ilk(df)
    dun_kapanis = df["kapanis"].where(df["gun_sonu"].astype(bool)).ffill().shift(1)
    ek["hedef_fiyat"] = dun_kapanis.to_numpy()  # boşluk dolumu: önceki kapanış
    return (ilk & df["gece_getiri"].between(-0.06, -0.02) & (df["olay_sayi_1g"].fillna(0) == 0) & (df["xu100_getiri_1g"] >= -0.01)
            & (df["kapanis"] > df["acilis"]) & ~df["gun_sonu"].astype(bool)).to_numpy()  # fmt: skip


def t_aof_ustu_kapanis(df: pd.DataFrame, ek: dict) -> np.ndarray:
    tipik = (df["yuksek"] + df["dusuk"] + df["kapanis"]) / 3
    vwap = (tipik * df["hacim"]).groupby(df["gun"]).cumsum() / df["hacim"].groupby(df["gun"]).cumsum().replace(0, np.nan)
    gun_acilis = df.groupby("gun")["acilis"].transform("first")
    gs = df["gun_sonu"].astype(bool)
    return (gs & (df["kapanis"] >= vwap * 1.01) & (df["kapanis"] > gun_acilis) & (df["hacim_z_20"].fillna(0) >= 0.5)).to_numpy()


def t_ters_donus(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    return (gs & (df["getiri_5g"] <= -0.10) & (df["endekse_gore_20g"] >= -0.20) & (df["olay_sayi_5g"].fillna(0) == 0) & (df["getiri_1g"] > -0.095)).to_numpy()


def t_son_saat_momentum(df: pd.DataFrame, ek: dict) -> np.ndarray:
    onceki_tepe = df.groupby("gun")["yuksek"].transform(lambda x: x.shift(1).cummax())
    bar = df["kapanis"] / df["acilis"] - 1
    hort = df["hacim"].rolling(40, min_periods=20).mean().shift(1)
    return ((df["saat"] == "16:30") & ~df["gun_sonu"].astype(bool) & (df["kapanis"] > onceki_tepe) & (df["hacim"] >= 1.5 * hort) & bar.between(0.005, 0.04)).to_numpy()


def t_goreli_guc(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    return (gs & (df["endekse_gore_20g"] >= 0.10) & (df["endekse_gore_1g"] >= 0) & (df["xu100_ma200_uzaklik"] > 0) & (df["getiri_1g"] < 0.09) & (df["zirve_52h_yakinlik"] >= 0.90)).to_numpy()


def t_ay_sonu(df: pd.DataFrame, ek: dict) -> np.ndarray:
    gs = df["gun_sonu"].astype(bool)
    ay = pd.to_datetime(df["gun"]).dt.to_period("M")
    son_gun = df["gun"] == df.groupby(ay)["gun"].transform("max")
    return (gs & son_gun).to_numpy()


KUTUPHANE: list[Strateji] = [
    # --- çok yüksek popülerlik ---
    Strateji("tavan_kovalama", "Tavan kovalama (seri yeni başladı)", "momentum", t_tavan_kovalama2, None, -0.05, 16, "gun_sonu",
             aciklama="Tavan kapanış + hacim z ≥ 1 + son 5 günde ≤ 2 tavan; ertesi gün açılış tavanda kilitli değilse al, gün sonu çık",
             populerlik="çok yüksek", giris_tavani=1.095),
    Strateji("acilis_ilk_saat_momentum", "Açılış ilk saat momentumu", "momentum", t_acilis_ilk_saat_momentum, None, -0.025, 8, "gun_sonu",
             aciklama="İlk çubuk ≥ +%2, hacim ≥ 1,5× (ilk çubuk ort.), üst %30'da kapanış, XU100 artıda; sonraki çubukta al, gün sonu çık",
             populerlik="çok yüksek"),
    Strateji("rsi_asiri_satim", "RSI 30 yukarı kesişimi (günlük, endeks boğada)", "ortalamaya_donus", t_rsi_asiri_satim, 0.06, -0.05, 80,
             aciklama="Günlük RSI(14) 30'u yukarı kesti, gün artıda, XU100 MA200 üstü; +%6 / −%5 / 10 gün", populerlik="çok yüksek"),
    Strateji("haber_momentum", "KAP haber momentumu", "olay", t_haber_momentum, 0.05, -0.03, 24,
             aciklama="Hissenin olumlu metin olayı; tepki çubuğu artıda kapandı: al; +%5 / −%3 / 3 gün (olay verisi seyrek)", populerlik="çok yüksek"),
    Strateji("bedelsiz_oncesi", "Bedelsiz öncesi koşu", "olay", t_bedelsiz_oncesi, None, -0.07, 80,
             aciklama="Bölünme/bedelsiz gününden 10 işlem günü önce al; bölünme gününden önceki kapanışta çık (karar günü verisi yok, vekil)",
             populerlik="çok yüksek"),
    # --- yüksek ---
    Strateji("tavan_serisi_devam", "Tavan serisi devamı", "momentum", t_tavan_serisi, None, -0.05, 16, "gun_sonu",
             aciklama="Art arda ≥2 tavan kapanış; ertesi gün açılış kilitli değilse al, gün sonu çık", populerlik="yüksek", giris_tavani=1.095),
    Strateji("taban_donusu", "Taban dönüşü", "ortalamaya_donus", t_taban_donusu2, 0.05, -0.04, 16,
             aciklama="Dün taban; bugün ilk çubuk tabanda kilitli değil, yeşil, hacim ≥ 2×: al; +%5 / −%4 / 2 gün", populerlik="yüksek"),
    Strateji("gap_kapatma", "Aşağı boşluk kapatma", "ortalamaya_donus", t_gap_kapatma, None, -0.025, 8, "hedef_fiyat",
             aciklama="Açılış −%2…−%6, habersiz, endeks kaynaklı değil, ilk çubuk yeşil: al; önceki kapanışa dönüşte ya da gün sonunda çık",
             populerlik="yüksek"),
    Strateji("hacim_patlamasi", "Hacim patlaması", "momentum", t_hacim_patlamasi, 0.03, -0.02, 8,
             aciklama="Saatlik hacim 40 çubuk ortalamasının ≥3 katı ve çubuk ≥+%1: al; +%3 / −%2 / 1 gün", populerlik="yüksek"),
    Strateji("macd_kesisimi", "MACD kesişimi (günlük)", "trend", t_macd, 0.08, -0.04, 80,
             aciklama="Günlük MACD histogramı sıfırı yukarı kesti ve fiyat MA50 üstü: al; +%8 / −%4 / 10 gün", populerlik="yüksek"),
    Strateji("golden_cross", "EMA20/EMA50 yukarı kesişimi", "trend", t_golden, 0.10, -0.05, 120,
             aciklama="Günlük EMA20 EMA50'yi yukarı kesti, XU100 MA200 üstü: al; +%10 / −%5 / 15 gün", populerlik="yüksek"),
    Strateji("aof_ustu_kapanis", "AOF üstü kapanış", "mikro_yapi", t_aof_ustu_kapanis, 0.04, -0.03, 16,
             aciklama="Gün AOF'un ≥%1 üstünde, açılışın üstünde kapandı, hacim z ≥ 0,5: ertesi gün al; +%4 / −%3 / 2 gün", populerlik="yüksek"),
    Strateji("kapanista_al_acilista_sat", "Güçlü kapanışta al, açılışta sat", "mikro_yapi", t_kapanista_al, None, None, 1, "sonraki_acilis", "kapanis",
             aciklama="Gün ≥+%3, son çubuk ≥+%1, günün tepesinde kapanış: kapanışta al, ertesi açılışta sat", populerlik="yüksek"),
    Strateji("temettu_oncesi", "Temettü öncesi koşu", "takvim", t_temettu_oncesi, None, -0.05, 40,
             aciklama="Hak kullanım gününden 5 işlem günü önce al; hak gününden önceki kapanışta çık", populerlik="yüksek"),
    # --- orta ---
    Strateji("acilis_kirilim", "Açılış aralığı kırılımı", "momentum", t_acilis_kirilim, 0.03, -0.015, 8, "gun_sonu",
             aciklama="İlk saatin tepesi hacimle kırılınca al; gün sonunda çık", populerlik="orta"),
    Strateji("zirve_52h", "52 hafta zirvesi kırılımı", "trend", t_zirve_52h, 0.10, -0.05, 80,
             aciklama="Yeni 52 hafta zirvesi: al; +%10 / −%5 / 10 gün", populerlik="orta"),
    Strateji("bilanco_sonrasi", "Bilanço sonrası sürüklenme", "olay", t_bilanco_sonrasi, 0.12, -0.06, 160,
             aciklama="Bilanço olayı sonrası ilk çubuk ≥+%2: al; +%12 / −%6 / 20 gün", populerlik="orta"),
    Strateji("aof_donus", "AOF/VWAP'a dönüş", "ortalamaya_donus", t_aof_donus, None, -0.02, 8, "hedef_fiyat",
             aciklama="Fiyat gün içi ağırlıklı ortalamanın ≥%1,5 altında: al; AOF'a dönüşte ya da gün sonunda çık", populerlik="orta"),
    Strateji("kisa_vadeli_ters_donus", "Kısa vadeli ters dönüş", "ortalamaya_donus", t_ters_donus, 0.06, -0.05, 24,
             aciklama="5 günde ≤ −%10, habersiz, hisseye özgü çöküş değil: ertesi gün al; +%6 / −%5 / 3 gün", populerlik="orta"),
    Strateji("son_saat_momentum", "Son saat momentumu", "mikro_yapi", t_son_saat_momentum, None, -0.015, 2, "gun_sonu",
             aciklama="16:30 çubuğu günün yeni tepesi, hacim ≥1,5×, +%0,5…+%4: sonraki çubukta al, kapanışta çık", populerlik="orta"),
    Strateji("goreli_guc", "Göreli güç rotasyonu", "trend", t_goreli_guc, 0.10, -0.06, 80,
             aciklama="20 günde endeksi ≥ %10 geçti, 52h zirvesine yakın, XU100 boğada: al; +%10 / −%6 / 10 gün", populerlik="orta"),
    Strateji("ay_sonu", "Ay sonu etkisi", "takvim", t_ay_sonu, None, None, 24, "sure", "kapanis",
             aciklama="Ayın son işlem günü kapanışta al, 3 gün tut", populerlik="düşük"),
    # --- araştırmada ayrı kayıt yok (yaygın gösterge kuralları) ---
    Strateji("gece_tasima", "Gece taşıma (koşulsuz)", "takvim", t_gece_tasima, None, None, 1, "sonraki_acilis", "kapanis",
             aciklama="Her gün kapanışta al, ertesi gün açılışta sat (BIST'te gece primi bulgusu)"),
    Strateji("rsi_saatlik_30", "Saatlik RSI 30 altı", "ortalamaya_donus", t_rsi_saatlik, 0.02, -0.03, 16,
             aciklama="Saatlik RSI(14) 30'un altına inince al; +%2 / −%3 / 2 gün"),
    Strateji("ema_kesisim_saatlik", "EMA 9/21 kesişimi (saatlik)", "trend", t_ema_kesisim, 0.04, -0.025, 24,
             aciklama="Saatlik EMA9 EMA21'i yukarı kesince al; +%4 / −%2,5 / 3 gün"),
    Strateji("kirilim_20g", "20 günlük zirve kırılımı", "trend", t_kirilim_20g, 0.08, -0.04, 40,
             aciklama="Günlük kapanış önceki 20 günün zirvesini aştı: ertesi gün al; +%8 / −%4 / 5 gün"),
    Strateji("ma50_trend", "MA50 üstüne çıkış (endeks boğada)", "trend", t_ma50_trend, 0.08, -0.04, 80,
             aciklama="Kapanış MA50'nin üstüne geçti ve XU100 MA200 üstünde: al; +%8 / −%4 / 10 gün"),
]  # fmt: skip
