import unittest

from beceri_kiti.onbilgi import OnbilgiHatasi, ayir, oku, yaml_oku


def ob(govde: str) -> dict:
    return oku(f'---\n{govde}\n---\ngövde\n').veri


class AyirTesti(unittest.TestCase):
    def test_onbilgi_ve_govde_ayrilir(self):
        ham, govde, satir = ayir('---\nname: a\n---\n# Başlık\n')
        self.assertEqual(ham, 'name: a')
        self.assertEqual(govde, '# Başlık\n')
        self.assertEqual(satir, 4)

    def test_onbilgisiz_metin(self):
        ham, govde, satir = ayir('# Yalnızca gövde\n')
        self.assertIsNone(ham)
        self.assertEqual(satir, 1)

    def test_kapanmamis_onbilgi_hata(self):
        with self.assertRaises(OnbilgiHatasi):
            ayir('---\nname: a\n')

    def test_bom_ve_crlf_temizlenir(self):
        o = oku('\ufeff---\r\nname: a\r\ndescription: b\r\n---\r\ngövde\r\n')
        self.assertEqual(o.veri, {'name': 'a', 'description': 'b'})
        self.assertEqual(o.govde, 'gövde\n')

    def test_onbilgi_yoksa_oku_hata_verir(self):
        with self.assertRaises(OnbilgiHatasi) as baglam:
            oku('name: a\n')
        self.assertIn('Ön bilgi yok', baglam.exception.mesaj)


class SkalerTesti(unittest.TestCase):
    def test_duz_ve_tur_cevirme(self):
        veri = ob('a: metin\nb: true\nc: False\nd: 42\ne: 0.7\nf: ~\ng: yes\nh: 1.0.0')
        self.assertEqual(veri, {'a': 'metin', 'b': True, 'c': False, 'd': 42, 'e': 0.7, 'f': None, 'g': 'yes', 'h': '1.0.0'})

    def test_satir_sonu_yorumu_atilir(self):
        self.assertEqual(ob('a: değer # açıklama')['a'], 'değer')
        self.assertEqual(ob('a: C#dili')['a'], 'C#dili')

    def test_cift_tirnak_ve_kacislar(self):
        veri = ob(r'a: "iki: nokta \"tırnak\" \u00e7 \n son"')
        self.assertEqual(veri['a'], 'iki: nokta "tırnak" ç \n son')

    def test_tek_tirnak_kacisi(self):
        self.assertEqual(ob("a: 'Ali''nin notu: tamam'")['a'], "Ali'nin notu: tamam")

    def test_cok_satirli_cift_tirnak_katlanir(self):
        self.assertEqual(ob('a: "birinci\n  ikinci"')['a'], 'birinci ikinci')

    def test_cok_satirli_duz_deger(self):
        self.assertEqual(ob('a: bir\n  iki\n  üç\nb: x')['a'], 'bir iki üç')

    def test_tirnaksiz_iki_nokta_bosluk_hata(self):
        # mattpocock/skills in-progress/software-factory bu yüzden PyYAML ile okunamıyor
        with self.assertRaises(OnbilgiHatasi) as baglam:
            ob('description: Ortak dil: görevler ve servisler')
        self.assertIn('tırnak', baglam.exception.mesaj)
        self.assertEqual(baglam.exception.satir, 2)

    def test_ayrilmis_karakterle_baslayan_deger(self):
        for deger in ('@kisi', '`kod`', '&capa x', '*takma', '!etiket x'):
            with self.subTest(deger=deger), self.assertRaises(OnbilgiHatasi):
                ob(f'a: {deger}')


class BlokTesti(unittest.TestCase):
    def test_katlanan_blok(self):
        self.assertEqual(ob('a: >\n  bir\n  iki\n\n  üç\nb: x')['a'], 'bir iki\nüç\n')

    def test_katlanan_blok_eksi(self):
        self.assertEqual(ob('a: >-\n  bir\n  iki\n')['a'], 'bir iki')

    def test_literal_blok_satirlari_korur(self):
        self.assertEqual(ob('a: |\n  bir\n    iki\n  üç\n')['a'], 'bir\n  iki\nüç\n')

    def test_literal_eksi_ve_arti(self):
        self.assertEqual(ob('a: |-\n  x\n\nb: 1')['a'], 'x')
        self.assertEqual(ob('a: |+\n  x\n\nb: 1')['a'], 'x\n\n')

    def test_bicim_kaydedilir(self):
        o = oku('---\nname: a\ndescription: |-\n  x\n---\n')
        self.assertEqual(o.bicimler, {'name': 'plain', 'description': '|-'})

    def test_gecersiz_blok_gostergesi(self):
        with self.assertRaises(OnbilgiHatasi):
            ob('a: |x\n  bir')


class YapiTesti(unittest.TestCase):
    def test_ic_ice_esleme(self):
        veri = ob('metadata:\n  dil: tr\n  krediler:\n    yazar: Ada\nname: x')
        self.assertEqual(veri, {'metadata': {'dil': 'tr', 'krediler': {'yazar': 'Ada'}}, 'name': 'x'})

    def test_blok_liste_ve_girintisiz_liste(self):
        self.assertEqual(ob('araclar:\n  - Read\n  - "Grep"')['araclar'], ['Read', 'Grep'])
        self.assertEqual(ob('araclar:\n- Read\n- Bash\nname: x')['araclar'], ['Read', 'Bash'])

    def test_esleme_listesi(self):
        veri = ob('kancalar:\n  - ad: a\n    olay: SessionStart\n  - ad: b\n    olay: Stop')
        self.assertEqual(veri['kancalar'], [{'ad': 'a', 'olay': 'SessionStart'}, {'ad': 'b', 'olay': 'Stop'}])

    def test_akis_listesi_ve_bos_esleme(self):
        veri = ob('a: [Read, "Grep", \'Glob\', 3]\nb: []\nc: {}')
        self.assertEqual(veri, {'a': ['Read', 'Grep', 'Glob', 3], 'b': [], 'c': {}})

    def test_bos_deger_null(self):
        self.assertEqual(ob('a:\nb: x'), {'a': None, 'b': 'x'})

    def test_yinelenen_anahtar_hata(self):
        with self.assertRaises(OnbilgiHatasi) as baglam:
            ob('name: a\nname: b')
        self.assertIn('iki kez', baglam.exception.mesaj)

    def test_sekme_girintisi_hata(self):
        with self.assertRaises(OnbilgiHatasi):
            ob('metadata:\n\tdil: tr')

    def test_kapanmamis_tirnak_hata(self):
        with self.assertRaises(OnbilgiHatasi):
            ob('a: "kapanmadı\nb: x')

    def test_liste_ile_baslayan_onbilgi_hata(self):
        with self.assertRaises(OnbilgiHatasi):
            ob('- a\n- b')

    def test_yaml_oku_yan_dosya(self):
        veri = yaml_oku('interface:\n  display_name: "Izgara"\npolicy:\n  allow_implicit_invocation: false\n')
        self.assertEqual(veri['policy']['allow_implicit_invocation'], False)
        self.assertEqual(veri['interface']['display_name'], 'Izgara')


if __name__ == '__main__':
    unittest.main()
