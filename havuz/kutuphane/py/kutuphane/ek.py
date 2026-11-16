"""ek — özel adlara, sayılara ve kısaltmalara kesme işaretiyle ek getirir: Ankara'ya, İzmir'e, Zonguldak'ta,
Ayşe'nin, 3'te, 6'ya, 40'ı, 2026'da, %20'si, TDK'nin, İstanbul Üniversitesi'ne.

Kullanım:
    add_suffix("Ankara", "dative")                       # "Ankara'ya"
    add_suffix("2026", "locative")                       # "2026'da"
    add_suffix("%20", "possessive")                      # "%20'si"
    add_suffix("1990", ["plural", "locative"])           # "1990'larda"   (ekler zincirlenir)
    add_suffix("Shakespeare", "genitive", pronunciation="şekspir")   # "Shakespeare'in"
    suffix_of("Zonguldak", "ablative")                   # "tan"   (yalnız ek)

Ek türleri: dative (yönelme -e/-a), locative (bulunma -de/-da/-te/-ta), ablative (ayrılma -den/-tan),
accusative (belirtme -i/-ı/-u/-ü), genitive (tamlayan -in/-nin), instrumental (birliktelik -le/-yla),
plural (çoğul -ler/-lar), possessive (iyelik -i/-si), ordinal (sıra -inci), lik (-lik/-lık), li (-li/-lı).

Nasıl çalışır: Ek, metnin SON SÖZCÜĞÜNÜN OKUNUŞUNA göre seçilir (son ünlü → ünlü uyumu; son ses → kaynaştırma
ünsüzü ve d/t). Sayılarda okunuş hesaplanır (2026 → "altı", 40 → "kırk", 1000 → "bin", saat 09.00 → "dokuz",
3,5 → "beş", 3/4 → "üç"). BÜYÜK harfli kısaltmalar harf harf okunur (TDK → "ke" → TDK'nin); sözcük gibi
okunabilenler sözcük sayılır (NATO'ya, ASELSAN'ın). Birimler okunuşuyla eklenir (kg'dan, cm'yi).

Sınırlar (bilerek kapsam dışı):
 - Cins adlar ve ünsüz yumuşaması (kitap → kitabı, renk → rengi) YOK; bu modül yalnız kesmeyle ayrılan eklere bakar.
 - Okunuşu yazımından çıkmayan yabancı adlar ve kısaltmalar için `pronunciation` verin (Bordeaux → "bordo",
   CNN İngilizce okunuşla → "en"). Son hecesi ince okunan, listede olmayan adlarda `front=True` verin.
 - Belirtisiz tamlama biçimindeki adlar (… Üniversitesi, Kuşadası) bir sözcük listesinden tanınır ve araya "n"
   alır (Üniversitesi'ne). Listede olmayanlar için `compound=True`, yanlış tanınanlar için `compound=False` verin.
 - ASCII ile yazılmış büyük I Türkçe kuralla "ı" okunur (BIST → "bıst"); "İ" kastediliyorsa okunuş verin.
 - Noktalı kısaltmalar (vb., A.Ş.), Roma rakamları ve "3,5" → "üç buçuk" okunuşu desteklenmez. Metni sondaki
   noktalama olmadan verin. Ek her zaman küçük harfle yazılır (BÜYÜK metinde sonucu kendiniz büyütün).
 - Çoğul eki özel adlarda TDK kuralınca kesmesiz yazılır (Ahmetler, Ahmetlere); sayı ve kısaltmalarda kesmelidir.

Genişletme: Yeni ek türü `_TEMPLATES`'e bir satırdır (A = e/a, I = i/ı/u/ü, D = d/t). Yeni tamlama başı
`_HEAD_WORDS`'e, ince okunan ad `_FRONT_WORDS`'e, birim `_UNITS`'e eklenir. Her ekleme için `vektorler/ek.json`
dosyasına örnek yazın; aynı örnek TypeScript eşini de sınar.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

__all__ = ["SuffixError", "SuffixKind", "add_suffix", "reading_for_suffix", "suffix_of"]

SuffixKind = Literal[
    "dative",
    "locative",
    "ablative",
    "accusative",
    "genitive",
    "instrumental",
    "plural",
    "possessive",
    "ordinal",
    "lik",
    "li",
]


class SuffixError(ValueError):
    """Ek getirilemediğinde (boş metin, bilinmeyen ek türü…) fırlatılır."""


# [ünsüzden sonra, ünlüden sonra, iyelik/tamlamadan sonra] — A: e/a, I: i/ı/u/ü, D: d/t
_TEMPLATES: dict[str, tuple[str, str, str]] = {
    "dative": ("A", "yA", "nA"),
    "locative": ("DA", "DA", "ndA"),
    "ablative": ("DAn", "DAn", "ndAn"),
    "accusative": ("I", "yI", "nI"),
    "genitive": ("In", "nIn", "nIn"),
    "instrumental": ("lA", "ylA", "ylA"),
    "plural": ("lAr", "lAr", "lAr"),
    "possessive": ("I", "sI", "sI"),
    "ordinal": ("IncI", "ncI", "ncI"),
    "lik": ("lIk", "lIk", "lIk"),
    "li": ("lI", "lI", "lI"),
}

_VOWELS = "aeıioöuüâîû"
_VOICELESS = "çfhkpsşt"
_ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
_CURRENCIES = {"₺": "lira", "$": "dolar", "€": "avro", "£": "sterlin"}
_FRONT_OF = {"a": "e", "ı": "i", "o": "ö", "u": "ü"}
_CLOSERS = ".,;:!?)]}\"'”’\xbb"
_WS_CHARS = " \t\n\r\f\v\xa0"
_WS = re.compile("[ \t\n\r\f\v\xa0]+")


def _words(text: str) -> frozenset[str]:
    return frozenset(w for w in _WS.split(text) if w)


# Son hecesi ince okunan (kalın ünlülü ama ince ek alan) adlar.
_FRONT_WORDS = _words(
    """kemal cemal celal bilal hilal nihal zuhal iclal ikbal visal zülal şevval resul istiklal
    alp gökalp seul ziraat saat"""
)

# Sözcük gibi okunan kısaltmalarda kabul edilen çift ünsüzlü bitişler (TÜRK, BIST…).
_CODAS = _words(
    """lt lk lp lç lf ls rt rk rp rç rs rş rf rz rm rn rd nt nk nç ns nd ng mp st sk sp şt şk ft ht
    kt ks ps yt yk yp vk zm"""
)

# Birimler ve okunuşları (TDK: küçük harfli kısaltmalara ek, okunuşa göre gelir).
_UNITS = {
    key: value
    for key, _, value in (
        pair.partition(":")
        for pair in _WS.split(
            """mm:milimetre cm:santimetre dm:desimetre m:metre km:kilometre m²:metrekare m2:metrekare
        km²:kilometrekare km2:kilometrekare m³:metreküp m3:metreküp g:gram gr:gram mg:miligram kg:kilogram
        t:ton l:litre lt:litre ml:mililitre mL:mililitre cl:santilitre sn:saniye dk:dakika sa:saat kr:kuruş
        kWh:kilovatsaat kW:kilovat Hz:hertz KB:kilobayt MB:megabayt GB:gigabayt TB:terabayt ha:hektar
        da:dekar px:piksel °C:derece °:derece""".strip()
        )
    )
}

# Son sözcük bunlardan biriyse ad belirtisiz tamlamadır: "Ege Üniversitesi" → Üniversitesi'ne.
_HEAD_WORDS = _words(
    """üniversitesi fakültesi enstitüsü yüksekokulu lisesi okulu ilkokulu ortaokulu koleji
    akademisi kütüphanesi müzesi hastanesi kliniği eczanesi bankası bakanlığı başkanlığı cumhurbaşkanlığı müdürlüğü
    müsteşarlığı valiliği kaymakamlığı belediyesi muhtarlığı meclisi mahkemesi savcılığı barosu kurumu kurulu
    kuruluşu derneği vakfı odası birliği federasyonu konfederasyonu sendikası partisi cumhuriyeti devleti devletleri
    krallığı imparatorluğu emirliği emirlikleri şirketi holdingi fabrikası ajansı gazetesi dergisi yayınevi yayınları
    kanalı televizyonu radyosu caddesi sokağı bulvarı meydanı mahallesi ilçesi kasabası parkı bahçesi ormanı dağı
    dağları tepesi gölü nehri ırmağı denizi okyanusu boğazı körfezi adası adaları yarımadası burnu ovası vadisi
    yaylası geçidi mağarası şelalesi barajı köprüsü tüneli limanı havalimanı havaalanı garı istasyonu terminali
    otogarı durağı camii camisi kilisesi sinagogu türbesi külliyesi medresesi sarayı kasrı köşkü konağı kalesi hisarı
    kulesi anıtı çarşısı pazarı hamamı oteli tiyatrosu sineması operası stadyumu stadı kulübü salonu merkezi günü
    haftası bayramı festivali şenliği fuarı sergisi ödülü ödülleri kupası ligi şampiyonası turnuvası oyunları savaşı
    savaşları muharebesi zaferi antlaşması anlaşması sözleşmesi kanunu yasası anayasası yönetmeliği tüzüğü
    bildirgesi planı projesi programı hastalığı sendromu harekâtı harekatı operasyonu devrimi dönemi hanedanı
    beyliği sultanlığı hanlığı eyaleti bölgesi kıtası takımı sahili plajı feneri tersanesi üssü komutanlığı
    kuvvetleri teşkilatı örgütü konseyi komisyonu komitesi kongresi konferansı zirvesi forumu borsası fonu sigortası
    yolları yolu hattı metrosu tapınağı kapısı şehitliği mezarlığı başkanı cumhurbaşkanı başbakanı bakanı valisi
    kralı kraliçesi oğlu başı önü üstü ağzı suyu deresi gücü"""
)

# Bitişik yazılan adlarda sözcüğün SONU bunlardan biriyse tamlamadır: Kuşadası, Zeytinburnu, Davutoğlu.
_HEAD_ENDINGS = _WS.split(
    """oğlu adası burnu başı önü üstü ağzı dağı gölü pazarı hisarı limanı yolu boğazı deresi suyu
    tepesi kapısı kalesi köprüsü birliği gücü başkanı"""
)

# Tamlama gibi görünen ama kalıplaşmış, ek alırken düz ad gibi davranan adlar.
_NOT_COMPOUND = _words("inönü")


@dataclass(frozen=True)
class _Ending:
    vowel: str
    ends_with_vowel: bool
    voiceless: bool


@dataclass(frozen=True)
class _Source:
    kind: Literal["word", "number", "abbreviation", "unit"]
    reading: str
    word: str


def _strip(text: str) -> str:
    return text.strip(_WS_CHARS)


def _lower_tr(text: str) -> str:
    prepared = text.replace("İ", "i").replace("I", "ı")
    return prepared.lower().replace("i\u0307", "i")  # harf: İ/I önce elle çevrildi


def _upper_tr(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()  # harf: i/ı önce elle çevrildi


def _ending_of(reading: str, front: bool) -> _Ending:
    letters = [ch for ch in reading if ch.isalpha()]
    last = letters[-1] if letters else ""
    vowel = next((ch for ch in reversed(letters) if ch in _VOWELS), "e")
    vowel = {"â": "a", "î": "i", "û": "u"}.get(vowel, vowel)
    if front:
        vowel = _FRONT_OF.get(vowel, vowel)
    return _Ending(
        vowel=vowel,
        ends_with_vowel=last != "" and last in _VOWELS,
        voiceless=last != "" and last in _VOICELESS,
    )


def _render(template: str, ending: _Ending) -> str:
    v = ending.vowel
    a = "e" if v in "eiöü" else "a"
    i = "ı" if v in "aı" else "u" if v in "ou" else "ü" if v in "öü" else "i"
    return template.replace("A", a).replace("I", i).replace("D", "t" if ending.voiceless else "d")


def _number_word(digits: str) -> str:
    """Rakam dizisinin okunuşundaki son sözcük: "2026" → "altı", "40" → "kırk", "1000" → "bin"."""
    significant = digits.lstrip("0")
    if significant == "":
        return "sıfır"
    zeros = len(significant) - len(significant.rstrip("0"))
    if zeros == 0:
        return _ONES[int(significant[-1])]
    if zeros == 1:
        return _TENS[int(significant[-2])]
    if zeros == 2:
        return "yüz"
    group = zeros // 3
    return "bin" if group == 1 else "milyar" if group == 3 else "milyon"  # trilyon… "milyon" gibi


def _letter_name(letter: str) -> str:
    if letter in _VOWELS:
        return letter
    return {"q": "kü", "w": "ve", "x": "iks"}.get(letter, f"{letter}e")


def _word_reading(lower: str) -> str:
    return lower.replace("q", "k").replace("w", "v").replace("x", "ks")


def _abbreviation_reading(lower: str) -> str:
    """Büyük harfli kısaltmanın okunuşu: sözcük gibi okunabiliyorsa sözcük, değilse son harfin adı."""
    last = lower[-1] if lower else ""
    last_vowel_at = max((index for index, ch in enumerate(lower) if ch in _VOWELS), default=-1)
    if last_vowel_at == -1 or len(lower) <= 2:
        return _letter_name(last)
    tail = lower[last_vowel_at + 1 :]
    if len(tail) > 2 or (len(tail) == 2 and tail not in _CODAS):
        return _letter_name(last)
    return _word_reading(lower)


def _numeric_reading(chunk: str) -> str | None:
    for symbol, name in _CURRENCIES.items():
        if symbol in chunk and (re.search("[0-9]", chunk) or chunk == symbol):
            return name
    plain = chunk.replace("%", "")
    time = re.fullmatch("([0-9]{1,2})[.:]([0-9]{2})", plain)
    if time:
        return _number_word(time.group(1) if time.group(2) == "00" else time.group(2))
    fraction = re.fullmatch("([0-9]+)/([0-9]+)", plain)
    if fraction:
        return _number_word(fraction.group(1))
    trailing = re.search(r"([0-9][0-9.]*)(?:,([0-9]+))?\Z", plain)
    if not trailing:
        return None
    return _number_word(trailing.group(2) or trailing.group(1).replace(".", ""))


def _classify(text: str) -> _Source:
    chunk = _WS.split(_strip(unicodedata.normalize("NFC", text)))[-1]
    while len(chunk) > 1 and chunk[-1] in _CLOSERS:
        chunk = chunk[:-1]
    unit = _UNITS.get(chunk) or _UNITS.get(re.sub(r"^[0-9.,+\-%]+", "", chunk))
    if unit is not None:
        return _Source("unit", unit, "")
    numeric = _numeric_reading(chunk)
    if numeric is not None:
        return _Source("number", numeric, "")
    start = len(chunk)
    while start > 0 and chunk[start - 1].isalpha():
        start -= 1
    token = chunk[start:]
    if token == "":
        raise SuffixError(f'"{text}" içinde ek getirilecek harf ya da rakam bulunamadı.')
    lower = _lower_tr(token)
    if len(token) == 1:
        return _Source("abbreviation", _letter_name(lower), "")
    if token == _upper_tr(token) and token != lower:
        return _Source("abbreviation", _abbreviation_reading(lower), "")
    if not any(ch in _VOWELS for ch in lower):
        return _Source("abbreviation", _letter_name(lower[-1]), "")
    return _Source("word", _word_reading(lower), lower)


def _is_compound(text: str, word: str) -> bool:
    if word == "" or word in _NOT_COMPOUND:
        return False
    if word in _HEAD_WORDS:
        return True
    if any(len(word) > len(head) and word.endswith(head) for head in _HEAD_ENDINGS):
        return True
    if not _WS.search(_strip(text)):
        return False
    plural_possessive = re.fullmatch("(.{3,})(ları|leri)", word)  # Kaz Dağları, Türk Hava Yolları
    if not plural_possessive:
        return False
    stem_is_front = _ending_of(plural_possessive.group(1), False).vowel in "eiöü"
    return (plural_possessive.group(2) == "leri") == stem_is_front


def _is_front(reading: str) -> bool:
    last = _WS.split(_strip(reading))[-1]
    return last in _FRONT_WORDS or last.endswith("saat") or bool(re.search(r"[âû]l\Z", last))


def reading_for_suffix(text: str, *, pronunciation: str | None = None) -> str:
    """Ekin seçilmesinde kullanılan okunuşu verir: "2026" → "altı", "TDK" → "ke", "Ankara" → "ankara"."""
    hint = _strip(pronunciation or "")
    if hint != "":
        return _word_reading(_lower_tr(hint))
    if _strip(text) == "":
        raise SuffixError("Ek getirilecek metin boş olamaz.")
    return _classify(text).reading


def _resolve(
    text: str,
    kinds: str | Sequence[str],
    pronunciation: str | None,
    front: bool | None,
    compound: bool | None,
    apostrophe: str | None,
) -> tuple[str, str]:
    kind_list = [kinds] if isinstance(kinds, str) else list(kinds)
    if not kind_list:
        raise SuffixError('En az bir ek türü verin (örnek: "dative").')
    if _strip(text) == "":
        raise SuffixError("Ek getirilecek metin boş olamaz.")
    source = _classify(text)
    reading = reading_for_suffix(text, pronunciation=pronunciation)
    ending = _ending_of(reading, front if front is not None else _is_front(reading))
    pronominal = compound if compound is not None else _is_compound(text, source.word)
    suffix = ""
    for kind in kind_list:
        template = _TEMPLATES.get(kind)
        if template is None:
            valid = ", ".join(_TEMPLATES)
            raise SuffixError(f'Bilinmeyen ek türü: "{kind}". Geçerli türler: {valid}.')
        index = 2 if pronominal else 1 if ending.ends_with_vowel else 0
        part = _render(template[index], ending)
        if suffix.endswith("k") and part[:1] != "" and part[0] in _VOWELS:
            suffix = suffix[:-1] + "ğ"  # 5'liğe
        suffix += part
        ending = _ending_of(part, False)
        pronominal = kind == "possessive"  # iyelik ekinden sonra araya "n" girer: %20'sini
    default_apostrophe = "" if kind_list[0] == "plural" and source.kind == "word" else "'"
    return suffix, apostrophe if apostrophe is not None else default_apostrophe


def suffix_of(
    text: str,
    kinds: SuffixKind | Sequence[SuffixKind],
    *,
    pronunciation: str | None = None,
    front: bool | None = None,
    compound: bool | None = None,
) -> str:
    """Yalnız eki döndürür: suffix_of("Zonguldak", "locative") → "ta". Birden çok ek zincirlenebilir."""
    return _resolve(text, kinds, pronunciation, front, compound, None)[0]


def add_suffix(
    text: str,
    kinds: SuffixKind | Sequence[SuffixKind],
    *,
    pronunciation: str | None = None,
    front: bool | None = None,
    compound: bool | None = None,
    apostrophe: str | None = None,
) -> str:
    """Metne kesme işaretiyle ek getirir: add_suffix("İzmir", "dative") → "İzmir'e"."""
    suffix, mark = _resolve(text, kinds, pronunciation, front, compound, apostrophe)
    return text.rstrip(_WS_CHARS) + mark + suffix
