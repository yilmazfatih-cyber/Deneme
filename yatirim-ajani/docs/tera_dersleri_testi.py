"""Tera dersleri: kırılganlık filtresi, 'kaliteli momentum' ve rejim + PPF testi.

Rapor: docs/tera-fonlari-tersine-analiz-2026-11.md (bölüm 6).

Veri: ajan-ciktilari dalındaki veri/dosya/gunluk/*.csv.gz (74 hisse, 2024-01 → 2026-11).
Her ayın ilk işlem gününde kesit sıralaması yapılır; ileri 20 gün getirisi (ileri_20g) ve
20 gün içinde >= %10 düşüş (ileri_min_20g <= -0.10) ölçülür. Örtüşmeyen aylık örnekler.
Hayatta kalma yanlılığı vardır (bugünkü evren). Yatırım tavsiyesi değildir.

Çalıştırma (depo kökünden):
    git fetch origin ajan-ciktilari
    mkdir -p /tmp/cikti && git archive origin/ajan-ciktilari veri/dosya | tar -x -C /tmp/cikti
    python yatirim-ajani/docs/tera_dersleri_testi.py /tmp/cikti/veri/dosya/gunluk
"""

from __future__ import annotations

import glob
import sys

import numpy as np
import pandas as pd

if len(sys.argv) < 2:
    sys.exit("Kullanım: python tera_dersleri_testi.py <veri/dosya/gunluk klasörü>")
YOL = sys.argv[1]
MALIYET_TEK_YON = (
    0.0015  # %0,15 tek yön (komisyon + kayma), projedeki simülasyonla aynı
)

# Politika faizi yaklaşık yolu (yıllık, basit); PPF net getirisi bunun biraz altındadır.
FAIZ = [
    ("2024-01-01", 0.45),
    ("2024-03-22", 0.50),
    ("2024-12-27", 0.475),
    ("2025-01-24", 0.45),
    ("2025-03-07", 0.425),
    ("2025-04-18", 0.46),
    ("2025-07-25", 0.43),
    ("2025-09-12", 0.405),
    ("2025-10-24", 0.395),
    ("2025-12-12", 0.38),
    ("2026-01-23", 0.37),
    ("2026-10-23", 0.36),
]


def yukle() -> pd.DataFrame:
    parcalar = [
        pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(f"{YOL}/*.csv.gz"))
    ]
    df = pd.concat(parcalar, ignore_index=True)
    df = df[df["gun_sonu"].astype(bool)].copy()
    df["gun"] = pd.to_datetime(df["gun"])
    return df.sort_values(["gun", "hisse"])


def aylik_kesitler(df: pd.DataFrame) -> pd.DataFrame:
    ilk_gunler = df.groupby(df["gun"].dt.to_period("M"))["gun"].min()
    k = df[df["gun"].isin(ilk_gunler.values)].copy()
    k = k[k["ileri_20g"].notna()]
    k["dusus10"] = (k["ileri_min_20g"] <= -0.10).astype(float)
    return k


def yuzdelik(s: pd.Series) -> pd.Series:
    return s.rank(pct=True)


def skorla(k: pd.DataFrame) -> pd.DataFrame:
    """Kırılganlık skoru: Tera tipi hisselerin ortak izleri, kesitte yüzdelik ortalaması.

    - sığlık: düşük halka açıklık (fiili dolaşım) ve yüksek Amihud (fiyat etkisi / TL hacim)
    - temelden kopuş: yüksek PD/DD ve düşük kazanç verimi
    - piyango izi: son 20 günün en büyük günlük getirisi (tavan izleri)
    """
    k = k.copy()
    g = k.groupby("gun")
    k["r_sig_float"] = 1 - g["halka_aciklik"].transform(yuzdelik)
    k["r_amihud"] = g["amihud_20g"].transform(yuzdelik)
    k["r_pddd"] = g["pd_dd"].transform(yuzdelik)
    k["r_kv_ters"] = 1 - g["kazanc_verimi"].transform(yuzdelik)
    k["r_max"] = g["max_gunluk_20g"].transform(yuzdelik)
    k["r_mom6"] = g["getiri_120g"].transform(yuzdelik)
    bilesen = ["r_sig_float", "r_amihud", "r_pddd", "r_kv_ters", "r_max"]
    k["kirilganlik"] = k[bilesen].mean(axis=1, skipna=True)
    k["kirilgan_k5"] = g["kirilganlik"].transform(lambda s: s.rank(pct=True) > 0.8)
    k["mom_ust"] = k["r_mom6"] > 2 / 3
    return k


def portfoy_getirisi(k: pd.DataFrame, secim: pd.Series) -> pd.DataFrame:
    """Seçilen hisselere eşit ağırlık; ay başı al, 20 gün tut. Basit devir maliyeti."""
    satirlar = []
    onceki: set[str] = set()
    for gun, grup in k.groupby("gun"):
        sec = grup[secim.loc[grup.index]]
        hisseler = set(sec["hisse"])
        if not hisseler:
            satirlar.append((gun, 0.0, np.nan, 0, 0.0))
            onceki = set()
            continue
        degisen = len(hisseler.symmetric_difference(onceki)) / max(len(hisseler), 1)
        maliyet = min(degisen, 2.0) * MALIYET_TEK_YON
        satirlar.append(
            (
                gun,
                sec["ileri_20g"].mean() - maliyet,
                sec["dusus10"].mean(),
                len(hisseler),
                maliyet,
            )
        )
        onceki = hisseler
    return pd.DataFrame(
        satirlar, columns=["gun", "net", "dusus10", "n", "maliyet"]
    ).set_index("gun")


def ozet(ad: str, p: pd.DataFrame, ppf: pd.Series) -> dict:
    r = p["net"].dropna()
    toplam = (1 + r).prod() - 1
    servet = (1 + r).cumprod()
    maks_dusus = (servet / servet.cummax() - 1).min()
    t = r.mean() / (r.std(ddof=1) / np.sqrt(len(r))) if len(r) > 2 else np.nan
    yari = len(r) // 2
    ppf_toplam = (1 + ppf.loc[r.index]).prod() - 1
    return {
        "Strateji": ad,
        "Ay": len(r),
        "Ort. aylık net": f"{r.mean():+.2%}",
        "t": f"{t:.1f}",
        "Toplam net": f"{toplam:+.1%}",
        "1. yarı": f"{(1 + r.iloc[:yari]).prod() - 1:+.1%}",
        "2. yarı": f"{(1 + r.iloc[yari:]).prod() - 1:+.1%}",
        "Maks düşüş (aylık)": f"{maks_dusus:.1%}",
        "Ort. hisse": f"{p['n'].mean():.0f}",
        "P(20g içinde ≥%10 düşüş)": f"{p['dusus10'].mean():.0%}",
        "Aynı aylarda PPF (yaklaşık)": f"{ppf_toplam:+.1%}",
    }


def ppf_serisi(gunler: pd.DatetimeIndex) -> pd.Series:
    faiz = pd.Series({pd.Timestamp(t): f for t, f in FAIZ}).sort_index()
    yillik = faiz.reindex(faiz.index.union(gunler)).ffill().loc[gunler]
    return (1 + yillik) ** (1 / 12) - 1  # ~20 işlem günü ≈ 1 ay


def tablo(satirlar: list[dict]) -> str:
    basliklar = list(satirlar[0].keys())
    cikti = [
        "| " + " | ".join(basliklar) + " |",
        "| " + " | ".join("---" for _ in basliklar) + " |",
    ]
    cikti += ["| " + " | ".join(str(s[b]) for b in basliklar) + " |" for s in satirlar]
    return "\n".join(cikti)


def main() -> None:
    df = yukle()
    k = skorla(aylik_kesitler(df))
    # Ortak örneklem: momentum ve kırılganlık en az 60 hissede hesaplanabildiği aylar
    hazir = k.groupby("gun").apply(
        lambda g: (g["r_mom6"].notna() & g["kirilganlik"].notna()).sum(),
        include_groups=False,
    )
    k = k[k["gun"].isin(hazir[hazir >= 60].index)].copy()
    print(
        f"Ortak örneklem: {k['gun'].min():%Y-%m} → {k['gun'].max():%Y-%m}, {k['gun'].nunique()} ay\n"
    )
    ppf = ppf_serisi(pd.DatetimeIndex(sorted(k["gun"].unique())))

    hepsi = pd.Series(True, index=k.index)
    kirilgan = k["kirilgan_k5"]
    mom = k["mom_ust"]
    stratejiler = {
        "Evren eşit ağırlık (74 hisse)": hepsi,
        "Kırılganlardan kaçın (en kırılgan %20 hariç)": ~kirilgan,
        "Yalnız en kırılgan %20 (Tera tipi iz)": kirilgan,
        "6 ay momentum üst üçte bir": mom,
        "Kaliteli momentum (üst üçte bir, kırılgan hariç)": mom & ~kirilgan,
        "Kırılgan momentum (üst üçte bir ve kırılgan)": mom & kirilgan,
    }
    satirlar = [
        ozet(ad, portfoy_getirisi(k, sec), ppf) for ad, sec in stratejiler.items()
    ]
    print(tablo(satirlar))

    print("\nKırılganlık beşlisine göre havuzlanmış ileri 20 gün (aylık örnekler):")
    k = k[k["kirilganlik"].notna()].copy()
    k["kb"] = k.groupby("gun")["kirilganlik"].transform(
        lambda s: pd.qcut(s.rank(method="first"), 5, labels=False) + 1
    )
    havuz = k.groupby("kb").agg(
        n=("ileri_20g", "size"),
        ileri_20g=("ileri_20g", "mean"),
        medyan=("ileri_20g", "median"),
        dusus10=("dusus10", "mean"),
        ileri_60g=("ileri_60g", "mean"),
    )
    print(havuz.to_string(float_format=lambda x: f"{x:+.3f}"))

    print(
        "\nOlay: en kırılgan %20 VE son 60 günde > +%30 (Tera tipi 'sığ ralli') vs diğer > +%30 ralliler:"
    )
    ralli = k["getiri_60g"] > 0.30
    for ad, m in [
        ("sığ ralli (kırılgan)", ralli & k["kirilgan_k5"]),
        ("sağlam ralli (kırılgan değil)", ralli & ~k["kirilgan_k5"]),
        ("ralli yok", ~ralli),
    ]:
        d = k[m]
        print(
            f"  {ad:30s} n={len(d):4d}  ileri20 ort {d['ileri_20g'].mean():+.2%} medyan {d['ileri_20g'].median():+.2%}  ileri60 ort {d['ileri_60g'].mean():+.2%}  P(≥%10 düşüş,20g) {d['dusus10'].mean():.0%}"
        )

    print("\nEn kırılgan %20'de en sık görülen hisseler (ay sayısı):")
    print(k[k["kirilgan_k5"]]["hisse"].value_counts().head(15).to_string())

    print(
        "\nSkor bileşenlerinin ileri 20g ile Spearman korelasyonu (aylık ortalama, t):"
    )
    for c in [
        "r_sig_float",
        "r_amihud",
        "r_pddd",
        "r_kv_ters",
        "r_max",
        "r_mom6",
        "kirilganlik",
    ]:
        ic = (
            k.groupby("gun")
            .apply(
                lambda g, c=c: g[c].rank().corr(g["ileri_20g"].rank()),
                include_groups=False,
            )
            .dropna()
        )
        print(
            f"  {c:12s} IC {ic.mean():+.3f}  t {ic.mean() / (ic.std(ddof=1) / np.sqrt(len(ic))):+.1f}  ay {len(ic)}"
        )

    # Rejim: XU100 200 günlük ortalamanın üstündeyse hisse (evren eşit ağırlık), değilse PPF.
    print(
        "\nRejim testi (tüm aylar; XU100 > MA200 ise hisse, değilse PPF; geçişte 2×%0,15 maliyet):"
    )
    tum = aylik_kesitler(df)
    aylar = sorted(tum["gun"].unique())
    ppf_tum = ppf_serisi(pd.DatetimeIndex(aylar))
    satir = []
    onceki_hisse = None
    for gun in aylar:
        g = tum[tum["gun"] == gun]
        uzaklik = g["xu100_ma200_uzaklik"].dropna()
        if uzaklik.empty:
            continue
        hisse_mi = bool(uzaklik.iloc[0] > 0)
        ew = g["ileri_20g"].mean()
        r = ew if hisse_mi else ppf_tum.loc[gun]
        if onceki_hisse is not None and hisse_mi != onceki_hisse:
            r -= 2 * MALIYET_TEK_YON
        satir.append((gun, r, ew, ppf_tum.loc[gun], hisse_mi))
        onceki_hisse = hisse_mi
    rj = pd.DataFrame(satir, columns=["gun", "rejim", "ew", "ppf", "hisse"]).set_index(
        "gun"
    )
    for c in ["rejim", "ew", "ppf"]:
        s = (1 + rj[c]).cumprod()
        print(
            f"  {c:6s} {rj.index.min():%Y-%m}→{rj.index.max():%Y-%m} ({len(rj)} ay): toplam {s.iloc[-1] - 1:+.1%}, maks düşüş {(s / s.cummax() - 1).min():.1%}"
        )
    print(
        f"  hissede geçen ay: {int(rj['hisse'].sum())}/{len(rj)}; geçiş sayısı: {int((rj['hisse'] != rj['hisse'].shift()).sum() - 1)}"
    )

    # Tüm örneklem: evren eşit ağırlık ve PPF (rejim filtresi yok).
    ew_tum = tum.groupby("gun")["ileri_20g"].mean()
    ppf_tum_seri = ppf_tum.loc[ew_tum.index]
    print(
        f"\nTüm örneklem {ew_tum.index.min():%Y-%m}→{ew_tum.index.max():%Y-%m} ({len(ew_tum)} ay): "
        f"evren eşit ağırlık {(1 + ew_tum).prod() - 1:+.1%}, PPF (yaklaşık) {(1 + ppf_tum_seri).prod() - 1:+.1%}"
    )


if __name__ == "__main__":
    main()
