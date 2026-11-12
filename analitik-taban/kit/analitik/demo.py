"""Sentetik demo arka ucu: şirket verisi olmadan tüm akışı denemek ve test etmek için.

Deterministik (sabit tohum) tek bir olay günlüğü üretilir; Mixpanel ve Hotjar uç noktalarının hepsi bu günlükten
hesaplanır, bu yüzden sayılar birbiriyle tutarlıdır (huni = kırılım = dışa aktarım). Yanıt biçimleri gerçek
API belgeleriyle aynıdır (docs/API-NOTLARI.md). Hayali "Örnek Mağaza" uygulamasında ekili olaylar:

- 2026-10-30: Android 5.2.0 kademeli yayında; bu sürümde ödeme → satın alma dönüşümü ~%62'den ~%36'ya düşer.
- 2026-10-19: "Yeni Sepet" deneyi başlar; "Yeni Sepet" varyantında satın alma ~%8 göreli artar.
- 2026-10-20…24: TikTok kampanyası; çok kurulum, düşük kayıt oranı.
"""

from __future__ import annotations

import bisect
import csv
import datetime as dt
import json
import math
import os
import random
import re
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence, Tuple

from . import analiz
from .istemci import HttpHatasi

DEMO_BUGUN = dt.date(2026, 11, 9)
BASLANGIC = dt.date(2026, 6, 1)
OFSET_SN = 3 * 3600
EPOCH = dt.date(1970, 1, 1)
SITE = "https://ornek-magaza.com"

OLAYLAR = [
    "App Open",
    "Sign Up",
    "Onboarding Complete",
    "View Product",
    "Search",
    "Add to Cart",
    "$experiment_started",
    "Checkout Started",
    "Purchase",
    "Share",
]
KOD = {ad: i for i, ad in enumerate(OLAYLAR)}
EKRAN = [
    "Ana Sayfa",
    "Kayıt",
    "Karşılama",
    "Ürün Detay",
    "Arama",
    "Sepet",
    "Sepet",
    "Ödeme",
    "Ödeme Tamam",
    "Ürün Detay",
]
YOL = ["/", "/kayit", "/hosgeldin", "/urun", "/ara", "/sepet", "/sepet", "/odeme", "/odeme/tamam", "/urun"]

SURUMLER = {
    "android": [("5.0.1", dt.date(2026, 5, 20)), ("5.1.0", dt.date(2026, 9, 15)), ("5.2.0", dt.date(2026, 10, 30))],
    "ios": [("5.0.1", dt.date(2026, 5, 22)), ("5.1.0", dt.date(2026, 9, 17)), ("5.1.2", dt.date(2026, 10, 30))],
}
ULKELER = [("TR", 0.70), ("DE", 0.09), ("AZ", 0.06), ("NL", 0.05), ("GB", 0.05), ("US", 0.05)]
KAYNAKLAR = [("organic", 0.45), ("google", 0.20), ("meta", 0.20), ("tiktok", 0.10), ("referral", 0.05)]
PLATFORMLAR = [("android", 0.45), ("ios", 0.33), ("web", 0.22)]
DENEY_BAS = dt.date(2026, 10, 19)
KAMPANYA = (dt.date(2026, 10, 20), dt.date(2026, 10, 24))
DENEY_ADI = "Yeni Sepet"
VARYANTLAR = ("Kontrol", "Yeni Sepet")

HUNILER = {
    1001: {"ad": "Kayıt", "adimlar": ["App Open", "Sign Up", "Onboarding Complete"], "pencere_gun": 1},
    1002: {
        "ad": "Satın alma",
        "adimlar": ["View Product", "Add to Cart", "Checkout Started", "Purchase"],
        "pencere_gun": 7,
    },
}
NOTLAR = [
    "2026-10-19: Yeni Sepet A/B testi başladı (%50 / %50)",
    "2026-10-20: TikTok kampanyası başladı (24 Ekim'e kadar)",
    "2026-10-30: Android 5.2.0 ve iOS 5.1.2 mağazada (kademeli)",
]

Olay = Tuple[int, int, Optional[str], Optional[Dict[str, Any]]]  # (utc saniye, kullanıcı, sürüm, ek özellikler)


def _epoch_sn(gun: dt.date) -> int:
    return (gun - EPOCH).days * 86400


def _yerel_gun(t: int) -> dt.date:
    return EPOCH + dt.timedelta(days=(t + OFSET_SN) // 86400)


def _agirlikli(rnd: random.Random, secenekler):
    r = rnd.random()
    toplam = 0.0
    for deger, agirlik in secenekler:
        toplam += agirlik
        if r < toplam:
            return deger
    return secenekler[-1][0]


class Gunluk:
    """Sentetik kullanıcılar ve olaylar."""

    def __init__(self, olcek: float = 1.0, tohum: int = 42):
        rnd = random.Random(tohum)
        self.platform: List[str] = []
        self.os: List[str] = []
        self.ulke: List[str] = []
        self.kaynak: List[str] = []
        self.tarayici: List[str] = []
        self.plan: List[str] = []
        self.kurulum: List[dt.date] = []
        self.gecikme: List[float] = []
        self.varyant: List[str] = []
        self.olaylar: Dict[int, List[Olay]] = {k: [] for k in range(len(OLAYLAR))}
        gun_sayisi = (DEMO_BUGUN - BASLANGIC).days
        for g in range(gun_sayisi):
            gun = BASLANGIC + dt.timedelta(days=g)
            hafta_sonu = gun.weekday() >= 5
            beklenen = 55 * olcek * (1 + 0.004 * g) * (1.15 if hafta_sonu else 1.0)
            adet = max(0, int(rnd.gauss(beklenen, math.sqrt(beklenen) + 0.5)))
            for _ in range(adet):
                self._kullanici_ekle(rnd, gun, None)
            if KAMPANYA[0] <= gun <= KAMPANYA[1]:
                for _ in range(int(140 * olcek)):
                    self._kullanici_ekle(rnd, gun, "tiktok")
        for u in range(len(self.platform)):
            self._kullanici_olaylari(rnd, u)
        for liste in self.olaylar.values():
            liste.sort(key=lambda o: o[0])
        self.zamanlar = {k: [o[0] for o in liste] for k, liste in self.olaylar.items()}
        self._donus_zamanlari: Dict[int, Dict[int, List[int]]] = {}

    # -- üretim --

    def _kullanici_ekle(self, rnd: random.Random, gun: dt.date, kaynak: Optional[str]) -> None:
        platform = _agirlikli(rnd, PLATFORMLAR)
        self.platform.append(platform)
        if platform == "web":
            self.os.append("Windows" if rnd.random() < 0.6 else "Mac OS X")
            self.tarayici.append(_agirlikli(rnd, [("Chrome", 0.68), ("Safari", 0.22), ("Firefox", 0.10)]))
        else:
            self.os.append("Android" if platform == "android" else "iOS")
            self.tarayici.append("")
        self.ulke.append(_agirlikli(rnd, ULKELER))
        self.kaynak.append(kaynak or _agirlikli(rnd, KAYNAKLAR))
        self.plan.append("premium" if rnd.random() < 0.12 else "free")
        self.kurulum.append(gun)
        self.gecikme.append(rnd.expovariate(1 / 4.0))
        self.varyant.append(VARYANTLAR[rnd.random() < 0.5])

    def surum(self, u: int, gun: dt.date) -> Optional[str]:
        platform = self.platform[u]
        if platform == "web":
            return None
        secilen = None
        for ad, cikis in SURUMLER[platform]:
            gecis = cikis if cikis <= self.kurulum[u] else cikis + dt.timedelta(days=self.gecikme[u])
            if gecis <= gun:
                secilen = ad
        return secilen or SURUMLER[platform][0][0]

    def _ekle(self, ad: str, t: int, u: int, surum: Optional[str], ek: Optional[Dict] = None) -> None:
        self.olaylar[KOD[ad]].append((t, u, surum, ek))

    def _kullanici_olaylari(self, rnd: random.Random, u: int) -> None:
        bas = self.kurulum[u]
        katilim = rnd.lognormvariate(0, 0.55) * (0.55 if self.kaynak[u] == "tiktok" else 1.0)
        kayitli = False
        deneyde = False
        varyant_carpani = 1.04 if self.varyant[u] == "Yeni Sepet" else 1.0
        gun = bas
        while gun < DEMO_BUGUN:
            yas = (gun - bas).days
            if yas > 0:
                p = katilim * (0.07 + 0.40 * math.exp(-yas / 6.0))
                p *= 1.12 if gun.weekday() >= 5 else 1.0
                p *= 1.3 if self.plan[u] == "premium" else 1.0
                if rnd.random() >= min(p, 0.95):
                    gun += dt.timedelta(days=1)
                    continue
            surum = self.surum(u, gun)
            gece = _epoch_sn(gun) - OFSET_SN
            gun_sonu = gece + 86400 - 1
            t = gece + rnd.randint(7 * 3600, 21 * 3600)
            oturum = 1 + (rnd.random() < 0.35) + (rnd.random() < 0.12)
            for s in range(oturum):
                if s:
                    t += rnd.randint(1800, 9000)
                if t > gun_sonu - 3600:
                    break
                self._ekle("App Open", t, u, surum)
                if yas == 0 and s == 0 and not kayitli:
                    if rnd.random() < (0.33 if self.kaynak[u] == "tiktok" else 0.55):
                        t += rnd.randint(40, 300)
                        self._ekle("Sign Up", t, u, surum)
                        kayitli = True
                        if rnd.random() < 0.72:
                            t += rnd.randint(60, 400)
                            self._ekle("Onboarding Complete", t, u, surum)
                gosterim = rnd.choices([0, 1, 2, 3, 4], weights=[25, 30, 22, 15, 8])[0]
                for _ in range(gosterim):
                    t += rnd.randint(20, 200)
                    self._ekle(
                        "View Product", t, u, surum, {"category": rnd.choice(["Giyim", "Ev", "Elektronik", "Kozmetik"])}
                    )
                if rnd.random() < 0.35:
                    t += rnd.randint(10, 120)
                    self._ekle("Search", t, u, surum)
                if gosterim and rnd.random() < 0.20 * min(1.6, katilim):
                    if gun >= DENEY_BAS and not deneyde:
                        t += 1
                        self._ekle(
                            "$experiment_started",
                            t,
                            u,
                            surum,
                            {"Experiment name": DENEY_ADI, "Variant name": self.varyant[u]},
                        )
                        deneyde = True
                    carpan = varyant_carpani if deneyde else 1.0
                    t += rnd.randint(30, 300)
                    self._ekle("Add to Cart", t, u, surum)
                    if rnd.random() < 0.55 * carpan:
                        t += rnd.randint(60, 600)
                        self._ekle("Checkout Started", t, u, surum)
                        p_al = 0.36 if (self.platform[u] == "android" and surum == "5.2.0") else 0.62
                        if rnd.random() < p_al * carpan:
                            t += rnd.randint(30, 400)
                            tutar = round(math.exp(rnd.gauss(6.0, 0.6)), 2)
                            self._ekle("Purchase", t, u, surum, {"amount": tutar, "currency": "TRY"})
                if rnd.random() < 0.04:
                    t += rnd.randint(10, 60)
                    self._ekle("Share", t, u, surum)
            gun += dt.timedelta(days=1)

    # -- okuma --

    def ozellikler(self, kod: int, olay: Olay) -> Dict[str, Any]:
        t, u, surum, ek = olay
        p: Dict[str, Any] = {
            "distinct_id": f"u{u:05d}",
            "time": t,
            "$insert_id": f"d{kod:02d}{u:05d}{t}",
            "$os": self.os[u],
            "mp_country_code": self.ulke[u],
            "utm_source": self.kaynak[u],
            "plan": self.plan[u],
        }
        if self.platform[u] == "web":
            p.update({"$browser": self.tarayici[u], "$current_url": SITE + YOL[kod], "mp_lib": "web"})
        else:
            p.update(
                {
                    "$app_version_string": surum,
                    "screen": EKRAN[kod],
                    "mp_lib": "android" if self.platform[u] == "android" else "swift",
                }
            )
        if ek:
            p.update(ek)
        return p

    def aralik(self, kod: int, bas: dt.date, bit: dt.date, utc: bool = False) -> List[Olay]:
        kayma = 0 if utc else OFSET_SN
        t_bas = _epoch_sn(bas) - kayma
        t_bit = _epoch_sn(bit + dt.timedelta(days=1)) - kayma
        zaman = self.zamanlar[kod]
        return self.olaylar[kod][bisect.bisect_left(zaman, t_bas) : bisect.bisect_left(zaman, t_bit)]

    def donus_zamanlari(self, kod: int) -> Dict[int, List[int]]:
        if kod not in self._donus_zamanlari:
            harita: Dict[int, List[int]] = defaultdict(list)
            for t, u, _, _ in self.olaylar[kod]:
                harita[u].append(t)
            self._donus_zamanlari[kod] = harita
        return self._donus_zamanlari[kod]


_GUNLUK: Optional[Gunluk] = None


def gunluk_al() -> Gunluk:
    global _GUNLUK
    if _GUNLUK is None:
        _GUNLUK = Gunluk(olcek=float(os.environ.get("ANALITIK_DEMO_OLCEK", "1.0")))
    return _GUNLUK


# --- Mixpanel ifade değerlendirici (where / on alt kümesi) -----------------------------------------

_JETON = re.compile(
    r'\s*(?:(?P<metin>"(?:[^"\\]|\\.)*")|(?P<sayi>-?\d+(?:\.\d+)?)|(?P<op>==|!=|>=|<=|>|<|\(|\)|\[|\]|,)'
    r"|(?P<ad>[A-Za-z_$][A-Za-z0-9_$]*))"
)
_TANIMSIZ = object()


def _jetonla(ifade: str) -> List[Tuple[str, Any]]:
    jetonlar = []
    i = 0
    while i < len(ifade):
        if ifade[i:].strip() == "":
            break
        m = _JETON.match(ifade, i)
        if not m or m.end() == i:
            raise ValueError(f"Çözülemeyen ifade: {ifade[i : i + 20]!r}")
        i = m.end()
        tur = m.lastgroup
        deger = m.group(tur)
        if tur == "metin":
            deger = json.loads(deger)
        elif tur == "sayi":
            deger = float(deger)
        jetonlar.append((tur, deger))
    return jetonlar


def kosul_derle(ifade: str) -> Callable[[Dict[str, Any]], bool]:
    """properties["k"] == "v", != > < >= <=, "v" in properties["k"], defined(), not, and, or, parantez."""
    jetonlar = _jetonla(ifade)
    konum = [0]

    def bak():
        return jetonlar[konum[0]] if konum[0] < len(jetonlar) else (None, None)

    def al(beklenen=None):
        j = bak()
        if beklenen is not None and j[1] != beklenen:
            raise ValueError(f"Beklenen {beklenen!r}, gelen {j[1]!r}")
        konum[0] += 1
        return j

    def deger():
        tur, d = al()
        if tur == "ad" and d in ("properties", "user", "event"):
            al("[")
            _, ad = al()
            al("]")
            return lambda p, ad=ad: p.get(ad, _TANIMSIZ)
        if tur == "ad" and d in ("true", "false"):
            return lambda p, d=d: d == "true"
        if tur in ("metin", "sayi"):
            return lambda p, d=d: d
        if d == "[":
            ogeler = []
            while bak()[1] != "]":
                ogeler.append(deger())
                if bak()[1] == ",":
                    al(",")
            al("]")
            return lambda p, ogeler=ogeler: [o(p) for o in ogeler]
        raise ValueError(f"Beklenmeyen jeton {d!r}")

    def karsilastir(a, op, b):
        if a is _TANIMSIZ or b is _TANIMSIZ:
            return op == "!="
        if isinstance(a, bool) != isinstance(b, bool):
            return op == "!="
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            pass
        elif type(a) is not type(b):
            return op == "!="
        return {"==": a == b, "!=": a != b, ">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b}[op]

    def atom():
        tur, d = bak()
        if d == "(":
            al("(")
            sonuc = veya()
            al(")")
            return sonuc
        if tur == "ad" and d == "not":
            al()
            ic = atom()
            return lambda p: not ic(p)
        if tur == "ad" and d == "defined":
            al()
            al("(")
            v = deger()
            al(")")
            return lambda p: v(p) is not _TANIMSIZ and v(p) is not None
        sol = deger()
        tur, d = bak()
        if d in ("==", "!=", ">", "<", ">=", "<="):
            al()
            sag = deger()
            return lambda p, op=d: karsilastir(sol(p), op, sag(p))
        if tur == "ad" and d == "in":
            al()
            sag = deger()

            def icinde(p):
                a, b = sol(p), sag(p)
                if b is _TANIMSIZ or a is _TANIMSIZ:
                    return False
                if isinstance(b, str):
                    return isinstance(a, str) and a in b
                return a in b

            return icinde
        return lambda p: bool(sol(p)) and sol(p) is not _TANIMSIZ

    def ve():
        sol = atom()
        while bak() == ("ad", "and"):
            al()
            sag = atom()
            sol = (lambda a, b: lambda p: a(p) and b(p))(sol, sag)
        return sol

    def veya():
        sol = ve()
        while bak() == ("ad", "or"):
            al()
            sag = ve()
            sol = (lambda a, b: lambda p: a(p) or b(p))(sol, sag)
        return sol

    sonuc = veya()
    if konum[0] != len(jetonlar):
        raise ValueError(f"İfade sonunda fazlalık: {jetonlar[konum[0] :]}")
    return sonuc


def _ozellik_adi(ifade: Optional[str]) -> Optional[str]:
    if not ifade:
        return None
    m = re.match(r'^\s*(?:properties|user|event)\[\s*"((?:[^"\\]|\\.)*)"\s*\]\s*$', ifade)
    return json.loads(f'"{m.group(1)}"') if m else ifade


# --- toplama ----------------------------------------------------------------------------------------


def _kova(gun: dt.date, birim: str) -> str:
    if birim == "week":
        return (gun - dt.timedelta(days=gun.weekday())).isoformat()
    if birim == "month":
        return gun.replace(day=1).isoformat()
    return gun.isoformat()


def _segment(deger: Any) -> str:
    if deger is None or deger is _TANIMSIZ:
        return "undefined"
    if isinstance(deger, float) and deger.is_integer():
        return str(int(deger))
    return str(deger)


def sayim(
    g: Gunluk,
    ad: str,
    bas: dt.date,
    bit: dt.date,
    birim: str = "day",
    tip: str = "general",
    ozellik: Optional[str] = None,
    kosul: Optional[Callable] = None,
    limit: int = 60,
) -> Dict[str, Dict[str, float]]:
    kod = KOD.get(ad)
    if kod is None:
        return {}
    sayac: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    tekil: Dict[str, Dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for olay in g.aralik(kod, bas, bit):
        p = g.ozellikler(kod, olay) if (kosul or ozellik) else None
        if kosul and not kosul(p):
            continue
        segment = ad if ozellik is None else _segment(p.get(ozellik))
        kova = _kova(_yerel_gun(olay[0]), birim)
        if tip == "unique":
            tekil[segment][kova].add(olay[1])
        else:
            sayac[segment][kova] += 1
    if tip == "unique":
        sonuc = {s: {k: float(len(v)) for k, v in kovalar.items()} for s, kovalar in tekil.items()}
    else:
        sonuc = {s: dict(kovalar) for s, kovalar in sayac.items()}
    if ozellik is not None and len(sonuc) > limit:
        en_cok = sorted(sonuc, key=lambda s: -sum(sonuc[s].values()))[:limit]
        sonuc = {s: sonuc[s] for s in en_cok}
    return sonuc


def _seri_yaniti(degerler: Dict[str, Dict[str, float]], bas: dt.date, bit: dt.date, birim: str) -> Dict:
    seri = sorted({_kova(bas + dt.timedelta(days=i), birim) for i in range((bit - bas).days + 1)})
    return {"data": {"series": seri, "values": degerler}, "legend_size": len(degerler)}


def _adimlar(sayilar: Sequence[int], adimlar: Sequence[str], sureler: Sequence[Optional[float]]) -> List[Dict]:
    sonuc = []
    for i, n in enumerate(sayilar):
        once = sayilar[i - 1] if i else n
        onceki_sure = sureler[i - 1] if i > 1 and sureler[i - 1] is not None else 0
        sonuc.append(
            {
                "count": n,
                "step_conv_ratio": 1 if i == 0 else (n / once if once else 0),
                "overall_conv_ratio": n / sayilar[0] if sayilar[0] else 0,
                "avg_time": None if i == 0 or sureler[i] is None else round(sureler[i] - onceki_sure),
                "avg_time_from_start": None if i == 0 or sureler[i] is None else round(sureler[i]),
                "goal": adimlar[i],
                "event": adimlar[i],
                "step_label": adimlar[i],
            }
        )
    return sonuc


# --- taşıma (Mixpanel + Hotjar uç noktaları) -------------------------------------------------------


class DemoTasima:
    """GercekTasima ile aynı arayüz; istekleri sentetik günlükten yanıtlar."""

    def __init__(self, gunluk: Optional[Gunluk] = None):
        self.g = gunluk or gunluk_al()
        self.istek_sayisi = 0

    def json_iste(self, yontem: str, url: str, basliklar=None, govde=None, zaman_asimi: float = 90) -> Any:
        self.istek_sayisi += 1
        parca = urllib.parse.urlsplit(url)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parca.query, keep_blank_values=True).items()}
        yol = parca.path
        if "/api/query" in yol:
            return self._sorgu(yol.split("/api/query", 1)[1], q)
        if re.search(r"/api/app/projects/[^/]+/schemas$", yol):
            return {"results": semalar(), "status": "ok"}
        if "hotjar" in parca.netloc or yol.startswith("/v1/") or yol.startswith("/v2/"):
            from . import demo_hotjar

            return demo_hotjar.yanitla(yontem, yol, q, govde)
        raise HttpHatasi(404, json.dumps({"error": f"demo: bilinmeyen uç nokta {yol}"}))

    def satir_iste(self, url: str, basliklar=None, zaman_asimi: float = 600) -> Iterator[str]:
        self.istek_sayisi += 1
        q = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).items()}
        bas, bit = dt.date.fromisoformat(q["from_date"]), dt.date.fromisoformat(q["to_date"])
        adlar = json.loads(q["event"]) if q.get("event") else OLAYLAR
        kosul = kosul_derle(q["where"]) if q.get("where") else None
        kayitlar = []
        for ad in adlar:
            kod = KOD.get(ad)
            if kod is None:
                continue
            for olay in self.g.aralik(kod, bas, bit, utc=True):
                p = self.g.ozellikler(kod, olay)
                if kosul is None or kosul(p):
                    kayitlar.append((olay[0], ad, p))
        kayitlar.sort(key=lambda k: k[0])
        for _, ad, p in kayitlar:
            yield json.dumps({"event": ad, "properties": p}, ensure_ascii=False)

    # -- Mixpanel Query API --

    def _sorgu(self, yol: str, q: Dict[str, str]) -> Any:
        g = self.g
        tarih = lambda a: dt.date.fromisoformat(q[a])  # noqa: E731
        son31 = (DEMO_BUGUN - dt.timedelta(days=31), DEMO_BUGUN - dt.timedelta(days=1))
        if yol == "/events/names":
            hacim = {ad: len(g.aralik(KOD[ad], *son31)) for ad in OLAYLAR}
            return [ad for ad in sorted(OLAYLAR, key=lambda a: -hacim[a]) if hacim[ad]][: int(q.get("limit", 255))]
        if yol == "/events/properties/top":
            kod = KOD.get(q.get("event", ""))
            if kod is None:
                return {}
            sayac: Counter = Counter()
            for olay in g.aralik(kod, *son31)[:5000]:
                sayac.update(k for k in g.ozellikler(kod, olay) if k not in ("time", "$insert_id"))
            return {k: {"count": v} for k, v in sayac.most_common(int(q.get("limit", 10)))}
        if yol == "/events/properties/values":
            kod = KOD.get(q.get("event", ""))
            if kod is None:
                return []
            sayac = Counter(_segment(g.ozellikler(kod, o).get(q["name"])) for o in g.aralik(kod, *son31))
            return [d for d, _ in sayac.most_common(int(q.get("limit", 255)))]
        if yol == "/events":
            bas, bit, birim = tarih("from_date"), tarih("to_date"), q.get("unit", "day")
            degerler = {}
            for ad in json.loads(q["event"]):
                degerler.update(sayim(g, ad, bas, bit, birim, q.get("type", "general")))
            return _seri_yaniti(degerler, bas, bit, birim)
        if yol in ("/events/properties", "/segmentation"):
            bas, bit, birim = tarih("from_date"), tarih("to_date"), q.get("unit", "day")
            ozellik = q.get("name") if yol == "/events/properties" else _ozellik_adi(q.get("on"))
            kosul = kosul_derle(q["where"]) if q.get("where") else None
            degerler = sayim(
                g, q["event"], bas, bit, birim, q.get("type", "general"), ozellik, kosul, int(q.get("limit", 60))
            )
            return _seri_yaniti(degerler, bas, bit, birim)
        if yol == "/funnels/list":
            return [{"funnel_id": i, "name": h["ad"]} for i, h in HUNILER.items()]
        if yol == "/funnels":
            return self._huni(q)
        if yol == "/retention":
            return self._tutunma(q)
        if yol == "/insights":
            return self._kayitli(int(q["bookmark_id"]))
        raise HttpHatasi(404, json.dumps({"error": f"demo: bilinmeyen sorgu {yol}"}))

    def _huni(self, q: Dict[str, str]) -> Dict:
        tanim = HUNILER.get(int(q["funnel_id"]))
        if not tanim:
            raise HttpHatasi(404, json.dumps({"error": "funnel not found"}))
        bas, bit = dt.date.fromisoformat(q["from_date"]), dt.date.fromisoformat(q["to_date"])
        pencere = int(q.get("length") or tanim["pencere_gun"])
        ozellik = _ozellik_adi(q.get("on"))
        kosul = kosul_derle(q["where"]) if q.get("where") else None
        akis = []
        for i, ad in enumerate(tanim["adimlar"]):
            kod = KOD[ad]
            for olay in self.g.aralik(kod, bas, bit + dt.timedelta(days=pencere)):
                p = self.g.ozellikler(kod, olay)
                if kosul and not kosul(p):
                    continue
                akis.append((f"u{olay[1]}", ad, olay[0], _segment(p.get(ozellik)) if ozellik and i == 0 else None))
        sonuc = analiz.huni_hesapla(
            akis,
            tanim["adimlar"],
            pencere * 86400,
            _epoch_sn(bas) - OFSET_SN,
            _epoch_sn(bit + dt.timedelta(days=1)) - OFSET_SN - 1,
        )
        anahtar = bas.isoformat()
        adimlar = tanim["adimlar"]
        if ozellik:
            veri = {"$overall": _adimlar(sonuc["toplam"], adimlar, sonuc["medyan_sure"])}
            segmentler = sorted(sonuc["segmentler"].items(), key=lambda kv: -kv[1][0])[: int(q.get("limit", 255))]
            for s, sayilar in segmentler:
                veri[s] = _adimlar(sayilar, adimlar, [None] * len(adimlar))
            return {"meta": {"dates": [anahtar]}, "data": {anahtar: veri}}
        toplam = sonuc["toplam"]
        en_kotu = max(range(1, len(toplam)), key=lambda i: toplam[i - 1] - toplam[i])
        return {
            "meta": {"dates": [anahtar]},
            "data": {
                anahtar: {
                    "steps": _adimlar(toplam, adimlar, sonuc["medyan_sure"]),
                    "analysis": {
                        "completion": toplam[-1],
                        "starting_amount": toplam[0],
                        "steps": len(toplam),
                        "worst": en_kotu,
                    },
                }
            },
        }

    def _tutunma(self, q: Dict[str, str]) -> Dict:
        g = self.g
        dogum = KOD.get(q.get("born_event", ""))
        if dogum is None:
            return {}
        donus = KOD.get(q.get("event") or q["born_event"], dogum)
        bas, bit = dt.date.fromisoformat(q["from_date"]), dt.date.fromisoformat(q["to_date"])
        birim = q.get("unit", "day")
        aralik_sn = {"day": 86400, "week": 7 * 86400, "month": 30 * 86400}[birim]
        sayi = int(q.get("interval_count", 1))
        ozellik = _ozellik_adi(q.get("on"))
        kosul = kosul_derle(q["born_where"]) if q.get("born_where") else None
        ilk: Dict[int, Olay] = {}
        for olay in g.olaylar[dogum]:
            if olay[1] not in ilk:
                ilk[olay[1]] = olay
        simdi = _epoch_sn(DEMO_BUGUN) - OFSET_SN
        donusler = g.donus_zamanlari(donus)
        kohortlar: Dict[str, Dict[str, Dict]] = defaultdict(dict)
        for u, olay in ilk.items():
            gun = _yerel_gun(olay[0])
            if not bas <= gun <= bit:
                continue
            p = g.ozellikler(dogum, olay)
            if kosul and not kosul(p):
                continue
            kohort = _kova(gun, birim)
            kohort_bas = _epoch_sn(dt.date.fromisoformat(kohort)) - OFSET_SN
            segment = _segment(p.get(ozellik)) if ozellik else "_"
            kayit = kohortlar[kohort].setdefault(segment, {"counts": [], "first": 0})
            kayit["first"] += 1
            zamanlar = donusler.get(u, [])
            for i in range(sayi + 1):
                if kohort_bas + (i + 1) * aralik_sn > simdi:
                    break
                if len(kayit["counts"]) <= i:
                    kayit["counts"].append(0)
                alt, ust = olay[0] + i * aralik_sn, olay[0] + (i + 1) * aralik_sn
                j = bisect.bisect_left(zamanlar, alt)
                while j < len(zamanlar) and zamanlar[j] < ust:
                    if not (donus == dogum and zamanlar[j] == olay[0]):
                        kayit["counts"][i] += 1
                        break
                    j += 1
        if ozellik:
            return {k: v for k, v in sorted(kohortlar.items())}
        return {k: v["_"] for k, v in sorted(kohortlar.items())}

    def _kayitli(self, kimlik: int) -> Dict:
        g = self.g
        bit = DEMO_BUGUN - dt.timedelta(days=1)
        bas = bit - dt.timedelta(days=29)
        ortak = {
            "computed_at": f"{DEMO_BUGUN.isoformat()}T06:00:00+00:00",
            "date_range": {
                "from_date": f"{bas.isoformat()}T00:00:00+03:00",
                "to_date": f"{bit.isoformat()}T23:59:59.999000+03:00",
            },
        }
        if kimlik == 2001:
            seri = {}
            for ad, tip in (("App Open", "unique"), ("Purchase", "general")):
                gunluk = sayim(g, ad, bas, bit, "day", tip).get(ad, {})
                seri[ad] = {f"{d}T00:00:00+03:00": v for d, v in sorted(gunluk.items())}
            return {
                **ortak,
                "headers": ["$event"],
                "series": seri,
                "meta": {"is_segmentation_limit_hit": False, "min_sampling_factor": 1.0},
            }
        if kimlik == 2002:
            dagilim = sayim(g, "Purchase", bas, bit, "month", "general", "$os")
            ic = {"$overall": {"all": sum(sum(v.values()) for v in dagilim.values())}}
            ic.update({s: {"all": sum(v.values())} for s, v in dagilim.items()})
            return {**ortak, "headers": ["$event", "$os"], "series": {"Purchase": ic}}
        if kimlik == 2003:
            yanit = self._huni({"funnel_id": "1002", "from_date": bas.isoformat(), "to_date": bit.isoformat()})
            adimlar = yanit["data"][bas.isoformat()]["steps"]
            alanlar = ("count", "step_conv_ratio", "overall_conv_ratio", "avg_time", "avg_time_from_start")
            govde = {a: {f"{i + 1}. {s['event']}": {"all": s[a]} for i, s in enumerate(adimlar)} for a in alanlar}
            return {**ortak, "headers": ["$funnel"], "series": {"Satın alma hunisi": govde}}
        raise HttpHatasi(404, json.dumps({"error": "bookmark not found"}))


def semalar() -> List[Dict]:
    aciklamalar = {
        "App Open": "Uygulama ya da site açıldı (oturum başı)",
        "Sign Up": "Hesap oluşturuldu",
        "Onboarding Complete": "Karşılama adımları bitti",
        "View Product": "Ürün detayı görüntülendi",
        "Add to Cart": "Ürün sepete eklendi",
        "Checkout Started": "Ödeme sayfası açıldı",
        "Purchase": "Ödeme başarıyla tamamlandı",
        "$experiment_started": "A/B testine maruz kalma",
    }
    ozellik = {
        "View Product": ["category"],
        "Purchase": ["amount", "currency"],
        "$experiment_started": ["Experiment name", "Variant name"],
    }
    return [
        {
            "entityType": "event",
            "name": ad,
            "schemaJson": {"description": a, "properties": {o: {"type": "string"} for o in ozellik.get(ad, [])}},
        }
        for ad, a in aciklamalar.items()
    ]


# --- demo çalışma alanı -------------------------------------------------------------------------------

DEMO_AYARLAR = {
    "proje_adi": "Örnek Mağaza (DEMO — sentetik veri)",
    "demo": True,
    "utc_ofset_saat": 3,
    "mixpanel": {"kaynak": "api", "bolge": "eu", "proje_id": 1},
    "hotjar": {"kaynak": "api", "site_id": 1234567},
    "boyutlar": ["$os", "$app_version_string", "mp_country_code", "utm_source"],
    "kpiler": [
        {"ad": "Aktif kullanıcı", "olay": "App Open", "tip": "unique"},
        {"ad": "Yeni kayıt", "olay": "Sign Up", "tip": "unique"},
        {"ad": "Sepete ekleyen", "olay": "Add to Cart", "tip": "unique"},
        {"ad": "Satın alma", "olay": "Purchase", "tip": "general"},
        {"ad": "Ödeme dönüşümü", "pay": "Purchase", "payda": "Checkout Started", "tip": "unique"},
    ],
    "huniler": {"Kayıt": 1001, "Satın alma": 1002},
    "deney": {
        "maruz_olay": "$experiment_started",
        "deney_ozelligi": "Experiment name",
        "grup_ozelligi": "Variant name",
    },
    "esikler": {"degisim": 0.1, "z": 3},
}


def calisma_alani_kur(yerel: Path) -> None:
    """Demo ayarları, olay günlüğü notları, sözlük ve örnek dosyalar."""
    from . import ayarlar as A
    from . import sozluk
    from .demo_hotjar import anket_csv_yaz
    from .mixpanel import Mixpanel

    (yerel / "ayarlar.json").write_text(json.dumps(DEMO_AYARLAR, ensure_ascii=False, indent=2), encoding="utf-8")
    (yerel / "notlar.md").write_text(
        "# Olay günlüğü (DEMO)\n\nBiçim: `YYYY-AA-GG: açıklama`\n\n" + "\n".join(NOTLAR) + "\n", encoding="utf-8"
    )
    ayar = A.yukle(yerel)
    mp = Mixpanel(ayar)
    sozluk.kaydet(ayar, sozluk.kur_api(mp))
    anket_csv_yaz(yerel / "girdi" / "demo-anket.csv")
    _genis_disa_aktarim_yaz(yerel / "girdi" / "demo-mixpanel-disa-aktarim.csv")


def _genis_disa_aktarim_yaz(yol: Path) -> None:
    """Mixpanel arayüzünden alınmış gibi geniş (tarihler sütunda) bir CSV: Purchase, $os kırılımı, 28 gün."""
    g = gunluk_al()
    bit = DEMO_BUGUN - dt.timedelta(days=1)
    bas = bit - dt.timedelta(days=27)
    veri = sayim(g, "Purchase", bas, bit, "day", "general", "$os")
    gunler = [(bas + dt.timedelta(days=i)).isoformat() for i in range(28)]
    yol.parent.mkdir(parents=True, exist_ok=True)
    with yol.open("w", newline="", encoding="utf-8") as f:
        yazici = csv.writer(f)
        yazici.writerow(["Event", "$os"] + gunler)
        for segment, seri in sorted(veri.items(), key=lambda kv: -sum(kv[1].values())):
            yazici.writerow(["Purchase", segment] + [int(seri.get(gun, 0)) for gun in gunler])
