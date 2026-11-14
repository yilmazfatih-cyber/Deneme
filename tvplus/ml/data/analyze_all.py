"""İndirilen her Commons filmi için uygulamanın kendi çekim çözümlemesini çalıştırır (yalnız ÇALIŞTIRIR; betik
kodlayıcı mühendisine aittir): `npm run analyze:shots -- <videoId> --media <dosya> --note "<kaynak · lisans>"`.
Çıktı content/shots/<videoId>.json + .jpg; yaprak keyframes.json'dan çıkarılır. Var olan çözümleme korunur.

    python -m data.analyze_all
"""

from __future__ import annotations

import subprocess
import sys
import time

from mediafm_mini.paths import ROOT, SHOTS_DIR
from mediafm_mini.sources import FILMS, media_files


def main() -> int:
    for film in FILMS:
        if film.kind != "COMMONS":
            continue
        video, _ = media_files(film)
        if video is None:
            print(f"• {film.title}: medya yok, atlandı")
            continue
        if (SHOTS_DIR / f"{film.video_id}.json").exists():
            print(f"• {film.title}: çözümleme var, atlandı")
            continue
        note = f"Wikimedia Commons: File:{film.source} ({video.stem} VP9 dönüştürmesi) · {film.licence} · {film.author}"
        t0 = time.monotonic()
        r = subprocess.run(["npm", "run", "--silent", "analyze:shots", "--", str(film.video_id), "--media",
                            str(video), "--note", note], cwd=ROOT, capture_output=True, text=True)
        tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
        print(f"• {film.title}: çıkış {r.returncode}, {time.monotonic() - t0:.0f} sn — " + " | ".join(tail), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
