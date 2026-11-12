import os
import unittest

from beceri_kiti.yukleyici import BaglamTasmasi, KaynakHatasi, Oturum

from .yardimci import ORNEKLER, GeciciKlasor, beceri_yaz


class DuzeyTesti(unittest.TestCase):
    def test_uc_duzey_gunluge_yazilir(self):
        oturum = Oturum([ORNEKLER])
        self.assertEqual([k.duzey for k in oturum.gunluk], [1])
        govde = oturum.etkinlestir('fatura-ozeti')
        self.assertIn('# Fatura özeti', govde)
        tablo = oturum.kaynak_oku('fatura-ozeti', 'references/kdv-oranlari.md')
        self.assertIn('KDV oran tablosu', tablo)
        betikler = oturum.betikleri_listele('fatura-ozeti')
        self.assertEqual(betikler, ['scripts/topla.py'])
        self.assertEqual([k.duzey for k in oturum.gunluk], [1, 2, 3, 3])
        betik_kaydi = oturum.gunluk[-1]
        self.assertLess(betik_kaydi.karakter, 30)  # betiğin içeriği bağlama girmedi
        self.assertIn('toplam', oturum.rapor())

    def test_ikinci_etkinlestirme_bedava(self):
        oturum = Oturum([ORNEKLER])
        oturum.etkinlestir('commit-mesaji')
        once = oturum.kullanilan
        oturum.etkinlestir('commit-mesaji')
        self.assertEqual(oturum.kullanilan, once)

    def test_bilinmeyen_beceri(self):
        with self.assertRaises(KeyError):
            Oturum([ORNEKLER]).etkinlestir('yok')


class KaynakGuvenligiTesti(unittest.TestCase):
    def test_once_etkinlestirmek_gerekir(self):
        with self.assertRaises(KaynakHatasi):
            Oturum([ORNEKLER]).kaynak_oku('fatura-ozeti', 'references/kdv-oranlari.md')

    def test_klasor_disina_cikilamaz(self):
        with GeciciKlasor() as kok:
            beceri_yaz(kok / 'beceriler', 'ornek', 'name: ornek\ndescription: x')
            (kok / 'gizli.txt').write_text('anahtar', encoding='utf-8')
            oturum = Oturum([kok / 'beceriler'])
            oturum.etkinlestir('ornek')
            with self.assertRaises(KaynakHatasi):
                oturum.kaynak_oku('ornek', '../../gizli.txt')
            with self.assertRaises(KaynakHatasi):
                oturum.kaynak_oku('ornek', 'yok.md')

    @unittest.skipUnless(hasattr(os, 'symlink'), 'sembolik bağlantı desteklenmiyor')
    def test_disari_bakan_sembolik_baglanti_reddedilir(self):
        with GeciciKlasor() as kok:
            beceri = beceri_yaz(kok / 'beceriler', 'ornek', 'name: ornek\ndescription: x')
            (kok / 'gizli.txt').write_text('anahtar', encoding='utf-8')
            os.symlink(kok / 'gizli.txt', beceri / 'masum.md')
            oturum = Oturum([kok / 'beceriler'])
            oturum.etkinlestir('ornek')
            with self.assertRaises(KaynakHatasi):
                oturum.kaynak_oku('ornek', 'masum.md')

    def test_boyut_siniri(self):
        with GeciciKlasor() as kok:
            beceri_yaz(kok, 'ornek', 'name: ornek\ndescription: x', dosyalar={'buyuk.md': 'x' * 1000})
            oturum = Oturum([kok])
            oturum.etkinlestir('ornek')
            with self.assertRaises(KaynakHatasi):
                oturum.kaynak_oku('ornek', 'buyuk.md', sinir=100)


class ButceTesti(unittest.TestCase):
    def test_butce_asilinca_hata(self):
        with GeciciKlasor() as kok:
            beceri_yaz(kok, 'ornek', 'name: ornek\ndescription: x', 'g' * 500)
            oturum = Oturum([kok], butce_karakter=300)
            with self.assertRaises(BaglamTasmasi):
                oturum.etkinlestir('ornek')
            self.assertEqual(oturum.etkin, {})


if __name__ == '__main__':
    unittest.main()
