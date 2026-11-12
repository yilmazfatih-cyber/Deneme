"""Aşama 2 — biçim doğrulayıcı.

Gerçek depoda bu iş scripts/validate/format.py'dedir ve CI her push/PR'da onu
çalıştırır. Kurallar CONTRIBUTING.md'den gelir; burada aynı kuralları sıfırdan,
okunabilir küçük fonksiyonlar olarak yazıyoruz ve iki boşluğu kapatıyoruz:
  1. Son kategorinin "en az 3 kayıt" kuralı da denetlenir (asıl betik, sayımı bir
     sonraki '###' başlığında yaptığı için son kategoriyi hiç denetlemez).
  2. Fazladan sütunlar yalnızca BOŞ ise kabul edilir (asıl betik '>= 5' der).
"""

from __future__ import annotations

import string
from dataclasses import dataclass

from asama1_ayristir import Belge, Kategori, Kayit, ayristir

AUTH_DEGERLERI = ('apiKey', 'OAuth', 'X-Mashape-Key', 'User-Agent', 'No')
HTTPS_DEGERLERI = ('Yes', 'No')
CORS_DEGERLERI = ('Yes', 'No', 'Unknown')
SUTUN_SAYISI = 5
EN_AZ_KAYIT = 3
EN_UZUN_ACIKLAMA = 100
# Asıl betik de açıklamanın sonunda ')' karakterine izin verir.
YASAK_SON_KARAKTER = set(string.punctuation) - set('()')


@dataclass(frozen=True)
class Hata:
    satir: int  # 0 tabanlı
    mesaj: str

    def __str__(self) -> str:
        # Asıl betikle aynı biçim: (L042) mesaj
        return f'(L{self.satir + 1:03d}) {self.mesaj}'


def basligi_denetle(kayit: Kayit) -> list[Hata]:
    if kayit.baslik is None:
        return [Hata(kayit.satir, 'Başlık "[BAŞLIK](BAĞLANTI)" biçiminde olmalı')]
    if kayit.baslik.upper().endswith(' API'):
        return [Hata(kayit.satir, 'Başlık "... API" ile bitmemeli; listedeki her şey zaten bir API')]
    return []


def aciklamayi_denetle(kayit: Kayit) -> list[Hata]:
    aciklama = kayit.aciklama
    if not aciklama:
        return [Hata(kayit.satir, 'Açıklama boş olamaz')]
    hatalar = []
    if aciklama[0].upper() != aciklama[0]:
        hatalar.append(Hata(kayit.satir, 'Açıklamanın ilk harfi büyük olmalı'))
    if aciklama[-1] in YASAK_SON_KARAKTER:
        hatalar.append(Hata(kayit.satir, f'Açıklama "{aciklama[-1]}" ile bitmemeli'))
    if len(aciklama) > EN_UZUN_ACIKLAMA:
        hatalar.append(
            Hata(kayit.satir, f'Açıklama en fazla {EN_UZUN_ACIKLAMA} karakter olmalı (şu an {len(aciklama)})')
        )
    return hatalar


def secenekleri_denetle(kayit: Kayit) -> list[Hata]:
    hatalar = []
    auth = kayit.auth
    if auth != 'No' and not (auth.startswith('`') and auth.endswith('`')):
        hatalar.append(Hata(kayit.satir, 'Auth değeri `ters tırnak` içinde yazılmalı'))
    if auth.strip('`') not in AUTH_DEGERLERI:
        hatalar.append(Hata(kayit.satir, f'"{auth}" geçerli bir Auth değeri değil'))
    if kayit.https not in HTTPS_DEGERLERI:
        hatalar.append(Hata(kayit.satir, f'"{kayit.https}" geçerli bir HTTPS değeri değil'))
    if kayit.cors not in CORS_DEGERLERI:
        hatalar.append(Hata(kayit.satir, f'"{kayit.cors}" geçerli bir CORS değeri değil'))
    return hatalar


def kaydi_denetle(kayit: Kayit) -> list[Hata]:
    if len(kayit.hucreler) < SUTUN_SAYISI:
        return [Hata(kayit.satir, f'Kayıtta {len(kayit.hucreler)} sütun var, {SUTUN_SAYISI} gerekli')]
    hatalar = []
    fazlalar = kayit.hucreler[SUTUN_SAYISI:]
    if any(h.strip() for h in fazlalar):
        hatalar.append(Hata(kayit.satir, 'Fazladan sütunlar yalnızca boş olabilir'))
    for hucre in kayit.hucreler[:SUTUN_SAYISI]:
        bas = len(hucre) - len(hucre.lstrip(' '))
        son = len(hucre) - len(hucre.rstrip(' '))
        if bas != 1 or son != 1:
            hatalar.append(Hata(kayit.satir, 'Her hücre tam olarak bir boşlukla başlayıp bitmeli'))
            break
    return hatalar + basligi_denetle(kayit) + aciklamayi_denetle(kayit) + secenekleri_denetle(kayit)


def kategoriyi_denetle(kategori: Kategori, index: list[str]) -> list[Hata]:
    hatalar = []
    if kategori.ad not in index:
        hatalar.append(Hata(kategori.satir, f'"{kategori.ad}" kategorisi Index bölümünde yok'))
    if len(kategori.kayitlar) < EN_AZ_KAYIT:
        hatalar.append(
            Hata(
                kategori.satir,
                f'"{kategori.ad}" kategorisinde en az {EN_AZ_KAYIT} kayıt olmalı (şu an {len(kategori.kayitlar)})',
            )
        )
    # Alfabetik sıra: asıl betik başlıkları .upper() ile karşılaştırır. Biz casefold()
    # kullanıyor ve sırayı bozan İLK satırı gösteriyoruz (daha kolay düzeltilir).
    onceki: Kayit | None = None
    for kayit in kategori.kayitlar:
        if kayit.baslik is None:
            continue
        if onceki is not None and kayit.baslik.casefold() < onceki.baslik.casefold():
            hatalar.append(
                Hata(kayit.satir, f'"{kayit.baslik}" alfabetik sırada değil ("{onceki.baslik}" kaydından sonra geliyor)')
            )
            break
        onceki = kayit
    return hatalar


def belgeyi_denetle(belge: Belge) -> list[Hata]:
    hatalar: list[Hata] = []
    for kategori in belge.kategoriler:
        hatalar.extend(kategoriyi_denetle(kategori, belge.index))
        for kayit in kategori.kayitlar:
            hatalar.extend(kaydi_denetle(kayit))
    return sorted(hatalar, key=lambda h: h.satir)


def dogrula(metin: str, tum_dosya: bool = False) -> list[Hata]:
    return belgeyi_denetle(ayristir(metin, tum_dosya=tum_dosya))
