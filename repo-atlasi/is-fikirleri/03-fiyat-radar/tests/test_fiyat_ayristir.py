import json
import unittest
from decimal import Decimal

from fiyat_radar.ayristir import sayfadan_cikar
from fiyat_radar.fiyat import kurus, tl_coz, tl_mi, tl_yaz, yuzde_yaz

from tests.yerel_sunucu import urun_sayfasi


def jsonld(veri: dict, govde: str = "Ürün") -> str:
    return f'<html><head><script type="application/ld+json">{json.dumps(veri)}</script></head><body>{govde}</body></html>'


class FiyatTesti(unittest.TestCase):
    def test_turkce_ve_ingilizce_bicimler(self):
        beklenen = Decimal("1299.90")
        for metin in ["1.299,90 TL", "₺1.299,90", "1 299,90 TL", "1\u00a0299,90 TL", "1299,9 TL", "1299.90", "1,299.90", 1299.9]:
            self.assertEqual(tl_coz(metin), beklenen, metin)
        self.assertEqual(tl_coz("1.299 TL"), Decimal("1299.00"))
        self.assertIsNone(tl_coz("fiyat sorunuz"))
        self.assertIsNone(tl_coz(True))

    def test_bosluk_iki_fiyati_birlestirmez(self):
        self.assertEqual(kurus("2.399,90 2.799,90"), 239990)

    def test_sifir_nan_ve_sonsuz_fiyat_sayilmaz(self):
        for deger in [0, "0,00 TL", float("nan"), float("inf"), Decimal("NaN"), -5]:
            self.assertIsNone(kurus(deger), deger)

    def test_yazim_ve_para_birimi(self):
        self.assertEqual(tl_yaz(kurus("12.345.678,05")), "12.345.678,05 TL")
        self.assertEqual(tl_yaz(None), "—")
        self.assertEqual(yuzde_yaz(7.6923), "%7,7")
        self.assertTrue(all(tl_mi(k) for k in [None, "", "TRY", "try", "TL", "₺"]))
        self.assertFalse(tl_mi("USD"))


class AyristirTesti(unittest.TestCase):
    def test_jsonld_graph_ve_teklif_listesi(self):
        veri = {
            "@context": "https://schema.org",
            "@graph": [
                {"@type": "BreadcrumbList"},
                {"@type": ["Product"], "offers": [{"price": "2399.90", "availability": "https://schema.org/OutOfStock"}]},
            ],
        }
        durum = sayfadan_cikar(jsonld(veri))
        self.assertEqual((durum.fiyat, durum.stokta, durum.kaynak), (239990, False, "json-ld"))

    def test_jsonld_belge_sirasi_ana_urun_once(self):
        # Hata: yığın ters sırayla gezildiği için "benzer ürün"ün fiyatı ana ürününkinin yerine geçiyordu.
        veri = {
            "@graph": [
                {"@type": "Product", "name": "Ana", "offers": {"price": "2399.90"}},
                {"@type": "Product", "name": "Benzer", "offers": {"price": "499.90"}},
            ]
        }
        self.assertEqual(sayfadan_cikar(jsonld(veri)).fiyat, 239990)

    def test_jsonld_productgroup_mainentity_ve_ustu_cizili(self):
        grup = {"@type": "ProductGroup", "hasVariant": [{"@type": "Product", "offers": {"price": 649.9, "priceCurrency": "TRY"}}]}
        self.assertEqual(sayfadan_cikar(jsonld({"@type": "WebPage", "mainEntity": grup})).fiyat, 64990)
        teklif = {
            "priceSpecification": [
                {"price": "799.90", "priceType": "https://schema.org/StrikethroughPrice"},
                {"price": "649.90", "priceCurrency": "TRY"},
            ]
        }
        durum = sayfadan_cikar(jsonld({"@type": "http://schema.org/Product", "offers": teklif}))
        self.assertEqual((durum.fiyat, durum.eski_fiyat, durum.para_birimi), (64990, 79990, "TRY"))

    def test_jsonld_toplu_teklif_en_dusuk_fiyat(self):
        durum = sayfadan_cikar(jsonld({"@type": "Product", "offers": {"@type": "AggregateOffer", "lowPrice": 649.9}}))
        self.assertEqual(durum.fiyat, 64990)

    def test_jsonld_sifir_fiyat_ve_nan_metne_duser(self):
        durum = sayfadan_cikar(jsonld({"@type": "Product", "offers": {"price": 0}}, "<p>1.499 TL</p>"))
        self.assertEqual((durum.fiyat, durum.kaynak), (149900, "metin"))
        nan = '<script type="application/ld+json">{"@type":"Product","offers":{"price":NaN}}</script><p>1.499 TL</p>'
        self.assertEqual(sayfadan_cikar(nan).fiyat, 149900)

    def test_para_birimi_okunur(self):
        self.assertEqual(sayfadan_cikar(jsonld({"@type": "Product", "offers": {"price": "499", "priceCurrency": "usd"}})).para_birimi, "USD")
        profil = {"title": "X", "url": "u", "variants": [{"price": {"amount": 99.9, "currency": "EUR"}, "availability": {"inStock": True}}]}
        self.assertEqual(sayfadan_cikar("", urun_profili=profil).para_birimi, "EUR")
        meta = '<meta property="product:price:amount" content="10.00"><meta property="product:price:currency" content="USD">'
        self.assertEqual((sayfadan_cikar(meta).fiyat, sayfadan_cikar(meta).para_birimi), (1000, "USD"))
        self.assertEqual(sayfadan_cikar("<p>1.299,90 TL</p>").para_birimi, "TRY")

    def test_meta_etiketi_ters_oznitelik_sirasi(self):
        durum = sayfadan_cikar('<meta content="1.049,00" property="product:price:amount"><p>Sepete Ekle</p>')
        self.assertEqual((durum.fiyat, durum.kaynak, durum.stokta), (104900, "meta", True))

    def test_gorunur_metin_eski_fiyat_ve_kampanya(self):
        html = urun_sayfasi("2.399,90 TL", eski="2.799,90 TL", kampanya="SEPETTE %10 İNDİRİM · Kargo bedava · 9 taksit")
        durum = sayfadan_cikar(html)
        self.assertEqual((durum.fiyat, durum.eski_fiyat, durum.kaynak), (239990, 279990, "metin"))
        self.assertEqual(durum.kampanyalar, ["SEPETTE %10 İNDİRİM", "Kargo bedava", "9 taksit"])

    def test_sinif_adinda_old_gecen_guncel_fiyat_eski_sayilmaz(self):
        # Hata: "price-holder" ve "bold" içindeki "old" eski fiyat sayılıyor, taksit tutarı fiyat diye okunuyordu.
        for sinif in ["price-holder", "bold", "sold-out-badge"]:
            html = f'<h1>X</h1><div class="{sinif}">2.399,90 TL</div><p>9 taksit x 266,66 TL</p>'
            durum = sayfadan_cikar(html)
            self.assertEqual((durum.fiyat, durum.eski_fiyat), (239990, None), sinif)
        for sinif in ["old-price", "priceOld", "eski_fiyat", "product-price--original"]:
            durum = sayfadan_cikar(f'<span class="{sinif}">2.799,90 TL</span> <span class="price">2.399,90 TL</span>')
            self.assertEqual((durum.fiyat, durum.eski_fiyat), (239990, 279990), sinif)

    def test_eski_fiyat_adayindaki_yuzde_fiyat_sanilmaz(self):
        durum = sayfadan_cikar('<span class="old-price">%10 2.799,90 TL</span> <b>2.399,90 TL</b>')
        self.assertEqual(durum.eski_fiyat, 279990)

    def test_bolunmez_bosluklu_binlik_model_adi_ve_yorumdaki_fiyat(self):
        self.assertEqual(sayfadan_cikar("<p>Fiyat: 1\u202f299,90\u00a0TL</p>").fiyat, 129990)
        self.assertEqual(sayfadan_cikar("<p>Fiyat: 1&nbsp;299,90&nbsp;TL</p>").fiyat, 129990)
        # Etiketler silinince model adı fiyata yapışır; düz boşluk binlik sayılsaydı 100.100 TL okunurdu
        self.assertEqual(sayfadan_cikar(urun_sayfasi("100 TL")).fiyat, 10000)
        self.assertEqual(sayfadan_cikar("<!-- eski > şablon 9.999 TL --><p>1.499 TL</p>").fiyat, 149900)

    def test_stok_ifadeleri_ve_olumsuzluk(self):
        # Hata: "stokta kalmadı/değil/bulunmamaktadır" içindeki "stokta" yüzünden ürün stokta sayılıyordu.
        for ifade in ["Stokta yok · Gelince haber ver", "Stokta kalmadı", "Bu ürün stokta değil", "Ürün stokta bulunmamaktadır", "TÜKENDİ"]:
            self.assertFalse(sayfadan_cikar(urun_sayfasi("100 TL", stok=ifade)).stokta, ifade)
        for ifade in ["Sepete Ekle", "Son 3 ürün stokta", "SATIN AL"]:
            self.assertTrue(sayfadan_cikar(urun_sayfasi("100 TL", stok=ifade)).stokta, ifade)
        self.assertIsNone(sayfadan_cikar("<p>100 TL</p>").stokta)

    def test_firecrawl_urun_profili_oncelikli(self):
        profil = {
            "title": "X100",
            "url": "https://rakip.example/x100",
            "variants": [{"price": {"amount": 2299.9}, "sale": {"originalPrice": {"amount": 2599.9}}, "availability": {"inStock": True}}],
        }
        durum = sayfadan_cikar(urun_sayfasi("9.999 TL"), markdown="~~2.599,90 TL~~ 2.299,90 TL", urun_profili=profil)
        self.assertEqual((durum.fiyat, durum.eski_fiyat, durum.stokta, durum.kaynak), (229990, 259990, True, "firecrawl-product"))

    def test_bozuk_urun_profili_cokmez(self):
        for profil in [{"variants": "yok"}, {"variants": [None, {"price": "abc"}]}, {"variants": [{"price": {"amount": None}}]}]:
            self.assertEqual(sayfadan_cikar(urun_sayfasi("100 TL"), urun_profili=profil).fiyat, 10000)

    def test_ustu_cizili_fiyat_guncelden_dusukse_indirim_sayilmaz(self):
        self.assertIsNone(sayfadan_cikar(urun_sayfasi("2.000 TL", eski="1.500 TL")).eski_fiyat)


if __name__ == "__main__":
    unittest.main()
