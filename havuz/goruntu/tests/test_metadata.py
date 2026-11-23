"""Kişisel üst veri testleri: GPS, kamera, yazar, XMP, JPEG yorumu, PNG metni bulunur; temizlenmiş
dosyanın BAYTLARINDA bu işaretlerin hiçbiri kalmaz; yön piksellere uygulanır; ICC isteğe bağlı korunur."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import ExifTags, Image, ImageCms, PngImagePlugin

from goruntu.hazirlik.batch import clean_one, prepare_one, PrepareOptions
from goruntu.hazirlik.loader import DEFAULT_LIMITS, decode, load_rgb, normalize_mode, open_checked
from goruntu.hazirlik.metadata import encode_clean, inspect_metadata, jpeg_tables
from tests.conftest import corner_image, encode

SECRETS = [b"GIZLI_SANATCI", b"GIZLI_MARKA", b"GIZLI_XMP_KISI", b"GIZLI_YORUM", b"GIZLI_PNG_YAZAR"]
XMP = (
    b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-'
    b'syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>'
    b"GIZLI_XMP_KISI</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>"
)


def personal_exif(orientation: int = 1) -> bytes:
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "GIZLI_MARKA"
    exif[ExifTags.Base.Model] = "Model X"
    exif[ExifTags.Base.Artist] = "GIZLI_SANATCI"
    exif[ExifTags.Base.Software] = "Duzenleyici 1.0"
    exif[ExifTags.Base.Orientation] = orientation
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "N"
    gps[ExifTags.GPS.GPSLatitude] = (41.0, 1.0, 30.0)
    gps[ExifTags.GPS.GPSLongitudeRef] = "E"
    gps[ExifTags.GPS.GPSLongitude] = (28.0, 58.0, 12.0)
    exif.get_ifd(ExifTags.IFD.Exif)[ExifTags.Base.DateTimeOriginal] = "2026:01:02 03:04:05"
    return exif.tobytes()


def marked_jpeg(orientation: int = 6) -> bytes:
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    return encode(
        corner_image(80, 48), "JPEG", quality=92, exif=personal_exif(orientation), xmp=XMP,
        comment=b"GIZLI_YORUM", icc_profile=icc,
    )  # fmt: skip


def marked_png() -> bytes:
    info = PngImagePlugin.PngInfo()
    info.add_text("Author", "GIZLI_PNG_YAZAR")
    info.add_itxt("XML:com.adobe.xmp", XMP.decode())
    return encode(corner_image(), "PNG", pnginfo=info, exif=personal_exif())


def test_jpeg_bulgulari() -> None:
    findings = inspect_metadata(open_checked(marked_jpeg()))
    assert findings.gps and findings.kamera and findings.yazar and findings.tarih
    assert findings.xmp and findings.yorum and findings.yazilim and findings.icc
    assert findings.yon == 6 and findings.kisisel


def test_png_bulgulari() -> None:
    findings = inspect_metadata(open_checked(marked_png()))
    assert findings.gps and findings.xmp and "Author" in findings.metin_parcalari


def test_temiz_goruntunun_bulgusu_yok() -> None:
    findings = inspect_metadata(open_checked(encode(Image.new("RGB", (8, 8)), "PNG")))
    assert not findings.kisisel and findings.yon == 1


@pytest.mark.parametrize("fmt", ["jpeg", "png", "webp", "avif"])
def test_temiz_kodlamada_hicbir_isaret_kalmaz(fmt: str) -> None:
    opened = open_checked(marked_jpeg())
    image = normalize_mode(decode(opened, "test"))
    data = encode_clean(image, fmt, 90)  # type: ignore[arg-type]
    for secret in SECRETS:
        assert secret not in data
    reopened = Image.open(io.BytesIO(data))
    assert len(reopened.getexif()) == 0
    assert not inspect_metadata(reopened).kisisel


def test_temizlik_yonu_uygular_ve_dosyayi_yazar(tmp_path) -> None:
    source = tmp_path / "foto.jpg"
    source.write_bytes(marked_jpeg(orientation=6))
    outcome = clean_one(source, tmp_path / "cikti" / "foto.jpg", DEFAULT_LIMITS)
    assert outcome.status == "tamam" and outcome.findings["gps"]
    data = outcome.target.read_bytes()
    assert all(secret not in data for secret in SECRETS)
    cleaned = Image.open(outcome.target)
    assert cleaned.size == (48, 80)  # 80×48 yan yatmıştı; pikseller döndürüldü
    assert cleaned.getexif().get(0x0112) is None  # yön etiketi yok: ikinci kez döndürülmez
    assert cleaned.info.get("icc_profile")  # renk profili varsayılan olarak korunur


def test_icc_istenirse_silinir(tmp_path) -> None:
    source = tmp_path / "foto.jpg"
    source.write_bytes(marked_jpeg())
    outcome = clean_one(source, tmp_path / "c" / "foto.jpg", DEFAULT_LIMITS, keep_icc=False)
    assert not Image.open(outcome.target).info.get("icc_profile")


def test_jpeg_nicemleme_tablolari_korunur() -> None:
    opened = open_checked(marked_jpeg())
    tables = jpeg_tables(opened)
    assert tables and tables["subsampling"] in (0, 1, 2)
    data = encode_clean(normalize_mode(decode(opened, "t")), "jpeg", tables=tables)
    assert jpeg_tables(open_checked(data))["qtables"] == tables["qtables"]


def test_yerinde_temizlik_ve_bicim_degisecekse_reddedilir(tmp_path) -> None:
    jpeg = tmp_path / "a.jpg"
    jpeg.write_bytes(marked_jpeg())
    bmp = tmp_path / "b.bmp"
    bmp.write_bytes(encode(Image.new("RGB", (4, 4)), "BMP"))
    assert clean_one(jpeg, jpeg, DEFAULT_LIMITS, in_place=True).status == "tamam"
    assert all(secret not in jpeg.read_bytes() for secret in SECRETS)
    outcome = clean_one(bmp, bmp, DEFAULT_LIMITS, in_place=True)
    assert outcome.status == "reddedildi" and outcome.reason == "yerinde_olmaz"


def test_hazirla_boyutlandirir_temizler_kucuk_resim_yazar(tmp_path) -> None:
    source = tmp_path / "foto.jpg"
    source.write_bytes(marked_jpeg(orientation=6))
    target = tmp_path / "cikti" / "foto.webp"
    options = PrepareOptions(box=(20, 20), mode="sigdir", fmt="webp", thumbnail_edge=10)
    outcome = prepare_one(source, target, options, DEFAULT_LIMITS, "webp")
    assert outcome.status == "tamam"
    result = load_rgb(target)
    assert max(result.size) == 20 and result.height > result.width  # yön düzeltildi, oran korundu
    assert all(secret not in target.read_bytes() for secret in SECRETS)
    assert Image.open(tmp_path / "cikti" / "foto_kucuk.webp").size == (10, 10)


def test_hazirla_bozuk_dosyada_durmaz(tmp_path) -> None:
    source = tmp_path / "bozuk.jpg"
    source.write_bytes(b"bozuk")
    outcome = prepare_one(source, tmp_path / "c.webp", PrepareOptions(), DEFAULT_LIMITS, "webp")
    assert outcome.status == "reddedildi" and outcome.reason == "taninmadi"


def test_gorunur_pikseller_temizlikte_degismez() -> None:
    image = corner_image()
    cleaned = load_rgb(encode_clean(image, "png"))
    assert np.array_equal(np.asarray(cleaned), np.asarray(image))
