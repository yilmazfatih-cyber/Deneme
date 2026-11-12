"""Gerçek markitdown ile entegrasyon testi; kütüphane kurulu değilse atlanır.

Çalıştırmak için: pip install -r requirements.txt (markitdown[pdf,docx,xlsx,xls])
DOCX, PDF ve XLSX dosyaları test sırasında elle üretilir; depoda ikili dosya tutulmaz.
"""

import contextlib
import importlib.util
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from ihale_analizci.__main__ import analiz_et, yaz


def _var(*moduller: str) -> bool:
    return all(importlib.util.find_spec(m) is not None for m in moduller)


# markitdown'ın her biçimi ayrı bir "extra" ister; kısmi kurulumda yalnızca kurulu olanlar sınanır.
MARKITDOWN_VAR = _var("markitdown")
DOCX_VAR = _var("mammoth")
PDF_VAR = _var("pdfminer")
XLSX_VAR = _var("openpyxl", "pandas")


def docx_yaz(yol: Path, paragraflar: list[str]) -> None:
    """En küçük geçerli WordprocessingML paketi."""
    w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    govde = "".join(f"<w:p><w:r><w:t>{escape(p)}</w:t></w:r></w:p>" for p in paragraflar)
    with zipfile.ZipFile(yol, "w") as z:
        z.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/'
            'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
            'relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName='
            '"/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.'
            'document.main+xml"/></Types>',
        )
        z.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/'
            '2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
            '2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        z.writestr("word/document.xml", f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{w}"><w:body>{govde}</w:body></w:document>')


def pdf_yaz(yol: Path, *sayfalar: list[str]) -> None:
    """Helvetica ile her biri bir satır listesi olan sayfalardan PDF. Standart fontta ğ/ş/ı olmadığından metin
    ASCII'dir; bu, bozuk Türkçe karakterli PDF'lerin katla() ile yakalandığını da sınar."""
    font = 3 + 2 * len(sayfalar)
    cocuklar = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(sayfalar)))
    nesneler = ["<< /Type /Catalog /Pages 2 0 R >>", f"<< /Type /Pages /Kids [{cocuklar}] /Count {len(sayfalar)} >>"]
    for i, satirlar in enumerate(sayfalar):
        akis = "BT /F1 11 Tf 50 780 Td 14 TL " + " ".join(f"({s}) Tj T*" for s in satirlar) + " ET"
        nesneler.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 {font} 0 R >> >> "
            f"/Contents {4 + 2 * i} 0 R >>"
        )
        nesneler.append(f"<< /Length {len(akis)} >>\nstream\n{akis}\nendstream")
    nesneler.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    veri, ofsetler = b"%PDF-1.4\n", []
    for i, nesne in enumerate(nesneler, start=1):
        ofsetler.append(len(veri))
        veri += f"{i} 0 obj\n{nesne}\nendobj\n".encode("latin-1")
    xref = len(veri)
    veri += f"xref\n0 {len(nesneler) + 1}\n0000000000 65535 f \n".encode()
    veri += "".join(f"{o:010d} 00000 n \n" for o in ofsetler).encode()
    veri += f"trailer\n<< /Size {len(nesneler) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    yol.write_bytes(veri)


@unittest.skipUnless(MARKITDOWN_VAR, "markitdown kurulu değil (isteğe bağlı entegrasyon testi)")
class MarkItDownEntegrasyonTesti(unittest.TestCase):
    def test_docx_pdf_xlsx_birlikte(self):
        from ihale_analizci.donustur import MarkItDownDonusturucu

        if not (DOCX_VAR or PDF_VAR or XLSX_VAR):
            self.skipTest("markitdown biçim eklentileri (docx/pdf/xlsx) kurulu değil")
        beklenen = set()
        with tempfile.TemporaryDirectory() as gecici:
            klasor = Path(gecici)
            if DOCX_VAR:
                metin = "26.1. Teklif edilen bedelin %3'ünden az olmamak üzere geçici teminat verilir."
                docx_yaz(klasor / "idari.docx", ["Madde 26 - Geçici teminat", metin])
                beklenen.add(("idari.docx", "Geçici teminat", "%3"))
            if PDF_VAR:
                metin = "41.1. Ihale bedelinin %6 orani kadar kesin teminat alinir."
                pdf_yaz(klasor / "sozlesme.pdf", ["Madde 41 - Kesin teminat", metin])
                beklenen.add(("sozlesme.pdf", "Kesin teminat", "%6"))
            if XLSX_VAR:
                from openpyxl import Workbook

                kitap = Workbook()
                sayfa = kitap.active
                sayfa.title = "Istenen belgeler"
                for satir in [("Sıra", "Belge"), (1, "İş deneyim belgesi"), (2, "İmza sirküleri")]:
                    sayfa.append(satir)
                kitap.save(klasor / "belgeler.xlsx")
                beklenen.add(("belgeler.xlsx", "1 | İş deneyim belgesi", ""))

            analiz = analiz_et(klasor, MarkItDownDonusturucu())
            ozet = {(b.birim.dosya, b.baslik, b.deger) for b in analiz.bulgular}
            self.assertLessEqual(beklenen, ozet, analiz.notlar)
            self.assertNotIn(("belgeler.xlsx", "Sıra | Belge", ""), ozet)  # tablo başlığı madde değil

    @unittest.skipUnless(PDF_VAR, "markitdown[pdf] kurulu değil")
    def test_cok_sayfali_pdf_kaynak_satiri_kayitli_dosyayla_ayni(self):
        # pdfminer ikinci sayfanın başına \x0c koyar; eskiden her sayfa satır numarasını bir kaydırıyordu.
        from ihale_analizci.donustur import MarkItDownDonusturucu

        with tempfile.TemporaryDirectory() as gecici:
            girdi, cikti = Path(gecici) / "girdi", Path(gecici) / "cikti"
            girdi.mkdir()
            pdf_yaz(
                girdi / "sartname.pdf",
                ["Kapak", "Ihale dokumani"],
                ["Madde 26 - Gecici teminat", "26.1. Teklif bedelinin %3'u kadar gecici teminat verilir."],
            )
            analiz = analiz_et(girdi, MarkItDownDonusturucu())
            yaz(analiz, cikti)
            kayitli = (cikti / "markdown" / "sartname.pdf.md").read_text(encoding="utf-8").split("\n")
            teminat = [b for b in analiz.bulgular if b.baslik == "Geçici teminat"]
            self.assertEqual(len(teminat), 1, analiz.notlar)
            self.assertIn(teminat[0].birim.metin, kayitli[teminat[0].birim.satir - 1])

    @unittest.skipIf(os.name == "nt", "Windows dosya adında ':' kullanılamaz")
    def test_adres_gibi_gorunen_dosya_adi_yerel_donusturulur(self):
        # convert(str) "http:ornek.html" adını adres sayıp requests ile istek atar ve başarısız olurdu.
        from ihale_analizci.donustur import MarkItDownDonusturucu

        with tempfile.TemporaryDirectory() as gecici, contextlib.chdir(gecici):
            Path("http:ornek.html").write_text("<html><body><h2>Madde 26 - Geçici teminat</h2></body></html>", encoding="utf-8")
            self.assertIn("Madde 26", MarkItDownDonusturucu().markdown(Path("http:ornek.html")))


if __name__ == "__main__":
    unittest.main()
