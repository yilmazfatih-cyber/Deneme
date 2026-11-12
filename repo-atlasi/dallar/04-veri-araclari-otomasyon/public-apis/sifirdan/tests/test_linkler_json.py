import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from asama1_ayristir import dosyadan_ayristir
from asama3_linkler import linkleri_bul, linkleri_denetle, tekrarlari_bul
from asama4_json import disa_aktar, json_yaz

ORNEK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ornek', 'README.ornek.md')


class Isleyici(BaseHTTPRequestHandler):
    """Yerel test sunucusu: her yol farklı bir durumu taklit eder."""

    aktif = 0
    en_fazla_aktif = 0
    kilit = threading.Lock()

    def log_message(self, *args):  # test çıktısını kirletme
        pass

    def _yanit(self, kod: int, govde: bytes = b'tamam', basliklar: dict | None = None):
        # send_response_only: otomatik 'Server: BaseHTTP' başlığı eklenmesin
        self.send_response_only(kod)
        basliklar = {'Server': 'yerel-test', **(basliklar or {})}
        for anahtar, deger in basliklar.items():
            self.send_header(anahtar, deger)
        self.send_header('Content-Length', str(len(govde)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(govde)

    def _isle(self):
        yol = self.path
        if yol == '/ok':
            self._yanit(200)
        elif yol == '/yok':
            self._yanit(404, b'yok')
        elif yol == '/yonlendir':
            self._yanit(301, b'', {'Location': '/ok'})
        elif yol == '/head-yok':
            self._yanit(405 if self.command == 'HEAD' else 200)
        elif yol == '/yavas':
            time.sleep(1.5)
            self._yanit(200)
        elif yol == '/korumali':
            self._yanit(403, b'Checking your browser', {'Server': 'cloudflare'})
        elif yol.startswith('/bekle'):
            with Isleyici.kilit:
                Isleyici.aktif += 1
                Isleyici.en_fazla_aktif = max(Isleyici.en_fazla_aktif, Isleyici.aktif)
            time.sleep(0.15)
            with Isleyici.kilit:
                Isleyici.aktif -= 1
            self._yanit(200)
        else:
            self._yanit(500, b'beklenmeyen')

    do_HEAD = _isle
    do_GET = _isle


class LinkTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sunucu = ThreadingHTTPServer(('127.0.0.1', 0), Isleyici)
        cls.sunucu.daemon_threads = True
        cls.taban = f'http://127.0.0.1:{cls.sunucu.server_address[1]}'
        threading.Thread(target=cls.sunucu.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.sunucu.shutdown()
        cls.sunucu.server_close()

    def test_linkleri_bul_ve_tekrarlar(self):
        metin = 'giriş https://x.example.com/a\n## Index\n| [A](https://a.example.com/) | b |\n[B](https://a.example.com) https://c.example.com/x.'
        linkler = linkleri_bul(metin)
        self.assertEqual(linkler, ['https://a.example.com/', 'https://a.example.com', 'https://c.example.com/x'])
        self.assertEqual(tekrarlari_bul(linkler), ['https://a.example.com'])

    def test_durumlar(self):
        yollar = ['/ok', '/yok', '/yonlendir', '/head-yok', '/korumali']
        sonuclar = linkleri_denetle([self.taban + y for y in yollar], es_zamanli=4, zaman_asimi=5)
        durum = {s.url.rsplit('/', 1)[1]: s for s in sonuclar}
        self.assertEqual(durum['ok'].durum, 200)
        self.assertTrue(durum['yok'].kirik)
        self.assertEqual(durum['yonlendir'].durum, 200)  # yönlendirme izlendi
        self.assertEqual(durum['head-yok'].durum, 200)  # HEAD 405 -> GET denendi
        self.assertTrue(durum['korumali'].korumali)
        self.assertFalse(durum['korumali'].kirik)
        self.assertEqual([s.url for s in sonuclar], [self.taban + y for y in yollar])  # sıra korunur

    def test_zaman_asimi(self):
        sonuc = linkleri_denetle([self.taban + '/yavas'], zaman_asimi=0.3)[0]
        self.assertEqual(sonuc.hata, 'zaman aşımı')
        self.assertTrue(sonuc.kirik)

    def test_baglanti_hatasi(self):
        # Kapalı bir porta bağlanmak: sunucu yok
        sonuc = linkleri_denetle(['http://127.0.0.1:9/'], zaman_asimi=1)[0]
        self.assertTrue(sonuc.kirik)
        self.assertIsNotNone(sonuc.hata)

    def test_host_basina_eszamanlilik_siniri(self):
        Isleyici.en_fazla_aktif = 0
        linkler = [f'{self.taban}/bekle{i}' for i in range(8)]
        baslangic = time.monotonic()
        sonuclar = linkleri_denetle(linkler, es_zamanli=8, host_basina=2)
        self.assertTrue(all(s.durum == 200 for s in sonuclar))
        self.assertLessEqual(Isleyici.en_fazla_aktif, 2)
        # 8 istek, aynı anda en fazla 2 -> en az 4 * 0.15 sn
        self.assertGreaterEqual(time.monotonic() - baslangic, 0.55)


class JsonTesti(unittest.TestCase):
    def test_disa_aktar(self):
        veri = disa_aktar(dosyadan_ayristir(ORNEK))
        self.assertEqual(veri['kategori_sayisi'], 3)
        self.assertEqual(veri['kayit_sayisi'], 9)
        kitaplar = veri['kategoriler'][1]
        self.assertEqual(kitaplar['ad'], 'Books')
        ilk = kitaplar['kayitlar'][0]
        self.assertEqual(ilk['auth'], 'OAuth')
        self.assertIs(ilk['https'], True)
        self.assertEqual(veri['kategoriler'][0]['kayitlar'][0]['auth'], None)
        self.assertEqual(sum(veri['istatistik']['auth'].values()), 9)
        self.assertEqual(veri['istatistik']['https'], {'evet': 8, 'hayir': 1})

    def test_json_yaz(self):
        with tempfile.TemporaryDirectory() as dizin:
            yol = os.path.join(dizin, 'apis.json')
            json_yaz(dosyadan_ayristir(ORNEK), yol)
            with open(yol, encoding='utf-8') as dosya:
                self.assertEqual(json.load(dosya)['kayit_sayisi'], 9)


if __name__ == '__main__':
    unittest.main()
