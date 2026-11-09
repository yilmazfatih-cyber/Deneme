"""Meta (Facebook + Instagram) bağlayıcısı: Graph / Marketing API v21+. Yalnız toplu metrik; yorum metni bellekte sayılıp atılır.

Ortam: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (act_ öneksiz veya önekli), META_PAGE_ID, META_IG_USER_ID.
Bu oturumda ağ yoktu; canlı çağrılar "doğrulanmalı" notlarıyla işaretli.
"""
from __future__ import annotations

import json
from datetime import datetime

from .baglayici import Baglayici, BaglayiciHatasi, http_json, ortam
from .ortak import DuyguOzeti, HesapKaydi, IcerikKaydi, KonuHacmi, MetrikKaydi, cinsiyet, duygu_ozetle, yas_bandi, yaratici_turu

GRAPH_SURUM = "v21.0"
GRAPH = f"https://graph.facebook.com/{GRAPH_SURUM}"
UC_HESAP_INSIGHTS = "/act_{hesap}/insights"
UC_HESAP_ADS = "/act_{hesap}/ads"
UC_SAYFA_POSTS = "/{sayfa}/posts"
UC_IG_MEDIA = "/{ig}/media"
UC_NESNE_INSIGHTS = "/{nesne}/insights"
UC_YORUMLAR = "/{nesne}/comments"
UC_IG_HASHTAG_ARA = "/ig_hashtag_search"
UC_IG_HASHTAG_SON = "/{hashtag}/recent_media"
REKLAM_ALANLARI = ["ad_id", "ad_name", "date_start", "impressions", "reach", "clicks", "inline_link_clicks", "actions", "spend",
                   "video_play_actions", "video_p100_watched_actions"]
# doğrulanmalı: 3 sn izlenme v21'de `actions[action_type=video_view]` olarak gelir; ayrı `video_3_sec_watched_actions` alanı
# eski sürümlerde vardı. İkisi de denenir.
DONUSUM_EYLEMLERI = ("purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase")  # doğrulanmalı: kiracının piksel olayı
SAYFA_POST_METRIK = "post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total"  # doğrulanmalı (v21 adları)
IG_MEDIA_METRIK = "reach,likes,comments,shares,saved,views"  # doğrulanmalı: IG 'impressions' v22'de kaldırıldı, 'views' geldi


def _eylem(actions: list | None, turler: tuple[str, ...]) -> int | None:
    if not actions:
        return None
    t = sum(float(a.get("value", 0)) for a in actions if a.get("action_type") in turler)
    return int(t)


class MetaBaglayici(Baglayici):
    platform_adi = "meta"

    def __init__(self, kuru: bool = False, tohum: int = 7, kiraci: str = "demo"):
        super().__init__(kuru, tohum, kiraci)
        self._tur: dict[str, tuple[str, str]] = {}  # icerik_id → (nesne türü, platform kimliği)
        if not kuru:
            self.token = ortam("META_ACCESS_TOKEN")
            self.hesap = ortam("META_AD_ACCOUNT_ID", False).removeprefix("act_")
            self.sayfa = ortam("META_PAGE_ID", False)
            self.ig = ortam("META_IG_USER_ID", False)

    def kuru_platformlari(self):
        return ("facebook", "instagram")

    # ── HTTP ──
    def _get(self, yol: str, params: dict | None = None) -> dict:
        p = dict(params or {})
        p["access_token"] = self.token
        return http_json(GRAPH + yol, params=p, sirlar=[self.token])

    def _sayfalar(self, yol: str, params: dict, sinir: int = 200):
        """`paging.next` imlecini izler (token içerdiği için tam URL yerine `after` imleci kullanılır)."""
        p = dict(params)
        for _ in range(sinir):
            d = self._get(yol, p)
            yield from d.get("data", [])
            sonraki = (d.get("paging") or {}).get("cursors", {}).get("after")
            if not sonraki or not (d.get("paging") or {}).get("next"):
                return
            p["after"] = sonraki

    # ── Arayüz ──
    def hesaplar(self) -> list[HesapKaydi]:
        if self.kuru:
            return self.uretici.hesaplar()
        out = []
        if self.hesap:
            d = self._get(f"/act_{self.hesap}", {"fields": "name"})
            out.append(HesapKaydi("facebook", f"act_{self.hesap}", d.get("name"), "reklam_hesabi"))
        if self.sayfa:
            d = self._get(f"/{self.sayfa}", {"fields": "name"})
            out.append(HesapKaydi("facebook", self.sayfa, d.get("name"), "sayfa"))
        if self.ig:
            d = self._get(f"/{self.ig}", {"fields": "username"})
            out.append(HesapKaydi("instagram", self.ig, d.get("username"), "profil"))
        if not out:
            raise BaglayiciHatasi("META_AD_ACCOUNT_ID, META_PAGE_ID veya META_IG_USER_ID'den en az biri gerekli.")
        return out

    def icerikler(self, baslangic: str, bitis: str) -> list[IcerikKaydi]:
        if self.kuru:
            return self.uretici.icerikler(baslangic, bitis)
        out: list[IcerikKaydi] = []
        if self.hesap:
            # doğrulanmalı: reklamlar Facebook ve Instagram'da birlikte yayınlanabilir; yaş×cinsiyet kırılımı publisher_platform ile
            # birleştirilemediği için reklam içerikleri 'facebook' platformuna yazılır (NOTLAR).
            for a in self._sayfalar(UC_HESAP_ADS.format(hesap=self.hesap), {
                    "fields": "id,name,campaign_id,created_time,creative{title,body,object_type,video_id}", "limit": 100}):
                cr = a.get("creative") or {}
                metin = " ".join(x for x in (cr.get("title"), cr.get("body"), a.get("name")) if x)
                bicim = "video" if cr.get("video_id") or cr.get("object_type") == "VIDEO" else "gorsel"
                iid = f"facebook:{a['id']}"
                self._tur[iid] = ("reklam", a["id"])
                out.append(IcerikKaydi(iid, "facebook", f"act_{self.hesap}", "reklam", bicim, yaratici_turu(metin), a.get("created_time"),
                                       None, metin, dis_kampanya_id=a.get("campaign_id")))
        zaman = {"since": baslangic, "until": bitis}
        if self.sayfa:
            for g in self._sayfalar(UC_SAYFA_POSTS.format(sayfa=self.sayfa), {"fields": "id,message,created_time,status_type", "limit": 100, **zaman}):
                iid = f"facebook:{g['id']}"
                self._tur[iid] = ("fb_post", g["id"])
                bicim = "video" if "video" in (g.get("status_type") or "") else "gorsel"
                out.append(IcerikKaydi(iid, "facebook", self.sayfa, "organik", bicim, yaratici_turu(g.get("message")), g.get("created_time"),
                                       None, g.get("message")))
        if self.ig:
            for m in self._sayfalar(UC_IG_MEDIA.format(ig=self.ig), {"fields": "id,caption,media_type,media_product_type,timestamp", "limit": 100, **zaman}):
                iid = f"instagram:{m['id']}"
                self._tur[iid] = ("ig_media", m["id"])
                mt, mpt = (m.get("media_type") or "").upper(), (m.get("media_product_type") or "").upper()
                bicim = "reels" if mpt == "REELS" else "story" if mpt == "STORY" else "carousel" if mt == "CAROUSEL_ALBUM" else "video" if mt == "VIDEO" else "gorsel"
                out.append(IcerikKaydi(iid, "instagram", self.ig, "organik", bicim, yaratici_turu(m.get("caption")), m.get("timestamp"),
                                       None, m.get("caption")))
        return out

    def metrikler(self, icerik_id, baslangic, bitis, kirilim=("age", "gender")) -> list[MetrikKaydi]:
        if self.kuru:
            return self.uretici.metrikler(icerik_id, baslangic, bitis)
        tur, nesne = self._tur.get(icerik_id, ("reklam", icerik_id.split(":", 1)[1]))
        if tur == "reklam":
            params = {"level": "ad", "fields": ",".join(REKLAM_ALANLARI), "breakdowns": ",".join(kirilim), "time_increment": 1,
                      "time_range": json.dumps({"since": baslangic, "until": bitis}),
                      "filtering": json.dumps([{"field": "ad.id", "operator": "IN", "value": [nesne]}]), "limit": 500}
            out = []
            for r in self._sayfalar(UC_HESAP_INSIGHTS.format(hesap=self.hesap), params):
                y = yas_bandi(r.get("age")) if "age" in kirilim else "hepsi"
                if y is None:
                    continue  # 13-17 veya bilinmeyen yaş
                g = cinsiyet(r.get("gender")) if "gender" in kirilim else "hepsi"
                eylem = r.get("actions")
                v3 = _eylem(eylem, ("video_view",)) or _eylem(r.get("video_3_sec_watched_actions"), ("video_view",))
                out.append(MetrikKaydi(icerik_id, r["date_start"], y, g, "hepsi", int(r.get("impressions", 0)), int(r.get("reach", 0) or 0) or None,
                                       int(r.get("inline_link_clicks") or r.get("clicks") or 0),
                                       _eylem(eylem, ("post_engagement",)), _eylem(r.get("video_play_actions"), ("video_view",)), v3,
                                       _eylem(r.get("video_p100_watched_actions"), ("video_view",)), _eylem(eylem, DONUSUM_EYLEMLERI),
                                       float(r.get("spend") or 0) or None))  # doğrulanmalı: spend hesabın para biriminde; TRY varsayıldı
            return out
        # Organik: platform yaş×cinsiyet kırılımı vermez → 'hepsi' satırı; ömür boyu değer bitiş tarihine yazılır.
        metrik = SAYFA_POST_METRIK if tur == "fb_post" else IG_MEDIA_METRIK
        d = self._get(UC_NESNE_INSIGHTS.format(nesne=nesne), {"metric": metrik, "period": "lifetime"})
        v = {x["name"]: (x.get("values") or [{}])[0].get("value", x.get("total_value", {}).get("value")) for x in d.get("data", [])}
        tepki = v.get("post_reactions_by_type_total")
        tepki = sum(tepki.values()) if isinstance(tepki, dict) else None
        etk = sum(int(v.get(k) or 0) for k in ("likes", "comments", "shares", "saved")) if tur == "ig_media" else tepki
        gosterim = int(v.get("post_impressions") or v.get("views") or v.get("reach") or 0)
        return [MetrikKaydi(icerik_id, bitis, "hepsi", "hepsi", "hepsi", gosterim, int(v.get("post_impressions_unique") or v.get("reach") or 0) or None,
                            int(v.get("post_clicks") or 0), etk)]

    def yorum_ozeti(self, icerik_id) -> list[DuyguOzeti]:
        """Yorumlar yalnız `message/text` ve zaman alanıyla çekilir (yazar alanı istenmez), günlük duygu sayımına indirgenir."""
        if self.kuru:
            return self.uretici.yorum_ozeti(icerik_id)
        tur, nesne = self._tur.get(icerik_id, ("reklam", icerik_id.split(":", 1)[1]))
        if tur == "reklam":
            return []  # doğrulanmalı: reklam yorumları effective_object_story_id üzerinden; bu sürümde çekilmez
        alan = "text,timestamp" if tur == "ig_media" else "message,created_time"
        gunluk: dict[str, list[str]] = {}
        for y in self._sayfalar(UC_YORUMLAR.format(nesne=nesne), {"fields": alan, "limit": 100}):
            t = (y.get("timestamp") or y.get("created_time") or datetime.now().isoformat())[:10]
            gunluk.setdefault(t, []).append(y.get("text") or y.get("message") or "")
        out = [d for t, m in sorted(gunluk.items()) if (d := duygu_ozetle(icerik_id, t, m))]
        gunluk.clear()  # metinler bellekten atılır
        return out

    def konu_hacmi(self, konu, baslangic, bitis) -> list[KonuHacmi]:
        """Instagram hashtag: yalnız son 24 saatteki gönderi sayısı (sayfa başı ≤50). Geçmiş seri yok; her çekim bir gün ekler."""
        if self.kuru:
            return self.uretici.konu_hacmi("instagram", konu, baslangic, bitis)
        if not self.ig:
            return []
        etiket = "".join(ch for ch in konu.lower() if ch.isalnum())
        ara = self._get(UC_IG_HASHTAG_ARA, {"user_id": self.ig, "q": etiket}).get("data") or []
        if not ara:
            return []
        n = sum(1 for _ in self._sayfalar(UC_IG_HASHTAG_SON.format(hashtag=ara[0]["id"]), {"user_id": self.ig, "fields": "id,timestamp", "limit": 50}, sinir=20))
        # doğrulanmalı: recent_media 24 saat penceresi ve 7 günde 30 benzersiz hashtag sınırı
        return [KonuHacmi("instagram", konu, datetime.now().date().isoformat(), n, "api")]
