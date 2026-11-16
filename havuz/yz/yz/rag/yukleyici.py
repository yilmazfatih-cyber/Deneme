"""Belge yükleyiciler: txt, md, html (ve `belge` ekstrasıyla pdf) → düz metin.

HTML: betik/stil atılır, başlıklar Markdown başlığına (#) çevrilir ki parçalayıcı bölümleri
tanısın. PDF: sayfa sayfa metin çıkarılır (taranmış/görüntü PDF'te metin yoktur; OCR kapsam dışı).
Dosya okunurken kodlama UTF-8 denenir, olmazsa Türkçe Windows kodlaması (cp1254).
Kim kullanır: rag/dizin.py, cli.py (`indeksle`), sunucu (belge yükleme).
Genişletme: yeni biçim → `_xxx_oku(veri: bytes) -> str` yazıp `OKUYUCULAR`'a ekleyin
(YENİ BİÇİM BURAYA) ve tests/test_rag_yukle.py'ye örnek koyun.
"""

from __future__ import annotations

import hashlib
import io
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

from yz.hatalar import VeriHatasi, ekstra_gerekli
from yz.metin import kucuk_ascii
from yz.rag.temizle import metni_temizle


@dataclass
class Belge:
    """Yüklenmiş bir belge."""

    kaynak: str  # gösterilecek ad (dosya yolu ya da yükleme adı)
    metin: str
    baslik: str = ""
    ozellikler: dict[str, str] = field(default_factory=dict)

    @property
    def kimlik(self) -> str:
        """Kaynak + içerikten türetilen kısa kimlik (aynı belge iki kez eklenmesin diye)."""
        ozet = hashlib.sha256(f"{self.kaynak}\n{self.metin}".encode()).hexdigest()
        return ozet[:12]


def _cozumle(veri: bytes) -> str:
    for kodlama in ("utf-8-sig", "cp1254"):
        try:
            return veri.decode(kodlama)
        except UnicodeDecodeError:
            continue
    return veri.decode("utf-8", errors="replace")


class _HtmlMetni(HTMLParser):
    _ATLA = frozenset({"script", "style", "noscript", "template", "svg", "head"})
    _BLOK = frozenset({"p", "div", "li", "tr", "br", "section", "article", "table", "ul", "ol"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parcalar: list[str] = []
        self.baslik = ""
        self._atla = 0
        self._baslik_icinde = False
        self._etiket_basligi = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._ATLA:
            self._atla += 1
        elif re.fullmatch(r"h[1-6]", tag):
            self.parcalar.append("\n\n" + "#" * int(tag[1]) + " ")
        elif tag in self._BLOK:
            self.parcalar.append("\n\n" if tag != "br" else "\n")
        if tag == "title":
            self._etiket_basligi = True

    def handle_endtag(self, tag: str) -> None:
        if tag in self._ATLA:
            self._atla = max(0, self._atla - 1)
        elif re.fullmatch(r"h[1-6]", tag) or tag in self._BLOK:
            self.parcalar.append("\n\n")
        if tag == "title":
            self._etiket_basligi = False

    def handle_data(self, data: str) -> None:
        if self._etiket_basligi:
            self.baslik += data.strip()
        elif not self._atla:
            self.parcalar.append(data)


def html_metni(html: str) -> tuple[str, str]:
    """HTML'den (başlık, düz metin) çıkarır."""
    ayristirici = _HtmlMetni()
    ayristirici.feed(html)
    ayristirici.close()
    metin = "".join(ayristirici.parcalar)
    metin = re.sub(r"[ \t]+", " ", metin)
    return ayristirici.baslik, re.sub(r"\n\s*\n\s*", "\n\n", metin).strip()


def _duz_oku(veri: bytes) -> tuple[str, str]:
    return "", _cozumle(veri)


def _md_oku(veri: bytes) -> tuple[str, str]:
    metin = _cozumle(veri)
    ilk = re.search(r"^#\s+(.+)$", metin, flags=re.MULTILINE)
    return (ilk.group(1).strip() if ilk else ""), metin


def _html_oku(veri: bytes) -> tuple[str, str]:
    return html_metni(_cozumle(veri))


def _pdf_oku(veri: bytes) -> tuple[str, str]:
    try:
        from pypdf import PdfReader
    except ImportError as hata:
        raise ekstra_gerekli("pypdf", "belge") from hata
    okuyucu = PdfReader(io.BytesIO(veri))
    sayfalar = [(sayfa.extract_text() or "").strip() for sayfa in okuyucu.pages]
    metin = "\n\n".join(s for s in sayfalar if s)
    if not metin:
        raise VeriHatasi(
            "PDF'te metin bulunamadı (taranmış/görüntü PDF olabilir). Önce bir OCR aracıyla metne "
            "çevirin."
        )
    meta = okuyucu.metadata
    baslik = str(meta.get("/Title") or "") if meta else ""
    return baslik, metin


OKUYUCULAR: dict[str, Callable[[bytes], tuple[str, str]]] = {
    ".txt": _duz_oku,
    ".md": _md_oku,
    ".markdown": _md_oku,
    ".html": _html_oku,
    ".htm": _html_oku,
    ".pdf": _pdf_oku,
    # YENİ BİÇİM BURAYA: ".uzanti": _okuyucu,
}


def bayttan_yukle(veri: bytes, kaynak: str) -> Belge:
    """Bellekteki dosya içeriğinden belge kurar (sunucuya yüklenen dosyalar için)."""
    uzanti = kucuk_ascii(Path(kaynak).suffix)
    okuyucu = OKUYUCULAR.get(uzanti)
    if okuyucu is None:
        raise VeriHatasi(
            f"Desteklenmeyen dosya türü: {uzanti or '(uzantısız)'}. Desteklenenler: "
            f"{', '.join(sorted(OKUYUCULAR))}."
        )
    baslik, metin = okuyucu(veri)
    return Belge(kaynak=kaynak, metin=metni_temizle(metin), baslik=baslik)


def dosya_yukle(yol: str | Path, kok: Path | None = None) -> Belge:
    """Tek bir dosyayı yükler; `kok` verilirse kaynak adı köke göre göreli yazılır."""
    yol = Path(yol)
    kaynak = str(yol.relative_to(kok)) if kok is not None else yol.name
    return bayttan_yukle(yol.read_bytes(), kaynak)


def klasor_yukle(klasor: str | Path, azami_bayt: int = 20 * 1024 * 1024) -> list[Belge]:
    """Klasördeki (alt klasörler dahil) desteklenen dosyaları yükler; gizli dosyaları atlar."""
    kok = Path(klasor)
    if not kok.is_dir():
        raise VeriHatasi(f"Klasör bulunamadı: {kok}")
    belgeler: list[Belge] = []
    for yol in sorted(kok.rglob("*")):
        goreli = yol.relative_to(kok)
        if any(p.startswith(".") for p in goreli.parts) or not yol.is_file():
            continue
        if kucuk_ascii(yol.suffix) not in OKUYUCULAR or yol.stat().st_size > azami_bayt:
            continue
        belge = dosya_yukle(yol, kok)
        if belge.metin.strip():
            belgeler.append(belge)
    return belgeler
