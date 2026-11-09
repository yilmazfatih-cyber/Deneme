"""X bağlayıcısı: X Ads API (v12, reklam istatistikleri, AGE / GENDER segmentasyonu) ve X API v2 `tweets/counts/recent` (konu hacmi).

Ortam: X_BEARER_TOKEN, X_ADS_ACCOUNT_ID. Canlı çağrılar "doğrulanmalı":
X Ads API kullanıcı bağlamında OAuth 1.0a ister; burada Bearer gönderilir (NOTLAR: imzalama eklenmeli).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from .baglayici import Baglayici, http_json, ortam
from .ortak import DuyguOzeti, HesapKaydi, IcerikKaydi, KonuHacmi, MetrikKaydi, cinsiyet, yas_bandi, yaratici_turu

X_ADS = "https://ads-api.x.com/12"  # doğrulanmalı: ads-api.twitter.com eşdeğeri
X_API = "https://api.x.com/2"
UC_HESAP = "/accounts/{hesap}"
UC_TANITILAN = "/accounts/{hesap}/promoted_tweets"
UC_TWEETLER = "/accounts/{hesap}/tweets"
UC_ISTATISTIK = "/stats/accounts/{hesap}"
UC_SAYIM = "/tweets/counts/recent"  # son 7 gün; daha eskisi /tweets/counts/all (Pro/Enterprise) — doğrulanmalı
METRIK_GRUPLARI = "ENGAGEMENT,VIDEO,BILLING,WEB_CONVERSION"
# doğrulanmalı: senkron /stats uç noktası segmentation_type'ı desteklemeyebilir; destek yoksa async /stats/jobs/accounts/{id}.
# AGE ve GENDER ayrı ayrı istenir (çapraz kırılım yok): yaş satırları cinsiyet='hepsi', cinsiyet satırları yaş='hepsi'.


class XBaglayici(Baglayici):
    platform_adi = "x"

    def __init__(self, kuru: bool = False, tohum: int = 7, kiraci: str = "demo"):
        super().__init__(kuru, tohum, kiraci)
        if not kuru:
            self.token = ortam("X_BEARER_TOKEN")
            self.hesap = ortam("X_ADS_ACCOUNT_ID", False)

    def _get(self, taban: str, yol: str, params: dict | None = None) -> dict:
        return http_json(taban + yol, params=params, basliklar={"Authorization": f"Bearer {self.token}"}, sirlar=[self.token])

    def _imlecli(self, yol: str, params: dict, sinir: int = 100):
        p = dict(params)
        for _ in range(sinir):
            d = self._get(X_ADS, yol, p)
            yield from d.get("data", [])
            if not d.get("next_cursor"):
                return
            p["cursor"] = d["next_cursor"]

    def hesaplar(self) -> list[HesapKaydi]:
        if self.kuru:
            return self.uretici.hesaplar()
        d = self._get(X_ADS, UC_HESAP.format(hesap=self.hesap)).get("data") or {}
        return [HesapKaydi("x", self.hesap, d.get("name"), "reklam_hesabi")]

    def icerikler(self, baslangic, bitis) -> list[IcerikKaydi]:
        if self.kuru:
            return self.uretici.icerikler(baslangic, bitis)
        tanitilan = list(self._imlecli(UC_TANITILAN.format(hesap=self.hesap), {"count": 1000}))
        metin: dict[str, str] = {}
        tweet_ids = [t["tweet_id"] for t in tanitilan if t.get("tweet_id")]
        for i in range(0, len(tweet_ids), 200):  # doğrulanmalı: tweet_type ve toplu kimlik sınırı
            for tw in self._imlecli(UC_TWEETLER.format(hesap=self.hesap), {"tweet_ids": ",".join(tweet_ids[i:i + 200]), "tweet_type": "PUBLISHED"}):
                metin[str(tw.get("id_str") or tw.get("tweet_id"))] = tw.get("full_text") or tw.get("text") or ""
        out = []
        for t in tanitilan:
            m = metin.get(str(t.get("tweet_id")), "")
            out.append(IcerikKaydi(f"x:{t['id']}", "x", self.hesap, "reklam", None, yaratici_turu(m), t.get("created_at"), None, m,
                                   dis_kampanya_id=t.get("line_item_id")))
        return out

    def metrikler(self, icerik_id, baslangic, bitis, kirilim=("age", "gender")) -> list[MetrikKaydi]:
        if self.kuru:
            return self.uretici.metrikler(icerik_id, baslangic, bitis)
        pid = icerik_id.split(":", 1)[1]
        out = []
        for seg in [s for s in ("AGE", "GENDER") if s.lower() in kirilim] or [None]:
            p = {"entity": "PROMOTED_TWEET", "entity_ids": pid, "start_time": f"{baslangic}T00:00:00Z",
                 "end_time": f"{(datetime.fromisoformat(bitis) + timedelta(days=1)).date()}T00:00:00Z", "granularity": "DAY",
                 "metric_groups": METRIK_GRUPLARI, "placement": "ALL_ON_TWITTER"}
            if seg:
                p["segmentation_type"] = seg
            for varlik in self._get(X_ADS, UC_ISTATISTIK.format(hesap=self.hesap), p).get("data", []):
                for kesit in varlik.get("id_data", []):
                    s = kesit.get("segment") or {}
                    ad = s.get("segment_name") or s.get("segment_value") or ""
                    y = yas_bandi(ad) if seg == "AGE" else "hepsi"
                    if y is None:
                        continue
                    g = cinsiyet(ad) if seg == "GENDER" else "hepsi"
                    mt = kesit.get("metrics", {})
                    seri = lambda k: mt.get(k) or []  # noqa: E731
                    gun = max(len(seri("impressions")), 1)
                    for i in range(gun):
                        tarih = (datetime.fromisoformat(baslangic) + timedelta(days=i)).date().isoformat()
                        al = lambda k: int((seri(k)[i] if i < len(seri(k)) else 0) or 0)  # noqa: E731
                        out.append(MetrikKaydi(icerik_id, tarih, y, g, "hepsi", al("impressions"), None, al("url_clicks") or al("clicks"),
                                               al("engagements") or None, al("video_total_views") or None,
                                               al("video_3s100pct_views") or None,  # doğrulanmalı: 3 sn %100 görünür izlenme alan adı
                                               al("video_views_100") or None, al("conversion_purchases") or None,
                                               (al("billed_charge_local_micro") / 1e6) or None))  # yerel para birimi mikro
        return out

    def yorum_ozeti(self, icerik_id) -> list[DuyguOzeti]:
        """X yanıtları (conversation_id araması) kamu içeriğidir; bu sürümde çekilmez (08 felsefi soru 1)."""
        if self.kuru:
            return self.uretici.yorum_ozeti(icerik_id)
        return []

    def konu_hacmi(self, konu, baslangic, bitis) -> list[KonuHacmi]:
        if self.kuru:
            return self.uretici.konu_hacmi("x", konu, baslangic, bitis)
        d = self._get(X_API, UC_SAYIM, {"query": f'"{konu}" lang:tr -is:retweet', "granularity": "day"})
        return [KonuHacmi("x", konu, s["start"][:10], int(s.get("tweet_count", 0)), "api") for s in d.get("data", [])]
