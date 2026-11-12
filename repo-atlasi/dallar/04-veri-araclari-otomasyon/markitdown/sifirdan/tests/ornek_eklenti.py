"""Örnek eklenti: TSV (sekmeyle ayrılmış değerler) dosyalarını tabloya çevirir.

Eklenti sözleşmesi asıl projedekiyle aynı fikirdedir: modül bir
register_converters(md) fonksiyonu sunar ve içinde md.kaydet(...) çağırır.
"""

from asama1_cekirdek import Donusturucu, Sonuc
from asama3_donusturuculer import hucre_kacisi, markdown_tablosu, metni_coz


class TsvDonusturucu(Donusturucu):
    def accepts(self, akis, bilgi, **secenekler):
        return self.uzanti_veya_mime(bilgi, ('.tsv',), ('text/tab-separated-values',))

    def convert(self, akis, bilgi, **secenekler):
        satirlar = [s.split('\t') for s in metni_coz(akis, bilgi).splitlines() if s.strip()]
        return Sonuc(markdown_tablosu([[hucre_kacisi(h) for h in s] for s in satirlar]))


def register_converters(md, **_secenekler):
    md.kaydet(TsvDonusturucu())
