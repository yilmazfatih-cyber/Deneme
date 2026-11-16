"""İstek kapısı: her isteğe, GÖVDESİ OKUNMADAN ÖNCE uygulanan güvenlik denetimleri (saf ASGI ara katmanı).

Sıra: (1) API anahtarı yoksa sunucu "yalnız bu bilgisayar" kipindedir: Host adı 127.0.0.1/localhost/::1
olmalı (DNS yeniden bağlama: kötü bir sitenin adı 127.0.0.1'e döndürülüp yanıtlar okunamasın) ve başka
siteden gelen değiştirici istek (Origin) reddedilir (CSRF: herhangi bir site belge yükleyemesin).
(2) Anahtar varsa anahtar. (3) Gövde boyu: Content-Length söylüyorsa hemen, söylemiyorsa okunurken (413).
Neden ara katman: FastAPI gövdeyi (yüklenen dosya dahil) bağımlılıklardan ÖNCE okur; denetim yalnız
bağımlılıkta olsaydı kimliksiz biri de sunucuya GB'larca veri yazdırabilirdi.
Kim kullanır: sunucu/uygulama.py. Genişletme: yeni ön denetim → `__call__` içinde gövde okunmadan önce
ekleyin; tests/test_sunucu.py'ye "saldırgan denedi, olmadı" testi yazın.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from yz.metin import kucuk_ascii
from yz.sunucu.durum import ACIK_YOLLAR, ANAHTAR_HATASI, SunucuDurumu, anahtar_gecerli

YEREL_ADLAR = frozenset({"127.0.0.1", "localhost", "::1"})
GUVENLI_YONTEMLER = frozenset({"GET", "HEAD", "OPTIONS"})
JSON_SINIRI = 32 * 1024 * 1024  # sohbet/vekil gövdesi (200 mesaj × 50 000 karakter bile sığar)
YUKLEME_PAYI = 1024 * 1024  # çok parçalı gövdede dosyanın dışındaki başlıklar için pay
YEREL_HATASI = (
    "Bu sunucu API anahtarı olmadan yerel kipte çalışıyor; yalnız bu bilgisayardan "
    "(http://127.0.0.1 ya da http://localhost) açılabilir. Başka adla erişmek için "
    "YZ_SUNUCU_ANAHTARI ortam değişkenini verin."
)
KOKEN_HATASI = "Başka bir siteden gelen istek reddedildi (yerel kip). Arayüzü bu sunucudan açın."


def ad_kismi(host: str) -> str:
    """Host başlığından adı alır: "LocalHost:8420" → "localhost", "[::1]:8420" → "::1"."""
    deger = kucuk_ascii(host.strip())
    if deger.startswith("["):
        return deger[1 : deger.find("]")] if "]" in deger else ""
    return deger.rsplit(":", 1)[0] if deger.count(":") == 1 else deger


def _ayni_koken(koken: str, host: str) -> bool:
    parca = urlsplit(koken)
    return parca.scheme in ("http", "https") and kucuk_ascii(parca.netloc) == kucuk_ascii(host)


class IstekKapisi:
    """`uygulama.add_middleware(IstekKapisi, durum=durum)`; CORS'tan SONRA eklenmemeli (CORS dışta kalsın)."""

    def __init__(self, app: ASGIApp, durum: SunucuDurumu) -> None:
        self.app = app
        self.durum = durum

    def _red(self, kapsam: Scope, basliklar: Headers) -> JSONResponse | None:
        yontem = kapsam["method"]
        if self.durum.api_anahtari is None:
            host = basliklar.get("host") or ""
            if ad_kismi(host) not in YEREL_ADLAR:
                return JSONResponse({"detail": YEREL_HATASI}, status_code=403)
            koken = basliklar.get("origin")
            izinli = self.durum.ayarlar.sunucu.izinli_kokenler
            if (
                yontem not in GUVENLI_YONTEMLER
                and koken is not None
                and koken not in izinli
                and not _ayni_koken(koken, host)
            ):
                return JSONResponse({"detail": KOKEN_HATASI}, status_code=403)
        elif (
            yontem != "OPTIONS"
            and kapsam["path"] not in ACIK_YOLLAR
            and not anahtar_gecerli(basliklar, self.durum.api_anahtari)
        ):
            return JSONResponse({"detail": ANAHTAR_HATASI}, status_code=401)
        return None

    def _sinir(self, yol: str) -> int:
        if yol == "/api/belge":
            return self.durum.ayarlar.sunucu.azami_yukleme_bayt + YUKLEME_PAYI
        return JSON_SINIRI

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
        mb = f"{sinir / (1024 * 1024):.1f}".replace(".", ",")
        ileti = f"İstek gövdesi çok büyük (sınır {mb} MB)."
        beyan = basliklar.get("content-length") or ""
        if beyan.isdigit() and int(beyan) > sinir:
            await JSONResponse({"detail": ileti}, status_code=413)(kapsam, al, gonder)
            return
        okunan = 0

        async def sayan_al() -> Message:
            nonlocal okunan
            mesaj = await al()
            if mesaj["type"] == "http.request":
                okunan += len(mesaj.get("body", b""))
                if okunan > sinir:
                    raise HTTPException(status_code=413, detail=ileti)  # FastAPI 413'e çevirir
            return mesaj

        await self.app(kapsam, sayan_al, gonder)
