"""
Hazır ses dosyalarını Piper (açık kaynak, çevrimdışı) Türkçe sesiyle üretir.

Kullanım:
    pip install piper-tts
    npx tsx scripts/audio-texts.ts > metinler.json
    python scripts/make-audio.py metinler.json tr_TR-dfki-medium.onnx

Çıktı:
    public/audio/<dosya>.mp3   — yavaş ve net okunmuş kayıtlar (mono, 32 kb/sn)
    content/audio.json         — { "<anahtar>": "<dosya>" } eşlemesi
Gerekli: ffmpeg.
"""

import json
import os
import subprocess
import sys
import tempfile
import wave

from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "audio")
MANIFEST = os.path.join(ROOT, "content", "audio.json")

# Afazi dostu: biraz yavaş (length_scale > 1), net.
CONFIG = SynthesisConfig(length_scale=1.15, noise_scale=0.5, noise_w_scale=0.6, normalize_audio=True)


def main() -> None:
    texts_path, model_path = sys.argv[1], sys.argv[2]
    with open(texts_path, encoding="utf-8") as f:
        items = json.load(f)
    voice = PiperVoice.load(model_path)
    os.makedirs(OUT, exist_ok=True)

    wanted = {item["file"] for item in items}
    for name in os.listdir(OUT):
        if name.endswith(".mp3") and name not in wanted:
            os.remove(os.path.join(OUT, name))

    manifest = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i, item in enumerate(items, 1):
            target = os.path.join(OUT, item["file"])
            wav_path = os.path.join(tmp, "x.wav")
            with wave.open(wav_path, "wb") as wav:
                voice.synthesize_wav(item["text"], wav, syn_config=CONFIG)
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path,
                 "-af", "adelay=60,apad=pad_dur=0.12",
                 "-ac", "1", "-ar", "22050", "-b:a", "32k", target],
                check=True,
            )
            manifest[item["key"]] = item["file"]
            if i % 100 == 0:
                print(f"{i}/{len(items)}", flush=True)

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(manifest.items())), f, ensure_ascii=False, indent=0)
        f.write("\n")
    print(f"{len(manifest)} ses dosyası üretildi.")


if __name__ == "__main__":
    main()
