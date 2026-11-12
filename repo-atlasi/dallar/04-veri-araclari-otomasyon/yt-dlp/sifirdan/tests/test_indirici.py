import os
import tempfile
import time
import unittest

from asama3_indirici import HttpIndirici, IndirmeHatasi, _content_range
from tests.sahte_site import SahteSite

VERI = bytes(range(256)) * 1200  # 307.200 bayt


class IndiriciTesti(unittest.TestCase):
    def setUp(self):
        self.site = SahteSite().baslat()
        self.dizin = tempfile.TemporaryDirectory()
        self.hedef = os.path.join(self.dizin.name, 'video.mp4')
        self.olaylar = []

    def tearDown(self):
        self.site.durdur()
        self.dizin.cleanup()

    def indirici(self, **secenekler) -> HttpIndirici:
        return HttpIndirici([self.olaylar.append], **secenekler)

    def oku(self) -> bytes:
        with open(self.hedef, 'rb') as dosya:
            return dosya.read()

    def test_content_range(self):
        self.assertEqual(_content_range('bytes 100-199/1000'), (100, 1000))
        self.assertEqual(_content_range('bytes */1000'), (None, 1000))
        self.assertEqual(_content_range(None), (None, None))

    def test_tam_indirme_ve_kancalar(self):
        self.site.dosyalar['a.mp4'] = VERI
        self.indirici().indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertEqual(self.oku(), VERI)
        self.assertFalse(os.path.exists(self.hedef + '.part'))
        self.assertEqual(self.olaylar[0]['status'], 'downloading')
        self.assertEqual(self.olaylar[-1]['status'], 'finished')
        self.assertEqual(self.olaylar[-1]['total_bytes'], len(VERI))
        ilerlemeler = [o['downloaded_bytes'] for o in self.olaylar if o['status'] == 'downloading']
        self.assertEqual(ilerlemeler, sorted(ilerlemeler))

    def test_kopan_baglantida_kaldigi_yerden_devam(self):
        self.site.dosyalar['a.mp4'] = VERI
        self.site.davranis['a.mp4'] = {'kes': 100_000}
        indirici = self.indirici()
        indirici.indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertEqual(self.oku(), VERI)
        self.assertIn(('/medya/a.mp4', 'bytes=100000-'), self.site.istekler)
        self.assertTrue(any('100000. bayttan devam' in m for m in indirici.mesajlar))

    def test_range_desteklemeyen_sunucuda_bastan(self):
        self.site.dosyalar['a.mp4'] = VERI
        self.site.davranis['a.mp4'] = {'kes': 50_000, 'range_yok': True}
        indirici = self.indirici()
        indirici.indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertEqual(self.oku(), VERI)
        self.assertTrue(any('baştan' in m for m in indirici.mesajlar))

    def test_416_parca_zaten_tamamsa(self):
        self.site.dosyalar['a.mp4'] = VERI
        with open(self.hedef + '.part', 'wb') as dosya:
            dosya.write(VERI)
        self.indirici().indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertEqual(self.oku(), VERI)
        self.assertEqual(self.site.istekler[-1], ('/medya/a.mp4', f'bytes={len(VERI)}-'))

    def test_hiz_siniri(self):
        self.site.dosyalar['a.mp4'] = VERI[:100_000]
        baslangic = time.monotonic()
        self.indirici(hiz_siniri=200_000).indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertGreaterEqual(time.monotonic() - baslangic, 0.45)

    def test_404_yeniden_denenmez(self):
        with self.assertRaises(IndirmeHatasi):
            self.indirici().indir(self.site.taban + '/medya/yok.mp4', self.hedef)
        self.assertEqual(len(self.site.istekler), 1)

    def test_vazgecme(self):
        # Her denemede kopan bağlantı: 'kesildi' bayrağını sıfırlayan bir davranış sözlüğü
        class HepKes(dict):
            def get(self, anahtar, varsayilan=None):
                return False if anahtar == 'kesildi' else super().get(anahtar, varsayilan)

        self.site.dosyalar['a.mp4'] = VERI
        self.site.davranis['a.mp4'] = HepKes(kes=10, range_yok=True)
        with self.assertRaises(IndirmeHatasi):
            self.indirici(yeniden_deneme=2).indir(self.site.taban + '/medya/a.mp4', self.hedef)
        self.assertEqual(self.olaylar[-1]['status'], 'error')
        self.assertEqual(len(self.site.istekler), 3)


if __name__ == '__main__':
    unittest.main()
