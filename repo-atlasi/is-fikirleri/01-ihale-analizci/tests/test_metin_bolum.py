import tempfile
import unittest
from pathlib import Path

from ihale_analizci.bolum import alt_madde_no, birimlere_ayir, bolumlere_ayir, satirlari_normallestir, yan_cumle_mi
from ihale_analizci.donustur import html_markdowna, metin_oku
from ihale_analizci.metin import cumlelere_bol, katla, sayi_coz, tr_kucuk


class MetinTesti(unittest.TestCase):
    def test_turkce_kucuk_harf(self):
        self.assertEqual(tr_kucuk("İSTANBUL IĞDIR"), "istanbul ığdır")
        self.assertEqual(len(tr_kucuk("İİII")), 4)  # str.lower() burada 6 karakter verirdi

    def test_katlama_bozuk_pdf_metniyle_eslesir(self):
        self.assertEqual(katla("GEÇİCİ  TEMİNAT"), "gecici teminat")
        self.assertEqual(katla("gecici teminat"), katla("Geçici Teminat"))

    def test_katlama_pdf_isaretlerini_esitler(self):
        # Bitişik fi (U+FB01), sağ tek tırnak (U+2019), yumuşak tire (U+00AD), bölünemez boşluk (U+00A0)
        self.assertEqual(katla("serti\ufb01ka"), "sertifika")
        self.assertEqual(katla("%3\u2019ünden"), "%3'unden")
        self.assertEqual(katla("te\u00admi\u00adnat\u00a0mektubu"), "teminat mektubu")

    def test_yaziyla_sayilar(self):
        self.assertEqual(sayi_coz("on bes"), 15)
        self.assertEqual(sayi_coz("iki bucuk"), 2.5)
        self.assertEqual(sayi_coz("0,5"), 0.5)
        self.assertIsNone(sayi_coz("birim"))

    def test_uzun_paragraf_cumlelere_bolunur_tarih_bolunmez(self):
        paragraf = "İhale 15.12.2026 tarihinde yapılır. " * 8
        cumleler = cumlelere_bol(paragraf.strip())
        self.assertEqual(len(cumleler), 8)
        self.assertIn("15.12.2026", cumleler[0])


class BolumTesti(unittest.TestCase):
    MD = "\n".join(
        [
            "İDARİ ŞARTNAME",
            "Giriş metni.",
            "Madde 7 - Gerekli belgeler",
            "7.1. Aşağıdaki belgeler sunulur:",
            "- a) İmza sirküleri.",
            "Madde 5'te belirtilen belgeler de eklenir.",
            "MADDE 26- Geçici teminat 26.1. Teklif edilen bedelin %3'ü kadar teminat verilir.",
            "## Ekler",
            "| Sıra | Belge |",
            "| --- | --- |",
            "| 1 | Vergi levhası |",
        ]
    )

    def test_madde_basliklari_ve_cumle_ayrimi(self):
        basliklar = [b.baslik for b in bolumlere_ayir("s.txt", self.MD)]
        self.assertEqual(basliklar, ["İDARİ ŞARTNAME", "Madde 7 - Gerekli belgeler", "Madde 26 - Geçici teminat", "Ekler"])

    def test_ayni_satirdaki_icerik_bolume_girer(self):
        madde26 = bolumlere_ayir("s.txt", self.MD)[2]
        self.assertEqual(madde26.satirlar, [(7, "26.1. Teklif edilen bedelin %3'ü kadar teminat verilir.")])

    def test_birimler_alt_madde_ve_kaynak_tasir(self):
        madde7 = bolumlere_ayir("s.txt", self.MD)[1]
        birimler = birimlere_ayir(madde7)
        self.assertEqual(birimler[1].metin, "a) İmza sirküleri.")  # liste imi atıldı
        self.assertEqual(birimler[1].alt_madde, "7.1")
        self.assertEqual(birimler[1].kaynak(), "s.txt › Madde 7 - Gerekli belgeler › 7.1 (satır 5)")

    def test_tablo_basligi_ve_ayirici_birim_olmaz(self):
        ekler = bolumlere_ayir("s.txt", self.MD)[3]
        self.assertEqual([b.metin for b in birimlere_ayir(ekler)], ["1 | Vergi levhası"])

    def test_deger_tasiyan_buyuk_harfli_ve_kalin_satir_baslik_olmaz(self):
        # Eskiden bu satırlar bölüm başlığı sanılıyor, içlerindeki tarih ve olumsuzluk hiçbir çıkarıcıya ulaşmıyordu.
        md = "\n".join(
            [
                "Madde 4 - İhaleye ilişkin bilgiler",
                "SON TEKLİF VERME TARİHİ 5 ŞUBAT 2027 SAAT 14.00",
                "BU İHALEDE FİYAT FARKI VERİLMEYECEKTİR.",
                "**Yükleniciye avans verilmeyecektir.**",
                "- b) İMZA SİRKÜLERİ",
                "| SIRA | İSTENEN BELGE |",
                "GENEL HÜKÜMLER",
            ]
        )
        bolumler = bolumlere_ayir("s.txt", md)
        self.assertEqual([b.baslik for b in bolumler], ["Madde 4 - İhaleye ilişkin bilgiler", "GENEL HÜKÜMLER"])
        self.assertEqual(len(bolumler[0].satirlar), 5)

    def test_madde_satirindaki_cumle_icerik_olur(self):
        ornekler = {  # satır: (bölüm başlığı, bölümde kalan içerik satırı sayısı)
            "Madde 26. Teklif bedelinin %3'ü oranında geçici teminat verilir.": ("Madde 26", 1),
            "MADDE 5 – (1) İstekliler teklif bedelinin %3'ü oranında geçici teminat verir.": ("Madde 5", 1),
            "MADDE 6- Geçici teminat: Muhammen bedelin %3'üdür.": ("Madde 6 - Geçici teminat", 1),
            "Madde 44 - Yükleniciye avans verilmeyecektir.": ("Madde 44", 1),
            "Madde 30 - Tekliflerin geçerlilik süresi": ("Madde 30 - Tekliflerin geçerlilik süresi", 0),
        }
        for satir, (baslik, icerik) in ornekler.items():
            bolum = bolumlere_ayir("s.txt", satir)[0]
            self.assertEqual(bolum.baslik, baslik, satir)
            self.assertEqual(len(bolum.satirlar), icerik, satir)  # içerik başlığa gömülüp kaybolmadı

    def test_yan_cumle_mi(self):
        for baslik in ["Geçici teminat", "GENEL HÜKÜMLER", "İhaleye ilişkin bilgiler", "BÖLÜM 2 - GENEL HÜKÜMLER", "Muayene ve kabul"]:
            self.assertFalse(yan_cumle_mi(baslik), baslik)
        for cumle in ["BU İHALEDE FİYAT FARKI VERİLMEYECEKTİR.", "Belgelerin sunulması zorunludur", "SON TEKLİF 5 ŞUBAT 2027"]:
            self.assertTrue(yan_cumle_mi(cumle), cumle)

    def test_tarih_ve_tutar_alt_madde_sayilmaz(self):
        self.assertIsNone(alt_madde_no("15.12.2026 tarihinde ihale yapılır."))
        self.assertIsNone(alt_madde_no("1.500.000 TL yaklaşık maliyet."))
        self.assertIsNone(alt_madde_no("1.500 TL teminat alınır."))
        self.assertEqual(alt_madde_no("7.200. Ek belgeler"), "7.200")
        self.assertEqual(alt_madde_no("26.1. İstekliler"), "26.1")
        self.assertEqual(alt_madde_no("- 7.1.2 Belgeler"), "7.1.2")
        bolum = bolumlere_ayir("s.txt", "Madde 4 - Tarihler\n15.12.2026 tarihinde ihale yapılır.\nTeklifler EKAP'tan verilir.")[0]
        self.assertEqual([b.alt_madde for b in birimlere_ayir(bolum)], [None, None])

    def test_sayfa_sonu_satir_numarasini_kaydirmaz(self):
        # pdfminer sayfa sonuna \x0c koyar; splitlines() bunu satır sonu sayar, metin düzenleyici saymaz.
        md = satirlari_normallestir("Satır 1\nSatır 2\n\x0cSatır 3\nMadde 26 - Geçici teminat\n26.1. Bedelin %3'ü teminat verilir.")
        satir_no, metin = bolumlere_ayir("s.pdf", md)[-1].satirlar[0]
        self.assertEqual(md.split("\n")[satir_no - 1], metin)

    def test_html_yedek_donusturucu(self):
        md = html_markdowna("<h2>Madde 1 - Konu</h2><p>Mobilya <b>alımı</b>.</p><ul><li>Masa</li></ul><script>x()</script>")
        self.assertEqual(md.split("\n\n"), ["## Madde 1 - Konu", "Mobilya alımı.", "- Masa\n"])

    def test_html_tablo_hucresi_ve_sekme_basligi(self):
        html = (
            "<html><head><title>Sekme başlığı</title></head><body><table>"
            "<tr><th>Sıra</th><th>Belge</th></tr>"
            "<tr><td>1</td><td><p>İmza</p><p>sirküleri</p></td></tr>"
            "<tr><td>2<td>Vergi levhası</tr></table></body></html>"
        )
        self.assertEqual(html_markdowna(html), "| Sıra | Belge |\n| --- | --- |\n| 1 | İmza sirküleri |\n| 2 | Vergi levhası |\n")

    def test_utf16_bomlu_metin_okunur(self):
        with tempfile.TemporaryDirectory() as gecici:
            yol = Path(gecici) / "not-defteri.txt"
            yol.write_bytes("Geçici teminat %3".encode("utf-16"))
            self.assertEqual(metin_oku(yol), "Geçici teminat %3")


if __name__ == "__main__":
    unittest.main()
