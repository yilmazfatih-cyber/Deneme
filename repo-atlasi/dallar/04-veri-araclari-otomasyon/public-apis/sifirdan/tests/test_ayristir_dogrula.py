import os
import unittest

from asama1_ayristir import ayristir, dosyadan_ayristir, hucrelere_bol
from asama2_dogrula import belgeyi_denetle, dogrula

ORNEK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ornek', 'README.ornek.md')

GECERLI = """## Index

* [Animals](#animals)
* [Books](#books)

### Animals
API | Description | Auth | HTTPS | CORS |
|---|---|---|---|---|
| [Alpha](https://a.example.com) | First animal | No | Yes | Yes |
| [beta](https://b.example.com) | Second animal | `apiKey` | No | Unknown |
| [Gamma](https://g.example.com) | Third animal | `OAuth` | Yes | No |

### Books
| API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Atlas](https://atlas.example.com) | Book one | No | Yes | Yes |
| [Bible](https://bible.example.com) | Book two | No | Yes | Yes |
| [Codex](https://codex.example.com) | Book three | No | Yes | Yes |
"""


def satir_degistir(metin: str, eski: str, yeni: str) -> str:
    assert eski in metin, eski
    return metin.replace(eski, yeni, 1)


class AyristirmaTesti(unittest.TestCase):
    def test_hucrelere_bol(self):
        self.assertEqual(hucrelere_bol('| a | b |'), [' a ', ' b '])
        self.assertEqual(hucrelere_bol('| a | b | |'), [' a ', ' b ', ' '])

    def test_kategoriler_ve_index(self):
        belge = ayristir(GECERLI)
        self.assertEqual(belge.index, ['Animals', 'Books'])
        self.assertEqual([k.ad for k in belge.kategoriler], ['Animals', 'Books'])
        self.assertEqual(belge.kayit_sayisi, 6)
        kayit = belge.kategori('Animals').kayitlar[1]
        self.assertEqual((kayit.baslik, kayit.url, kayit.auth), ('beta', 'https://b.example.com', '`apiKey`'))
        self.assertEqual(kayit.satir, 9)  # 0 tabanlı

    def test_iki_baslik_yazimi_da_veri_sayilmaz(self):
        # 'API | ...' (borusuz) ve '| API | ...' (borulu) başlıklar kayıt değildir
        belge = ayristir(GECERLI)
        basliklar = [k.baslik for kat in belge.kategoriler for k in kat.kayitlar]
        self.assertNotIn(None, basliklar)

    def test_ornek_dosya(self):
        belge = dosyadan_ayristir(ORNEK)
        self.assertEqual(belge.index, ['Animals', 'Books', 'Weather'])
        self.assertEqual(belge.kayit_sayisi, 9)
        # tum_dosya kipinde sponsor bölümü de "kategori" olur (asıl betiğin davranışı)
        tum = dosyadan_ayristir(ORNEK, tum_dosya=True)
        self.assertEqual(tum.kategoriler[0].ad, 'Sponsor APIs')


class DogrulamaTesti(unittest.TestCase):
    def mesajlar(self, metin: str) -> list[str]:
        return [str(h) for h in dogrula(metin)]

    def test_gecerli_belge(self):
        self.assertEqual(self.mesajlar(GECERLI), [])

    def test_ornek_dosya_temiz_ama_tum_dosya_kipinde_degil(self):
        with open(ORNEK, encoding='utf-8') as dosya:
            metin = dosya.read()
        self.assertEqual(dogrula(metin), [])
        tum = [str(h) for h in dogrula(metin, tum_dosya=True)]
        self.assertTrue(any('Sponsor APIs' in m and 'Index' in m for m in tum), tum)
        self.assertTrue(any('3 sütun' in m for m in tum), tum)
        self.assertTrue(any('`stdio`' in m for m in tum), tum)

    def test_alfabetik_sira(self):
        metin = satir_degistir(GECERLI, '[Alpha](https://a.example.com)', '[Zeta](https://a.example.com)')
        mesajlar = self.mesajlar(metin)
        self.assertEqual(len(mesajlar), 1)
        self.assertIn('"beta" alfabetik sırada değil', mesajlar[0])
        self.assertTrue(mesajlar[0].startswith('(L010)'))

    def test_aciklama_kurallari(self):
        metin = satir_degistir(GECERLI, '| First animal |', '| first animal. |')
        mesajlar = self.mesajlar(metin)
        self.assertTrue(any('ilk harfi büyük' in m for m in mesajlar))
        self.assertTrue(any('"." ile bitmemeli' in m for m in mesajlar))
        uzun = 'A' * 101
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '| Book one |', f'| {uzun} |'))
        self.assertTrue(any('en fazla 100 karakter' in m for m in mesajlar))

    def test_parantezle_bitis_serbest(self):
        self.assertEqual(self.mesajlar(satir_degistir(GECERLI, '| Book one |', '| Book one (beta) |')), [])

    def test_auth_https_cors(self):
        metin = satir_degistir(GECERLI, '| `apiKey` | No | Unknown |', '| apiKey | Maybe | Sometimes |')
        mesajlar = self.mesajlar(metin)
        self.assertTrue(any('ters tırnak' in m for m in mesajlar))
        self.assertTrue(any('"Maybe" geçerli bir HTTPS' in m for m in mesajlar))
        self.assertTrue(any('"Sometimes" geçerli bir CORS' in m for m in mesajlar))

    def test_baslik_api_ile_bitmez_ve_link_bicimi(self):
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '[Gamma](https://g.example.com)', '[Gamma API](https://g.example.com)'))
        self.assertTrue(any('"... API" ile bitmemeli' in m for m in mesajlar))
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '[Gamma](https://g.example.com)', 'Gamma'))
        self.assertTrue(any('[BAŞLIK](BAĞLANTI)' in m for m in mesajlar))

    def test_bosluk_ve_sutun_sayisi(self):
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '| [Atlas](https://atlas.example.com) |', '|  [Atlas](https://atlas.example.com) |'))
        self.assertTrue(any('tam olarak bir boşluk' in m for m in mesajlar))
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '| Book two | No | Yes | Yes |', '| Book two | No |'))
        self.assertTrue(any('3 sütun var' in m for m in mesajlar))

    def test_fazla_sutun_yalnizca_bossa(self):
        self.assertEqual(self.mesajlar(satir_degistir(GECERLI, '| Book two | No | Yes | Yes |', '| Book two | No | Yes | Yes | |')), [])
        mesajlar = self.mesajlar(satir_degistir(GECERLI, '| Book two | No | Yes | Yes |', '| Book two | No | Yes | Yes | x |'))
        self.assertTrue(any('Fazladan sütunlar' in m for m in mesajlar))

    def test_son_kategori_de_en_az_uc_kayit(self):
        # Asıl betik son kategoriyi saymaz; bizim sürüm sayar.
        metin = GECERLI.replace('| [Codex](https://codex.example.com) | Book three | No | Yes | Yes |\n', '')
        mesajlar = self.mesajlar(metin)
        self.assertTrue(any('"Books" kategorisinde en az 3 kayıt' in m for m in mesajlar), mesajlar)

    def test_index_disi_kategori(self):
        metin = GECERLI.replace('* [Books](#books)\n', '')
        mesajlar = self.mesajlar(metin)
        self.assertTrue(any('"Books" kategorisi Index' in m for m in mesajlar))

    def test_hatalar_satira_gore_sirali(self):
        metin = satir_degistir(GECERLI, '| Third animal |', '| third animal |')
        metin = satir_degistir(metin, '| Book one |', '| book one |')
        satirlar = [h.satir for h in belgeyi_denetle(ayristir(metin))]
        self.assertEqual(satirlar, sorted(satirlar))


if __name__ == '__main__':
    unittest.main()
