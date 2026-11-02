"""Ortak test yardımcıları: ağ gerektirmeyen minik PDF / e-posta / görüntü üreticileri."""

from __future__ import annotations

import zlib
from pathlib import Path

import pytest
from PIL import Image, ImageDraw


def _pdf_escape(text: str) -> bytes:
    # Helvetica WinAnsi: ç ö ü var; ğ ş ı yok -> testlerde yalnızca güvenli karakterler kullanılır
    out = text.encode("cp1252", errors="replace")
    return out.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def make_pdf(pages: list[list[str]], image_pages: int = 0, title: str = "Test Belgesi", image_gray: int = 90) -> bytes:
    """Metin katmanlı sayfalar + istenirse yalnızca görüntü içeren (taranmış gibi) sayfalar üretir."""
    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    page_ids: list[int] = []
    page_objs = []
    for lines in pages:
        stream = b"BT /F1 12 Tf 50 780 Td 16 TL\n"
        for ln in lines:
            stream += b"(" + _pdf_escape(ln) + b") Tj T*\n"
        stream += b"ET"
        content_id = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_objs.append(("text", content_id))
    # görüntü sayfaları: 8x8 gri bir resim, metin yok
    for _ in range(image_pages):
        raw = bytes([image_gray] * 64)
        comp = zlib.compress(raw)
        img_id = add(b"<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n" % len(comp) + comp + b"\nendstream")
        stream = b"q 500 0 0 700 50 50 cm /Im1 Do Q"
        content_id = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_objs.append(("image", content_id, img_id))

    pages_id = len(objects) + len(page_objs) + 1
    for po in page_objs:
        if po[0] == "text":
            res = b"<< /Font << /F1 %d 0 R >> >>" % font_id
            pid = add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources %s /Contents %d 0 R >>" % (pages_id, res, po[1]))
        else:
            res = b"<< /XObject << /Im1 %d 0 R >> >>" % po[2]
            pid = add(b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources %s /Contents %d 0 R >>" % (pages_id, res, po[1]))
        page_ids.append(pid)
    kids = b" ".join(b"%d 0 R" % i for i in page_ids)
    real_pages_id = add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids)))
    assert real_pages_id == pages_id
    info_id = add(b"<< /Title (" + _pdf_escape(title) + b") >>")
    catalog_id = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog_id, info_id, xref)
    return out


def make_image(text: str = "MERHABA", size=(400, 200)) -> Image.Image:
    img = Image.new("RGB", size, "white")
    ImageDraw.Draw(img).text((10, 40), text, fill="black")
    return img


class FakeOCR:
    """Çağrıldığında sabit metin döner; çağrı sayısını tutar."""

    name = "fake"

    def __init__(self, text: str = "Taranmis sayfa metni. Fatura tutari 1.250 TL, son odeme 15 Mart.") -> None:
        self.text = text
        self.calls = 0

    def image_to_text(self, image) -> str:
        self.calls += 1
        assert image.size[0] > 0 and image.size[1] > 0
        return self.text


class EchoGenerator:
    """Sahte dil modeli: istemi kaydeder, biçimli sabit yanıt döner."""

    name = "echo"
    max_input_chars = 10_000

    def __init__(self, reply: str | None = None) -> None:
        self.prompts: list[list[dict]] = []
        self.reply = reply

    def generate(self, messages, max_new_tokens=350):
        self.prompts.append(messages)
        if self.reply is not None:
            return self.reply
        user = messages[-1]["content"]
        if "bölümü 3-5 cümleyle" in user or "section below" in user:
            return "Bölüm özeti: " + user.split("METİN:")[-1].strip()[:80]
        return "ÖZET: Bu bir deneme özetidir.\nMADDELER:\n- Birinci madde\n- İkinci madde\nEYLEMLER:\n- Faturayı 15 Mart'a kadar öde"


@pytest.fixture
def sample_pdf_path(tmp_path: Path) -> Path:
    p = tmp_path / "ornek.pdf"
    p.write_bytes(make_pdf([["Toplanti notu: Proje butcesi onaylandi.", "Teslim tarihi 20 Mayis olarak belirlendi.", "Ekip haftalik rapor gonderecek."]]))
    return p


@pytest.fixture
def scanned_pdf_path(tmp_path: Path) -> Path:
    p = tmp_path / "taranmis.pdf"
    p.write_bytes(make_pdf([["Ilk sayfa metin katmanli ve yeterince uzun bir cumle iceriyor burada."]], image_pages=1))
    return p


SAMPLE_EML = """From: Ayse Yilmaz <ayse@example.com>
To: Mehmet Kaya <mehmet@example.com>
Subject: =?utf-8?b?RmF0dXJhIMO2ZGVtZSBoYXTEsXJsYXRtYXPEsQ==?=
Date: Mon, 3 Mar 2025 10:15:00 +0300
Message-ID: <abc123@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="XYZ"

--XYZ
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: 8bit

Merhaba Mehmet,

Mart ayı faturasının 15 Mart'a kadar ödenmesi gerekiyor. Tutar 1.250 TL.
Ödeme dekontunu bana iletir misin?

Saygılarımla,
Ayşe

> Eski yazışma: bu satır alıntıdır ve kesilmelidir.
> İkinci alıntı satırı.

--XYZ
Content-Type: application/pdf; name="fatura.pdf"
Content-Disposition: attachment; filename="fatura.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--XYZ--
"""


@pytest.fixture
def sample_eml_path(tmp_path: Path) -> Path:
    import base64

    pdf = make_pdf([["Fatura no 2025-031. Tutar 1.250 TL. Son odeme 15 Mart 2025."]], title="Fatura")
    b64 = base64.encodebytes(pdf).decode()
    p = tmp_path / "ornek.eml"
    p.write_text(SAMPLE_EML.replace("{PDF_B64}", b64), encoding="utf-8")
    return p
