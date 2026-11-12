import contextlib
import io
import unittest

import kos


def calistir(*arg):
    cikti = io.StringIO()
    with contextlib.redirect_stdout(cikti):
        kod = kos.ana(list(arg))
    return kod, cikti.getvalue()


class KosTesti(unittest.TestCase):
    def test_komutlar(self):
        _, cikti = calistir('transkript', '--tohum', '3', '--beceriyle')
        self.assertIn('İDDİA bitti', cikti)
        _, cikti = calistir('karsilastir', '--kosu', '5')
        self.assertIn('| gecme_orani |', cikti)
        _, cikti = calistir('kirmizi-yesil')
        self.assertIn('YEŞİL', cikti)
        _, cikti = calistir('ifade')
        self.assertIn('tarif biçimi', cikti)
        _, cikti = calistir('kanca', '--ortam', 'copilot')
        self.assertIn("alanlar: ['additionalContext']", cikti)
        _, cikti = calistir('kanca', '--alt-ajan')
        self.assertIn('enjeksiyon yok', cikti)


if __name__ == '__main__':
    unittest.main()
