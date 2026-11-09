"""Okuyucu: KAP metni → haneler.

İki yol:
- Ajan yolu (asıl): Claude Code rutini bildirimi okur, `KapHane` şemasında JSON yazar; `ajan_json_oku` doğrular.
- Düzenli ifade yolu (yedek/otomasyon): `metinden_hane` Türkçe sayı/para/oran/süre kalıplarını çıkarır.
`zenginlestir` iki yolda da aynı: kur, piyasa değeri, satış ve özkaynakla oranlar.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from .haneler import KapHane, buyukluk_sinifi

CARPAN = {"bin": 1e3, "milyon": 1e6, "milyar": 1e9, "trilyon": 1e12, "mn": 1e6, "mlr": 1e9}
PARA = [
    (r"ABD\s*Dolar[ıi]|Amerikan\s*Dolar[ıi]|Dolar[ıi]?|dolar[ıi]?|USD|US\$|\$", "USD"),
    (r"Avro|Euro|EUR|€", "EUR"),
    (r"[İI]ngiliz\s*Sterlin[i]?|Sterlin|GBP|£", "GBP"),
    (r"[İI]svi[cç]re\s*Frang[ıi]|CHF", "CHF"),
    (r"T[üu]rk\s*Liras[ıi]|TL|TRY|₺", "TRY"),
]
PARA_DESEN = "|".join(f"(?:{d})" for d, _ in PARA)
SAYI = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?"
TUTAR_1 = re.compile(rf"(?P<sayi>{SAYI})\s*(?P<carpan>bin|milyon|milyar|trilyon|mn|mlr)?\s*(?P<pb>{PARA_DESEN})(?![a-zçğıöşü])", re.IGNORECASE)
TUTAR_2 = re.compile(rf"(?P<pb>USD|EUR|GBP|TL|TRY|US\$|\$|€|₺)\s*(?P<sayi>{SAYI})\s*(?P<carpan>bin|milyon|milyar|trilyon)?", re.IGNORECASE)
YUZDE = re.compile(r"(?:%\s*(?P<a>\d+(?:,\d+)?)|yüzde\s*(?P<b>\d+(?:,\d+)?))", re.IGNORECASE)
SURE = re.compile(r"(?P<n>\d+(?:,\d+)?)\s*(?P<b>ay|aylık|yıl|yıllık|sene)\b", re.IGNORECASE)
PAY_BASI = re.compile(rf"pay\s*ba[şs][ıi]na\s*(?:brüt\s*)?(?P<sayi>{SAYI})\s*(?:TL|Türk\s*Liras[ıi])", re.IGNORECASE)
BRUT = re.compile(rf"brüt\s*(?P<sayi>{SAYI})\s*(?:TL|Türk\s*Liras[ıi])", re.IGNORECASE)
NOT_DEGISIM = re.compile(r"(?P<eski>(?:AAA|AA|A|BBB|BB|B|CCC|Aaa|Aa|Baa|Ba|Caa)[+-]?\d?)\s*['’]?\s*(?:dan|den|tan|ten)\s+(?P<yeni>(?:AAA|AA|A|BBB|BB|B|CCC|Aaa|Aa|Baa|Ba|Caa)[+-]?\d?)\s*['’]?\s*(?:a|e|ya|ye)\b")

TUR_ANAHTAR: list[tuple[str, list[str]]] = [  # sıra önemli: daha özgül olan önce
    ("bedelsiz", ["bedelsiz", "iç kaynaklardan karşılanmak", "iç kaynaklardan"]),
    ("bedelli", ["bedelli sermaye", "rüçhan hakkı", "nakden karşılanmak"]),
    ("geri_alim", ["geri alım", "geri alınması", "pay geri"]),
    ("temettu", ["kâr payı", "kar payı", "temettü", "kar dağıtım", "kâr dağıtım"]),
    ("derecelendirme", ["derecelendirme", "kredi notu", "notunu", "fitch", "moody", "s&p", "jcr"]),
    ("finansal_rapor", ["finansal rapor", "finansal tablo", "net dönem kâr", "net dönem kar", "bilanço"]),
    ("borclanma", ["borçlanma aracı", "tahvil", "bono", "eurobond", "sukuk", "kira sertifika"]),
    ("dava_ceza", ["dava", "idari para cezası", "ceza", "vergi inceleme", "tazminat"]),
    ("pay_satisi", ["pay satışı", "blok satış", "toptan satış", "payların satış", "satılmasına", "satışına ilişkin"]),
    ("birlesme_devralma", ["devralma", "birleşme", "satın alınması", "iştirak edinim", "pay devri", "satın alım"]),
    ("ihale", ["ihale"]),
    ("is_iliskisi", ["sözleşme", "sipariş", "iş ilişkisi", "anlaşma imza", "tedarik"]),
    ("yatirim", ["yatırım", "tesis", "kapasite", "fabrika", "ges", "res ", "üretim hattı"]),
    ("yeni_is", ["lisans", "ruhsat", "patent", "yeni iş", "faaliyet alanı"]),
]


def tr_sayi(s: str) -> float:
    """'20.000.000' → 2e7; '1,5' → 1.5; '12.500.000,50' → 12500000.5; '1.5' → 1.5 (tek nokta, 3 hane değilse ondalık)."""
    s = s.strip()
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", s):
        return float(s.replace(".", "").replace(",", "."))
    if "," in s:
        return float(s.replace(".", "").replace(",", "."))
    return float(s)


def _para_kodu(ham: str) -> str | None:
    for desen, kod in PARA:
        if re.fullmatch(desen, ham.strip(), re.IGNORECASE):
            return kod
    return None


def tutarlar(metin: str) -> list[tuple[float, str]]:
    out = []
    for m in list(TUTAR_1.finditer(metin)) + list(TUTAR_2.finditer(metin)):
        try:
            deger = tr_sayi(m.group("sayi")) * CARPAN.get((m.group("carpan") or "").lower(), 1.0)
        except ValueError:
            continue
        kod = _para_kodu(m.group("pb"))
        if kod and deger > 0:
            out.append((deger, kod))
    return out


def tur_bul(metin: str) -> str:
    k = metin.lower()
    for tur, anahtarlar in TUR_ANAHTAR:
        if any(a in k for a in anahtarlar):
            return tur
    return "diger"


def metinden_hane(metin: str, hisse: str, kamuya_acilma: datetime | str, baslik: str = "", kaynak: str | None = None) -> KapHane:
    """Düzenli ifade okuyucusu. Güven: tür + tutar/oran bulunduysa 0,6; yalnız tür 0,4; hiçbiri 0,2."""
    tum = f"{baslik}. {metin}"
    tur = tur_bul(tum)
    d: dict = {"hisse": hisse, "kamuya_acilma": kamuya_acilma, "tur": tur, "baslik": baslik[:200], "metin": metin[:2000], "kaynak": kaynak, "okuyan": "regex"}
    notlar = []
    tl = tutarlar(tum)
    pay_basi = PAY_BASI.search(tum) or (BRUT.search(tum) if tur == "temettu" else None)
    if pay_basi:
        d["pay_basi_tl"] = tr_sayi(pay_basi.group("sayi"))
    # 10.000 TL altı TL tutarlar pay başı fiyattır (temettü pay başı, satış/rüçhan fiyatı), ana tutar değildir
    kucuk_tl = [v for v, k in tl if k == "TRY" and v < 10_000]
    if kucuk_tl and tur in ("pay_satisi", "bedelli", "birlesme_devralma"):
        d["islem_fiyati_tl"] = kucuk_tl[0]
    if tl:
        # en büyük tutar ana tutardır (toplam/ilk etap ayrımında toplam)
        adaylar = [(v, k) for v, k in tl if not (k == "TRY" and v < 10_000)]
        if adaylar:
            v, k = max(adaylar, key=lambda x: x[0])
            d["tutar"], d["para_birimi"] = v, k
            if len({kk for _, kk in adaylar}) > 1:
                notlar.append("birden çok para birimi; en büyük tutar alındı")
    yuzdeler = [tr_sayi(m.group("a") or m.group("b")) / 100 for m in YUZDE.finditer(tum)]
    if yuzdeler and tur in ("bedelsiz", "bedelli", "pay_satisi", "birlesme_devralma"):
        d["oran"] = max(yuzdeler)
    sure = SURE.search(tum)
    if sure:
        n = tr_sayi(sure.group("n"))
        d["sure_ay"] = n * (12 if sure.group("b").lower().startswith(("yıl", "sene")) else 1)
    if tur == "derecelendirme":
        m = NOT_DEGISIM.search(tum)
        if m:
            d["not_eski"], d["not_yeni"] = m.group("eski"), m.group("yeni")
        if re.search(r"yükselt|artır|pozitif", tum, re.IGNORECASE):
            d["yon"] = "olumlu"
        elif re.search(r"düşür|indir|negatif", tum, re.IGNORECASE):
            d["yon"] = "olumsuz"
    bulundu = any(d.get(k) is not None for k in ("tutar", "oran", "pay_basi_tl", "not_yeni", "islem_fiyati_tl"))
    d["guven"] = 0.6 if (tur != "diger" and bulundu) else 0.4 if tur != "diger" else 0.2
    d["notlar"] = notlar
    return KapHane(**d)


def ajan_json_oku(yol: str | Path) -> list[KapHane]:
    """Ajanın yazdığı JSON (tek nesne, liste ya da {"haneler": [...]}) → doğrulanmış haneler."""
    veri = json.loads(Path(yol).read_text(encoding="utf-8"))
    liste = veri.get("haneler", veri) if isinstance(veri, dict) and "haneler" in veri else (veri if isinstance(veri, list) else [veri])
    return [KapHane(**h) for h in liste]


def zenginlestir(h: KapHane, fiyat: float | None, piyasa_degeri_tl: float | None, usdtry: float | None,
                 satis_ttm_tl: float | None = None, ozkaynak_tl: float | None = None, eurtry: float | None = None) -> KapHane:
    """Türetilmiş haneler. Kur: TRY=1, USD=usdtry, EUR=eurtry (yoksa usdtry×1,08 yaklaşık, not düşülür)."""
    h = h.model_copy(deep=True)
    h.usdtry = usdtry
    if h.tutar is not None and h.para_birimi:
        if h.para_birimi == "TRY":
            h.kur = 1.0
        elif h.para_birimi == "USD" and usdtry:
            h.kur = usdtry
        elif h.para_birimi == "EUR":
            h.kur = eurtry or (usdtry * 1.08 if usdtry else None)
            if not eurtry and usdtry:
                h.notlar.append("EUR kuru USD×1,08 ile yaklaşık")
        elif h.para_birimi == "GBP" and usdtry:
            h.kur = usdtry * 1.27
            h.notlar.append("GBP kuru USD×1,27 ile yaklaşık")
        if h.kur:
            h.tutar_tl = h.tutar * h.kur
    h.piyasa_degeri_tl = piyasa_degeri_tl
    if h.tutar_tl and piyasa_degeri_tl:
        h.pd_orani = h.tutar_tl / piyasa_degeri_tl
    if h.tutar_tl and satis_ttm_tl:
        h.satis_orani = h.tutar_tl / satis_ttm_tl
    if h.tutar_tl and ozkaynak_tl:
        h.ozkaynak_orani = h.tutar_tl / ozkaynak_tl
    if h.pay_basi_tl and fiyat and h.tur == "temettu":
        h.temettu_verimi = h.pay_basi_tl / fiyat
    if h.net_kar is not None and h.beklenti:
        h.kar_surprizi = h.net_kar / abs(h.beklenti) - (1 if h.beklenti > 0 else -1)
    if h.tur in ("bedelsiz", "bedelli", "pay_satisi") and h.oran is not None and h.pd_orani is None:
        h.buyukluk = buyukluk_sinifi(h.oran / 10)  # oran türlerinde kaba eşleme: %100 bedelsiz → "büyük"
    else:
        h.buyukluk = buyukluk_sinifi(h.pd_orani)
    return h
