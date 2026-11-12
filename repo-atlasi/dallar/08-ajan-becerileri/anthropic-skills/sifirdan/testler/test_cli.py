import contextlib
import io
import json
import unittest

import beceri

from .yardimci import ORNEKLER, GeciciKlasor


def calistir(*arg):
    cikti = io.StringIO()
    with contextlib.redirect_stdout(cikti):
        kod = beceri.ana([str(a) for a in arg])
    return kod, cikti.getvalue()


class CliTesti(unittest.TestCase):
    def test_dogrula(self):
        kod, cikti = calistir('dogrula', ORNEKLER / 'fatura-ozeti', ORNEKLER / 'toplanti-notu')
        self.assertEqual(kod, 1)
        self.assertIn('fatura-ozeti: GEÇERLİ', cikti)
        self.assertIn('toplanti-notu: GEÇERSİZ', cikti)
        kod, _ = calistir('dogrula', ORNEKLER / 'toplanti-notu', '--profil', 'claude-code')
        self.assertEqual(kod, 0)

    def test_liste_ve_sec(self):
        kod, cikti = calistir('liste', ORNEKLER)
        self.assertEqual(kod, 0)
        self.assertIn('yalnızca /toplanti-notu ile', cikti)
        _, cikti = calistir('sec', 'faturalardaki KDV toplamı', ORNEKLER)
        self.assertTrue(cikti.startswith('fatura-ozeti'))

    def test_yukle_paketle_tara_tetik(self):
        _, cikti = calistir('yukle', 'fatura-ozeti', 'references/kdv-oranlari.md', '--kok', ORNEKLER)
        self.assertIn('references/kdv-oranlari.md', cikti)
        with GeciciKlasor() as kok:
            kod, cikti = calistir('paketle', ORNEKLER / 'commit-mesaji', kok)
            self.assertEqual(kod, 0)
            self.assertTrue((kok / 'commit-mesaji.skill').is_file())
        kod, cikti = calistir('tara', ORNEKLER)
        self.assertEqual(kod, 0)
        kod, cikti = calistir(
            'tetik', ORNEKLER / 'commit-mesaji' / 'evals' / 'tetik-sorgulari.json', 'commit-mesaji', ORNEKLER
        )
        self.assertEqual(kod, 0)
        self.assertIn('en_iyi_aciklama', json.loads(cikti))


if __name__ == '__main__':
    unittest.main()
