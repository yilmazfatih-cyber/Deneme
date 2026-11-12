"""Ürün sayfasından fiyat, eski fiyat, para birimi, stok ve kampanya metni çıkarma.

Öncelik sırası: Firecrawl "product" biçimi → JSON-LD (schema.org Product/ProductGroup/Offer) → meta/microdata →
görünür metin. Firecrawl'ın ürün profili (firecrawl/firecrawl @ a0535ec, apps/api/src/types/product.ts):
variants[].price.amount ve .currency, variants[].sale.originalPrice.amount, variants[].availability.inStock. Fiyat
varyant düzeyindedir; radar ilk varyantı okur (çok varyantlı üründe rakip URL'si doğrudan o varyanta gitmelidir).
"""

import html as html_lib
import json
import re
from dataclasses import dataclass, field

from .fiyat import BOSLUKLAR, kurus

_LDJSON = re.compile(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)
_META_ADLARI = {"fiyat": "product:price:amount|price", "para": "product:price:currency|og:price:currency|pricecurrency"}
_META = {
    tur: [
        re.compile(rf"""(?:property|itemprop|name)=["'](?:{adlar})["'][^>]*content=["']([^"']+)""", re.I),
        re.compile(rf"""content=["']([^"']+)["'][^>]*(?:property|itemprop|name)=["'](?:{adlar})["']""", re.I),
    ]
    for tur, adlar in _META_ADLARI.items()
}
_ESKI_ETIKET = re.compile(r"<(del|s|strike)\b[^>]*>(.*?)</\1>", re.S | re.I)
_SINIFLI_OGE = re.compile(r"""<[a-z][a-z0-9]*\b[^>]*?\bclass=["']([^"']*)["'][^>]*>([^<]{1,40})<""", re.I)
# Sınıf adı parçalara bölünür ("old-price", "priceOld", "eski_fiyat"); "price-holder", "bold" eşleşmez.
_ESKI_SINIF_PARCALARI = {"old", "eski", "strike", "strikethrough", "through", "original", "was", "önceki", "onceki"}
_SINIF_BOL = re.compile(r"[\s_-]+|(?<=[a-zçğıöşü0-9])(?=[A-ZÇĞİÖŞÜ])")
# Sayı: "1.299,90", "1\u00a0299,90" (bölünmez boşlukla binlik), "1299,9", "1299.90"; sayının ortasından başlamaz.
# Düz boşluk binlik ayırıcı sayılmaz: etiketler silinince "X100" model adı ile "100 TL" yan yana gelir ve
# "X100 100 TL" 100.100 TL okunurdu. tr-TR biçiminde binlik ayırıcı noktadır.
_SAYI = rf"(?<![\d.,])(?:\d{{1,3}}(?:[.{BOSLUKLAR}]\d{{3}})+(?:,\d{{1,2}})?|\d+(?:[.,]\d{{1,2}})?)(?!\d)"
_FIYAT_METNI = re.compile(rf"(?:₺|\bTL)\s?{_SAYI}|{_SAYI}\s?(?:TL\b|₺)")
# Küçük harfe çevrilmiş metinde aranır. Olumsuzlar önce bakılır: "stokta kalmadı" stokta VAR sayılmaz.
_STOK_YOK = re.compile(
    r"tükendi|stokta\s+(?:yok|değil|kalmadı|bulunmuyor|bulunmamaktadır|mevcut\s+değil)|stok\s+yok|stoklarda\s+yok"
    r"|gelince\s+haber\s+ver|satışa\s+kapalı|temin\s+edilemiyor|tedarik\s+edilemiyor"
)
_STOK_VAR = re.compile(
    r"sepete\s+ekle|hemen\s+al|satın\s+al|stokta(?!\s+(?:yok|değil|kalmadı|bulun|mevcut\s+değil|olmayan))"
)
# Her kalıp dar tutulur ki komşu metni yutmasın.
_KAMPANYA = re.compile(
    r"sepette\s+(?:%\s?\d{1,2}|\d[\d.,]*\s?tl)(?:\s+indirim)?|%\s?\d{1,2}\s+indirim|\d\s+al\s+\d\s+öde"
    r"|(?:ücretsiz|bedava)\s+kargo|kargo\s+(?:bedava|ücretsiz)|\d{1,2}\s+taksit"
    r"|kupon\s+kodu:?\s*[a-z0-9]{3,15}|son\s+gün|bugüne\s+özel|\d[\d.]*\s?tl\s+ve\s+üzeri"
)
_STOK_SCHEMA = {"InStock": True, "LimitedAvailability": True, "OnlineOnly": True, "PreOrder": True}
_STOK_SCHEMA.update({"OutOfStock": False, "SoldOut": False, "Discontinued": False})


@dataclass
class UrunDurumu:
    fiyat: int | None = None  # kuruş
    eski_fiyat: int | None = None
    para_birimi: str | None = None  # kaynakta yazıyorsa ISO kodu ("TRY", "USD"); görünür metin yolunda "TRY"
    stokta: bool | None = None
    kampanyalar: list[str] = field(default_factory=list)
    kaynak: str = ""


def tr_kucuk(metin: str) -> str:
    """Uzunluğu koruyan Türkçe küçük harf (I→ı, İ→i); eşleşme konumu orijinal metne uygulanabilir."""
    return metin.replace("I", "ı").replace("İ", "i").lower()


def gorunur_metin(html: str) -> str:
    """Etiketsiz metin. Yalnızca ASCII boşluklar sadeleşir; bölünmez boşluk (&nbsp;) binlik ayırıcı olarak kalır."""
    html = re.sub(r"<!--.*?-->|<(script|style|noscript|template)\b.*?</\1>", " ", html, flags=re.S | re.I)
    return re.sub(r"[ \t\r\n\f\v]+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", html))).strip()


def _sozluk(deger) -> dict:
    return deger if isinstance(deger, dict) else {}


def _turler(d: dict) -> set[str]:
    tur = d.get("@type")
    # "Product", "http://schema.org/Product" ve "schema:Product" aynı türdür
    return {str(t).rsplit("/", 1)[-1].rsplit(":", 1)[-1] for t in (tur if isinstance(tur, list) else [tur]) if t}


def _jsonld_urunleri(html: str):
    """Belge sırasıyla (önce ana ürün, sonra "benzer ürünler") Product ve ProductGroup düğümleri."""
    for blok in _LDJSON.findall(html):
        try:
            yigin = [json.loads(blok.strip())]
        except (ValueError, RecursionError):
            continue
        while yigin:
            d = yigin.pop()
            if isinstance(d, list):
                yigin.extend(reversed(d))  # pop() ilk öğeyi önce versin
            elif isinstance(d, dict):
                if _turler(d) & {"Product", "ProductGroup"}:
                    yield d
                yigin.extend(reversed([d[k] for k in ("mainEntity", "@graph", "hasVariant") if k in d]))


def _jsonld_teklif(urun: dict) -> tuple[object, str | None, bool | None, object]:
    """(fiyat, para birimi, stok, eski fiyat).

    Eski fiyat için priceSpecification[].priceType "StrikethroughPrice"/"ListPrice" okunur; bu, Google'ın ürün verisi
    önerisidir (doğrulanmadı: bu ortamda internet yok).
    """
    teklif = urun.get("offers")
    if isinstance(teklif, list):
        teklif = next((t for t in teklif if isinstance(t, dict)), None)
    if not isinstance(teklif, dict):
        return None, None, None, None
    fiyat = teklif.get("price")
    if fiyat in (None, ""):
        fiyat = teklif.get("lowPrice")  # AggregateOffer
    para = teklif.get("priceCurrency")
    ozellikler = teklif.get("priceSpecification")
    ozellikler = [o for o in (ozellikler if isinstance(ozellikler, list) else [ozellikler]) if isinstance(o, dict)]
    eski = None
    for oz in ozellikler:
        ustu_cizili = any(t in str(oz.get("priceType", "")) for t in ("StrikethroughPrice", "ListPrice"))
        if ustu_cizili:
            eski = oz.get("price")
        elif fiyat in (None, "") and oz.get("price") not in (None, ""):
            fiyat, para = oz["price"], oz.get("priceCurrency", para)
    stok = _STOK_SCHEMA.get(str(teklif.get("availability", "")).rstrip("/").rsplit("/", 1)[-1])
    return fiyat, (str(para).strip().upper() if para else None), stok, eski


def _meta(html: str, tur: str) -> str | None:
    for desen in _META[tur]:
        if m := desen.search(html):
            return m.group(1)
    return None


def _eski_sinif_mi(sinif: str) -> bool:
    return any(tr_kucuk(parca) in _ESKI_SINIF_PARCALARI for parca in _SINIF_BOL.split(sinif))


def _kampanyalar(metin: str) -> list[str]:
    bulunan = [" ".join(metin[m.start() : m.end()].split()) for m in _KAMPANYA.finditer(tr_kucuk(metin))]
    return list(dict.fromkeys(b.strip(" ,;:-") for b in bulunan))[:5]


def _metin_stogu(metin: str) -> bool | None:
    kucuk = tr_kucuk(metin)
    if _STOK_YOK.search(kucuk):
        return False
    return True if _STOK_VAR.search(kucuk) else None


def sayfadan_cikar(html: str, markdown: str | None = None, urun_profili: dict | None = None) -> UrunDurumu:
    durum = UrunDurumu()
    metin = markdown or gorunur_metin(html)

    varyantlar = _sozluk(urun_profili).get("variants")
    varyant = next((v for v in varyantlar if isinstance(v, dict)), {}) if isinstance(varyantlar, list) else {}
    fiyat_alani = _sozluk(varyant.get("price"))
    if (fiyat := kurus(fiyat_alani.get("amount"))) is not None:  # kurus() sıfırı ve NaN'ı fiyat saymaz
        durum.fiyat, durum.kaynak = fiyat, "firecrawl-product"
        durum.para_birimi = str(fiyat_alani["currency"]).upper() if fiyat_alani.get("currency") else None
        durum.eski_fiyat = kurus(_sozluk(_sozluk(varyant.get("sale")).get("originalPrice")).get("amount"))
        stok = _sozluk(varyant.get("availability")).get("inStock")
        durum.stokta = stok if isinstance(stok, bool) else None

    if durum.fiyat is None:
        for urun in _jsonld_urunleri(html):
            fiyat, para, stok, eski = _jsonld_teklif(urun)
            if kurus(fiyat) is not None:
                durum.fiyat, durum.para_birimi, durum.stokta, durum.kaynak = kurus(fiyat), para, stok, "json-ld"
                durum.eski_fiyat = kurus(eski)
                break
    if durum.fiyat is None and (meta := _meta(html, "fiyat")) and kurus(meta) is not None:
        durum.fiyat, durum.kaynak = kurus(meta), "meta"
        para = _meta(html, "para")
        durum.para_birimi = para.strip().upper() if para else None

    if durum.eski_fiyat is None:
        adaylar = [gorunur_metin(m.group(2)) for m in _ESKI_ETIKET.finditer(html)]
        adaylar += [icerik for sinif, icerik in _SINIFLI_OGE.findall(html) if _eski_sinif_mi(sinif)]
        adaylar += re.findall(r"~~([^~]{1,40})~~", markdown or "")
        for aday in adaylar:
            if (m := _FIYAT_METNI.search(aday)) and (k := kurus(m.group(0))):
                durum.eski_fiyat = k
                break

    if durum.fiyat is None:  # son çare: görünür metindeki ilk "… TL", eski fiyat hariç
        fiyatlar = [kurus(m.group(0)) for m in _FIYAT_METNI.finditer(metin)]
        fiyatlar = [f for f in fiyatlar if f and f != durum.eski_fiyat]
        if fiyatlar:
            durum.fiyat, durum.kaynak, durum.para_birimi = fiyatlar[0], "metin", "TRY"

    if durum.eski_fiyat is not None and durum.fiyat is not None and durum.eski_fiyat <= durum.fiyat:
        durum.eski_fiyat = None  # üstü çizili fiyat güncel fiyattan düşükse indirim değildir
    if durum.stokta is None:
        durum.stokta = _metin_stogu(metin)
    durum.kampanyalar = _kampanyalar(metin)
    return durum
