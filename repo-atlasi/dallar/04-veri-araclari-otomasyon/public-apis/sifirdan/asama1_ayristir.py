"""Aşama 1 — public-apis biçimindeki README'yi kategorilere ve kayıtlara ayırır.

Gerçek README düz Markdown'dır:
  * '## Index' başlığının altında '* [Kategori](#capa)' maddeleri,
  * her kategori için '### Kategori' başlığı,
  * başlığın altında 5 sütunlu tablo: API | Description | Auth | HTTPS | CORS.

Bu modül yalnızca *okur*; kuralları denetlemek Aşama 2'nin işidir. Ayrıştırıcıyı
doğrulayıcıdan ayırmak, aynı ayrıştırmayı JSON dışa aktarımında (Aşama 4) da
kullanmamızı sağlar.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# '[Başlık](https://...)' biçimindeki ilk hücre
BAGLANTI_RE = re.compile(r'^\[(?P<baslik>.+)\]\((?P<url>https?://[^)\s]+)\s*\)$')
# Index bölümündeki '* [Animals](#animals)' maddesi
INDEX_RE = re.compile(r'^\*\s\[(?P<ad>.+?)\]\(#[^)]*\)')
# '|---|', '|:---|', '| --- |' gibi ayırıcı satırlar
AYIRICI_RE = re.compile(r'^\|\s*:?-{3,}')
# Tablo başlık satırının ilk hücresi (her iki yazım da görülüyor: 'API' ve 'Name')
BASLIK_HUCRELERI = {'API', 'Name'}


@dataclass
class Kayit:
    """Tablodaki tek bir API satırı."""

    kategori: str
    satir: int  # 0 tabanlı satır numarası (hata mesajlarında +1 gösterilir)
    hucreler: list[str]  # boşlukları korunmuş ham hücreler
    baslik: str | None = None
    url: str | None = None

    def hucre(self, indeks: int) -> str:
        """Kırpılmış hücre değeri; sütun yoksa boş dize."""
        return self.hucreler[indeks].strip() if indeks < len(self.hucreler) else ''

    @property
    def aciklama(self) -> str:
        return self.hucre(1)

    @property
    def auth(self) -> str:
        return self.hucre(2)

    @property
    def https(self) -> str:
        return self.hucre(3)

    @property
    def cors(self) -> str:
        return self.hucre(4)


@dataclass
class Kategori:
    ad: str
    satir: int
    kayitlar: list[Kayit] = field(default_factory=list)


@dataclass
class Belge:
    index: list[str]  # Index bölümündeki kategori adları (sırasıyla)
    kategoriler: list[Kategori]

    def kategori(self, ad: str) -> Kategori | None:
        return next((k for k in self.kategoriler if k.ad == ad), None)

    @property
    def kayit_sayisi(self) -> int:
        return sum(len(k.kayitlar) for k in self.kategoriler)


def hucrelere_bol(satir: str) -> list[str]:
    """'| a | b |' -> [' a ', ' b ']. Baştaki ve sondaki boru karakteri atılır."""
    parcalar = satir.split('|')
    return parcalar[1:-1] if satir.rstrip().endswith('|') else parcalar[1:]


def tablo_satiri_mi(satir: str) -> bool:
    return satir.startswith('|') and not AYIRICI_RE.match(satir)


def ayristir(metin: str, tum_dosya: bool = False) -> Belge:
    """README metnini Belge nesnesine çevirir.

    tum_dosya=False iken kategoriler yalnızca '## Index' başlığından SONRA aranır.
    Gerçek depodaki format.py tüm '###' başlıklarını kategori sayar; bu yüzden
    README'nin başındaki sponsor bölümü ('### APIs Covered Under ...') o betik
    için de bir "kategori" olur. tum_dosya=True o davranışı taklit eder.
    """
    satirlar = metin.splitlines()
    index: list[str] = []
    kategoriler: list[Kategori] = []
    gecerli: Kategori | None = None
    index_icinde = False
    index_goruldu = tum_dosya

    for no, satir in enumerate(satirlar):
        satir = satir.rstrip()
        if satir.startswith('## '):
            # '## Index' bölümünü aç. Normal kipte başka bir '##' başlığı kategoriyi
            # kapatır; gerçek betik bunu yapmaz ('##' altındaki tabloyu önceki '###'
            # kategorisine yazar), tum_dosya=True o davranışı da taklit eder.
            index_icinde = satir.strip() == '## Index'
            index_goruldu = index_goruldu or index_icinde
            if not tum_dosya:
                gecerli = None
            continue
        if index_icinde:
            eslesme = INDEX_RE.match(satir)
            if eslesme:
                index.append(eslesme.group('ad'))
        if not index_goruldu:
            continue
        if satir.startswith('### '):
            index_icinde = False
            gecerli = Kategori(ad=satir[4:].strip(), satir=no)
            kategoriler.append(gecerli)
            continue
        if gecerli is None or not tablo_satiri_mi(satir):
            continue
        hucreler = hucrelere_bol(satir)
        if not hucreler or hucreler[0].strip() in BASLIK_HUCRELERI:
            continue  # tablo başlığı: veri değil
        kayit = Kayit(kategori=gecerli.ad, satir=no, hucreler=hucreler)
        eslesme = BAGLANTI_RE.match(hucreler[0].strip())
        if eslesme:
            kayit.baslik = eslesme.group('baslik')
            kayit.url = eslesme.group('url')
        gecerli.kayitlar.append(kayit)

    return Belge(index=index, kategoriler=kategoriler)


def dosyadan_ayristir(yol: str, tum_dosya: bool = False) -> Belge:
    with open(yol, encoding='utf-8') as dosya:
        return ayristir(dosya.read(), tum_dosya=tum_dosya)
