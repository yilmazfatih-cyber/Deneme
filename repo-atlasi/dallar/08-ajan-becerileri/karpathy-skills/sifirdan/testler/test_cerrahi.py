import contextlib
import io
import json
import unittest
from pathlib import Path

import cerrahi
from cerrahi import cift_turu, diff_ayristir, eslestir, puanla

ORNEKLER = Path(__file__).resolve().parent.parent / 'ornekler'
IZINLI = ['fatura/kdv.py', 'tests/*']


def diff(yol: str, govde: str) -> str:
    return f'diff --git a/{yol} b/{yol}\n--- a/{yol}\n+++ b/{yol}\n{govde}'


def turler(sonuc):
    return sorted(i['tur'] for i in sonuc['isaretler'])


class AyristirmaTesti(unittest.TestCase):
    def test_git_diff_iki_dosya(self):
        dosyalar = diff_ayristir((ORNEKLER / 'cerrahi.diff').read_text(encoding='utf-8'))
        self.assertEqual([d.yol for d in dosyalar], ['fatura/kdv.py', 'tests/test_kdv.py'])
        parca = dosyalar[0].parcalar[0]
        self.assertEqual((parca.eski_bas, parca.yeni_bas), (5, 5))
        self.assertEqual(sum(1 for t, _ in parca.satirlar if t == '-'), 1)

    def test_duz_diff_ve_cizgili_icerik(self):
        metin = '--- a.sql\n+++ a.sql\n@@ -1,2 +1,2 @@\n--- eski\n+-- yeni\n SELECT 1;\n--- b.txt\n+++ b.txt\n@@ -1 +1 @@\n-x\n+y\n'
        dosyalar = diff_ayristir(metin)
        self.assertEqual([d.yol for d in dosyalar], ['a.sql', 'b.txt'])
        self.assertEqual(dosyalar[0].parcalar[0].satirlar[0], ('-', '-- eski'))

    def test_yeni_silinen_yeniden_adlandirilan_ikili(self):
        metin = (
            'diff --git a/yeni.py b/yeni.py\nnew file mode 100644\n--- /dev/null\n+++ b/yeni.py\n@@ -0,0 +1 @@\n+x = 1\n'
            '\\ No newline at end of file\n'
            'diff --git a/eski.py b/eski.py\ndeleted file mode 100644\n--- a/eski.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-y = 2\n'
            'diff --git a/a.py b/b.py\nsimilarity index 100%\nrename from a.py\nrename to b.py\n'
            'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n'
        )
        dosyalar = diff_ayristir(metin)
        self.assertEqual([d.yol for d in dosyalar], ['yeni.py', 'eski.py', 'b.py', 'logo.png'])
        self.assertIsNone(dosyalar[0].eski_yol)
        self.assertEqual(dosyalar[2].eski_yol, 'a.py')
        self.assertTrue(dosyalar[3].ikili)

    def test_bozuk_parca_basligi(self):
        with self.assertRaises(ValueError):
            diff_ayristir('--- a\n+++ a\n@@ bozuk @@\n')


class CiftTesti(unittest.TestCase):
    def test_kozmetik_turler(self):
        self.assertEqual(cift_turu('x = 1', 'x  =  1'), 'bosluk')
        self.assertEqual(cift_turu("a = 'b'", 'a = "b"'), 'tirnak')
        self.assertEqual(cift_turu('# eski not', '# yeni not'), 'yorum')
        self.assertEqual(cift_turu('return x', 'return x  # açıklama'), 'yorum')
        self.assertEqual(cift_turu('toplam = a + b', 'sonuc = a + b'), 'ad-degisimi')

    def test_gercek_degisiklik_kozmetik_degil(self):
        self.assertIsNone(cift_turu('if x:', 'while x:'))  # anahtar sözcük değişimi davranış değişimidir
        self.assertIsNone(cift_turu('x = 1', 'x = 2'))
        self.assertIsNone(cift_turu('a', 'a'))

    def test_benzerlik_eslemesi(self):
        ciftler, essiz_s, essiz_e = eslestir(['def f(a):', '# not'], ['class Yeni:', 'def f(b):'])
        self.assertEqual(ciftler, [(0, 1)])
        self.assertEqual((essiz_s, essiz_e), ([1], [0]))


class PuanTesti(unittest.TestCase):
    def test_ornekler(self):
        cerrahi_sonuc = puanla(diff_ayristir((ORNEKLER / 'cerrahi.diff').read_text(encoding='utf-8')), IZINLI, 20)
        self.assertEqual((cerrahi_sonuc['puan'], cerrahi_sonuc['karar'], cerrahi_sonuc['isaretler']), (100, 'cerrahi', []))
        tasan = puanla(diff_ayristir((ORNEKLER / 'tasan.diff').read_text(encoding='utf-8')), IZINLI, 20)
        self.assertEqual(tasan['karar'], 'taşkın')
        self.assertEqual(
            sorted(set(turler(tasan))),
            [
                'ad-degisimi',
                'bosluk',
                'buyukluk',
                'kapsam-disi',
                'test-yok',
                'tirnak',
                'yeni-soyutlama',
                'yorum',
                'yorum-eklendi',
                'yorum-silindi',
            ],
        )
        self.assertEqual(turler(tasan).count('yeni-soyutlama'), 3)

    def test_soyutlama_izni(self):
        bir = diff('a.py', '@@ -1 +1,3 @@\n x = 1\n+def yardimci():\n+    return x\n')
        iki = diff('a.py', '@@ -1 +1,5 @@\n x = 1\n+def bir():\n+    return x\n+def iki():\n+    return x\n')
        self.assertEqual(puanla(diff_ayristir(bir) + diff_ayristir(diff('test_a.py', '@@ -1 +1,2 @@\n x\n+y\n')))['puan'], 100)
        sonuc = puanla(diff_ayristir(iki))
        self.assertEqual(sonuc['puan'], 100 - 5 - 5)  # ikinci soyutlama + test yok

    def test_belge_degisikliginde_test_beklenmez(self):
        sonuc = puanla(diff_ayristir(diff('README.md', '@@ -1 +1 @@\n-Eski\n+Yeni\n')))
        self.assertNotIn('test-yok', turler(sonuc))

    def test_kozmetik_ceza_tavani(self):
        govde = '@@ -1,20 +1,20 @@\n' + ''.join(f"-x{i} = 'a'\n" for i in range(20)) + ''.join(f'+x{i} = "a"\n' for i in range(20))
        sonuc = puanla(diff_ayristir(diff('test_a.py', govde)))
        self.assertEqual(turler(sonuc).count('tirnak'), 20)
        self.assertEqual(sonuc['puan'], 100 - cerrahi.KOZMETIK_TAVAN)


class CliTesti(unittest.TestCase):
    def calistir(self, argv, girdi=None):
        cikti = io.StringIO()
        with contextlib.redirect_stdout(cikti):
            kod = cerrahi.ana(argv, io.StringIO(girdi) if girdi is not None else None)
        return kod, cikti.getvalue()

    def test_dosya_ve_json(self):
        kod, cikti = self.calistir([str(ORNEKLER / 'tasan.diff'), '--json', '--butce', '20', '--izinli', 'fatura/kdv.py'])
        self.assertEqual(kod, 1)
        self.assertEqual(json.loads(cikti)['karar'], 'taşkın')

    def test_standart_girdi(self):
        kod, cikti = self.calistir([], (ORNEKLER / 'cerrahi.diff').read_text(encoding='utf-8'))
        self.assertEqual(kod, 0)
        self.assertTrue(cikti.startswith('Puan: 100/100 (cerrahi)'))


if __name__ == '__main__':
    unittest.main()
