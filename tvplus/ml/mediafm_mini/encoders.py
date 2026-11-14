"""Dondurulmuş, önceden eğitilmiş tek kipli kodlayıcılar (ONNX Runtime, CPU).

  görüntü  openai/clip-vit-base-patch32 — görüntü kulesi (ONNX: Xenova/clip-vit-base-patch32, onnx/vision_model.onnx)
           → `image_embeds` 512 boyut (CLIP ortak uzayı). Ön işleme preprocessor_config.json'dan: kısa kenar 224'e
           bikübik, ortadan 224×224 kırpma, 1/255 ölçek, CLIP ortalama/sapma ile normalleştirme.
  metin    sentence-transformers/clip-ViT-B-32-multilingual-v1 — çok dilli DistilBERT (onnx/model.onnx) + ortalama
           havuzlama (1_Pooling) + 768→512 doğrusal katman (2_Dense, yanlılıksız) → CLIP görüntü uzayına hizalı 512
           boyut; en çok 128 belirteç. Türkçe dahil 50+ dil.
  ses      laion/clap-htsat-unfused — ses kulesi (ONNX: Xenova/clap-htsat-unfused, onnx/audio_model.onnx) →
           `audio_embeds` 512 boyut. Ön işleme ClapFeatureExtractor ayarlarıyla: 48 kHz mono, 1024 nokta FFT,
           480 örnek adım, 64 Slaney mel (50–14000 Hz), güç → dB; 10 sn'den kısa parça tekrarlanarak doldurulur
           ("repeatpad"), uzunu ORTADAN kesilir (özgün "rand_trunc" rastgeledir; burada tekrarlanabilirlik için
           belirlenimci).

Ağırlıklar ilk kullanımda Hugging Face'ten bir kez indirilir (ml/.cache/encoders) ve sabit bir revizyona bağlıdır.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .paths import ENCODER_DIR, USER_AGENT

EMBED_DIM = 512  # üç kodlayıcının da çıktı boyutu


@dataclass(frozen=True)
class HFFile:
    repo: str
    path: str
    revision: str = "main"

    @property
    def url(self) -> str:
        return f"https://huggingface.co/{self.repo}/resolve/{self.revision}/{self.path}"

    @property
    def local(self) -> Path:
        return ENCODER_DIR / self.repo.replace("/", "__") / self.path


CLIP_VISION = HFFile("Xenova/clip-vit-base-patch32", "onnx/vision_model.onnx")
MCLIP_TEXT = HFFile("sentence-transformers/clip-ViT-B-32-multilingual-v1", "onnx/model.onnx")
MCLIP_TOKENIZER = HFFile("sentence-transformers/clip-ViT-B-32-multilingual-v1", "tokenizer.json")
MCLIP_DENSE = HFFile("sentence-transformers/clip-ViT-B-32-multilingual-v1", "2_Dense/model.safetensors")
CLAP_AUDIO = HFFile("Xenova/clap-htsat-unfused", "onnx/audio_model.onnx")
ALL_FILES = (CLIP_VISION, MCLIP_TEXT, MCLIP_TOKENIZER, MCLIP_DENSE, CLAP_AUDIO)

ENCODERS = {
    "visual": {
        "model": "openai/clip-vit-base-patch32",
        "onnx": "Xenova/clip-vit-base-patch32 · onnx/vision_model.onnx",
        "licence": "MIT (OpenAI CLIP)",
        "url": "https://huggingface.co/openai/clip-vit-base-patch32",
    },
    "text": {
        "model": "sentence-transformers/clip-ViT-B-32-multilingual-v1",
        "onnx": "sentence-transformers/clip-ViT-B-32-multilingual-v1 · onnx/model.onnx + 2_Dense",
        "licence": "Apache-2.0",
        "url": "https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1",
    },
    "audio": {
        "model": "laion/clap-htsat-unfused",
        "onnx": "Xenova/clap-htsat-unfused · onnx/audio_model.onnx",
        "licence": "Apache-2.0",
        "url": "https://huggingface.co/laion/clap-htsat-unfused",
    },
}


def ensure(f: HFFile, log=print) -> Path:
    """Dosya yoksa bir kez indirir."""
    if f.local.exists() and f.local.stat().st_size > 0:
        return f.local
    f.local.parent.mkdir(parents=True, exist_ok=True)
    part = f.local.with_suffix(f.local.suffix + ".part")
    req = urllib.request.Request(f.url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=300) as resp, open(part, "wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    part.rename(f.local)
    log(f"  indirildi {f.repo}/{f.path}: {f.local.stat().st_size / 1e6:.0f} MB")
    return f.local


def _session(path: Path, threads: int):
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), sess_options=so, providers=["CPUExecutionProvider"])


def l2n(x: np.ndarray, axis: int = -1) -> np.ndarray:
    n = np.linalg.norm(x, axis=axis, keepdims=True)
    return x / np.maximum(n, 1e-12)


# ───────────── Görüntü ─────────────

CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
CLIP_SIZE = 224


def clip_preprocess(img) -> np.ndarray:
    """PIL görüntüsü → (3, 224, 224) float32 (preprocessor_config.json: resample=3 bikübik, ortadan kırpma)."""
    from PIL import Image

    img = img.convert("RGB")
    w, h = img.size
    s = CLIP_SIZE / min(w, h)
    nw, nh = max(CLIP_SIZE, round(w * s)), max(CLIP_SIZE, round(h * s))
    img = img.resize((nw, nh), Image.BICUBIC)
    left, top = (nw - CLIP_SIZE) // 2, (nh - CLIP_SIZE) // 2
    img = img.crop((left, top, left + CLIP_SIZE, top + CLIP_SIZE))
    a = np.asarray(img, dtype=np.float32) / 255.0
    a = (a - CLIP_MEAN) / CLIP_STD
    return a.transpose(2, 0, 1).copy()


class ImageEncoder:
    def __init__(self, threads: int = 2) -> None:
        self.sess = _session(ensure(CLIP_VISION), threads)
        self.out = "image_embeds"

    def __call__(self, images: list) -> np.ndarray:
        if not images:
            return np.zeros((0, EMBED_DIM), np.float32)
        x = np.stack([clip_preprocess(im) for im in images])
        (y,) = self.sess.run([self.out], {"pixel_values": x})
        return l2n(y.astype(np.float32))


# ───────────── Metin ─────────────

TEXT_MAX_TOKENS = 128


class TextEncoder:
    def __init__(self, threads: int = 2) -> None:
        from safetensors.numpy import load_file
        from tokenizers import Tokenizer

        self.sess = _session(ensure(MCLIP_TEXT), threads)
        self.tok = Tokenizer.from_file(str(ensure(MCLIP_TOKENIZER)))
        self.tok.enable_truncation(TEXT_MAX_TOKENS)
        self.tok.enable_padding(pad_id=0, pad_token="[PAD]")
        dense = load_file(str(ensure(MCLIP_DENSE)))
        self.w = dense["linear.weight"].astype(np.float32)  # (512, 768)
        self.inputs = {i.name for i in self.sess.get_inputs()}

    def __call__(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, EMBED_DIM), np.float32)
        enc = self.tok.encode_batch(texts)
        ids = np.array([e.ids for e in enc], dtype=np.int64)
        mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = np.zeros_like(ids)
        (h,) = self.sess.run(None, feed)[:1]
        m = mask[..., None].astype(np.float32)
        pooled = (h * m).sum(1) / np.maximum(m.sum(1), 1e-9)  # 1_Pooling: ortalama
        return l2n(pooled @ self.w.T)  # 2_Dense: 768 → 512, yanlılık yok, etkinleştirme yok


# ───────────── Ses ─────────────

CLAP_RATE = 48000
CLAP_N_FFT = 1024
CLAP_HOP = 480
CLAP_MELS = 64
CLAP_FMIN, CLAP_FMAX = 50.0, 14000.0
CLAP_SAMPLES = 480000  # 10 sn


def _hz_to_mel_slaney(f: np.ndarray) -> np.ndarray:
    f = np.asarray(f, dtype=np.float64)
    min_log_hz, min_log_mel, logstep = 1000.0, 15.0, 27.0 / np.log(6.4)
    mel = 3.0 * f / 200.0
    return np.where(f >= min_log_hz, min_log_mel + np.log(np.maximum(f, 1e-10) / min_log_hz) * logstep, mel)


def _mel_to_hz_slaney(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float64)
    min_log_hz, min_log_mel, logstep = 1000.0, 15.0, np.log(6.4) / 27.0
    f = 200.0 * m / 3.0
    return np.where(m >= min_log_mel, min_log_hz * np.exp(logstep * (m - min_log_mel)), f)


def mel_filters() -> np.ndarray:
    """(513, 64) Slaney mel süzgeç bankası (transformers `mel_filter_bank(norm='slaney', mel_scale='slaney')`)."""
    n_freq = CLAP_N_FFT // 2 + 1
    mel_pts = np.linspace(_hz_to_mel_slaney(CLAP_FMIN), _hz_to_mel_slaney(CLAP_FMAX), CLAP_MELS + 2)
    filt_f = _mel_to_hz_slaney(mel_pts)
    fft_f = np.linspace(0, CLAP_RATE // 2, n_freq)
    diff = np.diff(filt_f)
    slopes = filt_f[None, :] - fft_f[:, None]
    down = -slopes[:, :-2] / diff[:-1]
    up = slopes[:, 2:] / diff[1:]
    fb = np.maximum(0.0, np.minimum(down, up))
    enorm = 2.0 / (filt_f[2 : CLAP_MELS + 2] - filt_f[:CLAP_MELS])
    return (fb * enorm[None, :]).astype(np.float64)


_MEL = None


def clap_fix_length(wave: np.ndarray) -> np.ndarray:
    """10 sn'ye getirir: kısa parça tekrarlanıp sıfırla doldurulur (repeatpad), uzun parça ortadan kesilir."""
    n = len(wave)
    if n == 0:
        return np.zeros(CLAP_SAMPLES, np.float32)
    if n > CLAP_SAMPLES:
        off = (n - CLAP_SAMPLES) // 2
        return wave[off : off + CLAP_SAMPLES].astype(np.float32)
    reps = CLAP_SAMPLES // n
    out = np.tile(wave, reps)
    return np.pad(out, (0, CLAP_SAMPLES - len(out))).astype(np.float32)


def clap_log_mel(wave: np.ndarray) -> np.ndarray:
    """(1001, 64) log-mel (dB): ortalanmış çerçeveler (yansıtmalı dolgu), periyodik Hann, güç spektrumu."""
    global _MEL
    if _MEL is None:
        _MEL = mel_filters()
    x = np.pad(wave.astype(np.float64), CLAP_N_FFT // 2, mode="reflect")
    n_frames = 1 + (len(x) - CLAP_N_FFT) // CLAP_HOP
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(CLAP_N_FFT) / CLAP_N_FFT)
    idx = np.arange(CLAP_N_FFT)[None, :] + CLAP_HOP * np.arange(n_frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * win, axis=1)) ** 2
    mel = spec @ _MEL
    return (10.0 * np.log10(np.maximum(mel, 1e-10))).astype(np.float32)


class AudioEncoder:
    def __init__(self, threads: int = 2) -> None:
        self.sess = _session(ensure(CLAP_AUDIO), threads)

    def __call__(self, waves: list[np.ndarray]) -> np.ndarray:
        if not waves:
            return np.zeros((0, EMBED_DIM), np.float32)
        feats = np.stack([clap_log_mel(clap_fix_length(w))[None] for w in waves])  # (B, 1, 1001, 64)
        (y,) = self.sess.run(["audio_embeds"], {"input_features": feats})
        return l2n(y.astype(np.float32))


def describe() -> str:
    return json.dumps(ENCODERS, ensure_ascii=False, indent=2)
