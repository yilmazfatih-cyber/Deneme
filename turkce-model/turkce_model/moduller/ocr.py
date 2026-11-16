"""OCR modülü: görüntüleri ve PDF sayfalarını yerel sunucudaki DeepSeek-OCR ile metne çevirir.

Sunucunun ham çıktısı diske önbelleğe alınır (anahtar: model + istem + görüntü): yarıda kesilen bir kitapçık
kaldığı sayfadan sürer ve aynı sayfa ikinci kez okunmaz. Temizleme (``ocr_temizle``) önbellekten sonra
uygulanır; kurallar gelişince OCR'ı yeniden çalıştırmak gerekmez.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from collections.abc import Callable, Iterator
from pathlib import Path

from ..metin import normallestir
from .ayar import OcrAyarlari
from .istemci import ModulHatasi, YerelSunucu

GORSEL_ISARETI = "[GÖRSEL]"
"""Modelin "burada bir şekil var" dediği yere konan satır; MEB ayrıştırıcısı o soruyu görsel gerektiren sayar."""

GORSEL_TURLERI = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
}

# ---- çıktı temizleme ----------------------------------------------------------------------------

_REF_DET = re.compile(r"<\|ref\|>(.*?)<\|/ref\|>\s*<\|det\|>.*?<\|/det\|>", re.DOTALL)
_OZEL_TOKEN = re.compile(r"<\|[^|>\n]{1,40}\|>|<｜[^｜>\n]{1,40}｜>")
_MD_GORSEL = re.compile(r"!\[[^\]\n]*\]\([^)\n]*\)")
_HTML_TABLO = re.compile(r"<table\b.*?</table>", re.DOTALL | re.IGNORECASE)
_HTML_SATIR = re.compile(r"<tr\b.*?</tr>", re.DOTALL | re.IGNORECASE)
_HTML_HUCRE = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.DOTALL | re.IGNORECASE)
# Yalnız bilinen HTML etiketleri silinir ve nitelikler ad="değer" biçiminde olmalıdır: "a<b ve c>d" gibi bir
# eşitsizlik etiket sanılmasın.
_HTML_ETIKET = re.compile(
    r"</?(?:br|b|i|u|em|strong|span|div|p|center|font|small|mark|del|ins|code|pre|a|img|hr|ul|ol|li|h[1-6]"
    r"|table|thead|tbody|tfoot|tr|td|th|caption|figure|figcaption)"
    r"""(?:\s+[a-zA-Z_:][-\w:.]*\s*=\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s"'=<>`]+))*\s*/?>""",
    re.IGNORECASE,
)
_HTML_US = re.compile(r"<(sup|sub)>(.*?)</\1>", re.IGNORECASE | re.DOTALL)
_MD_TABLO_AYRACI = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$")
_MD_BASLIK = re.compile(r"^\s{0,3}#{1,6}\s+")
_MD_ALINTI = re.compile(r"^\s{0,3}>\s?")
_MD_LISTE = re.compile(r"^\s{0,3}[-*+]\s+(?=(?:\(?[A-E]\)|\d{1,2}[.)])\s)")  # "- A) …", "* 3. …"
_MD_VURGU = re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1")
_LATEX_KESIR = re.compile(r"\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
_LATEX_KOK = re.compile(r"\\sqrt\s*\{([^{}]*)\}")
_LATEX_METIN = re.compile(r"\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}")
_LATEX_US = re.compile(r"([\^_])\{([^{}]*)\}")
_LATEX_SIMGELER = {
    r"\times": "×", r"\div": "÷", r"\cdot": "·", r"\leq": "≤", r"\le": "≤", r"\geq": "≥", r"\ge": "≥",
    r"\neq": "≠", r"\ne": "≠", r"\pm": "±", r"\approx": "≈", r"\rightarrow": "→", r"\to": "→",
    r"\infty": "∞", r"\pi": "π", r"\alpha": "α", r"\beta": "β", r"\Delta": "Δ", r"\degree": "°",
    r"\%": "%", r"\,": " ", r"\;": " ", r"\!": "", r"\left": "", r"\right": "",
}
_LATEX_SIMGE = re.compile("|".join(re.escape(k) + r"(?![a-zA-Z])" for k in sorted(_LATEX_SIMGELER, key=len, reverse=True)))
_LATEX_SINIR = re.compile(r"\\[()\[\]]|\$\$?")
_GORSEL_ETIKETLERI = {"image", "figure", "chart", "picture", "diagram"}


def _kesir(m: re.Match[str]) -> str:
    pay, payda = m.group(1).strip(), m.group(2).strip()
    if re.fullmatch(r"[\w.,]+", pay) and re.fullmatch(r"[\w.,]+", payda):
        return f"{pay}/{payda}"
    return f"({pay})/({payda})"


def _latex_sadelestir(s: str) -> str:
    """Sık görülen LaTeX kalıplarını düz metne çevirir; tanımadığı komutlara dokunmaz."""
    if "\\" not in s and "$" not in s:
        return s
    for _ in range(3):  # iç içe kesir/kök için birkaç geçiş
        yeni = _LATEX_KESIR.sub(_kesir, s)
        yeni = _LATEX_KOK.sub(lambda m: f"√({m.group(1).strip()})", yeni)
        yeni = _LATEX_METIN.sub(lambda m: m.group(1), yeni)
        if yeni == s:
            break
        s = yeni
    s = _LATEX_US.sub(lambda m: f"{m.group(1)}({m.group(2).strip()})", s)
    s = _LATEX_SIMGE.sub(lambda m: _LATEX_SIMGELER[m.group()], s)
    return _LATEX_SINIR.sub("", s)


def _hucreler(satir_html: str) -> list[str]:
    hucreler = [_HTML_ETIKET.sub(" ", h) for h in _HTML_HUCRE.findall(satir_html)]
    return [re.sub(r"\s+", " ", h).strip() for h in hucreler]


def _tablo_satirlari(tablo_html: str) -> str:
    """HTML tablosunu, her satırı ayrı paragraf olan "hücre / hücre" satırlarına çevirir."""
    satirlar = [" / ".join(h for h in _hucreler(tr) if h) for tr in _HTML_SATIR.findall(tablo_html)]
    return "\n\n" + "\n\n".join(s for s in satirlar if s) + "\n\n"


def _ref_det(m: re.Match[str]) -> str:
    etiket = m.group(1).strip().lower()
    return f"\n{GORSEL_ISARETI}\n" if etiket in _GORSEL_ETIKETLERI else ""


def ocr_temizle(ham: str) -> str:
    """Modelin çıktısını düz metne indirger: konum etiketleri, özel token'lar, Markdown ve HTML artıkları atılır.

    * ``<|ref|>tür<|/ref|><|det|>[[…]]<|/det|>`` konum etiketleri silinir; türü ``image`` olanlar ve Markdown
      görüntüleri ``[GÖRSEL]`` satırına dönüşür.
    * HTML ve Markdown tabloları satır satır "hücre / hücre" olur.
    * Başlık (``#``), vurgu (``**``), alıntı (``>``) işaretleri ve seçenek/soru numarası önündeki liste imleri
      kalkar; basit LaTeX kalıpları düz metne çevrilir.
    """
    m = ham.replace("\r\n", "\n").replace("\r", "\n")
    m = _REF_DET.sub(_ref_det, m)
    m = _MD_GORSEL.sub(f"\n{GORSEL_ISARETI}\n", m)
    m = _HTML_TABLO.sub(lambda t: _tablo_satirlari(t.group()), m)
    m = re.sub(r"<br\s*/?>", "\n", m, flags=re.IGNORECASE)
    # Üst/alt simge PDF yolundaki gibi yazılır: x<sup>2</sup> → x^(2), H<sub>2</sub>O → H_(2)O
    m = _HTML_US.sub(lambda u: f"{'^' if u.group(1).lower() == 'sup' else '_'}({u.group(2).strip()})", m)
    m = _OZEL_TOKEN.sub("", m)
    satirlar: list[str] = []
    for satir in m.split("\n"):
        if "|" in satir and _MD_TABLO_AYRACI.match(satir):
            continue  # Markdown tablo ayracı: | --- | --- |
        if satir.count("|") >= 2 and satir.strip().startswith("|"):
            hucreler = [h.strip() for h in satir.strip().strip("|").split("|")]
            satir = " / ".join(h for h in hucreler if h)
            satirlar += ["", satir, ""]
            continue
        satir = _MD_ALINTI.sub("", _MD_BASLIK.sub("", satir))
        satir = _MD_LISTE.sub("", satir)
        satir = _MD_VURGU.sub(lambda v: v.group(2), satir)
        satir = _HTML_ETIKET.sub(" ", satir)
        satirlar.append(_latex_sadelestir(satir))
    return normallestir("\n".join(satirlar))


_SATIR_ICI_TEKRAR = re.compile(r"(.{3,80}?)\1{9,}\s*$", re.DOTALL)


def tekrar_kirp(metin: str, en_cok: int = 6) -> tuple[str, bool]:
    """Modelin sona doğru aynı satırı ya da ifadeyi durmadan yinelediği kısmı kırpar: ``(metin, kırpıldı_mı)``.

    DeepSeek-OCR bunu boş ya da soluk sayfalarda yapabilir; vLLM'in tekrar önleyicisi dışındaki sunucularda
    engel yoktur. Aynı satır art arda ``en_cok``'tan fazla yinelenirse biri bırakılır.
    """
    satirlar = metin.rstrip().split("\n")
    kirpildi = False
    son = [s for s in satirlar if s.strip()][-1:] or [""]
    if son[0]:
        adet = 0
        i = len(satirlar) - 1
        while i >= 0 and (not satirlar[i].strip() or satirlar[i].strip() == son[0].strip()):
            adet += bool(satirlar[i].strip())
            i -= 1
        if adet > en_cok:
            satirlar = satirlar[: i + 1] + [son[0]]
            kirpildi = True
    metin = "\n".join(satirlar)
    m = _SATIR_ICI_TEKRAR.search(metin[-6000:])
    if m:
        bas = len(metin) - len(metin[-6000:]) + m.start()
        metin = metin[:bas] + m.group(1)
        kirpildi = True
    return metin.rstrip(), kirpildi


# ---- görüntüler ---------------------------------------------------------------------------------


def sayfa_gorselleri(pdf: Path, dpi: int = 150) -> Iterator[tuple[int, bytes]]:
    """PDF'in her sayfasını PNG'ye çevirir: ``(sayfa_no, png)``; sayfa numarası 1'den başlar."""
    from ..meb import _pymupdf

    pymupdf = _pymupdf()
    try:
        belge = pymupdf.open(pdf)
    except Exception as e:  # pymupdf bozuk dosyada kendi hata türlerini atar
        raise ValueError(f"PDF açılamadı: {pdf} ({e})") from e
    with belge:
        if belge.needs_pass and not belge.authenticate(""):
            raise ValueError(f"PDF parola korumalı, açılamadı: {pdf}")
        for no, sayfa in enumerate(belge, 1):
            yield no, sayfa.get_pixmap(dpi=dpi, alpha=False).tobytes("png")


def gorsel_oku(yol: Path) -> tuple[bytes, str]:
    """Görüntü dosyasını okur: ``(baytlar, MIME türü)``."""
    yol = Path(yol)
    mime = GORSEL_TURLERI.get(yol.suffix.lower())
    if mime is None:
        raise ModulHatasi(f"{yol}: desteklenen görüntü türleri {', '.join(sorted(GORSEL_TURLERI))} ve .pdf")
    if not yol.is_file():
        raise ModulHatasi(f"Dosya yok: {yol}")
    return yol.read_bytes(), mime


# ---- modül --------------------------------------------------------------------------------------


class OcrModulu:
    def __init__(self, sunucu: YerelSunucu, ayar: OcrAyarlari, onbellek: Path | None = None) -> None:
        self.sunucu, self.ayar, self.onbellek = sunucu, ayar, onbellek

    def _anahtar(self, gorsel: bytes, istem: str) -> str:
        h = hashlib.sha256()
        ayar = json.dumps([self.ayar.model, istem, self.ayar.en_fazla_token, self.ayar.ek_istek], sort_keys=True)
        h.update(ayar.encode("utf-8"))
        h.update(b"\0")
        h.update(gorsel)
        return h.hexdigest()[:32]

    def ham_oku(self, gorsel: bytes, mime: str = "image/png", istem: str | None = None) -> tuple[str, bool]:
        """Sunucunun ham çıktısı ve önbellekten gelip gelmediği. ``istem`` verilmezse ``ayar.istem``."""
        istem = istem or self.ayar.istem
        yol = self.onbellek / f"{self._anahtar(gorsel, istem)}.txt" if self.onbellek else None
        if yol is not None and yol.exists():
            return yol.read_text(encoding="utf-8"), True
        ham = self.sunucu.gorselden_metin(
            self.ayar.model, istem, gorsel, mime, self.ayar.en_fazla_token, self.ayar.ek_istek
        )
        if yol is not None:
            yol.parent.mkdir(parents=True, exist_ok=True)
            gecici = yol.with_name(yol.name + ".yaziliyor")
            gecici.write_text(ham, encoding="utf-8")
            os.replace(gecici, yol)
        return ham, False

    def gorselden(
        self, gorsel: bytes, mime: str = "image/png", yaz: Callable[[str], object] | None = None, istem: str | None = None
    ) -> str:
        """Bir görüntünün temizlenmiş metni."""
        ham, _ = self.ham_oku(gorsel, mime, istem)
        metin, kirpildi = tekrar_kirp(ocr_temizle(ham))
        if kirpildi and yaz is not None:
            yaz("  Uyarı: model tekrara girdi; yinelenen kısım kırpıldı (sayfayı gözle denetle).")
        return metin

    def pdf_oku(self, pdf: Path, yaz: Callable[[str], object] = print, istem: str | None = None) -> list[str]:
        """PDF'in her sayfasının temizlenmiş metni (sayfa sırasıyla). Okunan sayfalar önbellekte kalır.

        ``istem`` verilmezse ``ayar.belge_istemi`` kullanılır (düzeni korur, şekilleri işaretler).
        """
        istem = istem or self.ayar.belge_istemi
        sayfalar: list[str] = []
        sureler: list[float] = []
        from ..meb import _pymupdf

        with _pymupdf().open(pdf) as belge:
            toplam = belge.page_count
        for no, png in sayfa_gorselleri(pdf, self.ayar.dpi):
            bas = time.time()
            ham, onbellekten = self.ham_oku(png, istem=istem)
            metin, kirpildi = tekrar_kirp(ocr_temizle(ham))
            sayfalar.append(metin)
            if onbellekten:
                durum = "önbellekten"
            else:
                sureler.append(time.time() - bas)
                kalan = (toplam - no) * sum(sureler) / len(sureler)
                durum = f"{sureler[-1]:.0f} sn" + (f", kalan ~{kalan / 60:.0f} dk" if no < toplam else "")
            ek = " | tekrar kırpıldı" if kirpildi else ""
            yaz(f"  OCR {Path(pdf).name}: sayfa {no}/{toplam} ({durum}, {len(metin)} karakter{ek})")
        return sayfalar

    def dosya_oku(self, yol: Path, yaz: Callable[[str], object] = print, istem: str | None = None) -> list[str]:
        """PDF ise sayfa sayfa (``belge_istemi``), görüntü ise tek öğeli liste (``istem``)."""
        yol = Path(yol)
        if yol.suffix.lower() == ".pdf":
            if not yol.is_file():
                raise ModulHatasi(f"Dosya yok: {yol}")
            return self.pdf_oku(yol, yaz, istem)
        gorsel, mime = gorsel_oku(yol)
        return [self.gorselden(gorsel, mime, yaz, istem)]


def ocr_modulu(ayarlar) -> OcrModulu:
    """Ayarlardan OCR modülünü kurar; kapalıysa nasıl açılacağını söyleyen ``ModulHatasi``."""
    m = ayarlar.moduller
    if not m.ocr.model:
        raise ModulHatasi(
            "OCR modülü kapalı. Açmak için: yerel bir model sunucusu kur (ör. Ollama), modeli indir "
            "(`ollama pull deepseek-ocr`) ve ayarlar.toml'da [moduller.ocr] model = \"deepseek-ocr\" yaz. "
            "Ayrıntı: README, 'DeepSeek modülleri'."
        )
    sunucu = YerelSunucu(m.adres, m.zaman_asimi, m.uzak_sunucu)
    return OcrModulu(sunucu, m.ocr, ayarlar.cikti_klasoru / "moduller" / "ocr")


# ---- kendi kendini sınama ------------------------------------------------------------------------

DENEME_METNI = (
    "Çağdaş Türk şiirinde ölçü ve uyak",
    "1. Aşağıdaki cümlelerin hangisinde yazım yanlışı vardır?",
    "A) Öğretmen, öğrencilerine güzel bir öykü okudu.",
    "B) İstanbul'un ışıkları uzaktan görünüyordu.",
    "C) Çocuklar bahçede koşup oynadılar.",
    "D) Yağmur yağınca şemsiyesini açtı.",
)
"""Kendi yazdığımız, Türkçe harf bakımından zengin sınama metni (``modul-dene ocr``)."""

_YAZI_TIPLERI = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
)


def deneme_gorseli(dpi: int = 150) -> bytes | None:
    """``DENEME_METNI``'ni bir sayfaya yazıp PNG olarak döndürür; Türkçe harfli bir yazı tipi bulunamazsa ``None``."""
    from ..meb import _pymupdf

    pymupdf = _pymupdf()
    for yol in _YAZI_TIPLERI:
        if not Path(yol).exists():
            continue
        try:
            if not all(pymupdf.Font(fontfile=yol).has_glyph(ord(c)) for c in "şğıİöüçŞĞÖÜÇ"):
                continue
        except Exception:  # noqa: BLE001 — okunamayan yazı tipi: sıradakini dene
            continue
        belge = pymupdf.open()
        sayfa = belge.new_page(width=420, height=40 + 26 * len(DENEME_METNI))
        for i, satir in enumerate(DENEME_METNI):
            sayfa.insert_text((30, 40 + 26 * i), satir, fontsize=13, fontname="tr", fontfile=yol)
        png = sayfa.get_pixmap(dpi=dpi, alpha=False).tobytes("png")
        belge.close()
        return png
    return None


def benzerlik(beklenen: str, okunan: str) -> dict:
    """Karakter düzeyinde benzerlik ve Türkçeye özgü harflerin doğru okunma oranı (boşluklar sadeleştirilerek)."""
    import difflib

    def sade(s: str) -> str:
        return re.sub(r"\s+", " ", normallestir(s)).strip()

    a, b = sade(beklenen), sade(okunan)
    eslesme = difflib.SequenceMatcher(None, a, b, autojunk=False)
    dogru_konumlar: set[int] = set()
    for blok in eslesme.get_matching_blocks():
        dogru_konumlar.update(range(blok.a, blok.a + blok.size))
    turkce = [i for i, c in enumerate(a) if c in "çğıöşüÇĞİÖŞÜ"]
    return {
        "karakter": len(dogru_konumlar) / max(len(a), 1),
        "turkce_harf": sum(i in dogru_konumlar for i in turkce) / max(len(turkce), 1),
        "turkce_harf_sayisi": len(turkce),
    }
