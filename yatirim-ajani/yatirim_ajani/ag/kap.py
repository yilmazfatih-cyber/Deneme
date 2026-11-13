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


def _kalan_pay(P: Panel, D: pd.DataFrame) -> np.ndarray:
    """"%5'inden fazlasını alanlar" bildirimi ilk halka arza mı (payın borsadaki ilk gününün çevresinde) yoksa borsada işlem gören
    şirketin bedelli artırımından kalan payların satışına mı ait? True = kalan pay satışı."""
    arz = pd.to_datetime(P.evren["halka_arz"].reindex(D["hisse"]).values, errors="coerce")
    fark = (D["zaman"].dt.normalize().values - arz.values) / np.timedelta64(1, "D")
    return ~((fark >= -15) & (fark <= 20))


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
    # Bedelli artırımdan kalan payların birincil piyasada satışı (%5 üstü alanlar bildirimi; ilk halka arz bildirimleri hariç)
    a5t = T[T["tur"] == "halka_arz_5"]
    kalan = _ilkler(a5t[_kalan_pay(P, a5t)], ["hisse"], 20)
    out["kalan_pay_5g"] = olay_portfoyu(P, kalan, 5, 0.003, deneme, min_pozisyon=1)
    out["kalan_pay_20g"] = olay_portfoyu(P, kalan, 20, 0.003, deneme, min_pozisyon=2)
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


def gunluk_tarama(P: Panel, K: pd.DataFrame, X: dict[str, pd.DataFrame], pencere: int = 20, en_cok: int = 60) -> dict:
    """Kuralların güncel çıktısı: nedenleriyle kaçınma listesi ve aday listesi. Fiyatlar panelin son gününe, bildirimler listenin son
    satırına kadardır. Tarama çıktısıdır; emir değildir. Her kayıt: [hisse, tarih, açıklama]."""
    R = P.R
    n = len(R)
    son_i = n - 1
    kolon = list(R.columns)
    r = R.to_numpy(float)
    b100 = (P.evren["bist100"].reindex(R.columns) == 1).to_numpy()
    out: dict = {"fiyat_gunu": str(R.index[-1].date()), "bildirim_son": str(K["zaman"].max()) if not K.empty else None, "kacin": {}, "aday": {}}

    def sirala(kayitlar: list[list]) -> list[list]:
        gorulen, sonuc = set(), []
        for k in sorted(kayitlar, key=lambda x: x[1], reverse=True):
            if k[0] not in gorulen:
                gorulen.add(k[0])
                sonuc.append(k)
        return sonuc[:en_cok]

    # --- fiyattan
    tavan = r >= TAVAN
    bozulan, patlama = [], []
    hs = X["hacim_soku"].reindex(index=R.index, columns=R.columns).to_numpy(float) if "hacim_soku" in X else None
    for g in range(max(1, n - 5), n):
        gun = str(R.index[g].date())
        for j in np.where(tavan[g - 1] & ~tavan[g] & ~np.isnan(r[g]))[0]:
            bozulan.append([kolon[j], gun, f"o gün {r[g, j] * 100:+.1f}%".replace(".", ",")])
        if hs is not None:
            for j in np.where((hs[g] >= 3) & (np.abs(r[g]) < TAVAN) & ~b100)[0]:
                patlama.append([kolon[j], gun, f"hacim olağanın {hs[g, j]:.1f} katı".replace(".", ",")])
    out["kacin"]["Tavan serisi bozuldu (son 5 gün)"] = sirala(bozulan)
    out["kacin"]["Hacmi patladı, BIST 100 dışı (son 5 gün)"] = sirala(patlama)
    out["kacin"]["Tabanda kapandı (son gün)"] = [[kolon[j], out["fiyat_gunu"], f"{r[-1, j] * 100:+.1f}%".replace(".", ",")] for j in np.where(r[-1] <= -TAVAN)[0]][:en_cok]
    ilk = pd.to_datetime(P.evren["ilk_gun"].reindex(R.columns), errors="coerce")
    esik = R.index[max(0, n - 40)]
    out["kacin"]["Yeni halka arz (son 40 işlem günü)"] = sirala([[h, str(t.date()), "ilk işlem günü"] for h, t in ilk.items() if pd.notna(t) and t >= esik and t > R.index[0]])
    # --- bildirimlerden
    if not K.empty:
        K2 = K.copy()
        K2["i"], K2["an"] = olay_gunu(K2["zaman"], R.index)
        yakin = K2["i"] >= son_i - pencere + 1
        se = K2[K2["tur"] == "sermaye"]
        tarih = lambda D: D["zaman"].dt.strftime("%Y-%m-%d")  # noqa: E731
        for ad, on in (("Bedelsiz sermaye artırımı bildirimi", "bedelsiz"), ("Bedelli sermaye artırımı bildirimi", "bedelli")):
            d = _ilkler(se[se["alt"].str.startswith(on)], ["hisse"], 120)
            d = d[d["i"] >= son_i - pencere + 1]
            out["kacin"][f"{ad} (son {pencere} işlem günü)"] = sirala([[h, t, o[:60]] for h, t, o in zip(d["hisse"], tarih(d), d["ozet"])])
        pk = K2[(K2["tur"] == "pay_alim_satim") & (K2["bildiren_tur"] == "kap") & yakin]
        out["kacin"][f"Ortaklık payı eşik bildirimi (son {pencere} işlem günü)"] = sirala([[h, t, "eşik bildirimi"] for h, t in zip(pk["hisse"], tarih(pk))])
        pp = K2[(K2["tur"] == "pay_alim_satim") & (K2["bildiren_tur"] == "portfoy") & yakin]
        out["kacin"][f"Portföy şirketi pay bildirimi (son {pencere} işlem günü)"] = sirala([[h, t, _baslik(re.sub(r"\s*PORTFÖY YÖNETİMİ.*$", "", b))] for h, t, b in zip(pp["hisse"], tarih(pp), pp["bildiren"])])
        a5 = K2[(K2["tur"] == "halka_arz_5") & (K2["i"] >= son_i - 4)]
        a5 = a5[_kalan_pay(P, a5)] if len(a5) else a5
        out["kacin"]["Bedelliden kalan payların satışı (son 5 işlem günü)"] = sirala([[h, t, "kalan pay satışı sonucu"] for h, t in zip(a5["hisse"], tarih(a5))])
        # Aday: ilk geri alım bildirimi; henüz fiyatlanmamış (son kapanıştan sonra gelen) ve son üç işlem gününde gelenler
        W = Pencereler(P)
        ga = _ilkler(K2[K2["tur"] == "geri_alim"], ["hisse"], 20)
        ga = ga[(ga["i"] >= son_i - 2) & ga["hisse"].isin(W.kolon)]
        aday = []
        for h, z, i, an in zip(ga["hisse"], ga["zaman"], ga["i"].astype(int), ga["an"]):
            j = W.kolon[h]
            bit = min(i, n)
            once = float(np.expm1(W.C[bit, j] - W.C[max(0, bit - 20), j])) if bit >= 20 else None
            durum = "henüz fiyatlanmadı: sonraki açılış" if i > son_i else f"{son_i - i + 1}. gün"
            aday.append([h, z.strftime("%Y-%m-%d %H:%M"), {"durum": durum, "once_20g": once, "seans_ici": an == "seans", "bist100": bool(P.evren.at[h, "bist100"] == 1)}])
        out["aday"]["İlk geri alım bildirimi (son 3 işlem günü ve sonrası)"] = sorted(aday, key=lambda x: x[1], reverse=True)[:en_cok]
    kacinilan = {k[0] for v in out["kacin"].values() for k in v}
    out["ozet"] = {"kacin_hisse": len(kacinilan), "aday": sum(len(v) for v in out["aday"].values()),
                   "aday_ve_kacin": sorted({a[0] for v in out["aday"].values() for a in v} & kacinilan)}  # fmt: skip
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
    T["hao_oran"] = hizala(X["halka_aciklik"])[i0, j] if "halka_aciklik" in X else np.nan
    T["sirket"] = T["bildiren"].str.replace(r"\s*PORTFÖY YÖNETİMİ.*$", "", regex=True).str.strip().map(_baslik)
    if detay is not None and not detay.empty:
        T = T.merge(detay[["no", "yon", "oran_once", "oran_sonra", "fon_sayisi"]], on="no", how="left")
    else:
        T["yon"], T["oran_once"], T["oran_sonra"] = None, np.nan, np.nan
    T["oran_sonra"] = pd.to_numeric(T["oran_sonra"], errors="coerce").where(lambda x: (x >= 0) & (x <= 100))
    # Tutulan payın halka açık paylara oranı (sermayedeki pay / halka açıklık oranı); 1'in üstü veri uyuşmazlığıdır, 1'de kesilir
    T["pay_halka_acik"] = (T["oran_sonra"] / (T["hao_oran"] * 100)).clip(upper=1.0)
    son_konum = T.dropna(subset=["oran_sonra"]).sort_values("zaman").drop_duplicates(["sirket", "hisse"], keep="last")
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
            k = d.dropna(subset=["oran_sonra"]).sort_values("zaman").drop_duplicates("hisse", keep="last")  # hisse başına son bildirilen konum
            if len(k):
                p["konum"] = {"hisse": int(len(k)), "oran_medyan": float(k["oran_sonra"].median()), "oran_en_yuksek": float(k["oran_sonra"].max()),
                              "yuzde5_ustu": int((k["oran_sonra"] >= 5).sum()), "yuzde10_ustu": int((k["oran_sonra"] >= 10).sum()),
                              "halka_acik_pay_medyan": float(k["pay_halka_acik"].median()) if k["pay_halka_acik"].notna().any() else None,
                              "halka_acik_ceyrek_ustu": int((k["pay_halka_acik"] >= 0.25).sum()),
                              "en_buyukler": [{"hisse": r.hisse, "oran": round(float(r.oran_sonra), 2), "halka_acik_pay": (round(float(r.pay_halka_acik), 3) if pd.notna(r.pay_halka_acik) else None),
                                               "yon": r.yon, "gun": str(r.zaman.date())} for r in k.sort_values("oran_sonra", ascending=False).head(8).itertuples()]}  # fmt: skip
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
    # Tutulan pay: (şirket, hisse) başına son bildirilen konumun sermayeye ve halka açık paylara oranı
    if len(son_konum) >= 10:
        o, f = son_konum["oran_sonra"], son_konum["pay_halka_acik"].dropna()
        out["tutulan_pay"] = {
            "konum": int(len(son_konum)), "yon_bulunan": int(T["yon"].notna().sum()), "alim": int((T["yon"] == "alim").sum()), "satim": int((T["yon"] == "satim").sum()),
            "oran": {"c25": float(o.quantile(0.25)), "medyan": float(o.median()), "c75": float(o.quantile(0.75)), "en_yuksek": float(o.max())},
            "oran_dilim": {"%0-3": int((o < 3).sum()), "%3-5": int(((o >= 3) & (o < 5)).sum()), "%5-10": int(((o >= 5) & (o < 10)).sum()), "%10-20": int(((o >= 10) & (o < 20)).sum()), "%20+": int((o >= 20).sum())},
            "halka_acik": {"c25": float(f.quantile(0.25)), "medyan": float(f.median()), "c75": float(f.quantile(0.75)), "n": int(len(f)),
                           "ceyrek_ustu": int((f >= 0.25).sum()), "yari_ustu": int((f >= 0.5).sum())} if len(f) >= 10 else None,
            "en_yogun": [{"sirket": r.sirket, "hisse": r.hisse, "oran": round(float(r.oran_sonra), 2), "halka_acik_pay": (round(float(r.pay_halka_acik), 3) if pd.notna(r.pay_halka_acik) else None),
                          "yon": r.yon, "gun": str(r.zaman.date())} for r in son_konum.sort_values("pay_halka_acik", ascending=False).head(20).itertuples()],
        }  # fmt: skip
        # Eşik çevresinde yığılma: bildirim sınırının hemen altına inen satışlar ve hemen üstüne çıkan alımlar
        d = T.dropna(subset=["oran_once", "oran_sonra"])
        out["tutulan_pay"]["esik_gecisi"] = {str(e): {"yukari": int(((d["oran_once"] < e) & (d["oran_sonra"] >= e)).sum()), "asagi": int(((d["oran_once"] >= e) & (d["oran_sonra"] < e)).sum())} for e in (3, 5, 10, 15, 20, 25)}
    out["olaylar"] = T.assign(gun=T["gun"].dt.strftime("%Y-%m-%d"))[["no", "sirket", "hisse", "gun", "an", "yon", "oran_once", "oran_sonra", "once_20g", "gun_0", "sonra_5g", "sonra_20g", "sonra_60g"]].round(4).to_dict(orient="records")
    return out


# --- bildirim metinleri --------------------------------------------------------------------------
_N = r"(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)"
# KAP pay alım satım formunun satırı: tarih, alım nominal, satım nominal, net, gün başı nominal, gün sonu nominal, sonra dört oran
# (alım, satım ya da net alanı boş bırakılmış formlarda sayı adedi 3-5 arasında değişir; son iki sayı gün başı ve gün sonu nominalidir)
_SATIR = re.compile(r"(\d{2}/\d{2}/\d{4})\s+((?:" + _N + r"\s+){3,5})%\s*" + _N + r"\s+%\s*" + _N + r"\s+%\s*" + _N + r"\s+%\s*" + _N)
_YABANCI = re.compile(r"bank of america|citigroup|citibank|goldman|morgan stanley|j\.?p\.? ?morgan|\bubs\b|barclays|deutsche|hsbc|bnp|soci[eé]t[eé] g[eé]n[eé]rale|credit suisse|merrill|nomura|"
                      r"blackrock|vanguard|norges|state street|wellington|fidelity|\blimited\b|\bltd\.?$|\bllc\b|\binc\.?\b|corporation|\bplc\b|\bn\.v\.|\bgmbh\b|\bs\.a\.(?!ş)|\bl\.p\.|\bfund\b|capital management")  # fmt: skip


def _sayi(s: str) -> float | None:
    try:
        return float(s.replace(".", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _form_satirlari(govde: str) -> list[dict]:
    """Pay alım satım formunun satırları: tarih, (varsa) alım ve satım nominali, gün başı ve gün sonu nominali, gün başı ve gün sonu
    sermaye oranı. Satırlar sayfada Türkçe ve İngilizce bölümde ikişer kez yer alır; sayısal değeri aynı olan yinelenenler atılır."""
    out, gorulen = [], set()
    for m in _SATIR.finditer(govde):
        sayilar = [_sayi(x) for x in re.findall(_N, m.group(2))]
        oranlar = [_sayi(m.group(k)) for k in range(m.lastindex - 3, m.lastindex + 1)]
        if len(sayilar) < 3 or any(x is None for x in sayilar[-2:]) or oranlar[0] is None or oranlar[2] is None:
            continue
        anahtar = (m.group(1), round(sayilar[-2], 2), round(sayilar[-1], 2), round(oranlar[0], 4), round(oranlar[2], 4))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        out.append({"gun": m.group(1), "alim": sayilar[0] if len(sayilar) == 5 else None, "satim": sayilar[1] if len(sayilar) == 5 else None,
                    "basi": sayilar[-2], "sonu": sayilar[-1], "oran_basi": oranlar[0], "oran_sonu": oranlar[2]})  # fmt: skip
    return sorted(out, key=lambda x: x["gun"][6:] + x["gun"][3:5] + x["gun"][:2])  # kararlı sıralama: aynı günün satırları sayfadaki sırasıyla


def bildiren_kisi_turu(ad: str) -> str:
    """Eşik bildirimindeki pay sahibinin türü: yabancı kurum / yerli tüzel kişi / gerçek kişi (addan, kaba sınıflama)."""
    a = _kucuk(ad)
    if _YABANCI.search(a):
        return "yabanci_kurum"
    if re.search(r"a\.ş|a\.s\.|holding|şti|vakf|portföy|yatırım|bankası|sigorta|fonu|kooperatif|belediye|müdürlüğü", a):
        return "yerli_tuzel"
    return "gercek_kisi"


def detay_ayristir(metin: str) -> dict:
    """Pay alım satım bildirimi sayfasının düz metninden: yön, işlem öncesi ve sonrası oran, alım ve satım nominali, işlem günü,
    fiyat aralığı; MKK üzerinden gelen eşik bildirimlerinde pay sahibinin adı ve türü. Bulunamayan alan None kalır.
    Yön önce form tablosundan (net nominal, olmazsa oran farkı), tablo yoksa açıklama metnindeki ifadelerden çıkarılır."""
    out: dict = {"yon": None, "oran_once": None, "oran_sonra": None, "alim_nominal": None, "satim_nominal": None, "islem_gunu": None, "fiyat": None,
                 "kisi": None, "kisi_tur": None, "kaynak": None}  # fmt: skip
    i = metin.find("Bildirim İçeriği")
    govde = metin[i:] if i >= 0 else metin[max(0, metin.find("Özet Bilgi")) :]
    satirlar = _form_satirlari(govde)
    if satirlar:
        ilk, son = satirlar[0], satirlar[-1]
        alim = sum(x["alim"] or 0 for x in satirlar) if all(x["alim"] is not None for x in satirlar) else None
        satim = sum(x["satim"] or 0 for x in satirlar) if all(x["satim"] is not None for x in satirlar) else None
        out.update({"alim_nominal": alim, "satim_nominal": satim, "oran_once": ilk["oran_basi"], "oran_sonra": son["oran_sonu"], "kaynak": "tablo",
                    "islem_gunu": "-".join(reversed(son["gun"].split("/")))})  # fmt: skip
        fark_nominal = son["sonu"] - ilk["basi"]
        fark_oran = son["oran_sonu"] - ilk["oran_basi"]
        net = (alim or 0) - (satim or 0)
        out["yon"] = ("alim" if fark_nominal > 0 else "satim") if fark_nominal else ("alim" if fark_oran > 0 else "satim") if fark_oran else ("alim" if net > 0 else "satim" if net < 0 else None)
    m = _kucuk(govde)
    if out["yon"] is None:
        gecis = re.search(r"%?\s*" + _N + r"\s*%?\s*'?[dt][ae]n\s*%?\s*" + _N + r"\s*%?\s*'?y?[ae]\s*(düş|yüksel|çık|in|geril|ulaş)", m)
        if gecis:
            a, b = _sayi(gecis.group(1)), _sayi(gecis.group(2))
            if a is not None and b is not None and 0 <= a <= 100 and 0 <= b <= 100 and a != b:
                out.update({"oran_once": a, "oran_sonra": b, "yon": "alim" if b > a else "satim", "kaynak": "metin"})
    if out["yon"] is None:
        alis = len(re.findall(r"\balış işlemi|\balım işlemi|satın alın|pay alımı", m))
        satis = len(re.findall(r"\bsatış işlemi|\bsatım işlemi|pay satışı|satılmış", m))
        asti = bool(re.search(r"sınırını aşmış|oranına ulaşmış|üzerine çıkmış", m))
        dustu = bool(re.search(r"altına düşmüş|altına inmiş", m))
        if asti != dustu:
            out.update({"yon": "alim" if asti else "satim", "kaynak": "metin"})
        elif alis != satis:
            out.update({"yon": "alim" if alis > satis else "satim", "kaynak": "metin"})
    f = re.search(_N + r"\s*-\s*" + _N + r"\s*tl\s*fiyat aralığ", m)
    if f:
        a, b = _sayi(f.group(1)), _sayi(f.group(2))
        out["fiyat"] = (a + b) / 2 if a and b else None
    k = re.search(r"kapsamında\s+(.{3,120}?)\s+tarafından kuruluşumuza gönderilen", govde, re.I)
    if k:
        out["kisi"] = k.group(1).strip()
        out["kisi_tur"] = bildiren_kisi_turu(out["kisi"])
    return out


_ARZ_CIFT = re.compile(r"(?<![\d.,])" + _N + r"\s+%\s*%?\s*" + _N + r"(?![\d.,])")
_ARZ_KISI = r"(?:gerçek\s+kişi(?:ler)?|individuals?|real\s+persons?|natural\s+persons?)"
_ARZ_TUZEL = r"(?:tüzel\s+kişi(?:ler)?|legal\s+entit(?:y|ies)|legal\s+persons?)"
_ARZ_ULKE = re.compile(r"\b(?:türkiye(?:\s+cumhuriyeti)?|turkey|turkiye)\b\s*")
_ARZ_AMAC = re.compile(r"^(?:kendi\s+nam(?:ına)?\s+ve\s+hesabına|on\s+(?:its\s+|his\s+|her\s+|their\s+)?own\s+(?:account|behalf)|(?:uzun\s+vadeli\s+)?yatırım(?:\s+amaçlı|\s+amacıyla|\s+amacı)?|"
                       r"(?:long[\s-]term\s+)?investment(?:\s+purposes?)?|portföy\s+yatırımı)\b[\s.,;:-]*")  # fmt: skip
_FON_AD = re.compile(r"\bfon\b|\bfonu\b|\bfund\b|portföy|yatırım ortaklığı|emeklilik")


def _arz_ad(on: str) -> str:
    """İki (tutar, oran) çifti arasındaki metinden alıcının adı. Metin `[faaliyet konusu] [ülke] [alım amacı] [ad]` sırasındadır;
    ülke sözcüğüne kadar olan kısım ve bilinen alım amacı kalıpları atılır."""
    k = _kucuk(on)
    bas = 0
    m = re.match(r"\s*(?:" + _ARZ_KISI + "|" + _ARZ_TUZEL + r")\b\s*", k)
    if m:
        bas = m.end()
    u = _ARZ_ULKE.search(k, bas)
    if u and u.start() - bas <= 60:
        bas = u.end()
    for _ in range(2):
        a = _ARZ_AMAC.match(k[bas:])
        if not a:
            break
        bas += a.end()
    a = re.match(r".{0,45}?(?:hesabına|account|behalf)\b[\s.,;:-]*", k[bas:])  # tanınmayan alım amacı kalıbı
    if a:
        bas += a.end()
    return re.sub(r"^[%\d.,;:\s/-]+", "", on[bas:]).strip(" -.,;:")


def arz5_ayristir(metin: str) -> list[dict]:
    """Satışa sunulan sermaye piyasası aracının %5'inden fazlasını alanlar: ad, nominal tutar, oran (%), tür
    (fon / yabancı kurum / yerli tüzel / gerçek kişi). Her satır sayfada Türkçe ve İngilizce iki kez yer alır; bir önceki kabul edilen
    satırla aynı (tutar, oran) çiftini taşıyan adsız, İngilizce ya da aynı adlı satır yineleme sayılır."""
    i = metin.find("Buying Reason of Capital Market Instrument")
    if i < 0:
        return []
    govde = metin[i + len("Buying Reason of Capital Market Instrument") :]
    j = govde.find("Yukarıdaki açıklamalarımızın")
    govde = govde[: j if j >= 0 else len(govde)]
    out: list[dict] = []
    son, onceki = 0, None
    for m in _ARZ_CIFT.finditer(govde):
        nominal, oran = _sayi(m.group(1)), _sayi(m.group(2))
        on, son = govde[son : m.start()], m.end()
        if nominal is None or oran is None or not (0 < oran <= 100):
            continue
        ad = _arz_ad(on)
        sonrasi = _kucuk(govde[m.end() : m.end() + 60]).strip()
        ingilizce = bool(re.match(r"legal|individual|real person|natural person", sonrasi))
        cift = (round(nominal, 2), round(oran, 4))
        if len(ad) < 3 or (onceki and onceki["kabul"] and onceki["cift"] == cift and (ingilizce or _kucuk(ad) == _kucuk(onceki["ad"]))):
            onceki = {"cift": cift, "kabul": False, "ad": ad}
            continue
        a = _kucuk(ad)
        faaliyet = _ARZ_ULKE.split(sonrasi)[0]
        if _FON_AD.search(a) or re.search(r"\bfon\b|\bfonu\b|\bfund\b", faaliyet):
            tur = "fon"
        elif re.match(_ARZ_KISI, sonrasi):
            tur = "gercek_kisi"
        else:
            tur = bildiren_kisi_turu(ad)
            if tur == "gercek_kisi" and re.match(_ARZ_TUZEL, sonrasi):
                tur = "yerli_tuzel"
        out.append({"ad": ad[:90], "nominal": nominal, "oran": oran, "tur": tur})
        onceki = {"cift": cift, "kabul": True, "ad": ad}
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
    A["fon_sayisi"] = None
    A["alicilar"] = [arz5_ayristir(x) if o == 0 else None for x, o in zip(A["metin"], A["oncelik"])]
    return A


def _kisi_anahtari(ad: str) -> str:
    return re.sub(r"[^a-zçğıöşü ]", "", re.sub(r"\s+", " ", _kucuk(ad))).strip()


def _fon_sirketi(ad: str) -> str:
    """Fon adından yönetici şirket: 'Hedef Portföy Kuzey Hisse Senedi Serbest Fon' → 'Hedef Portföy'."""
    a = re.sub(r"^[^A-Za-zÇĞİÖŞÜçğıöşü]+", "", ad).strip()
    a = re.sub(r"^(?:TLY|TL)\s+", "", a)
    m = re.match(r"(.{2,40}?\bportf[öo]y)", _kucuk(a))
    if m and len(a[: m.end()].split()) <= 3:
        return _baslik(a[: m.end()])
    return _baslik(" ".join(a.split()[:2]))


def arz_alicilari(P: Panel, K: pd.DataFrame, detay: pd.DataFrame | None) -> dict:
    """Satışa sunulan payların %5'inden fazlasını alanlar (bildirim sayfasındaki tablo). İki satış türü ayrılır: ilk halka arz (bildirim,
    payın borsadaki ilk gününün çevresindedir) ve borsada işlem gören şirketin bedelli artırımından kalan payların birincil piyasada
    satışı. Gerçek kişilerin adı çıktıya yazılmaz; yalnız sayıları ve yinelenme dağılımı verilir. Fon şirketleri ve yabancı kurumlar adıyla yer alır."""
    if K.empty or detay is None or detay.empty or "alicilar" not in detay:
        return {}
    A = K[K["tur"] == "halka_arz_5"].merge(detay[["no", "alicilar"]], on="no", how="inner")
    A = A[A["alicilar"].map(lambda x: isinstance(x, list))].copy()
    if A.empty:
        return {}
    A["sinif"] = np.where(_kalan_pay(P, A), "kalan_pay", "halka_arz")
    A["alicilar"] = A["alicilar"].map(lambda L: [x for x in L if not re.search(r"\btera\b", _kucuk(x["ad"]))])  # Tera'nın işlemleri araştırma dışı
    sayim: dict[str, int] = {}
    for L in A["alicilar"]:
        for x in L:
            if x["tur"] == "gercek_kisi":
                k = _kisi_anahtari(x["ad"])
                sayim[k] = sayim.get(k, 0) + 1
    sik = {k for k, n in sayim.items() if n >= 5}
    A["adet"] = A["alicilar"].map(len)
    A["toplam_oran"] = A["alicilar"].map(lambda L: min(100.0, sum(x["oran"] for x in L)) if L else 0.0)
    A["en_buyuk_oran"] = A["alicilar"].map(lambda L: max((x["oran"] for x in L), default=np.nan))
    A["fon_var"] = A["alicilar"].map(lambda L: any(x["tur"] == "fon" for x in L))
    A["fon_orani"] = A["alicilar"].map(lambda L: sum(x["oran"] for x in L if x["tur"] == "fon"))
    A["sik_kisi_var"] = A["alicilar"].map(lambda L: any(x["tur"] == "gercek_kisi" and _kisi_anahtari(x["ad"]) in sik for x in L))
    W = Pencereler(P)
    A["i"], A["an"] = olay_gunu(A["zaman"], P.R.index)
    T = W.tablo(A)
    TUR = ("gercek_kisi", "fon", "yerli_tuzel", "yabanci_kurum")
    PEN = ("once_20g", "sonra_5g", "sonra_20g", "sonra_60g")

    def ozet(d: pd.DataFrame) -> dict:
        dolu = d[d["adet"] > 0]
        kayit = [x for L in d["alicilar"] for x in L]
        top = sum(x["oran"] for x in kayit) or 1.0
        return {"bildirim": int(len(d)), "hisse": int(d["hisse"].nunique()), "alicili": int(len(dolu)), "alici_ort": float(dolu["adet"].mean()) if len(dolu) else None,
                "toplam_oran_medyan": float(dolu["toplam_oran"].median()) if len(dolu) else None, "en_buyuk_oran_medyan": float(dolu["en_buyuk_oran"].median()) if len(dolu) else None,
                "yari_ustu_tek_alici": int((dolu["en_buyuk_oran"] >= 50).sum()),
                "tur": {t: {"kayit": int(sum(x["tur"] == t for x in kayit)), "oran_payi": float(sum(x["oran"] for x in kayit if x["tur"] == t) / top)} for t in TUR}}  # fmt: skip

    def getiri(d: pd.DataFrame) -> dict:
        return {"bildirim": int(len(d)), **{c: _gun_kumeli(d[c], d["gun"]) for c in PEN}}

    out: dict = {"bildirim": int(len(A)), "sinif": {s: ozet(d) for s, d in A.groupby("sinif")}}
    n = sorted(sayim.values(), reverse=True)
    out["kisi"] = {"kisi_sayisi": int(len(n)), "kayit": int(sum(n)), "en_sik": n[:10], "en_sik_10_payi": float(sum(n[:10]) / max(1, sum(n))),
                   "dagilim": {"1": int(sum(x == 1 for x in n)), "2-4": int(sum(2 <= x <= 4 for x in n)), "5-9": int(sum(5 <= x <= 9 for x in n)), "10+": int(sum(x >= 10 for x in n))},
                   "bes_ustu_kisi": int(len(sik)), "bes_ustu_kayit_payi": float(sum(x for x in n if x >= 5) / max(1, sum(n)))}  # fmt: skip
    kurum: dict[str, dict] = {}
    for r in A.itertuples():
        for x in r.alicilar:
            if x["tur"] not in ("fon", "yabanci_kurum"):
                continue
            ad = _fon_sirketi(x["ad"]) if x["tur"] == "fon" else _baslik(x["ad"])
            k = kurum.setdefault(ad, {"ad": ad, "tur": x["tur"], "kayit": 0, "oranlar": [], "hisseler": [], "sinif": {}})
            k["kayit"] += 1
            k["oranlar"].append(x["oran"])
            k["hisseler"].append(r.hisse)
            k["sinif"][r.sinif] = k["sinif"].get(r.sinif, 0) + 1
    out["kurum"] = sorted(({"ad": k["ad"], "tur": k["tur"], "kayit": k["kayit"], "oran_ort": float(np.mean(k["oranlar"])), "oran_en_yuksek": float(max(k["oranlar"])),
                            "hisseler": sorted(set(k["hisseler"]))[:10], "sinif": k["sinif"]} for k in kurum.values()), key=lambda x: (-x["kayit"], -x["oran_en_yuksek"]))  # fmt: skip
    # Bildirim sonrası fiyat: borsada işlem gören şirketin kalan pay satışında alıcı türüne göre
    kp = T[T["sinif"] == "kalan_pay"]
    out["kalan_pay_getiri"] = {"hepsi": getiri(kp), "fon aldı": getiri(kp[kp["fon_var"]]), "sık görülen kişi aldı": getiri(kp[kp["sik_kisi_var"] & ~kp["fon_var"]]),
                               "%5 üstü alan yok": getiri(kp[kp["adet"] == 0])}  # fmt: skip
    ha = T[T["sinif"] == "halka_arz"]
    out["halka_arz_getiri"] = {"hepsi": getiri(ha), "%5 üstü alan var": getiri(ha[ha["adet"] > 0]), "%5 üstü alan yok": getiri(ha[ha["adet"] == 0]),
                               "sık görülen kişi aldı": getiri(ha[ha["sik_kisi_var"]])}  # fmt: skip
    d = ha[ha["adet"] > 0].dropna(subset=["sonra_20g"])
    if len(d) >= 12:
        r = float(d["toplam_oran"].rank().corr(d["sonra_20g"].rank()))
        out["halka_arz_yogunluk"] = {"n": int(len(d)), "sira_kor_20g": r, "t": float(r * np.sqrt((len(d) - 2) / max(1e-9, 1 - r * r)))}
    out["olaylar"] = [{"hisse": r.hisse, "gun": str(r.zaman.date()), "sinif": r.sinif, "alici": int(r.adet), "toplam_oran": round(float(r.toplam_oran), 1),
                       "fon_orani": round(float(r.fon_orani), 1), "sik_kisi": bool(r.sik_kisi_var)} for r in A.sort_values("zaman").itertuples()]  # fmt: skip
    return out


def esik_sahipleri(K: pd.DataFrame, detay: pd.DataFrame | None) -> dict:
    """MKK'nın otomatik eşik bildirimlerinde (bir pay sahibinin payı %5, 10, 15... sınırını geçtiğinde) pay sahibinin türü: gerçek kişi,
    yerli tüzel kişi, yabancı kurum. Yalnız metni çekilmiş bildirimler sayılır; gerçek kişilerin adı çıktıya yazılmaz."""
    if K.empty or detay is None or detay.empty or "kisi" not in detay:
        return {}
    tum = K[(K["tur"] == "pay_alim_satim") & (K["bildiren_tur"] == "kap")]
    d = detay[detay["kisi"].notna()].merge(tum[["no", "hisse", "zaman"]], on="no", how="inner")
    if d.empty:
        return {}
    out: dict = {"bildirim": int(len(tum)), "metni_cekilen": int(len(d)), "tur": {t: {"bildirim": int(len(x)), "sahip": int(x["kisi"].map(_kisi_anahtari).nunique()), "hisse": int(x["hisse"].nunique())} for t, x in d.groupby("kisi_tur")}}
    y = d[d["kisi_tur"] == "yabanci_kurum"].assign(anahtar=lambda x: x["kisi"].map(_kisi_anahtari))
    out["yabanci_kurum"] = [{"ad": re.sub(r"\bOf\b", "of", str(x["kisi"].mode().iloc[0])), "bildirim": int(len(x)), "hisseler": sorted(set(x["hisse"]))[:12]}
                            for _, x in sorted(y.groupby("anahtar"), key=lambda kv: -len(kv[1]))][:12]  # fmt: skip
    return out


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
