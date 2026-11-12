"""Türkçe kök + ek tokenizer'ı.

Bir kelime üç aşamada token'a çevrilir:

1. **Büyük harf ayrıştırma.** ``İstanbul → <B> istanbul``, ``TDK → <BB> tdk``. Sözlükte yalnızca küçük
   biçimler tutulur; Türkçe ``İ/ı`` kuralları korunur. Karışık yazımlar (``iPhone``) olduğu gibi kalır.
2. **Önce morfoloji.** Küçük harfli kelime, en düşük maliyetli parçalara bölünür (Viterbi). Parçalar TDK
   kökleri (``▁kitap``), ses değişimli kök biçimleri (``▁kitab``), Türkçe ek biçimleri (``lar``, ``ımız``),
   kök+ek ile açıklanamayan kısımlar için öğrenilmiş alt parçalar (BPE) ve harflerdir. Kök ve ek kullanmak
   ucuz, alt parça ve tek harf kullanmak cezalıdır; böylece mümkün olan her yerde kök + ek bölünmesi seçilir.
3. **Bayt yedeği.** Sözlükte olmayan her karakter UTF-8 baytlarına (``<0xC3>``) düşer: hiçbir metin kaybolmaz.

``▁`` (U+2581) parçanın önünde bir boşluk olduğunu gösterir (SentencePiece geleneği).

Kimlikler (ID) Türkçeye göre bloklar hâlinde dizilir: özel → bayt → harf (Türk alfabesi sırasıyla) →
rakam → noktalama → ek → kök → parça. Ek, kök ve parça bloklarında sık olan önce gelir.
"""

from __future__ import annotations

import heapq
import json
import math
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

from .metin import (
    BOSLUK,
    DIGER,
    EK_HARFLER,
    KELIME,
    SATIR,
    TURK_ALFABESI,
    bas_buyuk,
    buyuk,
    harf_durumu,
    kelime_mi,
    kucuk,
    normallestir,
    on_bolutle,
    sirala_anahtari,
)
from .morfoloji import ek_envanteri

ISARET = "▁"
KATEGORILER = ("ozel", "bayt", "harf", "rakam", "noktalama", "ek", "kok", "parca")
KAT = {ad: i for i, ad in enumerate(KATEGORILER)}
OZEL_SAYISI = 16
OZEL_TOKENLAR = ["<pad>", "<unk>", "<bos>", "<eos>", "<B>", "<BB>", "\n", ISARET] + [
    f"<ayrilmis_{i}>" for i in range(8, OZEL_SAYISI)
]
PAD, UNK, BOS, EOS, BUYUK, TUM_BUYUK, SATIR_ID, BOSLUK_ID = range(8)
BAYT0 = OZEL_SAYISI

# Biçim sınıfları (gömme paylaşımında kullanılır)
BICIM_ASIL, BICIM_BOSLUKSUZ, BICIM_SES, BICIM_EK_UYUM = 0, 1, 2, 3
BICIM_ADLARI = ("asıl", "boşluksuz kök", "ses değişimli kök", "ek uyum biçimi")

NOKTALAMA = list(".,;:!?'\"()[]{}-/\\%&*+=<>#@$€₺^_|~°²³×÷±√π∞≤≥≠≈∈∩∪⊥∠·•§½¼¾→←")
BOSLUKLU_NOKTALAMA = list("(\"'-[{<=+*/&%$€₺#@")

BAYT_MALIYETI = 12.0
AYRI_BOSLUK_CEZASI = 4.0
"""Kelimeyi ayrı bir ``▁`` + boşluksuz parçalarla başlatmanın ek maliyeti: yalnızca ▁'lı biçim
yoksa seçilsin (``▁r`` yerine ``▁`` + ``r`` gibi kaçamaklar olmasın)."""
_SON = "\0"
ACICILAR = frozenset('([{"')
"""Bu işaretlerden sonra gelen kelime de satır başındaki gibi ``▁`` ile kodlanır (``"Kitabı`` → ``▁" ▁kitab ı``)."""


def birimler(metin: str) -> Iterable[tuple[str, str, bool, bool]]:
    """``on_bolutle`` + örtük boşluk kuralı: ``(tür, parça, boşluk, örtük)``.

    Satır başındaki ilk birim ve boşluktan (ya da satır başından) sonra gelen bir açılış işaretinin
    (``( [ { "``) hemen ardındaki birim, önünde boşluk varmış gibi (``▁kitap``) kodlanır; çözülürken bu
    örtük boşluk yazılmaz. Böylece bu konumlardaki kelimeler için ayrı ``kitap`` biçimine gerek kalmaz ve
    TDK örnek cümlelerinin ilk kelimesi de kök + ek olarak bölünür. Kesme işaretinden sonra kural
    uygulanmaz: orada ek gelir (``İstanbul'a``). Gerçek bir boşluk varsa ayrı bir ``▁`` token'ıyla korunur.
    """
    satir_basi = True
    for tur, s, bosluk in on_bolutle(metin):
        if tur == SATIR:
            satir_basi = True
            yield tur, s, False, False
            continue
        if tur == BOSLUK:
            yield tur, s, False, False
            continue
        if satir_basi:
            satir_basi = False
            if bosluk:
                yield BOSLUK, " ", False, False
            yield tur, s, True, True
            once_bosluk = True
        else:
            yield tur, s, bosluk, False
            once_bosluk = bosluk
        if tur == DIGER and s in ACICILAR and once_bosluk:
            satir_basi = True


@dataclass
class TokenizerAyarlari:
    boyut: int = 32000
    parca_orani: float = 0.25
    """Kök ve parça bütçesinin öğrenilmiş alt parçalara (BPE) ayrılan payı."""
    en_az_sayi: int = 3
    """Harf dışı bir karakterin ya da parçanın sözlüğe girmesi için derlemde en az kaç kez geçmesi gerektiği."""
    harf_cezasi: float = 3.0
    """Tek harf kullanmanın ek maliyeti (nat). Yüksek değer kök + ek bölünmesini zorlar."""
    parca_cezasi: float = 1.0
    """Öğrenilmiş alt parça kullanmanın ek maliyeti (nat)."""
    em_turu: int = 2


class TurkceTokenizer:
    def __init__(
        self,
        parcalar: Sequence[str],
        kategoriler: Sequence[int],
        maliyetler: Sequence[float],
        analar: Sequence[int] | None = None,
        bicimler: Sequence[int] | None = None,
        sayilar: Sequence[int] | None = None,
        bilgi: dict | None = None,
    ) -> None:
        n = len(parcalar)
        self.parcalar = list(parcalar)
        self.kategoriler = list(kategoriler)
        self.maliyetler = list(maliyetler)
        self.analar = list(analar) if analar is not None else list(range(n))
        self.bicimler = list(bicimler) if bicimler is not None else [BICIM_ASIL] * n
        self.sayilar = list(sayilar) if sayilar is not None else [0] * n
        self.bilgi = bilgi or {}
        if self.parcalar[: len(OZEL_TOKENLAR)] != OZEL_TOKENLAR:
            raise ValueError("İlk 16 kimlik özel token'lara ayrılmıştır.")
        # Metindeki gerçek bir "▁" karakteri boşluk token'ına eşlenmez (bayta düşer); yoksa "a▁é" ile
        # "a é" aynı kodlanırdı.
        self.kimlik = {p: i for i, p in enumerate(self.parcalar) if self.kategoriler[i] not in (KAT["ozel"], KAT["bayt"])}
        # Üç önek ağacı: ▁'lı parçalar (boşluktan sonra kelime başı), boşluksuz kelime başı (tüm
        # boşluksuz parçalar) ve kelime içi (kök hariç). Kelime ortasında kök kullanılmaz; yoksa
        # "masalardaydı" → masal·arda·ydı gibi sahte bileşik bölünmeler çıkar.
        self._trie_bas: dict = {}
        self._trie_ilk: dict = {}
        self._trie_ic: dict = {}
        for i, p in enumerate(self.parcalar):
            if self.kategoriler[i] in (KAT["ozel"], KAT["bayt"]):
                continue
            if p.startswith(ISARET):
                self._trie_ekle(self._trie_bas, p[1:], i)
            else:
                self._trie_ekle(self._trie_ilk, p, i)
                if self.kategoriler[i] != KAT["kok"]:
                    self._trie_ekle(self._trie_ic, p, i)
        self._bosluklu = [p.startswith(ISARET) and len(p) > 1 for p in self.parcalar]
        self._govde = [p[1:] if b else p for p, b in zip(self.parcalar, self._bosluklu, strict=True)]
        # "Kelime parçası" ön bölütlemenin kelime sınıfıyla aynı ölçütle belirlenir (² ₂ Ⅻ de dahil);
        # aksi hâlde <BB> ile işaretli "H₂O" gibi kelimelerde büyük harf kaybolurdu.
        self._harfli = [
            self.kategoriler[i] not in (KAT["ozel"], KAT["bayt"]) and kelime_mi(g) for i, g in enumerate(self._govde)
        ]
        # -yor önündeki daralmış gövdeler (bekli-, anlı-) yalnız "yor" ile devam eden kelimelerde kullanılabilir;
        # yoksa "işi" (işemek → işi-yor) gibi biçimler "iş·i"yi gasp ederdi.
        yor_once = self.bilgi.get("yor_once") or []
        self._yor_once = frozenset(
            self.kimlik[p] for k in yor_once for p in (ISARET + k, k) if p in self.kimlik
        )
        self._onbellek: dict[tuple[str, bool], tuple[int, ...]] = {}

    # ----------------------------------------------------------------------------------------
    @staticmethod
    def _trie_ekle(kok: dict, s: str, kimlik: int) -> None:
        if not s:
            return
        d = kok
        for c in s:
            d = d.setdefault(c, {})
        d[_SON] = kimlik

    def __len__(self) -> int:
        return len(self.parcalar)

    @property
    def boyut(self) -> int:
        return len(self.parcalar)

    def kategori_adi(self, kimlik: int) -> str:
        return KATEGORILER[self.kategoriler[kimlik]]

    # ----------------------------------------------------------------------------------------
    # Kodlama
    # ----------------------------------------------------------------------------------------
    def kelime_bol(self, kelime: str, bosluk: bool) -> tuple[int, ...]:
        anahtar = (kelime, bosluk)
        sonuc = self._onbellek.get(anahtar)
        if sonuc is None:
            sonuc = tuple(self._viterbi(kelime, bosluk))
            if len(self._onbellek) > 2_000_000:
                self._onbellek.clear()
            self._onbellek[anahtar] = sonuc
        return sonuc

    def _viterbi(self, w: str, bosluk: bool) -> list[int]:
        n = len(w)
        sonsuz = math.inf
        en_iyi = [sonsuz] * (n + 1)
        geri: list[tuple[int, tuple[int, ...]] | None] = [None] * (n + 1)
        maliyet = self.maliyetler
        yor = self._yor_once
        if bosluk:
            dugum = self._trie_bas
            for j in range(n):
                dugum = dugum.get(w[j])
                if dugum is None:
                    break
                t = dugum.get(_SON)
                if t is not None and maliyet[t] < en_iyi[j + 1]:
                    if yor and t in yor and not w.startswith("yor", j + 1):
                        continue
                    en_iyi[j + 1] = maliyet[t]
                    geri[j + 1] = (0, (t,))
        for i in range(n):
            if i == 0:
                taban = maliyet[BOSLUK_ID] + AYRI_BOSLUK_CEZASI if bosluk else 0.0
                onek: tuple[int, ...] = (BOSLUK_ID,) if bosluk else ()
            else:
                taban = en_iyi[i]
                if taban == sonsuz:
                    continue
                onek = ()
            dugum = self._trie_ilk if i == 0 else self._trie_ic
            tek_harf_var = False
            for j in range(i, n):
                dugum = dugum.get(w[j])
                if dugum is None:
                    break
                t = dugum.get(_SON)
                if t is not None:
                    if j == i:
                        tek_harf_var = True
                    if i == 0 and yor and t in yor and not w.startswith("yor", j + 1):
                        continue
                    m = taban + maliyet[t]
                    if m < en_iyi[j + 1]:
                        en_iyi[j + 1] = m
                        geri[j + 1] = (i, onek + (t,))
            if not tek_harf_var:
                baytlar = tuple(BAYT0 + b for b in w[i].encode("utf-8"))
                m = taban + BAYT_MALIYETI * len(baytlar)
                if m < en_iyi[i + 1]:
                    en_iyi[i + 1] = m
                    geri[i + 1] = (i, onek + baytlar)
        parcalar: list[tuple[int, ...]] = []
        j = n
        while j > 0:
            adim = geri[j]
            assert adim is not None
            parcalar.append(adim[1])
            j = adim[0]
        return [t for p in reversed(parcalar) for t in p]

    def kafes(self, w: str, bosluk: bool) -> list[tuple[int, int, tuple[int, ...], float]]:
        """Bölünme kafesi: ``(başlangıç, bitiş, token'lar, maliyet)`` kenarları (eğitimde ileri-geri için)."""
        n = len(w)
        kenarlar: list[tuple[int, int, tuple[int, ...], float]] = []
        maliyet = self.maliyetler
        yor = self._yor_once
        if bosluk:
            dugum = self._trie_bas
            for j in range(n):
                dugum = dugum.get(w[j])
                if dugum is None:
                    break
                t = dugum.get(_SON)
                if t is not None and not (yor and t in yor and not w.startswith("yor", j + 1)):
                    kenarlar.append((0, j + 1, (t,), maliyet[t]))
        for i in range(n):
            onek: tuple[int, ...] = (BOSLUK_ID,) if (i == 0 and bosluk) else ()
            taban = maliyet[BOSLUK_ID] + AYRI_BOSLUK_CEZASI if onek else 0.0
            dugum = self._trie_ilk if i == 0 else self._trie_ic
            tek_harf_var = False
            for j in range(i, n):
                dugum = dugum.get(w[j])
                if dugum is None:
                    break
                t = dugum.get(_SON)
                if t is not None:
                    tek_harf_var |= j == i
                    if i == 0 and yor and t in yor and not w.startswith("yor", j + 1):
                        continue
                    kenarlar.append((i, j + 1, onek + (t,), taban + maliyet[t]))
            if not tek_harf_var:
                baytlar = tuple(BAYT0 + b for b in w[i].encode("utf-8"))
                kenarlar.append((i, i + 1, onek + baytlar, taban + BAYT_MALIYETI * len(baytlar)))
        return kenarlar

    def _karakter(self, c: str, bosluk: bool) -> list[int]:
        if bosluk:
            t = self.kimlik.get(ISARET + c)
            if t is not None:
                return [t]
            return [BOSLUK_ID, *self._karakter(c, False)]
        t = self.kimlik.get(c)
        if t is not None:
            return [t]
        return [BAYT0 + b for b in c.encode("utf-8")]

    def encode(self, metin: str, bos: bool = False, eos: bool = False, normalle: bool = True) -> list[int]:
        if normalle:
            metin = normallestir(metin)
        ids: list[int] = [BOS] if bos else []
        for tur, s, bosluk, ortuk in birimler(metin):
            if tur == KELIME:
                durum = harf_durumu(s)
                if durum == "B":
                    ids.append(BUYUK)
                    s = kucuk(s)
                elif durum == "BB":
                    ids.append(TUM_BUYUK)
                    s = kucuk(s)
                parca = self.kelime_bol(s, bosluk)
                if ortuk and parca[0] == BOSLUK_ID:
                    parca = self.kelime_bol(s, False)  # ▁'lı biçim yoksa örtük boşluk yazılmaz
                ids.extend(parca)
            elif tur == SATIR:
                ids.append(SATIR_ID)
            elif tur == BOSLUK:
                ids.append(BOSLUK_ID)
            else:
                for c in s:
                    parca = self._karakter(c, bosluk)
                    if ortuk and parca[0] == BOSLUK_ID:
                        parca = self._karakter(c, False)
                    ids.extend(parca)
                    bosluk = ortuk = False
        if eos:
            ids.append(EOS)
        return ids

    # ----------------------------------------------------------------------------------------
    # Çözme
    # ----------------------------------------------------------------------------------------
    def decode(self, ids: Iterable[int], ozel_goster: bool = False) -> str:
        cikti: list[str] = []
        kelime: list[str] = []
        kelime_modu: str | None = None
        bekleyen_mod: str | None = None
        baytlar = bytearray()
        satir_basi = True  # satır başındaki ▁'lı parçanın boşluğu örtüktür, yazılmaz

        def bayt_bosalt() -> None:
            # Bayta düşmüş karakterler: harfse kelimenin parçasıdır, değilse kelimeyi bitirir.
            if not baytlar:
                return
            metin = baytlar.decode("utf-8", errors="replace")
            baytlar.clear()
            for ch in metin:
                if kelime_mi(ch):
                    if kelime:
                        kelime.append(ch)
                    else:
                        kelime_baslat(ch)
                else:
                    kelime_kapat()
                    cikti.append(ch)

        def kelime_bitir() -> None:
            bayt_bosalt()
            kelime_kapat()

        def kelime_kapat() -> None:
            nonlocal kelime_modu
            if kelime:
                s = "".join(kelime)
                if kelime_modu == "B":
                    s = bas_buyuk(s)
                elif kelime_modu == "BB":
                    s = buyuk(s)
                cikti.append(s)
                kelime.clear()
            kelime_modu = None

        def kelime_baslat(govde: str) -> None:
            nonlocal kelime_modu, bekleyen_mod
            kelime_modu, bekleyen_mod = bekleyen_mod, None
            kelime.append(govde)

        for t in ids:
            t = int(t)
            if t < 0 or t >= len(self.parcalar):
                continue
            kat = self.kategoriler[t]
            if kat == KAT["bayt"]:
                baytlar.append(t - BAYT0)
                satir_basi = False
                continue
            if t == BUYUK or t == TUM_BUYUK:
                kelime_bitir()
                bekleyen_mod = "B" if t == BUYUK else "BB"
                continue
            if t == BOS or t == EOS:
                kelime_bitir()
                satir_basi = True  # her belge ayrı kodlanır
                bekleyen_mod = None  # büyük harf işareti belgeden belgeye taşınmaz
                if ozel_goster:
                    cikti.append(self.parcalar[t])
                continue
            if t == SATIR_ID:
                kelime_bitir()
                cikti.append("\n")
                satir_basi = True
                bekleyen_mod = None
                continue
            if t == BOSLUK_ID:
                kelime_bitir()
                cikti.append(" ")
                continue
            if kat == KAT["ozel"]:
                kelime_bitir()
                if ozel_goster:
                    cikti.append(self.parcalar[t])
                continue
            govde = self._govde[t]
            if self._bosluklu[t]:
                kelime_bitir()
                if not satir_basi:
                    cikti.append(" ")
                satir_basi = False
                if self._harfli[t]:
                    kelime_baslat(govde)
                else:
                    cikti.append(govde)
                    satir_basi = govde in ACICILAR  # "▁(" ardından gelen ▁'lı parçanın boşluğu örtüktür
                continue
            satir_basi = False
            if self._harfli[t]:
                bayt_bosalt()
                if kelime:
                    kelime.append(govde)
                else:
                    kelime_baslat(govde)
            else:
                kelime_bitir()
                cikti.append(govde)
        kelime_bitir()
        return "".join(cikti)

    # ----------------------------------------------------------------------------------------
    # İnceleme
    # ----------------------------------------------------------------------------------------
    def parca_listesi(self, metin: str) -> list[str]:
        return [self.parcalar[i] for i in self.encode(metin)]

    def acikla(self, metin: str) -> list[tuple[int, str, str]]:
        return [(i, self.parcalar[i], self.kategori_adi(i)) for i in self.encode(metin)]

    def kategori_araliklari(self) -> dict[str, tuple[int, int]]:
        araliklar: dict[str, tuple[int, int]] = {}
        for i, k in enumerate(self.kategoriler):
            ad = KATEGORILER[k]
            bas, son = araliklar.get(ad, (i, i))
            araliklar[ad] = (min(bas, i), max(son, i + 1))
        return araliklar

    # ----------------------------------------------------------------------------------------
    # Kaydetme / yükleme
    # ----------------------------------------------------------------------------------------
    def kaydet(self, klasor: Path) -> None:
        klasor.mkdir(parents=True, exist_ok=True)
        with (klasor / "sozcukler.tsv").open("w", encoding="utf-8") as f:
            f.write("id\tparca\tkategori\tana\tbicim\tmaliyet\tsayi\n")
            for i, p in enumerate(self.parcalar):
                # Maliyet tam hassasiyetle (repr) yazılır: yuvarlama, birbirine çok yakın iki bölünmenin
                # yerini değiştirip yüklenen tokenizer'ın farklı kodlamasına yol açar.
                f.write(
                    f"{i}\t{json.dumps(p, ensure_ascii=False)}\t{KATEGORILER[self.kategoriler[i]]}\t"
                    f"{self.analar[i]}\t{self.bicimler[i]}\t{float(self.maliyetler[i])!r}\t{self.sayilar[i]}\n"
                )
        bilgi = dict(self.bilgi)
        bilgi.update(
            {
                "surum": 1,
                "boyut": self.boyut,
                "kategoriler": {k: list(v) for k, v in self.kategori_araliklari().items()},
                "ozel_tokenlar": OZEL_TOKENLAR,
                "bicim_adlari": list(BICIM_ADLARI),
            }
        )
        (klasor / "bilgi.json").write_text(json.dumps(bilgi, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def yukle(cls, klasor: Path) -> TurkceTokenizer:
        # Yalnız "\n"'de bölünür: splitlines() U+2028/U+2029/U+0085'te de böler ve bunlar bir parçanın
        # içinde (json.dumps ensure_ascii=False ile ham yazılmış) olabilir.
        satirlar = (Path(klasor) / "sozcukler.tsv").read_text(encoding="utf-8").split("\n")[1:]
        parcalar, kategoriler, analar, bicimler, maliyetler, sayilar = [], [], [], [], [], []
        for satir in satirlar:
            if not satir:
                continue
            i, p, kat, ana, bicim, maliyet, sayi = satir.split("\t")
            assert int(i) == len(parcalar), "sozcukler.tsv sırası bozuk"
            parcalar.append(json.loads(p))
            kategoriler.append(KAT[kat])
            analar.append(int(ana))
            bicimler.append(int(bicim))
            maliyetler.append(float(maliyet))
            sayilar.append(int(sayi))
        bilgi_yolu = Path(klasor) / "bilgi.json"
        bilgi = json.loads(bilgi_yolu.read_text(encoding="utf-8")) if bilgi_yolu.exists() else {}
        return cls(parcalar, kategoriler, maliyetler, analar, bicimler, sayilar, bilgi)


# ============================================================================================
# Eğitim
# ============================================================================================


def _harf_kumesi() -> list[str]:
    kucukler = list(TURK_ALFABESI + EK_HARFLER)
    return kucukler


def _taban_parcalar(karakter_sayilari: Counter, harf_sayilari: Counter, en_az: int) -> list[tuple[str, int]]:
    """Özel, bayt, harf, rakam ve noktalama token'ları (sabit sırayla)."""
    taban: list[tuple[str, int]] = [(p, KAT["ozel"]) for p in OZEL_TOKENLAR]
    taban += [(f"<0x{b:02X}>", KAT["bayt"]) for b in range(256)]
    kucukler = _harf_kumesi()
    buyukler = [buyuk(h) for h in kucukler]
    for grup in (kucukler, buyukler):
        taban += [(h, KAT["harf"]) for h in grup]
        taban += [(ISARET + h, KAT["harf"]) for h in grup]
    bilinen = set(kucukler) | set(buyukler)
    ekstra = sorted(
        (h for h, c in harf_sayilari.items() if c >= en_az and h not in bilinen), key=lambda h: (-harf_sayilari[h], h)
    )
    taban += [(h, KAT["harf"]) for h in ekstra]
    taban += [(str(r), KAT["rakam"]) for r in range(10)]
    taban += [(ISARET + str(r), KAT["rakam"]) for r in range(10)]
    noktalama = list(dict.fromkeys(NOKTALAMA))
    diger = sorted(
        {c for (c, _), n in karakter_sayilari.items() if n >= en_az and not c.isdigit() and c not in noktalama},
        key=lambda c: (-sum(karakter_sayilari[(c, b)] for b in (True, False)), c),
    )
    noktalama += diger
    taban += [(c, KAT["noktalama"]) for c in noktalama]
    bosluklu = list(dict.fromkeys(BOSLUKLU_NOKTALAMA))
    bosluklu += sorted(
        (c for c in noktalama if karakter_sayilari[(c, True)] >= en_az and c not in bosluklu),
        key=lambda c: -karakter_sayilari[(c, True)],
    )
    taban += [(ISARET + c, KAT["noktalama"]) for c in bosluklu]
    gorulen: set[str] = set()
    sonuc = []
    for p, k in taban:
        if p not in gorulen:
            gorulen.add(p)
            sonuc.append((p, k))
    return sonuc


def _sayim_tokenizer(
    adaylar: list[tuple[str, int]], maliyet: dict[str, float], bilgi: dict | None = None
) -> TurkceTokenizer:
    parcalar = [p for p, _ in adaylar]
    kategoriler = [k for _, k in adaylar]
    maliyetler = [maliyet.get(p, 1.0) for p in parcalar]
    return TurkceTokenizer(parcalar, kategoriler, maliyetler, bilgi=bilgi)


TEK_HARFLI_EKLER = frozenset(b for b in ek_envanteri() if len(b) == 1)


def _ceza(p: str, k: int, ayar: TokenizerAyarlari) -> float:
    """Harf ve alt parça kullanımı cezalıdır; ama ``okul·a``, ``ev·i``, ``gel·di·m`` gibi tek harfli
    ek biçimleri (kelime içindeki a, e, ı, i, u, ü, m, n, k, r, t, l, ş) cezasızdır."""
    if k == KAT["harf"]:
        return 0.0 if p in TEK_HARFLI_EKLER else ayar.harf_cezasi
    if k == KAT["parca"]:
        return ayar.parca_cezasi
    return 0.0


def _maliyetler(
    adaylar: list[tuple[str, int]], sayilar: Counter, ayar: TokenizerAyarlari, alfa: float = 0.5
) -> dict[str, float]:
    toplam = sum(sayilar.values())
    payda = toplam + alfa * len(adaylar)
    return {p: -math.log((sayilar.get(p, 0) + alfa) / payda) + _ceza(p, k, ayar) for p, k in adaylar}


def _kelimeleri_say(
    tok: TurkceTokenizer, kelimeler: Counter, tek_harfli_ekler: frozenset[str] = frozenset()
) -> tuple[Counter, Counter]:
    """Her kelime türünü böler.

    Döndürür: parça kullanım sayıları ve *açıklanamayan* kelimeler (BPE girdisi). Bir kelime ancak
    "kök + ek*" diye bölünebiliyorsa açıklanmış sayılır; değilse (özel ad, yabancı kelime, sahte kök
    bölünmesi) tamamı karakter dizisi olarak BPE'ye gider ve sık geçenler tek parça olarak öğrenilir.
    """
    sayilar: Counter = Counter()
    aciklanamayan: Counter = Counter()
    kok, ek = KAT["kok"], KAT["ek"]
    for (w, bosluk), n in kelimeler.items():
        ids = tok.kelime_bol(w, bosluk)
        for t in ids:
            sayilar[tok.parcalar[t]] += n
        iyi = tok.kategoriler[ids[0]] == kok and all(
            tok.kategoriler[t] == ek or tok.parcalar[t] in tek_harfli_ekler for t in ids[1:]
        )
        if not iyi and len(w) > 1:
            semboller = list(w)
            if bosluk:
                semboller[0] = ISARET + semboller[0]
            aciklanamayan[tuple(semboller)] += n
    return sayilar, aciklanamayan


def morfolojik_mi(parca: str, kokler: set[str] | frozenset[str], ekler: set[str] | frozenset[str]) -> bool:
    """Parça ``kök + ek*`` ya da ``ek ek+`` olarak çözülebiliyor mu? (en fazla bir tek harfli ekle)

    BPE'nin ``larda``, ``yordu``, ``▁ağzın`` gibi ek dizilerini tek parça yapıp morfolojiyi
    bulanıklaştırmasını önlemek için kullanılır. Tek harfli ek sınırı, ``ankara``yı ``a·n·k·a·r·a``
    diye "ek dizisi" saymamak içindir.
    """
    bosluklu = parca.startswith(ISARET)
    s = parca[1:] if bosluklu else parca
    n = len(s)
    sonsuz = 10**9

    def ek_ile(bas: int) -> int:
        """s[bas:]'ı eklere bölmek için gereken en az tek harfli ek sayısı (bölünemezse sonsuz)."""
        en_az = [sonsuz] * (n + 1)
        en_az[bas] = 0
        for i in range(bas, n):
            if en_az[i] == sonsuz:
                continue
            for j in range(i + 1, n + 1):
                e = s[i:j]
                if e in ekler:
                    en_az[j] = min(en_az[j], en_az[i] + (1 if len(e) == 1 else 0))
        return en_az[n]

    for k in range(2, n):
        if s[:k] in kokler and ek_ile(k) <= 1:
            return True
    return not bosluklu and ek_ile(0) <= 1  # "larda", "ıyla" gibi yalnız eklerden oluşan parça


def _logtopla(a: float, b: float) -> float:
    if a == -math.inf:
        return b
    if b == -math.inf:
        return a
    m = max(a, b)
    return m + math.log(math.exp(a - m) + math.exp(b - m))


def _beklenen_say(tok: TurkceTokenizer, kelimeler: Counter) -> Counter:
    """Yumuşak EM (Unigram LM): her bölünme olasılığı oranında sayılır (ileri-geri algoritması).

    Sert sayımda ilk turdaki bir eşitliği kazanan bölünme kendini besler (``oku·la`` / ``okul·a``);
    beklenen sayımda karar, derlemin genel istatistiğine kalır.
    """
    sayilar: Counter = Counter()
    eksi_sonsuz = -math.inf
    for (w, bosluk), n in kelimeler.items():
        kenarlar = tok.kafes(w, bosluk)
        uzunluk = len(w)
        ileri = [eksi_sonsuz] * (uzunluk + 1)
        ileri[0] = 0.0
        for i, j, _, m in sorted(kenarlar, key=lambda k: k[0]):
            if ileri[i] != eksi_sonsuz:
                ileri[j] = _logtopla(ileri[j], ileri[i] - m)
        geri = [eksi_sonsuz] * (uzunluk + 1)
        geri[uzunluk] = 0.0
        for i, j, _, m in sorted(kenarlar, key=lambda k: -k[1]):
            if geri[j] != eksi_sonsuz:
                geri[i] = _logtopla(geri[i], geri[j] - m)
        z = ileri[uzunluk]
        if z == eksi_sonsuz:
            continue
        for i, j, toks, m in kenarlar:
            if ileri[i] == eksi_sonsuz or geri[j] == eksi_sonsuz:
                continue
            olasilik = math.exp(ileri[i] - m + geri[j] - z)
            if olasilik > 1e-6:
                for t in toks:
                    sayilar[tok.parcalar[t]] += n * olasilik
    return sayilar


def _bpe(diziler: Counter, hedef: int, en_az: int) -> list[tuple[str, int]]:
    """Açıklanamayan harf dizileri üzerinde BPE; ``(yeni_parça, birleşme_sayısı)`` listesi döndürür."""
    kelimeler = [list(d) for d in diziler]
    frek = list(diziler.values())
    cift_sayi: Counter = Counter()
    nerede: dict[tuple[str, str], set[int]] = defaultdict(set)
    for i, w in enumerate(kelimeler):
        for a, b in zip(w, w[1:], strict=False):
            cift_sayi[(a, b)] += frek[i]
            nerede[(a, b)].add(i)
    yigin = [(-c, cift) for cift, c in cift_sayi.items()]
    heapq.heapify(yigin)
    yeni: list[tuple[str, int]] = []
    gorulen: set[str] = set()
    while len(yeni) < hedef and yigin:
        eksi, cift = heapq.heappop(yigin)
        c = cift_sayi.get(cift, 0)
        if c != -eksi:  # bayat kayıt: güncel sayıyla geri koy (azalan sayılar tembel düzeltilir)
            if c > 0:
                heapq.heappush(yigin, (-c, cift))
            continue
        if c < en_az:
            break
        sembol = cift[0] + cift[1]
        if sembol not in gorulen:
            gorulen.add(sembol)
            yeni.append((sembol, c))
        for i in nerede.pop(cift, ()):
            w, f = kelimeler[i], frek[i]
            eski = Counter(zip(w, w[1:], strict=False))
            if not eski.get(cift):
                continue  # bu kelimede çift artık yok (bayat dizin)
            yeni_w: list[str] = []
            j = 0
            while j < len(w):
                if j + 1 < len(w) and w[j] == cift[0] and w[j + 1] == cift[1]:
                    yeni_w.append(sembol)
                    j += 2
                else:
                    yeni_w.append(w[j])
                    j += 1
            kelimeler[i] = yeni_w
            yeni_ciftler = Counter(zip(yeni_w, yeni_w[1:], strict=False))
            # Yalnız sayısı değişen çiftler güncellenir; yığına yalnız artanlar konur.
            for p in eski.keys() | yeni_ciftler.keys():
                fark = yeni_ciftler.get(p, 0) - eski.get(p, 0)
                if fark:
                    cift_sayi[p] += fark * f
                    if fark > 0:
                        heapq.heappush(yigin, (-cift_sayi[p], p))
                if yeni_ciftler.get(p, 0):
                    nerede[p].add(i)
                elif p != cift and p in nerede:
                    nerede[p].discard(i)
        cift_sayi.pop(cift, None)
    return yeni


def egit(
    metinler: Iterable[str],
    kokler: Sequence[tuple[str, str, str]],
    ayar: TokenizerAyarlari | None = None,
    yaz=print,
) -> TurkceTokenizer:
    """Derlem ve TDK kök sözlüğünden tokenizer eğitir.

    ``kokler``: ``(kök, ana_kök, tür)`` üçlüleri (``tdk.kokleri_cikar``).
    """
    ayar = ayar or TokenizerAyarlari()
    kelimeler: Counter = Counter()
    karakterler: Counter = Counter()
    harfler: Counter = Counter()
    belge = 0
    for metin in metinler:
        belge += 1
        for tur, s, bosluk, _ in birimler(normallestir(metin)):
            if tur == KELIME:
                if harf_durumu(s) in ("B", "BB"):
                    s = kucuk(s)
                kelimeler[(s, bosluk)] += 1
            elif tur not in (SATIR, BOSLUK):
                for c in s:
                    karakterler[(c, bosluk)] += 1
                    bosluk = False
    for (w, _), n in kelimeler.items():
        for c in w:
            harfler[c] += n
    yaz(f"Derlem: {belge} belge, {sum(kelimeler.values())} kelime, {len(kelimeler)} farklı (kelime, boşluk) türü")

    taban = _taban_parcalar(karakterler, harfler, ayar.en_az_sayi)
    taban_kume = {p for p, _ in taban}
    ekler = ek_envanteri()
    ek_adaylari = [(b, KAT["ek"]) for b in ekler if len(b) > 1 and b not in taban_kume]
    ek_kume = {b for b, _ in ek_adaylari}
    kok_bilgi: dict[str, tuple[str, str]] = {}
    for kok, ana, tur in kokler:
        if len(kok) > 1:
            kok_bilgi.setdefault(kok, (ana, tur))
    # Düzenli isim-fiiller (gelme, olma, bulunma: fiil gövdesi + -mA) kök adayı olmaz: gövde + ek olarak
    # bölünürler. Aday kalsalar mastar "▁gelme·k" diye bölünürdü (doğrusu "▁gel·mek").
    isim_fiil = {
        k
        for k, (_, tur) in kok_bilgi.items()
        if tur == "kok" and len(k) > 3 and k.endswith(("ma", "me")) and kok_bilgi.get(k[:-2], ("", ""))[1] == "fiil"
    }
    yor_once = sorted(k for k, (_, tur) in kok_bilgi.items() if tur == "daralma")
    bilgi = {"yor_once": yor_once}
    kok_adaylari: list[tuple[str, int]] = []
    for kok in kok_bilgi:
        if kok in isim_fiil:
            continue
        if ISARET + kok not in taban_kume:
            kok_adaylari.append((ISARET + kok, KAT["kok"]))
        if kok not in taban_kume and kok not in ek_kume:
            kok_adaylari.append((kok, KAT["kok"]))
    yaz(
        f"Adaylar: {len(taban)} taban, {len(ek_adaylari)} ek biçimi, {len(kok_adaylari)} kök biçimi (▁'lı ve ▁'sız; "
        f"{len(isim_fiil)} düzenli isim-fiil gövde + -mA olarak bırakıldı)"
    )

    tek_harfli_ekler = TEK_HARFLI_EKLER
    taban_kategorileri = (KAT["ozel"], KAT["bayt"], KAT["harf"], KAT["rakam"], KAT["noktalama"])
    esik = 0.5  # beklenen kullanımı bundan az olan parça "kullanılmıyor" sayılır
    adaylar = taban + ek_adaylari + kok_adaylari
    # 0. tur: her parça eşit maliyetli, (ek olmayan) harfler cezalı. Turlar yumuşak EM'dir.
    maliyet = {p: 1.0 + _ceza(p, k, ayar) for p, k in adaylar}
    sayilar: Counter = Counter()
    for tur_no in range(ayar.em_turu):
        tok = _sayim_tokenizer(adaylar, maliyet, bilgi)
        sayilar = _beklenen_say(tok, kelimeler)
        maliyet = _maliyetler(adaylar, sayilar, ayar)
        kullanilan = sum(1 for p, _ in kok_adaylari if sayilar.get(p, 0) >= esik)
        yaz(f"  EM turu {tur_no + 1}: kullanılan kök biçimi {kullanilan}")

    ek_kullanilan = [(p, k) for p, k in ek_adaylari if sayilar.get(p, 0) >= esik]
    butce = max(ayar.boyut - len(taban) - len(ek_kullanilan), 0)
    kok_butcesi = int(butce * (1.0 - ayar.parca_orani))
    kok_sirali = sorted(
        ((p, k) for p, k in kok_adaylari if sayilar.get(p, 0) >= esik),
        key=lambda pk: (-sayilar[pk[0]], sirala_anahtari(pk[0].lstrip(ISARET))),
    )
    kok_secilen = kok_sirali[:kok_butcesi]
    adaylar = taban + ek_kullanilan + kok_secilen
    tok = _sayim_tokenizer(adaylar, _maliyetler(adaylar, sayilar, ayar), bilgi)
    _, aciklanamayan = _kelimeleri_say(tok, kelimeler, tek_harfli_ekler)
    oran = sum(aciklanamayan.values()) / max(sum(kelimeler.values()), 1)
    yaz(f"  Kök + ek ile açıklanamayan kelime oranı: %{100 * oran:.1f} ({len(aciklanamayan)} tür) → BPE'ye")

    parca_butcesi = max(ayar.boyut - len(adaylar), 0)
    mevcut = {p for p, _ in adaylar}
    kok_dizeleri = frozenset(p.lstrip(ISARET) for p, _ in kok_secilen)
    ek_dizeleri = frozenset(p for p, _ in ek_kullanilan) | tek_harfli_ekler
    ham_bpe = [(p, c) for p, c in _bpe(aciklanamayan, parca_butcesi * 2, ayar.en_az_sayi) if p not in mevcut]
    bpe = [(p, c) for p, c in ham_bpe if not morfolojik_mi(p, kok_dizeleri, ek_dizeleri)]
    yaz(f"  BPE: {len(ham_bpe)} aday, kök+ek ile çözülebilen {len(ham_bpe) - len(bpe)} parça elendi")
    bpe = bpe[:parca_butcesi]
    # BPE payını dolduramadıysa boş kalan yerler sıradaki köklere verilir (sözlük boşa küçülmesin).
    kalan = ayar.boyut - len(adaylar) - len(bpe)
    ek_kok = kok_sirali[kok_butcesi : kok_butcesi + max(kalan, 0)]
    kok_secilen = kok_secilen + ek_kok
    adaylar = taban + ek_kullanilan + kok_secilen
    yaz(
        f"Seçim: {len(ek_kullanilan)} ek, {len(kok_secilen)} kök ({len(ek_kok)} tanesi BPE'nin boş payından), "
        f"{len(bpe)} öğrenilmiş parça (BPE)"
    )
    adaylar = adaylar + [(p, KAT["parca"]) for p, _ in bpe]
    on_sayi = Counter(sayilar)
    for p, c in bpe:
        on_sayi[p] = c
    for _ in range(2):
        tok = _sayim_tokenizer(adaylar, _maliyetler(adaylar, on_sayi, ayar), bilgi)
        on_sayi = _beklenen_say(tok, kelimeler)

    # Kullanılmayan ek/kök/parçaları at, bütçeyi aşarsa en seyrekleri çıkar.
    tutulan = [(p, k) for p, k in adaylar if k in taban_kategorileri or on_sayi.get(p, 0) >= esik]
    fazla = len(tutulan) - ayar.boyut
    if fazla > 0:
        atilabilir = sorted(
            (p for p, k in tutulan if k in (KAT["parca"], KAT["kok"])), key=lambda p: on_sayi.get(p, 0)
        )[:fazla]
        at = set(atilabilir)
        tutulan = [(p, k) for p, k in tutulan if p not in at]
    for p, c in karakterler.items():
        on_sayi[(ISARET + p[0]) if p[1] else p[0]] += c

    tok = _sirali_tokenizer(tutulan, on_sayi, kok_bilgi, ekler, ayar, bilgi)
    tok.bilgi["egitim"] = {
        "belge": belge,
        "kelime": sum(kelimeler.values()),
        "farkli_kelime": len(kelimeler),
        "ayarlar": asdict(ayar),
    }
    yaz(f"Tokenizer hazır: {tok.boyut} token")
    return tok


def _sirali_tokenizer(
    tutulan: list[tuple[str, int]],
    sayilar: Counter,
    kok_bilgi: dict[str, tuple[str, str]],
    ekler: dict,
    ayar: TokenizerAyarlari,
    bilgi: dict | None = None,
) -> TurkceTokenizer:
    """Kimlikleri Türkçeye göre dizer, ana/biçim bağlarını kurar."""
    bloklar: dict[int, list[str]] = defaultdict(list)
    for p, k in tutulan:
        bloklar[k].append(p)
    sirali: list[tuple[str, int]] = []
    for k in range(len(KATEGORILER)):
        grup = bloklar.get(k, [])
        if k in (KAT["ek"], KAT["kok"], KAT["parca"]):
            grup = sorted(grup, key=lambda p: (-sayilar.get(p, 0), sirala_anahtari(p.lstrip(ISARET)), p))
        sirali += [(p, k) for p in grup]
    parcalar = [p for p, _ in sirali]
    kategoriler = [k for _, k in sirali]
    kimlik = {p: i for i, p in enumerate(parcalar)}
    maliyet = _maliyetler(sirali, sayilar, ayar)
    analar = list(range(len(parcalar)))
    bicimler = [BICIM_ASIL] * len(parcalar)
    for i, (p, k) in enumerate(sirali):
        if k == KAT["ek"]:
            ana = ekler[p].ana if p in ekler else p
            if ana != p and ana in kimlik and kategoriler[kimlik[ana]] == KAT["ek"]:
                analar[i] = kimlik[ana]
                bicimler[i] = BICIM_EK_UYUM
        elif k == KAT["kok"]:
            bosluklu = p.startswith(ISARET)
            kok = p[1:] if bosluklu else p
            ana_kok = kok_bilgi.get(kok, (kok, "kok"))[0]
            if bosluklu and ana_kok == kok:
                continue  # "▁kitap" asıl biçimdir
            hedef = next(
                (
                    kimlik[a]
                    for a in (ISARET + ana_kok, ana_kok)
                    if a in kimlik and a != p and kategoriler[kimlik[a]] == KAT["kok"]
                ),
                None,
            )
            if hedef is not None:
                analar[i] = hedef
                bicimler[i] = BICIM_SES if ana_kok != kok else BICIM_BOSLUKSUZ
    # Zincirleri tek adıma indir (ana'nın anası kendisi olmalı)
    for i in range(len(analar)):
        a = analar[i]
        gorulen = {i}
        while analar[a] != a and a not in gorulen:
            gorulen.add(a)
            a = analar[a]
        analar[i] = a
    return TurkceTokenizer(
        parcalar,
        kategoriler,
        [maliyet[p] for p in parcalar],
        analar,
        bicimler,
        [int(round(sayilar.get(p, 0))) for p in parcalar],
        dict(bilgi or {}),
    )
