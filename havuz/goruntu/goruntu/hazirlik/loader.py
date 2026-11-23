"""Güvenli görüntü açma: dosya boyutu, piksel sınırı ve biçim beyaz listesi ÇÖZMEDEN önce denetlenir.

Kim kullanır: paketteki her görüntü okuması (hazırlık, kopya bulma, eğitim, ONNX çıkarımı, sunucu).
Başka hiçbir yerde `Image.open` doğrudan çağrılmaz (kural testi: `tests/test_rules.py`).

Neden: Kullanıcıdan gelen dosya küçük olup açılınca devleşebilir ("sıkıştırma bombası": 50 KB'lık bir
PNG 30 000×30 000 piksel = 2,7 GB RAM). Pillow'un kendi sınırı kaba ve süreç geneli bir ayardır. Burada:
1. Dosya boyutu okunmadan denetlenir (`azami_bayt`).
2. `Image.open(..., formats=…)` yalnız izinli eklentileri dener (EPS gibi dış program çağıran biçimler
   hiç denenmez).
3. Başlıktan okunan genişlik × yükseklik, piksel çözülmeden önce `azami_piksel` ile karşılaştırılır.
4. Yarım/bozuk dosya `ImageRejectedError` olur; iz sürme yerine Türkçe, ne yapılacağını söyleyen ileti.
5. EXIF (ve XMP) yön etiketi uygulanır: telefon fotoğrafları yan yatmış gelmez.
6. 16 bitlik, paletli, CMYK, saydam… her kip RGB'ye (istenirse RGBA) DOĞRU çevrilir. 16 bitlik PNG'yi
   `convert("RGB")` ile çevirmek görüntüyü bembeyaz yapar; burada ölçeklenir.
Dönen görüntünün `info` sözlüğü boştur: üst veri (EXIF, yorum, ICC) kazara yeniden yazılamaz.

Genişletme: yeni bir biçime izin vermek için `ALLOWED_FORMATS`'a Pillow biçim adını ekleyin ve
`tests/test_loader.py` içine o biçimle bir açma testi yazın.
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from goruntu.errors import ImageRejectedError
from goruntu.messages import t

# MPO (çok kareli JPEG, bazı kameralar) JPEG eklentisiyle açılır; ayrıca yazılmaz (Pillow OPEN'da yok).
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF", "AVIF")
DEFAULT_MAX_PIXELS = 50_000_000  # 50 MP: 8160×6120; RGB çözülünce ~150 MB
DEFAULT_MAX_BYTES = 30 * 1024 * 1024
HEIF_BRANDS = (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heim", b"heis")
Source = Path | bytes


@dataclass(frozen=True)
class LoadLimits:
    max_pixels: int = DEFAULT_MAX_PIXELS
    max_bytes: int = DEFAULT_MAX_BYTES
    formats: tuple[str, ...] = ALLOWED_FORMATS


DEFAULT_LIMITS = LoadLimits()


def display_name(source: Source) -> str:
    return source.name if isinstance(source, Path) else t("goruntu.yuklenen")


def _read_bytes(source: Source, limits: LoadLimits) -> bytes:
    name = display_name(source)
    if isinstance(source, Path):
        if not source.is_file():
            raise ImageRejectedError("dosya_yok", t("goruntu.bulunamadi", yol=source))
        size = source.stat().st_size
        if size > limits.max_bytes:
            raise ImageRejectedError("dosya_boyutu", _too_big(name, size, limits))
        data = source.read_bytes()
    else:
        data = source
    if not data:
        raise ImageRejectedError("bos", t("goruntu.bos", ad=name))
    if len(data) > limits.max_bytes:
        raise ImageRejectedError("dosya_boyutu", _too_big(name, len(data), limits))
    return data


def _too_big(name: str, size: int, limits: LoadLimits) -> str:
    return t(
        "goruntu.cok_buyuk_dosya",
        ad=name,
        mb=f"{size / 1024 / 1024:.1f}",
        sinir=f"{limits.max_bytes / 1024 / 1024:.0f}",
    )


def _is_heif(data: bytes) -> bool:
    return data[4:8] == b"ftyp" and data[8:12] in HEIF_BRANDS


def open_checked(source: Source, limits: LoadLimits = DEFAULT_LIMITS) -> Image.Image:
    """Görüntüyü AÇAR ama pikselleri çözmez; boyut, biçim ve piksel sınırını denetler."""
    data = _read_bytes(source, limits)
    name = display_name(source)
    allowed = ", ".join(limits.formats)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter(
                "ignore", Image.DecompressionBombWarning
            )  # sınırı biz denetliyoruz
            image = Image.open(io.BytesIO(data), formats=list(limits.formats))
    except Image.DecompressionBombError as exc:
        raise ImageRejectedError("piksel_siniri", t("goruntu.pil_siniri", ad=name)) from exc
    except UnidentifiedImageError as exc:
        if _is_heif(data):
            raise ImageRejectedError("heic", t("goruntu.heic", ad=name)) from exc
        detected = _detect_any_format(data)
        if detected is not None:
            raise ImageRejectedError(
                "bicim_izinsiz", t("goruntu.bicim_izinsiz", ad=name, bicim=detected, izinli=allowed)
            ) from exc
        raise ImageRejectedError(
            "taninmadi", t("goruntu.taninmadi", ad=name, izinli=allowed)
        ) from exc
    except (OSError, ValueError, SyntaxError) as exc:
        raise ImageRejectedError("bozuk", t("goruntu.bozuk", ad=name, ayrinti=_short(exc))) from exc
    width, height = image.size
    if width <= 0 or height <= 0 or width * height > limits.max_pixels:
        raise ImageRejectedError(
            "piksel_siniri",
            t(
                "goruntu.piksel_siniri",
                ad=name,
                gen=width,
                yuk=height,
                mp=f"{width * height / 1e6:.1f}",
                sinir=f"{limits.max_pixels / 1e6:.0f}",
            ),
        )
    return image


def _detect_any_format(data: bytes) -> str | None:
    """İzinsiz bir biçim mi, yoksa hiç görüntü değil mi? Yalnız başlık okunur, çözülmez."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            probe = Image.open(io.BytesIO(data), formats=["ICO", "PSD", "PPM", "DDS", "PCX"])
        return str(probe.format)
    except Exception:  # tanınmayan her şey: görüntü değil
        return None


def _short(exc: BaseException) -> str:
    return (str(exc).splitlines() or [type(exc).__name__])[0][:200]


def decode(image: Image.Image, name: str, draft_to: tuple[int, int] | None = None) -> Image.Image:
    """Pikselleri çözer ve EXIF/XMP yönünü uygular. `draft_to`: JPEG'i DCT düzeyinde küçültür (hız).

    `draft_to` yalnız boyutun önemli olmadığı yerlerde (özet çıkarma, eğitimde veri artırma) verilir;
    model girdisi üreten değerlendirme/çıkarım yolunda VERİLMEZ (ONNX ile birebirlik bozulmasın).
    """
    try:
        if draft_to is not None and image.format in ("JPEG", "MPO"):
            image.draft("RGB", draft_to)
        image.load()
        oriented = ImageOps.exif_transpose(image)
    except (OSError, ValueError, SyntaxError) as exc:
        raise ImageRejectedError("bozuk", t("goruntu.bozuk", ad=name, ayrinti=_short(exc))) from exc
    return oriented


def orientation_of(image: Image.Image) -> int:
    """EXIF (ya da XMP) yön etiketinin değeri; yoksa 1."""
    try:
        value = image.getexif().get(0x0112, 1)
    except Exception:  # bozuk EXIF bloğu: yön yok sayılır
        return 1
    return value if isinstance(value, int) and 1 <= value <= 8 else 1


def _high_bit_to_l(image: Image.Image) -> Image.Image:
    """16/32 bitlik tam sayı ve kayan noktalı gri görüntüyü 8 bite ölçekler (kırpmak yerine)."""
    array = np.asarray(image)
    if image.mode == "F":
        peak = float(np.nanmax(array)) if array.size else 0.0
        scaled = array * 255.0 if peak <= 1.0 else array
    else:
        peak = float(array.max()) if array.size else 0.0
        scaled = array / 257.0 if peak > 255 else array.astype(np.float64)
    return Image.fromarray(np.clip(np.rint(scaled), 0, 255).astype(np.uint8), mode="L")


def normalize_mode(
    image: Image.Image,
    keep_alpha: bool = False,
    background: tuple[int, int, int] = (255, 255, 255),
    name: str = "",
) -> Image.Image:
    """Her kipi RGB'ye (keep_alpha ise saydamlık varsa RGBA'ya) çevirir; `info` boş yeni görüntü döner."""
    try:
        return _normalize_mode(image, keep_alpha, background)
    except ValueError as exc:
        raise ImageRejectedError("kip", t("goruntu.kip", ad=name or "?", kip=image.mode)) from exc


def _normalize_mode(
    image: Image.Image, keep_alpha: bool, background: tuple[int, int, int]
) -> Image.Image:
    mode = image.mode
    if mode.startswith("I") or mode == "F":
        image = _high_bit_to_l(image)
        mode = "L"
    has_alpha = mode in ("RGBA", "LA", "PA", "RGBa", "La") or (
        mode in ("P", "L", "RGB") and "transparency" in image.info
    )
    if has_alpha:
        rgba = image.convert("RGBA")
        if keep_alpha:
            fresh = rgba
        else:
            canvas = Image.new("RGBA", rgba.size, (*background, 255))
            fresh = Image.alpha_composite(canvas, rgba).convert("RGB")
    else:
        fresh = image.convert("RGB")
    if fresh is image:
        fresh = image.copy()
    fresh.info = {}
    return fresh


def load_rgb(
    source: Source,
    limits: LoadLimits = DEFAULT_LIMITS,
    *,
    keep_alpha: bool = False,
    draft_to: tuple[int, int] | None = None,
) -> Image.Image:
    """Tek adımda: güvenli aç → çöz + yön → RGB(A). Dönen görüntüde üst veri yoktur."""
    opened = open_checked(source, limits)
    name = display_name(source)
    return normalize_mode(decode(opened, name, draft_to), keep_alpha, name=name)
