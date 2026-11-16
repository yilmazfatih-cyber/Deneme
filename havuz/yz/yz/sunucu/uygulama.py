"""FastAPI uygulaması: sohbet arayüzü + arayüz API'si + OpenAI uyumlu vekil.

Uçlar:
    GET  /                    tek dosyalık sohbet arayüzü (yz/web/index.html)
    GET  /sozluk.json         arayüz metinleri · GET /kayit.html: ajan dökümü görüntüleyici
    GET  /saglik              {"durum": "ok"}
    GET  /api/saglayicilar    yapılandırılmış profiller
    POST /api/sohbet          SSE: sohbet / rag / arac (sunucu/sohbet_ucu.py)
    POST /api/sor             RAG, akışsız JSON
    POST /api/belge           belge yükle (multipart "dosya") → dizinle → kaydet
    GET  /api/belgeler        dizindeki belgeler
    POST /v1/chat/completions, GET /v1/models   OpenAI uyumlu vekil (sunucu/vekil.py)
Güvenlik: API anahtarı tanımlıysa (yz.yaml sunucu.api_anahtari_ortam adlı ortam değişkeni) her
API isteği ister; CORS varsayılan kapalıdır; yükleme boyutu sınırlıdır.
Kim kullanır: cli.py (`sun`), tests/test_sunucu.py.
Genişletme: yeni uç → bu dosyaya `@uygulama.get/post` ekleyin; testini ASGI aktarımıyla yazın.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from importlib import resources
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from yz.ayar import Ayarlar
from yz.hatalar import AyarHatasi, EksikBagimlilikHatasi, SaglayiciHatasi, VeriHatasi
from yz.rag.dizin import RagDizini
from yz.rag.yanit import RagHatti
from yz.rag.yukleyici import bayttan_yukle
from yz.sunucu.durum import SaglayiciFabrikasi, SunucuDurumu, anahtar_denetle, guvenli_dosya_adi
from yz.sunucu.sohbet_ucu import SohbetIstegiGovdesi, sohbet_akisi
from yz.sunucu.vekil import yonlendirici as vekil


def web_dosyasi(ad: str) -> bytes:
    return resources.files("yz.web").joinpath(ad).read_bytes()


class SorGovdesi(BaseModel):
    soru: str = Field(min_length=1, max_length=4000)
    saglayici: str | None = None


def uygulama_kur(
    ayarlar: Ayarlar,
    *,
    saglayici_fabrikasi: SaglayiciFabrikasi | None = None,
    dizin: RagDizini | None = None,
    ortam: dict[str, str] | None = None,
) -> FastAPI:
    durum = SunucuDurumu(ayarlar, saglayici_fabrikasi=saglayici_fabrikasi, dizin=dizin, ortam=ortam)

    @asynccontextmanager
    async def yasam(_uygulama: FastAPI) -> AsyncIterator[None]:
        yield
        durum.kapat()  # açık model bağlantılarını kapat

    uygulama = FastAPI(
        title="yz",
        docs_url=None,
        redoc_url=None,
        lifespan=yasam,
        dependencies=[Depends(anahtar_denetle)],
    )
    uygulama.state.durum = durum
    if ayarlar.sunucu.izinli_kokenler:
        uygulama.add_middleware(CORSMiddleware, allow_origins=ayarlar.sunucu.izinli_kokenler,
                                allow_methods=["GET", "POST"], allow_headers=["*"])  # fmt: skip
    uygulama.include_router(vekil)

    @uygulama.exception_handler(SaglayiciHatasi)
    def saglayici_hatasi(_istek: Request, hata: SaglayiciHatasi) -> JSONResponse:
        return JSONResponse({"hata": str(hata)}, status_code=502)

    def girdi_hatasi(_istek: Request, hata: Exception) -> JSONResponse:
        return JSONResponse({"hata": str(hata)}, status_code=400)

    for sinif in (VeriHatasi, AyarHatasi, EksikBagimlilikHatasi):
        uygulama.add_exception_handler(sinif, girdi_hatasi)

    @uygulama.get("/", response_class=HTMLResponse)
    def arayuz() -> Response:
        return Response(web_dosyasi("index.html"), media_type="text/html; charset=utf-8")

    @uygulama.get("/sozluk.json")
    def sozluk() -> Response:
        return Response(web_dosyasi("sozluk.json"), media_type="application/json")

    @uygulama.get("/kayit.html", response_class=HTMLResponse)
    def kayit() -> Response:
        return Response(web_dosyasi("kayit.html"), media_type="text/html; charset=utf-8")

    @uygulama.get("/saglik")
    def saglik() -> dict[str, str]:
        return {"durum": "ok"}

    @uygulama.get("/api/saglayicilar")
    def saglayicilar() -> dict[str, Any]:
        profiller = [
            {"ad": ad, "tur": p.tur, "model": p.model} for ad, p in ayarlar.saglayicilar.items()
        ]
        if "sahte" not in ayarlar.saglayicilar:  # modelsiz deneme her zaman seçilebilir
            profiller.append({"ad": "sahte", "tur": "sahte", "model": "sahte-gosterim"})
        return {"varsayilan": ayarlar.varsayilan or profiller[0]["ad"], "saglayicilar": profiller}

    @uygulama.post("/api/sohbet")
    def sohbet(govde: SohbetIstegiGovdesi) -> StreamingResponse:
        return StreamingResponse(sohbet_akisi(durum, govde), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})  # fmt: skip

    @uygulama.post("/api/sor")
    def sor(govde: SorGovdesi) -> dict[str, Any]:
        sonuc = RagHatti(durum.dizin, durum.saglayici(govde.saglayici)).sor(govde.soru)
        return {
            "yanit": sonuc.yanit, "atiflar": sonuc.atiflar, "belgede_yok": sonuc.belgede_yok,
            "uyarilar": sonuc.uyarilar, "dayanaksiz": sonuc.dayanaksiz,
            "kaynaklar": [{"numara": i, "ad": s.parca.goster(), "metin": s.parca.metin}
                          for i, s in enumerate(sonuc.kaynaklar, start=1)],
        }  # fmt: skip

    @uygulama.post("/api/belge")
    async def belge_yukle(dosya: UploadFile = File(...)) -> dict[str, Any]:  # noqa: B008
        azami = ayarlar.sunucu.azami_yukleme_bayt
        veri = await dosya.read(azami + 1)
        if len(veri) > azami:
            raise HTTPException(413, f"Dosya çok büyük (sınır {azami // (1024 * 1024)} MB).")
        belge = bayttan_yukle(veri, guvenli_dosya_adi(dosya.filename))
        eklenen = durum.dizin.ekle([belge])
        durum.dizini_kaydet()
        return {"eklenen_parca": eklenen, "belgeler": durum.dizin.belgeler}

    @uygulama.get("/api/belgeler")
    def belgeler() -> dict[str, Any]:
        return {"belgeler": durum.dizin.belgeler, "parca_sayisi": len(durum.dizin)}

    return uygulama
