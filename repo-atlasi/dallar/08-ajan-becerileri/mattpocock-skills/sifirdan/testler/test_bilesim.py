import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import bilesim
from bilesim import cagrilari_cikar, denetle, donguler, graf, tablo, yukle

ORNEK = Path(__file__).resolve().parent.parent / 'ornek-takim'
KAPALI = "interface:\n  display_name: 'X'\npolicy:\n  allow_implicit_invocation: false\n"
ACIK = "interface:\n  display_name: 'X'\n"


def beceri(kok: Path, ad: str, aciklama: str, govde: str, kullanici: bool = False, openai: str | None = 'oto', ek=None):
    dizin = kok / ad
    (dizin / 'agents').mkdir(parents=True)
    bayrak = 'disable-model-invocation: true\n' if kullanici else ''
    (dizin / 'SKILL.md').write_text(f'---\nname: {ad}\ndescription: {aciklama}\n{bayrak}---\n\n{govde}\n', encoding='utf-8')
    if openai == 'oto':
        openai = KAPALI if kullanici else ACIK
    if openai is not None:
        (dizin / 'agents' / 'openai.yaml').write_text(openai, encoding='utf-8')
    for goreli, icerik in (ek or {}).items():
        (dizin / goreli).parent.mkdir(parents=True, exist_ok=True)
        (dizin / goreli).write_text(icerik, encoding='utf-8')


def kodlar(bulgular):
    return sorted(b.kod for b in bulgular)


class OrnekTakimTesti(unittest.TestCase):
    def test_temiz(self):
        beceriler, bulgular = yukle(ORNEK)
        self.assertEqual(len(beceriler), 8)
        self.assertEqual(bulgular + denetle(beceriler, 'yol-goster'), [])
        self.assertEqual(beceriler['belgeyle-sorgula'].cagrilar, ['sorgula', 'alan-modeli'])

    def test_tablo_ve_graf(self):
        beceriler, _ = yukle(ORNEK)
        metin = tablo(beceriler)
        self.assertLess(metin.index('### Kullanıcı çağırır'), metin.index('### Model çağırır'))
        self.assertIn('| /uygula |', metin)
        self.assertIn('  beni_sorgula --> sorgula', graf(beceriler))
        self.assertIn('beni_sorgula[/"/beni-sorgula"/]', graf(beceriler))


class CagriCikarmaTesti(unittest.TestCase):
    def test_ingilizce_ve_turkce(self):
        self.assertEqual(cagrilari_cikar('Call the Skill tool with "grilling".'), ['grilling'])
        govde = 'Beceri aracını iki kez çağır: "a" ve "b". Sonra Beceri aracını "a" ile yine çağır.'
        self.assertEqual(cagrilari_cikar(govde), ['a', 'b'])
        self.assertEqual(cagrilari_cikar('"tırnaklı" ama çağrı cümlesi değil'), [])


class KuralTesti(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.kok = Path(self._td.name)

    def tearDown(self):
        self._td.cleanup()

    def bul(self, yonlendirici=None):
        beceriler, bulgular = yukle(self.kok)
        return bulgular + denetle(beceriler, yonlendirici)

    def test_kullanici_becerisi_cagrilamaz_ve_hedef_olmali(self):
        beceri(self.kok, 'kur', 'Bir kez hazırlar.', 'Kurar.', kullanici=True)
        beceri(self.kok, 'is', 'İş yapmak istendiğinde kullan.', 'Beceri aracını "kur" ile çağır. Beceri aracını "yok" ile çağır.')
        self.assertEqual(kodlar(self.bul()), ['hedef-yok', 'kullanici-becerisi-cagrildi'])

    def test_on_kosul_kullaniciya_soylenir(self):
        beceri(self.kok, 'kur', 'Bir kez hazırlar.', 'Kurar.', kullanici=True)
        beceri(self.kok, 'is', 'İş istendiğinde kullan.', 'Hazır değilse kullanıcıya /kur çalıştırmasını söyle.')
        beceri(self.kok, 'is2', 'İş istendiğinde kullan.', 'Ardından /kur çalıştır.')
        bulgular = self.bul()
        self.assertEqual([(b.kod, b.beceri, b.duzey) for b in bulgular], [('slash-operatif', 'is2', 'bilgi')])

    def test_yan_dosya_senkronu(self):
        beceri(self.kok, 'a', 'Tek satır.', 'x', kullanici=True, openai=ACIK)
        beceri(self.kok, 'b', 'B istendiğinde kullan.', 'x', openai=KAPALI)
        beceri(self.kok, 'c', 'C istendiğinde kullan.', 'x', openai=None)
        self.assertEqual(kodlar(self.bul()), ['openai-yok', 'senkron-degil', 'senkron-degil'])

    def test_aciklama_yonu(self):
        beceri(self.kok, 'insan', 'Toplantı notu istendiğinde kullan.', 'x', kullanici=True)
        beceri(self.kok, 'model', 'Toplantı notları.', 'x')
        self.assertEqual(kodlar(self.bul()), ['aciklama-kullanici', 'aciklama-model'])

    def test_dongu_bir_kez_raporlanir(self):
        beceri(self.kok, 'a', 'A istendiğinde kullan.', 'Beceri aracını "b" ile çağır.')
        beceri(self.kok, 'b', 'B istendiğinde kullan.', 'Beceri aracını "a" ile çağır.')
        beceriler, _ = yukle(self.kok)
        self.assertEqual(donguler(beceriler), [['a', 'b', 'a']])
        self.assertEqual(kodlar(self.bul()), ['dongu'])

    def test_yonlendirici(self):
        beceri(self.kok, 'kur', 'Bir kez hazırlar.', 'x', kullanici=True)
        beceri(self.kok, 'yaz', 'Yazar.', 'x', kullanici=True)
        govde = 'Önce `/kur`, sonra `/yok-boyle`. Bağlam dolunca `/clear`. Dosyalar .scratch/x/issues/ altında.'
        beceri(self.kok, 'yol', 'Yönlendirir.', govde, kullanici=True)
        bulgular = self.bul('yol')
        self.assertEqual([(b.kod, b.mesaj.split()[0]) for b in bulgular if b.kod.startswith('yon')], [
            ('yonlendirici-eksik', '/yaz'),
            ('yonlendirici-yalan', '/yok-boyle'),
        ])
        # yönlendirici belirtilmeyince 'yol' sıradan bir beceri sayılır: /kur anması bilgi olarak raporlanır
        self.assertEqual(kodlar(self.bul('olmayan')), ['slash-operatif', 'yonlendirici-yok'])

    def test_taze_baglam(self):
        beceri(self.kok, 'a', 'A istendiğinde kullan.', 'Bir alt ajan başlat ve rapor iste.')
        beceri(
            self.kok, 'b', 'B istendiğinde kullan.', 'Bir alt ajan başlat; ayrıntı ek.md içinde.',
            ek={'ek.md': 'Alt ajanı taze bağlamla başlat.'},
        )
        self.assertEqual([(b.kod, b.beceri) for b in self.bul()], [('taze-baglam', 'a')])

    def test_bozuk_onbilgi_ve_cli(self):
        (self.kok / 'bozuk').mkdir()
        (self.kok / 'bozuk' / 'SKILL.md').write_text('---\nname: bozuk\ndescription: a: b\n---\n', encoding='utf-8')
        cikti = io.StringIO()
        with contextlib.redirect_stdout(cikti):
            kod = bilesim.ana(['denetle', str(self.kok)])
        self.assertEqual(kod, 1)
        self.assertIn('onbilgi-bozuk', cikti.getvalue())


if __name__ == '__main__':
    unittest.main()
