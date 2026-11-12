"""Hotjar REST istemcisi (https://api.hotjar.io, v1): anket listesi ve anket yanıtları.

Belgelere göre (2026-11, docs/API-NOTLARI.md):
- Kimlik: OAuth client credentials (POST /v1/oauth/token, form gövdesi) → Bearer jeton (expires_in saniye).
- Uç noktalar: /v1/sites/{site}/surveys (limit ≤ 100, cursor, with_questions), .../surveys/{id}/responses
  (en yeni önce, tarih filtresi yok). Sayfalama: results + next_cursor (son sayfada null).
- Responses API yalnız Ask Scale planında. Kayıt, ısı haritası, geri bildirim widget'ı API'de yok → CSV.
- Hotjar hesapları 2026'dan itibaren Contentsquare'e taşınıyor; taşınan hesapta API erişimi belgelenmemiş.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.parse
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

from .ayarlar import Ayarlar
from .istemci import ApiHatasi, GercekTasima, HttpHatasi, temizle, url_kur

ATLANAN_SORU_TURLERI = ("statement", "thank-you")
META_SUTUNLARI = [
    "Yanıt ID",
    "Tarih",
    "Tamamlandı",
    "Cihaz",
    "Tarayıcı",
    "OS",
    "Ülke",
    "Sayfa URL",
    "Kayıt URL",
    "Hotjar kullanıcı ID",
    "Etiketler",
]


class Hotjar:
    def __init__(self, ayar: Ayarlar, tasima=None):
        self.ayar = ayar
        self.taban = (os.environ.get("HOTJAR_API_BASE") or "https://api.hotjar.io").rstrip("/")
        if tasima is None:
            if ayar.demo:
                from .demo import DemoTasima

                tasima = DemoTasima()
            else:
                tasima = GercekTasima()
        self.tasima = tasima
        self.site = ayar["hotjar"].get("site_id") or ayar.gizli("HOTJAR_SITE_ID")
        self._jeton: Optional[str] = None
        self._bitis = 0.0

    # -- kimlik --

    def _jeton_al(self, yenile: bool = False) -> str:
        if self._jeton and not yenile and time.time() < self._bitis:
            return self._jeton
        istemci, sir = self.ayar.gizli("HOTJAR_CLIENT_ID"), self.ayar.gizli("HOTJAR_CLIENT_SECRET")
        if self.ayar.demo:
            istemci, sir = istemci or "demo", sir or "demo"
        if not (istemci and sir):
            raise ApiHatasi(
                "Hotjar API anahtarı yok (yerel/.env: HOTJAR_CLIENT_ID / HOTJAR_CLIENT_SECRET). API'niz yoksa anketi "
                "Hotjar'dan CSV olarak indirip yerel/girdi/ altına koyun: python3 kit/hj.py ozet <dosya>"
            )
        govde = urllib.parse.urlencode(
            {"grant_type": "client_credentials", "client_id": istemci, "client_secret": sir}
        ).encode()
        try:
            yanit = self.tasima.json_iste(
                "POST", self.taban + "/v1/oauth/token", {"Content-Type": "application/x-www-form-urlencoded"}, govde
            )
        except HttpHatasi as hata:
            raise self._hata(hata) from None
        self._jeton = (yanit or {}).get("access_token")
        if not self._jeton:
            raise ApiHatasi("Hotjar jeton yanıtında access_token yok.")
        self._bitis = time.time() + int((yanit or {}).get("expires_in") or 3600) - 60
        return self._jeton

    def _hata(self, hata: HttpHatasi) -> ApiHatasi:
        ayrinti = temizle(hata.govde, 200)
        try:
            govde = json.loads(hata.govde)
            if isinstance(govde, dict):
                ayrinti = temizle(govde.get("msg") or govde.get("message") or govde.get("error") or ayrinti, 200)
        except (ValueError, TypeError):
            pass
        if hata.kod == 401:
            return ApiHatasi(
                "Hotjar kimlik doğrulaması başarısız (401): client ID/secret'ı kontrol edin (anahtarlar 1 yıl geçerli)."
            )
        if hata.kod == 403:
            return ApiHatasi(
                "Hotjar erişimi reddedildi (403): anahtarın yetkisi yok ya da plan Responses API içermiyor (yalnız Ask "
                "Scale); Contentsquare'e taşınan hesaplarda da kapanmış olabilir. Çözüm: anketi CSV olarak indirin "
                f"(Surveys → yanıtlar → Download) ve `hj.py ozet` kullanın. {ayrinti}"
            )
        if hata.kod == 404:
            return ApiHatasi(
                "Hotjar kaynağı bulunamadı (404): site ID (Surveys sayfasının adresinde) ve anket ID'sini "
                "kontrol edin. "
                f"{ayrinti}"
            )
        if hata.kod == 429:
            return ApiHatasi("Hotjar istek limiti aşıldı (429; dakikada 3000). Biraz bekleyip tekrar deneyin.")
        return ApiHatasi(f"Hotjar HTTP {hata.kod}: {ayrinti}")

    def _iste(self, yol: str, params: Optional[Dict[str, Any]] = None) -> Any:
        if not self.site:
            raise ApiHatasi(
                "Hotjar site ID yok: yerel/ayarlar.json → hotjar.site_id (Surveys sayfasının adresinde yazar)."
            )
        url = url_kur(self.taban + yol, params)
        for deneme in range(2):
            basliklar = {"Authorization": f"Bearer {self._jeton_al(yenile=deneme > 0)}"}
            try:
                return self.tasima.json_iste("GET", url, basliklar)
            except HttpHatasi as hata:
                if hata.kod in (401, 403) and deneme == 0:
                    continue
                raise self._hata(hata) from None
        raise ApiHatasi("Hotjar isteği tamamlanamadı.")

    # -- uç noktalar --

    def anketler(self) -> List[Dict]:
        sonuc: List[Dict] = []
        imlec = None
        while True:
            yanit = self._iste(
                f"/v1/sites/{self.site}/surveys", {"limit": 100, "cursor": imlec, "with_questions": True}
            )
            sonuc.extend((yanit or {}).get("results") or [])
            imlec = (yanit or {}).get("next_cursor")
            if not imlec:
                return sonuc

    def anket(self, anket_id: str) -> Dict:
        return self._iste(f"/v1/sites/{self.site}/surveys/{anket_id}") or {}

    def yanitlar(self, anket_id: str, bas: Optional[dt.date] = None, azami: int = 200_000) -> Iterator[Dict]:
        """Tüm yanıtlar (en yeni önce). API tarih filtresi sunmaz; `bas`tan eskiye inince durur."""
        imlec = None
        sayi = 0
        while True:
            yanit = self._iste(f"/v1/sites/{self.site}/surveys/{anket_id}/responses", {"limit": 100, "cursor": imlec})
            for y in (yanit or {}).get("results") or []:
                if bas and _tarih(y.get("created_time")) and _tarih(y.get("created_time")) < bas:
                    return
                sayi += 1
                if sayi > azami:
                    return
                yield y
            imlec = (yanit or {}).get("next_cursor")
            if not imlec:
                return


def _tarih(metin: Optional[str]) -> Optional[dt.date]:
    if not metin:
        return None
    try:
        return dt.datetime.fromisoformat(str(metin).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return dt.date.fromisoformat(str(metin)[:10])
        except ValueError:
            return None


def duzlestir(anket: Dict, yanitlar: Sequence[Dict]) -> Tuple[List[str], List[List[str]]]:
    """Yanıtları tek satır = tek yanıt tablosuna çevirir; çoklu seçim ' | ' ile birleşir, yorumlar ayrı sütunda."""
    sorular = [s for s in anket.get("questions") or [] if s.get("type") not in ATLANAN_SORU_TURLERI]
    yorumlu = {a["question_id"] for y in yanitlar for a in y.get("answers") or [] if a.get("comment")}
    nitelikler = sorted({str(n.get("name")) for y in yanitlar for n in y.get("user_attributes") or [] if n.get("name")})
    soru_sutunlari: List[Tuple[str, str, bool]] = []
    kullanilan = set(META_SUTUNLARI)
    for s in sorular:
        baslik = (s.get("text") or s.get("id") or "soru").strip()
        if baslik in kullanilan:
            baslik = f"{baslik} [{s.get('id')}]"
        kullanilan.add(baslik)
        soru_sutunlari.append((s.get("id"), baslik, False))
        if s.get("id") in yorumlu:
            soru_sutunlari.append((s.get("id"), f"{baslik} (yorum)", True))
    basliklar = META_SUTUNLARI + [f"nitelik:{n}" for n in nitelikler] + [b for _, b, _ in soru_sutunlari]
    satirlar = []
    for y in yanitlar:
        cevaplar: Dict[str, List[str]] = {}
        yorumlar: Dict[str, List[str]] = {}
        for a in y.get("answers") or []:
            if a.get("answer") not in (None, ""):
                cevaplar.setdefault(a.get("question_id"), []).append(str(a["answer"]))
            if a.get("comment"):
                yorumlar.setdefault(a.get("question_id"), []).append(str(a["comment"]))
        nitelik = {str(n.get("name")): n.get("value") for n in y.get("user_attributes") or []}
        satir = [
            str(y.get("id") or ""),
            str(y.get("created_time") or ""),
            "evet" if y.get("is_complete") else "hayır",
            str(y.get("device") or ""),
            str(y.get("browser") or ""),
            str(y.get("os") or ""),
            str(y.get("country") or ""),
            str(y.get("response_origin_url") or ""),
            str(y.get("recording_url") or ""),
            str(y.get("hotjar_user_id") or ""),
            ", ".join(str(t.get("name")) for t in y.get("tags") or []),
        ]
        satir += ["" if nitelik.get(n) is None else str(nitelik.get(n)) for n in nitelikler]
        for soru_id, _, yorum_mu in soru_sutunlari:
            kaynak = yorumlar if yorum_mu else cevaplar
            satir.append(" | ".join(kaynak.get(soru_id, [])))
        satirlar.append(satir)
    return basliklar, satirlar
