"""Her türlü ses girdisini tek biçime getirir: tek kanal, float32, istenen örnekleme (STT için 16 kHz).

WAV kendi okuyucumuzla okunur (ffmpeg gerekmez) ve bizim süzgecimizle yeniden örneklenir; öteki
biçimler (mp3, ogg, m4a…) ffmpeg ile çözülür. Süre sınırı her iki yolda da veri belleğe alınmadan
uygulanır. Kim kullanır: komutlar.py (yaziya, altyazi, degerlendir), sunucu/uygulama.py.
Genişletme: yeni bir girdi kaynağı (ör. mikrofon akışı) → aynı çıktıyı veren yeni bir işlev yazın.
"""

from __future__ import annotations

from pathlib import Path

from ses.hatalar import dosya_hatasi
from ses.ses_isleme.ffmpeg import ffmpeg_ile_coz
from ses.ses_isleme.ses import Dizi, Ses
from ses.ses_isleme.wav import wav_oku
from ses.ses_isleme.yeniden_ornekle import yeniden_ornekle

STT_ORNEKLEME = 16000


def ses_yukle(kaynak: Path | bytes, *, azami_sure: float | None = None) -> Ses:
    """Dosyayı ya da baytları `Ses` olarak yükler (WAV: kendi okuyucu; diğerleri: ffmpeg)."""
    if isinstance(kaynak, bytes):
        bas = kaynak[:16]
    else:
        try:
            with open(kaynak, "rb") as dosya:
                bas = dosya.read(16)
        except OSError as hata:
            raise dosya_hatasi(kaynak, hata) from hata
    if bas[:4] == b"RIFF" and bas[8:12] == b"WAVE":
        return wav_oku(kaynak, azami_sure=azami_sure)
    return ffmpeg_ile_coz(kaynak, ornekleme=STT_ORNEKLEME, kanal=1, azami_sure=azami_sure)


def tek_kanal_hazirla(ses: Ses, ornekleme: int = STT_ORNEKLEME) -> Dizi:
    """Tek kanala indirir ve `ornekleme` Hz'e çevirir."""
    return yeniden_ornekle(ses.mono(), ses.ornekleme, ornekleme)


def stt_girdisi(kaynak: Path | bytes, *, azami_sure: float | None = None) -> Dizi:
    """Yazıya çevirici için hazır girdi: 16 kHz, tek kanal, float32."""
    return tek_kanal_hazirla(ses_yukle(kaynak, azami_sure=azami_sure))
