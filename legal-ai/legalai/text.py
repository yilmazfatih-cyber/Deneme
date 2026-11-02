"""Metin yardımcıları: HTML/PDF -> düz metin, Türkçe normalizasyon, tarih ayrıştırma."""

from __future__ import annotations

import io
import re
import unicodedata
from datetime import date

from bs4 import BeautifulSoup

_TR_MONTHS = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}

_WS = re.compile("[ \t \u200b]+")
_NL = re.compile(r"\n{3,}")


def html_to_text(
    html: str | bytes, *, drop_selectors: tuple[str, ...] = ("script", "style", "nav", "footer", "header")
) -> str:
    soup = BeautifulSoup(html, "lxml")
    for sel in drop_selectors:
        for node in soup.select(sel):
            node.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table"]):
        block.insert_before("\n")
        block.insert_after("\n")
    return clean_text(soup.get_text())


def pdf_to_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - pypdf bozuk sayfada çeşitli hatalar verir; sayfayı atla
            pages.append("")
    return clean_text("\n\n".join(pages))


def clean_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WS.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = _NL.sub("\n\n", text)
    return text.strip()


def tr_lower(text: str) -> str:
    """Türkçe küçük harf: I -> ı, İ -> i."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def tr_upper(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()


def fold_tr(text: str) -> str:
    """Arama için aksansız/katlanmış biçim (ş->s, ğ->g, ı->i, ö->o, ü->u, ç->c)."""
    # Önce Türkçe küçük harf (İ->i, I->ı), sonra aksan katlama; aksi hâlde İ -> I -> ı olur.
    table = str.maketrans("şğıöüçâîû", "sgioucaiu")
    return tr_lower(text).translate(table)


def parse_tr_date(value: str | None) -> date | None:
    """'31.10.2025', '31/10/2025', '2025-10-31', '31 Ekim 2025' biçimlerini anlar."""
    if not value:
        return None
    s = value.strip()
    m = re.search(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", s)
    if m:
        d, mo, y = map(int, m.groups())
        return _safe_date(y, mo, d)
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        return _safe_date(y, mo, d)
    m = re.search(r"(\d{1,2})\s+([A-Za-zçğıöşüÇĞİÖŞÜ]+)\s+(\d{4})", s)
    if m:
        d = int(m.group(1))
        mo = _TR_MONTHS.get(tr_lower(m.group(2)))
        y = int(m.group(3))
        if mo:
            return _safe_date(y, mo, d)
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", s)
    if m:
        y, mo, d = map(int, m.groups())
        return _safe_date(y, mo, d)
    return None


def _safe_date(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def estimate_tokens(text: str) -> int:
    """Türkçe için kaba tahmin: ~3.2 karakter / token."""
    return max(1, int(len(text) / 3.2))
