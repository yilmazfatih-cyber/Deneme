"""Sunucu testleri — ASGI aktarımı (Starlette TestClient), sahte motorlar; gerçek ağ ve model yok."""

import asyncio
import json
import threading

import numpy as np
import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from ses.ayar import Ayarlar
from ses.hatalar import MesgulHatasi
from ses.katalog import katalogu_oku, model_klasoru
from ses.ses_isleme.ffmpeg import ffmpeg_yolu
from ses.ses_isleme.ses import Ses
from ses.ses_isleme.wav import wav_bayt, wav_oku
from ses.stt.motor import SahteStt
from ses.sunucu.durum import IsSiniri
from ses.sunucu.uygulama import uygulama_kur
from ses.tts.motor import SahteTts
from tests.yardimci import birlestir, patlama, sessizlik

YEREL = "http://127.0.0.1:8460"


def _istemci(tmp_path, *, stt=None, tts=None, base_url=YEREL, **ayar):
    ayarlar = Ayarlar(model_dizini=tmp_path, **ayar)
    uygulama = uygulama_kur(
        ayarlar,
        stt_fabrikasi=lambda ad: stt or SahteStt("merhaba dünya"),
        tts_fabrikasi=lambda ad: tts or SahteTts(),
    )
    return TestClient(uygulama, base_url=base_url)


def _wav(sure=1.0):
    dizi = birlestir(sessizlik(0.2, 16000), patlama(sure, 16000), sessizlik(0.2, 16000))
    return wav_bayt(Ses.tek_kanaldan(dizi, 16000))


def _yazi(istemci, **alanlar):
    return istemci.post("/v1/audio/transcriptions", files={"file": ("ses.wav", _wav(), "audio/wav")}, data=alanlar)


def test_temel_uclar(tmp_path):
    istemci = _istemci(tmp_path)
    assert istemci.get("/saglik").json() == {"durum": "ok"}
    assert "/v1/audio/speech" in istemci.get("/").json()["uclar"]
    sayfa = istemci.get("/tarayici")
    assert sayfa.status_code == 200 and 'data-t="baslik"' in sayfa.text
    assert "export async function konus" in istemci.get("/konus.js").text
    assert istemci.get("/sozluk.json").json()["baslik"]


@pytest.mark.parametrize(
    ("bicim", "tur", "icerik"),
    [("json", "application/json", '{"text": "merhaba dünya"}'), ("text", "text/plain", "merhaba dünya\n"),
     ("srt", "text/plain", "1\n00:00:00,"), ("vtt", "text/vtt", "WEBVTT\n\n00:00:00.")],
)  # fmt: skip
def test_yaziya_bicimler(tmp_path, bicim, tur, icerik):
    yanit = _yazi(_istemci(tmp_path), model="whisper-1", response_format=bicim)
    assert yanit.status_code == 200 and yanit.headers["content-type"].startswith(tur)
    assert yanit.text.startswith(icerik) if bicim != "json" else yanit.text == icerik


def test_verbose_json_sozcuklu(tmp_path):
    yanit = _yazi(_istemci(tmp_path), response_format="verbose_json", **{"timestamp_granularities[]": "word"})
    govde = yanit.json()
    assert govde["language"] == "turkish" and govde["text"] == "merhaba dünya"
    assert govde["segments"][0]["start"] == pytest.approx(0.1, abs=0.05)
    assert [k["word"] for k in govde["words"]] == ["merhaba", "dünya"]


def test_yaziya_hatalari_openai_bicimiyle(tmp_path):
    istemci = _istemci(tmp_path, azami_sure_sn=0.5)
    yanit = _yazi(istemci, response_format="docx")
    assert yanit.status_code == 400 and yanit.json()["error"]["type"] == "invalid_request_error"
    yanit = istemci.post("/v1/audio/transcriptions", files={"file": ("bos.wav", b"", "audio/wav")})
    assert yanit.status_code == 400 and "boş" in yanit.json()["error"]["message"]
    yanit = istemci.post("/v1/audio/transcriptions", files={"file": ("x.m3u8", b"#EXTM3U\n/etc/passwd\n", "text/plain")})
    assert yanit.status_code == 400 and "tanınmadı" in yanit.json()["error"]["message"]
    assert _yazi(istemci).status_code == 413  # ses 0,5 sn sınırından uzun
    yanit = _yazi(istemci, language="Türkçe")
    assert yanit.status_code == 400 and "language" in yanit.json()["error"]["message"]


def test_govde_siniri_okunmadan_once(tmp_path):
    istemci = _istemci(tmp_path, azami_yukleme_mb=1)
    buyuk = b"RIFF" + b"\x00" * (3 * 1024 * 1024)
    yanit = istemci.post("/v1/audio/transcriptions", files={"file": ("b.wav", buyuk, "audio/wav")})
    assert yanit.status_code == 413 and "çok büyük" in yanit.json()["error"]["message"]
    # Content-Length yalan söylese de (parça parça gönderim) okunurken kesilir
    def parcalar():
        for _ in range(40):
            yield b"x" * 100_000

    yanit = istemci.post("/v1/audio/speech", content=parcalar(), headers={"content-type": "application/json"})
    assert yanit.status_code == 413


def test_buyuk_govde_hic_okunmaz(tmp_path):
    uygulama = uygulama_kur(Ayarlar(model_dizini=tmp_path, azami_yukleme_mb=1))
    gonderilen = []

    async def al():
        raise AssertionError("gövde okunmamalıydı")

    async def gonder(mesaj):
        gonderilen.append(mesaj)

    kapsam = {"type": "http", "method": "POST", "path": "/v1/audio/transcriptions", "headers": [
        (b"host", b"127.0.0.1:8460"), (b"content-length", str(50 * 1024 * 1024).encode())],
        "query_string": b"", "scheme": "http", "server": ("127.0.0.1", 8460), "root_path": ""}  # fmt: skip
    asyncio.run(uygulama(kapsam, al, gonder))
    assert gonderilen[0]["status"] == 413


def test_yerel_kip_ad_ve_koken_denetimi(tmp_path):
    kotu = _istemci(tmp_path, base_url="http://kotu-site.example")
    assert kotu.get("/saglik").status_code == 403  # DNS yeniden bağlama
    istemci = _istemci(tmp_path)
    yanit = istemci.post("/v1/audio/speech", json={"input": "a"}, headers={"origin": "https://kotu.example"})
    assert yanit.status_code == 403 and yanit.json()["error"]["type"] == "permission_error"
    assert istemci.post("/v1/audio/speech", json={"input": "a"}, headers={"origin": YEREL}).status_code == 200
    izinli = _istemci(tmp_path, izinli_kokenler=["https://uygulamam.example"])
    yanit = izinli.post("/v1/audio/speech", json={"input": "a"}, headers={"origin": "https://uygulamam.example"})
    assert yanit.status_code == 200 and yanit.headers["access-control-allow-origin"] == "https://uygulamam.example"


def test_api_anahtari(tmp_path):
    istemci = _istemci(tmp_path, base_url="http://ses.ornek.example", api_anahtari="gizli-anahtar-123")
    assert istemci.get("/saglik").status_code == 200  # açık yol
    assert istemci.post("/v1/audio/speech", json={"input": "a"}).status_code == 401
    yanlis = {"authorization": "Bearer yanlis"}
    assert istemci.post("/v1/audio/speech", json={"input": "a"}, headers=yanlis).status_code == 401
    for baslik in ({"authorization": "Bearer gizli-anahtar-123"}, {"x-api-key": "gizli-anahtar-123"}):
        assert istemci.post("/v1/audio/speech", json={"input": "a"}, headers=baslik).status_code == 200


def test_seslendirme(tmp_path):
    tts = SahteTts()
    istemci = _istemci(tmp_path, tts=tts)
    yanit = istemci.post("/v1/audio/speech", json={"model": "tts-1", "voice": "alloy", "input": "Saat 14:30."})
    assert yanit.status_code == 200 and yanit.headers["content-type"] == "audio/wav"
    ses = wav_oku(yanit.content)
    assert ses.ornekleme == 22050 and ses.sure > 0.5 and yanit.headers["x-ornekleme"] == "22050"
    assert tts.metinler[-1] == "Saat on dört otuz."
    yanit = istemci.post("/v1/audio/speech", json={"input": "merhaba", "response_format": "pcm", "ornekleme": 16000})
    assert yanit.headers["content-type"] == "audio/pcm" and len(yanit.content) % 2 == 0
    yanit = istemci.post("/v1/audio/speech", json={"input": "a", "speed": 4.0})
    assert yanit.status_code == 400 and "speed" in yanit.json()["error"]["message"]
    assert istemci.post("/v1/audio/speech", json={"input": ""}).status_code == 400


@pytest.mark.skipif(ffmpeg_yolu() is None, reason="ffmpeg kurulu değil")
def test_seslendirme_sikistirilmis(tmp_path):
    istemci = _istemci(tmp_path)
    for bicim, imza in (("mp3", (b"ID3", b"\xff\xfb", b"\xff\xf3")), ("opus", (b"OggS",))):
        yanit = istemci.post("/v1/audio/speech", json={"input": "merhaba", "response_format": bicim})
        assert yanit.status_code == 200 and yanit.content.startswith(imza)


def test_mesgulken_503(tmp_path):
    giris, birak = threading.Event(), threading.Event()

    def bekleyen(dizi):
        giris.set()
        birak.wait(10)
        return "tamam"

    istemci = _istemci(tmp_path, stt=SahteStt(bekleyen), es_zamanli_is=1, bekleyen_is=0)
    sonuclar = []
    is_parcacigi = threading.Thread(target=lambda: sonuclar.append(_yazi(istemci)))
    is_parcacigi.start()
    assert giris.wait(10)
    yanit = _yazi(istemci)
    birak.set()
    is_parcacigi.join(10)
    assert yanit.status_code == 503 and yanit.headers["retry-after"] == "5"
    assert sonuclar[0].status_code == 200


def test_is_siniri():
    sinir = IsSiniri(1, 1, bekleme_sn=0.05)
    with sinir.al():
        with pytest.raises(MesgulHatasi, match="süre doldu"):
            with sinir.al():
                pass
    with sinir.al():
        pass  # serbest bırakıldı


def test_modeller_ve_eksik_model(tmp_path):
    model = katalogu_oku().bul("tiny", "stt")
    klasor = model_klasoru(tmp_path, model)
    klasor.mkdir(parents=True)
    for dosya in model.dosyalar:  # boyutu doğru seyrek dosyalar: "indirilmiş" görünür
        with open(klasor / dosya.ad, "wb") as f:
            f.truncate(dosya.boyut)
    istemci = TestClient(uygulama_kur(Ayarlar(model_dizini=tmp_path)), base_url=YEREL)
    assert [m["id"] for m in istemci.get("/v1/models").json()["data"]] == ["tiny"]
    yanit = istemci.post("/v1/audio/speech", json={"input": "merhaba"})
    assert yanit.status_code == 404 and "python -m ses indir" in yanit.json()["error"]["message"]


def test_bozuk_json(tmp_path):
    yanit = _istemci(tmp_path).post(
        "/v1/audio/speech", content=b"{bozuk", headers={"content-type": "application/json"}
    )
    assert yanit.status_code == 400 and json.loads(yanit.text)["error"]["message"].startswith("İstek alanları")


def test_sessiz_dosya_bos_metin(tmp_path):
    istemci = _istemci(tmp_path)
    sessiz = wav_bayt(Ses.tek_kanaldan(np.zeros(16000, np.float32), 16000))
    yanit = istemci.post("/v1/audio/transcriptions", files={"file": ("s.wav", sessiz, "audio/wav")})
    assert yanit.json() == {"text": ""}
