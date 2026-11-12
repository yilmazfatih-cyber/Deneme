import unittest

from ihale_analizci.bolum import Birim
from ihale_analizci.cikaricilar import (
    Bulgu,
    cezai_sartlar,
    eksik_kontroller,
    istenen_belgeler,
    kurallari_uygula,
    odeme_kosullari,
    tarih_ve_sureler,
    teminatlar,
)


def birim(metin: str, bolum: str = "Madde 1 - Genel") -> Birim:
    return Birim("sartname.pdf", bolum, None, 1, metin)


def ozet(bulgular):
    return [(b.baslik, b.deger) for b in bulgular]


class TarihTesti(unittest.TestCase):
    def test_ihale_tarihi_ve_saati(self):
        b = tarih_ve_sureler(birim("4.2. İhale tarihi ve saati: 15.12.2026 - 10:30"))
        self.assertEqual(ozet(b), [("İhale (son teklif) tarihi", "15.12.2026 10:30")])

    def test_ay_adiyla_tarih_ve_buyuk_harf(self):
        b = tarih_ve_sureler(birim("SON TEKLİF VERME TARİHİ 5 ŞUBAT 2027 SAAT 14.00"))
        self.assertEqual(ozet(b), [("İhale (son teklif) tarihi", "05.02.2027 14:00")])

    def test_ekli_sure_ve_gecerlilik_onceligi(self):
        b = tarih_ve_sureler(birim("Tekliflerin geçerlilik süresi, ihale tarihinden itibaren 90 (doksan) takvim günüdür."))
        self.assertEqual(ozet(b), [("Teklif geçerlilik süresi", "90 takvim günü")])

    def test_sure_olmayan_sayi_ve_baglamsiz_tarih_atilir(self):
        self.assertEqual(tarih_ve_sureler(birim("Belgeler 2 ayrı nüsha halinde verilir.", "Madde 9 - Teklif")), [])
        self.assertEqual(tarih_ve_sureler(birim("Basım: 01.01.2026", "Madde 2 - Konu")), [])

    def test_bolum_basligi_etiket_verir(self):
        b = tarih_ve_sureler(birim("15.12.2026 - 10:30", "Madde 4 - İhale tarihi ve saati"))
        self.assertEqual(ozet(b), [("İhale (son teklif) tarihi", "15.12.2026 10:30")])

    def test_odeme_suresi_tarih_sayilmaz(self):
        self.assertEqual(tarih_ve_sureler(birim("Muayene ve kabulden sonra 30 gün içinde ödenir.")), [])

    def test_saat_en_yakin_tarihe_baglanir(self):
        # Eskiden saat cümledeki İLK tarihe ekleniyordu: "10.12.2026 10:30, 15.12.2026".
        metin = "Dokümanlar 10.12.2026 tarihine kadar alınır, ihale 15.12.2026 saat 10:30'da yapılır."
        b = tarih_ve_sureler(birim(metin, "Madde 4 - İhale tarihi"))
        self.assertEqual(ozet(b), [("İhale (son teklif) tarihi", "10.12.2026, 15.12.2026 10:30")])

    def test_uzaktaki_olcek_saat_sayilmaz(self):
        b = tarih_ve_sureler(birim("Projeler 1:50 ölçekli çizilir; son teslim tarihi 15.12.2026 olarak belirlenmiştir."))
        self.assertEqual(ozet(b), [("Teslim süresi", "15.12.2026")])

    def test_takvimde_olmayan_tarih_uyarilir(self):
        b = tarih_ve_sureler(birim("İhale tarihi: 31.02.2027"))
        self.assertEqual(ozet(b), [("İhale (son teklif) tarihi", "31.02.2027")])
        self.assertIn("takvimde olmayan", b[0].uyari)

    def test_tireli_tarih(self):
        self.assertEqual(ozet(tarih_ve_sureler(birim("İhale tarihi 05-02-2027"))), [("İhale (son teklif) tarihi", "05.02.2027")])

    def test_yil_adi_sure_sayilmaz(self):
        self.assertEqual(tarih_ve_sureler(birim("2026 yılı birim fiyatları esas alınır.", "Madde 3 - Süreler")), [])

    def test_odeme_sozcugu_tarihi_silmez(self):
        # Eskiden cümlede "avans" geçtiği için tarih hiç aranmıyordu.
        b = tarih_ve_sureler(birim("Teminat mektubunun geçerlilik tarihi 15.04.2027 olmalı; avans teminatı ayrıca istenir."))
        self.assertEqual(ozet(b), [("Teminat mektubu geçerlilik tarihi", "15.04.2027")])


class TeminatTesti(unittest.TestCase):
    def test_gecici_teminat_orani(self):
        b = teminatlar(birim("Teklif edilen bedelin %3'ünden az olmamak üzere geçici teminat verilir."))
        self.assertEqual(ozet(b), [("Geçici teminat", "%3")])
        self.assertEqual(b[0].uyari, "")

    def test_yaziyla_oran_ve_mevzuat_uyarisi(self):
        b = teminatlar(birim("Geçici teminat yüzde iki oranında alınır."))
        self.assertEqual(ozet(b), [("Geçici teminat", "%2")])
        self.assertIn("md. 33", b[0].uyari)

    def test_bilesik_yaziyla_oran(self):
        # Eskiden "yüzde on beş" %10 okunuyor, ardından gelen "%15" yok sayılıyordu.
        b = teminatlar(birim("Ek kesin teminat yüzde on beş (%15) oranındadır."))
        self.assertEqual(ozet(b), [("Ek kesin teminat", "%15")])

    def test_bucuklu_oran(self):
        b = teminatlar(birim("Geçici teminat yüzde iki buçuk oranında alınır."))
        self.assertEqual(ozet(b), [("Geçici teminat", "%2,5")])
        self.assertIn("md. 33", b[0].uyari)

    def test_ek_kesin_ve_kesin_ayri_sayilir(self):
        b = teminatlar(birim("Kesin teminat %6, ek kesin teminat ise %4 oranındadır."))
        self.assertEqual(ozet(b), [("Kesin teminat", "%6"), ("Ek kesin teminat", "%4")])

    def test_gecerken_anilan_teminat_atilir(self):
        self.assertEqual(teminatlar(birim("Geçici teminat iade edilir.", "Madde 9 - Teklifler")), [])

    def test_oransiz_tekrar_ayni_belgede_oran_varsa_atilir(self):
        bulgular = kurallari_uygula(
            [
                birim("Bedelin %3'ü kadar geçici teminat verilir.", "Madde 26 - Geçici teminat"),
                birim("Geçici teminat mektubu banka onaylı olmalıdır.", "Madde 26 - Geçici teminat"),
            ]
        )
        self.assertEqual([b.deger for b in bulgular if b.kategori == "teminat"], ["%3"])


class BelgeCezaOdemeTesti(unittest.TestCase):
    def test_belge_bolumunde_belge(self):
        b = istenen_belgeler(birim("c) İmza sirküleri.", "Madde 7 - Gerekli belgeler"))
        self.assertEqual(ozet(b), [("İmza sirküleri.", "")])

    def test_belge_bolumu_disinda_talep_fiili_gerekir(self):
        self.assertTrue(istenen_belgeler(birim("ISO 9001 belgesinin sunulması zorunludur.")))
        self.assertEqual(istenen_belgeler(birim("Belgeler idarede saklanır.")), [])

    def test_gecikme_cezasi_binde(self):
        b = cezai_sartlar(birim("Gecikilen her gün için sözleşme bedelinin binde 1 oranında gecikme cezası uygulanır."))
        self.assertEqual(ozet(b), [("Gecikme cezası", "binde 1")])

    def test_yaziyla_binde_oran(self):
        b = cezai_sartlar(birim("Gecikilen her gün için sözleşme bedelinin binde bir oranında gecikme cezası kesilir."))
        self.assertEqual(ozet(b), [("Gecikme cezası", "binde 1")])

    def test_olumsuz_ve_kosullu_ceza(self):
        self.assertEqual(ozet(cezai_sartlar(birim("Bu işte gecikme cezası uygulanmayacaktır."))), [("Gecikme cezası", "yok")])
        b = cezai_sartlar(birim("Mücbir sebep hallerinde gecikme cezası uygulanmaz."))
        self.assertEqual(ozet(b), [("Gecikme cezası", "koşula bağlı")])
        self.assertIn("koşula", b[0].uyari)

    def test_fesih_onceliklidir(self):
        b = cezai_sartlar(birim("Gecikme 20 günü geçerse idare sözleşmeyi feshederek teminatı gelir kaydeder."))
        self.assertEqual(ozet(b), [("Fesih", "")])

    def test_gelir_kaydeder(self):
        b = cezai_sartlar(birim("İdare kesin teminatı gelir kaydeder."))
        self.assertEqual(ozet(b), [("Teminatın gelir kaydı", "")])

    def test_odeme_kosullari(self):
        self.assertEqual(ozet(odeme_kosullari(birim("Bu ihalede fiyat farkı verilmeyecektir."))), [("Fiyat farkı", "yok")])
        b = odeme_kosullari(birim("Bedel, kabulü izleyen 30 (otuz) gün içinde yükleniciye ödenir."))
        self.assertEqual(ozet(b), [("Ödeme", "30 gün içinde")])

    def test_olumsuzluk_kendi_konusuna_baglidir(self):
        # Eskiden cümlede herhangi bir olumsuz fiil varsa ilk konu "yok" sayılıyordu.
        ornekler = {
            "Avans verilmeyecek, ancak fiyat farkı verilecektir.": [("Fiyat farkı", "var"), ("Avans", "yok")],
            "Fiyat farkı hesaplanacak, avans ise verilmeyecektir.": [("Fiyat farkı", "var"), ("Avans", "yok")],
            "Fiyat farkı ve avans verilmeyecektir.": [("Fiyat farkı", "yok"), ("Avans", "yok")],
        }
        for metin, beklenen in ornekler.items():
            self.assertEqual(ozet(odeme_kosullari(birim(metin))), beklenen, metin)

    def test_odeme_suresi_birimi_ve_icerisinde(self):
        self.assertEqual(ozet(odeme_kosullari(birim("Hakediş bedeli 30 gün içerisinde ödenir."))), [("Hakediş", "30 gün içinde")])
        # Katlanınca "işe" ile "ise" aynı yazılır; "işe başlama" yan cümleyi bölmemeli.
        metin = "Hakediş bedeli işe başlamadan sonra 30 gün içinde ödenir."
        self.assertEqual(ozet(odeme_kosullari(birim(metin))), [("Hakediş", "30 gün içinde")])
        # "5 iş günü" ile "5 gün" aynı şey değildir.
        self.assertEqual(ozet(odeme_kosullari(birim("Fatura bedeli 5 iş günü içinde ödenir."))), [("Ödeme", "5 iş günü içinde")])

    def test_eksik_kontroller(self):
        bulgular = teminatlar(birim("Bedelin %3'ü geçici teminat olarak alınır."))
        eksikler = eksik_kontroller(bulgular)
        self.assertIn(("teminat", "Kesin teminat"), eksikler)
        self.assertNotIn(("teminat", "Geçici teminat"), eksikler)
        self.assertIn(("belge", "İstenen belgeler"), eksikler)

    def test_eksik_kontrol_yazim_farkina_duyarsiz(self):
        bulgu = Bulgu("teminat", "Geçici Teminat", "%3", birim("x"), yontem="llm")
        self.assertNotIn(("teminat", "Geçici teminat"), eksik_kontroller([bulgu]))


if __name__ == "__main__":
    unittest.main()
