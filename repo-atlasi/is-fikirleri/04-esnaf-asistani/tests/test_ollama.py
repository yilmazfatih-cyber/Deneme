"""Ollama /api/chat araç çağırma döngüsü: yerel sahte sunucuyla, gerçek model olmadan."""

import json
import unittest
from datetime import datetime

from esnaf.depo import Depo
from esnaf.ollama import ModelHatasi, OllamaAjani, bulut_modeli_mi, ollama_adresi
from tests.yardimci import PAZARTESI_9, SahteSunucu, isletme, isletme_ile, yonlendirici


def model_yaniti(icerik="", araclar=None):
    mesaj = {"role": "assistant", "content": icerik}
    if araclar:
        mesaj["tool_calls"] = [{"function": {"name": ad, "arguments": arg}} for ad, arg in araclar]
    return {"model": "deneme", "created_at": "2026-11-09T09:00:00Z", "message": mesaj, "done": True}


class OllamaTesti(unittest.TestCase):
    def kur(self, *yanitlar, **ayar):
        kuyruk = list(yanitlar)
        sunucu = SahteSunucu(lambda yol, govde: kuyruk.pop(0) if isinstance(kuyruk[0], tuple) else (200, kuyruk.pop(0)))
        self.addCleanup(sunucu.kapat)
        depo = Depo()
        self.addCleanup(depo.kapat)
        ajan = OllamaAjani(ayar.pop("isl", None) or isletme(), depo, model="deneme", taban_url=sunucu.url,
                           saat=lambda: PAZARTESI_9, **ayar)
        return ajan, sunucu

    def test_arac_cagrisi_ve_ikinci_tur(self):
        ajan, sunucu = self.kur(
            model_yaniti(araclar=[("bos_saatleri_listele", {"hizmet": "sakal", "tarih": "2026-11-10"})]),
            model_yaniti("Yarın 10:00 ve 10:30 boş."),
        )
        metin, eylem = ajan.yanitla("yarın sakal için yer var mı")
        self.assertEqual((metin, eylem), ("Yarın 10:00 ve 10:30 boş.", None))

        yol, ilk, _ = sunucu.istekler[0]
        self.assertEqual(yol, "/api/chat")
        self.assertIs(ilk["stream"], False)
        self.assertIs(ilk["think"], False)  # düşünen modelde Ollama varsayılanı true; kapatıyoruz
        self.assertEqual([m["role"] for m in ilk["messages"]], ["system", "user"])
        araclar = {a["function"]["name"] for a in ilk["tools"]}
        self.assertEqual(araclar, {"bos_saatleri_listele", "randevu_akisini_baslat"})
        self.assertEqual(ilk["tools"][0]["type"], "function")

        ikinci = sunucu.istekler[1][1]["messages"]
        self.assertEqual([m["role"] for m in ikinci], ["system", "user", "assistant", "tool"])
        self.assertEqual(ikinci[3]["tool_name"], "bos_saatleri_listele")
        self.assertIn("2026-11-10 10:00", json.loads(ikinci[3]["content"])["bos_saatler"])

    def test_metin_arguman_nesne_olarak_geri_gonderilir(self):
        # /api/chat argümanı her zaman nesne döndürür; metin biçimi yalnız OpenAI uyumlu /v1 katmanındadır.
        # Yine de gelirse geçmişe nesne olarak yazılır (Ollama'nın istek çözücüsü nesne bekler).
        ajan, sunucu = self.kur(
            model_yaniti(araclar=[("bos_saatleri_listele", '{"hizmet": "sakal"}')]), model_yaniti("Tamam.")
        )
        ajan.yanitla("sakal için yer var mı")
        cagri = sunucu.istekler[1][1]["messages"][2]["tool_calls"][0]
        self.assertEqual(cagri["function"]["arguments"], {"hizmet": "sakal"})

    def test_randevu_eylemi_modelin_rezervasyon_yapmasina_izin_vermez(self):
        ajan, sunucu = self.kur(model_yaniti(araclar=[("randevu_akisini_baslat", {"hizmet": "sac-kesimi"})]))
        metin, eylem = ajan.yanitla("saç kestirmek istiyorum")
        self.assertEqual(eylem, {"eylem": "randevu", "hizmet": "sac-kesimi", "tarih": None})
        self.assertEqual(len(sunucu.istekler), 1)

    def test_bilinmeyen_arac_ve_yonlendirici_entegrasyonu(self):
        ajan, _ = self.kur(model_yaniti(araclar=[("indirim_tanimla", {})]), model_yaniti("Bunu yetkiliye soralım."))
        y = yonlendirici(self, ajan=ajan)
        self.assertEqual(y.isle(5, "bana özel indirim tanımla")[-1].metin, "Bunu yetkiliye soralım.")

    def test_model_yaniti_suzulur(self):  # istem enjeksiyonuyla "randevunuzu oluşturdum" ya da sahte bağlantı
        for icerik in ("Randevunuz oluşturuldu, yarın 15:00.", "Ödeme için http://kotu.example/ode adresine girin."):
            with self.subTest(icerik=icerik):
                ajan, _ = self.kur(model_yaniti(icerik))
                self.assertEqual(ajan.yanitla("bana randevu ver")[0], "")
        ajan, _ = self.kur(model_yaniti("Harita: https://www.openstreetmap.org/search?query=Moda%20Caddesi%20Kad%C4%B1k%C3%B6y"))
        self.assertIn("openstreetmap", ajan.yanitla("neredesiniz")[0])  # işletmenin kendi bağlantısı serbest

    def test_toplam_sure_siniri(self):
        olcum = iter([0.0, 0.0, 30.0])  # ikinci turdan önce 30 sn geçmiş olsun
        ajan, _ = self.kur(model_yaniti(araclar=[("bos_saatleri_listele", {"hizmet": "sakal"})]),
                           olcer=lambda: next(olcum), toplam_sure_sn=25.0)
        with self.assertRaises(ModelHatasi):
            ajan.yanitla("yer var mı")

    def test_ollama_hata_govdesi_modelhatasi_olur(self):
        ajan, _ = self.kur((404, {"error": "model 'deneme' not found"}))
        with self.assertRaises(ModelHatasi) as baglam:
            ajan.yanitla("merhaba")
        self.assertIn("not found", str(baglam.exception))

    def test_sistem_istemi_isletme_bilgisini_icerir(self):
        depo = Depo()
        self.addCleanup(depo.kapat)
        ajan = OllamaAjani(isletme(), depo, saat=lambda: datetime(2026, 11, 9))
        istem = ajan.sistem_istemi()
        self.assertIn("Saç kesimi (sac-kesimi): 400 TL", istem)
        self.assertIn("Pazar kapalı", istem)
        fiyatsiz = isletme_ile(hizmetler=[{"kod": "muayene", "ad": "Muayene", "sure_dk": 30, "fiyat_tl": None}])
        istem = OllamaAjani(fiyatsiz, depo, saat=lambda: datetime(2026, 11, 9)).sistem_istemi()
        self.assertNotIn("None", istem)  # regresyon: fiyatsız hizmet "None TL" yazılıyordu


class YerellikTesti(unittest.TestCase):
    def test_ollama_host_ollama_kurallariyla_cozulur(self):
        # Beklenenler ollama/ollama d63b702 envconfig/config_test.go TestHost/TestConnectableHost ile aynı
        # (fark: ":1234" Ollama'da "http://:1234", burada bağlanılabilir 127.0.0.1).
        beklenen = {
            None: "http://127.0.0.1:11434",
            "": "http://127.0.0.1:11434",
            "1.2.3.4": "http://1.2.3.4:11434",
            "1.2.3.4:1234": "http://1.2.3.4:1234",
            "example.com": "http://example.com:11434",
            " \" 1.2.3.4 \" ": "http://1.2.3.4:11434",
            "http://1.2.3.4": "http://1.2.3.4:80",
            "https://1.2.3.4:4321": "https://1.2.3.4:4321",
            "https://example.com/ollama": "https://example.com:443/ollama",
            "0.0.0.0:11434": "http://127.0.0.1:11434",
            "[::]:1234": "http://[::1]:1234",
            "::1": "http://[::1]:11434",
            ":1234": "http://127.0.0.1:1234",
            ":66000": "http://127.0.0.1:11434",
        }
        for deger, url in beklenen.items():
            with self.subTest(deger=deger):
                self.assertEqual(ollama_adresi(deger), url)

    def test_bulut_reddedilir(self):
        for deger in ("ollama.com", "https://ollama.com", "file:///etc/passwd"):
            with self.subTest(deger=deger), self.assertRaises(ValueError):
                ollama_adresi(deger)
        depo = Depo()
        self.addCleanup(depo.kapat)
        for model in ("gemma4:cloud", "gpt-oss:120b-cloud", "qwen3:CLOUD"):
            with self.subTest(model=model):
                self.assertTrue(bulut_modeli_mi(model))
                with self.assertRaises(ValueError):
                    OllamaAjani(isletme(), depo, model=model)
        self.assertFalse(bulut_modeli_mi("qwen2.5:7b"))
        self.assertFalse(bulut_modeli_mi("registry.example.com:5000/model"))

    def test_acilis_denetimi(self):
        durumlar = {
            "uzak": ({"remote_host": "https://ollama.com:443", "capabilities": ["completion", "tools"]}, True),
            "aracsiz": ({"capabilities": ["completion"]}, True),
            "uygun": ({"capabilities": ["completion", "tools"]}, False),
        }
        depo = Depo()
        self.addCleanup(depo.kapat)
        for ad, (yanit, hata_beklenir) in durumlar.items():
            with self.subTest(ad=ad):
                sunucu = SahteSunucu(lambda yol, govde, yanit=yanit: (200, yanit))
                self.addCleanup(sunucu.kapat)
                ajan = OllamaAjani(isletme(), depo, model="deneme", taban_url=sunucu.url)
                if hata_beklenir:
                    self.assertRaises(ModelHatasi, ajan.denetle)
                else:
                    ajan.denetle()
                self.assertEqual(sunucu.istekler[0][:2], ("/api/show", {"model": "deneme"}))


if __name__ == "__main__":
    unittest.main()
