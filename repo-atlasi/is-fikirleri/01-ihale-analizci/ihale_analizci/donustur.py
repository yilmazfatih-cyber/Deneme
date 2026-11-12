"""Belgeyi Markdown'a çevirme: markitdown varsa onu, yoksa yerel yedeği kullanır.

markitdown API'si (microsoft/markitdown @ ed17895, packages/markitdown/src/markitdown/_markitdown.py ve
_base_converter.py):
    MarkItDown(enable_plugins=False).convert_local(yol) -> DocumentConverterResult
    sonuc.markdown  (text_content eski adıdır)

convert() yerine convert_local() kullanılır: convert(str) "http:", "https:", "file:" ya da "data:" ile başlayan
bir dizgeyi adres sayıp convert_uri()'ye gönderir (http/https için requests ile istek atar). Yerel dosya adı hiçbir
zaman adres olarak yorumlanmamalı.
"""

import zipfile
from html.parser import HTMLParser
from pathlib import Path

MARKITDOWN_UZANTILARI = {".pdf", ".docx", ".xlsx", ".xls", ".pptx", ".html", ".htm", ".md", ".txt", ".csv"}
YEREL_UZANTILAR = {".md", ".txt", ".html", ".htm"}
EN_BUYUK_BAYT = 50 * 1024 * 1024  # tek belge için varsayılan üst sınır (--en-buyuk-mb)
_OOXML = {".docx", ".xlsx", ".pptx"}  # zip paketidir; açılmış boyutu ayrıca denetlenir


class DonusturmeHatasi(Exception):
    pass


def boyut_denetle(yol: Path, en_buyuk: int = EN_BUYUK_BAYT) -> None:
    """Çok büyük dosyayı ve açıldığında şişen (zip bombası) Office paketini dönüştürmeden reddeder."""
    boyut = yol.stat().st_size
    if boyut > en_buyuk:
        raise DonusturmeHatasi(f"{yol.name}: {boyut} bayt; üst sınır {en_buyuk} bayt (--en-buyuk-mb ile değiştirin)")
    if yol.suffix.lower() in _OOXML:
        try:
            with zipfile.ZipFile(yol) as paket:
                acik = sum(bilgi.file_size for bilgi in paket.infolist())
        except (zipfile.BadZipFile, OSError) as hata:
            raise DonusturmeHatasi(f"{yol.name}: Office paketi açılamadı ({hata})") from hata
        if acik > 10 * en_buyuk:
            raise DonusturmeHatasi(f"{yol.name}: açılmış içerik {acik} bayt; zip bombası olabilir, işlenmedi")


def metin_oku(yol: Path) -> str:
    """BOM'lu UTF-16'yı (Not Defteri "Unicode") tanır; UTF-8 dener, olmazsa Türkçe Windows kodlamasına (cp1254) düşer."""
    veri = yol.read_bytes()
    if veri.startswith((b"\xff\xfe", b"\xfe\xff")):
        return veri.decode("utf-16", errors="replace")
    try:
        return veri.decode("utf-8-sig")
    except UnicodeDecodeError:
        return veri.decode("cp1254", errors="replace")


class YerelDonusturucu:
    """Bağımlılıksız yedek: yalnızca .md, .txt ve .html."""

    ad = "yerel"
    uzantilar = YEREL_UZANTILAR

    def markdown(self, yol: Path) -> str:
        uzanti = yol.suffix.lower()
        if uzanti in (".md", ".txt"):
            return metin_oku(yol)
        if uzanti in (".html", ".htm"):
            return html_markdowna(metin_oku(yol))
        raise DonusturmeHatasi(f"{yol.name}: bu biçim için 'pip install -r requirements.txt' (markitdown) gerekli")


class MarkItDownDonusturucu:
    ad = "markitdown"
    uzantilar = MARKITDOWN_UZANTILARI

    def __init__(self, md=None):
        if md is None:
            from markitdown import MarkItDown  # isteğe bağlı bağımlılık

            md = MarkItDown(enable_plugins=False)
        self._md = md

    def markdown(self, yol: Path) -> str:
        try:
            return self._md.convert_local(str(yol)).markdown
        except Exception as hata:  # markitdown kendi istisna türlerini fırlatır (MissingDependency, FileConversion...)
            raise DonusturmeHatasi(f"{yol.name}: {hata}") from hata


def donusturucu_sec(tercih: str = "otomatik"):
    if tercih == "yerel":
        return YerelDonusturucu()
    try:
        return MarkItDownDonusturucu()
    except ImportError:
        if tercih == "markitdown":
            raise
        return YerelDonusturucu()


class _HtmlMarkdown(HTMLParser):
    """Başlık, paragraf, liste ve tabloyu kabaca Markdown'a çevirir (markitdown gibi yalnızca gövde metni)."""

    BLOK = {"p", "div", "section", "article", "header", "footer", "main", "blockquote", "pre", "br", "hr", "ul", "ol", "table", "tr"}
    BASLIK = {"h1", "h2", "h3", "h4", "h5", "h6"}
    ATLA = {"script", "style", "title", "noscript", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.satirlar: list[str] = []
        self.tampon: list[str] = []
        self.hucreler: list[str] | None = None  # açık tablo satırının hücreleri
        self.hucrede = False
        self.baslik_satiri = False  # satırda <th> var: ardından Markdown tablo ayırıcısı yazılır
        self.atla = 0

    def _bitir(self, onek: str = ""):
        metin = " ".join("".join(self.tampon).split())
        self.tampon = []
        if metin:
            self.satirlar.append(onek + metin)

    def _hucreyi_kapat(self):
        self.hucreler.append(" ".join("".join(self.tampon).split()))
        self.tampon, self.hucrede = [], False

    def _satiri_kapat(self):
        if self.hucrede:
            self._hucreyi_kapat()
        if any(self.hucreler):
            self.satirlar.append("| " + " | ".join(self.hucreler) + " |")
            if self.baslik_satiri:
                self.satirlar.append("| " + " | ".join("---" for _ in self.hucreler) + " |")
        self.hucreler, self.baslik_satiri = None, False

    def handle_starttag(self, tag, attrs):
        if tag in self.ATLA:
            self.atla += 1
        elif tag in ("td", "th") and self.hucreler is not None:
            if self.hucrede:  # kapanmamış önceki hücre (HTML </td> yazmamaya izin verir)
                self._hucreyi_kapat()
            self.tampon, self.hucrede = [], True
            self.baslik_satiri |= tag == "th"
        elif self.hucrede:
            self.tampon.append(" ")  # hücre içindeki <p>, <br>, <li> hücreyi bölmez
        elif tag in self.BASLIK or tag in self.BLOK or tag == "li":
            if tag == "tr" and self.hucreler is not None:
                self._satiri_kapat()  # kapanmamış önceki satır
            self._bitir()
            if tag == "tr":
                self.hucreler = []

    def handle_endtag(self, tag):
        if tag in self.ATLA:
            self.atla = max(0, self.atla - 1)
        elif tag in ("td", "th") and self.hucrede:
            self._hucreyi_kapat()
        elif tag == "tr" and self.hucreler is not None:
            self._satiri_kapat()
        elif self.hucrede:
            self.tampon.append(" ")
        elif tag in self.BASLIK:
            self._bitir("#" * int(tag[1]) + " ")
        elif tag == "li":
            self._bitir("- ")
        elif tag in self.BLOK:
            if tag == "table" and self.hucreler is not None:
                self._satiri_kapat()
            self._bitir()

    def handle_data(self, data):
        if not self.atla:
            self.tampon.append(data)


def html_markdowna(html: str) -> str:
    ayristirici = _HtmlMarkdown()
    ayristirici.feed(html)
    ayristirici.close()
    if ayristirici.hucreler is not None:
        ayristirici._satiri_kapat()
    ayristirici._bitir()
    parcalar = []
    for i, satir in enumerate(ayristirici.satirlar):
        if i:  # tablo satırları bitişik yazılır; diğer bloklar arasında boş satır
            onceki = ayristirici.satirlar[i - 1]
            parcalar.append("\n" if satir.startswith("|") and onceki.startswith("|") else "\n\n")
        parcalar.append(satir)
    return "".join(parcalar) + "\n"
