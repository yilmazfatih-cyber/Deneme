import unittest
from unittest import mock

import sahte_model
from degerlendirme import (
    SISTEM_ISTEMI,
    icermiyor,
    iceriyor,
    ifade_karsilastir,
    istatistik,
    karsilastir,
    kirmizi_yesil,
    kos,
    olc,
    sayi,
    sira,
)
from kos import beceri_metni
from kum_havuzu import uygula
from sahte_model import VARSAYILAN_GOREV, Eylem, SahteModel, olasiliklar

G = VARSAYILAN_GOREV


class IddiaTesti(unittest.TestCase):
    T = 'YAZ test_hesap.py\nÇALIŞTIR testler -> kaldı\nYAZ hesap.py\nÇALIŞTIR testler -> geçti\nİDDİA bitti'

    def test_iceriyor_icermiyor_sayi(self):
        self.assertTrue(iceriyor(self.T, 'TESTLER -> KALDI'))  # Türkçe büyük I -> ı
        self.assertTrue(icermiyor(self.T, 'yardimci.py'))
        self.assertEqual(sayi(self.T, 'ÇALIŞTIR'), 2)

    def test_sira(self):
        self.assertTrue(sira(self.T, 'YAZ test_hesap.py', 'YAZ hesap.py'))
        self.assertFalse(sira(self.T, 'YAZ hesap.py', 'YAZ test_hesap.py'))
        self.assertFalse(sira(self.T, 'yok', 'YAZ hesap.py'))


class ModelVeHavuzTesti(unittest.TestCase):
    def test_ifade_olasiligi_yukseltir(self):
        self.assertEqual(olasiliklar(SISTEM_ISTEMI), sahte_model.TABAN)
        p = olasiliklar('Önce başarısız bir test yaz. Test yazmadan kod yazma.')
        self.assertEqual(p['test_once'], 0.95)  # en güçlü ifade geçerli

    def test_ayni_tohum_ayni_transkript(self):
        a = SahteModel(5).calis(G, SISTEM_ISTEMI)
        b = SahteModel(5).calis(G, SISTEM_ISTEMI)
        self.assertEqual(a, b)

    def test_tdd_transkripti_kirmizi_yesil_gosterir(self):
        eylemler = [
            Eylem('yaz', G.test, 'from hesap import topla\n'),
            Eylem('calistir', 'testler'),
            Eylem('yaz', G.uygulama, 'def topla(a, b):\n    return a + b\n'),
            Eylem('calistir', 'testler'),
            Eylem('iddia', icerik='bitti'),
        ]
        sonuc = uygula(G, eylemler)
        self.assertIn('ÇALIŞTIR testler -> kaldı', sonuc.metin)
        olcum = olc(G, sonuc)
        self.assertTrue(olcum.gecti)
        self.assertEqual(olcum.dosya_sayisi, 2)

    def test_dogrulamasiz_ve_tasan_degisiklik(self):
        eylemler = [
            Eylem('yaz', G.uygulama, 'def topla(a, b):\n    return a + b\n'),
            Eylem('calistir', 'testler'),
            Eylem('yaz', G.yan_dosya, 'değişti\n'),
            Eylem('iddia', icerik='bitti'),
        ]
        olcum = olc(G, uygula(G, eylemler))
        self.assertFalse(olcum.test_once)
        self.assertFalse(olcum.dogrulandi)  # son yazımdan sonra test koşulmadı (ve test de yoktu)
        self.assertEqual(olcum.ilgisiz_dosya, 1)
        self.assertFalse(olcum.gecti)

    def test_bilinmeyen_eylem(self):
        with self.assertRaises(ValueError):
            uygula(G, [Eylem('sil', 'x')])


class KarsilastirmaTesti(unittest.TestCase):
    def test_istatistik_ornekleme_sapmasi(self):
        ist = istatistik([1.0, 0.0, 1.0, 0.0])
        self.assertEqual(ist['ortalama'], 0.5)
        self.assertEqual(ist['sapma'], 0.5774)  # n-1 paydası
        self.assertEqual(istatistik([1.0])['sapma'], 0.0)

    def test_beceri_davranisi_kaydirir(self):
        sonuc = karsilastir(beceri_metni(), kosu=40)
        self.assertGreater(sonuc['beceriyle']['gecme_orani']['ortalama'], 0.7)
        self.assertLess(sonuc['becerisiz']['gecme_orani']['ortalama'], 0.3)
        self.assertTrue(sonuc['fark']['gecme_orani'].startswith('+'))
        self.assertTrue(sonuc['fark']['ilgisiz_dosya'].startswith('-'))

    def test_kirmizi_yesil_kararlari(self):
        self.assertTrue(kirmizi_yesil(beceri_metni())['karar'].startswith('YEŞİL'))
        self.assertTrue(kirmizi_yesil('Test yazmadan kod yazma.')['karar'].startswith('KIRMIZI'))
        iyi_taban = {'test_once': 0.95, 'dogrula': 0.95, 'cerrahi': 0.95}
        with mock.patch.dict(sahte_model.TABAN, iyi_taban):
            self.assertTrue(kirmizi_yesil(beceri_metni())['karar'].startswith('GEREKSİZ'))

    def test_ifade_karsilastirmasi_kontrol_icerir(self):
        sonuc = ifade_karsilastir({'tarif': 'Önce başarısız bir test yaz.', 'yasak': 'Test yazmadan kod yazma.'})
        self.assertEqual(list(sonuc), ['kontrol (yönergesiz)', 'tarif', 'yasak'])
        self.assertGreater(sonuc['tarif']['ortalama'], sonuc['yasak']['ortalama'])
        self.assertGreater(sonuc['yasak']['ortalama'], sonuc['kontrol (yönergesiz)']['ortalama'])

    def test_kos_tek_kosu(self):
        sonuc, olcum = kos(G, SISTEM_ISTEMI, tohum=1)
        self.assertTrue(sonuc.transkript[-1].startswith('İDDİA'))
        self.assertIsInstance(olcum.diff_satir, int)


if __name__ == '__main__':
    unittest.main()
