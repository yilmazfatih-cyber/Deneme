"""MIME ve başlıklar: stdlib `email`, `email.header` ve `quopri` ile farksal testler; Türkçe;
enjeksiyon.
"""

from __future__ import annotations

import contextlib
import datetime
import email
import email.policy
import quopri
from email.header import decode_header, make_header
from email.message import EmailMessage

import pytest
from hypothesis import given
from hypothesis import strategies as st

from eposta import (
    Attachment,
    HeaderInjectionError,
    MessageFormatError,
    build_message,
    decode_words,
    encode_word,
    format_address,
    parse_message,
    qp_decode,
    qp_encode,
)

FIXED_DATE = datetime.datetime(2026, 11, 16, 9, 0, tzinfo=datetime.UTC)


@pytest.mark.parametrize(
    "text",
    [
        "Merhaba",
        "Toplantı özeti",
        "İĞÜŞÖÇ ığüşöç",
        "çok uzun " * 12 + "konu satırı",
        "emoji 📬 ve =?soru?=",
    ],
)
def test_kodlu_sozcuk_stdlib_ile_ayni(text: str) -> None:
    encoded = encode_word(text)
    assert all(len(word) <= 75 for word in encoded.split(" ") if word.startswith("=?"))
    assert str(make_header(decode_header(encoded))) == text  # stdlib çözücüsü
    assert decode_words(encoded) == text  # bizim çözücümüz


@given(st.text(max_size=120).filter(lambda t: "\r" not in t and "\n" not in t and "\x00" not in t))
def test_kodlu_sozcuk_gidis_donus(text: str) -> None:
    assert decode_words(encode_word(text)) == text


def test_stdlib_q_kodlamasini_cozer() -> None:
    q = str(make_header([("Şubat raporu".encode("iso-8859-9"), "iso-8859-9")]))
    assert q == "Şubat raporu"
    assert decode_words("=?iso-8859-9?q?=DEubat_raporu?=") == "Şubat raporu"
    assert decode_words("=?utf-8?b?bozuk*?= devam") == "=?utf-8?b?bozuk*?= devam"
    assert decode_words("=?bilinmeyen?b?YQ==?=") == "=?bilinmeyen?b?YQ==?="


@pytest.mark.parametrize("bad", ["Konu\r\nBcc: kurban@ornek.test", "a\nb", "a\x00b"])
def test_baslik_enjeksiyonu_reddedilir(bad: str) -> None:
    with pytest.raises(HeaderInjectionError):
        encode_word(bad)
    with pytest.raises(HeaderInjectionError):
        build_message(sender=("", "a@ornek.test"), to=[("", "b@ornek.test")], subject=bad, text="x")


def test_adres_bicimleri() -> None:
    assert format_address("", "a@ornek.test") == "a@ornek.test"
    assert format_address("Ali Veli", "a@ornek.test") == "Ali Veli <a@ornek.test>"
    assert format_address('Veli, "Usta"', "a@ornek.test") == '"Veli, \\"Usta\\"" <a@ornek.test>'
    for bad in ("adres-yok", "a b@ornek.test", "<a@ornek.test>"):
        with pytest.raises(ValueError, match="Geçersiz"):
            format_address("", bad)


@given(st.binary(max_size=300))
def test_quoted_printable_quopri_ile_uyumlu(data: bytes) -> None:
    encoded = qp_encode(data)
    assert all(len(line) <= 76 for line in encoded.split(b"\r\n"))
    expected = data.replace(b"\r\n", b"\n").replace(
        b"\n", b"\r\n"
    )  # satır sonları CRLF'ye normalleşir
    assert quopri.decodestring(encoded) == expected  # stdlib çözücüsü bizim kodlamamızı okur
    assert qp_decode(encoded) == expected
    theirs = quopri.encodestring(data)  # bizim çözücümüz stdlib kodlamasını okur
    assert qp_decode(theirs).replace(b"\r\n", b"\n") == quopri.decodestring(theirs).replace(
        b"\r\n", b"\n"
    )


def make_rich_message() -> bytes:
    return build_message(
        sender=("Ayşe Yılmaz", "ayse@ornek.test"),
        to=[("Mehmet Öz", "mehmet@ornek.test"), ("", "zeynep@ornek.test")],
        subject="Toplantı özeti: Şubat ayı İstanbul planları ve uzun bir konu satırı",
        text="Merhaba,\n.nokta ile başlayan satır\nÇiçekçiye uğradım.\n",
        html="<p>Merhaba <b>Çiçek</b></p>",
        attachments=[
            Attachment("Fatura Şubat.pdf", b"%PDF-1.4 \x00\xff" * 50, "application/pdf"),
            Attachment("notlar.txt", "ğüş".encode(), "text/plain"),
        ],
        date=FIXED_DATE,
        message_id="<1@ornek.test>",
    )


def test_kurdugumuz_ileti_stdlib_ile_okunur() -> None:
    raw = make_rich_message()
    assert all(len(line) <= 998 for line in raw.split(b"\r\n"))
    message = email.message_from_bytes(raw, policy=email.policy.default)
    assert (
        message["subject"] == "Toplantı özeti: Şubat ayı İstanbul planları ve uzun bir konu satırı"
    )
    assert message["from"].addresses[0].display_name == "Ayşe Yılmaz"
    assert [a.addr_spec for a in message["to"].addresses] == [
        "mehmet@ornek.test",
        "zeynep@ornek.test",
    ]
    assert (
        message.get_body(("plain",))
        .get_content()
        .replace("\r\n", "\n")
        .startswith("Merhaba,\n.nokta")
    )
    assert "<b>Çiçek</b>" in message.get_body(("html",)).get_content()
    attachments = {a.get_filename(): a.get_content() for a in message.iter_attachments()}
    assert attachments["Fatura Şubat.pdf"] == b"%PDF-1.4 \x00\xff" * 50
    assert attachments["notlar.txt"] == "ğüş"


def test_kendi_iletimizi_ve_stdlib_iletisini_ayristiririz() -> None:
    ours = parse_message(make_rich_message())
    assert ours.subject.startswith("Toplantı özeti")
    assert ours.text.startswith("Merhaba,\n.nokta ile")
    assert [a.filename for a in ours.attachments] == ["Fatura Şubat.pdf", "notlar.txt"]
    stdlib = EmailMessage()
    stdlib["Subject"] = "Sipariş #42 — kargoya verildi"
    stdlib["From"] = "Mağaza <magaza@ornek.test>"
    stdlib["To"] = "musteri@ornek.test"
    stdlib.set_content("Siparişiniz yola çıktı.\n", charset="iso-8859-9")
    stdlib.add_alternative("<p>Sipariş <i>yolda</i></p>", subtype="html")
    stdlib.add_attachment(
        b"\x89PNG...", maintype="image", subtype="png", filename="kargo fişi ü.png"
    )
    parsed = parse_message(stdlib.as_bytes())
    assert parsed.subject == "Sipariş #42 — kargoya verildi"
    assert parsed.header("from") == "Mağaza <magaza@ornek.test>"
    assert parsed.text == "Siparişiniz yola çıktı.\n"
    assert "<i>yolda</i>" in parsed.html
    assert parsed.attachments[0].filename == "kargo fişi ü.png"
    assert parsed.attachments[0].data == b"\x89PNG..."


def test_ek_adinda_yol_ve_sinirlar() -> None:
    evil = (
        b"Content-Type: multipart/mixed; boundary=s\r\n\r\n--s\r\n"
        b'Content-Disposition: attachment; filename="../../etc/passwd"\r\n\r\nveri\r\n--s--\r\n'
    )
    assert parse_message(evil).attachments[0].filename == "passwd"
    nested = b"Content-Type: multipart/mixed; boundary=b0\r\n\r\n"
    for depth in range(1, 14):  # her düzey bir öncekinin sınırıyla açılan yeni bir multipart
        nested += (
            f"--b{depth - 1}\r\nContent-Type: multipart/mixed; boundary=b{depth}\r\n\r\n".encode()
        )
    with pytest.raises(MessageFormatError):
        parse_message(nested)
    many = (
        b"Content-Type: multipart/mixed; boundary=s\r\n\r\n" + b"--s\r\n\r\nx\r\n" * 150 + b"--s--"
    )
    with pytest.raises(MessageFormatError):
        parse_message(many)


@given(st.binary(max_size=400))
def test_rastgele_ileti_cokertmez(data: bytes) -> None:
    with contextlib.suppress(MessageFormatError):
        parse_message(b"Content-Type: multipart/mixed; boundary=s\r\n\r\n--s\r\n" + data)
