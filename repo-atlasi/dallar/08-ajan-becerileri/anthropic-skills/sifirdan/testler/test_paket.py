import shutil
import stat
import unittest
import zipfile

from beceri_kiti.paket import PaketHatasi, dosyalari_topla, guvenli_ac, paketi_dogrula, paketle

from .yardimci import ORNEKLER, GeciciKlasor, beceri_yaz


def kirli_kopya(kok):
    """Örnek beceriyi pakete girmemesi gereken dosyalarla kirletir."""
    hedef = kok / 'commit-mesaji'
    shutil.copytree(ORNEKLER / 'commit-mesaji', hedef)
    (hedef / '__pycache__').mkdir()
    (hedef / '__pycache__' / 'x.cpython-313.pyc').write_bytes(b'\0')
    (hedef / 'yardim.pyc').write_bytes(b'\0')
    (hedef / '.DS_Store').write_bytes(b'\0')
    (hedef / 'references').mkdir()
    (hedef / 'references' / 'evals').mkdir()
    (hedef / 'references' / 'evals' / 'derin.md').write_text('derindeki evals pakete girer', encoding='utf-8')
    return hedef


class PaketlemeTesti(unittest.TestCase):
    def test_haric_tutma_kurallari(self):
        with GeciciKlasor() as kok:
            dosyalar, atlanan = dosyalari_topla(kirli_kopya(kok))
        adlar = [ad for _, ad in dosyalar]
        self.assertEqual(adlar, ['commit-mesaji/SKILL.md', 'commit-mesaji/references/evals/derin.md'])
        self.assertIn('evals/tetik-sorgulari.json', atlanan)  # yalnızca kökteki evals/ dışarıda
        self.assertEqual(len(atlanan), 4)

    def test_belirlenimci_ve_ozetli(self):
        with GeciciKlasor() as kok:
            kaynak = kirli_kopya(kok)
            zip1, ozet1 = paketle(kaynak, kok / 'c1')
            zip2, _ = paketle(kaynak, kok / 'c2')
            self.assertEqual(zip1.read_bytes(), zip2.read_bytes())
            self.assertEqual(paketi_dogrula(zip1, ozet1), [])
            with zipfile.ZipFile(zip1) as arsiv:
                bilgi = arsiv.getinfo('commit-mesaji/SKILL.md')
                self.assertEqual(bilgi.date_time, (1980, 1, 1, 0, 0, 0))

    def test_degistirilmis_paket_yakalanir(self):
        with GeciciKlasor() as kok:
            zip_yolu, ozet_yolu = paketle(ORNEKLER / 'commit-mesaji', kok)
            with zipfile.ZipFile(zip_yolu) as arsiv:
                icerik = {ad: arsiv.read(ad) for ad in arsiv.namelist()}
            icerik['commit-mesaji/SKILL.md'] += b'\nGizli ek talimat.\n'
            icerik['commit-mesaji/ek.sh'] = b'echo merhaba\n'
            with zipfile.ZipFile(zip_yolu, 'w') as arsiv:
                for ad, veri in icerik.items():
                    arsiv.writestr(ad, veri)
            sorunlar = paketi_dogrula(zip_yolu, ozet_yolu)
        self.assertIn('değişmiş: commit-mesaji/SKILL.md', sorunlar)
        self.assertIn('beklenmeyen dosya: commit-mesaji/ek.sh', sorunlar)
        self.assertIn('paketin tamamının özeti değişmiş', sorunlar)

    def test_gecersiz_beceri_paketlenmez(self):
        with GeciciKlasor() as kok:
            beceri = beceri_yaz(kok, 'Kotu_Ad', 'name: Kotu_Ad\ndescription: x')
            with self.assertRaises(PaketHatasi):
                paketle(beceri, kok / 'cikti')
            self.assertFalse((kok / 'cikti').exists())

    def test_profil_ile_paketleme(self):
        with GeciciKlasor() as kok:
            with self.assertRaises(PaketHatasi):
                paketle(ORNEKLER / 'toplanti-notu', kok)
            zip_yolu, _ = paketle(ORNEKLER / 'toplanti-notu', kok, profil='claude-code')
            self.assertTrue(zip_yolu.is_file())


class GuvenliAcmaTesti(unittest.TestCase):
    def test_temiz_paket_acilir(self):
        with GeciciKlasor() as kok:
            zip_yolu, _ = paketle(ORNEKLER / 'fatura-ozeti', kok / 'paket')
            yazilan = guvenli_ac(zip_yolu, kok / 'kurulum')
            self.assertTrue((kok / 'kurulum' / 'fatura-ozeti' / 'references' / 'kdv-oranlari.md').is_file())
            self.assertEqual(len(yazilan), 3)

    def zip_yaz(self, yol, girdiler):
        with zipfile.ZipFile(yol, 'w') as arsiv:
            for ad, veri, mod in girdiler:
                bilgi = zipfile.ZipInfo(ad)
                bilgi.external_attr = mod << 16
                arsiv.writestr(bilgi, veri)

    def test_tehlikeli_paketler_reddedilir(self):
        durumlar = {
            'zip-slip': [('beceri/SKILL.md', b'x', 0o644), ('beceri/../../disari.txt', b'x', 0o644)],
            'mutlak-yol': [('/etc/kotu', b'x', 0o644)],
            'sembolik': [('beceri/SKILL.md', b'x', 0o644), ('beceri/bag', b'/etc/passwd', stat.S_IFLNK | 0o777)],
            'iki-ust-klasor': [('a/SKILL.md', b'x', 0o644), ('b/SKILL.md', b'x', 0o644)],
        }
        for ad, girdiler in durumlar.items():
            with self.subTest(ad=ad), GeciciKlasor() as kok:
                yol = kok / f'{ad}.skill'
                self.zip_yaz(yol, girdiler)
                with self.assertRaises(PaketHatasi):
                    guvenli_ac(yol, kok / 'hedef')
                self.assertFalse((kok / 'disari.txt').exists())
                self.assertFalse((kok / 'hedef').exists())


if __name__ == '__main__':
    unittest.main()
