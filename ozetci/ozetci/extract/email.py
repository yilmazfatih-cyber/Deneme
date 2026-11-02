"""E-posta okuma: .eml ve .mbox.

* Başlıklar (Kimden, Kime, Konu, Tarih) metnin başına eklenir.
* HTML gövde düz metne çevrilir (yalnızca standart kütüphane); ``blockquote`` ve Gmail/Outlook
  alıntı kapsayıcıları atlanır.
* Alıntılanmış eski yazışmalar ve imza kesilir; satır arası (interleaved) yanıtlar korunur.
* Ekler iç içe multipart yapılarda da bulunur (Apple Mail, S/MIME); PDF ve görüntü ekleri
  ``children`` olarak çıkarılır, ``message/rfc822`` ile iletilen e-postalar alt belge olur,
  küçük satır içi görseller (logo, imza, izleme pikseli) OCR'a gönderilmez.
* Türkçe eski kodlamalar (ISO-8859-9 / windows-1254) için yedek çözme vardır.
"""

from __future__ import annotations

import email
import io
import mailbox
import re
from email import policy
from email.message import EmailMessage
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional, Union

from ..textutil import clean_text
from .base import Attachment, Document

_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/tiff", "image/webp", "image/bmp"}
_PDF_TYPES = {"application/pdf", "application/x-pdf"}
_FALLBACK_CHARSETS = ("utf-8", "windows-1254", "iso-8859-9", "latin-1")
# "iso-8859-1" diye etiketlenmiş ama aslında cp1254 olan Türkçe postalarda ğ/ş/ı -> ð/þ/ý olarak görünür
_MOJIBAKE_RE = re.compile(r"[ðþýÐÞÝ]")
_MISLABELED = ("iso-8859-1", "latin-1", "latin1", "us-ascii", "windows-1252", "cp1252", "ascii")
# Bu boyutun altındaki görseller logo/imza/izleme pikseli sayılır
_MIN_IMAGE_PIXELS = 25_000  # ~160x160: logo, imza görseli, izleme pikseli
_MIN_IMAGE_BYTES = 2_000

# Her zaman kesilen alıntı başlıkları (Outlook zinciri)
_CUT_HEADER_RES = [
    re.compile(r"^\s*-{2,}\s*(Original Message|Orijinal Mesaj|Özgün İleti|Orijinal İleti)\s*-{2,}", re.I),
    re.compile(r"^\s*_{10,}\s*$"),
]
# "... wrote:" / "... yazdı:" — sonrasında alıntısız yanıt varsa (satır arası) kesilmez
_WROTE_HEADER_RES = [
    re.compile(r"^\s*On .{3,160} wrote:\s*$", re.I),
    re.compile(r"^.{3,160}(tarihinde|saatinde).{0,120}(yazdı|şunları yazdı|şunu yazdı):\s*$", re.I),
]
_SIGNATURE_RES = [
    re.compile(r"^-- ?$"),
    re.compile(r"^\s*(Saygılarımla|Saygılarımızla|Saygılar|İyi çalışmalar|İyi günler|Sevgiler|Teşekkürler|Teşekkür ederim)[,.!]?\s*$", re.I),
    re.compile(r"^\s*(Best regards|Kind regards|Regards|Best|Thanks|Thank you|Sincerely|Cheers)[,.!]?\s*$", re.I),
    re.compile(r"^\s*(Sent from my|iPhone'umdan gönderildi|Android'imden gönderildi|Outlook for)", re.I),
    re.compile(r"^\s*Bu e-posta .{0,80}(gizli|yasal uyarı|disclaimer)", re.I),
    re.compile(r"^\s*This (e-?mail|message) .{0,80}(confidential|intended)", re.I),
]
_RECOVER_RE = re.compile(r"^\s*(Not|NOT|P\.?S\.?|Ek bilgi|Ek not)\s*:", re.I)


class _HTMLToText(HTMLParser):
    """HTML -> düz metin. ``blockquote`` ve Gmail/Outlook alıntı kapsayıcıları atlanır."""

    _BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "blockquote", "section", "article", "header", "footer", "hr", "pre"}
    _SKIP = {"script", "style", "head", "title", "meta", "link"}
    _QUOTE_CLASSES = ("gmail_quote", "yahoo_quoted", "moz-cite-prefix", "protonmail_quote")
    _QUOTE_IDS = ("divRplyFwdMsg", "appendonsend", "x_divRplyFwdMsg")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0
        self._skip_tag: Optional[str] = None  # içinde olduğumuz alıntı kapsayıcısı
        self._skip_level = 0

    def _is_quote_container(self, tag, attrs) -> bool:
        if tag == "blockquote":
            return True
        if tag == "div":
            a = dict(attrs)
            cls = (a.get("class") or "").lower()
            if any(c in cls for c in self._QUOTE_CLASSES):
                return True
            if (a.get("id") or "") in self._QUOTE_IDS:
                return True
        return False

    def handle_starttag(self, tag, attrs):
        if self._skip_tag is not None:
            if tag == self._skip_tag:
                self._skip_level += 1
            return
        if tag in self._SKIP:
            self._skip_depth += 1
            return
        if self._is_quote_container(tag, attrs):
            self._skip_tag, self._skip_level = tag, 1
            self._parts.append("\n")
            return
        if tag == "li":
            self._parts.append("\n- ")
        elif tag in self._BLOCK:
            self._parts.append("\n")
        elif tag == "td" or tag == "th":
            self._parts.append(" | ")

    def handle_endtag(self, tag):
        if self._skip_tag is not None:
            if tag == self._skip_tag:
                self._skip_level -= 1
                if self._skip_level <= 0:
                    self._skip_tag = None
            return
        if tag in self._SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag in self._BLOCK and tag not in ("li", "br"):
            self._parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth or self._skip_tag is not None:
            return
        self._parts.append(data)

    def text(self) -> str:
        return "".join(self._parts)


def html_to_text(html: str) -> str:
    parser = _HTMLToText()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # pragma: no cover - bozuk HTML
        return re.sub(r"<[^>]+>", " ", html)
    text = parser.text()
    text = re.sub(r"[ \t]*\|[ \t]*\n", "\n", text)
    return clean_text(text)


def _decode_part(part) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset()
    candidates = [charset] if charset else []
    candidates += [c for c in _FALLBACK_CHARSETS if c != charset]
    for cs in candidates:
        try:
            text = payload.decode(cs)
        except (LookupError, UnicodeDecodeError):
            continue
        if cs and cs.lower().replace("_", "-") in _MISLABELED and _MOJIBAKE_RE.search(text):
            try:
                return payload.decode("cp1254")  # yanlış etiketlenmiş Türkçe
            except UnicodeDecodeError:
                pass
        return text
    return payload.decode("utf-8", errors="replace")


def strip_quotes_and_signature(body: str, keep_min_lines: int = 2) -> str:
    """Alıntıları ve imzayı keser.

    * ``-----Original Message-----`` türü başlıklardan sonrası her zaman atılır.
    * ``... wrote:`` / ``... yazdı:`` başlığından sonra alıntısız yanıt satırları varsa
      (satır arası yanıt) yalnızca ``>`` satırları ve başlık atılır; yoksa oradan kesilir.
    * İmza kalıbı son %40'lık dilimde aranır; ``Not:`` / ``P.S.`` ile başlayan satırlar geri alınır.
    * Kesme sonrası ``keep_min_lines``'tan az satır kalırsa orijinal metin döndürülür.
    """
    lines = body.split("\n")
    cut = len(lines)
    header_idx: Optional[int] = None
    for i, line in enumerate(lines):
        if any(r.match(line) for r in _CUT_HEADER_RES):
            cut = i
            break
        if header_idx is None and any(r.match(line) for r in _WROTE_HEADER_RES):
            header_idx = i
    if header_idx is not None and header_idx < cut:
        after = lines[header_idx + 1 : cut]
        unquoted = [ln for ln in after if ln.strip() and not ln.lstrip().startswith(">")]
        if len(unquoted) >= 2:  # satır arası yanıt: başlığı ve '>' satırlarını at, yanıtları koru
            kept = [ln for j, ln in enumerate(lines[:cut]) if j != header_idx and not ln.lstrip().startswith(">")]
        else:
            kept = [ln for ln in lines[:header_idx] if not ln.lstrip().startswith(">")]
    else:
        kept = [ln for ln in lines[:cut] if not ln.lstrip().startswith(">")]

    # İmza: son %40'lık dilimde ilk imza kalıbından itibaren kes; "Not:" satırlarını kurtar
    start_zone = int(len(kept) * 0.6) if len(kept) > 12 else 1
    for i in range(len(kept) - 1, max(start_zone - 1, -1), -1):
        if any(r.match(kept[i]) for r in _SIGNATURE_RES):
            dropped = kept[i:]
            kept = kept[:i]
            for j, ln in enumerate(dropped):
                if _RECOVER_RE.match(ln):
                    kept += [""] + dropped[j:]
                    break
            break

    result = "\n".join(kept).strip()
    if len([ln for ln in result.split("\n") if ln.strip()]) < keep_min_lines and result != body.strip():
        return body.strip()
    return result


def _header(msg: EmailMessage, name: str) -> str:
    value = msg.get(name)
    if value is None:
        return ""
    try:
        return clean_text(str(value))
    except Exception:  # pragma: no cover
        return ""


def _best_body(msg: EmailMessage):
    """(metin, seçilen gövde parçası)"""
    body = msg.get_body(preferencelist=("plain", "html"))
    if body is None:
        if not msg.is_multipart():
            text = _decode_part(msg)
            return (html_to_text(text) if msg.get_content_subtype() == "html" else clean_text(text)), msg
        return "", None
    text = _decode_part(body)
    if body.get_content_subtype() == "html":
        return html_to_text(text), body
    return clean_text(text), body


def _leaf_parts(part, out: list) -> None:
    """Tüm yaprak parçaları toplar; message/rfc822 yaprak sayılır (içi ayrıca işlenir)."""
    if part.get_content_type() == "message/rfc822":
        out.append(part)
        return
    if part.is_multipart():
        for sub in part.iter_parts():
            _leaf_parts(sub, out)
        return
    out.append(part)


def _image_is_tiny(data: bytes) -> bool:
    """Boyut okunabiliyorsa piksel sayısına, okunamıyorsa bayt sayısına göre karar verir."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as im:
            w, h = im.size
        return w * h < _MIN_IMAGE_PIXELS
    except Exception:
        return len(data) < _MIN_IMAGE_BYTES


def message_to_document(msg: EmailMessage, ocr=None, source_name: str = "<email>", strip_quotes: bool = True, _depth: int = 0) -> Document:
    subject = _header(msg, "Subject")
    sender = _header(msg, "From")
    to = _header(msg, "To")
    cc = _header(msg, "Cc")
    date = _header(msg, "Date")

    body, body_part = _best_body(msg)
    if strip_quotes:
        body = strip_quotes_and_signature(body)

    header_lines = []
    if sender:
        header_lines.append(f"Kimden: {sender}")
    if to:
        header_lines.append(f"Kime: {to}")
    if cc:
        header_lines.append(f"Bilgi: {cc}")
    if date:
        header_lines.append(f"Tarih: {date}")
    if subject:
        header_lines.append(f"Konu: {subject}")
    text = "\n".join(header_lines) + ("\n\n" + body if body else "")

    doc = Document(kind="email", source=source_name, text=clean_text(text), title=subject or None)
    doc.metadata.update({"from": sender, "to": to, "cc": cc, "date": date, "subject": subject,
                         "message_id": _header(msg, "Message-ID")})

    from .pdf import extract_pdf
    from .image import extract_image

    leaves: list = []
    _leaf_parts(msg, leaves)
    skipped_inline = 0
    for part in leaves:
        if part is body_part or part is msg:
            continue
        ctype = (part.get_content_type() or "").lower()
        filename = part.get_filename() or ""
        if ctype == "message/rfc822":
            if _depth >= 3:
                continue
            inner = part.get_payload(0) if part.is_multipart() else None
            if inner is not None:
                child = message_to_document(inner, ocr=ocr, source_name=filename or "iletilen-ileti", strip_quotes=strip_quotes, _depth=_depth + 1)
                child.title = child.title or filename or "İletilen ileti"
                doc.children.append(child)
            continue
        is_attachment = part.is_attachment() or bool(filename) or ctype in _PDF_TYPES or ctype in _IMAGE_TYPES
        if ctype.startswith("text/") and not part.is_attachment() and not filename:
            continue  # gövdenin diğer sürümü (alternative) ya da imza metni
        if not is_attachment:
            continue
        filename = filename or f"ek-{len(doc.attachments) + len(doc.children) + 1}"
        data = part.get_payload(decode=True) or b""
        try:
            if ctype in _PDF_TYPES or filename.lower().endswith(".pdf"):
                child = extract_pdf(data, ocr=ocr, source_name=filename)
                child.title = filename
                doc.children.append(child)
                continue
            if ctype in _IMAGE_TYPES:
                if _image_is_tiny(data):
                    skipped_inline += 1
                    continue
                child = extract_image(data, ocr=ocr, source_name=filename)
                child.title = filename
                doc.children.append(child)
                continue
        except Exception as exc:  # bozuk ek: listele ama düşme
            doc.metadata.setdefault("attachment_errors", []).append(f"{filename}: {exc}")
        doc.attachments.append(Attachment(filename=filename, content_type=ctype, size=len(data)))
    if skipped_inline:
        doc.metadata["skipped_inline_images"] = skipped_inline
    if doc.attachments:
        names = ", ".join(a.filename for a in doc.attachments)
        doc.text += f"\n\n[Diğer ekler: {names}]"
    return doc


def parse_eml_bytes(data: bytes) -> EmailMessage:
    return email.message_from_bytes(data, policy=policy.default)


def extract_eml(src: Union[str, Path, bytes], ocr=None, source_name: Optional[str] = None, strip_quotes: bool = True) -> Document:
    if isinstance(src, bytes):
        msg = parse_eml_bytes(src)
        name = source_name or "<bytes>.eml"
    else:
        with open(src, "rb") as fh:
            msg = parse_eml_bytes(fh.read())
        name = source_name or str(src)
    return message_to_document(msg, ocr=ocr, source_name=name, strip_quotes=strip_quotes)


def extract_mbox(path: Union[str, Path], ocr=None, strip_quotes: bool = True, limit: Optional[int] = None) -> list[Document]:
    box = mailbox.mbox(str(path), factory=lambda f: email.message_from_binary_file(f, policy=policy.default))
    docs: list[Document] = []
    try:
        for i, msg in enumerate(box):
            if limit is not None and i >= limit:
                break
            docs.append(message_to_document(msg, ocr=ocr, source_name=f"{path}#{i}", strip_quotes=strip_quotes))
    finally:
        box.close()
    return docs
