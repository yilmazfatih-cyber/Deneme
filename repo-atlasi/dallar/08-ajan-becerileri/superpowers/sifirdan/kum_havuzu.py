"""Kum havuzu: sahte modelin eylemlerini bellekteki bir çalışma alanına uygular ve kayıt tutar.

Gerçek testleri çalıştırmıyoruz; 'testler' komutunun sonucu basit bir kurala göre belirlenir:
test dosyası yoksa 'test yok', uygulamada fonksiyon tanımı yoksa 'kaldı', ikisi de varsa 'geçti'.
Böylece TDD'nin kırmızı (kaldı) → yeşil (geçti) adımı transkriptte görünür.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field

from sahte_model import Eylem, Gorev

BASLANGIC = {
    'hesap.py': '# hesap modülü\n',
    'yardimci.py': 'def yardim(deger):\n    return deger\n',
}


@dataclass
class Sonuc:
    transkript: list[str]
    once: dict[str, str]
    sonra: dict[str, str]
    degisen: list[str] = field(default_factory=list)

    @property
    def metin(self) -> str:
        return '\n'.join(self.transkript)

    def diff_satir(self) -> int:
        toplam = 0
        for yol in self.degisen:
            once = self.once.get(yol, '').splitlines()
            sonra = self.sonra.get(yol, '').splitlines()
            for satir in difflib.unified_diff(once, sonra, lineterm='', n=0):
                if satir.startswith(('+', '-')) and not satir.startswith(('+++', '---')):
                    toplam += 1
        return toplam


def test_sonucu(gorev: Gorev, dosyalar: dict[str, str]) -> str:
    if gorev.test not in dosyalar:
        return 'test yok'
    if f'def {gorev.fonksiyon}(' not in dosyalar.get(gorev.uygulama, ''):
        return 'kaldı'
    return 'geçti'


def uygula(gorev: Gorev, eylemler: list[Eylem], baslangic: dict[str, str] | None = None) -> Sonuc:
    once = dict(BASLANGIC if baslangic is None else baslangic)
    dosyalar = dict(once)
    transkript: list[str] = []
    for eylem in eylemler:
        if eylem.tur == 'dusun':
            transkript.append(f'DÜŞÜN {eylem.icerik}')
        elif eylem.tur == 'yaz':
            dosyalar[eylem.hedef] = eylem.icerik
            transkript.append(f'YAZ {eylem.hedef}')
        elif eylem.tur == 'calistir':
            transkript.append(f'ÇALIŞTIR {eylem.hedef} -> {test_sonucu(gorev, dosyalar)}')
        elif eylem.tur == 'iddia':
            transkript.append(f'İDDİA {eylem.icerik}')
        else:
            raise ValueError(f'Bilinmeyen eylem: {eylem.tur}')
    degisen = sorted(y for y in set(once) | set(dosyalar) if once.get(y) != dosyalar.get(y))
    return Sonuc(transkript=transkript, once=once, sonra=dosyalar, degisen=degisen)
