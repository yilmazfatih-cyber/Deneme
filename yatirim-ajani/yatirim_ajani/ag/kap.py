"""KAP katmanı: bildirimlerin tam saatiyle tüm BIST olay çalışmaları, portföy şirketlerinin pay bildirimleri (şirket bazında profil
ve ortak hisse ağı), halka arzda %5 üstü alanlar, yabancı oranı kesiti ve geçmişi, sektör endekslerinin uzun dönem mevsimselliği.

Kurallar: Tera grubu (hisseleri ve portföy şirketi) hiçbir hesapta yer almaz. Bildirim 18:00'den sonra ya da işlem günü dışında
yayımlandıysa olay günü sonraki ilk işlem günüdür. Anormal getiri = hissenin getirisi eksi kendi pazar katmanının eşit ağırlıklı
ortalaması. Olay günü tavanda (tabanda) kapanan hisse o kapanıştan alınamaz (satılamaz): sonrası pencereleri bu olaylar çıkarılarak
da raporlanır. Yatırım tavsiyesi değildir."""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from ..dosya.kaynaklar import HARIC
from .panel import Panel
from .yatirimci import TAVAN, _gun_kumeli

KAPANIS_SAATI = 18  # sürekli işlem 18:00'de biter; sonrası bildirimler ertesi güne aittir
ACILIS_DAKIKA = 9 * 60 + 55
PENCERE = {"once_20g": (-20, -1), "once_5g": (-5, -1), "gun_0": (0, 0), "sonra_1g": (1, 1), "sonra_3g": (1, 3), "sonra_5g": (1, 5), "sonra_20g": (1, 20), "sonra_60g": (1, 60)}
OZELLIK = ("buyukluk", "halka_acik_deger", "halka_aciklik", "devir_hizi_20g", "oynaklik_20g", "getiri_20g", "momentum_120_20", "zirveye_yakinlik", "defter_piyasa", "kazanc_verimi")


def _kucuk(s) -> str:
    return str(s).replace("İ", "i").replace("I", "ı").lower()


def konu_turu(konu: str) -> str:
    k = _kucuk(konu)
    if re.search(r"% ?5", k):
        return "halka_arz_5"
    if "geri alınan" in k:
        return "geri_alinan_satis"
    if "geri alın" in k:
        return "geri_alim"
    if "pay alım satım" in k:
        return "pay_alim_satim"
    if "kar payı" in k or "kâr payı" in k:
        return "kar_payi"
    if "sermaye art" in k:
        return "sermaye"
    if "birleşme" in k:
        return "birlesme"
    return "diger"


def bildiren_turu(unvan: str, kendi_kodu: bool) -> str:
    u = _kucuk(unvan)
    if "kamuyu aydınlatma platformu" in u:
        return "kap"
    if "portföy yönetimi" in u:
        return "portfoy"
    if "yatırım ortaklığı" in u or "girişim sermayesi" in u:
        return "yatirim_ortakligi"
    return "sirket" if kendi_kodu else "diger"


def alt_tur(tur: str, ozet: str) -> str:
    """Özet satırından alt tür: sermaye artırımında bedelli/bedelsiz/tahsisli ve aşama; kâr payında karar organı."""
    o = _kucuk(ozet)
    if tur == "sermaye":
        cesit = "bedelsiz" if "bedelsiz" in o else "tahsisli" if "tahsis" in o else "bedelli" if ("bedelli" in o or "rüçhan" in o) else "belirsiz"
        asama = "karar" if "yönetim kurulu" in o else "basvuru" if "başvuru" in o else "onay" if "onay" in o else "sonraki"
        return f"{cesit}_{asama}"
    if tur == "kar_payi":
        return "yk_karari" if "yönetim kurulu" in o else "genel_kurul" if "genel kurul" in o else "diger"
    return ""


AYNEN = {"RE-PIE", "MT", "QNB", "TEB", "ICBC", "HSBC", "ING", "A1", "KT"}  # kısaltma ve yabancı adlar olduğu gibi kalır


def _baslik(s: str) -> str:
    """Türkçe harf kurallarıyla başlık düzeni: "ZİRAAT" → "Ziraat", "MARMARA CAPİTAL" → "Marmara Capital"."""
    return " ".join(k if k in AYNEN else k[:1] + _kucuk(k[1:]) for k in str(s).split())


def _kodlar(v) -> list[str]:
    return [x.strip().upper() for x in str(v).split(",") if x.strip() and str(v) != "nan"]


def kap_yukle(klasor: str | Path, evren: set[str]) -> pd.DataFrame:
    """`kap_bildirimler.csv.gz` → sınıflanmış olay tablosu. `hisse` = bildirimin konusu olan pay (önce ilgili paylar, sonra bildirenin kodu)."""
    yol = Path(klasor) / "kap_bildirimler.csv.gz"
    if not yol.exists():
        return pd.DataFrame()
    L = pd.read_csv(yol)
    L["zaman"] = pd.to_datetime(L["publishDate"], format="%d.%m.%Y %H:%M:%S", errors="coerce")
    L = L.dropna(subset=["zaman"]).drop_duplicates("disclosureIndex")
    L["tur"] = L["subject"].map(konu_turu)
    ilgili = L["relatedStocks"].map(_kodlar)
    kendi = L["stockCodes"].map(_kodlar)
    L["hisse"] = [next((x for x in a if x in evren), None) or next((x for x in b if x in evren), None) for a, b in zip(ilgili, kendi)]
    L["bildiren_hisse"] = [next((x for x in b if x in evren), None) for b in kendi]
    L["bildiren"] = L["kapTitle"].astype(str).str.strip()
    L["bildiren_tur"] = [bildiren_turu(u, bool(b)) for u, b in zip(L["bildiren"], kendi)]
    L["ozet"] = L["summary"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    L["alt"] = [alt_tur(t, o) for t, o in zip(L["tur"], L["ozet"])]
    tera = L["bildiren"].map(_kucuk).str.contains(r"\btera\b", regex=True) | L["hisse"].isin(HARIC) | L["bildiren_hisse"].isin(HARIC)
    L = L[~tera & L["hisse"].notna()]
    return L[["disclosureIndex", "zaman", "tur", "alt", "hisse", "bildiren", "bildiren_tur", "bildiren_hisse", "ozet"]].rename(columns={"disclosureIndex": "no"}).sort_values("zaman").reset_index(drop=True)


def olay_gunu(zaman: pd.Series, gunler: pd.DatetimeIndex) -> tuple[np.ndarray, np.ndarray]:
    """Her bildirim için fiyatın ilk tepki verebileceği işlem gününün sırası ve yayım anı (oncesi / seans / sonrasi).
    Sıra `len(gunler)` ise bildirim verinin son gününden sonradır."""
    gun = zaman.dt.normalize()
    i = gunler.searchsorted(gun.values)
    ayni = (i < len(gunler)) & (gunler.values[np.minimum(i, len(gunler) - 1)] == gun.values)
    dakika = (zaman.dt.hour * 60 + zaman.dt.minute).values
    gec = ayni & (zaman.dt.hour.values >= KAPANIS_SAATI)
    i = i + gec.astype(int)
    an = np.where(~ayni | gec, "sonrasi", np.where(dakika < ACILIS_DAKIKA, "oncesi", "seans"))
    return i, an


class Pencereler:
    """Olay pencerelerinde anormal getiri: birikimli log anormal getiri matrisi üzerinden hızlı dilim farkı."""

    def __init__(self, P: Panel):
        self.gunler = P.R.index
        self.kolon = {h: j for j, h in enumerate(P.R.columns)}
        grup = P.evren["grup"].reindex(P.R.columns)

        def katman_ort(M: pd.DataFrame) -> pd.DataFrame:
            """Her hissenin kendi pazar katmanının eşit ağırlıklı (aritmetik) ortalaması, hisse sütunlarına yayılmış."""
            out = pd.DataFrame(np.nan, index=M.index, columns=M.columns)
            for g in grup.dropna().unique():
                c = grup.index[grup == g]
                out[c] = np.repeat(M[c].mean(axis=1).values[:, None], len(c), axis=1)
            return out

        # Anormal getiri = hissenin log getirisi − katman ortalamasının log'u. Pencere toplamının üssü, hisseyi tutmanın katmanı
        # tutmaya oranıdır: prod(1+r) / prod(1+katman) − 1. (Log getirilerin ortalamasını çıkarmak rastgele olayda bile artı sapma verir.)
        a = (np.log1p(P.R) - np.log1p(katman_ort(P.R))).values
        self.var = ~np.isnan(a)
        self.C = np.vstack([np.zeros((1, a.shape[1])), np.nancumsum(a, axis=0)])
        self.N = np.vstack([np.zeros((1, a.shape[1])), np.cumsum(self.var, axis=0)])
        self.ham = P.R.values
        self.gece = (P.GECE - katman_ort(P.GECE)).values
        self.gunici = (P.GI - katman_ort(P.GI)).values
        self.n = a.shape[0]

    def pencere(self, j: np.ndarray, i: np.ndarray, a: int, b: int) -> np.ndarray:
        bas, bit = i + a, i + b + 1
        gecerli = (bas >= 0) & (bit <= self.n) & (i < self.n)
        bas_, bit_ = np.clip(bas, 0, self.n), np.clip(bit, 0, self.n)
        deger = np.expm1(self.C[bit_, j] - self.C[bas_, j])
        dolu = (self.N[bit_, j] - self.N[bas_, j]) / max(1, b - a + 1)
        return np.where(gecerli & (dolu >= 0.7), deger, np.nan)

    def tablo(self, D: pd.DataFrame) -> pd.DataFrame:
        """D: hisse, i (olay günü sırası) → pencere sütunları eklenmiş kopya."""
        D = D[D["hisse"].isin(self.kolon) & (D["i"] < self.n) & (D["i"] >= 0)].copy()
        j = D["hisse"].map(self.kolon).values.astype(int)
        i = D["i"].values.astype(int)
        for ad, (a, b) in PENCERE.items():
            D[ad] = self.pencere(j, i, a, b)
        D["gece_0"] = self.gece[i, j]
        D["gunici_0"] = self.gunici[i, j]
        D["ham_0"] = self.ham[i, j]
        D["gun"] = self.gunler[i]
        return D


def _ozet(D: pd.DataFrame, sutunlar=("once_20g", "once_5g", "gun_0", "gece_0", "gunici_0", "sonra_1g", "sonra_5g", "sonra_20g", "sonra_60g")) -> dict:
    out = {c: _gun_kumeli(D[c], D["gun"]) for c in sutunlar if c in D}
    out["olay"] = int(len(D))
    out["hisse"] = int(D["hisse"].nunique())
    kilitsiz = D[D["ham_0"].abs() < TAVAN]
    out["kilit_orani"] = float(1 - len(kilitsiz) / len(D)) if len(D) else None
    out["kilitsiz"] = {c: _gun_kumeli(kilitsiz[c], kilitsiz["gun"]) for c in ("sonra_5g", "sonra_20g")}
    return out


def _ilkler(D: pd.DataFrame, anahtar: list[str], bosluk: int = 20) -> pd.DataFrame:
    """Aynı anahtarda art arda gelen bildirimlerden yalnız yeni bir dizinin ilki (önceki bildirimle arası > `bosluk` işlem günü)."""
    D = D.sort_values(anahtar + ["i", "zaman"])
    onceki = D.groupby(anahtar)["i"].shift(1)
    return D[onceki.isna() | (D["i"] - onceki > bosluk)]


def kap_olaylari(P: Panel, K: pd.DataFrame) -> dict:
    """Tüm BIST için konu bazında olay çalışması. Günlük tekrarlanan bildirimlerde (geri alım) dizinin ilki ayrıca raporlanır."""
    if K.empty:
        return {}
    W = Pencereler(P)
    K = K.copy()
    K["i"], K["an"] = olay_gunu(K["zaman"], P.R.index)
    T = W.tablo(K)
    out: dict = {"bildirim": int(len(K)), "eslesen": int(len(T)), "donem": [str(K["zaman"].min().date()), str(K["zaman"].max().date())],
                 "tur_sayim": K["tur"].value_counts().to_dict(), "an_sayim": T["an"].value_counts().to_dict(), "konu": {}}  # fmt: skip
    ga = T[T["tur"] == "geri_alim"]
    out["konu"]["geri_alim_ilk"] = _ozet(_ilkler(ga, ["hisse"], 20))
    out["konu"]["geri_alim_tum"] = _ozet(ga)
    out["konu"]["geri_alinan_satis"] = _ozet(_ilkler(T[T["tur"] == "geri_alinan_satis"], ["hisse"], 5))
    kp = T[T["tur"] == "kar_payi"]
    out["konu"]["kar_payi_yk"] = _ozet(_ilkler(kp[kp["alt"] == "yk_karari"], ["hisse"], 60))
    out["konu"]["kar_payi_ilk"] = _ozet(_ilkler(kp, ["hisse"], 120))
    se = T[T["tur"] == "sermaye"]
    for cesit in ("bedelsiz", "bedelli", "tahsisli"):
        d = se[se["alt"].str.startswith(cesit)]
        out["konu"][f"{cesit}_ilk"] = _ozet(_ilkler(d, ["hisse"], 120))
        out["konu"][f"{cesit}_onay"] = _ozet(_ilkler(d[d["alt"].str.endswith("onay")], ["hisse"], 60))
    out["konu"]["birlesme_ilk"] = _ozet(_ilkler(T[T["tur"] == "birlesme"], ["hisse"], 120))
    pa = T[T["tur"] == "pay_alim_satim"]
    for bt in ("portfoy", "yatirim_ortakligi", "kap", "sirket", "diger"):
        d = pa[pa["bildiren_tur"] == bt]
        out["konu"][f"pay_{bt}"] = _ozet(d)
        out["konu"][f"pay_{bt}_ilk"] = _ozet(_ilkler(d, ["bildiren", "hisse"], 20))
    # Yayım anına göre ilk tepki: seans dışı bildirimler açılışta mı fiyatlanıyor?
    out["an"] = {}
    for an, d in T[T["tur"].isin(["geri_alim", "pay_alim_satim", "kar_payi", "sermaye"])].groupby("an"):
        out["an"][str(an)] = {"olay": int(len(d)), "gece_0_mutlak": float(d["gece_0"].abs().mean()), "gunici_0_mutlak": float(d["gunici_0"].abs().mean())}
    # Pazar katmanına göre geri alım (büyük şirketlerde işaret değeri farklı mı?)
    gr = P.evren["bist100"].reindex(ga["hisse"]).values
    ilk = _ilkler(ga.assign(b100=gr), ["hisse"], 20)
    out["geri_alim_katman"] = {"bist100": _ozet(ilk[ilk["b100"] == 1]), "bist100_disi": _ozet(ilk[ilk["b100"] != 1])}
    out["geri_alim_yil"] = {str(y): int(n) for y, n in ga.groupby(ga["zaman"].dt.year).size().items()}
    return out


def olay_portfoyu(P: Panel, D: pd.DataFrame, tutma: int = 20, maliyet: float = 0.003, deneme: int = 1, min_pozisyon: int = 3, acilista: bool = False) -> dict:
    """Olaydan sonra alınıp `tutma` işlem günü tutulan eşit ağırlıklı sepetin günlük getirisi (takvim zamanı: her gün bir gözlem).
    `acilista=False`: olay gününün kapanışında alınır. `acilista=True`: olay gününün açılışında alınır (seans dışı yayımlanan
    bildirimler için); o günün açılıştan kapanışa getirisi sepete girer.
    Dürüstlük: alım anında tavanda olan hisse alınmaz; çıkış günü tabanda kapanan pozisyon satılabildiği güne (en çok 10 gün) taşınır.
    Kıyas: her pozisyonun kendi pazar katmanının eşit ağırlıklı getirisi. Maliyet: pozisyon başına gidiş-dönüş, tutma süresine yayılır."""
    from .strateji import ozet

    R, GI, GE = P.R.values, P.GI.values, P.GECE.values
    n, m = R.shape
    kolon = {h: j for j, h in enumerate(P.R.columns)}
    grup = P.evren["grup"].reindex(P.R.columns)
    GM, GMI = np.full_like(R, np.nan), np.full_like(R, np.nan)
    with np.errstate(all="ignore"):
        for g in grup.dropna().unique():
            c = np.where((grup == g).values)[0]
            if len(c):
                GM[:, c] = np.nanmean(R[:, c], axis=1, keepdims=True)
                GMI[:, c] = np.nanmean(GI[:, c], axis=1, keepdims=True)
    tutulan = np.zeros((n, m), dtype=bool)  # kapanıştan kapanışa tutulan günler
    giris = np.zeros((n, m), dtype=bool)  # açılışta girilen gün (yalnız gün içi getiri)
    alinan = atlanan = 0
    for h, i in zip(D["hisse"], D["i"].astype(int)):
        j = kolon.get(h)
        if j is None or i >= n - 1 or i < 0 or np.isnan(R[i, j]):
            continue
        if (acilista and (np.isnan(GE[i, j]) or GE[i, j] >= TAVAN or np.isnan(GI[i, j]))) or (not acilista and R[i, j] >= TAVAN):
            atlanan += 1
            continue
        son = min(n - 1, i + tutma)
        ek = 0
        while son < n - 1 and R[son, j] <= -TAVAN and ek < 10:
            son += 1
            ek += 1
        if acilista and not tutulan[i, j]:
            giris[i, j] = True
        tutulan[i + 1 : son + 1, j] = True
        alinan += 1
    giris &= ~tutulan
    say = tutulan.sum(axis=1) + giris.sum(axis=1)
    gecerli = say >= min_pozisyon
    z = np.nan_to_num
    Rg = (np.where(tutulan, z(R), 0.0).sum(axis=1) + np.where(giris, z(GI), 0.0).sum(axis=1)) / np.maximum(say, 1)
    Kg = (np.where(tutulan, z(GM), 0.0).sum(axis=1) + np.where(giris, z(GMI), 0.0).sum(axis=1)) / np.maximum(say, 1)
    gun = P.R.index[gecerli]
    brut = pd.Series(Rg[gecerli], index=gun)
    kiyas = pd.Series(Kg[gecerli], index=gun)
    net = brut - maliyet / max(1, tutma)
    out = {"alinan": int(alinan), "tavanda_atlanan": int(atlanan), "tutma_gun": tutma, "acilista": bool(acilista), "ort_pozisyon": float(say[gecerli].mean()) if gecerli.any() else 0.0,
           "yatirimda_gun_orani": float(gecerli.mean()), "brut": ozet(brut, kiyas), "net": ozet(net, kiyas, deneme=deneme), "kiyas": ozet(kiyas)}  # fmt: skip
    fazla = net - kiyas
    out["yil_fazla"] = {str(y): float(v.mean() * 250) for y, v in fazla.groupby(fazla.index.year)}
    out["dsr_fazla"] = ozet(fazla, deneme=deneme).get("dsr") if deneme > 1 else None
    return out


def kap_kurallari(P: Panel, K: pd.DataFrame, deneme: int = 95, detay: pd.DataFrame | None = None) -> dict:
    """Bildirimlerden türetilen kuralların takvim zamanlı sepet testi (maliyet gidiş-dönüş 30 bp, kıyas = pazar katmanı).
    Olay ortalamaları birkaç hisseye ve kümelenmiş günlere fazla ağırlık verir; karar bu testin fazla getirisine ve t değerine göre verilir."""
    if K.empty:
        return {}
    W = Pencereler(P)
    K = K.copy()
    K["i"], K["an"] = olay_gunu(K["zaman"], P.R.index)
    T = W.tablo(K)
    ga = _ilkler(T[T["tur"] == "geri_alim"], ["hisse"], 20)
    se = T[T["tur"] == "sermaye"]
    bz = _ilkler(se[se["alt"].str.startswith("bedelsiz")], ["hisse"], 120)
    bl = _ilkler(se[se["alt"].str.startswith("bedelli")], ["hisse"], 120)
    pk = _ilkler(T[(T["tur"] == "pay_alim_satim") & (T["bildiren_tur"] == "kap")], ["hisse"], 20)
    pp = T[(T["tur"] == "pay_alim_satim") & (T["bildiren_tur"] == "portfoy")]
    ps = _ilkler(T[(T["tur"] == "pay_alim_satim") & (T["bildiren_tur"] == "sirket")], ["bildiren", "hisse"], 20)
    kp = _ilkler(T[(T["tur"] == "kar_payi") & (T["alt"] == "yk_karari")], ["hisse"], 60)
    out: dict = {"deneme_sayisi": deneme, "maliyet": 0.003}
    gad = ga[ga["an"] != "seans"]  # seans dışında yayımlanan ilk bildirimler: ertesi açılışta alınabilir
    out["geri_alim_acilis_5g"] = olay_portfoyu(P, gad, 5, 0.003, deneme, acilista=True)
    # Sağlamlık: tutma süresi, maliyet, işlem hacmi, bildirim öncesi güç, çeyrekler
    guclu = gad["once_20g"] >= 0
    hacim = P.evren["hacim_60g"].reindex(gad["hisse"]).to_numpy(float) if "hacim_60g" in P.evren else np.full(len(gad), np.nan)
    out["geri_alim_duyarlilik"] = {
        "3 gün tut": olay_portfoyu(P, gad, 3, 0.003, deneme, acilista=True),
        "5 gün tut (temel kural)": out["geri_alim_acilis_5g"],
        "10 gün tut": olay_portfoyu(P, gad, 10, 0.003, deneme, acilista=True),
        "5 gün, maliyet 60 bp": olay_portfoyu(P, gad, 5, 0.006, deneme, acilista=True),
        "5 gün, günlük hacmi 20 mn TL üstü": olay_portfoyu(P, gad[hacim >= 2e7], 5, 0.003, deneme, acilista=True),
        "5 gün, bildirim öncesi 20 günde katmanının üstünde": olay_portfoyu(P, gad[guclu], 5, 0.003, deneme, acilista=True, min_pozisyon=2),
        "5 gün, bildirim öncesi 20 günde katmanının altında": olay_portfoyu(P, gad[~guclu & gad["once_20g"].notna()], 5, 0.003, deneme, acilista=True, min_pozisyon=2),
    }
    uc = ((1 + gad["gunici_0"]) * (1 + gad["sonra_3g"]) - 1).rename("uc")
    q = pd.concat([uc, gad["gun"]], axis=1).dropna()
    out["geri_alim_ceyrek"] = {str(k): {"olay": int(len(v)), "ort": float(v["uc"].mean()), "medyan": float(v["uc"].median())} for k, v in q.groupby(q["gun"].dt.to_period("Q"))}
    out["geri_alim_olay3"] = {"olay": int(len(q)), "ort": float(q["uc"].mean()), "medyan": float(q["uc"].median()), "pozitif": float((q["uc"] > 0).mean()),
                              "en_iyi_10_haric": float(q["uc"].sort_values().iloc[:-10].mean()) if len(q) > 30 else None}  # fmt: skip
    for tut in (5, 20, 60):
        out[f"geri_alim_kapanis_{tut}g"] = olay_portfoyu(P, ga, tut, 0.003, deneme)
        out[f"bedelsiz_{tut}g"] = olay_portfoyu(P, bz, tut, 0.003, deneme)
    out["bedelli_20g"] = olay_portfoyu(P, bl, 20, 0.003, deneme, min_pozisyon=2)
    out["kap_esik_20g"] = olay_portfoyu(P, pk, 20, 0.003, deneme)
    out["portfoy_20g"] = olay_portfoyu(P, pp, 20, 0.003, deneme)
    out["portfoy_60g"] = olay_portfoyu(P, pp, 60, 0.003, deneme)
    out["sirket_alimi_20g"] = olay_portfoyu(P, ps, 20, 0.003, deneme)
    out["kar_payi_20g"] = olay_portfoyu(P, kp, 20, 0.003, deneme)
    if detay is not None and not detay.empty and "yon" in detay:
        yon = pp.merge(detay[["no", "yon"]], on="no", how="left")
        for y in ("alim", "satim"):
            d = yon[yon["yon"] == y]
            if len(d) >= 30:
                out[f"portfoy_{y}_20g"] = olay_portfoyu(P, d, 20, 0.003, deneme)
        kyon = T[(T["tur"] == "pay_alim_satim") & (T["bildiren_tur"] == "kap")].merge(detay[["no", "yon"]], on="no", how="left")
        for y in ("alim", "satim"):
            d = _ilkler(kyon[kyon["yon"] == y], ["hisse"], 20)
            if len(d) >= 30:
                out[f"kap_esik_{y}_20g"] = olay_portfoyu(P, d, 20, 0.003, deneme)
    # Portföy şirketi bildirimleri: düzenleme öncesi ve sonrası (28 Ağustos 2026 fon rehberi)
    out["portfoy_donem"] = {}
    for ad, b0, b1 in (("28 Ağu 2026 öncesi", "2024-01-01", "2026-08-27"), ("28 Ağu 2026 sonrası", "2026-08-28", "2100-01-01")):
        d = pp[(pp["zaman"] >= b0) & (pp["zaman"] <= b1)]
        out["portfoy_donem"][ad] = {"bildirim": int(len(d)), **{c: _gun_kumeli(d[c], d["gun"]) for c in ("once_20g", "gun_0", "sonra_5g", "sonra_20g")}}
    out["geri_alim_yil"] = {str(y): {"olay": int(len(d)), **{c: float(d[c].mean()) for c in ("gun_0", "gunici_0", "sonra_5g", "sonra_20g")}} for y, d in ga.groupby(ga["zaman"].dt.year)}
    # Halka arzda %5 üstü alım bildirimi gelen paylar (liste düzeyi; alıcının kimliği bildirim metnindedir)
    a5 = _ilkler(T[T["tur"] == "halka_arz_5"], ["hisse"], 250)
    out["halka_arz_5"] = {**_ozet(a5), "hisseler": a5.sort_values("zaman")["hisse"].tolist()[-60:], "bildiren": a5["bildiren"].value_counts().head(12).to_dict()}
    return out


def _yuzdelikler(P: Panel, X: dict[str, pd.DataFrame]) -> dict[str, np.ndarray]:
    """Özelliklerin günlük kesitteki yüzdelik sırası, panelin gün ve hisse eksenine hizalanmış."""
    return {ad: X[ad].reindex(index=P.R.index, columns=P.R.columns).rank(axis=1, pct=True).values for ad in OZELLIK if ad in X}


def portfoy_profilleri(P: Panel, K: pd.DataFrame, X: dict[str, pd.DataFrame], detay: pd.DataFrame | None = None, min_bildirim: int = 5) -> dict:
    """Portföy yönetim şirketlerinin pay alım satım bildirimleri: şirket bazında kaç bildirim, hangi hisseler, hedef hisselerin bildirim
    öncesindeki özellikleri (kesitteki yüzdelik), halka arzla ilişki, bildirim öncesi ve sonrası anormal getiri. `detay` verilirse
    (bildirim metinlerinden ayrıştırılmış yön ve oran) alım ve satım ayrı raporlanır."""
    pa = K[(K["tur"] == "pay_alim_satim") & (K["bildiren_tur"] == "portfoy")].copy()
    if pa.empty:
        return {}
    W = Pencereler(P)
    pa["i"], pa["an"] = olay_gunu(pa["zaman"], P.R.index)
    T = W.tablo(pa)
    Y = _yuzdelikler(P, X)
    j = T["hisse"].map(W.kolon).values.astype(int)
    i0 = np.clip(T["i"].values.astype(int) - 1, 0, W.n - 1)
    for ad, M in Y.items():
        T["oz_" + ad] = M[i0, j]
    ev = P.evren
    arz = pd.Series(pd.to_datetime(ev["halka_arz"].reindex(T["hisse"]).values, errors="coerce"), index=T.index)
    T["arz_yasi_gun"] = (T["gun"] - arz).dt.total_seconds() / 86400
    T["bist100"] = ev["bist100"].reindex(T["hisse"]).values
    hizala = lambda M: M.reindex(index=P.R.index, columns=P.R.columns).ffill(limit=5).values  # noqa: E731
    T["pd"] = hizala(P.PD)[i0, j]
    T["hao"] = hizala(P.HAO)[i0, j]
    T["sirket"] = T["bildiren"].str.replace(r"\s*PORTFÖY YÖNETİMİ.*$", "", regex=True).str.strip().map(_baslik)
    if detay is not None and not detay.empty:
        T = T.merge(detay[["no", "yon", "oran_once", "oran_sonra", "fon_sayisi"]], on="no", how="left")
    else:
        T["yon"] = None
    ozk = [c for c in T.columns if c.startswith("oz_")]
    ciftler = T.sort_values("zaman").drop_duplicates(["sirket", "hisse"])  # her (şirket, hisse) için ilk bildirim

    def profil(d: pd.DataFrame) -> dict:
        ilk = d.sort_values("zaman").drop_duplicates("hisse")
        p = {"bildirim": int(len(d)), "hisse_sayisi": int(d["hisse"].nunique()), "ilk": str(d["zaman"].min().date()), "son": str(d["zaman"].max().date()),
             "yil": {str(y): int(n) for y, n in d.groupby(d["zaman"].dt.year).size().items()},
             "hisseler": [(h, int(n)) for h, n in d["hisse"].value_counts().head(12).items()],
             "en_buyuk_pay": float(d["hisse"].value_counts(normalize=True).iloc[0]),
             "ozellik_medyan": {c[3:]: (float(ilk[c].median()) if ilk[c].notna().sum() >= 3 else None) for c in ozk},
             "bist100_payi": float((ilk["bist100"] == 1).mean()), "pd_medyan_mlr": float(ilk["pd"].median() / 1e9) if ilk["pd"].notna().any() else None,
             "hao_medyan_mlr": float(ilk["hao"].median() / 1e9) if ilk["hao"].notna().any() else None,
             "yeni_arz_payi": float((ilk["arz_yasi_gun"] <= 365).mean()) if ilk["arz_yasi_gun"].notna().any() else None,
             "arz_yasi_medyan_gun": float(ilk["arz_yasi_gun"].median()) if ilk["arz_yasi_gun"].notna().any() else None,
             "ilk_bildirim": {c: _gun_kumeli(ilk[c], ilk["gun"]) for c in ("once_20g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g")},
             "tum": {c: _gun_kumeli(d[c], d["gun"]) for c in ("once_20g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g")}}  # fmt: skip
        if d["yon"].notna().any():
            for yon in ("alim", "satim"):
                y = d[d["yon"] == yon]
                p[yon] = {"bildirim": int(len(y)), **{c: _gun_kumeli(y[c], y["gun"]) for c in ("once_20g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g")}}
            if "oran_sonra" in d and d["oran_sonra"].notna().any():
                p["oran_sonra_medyan"] = float(d["oran_sonra"].median())
                p["oran_sonra_en_yuksek"] = float(d["oran_sonra"].max())
        return p

    out: dict = {"bildirim": int(len(T)), "sirket_sayisi": int(T["sirket"].nunique()), "hisse_sayisi": int(T["hisse"].nunique()), "hepsi": profil(T), "sirket": {}}
    for s, d in T.groupby("sirket"):
        if len(d) >= min_bildirim:
            out["sirket"][str(s)] = profil(d)
    # Hedef özellikleri: (şirket, hisse) çiftleri üzerinden, ortadaki hisseye (%50) göre
    out["hedef_ozellikleri"] = {}
    for c in ozk:
        x = ciftler[c].dropna()
        if len(x) >= 10:
            out["hedef_ozellikleri"][c[3:]] = {"medyan": float(x.median()), "ort": float(x.mean()), "n": int(len(x)), "t": float((x.mean() - 0.5) / (x.std() / np.sqrt(len(x))))}
    # Ortak hisse ağı: iki şirketin bildirim verdiği hisse kümelerinin kesişimi
    kume = {s: set(d["hisse"]) for s, d in T.groupby("sirket") if d["hisse"].nunique() >= 3}
    adlar = sorted(kume)
    bag = []
    for a_i, a in enumerate(adlar):
        for b in adlar[a_i + 1 :]:
            ortak = kume[a] & kume[b]
            if len(ortak) >= 2:
                bag.append({"a": a, "b": b, "ortak": sorted(ortak), "adet": len(ortak), "jaccard": round(len(ortak) / len(kume[a] | kume[b]), 3)})
    out["ortak_hisse_agi"] = sorted(bag, key=lambda x: -x["adet"])[:40]
    sayim = T.groupby("hisse")["sirket"].nunique().sort_values(ascending=False)
    out["en_kalabalik_hisseler"] = [{"hisse": h, "sirket": int(n), "bildirim": int((T["hisse"] == h).sum()), "sirketler": sorted(set(T.loc[T["hisse"] == h, "sirket"]))} for h, n in sayim.head(25).items() if n >= 2]
    out["olaylar"] = T.assign(gun=T["gun"].dt.strftime("%Y-%m-%d"))[["no", "sirket", "hisse", "gun", "an", "yon", "once_20g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g"]].round(4).to_dict(orient="records")
    return out


# --- bildirim metinleri --------------------------------------------------------------------------
_SAYI = r"(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)"


def _sayi(s: str) -> float | None:
    try:
        return float(s.replace(".", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None


def detay_ayristir(metin: str) -> dict:
    """Pay alım satım bildirimi metninden yön ve oranlar. KAP sayfasının düz metni üzerinde çalışır; bulunamayan alan None kalır.
    Yön: metindeki işlem ifadelerinden ("alış", "satış" işlemi; "payı ... yükselmiştir / düşmüştür"; önce ve sonra oranları)."""
    m = _kucuk(metin)
    out: dict = {"yon": None, "oran_once": None, "oran_sonra": None, "fon_sayisi": None, "fiyat": None}
    # sınır aşımı cümlesi: "... sermayedeki payı/oy hakları ... %X sınırını aşmıştır / altına düşmüştür / ulaşmıştır"
    oranlar = [_sayi(x) for x in re.findall(r"%\s*" + _SAYI, m)]
    oranlar = [x for x in oranlar if x is not None and 0 <= x <= 100]
    asti = bool(re.search(r"aşmıştır|aşmış|ulaşmıştır|yükselmiştir|geçmiştir|çıkmıştır", m))
    dustu = bool(re.search(r"altına düşmüş|altına inmiş|düşmüştür|inmiştir|gerilemiştir|azalmıştır", m))
    alis = len(re.findall(r"\balış\b|\balım\b|\balınmış|satın al", m))
    satis = len(re.findall(r"\bsatış\b|\bsatım\b|\bsatılmış|\bsatmış", m))
    es = re.search(r"işlem öncesi[^%]{0,80}%\s*" + _SAYI + r".{0,200}?işlem sonrası[^%]{0,80}%\s*" + _SAYI, m, re.S)
    if es:
        out["oran_once"], out["oran_sonra"] = _sayi(es.group(1)), _sayi(es.group(2))
    if out["oran_once"] is not None and out["oran_sonra"] is not None and out["oran_once"] != out["oran_sonra"]:
        out["yon"] = "alim" if out["oran_sonra"] > out["oran_once"] else "satim"
    elif asti != dustu:
        out["yon"] = "alim" if asti else "satim"
    elif alis != satis and (alis + satis) > 0:
        out["yon"] = "alim" if alis > satis else "satim"
    if out["oran_sonra"] is None and oranlar:
        out["oran_sonra"] = oranlar[-1]
    fonlar = set(re.findall(r"\b[a-zçğıöşü]{2,}\s+portföy[^.,;\n]{3,80}?fon", m))
    out["fon_sayisi"] = len(fonlar) or None
    f = re.search(r"(?:ortalama|fiyat)[^0-9]{0,40}" + _SAYI + r"\s*(?:tl|türk lirası)", m)
    out["fiyat"] = _sayi(f.group(1)) if f else None
    return out


def detay_yukle(klasor: str | Path) -> pd.DataFrame:
    """`kap_pay_detay.csv.gz` (bildirim sayfalarının düz metni) → bildirim başına yön ve oranlar. Dosya yoksa ya da eski biçimdeyse boş tablo."""
    yol = Path(klasor) / "kap_pay_detay.csv.gz"
    if not yol.exists():
        return pd.DataFrame()
    try:
        D = pd.read_csv(yol)
    except Exception:  # noqa: BLE001
        return pd.DataFrame()
    if D.empty or "metin" not in D or "disclosureIndex" not in D:
        return pd.DataFrame()
    if "durum" in D:
        D = D[D["durum"] == 200]
    D = D[D["metin"].notna()].drop_duplicates("disclosureIndex")
    if D.empty:
        return pd.DataFrame()
    A = pd.DataFrame([detay_ayristir(x) for x in D["metin"]])
    A.insert(0, "no", D["disclosureIndex"].values)
    A["metin"] = D["metin"].values
    A["oncelik"] = D["oncelik"].values if "oncelik" in D else 9
    return A


# --- yabancı oranı -------------------------------------------------------------------------------
def _tr_sayi(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")


def yabanci_kesit(P: Panel, klasor: str | Path, X: dict[str, pd.DataFrame]) -> dict:
    """İş Yatırım'ın yabancı oranı tablosunun güncel kesiti: yabancının payı hangi hisselerde yüksek? Özelliklerle sıra korelasyonu,
    pazar katmanı ve sektör ortalamaları. (Oran = halka açık paylar içinde yabancı yatırımcıların payı, %.)"""
    yol = Path(klasor) / "yabanci_oran_guncel.csv.gz"
    if not yol.exists():
        return {}
    T = pd.read_csv(yol)
    kod = next((c for c in T.columns if "Kod" in c), None)
    oranlar = [c for c in T.columns if c.startswith("s2_") or c.startswith("s3_")]
    if not kod or len(oranlar) < 2:
        return {}
    Y = pd.DataFrame({"hisse": T[kod].astype(str).str.strip(), "once": _tr_sayi(T[oranlar[0]]), "oran": _tr_sayi(T[oranlar[1]])})
    Y = Y[Y["hisse"].isin(P.R.columns) & ~Y["hisse"].isin(HARIC)].dropna(subset=["oran"]).set_index("hisse")
    ev = P.evren.reindex(Y.index)
    Y["grup"], Y["sektor"], Y["pd"] = ev["grup"], ev["sektor"], ev["pd_son"]
    out: dict = {"hisse": int(len(Y)), "ort": float(Y["oran"].mean()), "medyan": float(Y["oran"].median()),
                 "pd_agirlikli": float((Y["oran"] * Y["pd"]).sum() / Y["pd"].sum()) if Y["pd"].notna().any() else None,
                 "grup": {g: {"hisse": int(len(d)), "ort": float(d["oran"].mean()), "medyan": float(d["oran"].median())} for g, d in Y.groupby("grup")},
                 "sektor": sorted(({"sektor": s, "hisse": int(len(d)), "ort": float(d["oran"].mean()), "medyan": float(d["oran"].median())} for s, d in Y.groupby("sektor") if len(d) >= 4), key=lambda x: -x["medyan"]),
                 "en_yuksek": [(h, float(v)) for h, v in Y["oran"].sort_values(ascending=False).head(20).items()],
                 "yuzde10_alti_payi": float((Y["oran"] < 10).mean()), "yuzde40_ustu_payi": float((Y["oran"] >= 40).mean())}  # fmt: skip
    # Özelliklerle sıra korelasyonu: tüm hisseler ve BIST 100 içinde
    son = {ad: X[ad].reindex(index=P.R.index).ffill(limit=5).iloc[-1].reindex(Y.index) for ad in X}
    out["ozellik"] = {}
    for ad, x in son.items():
        d = pd.DataFrame({"y": Y["oran"], "x": x}).dropna()
        if len(d) < 60:
            continue
        r = float(d["y"].rank().corr(d["x"].rank()))
        b = d[P.evren["bist100"].reindex(d.index) == 1]
        out["ozellik"][ad] = {"sira_kor": r, "t": float(r * np.sqrt((len(d) - 2) / max(1e-9, 1 - r * r))), "n": int(len(d)),
                              "bist100_sira_kor": float(b["y"].rank().corr(b["x"].rank())) if len(b) >= 40 else None}  # fmt: skip
    # Büyüklük dilimlerine göre ortalama oran (piyasa değeri ondalıkları)
    d = Y.dropna(subset=["pd"])
    d = d.assign(dilim=pd.qcut(d["pd"], 10, labels=False))
    out["buyukluk_dilimi"] = [{"dilim": int(k) + 1, "ort": float(v["oran"].mean()), "medyan": float(v["oran"].median()), "pd_medyan_mlr": float(v["pd"].median() / 1e9)} for k, v in d.groupby("dilim")]
    return out


def yabanci_gecmis(P: Panel, klasor: str | Path, X: dict[str, pd.DataFrame]) -> dict:
    """Haftalık yabancı oranı kesitlerinden: yabancı payı hangi hisselerde arttı, artış öncesinde hisse neye benziyordu, artıştan sonra
    getiri nasıldı. Oran değişimi = bitiş − başlangıç (puan). Tüm testler hisse kesitinde, hafta kümelenmiş."""
    yol = Path(klasor) / "yabanci_gecmis.csv.gz"
    if not yol.exists():
        return {}
    G = pd.read_csv(yol)
    kod = next((c for c in G.columns if c.upper() in ("HISSE_KODU", "KOD", "HISSE")), None)
    bas_s = next((c for c in G.columns if "START" in c.upper() or "BASLANGIC_ORAN" in c.upper() or c.upper().endswith("_BAS")), None)
    bit_s = next((c for c in G.columns if "END" in c.upper() or "BITIS_ORAN" in c.upper() or c.upper().endswith("_BIT")), None)
    if not kod or not bas_s or not bit_s:
        return {"hata": f"sütunlar tanınmadı: {list(G.columns)[:12]}"}
    a = G[["baslangic", kod, bas_s]].rename(columns={"baslangic": "tarih", kod: "hisse", bas_s: "oran"})
    b = G[["bitis", kod, bit_s]].rename(columns={"bitis": "tarih", kod: "hisse", bit_s: "oran"})
    U = pd.concat([a, b], ignore_index=True)
    U["oran"] = pd.to_numeric(U["oran"], errors="coerce")
    U["hisse"] = U["hisse"].astype(str).str.strip()
    U = U[U["hisse"].isin(P.R.columns) & ~U["hisse"].isin(HARIC)].dropna().drop_duplicates(["tarih", "hisse"])
    O = U.pivot(index="tarih", columns="hisse", values="oran").sort_index()
    O.index = pd.to_datetime(O.index)
    if len(O) < 8:
        return {"hata": f"yetersiz hafta: {len(O)}"}
    gunler = P.R.index
    idx = np.clip(gunler.searchsorted(O.index.values, side="right") - 1, 0, len(gunler) - 1)
    lr = np.log1p(P.R)
    piyasa = lr.mean(axis=1)
    C = (lr.sub(piyasa, axis=0)).fillna(0).cumsum()
    D = O.diff()  # haftalık değişim (puan)
    out: dict = {"hafta": int(len(O)), "donem": [str(O.index[0].date()), str(O.index[-1].date())], "hisse": int(O.shape[1]),
                 "ort_oran_ilk": float(O.iloc[0].mean()), "ort_oran_son": float(O.iloc[-1].mean())}  # fmt: skip
    # Toplam: piyasa değeri ağırlıklı ortalama oran serisi
    pdm = P.PD.reindex(index=gunler).ffill(limit=5).reindex(gunler[idx]).set_axis(O.index).reindex(columns=O.columns)
    agir = (O * pdm).sum(axis=1) / pdm.where(O.notna()).sum(axis=1)
    out["toplam_seri"] = [(str(t.date()), float(v)) for t, v in agir.dropna().items()]
    satir = []
    for k in range(1, len(O) - 1):
        i0, i1, i2 = idx[k - 1], idx[k], idx[k + 1]
        d = D.iloc[k].dropna()
        if len(d) < 100 or i1 <= i0 or i2 <= i1:
            continue
        ayni = (C.iloc[i1] - C.iloc[i0]).reindex(d.index)  # aynı haftanın anormal getirisi
        sonra = (C.iloc[i2] - C.iloc[i1]).reindex(d.index)  # sonraki haftanın anormal getirisi
        i4 = min(len(gunler) - 1, i1 + 20)
        sonra20 = (C.iloc[i4] - C.iloc[i1]).reindex(d.index) if i4 > i1 else pd.Series(np.nan, index=d.index)
        once = (C.iloc[i0] - C.iloc[max(0, i0 - 20)]).reindex(d.index)  # önceki 20 gün
        s = {"tarih": O.index[k], "ayni_kor": d.rank().corr(ayni.rank()), "sonra_kor": d.rank().corr(sonra.rank()), "sonra20_kor": d.rank().corr(sonra20.rank()), "once_kor": d.rank().corr(once.rank())}
        q = pd.qcut(d.rank(method="first"), 5, labels=False)
        s["ust_alt_sonra"] = float(np.expm1(sonra[q == 4].mean()) - np.expm1(sonra[q == 0].mean()))
        s["ust_alt_sonra20"] = float(np.expm1(sonra20[q == 4].mean()) - np.expm1(sonra20[q == 0].mean()))
        s["ust_alt_ayni"] = float(np.expm1(ayni[q == 4].mean()) - np.expm1(ayni[q == 0].mean()))
        for ad in OZELLIK:
            if ad in X:
                x = X[ad].reindex(index=gunler).iloc[i0].reindex(d.index)
                s["oz_" + ad] = d.rank().corr(x.rank())
        satir.append(s)
    S = pd.DataFrame(satir)
    if S.empty:
        return out

    def t_ozet(x: pd.Series) -> dict:
        x = x.dropna()
        return {"ort": float(x.mean()), "t": float(x.mean() / (x.std() / np.sqrt(len(x)))) if len(x) > 5 and x.std() > 0 else None, "hafta": int(len(x)), "pozitif": float((x > 0).mean())}

    out["getiri"] = {c: t_ozet(S[c]) for c in ("once_kor", "ayni_kor", "sonra_kor", "sonra20_kor", "ust_alt_ayni", "ust_alt_sonra", "ust_alt_sonra20")}
    out["ozellik"] = {c[3:]: t_ozet(S[c]) for c in S.columns if c.startswith("oz_")}
    # Dönem başından sonuna en çok artan ve azalan
    fark = (O.iloc[-1] - O.iloc[0]).dropna().sort_values()
    out["en_cok_artan"] = [(h, float(v), float(O.iloc[-1][h])) for h, v in fark.tail(15)[::-1].items()]
    out["en_cok_azalan"] = [(h, float(v), float(O.iloc[-1][h])) for h, v in fark.head(15).items()]
    gr = P.evren["grup"].reindex(O.columns)
    out["grup_seri"] = {g: [(str(t.date()), float(v)) for t, v in O.loc[:, gr.index[gr == g]].mean(axis=1).dropna().items()] for g in gr.dropna().unique()}
    return out


# --- sektör endeksleri: uzun dönem mevsimsellik ve liderliğin sürekliliği -----------------------------
SEKTOR_ENDEKS_AD = {
    "XBANK": "Bankalar", "XUSIN": "Sanayi", "XUHIZ": "Hizmetler", "XUMAL": "Mali", "XUTEK": "Teknoloji", "XHOLD": "Holdingler", "XGMYO": "GYO", "XSGRT": "Sigorta",
    "XULAS": "Ulaştırma", "XTRZM": "Turizm", "XTCRT": "Ticaret", "XELKT": "Elektrik", "XILTM": "İletişim", "XINSA": "İnşaat", "XSPOR": "Spor", "XGIDA": "Gıda",
    "XTEKS": "Tekstil", "XKAGT": "Kâğıt ve orman", "XKMYA": "Kimya ve petrol", "XTAST": "Taş ve toprak", "XMANA": "Ana metal", "XMESY": "Metal eşya ve makine",
    "XMADN": "Madencilik", "XBLSM": "Bilişim", "XFINK": "Leasing ve faktoring", "XYORT": "Yatırım ortaklıkları", "XAKUR": "Aracı kurumlar",
}  # fmt: skip
GENIS_ENDEKS = {"XU100", "XU030", "XU050", "XUTUM", "XUSIN", "XUHIZ", "XUMAL", "XUTEK", "XBANA", "XYLDZ", "XHARZ", "XKTUM", "XK100", "XK050", "XK030", "XTUMY", "XUSRD"}


def sektor_mevsim(klasor: str | Path, bas: str = "2010-01-01") -> dict:
    """Sektör endekslerinin 2010'dan bugüne aylık getirileri: ay etkisi (XU100'e göre fazla getiri), liderliğin 1/3/6/12 aylık
    sürekliliği ve basit bir sektör dönüşü kuralı (geçmiş dönemin en iyi üç sektörü, ertesi ay)."""
    yol = Path(klasor) / "endeks_gunluk.csv.gz"
    if not yol.exists():
        return {}
    E = pd.read_csv(yol)
    E["tarih"] = pd.to_datetime(E["tarih"])
    F = E.pivot_table(index="tarih", columns="endeks", values="kapanis", aggfunc="last").sort_index().loc[bas:]
    ay = F.resample("ME").last()
    ay = ay[ay.index <= F.index[-1] + pd.offsets.MonthEnd(0)]
    G = ay.pct_change()
    G = G.where(G.abs() < 1.5)  # veri kopuklukları
    if "XU100" not in G:
        return {}
    sektorler = [c for c in G.columns if c in SEKTOR_ENDEKS_AD and c not in ("XUSIN", "XUHIZ", "XUMAL", "XUTEK") and G[c].notna().sum() >= 60]
    fazla = G[sektorler].sub(G["XU100"], axis=0)
    out: dict = {"donem": [str(G.index[1].date()), str(G.index[-1].date())], "ay_sayisi": int(len(G) - 1), "sektor": {c: SEKTOR_ENDEKS_AD[c] for c in sektorler}}
    aylik = {}
    for c in sektorler:
        x = fazla[c].dropna()
        g = x.groupby(x.index.month)
        aylik[c] = {int(m): {"ort": float(v.mean()), "t": float(v.mean() / (v.std() / np.sqrt(len(v)))) if len(v) > 4 and v.std() > 0 else None, "pozitif": float((v > 0).mean()), "yil": int(len(v))} for m, v in g}
    out["ay_etkisi"] = aylik
    # En belirgin ay-sektör çiftleri (|t| büyükten küçüğe)
    cift = [{"sektor": c, "ay": m, **v} for c, d in aylik.items() for m, v in d.items() if v["t"] is not None]
    out["en_belirgin"] = sorted(cift, key=lambda x: -abs(x["t"]))[:20]
    out["test_sayisi"] = len(cift)
    # Liderliğin sürekliliği: geçmiş k ayın sıralaması ile sonraki ayın sıralaması
    out["sureklilik"] = {}
    lg = np.log1p(G[sektorler])
    for k in (1, 3, 6, 12):
        gecmis = lg.rolling(k, min_periods=k).sum()
        sonraki = lg.shift(-1)
        r = []
        for t in gecmis.index:
            a, b = gecmis.loc[t].dropna(), sonraki.loc[t].dropna()
            ortak = a.index.intersection(b.index)
            if len(ortak) >= 10:
                r.append(a[ortak].rank().corr(b[ortak].rank()))
        r = pd.Series(r).dropna()
        ust = []
        for t in gecmis.index[:-1]:
            a = gecmis.loc[t].dropna()
            b = G[sektorler].shift(-1).loc[t]
            if len(a) >= 10:
                sec = a.sort_values().index
                ust.append((t, b[sec[-3:]].mean() - b[a.index].mean(), b[sec[:3]].mean() - b[a.index].mean()))
        U = pd.DataFrame(ust, columns=["t", "ust", "alt"]).set_index("t").dropna()
        yari = len(U) // 2
        out["sureklilik"][f"{k}ay"] = {"sira_kor": float(r.mean()), "t": float(r.mean() / (r.std() / np.sqrt(len(r)))) if len(r) > 5 else None, "ay": int(len(r)),
                                       "ust3_fazla": float(U["ust"].mean()), "ust3_t": float(U["ust"].mean() / (U["ust"].std() / np.sqrt(len(U)))) if len(U) > 5 else None,
                                       "alt3_fazla": float(U["alt"].mean()), "alt3_t": float(U["alt"].mean() / (U["alt"].std() / np.sqrt(len(U)))) if len(U) > 5 else None,
                                       "ust3_yari": [float(U["ust"].iloc[:yari].mean()), float(U["ust"].iloc[yari:].mean())] if yari > 5 else None}  # fmt: skip
    # Yıllık liderlik: her yılın en iyi ve en kötü sektörü; yıldan yıla sıra korelasyonu
    yil = (1 + G[sektorler]).groupby(G.index.year).prod() - 1
    yil = yil[G[sektorler].groupby(G.index.year).count().ge(10).all(axis=1) | (yil.index == yil.index[-1])]
    out["yillik"] = {str(y): {"en_iyi": [(c, float(v)) for c, v in yil.loc[y].dropna().sort_values(ascending=False).head(3).items()],
                              "en_kotu": [(c, float(v)) for c, v in yil.loc[y].dropna().sort_values().head(3).items()],
                              "xu100": float((1 + G["XU100"][G.index.year == y]).prod() - 1)} for y in yil.index}  # fmt: skip
    yy = [float(yil.loc[a].rank().corr(yil.loc[b].rank())) for a, b in zip(yil.index[:-1], yil.index[1:])]
    out["yildan_yila"] = {"sira_kor_ort": float(np.nanmean(yy)), "pozitif_yil": int(np.sum(np.array(yy) > 0)), "yil": int(len(yy)), "seri": [round(v, 2) for v in yy]}
    return out
