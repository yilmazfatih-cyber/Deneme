"""Kişisel veriyi ve sırları maskeleme / geri açma.

Akış: `maskele(metin)` → "[TCKN_1]" gibi yer tutuculu metin + oturum (eşleme tablosu).
Maskeli metin modele gider; modelin yanıtı `maskeyi_ac(yanit, oturum)` ile geri açılır.
Aynı değer aynı oturumda hep aynı yer tutucuyu alır (çok turlu sohbette tutarlılık).
Kim kullanır: saglayici/gunluk.py (günlüğe kişisel veri yazmamak), sunucu/vekil.py.
Genişletme: yeni tür → `_TANIYICILAR` listesine bir satır (YENİ TANIYICI BURAYA).
Sınır: ad-soyad ve adres TANINMAZ (kural tabanlıdır; bunun için bir NER modeli gerekir).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Collection
from dataclasses import dataclass, field

from yz.guvenlik.dogrulama import (
    iban_gecerli,
    luhn_gecerli,
    tckn_gecerli,
    telefon_gecerli,
    vkn_gecerli,
    yalniz_rakam,
)
from yz.metin import buyuk_ascii


@dataclass(frozen=True)
class Taniyici:
    """Bir veri türünü bulan kural: düzenli ifade + isteğe bağlı sağlama denetimi."""

    tur: str
    kalip: re.Pattern[str]
    gecerli: Callable[[str], bool] | None = None
    grup: int = 0  # maskelenecek yakalama grubu (0 = eşleşmenin tamamı)


def _telefon_mu(metin: str) -> bool:
    # Ön eki ve ayracı olmayan düz 10 rakam telefon sayılmaz (VKN ya da sipariş no olabilir).
    if metin.isdigit() and len(metin) == 10:
        return False
    return telefon_gecerli(metin)


_SIR_ANAHTARI = r"api[_-]?key|api[_-]?anahtar\w*|token|belirte[cç]|secret|parola|[şs]ifre|password"

# Sıra önemlidir: önce gelen tanıyıcı çakışan aralığı kazanır.
_TANIYICILAR: tuple[Taniyici, ...] = (
    Taniyici("SIR", re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}")),
    Taniyici("SIR", re.compile(r"\b(?:hf_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,})")),
    Taniyici("SIR", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    Taniyici("SIR", re.compile(r"(?i)\bBearer\s+([A-Za-z0-9._~+/-]{16,}=*)"), grup=1),
    Taniyici(
        "SIR",
        re.compile(rf"(?i)\b(?:{_SIR_ANAHTARI})\s*[:=]\s*[\"']?([^\s\"',;]{{6,}})"),
        grup=1,
    ),
    Taniyici(
        "IBAN",
        re.compile(r"(?i)\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b"),
        iban_gecerli,
    ),
    Taniyici("KART", re.compile(r"(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)"), luhn_gecerli),
    Taniyici("TCKN", re.compile(r"(?<!\d)[1-9]\d{10}(?!\d)"), tckn_gecerli),
    Taniyici(
        "TELEFON",
        re.compile(
            r"(?<![\d+])(?:\+90|0090|0)?[ .-]?\(?[2-5]\d{2}\)?[ .-]?\d{3}[ .-]?\d{2}[ .-]?\d{2}(?!\d)"
        ),
        _telefon_mu,
    ),
    Taniyici("VKN", re.compile(r"(?<!\d)\d{10}(?!\d)"), vkn_gecerli),
    Taniyici("EPOSTA", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")),
    # YENİ TANIYICI BURAYA: Taniyici("TUR", re.compile(r"..."), dogrulama_islevi)
)

TUM_TURLER: frozenset[str] = frozenset(t.tur for t in _TANIYICILAR)
_YER_TUTUCU = re.compile(r"\[\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)[ _-]?(\d+)\s*\]")


@dataclass(frozen=True)
class Eslesme:
    """Metinde bulunan bir kişisel veri ya da sır."""

    tur: str
    bas: int
    son: int
    deger: str


@dataclass
class MaskeOturumu:
    """Bir konuşma boyunca değer ↔ yer tutucu eşlemesini tutar."""

    degerden: dict[str, str] = field(default_factory=dict)
    yer_tutucudan: dict[str, str] = field(default_factory=dict)
    sayaclar: dict[str, int] = field(default_factory=dict)

    def yer_tutucu(self, tur: str, deger: str) -> str:
        """Değer için yer tutucu döndürür; aynı değer hep aynı yer tutucuyu alır."""
        anahtar = f"{tur}:{yalniz_rakam(deger) if tur in _RAKAM_TURLERI else deger}"
        if anahtar in self.degerden:
            return self.degerden[anahtar]
        self.sayaclar[tur] = self.sayaclar.get(tur, 0) + 1
        etiket = f"[{tur}_{self.sayaclar[tur]}]"
        self.degerden[anahtar] = etiket
        self.yer_tutucudan[etiket] = deger
        return etiket

    @property
    def bos(self) -> bool:
        return not self.yer_tutucudan


_RAKAM_TURLERI = frozenset({"TCKN", "VKN", "KART", "TELEFON"})


def kisisel_veri_bul(metin: str, turler: Collection[str] | None = None) -> list[Eslesme]:
    """Metindeki kişisel verileri ve sırları bulur (çakışanlarda öncelikli tanıyıcı kazanır)."""
    secili = TUM_TURLER if turler is None else frozenset(turler)
    bilinmeyen = secili - TUM_TURLER
    if bilinmeyen:
        raise ValueError(f"Bilinmeyen tür: {sorted(bilinmeyen)}. Geçerli türler: {sorted(TUM_TURLER)}")
    bulunan: list[Eslesme] = []
    for taniyici in _TANIYICILAR:
        if taniyici.tur not in secili:
            continue
        for m in taniyici.kalip.finditer(metin):
            bas, son = m.span(taniyici.grup)
            deger = metin[bas:son]
            if taniyici.gecerli is not None and not taniyici.gecerli(deger):
                continue
            if any(bas < e.son and e.bas < son for e in bulunan):
                continue
            bulunan.append(Eslesme(taniyici.tur, bas, son, deger))
    return sorted(bulunan, key=lambda e: e.bas)


def maskele(
    metin: str,
    oturum: MaskeOturumu | None = None,
    turler: Collection[str] | None = None,
) -> tuple[str, MaskeOturumu]:
    """Kişisel verileri yer tutucularla değiştirir; (maskeli metin, oturum) döndürür."""
    oturum = oturum if oturum is not None else MaskeOturumu()
    parcalar: list[str] = []
    konum = 0
    for e in kisisel_veri_bul(metin, turler):
        parcalar.append(metin[konum : e.bas])
        parcalar.append(oturum.yer_tutucu(e.tur, e.deger))
        konum = e.son
    parcalar.append(metin[konum:])
    return "".join(parcalar), oturum


def maskeyi_ac(metin: str, oturum: MaskeOturumu) -> str:
    """Yer tutucuları asıl değerlerle değiştirir.

    Model yer tutucuyu biraz bozsa da ("[tckn 1]", "[TCKN-1]") tanınır; bilinmeyen yer
    tutucular olduğu gibi kalır.
    """

    def degistir(m: re.Match[str]) -> str:
        etiket = f"[{buyuk_ascii(m.group(1))}_{int(m.group(2))}]"
        return oturum.yer_tutucudan.get(etiket, m.group())

    return _YER_TUTUCU.sub(degistir, metin)


def gunluk_icin_maskele(metin: str) -> str:
    """Günlüğe yazılacak metni tek yönlü maskeler (geri açma tablosu tutulmaz)."""
    return maskele(metin)[0]
