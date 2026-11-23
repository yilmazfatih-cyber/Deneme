"""Güvenli açma testleri: sınırlar (sıkıştırma bombası dahil), biçim beyaz listesi, bozuk dosya, EXIF yönü
(8 değerin hepsi, EXIF standardından bağımsız numpy tanımıyla), renk kipleri (16 bit, palet, CMYK…)."""

from __future__ import annotations

import io
import struct
import zlib

import numpy as np
import pytest
from PIL import Image

from goruntu.errors import ImageRejectedError
from goruntu.hazirlik.loader import LoadLimits, load_rgb, open_checked
from tests.conftest import corner_image, encode


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png_header_only(width: int, height: int) -> bytes:
    """Başlığı dev boyut söyleyen ama birkaç yüz baytlık PNG (piksel verisi yok sayılır)."""
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    body = zlib.compress(b"\x00" * 64)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", body)
        + _chunk(b"IEND", b"")
    )


@pytest.mark.parametrize("side", [9000, 20000])
def test_sikistirma_bombasi_cozulmeden_reddedilir(side: int) -> None:
    data = png_header_only(side, side)
    assert len(data) < 1000
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(data)
    assert caught.value.reason == "piksel_siniri"
    assert "MP" in str(caught.value)


def test_piksel_siniri_ayarlanabilir() -> None:
    data = encode(Image.new("RGB", (100, 100)))
    assert load_rgb(data, LoadLimits(max_pixels=10_000)).size == (100, 100)
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(data, LoadLimits(max_pixels=9_999))
    assert caught.value.reason == "piksel_siniri"


def test_dosya_boyutu_okumadan_reddedilir(tmp_path) -> None:
    path = tmp_path / "buyuk.png"
    path.write_bytes(encode(Image.new("RGB", (64, 64), (1, 2, 3))))
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(path, LoadLimits(max_bytes=50))
    assert caught.value.reason == "dosya_boyutu"


@pytest.mark.parametrize(
    ("data", "reason"),
    [
        (b"merhaba, ben bir metin dosyasiyim", "taninmadi"),
        (b"", "bos"),
        (b"\x00\x00\x00\x18ftypheic" + b"\x00" * 40, "heic"),
    ],
)
def test_goruntu_olmayan_ve_desteklenmeyen(data: bytes, reason: str) -> None:
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(data)
    assert caught.value.reason == reason


def test_izinsiz_bicim_denenmez() -> None:
    ico = encode(Image.new("RGB", (16, 16)), "ICO")
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(ico)
    assert caught.value.reason == "bicim_izinsiz"
    assert "ICO" in str(caught.value)


def test_yarim_jpeg_bozuk_olarak_reddedilir() -> None:
    rng = np.random.default_rng(0)
    noisy = Image.fromarray(rng.integers(0, 256, (120, 160, 3), dtype=np.uint8))
    data = encode(noisy, "JPEG", quality=90)
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(data[: len(data) // 2])
    assert caught.value.reason == "bozuk"


def test_bulunamayan_dosya(tmp_path) -> None:
    with pytest.raises(ImageRejectedError) as caught:
        load_rgb(tmp_path / "yok.jpg")
    assert caught.value.reason == "dosya_yok"


# EXIF standardına göre: kaydedilmiş ham pikseller R, ekranda U görünmeli. R = ters_dönüşüm(U).
RAW_FROM_UPRIGHT = {
    1: lambda u: u,
    2: lambda u: u[:, ::-1],
    3: lambda u: u[::-1, ::-1],
    4: lambda u: u[::-1, :],
    5: lambda u: u.transpose(1, 0, 2),
    6: lambda u: np.rot90(u, k=1),  # ekranda saat yönünde 90° döndürülür
    7: lambda u: u[::-1, ::-1].transpose(1, 0, 2),
    8: lambda u: np.rot90(u, k=-1),  # ekranda saat yönünün tersine 90° döndürülür
}


@pytest.mark.parametrize("orientation", sorted(RAW_FROM_UPRIGHT))
def test_exif_yonu_her_deger_icin_dogru(orientation: int) -> None:
    upright = np.asarray(corner_image())
    raw = np.ascontiguousarray(RAW_FROM_UPRIGHT[orientation](upright))
    exif = Image.Exif()
    exif[0x0112] = orientation
    data = encode(Image.fromarray(raw), "PNG", exif=exif.tobytes())
    loaded = load_rgb(data)
    assert np.array_equal(np.asarray(loaded), upright)
    assert loaded.info == {}


def test_jpeg_yan_yatmis_telefon_fotografi_duzelir() -> None:
    upright = np.asarray(corner_image(200, 120))
    raw = Image.fromarray(np.ascontiguousarray(np.rot90(upright, k=1)))
    exif = Image.Exif()
    exif[0x0112] = 6
    loaded = np.asarray(load_rgb(encode(raw, "JPEG", quality=95, exif=exif.tobytes())))
    assert loaded.shape == (120, 200, 3)
    assert tuple(loaded[30, 50]) == pytest.approx((255, 0, 0), abs=12)  # sol üst kırmızı
    assert tuple(loaded[90, 150]) == pytest.approx((255, 255, 0), abs=12)  # sağ alt sarı


def test_16_bit_png_olceklenir_beyaza_kirpilmaz() -> None:
    ramp = np.tile(np.linspace(0, 65535, 64).astype(np.uint16), (8, 1))
    data = encode(Image.fromarray(ramp), "PNG")
    naive = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
    assert (naive[..., 0] == 255).mean() > 0.9  # tuzak: düz convert neredeyse bembeyaz
    loaded = np.asarray(load_rgb(data))[..., 0]
    expected = np.rint(ramp / 257.0).astype(np.uint8)
    assert np.abs(loaded.astype(int) - expected.astype(int)).max() <= 1


def test_saydam_palet_beyaz_zemine_oturur() -> None:
    image = Image.new("P", (8, 8), 0)
    image.putpalette([0, 0, 0, 200, 10, 10] + [0] * 762)
    image.paste(1, (0, 0, 4, 8))
    image.info["transparency"] = 0
    loaded = np.asarray(load_rgb(encode(image, "PNG", transparency=0)))
    assert tuple(loaded[0, 0]) == (200, 10, 10)
    assert tuple(loaded[0, 7]) == (255, 255, 255)


@pytest.mark.parametrize("mode", ["L", "LA", "1", "CMYK", "RGBA", "I;16"])
def test_her_kip_rgb_olur(mode: str) -> None:
    image = Image.new(mode, (10, 6))
    fmt = "JPEG" if mode == "CMYK" else "PNG"
    loaded = load_rgb(encode(image, fmt))
    assert loaded.mode == "RGB" and loaded.size == (10, 6)


def test_saydamlik_istenirse_korunur() -> None:
    image = Image.new("RGBA", (4, 4), (10, 20, 30, 0))
    assert load_rgb(encode(image), keep_alpha=True).mode == "RGBA"


def test_acma_pikselleri_cozmez() -> None:
    image = open_checked(png_header_only(300, 200))
    assert image.size == (300, 200)  # başlık okundu, IDAT bozuk olsa da henüz çözülmedi
