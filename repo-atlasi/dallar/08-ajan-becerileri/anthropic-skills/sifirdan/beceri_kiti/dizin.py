"""Beceri dizini ve seçici: aşamalı açılımın 1. düzeyi (yalnızca ad + açıklama).

Bir harness açılışta her becerinin yalnızca ön bilgisini okur ve modele kısa bir liste
sunar. Model bir görevin hangi beceriye uyduğuna bu listedeki *açıklamalara* bakarak
karar verir; bu yüzden açıklama, tetiklenmenin asıl mekanizmasıdır (skill-creator SKILL.md).

Burada modelin kararını BM25 tabanlı küçük bir sözcük eşleştiricisiyle taklit ediyoruz.
Gerçek model anlamı anlar, eş anlamlıları yakalar ve basit işlerde beceriye hiç
başvurmayabilir; bizim seçicimiz bunları yapmaz. Amaç mekanizmayı görünür kılmak.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

from .onbilgi import OnbilgiHatasi, ayir, yaklasik_token, yaml_oku

_DURAK_TR = set(
    'acaba ama ancak bana bazı belki ben beni benim bir biri birkaç bu buna bunu bunun da daha de defa diye '
    'en gibi hem hep her hiç için ile ise kadar ki kim mi mı mu mü nasıl ne neden o olan olarak on ona onu '
    'sen siz şey şu tüm ve veya ya yani yine zaten'.split()
)
_DURAK_EN = set(
    'a an and are as at be by for from has have i if in into is it its me my of on or our so that the their '
    'them then there these this those to use used uses using was we when where which while who will with '
    'you your user users wants want skill skills'.split()
)
DURAK_SOZCUKLERI = _DURAK_TR | _DURAK_EN
_SOZCUK = re.compile(r'[0-9a-zçğıöşü]+')


def tr_kucuk_harf(metin: str) -> str:
    """Türkçe kurallarla küçük harf: 'I' -> 'ı', 'İ' -> 'i' (str.lower() bunu yanlış yapar)."""
    return metin.replace('I', 'ı').replace('İ', 'i').lower()


def kok(sozcuk: str) -> str:
    """Kaba kök: birkaç İngilizce eki at, sonra ilk 5 harfe kırp.

    Türkçe eklemeli bir dildir ('testler', 'testleri', 'testlerin'); ilk 5 harfe kırpmak bu
    biçimleri aynı köke toplar. Hatalıdır ama bir oyuncak seçici için yeterlidir.
    """
    for ek in ('ing', 'ed', 'es', 's'):
        if len(sozcuk) > len(ek) + 3 and sozcuk.endswith(ek):
            sozcuk = sozcuk[: -len(ek)]
            break
    return sozcuk[:5]


def belirtecler(metin: str) -> list[str]:
    """Metni seçicinin karşılaştırdığı köklere böler (durak sözcükler atılır)."""
    return [kok(s) for s in _SOZCUK.findall(tr_kucuk_harf(metin)) if s not in DURAK_SOZCUKLERI and len(s) > 1]


@dataclass
class BeceriBilgisi:
    ad: str
    aciklama: str
    yol: Path  # SKILL.md yolu
    kok_dizin: Path
    kullanici_cagirir: bool  # disable-model-invocation: true ise yalnızca insan çağırabilir
    okunan_karakter: int  # dizin oluşturulurken bu beceriden okunan karakter (yalnızca ön bilgi)

    @property
    def dizin(self) -> Path:
        return self.yol.parent


def onbilgiyi_oku(skill_md: Path) -> tuple[dict, int]:
    """Dosyayı yalnızca kapanış '---' satırına kadar okur; gövdeye hiç dokunmaz.

    Dönen ikinci değer okunan karakter sayısıdır: 1. düzeyin bağlam maliyeti budur.
    """
    satirlar: list[str] = []
    with skill_md.open(encoding='utf-8', errors='replace') as dosya:
        for sira, satir in enumerate(dosya):
            satirlar.append(satir)
            if sira > 0 and satir.rstrip() == '---':
                break
            if sira == 0 and satir.lstrip('\ufeff').rstrip() != '---':
                raise OnbilgiHatasi('Ön bilgi yok: dosya "---" satırıyla başlamalı', 1)
    metin = ''.join(satirlar)
    ham, _, _ = ayir(metin)
    if ham is None:
        raise OnbilgiHatasi('Ön bilgi yok', 1)
    return yaml_oku(ham, ilk_satir=2), len(metin)


def kesfet(kokler: list[str | Path]) -> tuple[list[BeceriBilgisi], list[str]]:
    """Kök klasörlerde SKILL.md dosyalarını bulur.

    Aynı ad iki kökte varsa ilk kök kazanır, sonrakiler 'gölgelenir'. Gerçek harness'lerde
    kişisel, proje ve eklenti becerilerinin öncelik sırası ürüne göre değişir (doğrulanmadı);
    burada sıra, kökleri verdiğin sıradır. Okunamayan beceriler atlanır ve nedeni raporlanır.
    """
    bulunan: dict[str, BeceriBilgisi] = {}
    notlar: list[str] = []
    for kok_dizin in map(Path, kokler):
        if not kok_dizin.is_dir():
            notlar.append(f'kök yok: {kok_dizin}')
            continue
        for skill_md in sorted(kok_dizin.rglob('SKILL.md')):
            goreli = skill_md.relative_to(kok_dizin).parts
            if any(p.startswith('.') or p == 'node_modules' for p in goreli[:-1]):
                continue
            try:
                veri, okunan = onbilgiyi_oku(skill_md)
            except OnbilgiHatasi as hata:
                notlar.append(f'atlandı: {skill_md} ({hata})')
                continue
            ad, aciklama = veri.get('name'), veri.get('description')
            if not isinstance(ad, str) or not isinstance(aciklama, str):
                notlar.append(f'atlandı: {skill_md} (name/description eksik)')
                continue
            if ad in bulunan:
                notlar.append(f'gölgelendi: {skill_md} ("{ad}" zaten {bulunan[ad].yol} içinde)')
                continue
            bulunan[ad] = BeceriBilgisi(
                ad=ad,
                aciklama=' '.join(aciklama.split()),
                yol=skill_md,
                kok_dizin=kok_dizin,
                kullanici_cagirir=veri.get('disable-model-invocation') is True,
                okunan_karakter=okunan,
            )
    return list(bulunan.values()), notlar


def beceri_listesi_metni(beceriler: list[BeceriBilgisi]) -> str:
    """Modele her turda gösterilen kısa liste. Biçim bizim; gerçek harness'in iç biçimi farklıdır."""
    satirlar = ['<kullanilabilir_beceriler>']
    for b in beceriler:
        if b.kullanici_cagirir:
            continue  # model bunları göremez; yalnızca insan /ad ile çağırır
        satirlar.append(f'- {b.ad}: {b.aciklama}')
    satirlar.append('</kullanilabilir_beceriler>')
    return '\n'.join(satirlar)


def liste_maliyeti(beceriler: list[BeceriBilgisi]) -> int:
    """1. düzeyin yaklaşık token maliyeti: her oturumda, beceri kullanılmasa bile ödenir."""
    return yaklasik_token(beceri_listesi_metni(beceriler))


class Secici:
    """Görev metnini beceri açıklamalarıyla BM25 puanına göre eşleştirir."""

    def __init__(self, beceriler: list[BeceriBilgisi], k1: float = 1.5, b: float = 0.75):
        self.beceriler = beceriler
        self.k1 = k1
        self.b = b
        self.belgeler = {x.ad: belirtecler(x.ad.replace('-', ' ') + ' ' + x.aciklama) for x in beceriler}
        sayi = max(len(self.belgeler), 1)
        self.ort_uzunluk = sum(len(v) for v in self.belgeler.values()) / sayi or 1.0
        frekans: dict[str, int] = {}
        for belge in self.belgeler.values():
            for terim in set(belge):
                frekans[terim] = frekans.get(terim, 0) + 1
        self.idf = {t: math.log(1 + (sayi - f + 0.5) / (f + 0.5)) for t, f in frekans.items()}

    def puan(self, gorev: str, ad: str, belge: list[str] | None = None) -> float:
        belge = self.belgeler[ad] if belge is None else belge
        toplam = 0.0
        for terim in set(belirtecler(gorev)):
            tf = belge.count(terim)
            if tf == 0:
                continue
            payda = tf + self.k1 * (1 - self.b + self.b * len(belge) / self.ort_uzunluk)
            toplam += self.idf.get(terim, math.log(2)) * tf * (self.k1 + 1) / payda
        return toplam

    def sec(self, gorev: str, k: int = 3, esik: float = 1.0) -> list[tuple[BeceriBilgisi, float]]:
        """Göreve uyan becerileri puan sırasıyla döndürür.

        '/ad ...' ile başlayan görev açık çağrıdır: kullanıcı-çağırır beceriler de dahil
        doğrudan o beceri seçilir. Aksi halde kullanıcı-çağırır beceriler modele görünmez.
        """
        acik = re.match(r'^/([a-z0-9-]+)\b', gorev.strip())
        if acik:
            for beceri in self.beceriler:
                if beceri.ad == acik.group(1):
                    return [(beceri, math.inf)]
            return []
        adaylar = [(b, self.puan(gorev, b.ad)) for b in self.beceriler if not b.kullanici_cagirir]
        adaylar = [(b, p) for b, p in adaylar if p >= esik]
        adaylar.sort(key=lambda x: (-x[1], x[0].ad))
        return adaylar[:k]
