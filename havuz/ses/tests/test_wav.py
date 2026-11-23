"""WAV okuma/yazma: gidiş-dönüş, `wave` başvurusuyla karşılaştırma, elle kurulmuş başlıklar, sınırlar."""

import io
import struct
import wave

import numpy as np
import pytest

from ses.hatalar import BicimHatasi, SinirHatasi
from ses.ses_isleme.ses import Ses, pcm_coz, pcm_kodla
from ses.ses_isleme.wav import wav_bayt, wav_bilgisi, wav_oku, wav_yaz
from tests.yardimci import sinus


def _wav(fmt_govde: bytes, veri: bytes, ara_parcalar: bytes = b"") -> bytes:
    """Elle WAV kurar: RIFF + fmt + (ek parçalar) + data."""
    fmt = b"fmt " + struct.pack("<I", len(fmt_govde)) + fmt_govde
    data = b"data" + struct.pack("<I", len(veri)) + veri + (b"\x00" if len(veri) % 2 else b"")
    govde = b"WAVE" + fmt + ara_parcalar + data
    return b"RIFF" + struct.pack("<I", len(govde)) + govde


def _fmt(kod, kanal, hiz, bit):
    blok = kanal * bit // 8
    return struct.pack("<HHIIHH", kod, kanal, hiz, hiz * blok, blok, bit)


@pytest.mark.parametrize("bit", [16, 24, 32])
@pytest.mark.parametrize("kanal", [1, 2])
def test_gidis_donus(bit, kanal):
    uretec = np.random.default_rng(bit + kanal)
    veri = (uretec.uniform(-0.9, 0.9, size=(1000, kanal))).astype(np.float32)
    ses = Ses(veri, 22050)
    geri = wav_oku(wav_bayt(ses, bit=bit))
    assert geri.ornekleme == 22050 and geri.kanal == kanal and geri.ornek_sayisi == 1000
    assert np.max(np.abs(geri.ornekler - veri)) <= 1.0 / 2 ** (bit - 1) + 1e-7


def test_16_bit_birebir_ve_wave_ile_ayni():
    tam = np.arange(-32768, 32768, 7, dtype=np.int16)
    tampon = io.BytesIO()
    with wave.open(tampon, "wb") as yazici:
        yazici.setnchannels(1)
        yazici.setsampwidth(2)
        yazici.setframerate(16000)
        yazici.writeframes(tam.tobytes())
    bizim = wav_oku(tampon.getvalue())
    with wave.open(io.BytesIO(tampon.getvalue()), "rb") as okuyucu:
        basvuru = np.frombuffer(okuyucu.readframes(okuyucu.getnframes()), "<i2")
    assert np.array_equal(np.round(bizim.mono() * 32768).astype(np.int16), basvuru)
    # yazıp yeniden okuyunca tam sayılar birebir korunur
    assert np.array_equal(wav_oku(wav_bayt(bizim)).ornekler, bizim.ornekler)


def test_kirpma_ve_yuvarlama():
    ham = pcm_kodla(np.array([1.5, -1.5, 0.5, 1.0], np.float32), 2)
    assert list(np.frombuffer(ham, "<i2")) == [32767, -32768, 16384, 32767]


def test_8_bit_isaretsiz():
    wav = _wav(_fmt(1, 1, 8000, 8), bytes([0, 128, 255]))
    assert np.allclose(wav_oku(wav).mono(), [-1.0, 0.0, 127 / 128])


@pytest.mark.parametrize(("bit", "tur"), [(32, "<f4"), (64, "<f8")])
def test_kayan_noktali(bit, tur):
    degerler = np.array([0.0, 0.25, -1.0, 1.25, np.nan], dtype=tur)
    ses = wav_oku(_wav(_fmt(3, 1, 48000, bit), degerler.tobytes()))
    assert np.allclose(
        ses.mono(), [0.0, 0.25, -1.0, 1.25, 0.0]
    )  # NaN sıfırlanır, 1'in üstü korunur


def test_extensible_baslik_ve_ara_parcalar():
    veri = np.array([1000, -1000, 3, 4], "<i2").tobytes()  # 2 kanal × 2 örnek
    alt_bicim = struct.pack("<H", 1) + b"\x00\x00\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71"
    fmt = _fmt(0xFFFE, 2, 44100, 16) + struct.pack("<HHI", 22, 16, 3) + alt_bicim
    liste = b"LIST" + struct.pack("<I", 5) + b"INFOx\x00"  # tek boylu parça + dolgu baytı
    ses = wav_oku(_wav(fmt, veri, liste))
    assert ses.kanal == 2 and ses.ornek_sayisi == 2
    assert np.allclose(ses.ornekler * 32768, [[1000, -1000], [3, 4]])


def test_akisla_yazilmis_ya_da_kesik_dosya():
    veri = np.arange(100, dtype="<i2").tobytes()
    wav = bytearray(_wav(_fmt(1, 1, 16000, 16), veri))
    konum = wav.index(b"data") + 4
    wav[konum : konum + 4] = struct.pack("<I", 0xFFFFFFFF)  # boy bilinmiyor
    assert wav_oku(bytes(wav)).ornek_sayisi == 100
    assert wav_oku(bytes(wav[:-11])).ornek_sayisi == 94  # yarım örnek atılır


def test_sure_siniri_veri_okunmadan():
    wav = wav_bayt(Ses.tek_kanaldan(np.zeros(16000 * 3), 16000))
    assert wav_bilgisi(wav).sure == 3.0
    with pytest.raises(SinirHatasi, match="çok uzun"):
        wav_oku(wav, azami_sure=2.0)


@pytest.mark.parametrize(
    ("veri", "ileti"),
    [
        (b"ID3\x04" + b"\x00" * 40, "WAV dosyası değil"),
        (b"RF64\xff\xff\xff\xffWAVE" + b"\x00" * 40, "RF64"),
        (_wav(_fmt(85, 1, 16000, 16), b"\x00\x00"), "desteklenmeyen"),
        (_wav(_fmt(1, 1, 16000, 12), b"\x00\x00"), "12 bit"),
        (_wav(_fmt(1, 0, 16000, 16), b""), "akla yatkın"),
        (b"RIFF\x04\x00\x00\x00WAVE", "'data' parçası bulunamadı"),
    ],
)
def test_bozuk_dosyalar_turkce_hata(veri, ileti):
    with pytest.raises(BicimHatasi, match=ileti):
        wav_oku(veri)


def test_dosyaya_yaz_ve_oku(tmp_path):
    ses = Ses.tek_kanaldan(sinus(440, 0.1, 16000), 16000)
    yol = tmp_path / "a.wav"
    wav_yaz(yol, ses)
    assert wav_oku(yol).ornek_sayisi == 1600 and wav_oku(str(yol)).ornekleme == 16000
    with pytest.raises(BicimHatasi, match="bulunamadı"):
        wav_oku(tmp_path / "yok.wav")


def test_pcm_coz_24_bit_isaret():
    ham = bytes([0xFF, 0xFF, 0x7F, 0x00, 0x00, 0x80, 0xFF, 0xFF, 0xFF])
    assert np.allclose(pcm_coz(ham, 3), [8388607 / 8388608, -1.0, -1 / 8388608])


def test_ses_dogrulama():
    with pytest.raises(BicimHatasi):
        Ses(np.zeros(10, np.float32), 16000)
    with pytest.raises(BicimHatasi):
        Ses(np.zeros((10, 1), np.float64), 16000)
    stereo = Ses(np.array([[1.0, 0.0], [0.5, 0.5]], np.float32), 8000)
    assert np.allclose(stereo.mono(), [0.5, 0.5]) and stereo.sure == 2 / 8000
