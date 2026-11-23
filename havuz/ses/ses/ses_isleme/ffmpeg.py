"""ffmpeg ile çözme (mp3/ogg/m4a/flac/webm/aac → float32) ve kodlama (WAV → ogg/opus, mp3, flac).

Sistemde `ffmpeg` yoksa `EksikBagimlilikHatasi` kurulum komutunu söyler. Güvenlik (yüklenen dosya
güvenilmezdir): biçim baytlardan tanınır ve ffmpeg'e `-f <biçim>` ile AÇIKÇA verilir; tanınmayan
dosya reddedilir. Böylece ffmpeg'in çalma listesi (HLS m3u8, concat) gibi başka dosya/adres açan
okuyucuları devreye giremez; ayrıca `-protocol_whitelist file` ile ağ protokolleri kapalıdır.
Çıktı süresi `-t` ile sınırlanır: küçük ama çok uzun (sıkıştırılmış) dosya belleği dolduramaz.
Kim kullanır: yukle.py, tts/cikti.py. Genişletme: yeni biçim → `bicim_tani` + `_KODLAYICILAR`.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ses.hatalar import BicimHatasi, EksikBagimlilikHatasi, SinirHatasi, dosya_hatasi
from ses.ses_isleme.ses import Ses, pcm_coz, pcm_kodla

ZAMAN_ASIMI_SN = 300.0
_KODLAYICILAR: dict[str, list[str]] = {
    "ogg": ["-c:a", "libopus", "-b:a", "32k", "-f", "ogg"],  # konuşma için opus 32 kbit/sn bol gelir
    "opus": ["-c:a", "libopus", "-b:a", "32k", "-f", "ogg"],
    "mp3": ["-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3"],
    "flac": ["-c:a", "flac", "-f", "flac"],
}
KODLANABILIR = tuple(_KODLAYICILAR)
_KURULUM = (
    "ffmpeg bulunamadı. Kurun: Ubuntu/Debian 'sudo apt install ffmpeg', macOS 'brew install ffmpeg', "
    "Windows 'winget install ffmpeg' (ya da SES_FFMPEG=<ffmpeg yolu>). "
    "Yalnız WAV kullanacaksanız ffmpeg gerekmez."
)


def ffmpeg_yolu() -> str | None:
    """ffmpeg'in yolu: SES_FFMPEG ortam değişkeni (dosya varsa) ya da PATH; yoksa None."""
    ozel = os.environ.get("SES_FFMPEG")
    if ozel:
        return ozel if Path(ozel).is_file() else None
    return shutil.which("ffmpeg")


def _ffmpeg() -> str:
    yol = ffmpeg_yolu()
    if not yol:
        raise EksikBagimlilikHatasi(_KURULUM)
    return yol


def bicim_tani(bas: bytes) -> str | None:
    """İlk baytlardan kap biçimi (ffmpeg okuyucu adı): wav, ogg, flac, matroska, mov, mp3, aac."""
    if bas[:4] in (b"RIFF", b"RF64", b"BW64") and bas[8:12] == b"WAVE":
        return "wav"
    if bas[:4] == b"OggS":
        return "ogg"
    if bas[:4] == b"fLaC":
        return "flac"
    if bas[:4] == b"\x1aE\xdf\xa3":
        return "matroska"  # webm, mkv
    if bas[4:8] == b"ftyp":
        return "mov"  # mp4, m4a, 3gp
    if bas[:3] == b"ID3":
        return "mp3"
    if len(bas) >= 2 and bas[0] == 0xFF and (bas[1] & 0xE0) == 0xE0:
        return "aac" if (bas[1] >> 1) & 0x03 == 0 else "mp3"  # ADTS'de katman bitleri 00
    return None


def _calistir(komut: list[str], girdi: bytes | None, zaman_asimi: float) -> bytes:
    try:
        sonuc = subprocess.run(komut, input=girdi, capture_output=True, timeout=zaman_asimi, check=False)
    except subprocess.TimeoutExpired as hata:
        raise SinirHatasi(f"ffmpeg {zaman_asimi:.0f} sn içinde bitiremedi; dosyayı bölün.") from hata
    if sonuc.returncode != 0:
        son_satir = sonuc.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or ["?"]
        raise BicimHatasi(f"ffmpeg sesi işleyemedi: {son_satir[0][:300]}")
    return sonuc.stdout


def ffmpeg_ile_coz(
    kaynak: bytes | Path,
    *,
    ornekleme: int = 16000,
    kanal: int = 1,
    azami_sure: float | None = None,
    zaman_asimi: float = ZAMAN_ASIMI_SN,
) -> Ses:
    """Ses dosyasını çözer → `Ses` (float32, istenen hız ve kanal; dönüştürmeyi ffmpeg yapar)."""
    with tempfile.TemporaryDirectory(prefix="ses-") as klasor:
        if isinstance(kaynak, bytes):
            yol = Path(klasor) / "girdi"
            yol.write_bytes(kaynak)
        else:
            yol = Path(kaynak)
        try:
            with open(yol, "rb") as dosya:
                bicim = bicim_tani(dosya.read(16))
        except OSError as hata:
            raise dosya_hatasi(yol, hata) from hata
        if bicim is None:
            raise BicimHatasi(
                "Ses biçimi tanınmadı. Desteklenenler: wav, mp3, ogg/opus, flac, m4a/mp4, webm, aac."
            )
        komut = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error",
                 "-protocol_whitelist", "file", "-f", bicim, "-i", str(yol),
                 "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", str(kanal), "-ar", str(ornekleme),
                 "-f", "s16le", "-acodec", "pcm_s16le"]  # fmt: skip
        if azami_sure is not None:
            komut += ["-t", f"{azami_sure + 1:.3f}"]
        ham = _calistir([*komut, "pipe:1"], None, zaman_asimi)
    duz = pcm_coz(ham, 2)
    ornek = len(duz) // kanal
    ses = Ses(duz[: ornek * kanal].reshape(ornek, kanal), ornekleme)
    if azami_sure is not None and ses.sure > azami_sure:
        raise SinirHatasi(f"Ses çok uzun (sınır {azami_sure:.0f} sn). Dosyayı bölün.")
    return ses


def ffmpeg_ile_kodla(ses: Ses, bicim: str, *, zaman_asimi: float = ZAMAN_ASIMI_SN) -> bytes:
    """`Ses`'i istenen biçime kodlar: ogg/opus (Ogg içinde Opus), mp3, flac → baytlar."""
    if bicim not in _KODLAYICILAR:
        raise BicimHatasi(f"Bilinmeyen çıktı biçimi: {bicim}. Seçenekler: wav, {', '.join(KODLANABILIR)}.")
    komut = [_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error",
             "-f", "s16le", "-ar", str(ses.ornekleme), "-ac", str(ses.kanal), "-i", "pipe:0",
             *_KODLAYICILAR[bicim], "pipe:1"]  # fmt: skip
    ham = pcm_kodla(np.ascontiguousarray(ses.ornekler).reshape(-1), 2)
    return _calistir(komut, ham, zaman_asimi)
