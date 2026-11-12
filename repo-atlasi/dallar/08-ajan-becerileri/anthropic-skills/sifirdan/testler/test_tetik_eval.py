import unittest

from beceri_kiti.dizin import kesfet
from beceri_kiti.tetik_eval import (
    SahteYonlendirici,
    Sorgu,
    bol,
    degerlendir,
    en_iyiyi_sec,
    secim_yap,
    sorgulari_yukle,
)

from .yardimci import ORNEKLER

SORGU_DOSYASI = ORNEKLER / 'commit-mesaji' / 'evals' / 'tetik-sorgulari.json'


class BolmeTesti(unittest.TestCase):
    def test_katmanli_bolme(self):
        sorgular = sorgulari_yukle(SORGU_DOSYASI)
        egitim, test = bol(sorgular, 0.4, tohum=42)
        self.assertEqual(len(test), 4)  # her sınıftan int(5 * 0.4) = 2
        self.assertEqual(sum(s.tetiklemeli for s in test), 2)
        self.assertEqual(len(egitim) + len(test), len(sorgular))
        self.assertFalse({s.metin for s in egitim} & {s.metin for s in test})

    def test_kucuk_kumede_en_az_bir(self):
        egitim, test = bol([Sorgu('a', True), Sorgu('b', False)], 0.4)
        self.assertEqual(len(test), 2)
        self.assertEqual(egitim, [])

    def test_ayni_tohum_ayni_bolme(self):
        sorgular = sorgulari_yukle(SORGU_DOSYASI)
        self.assertEqual(bol(sorgular, tohum=1), bol(sorgular, tohum=1))


class DegerlendirmeTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        beceriler, _ = kesfet([ORNEKLER])
        cls.hedef = next(b for b in beceriler if b.ad == 'commit-mesaji')
        cls.rakipler = [b for b in beceriler if b.ad != 'commit-mesaji']

    def test_gecme_kurali(self):
        sorgular = [Sorgu('commit mesajı yaz', True), Sorgu('fatura KDV toplamı', False), Sorgu('hava nasıl', True)]
        sonuc = degerlendir(
            self.hedef, self.hedef.aciklama, sorgular, self.rakipler, kosu=3, yonlendirici=SahteYonlendirici(gurultu=0)
        )
        oranlar = [(s['oran'], s['gecti']) for s in sonuc['sonuclar']]
        self.assertEqual(oranlar, [(1.0, True), (0.0, True), (0.0, False)])
        self.assertEqual((sonuc['gecen'], sonuc['toplam']), (2, 3))

    def test_secim_kurali_test_sonra_egitim_sonra_kisalik(self):
        gecmis = [
            {'aciklama': 'eğitimde parlayan uzun açıklama', '_test': 2, '_egitim': 6},
            {'aciklama': 'testte iyi', '_test': 3, '_egitim': 4},
            {'aciklama': 'testte de iyi ama daha uzun', '_test': 3, '_egitim': 4},
        ]
        self.assertEqual(secim_yap(gecmis)['aciklama'], 'testte iyi')

    def test_secilen_aday_en_yuksek_test_puanli(self):
        sorgular = sorgulari_yukle(SORGU_DOSYASI)
        adaylar = ['Git ile ilgili yardımcı.', self.hedef.aciklama]
        sonuc = en_iyiyi_sec(self.hedef, adaylar, sorgular, self.rakipler)
        en_yuksek = max(int(g['test'].split('/')[0]) for g in sonuc['gecmis'])
        self.assertEqual(sonuc['en_iyi_puan'], f'{en_yuksek}/4')
        self.assertEqual([g['sira'] for g in sonuc['gecmis']], [1, 2])
        self.assertEqual((sonuc['egitim_sayisi'], sonuc['test_sayisi']), (6, 4))

    def test_gurultusuz_sonuc_tekrarlanabilir(self):
        sorgular = sorgulari_yukle(SORGU_DOSYASI)
        a = en_iyiyi_sec(self.hedef, [self.hedef.aciklama], sorgular, self.rakipler, gurultu=0, tohum=3)
        b = en_iyiyi_sec(self.hedef, [self.hedef.aciklama], sorgular, self.rakipler, gurultu=0, tohum=3)
        self.assertEqual(a, b)


if __name__ == '__main__':
    unittest.main()
