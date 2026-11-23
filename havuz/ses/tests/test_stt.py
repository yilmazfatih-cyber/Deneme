"""Yazıya çevirme katmanı: uzun ses parçalama, zaman kaydırma, uydurma süzgeci, faster-whisper API'si.

Gerçek model istemez: `SahteStt` ve kurulu faster-whisper paketinin imzaları kullanılır.
"""

import dataclasses
import inspect

import numpy as np
import pytest

from ses.hatalar import ModelBulunamadiHatasi
from ses.stt.motor import SahteStt
from ses.stt.tipler import Bolut, Kelime, Transkript
from ses.stt.uzun import uzun_yaziya
from ses.stt.whisper import TRANSCRIBE_SECENEKLERI, WhisperMotoru
from tests.yardimci import birlestir, patlama, sessizlik

HIZ = 16000


def test_uzun_ses_parcalanir_ve_zamanlar_kayar():
    sinyal = birlestir(sessizlik(1, HIZ), patlama(3, HIZ), sessizlik(2, HIZ), patlama(3, HIZ), sessizlik(1, HIZ))
    motor = SahteStt("bir iki")
    sonuc = uzun_yaziya(motor, sinyal, azami_parca_sn=4)
    assert len(motor.cagrilar) == 2  # sessizlik modele gitmedi; iki parça
    assert [b.baslangic for b in sonuc.bolutler] == pytest.approx([0.9, 5.9], abs=0.05)  # VAD payı 0,1 sn
    assert sonuc.bolutler[1].kelimeler[0].baslangic == sonuc.bolutler[1].baslangic  # sözcükler de kaydı
    assert [b.kimlik for b in sonuc.bolutler] == [0, 1]
    assert sonuc.metin == "bir iki bir iki" and sonuc.sure == pytest.approx(10.0)


def test_sessiz_ses_uyari_verir():
    sonuc = uzun_yaziya(SahteStt(), sessizlik(3, HIZ))
    assert sonuc.bolutler == [] and "konuşma bulunamadı" in sonuc.uyarilar[0]


class _UyduranMotor:
    ad = "uyduran"

    def yaziya(self, ornekler, *, dil="tr", kelime_zamanlari=True, ipucu=None):
        return Transkript(
            sure=len(ornekler) / HIZ,
            bolutler=[
                Bolut(baslangic=0, bitis=1, metin=" Merhaba.", konusma_yok_olasiligi=0.01),
                Bolut(baslangic=1, bitis=2, metin=" Altyazı M.K.", konusma_yok_olasiligi=0.6),
                Bolut(baslangic=2, bitis=3, metin=" İzlediğiniz için teşekkürler!", ort_logolasilik=-0.2),
            ],
        )


def test_bilinen_uydurma_guvensizse_atilir():
    sonuc = uzun_yaziya(_UyduranMotor(), patlama(3, HIZ))
    metinler = [b.metin.strip() for b in sonuc.bolutler]
    assert metinler == ["Merhaba.", "İzlediğiniz için teşekkürler!"]  # güvenli olan kalır
    assert "uydurma" in sonuc.uyarilar[0]


def test_kaydir_ozgun_nesneyi_degistirmez():
    t = Transkript(sure=2, bolutler=[Bolut(baslangic=0.5, bitis=1, metin="a",
                                            kelimeler=[Kelime(baslangic=0.5, bitis=1, metin="a")])])  # fmt: skip
    kayik = t.kaydir(10)
    assert kayik.bolutler[0].kelimeler[0].baslangic == 10.5 and t.bolutler[0].baslangic == 0.5


def test_whisper_modeli_yoksa_indirme_komutunu_soyler(tmp_path):
    with pytest.raises(ModelBulunamadiHatasi, match="python -m ses indir"):
        WhisperMotoru(tmp_path)


def test_kurulu_faster_whisper_api_si_beklenenle_ayni():
    """Paket sürümü değişip API kayarsa bu test hangi adın gittiğini söyler (modelsiz, hızlı)."""
    fw = pytest.importorskip("faster_whisper")
    from faster_whisper.transcribe import Segment, Word

    transcribe = set(inspect.signature(fw.WhisperModel.transcribe).parameters)
    eksik = set(TRANSCRIBE_SECENEKLERI) - transcribe
    assert not eksik, f"faster-whisper.transcribe'da artık yok: {eksik}; ses/stt/whisper.py'yi güncelleyin"
    kurucu = set(inspect.signature(fw.WhisperModel.__init__).parameters)
    assert {"device", "compute_type", "cpu_threads", "num_workers", "local_files_only"} <= kurucu
    assert {"id", "start", "end", "text", "words", "avg_logprob", "no_speech_prob"} <= {
        f.name for f in dataclasses.fields(Segment)
    }
    assert {"start", "end", "word", "probability"} <= {f.name for f in dataclasses.fields(Word)}


def test_sahte_motor_bos_metin():
    sonuc = SahteStt("").yaziya(np.zeros(HIZ, np.float32))
    assert sonuc.bolutler == [] and sonuc.metin == ""
