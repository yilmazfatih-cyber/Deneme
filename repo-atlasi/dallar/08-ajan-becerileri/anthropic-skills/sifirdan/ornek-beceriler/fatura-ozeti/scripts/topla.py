"""Öğretim örneği: standart girdiden 'tutar' sütunlu CSV okur, toplamı yazar.

Becerilerde betik, modelin bağlamına yüklenmeden çalıştırılabilen kesin işi yapar
(aritmetik, biçim dönüştürme). Bu araç takımı betikleri asla çalıştırmaz; yalnızca listeler.
"""

import csv
import sys
from decimal import Decimal


def topla(satirlar):
    return sum((Decimal(s['tutar'].replace(',', '.')) for s in satirlar), Decimal('0'))


if __name__ == '__main__':
    print(topla(csv.DictReader(sys.stdin)))
