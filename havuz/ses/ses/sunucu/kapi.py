"""İstek kapısı: her isteğe, GÖVDESİ OKUNMADAN ÖNCE uygulanan güvenlik denetimleri (saf ASGI ara katmanı).

Kaynak: havuz/yz/yz/sunucu/kapi.py (kopyalandı, bu temele uyarlandı). Sıra: (1) API anahtarı yoksa
sunucu "yalnız bu bilgisayar" kipindedir: Host adı 127.0.0.1/localhost/::1 olmalı (DNS yeniden
bağlama: kötü bir sitenin adı 127.0.0.1'e döndürülüp yanıtlar okunamasın) ve başka siteden gelen
değiştirici istek (Origin) reddedilir (CSRF: herhangi bir site mikrofon kaydı yükleyemesin).
(2) Anahtar varsa anahtar (sabit zamanlı karşılaştırma). (3) Gövde boyu: Content-Length söylüyorsa
hemen, söylemiyorsa okunurken (413). Neden ara katman: FastAPI gövdeyi (yüklenen dosya dahil)
uç işlevinden ÖNCE okur; denetim yalnız uçta olsaydı kimliksiz biri sunucuya GB'larca veri yazdırabilirdi.
Kim kullanır: sunucu/uygulama.py. Genişletme: yeni ön denetim → `__call__` içinde gövde okunmadan
önce ekleyin; tests/test_sunucu.py'ye "saldırgan denedi, olmadı" testi yazın.
"""

from __future__ import annotations

import hmac
from collections.abc import Mapping
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ses.ayar import Ayarlar
from ses.metin import kucuk_ascii

YEREL_ADLAR = frozenset({"127.0.0.1", "localhost", "::1"})
GUVENLI_YONTEMLER = frozenset({"GET", "HEAD", "OPTIONS"})
ACIK_YOLLAR = frozenset({"/saglik", "/", "/tarayici", "/konus.js", "/sozluk.json"})
JSON_SINIRI = 1024 * 1024  # seslendirme isteği (metin ≤ 5000 karakter) için bol
YUKLEME_PAYI = 1024 * 1024  # çok parçalı gövdede dosyanın dışındaki alanlar için pay
YUKLEME_YOLU = "/v1/audio/transcriptions"
YEREL_HATASI = (
    "Bu sunucu API anahtarı olmadan yerel kipte çalışıyor; yalnız bu bilgisayardan "
    "(http://127.0.0.1 ya da http://localhost) açılabilir. Başka adla erişmek için "
    "SES_SUNUCU_ANAHTARI ortam değişkenini verin."
)
KOKEN_HATASI = "Başka bir siteden gelen istek reddedildi (yerel kip). SES_IZINLI_KOKENLER'e ekleyin."
ANAHTAR_HATASI = "API anahtarı eksik ya da yanlış. Authorization: Bearer <anahtar> başlığını gönderin."


def hata_yaniti(durum: int, ileti: str, tur: str = "invalid_request_error") -> JSONResponse:
    """OpenAI biçiminde hata gövdesi: {"error": {"message", "type", "param", "code"}}."""
    return JSONResponse(
        {"error": {"message": ileti, "type": tur, "param": None, "code": None}}, status_code=durum
    )


def ad_kismi(host: str) -> str:
    """Host başlığından adı alır: "LocalHost:8460" → "localhost", "[::1]:8460" → "::1"."""
    deger = kucuk_ascii(host.strip())
    if deger.startswith("["):
        return deger[1 : deger.find("]")] if "]" in deger else ""
    return deger.rsplit(":", 1)[0] if deger.count(":") == 1 else deger


def _ayni_koken(koken: str, host: str) -> bool:
    parca = urlsplit(koken)
    return parca.scheme in ("http", "https") and kucuk_ascii(parca.netloc) == kucuk_ascii(host)


def anahtar_gecerli(basliklar: Mapping[str, str], beklenen: str) -> bool:
    """Authorization: Bearer … ya da X-API-Key beklenenle aynı mı? (sabit zamanlı)"""
    gelen = basliklar.get("x-api-key") or ""
    yetki = basliklar.get("authorization") or ""
    if kucuk_ascii(yetki[:7]) == "bearer ":
        gelen = yetki[7:].strip()
    return hmac.compare_digest(gelen.encode(), beklenen.encode())


class IstekKapisi:
    """`uygulama.add_middleware(IstekKapisi, ayarlar=ayarlar)`; CORS'tan önce eklenir (CORS dışta kalsın)."""

    def __init__(self, app: ASGIApp, ayarlar: Ayarlar) -> None:
        self.app = app
        self.ayarlar = ayarlar

    def _red(self, kapsam: Scope, basliklar: Headers) -> JSONResponse | None:
        if self.ayarlar.api_anahtari is None:
            host = basliklar.get("host") or ""
            if ad_kismi(host) not in YEREL_ADLAR:
                return hata_yaniti(403, YEREL_HATASI, "permission_error")
            koken = basliklar.get("origin")
            if (
                kapsam["method"] not in GUVENLI_YONTEMLER
                and koken is not None
                and koken not in self.ayarlar.izinli_kokenler
                and not _ayni_koken(koken, host)
            ):
                return hata_yaniti(403, KOKEN_HATASI, "permission_error")
        elif (
            kapsam["method"] != "OPTIONS"
            and kapsam["path"] not in ACIK_YOLLAR
            and not anahtar_gecerli(basliklar, self.ayarlar.api_anahtari)
        ):
            return hata_yaniti(401, ANAHTAR_HATASI, "authentication_error")
        return None

    def _sinir(self, yol: str) -> int:
        return self.ayarlar.azami_yukleme_bayt + YUKLEME_PAYI if yol == YUKLEME_YOLU else JSON_SINIRI

    async def __call__(self, kapsam: Scope, al: Receive, gonder: Send) -> None:
        if kapsam["type"] != "http":
            await self.app(kapsam, al, gonder)
            return
        basliklar = Headers(scope=kapsam)
        red = self._red(kapsam, basliklar)
        if red is not None:
            await red(kapsam, al, gonder)
            return
        sinir = self._sinir(kapsam["path"])
        ileti = f"İstek gövdesi çok büyük (sınır {sinir // (1024 * 1024)} MB)."
        beyan = basliklar.get("content-length") or ""
        if beyan.isdigit() and int(beyan) > sinir:
            await hata_yaniti(413, ileti)(kapsam, al, gonder)
            return
        okunan = 0

        async def sayan_al() -> Message:
            nonlocal okunan
            mesaj = await al()
            if mesaj["type"] == "http.request":
                okunan += len(mesaj.get("body", b""))
                if okunan > sinir:
                    # HTTPException: FastAPI gövde ayrıştırırken bunu yutmaz, 413 olarak iletir
                    raise HTTPException(status_code=413, detail=ileti)
            return mesaj

        await self.app(kapsam, sayan_al, gonder)
