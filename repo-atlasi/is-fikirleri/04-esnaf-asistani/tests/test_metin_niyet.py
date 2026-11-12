import unicodedata
import unittest
from datetime import date, time

from esnaf.metin import kelime_eslesir, kucult, sadelestir, saat_bul, tarih_bul, tarih_metni
from esnaf.niyet import hizmet_bul, niyet_bul
from tests.yardimci import isletme

PAZARTESI = date(2026, 11, 9)


class MetinTesti(unittest.TestCase):
    def test_turkce_kucultme_ve_sadelestirme(self):
        self.assertEqual(kucult("İSTANBUL IŞIK"), "istanbul ışık")
        self.assertEqual(sadelestir("Çocuğum İçin SAÇ!"), "cocugum icin sac")

    def test_ayrisik_unicode_birlestirilir(self):  # regresyon: NFD girişte "c ocug um" oluyordu
        ayrisik = unicodedata.normalize("NFD", "Çocuğum için İPTAL")
        self.assertEqual(sadelestir(ayrisik), "cocugum icin iptal")

    def test_kelime_eslesme(self):
        self.assertTrue(kelime_eslesir("randvu", "randevu"))  # yazım hatası
        self.assertTrue(kelime_eslesir("fiat", "fiyat"))
        self.assertTrue(kelime_eslesir("randevumu", "randevu"))  # ek
        self.assertTrue(kelime_eslesir("cocugum", "cocuk"))  # ünsüz yumuşaması
        self.assertFalse(kelime_eslesir("randevusuz", "randevu"))  # yokluk eki anlamı tersine çevirir
        self.assertFalse(kelime_eslesir("neden", "ne"))  # kısa kelime yalnız tam eşleşir

    def test_olumsuzluk_bulanik_eslesmez(self):  # regresyon: "geliyorum" iptal sayılıyordu
        for olumlu, olumsuz in (("geliyorum", "gelemiyorum"), ("gelebiliyorum", "gelemiyorum"),
                                ("gelecegim", "gelemeyecegim")):
            with self.subTest(olumlu=olumlu):
                self.assertFalse(kelime_eslesir(olumlu, olumsuz))
        self.assertFalse(kelime_eslesir("kesin", "kesim"))  # tek harf farkı 5 harfte bulanık sayılmaz

    def test_tarih_bulma(self):
        beklenen = {
            "yarın gelebilir miyim": date(2026, 11, 10),
            "öbür gün": date(2026, 11, 11),
            "cuma": date(2026, 11, 13),
            "cumaya": date(2026, 11, 13),
            "cumartesiye": date(2026, 11, 14),
            "salıdan sonra": date(2026, 11, 10),
            "haftaya salı": date(2026, 11, 17),
            "12.11 olur mu": date(2026, 11, 12),
            "10.11.2026": date(2026, 11, 10),
            "5 ocakta": date(2027, 1, 5),
        }
        for metin, tarih in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(tarih_bul(metin, PAZARTESI), tarih)
        self.assertIsNone(tarih_bul("14.30 uygun mu", PAZARTESI))

    def test_acik_tarih_gun_adindan_once_gelir(self):  # regresyon: "20 kasım cuma" en yakın cuma oluyordu
        for metin in ("20 kasım cuma", "20.11 cuma", "cuma 20 kasım"):
            with self.subTest(metin=metin):
                self.assertEqual(tarih_bul(metin, PAZARTESI), date(2026, 11, 20))
        self.assertEqual(tarih_bul("27 kasım cuma günü", PAZARTESI), date(2026, 11, 27))

    def test_gun_adi_tam_kelime_ve_bilinen_ek(self):  # regresyon: "pazarlık" pazar, "Salih" salı sayılıyordu
        for metin in ("pazarlık payı var mı", "Salih bey için", "salim abi"):
            with self.subTest(metin=metin):
                self.assertIsNone(tarih_bul(metin, PAZARTESI))

    def test_saat_bulma(self):
        beklenen = {
            "14:30": time(14, 30),
            "10.30 olur": time(10, 30),
            "saat 3": time(15, 0),
            "3'te": time(15, 0),
            "yarın 3te": time(15, 0),
            "sabah 9": time(9, 0),
            "öğleden sonra 4": time(16, 0),
            "akşam 8": time(20, 0),
        }
        for metin, saat in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(saat_bul(metin), saat)
        self.assertIsNone(saat_bul("12.11 tarihinde"))

    def test_yeni_saat_bicimleri(self):  # regresyon: "2:30" 02:30, "2 buçuk" hiç tanınmıyordu
        beklenen = {
            "yarın 2:30'da": time(14, 30),
            "3:15 olur mu": time(15, 15),
            "4.30'a": time(16, 30),
            "2 buçukta": time(14, 30),
            "saat 3 buçuk": time(15, 30),
            "4'e olsun": time(16, 0),
            "3'ü çeyrek geçe": time(15, 15),
            "4'e çeyrek kala": time(15, 45),
            "sabah 7:30": time(7, 30),
            "07:30": time(7, 30),  # baştaki sıfır: sabah
        }
        for metin, saat in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(saat_bul(metin), saat)
        for metin in ("1 dk sonra oradayım", "2 dakika bekleyin", "2 saat sürer mi"):
            with self.subTest(metin=metin):
                self.assertIsNone(saat_bul(metin))

    def test_tarih_metni_yili_gerekirse_yazar(self):
        self.assertEqual(tarih_metni(date(2026, 11, 12)), "12 Kasım Perşembe")
        self.assertEqual(tarih_metni(date(2027, 1, 5), PAZARTESI), "5 Ocak 2027 Salı")


class NiyetTesti(unittest.TestCase):
    def setUp(self):
        self.isletme = isletme()

    def test_niyetler(self):
        beklenen = {
            "Randevumu iptal etmek istiyorum": "iptal",
            "yarın gelemeyeceğim": "iptal",
            "gelemiyorum maalesef": "iptal",
            "randevu almak istiyorum": "randevu",
            "randvu": "randevu",
            "saatimi değiştirebilir miyiz": "degistir",
            "randevularım": "randevularim",
            "fiat listesi": "fiyat",
            "adresiniz nerde": "adres",
            "pazar açık mı": "saatler",
            "otopark var mı": "sss",
            "Randevusuz gelebilir miyim?": "sss",
            "merhaba, kartla ödeyebilir miyim": "sss",
            "verilerimi silin": "veri_sil",
            "yetkiliyle görüşmek istiyorum": "insan",
            "merhaba": "selam",
            "/kimlik": "kimlik",
            "asdf qwer": "bilinmiyor",
        }
        for metin, ad in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(niyet_bul(metin, self.isletme, PAZARTESI).ad, ad)

    def test_olumlu_teyit_iptal_sayilmaz(self):  # regresyon: "geliyorum" iptal akışını başlatıyordu
        for metin in ("geliyorum", "tamam geliyorum", "gelebiliyorum", "yarın kesin geleceğim"):
            with self.subTest(metin=metin):
                self.assertNotIn(niyet_bul(metin, self.isletme, PAZARTESI).ad, ("iptal", "randevu"))

    def test_hizmet_tarih_saat_birlikte(self):
        n = niyet_bul("yarın 3'te saç ve sakal", self.isletme, PAZARTESI)
        self.assertEqual((n.ad, n.hizmet.kod, n.tarih, n.saat), ("randevu", "sac-sakal", date(2026, 11, 10), time(15)))

    def test_hizmet_secimi(self):
        beklenen = {"saç": "sac-kesimi", "sakal": "sakal", "saç sakal": "sac-sakal", "çocuğum için saç": "cocuk"}
        for metin, kod in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(hizmet_bul(metin, self.isletme).kod, kod)
        self.assertIsNone(hizmet_bul("manikür", self.isletme))


if __name__ == "__main__":
    unittest.main()
