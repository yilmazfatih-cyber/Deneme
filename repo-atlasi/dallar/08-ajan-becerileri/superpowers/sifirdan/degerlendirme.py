"""Beceri değerlendirme düzeneği: aynı görevi beceriyle ve becerisiz koş, dağılımları karşılaştır.

Esinlendiği yerler (incelenen commit'lerde doğrulandı):
- superpowers tests/claude-code/test-helpers.sh: transkript iddiaları (contains, not_contains,
  count, order) → burada iceriyor, icermiyor, sayi, sira.
- superpowers skills/writing-skills: RED (becerisiz koşu başarısız olmalı) → GREEN (beceriyle
  geçmeli); "kontrol grubu hatayı göstermiyorsa düzeltecek bir şey yoktur"; çoklu tekrar.
- anthropics/skills skill-creator scripts/aggregate_benchmark.py: her yapılandırma için
  ortalama, örneklem standart sapması, min, maks ve iki yapılandırma arasındaki fark (delta).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

import _cekirdek  # noqa: F401  (çekirdeği sys.path'e ekler)
from beceri_kiti.dizin import tr_kucuk_harf
from kum_havuzu import Sonuc, uygula
from sahte_model import VARSAYILAN_GOREV, Gorev, SahteModel

SISTEM_ISTEMI = 'Sen bir kodlama ajanısın. Kullanıcının görevini yerine getir.'


# --- transkript iddiaları (test-helpers.sh'deki assert_* işlevlerinin karşılığı) ---------------
# test-helpers.sh büyük/küçük harf duyarsız 'grep -i' kullanır. Türkçede str.lower() yetmez:
# 'KALDI'.lower() 'kaldi' olur, 'kaldı' değil. Bu yüzden Türkçe kurallı küçültme kullanıyoruz.
def iceriyor(transkript: str, desen: str) -> bool:
    return tr_kucuk_harf(desen) in tr_kucuk_harf(transkript)


def icermiyor(transkript: str, desen: str) -> bool:
    return not iceriyor(transkript, desen)


def sayi(transkript: str, desen: str) -> int:
    return sum(1 for satir in transkript.splitlines() if tr_kucuk_harf(desen) in tr_kucuk_harf(satir))


def sira(transkript: str, once: str, sonra: str) -> bool:
    """'once' deseninin ilk geçtiği satır, 'sonra' deseninin ilk geçtiği satırdan önce mi?"""
    satirlar = [tr_kucuk_harf(s) for s in transkript.splitlines()]
    a = next((i for i, s in enumerate(satirlar) if tr_kucuk_harf(once) in s), None)
    b = next((i for i, s in enumerate(satirlar) if tr_kucuk_harf(sonra) in s), None)
    return a is not None and b is not None and a < b


# --- ölçümler ----------------------------------------------------------------------------------
@dataclass
class Olcum:
    test_once: bool  # test, uygulamadan önce yazıldı
    kirmizi_goruldu: bool  # uygulama yazılmadan önce test koşulup kaldı
    dogrulandi: bool  # son yazımdan sonra testler koşuldu, geçti ve ancak sonra "bitti" denildi
    ilgisiz_dosya: int  # görevin dışında değişen dosya sayısı
    dosya_sayisi: int
    diff_satir: int

    @property
    def gecti(self) -> bool:
        return self.test_once and self.kirmizi_goruldu and self.dogrulandi and self.ilgisiz_dosya == 0


def olc(gorev: Gorev, sonuc: Sonuc) -> Olcum:
    t = sonuc.metin
    satirlar = sonuc.transkript
    son_yazim = max((i for i, s in enumerate(satirlar) if s.startswith('YAZ ')), default=-1)
    iddia = next((i for i, s in enumerate(satirlar) if s.startswith('İDDİA')), len(satirlar))
    dogrulandi = any(
        son_yazim < i < iddia and s.startswith('ÇALIŞTIR') and s.endswith('geçti') for i, s in enumerate(satirlar)
    )
    izinli = {gorev.uygulama, gorev.test}
    return Olcum(
        test_once=sira(t, f'YAZ {gorev.test}', f'YAZ {gorev.uygulama}'),
        kirmizi_goruldu=sira(t, 'ÇALIŞTIR testler -> kaldı', f'YAZ {gorev.uygulama}'),
        dogrulandi=dogrulandi,
        ilgisiz_dosya=sum(1 for yol in sonuc.degisen if yol not in izinli),
        dosya_sayisi=len(sonuc.degisen),
        diff_satir=sonuc.diff_satir(),
    )


def kos(gorev: Gorev, baglam: str, tohum: int) -> tuple[Sonuc, Olcum]:
    sonuc = uygula(gorev, SahteModel(tohum).calis(gorev, baglam))
    return sonuc, olc(gorev, sonuc)


# --- toplama -----------------------------------------------------------------------------------
def istatistik(degerler: list[float]) -> dict:
    """aggregate_benchmark.py calculate_stats ile aynı: n-1 paydalı standart sapma."""
    if not degerler:
        return {'ortalama': 0.0, 'sapma': 0.0, 'min': 0.0, 'maks': 0.0}
    return {
        'ortalama': round(statistics.fmean(degerler), 4),
        'sapma': round(statistics.stdev(degerler), 4) if len(degerler) > 1 else 0.0,
        'min': min(degerler),
        'maks': max(degerler),
    }


METRIKLER = ('gecme_orani', 'test_once', 'dogrulandi', 'ilgisiz_dosya', 'diff_satir')


def yapilandirma_kos(gorev: Gorev, baglam: str, kosu: int, tohum: int) -> dict:
    olcumler = [kos(gorev, baglam, tohum + i)[1] for i in range(kosu)]
    return {
        'gecme_orani': istatistik([float(o.gecti) for o in olcumler]),
        'test_once': istatistik([float(o.test_once) for o in olcumler]),
        'dogrulandi': istatistik([float(o.dogrulandi) for o in olcumler]),
        'ilgisiz_dosya': istatistik([float(o.ilgisiz_dosya) for o in olcumler]),
        'diff_satir': istatistik([float(o.diff_satir) for o in olcumler]),
    }


def karsilastir(beceri_metni: str, gorev: Gorev = VARSAYILAN_GOREV, kosu: int = 20, tohum: int = 0) -> dict:
    """Beceriyle ve becerisiz yapılandırmaları aynı tohumlarla koşar; farkı (delta) hesaplar."""
    ile = yapilandirma_kos(gorev, SISTEM_ISTEMI + '\n\n' + beceri_metni, kosu, tohum)
    siz = yapilandirma_kos(gorev, SISTEM_ISTEMI, kosu, tohum)
    fark = {m: f'{ile[m]["ortalama"] - siz[m]["ortalama"]:+.2f}' for m in METRIKLER}
    return {'beceriyle': ile, 'becerisiz': siz, 'fark': fark, 'kosu': kosu}


def tablo(sonuc: dict) -> str:
    satirlar = ['| Metrik | Beceriyle | Becerisiz | Fark |', '| --- | --- | --- | --- |']
    for m in METRIKLER:
        ile, siz = sonuc['beceriyle'][m], sonuc['becerisiz'][m]
        satirlar.append(
            f'| {m} | {ile["ortalama"]:.2f} ± {ile["sapma"]:.2f} | {siz["ortalama"]:.2f} ± {siz["sapma"]:.2f} '
            f'| {sonuc["fark"][m]} |'
        )
    return '\n'.join(satirlar)


def kirmizi_yesil(
    beceri_metni: str, gorev: Gorev = VARSAYILAN_GOREV, kosu: int = 40, kirmizi_esik: float = 0.5, yesil_esik: float = 0.8
) -> dict:
    """writing-skills'in RED-GREEN döngüsü: önce becerisiz başarısızlığı gör, sonra beceriyle geçişi."""
    sonuc = karsilastir(beceri_metni, gorev, kosu)
    siz = sonuc['becerisiz']['gecme_orani']['ortalama']
    ile = sonuc['beceriyle']['gecme_orani']['ortalama']
    if siz >= kirmizi_esik:
        karar = 'GEREKSİZ: kontrol grubu zaten geçiyor; düzeltecek davranış yok, beceri yazma.'
    elif ile >= yesil_esik:
        karar = 'YEŞİL: beceri davranışı değiştiriyor.'
    else:
        karar = 'KIRMIZI: beceri yetmiyor; ajanın kaçış gerekçelerini oku, metni sıkılaştır, yeniden koş.'
    return {'karar': karar, 'becerisiz': siz, 'beceriyle': ile, 'sonuc': sonuc}


def ifade_karsilastir(varyantlar: dict[str, str], kosu: int = 20, tohum: int = 100) -> dict[str, dict]:
    """Aynı yönergenin farklı yazımlarını (ve boş kontrolü) karşılaştırır: superpowers'ın "micro-test".

    Kontrol (yönergesiz) her zaman eklenir; çıktıda ortalama ile birlikte sapma da vardır, çünkü
    "varyans bir metriktir": bağlayıcı bir yazım, koşuları aynı davranışa toplar.
    """
    adaylar = {'kontrol (yönergesiz)': ''} | varyantlar
    return {
        ad: yapilandirma_kos(VARSAYILAN_GOREV, SISTEM_ISTEMI + '\n' + metin, kosu, tohum)['test_once']
        for ad, metin in adaylar.items()
    }
