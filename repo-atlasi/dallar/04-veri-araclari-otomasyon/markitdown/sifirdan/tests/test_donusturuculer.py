import os
import subprocess
import sys
import tempfile
import unittest

from asama1_cekirdek import AkisBilgisi, MarkItDownHatasi, MiniMarkItDown
from asama3_donusturuculer import guvenli_xml, html_den_markdown
from tests.yardimci import docx_olustur, zip_olustur

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML = """<!DOCTYPE html>
<html><head><title>Deneme   Sayfası</title><style>p{color:red}</style></head>
<body>
<script>alert('x')</script>
<h1>Başlık &amp; Alt</h1>
<p>Bu <strong>kalın</strong>, bu <em>eğik</em> ve <a href="/yol?a=1">göreli link</a>.
<p>İkinci paragraf<br>yeni satır</p>
<a href="javascript:void(0)">tıkla</a>
<ul><li>bir<li>iki<ul><li>iki-a</li></ul></li></ul>
<ol start="3"><li>üç</li><li>dört</li></ol>
<pre><code class="language-python">print("merhaba")
x = 1 &lt; 2</code></pre>
<blockquote><p>Alıntı</p></blockquote>
<table><thead><tr><th>Ad</th><th>Not</th></tr></thead>
<tbody><tr><td>Ali</td><td>a | b</td></tr><tr><td>Ayşe</td></tr></tbody></table>
<img src="data:image/png;base64,AAAAAAAA" alt="resim">
</body></html>"""


class HtmlTesti(unittest.TestCase):
    def setUp(self):
        self.sonuc = html_den_markdown(HTML, taban_url='https://site.example.com/a/b.html')
        self.md = self.sonuc.markdown

    def test_baslik_ve_temizlik(self):
        self.assertEqual(self.sonuc.baslik, 'Deneme Sayfası')
        self.assertNotIn('alert', self.md)
        self.assertNotIn('color:red', self.md)
        self.assertIn('# Başlık & Alt', self.md)

    def test_satir_ici_ve_linkler(self):
        self.assertIn('Bu **kalın**, bu *eğik* ve [göreli link](https://site.example.com/yol?a=1).', self.md)
        self.assertIn('İkinci paragraf  \nyeni satır', self.md)
        self.assertIn('tıkla', self.md)
        self.assertNotIn('javascript:', self.md)

    def test_listeler(self):
        self.assertIn('- bir\n- iki\n  - iki-a', self.md)
        self.assertIn('3. üç\n4. dört', self.md)

    def test_kod_alinti_tablo_resim(self):
        self.assertIn('```python\nprint("merhaba")\nx = 1 < 2\n```', self.md)
        self.assertIn('> Alıntı', self.md)
        self.assertIn('| Ad | Not |\n| --- | --- |\n| Ali | a \\| b |\n| Ayşe |  |', self.md)
        self.assertIn('![resim](data:image/png;base64,...)', self.md)


class DonusturucuTesti(unittest.TestCase):
    def setUp(self):
        self.md = MiniMarkItDown()

    def test_csv(self):
        veri = '\ufeffŞehir,Nüfus,Not\nİzmir,"4,4 milyon","a|b"\n\nAnkara,5.7\n'.encode('utf-8')
        sonuc = self.md.convert(veri, AkisBilgisi(uzanti='.csv')).markdown
        self.assertEqual(
            sonuc,
            '| Şehir | Nüfus | Not |\n| --- | --- | --- |\n| İzmir | 4,4 milyon | a\\|b |\n| Ankara | 5.7 |  |\n',
        )

    def test_turkce_cp1254_csv(self):
        veri = 'Ad;Şehir\nIşık;Iğdır\n'.replace(';', ',').encode('cp1254')
        self.assertIn('| Işık | Iğdır |', self.md.convert(veri, AkisBilgisi(uzanti='.csv')).markdown)

    def test_json_ve_jsonl(self):
        sonuc = self.md.convert('{"şehir": "Muğla"}'.encode(), AkisBilgisi(uzanti='.json')).markdown
        self.assertEqual(sonuc, '```json\n{\n  "şehir": "Muğla"\n}\n```\n')
        # uzantı yok: içerikten JSON olduğu anlaşılır
        self.assertIn('```json', self.md.convert(b'[1, 2]').markdown)
        jsonl = self.md.convert(b'{"a": 1}\n{"a": 2}\n', AkisBilgisi(uzanti='.jsonl')).markdown
        self.assertIn('"a": 2', jsonl)

    def test_duz_metin(self):
        self.assertEqual(self.md.convert('Merhaba dünya\n'.encode()).markdown, 'Merhaba dünya\n')

    def test_docx(self):
        sonuc = self.md.convert(docx_olustur(), AkisBilgisi(uzanti='.docx'))
        beklenen = (
            '# Çeyrek Raporu\n\n'
            '# Giriş\n\n'
            'Satışlar **yüzde 12** arttı, *beklendiği gibi*.\n\n'
            'Ayrıntı: [tam rapor](https://ornek.example.com/rapor)\n\n'
            '## Öne çıkanlar\n\n'
            '- İstanbul şubesi\n- İzmir şubesi\n  - Karşıyaka ofisi\n\n'
            '| Şehir | Ciro | Not |\n| --- | --- | --- |\n| Ankara | 1.200 | a\\|b |\n| Bursa | 900 |  |\n\n'
            'Son paragraf.\n'
        )
        self.assertEqual(sonuc.markdown, beklenen)
        self.assertEqual(sonuc.baslik, 'Çeyrek Raporu')

    def test_docx_uzantisiz_sihirli_baytlardan(self):
        self.assertIn('# Giriş', self.md.convert(docx_olustur()).markdown)

    def test_docx_stiller_yoksa_kimlige_bakilir(self):
        from tests.yardimci import paragraf

        govde = paragraf('Bölüm', stil='Heading2') + paragraf('Metin')
        self.assertEqual(self.md.convert(docx_olustur(govde, stiller=False)).markdown, '## Bölüm\n\nMetin\n')

    def test_zip_ozyinelemeli(self):
        ic_zip = zip_olustur({'not.txt': 'iç not'.encode()})
        arsiv = zip_olustur(
            {
                'veri/tablo.csv': b'a,b\n1,2\n',
                'rapor.docx': docx_olustur(),
                'ic.zip': ic_zip,
                'resim.png': b'\x89PNG\r\n\x1a\nveri',
            }
        )
        sonuc = self.md.convert(arsiv, AkisBilgisi(uzanti='.zip', dosya_adi='paket.zip')).markdown
        self.assertIn('`paket.zip` zip arşivinin içeriği:', sonuc)
        self.assertIn('## Dosya: veri/tablo.csv\n\n| a | b |', sonuc)
        self.assertIn('## Dosya: rapor.docx\n\n# Çeyrek Raporu', sonuc)
        self.assertIn('## Dosya: not.txt\n\niç not', sonuc)
        self.assertIn('## Dosya: resim.png\n\n_(bu dosya dönüştürülemedi)_', sonuc)

    def test_dtd_reddedilir(self):
        with self.assertRaises(MarkItDownHatasi):
            guvenli_xml(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>')

    def test_yanlis_uzanti_icerikten_kurtarilir(self):
        # .txt adı verilmiş DOCX: önce düz metin dener (ikili veri -> hata), sonra DOCX
        sonuc = self.md.convert(docx_olustur(), AkisBilgisi(uzanti='.txt'))
        self.assertIn('# Giriş', sonuc.markdown)


class CliTesti(unittest.TestCase):
    def calistir(self, *argumanlar, girdi=None):
        return subprocess.run(
            [sys.executable, os.path.join(KOK, 'asama4_cli.py'), *argumanlar],
            input=girdi,
            capture_output=True,
            cwd=KOK,
            check=False,
        )

    def test_dosyadan_ve_dosyaya(self):
        with tempfile.TemporaryDirectory() as dizin:
            girdi = os.path.join(dizin, 'rapor.docx')
            cikti = os.path.join(dizin, 'rapor.md')
            with open(girdi, 'wb') as dosya:
                dosya.write(docx_olustur())
            sonuc = self.calistir(girdi, '-o', cikti)
            self.assertEqual(sonuc.returncode, 0, sonuc.stderr)
            with open(cikti, encoding='utf-8') as dosya:
                self.assertTrue(dosya.read().startswith('# Çeyrek Raporu'))

    def test_stdin_ve_ipucu(self):
        sonuc = self.calistir('-x', 'csv', girdi=b'x,y\n1,2\n')
        self.assertEqual(sonuc.stdout.decode(), '| x | y |\n| --- | --- |\n| 1 | 2 |\n')

    def test_listele_ve_hata(self):
        satirlar = self.calistir('--listele').stdout.decode().splitlines()
        self.assertEqual(satirlar[0].split()[1], 'DocxDonusturucu')
        self.assertEqual(satirlar[-1].split()[1], 'DuzMetinDonusturucu')
        sonuc = self.calistir('-x', '.pdf', girdi=b'%PDF-1.4 ikili')
        self.assertEqual(sonuc.returncode, 1)
        self.assertIn('desteklenmiyor', sonuc.stderr.decode())


if __name__ == '__main__':
    unittest.main()
