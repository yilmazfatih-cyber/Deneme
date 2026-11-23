"""FastAPI uygulaması: OpenAI uyumlu ses uçları + tarayıcı denetim sayfası.

Uçlar:
    POST /v1/audio/transcriptions   çok parçalı: file, model, language (tr), prompt, response_format
                                    (json | text | srt | vtt | verbose_json), timestamp_granularities[]
    POST /v1/audio/speech           JSON: input, voice, model, response_format (wav | pcm | mp3 | opus |
                                    ogg | flac; varsayılan wav), speed (0,5–2) + uzantılar: perde,
                                    cumle_arasi_ms, hedef_lufs, ornekleme, normallestir
    GET  /v1/models                 indirilmiş modeller ve sesler · GET /saglik
    GET  /tarayici                  tarayıcıda Türkçe ses denetimi ve yedek hattı (ses/web/)
Güvenlik: gövde okunmadan önce sunucu/kapi.py (anahtar, yerel kip, boy sınırı); ses süresi sınırı
veri belleğe alınmadan; aynı anda iş sayısı durum.py'deki `IsSiniri` ile sınırlı.
Kim kullanır: komutlar.py (`sun`), tests/test_sunucu.py. Genişletme: yeni uç → bu dosyaya ekleyin,
testini ASGI aktarımıyla (TestClient) sahte motorlarla yazın.
"""

from __future__ import annotations

from importlib import resources
from typing import Any, Literal

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from ses.ayar import Ayarlar
from ses.hatalar import (
    BicimHatasi,
    EksikBagimlilikHatasi,
    MesgulHatasi,
    ModelBulunamadiHatasi,
    SesHatasi,
    SinirHatasi,
)
from ses.katalog import katalogu_oku
from ses.ses_isleme.yukle import ses_yukle, tek_kanal_hazirla
from ses.stt.uzun import uzun_yaziya
from ses.sunucu.bicim import BICIMLER, yanit_govdesi
from ses.sunucu.durum import SttFabrikasi, SunucuDurumu, TtsFabrikasi
from ses.sunucu.kapi import IstekKapisi, hata_yaniti
from ses.tts.cikti import ses_bayt
from ses.tts.motor import SesAyari
from ses.tts.seslendirici import AZAMI_METIN, seslendir

_DURUM_KODLARI: list[tuple[type[SesHatasi], int, str]] = [
    (SinirHatasi, 413, "invalid_request_error"),
    (BicimHatasi, 400, "invalid_request_error"),
    (ModelBulunamadiHatasi, 404, "not_found_error"),
    (EksikBagimlilikHatasi, 501, "server_error"),
    (MesgulHatasi, 503, "server_error"),
]


class KonusmaIstegi(BaseModel):
    """OpenAI `/v1/audio/speech` gövdesi + bu temelin uzantıları."""

    input: str = Field(min_length=1, max_length=AZAMI_METIN)
    model: str | None = None
    voice: str | None = None
    response_format: Literal["wav", "pcm", "mp3", "opus", "ogg", "flac"] = "wav"
    speed: float = Field(1.0, ge=0.5, le=2.0)
    perde: float = Field(0.0, ge=-6, le=6)
    cumle_arasi_ms: int = Field(300, ge=0, le=3000)
    hedef_lufs: float | None = Field(-16.0, ge=-40, le=-5)
    ornekleme: int | None = Field(None, ge=8000, le=48000)
    normallestir: bool = True


def _katalog_adi(adlar: tuple[str | None, ...], tur: Literal["stt", "tts"]) -> str | None:
    """İstekteki ad katalogdaysa onu, değilse (ör. "whisper-1", "alloy") None (varsayılan) döndürür."""
    try:
        bilinen = {m.ad for m in katalogu_oku().modeller if m.tur == tur}
    except SesHatasi:
        return None
    return next((ad for ad in adlar if ad in bilinen), None)


def _web(ad: str) -> bytes:
    return resources.files("ses.web").joinpath(ad).read_bytes()


def uygulama_kur(
    ayarlar: Ayarlar,
    *,
    stt_fabrikasi: SttFabrikasi | None = None,
    tts_fabrikasi: TtsFabrikasi | None = None,
) -> FastAPI:
    durum = SunucuDurumu(ayarlar, stt_fabrikasi=stt_fabrikasi, tts_fabrikasi=tts_fabrikasi)
    uygulama = FastAPI(title="havuz-ses", docs_url=None, redoc_url=None, openapi_url=None)
    uygulama.state.durum = durum
    uygulama.add_middleware(IstekKapisi, ayarlar=ayarlar)
    if ayarlar.izinli_kokenler:
        uygulama.add_middleware(CORSMiddleware, allow_origins=ayarlar.izinli_kokenler,
                                allow_methods=["GET", "POST"], allow_headers=["*"])  # fmt: skip

    @uygulama.exception_handler(SesHatasi)
    def ses_hatasi(_istek: Request, hata: SesHatasi) -> JSONResponse:
        for sinif, kod, tur in _DURUM_KODLARI:
            if isinstance(hata, sinif):
                yanit = hata_yaniti(kod, str(hata), tur)
                if kod == 503:
                    yanit.headers["Retry-After"] = "5"
                return yanit
        return hata_yaniti(500, str(hata), "server_error")

    @uygulama.exception_handler(StarletteHTTPException)
    def http_hatasi(_istek: Request, hata: StarletteHTTPException) -> JSONResponse:
        return hata_yaniti(hata.status_code, str(hata.detail))

    @uygulama.exception_handler(RequestValidationError)
    def girdi_hatasi(_istek: Request, hata: RequestValidationError) -> JSONResponse:
        alanlar = ", ".join(
            f"{'.'.join(str(p) for p in h['loc'][1:])} ({h['msg']})" for h in hata.errors()
        )
        return hata_yaniti(400, f"İstek alanları geçersiz: {alanlar}")

    @uygulama.get("/saglik")
    def saglik() -> dict[str, str]:
        return {"durum": "ok"}

    @uygulama.get("/")
    def kok() -> dict[str, Any]:
        return {"ad": "havuz-ses", "uclar": ["/v1/audio/transcriptions", "/v1/audio/speech",
                                             "/v1/models", "/tarayici", "/saglik"]}  # fmt: skip

    @uygulama.get("/v1/models")
    def modeller() -> dict[str, Any]:
        veri = [
            {"id": ad, "object": "model", "owned_by": "havuz-ses", "tur": tur}
            for tur, ad in durum.modeller()
        ]
        return {"object": "list", "data": veri}

    @uygulama.post("/v1/audio/transcriptions")
    def yaziya(
        file: UploadFile = File(...),  # noqa: B008
        model: str | None = Form(None),
        language: str = Form("tr", pattern=r"^[a-z]{2,3}$"),
        prompt: str | None = Form(None, max_length=1000),
        response_format: str = Form("json"),
        zaman_ayrintisi: list[str] = Form([], alias="timestamp_granularities[]"),  # noqa: B008
    ) -> Response:
        if response_format not in BICIMLER:
            raise BicimHatasi(f"response_format şunlardan biri olmalı: {', '.join(BICIMLER)}.")
        veri = file.file.read(ayarlar.azami_yukleme_bayt + 1)
        if len(veri) > ayarlar.azami_yukleme_bayt:
            raise SinirHatasi(f"Dosya çok büyük (sınır {ayarlar.azami_yukleme_mb} MB).")
        if not veri:
            raise BicimHatasi("Yüklenen dosya boş.")
        ornekler = tek_kanal_hazirla(ses_yukle(veri, azami_sure=ayarlar.azami_sure_sn))
        motor = durum.stt(_katalog_adi((model,), "stt"))
        sozcuklu = response_format in ("srt", "vtt") or "word" in zaman_ayrintisi
        with durum.is_siniri.al():
            sonuc = uzun_yaziya(
                motor, ornekler, dil=language, kelime_zamanlari=sozcuklu, ipucu=prompt
            )
        govde, tur = yanit_govdesi(sonuc, response_format, kelimeler="word" in zaman_ayrintisi)
        return Response(govde, media_type=tur)

    @uygulama.post("/v1/audio/speech")
    def konus(istek: KonusmaIstegi) -> Response:
        motor = durum.tts(_katalog_adi((istek.voice, istek.model), "tts"))
        ayar = SesAyari(hiz=istek.speed, perde=istek.perde, cumle_arasi_ms=istek.cumle_arasi_ms,
                        hedef_lufs=istek.hedef_lufs, ornekleme=istek.ornekleme,
                        normallestir=istek.normallestir)  # fmt: skip
        with durum.is_siniri.al():
            ses = seslendir(motor, istek.input, ayar)
        bayt, tur = ses_bayt(ses, istek.response_format)
        return Response(bayt, media_type=tur, headers={"X-Ornekleme": str(ses.ornekleme)})

    @uygulama.get("/tarayici")
    def tarayici() -> Response:
        return Response(_web("tarayici.html"), media_type="text/html; charset=utf-8")

    @uygulama.get("/konus.js")
    def konus_js() -> Response:
        return Response(_web("konus.js"), media_type="text/javascript; charset=utf-8")

    @uygulama.get("/sozluk.json")
    def sozluk() -> Response:
        return Response(_web("sozluk.json"), media_type="application/json")

    return uygulama
