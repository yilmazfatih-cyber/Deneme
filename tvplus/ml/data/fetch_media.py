"""Açık filmlerin medyasını indirir (sırayla, ≈ 1 istek/sn, her dosya bir kez) → ml/.cache/media/<videoId>/.

    python -m data.fetch_media            # hepsi
    python -m data.fetch_media 80030007   # yalnız biri
"""

from __future__ import annotations

import sys
import time

from mediafm_mini.sources import FILMS, Fetcher, fetch_film


def main(argv: list[str]) -> int:
    wanted = {int(a) for a in argv if a.isdigit()}
    fetcher = Fetcher()
    t0 = time.monotonic()
    failed: list[str] = []
    for film in FILMS:
        if wanted and film.video_id not in wanted:
            continue
        print(f"• {film.title} ({film.video_id}) — {film.kind}")
        try:
            path = fetch_film(film, fetcher)
            print(f"  → {path}")
        except Exception as e:  # bir filmin hatası ötekileri durdurmaz
            print(f"  ! alınamadı: {e}")
            failed.append(film.title)
    print(
        f"{fetcher.requests} istek, {fetcher.bytes / 1e6:.1f} MB indirildi, "
        f"{time.monotonic() - t0:.0f} sn; alınamayan: {failed or 'yok'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
