"""Dışa aktarılmış CSV dosyalarını (Mixpanel, Hotjar, başka) okur ve sütun türlerini tahmin eder.

Kodlama (UTF-8 / Windows-1254), ayraç (, ; sekme), Türkçe ve İngilizce sayı biçimleri, gün/ay sırası
sütun bazında çözülür. Model dosyayı okumaz; yalnız buradan üretilen özeti görür.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
import statistics
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

csv.field_size_limit(10_000_000)


def oku(yol) -> Tuple[List[str], List[List[str]]]:
    """CSV ya da XLSX (ilk sayfa) → (başlıklar, satırlar). Hücreler metin olarak döner."""
    if Path(yol).suffix.lower() in (".xlsx", ".xlsm"):
        return _xlsx_oku(Path(yol))
    ham = Path(yol).read_bytes()
    metin = None
    for kodlama in ("utf-8-sig", "cp1254", "latin-1"):
        try:
            metin = ham.decode(kodlama)
            break
        except UnicodeDecodeError:
            continue
    assert metin is not None
    ornek = metin[:50000]
    try:
        lehce = csv.Sniffer().sniff(ornek, delimiters=",;\t|")
    except csv.Error:
        lehce = csv.excel
    satirlar = [s for s in csv.reader(io.StringIO(metin), lehce) if any(h.strip() for h in s)]
    if not satirlar:
        return [], []
    basliklar = _benzersiz([b.strip() or f"sutun_{i + 1}" for i, b in enumerate(satirlar[0])])
    genislik = len(basliklar)
    veri = [(s + [""] * genislik)[:genislik] for s in satirlar[1:]]
    return basliklar, veri


def _benzersiz(adlar: Sequence[str]) -> List[str]:
    sayac: Counter = Counter()
    sonuc = []
    for ad in adlar:
        sayac[ad] += 1
        sonuc.append(ad if sayac[ad] == 1 else f"{ad} ({sayac[ad]})")
    return sonuc


_TR_BINLIK = re.compile(r"-?\d{1,3}(\.\d{3})+(,\d+)?")
_EN_BINLIK = re.compile(r"-?\d{1,3}(,\d{3})+(\.\d+)?")
_TR_ONDALIK = re.compile(r"-?\d+,\d+")


def sayiya(hucre: str) -> Optional[float]:
    h = str(hucre).strip().replace("%", "").replace(" ", "").replace(" ", "")
    if not h:
        return None
    if _TR_BINLIK.fullmatch(h):
        h = h.replace(".", "").replace(",", ".")
    elif _EN_BINLIK.fullmatch(h):
        h = h.replace(",", "")
    elif _TR_ONDALIK.fullmatch(h):
        h = h.replace(",", ".")
    try:
        return float(h)
    except ValueError:
        return None


_BICIMLER = [
    "%Y-%m-%d",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d/%m/%Y",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%m/%d/%Y",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%d.%m.%Y",
    "%d.%m.%Y %H:%M",
    "%d.%m.%Y %H:%M:%S",
    "%b %d, %Y",
    "%d %b %Y",
    "%B %d, %Y",
]


def _iso(hucre: str) -> Optional[dt.date]:
    h = hucre.strip()
    if not re.match(r"\d{4}-\d{2}-\d{2}", h):
        return None
    h = h.replace("Z", "+00:00")
    try:
        return dt.datetime.fromisoformat(h).date()
    except ValueError:
        try:
            return dt.date.fromisoformat(h[:10])
        except ValueError:
            return None


def tarih_bicimi(degerler: Sequence[str]) -> Optional[str]:
    """Örnek değerlerin en çoğunu çözen biçim ('iso' ya da strptime biçimi); %90 altındaysa None."""
    ornek = [d.strip() for d in degerler if d and d.strip()][:200]
    if not ornek:
        return None
    en_iyi, en_iyi_sayi = None, 0
    iso_sayi = sum(1 for d in ornek if _iso(d))
    if iso_sayi:
        en_iyi, en_iyi_sayi = "iso", iso_sayi
    for bicim in _BICIMLER:
        sayi = 0
        for d in ornek:
            try:
                dt.datetime.strptime(d, bicim)
                sayi += 1
            except ValueError:
                pass
        if sayi > en_iyi_sayi:
            en_iyi, en_iyi_sayi = bicim, sayi
    return en_iyi if en_iyi_sayi >= 0.9 * len(ornek) else None


def tarihe(hucre: str, bicim: Optional[str]) -> Optional[dt.date]:
    if not hucre or not bicim:
        return None
    if bicim == "iso":
        return _iso(hucre)
    try:
        return dt.datetime.strptime(hucre.strip(), bicim).date()
    except ValueError:
        return None


def sutun_turu(degerler: Sequence[str]) -> Dict:
    """{'tur': bos|sayi|tarih|url|metin|kategori, ...ek bilgiler}"""
    dolu = [d.strip() for d in degerler if d is not None and str(d).strip()]
    if not dolu:
        return {"tur": "bos", "dolu": 0}
    sayilar = [sayiya(d) for d in dolu]
    gecerli = [s for s in sayilar if s is not None]
    if len(gecerli) >= 0.9 * len(dolu):
        tamsayi = all(float(s).is_integer() for s in gecerli)
        olcek = None
        if tamsayi and gecerli and min(gecerli) >= 0 and max(gecerli) <= 10 and len(set(gecerli)) >= 3:
            olcek = "0-10" if max(gecerli) > 5 or min(gecerli) == 0 else "1-5"
        return {"tur": "sayi", "dolu": len(dolu), "tamsayi": tamsayi, "olcek": olcek}
    bicim = tarih_bicimi(dolu)
    if bicim:
        return {"tur": "tarih", "dolu": len(dolu), "bicim": bicim}
    if sum(1 for d in dolu if d.lower().startswith(("http://", "https://"))) >= 0.6 * len(dolu):
        return {"tur": "url", "dolu": len(dolu)}
    ortalama_kelime = statistics.mean(len(d.split()) for d in dolu)
    benzersiz_oran = len(set(dolu)) / len(dolu)
    if ortalama_kelime >= 4 or (ortalama_kelime >= 2.5 and benzersiz_oran > 0.6):
        return {"tur": "metin", "dolu": len(dolu), "ort_kelime": ortalama_kelime}
    return {"tur": "kategori", "dolu": len(dolu), "benzersiz": len(set(dolu))}


def sutun(basliklar: Sequence[str], satirlar: Sequence[Sequence[str]], ad: str) -> List[str]:
    if ad not in basliklar:
        adaylar = [b for b in basliklar if ad.lower() in b.lower()]
        if len(adaylar) != 1:
            raise KeyError(f"Sütun bulunamadı: {ad!r}. Var olanlar: {', '.join(basliklar[:20])}")
        ad = adaylar[0]
    i = list(basliklar).index(ad)
    return [s[i] for s in satirlar]


def url_yolu(url: str) -> str:
    """https://ornek.com/odeme/adim-2?x=1#y -> /odeme/adim-2 (sorgu ve parça atılır)."""
    yol = re.sub(r"^[a-z]+://[^/]+", "", url.strip(), flags=re.I)
    yol = yol.split("?", 1)[0].split("#", 1)[0]
    return yol or "/"


_XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_TARIH_BASLIGI = re.compile(r"date|tarih|time|zaman|submitted|created", re.I)


def _sutun_no(ref: str) -> int:
    harfler = re.match(r"[A-Z]+", ref or "A").group()
    no = 0
    for h in harfler:
        no = no * 26 + (ord(h) - 64)
    return no - 1


def _xlsx_oku(yol: Path) -> Tuple[List[str], List[List[str]]]:
    import xml.etree.ElementTree as ET
    import zipfile

    def xml(z, ad):
        veri = z.read(ad)
        if b"<!DOCTYPE" in veri[:2048] or b"<!ENTITY" in veri[:4096]:
            raise ValueError("XLSX içinde DOCTYPE/ENTITY var; dosya reddedildi. CSV olarak dışa aktarın.")
        return ET.fromstring(veri)

    with zipfile.ZipFile(yol) as z:
        adlar = z.namelist()
        paylasilan: List[str] = []
        if "xl/sharedStrings.xml" in adlar:
            for si in xml(z, "xl/sharedStrings.xml").iter(_XLSX_NS + "si"):
                paylasilan.append("".join(t.text or "" for t in si.iter(_XLSX_NS + "t")))
        sayfalar = sorted(a for a in adlar if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", a))
        if not sayfalar:
            raise ValueError("XLSX içinde çalışma sayfası bulunamadı.")
        satirlar: List[List[str]] = []
        for satir in xml(z, sayfalar[0]).iter(_XLSX_NS + "row"):
            hucreler: Dict[int, str] = {}
            for c in satir.findall(_XLSX_NS + "c"):
                tur, v = c.get("t"), c.find(_XLSX_NS + "v")
                if tur == "s" and v is not None:
                    deger = paylasilan[int(v.text)]
                elif tur == "inlineStr":
                    deger = "".join(t.text or "" for t in c.iter(_XLSX_NS + "t"))
                elif tur == "b" and v is not None:
                    deger = "TRUE" if v.text == "1" else "FALSE"
                else:
                    deger = v.text if v is not None and v.text is not None else ""
                hucreler[_sutun_no(c.get("r"))] = deger
            if hucreler:
                satirlar.append([hucreler.get(i, "") for i in range(max(hucreler) + 1)])
    satirlar = [s for s in satirlar if any(h.strip() for h in s)]
    if not satirlar:
        return [], []
    basliklar = _benzersiz([b.strip() or f"sutun_{i + 1}" for i, b in enumerate(satirlar[0])])
    genislik = len(basliklar)
    veri = [(s + [""] * genislik)[:genislik] for s in satirlar[1:]]
    for i, b in enumerate(basliklar):
        if not _TARIH_BASLIGI.search(b):
            continue
        for s in veri:
            sayi = sayiya(s[i]) if s[i] else None
            if sayi is not None and 20000 < sayi < 80000:
                s[i] = (dt.datetime(1899, 12, 30) + dt.timedelta(days=sayi)).strftime("%Y-%m-%d %H:%M:%S")
    return basliklar, veri
