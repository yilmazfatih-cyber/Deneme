"""Kural tabanlı çıkarıcılar: tarih/süre, teminat, istenen belge, cezai şart, ödeme.

Tüm eşleştirmeler katla() ile normalleştirilmiş metinde yapılır; böylece
"GEÇİCİ TEMİNAT", "Geçici teminat" ve PDF'den bozuk çıkan "gecici teminat" aynıdır.
"""

import re
from dataclasses import dataclass
from datetime import date

from .bolum import Birim
from .metin import SAYI, katla, kisalt, sayi_coz, sayi_yaz

KATEGORILER = {
    "tarih": "Tarihler ve süreler",
    "teminat": "Teminatlar",
    "belge": "İstenen belgeler",
    "ceza": "Cezai şartlar",
    "odeme": "Ödeme koşulları",
}


@dataclass
class Bulgu:
    kategori: str
    baslik: str
    deger: str
    birim: Birim
    uyari: str = ""
    yontem: str = "kural"


# --- Ortak: yan cümle ve olumsuzluk -------------------------------------------
# Yan cümle sınırı: noktalı virgül, (rakamlar arasında olmayan) virgül ve iki nokta, "ancak/fakat".
# "%1,5" ve "10:30" bölünmez. "ise" sınır sayılmaz: katlanınca "işe başlama"daki "işe" ile aynı yazılır.
_YAN_CUMLE_SINIRI = re.compile(r";|,(?!\d)|:(?!\d)|\b(?:ancak|fakat)\b")
# Türkçede yüklem sondadır: bir konunun olumlu ya da olumsuz olduğunu konudan SONRA gelen ilk
# yüklem söyler. "Avans verilmeyecek, ancak fiyat farkı verilecektir." → avans yok, fiyat farkı var.
_OLUMSUZ = (
    r"verilmeyecek|verilmez|verilemez|odenmeyecek|odenmez|uygulanmayacak|uygulanmaz|hesaplanmayacak|hesaplanmaz"
    r"|alinmayacak|alinmaz|kesilmeyecek|kesilmez|yapilmayacak|yapilmaz|ongorulmemis|ongorulmemektedir"
    r"|bulunmamaktadir|yoktur|soz konusu degil"
)
_OLUMLU = (
    r"verilecek|verilir|odenecek|odenir|uygulanacak|uygulanir|hesaplanacak|hesaplanir|alinacak|alinir"
    r"|kesilecek|kesilir|yapilacak|yapilir|ongorulmus"
)
_YUKLEM = re.compile(rf"\b(?:(?P<olumsuz>{_OLUMSUZ})|(?P<olumlu>{_OLUMLU}))")
# Olumsuzluk bir istisnaya bağlıysa ("mücbir sebep hallerinde ceza uygulanmaz") "yok" denmez.
_KOSUL = ("halinde", "hallerinde", "durumunda", "durumlarinda", "takdirde", "mucbir", "haric", "disinda", "istisna")
KOSUL_UYARISI = "Olumsuzluk bir koşula ya da istisnaya bağlı görünüyor; cümleyi okuyun."


def _yan_cumle(t: str, konum: int) -> tuple[int, int]:
    """t içinde konum'u kapsayan yan cümlenin (baş, son) aralığı."""
    bas = 0
    for m in _YAN_CUMLE_SINIRI.finditer(t):
        if m.start() >= konum:
            return bas, m.start()
        bas = m.end()
    return bas, len(t)


def _kutup(t: str, bas: int) -> str | None:
    """bas konumundan sonraki ilk yüklemin yönü: "var", "yok", "koşullu" ya da None."""
    m = _YUKLEM.search(t, bas)
    if not m:
        return None
    if m.group("olumlu"):
        return "var"
    return "koşullu" if any(k in t for k in _KOSUL) else "yok"


# --- Tarih ve süreler -------------------------------------------------------
_AYLAR = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"]
# gg.aa.yyyy, gg/aa/yyyy, gg-aa-yyyy (iki ayırıcı aynı olmalı) ya da "5 Şubat 2027".
_TARIH = re.compile(r"\b(\d{1,2})([./-])(\d{1,2})\2(\d{4})\b|\b(\d{1,2}) (" + "|".join(_AYLAR) + r") (\d{4})\b")
_SAAT = re.compile(r"\bsaat:? ?(\d{1,2})[:.](\d{2})\b|\b(\d{1,2}):(\d{2})\b")
_SAAT_UZAKLIGI = 30  # saat, en yakın tarihe ancak bu kadar karakter yakınsa bağlanır ("1:50 ölçekli" saat değildir)
# Türkçe ekler: "takvim günüdür", "30 günlük", "3 aylık"; "2 ayrı" ise süre değildir.
_SURE = re.compile(
    r"\b(\d{1,4}) ?(?:\([^)]{1,40}\) ?)?(takvim gunu|is gunu|gun|hafta|ay|yil)"
    r"(?:u|dur|dir|luk|lik|den|dan|de|da|e|a|i|in|un)?\b"
)
_SURE_BIRIMI = {"takvim gunu": "takvim günü", "is gunu": "iş günü", "gun": "gün", "hafta": "hafta", "ay": "ay", "yil": "yıl"}
# Sıra önemli: özelden genele. "Teklif geçerlilik süresi ihale tarihinden..." önce geçerliliğe düşmeli.
_TARIH_ETIKETLERI = [
    (("mektuplarinin gecerlilik", "mektubunun gecerlilik"), "Teminat mektubu geçerlilik tarihi"),
    (("gecerlilik sure",), "Teklif geçerlilik süresi"),
    (("isin suresi", "is suresi", "ise baslama"), "İşin süresi"),
    (("muayene", "kabul"), "Muayene ve kabul süresi"),
    (("teslim",), "Teslim süresi"),
    (("sozlesme imza", "sozlesmeye davet", "sozlesmeyi imzala"), "Sözleşme imza süresi"),
    (("aciklama talep",), "Açıklama talebi süresi"),
    (("sikayet", "itiraz"), "Şikâyet/itiraz süresi"),
    (("ihale tarihi", "son teklif", "tekliflerin sunulacagi", "teklif verme"), "İhale (son teklif) tarihi"),
]


def _etiket_bul(metin: str) -> str | None:
    return next((ad for anahtarlar, ad in _TARIH_ETIKETLERI if any(a in metin for a in anahtarlar)), None)


def _tarihler(t: str) -> list[list]:
    """[baş, son, "gg.aa.yyyy", uyarı] listesi; takvimde olmayan tarih (31.02.2027) uyarıyla döner."""
    sonuc = []
    for m in _TARIH.finditer(t):
        if m.group(1):
            gun, ay, yil = int(m.group(1)), int(m.group(3)), int(m.group(4))
        else:
            gun, ay, yil = int(m.group(5)), _AYLAR.index(m.group(6)) + 1, int(m.group(7))
        metin = f"{gun:02d}.{ay:02d}.{yil}"
        try:
            date(yil, ay, gun)
            uyari = ""
        except ValueError:
            uyari = f"{metin} takvimde olmayan bir tarih; kaynağı kontrol edin."
        sonuc.append([m.start(), m.end(), metin, uyari])
    return sonuc


def _saatleri_bagla(t: str, tarihler: list[list]) -> None:
    """Her saati en yakın tarihe bağlar (önce kendinden önceki tarih); ilk saat dışındakiler yok sayılır."""
    for m in _SAAT.finditer(t):
        saat, dakika = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
        if int(saat) > 23 or int(dakika) > 59:
            continue
        adaylar = [(m.start() - x[1], 0, x) for x in tarihler if x[1] <= m.start()]
        adaylar += [(x[0] - m.end(), 1, x) for x in tarihler if x[0] >= m.end()]
        adaylar = [a for a in adaylar if a[0] <= _SAAT_UZAKLIGI and " " not in a[2][2]]
        if adaylar:
            hedef = min(adaylar, key=lambda a: (a[0], a[1]))[2]
            hedef[2] += f" {int(saat):02d}:{dakika}"


def tarih_ve_sureler(birim: Birim) -> list[Bulgu]:
    t, bolum = katla(birim.metin), katla(birim.bolum)
    tarihler = _tarihler(t)
    _saatleri_bagla(t, tarihler)
    degerler = [x[2] for x in tarihler]
    uyarilar = [x[3] for x in tarihler if x[3]]
    for m in _SURE.finditer(t):
        if m.group(2) == "yil" and int(m.group(1)) >= 100:
            continue  # "2026 yılı birim fiyatları": yıl adıdır, süre değil
        bas, son = _yan_cumle(t, m.start())
        if _ODEME.search(t[bas:son]):
            continue  # "30 gün içinde ödenir" ödeme koşuludur; o çıkarıcı yakalar
        degerler.append(f"{m.group(1)} {_SURE_BIRIMI[m.group(2)]}")
    if not degerler:
        return []
    etiket = _etiket_bul(t) or _etiket_bul(bolum)  # önce cümlenin kendisi, sonra bölüm başlığı
    if etiket is None:
        if "sure" not in bolum and "tarih" not in bolum:
            return []  # bağlamsız tarih (ör. belge basım tarihi) gürültüdür
        etiket = "Tarih/süre"
    return [Bulgu("tarih", etiket, ", ".join(dict.fromkeys(degerler)), birim, " ".join(uyarilar))]


# --- Teminatlar -------------------------------------------------------------
_YUZDE = re.compile(rf"(?:%|yuzde) ?({SAYI})")
_TEMINAT_TURLERI = [("ek kesin teminat", "Ek kesin teminat"), ("kesin teminat", "Kesin teminat"), ("gecici teminat", "Geçici teminat")]
# 4734 sayılı Kamu İhale Kanunu md. 33 (geçici teminat: teklif bedelinin %3'ünden az olmamak üzere) ve
# md. 43 (kesin teminat: ihale bedelinin %6'sı). Mevzuat metniyle doğrulanmadı; README §9'a bakın.
_MEVZUAT = {"Geçici teminat": (3.0, "alt"), "Kesin teminat": (6.0, "esit")}


def teminatlar(birim: Birim) -> list[Bulgu]:
    t, bolum = katla(birim.metin), katla(birim.bolum)
    gecenler = []  # (baş, son, tür); "ek kesin teminat" içindeki "kesin teminat" ayrıca sayılmaz
    for anahtar, ad in _TEMINAT_TURLERI:
        for m in re.finditer(anahtar, t):
            if not any(bas <= m.start() < son for bas, son, _ in gecenler):
                gecenler.append((m.start(), m.end(), ad))
    if not gecenler:
        return []
    oranlar: dict[str, float] = {}
    for m in _YUZDE.finditer(t):
        oran = sayi_coz(m.group(1))
        if oran is None:
            continue
        # Oran, kendisinden önce anılan en yakın teminat türüne aittir.
        onceki = [g for g in gecenler if g[0] < m.start()]
        hedef = max(onceki)[2] if onceki else min(gecenler)[2]
        oranlar.setdefault(hedef, oran)
    bulgular = []
    for ad in dict.fromkeys(ad for _, _, ad in sorted(gecenler)):
        if ad not in oranlar and katla(ad) not in bolum:
            continue  # ne oran var ne de ilgili bölüm: geçerken anılmış
        oran = oranlar.get(ad)
        deger = f"%{sayi_yaz(oran)}" if oran is not None else "oran belirtilmemiş"
        uyari = ""
        if oran is not None and ad in _MEVZUAT:
            sinir, tur = _MEVZUAT[ad]
            if tur == "alt" and oran < sinir:
                uyari = "4734 s. Kanun md. 33'teki %3 alt sınırının altında görünüyor; kontrol edin."
            elif tur == "esit" and oran != sinir:
                uyari = "4734 s. Kanun md. 43'teki %6 oranından farklı; kontrol edin."
        bulgular.append(Bulgu("teminat", ad, deger, birim, uyari))
    return bulgular


# --- İstenen belgeler -------------------------------------------------------
_BELGE = re.compile(
    r"\b(?:belge|sertifika|sirkuler|beyanname|taahhutname|vekaletname|mektub|cetvel|ruhsat|kapasite raporu"
    r"|sicil gazetesi|oda kayit|iso \d{4,5}|tse\b|katalog|numune|bilanco|is deneyim)"
)
_BELGE_BOLUMU = ("belge", "yeterlik", "istenen", "teklif dosyasi", "katilabilmek")
_TALEP = ("sunulmasi", "sunulacak", "sunulur", "verilmesi", "verilecek", "eklenmesi", "istenir", "zorunlu", "gerekli", "ibraz")
_MADDE_IMI = re.compile(r"^\s*(?:[-*]\s+|\(?[a-zçğıöşü]\)\s+|\d+(?:\.\d+)*[.)]\s+)+", re.IGNORECASE)


def istenen_belgeler(birim: Birim) -> list[Bulgu]:
    t, bolum = katla(birim.metin), katla(birim.bolum)
    if not _BELGE.search(t):
        return []
    if not (any(a in bolum for a in _BELGE_BOLUMU) or any(a in t for a in _TALEP)):
        return []
    return [Bulgu("belge", kisalt(_MADDE_IMI.sub("", birim.metin), 140), "", birim)]


# --- Cezai şartlar ----------------------------------------------------------
_CEZA = re.compile(r"\b(?:ceza|cezai|gecikme|fesih|feshed|yasakla|gelir kayd|tazminat)")
_CEZA_ORANI = re.compile(rf"(?:binde|‰) ?({SAYI})|(?:%|yuzde) ?({SAYI})")


def cezai_sartlar(birim: Birim) -> list[Bulgu]:
    t = katla(birim.metin)
    anahtar = _CEZA.search(t)
    if not anahtar:
        return []
    if "fesih" in t or "feshed" in t:
        ad = "Fesih"
    elif "yasakla" in t:
        ad = "Yasaklama"
    elif "gecikme" in t:
        ad = "Gecikme cezası"
    elif "gelir kayd" in t:
        ad = "Teminatın gelir kaydı"
    else:
        ad = "Cezai şart"
    kutup = _kutup(t, anahtar.start())
    if kutup == "yok":
        return [Bulgu("ceza", ad, "yok", birim)]
    if kutup == "koşullu":
        return [Bulgu("ceza", ad, "koşula bağlı", birim, KOSUL_UYARISI)]
    deger = ""
    for m in _CEZA_ORANI.finditer(t):
        oran = sayi_coz(m.group(1) or m.group(2))
        if oran is not None:
            deger = f"binde {sayi_yaz(oran)}" if m.group(1) else f"%{sayi_yaz(oran)}"
            break
    return [Bulgu("ceza", ad, deger, birim)]


# --- Ödeme koşulları --------------------------------------------------------
_ODEME = re.compile(r"\b(?:odeme|odenir|odenecek|odenmez|odenmeyecek|hakedis|avans|fiyat farki|fatura)")
_ODEME_KONULARI = [("fiyat farki", "Fiyat farkı"), ("avans", "Avans"), ("hakedis", "Hakediş")]
_GUN_ICINDE = re.compile(
    r"\b(\d{1,3}) ?(?:\([^)]{1,30}\) ?)?(takvim gunu|is gunu|gun)(?:u|luk)? ?(?:icinde|icerisinde|zarfinda)"
)


def _odeme_degeri(t: str, bas: int, genel: bool) -> tuple[str, str]:
    """(değer, uyarı): olumsuzsa "yok"; değilse konunun yan cümlesindeki "N gün içinde"; o da yoksa "var"."""
    kutup = _kutup(t, bas)
    if kutup == "yok":
        return "yok", ""
    if kutup == "koşullu":
        return "koşula bağlı", KOSUL_UYARISI
    yb, ys = _yan_cumle(t, bas)
    if m := _GUN_ICINDE.search(t, yb, ys):
        return f"{m.group(1)} {_SURE_BIRIMI[m.group(2)]} içinde", ""
    return ("var" if kutup == "var" and not genel else ""), ""


def odeme_kosullari(birim: Birim) -> list[Bulgu]:
    """Bir cümlede birden çok konu olabilir; her konu kendi yüklemine göre değerlendirilir."""
    t = katla(birim.metin)
    genel = _ODEME.search(t)
    if not genel:
        return []
    bulgular = []
    for anahtar, ad in _ODEME_KONULARI:
        if m := re.search(r"\b" + anahtar, t):
            deger, uyari = _odeme_degeri(t, m.start(), genel=False)
            bulgular.append(Bulgu("odeme", ad, deger, birim, uyari))
    if not bulgular:  # özel konu yoksa genel "Ödeme" maddesi
        deger, uyari = _odeme_degeri(t, genel.start(), genel=True)
        bulgular.append(Bulgu("odeme", "Ödeme", deger, birim, uyari))
    return bulgular


CIKARICILAR = [tarih_ve_sureler, teminatlar, istenen_belgeler, cezai_sartlar, odeme_kosullari]

ZORUNLU_KONTROLLER = [
    ("tarih", "İhale (son teklif) tarihi"),
    ("tarih", "Teklif geçerlilik süresi"),
    ("tarih", "İşin süresi"),
    ("teminat", "Geçici teminat"),
    ("teminat", "Kesin teminat"),
    ("belge", None),
    ("ceza", "Gecikme cezası"),
    ("odeme", None),
]


def tekillestir(bulgular: list[Bulgu]) -> list[Bulgu]:
    gorulen, sonuc = set(), []
    for b in bulgular:
        anahtar = (b.kategori, katla(b.baslik), katla(b.deger), katla(b.birim.metin))
        if anahtar not in gorulen:
            gorulen.add(anahtar)
            sonuc.append(b)
    return sonuc


def kurallari_uygula(birimler: list[Birim]) -> list[Bulgu]:
    bulgular = tekillestir([b for birim in birimler for cikarici in CIKARICILAR for b in cikarici(birim)])
    # Aynı teminat türünün oranı başka bir maddede bulunduysa "oran belirtilmemiş" tekrarını at.
    oranli = {b.baslik for b in bulgular if b.kategori == "teminat" and b.deger != "oran belirtilmemiş"}
    return [b for b in bulgular if not (b.kategori == "teminat" and b.deger == "oran belirtilmemiş" and b.baslik in oranli)]


def eksik_kontroller(bulgular: list[Bulgu]) -> list[tuple[str, str]]:
    """Şartnamede bulunması beklenen ama bulunamayan başlıklar (LLM'nin "Geçici Teminat" yazımı da sayılır)."""
    eksikler = []
    for kategori, baslik in ZORUNLU_KONTROLLER:
        if not any(b.kategori == kategori and (baslik is None or katla(b.baslik) == katla(baslik)) for b in bulgular):
            eksikler.append((kategori, baslik or KATEGORILER[kategori]))
    return eksikler
