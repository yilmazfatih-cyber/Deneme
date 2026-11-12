import unittest

from beceri_kiti.dizin import Secici, belirtecler, beceri_listesi_metni, kesfet, tr_kucuk_harf

from .yardimci import ORNEKLER, GeciciKlasor, beceri_yaz


class KesifTesti(unittest.TestCase):
    def test_ornekler_bulunur(self):
        beceriler, notlar = kesfet([ORNEKLER])
        self.assertEqual(sorted(b.ad for b in beceriler), ['commit-mesaji', 'fatura-ozeti', 'toplanti-notu'])
        self.assertEqual(notlar, [])
        toplanti = next(b for b in beceriler if b.ad == 'toplanti-notu')
        self.assertTrue(toplanti.kullanici_cagirir)

    def test_yalnizca_onbilgi_okunur(self):
        # 1. düzey: gövdeye hiç dokunulmaz. Gövde ne kadar büyük olursa olsun okunan miktar değişmez.
        with GeciciKlasor() as kok:
            beceri_yaz(kok, 'kucuk', 'name: kucuk\ndescription: x', 'kısa')
            beceri_yaz(kok, 'buyuk', 'name: buyuk\ndescription: x', 'çok uzun gövde\n' * 10_000)
            beceriler, _ = kesfet([kok])
        okunan = {b.ad: b.okunan_karakter for b in beceriler}
        self.assertLess(okunan['buyuk'], 40)
        self.assertEqual(okunan['buyuk'], okunan['kucuk'])

    def test_golgeleme_ve_atlama(self):
        with GeciciKlasor() as kok:
            beceri_yaz(kok / 'proje', 'ortak', 'name: ortak\ndescription: proje sürümü')
            beceri_yaz(kok / 'kisisel', 'ortak', 'name: ortak\ndescription: kişisel sürüm')
            beceri_yaz(kok / 'kisisel', 'bozuk', 'name: bozuk\ndescription: iki: nokta')
            beceri_yaz(kok / 'kisisel', 'adsiz', 'description: ad yok')
            beceri_yaz(kok / 'kisisel' / '.gizli', 'saklı', 'name: sakli\ndescription: görünmemeli')
            beceriler, notlar = kesfet([kok / 'proje', kok / 'kisisel', kok / 'yok'])
        self.assertEqual([b.ad for b in beceriler], ['ortak'])
        self.assertEqual(beceriler[0].aciklama, 'proje sürümü')
        self.assertEqual(len(notlar), 4)  # yok kökü, bozuk, adsız, gölgelenen
        self.assertTrue(any(n.startswith('gölgelendi') for n in notlar))

    def test_liste_metni_kullanici_becerisini_gizler(self):
        beceriler, _ = kesfet([ORNEKLER])
        metin = beceri_listesi_metni(beceriler)
        self.assertIn('- fatura-ozeti:', metin)
        self.assertNotIn('toplanti-notu', metin)


class SeciciTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        beceriler, _ = kesfet([ORNEKLER])
        cls.secici = Secici(beceriler)

    def test_turkce_kucuk_harf_ve_kok(self):
        self.assertEqual(tr_kucuk_harf('İSTANBUL IŞIK'), 'istanbul ışık')
        self.assertEqual(belirtecler('Faturaların KDV toplamı'), ['fatur', 'kdv', 'topla'])

    def test_gorevler_dogru_beceriye_gider(self):
        self.assertEqual(self.secici.sec('Bu faturaların KDV toplamını çıkar')[0][0].ad, 'fatura-ozeti')
        self.assertEqual(self.secici.sec('staged değişiklikler için commit mesajı yaz')[0][0].ad, 'commit-mesaji')

    def test_ilgisiz_gorev_secilmez(self):
        self.assertEqual(self.secici.sec('Python ile fibonacci fonksiyonu yaz'), [])

    def test_kullanici_becerisi_yalnizca_acik_cagriyla(self):
        self.assertEqual(self.secici.sec('toplantı dökümünü nota çevir'), [])
        acik = self.secici.sec('/toplanti-notu notlar.txt')
        self.assertEqual(acik[0][0].ad, 'toplanti-notu')
        self.assertEqual(self.secici.sec('/yok-boyle'), [])


if __name__ == '__main__':
    unittest.main()
