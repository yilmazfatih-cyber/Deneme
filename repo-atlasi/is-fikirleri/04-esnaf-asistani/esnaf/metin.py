"""Türkçe metin yardımcıları: sadeleştirme, bulanık kelime eşleme, tarih/saat ayıklama.

Kural tabanlıdır; dil modeli gerektirmez. Amaç "randvu", "fiat", "çocuğum" gibi yazım
hatalarını ve ekleri tolere etmek, ama anlamı tersine çeviren ekleri ("randevusuz",
"gelemiyorum") yanlış eşlememektir.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, time, timedelta
from difflib import SequenceMatcher

_DUZ = str.maketrans("çğıöşüâîû", "cgiosuaiu")
_YUMUSAK = {"k": "g", "p": "b", "t": "d", "c": "c"}  # çocuk → çocuğum (sadeleştirilmiş: cocuk → cocugum)
_YOKSUNLUK = ("siz", "suz")  # -sız/-siz/-suz/-süz: "randevusuz" randevu istemek değildir
# Olumsuzluk izleri (sadeleştirilmiş): gelemiyorum, gelmeyecegim, olmaz, alamam, gelmedi. Bulanık
# eşlemede iz yalnız bir kelimede varsa eşleşme reddedilir: "geliyorum" ile "gelemiyorum" aynı değildir.
_OLUMSUZ = re.compile(r"m[iu]yor|m[ae]y|m[ae]z$|m[ae]m$|m[ae]d[iu]")

AYLAR = {
    "ocak": 1, "subat": 2, "mart": 3, "nisan": 4, "mayis": 5, "haziran": 6,
    "temmuz": 7, "agustos": 8, "eylul": 9, "ekim": 10, "kasim": 11, "aralik": 12,
}
# Uzun adlar önce: "cumartesi" "cuma" ile, "pazartesi" "pazar" ile karışmasın.
GUNLER = {"pazartesi": 0, "cumartesi": 5, "carsamba": 2, "persembe": 3, "pazar": 6, "sali": 1, "cuma": 4}
# Gün adından sonra izin verilen ekler ("cumaya", "salıdan"); "pazarlık" ve "Salih" gün değildir.
_GUN_EKLERI = frozenset({"", "a", "e", "ya", "ye", "da", "de", "dan", "den", "ki", "yi", "si", "lari", "leri"})
GUN_ADLARI = ("Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar")
AY_ADLARI = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim",
             "Kasım", "Aralık")


def kucult(metin: str) -> str:
    """Türkçe kurallarıyla küçük harf: I → ı, İ → i (str.lower() 'İ'yi bozar).

    Önce NFC: ayrışık yazılmış "ç" (c + birleşik çengel) kopyala-yapıştırla gelebilir.
    """
    return unicodedata.normalize("NFC", metin).replace("I", "ı").replace("İ", "i").lower()


def sadelestir(metin: str) -> str:
    """Küçült, Türkçe harfleri ASCII'ye indir, noktalamayı boşluğa çevir."""
    duz = kucult(metin).translate(_DUZ)
    return " ".join(re.sub(r"[^a-z0-9/]+", " ", duz).split())


def kelime_eslesir(kelime: str, anahtar: str, bulanik: bool = True) -> bool:
    """Sadeleştirilmiş tek kelime karşılaştırması: tam, ek almış ya da (bulanik ise) küçük yazım hatası."""
    if len(anahtar) <= 2:  # "ne", "mi": yalnız tam eşleşme
        return kelime == anahtar
    if kelime.startswith(anahtar):  # ek almış; ama yokluk eki anlamı tersine çevirir
        return not kelime[len(anahtar):].startswith(_YOKSUNLUK)
    govde, son = anahtar[:-1], anahtar[-1]
    yumusak = _YUMUSAK.get(son)  # ünsüz yumuşaması: cocuk → cocugum
    if len(anahtar) >= 4 and yumusak and kelime.startswith(govde + yumusak):
        return True
    # Bulanık eşleme yalnız uzun kelimelerde: kısa kelimelerde yanlış alarm çok olur.
    if not bulanik or len(anahtar) < 4 or len(kelime) < 4 or kelime[0] != anahtar[0]:
        return False
    if bool(_OLUMSUZ.search(kelime)) != bool(_OLUMSUZ.search(anahtar)):
        return False
    # 0.85: "randvu"/"randevu" (0.92) ve "fiat"/"fiyat" (0.89) eşleşir; "kesin"/"kesim" (0.80) eşleşmez.
    return SequenceMatcher(None, kelime, anahtar).ratio() >= 0.85


def ifade_puani(kelimeler: list[str], ifade: str) -> int:
    """İfadenin tüm kelimeleri metinde varsa kelime sayısını, yoksa 0 döndürür.

    '=' ile başlayan ifade bulanık eşlenmez (ör. '=gelemiyorum': "geliyorum" ona benzese de tersidir).
    """
    bulanik = not ifade.startswith("=")
    parcalar = sadelestir(ifade.lstrip("=")).split()
    if parcalar and all(any(kelime_eslesir(k, p, bulanik) for k in kelimeler) for p in parcalar):
        return len(parcalar)
    return 0


def tarih_bul(metin: str, bugun: date) -> date | None:
    """Tarih ifadesini çözer. Önce açık tarih ('12.11.2026', '12 kasım', '12.11'), sonra göreli
    ifade ('bugün', 'yarın', 'öbür gün'), en son gün adı ('cuma', 'haftaya salı') aranır:
    "20 kasım cuma" 20 Kasım'dır, en yakın cuma değil.
    """
    kucuk, sade = kucult(metin), sadelestir(metin)
    kelimeler = sade.split()
    for gun, ay, yil in re.findall(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b", kucuk):
        try:
            return date(int(yil), int(ay), int(gun))
        except ValueError:
            return None
    for gun, ay_kelimesi in re.findall(r"\b(\d{1,2}) ([a-z]+)", sade):
        ay = next((no for ad, no in AYLAR.items() if ay_kelimesi.startswith(ad)), None)
        if ay:
            return _gelecek_tarih(int(gun), ay, bugun)
    for gun, ay in re.findall(r"\b(\d{1,2})[./](\d{1,2})\b", kucuk):
        if 1 <= int(ay) <= 12:  # "14.30" saattir (ay 30 olamaz), "12.11" tarihtir
            return _gelecek_tarih(int(gun), int(ay), bugun)
    if "obur gun" in sade or "yarindan sonra" in sade:
        return bugun + timedelta(days=2)
    if any(k.startswith("yarin") for k in kelimeler):
        return bugun + timedelta(days=1)
    if any(k.startswith("bugun") for k in kelimeler):
        return bugun
    for k in kelimeler:
        for ad, no in GUNLER.items():
            if k.startswith(ad) and k[len(ad):] in _GUN_EKLERI:
                ileri = (no - bugun.weekday()) % 7 + (7 if "haftaya" in kelimeler else 0)
                return bugun + timedelta(days=ileri)
    return None


def _gelecek_tarih(gun: int, ay: int, bugun: date) -> date | None:
    """Yıl verilmemişse bugünden sonraki ilk uygun tarihi seçer."""
    for yil in (bugun.year, bugun.year + 1):
        try:
            aday = date(yil, ay, gun)
        except ValueError:
            return None
        if aday >= bugun:
            return aday
    return None


def _saat_ayikla(kucuk: str, sade: str) -> tuple[int, int, int, bool] | None:
    """(saat, dakika, dakika farkı, 24 saat biçimi açık mı) döndürür; saat yoksa None."""
    for desen in (r"\b([01]?\d|2[0-3]):([0-5]\d)\b", r"\b([01]?\d|2[0-3])\.(00|15|30|45)\b"):
        eslesme = re.search(desen, kucuk)
        if eslesme:  # "07:30" baştaki sıfırla yazıldıysa sabah demektir
            return int(eslesme.group(1)), int(eslesme.group(2)), 0, eslesme.group(1).startswith("0")
    eslesme = re.search(r"\b(\d{1,2}) ?bucuk", sade)
    if eslesme:
        return int(eslesme.group(1)), 30, 0, False
    eslesme = re.search(r"\b(\d{1,2}) ?(?:u|i|yi|yu)? ?ceyrek gece", sade)
    if eslesme:
        return int(eslesme.group(1)), 15, 0, False
    eslesme = re.search(r"\b(\d{1,2}) ?(?:e|a|ye|ya)? ?ceyrek kala", sade)
    if eslesme:
        return int(eslesme.group(1)), 0, -15, False
    # "saat 3", "sabah 9", "3'te" (sadeleşince "3 te"), "3te"; yönelme eki yalnız kesme işaretiyle: "4'e".
    on_ek = r"\b(?:saat|sabah|aksam|ogleden sonra|oglen) ?(\d{1,2})(?: ?(?:te|ta|de|da|e|a|ye|ya))?\b"
    eslesme = re.search(on_ek, sade)
    eslesme = eslesme or re.search(r"\b(\d{1,2}) ?(?:te|ta|de|da)\b", sade)
    eslesme = eslesme or re.search(r"\b(\d{1,2})['\u2019](?:e|a|ye|ya)\b", kucuk)
    if eslesme:
        return int(eslesme.group(1)), 0, 0, False
    return None


def saat_bul(metin: str) -> time | None:
    """'14:30', '14.30', 'saat 3', '3'te', '4'e', '2 buçuk', '3'ü çeyrek geçe', '4'e çeyrek kala',
    'öğleden sonra 4', 'sabah 9' ifadelerinden saat çıkarır.

    Esnaf varsayımı: 'sabah' denmedikçe 1-7 arası saatler öğleden sonradır ("saat 3" = 15:00,
    "2:30" = 14:30; "07:30" gibi baştaki sıfırla yazılan saat değişmez). 'akşam' ya da 'öğleden
    sonra' denince 12'den küçük saatlere 12 eklenir.
    """
    kucuk, sade = kucult(metin), sadelestir(metin)
    bulunan = _saat_ayikla(kucuk, sade)
    if bulunan is None:
        return None
    saat, dakika, fark, acik_24 = bulunan
    if saat > 23:
        return None
    ogleden_sonra = "ogleden sonra" in sade or "aksam" in sade
    if not acik_24 and "sabah" not in sade and (1 <= saat <= 7 or (ogleden_sonra and saat < 12)):
        saat += 12
    toplam = saat * 60 + dakika + fark
    if not 0 <= toplam < 24 * 60:
        return None
    return time(toplam // 60, toplam % 60)


def tarih_metni(an: date, bugun: date | None = None) -> str:
    """'12 Kasım Perşembe' biçimi; bugun verilir ve yıl farklıysa yıl da yazılır ('5 Ocak 2027 Salı')."""
    yil = f" {an.year}" if bugun is not None and an.year != bugun.year else ""
    return f"{an.day} {AY_ADLARI[an.month - 1]}{yil} {GUN_ADLARI[an.weekday()]}"
