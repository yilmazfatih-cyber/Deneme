"""Ortak bağlayıcı arayüzü, güvenli HTTP yardımcısı (yeniden deneme, token gizleme) ve tohumlu kuru (dry run) veri üretici."""
from __future__ import annotations

import abc
import hashlib
import json
import math
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

from .ortak import (YAS_BANTLARI, DuyguOzeti, HesapKaydi, IcerikKaydi, KonuHacmi, MetrikKaydi, duygu_ozetle, yaratici_turu)

AZAMI_DENEME = 5
ZAMAN_ASIMI_SN = 30


class BaglayiciHatasi(RuntimeError):
    """Platform çağrısı başarısız; mesajda token bulunmaz."""


def _gizle(metin: str, sirlar: list[str]) -> str:
    for s in sirlar:
        if s:
            metin = metin.replace(s, "***")
    return re.sub(r"(access_token|token|bearer|authorization)([=:\s\"']+)[A-Za-z0-9._\-|%]+", r"\1\2***", metin, flags=re.I)


def http_json(url: str, *, params: dict | None = None, basliklar: dict | None = None, govde: dict | None = None,
              yontem: str = "GET", sirlar: list[str] | None = None, uyku=time.sleep) -> dict:
    """JSON isteği. 429 ve 5xx'te üstel bekleme (1, 2, 4, 8 sn + sapma; en fazla 5 deneme). Hata mesajında token yok."""
    sirlar = sirlar or []
    tam = url + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
    veri = json.dumps(govde).encode() if govde is not None else None
    hb = {"Accept": "application/json", **(basliklar or {})}
    if veri is not None:
        hb["Content-Type"] = "application/json"
    son = ""
    yol = urllib.parse.urlsplit(url).path  # mesajlarda yalnız yol; sorgu dizgesi (token içerebilir) yok
    for deneme in range(AZAMI_DENEME):
        try:
            with urllib.request.urlopen(urllib.request.Request(tam, data=veri, headers=hb, method=yontem), timeout=ZAMAN_ASIMI_SN) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            try:
                ayrinti = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                ayrinti = ""
            son = f"HTTP {e.code} {yol}: {_gizle(ayrinti, sirlar)}"
            if e.code != 429 and e.code < 500:
                raise BaglayiciHatasi(son) from None
            bekle = e.headers.get("Retry-After") if e.headers else None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            son = f"ağ hatası {yol}: {_gizle(str(getattr(e, 'reason', e)), sirlar)}"
            bekle = None
        if deneme < AZAMI_DENEME - 1:
            sn = float(bekle) if bekle and str(bekle).isdigit() else (2 ** deneme) + random.random()
            uyku(min(sn, 60.0))
    raise BaglayiciHatasi(f"{AZAMI_DENEME} denemede başarısız: {son}")


def ortam(ad: str, zorunlu: bool = True) -> str:
    v = os.environ.get(ad, "").strip()
    if zorunlu and not v:
        raise BaglayiciHatasi(f"{ad} ortam değişkeni tanımlı değil (gerçek mod). Sahte veriyle denemek için --kuru kullanın.")
    return v


class Baglayici(abc.ABC):
    """Tüm platform bağlayıcılarının ortak arayüzü. Çıktılar ortak kayıt sınıflarıdır; kişi düzeyi alan yoktur."""

    platform_adi = ""

    def __init__(self, kuru: bool = False, tohum: int = 7):
        self.kuru = kuru
        self.tohum = tohum
        self._uretici: KuruUretici | None = None

    @property
    def uretici(self) -> "KuruUretici":
        if self._uretici is None:
            self._uretici = KuruUretici(self.kuru_platformlari(), self.tohum)
        return self._uretici

    def kuru_platformlari(self) -> tuple[str, ...]:
        return (self.platform_adi,)

    @abc.abstractmethod
    def hesaplar(self) -> list[HesapKaydi]: ...

    @abc.abstractmethod
    def icerikler(self, baslangic: str, bitis: str) -> list[IcerikKaydi]: ...

    @abc.abstractmethod
    def metrikler(self, icerik_id: str, baslangic: str, bitis: str, kirilim: tuple[str, ...] = ("age", "gender")) -> list[MetrikKaydi]: ...

    @abc.abstractmethod
    def yorum_ozeti(self, icerik_id: str) -> list[DuyguOzeti]: ...

    @abc.abstractmethod
    def konu_hacmi(self, konu: str, baslangic: str, bitis: str) -> list[KonuHacmi]: ...


# ───────────────────────── Kuru (dry run) üretici ─────────────────────────
# Gerçekçi ama sahte: platform kitle yaşı, CTR, 3 sn izlenme, tamamlama tabanları; bant ve yaratıcı etkileri.
PROFIL = {
    "facebook": dict(yas=(0.08, 0.22, 0.27, 0.23, 0.20), ctr=0.012, dikkat=0.30, tam=0.18, cpm=48.0, k=0.55, neg=0.16),
    "instagram": dict(yas=(0.24, 0.34, 0.22, 0.12, 0.08), ctr=0.009, dikkat=0.38, tam=0.22, cpm=55.0, k=0.58, neg=0.10),
    "tiktok": dict(yas=(0.38, 0.32, 0.17, 0.09, 0.04), ctr=0.011, dikkat=0.45, tam=0.14, cpm=32.0, k=0.52, neg=0.12),
    "x": dict(yas=(0.20, 0.33, 0.25, 0.14, 0.08), ctr=0.007, dikkat=0.22, tam=0.16, cpm=38.0, k=0.40, neg=0.22),
}
BANT_DIKKAT = dict(zip(YAS_BANTLARI, (1.25, 1.10, 1.00, 0.90, 0.80)))
BANT_TAMAMLAMA = dict(zip(YAS_BANTLARI, (0.75, 0.90, 1.05, 1.15, 1.25)))
BANT_CTR = dict(zip(YAS_BANTLARI, (0.90, 1.05, 1.10, 1.00, 0.95)))
YARATICI_CTR = {"indirim": 1.35, "kitlik": 1.15, "sosyal_kanit": 1.05, "bilgi": 0.85, "duygusal": 0.90}
KONULAR = ("kış modası", "elektronik", "ev yaşam", "kozmetik")
BASLIKLAR = {
    "indirim": ["{k}: seçili ürünlerde %30 indirim", "Sepette ek %20 kampanya, {k}"],
    "kitlik": ["Son 3 gün! {k} stokları tükeniyor", "Sınırlı sayıda: {k} seçkisi"],
    "sosyal_kanit": ["Binlerce kişi bu {k} ürününü seçti", "En çok satan {k} ürünleri"],
    "bilgi": ["{k} alırken nelere dikkat etmeli?", "{k} rehberi: yeni ürünün özellikleri"],
    "duygusal": ["Evde sıcak bir akşam, {k} ile", "Sevdiklerinize küçük bir mutluluk: {k}"],
}
YORUMLAR = {
    "olumlu": ["Harika ürün, çok memnunum", "Kargo hızlı geldi teşekkürler", "Kaliteli, tavsiye ederim", "Bayıldım çok güzel"],
    "olumsuz": ["Fiyat çok pahalı", "Kargo geç geldi, rezalet", "Ürün bozuk çıktı iade ettim", "Müşteri hizmeti berbat"],
    "notr": ["Beden tablosu var mı", "Mağazada da var mı", "Ne zaman gelir", "Renk seçenekleri neler"],
}
KONU_EGIM = {"kış modası": 0.020, "elektronik": 0.012, "ev yaşam": 0.0, "kozmetik": -0.006}  # günlük göreli eğilim


def _tarih(s: str) -> date:
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


def _binom(rnd: random.Random, n: int, p: float) -> int:
    if n <= 0 or p <= 0:
        return 0
    p = min(p, 0.999)
    return max(0, min(n, round(n * p + rnd.gauss(0, 1) * math.sqrt(n * p * (1 - p)))))


class KuruUretici:
    """Tohumlu sahte veri: ağ yok. Aynı tohum ve tarih aralığı → aynı veri (UNIQUE tekrarında güncelleme sınanabilir)."""

    def __init__(self, platformlar: tuple[str, ...], tohum: int = 7):
        self.platformlar = platformlar
        self.tohum = tohum
        self._icerik: dict[str, dict] = {}

    def _rnd(self, *anahtar) -> random.Random:
        h = hashlib.sha256(("|".join(map(str, (self.tohum, *anahtar)))).encode()).hexdigest()
        return random.Random(int(h[:12], 16))

    def hesaplar(self) -> list[HesapKaydi]:
        out = []
        for p in self.platformlar:
            out.append(HesapKaydi(p, f"kuru-{p}-reklam", f"(kuru) {p} reklam hesabı", "reklam_hesabi"))
            out.append(HesapKaydi(p, f"kuru-{p}-profil", f"(kuru) {p} {'sayfa' if p == 'facebook' else 'profil'}", "sayfa" if p == "facebook" else "profil"))
        return out

    def icerikler(self, baslangic: str, bitis: str) -> list[IcerikKaydi]:
        b0, b1 = _tarih(baslangic), _tarih(bitis)
        gun = max(1, (b1 - b0).days + 1)
        out = []
        for p in self.platformlar:
            rnd = self._rnd("icerik", p)
            n_reklam, n_org = {"facebook": (6, 4), "instagram": (6, 5), "tiktok": (8, 4), "x": (6, 4)}[p]
            for i in range(n_reklam + n_org):
                reklam = i < n_reklam
                tur = list(YARATICI_CTR)[i % 5] if reklam else rnd.choice(list(YARATICI_CTR))
                konu = KONULAR[(i + len(p)) % len(KONULAR)]
                baslik = rnd.choice(BASLIKLAR[tur]).format(k=konu)
                if p == "tiktok":
                    bicim = "video"
                elif p == "instagram":
                    bicim = rnd.choice(["reels", "video", "gorsel", "carousel", "story"])
                elif p == "x":
                    bicim = rnd.choice(["metin", "gorsel", "video"])
                else:
                    bicim = rnd.choice(["gorsel", "video", "carousel"])
                sure = rnd.randint(10, 21) if reklam else rnd.randint(3, 7)
                bas = b0 + timedelta(days=rnd.randint(0, max(0, gun - sure)))
                iid = f"{p}:kuru-{i + 1:03d}"
                self._icerik[iid] = dict(p=p, tur=tur, bicim=bicim, reklam=reklam, bas=bas, bit=min(b1, bas + timedelta(days=sure - 1)))
                out.append(IcerikKaydi(iid, p, f"kuru-{p}-{'reklam' if reklam else 'profil'}", "reklam" if reklam else "organik", bicim,
                                       yaratici_turu(baslik), bas.isoformat() + "T10:00:00", konu, baslik))
        return out

    def metrikler(self, icerik_id: str, baslangic: str, bitis: str) -> list[MetrikKaydi]:
        bilgi = self._icerik.get(icerik_id)
        if not bilgi:
            return []
        p, pr = bilgi["p"], PROFIL[bilgi["p"]]
        video = bilgi["bicim"] in ("video", "reels", "story")
        out = []
        g = max(bilgi["bas"], _tarih(baslangic))
        while g <= min(bilgi["bit"], _tarih(bitis)):
            rnd = self._rnd("metrik", icerik_id, g.isoformat())
            if bilgi["reklam"]:
                toplam = int(math.exp(rnd.gauss(math.log(9000), 0.45)))
                hucreler = [(y, c, pr["yas"][j] * (pr["k"] if c == "K" else 1 - pr["k"])) for j, y in enumerate(YAS_BANTLARI) for c in ("K", "E")]
            else:  # organik: platform yaş kırılımı vermez → toplam satır
                toplam = int(math.exp(rnd.gauss(math.log(2500), 0.5)))
                hucreler = [("hepsi", "hepsi", 1.0)]
            for y, c, pay in hucreler:
                n = max(0, int(toplam * pay * rnd.uniform(0.85, 1.15)))
                yb = BANT_CTR.get(y, 1.0)
                ek = 1.15 if (bilgi["tur"] == "indirim" and y == "18-24") else 1.0
                ctr = pr["ctr"] * yb * YARATICI_CTR[bilgi["tur"]] * ek * (1.05 if c == "K" else 1.0) * (1.0 if bilgi["reklam"] else 0.6)
                tik = _binom(rnd, n, ctr)
                v3 = vt = vi = None
                if video:
                    v3 = _binom(rnd, n, pr["dikkat"] * BANT_DIKKAT.get(y, 1.0))
                    vt = _binom(rnd, v3, pr["tam"] * BANT_TAMAMLAMA.get(y, 1.0))
                    vi = int(v3 * 1.6)
                out.append(MetrikKaydi(icerik_id, g.isoformat(), y, c, "hepsi", n, int(n * 0.74), tik,
                                       _binom(rnd, n, 0.018 * (1.3 if not bilgi["reklam"] else 1.0)), vi, v3, vt,
                                       _binom(rnd, tik, 0.035 * (1.4 if bilgi["tur"] in ("indirim", "kitlik") else 1.0)) if bilgi["reklam"] else None,
                                       round(n / 1000 * pr["cpm"], 2) if bilgi["reklam"] else None))
            g += timedelta(days=1)
        return out

    def yorum_ozeti(self, icerik_id: str) -> list[DuyguOzeti]:
        """Sahte yorumlar üretilir, sözlükle sayılır, metinler atılır."""
        bilgi = self._icerik.get(icerik_id)
        if not bilgi:
            return []
        rnd = self._rnd("yorum", icerik_id)
        neg = PROFIL[bilgi["p"]]["neg"] * (1.4 if bilgi["tur"] == "kitlik" else 0.8 if bilgi["tur"] == "duygusal" else 1.0)
        out = []
        for k in range(rnd.randint(1, 3)):
            tarih = (bilgi["bas"] + timedelta(days=k * 2 + 1)).isoformat()
            metinler = []
            for _ in range(rnd.randint(8, 40)):
                u = rnd.random()
                tur = "olumsuz" if u < neg else "olumlu" if u < neg + 0.5 else "notr"
                metinler.append(rnd.choice(YORUMLAR[tur]))
            d = duygu_ozetle(icerik_id, tarih, metinler)
            if d:
                out.append(d)
        return out

    def konu_hacmi(self, platform: str, konu: str, baslangic: str, bitis: str) -> list[KonuHacmi]:
        rnd = self._rnd("konu", platform, konu)
        taban = {"x": 1800, "instagram": 900}.get(platform, 500) * rnd.uniform(0.6, 1.4)
        out = []
        g, son = _tarih(baslangic), _tarih(bitis)
        i = 0
        while g <= son:
            hafta = 1.15 if g.weekday() >= 5 else 1.0
            out.append(KonuHacmi(platform, konu, g.isoformat(), int(taban * math.exp(KONU_EGIM.get(konu, 0) * i) * hafta * rnd.uniform(0.85, 1.15)), "tahmini"))
            g += timedelta(days=1)
            i += 1
        return out
