"""X API v2 kamu araması: günlük sayım (counts/recent) ve küçük örneklemle toplu duygu (search/recent).

Kullandıkça öde; birim fiyatlar üçüncü taraf kaynaklara göre (doğrulanmalı). Her çalıştırma bütçe sınırlıdır.
Gönderi metni yalnız bellekte duyguya ve konuya indirgenir; metin, yazar ve kullanıcı kimliği saklanmaz. Token: X_BEARER_TOKEN.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sosyal.baglayici import BaglayiciHatasi, http_json, ortam
from sosyal.ortak import KONU_SOZLUK, tr_kucuk, yorum_duygusu

API = "https://api.x.com/2"
BIRIM_USD = {"okuma": 0.005, "sayim": 0.005}  # doğrulanmalı: X resmî fiyat sayfası
AZAMI_SONUC = 100  # search/recent sayfa başına


class ButceAsildi(RuntimeError):
    pass


@dataclass
class Butce:
    sinir_usd: float
    harcanan_usd: float = 0.0
    okuma: int = 0
    sayim: int = 0

    def harca(self, tur: str, adet: int = 1) -> None:
        tutar = BIRIM_USD[tur] * adet
        if self.harcanan_usd + tutar > self.sinir_usd + 1e-9:
            raise ButceAsildi(f"bütçe {self.sinir_usd:.2f} USD; bu istek {tutar:.3f} USD ekler (harcanan {self.harcanan_usd:.3f})")
        self.harcanan_usd += tutar
        setattr(self, tur, getattr(self, tur) + adet)


@dataclass
class DuyguOrneklemi:
    tarih: str
    n: int
    olumlu: float
    notr: float
    olumsuz: float
    konular: dict[str, float] = field(default_factory=dict)
    ort_etkilesim: float | None = None


def ozetle(gonderiler: list[dict], tarih: str) -> DuyguOrneklemi | None:
    """[{text, public_metrics}] → oranlar. Metin döndürülmez."""
    if not gonderiler:
        return None
    say = {"olumlu": 0, "notr": 0, "olumsuz": 0}
    konu: dict[str, int] = {}
    etk = 0.0
    for g in gonderiler:
        metin = g.get("text") or ""
        say[yorum_duygusu(metin)] += 1
        kel = set(re.findall(r"[\wçğıöşü]+", tr_kucuk(metin)))
        for k, s in KONU_SOZLUK.items():
            if kel & s:
                konu[k] = konu.get(k, 0) + 1
        pm = g.get("public_metrics") or {}
        etk += sum(float(pm.get(a) or 0) for a in ("like_count", "reply_count", "retweet_count", "quote_count"))
    n = len(gonderiler)
    return DuyguOrneklemi(tarih=tarih, n=n, olumlu=say["olumlu"] / n, notr=say["notr"] / n, olumsuz=say["olumsuz"] / n,
                          konular={k: round(v / n, 4) for k, v in sorted(konu.items(), key=lambda x: -x[1])}, ort_etkilesim=etk / n)


class XKamu:
    def __init__(self, butce: Butce, kuru: bool = False, tohum: int = 7, bugun: date | None = None):
        self.butce, self.kuru, self.tohum = butce, kuru, tohum
        self.bugun = bugun or date.today()

    def _token(self) -> str:
        return ortam("X_BEARER_TOKEN")

    def sayim(self, sorgu: str, gun: int = 7) -> list[tuple[str, int]]:
        """Son `gun` günün günlük gönderi sayısı (recent: en fazla 7 gün). Döner [(YYYY-MM-DD, sayı)]."""
        if self.kuru:
            return self._kuru_sayim(sorgu, gun)
        self.butce.harca("sayim")
        tok = self._token()
        bas = datetime.combine(self.bugun - timedelta(days=min(gun, 7) - 1), datetime.min.time(), timezone.utc)
        y = http_json(f"{API}/tweets/counts/recent", params={"query": sorgu, "granularity": "day", "start_time": bas.strftime("%Y-%m-%dT%H:%M:%SZ")},
                      basliklar={"Authorization": f"Bearer {tok}"}, sirlar=[tok])
        return [(d["start"][:10], int(d.get("tweet_count", 0))) for d in y.get("data", [])]

    def orneklem(self, sorgu: str, n: int = 100) -> DuyguOrneklemi | None:
        """Son gönderilerden en fazla n tanesi; yazar alanı istenmez (expansions yok)."""
        if self.kuru:
            return ozetle(self._kuru_gonderiler(sorgu, n), self.bugun.isoformat())
        tok = self._token()
        toplanan: list[dict] = []
        sonraki = None
        while len(toplanan) < n:
            adet = min(AZAMI_SONUC, max(10, n - len(toplanan)))
            self.butce.harca("okuma", adet)  # en kötü durum: istenen sayı kadar okuma faturalanır
            params = {"query": sorgu, "max_results": adet, "tweet.fields": "created_at,public_metrics,lang"}
            if sonraki:
                params["next_token"] = sonraki
            y = http_json(f"{API}/tweets/search/recent", params=params, basliklar={"Authorization": f"Bearer {tok}"}, sirlar=[tok])
            veri = y.get("data", [])
            toplanan.extend({"text": g.get("text", ""), "public_metrics": g.get("public_metrics")} for g in veri)
            sonraki = (y.get("meta") or {}).get("next_token")
            if not veri or not sonraki:
                break
        return ozetle(toplanan[:n], self.bugun.isoformat())

    # ── kuru mod ──
    def _kuru_sayim(self, sorgu: str, gun: int) -> list[tuple[str, int]]:
        rnd = random.Random(f"{self.tohum}:{sorgu}")
        taban = rnd.randint(40, 900)
        egim = rnd.uniform(-0.015, 0.03)
        cikti = []
        for i in range(gun):
            g = self.bugun - timedelta(days=gun - 1 - i)
            hafta_sonu = 1.25 if g.weekday() >= 5 else 1.0
            cikti.append((g.isoformat(), max(0, int(taban * (1 + egim) ** i * hafta_sonu * rnd.uniform(0.8, 1.2)))))
        return cikti

    def _kuru_gonderiler(self, sorgu: str, n: int) -> list[dict]:
        rnd = random.Random(f"{self.tohum}:g:{sorgu}")
        olumlu = ["harika ürün, çok memnunum", "kargo hızlı geldi teşekkürler", "fiyat uygun, tavsiye ederim", "kalite süper"]
        olumsuz = ["kargo geç geldi, rezalet", "fiyat çok pahalı", "ürün bozuk çıktı, iade ettim", "müşteri hizmetleri yavaş, sorun çözülmedi"]
        notr = ["bugün mağazaya uğradım", "kampanya ne zaman bitiyor", "yeni sezon gelmiş", "bu hafta indirim var mı"]
        egilim = rnd.uniform(-0.15, 0.15)
        cikti = []
        for _ in range(n):
            r = rnd.random()
            havuz = olumlu if r < 0.35 + egilim else olumsuz if r < 0.6 + egilim / 2 else notr
            cikti.append({"text": rnd.choice(havuz), "public_metrics": {"like_count": rnd.randint(0, 40), "reply_count": rnd.randint(0, 5)}})
        return cikti


__all__ = ["XKamu", "Butce", "ButceAsildi", "DuyguOrneklemi", "ozetle", "BIRIM_USD", "BaglayiciHatasi"]
