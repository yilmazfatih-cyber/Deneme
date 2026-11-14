"""Çekim başına tek kipli öznitelikler: dondurulmuş kodlayıcılarla hesaplanır, ml/.cache/features altında saklanır.

Her yaprak için bir .npz: `visual`, `audio`, `text` (n × 512, float32, birim uzunluk) ve her biri için `*_ok` maskesi.
Eksik kip (sözde çekimde ses yok, çekimde konuşma yok, görsel yok) maskeyle AÇIKÇA işaretlenir; vektörü sıfırdır ve
model onu hiçbir yerde veri olarak görmez (yerine öğrenilmiş "kip yok" gömmesi girer).
Önbellek anahtarı (imza) çekim aralıkları, metinler, medya dosyası ve kodlayıcı sürümünden kurulur: biri değişirse
o yaprak yeniden hesaplanır, değişmeyen hiçbir şey yeniden hesaplanmaz.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .corpus import Input, keyframe_sources
from .encoders import EMBED_DIM, AudioEncoder, ImageEncoder, TextEncoder, l2n
from .media import decode_audio, frame_times, grab_frame
from .paths import FEATURE_DIR
from .sources import FILMS_BY_ID, media_files
from .stills import load_still, still_path

FEATURE_VERSION = 1
MODALITIES = ("visual", "audio", "text")
FRAMES_PER_SHOT = 3
MAX_AUDIO_SEC = 10.0


@dataclass
class VideoFeatures:
    video_id: int
    visual: np.ndarray
    visual_ok: np.ndarray
    audio: np.ndarray
    audio_ok: np.ndarray
    text: np.ndarray
    text_ok: np.ndarray

    @property
    def n(self) -> int:
        return int(self.visual.shape[0])

    def get(self, m: str) -> tuple[np.ndarray, np.ndarray]:
        return getattr(self, m), getattr(self, f"{m}_ok")


def shot_texts(inp: Input) -> list[str]:
    """Çekim metni. KEYFRAMES yapraklarında çekim metni yoktur; çekim şemasındaki gibi (keyframes.json
    `textSource: 'SYNOPSIS'`) sözde çekimin metni yaprağın özetidir: bölüm/ek video özeti (videoText), filmde başlığın
    özeti. Böylece görseli olmayan yapımlar da en az bir gözlenmiş kiple (metin) temsil edilir."""
    if inp["method"] == "KEYFRAMES":
        t = (inp.get("videoText") or "").strip() or (inp["context"].get("synopsis") or "").strip()
        return [t for _ in inp["shots"]]
    return [(s.get("text") or "").strip() for s in inp["shots"]]


def signature(inp: Input, media: str | None, stills: list[str | None]) -> str:
    h = hashlib.sha256()
    h.update(json.dumps({
        "v": FEATURE_VERSION,
        "method": inp["method"],
        "spans": [[round(s["startSec"], 3), round(s["endSec"], 3)] for s in inp["shots"]],
        "text": shot_texts(inp),
        "media": media,
        "stills": stills,
    }, ensure_ascii=False, sort_keys=True).encode())
    return h.hexdigest()[:24]


def cache_file(video_id: int) -> Path:
    return FEATURE_DIR / f"{video_id}.npz"


def load_cached(video_id: int, sig: str | None = None) -> VideoFeatures | None:
    f = cache_file(video_id)
    if not f.exists():
        return None
    z = np.load(f)
    if sig is not None and str(z["sig"]) != sig:
        return None
    return VideoFeatures(video_id, *(z[k] for k in ("visual", "visual_ok", "audio", "audio_ok", "text", "text_ok")))


class Extractor:
    """Kodlayıcıları tembel yükler (yalnız gerekeni)."""

    def __init__(self, threads: int = 2, offline: bool = False, log=print) -> None:
        self.threads = threads
        self.offline = offline
        self.log = log
        self._img: ImageEncoder | None = None
        self._txt: TextEncoder | None = None
        self._aud: AudioEncoder | None = None
        self._kf = keyframe_sources()

    @property
    def image(self) -> ImageEncoder:
        if self._img is None:
            self._img = ImageEncoder(self.threads)
        return self._img

    @property
    def text(self) -> TextEncoder:
        if self._txt is None:
            self._txt = TextEncoder(self.threads)
        return self._txt

    @property
    def audio(self) -> AudioEncoder:
        if self._aud is None:
            self._aud = AudioEncoder(self.threads)
        return self._aud

    def plan(self, inp: Input) -> tuple[Path | None, Path | None, str | None, list[str | None]]:
        vid = inp["videoId"]
        video = audio = None
        yt: str | None = None
        names: list[str | None] = [None] * len(inp["shots"])
        if inp["method"] == "SCENE_DETECT" and vid in FILMS_BY_ID:
            video, audio = media_files(FILMS_BY_ID[vid])
        if inp["method"] == "KEYFRAMES" and vid in self._kf:
            yt, src = self._kf[vid]
            if len(src) == len(names):
                names = list(src)
        return video, audio, yt, names

    def embed_texts(self, texts: list[str], batch: int = 32) -> np.ndarray:
        out = [self.text(texts[i : i + batch]) for i in range(0, len(texts), batch)]
        return np.concatenate(out) if out else np.zeros((0, EMBED_DIM), np.float32)

    def compute(self, inp: Input, force: bool = False) -> VideoFeatures:
        vid = inp["videoId"]
        video, audio_src, yt, names = self.plan(inp)
        # İmzaya karenin diskte olup olmadığı da girer: sonradan indirilen kare o yaprağı yeniden hesaplatır.
        have = [n if (yt and n and still_path(yt, n, offline=True)) else None for n in names]
        sig = signature(inp, video.name if video else None, have if yt else [])
        if not force and (hit := load_cached(vid, sig)) is not None:
            return hit
        n = len(inp["shots"])
        vis = np.zeros((n, EMBED_DIM), np.float32)
        vis_ok = np.zeros(n, bool)
        aud = np.zeros((n, EMBED_DIM), np.float32)
        aud_ok = np.zeros(n, bool)
        txt = np.zeros((n, EMBED_DIM), np.float32)
        txt_ok = np.zeros(n, bool)

        # Görüntü
        if video is not None:
            for i, s in enumerate(inp["shots"]):
                frames = [f for t in frame_times(s["startSec"], s["endSec"], FRAMES_PER_SHOT)
                          if (f := grab_frame(video, t)) is not None]
                if frames:
                    vis[i] = l2n(self.image(frames).mean(0))
                    vis_ok[i] = True
        elif yt:
            for i, name in enumerate(names):
                if name and (p := still_path(yt, name, self.offline)) is not None:
                    vis[i] = self.image([load_still(p)])[0]
                    vis_ok[i] = True

        # Ses
        if audio_src is not None:
            pcm = decode_audio(audio_src, audio_src.parent / "audio-48k.f32")
            if pcm is not None:
                waves, idx = [], []
                for i, s in enumerate(inp["shots"]):
                    a, b = int(s["startSec"] * 48000), int(s["endSec"] * 48000)
                    seg = np.asarray(pcm[a:b], dtype=np.float32)
                    if len(seg) >= 4800:  # en az 0,1 sn
                        waves.append(seg)
                        idx.append(i)
                for k in range(0, len(waves), 8):
                    e = self.audio(waves[k : k + 8])
                    for j, row in zip(idx[k : k + 8], e):
                        aud[j] = row
                        aud_ok[j] = True

        # Metin
        texts = shot_texts(inp)
        idx = [i for i, t in enumerate(texts) if t]
        if idx:
            e = self.embed_texts([texts[i] for i in idx])
            txt[idx] = e
            txt_ok[idx] = True

        FEATURE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = cache_file(vid).with_suffix(".tmp.npz")
        np.savez(tmp, sig=sig, visual=vis, visual_ok=vis_ok, audio=aud, audio_ok=aud_ok, text=txt, text_ok=txt_ok)
        tmp.rename(cache_file(vid))
        return VideoFeatures(vid, vis, vis_ok, aud, aud_ok, txt, txt_ok)


def context_text(ctx: dict) -> str:
    """[GLOBAL] belirtecinin metin kısmı: özet + anahtar sözcükler (başlık adı bilerek dışarıda: ad bir etiket değil)."""
    s = (ctx.get("synopsis") or "").strip()
    kw = [k for k in ctx.get("keywords") or [] if k]
    return s + (" " + ", ".join(kw) if kw else "")


class SynopsisCache:
    """Özet metni → metin vektörü (sha256 anahtarıyla diskte)."""

    def __init__(self, path: Path = FEATURE_DIR / "synopsis.npz") -> None:
        self.path = path
        self.mem: dict[str, np.ndarray] = {}
        if path.exists():
            z = np.load(path)
            self.mem = {k: z[k] for k in z.files}

    @staticmethod
    def key(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:20]

    def get(self, text: str, extractor: Extractor | None) -> np.ndarray | None:
        if not text:
            return None
        k = self.key(text)
        if k not in self.mem:
            if extractor is None:
                return None
            self.mem[k] = extractor.embed_texts([text])[0]
        return self.mem[k]

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp.npz")
        np.savez(tmp, **self.mem)
        tmp.rename(self.path)
