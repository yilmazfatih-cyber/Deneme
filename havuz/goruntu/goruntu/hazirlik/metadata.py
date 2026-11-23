"""Kişisel üst veri: neler var (rapor) ve üst verisiz yeniden kodlama (temizlik).

Kim kullanır: `hazirlik/batch.py` (`temizle`, `hazirla` komutları) ve sunucu.

Fotoğraflar çoğu kez bilmeden kişisel veri taşır: GPS konumu (ev adresi!), çekim tarihi, cihaz marka/
model ve SERİ NUMARASI, sahibin adı, düzenleme yazılımı, XMP/IPTC açıklamaları, JPEG yorumu, PNG metin
parçaları ve — en sinsisi — EXIF içindeki KÜÇÜK RESİM: kırpılmış bir fotoğrafın EXIF küçük resmi çoğu
kez kırpılmamış ilk hâli gösterir.

Temizlik yöntemi (bkz. docs/KARARLAR.md K05): üst veriyi tek tek silmek yerine pikseller YENİDEN
KODLANIR ve yeni dosyaya yalnız açıkça verilen ayarlar yazılır (kalite, isteğe bağlı ICC renk profili).
Bilinmeyen parça, gömülü küçük resim ya da çok dilli (polyglot) dosya hilesi böylece taşınamaz.
Bedel: JPEG'de küçük bir kalite kaybı; mümkünse kaynağın nicemleme tabloları yeniden kullanılır.
Raporda DEĞER yazılmaz, yalnız "var/yok" yazılır (günlüğe kişisel veri yazılmaz).

Genişletme: yeni bir kişisel alanı yakalamak için `_EXIF_GROUPS` sözlüğüne etiket numarasını ekleyin ve
`tests/test_metadata.py` içindeki işaretli örneğe o etiketi koyun.
"""

from __future__ import annotations

import io
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from PIL import ExifTags, Image

OutputFormat = Literal["jpeg", "png", "webp", "avif"]
PIL_FORMAT: dict[str, str] = {"jpeg": "JPEG", "png": "PNG", "webp": "WEBP", "avif": "AVIF"}
EXTENSION: dict[str, str] = {"jpeg": ".jpg", "png": ".png", "webp": ".webp", "avif": ".avif"}

# Etiket numaraları: IFD0 ve Exif IFD içinde aranır (Pillow ExifTags.Base değerleri).
_EXIF_GROUPS: dict[str, tuple[int, ...]] = {
    "kamera": (0x010F, 0x0110, 0xA430, 0xA431, 0xA433, 0xA434, 0xA435),  # marka, model, seri no…
    "tarih": (0x0132, 0x9003, 0x9004, 0x9010, 0x9011),
    "yazar": (0x013B, 0x8298, 0x9C9D, 0x9C9C, 0x9286, 0x010E),  # sanatçı, telif, açıklama…
    "yazilim": (0x0131, 0x013C),
}
_TECHNICAL_INFO = {
    "dpi",
    "gamma",
    "transparency",
    "icc_profile",
    "exif",
    "xmp",
    "XML:com.adobe.xmp",
    "srgb",
    "chromaticity",
    "aspect",
    "interlace",
    "jfif",
    "jfif_version",
    "jfif_unit",
    "jfif_density",
    "progressive",
    "progression",
    "adobe",
    "adobe_transform",
    "duration",
    "loop",
    "background",
    "version",
    "extension",
    "compression",
    "comment",
    "photoshop",
    "mp",
    "mpoffset",
    "resolution",
    "default_image",
    "disposal",
    "blend",
    "bbox",
    "palette",
    "flags",
    "timestamp",
}


@dataclass(frozen=True)
class MetadataFindings:
    """Bir görüntüde bulunan üst veri türleri (yalnız var/yok; değer saklanmaz)."""

    gps: bool = False
    kamera: bool = False
    tarih: bool = False
    yazar: bool = False
    yazilim: bool = False
    exif_kucuk_resim: bool = False
    uretici_notu: bool = False
    xmp: bool = False
    iptc: bool = False
    yorum: bool = False
    metin_parcalari: tuple[str, ...] = field(default_factory=tuple)
    diger_exif: int = 0
    icc: bool = False
    yon: int = 1

    @property
    def kisisel(self) -> bool:
        """Kişisel veri olabilecek bir şey var mı? (ICC profili ve yön sayılmaz.)"""
        return any(
            (
                self.gps,
                self.kamera,
                self.tarih,
                self.yazar,
                self.yazilim,
                self.exif_kucuk_resim,
                self.uretici_notu,
                self.xmp,
                self.iptc,
                self.yorum,
                self.metin_parcalari,
                self.diger_exif,
            )
        )

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["metin_parcalari"] = list(self.metin_parcalari)
        payload["kisisel"] = self.kisisel
        return payload


def _exif_tags(image: Image.Image) -> tuple[Image.Exif | None, set[int]]:
    try:
        exif = image.getexif()
        tags = set(exif.keys()) | set(exif.get_ifd(ExifTags.IFD.Exif).keys())
    except Exception:  # bozuk EXIF bloğu: var sayılır, temizlikte zaten atılır
        return None, {-1}
    return exif, tags


def inspect_metadata(image: Image.Image) -> MetadataFindings:
    """Açılmış (henüz dönüştürülmemiş) görüntünün üst verisini sınıflandırır."""
    info = image.info
    exif, tags = _exif_tags(image)
    gps = False
    thumbnail = False
    maker_note = 0x927C in tags
    if exif is not None:
        gps = 0x8825 in tags or bool(_safe_ifd(exif, ExifTags.IFD.GPSInfo))
        thumbnail = bool(_safe_ifd(exif, ExifTags.IFD.IFD1))
    groups = {name: bool(tags & set(numbers)) for name, numbers in _EXIF_GROUPS.items()}
    known = {number for numbers in _EXIF_GROUPS.values() for number in numbers}
    harmless = {0x0112, 0x011A, 0x011B, 0x0128, 0x0213, 0x8769, 0x8825, 0xA001, 0xA002, 0xA003}
    other = len(tags - known - harmless - {0x927C}) if tags != {-1} else 1
    text_keys = tuple(
        sorted(str(k) for k, v in info.items() if k not in _TECHNICAL_INFO and isinstance(v, str))
    )
    return MetadataFindings(
        gps=gps,
        exif_kucuk_resim=thumbnail,
        uretici_notu=maker_note,
        xmp=bool(info.get("xmp") or info.get("XML:com.adobe.xmp")),
        iptc=bool(info.get("photoshop")),
        yorum=bool(info.get("comment")),
        metin_parcalari=text_keys,
        diger_exif=other,
        icc=bool(info.get("icc_profile")),
        yon=_orientation(exif),
        **groups,
    )


def _safe_ifd(exif: Image.Exif, ifd: int) -> dict[int, Any]:
    try:
        return dict(exif.get_ifd(ifd))
    except Exception:  # bozuk alt blok
        return {0: 0}


def _orientation(exif: Image.Exif | None) -> int:
    value = exif.get(0x0112, 1) if exif is not None else 1
    return value if isinstance(value, int) and 1 <= value <= 8 else 1


def jpeg_tables(image: Image.Image) -> dict[str, Any]:
    """Kaynak JPEG'in nicemleme tabloları ve alt örnekleme ayarı (yeniden kodlamada kalite korunur)."""
    if image.format not in ("JPEG", "MPO"):
        return {}
    from PIL import JpegImagePlugin

    tables = getattr(image, "quantization", None)
    sampling = JpegImagePlugin.get_sampling(image)
    if not tables or sampling < 0:
        return {}
    return {"qtables": [list(table) for table in tables.values()], "subsampling": sampling}


def encode_clean(
    image: Image.Image,
    fmt: OutputFormat,
    quality: int = 90,
    *,
    icc_profile: bytes | None = None,
    tables: dict[str, Any] | None = None,
    lossless: bool = False,
) -> bytes:
    """Görüntüyü ÜST VERİSİZ kodlar: yalnız burada açıkça verilen ayarlar dosyaya yazılır."""
    clean = image if not image.info else image.copy()
    clean.info = {}
    if fmt == "jpeg" and clean.mode not in ("RGB", "L"):
        clean = clean.convert("RGB")
        clean.info = {}
    params: dict[str, Any] = {}
    if icc_profile:
        params["icc_profile"] = icc_profile
    if fmt == "jpeg":
        params.update(tables or {"quality": quality, "subsampling": 2})
        params.update(optimize=True)
    elif fmt == "png":
        params.update(compress_level=6)
    elif fmt == "webp":
        params.update(lossless=lossless, quality=quality, method=4)
    else:
        params.update(quality=quality)
    buffer = io.BytesIO()
    clean.save(buffer, PIL_FORMAT[fmt], **params)
    return buffer.getvalue()


def keeps_format(source_format: str | None) -> OutputFormat:
    """`temizle` için: kaynak biçimin karşılığı (kayıplı → kayıplı, kayıpsız → PNG)."""
    return {"JPEG": "jpeg", "MPO": "jpeg", "WEBP": "webp", "AVIF": "avif"}.get(
        source_format or "", "png"
    )  # type: ignore[return-value]
