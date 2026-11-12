import os
import tempfile
import unittest

from asama2_format import FormatHatasi, ayristir, formatlari_birlestir, formatlari_sec, formatlari_sirala
from asama4_sablon import dosya_adini_temizle, guvenli_yol, sablonu_uygula

FORMATLAR = [
    {'format_id': 'v1080', 'ext': 'webm', 'vcodec': 'vp9', 'acodec': 'none', 'height': 1080, 'tbr': 3000},
    {'format_id': 'b240', 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'mp4a', 'height': 240, 'tbr': 400},
    {'format_id': 'a-dusuk', 'ext': 'm4a', 'vcodec': 'none', 'acodec': 'mp4a', 'tbr': 64},
    {'format_id': 'v720', 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'none', 'height': 720, 'tbr': 1500},
    {'format_id': 'a-yuksek', 'ext': 'webm', 'vcodec': 'none', 'acodec': 'opus', 'tbr': 160},
    {'format_id': 'v360', 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'none', 'height': 360, 'tbr': 500},
    {'format_id': 'b480', 'ext': 'mp4', 'vcodec': 'avc1', 'acodec': 'mp4a', 'height': 480, 'tbr': 900},
]


def sec(tanim: str, siralama=()) -> list[str]:
    return [f['format_id'] for f in formatlari_sec(formatlari_sirala(FORMATLAR, siralama), tanim)]


class SiralamaTesti(unittest.TestCase):
    def test_varsayilan_kotuden_iyiye(self):
        sirali = [f['format_id'] for f in formatlari_sirala(FORMATLAR)]
        self.assertEqual(sirali, ['a-dusuk', 'a-yuksek', 'b240', 'v360', 'b480', 'v720', 'v1080'])

    def test_sinirli_ve_ters_alanlar(self):
        # res:480 -> 480 ve altı tercih edilir; en iyi yalnız-video artık v360
        self.assertEqual(sec('bv', ['res:480']), ['v360'])
        self.assertEqual(sec('b', ['+tbr']), ['b240'])  # '+' küçüğü tercih ettirir
        with self.assertRaises(FormatHatasi):
            formatlari_sirala(FORMATLAR, ['uydurma'])


class SecimTesti(unittest.TestCase):
    def test_temel_secimler(self):
        self.assertEqual(sec('b'), ['b480'])
        self.assertEqual(sec('w'), ['b240'])
        self.assertEqual(sec('bv'), ['v1080'])
        self.assertEqual(sec('bv*'), ['v1080'])
        self.assertEqual(sec('ba'), ['a-yuksek'])
        self.assertEqual(sec('wa'), ['a-dusuk'])
        self.assertEqual(sec('bv.2'), ['v720'])
        self.assertEqual(sec('v360'), ['v360'])  # format_id
        self.assertEqual(sec('mp4'), ['b480'])  # uzantı: hem görüntü hem ses
        self.assertEqual(sec('m4a'), ['a-dusuk'])

    def test_birlestirme_ve_yedek(self):
        self.assertEqual(sec('bv+ba'), ['v1080+a-yuksek'])
        secilen = formatlari_sec(formatlari_sirala(FORMATLAR), 'bv[ext=mp4]+ba[ext=m4a]')[0]
        self.assertEqual(secilen['format_id'], 'v720+a-dusuk')
        self.assertEqual(secilen['ext'], 'mp4')
        self.assertEqual(secilen['tbr'], 1564)
        self.assertEqual([f['format_id'] for f in secilen['requested_formats']], ['v720', 'a-dusuk'])
        self.assertEqual(sec('yok/b'), ['b480'])
        self.assertEqual(sec('bv+ba,b'), ['v1080+a-yuksek', 'b480'])

    def test_suzgecler(self):
        self.assertEqual(sec('b[height<=360]'), ['b240'])
        self.assertEqual(sec('bv[height<=720]'), ['v720'])
        self.assertEqual(sec('[height<=480]'), ['b480'])
        self.assertEqual(sec('bv[vcodec^=avc]'), ['v720'])
        self.assertEqual(sec('b[height>2000]'), [])
        # grup + süzgeç; '?' yüksekliği bilinmeyen ses formatlarının geçmesine izin verir
        self.assertEqual(sec('(bv+ba/b)[height<=500]'), ['b480'])
        self.assertEqual(sec('(bv+ba/b)[height<=?500]'), ['v360+a-yuksek'])

    def test_birlesik_format_varsa_ses_atilir(self):
        b480 = next(f for f in FORMATLAR if f['format_id'] == 'b480')
        ses = next(f for f in FORMATLAR if f['format_id'] == 'a-yuksek')
        self.assertIs(formatlari_birlestir([b480, ses]), b480)

    def test_eksik_formatlarda_b_yedegi(self):
        sesler = formatlari_sirala([f for f in FORMATLAR if f['vcodec'] == 'none'])
        self.assertEqual([f['format_id'] for f in formatlari_sec(sesler, 'b')], ['a-yuksek'])

    def test_sozdizimi_hatalari(self):
        for hatali in ('bv+(ba', 'b[height<=720', 'bv+', '(', 'b%'):
            with self.subTest(hatali=hatali), self.assertRaises(FormatHatasi):
                ayristir(hatali)
        with self.assertRaises(FormatHatasi):
            sec('b[height<=abc]')


class SablonTesti(unittest.TestCase):
    BILGI = {
        'id': 'x1',
        'title': 'Merhaba: Dünya/Test?',
        'ext': 'mp4',
        'view_count': 42,
        'formats': [{'height': 720}],
    }

    def test_temel_ve_tam_genislik(self):
        self.assertEqual(sablonu_uygula('%(title)s [%(id)s].%(ext)s', self.BILGI), 'Merhaba： Dünya⧸Test？ [x1].mp4')

    def test_varsayilan_eksik_hassasiyet_yol(self):
        self.assertEqual(sablonu_uygula('%(uploader|Bilinmiyor)s', self.BILGI), 'Bilinmiyor')
        self.assertEqual(sablonu_uygula('%(uploader)s', self.BILGI), 'NA')
        self.assertEqual(sablonu_uygula('%(view_count)05d', self.BILGI), '00042')
        self.assertEqual(sablonu_uygula('%(title).7s', self.BILGI), 'Merhaba')
        self.assertEqual(sablonu_uygula('%(formats.0.height)sp', self.BILGI), '720p')
        self.assertEqual(sablonu_uygula('%%%(id)s', self.BILGI), '%x1')

    def test_kisitli_adlar(self):
        self.assertEqual(dosya_adini_temizle('Çılgın Şehir: İzmir', kisitli=True), 'Cilgin_Sehir_Izmir')
        self.assertEqual(sablonu_uygula('%(title)s.%(ext)s', self.BILGI, kisitli=True), 'Merhaba_Dunya_Test.mp4')
        self.assertEqual(dosya_adini_temizle('..gizli'), 'gizli')

    def test_dizin_disina_cikilamaz(self):
        with tempfile.TemporaryDirectory() as dizin:
            yol = guvenli_yol(dizin, '../../etc/passwd')
            self.assertTrue(yol.startswith(os.path.abspath(dizin) + os.sep))
            alt = guvenli_yol(dizin, sablonu_uygula('%(uploader|kanal)s/%(title)s.%(ext)s', self.BILGI))
            self.assertEqual(os.path.relpath(alt, dizin), os.path.join('kanal', 'Merhaba： Dünya⧸Test？.mp4'))


if __name__ == '__main__':
    unittest.main()
