"""Senaryolu sahte kodlama modeli: bağlamındaki ifadelere göre davranış olasılıkları değişir.

Gerçek bir LLM yerine bunu kullanıyoruz çünkü testler çevrimdışı ve tekrarlanabilir olmalı.
Model bir görev için eylem listesi (transkript) üretir. Üç davranış var:

- test_once: uygulamadan önce başarısız bir test yazar (TDD),
- dogrula: "bitti" demeden önce testleri çalıştırır (verification-before-completion),
- cerrahi: görevin dışındaki dosyalara dokunmaz (karpathy-skills "Surgical Changes").

Her davranışın bir taban olasılığı vardır. Bağlamda (sistem istemi + yüklenen beceriler) belirli
bir ifade geçerse olasılık yükselir. Bu tablo **uydurmadır**: gerçek modellerin nasıl tepki
verdiğini iddia etmez. Öğrettiği şey, bir becerinin davranışı kesin olarak değil *olasılıkla*
kaydırdığı ve bu yüzden tek koşuya değil, çok koşunun dağılımına bakmak gerektiğidir.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

TABAN = {'test_once': 0.25, 'dogrula': 0.35, 'cerrahi': 0.55}

# (davranış, bağlamda aranan ifade, ifade görülünce olasılık). Aynı davranış için birden çok
# ifade varsa en güçlüsü geçerlidir. Tarif biçimi ("önce ... yaz") yasak biçiminden
# ("... yazma") daha güçlü tutuldu: superpowers writing-skills "Match the Form to the Failure"
# bölümündeki gözlemin oyuncak bir yansıması.
IFADELER = [
    ('test_once', 'önce başarısız bir test yaz', 0.95),
    ('test_once', 'test yazmadan kod yazma', 0.6),
    ('dogrula', 'kanıt göstermeden bitti deme', 0.93),
    ('dogrula', 'testleri çalıştırıp çıktıyı göster', 0.96),
    ('cerrahi', 'yalnızca görevin dosyalarına dokun', 0.94),
]


@dataclass(frozen=True)
class Gorev:
    aciklama: str
    uygulama: str
    test: str
    fonksiyon: str
    yan_dosya: str  # görevle ilgisiz ama modelin "iyileştirmek" isteyebileceği dosya


@dataclass(frozen=True)
class Eylem:
    tur: str  # 'dusun' | 'yaz' | 'calistir' | 'iddia'
    hedef: str = ''
    icerik: str = ''


VARSAYILAN_GOREV = Gorev(
    aciklama='hesap.py içine iki sayıyı toplayan topla(a, b) fonksiyonunu ekle',
    uygulama='hesap.py',
    test='test_hesap.py',
    fonksiyon='topla',
    yan_dosya='yardimci.py',
)


def olasiliklar(baglam: str) -> dict[str, float]:
    """Bağlamdaki ifadelere göre her davranışın olasılığı."""
    kucuk = baglam.replace('I', 'ı').replace('İ', 'i').lower()  # Türkçe kurallı küçültme
    sonuc = dict(TABAN)
    for davranis, ifade, olasilik in IFADELER:
        if ifade in kucuk:
            sonuc[davranis] = max(sonuc[davranis], olasilik)
    return sonuc


class SahteModel:
    def __init__(self, tohum: int = 0):
        self.rastgele = random.Random(tohum)

    def calis(self, gorev: Gorev, baglam: str) -> list[Eylem]:
        p = olasiliklar(baglam)
        test_once = self.rastgele.random() < p['test_once']
        dogrula = self.rastgele.random() < p['dogrula']
        cerrahi = self.rastgele.random() < p['cerrahi']
        sonradan_test = self.rastgele.random() < 0.5

        test_kodu = (
            f'from {gorev.uygulama[:-3]} import {gorev.fonksiyon}\n\n\n'
            f'def test_{gorev.fonksiyon}():\n    assert {gorev.fonksiyon}(2, 3) == 5\n'
        )
        uygulama_kodu = f'def {gorev.fonksiyon}(a, b):\n    return a + b\n'
        eylemler = [Eylem('dusun', icerik=f'Görev: {gorev.aciklama}')]
        if test_once:
            eylemler += [
                Eylem('yaz', gorev.test, test_kodu),
                Eylem('calistir', 'testler'),
                Eylem('yaz', gorev.uygulama, uygulama_kodu),
            ]
        else:
            eylemler.append(Eylem('yaz', gorev.uygulama, uygulama_kodu))
            if sonradan_test:
                eylemler.append(Eylem('yaz', gorev.test, test_kodu))
        if not cerrahi:
            eylemler.append(Eylem('yaz', gorev.yan_dosya, 'def yardim(deger: int) -> int:\n    """Geliştirildi."""\n'))
        if dogrula:
            eylemler.append(Eylem('calistir', 'testler'))
        eylemler.append(Eylem('iddia', icerik='bitti'))
        return eylemler
