import dataclasses
import threading
import unittest
from datetime import datetime, timedelta, timezone

from esnaf.depo import Depo, OturumBulunamadi
from esnaf.yonlendirici import Yonlendirici, _numara, _onay_cevabi
from esnaf.zaman import yerel_saat
from tests.yardimci import isletme, yonlendirici

A, B, SAHIP = 101, 202, 999


class AkisTabani(unittest.TestCase):
    def setUp(self):
        self.isletme = dataclasses.replace(isletme(), sahip_sohbet_id=SAHIP)
        self.y = yonlendirici(self, self.isletme)

    def yaz(self, metin, kisi=A):
        return self.y.isle(kisi, metin, "Ayşe")

    def metin(self, metin, kisi=A):
        return "\n".join(g.metin for g in self.yaz(metin, kisi) if g.sohbet_id == kisi)

    def aktif(self, kisi=A):
        return [r["baslangic"] for r in self.y.depo.kisinin_randevulari(kisi, self.y.saat())]

    def randevu_al(self, saat="15:00", kisi=A):
        self.yaz(f"yarın {saat} saç kesimi", kisi)
        return self.metin("evet", kisi)


class AkisTesti(AkisTabani):
    def test_aydinlatma_ilk_mesajda_bir_kez(self):
        ilk = self.yaz("merhaba")
        self.assertIn("KVKK md. 10", ilk[0].metin)
        self.assertIn("en çok 30 gün", ilk[0].metin)  # devir mesajının saklama süresi açıkça yazılır
        self.assertNotIn("KVKK md. 10", self.metin("merhaba"))

    def test_randevu_onay_ve_sahibe_bildirim(self):
        self.yaz("merhaba")
        self.assertIn("Onaylıyor musunuz", self.metin("yarın 15:00 saç kesimi için randevu"))
        gidenler = self.yaz("evet")
        self.assertIn("Randevunuz oluşturuldu", gidenler[0].metin)
        self.assertEqual(gidenler[-1].sohbet_id, SAHIP)
        self.assertIn("10 Kasım Salı 15:00", self.metin("randevularım"))

    def test_dolu_saatte_en_yakin_secenekler(self):
        for kisi in (A, B):  # iki koltuk da 15:00'te dolsun
            self.randevu_al(kisi=kisi)
        yanit = self.metin("yarın 15:00 saç kesimi", 303)
        self.assertIn("15:00 uygun değil", yanit)
        self.assertIn("14:30", yanit)
        self.assertIn("Onaylıyor", self.metin("1", 303))

    def test_ayni_anda_onay_cakismasi(self):
        tek = yonlendirici(self, dataclasses.replace(self.isletme, kaynaklar=("Murat",)))
        for kisi in (A, B):
            tek.isle(kisi, "yarın 15:00 saç kesimi")
        self.assertIn("oluşturuldu", tek.isle(A, "evet")[0].metin)
        yanit = "\n".join(g.metin for g in tek.isle(B, "evet"))
        self.assertIn("az önce doldu", yanit)
        self.assertIn("15:30", yanit)

    def test_degistir(self):
        self.randevu_al()
        self.assertIn("Hangi randevuyu değiştirelim", self.metin("değiştirmek istiyorum"))
        self.assertIn("boş saatler", self.metin("1"))
        self.metin("cumartesi")
        self.metin("1")
        self.assertIn("güncellendi", self.metin("evet"))
        self.assertEqual(self.aktif(), ["2026-11-14T09:00"])

    def test_vazgecme_ve_bayat_oturum(self):
        self.yaz("randevu")
        self.assertIn("bıraktım", self.metin("vazgeç"))
        self.yaz("randevu")
        self.y.saat_ayari["an"] += timedelta(hours=2)  # 30 dakikadan eski oturum unutulur
        self.assertIn("Tam anlayamadım", self.metin("2"))

    def test_veri_silme(self):
        self.randevu_al()
        self.yaz("verilerimi sil")
        gidenler = self.yaz("Evet, sil")
        self.assertIn("silindi", gidenler[0].metin)
        self.assertIn("1 aktif randevu boşaldı", gidenler[-1].metin)  # işletme boşalan saati bilsin
        self.assertEqual(self.aktif(), [])
        self.assertIn("KVKK md. 10", self.metin("merhaba"))  # kayıt silindiği için yeniden gösterilir

    def test_hassas_sektor_uyarisi(self):
        klinik = yonlendirici(self, dataclasses.replace(self.isletme, hassas_veri=True))
        self.assertIn("sağlık durumunuzla", klinik.isle(A, "merhaba")[0].metin)

    def test_kimlik_komutu(self):
        self.assertIn(f"Sohbet kimliğiniz: {A}", self.metin("/kimlik"))


class OnayTesti(AkisTabani):
    def test_olumsuz_cevap_randevu_kurmaz(self):  # regresyon (Engel): "uygun değil" randevu kuruyordu
        for cevap in ("uygun değil", "hayır", "Hayır, istemiyorum", "olmaz", "vazgeç", "gerek yok"):
            with self.subTest(cevap=cevap):
                y = yonlendirici(self, self.isletme)
                y.isle(A, "yarın 15:00 saç kesimi")
                self.assertIn("randevu oluşturmadım", "\n".join(g.metin for g in y.isle(A, cevap)))
                self.assertEqual(y.depo.kisinin_randevulari(A, y.saat()), [])

    def test_saatli_ret_yeni_saat_onerir(self):  # regresyon: "hayır, 4'e olsun" 15:00'i kuruyordu
        for cevap, saat in (("hayır, 4'e olsun", "16:00"), ("yok 5'e alalım", "17:00"), ("evet ama 16:00 olsun", "16:00")):
            with self.subTest(cevap=cevap):
                y = yonlendirici(self, self.isletme)
                y.isle(A, "yarın 15:00 saç kesimi")
                yanit = "\n".join(g.metin for g in y.isle(A, cevap))
                self.assertIn(f"10 Kasım Salı {saat}. Onaylıyor musunuz?", yanit)
                self.assertEqual(y.depo.kisinin_randevulari(A, y.saat()), [])

    def test_onayda_baska_gun_istenirse_yeniden_onerir(self):  # "cuma" -ma ile biter ama ret değildir
        self.yaz("yarın 15:00 saç kesimi")
        self.assertIn("13 Kasım Cuma 15:00. Onaylıyor", self.metin("cuma olsun"))
        self.assertEqual(self.aktif(), [])

    def test_sahip_komutu_satir_sonuyla(self):
        self.yaz("yetkili")
        no = self.y.depo.acik_devirler()[0]["id"]
        gidenler = self.y.isle(SAHIP, f"/yanit\n{no}\nTamam, bekliyoruz.")
        self.assertEqual(gidenler[0].sohbet_id, A)

    def test_belirsiz_cevapta_soru_yinelenir(self):
        self.yaz("yarın 15:00 saç kesimi")
        self.assertIn("yalnız 'Evet' ya da 'Hayır'", self.metin("hmm bilemedim"))
        self.assertEqual(self.aktif(), [])
        self.assertIn("oluşturuldu", self.metin("sorun yok"))

    def test_onay_cevabi_sozlugu(self):
        beklenen = {"evet": "evet", "e": "evet", "olur": "evet", "tamam, olur": "evet", "Evet lütfen": "evet",
                    "\U0001f44d": "evet", "sorun yok": "evet", "hayır": "hayir", "uygun değil": "hayir",
                    "istemiyorum": "hayir", "tamam, silmeyin": None, "evet ama": None, "4'e": None, "": None}
        for metin, cevap in beklenen.items():
            with self.subTest(metin=metin):
                self.assertEqual(_onay_cevabi(metin), cevap)

    def test_veri_silmede_olumsuzluk_silmez(self):  # regresyon (Engel): "hayır ..." tüm kayıtları siliyordu
        self.randevu_al()
        for cevap in ("hayır, uygun değil", "tamam, silmeyin", "hayır silmeyin, yarın 3'e randevum var"):
            with self.subTest(cevap=cevap):
                self.yaz("verilerimi sil")
                self.assertNotIn("silindi", self.metin(cevap))
                self.assertEqual(len(self.aktif()), 1)
                self.y.depo.oturum_sil(A)

    def test_iptal_onay_ister(self):  # regresyon (Engel): "geliyorum" + "1 dk" randevuyu iptal ediyordu
        self.randevu_al()
        self.assertNotIn("iptal", self.metin("tamam geliyorum").lower())
        self.assertIn("iptal edeyim mi", self.metin("iptal"))
        self.assertNotIn("iptal edildi", self.metin("1 dk sonra oradayım"))
        self.assertEqual(len(self.aktif()), 1)
        self.assertIn("duruyor", self.metin("Hayır, kalsın"))
        self.metin("gelemeyeceğim")
        gidenler = self.yaz("Evet, iptal et")
        self.assertIn("iptal edildi", gidenler[0].metin)
        self.assertEqual(gidenler[-1].sohbet_id, SAHIP)
        self.assertEqual(self.aktif(), [])

    def test_birden_fazla_randevuda_secim_sonra_onay(self):
        self.randevu_al("15:00")
        self.randevu_al("17:00")
        self.assertIn("Hangi randevuyu iptal edelim", self.metin("iptal"))
        self.assertIsNone(_numara("2 dakika bekleyin", 2))
        self.assertIn("17:00 randevunuzu iptal edeyim mi", self.metin("2"))
        self.assertIn("iptal edildi", self.metin("evet"))
        self.assertEqual(self.aktif(), ["2026-11-10T15:00"])

    def test_numara_yalniz_tam_mesajda(self):  # regresyon: "2.15'e alalım" 2. seçenek sayılıyordu
        for metin, no in (("2", 2), ("2)", 2), ("2. seçenek", 2), ("3) 10.11 15:00", 3), ("2'yi", 2)):
            with self.subTest(metin=metin):
                self.assertEqual(_numara(metin, 6), no)
        for metin in ("1.30", "2.15'e alalım", "2 dakika bekleyin", "1 dk sonra", "7", ""):
            with self.subTest(metin=metin):
                self.assertIsNone(_numara(metin, 6))

    def test_hizmet_seciminde_saat_numara_sayilmaz(self):  # regresyon: "2.30'a" Sakal tıraşını seçiyordu
        self.yaz("yarın randevu")
        yanit = self.metin("2.30'a")
        self.assertNotIn("Sakal", yanit)
        self.assertIn("Anlayamadım", yanit)


class OneriTesti(AkisTabani):
    def test_tarihsiz_saat_listelenen_gune_uygulanir(self):  # regresyon: cuma listesinde "16:30" bugüne gidiyordu
        self.assertIn("13 Kasım Cuma", self.metin("cuma saç kesimi"))
        self.assertIn("13 Kasım Cuma 16:30. Onaylıyor", self.metin("16:30 olur mu"))

    def test_ufuk_disi_tarih_dolu_denmez(self):  # regresyon: boş takvimde "14 gün dolu" deniyordu
        yanit = self.metin("5 ocakta saç kesimi")
        self.assertIn("5 Ocak 2027 Salı için henüz randevu vermiyoruz", yanit)
        self.assertIn("boş saatler", yanit)
        self.assertNotIn("dolu", yanit)


class SinirTesti(AkisTabani):
    def test_ayni_saatte_ikinci_randevu_ve_azami(self):  # regresyon: bir sohbet takvimi doldurabiliyordu
        self.assertIn("oluşturuldu", self.randevu_al("15:00"))
        self.assertIn("çakışan bir randevunuz", self.randevu_al("15:00"))
        self.assertIn("oluşturuldu", self.randevu_al("16:00"))
        self.assertIn("En fazla 2 aktif randevu", self.randevu_al("17:00"))
        self.assertEqual(self.aktif(), ["2026-11-10T15:00", "2026-11-10T16:00"])

    def test_degisiklik_sinira_takilmaz(self):
        self.randevu_al("15:00")
        self.randevu_al("16:00")
        self.metin("değiştir")
        self.metin("1")
        self.metin("cumartesi")
        self.metin("1")
        self.assertIn("güncellendi", self.metin("evet"))

    def test_eszamanli_cift_evet_tek_randevu(self):  # regresyon: iki iş parçacığı iki koltuğu kapatıyordu
        self.yaz("yarın 15:00 saç kesimi")
        sonuc = []
        isler = [threading.Thread(target=lambda: sonuc.append(self.metin("evet"))) for _ in range(2)]
        for i in isler:
            i.start()
        for i in isler:
            i.join()
        self.assertEqual(sum("oluşturuldu" in s for s in sonuc), 1)
        self.assertEqual(len(self.aktif()), 1)

    def test_onay_oturumu_islem_icinde_tuketilir(self):  # iki süreç aynı veritabanını kullansa bile
        self.yaz("yarın 15:00 saç kesimi")
        bas = datetime(2026, 11, 10, 15)
        depo = self.y.depo
        depo.randevu_ekle(A, "sac-kesimi", bas, bas + timedelta(minutes=30), lambda d: "Murat", self.y.saat(),
                          oturum_durumu="onay")
        with self.assertRaises(OturumBulunamadi):
            depo.randevu_ekle(A, "sac-kesimi", bas, bas + timedelta(minutes=30), lambda d: "Can", self.y.saat(),
                              oturum_durumu="onay")
        self.assertEqual(len(self.aktif()), 1)


class SaatDilimiAkisTesti(unittest.TestCase):
    def test_utc_sunucuda_gecmis_saat_onerilmez(self):  # regresyon (Engel): UTC sunucuda bot 3 saat geride kalıyordu
        utc = datetime(2026, 11, 9, 13, 27, tzinfo=timezone.utc)  # İstanbul'da 16:27
        depo = Depo()
        self.addCleanup(depo.kapat)
        y = Yonlendirici(isletme(), depo, saat=yerel_saat("Europe/Istanbul", lambda: utc))
        yanit = "\n".join(g.metin for g in y.isle(A, "bugün 15:00 sakal"))
        self.assertIn("9 Kasım Pazartesi 15:00 uygun değil", yanit)
        self.assertNotIn("Onaylıyor", yanit)


class DevirVeSahipTesti(AkisTabani):
    def test_insan_devri_ve_yanit(self):
        gidenler = self.yaz("yetkiliyle görüşmek istiyorum, fatura lazım")
        self.assertIn("yanıtı bu sohbetten alacaksınız", gidenler[-2].metin)
        self.assertIn("fatura lazım", gidenler[-1].metin)
        self.assertEqual(gidenler[-1].sohbet_id, SAHIP)
        no = self.y.depo.acik_devirler()[0]["id"]
        cevap = self.y.isle(SAHIP, f"/yanıt {no} Faturanız e-postanıza gönderildi.")
        self.assertEqual((cevap[0].sohbet_id, cevap[0].metin),
                         (A, "Makas Berber yetkilisi: Faturanız e-postanıza gönderildi."))
        self.assertIn("kapatıldı", cevap[1].metin)
        self.assertEqual(self.y.depo.acik_devirler(), [])  # mesaj metni de silindi

    def test_kapanan_devrin_mesaji_silinir(self):  # regresyon (Engel): kapalı devir mesajı 180 gün kalıyordu
        self.yaz("yetkiliyle görüşmek istiyorum, dişim ağrıyor")
        no = self.y.depo.acik_devirler()[0]["id"]
        self.assertTrue(self.y.depo.devir_kapat(no))
        self.assertEqual(self.y.depo._sorgu("SELECT * FROM devirler"), [])

    def test_acik_devir_suresi_dolunca_silinir(self):
        self.yaz("yetkiliyle görüşmek istiyorum")
        depo = self.y.depo
        self.assertEqual(depo.temizle(180, self.y.saat() + timedelta(days=29))["devirler"], 0)
        self.assertEqual(depo.temizle(180, self.y.saat() + timedelta(days=31))["devirler"], 1)

    def test_hassas_modda_devir_metni_saklanmaz(self):
        klinik = yonlendirici(self, dataclasses.replace(self.isletme, hassas_veri=True))
        gidenler = klinik.isle(A, "yetkili lütfen, dişim ağrıyor")
        self.assertIn("dişim ağrıyor", gidenler[-1].metin)  # işletmeye iletilir
        self.assertEqual(klinik.depo.acik_devirler()[0]["mesaj"], "")  # ama veritabanına yazılmaz

    def test_sahip_komutlari(self):
        self.randevu_al()
        self.assertIn("Saç kesimi (Ayşe)", "\n".join(g.metin for g in self.y.isle(SAHIP, "/randevular yarın")))
        rid = self.y.depo.gunun_randevulari("2026-11-10")[0]["id"]
        gidenler = self.y.isle(SAHIP, f"/iptal {rid}")
        self.assertEqual(gidenler[0].sohbet_id, A)  # müşteriye haber verilir
        self.assertIn("işletme tarafından iptal edildi", gidenler[0].metin)
        self.assertEqual(self.aktif(), [])
        self.assertIn("Açık talep yok", self.y.isle(SAHIP, "/devirler")[0].metin)

    def test_sahip_olmayan_komut_kullanamaz(self):
        self.yaz("yetkili")
        no = self.y.depo.acik_devirler()[0]["id"]
        gidenler = self.y.isle(B, f"/yanit {no} merhaba")
        self.assertTrue(all(g.sohbet_id == B for g in gidenler))
        self.assertEqual(len(self.y.depo.acik_devirler()), 1)

    def test_sahipsiz_kurulum_yanlis_soz_vermez(self):
        y = yonlendirici(self, isletme())
        yanit = "\n".join(g.metin for g in y.isle(A, "yetkili"))
        self.assertNotIn("bu sohbetten", yanit)
        self.assertIn("+90 216 000 00 00", yanit)


class SahteAjan:
    def __init__(self, yanit=("", None), hata=None):
        self.yanit, self.hata = yanit, hata

    def yanitla(self, metin):
        if self.hata:
            raise self.hata
        return self.yanit


class DilModeliYedegiTesti(unittest.TestCase):
    def test_model_randevu_eylemi_akisi_baslatir(self):
        ajan = SahteAjan(("", {"eylem": "randevu", "hizmet": "sakal", "tarih": "2026-11-10"}))
        y = yonlendirici(self, ajan=ajan)
        yanit = "\n".join(g.metin for g in y.isle(A, "kafama göre bir şey yapın ama yarın"))
        self.assertIn("Sakal tıraşı için boş saatler", yanit)
        self.assertIn("10 Kasım Salı", yanit)

    def test_model_kapaliysa_kural_tabanli_yanit(self):
        import http.client

        for hata in (ConnectionRefusedError(), http.client.IncompleteRead(b"x", 10)):  # ikincisi eskiden sızıyordu
            with self.subTest(hata=type(hata).__name__):
                y = yonlendirici(self, ajan=SahteAjan(hata=hata))
                with self.assertLogs("esnaf.yonlendirici", "WARNING"):
                    self.assertIn("Tam anlayamadım", y.isle(A, "qwerty asdf")[-1].metin)


if __name__ == "__main__":
    unittest.main()
