from pathlib import Path

from conftest import FakeOCR

from ozetci.extract.email import extract_eml, extract_mbox, html_to_text, strip_quotes_and_signature


def test_eml_headers_body_quotes_and_pdf_attachment(sample_eml_path):
    doc = extract_eml(sample_eml_path)
    assert doc.kind == "email"
    assert doc.title == "Fatura ödeme hatırlatması"
    assert "Kimden: Ayse Yilmaz <ayse@example.com>" in doc.text
    assert "Konu: Fatura ödeme hatırlatması" in doc.text
    assert "15 Mart'a kadar ödenmesi gerekiyor" in doc.text
    assert "alıntıdır" not in doc.text  # alıntı kesildi
    assert "Saygılarımla" not in doc.text  # imza kesildi
    assert len(doc.children) == 1 and doc.children[0].kind == "pdf"
    assert "Fatura no 2025-031" in doc.full_text()
    assert "[Ek: fatura.pdf]" in doc.full_text()


def test_html_body_and_windows1254(tmp_path: Path):
    html = "<html><head><style>p{}</style></head><body><p>Merhaba <b>dünya</b></p><ul><li>bir</li><li>iki</li></ul><script>x()</script></body></html>"
    assert html_to_text(html) == "Merhaba dünya\n\n- bir\n- iki"

    raw = ("From: a@b.c\r\nTo: d@e.f\r\nSubject: Deneme\r\nContent-Type: text/html; charset=\"windows-1254\"\r\n"
           "Content-Transfer-Encoding: 8bit\r\n\r\n<p>Ýstanbul'da þiddetli yaðýþ bekleniyor.</p>\r\n").encode("latin-1")
    p = tmp_path / "w.eml"
    p.write_bytes(raw)
    doc = extract_eml(p)
    assert "İstanbul'da şiddetli yağış bekleniyor." in doc.text


def test_strip_quotes_and_signature_variants():
    body = "Merhaba,\n\nRapor ekte.\nSon tarih cuma.\n\nİyi çalışmalar,\nAli\n\nOn Mon, Jan 1, 2025 Ayşe wrote:\n> eski"
    assert strip_quotes_and_signature(body) == "Merhaba,\n\nRapor ekte.\nSon tarih cuma."
    body2 = "Kısa\n-- \nimza"
    # çok az satır kalırsa orijinal korunur
    assert strip_quotes_and_signature(body2) == body2.strip()
    body3 = "Selam,\nToplantı 14:00'te.\nKatılımı onaylar mısın?\n\n1 Oca 2025 tarihinde Ali Veli <ali@x.com> şunları yazdı:\n> alıntı"
    assert "alıntı" not in strip_quotes_and_signature(body3)


def test_mbox_multiple_messages(tmp_path: Path):
    mbox = ("From a@b.c Mon Jan  1 00:00:00 2025\nFrom: a@b.c\nTo: d@e.f\nSubject: Birinci\n\nBirinci ileti govdesi burada.\n\n"
            "From x@y.z Mon Jan  1 00:00:00 2025\nFrom: x@y.z\nTo: d@e.f\nSubject: Ikinci\n\nIkinci ileti govdesi burada.\n")
    p = tmp_path / "kutu.mbox"
    p.write_text(mbox, encoding="utf-8")
    docs = extract_mbox(p)
    assert [d.title for d in docs] == ["Birinci", "Ikinci"]
    assert "Birinci ileti govdesi" in docs[0].text


def test_image_attachment_goes_through_ocr(tmp_path: Path):
    import base64, io
    from conftest import make_image

    buf = io.BytesIO()
    make_image().save(buf, format="PNG")
    raw = ("From: a@b.c\nTo: d@e.f\nSubject: Resim\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"B\"\n\n"
           "--B\nContent-Type: text/plain; charset=utf-8\n\nEkteki görseli inceler misin?\nTeşekkürler.\n\n"
           "--B\nContent-Type: image/png; name=\"ek.png\"\nContent-Disposition: attachment; filename=\"ek.png\"\nContent-Transfer-Encoding: base64\n\n"
           + base64.encodebytes(buf.getvalue()).decode() + "--B--\n")
    p = tmp_path / "r.eml"
    p.write_text(raw, encoding="utf-8")
    ocr = FakeOCR("GORSELDEKI METIN")
    doc = extract_eml(p, ocr=ocr)
    assert ocr.calls == 1
    assert doc.children[0].kind == "image"
    assert "GORSELDEKI METIN" in doc.full_text()


def test_html_quote_containers_are_skipped():
    html = ("<div>Yeni mesaj burada.</div><div class=\"gmail_quote\">1 Oca 2025 Ali yazdı:<blockquote>eski mesaj</blockquote></div>"
            "<div id=\"divRplyFwdMsg\">From: x</div><div>Son satır.</div>")
    assert html_to_text(html) == "Yeni mesaj burada.\n\nSon satır."


def test_mislabeled_latin1_is_redecoded_as_cp1254(tmp_path: Path):
    raw = ("From: a@b.c\r\nTo: d@e.f\r\nSubject: Deneme\r\nContent-Type: text/plain; charset=\"iso-8859-1\"\r\n"
           "Content-Transfer-Encoding: 8bit\r\n\r\nYaðýþ ve þiddet: Iðdýr'da yaðýþ bekleniyor.\r\n").encode("latin-1")
    p = tmp_path / "m.eml"
    p.write_bytes(raw)
    doc = extract_eml(p)
    assert "Yağış ve şiddet: Iğdır'da yağış bekleniyor." in doc.text


def _eml(tmp_path, name, raw: str):
    p = tmp_path / name
    p.write_text(raw, encoding="utf-8")
    return p


def test_nested_multipart_attachment_and_forwarded_rfc822(tmp_path: Path):
    import base64
    from conftest import make_pdf

    pdf_b64 = base64.encodebytes(make_pdf([["Ic ek PDF metni yeterince uzun bir cumle iceriyor."]])).decode()
    raw = ("From: a@b.c\nTo: d@e.f\nSubject: Fwd: Rapor\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary=\"OUT\"\n\n"
           "--OUT\nContent-Type: multipart/alternative; boundary=\"ALT\"\n\n"
           "--ALT\nContent-Type: text/plain; charset=utf-8\n\nİletiyorum, ekteki rapora bakar mısın?\nTeşekkürler\n\n"
           "--ALT\nContent-Type: text/html; charset=utf-8\n\n<p>İletiyorum, ekteki rapora bakar mısın?</p>\n\n--ALT--\n"
           "--OUT\nContent-Type: multipart/mixed; boundary=\"IN\"\n\n"
           "--IN\nContent-Type: application/pdf; name=\"rapor.pdf\"\nContent-Disposition: attachment; filename=\"rapor.pdf\"\nContent-Transfer-Encoding: base64\n\n"
           + pdf_b64 + "\n--IN--\n"
           "--OUT\nContent-Type: message/rfc822\nContent-Disposition: attachment\n\n"
           "From: x@y.z\nTo: a@b.c\nSubject: Orijinal rapor\n\nOrijinal ileti govdesi: butce 12 milyon TL.\n\n--OUT--\n")
    doc = extract_eml(_eml(tmp_path, "fwd.eml", raw))
    kinds = sorted(c.kind for c in doc.children)
    assert kinds == ["email", "pdf"]
    full = doc.full_text()
    assert "Ic ek PDF metni" in full and "butce 12 milyon TL" in full and "Orijinal rapor" in full


def test_interleaved_reply_keeps_answers():
    body = ("On Mon, Jan 1, 2025 Ayşe wrote:\n> Toplantı saat kaçta?\nSaat 14:00'te.\n> Yer neresi?\nAnkara ofisi, 3. kat.\n")
    out = strip_quotes_and_signature(body)
    assert "Saat 14:00'te." in out and "Ankara ofisi" in out and "Toplantı saat kaçta" not in out


def test_top_posted_reply_is_cut_and_ps_recovered():
    body = "Tamam, onaylıyorum.\nYarın gönderirim.\n\nTeşekkürler,\nAli\nNot: fatura numarası 2025-031.\n\nOn Mon Ayşe wrote:\n> eski\n> eski 2\n"
    out = strip_quotes_and_signature(body)
    assert "eski" not in out and "Not: fatura numarası 2025-031." in out and "Ali" not in out


def test_tiny_inline_image_is_skipped(tmp_path: Path):
    import base64, io
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (60, 20), "white").save(buf, format="PNG")
    raw = ("From: a@b.c\nTo: d@e.f\nSubject: Logo\nMIME-Version: 1.0\nContent-Type: multipart/related; boundary=\"B\"\n\n"
           "--B\nContent-Type: text/html; charset=utf-8\n\n<p>Merhaba, deneme.</p><img src=\"cid:logo\">\n\n"
           "--B\nContent-Type: image/png\nContent-ID: <logo>\nContent-Disposition: inline; filename=\"logo.png\"\nContent-Transfer-Encoding: base64\n\n"
           + base64.encodebytes(buf.getvalue()).decode() + "--B--\n")
    ocr = FakeOCR()
    doc = extract_eml(_eml(tmp_path, "logo.eml", raw), ocr=ocr)
    assert ocr.calls == 0 and not doc.children and doc.metadata.get("skipped_inline_images") == 1
