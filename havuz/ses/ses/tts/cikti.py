"""Seslendirme çıktısını istenen biçimde bayta çevirir: wav, pcm, ogg/opus, mp3, flac.

wav (16 bit PCM) ve pcm (ham 16 bit, küçük uçlu, tek kanal, sesin kendi örnekleme hızında — OpenAI'nin
24 kHz'ini bekleyen istemci `ornekleme: 24000` istemeli) ffmpeg'siz; öbürleri ffmpeg ister.
Kim kullanır: komutlar.py, sunucu/uygulama.py. Genişletme: yeni biçim → `MEDYA_TURLERI` + ffmpeg.py
`_KODLAYICILAR` + tests/test_tts.py.
"""

from __future__ import annotations

import numpy as np

from ses.hatalar import BicimHatasi
from ses.ses_isleme.ffmpeg import ffmpeg_ile_kodla
from ses.ses_isleme.ses import Ses, pcm_kodla
from ses.ses_isleme.wav import wav_bayt

MEDYA_TURLERI = {
    "wav": "audio/wav",
    "pcm": "audio/pcm",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
}


def ses_bayt(ses: Ses, bicim: str = "wav") -> tuple[bytes, str]:
    """(baytlar, medya türü). Bilinmeyen biçimde yol gösteren hata."""
    if bicim not in MEDYA_TURLERI:
        raise BicimHatasi(
            f"Bilinmeyen ses biçimi: {bicim}. Seçenekler: {', '.join(MEDYA_TURLERI)}."
        )
    if bicim == "wav":
        return wav_bayt(ses), MEDYA_TURLERI[bicim]
    if bicim == "pcm":
        return pcm_kodla(np.ascontiguousarray(ses.ornekler).reshape(-1), 2), MEDYA_TURLERI[bicim]
    return ffmpeg_ile_kodla(ses, bicim), MEDYA_TURLERI[bicim]
