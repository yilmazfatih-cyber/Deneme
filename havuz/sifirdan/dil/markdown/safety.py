"""Güvenli çıktı: HTML kaçışı ve bağlantı adresi süzme.

Kural 1: Markdown'daki ham HTML (`<script>`, `<img onerror=…>`) HİÇBİR ZAMAN olduğu gibi
yazılmaz; metin olarak kaçışlanır. Kural 2: bağlantı/görsel adresinin şeması izin listesinde
değilse (`javascript:`, `vbscript:`, `data:` …) bağlantı kurulmaz, yalnız metni yazılır.
Gizleme denemeleri (`JaVaScRiPt:`, `java\\tscript:`, `&#106;avascript:`, baştaki boşluk) önce
çözülüp sonra denetlenir. Kural 3: adres öznitelikte tırnak içinden çıkamaz (`"` → `&quot;`).
Genişletme: izin verilen yeni bir şema için `LINK_SCHEMES` kümesine ekleyin.
"""

from __future__ import annotations

import html
import re
import unicodedata
from urllib.parse import quote

LINK_SCHEMES = {"http", "https", "mailto", "tel", "ftp"}
IMAGE_SCHEMES = {"http", "https"}
SCHEME = re.compile(r"^([A-Za-z][A-Za-z0-9+.\-]*):")
URL_SAFE_CHARS = "/:?#[]@!$&'()*+,;=-._~%"


def escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


def safe_url(url: str, image: bool = False) -> str | None:
    """Adres güvenliyse öznitelikte kullanılacak biçimini, değilse None döndürür."""
    decoded = html.unescape(url)
    compact = "".join(
        ch for ch in decoded if not ch.isspace() and unicodedata.category(ch) not in ("Cc", "Cf")
    )
    scheme = SCHEME.match(compact)
    if scheme:
        allowed = IMAGE_SCHEMES if image else LINK_SCHEMES
        if scheme.group(1).lower() not in allowed:  # tr-güvenli: şema yalnız ASCII harflerdir
            return None
    return escape_html(quote(decoded, safe=URL_SAFE_CHARS))
