import io
import unittest

from asama1_cekirdek import (
    ONCELIK_GENEL_BICIM,
    AkisBilgisi,
    DesteklenmeyenBicim,
    Donusturucu,
    DonusturmeHatasi,
    MiniMarkItDown,
    Sonuc,
    markdown_normalize,
)
from asama2_tahmin import charset_tahmini, icerik_tahmini, tahminleri_uret
from tests.yardimci import docx_olustur, zip_olustur


class Sabit(Donusturucu):
    def __init__(self, ad, kabul=True, hata=None):
        self.ad, self.kabul, self.hata = ad, kabul, hata

    def accepts(self, akis, bilgi, **s):
        return self.kabul

    def convert(self, akis, bilgi, **s):
        if self.hata:
            raise self.hata
        return Sonuc(self.ad)


class Kotu(Donusturucu):
    """accepts() içinde okuyup konumu geri almayan (kurala uymayan) dönüştürücü."""

    def accepts(self, akis, bilgi, **s):
        akis.read(3)
        return False


class KayitDefteriTesti(unittest.TestCase):
    def test_oncelik_ve_ekleme_sirasi(self):
        md = MiniMarkItDown(yerlesikler=False)
        md.kaydet(Sabit('genel'), ONCELIK_GENEL_BICIM)
        md.kaydet(Sabit('ilk'))
        md.kaydet(Sabit('son'))
        # aynı öncelikte EN SON kaydedilen önce; genel olan en sonda
        self.assertEqual([k.donusturucu.ad for k in md.sirali_kayitlar()], ['son', 'ilk', 'genel'])
        self.assertEqual(md.convert(b'x').markdown, 'son\n')

    def test_hata_veren_atlanir_hatalar_saklanir(self):
        md = MiniMarkItDown(yerlesikler=False)
        md.kaydet(Sabit('yedek'), ONCELIK_GENEL_BICIM)
        md.kaydet(Sabit('bozuk', hata=ValueError('patladı')))
        self.assertEqual(md.convert(b'x').markdown, 'yedek\n')
        md2 = MiniMarkItDown(yerlesikler=False)
        md2.kaydet(Sabit('bozuk', hata=ValueError('patladı')))
        with self.assertRaises(DonusturmeHatasi) as baglam:
            md2.convert(b'x')
        self.assertEqual(baglam.exception.denemeler[0][0], 'Sabit')

    def test_kimse_kabul_etmezse(self):
        md = MiniMarkItDown(yerlesikler=False)
        md.kaydet(Sabit('hayir', kabul=False))
        with self.assertRaises(DesteklenmeyenBicim):
            md.convert(b'x')

    def test_accepts_konumu_bozamaz(self):
        md = MiniMarkItDown(yerlesikler=False)
        md.kaydet(Kotu())
        with self.assertRaises(AssertionError):
            md.convert(b'abcdef')

    def test_normalize(self):
        self.assertEqual(markdown_normalize('a  \n\n\n\nb\r\nc'), 'a\n\nb\nc\n')

    def test_eklenti_yukleme(self):
        md = MiniMarkItDown(eklentiler=['tests.ornek_eklenti'])
        sonuc = md.convert(b'ad\tsehir\nAyse\tIzmir\n', AkisBilgisi(uzanti='.tsv'))
        self.assertIn('| ad | sehir |', sonuc.markdown)
        with self.assertWarns(UserWarning):
            MiniMarkItDown(eklentiler=['olmayan_modul_xyz'])


class TahminTesti(unittest.TestCase):
    def test_sihirli_baytlar(self):
        self.assertEqual(icerik_tahmini(io.BytesIO(b'%PDF-1.7 ...')).uzanti, '.pdf')
        self.assertEqual(icerik_tahmini(io.BytesIO(b'\x89PNG\r\n\x1a\n0000')).mimetype, 'image/png')
        self.assertEqual(icerik_tahmini(io.BytesIO(docx_olustur())).uzanti, '.docx')
        self.assertEqual(icerik_tahmini(io.BytesIO(zip_olustur({'a.txt': b'x'}))).uzanti, '.zip')

    def test_metin_turleri(self):
        self.assertEqual(icerik_tahmini(io.BytesIO(b'<!DOCTYPE html><html></html>')).mimetype, 'text/html')
        self.assertEqual(icerik_tahmini(io.BytesIO(b' {"a": [1, 2]}')).mimetype, 'application/json')
        self.assertEqual(icerik_tahmini(io.BytesIO(b'{bozuk json')).mimetype, 'text/plain')

    def test_karakter_kumesi(self):
        self.assertEqual(charset_tahmini('Iğdır ılık'.encode('utf-8')), 'utf-8')
        self.assertEqual(charset_tahmini('Iğdır ılık'.encode('cp1254')), 'cp1254')
        self.assertEqual(charset_tahmini('café'.encode('latin-1')), 'latin-1')
        self.assertEqual(charset_tahmini(b'\xef\xbb\xbfmerhaba'), 'utf-8-sig')
        self.assertIsNone(charset_tahmini(b'\x00\x01\x02ikili'))

    def test_akis_konumu_korunur(self):
        akis = io.BytesIO(b'xx{"a": 1}')
        akis.seek(2)
        tahminler = tahminleri_uret(akis, AkisBilgisi())
        self.assertEqual(akis.tell(), 2)
        self.assertEqual(tahminler[0].mimetype, 'application/json')

    def test_uyumlu_ve_celisen_tahminler(self):
        docx = io.BytesIO(docx_olustur())
        uyumlu = tahminleri_uret(docx, AkisBilgisi(uzanti='.docx', dosya_adi='r.docx'))
        self.assertEqual(len(uyumlu), 1)
        self.assertEqual(uyumlu[0].dosya_adi, 'r.docx')
        # .txt adı taşıyan ama aslında DOCX olan dosya: iki tahmin, önce uzantı
        celisen = tahminleri_uret(docx, AkisBilgisi(uzanti='.txt'))
        self.assertEqual([t.uzanti for t in celisen], ['.txt', '.docx'])
        # İçerik yalnızca "metin" diyorsa uzantıya güvenilir, charset eklenir
        csv = tahminleri_uret(io.BytesIO('a;b\nç;ş'.encode('cp1254')), AkisBilgisi(uzanti='.csv'))
        self.assertEqual((csv[0].uzanti, csv[0].mimetype, csv[0].charset), ('.csv', 'text/csv', 'cp1254'))


if __name__ == '__main__':
    unittest.main()
