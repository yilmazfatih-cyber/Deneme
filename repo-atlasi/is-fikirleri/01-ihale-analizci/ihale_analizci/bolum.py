"""Markdown'ı bölümlere ve alıntılanabilir birimlere ayırır.

Kaynak gösterme bu modülün işidir: her birim dosya adını, bölüm başlığını,
alt madde numarasını (ör. 26.1) ve dönüştürülmüş Markdown'daki satırı taşır.
"""

import re
from dataclasses import dataclass, field

from .metin import cumlelere_bol, katla

_MD_BASLIK = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
# "Madde 26 - Geçici teminat" başlıktır; "Madde 5'te belirtilen..." cümlesi değildir.
_MADDE = re.compile(r"^\s*(?:\*\*)?\s*madde\s+(\d+)\s*(?:[-–—.:]\s*(.*?))?\s*(?:\*\*)?\s*$", re.IGNORECASE)
_KALIN = re.compile(r"^\s*\*\*([^*]{3,100})\*\*\s*$")
# Alt madde numarası: 26.1, 7.1.2. Her parça en çok 3 hane; "15.12.2026" (tarih) bu yüzden eşleşmez.
_ALT_MADDE = re.compile(r"^\s*(?:[-*]\s+)?(\d{1,3}(?:\.\d{1,3}){1,4})\.?(?=\s|$)")
_ALT_MADDE_ORTADA = re.compile(r"\s(\d+\.\d+(?:\.\d+)*)\.?\s+(?=[A-ZÇĞİÖŞÜ])")
_TABLO_AYIRICI = re.compile(r"^\s*\|?\s*:?-{3,}")
_MADDE_ISARETI = re.compile(r"^\s*[-*+]\s+")
# Liste öğesi asla başlık değildir: "- İMZA SİRKÜLERİ", "b) İŞ DENEYİM BELGESİ".
_LISTE_OGESI = re.compile(r"^\s*(?:[-*+]\s|\(?[a-zçğıöşü]\)\s)", re.IGNORECASE)
# Başlığın önündeki numara: "BÖLÜM 2 -", "EK-1", "2." (katlanmış metinde aranır).
_BASLIK_NUMARASI = re.compile(r"^(?:(?:bolum|kisim|ek|madde)\s*-?\s*)?\d+(?:\.\d+)*\s*[-.):]?\s*")
# Türkçe yüklem ekleri (katlanmış): "zorunludur", "verilecektir", "verilir", "sunulur", "uygulanmaz".
# "-ler/-lar" çoğul ekiyle biten sözcükler ("Genel hükümler", "Belgeler") yüklem sayılmaz.
_YUKLEM_EKI = re.compile(r"(?:d[iu]r|t[iu]r|[ae]c[ae]k|m[ae]z|[iu]r)$")


@dataclass
class Birim:
    dosya: str
    bolum: str
    alt_madde: str | None
    satir: int
    metin: str

    def kaynak(self) -> str:
        parcalar = [self.dosya, self.bolum] + ([self.alt_madde] if self.alt_madde else [])
        return " › ".join(parcalar) + f" (satır {self.satir})"


@dataclass
class Bolum:
    dosya: str
    baslik: str
    satir: int
    satirlar: list[tuple[int, str]] = field(default_factory=list)

    def metin(self) -> str:
        return "\n".join(s for _, s in self.satirlar)


def satirlari_normallestir(metin: str) -> str:
    """Her satır sonunu "\\n" yapar.

    str.splitlines() sayfa sonu (\\x0c, pdfminer her PDF sayfasının sonuna koyar), \\x0b, \\x1c–\\x1e,
    \\x85, \\u2028 ve \\u2029 karakterlerini de satır sonu sayar; metin düzenleyiciler saymaz. Satır numarası
    ile cikti/markdown altına yazılan dosyanın satırı aynı olsun diye metin bir kez normalleştirilir.
    """
    return "\n".join(metin.splitlines()) + ("\n" if metin else "")


def yan_cumle_mi(metin: str) -> bool:
    """Satır başlık değil de değer taşıyan bir cümle mi?

    Rakam, %, ‰, iki noktadan sonra gelen açıklama ya da Türkçe yüklem eki taşıyan satır içeriktir:
    "SON TEKLİF VERME TARİHİ 5 ŞUBAT 2027", "BU İHALEDE FİYAT FARKI VERİLMEYECEKTİR.",
    "Geçici teminat: Muhammen bedelin %3'üdür.". Baştaki numara ("BÖLÜM 2 -", "EK-1") sayılmaz.
    """
    k = katla(metin).strip("* ")
    govde = _BASLIK_NUMARASI.sub("", k, count=1)
    if any(c.isdigit() for c in govde) or "%" in govde or "‰" in govde:
        return True
    if re.search(r":\s*\S", govde):
        return True
    kelimeler = re.findall(r"[a-z]+", govde)
    if len(kelimeler) >= 2:
        son = kelimeler[-1]
        return not re.search(r"l[ae]r$", son) and bool(_YUKLEM_EKI.search(son))
    return False


def _buyuk_harf_baslik_mi(satir: str) -> bool:
    harfler = [c for c in satir if c.isalpha()]
    if satir.startswith("|") or _LISTE_OGESI.match(satir):
        return False  # tablo satırı ya da liste öğesi
    return 4 <= len(satir) <= 80 and len(harfler) >= 4 and satir == satir.upper()


def _madde_basligi(no: str, kalan: str) -> tuple[str, str]:
    """ "Madde N - kalan" satırını (başlık, aynı satırdaki içerik) olarak ayırır."""
    ic = _ALT_MADDE_ORTADA.search(" " + kalan)
    if ic:  # "Madde 26- Geçici teminat 26.1. Teklif edilen..." → başlık + içerik
        ad, icerik = kalan[: ic.start()].strip(), kalan[ic.start() :].strip()
    elif yan_cumle_mi(kalan):
        # "Madde 6- Geçici teminat: Muhammen bedelin %3'üdür." ya da "MADDE 5 – (1) İstekliler ... verir."
        # Cümlenin tamamı içerik olur; iki noktadan önceki kısa ad varsa başlığa da yazılır.
        ad = kalan.split(":", 1)[0].strip() if ":" in kalan else ""
        if len(ad) > 60 or yan_cumle_mi(ad):
            ad = ""
        icerik = kalan
    else:
        ad, icerik = kalan.rstrip(":").strip(), ""
    if len(ad) > 90:  # başlık değil düz cümle
        ad, icerik = "", kalan
    return (f"Madde {no} - {ad}" if ad else f"Madde {no}"), icerik


def _baslik_coz(satir: str) -> tuple[str, str] | None:
    """Satır bir başlıksa (başlık, aynı satırda kalan içerik) döndürür.

    İçerik taşıyan satır asla yalnızca başlığa dönüştürülmez; yoksa o satırdaki tarih ya da oran
    hiçbir çıkarıcıya ulaşmazdı.
    """
    if m := _MD_BASLIK.match(satir):
        return m.group(1).strip("* ").rstrip(":"), ""
    if m := _MADDE.match(satir):
        return _madde_basligi(m.group(1), (m.group(2) or "").strip())
    if m := _KALIN.match(satir):
        ic = m.group(1).strip()
        return None if yan_cumle_mi(ic) else (ic.rstrip(":"), "")
    s = satir.strip()
    if _buyuk_harf_baslik_mi(s) and not yan_cumle_mi(s):
        return s.rstrip(":"), ""
    return None


def bolumlere_ayir(dosya: str, markdown: str) -> list[Bolum]:
    bolumler = [Bolum(dosya, "(Giriş)", 1)]
    for no, satir in enumerate(markdown.splitlines(), start=1):
        if not satir.strip():
            continue
        baslik = _baslik_coz(satir)
        if baslik:
            bolumler.append(Bolum(dosya, baslik[0], no))
            if baslik[1]:
                bolumler[-1].satirlar.append((no, baslik[1]))
        else:
            bolumler[-1].satirlar.append((no, satir.strip()))
    return [b for b in bolumler if b.satirlar or b.baslik != "(Giriş)"]


def alt_madde_no(satir: str) -> str | None:
    """Satır başındaki alt madde numarası (26.1); tarih ve binlik ayırıcılı tutar (1.500.000, 1.500 TL) değildir."""
    m = _ALT_MADDE.match(satir)
    if not m:
        return None
    parcalar = m.group(1).split(".")
    binlik = all(len(p) == 3 for p in parcalar[1:])
    para_birimi = re.match(r"\s*(?:₺|(?:tl|try|lira|euro|avro|usd|dolar)\b)", katla(satir[m.end() :]))
    if binlik and (len(parcalar) >= 3 or para_birimi):
        return None
    return m.group(1)


def birimlere_ayir(bolum: Bolum) -> list[Birim]:
    birimler, alt_madde = [], None
    for i, (no, satir) in enumerate(bolum.satirlar):
        sonraki = bolum.satirlar[i + 1][1] if i + 1 < len(bolum.satirlar) else ""
        if _TABLO_AYIRICI.match(satir) or (satir.startswith("|") and _TABLO_AYIRICI.match(sonraki)):
            continue  # ayırıcı satır ya da tablo başlığı ("Sıra | İstenen belge | Durum") birim değildir
        if satir.startswith("|"):
            hucreler = [h.strip() for h in satir.strip("|").split("|")]
            satir = " | ".join(h for h in hucreler if h)
        satir = _MADDE_ISARETI.sub("", satir)
        if no_ := alt_madde_no(satir):
            alt_madde = no_
        for cumle in cumlelere_bol(satir):
            birimler.append(Birim(bolum.dosya, bolum.baslik, alt_madde, no, cumle.strip()))
    return birimler
