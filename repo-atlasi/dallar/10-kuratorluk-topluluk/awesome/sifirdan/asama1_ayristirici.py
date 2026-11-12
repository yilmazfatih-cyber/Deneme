"""Aşama 1 — Markdown listesini yapılandırılmış veriye çevirir.

Bir "awesome" listesi aslında yarı yapılandırılmış bir veritabanıdır: başlıklar
kategori, madde işaretli satırlar kayıt, `[Ad](url) - Açıklama.` ise alanlardır.
Bu modül dosyayı satır satır okur. Tam bir CommonMark ayrıştırıcısı DEĞİLDİR
(bilerek): liste depolarının kullandığı dar dilbilgisini tanır, gerisini metin
sayar. Gerçek araçlar (awesome-lint, fpb-lint) remark'ın sözdizimi ağacını
kullanır; burada mekanizma görünsün diye düz düzenli ifadeler var.

Bu aşamada üç şey öğrenirsin:
1. Satır tabanlı ayrıştırma (kod blokları ve HTML yorumları atlanarak).
2. GitHub'ın başlıklardan bağlantı kimliği (slug) üretme kuralı.
3. Türkçe harf sırasına göre sıralama anahtarı (ç, ğ, ı, ö, ş, ü).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# --- Düzenli ifadeler -------------------------------------------------------

BASLIK_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
# URL'de dengeli parantezlere izin ver: https://tr.wikipedia.org/wiki/X_(Y)
URL_DESENI = r"(?:[^\s()]|\([^\s()]*\))+"
GIRDI_RE = re.compile(
    r"^(?P<girinti>[ \t]*)(?P<isaret>[-*+])[ \t]+\[(?P<ad>[^\]]+)\]\((?P<url>" + URL_DESENI + r")\)(?P<kalan>.*)$"
)
MADDE_RE = re.compile(r"^(?P<girinti>[ \t]*)(?P<isaret>[-*+])[ \t]+(?P<metin>\S.*)$")
CIT_RE = re.compile(r"^\s*(```|~~~)")
# Setext başlık: metin satırının ALTINDAKİ "===" (düzey 1) ya da "---" (düzey 2) çizgisi.
SETEXT_RE = re.compile(r"^ {0,3}(=+|-+)\s*$")
ACIK_KIMLIK_RE = re.compile(r"<a\s+(?:id|name)=[\"']([^\"']+)[\"']\s*>\s*</a>", re.IGNORECASE)
SATIR_ICI_BAGLANTI_RE = re.compile(r"\[([^\]]*)\]\(" + URL_DESENI + r"\)")


# --- Veri modeli -------------------------------------------------------------


@dataclass
class Baslik:
    satir: int  # 1 tabanlı satır numarası
    duzey: int  # 1..6 (# sayısı)
    metin: str  # Markdown işaretleri ayıklanmış düz metin
    kimlik: str  # GitHub'ın üreteceği bağlantı kimliği
    acik_kimlik: str | None = None  # <a id="..."></a> ile elle verilmiş kimlik


@dataclass
class Girdi:
    satir: int
    girinti: int  # boşluk cinsinden (sekme = 4 boşluk)
    isaret: str  # '-', '*' ya da '+'
    ad: str
    url: str
    kalan: str  # bağlantıdan sonra gelen ham metin (" - Açıklama." gibi)
    bolum: int | None  # ait olduğu başlığın Belge.basliklar içindeki sırası
    ust_satir: int | None = None  # iç içe listede üst maddenin satırı
    blok: int = 0  # aynı bölümde araya paragraf girince artar (ayrı liste)


@dataclass
class Madde:
    """Bağlantıyla başlamayan madde ("- Linux" gibi ara başlık ya da bozuk girdi)."""

    satir: int
    girinti: int
    metin: str
    bolum: int | None


@dataclass
class Belge:
    satirlar: list[str]
    basliklar: list[Baslik] = field(default_factory=list)
    girdiler: list[Girdi] = field(default_factory=list)
    maddeler: list[Madde] = field(default_factory=list)
    atlanan_satirlar: set[int] = field(default_factory=set)  # kod bloğu, HTML yorumu, setext alt çizgisi

    def kimlikler(self) -> set[str]:
        """Belgede bağlantı verilebilecek tüm kimlikler (otomatik + elle)."""
        sonuc = {b.kimlik for b in self.basliklar}
        sonuc |= {b.acik_kimlik for b in self.basliklar if b.acik_kimlik}
        for satir in self.satirlar:  # başlık dışındaki <a id> çapaları da sayılır
            sonuc |= set(ACIK_KIMLIK_RE.findall(satir))
        return sonuc


# --- GitHub bağlantı kimliği -------------------------------------------------


def github_kimligi(metin: str) -> str:
    """GitHub'ın başlıktan ürettiği kimliği taklit eder (github-slugger kuralı).

    1. Küçük harfe çevir. GitHub tam Unicode küçültmesi yapar (onu taklit eden
       github-slugger paketi JavaScript'in toLowerCase'ini kullanır); Python'un
       str.lower() aynı sonucu verir: 'I' -> 'i' (Türkçe 'ı' DEĞİL) ve
       'İ' -> 'i' + U+0307 (birleşen nokta). Yani "İçindekiler" başlığının kimliği
       görünmez bir karakter içerir: Türkçe listelerde sık kırılma nedeni.
    2. Harf (L), işaret (M), rakam (N), '-' ve '_' dışındaki her şeyi at.
    3. Boşlukları '-' yap. ("C++" -> "c", "A / B" -> "a--b")
    """
    sonuc = []
    for ch in metin.lower():
        if ch == " ":
            sonuc.append("-")
        elif ch in "-_" or unicodedata.category(ch)[0] in "LMN":
            sonuc.append(ch)
    return "".join(sonuc)


def ascii_katla(metin: str) -> str:
    """Türkçe harfleri ASCII karşılığına indirger (ç->c, ı->i, ...). İpucu üretmek için."""
    tablo = str.maketrans("çğıöşüÇĞİÖŞÜâîû", "cgiosuCGIOSUaiu")
    metin = unicodedata.normalize("NFD", metin.translate(tablo))
    return "".join(ch for ch in metin if unicodedata.category(ch) != "Mn")


class KimlikUretici:
    """Aynı başlık ikinci kez gelirse GitHub sonuna -1, -2 ekler; biz de ekleriz."""

    def __init__(self) -> None:
        self.gorulen: dict[str, int] = {}

    def uret(self, metin: str) -> str:
        temel = github_kimligi(metin)
        kimlik = temel
        while kimlik in self.gorulen:
            self.gorulen[temel] += 1
            kimlik = f"{temel}-{self.gorulen[temel]}"
        self.gorulen[kimlik] = 0
        return kimlik


def duz_metin(satir_ici: str) -> str:
    """Başlıktaki Markdown işaretlerini ayıklar: bağlantı, kod, kalın, HTML."""
    s = ACIK_KIMLIK_RE.sub("", satir_ici)
    s = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", s)  # resim -> alt metin
    s = SATIR_ICI_BAGLANTI_RE.sub(r"\1", s)  # bağlantı -> metni
    s = re.sub(r"<[^>]+>", "", s)  # HTML etiketleri
    s = s.replace("**", "").replace("__", "").replace("`", "").replace("*", "")
    return s.strip()


# --- Sıralama anahtarı -------------------------------------------------------

ALFABELER = {
    # q, w, x Türk alfabesinde yok; yabancı adlar için yakın yerlerine konur.
    "tr": "abcçdefgğhıijklmnoöpqrsştuüvwxyz",
    "en": "abcdefghijklmnopqrstuvwxyz",
}


def kucult(metin: str, yerel: str = "en") -> str:
    """Yerele uygun küçük harf. Türkçede I -> ı ve İ -> i olmalıdır."""
    if yerel == "tr":
        metin = metin.replace("I", "ı").replace("İ", "i")
    return metin.lower()


def buyut(metin: str, yerel: str = "en") -> str:
    """Yerele uygun büyük harf. Türkçede i -> İ ve ı -> I olmalıdır."""
    if yerel == "tr":
        metin = metin.replace("i", "İ").replace("ı", "I")
    return metin.upper()


def siralama_anahtari(metin: str, yerel: str = "en", noktalama_yoksay: bool = False) -> tuple:
    """Alfabetik sıra için karşılaştırılabilir anahtar.

    Sıra: boşluk < noktalama < rakam < harf. Böylece "one two", "onetwo"dan önce
    gelir (free-programming-books kuralı). Aksanlı harfler (é, â) temel harflerinin
    hemen ardına yerleşir. Türkçede "ç", "c"den sonra; "ı" ise "i"den önce gelir.

    yerel="bayt": dil kuralı yok, küçük harfli metnin kod noktası sırası. awesome-go'nun
    testi (strings.ToLower + sort.Strings) böyle karşılaştırır; "Bärner" orada "Brisbane"den
    SONRA gelir, çünkü 'ä' baytça 'r'den büyüktür.
    noktalama_yoksay=True: virgül, iki nokta vb. sayılmaz (fpb-lint'e yakın davranış).
    """
    if yerel == "bayt":
        return (kucult(metin),)
    alfabe = ALFABELER[yerel]
    anahtar = []
    for ch in unicodedata.normalize("NFC", kucult(metin, yerel)):
        if ch in alfabe:
            anahtar.append((3, alfabe.index(ch), 0))
        elif ch.isspace():
            anahtar.append((0, 0, 0))
        elif ch.isdigit():
            anahtar.append((2, ord(ch), 0))
        elif ch.isalpha():
            temel = unicodedata.normalize("NFD", ch)[0]
            if temel in alfabe:
                anahtar.append((3, alfabe.index(temel), ord(ch)))
            else:
                anahtar.append((4, ord(ch), 0))  # alfabe dışı yazılar en sona
        elif not noktalama_yoksay:
            anahtar.append((1, ord(ch), 0))
    return tuple(anahtar)


# --- Ayrıştırıcı -------------------------------------------------------------


def _genislik(girinti: str) -> int:
    return len(girinti.replace("\t", "    "))


def ayristir(metin: str) -> Belge:
    """Markdown metnini Belge modeline çevirir."""
    belge = Belge(satirlar=metin.split("\n"))
    uretici = KimlikUretici()
    kod_icinde = False
    yorum_icinde = False
    yigin: list[tuple[int, int]] = []  # (girinti, satır): açık madde zinciri
    bolum: int | None = None
    blok = 0

    for no, satir in enumerate(belge.satirlar, start=1):
        if CIT_RE.match(satir):
            kod_icinde = not kod_icinde
            belge.atlanan_satirlar.add(no)
            continue
        if kod_icinde:
            belge.atlanan_satirlar.add(no)
            continue
        if yorum_icinde:
            belge.atlanan_satirlar.add(no)
            if "-->" in satir:
                yorum_icinde = False
            continue
        if satir.lstrip().startswith("<!--") and "-->" not in satir:
            belge.atlanan_satirlar.add(no)
            yorum_icinde = True
            continue

        if no in belge.atlanan_satirlar:
            continue  # bir önceki satırın setext alt çizgisi
        m = BASLIK_RE.match(satir)
        sonraki = belge.satirlar[no] if no < len(belge.satirlar) else ""
        setext = SETEXT_RE.match(sonraki)
        if setext and satir.strip() and not MADDE_RE.match(satir) and not satir.startswith((" ", "\t", ">", "<")):
            belge.atlanan_satirlar.add(no + 1)  # alt çizgi bir başlığın parçası, metin değil
            duzey = 1 if setext.group(1)[0] == "=" else 2
            m = re.match(r"(#{%d})\s*(.*)" % duzey, "#" * duzey + " " + satir.strip())
        if m:
            ham = m.group(2)
            acik = ACIK_KIMLIK_RE.search(ham)
            yazi = duz_metin(ham)
            belge.basliklar.append(
                Baslik(no, len(m.group(1)), yazi, uretici.uret(yazi), acik.group(1) if acik else None)
            )
            bolum = len(belge.basliklar) - 1
            yigin.clear()
            continue

        m = MADDE_RE.match(satir)
        if not m:
            if satir.strip() and not satir.startswith((" ", "\t")):
                yigin.clear()  # düz paragraf listeyi bitirir; sonraki liste ayrı bloktur
                blok += 1
            continue

        girinti = _genislik(m.group("girinti"))
        while yigin and yigin[-1][0] >= girinti:
            yigin.pop()
        ust = yigin[-1][1] if yigin else None
        yigin.append((girinti, no))

        g = GIRDI_RE.match(satir)
        if g:
            belge.girdiler.append(
                Girdi(no, girinti, g.group("isaret"), g.group("ad"), g.group("url"), g.group("kalan"), bolum, ust, blok)
            )
        else:
            belge.maddeler.append(Madde(no, girinti, m.group("metin"), bolum))
    return belge
