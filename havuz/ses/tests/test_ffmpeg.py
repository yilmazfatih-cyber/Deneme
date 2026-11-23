"""ffmpeg katmanı: biçim tanıma (ffmpeg'siz), çözme/kodlama ve güvenlik (ffmpeg varsa)."""

import numpy as np
import pytest

from ses.hatalar import BicimHatasi, EksikBagimlilikHatasi, SinirHatasi
from ses.ses_isleme.ffmpeg import bicim_tani, ffmpeg_ile_coz, ffmpeg_ile_kodla, ffmpeg_yolu
from ses.ses_isleme.ses import Ses
from ses.ses_isleme.wav import wav_bayt
from ses.ses_isleme.yukle import ses_yukle, stt_girdisi
from tests.yardimci import sinus

ffmpeg_gerekir = pytest.mark.skipif(ffmpeg_yolu() is None, reason="ffmpeg kurulu değil")


@pytest.mark.parametrize(
    ("bas", "bicim"),
    [(b"RIFF\x00\x00\x00\x00WAVEfmt ", "wav"), (b"OggS\x00\x02", "ogg"), (b"fLaC\x00", "flac"),
     (b"\x1aE\xdf\xa3\x9f", "matroska"), (b"\x00\x00\x00\x1cftypM4A ", "mov"), (b"ID3\x04", "mp3"),
     (b"\xff\xfb\x90\x00", "mp3"), (b"\xff\xf1\x5c\x40", "aac"), (b"#EXTM3U\n", None), (b"", None)],
)  # fmt: skip
def test_bicim_tani(bas, bicim):
    assert bicim_tani(bas) == bicim


def test_ffmpeg_yoksa_yol_gosteren_hata(monkeypatch, tmp_path):
    monkeypatch.setenv("SES_FFMPEG", str(tmp_path / "olmayan-ffmpeg"))
    assert ffmpeg_yolu() is None
    with pytest.raises(EksikBagimlilikHatasi, match="apt install ffmpeg"):
        ffmpeg_ile_coz(b"OggS" + b"\x00" * 100)
    # WAV ffmpeg olmadan da okunur
    wav = wav_bayt(Ses.tek_kanaldan(sinus(440, 0.5, 44100), 44100))
    assert len(stt_girdisi(wav)) == 8000


@ffmpeg_gerekir
@pytest.mark.parametrize("bicim", ["ogg", "mp3", "flac"])
def test_kodla_coz_gidis_donus(bicim):
    ses = Ses.tek_kanaldan(sinus(440, 1.0, 22050, 0.5), 22050)
    bayt = ffmpeg_ile_kodla(ses, bicim)
    assert bicim_tani(bayt[:16]) in {"ogg": ("ogg",), "mp3": ("mp3",), "flac": ("flac",)}[bicim]
    geri = ses_yukle(bayt)
    assert geri.ornekleme == 16000 and abs(geri.sure - 1.0) < 0.1
    tayf = np.abs(np.fft.rfft(geri.mono()))
    assert abs(np.argmax(tayf) * 16000 / len(geri.mono()) - 440) < 5


@ffmpeg_gerekir
def test_cozmede_sure_siniri(tmp_path):
    bayt = ffmpeg_ile_kodla(Ses.tek_kanaldan(np.zeros(16000 * 5, np.float32), 16000), "ogg")
    with pytest.raises(SinirHatasi, match="çok uzun"):
        ffmpeg_ile_coz(bayt, azami_sure=2.0)
    yol = tmp_path / "ses.ogg"
    yol.write_bytes(bayt)
    assert abs(ffmpeg_ile_coz(yol).sure - 5.0) < 0.05


@ffmpeg_gerekir
def test_calma_listesi_ve_bozuk_dosya_reddedilir(tmp_path):
    gizli = tmp_path / "gizli.wav"
    gizli.write_bytes(wav_bayt(Ses.tek_kanaldan(sinus(440, 0.2, 16000), 16000)))
    liste = f"#EXTM3U\n#EXTINF:1,\n{gizli}\n".encode()
    with pytest.raises(BicimHatasi, match="tanınmadı"):
        ffmpeg_ile_coz(liste)  # m3u8/concat okuyucu devreye giremez
    with pytest.raises(BicimHatasi, match="ffmpeg sesi işleyemedi"):
        ffmpeg_ile_coz(b"OggS" + b"\x00" * 200)
    with pytest.raises(BicimHatasi, match="Bilinmeyen çıktı biçimi"):
        ffmpeg_ile_kodla(Ses.tek_kanaldan(np.zeros(10, np.float32), 16000), "wma")
