from conftest import FakeOCR, make_pdf

from ozetci.extract.pdf import extract_pdf, page_needs_ocr


def test_text_layer_pdf(sample_pdf_path):
    doc = extract_pdf(sample_pdf_path)
    assert doc.kind == "pdf"
    assert doc.title == "Test Belgesi"
    assert "Proje butcesi onaylandi" in doc.text
    assert doc.metadata["page_count"] == 1
    assert not doc.needs_ocr


def test_scanned_page_marked_and_ocr_called(scanned_pdf_path):
    doc = extract_pdf(scanned_pdf_path)
    assert doc.pages[0].needs_ocr is False
    assert doc.pages[1].needs_ocr is True and not doc.pages[1].ocr_applied
    assert doc.metadata["pending_ocr_pages"] == 1

    ocr = FakeOCR()
    doc2 = extract_pdf(scanned_pdf_path, ocr=ocr)
    assert ocr.calls == 1
    assert doc2.pages[1].ocr_applied
    assert "Taranmis sayfa metni" in doc2.text
    assert doc2.metadata["ocr_pages"] == 1 and doc2.metadata["pending_ocr_pages"] == 0


def test_bytes_input_and_max_pages():
    data = make_pdf([["Sayfa bir cumlesi yeterince uzun olsun diye uzatildi."], ["Sayfa iki cumlesi de yeterince uzun olsun diye uzatildi."]])
    doc = extract_pdf(data, max_pages=1, source_name="bellek.pdf")
    assert doc.metadata["page_count"] == 1 and doc.source == "bellek.pdf"


def test_page_needs_ocr_heuristics():
    assert page_needs_ocr("")
    assert not page_needs_ocr("12 34 56 78 90 12 34 56 78 90 12 34 56 78 90 12 34 56")  # rakam sayfası geçerli metindir
    assert page_needs_ocr("-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --")  # yalnızca simge
    assert page_needs_ocr("(cid:1)(cid:2)(cid:3)(cid:4)(cid:5)(cid:6) kelime kelime kelime kelime")
    assert not page_needs_ocr("Bu sayfada düzgün bir metin katmanı var ve yeterince uzun bir cümle içeriyor.")


def test_numeric_invoice_page_keeps_text_layer():
    text = "Kalem 1 12.50 TL 3 37.50 TL\nKalem 2 8.00 TL 10 80.00 TL\nToplam 117.50 TL KDV 21.15 TL"
    assert not page_needs_ocr(text)


def test_blank_scanned_page_is_not_sent_to_ocr():
    data = make_pdf([["Metin katmanli ilk sayfa yeterince uzun bir cumle iceriyor."]], image_pages=1, image_gray=255)
    ocr = FakeOCR()
    doc = extract_pdf(data, ocr=ocr)
    assert ocr.calls == 0 and doc.metadata.get("blank_pages") == 1 and doc.pages[1].ocr_applied


def test_render_pixel_cap(scanned_pdf_path):
    import pypdfium2 as pdfium
    from ozetci.extract.pdf import MAX_RENDER_PIXELS, render_page

    pdf = pdfium.PdfDocument(str(scanned_pdf_path))
    img = render_page(pdf, 1, dpi=3000)
    assert img.size[0] * img.size[1] <= MAX_RENDER_PIXELS * 1.01
    pdf.close()
