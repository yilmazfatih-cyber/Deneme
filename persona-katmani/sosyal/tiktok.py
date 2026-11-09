"""TikTok for Business (Marketing API v1.3) bağlayıcısı. Yalnız reklam hesabı toplu raporları.

Ortam: TIKTOK_ACCESS_TOKEN (başlık `Access-Token`), TIKTOK_ADVERTISER_ID. Canlı çağrılar "doğrulanmalı".
"""
from __future__ import annotations

import json

from .baglayici import Baglayici, BaglayiciHatasi, http_json, ortam
from .ortak import DuyguOzeti, HesapKaydi, IcerikKaydi, KonuHacmi, MetrikKaydi, cinsiyet, duygu_ozetle, yas_bandi, yaratici_turu

TIKTOK = "https://business-api.tiktok.com/open_api/v1.3"
UC_REKLAMVEREN = "/advertiser/info/"
UC_REKLAMLAR = "/ad/get/"
UC_RAPOR = "/report/integrated/get/"
UC_YORUMLAR = "/comment/list/"  # doğrulanmalı: yorum yönetimi izni (Comment Management) ayrı onay ister
RAPOR_METRIKLERI = ["impressions", "reach", "clicks", "spend", "video_play_actions", "video_watched_2s", "video_watched_6s",
                    "video_views_p100", "engagements", "conversion"]
# doğrulanmalı: AUDIENCE raporunda 'stat_time_day' + 'age' + 'gender' aynı anda desteklenir mi; desteklenmezse günlük ayrı çağrı.
# 'conversion' ve 'engagements' alan adları hesap türüne göre değişebilir.
SAYFA_BOYU = 1000


class TikTokBaglayici(Baglayici):
    platform_adi = "tiktok"

    def __init__(self, kuru: bool = False, tohum: int = 7, kiraci: str = "demo"):
        super().__init__(kuru, tohum, kiraci)
        if not kuru:
            self.token = ortam("TIKTOK_ACCESS_TOKEN")
            self.reklamveren = ortam("TIKTOK_ADVERTISER_ID")

    def _get(self, yol: str, params: dict) -> dict:
        p = {k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in params.items()}
        d = http_json(TIKTOK + yol, params=p, basliklar={"Access-Token": self.token}, sirlar=[self.token])
        if d.get("code", 0) != 0:  # TikTok hata kodunu 200 gövdesinde döndürür
            raise BaglayiciHatasi(f"TikTok {yol}: kod {d.get('code')} {str(d.get('message'))[:200]}")
        return d.get("data") or {}

    def _sayfalar(self, yol: str, params: dict):
        sayfa = 1
        while True:
            d = self._get(yol, {**params, "page": sayfa, "page_size": params.get("page_size", SAYFA_BOYU)})
            yield from d.get("list", [])
            bilgi = d.get("page_info") or {}
            if sayfa >= int(bilgi.get("total_page") or 1):
                return
            sayfa += 1

    def hesaplar(self) -> list[HesapKaydi]:
        if self.kuru:
            return self.uretici.hesaplar()
        d = self._get(UC_REKLAMVEREN, {"advertiser_ids": [self.reklamveren], "fields": ["name"]})
        ad = ((d.get("list") or [{}])[0]).get("name")
        return [HesapKaydi("tiktok", self.reklamveren, ad, "reklam_hesabi")]

    def icerikler(self, baslangic, bitis) -> list[IcerikKaydi]:
        if self.kuru:
            return self.uretici.icerikler(baslangic, bitis)
        out = []
        for a in self._sayfalar(UC_REKLAMLAR, {"advertiser_id": self.reklamveren, "page_size": 100,
                                               "fields": ["ad_id", "ad_name", "ad_text", "create_time", "campaign_id", "video_id", "image_ids"]}):
            metin = " ".join(x for x in (a.get("ad_text"), a.get("ad_name")) if x)
            out.append(IcerikKaydi(f"tiktok:{a['ad_id']}", "tiktok", self.reklamveren, "reklam", "video" if a.get("video_id") else "gorsel",
                                   yaratici_turu(metin), a.get("create_time"), None, metin, dis_kampanya_id=a.get("campaign_id")))
        return out

    def metrikler(self, icerik_id, baslangic, bitis, kirilim=("age", "gender")) -> list[MetrikKaydi]:
        if self.kuru:
            return self.uretici.metrikler(icerik_id, baslangic, bitis)
        ad_id = icerik_id.split(":", 1)[1]
        boyut = ["ad_id", "stat_time_day", *kirilim]
        out = []
        for r in self._sayfalar(UC_RAPOR, {"advertiser_id": self.reklamveren, "report_type": "AUDIENCE", "data_level": "AUCTION_AD",
                                           "dimensions": boyut, "metrics": RAPOR_METRIKLERI, "start_date": baslangic, "end_date": bitis,
                                           "filtering": [{"field_name": "ad_ids", "filter_type": "IN", "filter_value": json.dumps([ad_id])}]}):
            b, m = r.get("dimensions", {}), r.get("metrics", {})
            y = yas_bandi(b.get("age")) if "age" in kirilim else "hepsi"  # AGE_13_17 → atlanır, AGE_55_100 → 55+
            if y is None:
                continue
            g = cinsiyet(b.get("gender")) if "gender" in kirilim else "hepsi"
            sayi = lambda k: int(float(m.get(k) or 0))  # noqa: E731
            out.append(MetrikKaydi(icerik_id, (b.get("stat_time_day") or bitis)[:10], y, g, "hepsi", sayi("impressions"), sayi("reach") or None,
                                   sayi("clicks"), sayi("engagements") or None, sayi("video_play_actions") or None,
                                   # TikTok 3 sn metriği vermez: 2 sn izlenme dikkat vekili olarak video_3sn'e yazılır (NOTLAR)
                                   sayi("video_watched_2s") or None, sayi("video_views_p100") or None, sayi("conversion") or None,
                                   float(m.get("spend") or 0) or None))
        return out

    def yorum_ozeti(self, icerik_id) -> list[DuyguOzeti]:
        if self.kuru:
            return self.uretici.yorum_ozeti(icerik_id)
        gunluk: dict[str, list[str]] = {}
        for y in self._sayfalar(UC_YORUMLAR, {"advertiser_id": self.reklamveren, "search_field": "ADID",
                                              "search_value": icerik_id.split(":", 1)[1], "page_size": 100}):
            gunluk.setdefault(str(y.get("create_time") or "")[:10], []).append(y.get("content") or "")  # yalnız metin ve zaman okunur
        out = [d for t, m in sorted(gunluk.items()) if t and (d := duygu_ozetle(icerik_id, t, m))]
        gunluk.clear()
        return out

    def konu_hacmi(self, konu, baslangic, bitis) -> list[KonuHacmi]:
        """TikTok Marketing API'de konu/hashtag hacmi yok (Research API akademik). Boş döner; kuru modda da üretilmez."""
        return []
