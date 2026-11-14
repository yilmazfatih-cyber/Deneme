"""Gerçek medyası alınan açık lisanslı filmlerin kaydı ve indirme yardımcıları.

Yalnız açık lisanslı (CC BY / kamu malı) medya eğitimde kullanılır. Her filmin adı, yapımcısı, lisansı ve kaynak
adresi burada tutulur ve model kartına aynen yazılır.

Kaynaklar:
  * DASH — Sintel ve Tears of Steel: katalogdaki DASH manifestosunun barındırıcısından (≤ 360p görüntü + ses).
  * COMMONS — Wikimedia Commons'taki Blender açık filmleri ve bir kamu malı sessiz film: dosya adının MD5 önekinden
    kurulan `upload.wikimedia.org/.../transcoded/...<boy>.vp9.webm` küçük dönüştürmesi (360p; yoksa 480p / 240p).
"""

from __future__ import annotations

import hashlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .paths import MEDIA_DIR, USER_AGENT

# İki istek arası en az bu kadar beklenir (≈ 1 istek/sn); Wikimedia büyük dosyalarda daha seyrek ister, bu yüzden
# Commons indirmeleri arasında COMMONS_GAP_SEC beklenir ve 429 yanıtında Retry-After'a (yoksa 90 sn) uyulup en çok
# 3 kez yeniden denenir.
REQUEST_GAP_SEC = 1.1
COMMONS_GAP_SEC = 20.0
RETRY_429 = 3
COMMONS_SIZES = ("360p", "480p", "240p")


@dataclass(frozen=True)
class Film:
    video_id: int
    title: str
    author: str
    licence: str
    kind: str  # 'DASH' | 'COMMONS'
    source: str  # DASH: manifesto adresi · COMMONS: dosya adı (File: öneki olmadan)
    page: str  # insanlar için kaynak sayfası

    @property
    def media_dir(self) -> Path:
        return MEDIA_DIR / str(self.video_id)


def commons_page(name: str) -> str:
    return "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(name.replace(" ", "_"))


def commons_transcode_url(name: str, size: str = "360p") -> str:
    """Commons dönüştürme adresi: yol, alt çizgili dosya adının MD5 özetinin ilk 1 ve 2 hanesinden kurulur."""
    n = name.replace(" ", "_")
    h = hashlib.md5(n.encode("utf-8")).hexdigest()
    q = urllib.parse.quote(n)
    return f"https://upload.wikimedia.org/wikipedia/commons/transcoded/{h[0]}/{h[:2]}/{q}/{q}.{size}.vp9.webm"


def _c(video_id: int, title: str, author: str, licence: str, name: str) -> Film:
    return Film(video_id, title, author, licence, "COMMONS", name, commons_page(name))


FILMS: tuple[Film, ...] = (
    Film(
        80010001,
        "Sintel",
        "Blender Foundation (Durian Open Movie Project), yön. Colin Levy",
        "CC BY 3.0",
        "DASH",
        "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd",
        "https://durian.blender.org/",
    ),
    Film(
        80010002,
        "Tears of Steel",
        "Blender Foundation (Mango Open Movie Project), yön. Ian Hubert",
        "CC BY 3.0",
        "DASH",
        "https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd",
        "https://mango.blender.org/",
    ),
    _c(80030001, "Big Buck Bunny", "Blender Foundation | www.bigbuckbunny.org", "CC BY 3.0", "Big Buck Bunny 4K.webm"),
    _c(
        80030002,
        "Elephants Dream",
        "Blender Foundation / Netherlands Media Art Institute",
        "CC BY 2.5",
        "Elephants Dream (2006).webm",
    ),
    _c(
        80030003,
        "Cosmos Laundromat: First Cycle",
        "Blender Foundation (Gooseberry Open Movie Project)",
        "CC BY",
        "Cosmos Laundromat - First Cycle - Official Blender Foundation release.webm",
    ),
    _c(80030004, "Glass Half", "Blender Studio", "CC BY 4.0", "Glass Half - Blender Open Movie-full movie.webm"),
    _c(
        80030006,
        "The Daily Dweebs",
        "Blender Studio",
        "CC BY 4.0",
        "The Daily Dweebs - Blender Open Movie-full movie.webm",
    ),
    _c(80030007, "Spring", "Blender Studio", "CC BY 4.0", "Spring - Blender Open Movie.webm"),
    _c(80030008, "Coffee Run", "Blender Studio", "CC BY 4.0", "Coffee Run - Blender Open Movie-full movie.webm"),
    _c(80030009, "Sprite Fright", "Blender Studio", "CC BY 4.0", "Sprite Fright - Blender Open Movie-full movie.webm"),
    _c(80030010, "Charge", "Blender Studio", "CC BY 4.0", "Charge - Blender Open Movie-full movie.webm"),
    _c(80030011, "Wing It!", "Blender Studio", "CC BY 4.0", "WING IT! - Blender Open Movie-full movie.webm"),
    _c(
        80031101,
        "Caminandes 1: Llama Drama",
        "Blender Foundation, yön. Pablo Vazquez",
        "CC BY",
        "Caminandes- Llama Drama - Short Movie.ogv",
    ),
    _c(
        80031102,
        "Caminandes 2: Gran Dillama",
        "Blender Foundation, yön. Pablo Vazquez",
        "CC BY",
        "Caminandes - Gran Dillama - Blender Foundation's new Open Movie.webm",
    ),
    _c(
        80031103,
        "Caminandes 3: Llamigos",
        "Blender Institute, yön. Pablo Vazquez",
        "CC BY",
        "Caminandes 3 - Llamigos - Blender Animated Short.webm",
    ),
    _c(
        80020001,
        "A Trip to the Moon (Le Voyage dans la Lune)",
        "Georges Méliès (1902)",
        "Kamu malı",
        "Le Voyage dans la Lune (1902).webm",
    ),
)

FILMS_BY_ID = {f.video_id: f for f in FILMS}


class Fetcher:
    """Tek tek, sırayla indirir; her adres bir kez alınır ve diske yazılır (var olan dosya yeniden indirilmez)."""

    def __init__(self, gap_sec: float = REQUEST_GAP_SEC, log=print) -> None:
        self.gap = gap_sec
        self.last = 0.0
        self.requests = 0
        self.bytes = 0
        self.log = log

    def _wait(self) -> None:
        dt = self.last + self.gap - time.monotonic()
        if dt > 0:
            time.sleep(dt)
        self.last = time.monotonic()
        self.requests += 1

    def get(self, url: str, dest: Path, gap: float | None = None) -> Path:
        if dest.exists() and dest.stat().st_size > 0:
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(RETRY_429 + 1):
            try:
                return self._get(url, dest, gap)
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt == RETRY_429:
                    raise
                wait = float(e.headers.get("Retry-After") or 90)
                self.log(f"  429 — {wait:.0f} sn bekleniyor")
                time.sleep(wait)
        raise AssertionError("ulaşılamaz")

    def _get(self, url: str, dest: Path, gap: float | None) -> Path:
        if gap:
            dt = self.last + gap - time.monotonic()
            if dt > 0:
                time.sleep(dt)
        self._wait()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        part = dest.with_suffix(dest.suffix + ".part")
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as fh:
            while chunk := resp.read(1 << 20):
                fh.write(chunk)
        part.rename(dest)
        size = dest.stat().st_size
        self.bytes += size
        self.log(f"  indirildi {dest.name}: {size / 1e6:.1f} MB, {time.monotonic() - t0:.1f} sn")
        return dest


def _mpd_pick(mpd: str, base: str) -> tuple[str, str | None]:
    """DASH manifestosundan ≤ 360p en yüksek görüntü (mp4/H.264 öncelikli) ve ilk ses temsilinin adresleri."""
    reps = re.findall(r"<Representation([^>]*)>(.*?)</Representation>", mpd, flags=re.S)
    videos: list[tuple[int, int, str]] = []
    audio: str | None = None
    for attrs, body in reps:
        m = re.search(r"<BaseURL>([^<]+)</BaseURL>", body)
        if not m:
            continue
        url = urllib.parse.urljoin(base, m.group(1).strip())
        mime = re.search(r'mimeType="([^"]+)"', attrs)
        mime_s = mime.group(1) if mime else ""
        if mime_s.startswith("video/"):
            h = re.search(r'height="(\d+)"', attrs)
            height = int(h.group(1)) if h else 0
            if height <= 400:
                videos.append((height, 1 if mime_s == "video/mp4" else 0, url))
        elif mime_s.startswith("audio/") and audio is None:
            audio = url
    if not videos:
        raise ValueError("uygun görüntü temsili yok")
    videos.sort()
    return videos[-1][2], audio


def fetch_film(film: Film, fetcher: Fetcher) -> Path:
    """Filmin medyasını indirir; dönen yol ffmpeg'e verilecek tek dosyadır (görüntü + ses birlikte ya da görüntü)."""
    d = film.media_dir
    if film.kind == "DASH":
        mpd_file = fetcher.get(film.source, d / "manifest.mpd")
        v_url, a_url = _mpd_pick(mpd_file.read_text("utf-8"), film.source)
        v = fetcher.get(v_url, d / ("video-" + v_url.rsplit("/", 1)[-1]))
        if a_url:
            fetcher.get(a_url, d / ("audio-" + a_url.rsplit("/", 1)[-1]))
        return v
    for size in COMMONS_SIZES:
        dest = d / f"commons-{size}.webm"
        if dest.exists():
            return dest
    last: Exception | None = None
    for size in COMMONS_SIZES:
        try:
            return fetcher.get(commons_transcode_url(film.source, size), d / f"commons-{size}.webm", COMMONS_GAP_SEC)
        except urllib.error.HTTPError as e:  # dönüştürme yoksa sıradaki boyut denenir
            last = e
            if e.code != 404:
                raise
    raise RuntimeError(f"{film.title}: Commons dönüştürmesi bulunamadı ({last})")


def media_files(film: Film) -> tuple[Path | None, Path | None]:
    """İndirilmiş (görüntü, ses) dosyaları; ses ayrı değilse görüntü dosyası sesi de taşır."""
    d = film.media_dir
    if not d.exists():
        return None, None
    vids = sorted(d.glob("video-*")) + sorted(d.glob("commons-*.webm"))
    vids = [p for p in vids if not p.name.endswith(".part")]
    auds = [p for p in sorted(d.glob("audio-*")) if not p.name.endswith(".part")]
    v = vids[0] if vids else None
    return v, (auds[0] if auds else v)
