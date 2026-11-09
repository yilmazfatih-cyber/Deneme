"""Futboldaki gibi gözlem istatistikleri, BIST'te: tehlikeli atak, isabetli şut, kontra atak, pres, panik, FOMO.

Rapor: docs/semantik-istatistikler.md

Futbolda "tehlikeli atak" ya da "büyük fırsat" ham bir sayım değildir: bir olay (atak, şut) bağlamıyla (sahanın
neresi, baskı var mı) kurala göre etiketlenir, sonra geçmiş veriyle "bu tür olay ne sıklıkla gole döner" diye
puanlanır (xG). Burada aynı yöntem günlük hisse verisine uygulanır:

1. Olay: günlük fiyat-hacim hareketi.
2. Bağlam: kapanışın gün içi aralıktaki yeri (CLV), hacmin olağan dışılığı (log hacim z-skoru), 52 haftalık zirveye
   yakınlık, günün olağan oynaklığa göre büyüklüğü (ATR), endekse göre fark.
3. Etiket: açık kurallar (aşağıda).
4. Puan: etiketten sonraki 5 ve 20 günde endekse göre fazla getiri; "isabet" = 5 günde endeksi geçme oranı.

Veri: ajan-ciktilari dalı, veri/dosya/ham/*_isy_gunluk.csv (günlük düzeltilmiş kapanış, en düşük, en yüksek,
ağırlıklı ortalama fiyat, TL hacim) ve veri/dosya/gunluk/*.csv.gz (XU100 seviyesi). Evren bugünkü 74 hissedir
(hayatta kalma yanlılığı). t-istatistikleri aynı güne düşen olayların bağımlılığını hesaba katmaz; iyimserdir.
Yatırım tavsiyesi değildir.

Çalıştırma (depo kökünden):
    git fetch origin ajan-ciktilari
    mkdir -p /tmp/cikti && git archive origin/ajan-ciktilari veri/dosya | tar -x -C /tmp/cikti
    python yatirim-ajani/docs/semantik_istatistik_testi.py /tmp/cikti/veri/dosya
"""

from __future__ import annotations

import glob
import sys

import numpy as np
import pandas as pd

if len(sys.argv) < 2:
    sys.exit("Kullanım: python semantik_istatistik_testi.py <veri/dosya klasörü>")
KOK = sys.argv[1]
SOGUMA_GUN = 5  # aynı hissede aynı etiket 5 işlem günü içinde tekrar sayılmaz


def endeks_serisi() -> pd.Series:
    parcalar = [
        pd.read_csv(f, usecols=["gun", "xu100"])
        for f in sorted(glob.glob(f"{KOK}/gunluk/*.csv.gz"))
    ]
    e = pd.concat(parcalar).dropna().groupby("gun")["xu100"].first()
    e.index = pd.to_datetime(e.index)
    return e.sort_index()


def hisseler() -> pd.DataFrame:
    parcalar = []
    for f in sorted(glob.glob(f"{KOK}/ham/*_isy_gunluk.csv")):
        try:
            d = pd.read_csv(f)
        except pd.errors.EmptyDataError:
            continue  # bazı hisselerde İş Yatırım dosyası boş
        d = d.rename(
            columns={
                "HGDG_HS_KODU": "hisse",
                "HGDG_KAPANIS": "c",
                "HGDG_MIN": "l",
                "HGDG_MAX": "h",
                "HGDG_AOF": "aof",
                "HGDG_HACIM": "hacim",
            }
        )
        d["gun"] = pd.to_datetime(d["tarih"])
        parcalar.append(d[["hisse", "gun", "c", "l", "h", "aof", "hacim"]])
    return pd.concat(parcalar).sort_values(["hisse", "gun"]).reset_index(drop=True)


def ozellikler(df: pd.DataFrame, endeks: pd.Series) -> pd.DataFrame:
    df = df.copy()
    g = df.groupby("hisse", group_keys=False)
    aralik = (df["h"] - df["l"]).replace(0, np.nan)
    df["clv"] = (((df["c"] - df["l"]) - (df["h"] - df["c"])) / aralik).fillna(0.0)
    df["r1"] = g["c"].pct_change()
    df["atr20"] = g.apply(lambda x: ((x["h"] - x["l"]) / x["c"]).rolling(20).mean())
    log_hacim = np.log(df["hacim"].where(df["hacim"] > 0))
    df["log_hacim"] = log_hacim
    onceki = g["log_hacim"].shift(1)
    df["hz"] = (
        log_hacim
        - onceki.groupby(df["hisse"]).transform(lambda s: s.rolling(20).mean())
    ) / (onceki.groupby(df["hisse"]).transform(lambda s: s.rolling(20).std()))
    df["zirve52_onceki"] = g["c"].transform(
        lambda s: s.rolling(250, min_periods=120).max().shift(1)
    )
    df["yakinlik"] = df["c"] / df["zirve52_onceki"]
    df["ileri5"] = g["c"].transform(lambda s: s.shift(-5) / s - 1)
    df["ileri20"] = g["c"].transform(lambda s: s.shift(-20) / s - 1)
    e1 = endeks.pct_change()
    e5 = endeks.shift(-5) / endeks - 1
    e20 = endeks.shift(-20) / endeks - 1
    df["e1"] = df["gun"].map(e1)
    df["fazla5"] = df["ileri5"] - df["gun"].map(e5)
    df["fazla20"] = df["ileri20"] - df["gun"].map(e20)
    df["goreli1"] = df["r1"] - df["e1"]
    return df


def etiketler(df: pd.DataFrame) -> dict[str, pd.Series]:
    buyuk_dusus = df["r1"] <= -2.5 * df["atr20"]
    panik = buyuk_dusus & (df["hz"] >= 2) & (df["clv"] <= -0.5)
    panik_dun = panik.groupby(df["hisse"]).shift(1, fill_value=False)
    return {
        "Tehlikeli atak: zirveye %3 yakın + hacim z≥2 + güçlü kapanış + endeksi geçti": (
            (df["yakinlik"] >= 0.97)
            & (df["hz"] >= 2)
            & (df["clv"] >= 0.5)
            & (df["goreli1"] > 0)
        ),
        "Kontra atak: panik gününün ertesi günü yükseliş + üst çeyrekte kapanış": (
            panik_dun & (df["r1"] > 0) & (df["clv"] >= 0.5)
        ),
        "Panik satışı: sert düşüş günü (≤ −2,5 ATR) + hacim z≥2 + dibe yakın kapanış": panik,
        "Pres (emme): hacim z≥2 ama fiyat ≤ 0,3 ATR oynadı + kapanış üstte": (
            (df["hz"] >= 2) & (df["r1"].abs() <= 0.3 * df["atr20"]) & (df["clv"] >= 0.3)
        ),
        "FOMO: günde ≥ +%7 + hacim z≥3": ((df["r1"] >= 0.07) & (df["hz"] >= 3)),
        "Topla oynama: AOF üstünde ve aralığın üst çeyreğinde kapanış": (
            (df["c"] > df["aof"]) & (df["clv"] >= 0.5)
        ),
    }


def soguma(df: pd.DataFrame, maske: pd.Series) -> pd.Series:
    sonuc = pd.Series(False, index=df.index)
    for idx in df[maske].groupby("hisse").groups.values():
        son = None
        for i in sorted(idx):
            sira = df.at[i, "sira"]
            if son is None or sira - son > SOGUMA_GUN:
                sonuc.at[i] = True
                son = sira
    return sonuc


def ozet(ad: str, d: pd.DataFrame, taban: pd.DataFrame) -> dict:
    f5 = d["fazla5"].dropna()
    f20 = d["fazla20"].dropna()
    t5 = f5.mean() / (f5.std(ddof=1) / np.sqrt(len(f5))) if len(f5) > 2 else np.nan
    gunluk = d.dropna(subset=["fazla5"]).groupby("gun")["fazla5"].mean()
    t_gun = (
        gunluk.mean() / (gunluk.std(ddof=1) / np.sqrt(len(gunluk)))
        if len(gunluk) > 2
        else np.nan
    )
    return {
        "Etiket": ad,
        "Olay": len(f5),
        "Hisse": d["hisse"].nunique(),
        "İsabet (5g endeksi geçti)": f"{(f5 > 0).mean():.0%}",
        "Ort. fazla 5g": f"{f5.mean():+.2%}",
        "t (5g)": f"{t5:.1f}",
        "Ayrı gün": len(gunluk),
        "t (gün kümeli)": f"{t_gun:.1f}",
        "Ort. fazla 20g": f"{f20.mean():+.2%}",
        "Taban isabet": f"{(taban['fazla5'].dropna() > 0).mean():.0%}",
    }


def tablo(satirlar: list[dict]) -> str:
    basliklar = list(satirlar[0].keys())
    cikti = [
        "| " + " | ".join(basliklar) + " |",
        "| " + " | ".join("---" for _ in basliklar) + " |",
    ]
    cikti += ["| " + " | ".join(str(s[b]) for b in basliklar) + " |" for s in satirlar]
    return "\n".join(cikti)


def main() -> None:
    df = ozellikler(hisseler(), endeks_serisi())
    df["sira"] = df.groupby("hisse").cumcount()
    gecerli = df["fazla5"].notna() & df["hz"].notna() & df["atr20"].notna()
    df = df[gecerli].copy()
    print(
        f"Örneklem: {df['gun'].min():%Y-%m-%d} → {df['gun'].max():%Y-%m-%d}, "
        f"{df['hisse'].nunique()} hisse, {len(df)} hisse-gün\n"
    )
    satirlar = []
    for ad, maske in etiketler(df).items():
        secili = df[soguma(df, maske)] if "Topla oynama" not in ad else df[maske]
        satirlar.append(ozet(ad, secili, df))
    print(tablo(satirlar))

    ta = etiketler(df)[
        "Tehlikeli atak: zirveye %3 yakın + hacim z≥2 + güçlü kapanış + endeksi geçti"
    ]
    olaylar = df[soguma(df, ta)]
    print("\nTehlikeli atak sayısı en yüksek hisseler (olay):")
    print(olaylar["hisse"].value_counts().head(10).to_string())

    # Futboldaki "topla oynama yüzdesi": son 20 günde 'topla oynama' günlerinin oranı, kesitte ileri 20g ile ilişki
    df["oyun"] = etiketler(df)[
        "Topla oynama: AOF üstünde ve aralığın üst çeyreğinde kapanış"
    ].astype(float)
    df["oyun20"] = df.groupby("hisse")["oyun"].transform(lambda s: s.rolling(20).mean())
    aylik = df[df["gun"].isin(df.groupby(df["gun"].dt.to_period("M"))["gun"].min())]
    ic = (
        aylik.dropna(subset=["oyun20", "fazla20"])
        .groupby("gun")
        .apply(
            lambda g: g["oyun20"].rank().corr(g["fazla20"].rank()), include_groups=False
        )
        .dropna()
    )
    print(
        f"\nTopla oynama yüzdesi (20g) → ileri 20g fazla getiri, aylık kesit Spearman: "
        f"IC {ic.mean():+.3f}, t {ic.mean() / (ic.std(ddof=1) / np.sqrt(len(ic))):+.1f}, {len(ic)} ay"
    )


if __name__ == "__main__":
    main()
