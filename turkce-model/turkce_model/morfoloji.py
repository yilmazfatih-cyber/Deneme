"""Türkçe ek envanteri: şablonlardan (arketiplerden) ses uyumuna göre ek biçimleri üretir.

Şablon yazımı:
  A → a/e (kalın/ince)          I → ı/i/u/ü (dört yönlü uyum)
  D → d/t   C → c/ç   G → g/k    (sert ünsüzden sonra sertleşme)
  (y) (n) (s) (I) …              isteğe bağlı kaynaştırma harfi / ünlü
  Sonu k ile biten şablonlara ünlüden önceki yumuşamış biçim (ğ) de eklenir: lIk → lık, lığ.

Bir şablondaki tüm A/I aynı uyum durumunu paylaşır: ``AcAk`` → acak, ecek (``acek`` üretilmez).
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field

from .metin import KALIN_UNLULER, UNLULER, YUVARLAK_UNLULER

# (ad, şablon, grup)
SABLONLAR: list[tuple[str, str, str]] = [
    # --- isim çekimi ---
    ("çoğul / 3. çoğul kişi", "lAr", "cekim"),
    ("1. tekil iyelik", "(I)m", "cekim"),
    ("2. tekil iyelik", "(I)n", "cekim"),
    ("3. tekil iyelik", "(s)I", "cekim"),
    ("1. çoğul iyelik", "(I)mIz", "cekim"),
    ("2. çoğul iyelik", "(I)nIz", "cekim"),
    ("3. çoğul iyelik", "lArI", "cekim"),
    ("belirtme", "(y)I", "cekim"),
    ("yönelme", "(y)A", "cekim"),
    ("bulunma", "DA", "cekim"),
    ("ayrılma", "DAn", "cekim"),
    ("ilgi", "(n)In", "cekim"),
    ("vasıta", "(y)lA", "cekim"),
    ("zamir n'li yönelme", "nA", "cekim"),
    ("zamir n'li bulunma", "nDA", "cekim"),
    ("zamir n'li ayrılma", "nDAn", "cekim"),
    ("zamir n'li belirtme", "nI", "cekim"),
    ("aitlik", "ki", "cekim"),
    ("eşitlik / zarf", "CA", "cekim"),
    ("eşitlik (zamir)", "ncA", "cekim"),
    # --- ek-fiil ve kişi ---
    ("1. tekil kişi", "(y)Im", "cekim"),
    ("2. tekil kişi", "sIn", "cekim"),
    ("1. çoğul kişi", "(y)Iz", "cekim"),
    ("2. çoğul kişi", "sInIz", "cekim"),
    ("geçmiş 2. çoğul kişi", "nIz", "cekim"),
    ("bildirme", "DIr", "cekim"),
    ("hikâye", "(y)DI", "cekim"),
    ("rivayet", "(y)mIş", "cekim"),
    ("şart (ek-fiil)", "(y)sA", "cekim"),
    ("zarf-fiil -ken", "(y)ken", "cekim"),
    ("geçmiş kişi m/n/k", "m", "cekim"),
    ("geçmiş kişi n", "n", "cekim"),
    ("geçmiş kişi k", "k", "cekim"),
    # --- fiil çekimi ---
    ("olumsuzluk", "mA", "cekim"),
    ("olumsuz geniş zaman", "mAz", "cekim"),
    ("şimdiki zaman", "(I)yor", "cekim"),
    ("gelecek zaman", "(y)AcAk", "cekim"),
    ("görülen geçmiş", "DI", "cekim"),
    ("öğrenilen geçmiş", "mIş", "cekim"),
    ("geniş zaman -Ir", "Ir", "cekim"),
    ("geniş zaman -Ar", "Ar", "cekim"),
    ("geniş zaman -r", "r", "cekim"),
    ("gereklilik", "mAlI", "cekim"),
    ("dilek-şart", "sA", "cekim"),
    ("sürerlik", "mAktA", "cekim"),
    ("yeterlilik", "(y)Abil", "cekim"),
    ("yetersizlik", "(y)AmA", "cekim"),
    ("tezlik", "(y)Iver", "cekim"),
    ("süreklilik -Adur", "(y)Adur", "cekim"),
    ("süreklilik -Agel", "(y)Agel", "cekim"),
    ("süreklilik -Akal", "(y)Akal", "cekim"),
    ("yaklaşma", "(y)Ayaz", "cekim"),
    ("emir 2. kişi", "(y)In", "cekim"),
    ("emir 2. çoğul", "(y)InIz", "cekim"),
    ("emir 3. çoğul", "sInlAr", "cekim"),
    # --- çatı ---
    ("edilgen -Il", "(I)l", "cati"),
    ("dönüşlü / edilgen -In", "(I)n", "cati"),
    ("işteş", "(I)ş", "cati"),
    ("ettirgen -DIr", "DIr", "cati"),
    ("ettirgen -t", "t", "cati"),
    ("ettirgen -It", "It", "cati"),
    # --- fiilimsiler ---
    ("mastar", "mAk", "fiilimsi"),
    ("isim-fiil -Iş", "(y)Iş", "fiilimsi"),
    ("sıfat-fiil -DIk", "DIk", "fiilimsi"),
    ("sıfat-fiil -An", "(y)An", "fiilimsi"),
    ("zarf-fiil -Ip", "(y)Ip", "fiilimsi"),
    ("zarf-fiil -ArAk", "(y)ArAk", "fiilimsi"),
    ("zarf-fiil -IncA", "(y)IncA", "fiilimsi"),
    ("zarf-fiil -AlI", "(y)AlI", "fiilimsi"),
    ("zarf-fiil -mAdAn", "mAdAn", "fiilimsi"),
    ("zarf-fiil -mAksIzIn", "mAksIzIn", "fiilimsi"),
    ("zarf-fiil -DIkçA", "DIkçA", "fiilimsi"),
    ("zarf-fiil -AsIyA", "(y)AsIyA", "fiilimsi"),
    # --- yapım ---
    ("-lIk", "lIk", "yapim"),
    ("-lI", "lI", "yapim"),
    ("-sIz", "sIz", "yapim"),
    ("-CI", "CI", "yapim"),
    ("-CIk", "CIk", "yapim"),
    ("-CAğIz", "CAğIz", "yapim"),
    ("-DAş", "DAş", "yapim"),
    ("-sAl", "sAl", "yapim"),
    ("-(I)msI", "(I)msI", "yapim"),
    ("-lAş", "lAş", "yapim"),
    ("-lAn", "lAn", "yapim"),
    ("-lA", "lA", "yapim"),
    ("-(I)k", "(I)k", "yapim"),
    ("-(I)m (fiilden isim)", "Im", "yapim"),
    ("-(I)nç", "(I)nç", "yapim"),
    ("-(I)ntI", "(I)ntI", "yapim"),
    ("-GI", "GI", "yapim"),
    ("-GIn", "GIn", "yapim"),
    ("-GAn", "GAn", "yapim"),
    ("-GIç", "GIç", "yapim"),
    ("-(y)IcI", "(y)IcI", "yapim"),
    ("-mAn", "mAn", "yapim"),
    ("-tI", "tI", "yapim"),
    ("-Ak", "Ak", "yapim"),
    ("-Aç", "Aç", "yapim"),
    ("-gil", "gil", "yapim"),
    ("-lAyIn", "lAyIn", "yapim"),
    ("-(ş)Ar (üleştirme)", "(ş)Ar", "yapim"),
    ("-(I)ncI (sıra)", "(I)ncI", "yapim"),
    ("-CAsInA", "CAsInA", "yapim"),
    ("-sAr", "sAr", "yapim"),
    ("-sA (fiil yapma)", "sA", "yapim"),
]

# Uyum durumları: (A değeri, I değeri). Sıra, asıl (kanonik) biçimi belirler: ilk durum "a/ı".
UYUM_DURUMLARI = (("a", "ı"), ("a", "u"), ("e", "i"), ("e", "ü"))
UNSUZ_SECENEKLERI = {"D": ("d", "t"), "C": ("c", "ç"), "G": ("g", "k")}

_PARCA = re.compile(r"\([^)]*\)|.")


def bicim_ciftleri(sablon: str) -> list[tuple[str, str]]:
    """Şablonu ``(biçim, asıl_biçim)`` çiftlerine açar.

    Asıl biçim; aynı şablon ve aynı kaynaştırma seçimiyle, ilk uyum durumunda (a/ı), ilk ünsüz
    seçeneğinde (d, c, g) ve yumuşamasız üretilen biçimdir: ``ler → lar``, ``tan → dan``, ``lığ → lık``.
    """
    secenekler: list[list[str]] = []
    for p in _PARCA.findall(sablon):
        secenekler.append([p[1:-1], ""] if p.startswith("(") else [p])  # kaynaştırmalı biçim önce
    sonuc: list[tuple[str, str]] = []
    for secim in itertools.product(*secenekler):
        ham = "".join(secim)
        if not ham:
            continue
        acik = _unsuz_ac(ham)
        asil = _uyumla(acik[0], UYUM_DURUMLARI[0])
        for durum in UYUM_DURUMLARI:
            for unsuzlu in acik:
                s = _uyumla(unsuzlu, durum)
                for b in (s, _yumusat(s)):
                    if b and (b, asil) not in sonuc:
                        sonuc.append((b, asil))
    return sonuc


def _uyumla(ham: str, durum: tuple[str, str]) -> str:
    """A/I arketiplerini çözer. İlk ünlü kökün son ünlüsüne (``durum``), sonrakiler ekin içinde
    kendinden önceki ünlüye uyar: a/e düz olduğundan ardından gelen I yalnızca ı/i olur (``ları``)."""
    kalin = durum[0] == "a"
    yuvarlak = durum[1] in "uü"
    cikti = []
    for c in ham:
        if c == "A":
            cikti.append("a" if kalin else "e")
            yuvarlak = False
        elif c == "I":
            cikti.append(("u" if yuvarlak else "ı") if kalin else ("ü" if yuvarlak else "i"))
        else:
            cikti.append(c)
            if c in UNLULER:
                kalin, yuvarlak = c in KALIN_UNLULER, c in YUVARLAK_UNLULER
    return "".join(cikti)


def genislet(sablon: str) -> list[str]:
    """Şablonun tüm biçimleri (tekrarsız); ilk eleman asıl biçimdir."""
    sonuc: list[str] = []
    for b, _ in bicim_ciftleri(sablon):
        if b not in sonuc:
            sonuc.append(b)
    return sonuc


def _unsuz_ac(s: str) -> list[str]:
    for harf, secenek in UNSUZ_SECENEKLERI.items():
        if harf in s:
            return [b for alt in secenek for b in _unsuz_ac(s.replace(harf, alt, 1))]
    return [s]


def _yumusat(s: str) -> str | None:
    """Sonu k ile biten çok harfli eklerin ünlüden önceki biçimi: lık → lığ, acak → acağ."""
    if len(s) >= 3 and s.endswith("k") and s not in ("mak", "mek"):
        return s[:-1] + "ğ"
    return None


@dataclass
class EkBilgisi:
    bicim: str
    sablonlar: list[str] = field(default_factory=list)
    adlar: list[str] = field(default_factory=list)
    gruplar: set[str] = field(default_factory=set)
    ana: str = ""  # aynı anlamı taşıyan asıl biçim (ler → lar); belirsizse kendisi


def ek_envanteri() -> dict[str, EkBilgisi]:
    """Tüm ek biçimleri → bilgi. Tek harfli biçimler de listede (tokenizer'da harf olarak kalırlar)."""
    envanter: dict[str, EkBilgisi] = {}
    asillar: dict[str, set[str]] = {}
    for ad, sablon, grup in SABLONLAR:
        for b, asil in bicim_ciftleri(sablon):
            bilgi = envanter.setdefault(b, EkBilgisi(b))
            if sablon not in bilgi.sablonlar:
                bilgi.sablonlar.append(sablon)
                bilgi.adlar.append(ad)
            bilgi.gruplar.add(grup)
            asillar.setdefault(b, set()).add(asil)
    for b, bilgi in envanter.items():
        tek = asillar[b]
        # Farklı asıl biçimlere bağlanan (belirsiz) ve tek harfli biçimler paylaşılmaz.
        bilgi.ana = next(iter(tek)) if len(tek) == 1 and len(b) > 1 else b
    return envanter
