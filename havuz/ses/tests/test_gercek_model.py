"""Gerçek modellerle duman testleri (SES_MODEL=1 ile açılır; modeller önceden indirilmiş olmalı).

Çalıştırma: SES_MODEL=1 SES_MODEL_DIZINI=<klasör> .venv/bin/python -m pytest tests/test_gercek_model.py
Gerekenler: python -m ses indir --stt tiny --tts tr_TR-dfki-medium. Piper her seferinde biraz farklı
ses üretir (gürültü örnekler); eşikler bu yüzden geniştir. Ayrıntılı ölçüm: scripts/gidis_donus.py.
"""

import itertools

import pytest

from ses.ayar import ayarlari_oku
from ses.katalog import indirilmis_mi, katalogu_oku, model_klasoru
from ses.olcum.hata_orani import cer
from ses.ses_isleme.yukle import tek_kanal_hazirla
from ses.stt.uzun import uzun_yaziya
from ses.tts.motor import SesAyari
from ses.tts.seslendirici import seslendir

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def motorlar():
    from ses.stt.whisper import WhisperMotoru
    from ses.tts.piper_motoru import PiperMotoru

    ayarlar = ayarlari_oku()
    katalog = katalogu_oku()
    stt, tts = katalog.bul("tiny", "stt"), katalog.bul("tr_TR-dfki-medium", "tts")
    for model in (stt, tts):
        if not indirilmis_mi(ayarlar.model_dizini, model):
            pytest.skip(f"{model.ad} indirilmemiş: python -m ses indir ({ayarlar.model_dizini})")
    whisper = WhisperMotoru(model_klasoru(ayarlar.model_dizini, stt), ad="tiny")
    piper = PiperMotoru(model_klasoru(ayarlar.model_dizini, tts) / "tr_TR-dfki-medium.onnx")
    return whisper, piper


def test_gidis_donus_kisa_cumle(motorlar):
    whisper, piper = motorlar
    ses = seslendir(piper, "Torunlarım hafta sonu bize gelecek.", SesAyari())
    assert ses.ornekleme == 22050 and 1.0 < ses.sure < 6.0
    sonuc = uzun_yaziya(whisper, tek_kanal_hazirla(ses), kelime_zamanlari=True)
    assert cer("Torunlarım hafta sonu bize gelecek.", sonuc.metin) < 0.3, sonuc.metin
    kelimeler = [k for b in sonuc.bolutler for k in b.kelimeler]
    assert kelimeler and all(0 <= k.baslangic <= k.bitis <= ses.sure + 0.01 for k in kelimeler)
    assert all(a.baslangic <= b.baslangic for a, b in itertools.pairwise(kelimeler))


def test_sunucu_uctan_uca(motorlar):
    from fastapi.testclient import TestClient

    from ses.sunucu.uygulama import uygulama_kur

    whisper, piper = motorlar
    uygulama = uygulama_kur(
        ayarlari_oku(), stt_fabrikasi=lambda ad: whisper, tts_fabrikasi=lambda ad: piper
    )
    istemci = TestClient(uygulama, base_url="http://127.0.0.1:8460")
    wav = istemci.post("/v1/audio/speech", json={"input": "Bugün hava çok güzel."}).content
    yanit = istemci.post("/v1/audio/transcriptions", files={"file": ("s.wav", wav, "audio/wav")})
    assert yanit.status_code == 200 and cer("Bugün hava çok güzel.", yanit.json()["text"]) < 0.3
