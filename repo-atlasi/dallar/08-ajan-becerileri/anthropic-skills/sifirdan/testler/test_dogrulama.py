import unittest

from beceri_kiti.dogrulama import dogrula, kaynak_referanslari, satir_sayisi

from .yardimci import ORNEKLER, GeciciKlasor, beceri_yaz

TEMEL = 'name: ornek\ndescription: Örnek görevleri yapar. Kullanıcı örnek istediğinde kullan.'


class OrnekBecerilerTesti(unittest.TestCase):
    def test_ornekler_spec_profilinde_gecerli(self):
        for ad in ('fatura-ozeti', 'commit-mesaji'):
            rapor = dogrula(ORNEKLER / ad)
            with self.subTest(ad=ad):
                self.assertTrue(rapor.gecerli, [str(b) for b in rapor.bulgular])
                self.assertEqual(rapor.kodlar('uyari'), [])

    def test_kullanici_cagirir_beceri_profile_gore(self):
        # disable-model-invocation ve argument-hint Claude Code eklentisidir, temel belirtimde yoktur
        spec = dogrula(ORNEKLER / 'toplanti-notu', 'spec')
        claude = dogrula(ORNEKLER / 'toplanti-notu', 'claude-code')
        self.assertFalse(spec.gecerli)
        self.assertEqual(spec.kodlar('hata'), ['bilinmeyen-alan', 'bilinmeyen-alan'])
        self.assertTrue(claude.gecerli)
        self.assertNotIn('aciklama-ne-zaman', claude.kodlar())  # insan çağırır: tetik cümlesi gerekmez


class ZorunluAlanTesti(unittest.TestCase):
    def kontrol(self, onbilgi: str, beklenen: str, ad: str = 'ornek', profil: str = 'spec'):
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, ad, onbilgi), profil)
        self.assertIn(beklenen, rapor.kodlar(), [str(b) for b in rapor.bulgular])
        return rapor

    def test_skill_md_yok(self):
        with GeciciKlasor() as kok:
            (kok / 'bos').mkdir()
            self.assertEqual(dogrula(kok / 'bos').kodlar(), ['skill-md-yok'])

    def test_onbilgi_yok_ve_bozuk(self):
        with GeciciKlasor() as kok:
            (kok / 'a').mkdir()
            (kok / 'a' / 'SKILL.md').write_text('# başlık yok\n', encoding='utf-8')
            self.assertEqual(dogrula(kok / 'a').kodlar(), ['onbilgi-yok'])
        rapor = self.kontrol('name: ornek\ndescription: Bozuk: değer', 'onbilgi-bozuk')
        self.assertIn('SKILL.md:3', rapor.bulgular[0].yer)

    def test_eksik_alanlar(self):
        self.kontrol('description: x', 'ad-eksik')
        self.kontrol('name: ornek', 'aciklama-eksik')

    def test_ad_kurallari(self):
        self.kontrol('name: Ornek\ndescription: x', 'ad-bicimi', ad='Ornek')
        self.kontrol('name: -ornek\ndescription: x', 'ad-tire', ad='-ornek')
        self.kontrol('name: or--nek\ndescription: x', 'ad-tire', ad='or--nek')
        uzun = 'a' * 65
        self.kontrol(f'name: {uzun}\ndescription: x', 'ad-uzun', ad=uzun)
        self.kontrol('name: 123\ndescription: x', 'ad-tipi')

    def test_aciklama_kurallari(self):
        self.kontrol('name: ornek\ndescription: "<b>kalın</b>"', 'aciklama-acili-parantez')
        self.kontrol('name: ornek\ndescription: ' + 'x' * 1025, 'aciklama-uzun')
        self.kontrol('name: ornek\ndescription: [a, b]', 'aciklama-tipi')

    def test_sinirda_gecer(self):
        with GeciciKlasor() as kok:
            ad = 'a' * 64
            rapor = dogrula(beceri_yaz(kok, ad, f'name: {ad}\ndescription: "{"y" * 1024}"'))
        self.assertTrue(rapor.gecerli)

    def test_bilinmeyen_alan_ve_codex_profili(self):
        self.kontrol(TEMEL + '\nmodel: buyuk', 'bilinmeyen-alan')
        rapor = self.kontrol(TEMEL + '\ncompatibility: Python 3', 'bilinmeyen-alan', profil='codex-kopya')
        self.assertFalse(rapor.gecerli)

    def test_uyumluluk_ve_tipler(self):
        self.kontrol(TEMEL + '\ncompatibility: "' + 'z' * 501 + '"', 'uyumluluk-uzun')
        self.kontrol(TEMEL + '\nmetadata: düz', 'metadata-tipi')
        self.kontrol(TEMEL + '\ndisable-model-invocation: evet', 'bool-tipi', profil='claude-code')


class UyariTesti(unittest.TestCase):
    def test_ad_klasor_uyumsuz(self):
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, 'baska-klasor', TEMEL))
        self.assertTrue(rapor.gecerli)
        self.assertIn('ad-dizin-uyumsuz', rapor.kodlar('uyari'))

    def test_literal_blok_aciklama(self):
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, 'ornek', 'name: ornek\ndescription: |\n  Kullan: örnekler.\n  İkinci satır.'))
        self.assertIn('aciklama-literal-blok', rapor.kodlar('uyari'))

    def test_ne_zaman_ipucu_bilgisi(self):
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, 'ornek', 'name: ornek\ndescription: Örnek şeyler.'))
        self.assertIn('aciklama-ne-zaman', rapor.kodlar('bilgi'))

    def test_boyut_sinirlari(self):
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, 'ornek', TEMEL, 'satır\n' * 600))
            self.assertIn('govde-uzun', rapor.kodlar('uyari'))
            # Sınır: sondaki satır sonu yeni satır sayılmaz; tam 500 satır uyarı vermez, 501 verir.
            self.assertEqual(satir_sayisi('a\nb\n'), 2)
            self.assertEqual(satir_sayisi('a\nb'), 2)
            self.assertEqual(satir_sayisi(''), 0)
            rapor = dogrula(beceri_yaz(kok, 'ornek', TEMEL, 'satır\n' * 500))
            self.assertNotIn('govde-uzun', rapor.kodlar('uyari'))
            rapor = dogrula(beceri_yaz(kok, 'ornek', TEMEL, 'satır\n' * 501))
            self.assertIn('govde-uzun', rapor.kodlar('uyari'))
            rapor = dogrula(beceri_yaz(kok, 'ornek', TEMEL, 'x' * 21_000))
            self.assertIn('skill-bayt', rapor.kodlar('uyari'))

    def test_kaynak_harf_kirik_disarida(self):
        govde = (
            'Ayrıntı için REFERENCE.md dosyasına bak.\n'
            '[form](forms.md) ve [eksik](references/yok.md) ve [dışarı](../gizli.md).\n'
            'Betik: `scripts/calistir.py`.\n'
            '```text\n[kod içi bağlantı](references/sayilmaz.md)\n```\n'
        )
        with GeciciKlasor() as kok:
            beceri = beceri_yaz(kok, 'ornek', TEMEL, govde, {'reference.md': 'x', 'forms.md': 'y', 'scripts/var.py': ''})
            rapor = dogrula(beceri)
        mesajlar = {b.kod: [] for b in rapor.bulgular}
        for b in rapor.bulgular:
            mesajlar[b.kod].append(b.mesaj)
        self.assertEqual(len(mesajlar['kaynak-harf']), 1)  # REFERENCE.md -> reference.md
        self.assertEqual(len(mesajlar['kaynak-kirik']), 2)  # references/yok.md ve scripts/calistir.py
        self.assertEqual(len(mesajlar['kaynak-disarida']), 1)
        self.assertFalse(any('sayilmaz' in m for ms in mesajlar.values() for m in ms))

    def test_yer_tutucu_ve_beceri_disi_yollar_atlanir(self):
        govde = 'Öneri: [Başlık](URL). Arşivin içi: `word/document.xml`. Çıktı: `evals/evals.json`.\n'
        with GeciciKlasor() as kok:
            rapor = dogrula(beceri_yaz(kok, 'ornek', TEMEL, govde))
        self.assertEqual(rapor.kodlar('uyari'), [])

    def test_kaynak_referanslari_turleri(self):
        bulunan = kaynak_referanslari('[a](x/y.md#baslik) [w](https://ornek.com) `scripts/b.sh` FORMS.md [c](#ic)')
        self.assertEqual([(y, t) for y, _, t in bulunan], [('x/y.md', 'baglanti'), ('scripts/b.sh', 'kod'), ('FORMS.md', 'ciplak')])

    def test_claude_degiskeni_tasinabilirlik(self):
        govde = '```bash\ncd "${CLAUDE_PROJECT_DIR}" && ./kur.sh $ARGUMENTS\n```\n```python\n# ${CLAUDE_SKILL_DIR} burada sayılmaz\n```\n'
        with GeciciKlasor() as kok:
            beceri = beceri_yaz(kok, 'ornek', TEMEL, govde)
            bilgi = dogrula(beceri, 'spec')
            uyari = dogrula(beceri, 'codex-kopya')
        self.assertEqual(bilgi.kodlar('bilgi').count('claude-ozel-degisken'), 2)
        self.assertEqual(uyari.kodlar('uyari').count('claude-ozel-degisken'), 2)

    def test_gelistirme_dosyasi(self):
        with GeciciKlasor() as kok:
            beceri = beceri_yaz(kok, 'ornek', TEMEL, dosyalar={'test-baski-1.md': 'senaryo', 'CREATION-LOG.md': 'not'})
            rapor = dogrula(beceri)
        self.assertEqual(rapor.kodlar('uyari').count('gelistirme-dosyasi'), 2)

    def test_profil_adi_denetlenir(self):
        with self.assertRaises(ValueError):
            dogrula(ORNEKLER / 'fatura-ozeti', 'yok-boyle-profil')


if __name__ == '__main__':
    unittest.main()
