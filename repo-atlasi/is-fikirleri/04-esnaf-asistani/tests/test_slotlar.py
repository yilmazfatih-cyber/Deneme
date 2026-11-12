import unittest
from datetime import date, datetime, timezone

from esnaf.slotlar import Dolu, bos_slotlar, uygun_kaynak
from esnaf.zaman import saat_dilimi, yerel_saat
from tests.yardimci import PAZARTESI_9, isletme, isletme_ile, ornek_sozluk


def an(gun: int, saat: int, dakika: int = 0) -> datetime:
    return datetime(2026, 11, gun, saat, dakika)


def saatler(isl, hizmet_kodu: str, gun: date) -> list[str]:
    return [f"{a:%H:%M}" for a, _ in bos_slotlar(isl, isl.hizmet(hizmet_kodu), [], PAZARTESI_9, gun, 500, True)]


class SlotMotoruTesti(unittest.TestCase):
    def setUp(self):
        self.isletme = isletme()
        self.sac = self.isletme.hizmet("sac-kesimi")  # 30 dk

    def uygun(self, bas, dolu=(), simdi=PAZARTESI_9):
        return uygun_kaynak(self.isletme, self.sac, bas, list(dolu), simdi)

    def test_calisma_saati_ogle_arasi_ve_kapanis(self):
        self.assertEqual(self.uygun(an(9, 10)), "Murat")
        self.assertIsNotNone(self.uygun(an(9, 12, 30)))  # 13:00'te biter: sığar
        self.assertIsNone(self.uygun(an(9, 12, 45)))  # öğle arasına taşar
        self.assertIsNone(self.uygun(an(9, 13, 15)))  # öğle arası
        self.assertIsNotNone(self.uygun(an(9, 19, 30)))
        self.assertIsNone(self.uygun(an(9, 19, 45)))  # kapanışı aşar
        self.assertIsNone(self.uygun(an(9, 10, 10)))  # 15 dakikalık ızgaraya uymuyor

    def test_kapali_gun_tatil_ve_ufuk(self):
        self.assertEqual(bos_slotlar(self.isletme, self.sac, [], PAZARTESI_9, date(2026, 11, 15), tek_gun=True), [])
        simdi = datetime(2026, 12, 28, 9, 0)
        self.assertEqual(bos_slotlar(self.isletme, self.sac, [], simdi, date(2026, 12, 31), tek_gun=True), [])
        self.assertIsNone(self.uygun(an(24, 10)))  # 15 günden ileri: ufuk dışı

    def test_en_erken_sure_ve_gecmis(self):
        simdi = an(9, 10, 10)
        self.assertIsNone(self.uygun(an(9, 11, 0), simdi=simdi))  # 60 dk önceden haber kuralı
        ilk = bos_slotlar(self.isletme, self.sac, [], simdi)[0][0]
        self.assertEqual(ilk, an(9, 11, 15))

    def test_iki_kaynakla_cakisma(self):
        murat = Dolu("Murat", an(9, 10), an(9, 10, 30))
        can = Dolu("Can", an(9, 10, 15), an(9, 10, 45))
        self.assertEqual(self.uygun(an(9, 10), [murat]), "Can")
        self.assertIsNone(self.uygun(an(9, 10, 15), [murat, can]))
        self.assertEqual(self.uygun(an(9, 10, 30), [murat, can]), "Murat")  # biten randevu sınırı çakışma değil

    def test_seyrek_oneri(self):
        saatler_ = [a for a, _ in bos_slotlar(self.isletme, self.sac, [], PAZARTESI_9, adet=4, seyrek_dk=60)]
        self.assertEqual(saatler_, [an(9, 10), an(9, 11), an(9, 12), an(9, 14)])

    def test_izgara_her_araligin_acilisina_gore(self):  # regresyon: 09:45 açılışta 30 dk adımla hiç slot yoktu
        veri = ornek_sozluk()
        veri["adim_dk"] = 30
        veri["calisma_saatleri"]["salı"] = ["09:45-13:00", "14:00-16:00"]
        isl = isletme_ile(**veri)
        self.assertEqual(saatler(isl, "sac-kesimi", date(2026, 11, 10))[:3], ["09:45", "10:15", "10:45"])
        self.assertIn("14:00", saatler(isl, "sac-kesimi", date(2026, 11, 10)))

    def test_60i_bolmeyen_adim(self):  # regresyon: adim_dk=90 ile 11:30 ve 14:30 kayboluyordu
        isl = isletme_ile(adim_dk=90)
        self.assertEqual(saatler(isl, "sac-kesimi", date(2026, 11, 10)),
                         ["10:00", "11:30", "14:00", "15:30", "17:00", "18:30"])

    def test_gece_yarisi_kapanisi(self):  # regresyon: halı saha 24:00'e kadar açık olabilmeli
        veri = ornek_sozluk()
        veri["calisma_saatleri"]["salı"] = ["17:00-24:00"]
        veri["hizmetler"] = [{"kod": "saha", "ad": "Halı saha", "sure_dk": 60, "fiyat_tl": 2000}]
        veri["adim_dk"] = 60
        isl = isletme_ile(**veri)
        self.assertEqual(saatler(isl, "saha", date(2026, 11, 10))[-1], "23:00")


class YapilandirmaDogrulamaTesti(unittest.TestCase):
    def test_hatali_degerler_acilista_reddedilir(self):
        hatalar = {
            "adim 0": {"adim_dk": 0},  # eskiden ZeroDivisionError
            "adim negatif": {"adim_dk": -15},  # eskiden sonsuz döngü
            "en_gec_gun 0": {"en_gec_gun": 0},
            "saklama metin": {"saklama_gun": "180"},
            "saat dilimi": {"saat_dilimi": "Mars/Olympus"},
            "sahip metin": {"sahip_sohbet_id": "123"},
            "kaynak tekrar": {"kaynaklar": ["Murat", "Murat"]},
        }
        for ad, degisiklik in hatalar.items():
            with self.subTest(ad=ad), self.assertRaises(ValueError):
                isletme_ile(**degisiklik)

    def test_hatali_hizmet_ve_saatler(self):
        def hizmetli(**h):
            temel = {"kod": "kesim", "ad": "Kesim", "sure_dk": 30, "fiyat_tl": 100}
            temel.update(h)
            return {"hizmetler": [temel]}

        hatalar = {
            "süre 0": hizmetli(sure_dk=0),
            "kod boşluk": hizmetli(kod="saç kesimi"),
            "kod kabuk": hizmetli(kod="a;rm"),
            "fiyat negatif": hizmetli(fiyat_tl=-5),
            "fiyat metin": hizmetli(fiyat_tl="400"),
        }
        for ad, degisiklik in hatalar.items():
            with self.subTest(ad=ad), self.assertRaises(ValueError):
                isletme_ile(**degisiklik)
        for aralik in ("17:00-00:00", "18:00-02:00", "24:30-25:00", "10-12", "13:00-14:00 15:00"):
            veri = ornek_sozluk()
            veri["calisma_saatleri"]["salı"] = [aralik]
            with self.subTest(aralik=aralik), self.assertRaises(ValueError):
                isletme_ile(**veri)
        veri = ornek_sozluk()
        veri["calisma_saatleri"]["salı"] = ["10:00-13:00", "12:00-15:00"]  # çakışan aralıklar
        with self.assertRaises(ValueError):
            isletme_ile(**veri)

    def test_fiyatsiz_hizmet_none_yazmaz(self):
        h = isletme_ile(hizmetler=[{"kod": "muayene", "ad": "Muayene", "sure_dk": 30, "fiyat_tl": None}]).hizmetler[0]
        self.assertEqual(h.fiyat_metni(), "fiyatı işletmeye sorulmalı")


class SaatDilimiTesti(unittest.TestCase):
    def test_utc_sunucuda_istanbul_saati(self):  # regresyon: datetime.now() sunucu (UTC) saatini veriyordu
        utc = datetime(2026, 11, 9, 13, 27, 45, tzinfo=timezone.utc)
        self.assertEqual(yerel_saat("Europe/Istanbul", lambda: utc)(), datetime(2026, 11, 9, 16, 27))
        gece = datetime(2026, 11, 9, 22, 30, tzinfo=timezone.utc)  # İstanbul'da ertesi gün 01:30
        self.assertEqual(yerel_saat("Europe/Istanbul", lambda: gece)().date(), date(2026, 11, 10))

    def test_bilinmeyen_saat_dilimi(self):
        with self.assertRaises(ValueError):
            saat_dilimi("Bilinmeyen/Yer")


if __name__ == "__main__":
    unittest.main()
