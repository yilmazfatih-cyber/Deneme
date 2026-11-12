import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest

from asama1_cikarici import BilgiCikarici, GenelIE, OrnekListeIE, OrnekVideoIE, cikarici_siniflari
from asama5_sonislem import BilgiJsonYazPP, FFmpegSesCikarPP, ffmpeg_var
from asama6_ydl import MiniYDL, YdlHatasi
from tests.sahte_site import SahteSite

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ornek_site() -> SahteSite:
    site = SahteSite()
    site.video_ekle(
        'v1',
        'Boğaz Turu',
        [
            {'id': 'kucuk', 'uzanti': 'mp4', 'veri': b'K' * 3000, 'yukseklik': 240, 'vcodec': 'avc1', 'acodec': 'mp4a'},
            {'id': 'buyuk', 'uzanti': 'mp4', 'veri': b'B' * 9000, 'yukseklik': 480, 'vcodec': 'avc1', 'acodec': 'mp4a'},
            {'id': 'ses', 'uzanti': 'm4a', 'veri': b'S' * 1000, 'vcodec': 'none', 'acodec': 'mp4a'},
        ],
    )
    site.video_ekle(
        'v2', 'Kapadokya', [{'id': 'tek', 'uzanti': 'mp4', 'veri': b'T' * 500, 'vcodec': 'avc1', 'acodec': 'mp4a'}]
    )
    site.listeler['gezi'] = {'baslik': 'Gezi Listesi', 'videolar': ['v1', 'v2']}
    site.dosyalar['klip.mp4'] = b'G' * 700
    return site.baslat()


class CikariciTesti(unittest.TestCase):
    def test_kayit_sirasi_ve_uygunluk(self):
        siniflar = cikarici_siniflari()
        self.assertEqual(siniflar[-1], GenelIE)  # genel çıkarıcı en sonda
        self.assertLess(siniflar.index(OrnekVideoIE), siniflar.index(GenelIE))
        self.assertTrue(OrnekVideoIE.suitable('http://127.0.0.1:8080/izle/abc'))
        self.assertFalse(OrnekVideoIE.suitable('https://example.com/izle/abc'))
        self.assertTrue(OrnekListeIE.suitable('http://localhost/liste/x'))
        self.assertEqual(OrnekVideoIE.ie_key(), 'OrnekVideo')

    def test_yeni_cikarici_tanimlamak_kaydeder(self):
        class DenemeIE(BilgiCikarici):
            _VALID_URL = r'deneme://(?P<id>\d+)'

            def _real_extract(self, url):
                return {'id': self._id_al(url), 'title': 't', 'url': 'http://127.0.0.1/x'}

        self.assertIn(DenemeIE, cikarici_siniflari())
        self.assertEqual(DenemeIE().extract('deneme://42')['id'], '42')
        self.assertNotIn('_VALID_URL_RE', BilgiCikarici.__dict__)  # önbellek alt sınıfta kalır


class YdlTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = ornek_site()

    @classmethod
    def tearDownClass(cls):
        cls.site.durdur()

    def setUp(self):
        self.dizin = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.dizin.cleanup()

    def ydl(self, **params) -> MiniYDL:
        return MiniYDL({'paths': self.dizin.name, **params})

    def dosyalar(self) -> list[str]:
        return sorted(
            os.path.relpath(os.path.join(kok, ad), self.dizin.name)
            for kok, _, adlar in os.walk(self.dizin.name)
            for ad in adlar
        )

    def test_bilgi_cikarma_indirmeden(self):
        bilgi = self.ydl(format='b').extract_info(self.site.taban + '/izle/v1', download=False)
        self.assertEqual(bilgi['title'], 'Boğaz Turu')
        self.assertEqual(bilgi['uploader'], 'Deneme Kanalı')
        self.assertEqual(bilgi['extractor_key'], 'OrnekVideo')
        self.assertEqual([f['format_id'] for f in bilgi['formats']], ['ses', 'kucuk', 'buyuk'])
        self.assertEqual(bilgi['requested_downloads'][0]['format_id'], 'buyuk')
        self.assertEqual(self.dosyalar(), [])

    def test_indirme_sablon_ve_kancalar(self):
        durumlar = []
        ydl = self.ydl(format='w', progress_hooks=(durumlar.append,))
        ydl.extract_info(self.site.taban + '/izle/v1')
        self.assertEqual(self.dosyalar(), ['Boğaz Turu [v1].mp4'])
        with open(os.path.join(self.dizin.name, 'Boğaz Turu [v1].mp4'), 'rb') as dosya:
            self.assertEqual(dosya.read(), b'K' * 3000)
        self.assertEqual(durumlar[-1]['status'], 'finished')

    def test_oynatma_listesi(self):
        ydl = self.ydl(format='b', outtmpl='%(playlist)s/%(playlist_index)02d - %(title)s.%(ext)s')
        sonuc = ydl.extract_info(self.site.taban + '/liste/gezi')
        self.assertEqual(sonuc['_type'], 'playlist')
        self.assertEqual(
            self.dosyalar(),
            [os.path.join('Gezi Listesi', '01 - Boğaz Turu.mp4'), os.path.join('Gezi Listesi', '02 - Kapadokya.mp4')],
        )

    def test_simulasyon_ve_genel_cikarici(self):
        ydl = self.ydl(simulate=True)
        bilgi = ydl.extract_info(self.site.taban + '/genel/klip')
        self.assertEqual((bilgi['id'], bilgi['extractor_key']), ('klip', 'Genel'))
        self.assertEqual(self.dosyalar(), [])
        self.ydl().extract_info(self.site.taban + '/genel/klip')
        self.assertEqual(self.dosyalar(), ['klip kaydı [klip].mp4'])

    def test_bilgi_json_son_islemci(self):
        ydl = self.ydl(format='b')
        ydl.add_post_processor(BilgiJsonYazPP())
        ydl.extract_info(self.site.taban + '/izle/v2')
        with open(os.path.join(self.dizin.name, 'Kapadokya [v2].info.json'), encoding='utf-8') as dosya:
            self.assertEqual(json.load(dosya)['title'], 'Kapadokya')

    def test_hatalar(self):
        with self.assertRaises(YdlHatasi) as baglam:
            self.ydl().extract_info('https://example.com/izle/v1')
        self.assertIn('izinli', str(baglam.exception))
        with self.assertRaises(YdlHatasi) as baglam:
            self.ydl().extract_info(self.site.taban + '/izle/olmayan')
        self.assertIn('HTTP 404', str(baglam.exception))
        with self.assertRaises(YdlHatasi):
            self.ydl(format='b[height>5000]').extract_info(self.site.taban + '/izle/v1')
        with contextlib.redirect_stderr(io.StringIO()) as hata_akisi:
            self.assertEqual(self.ydl().download([self.site.taban + '/izle/olmayan', self.site.taban + '/izle/v2']), 1)
        self.assertIn('HATA:', hata_akisi.getvalue())

    def test_komut_satiri(self):
        sonuc = subprocess.run(
            [sys.executable, os.path.join(KOK, 'cli.py'), self.site.taban + '/izle/v1', '-F', '-q'],
            capture_output=True,
            text=True,
            cwd=KOK,
            check=False,
        )
        self.assertEqual(sonuc.returncode, 0, sonuc.stderr)
        self.assertIn('buyuk', sonuc.stdout)
        self.assertIn('yalnız ses', sonuc.stdout)


@unittest.skipUnless(ffmpeg_var(), 'ffmpeg/ffprobe yok: birleştirme ve ses çıkarma testleri atlandı')
class FfmpegTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gecici = tempfile.TemporaryDirectory()

        def uret(ad, *argumanlar):
            yol = os.path.join(cls.gecici.name, ad)
            komut = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *argumanlar, yol]
            subprocess.run(komut, check=True, capture_output=True)
            with open(yol, 'rb') as dosya:
                return dosya.read()

        resim = ['-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10']
        ses = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1']
        cls.site = SahteSite()
        cls.site.video_ekle(
            'm1',
            'Ses Testi',
            [
                {'id': 'v', 'uzanti': 'mp4', 'veri': uret('v.mp4', *resim, '-c:v', 'mpeg4', '-an'), 'yukseklik': 120}
                | {'vcodec': 'mp4v', 'acodec': 'none', 'tbr': 300},
                {'id': 'a', 'uzanti': 'm4a', 'veri': uret('a.m4a', *ses, '-c:a', 'aac'), 'vcodec': 'none'}
                | {'acodec': 'mp4a', 'tbr': 128},
                {'id': 'av', 'uzanti': 'mp4', 'veri': uret('av.mp4', *resim, *ses, '-c:v', 'mpeg4', '-c:a', 'aac')}
                | {'yukseklik': 120, 'vcodec': 'mp4v', 'acodec': 'mp4a', 'tbr': 200},
            ],
        )
        cls.site.baslat()

    @classmethod
    def tearDownClass(cls):
        cls.site.durdur()
        cls.gecici.cleanup()

    def akislar(self, yol: str) -> list[str]:
        komut = ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', yol]
        return sorted(subprocess.run(komut, capture_output=True, text=True, check=True).stdout.split())

    def test_birlestirme_ve_ses_cikarma(self):
        with tempfile.TemporaryDirectory() as dizin:
            ydl = MiniYDL({'paths': dizin})  # format=None -> ffmpeg var -> 'bv*+ba/b'
            bilgi = ydl.extract_info(self.site.taban + '/izle/m1')
            indirilen = bilgi['requested_downloads'][0]
            self.assertEqual(indirilen['format_id'], 'v+a')
            self.assertEqual(self.akislar(indirilen['filepath']), ['audio', 'video'])
            self.assertEqual(os.listdir(dizin), ['Ses Testi [m1].mp4'])  # parça dosyaları silindi

            ydl2 = MiniYDL({'paths': dizin, 'format': 'b', 'outtmpl': 'tek.%(ext)s'})
            ydl2.add_post_processor(FFmpegSesCikarPP())
            sonuc = ydl2.extract_info(self.site.taban + '/izle/m1')['requested_downloads'][0]
            self.assertEqual(os.path.basename(sonuc['filepath']), 'tek.m4a')
            self.assertEqual(self.akislar(sonuc['filepath']), ['audio'])
            self.assertFalse(os.path.exists(os.path.join(dizin, 'tek.mp4')))  # -k yoksa video silinir


if __name__ == '__main__':
    unittest.main()
