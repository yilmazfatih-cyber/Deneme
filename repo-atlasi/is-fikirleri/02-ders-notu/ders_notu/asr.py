"""Altyazı yoksa konuşmayı yazıya dökme (isteğe bağlı): ffmpeg + Whisper (transformers).

transformers API'si huggingface/transformers @ b255688 (2026-11-09, 5.23.0.dev0) klonunda doğrulandı:
- src/transformers/pipelines/__init__.py: pipeline("automatic-speech-recognition", model=..., local_files_only=...).
- src/transformers/pipelines/automatic_speech_recognition.py: girdi dosya yoluysa dosyanın tamamı belleğe okunur ve
  ffmpeg ile çözülür (preprocess, audio_utils.ffmpeg_read); 30 saniyeden uzun seste Whisper kendi uzun biçim
  (long-form) çözümlemesini kullanır (truncation=False); return_timestamps=True çıktısı
  {"text": ..., "chunks": [{"text": ..., "timestamp": (baş, son)}]} biçimindedir.
- src/transformers/models/whisper/generation_whisper.py: language "tr" ya da "turkish" olabilir; 30 saniyeden uzun
  ses için return_timestamps=True gerekir.
Bu ortamda gerçek Whisper modeliyle denenmedi (model ağırlıkları internetten iner); birim test sahte boru kullanır.
"""

import subprocess
from pathlib import Path

from .altyazi import Parca
from .kaynak import KaynakHatasi


def ses_cikar(medya: Path, hedef_klasor: Path, ffmpeg: str = "ffmpeg", zaman_asimi: float = 3 * 3600) -> Path:
    """16 kHz, tek kanal, 16 bit PCM WAV üretir (bir ders saati ≈ 115 MB).

    transformers dosyayı belleğe bütün olarak okuduğu için önce videodan bu küçük WAV çıkarılır.
    """
    wav = (hedef_klasor / f"{medya.stem}.16k.wav").resolve()
    # Mutlak yol: "-" ile başlayan dosya adı ffmpeg seçeneği, "ad:..." biçimli ad protokol sanılmasın.
    komut = [ffmpeg, "-nostdin", "-y", "-loglevel", "error", "-i", str(medya.resolve()), "-vn", "-ac", "1"]
    komut += ["-ar", "16000", "-c:a", "pcm_s16le", str(wav)]
    try:
        subprocess.run(komut, check=True, capture_output=True, timeout=zaman_asimi)
    except FileNotFoundError as hata:
        raise KaynakHatasi("ffmpeg bulunamadı; --asr için ffmpeg kurulu olmalı.") from hata
    except subprocess.TimeoutExpired as hata:
        raise KaynakHatasi(f"ffmpeg {int(zaman_asimi)} saniyede bitmedi; işlem durduruldu.") from hata
    except subprocess.CalledProcessError as hata:
        ayrinti = (hata.stderr or b"").decode("utf-8", errors="replace").strip()[-300:]
        raise KaynakHatasi(f"ffmpeg sesi çıkaramadı: {ayrinti or hata.returncode}") from hata
    return wav


def whisper_ile_yaz(
    wav: Path, model: str = "openai/whisper-small", dil: str = "turkish", boru=None, yalniz_yerel: bool = False
) -> list[Parca]:
    """Whisper çıktısını zaman damgalı parçalara çevirir; konuşma bulunamazsa boş liste döner."""
    if boru is None:
        try:
            from transformers import pipeline  # isteğe bağlı ve büyük bir bağımlılık (torch gerekir)
        except ImportError as hata:
            raise KaynakHatasi("--asr için transformers ve torch gerekir: pip install transformers torch") from hata
        try:  # local_files_only=True: model yalnızca yerel önbellekten ya da klasörden yüklenir, ağa çıkılmaz
            boru = pipeline("automatic-speech-recognition", model=model, local_files_only=yalniz_yerel)
        except (OSError, ValueError, RuntimeError, ImportError) as hata:
            raise KaynakHatasi(f"Whisper modeli yüklenemedi ({model}): {hata}") from hata
    try:
        cikti = boru(str(wav), return_timestamps=True, generate_kwargs={"language": dil, "task": "transcribe"})
    except (OSError, ValueError, RuntimeError) as hata:  # ör. ffmpeg_read: "Soundfile ... malformed"
        raise KaynakHatasi(f"Whisper sesi yazıya dökemedi: {hata}") from hata
    parcalar = []
    for parca in cikti.get("chunks") or []:
        bas, son = parca.get("timestamp") or (None, None)
        bas = float(bas or 0.0)
        son = float(son) if son is not None else bas
        metin = " ".join(str(parca.get("text") or "").split())
        if metin:
            parcalar.append(Parca(bas, max(son, bas), metin))
    if parcalar:
        return parcalar
    metin = " ".join(str(cikti.get("text") or "").split())
    return [Parca(0.0, 0.0, metin)] if metin else []
