"""Testler için DOCX üretici: Word'e gerek yok, DOCX = XML dosyalarından oluşan bir ZIP."""

import io
import zipfile

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

ICERIK_TURLERI = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

KOK_ILISKILERI = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="word/document.xml"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>
</Relationships>"""

BELGE_ILISKILERI = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Target="https://ornek.example.com/rapor" TargetMode="External"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"/>
</Relationships>"""

# Türkçe Word'ün yaptığı gibi: kimlik 'Balk1', ad 'heading 1'
STILLER = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="{W_NS}">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="KonuBal"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Balk1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Balk2"><w:name w:val="heading 2"/></w:style>
</w:styles>"""

CEKIRDEK = """<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Çeyrek Raporu</dc:title></cp:coreProperties>"""


def paragraf(metin: str = '', stil: str | None = None, liste_seviyesi: int | None = None, ic: str | None = None) -> str:
    ppr = ''
    if stil or liste_seviyesi is not None:
        ppr = '<w:pPr>'
        if stil:
            ppr += f'<w:pStyle w:val="{stil}"/>'
        if liste_seviyesi is not None:
            ppr += f'<w:numPr><w:ilvl w:val="{liste_seviyesi}"/><w:numId w:val="1"/></w:numPr>'
        ppr += '</w:pPr>'
    govde = ic if ic is not None else f'<w:r><w:t xml:space="preserve">{metin}</w:t></w:r>'
    return f'<w:p>{ppr}{govde}</w:p>'


def tablo(satirlar: list[list[str]]) -> str:
    xml = '<w:tbl>'
    for satir in satirlar:
        xml += '<w:tr>' + ''.join(f'<w:tc>{paragraf(h)}</w:tc>' for h in satir) + '</w:tr>'
    return xml + '</w:tbl>'


def ornek_govde() -> str:
    karisik = (
        '<w:r><w:t xml:space="preserve">Satışlar </w:t></w:r>'
        '<w:r><w:rPr><w:b/></w:rPr><w:t>yüzde 12</w:t></w:r>'
        '<w:r><w:t xml:space="preserve"> arttı, </w:t></w:r>'
        '<w:r><w:rPr><w:i/></w:rPr><w:t>beklendiği gibi</w:t></w:r>'
        '<w:r><w:t>.</w:t></w:r>'
    )
    baglanti = (
        '<w:r><w:t xml:space="preserve">Ayrıntı: </w:t></w:r>'
        f'<w:hyperlink xmlns:r="{R_NS}" r:id="rId5"><w:r><w:t>tam rapor</w:t></w:r></w:hyperlink>'
    )
    return ''.join(
        [
            paragraf('Çeyrek Raporu', stil='KonuBal'),
            paragraf('Giriş', stil='Balk1'),
            paragraf(ic=karisik),
            paragraf(ic=baglanti),
            paragraf('Öne çıkanlar', stil='Balk2'),
            paragraf('İstanbul şubesi', liste_seviyesi=0),
            paragraf('İzmir şubesi', liste_seviyesi=0),
            paragraf('Karşıyaka ofisi', liste_seviyesi=1),
            tablo([['Şehir', 'Ciro', 'Not'], ['Ankara', '1.200', 'a|b'], ['Bursa', '900']]),
            paragraf('Son paragraf.'),
        ]
    )


def docx_olustur(govde: str | None = None, stiller: bool = True) -> bytes:
    belge = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{W_NS}"><w:body>'
    belge += (govde if govde is not None else ornek_govde()) + '</w:body></w:document>'
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, 'w', zipfile.ZIP_DEFLATED) as arsiv:
        arsiv.writestr('[Content_Types].xml', ICERIK_TURLERI)
        arsiv.writestr('_rels/.rels', KOK_ILISKILERI)
        arsiv.writestr('word/document.xml', belge)
        arsiv.writestr('word/_rels/document.xml.rels', BELGE_ILISKILERI)
        arsiv.writestr('docProps/core.xml', CEKIRDEK)
        if stiller:
            arsiv.writestr('word/styles.xml', STILLER)
    return tampon.getvalue()


def zip_olustur(dosyalar: dict[str, bytes]) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, 'w') as arsiv:
        for ad, veri in dosyalar.items():
            arsiv.writestr(ad, veri)
    return tampon.getvalue()
