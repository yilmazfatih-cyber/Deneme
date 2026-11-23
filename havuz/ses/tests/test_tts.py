"""Seslendirme hattı (sahte motorla): hız, perde, cümle arası sessizlik, düzey, çıktı; Piper API'si."""

import dataclasses
import inspect

import numpy as np
import pytest

from ses.hatalar import BicimHatasi, ModelBulunamadiHatasi
from ses.ses_isleme.duzey import lufs, tepe_dbfs
from ses.ses_isleme.ffmpeg import ffmpeg_yolu
from ses.ses_isleme.vad import konusma_bolgeleri
from ses.ses_isleme.wav import wav_oku
from ses.tts.cikti import ses_bayt
from ses.tts.motor import SahteTts, SesAyari
from ses.tts.piper_motoru import SYNTHESIS_ALANLARI, PiperMotoru
from ses.tts.seslendirici import AZAMI_METIN, seslendir


def _baskin_frekans(dizi, ornekleme):
    tayf = np.abs(np.fft.rfft(dizi * np.hanning(len(dizi))))
    return np.argmax(tayf) * ornekleme / len(dizi)


def test_temel_seslendirme_ve_normalizasyon():
    motor = SahteTts()
    ses = seslendir(motor, "Saat 14:30'da 3 kişi.")
    assert motor.metinler == ["Saat on dört otuzda üç kişi."]
    assert ses.kanal == 1 and ses.ornekleme == 22050 and ses.sure > 1.0
    assert abs(lufs(ses.mono(), 22050) + 16.0) < 0.05 and tepe_dbfs(ses.mono()) <= -1.0 + 1e-6
    ham = seslendir(SahteTts(), "3 kişi", SesAyari(normallestir=False, hedef_lufs=None))
    assert ham.sure > 0


def test_cumle_arasi_sessizlik():
    ayar = SesAyari(cumle_arasi_ms=500, bas_son_ms=0, hedef_lufs=None)
    ses = seslendir(SahteTts(), "Bir iki. Üç dört.", ayar)
    bolgeler = konusma_bolgeleri(ses.mono(), ses.ornekleme, pay_ms=0, en_kisa_sessizlik_ms=200)
    assert len(bolgeler) == 2
    bosluk = bolgeler[1].baslangic - bolgeler[0].bitis
    assert 0.48 <= bosluk <= 0.59  # 500 ms + kırpma payı (≤ 2 × 30 ms)


def test_hiz_sureyi_kisaltir():
    yavas = seslendir(SahteTts(), "uzun bir cümle söylüyorum", SesAyari(bas_son_ms=0))
    hizli = seslendir(SahteTts(), "uzun bir cümle söylüyorum", SesAyari(hiz=2.0, bas_son_ms=0))
    assert hizli.sure == pytest.approx(yavas.sure / 2, rel=0.05)


@pytest.mark.parametrize("yarim_ton", [12, -5, 3])
def test_perde_frekansi_kaydirir_sure_korunur(yarim_ton):
    ayar0 = SesAyari(bas_son_ms=0, hedef_lufs=None)
    duz = seslendir(SahteTts(frekans=200), "aaaaaaaaaaaaaaaaaaaa", ayar0)
    kayik = seslendir(SahteTts(frekans=200), "aaaaaaaaaaaaaaaaaaaa", ayar0.model_copy(update={"perde": yarim_ton}))
    beklenen = 200 * 2 ** (yarim_ton / 12)
    assert abs(_baskin_frekans(kayik.mono(), kayik.ornekleme) - beklenen) < 3
    assert kayik.sure == pytest.approx(duz.sure, rel=0.03)


def test_cikti_ornekleme_hizi():
    ses = seslendir(SahteTts(), "merhaba", SesAyari(ornekleme=16000))
    assert ses.ornekleme == 16000


def test_hatalar():
    with pytest.raises(BicimHatasi, match="boş"):
        seslendir(SahteTts(), "   ")
    with pytest.raises(BicimHatasi, match="çok uzun"):
        seslendir(SahteTts(), "a" * (AZAMI_METIN + 1))
    class SessizMotor(SahteTts):
        def cumleler(self, metin, *, uzunluk_olcegi=1.0, konusmaci=None):
            yield np.zeros(1000, np.float32)

    with pytest.raises(BicimHatasi, match="ses üretmedi"):
        seslendir(SessizMotor(), "...")
    with pytest.raises(ValueError):
        SesAyari(hiz=5)


def test_cikti_bicimleri():
    ses = seslendir(SahteTts(), "merhaba dünya")
    wav, tur = ses_bayt(ses, "wav")
    assert tur == "audio/wav" and wav_oku(wav).ornek_sayisi == ses.ornek_sayisi
    pcm, tur = ses_bayt(ses, "pcm")
    assert tur == "audio/pcm" and len(pcm) == 2 * ses.ornek_sayisi
    with pytest.raises(BicimHatasi, match="Bilinmeyen ses biçimi"):
        ses_bayt(ses, "wma")


@pytest.mark.skipif(ffmpeg_yolu() is None, reason="ffmpeg kurulu değil")
def test_ogg_cikti():
    ogg, tur = ses_bayt(seslendir(SahteTts(), "merhaba"), "ogg")
    assert ogg[:4] == b"OggS" and tur == "audio/ogg"


def test_piper_sesi_yoksa_indirme_komutunu_soyler(tmp_path):
    with pytest.raises(ModelBulunamadiHatasi, match="python -m ses indir --tts"):
        PiperMotoru(tmp_path / "yok.onnx")


def test_kurulu_piper_api_si_beklenenle_ayni():
    """piper-tts sürümü değişip API kayarsa hangi adın gittiğini söyler (modelsiz, hızlı)."""
    piper = pytest.importorskip("piper")
    alanlar = {f.name for f in dataclasses.fields(piper.SynthesisConfig)}
    assert set(SYNTHESIS_ALANLARI) <= alanlar, f"SynthesisConfig'te yok: {set(SYNTHESIS_ALANLARI) - alanlar}"
    assert {"config", "session"} <= {f.name for f in dataclasses.fields(piper.PiperVoice)}
    assert "length_scale" in {f.name for f in dataclasses.fields(piper.PiperConfig)}
    assert callable(piper.PiperConfig.from_dict)
    assert "syn_config" in inspect.signature(piper.PiperVoice.synthesize).parameters
    assert "audio_float_array" in {f.name for f in dataclasses.fields(piper.AudioChunk)}
