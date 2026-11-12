import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from ihale_analizci.bolum import bolumlere_ayir
from ihale_analizci.llm import (
    SEMA,
    LLMHatasi,
    LLMYanitHatasi,
    OllamaIstemci,
    bulut_modeli_mi,
    llm_ile_cikar,
    ollama_adresi,
)

METIN = "Madde 26 - Geçici teminat\n26.1. İstekliler teklif ettikleri bedelin %3'ünden az olmamak üzere geçici teminat verir."


def sahte_gonder(maddeler, kayit, icerik=None):
    """Ollama'nın /api/show ve /api/chat yanıtını taklit eder; istekleri kayit listesine yazar."""

    def gonder(yol, govde):
        kayit.append((yol, govde))
        metin = icerik if icerik is not None else json.dumps({"maddeler": maddeler})
        return {"message": {"role": "assistant", "content": metin}, "done": True}

    return gonder


class LLMTesti(unittest.TestCase):
    def test_istek_govdesi_ollama_api_ile_uyumlu(self):
        kayit = []
        istemci = OllamaIstemci(model="deneme", gonder=sahte_gonder([], kayit))
        llm_ile_cikar(bolumlere_ayir("s.txt", METIN), istemci)
        yol, govde = kayit[0]
        self.assertEqual(yol, "/api/chat")
        self.assertEqual(govde["model"], "deneme")
        self.assertIs(govde["stream"], False)
        self.assertEqual(govde["format"], SEMA)
        self.assertEqual(govde["options"], {"temperature": 0, "num_ctx": 8192})
        self.assertEqual([m["role"] for m in govde["messages"]], ["system", "user"])
        self.assertIn('"maddeler"', govde["messages"][1]["content"])  # şema istemde de var (Ollama önerisi)

    def test_dogrulanamayan_alinti_atilir(self):
        maddeler = [
            {"kategori": "teminat", "baslik": "Geçici teminat", "deger": "%3", "alinti": "bedelin %3'ünden az olmamak üzere"},
            {"kategori": "teminat", "baslik": "Kesin teminat", "deger": "%6", "alinti": "kesin teminat %6 oranında alınır"},
            {"kategori": "uydurma", "baslik": "x", "deger": "y", "alinti": "geçici teminat verir"},
        ]
        istemci = OllamaIstemci(gonder=sahte_gonder(maddeler, []))
        sonuc = llm_ile_cikar(bolumlere_ayir("s.txt", METIN), istemci)
        self.assertEqual([(b.baslik, b.deger, b.yontem) for b in sonuc.bulgular], [("Geçici teminat", "%3", "llm")])
        self.assertEqual(sonuc.bulgular[0].birim.alt_madde, "26.1")
        self.assertEqual(sonuc.atilan, 2)

    def test_gecersiz_json_hata_verir(self):
        istemci = OllamaIstemci(gonder=lambda yol, govde: {"message": {"content": "bu JSON değil"}})
        with self.assertRaises(LLMYanitHatasi):
            istemci.json_sohbet("s", "k", SEMA)

    def test_bozuk_yanitlar_analizi_cokertmez(self):
        # Eskiden liste ya da dizge dönen yanıt AttributeError ile tüm analizi düşürüyordu.
        bolumler = bolumlere_ayir("s.txt", METIN)
        sonuc = llm_ile_cikar(bolumler, OllamaIstemci(gonder=sahte_gonder(None, [], icerik="[1, 2]")))
        self.assertEqual((sonuc.parca, sonuc.bozuk_yanit, sonuc.bulgular), (1, 1, []))
        sonuc = llm_ile_cikar(bolumler, OllamaIstemci(gonder=sahte_gonder(["metin", 5], [])))
        self.assertEqual((sonuc.atilan, sonuc.bulgular), (2, []))
        # Liste olan kategori "in KATEGORILER" denetiminde TypeError fırlatıyordu.
        madde = {"kategori": ["teminat"], "baslik": "x", "deger": "y", "alinti": "bedelin %3'ünden az olmamak"}
        sonuc = llm_ile_cikar(bolumler, OllamaIstemci(gonder=sahte_gonder([madde], [])))
        self.assertEqual((sonuc.atilan, sonuc.bulgular), (1, []))

    def test_uzun_bolum_kesilmeden_parcalanir(self):
        # Eskiden bölüm metni 6000 karakterde kesiliyor, sonrası modele hiç gitmiyordu.
        dolgu = "\n".join(f"7.{i}. Bu satır doldurma amaçlı uzun bir açıklama cümlesidir ve belge içermez." for i in range(1, 120))
        kayit = []
        llm_ile_cikar(bolumlere_ayir("s.txt", f"Madde 7 - Belgeler\n{dolgu}\n7.200. ISO 27001 belgesi sunulur."), OllamaIstemci(gonder=sahte_gonder([], kayit)))
        istemler = [g["messages"][1]["content"] for _, g in kayit]
        self.assertGreater(len(istemler), 1)
        self.assertTrue(any("27001" in i for i in istemler))
        self.assertTrue(all(len(i) < 6000 for i in istemler))

    def test_birden_cok_birime_yayilan_alinti_basladigi_birime_baglanir(self):
        md = "Madde 30 - Muayene\n30.1. Mallar teslim alınır.\n30.2. Muayene beş iş günü sürer.\n30.3. Kabul tutanağı düzenlenir."
        maddeler = [{"kategori": "tarih", "baslik": "Muayene süresi", "deger": "beş iş günü", "alinti": "sürer. 30.3. Kabul tutanağı"}]
        sonuc = llm_ile_cikar(bolumlere_ayir("s.txt", md), OllamaIstemci(gonder=sahte_gonder(maddeler, [])))
        self.assertEqual(sonuc.bulgular[0].birim.alt_madde, "30.2")  # eskiden bölümün ilk birimi (30.1)

    def test_alintida_olmayan_sayi_uyarilir(self):
        maddeler = [{"kategori": "teminat", "baslik": "Geçici teminat", "deger": "%5", "alinti": "bedelin %3'ünden az olmamak üzere"}]
        sonuc = llm_ile_cikar(bolumlere_ayir("s.txt", METIN), OllamaIstemci(gonder=sahte_gonder(maddeler, [])))
        self.assertIn("5", sonuc.bulgular[0].uyari)

    def test_adres_ollama_kuraliyla_tamamlanir(self):
        self.assertEqual(ollama_adresi("127.0.0.1:11434"), "http://127.0.0.1:11434")
        self.assertEqual(ollama_adresi("0.0.0.0"), "http://127.0.0.1:11434")
        self.assertEqual(ollama_adresi("http://localhost"), "http://localhost:80")
        self.assertEqual(ollama_adresi("[::]:11434"), "http://[::1]:11434")
        with self.assertRaises(LLMHatasi):
            ollama_adresi("ftp://127.0.0.1")

    def test_bulut_modeli_reddedilir(self):
        for ad in ["gpt-oss:120b-cloud", "qwen3.5:cloud", "kimi-k2.6:CLOUD"]:
            self.assertTrue(bulut_modeli_mi(ad), ad)
        for ad in ["qwen2.5:7b", "llama3.2", "registry.example.com:5000/model-cloud"]:
            self.assertFalse(bulut_modeli_mi(ad), ad)
        kayit = []
        with self.assertRaises(LLMHatasi):
            OllamaIstemci(model="gpt-oss:120b-cloud", gonder=sahte_gonder([], kayit)).dogrula()
        self.assertEqual(kayit, [])  # hiçbir istek gönderilmedi

    def test_api_show_uzak_model_derse_reddedilir(self):
        istemci = OllamaIstemci(model="benim-modelim", gonder=lambda yol, govde: {"remote_host": "https://ollama.com:443"})
        with self.assertRaises(LLMHatasi):
            istemci.dogrula()

    def test_yanit_uzak_sunucuda_uretildiyse_katman_durur(self):
        def gonder(yol, govde):
            return {"remote_host": "https://ollama.com:443", "message": {"content": '{"maddeler": []}'}}

        with self.assertRaises(LLMHatasi) as yakalanan:
            OllamaIstemci(gonder=gonder).json_sohbet("s", "k", SEMA)
        self.assertNotIsInstance(yakalanan.exception, LLMYanitHatasi)

    def test_yerel_ag_disi_sunucu_izinsiz_reddedilir(self):
        kayit = []
        with self.assertRaises(LLMHatasi):
            OllamaIstemci("http://8.8.8.8:11434", gonder=sahte_gonder([], kayit)).dogrula()
        self.assertEqual(kayit, [])
        OllamaIstemci("http://8.8.8.8:11434", gonder=sahte_gonder([], kayit), uzak_izni=True).dogrula()
        self.assertEqual(kayit[0][0], "/api/show")


def sunucu_baslat(isleyici):
    """isleyici(yol, govde) -> (durum, başlıklar, gövde_baytı). Gelen istekler ikinci dönüş değerindeki listededir."""
    kayit = []

    class Isleyici(BaseHTTPRequestHandler):
        def do_POST(self):
            govde = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            kayit.append((self.path, govde))
            durum, basliklar, veri = isleyici(self.path, govde)
            self.send_response(durum)
            for ad, deger in basliklar.items():
                self.send_header(ad, deger)
            self.send_header("Content-Length", str(len(veri)))
            self.end_headers()
            self.wfile.write(veri)

        do_GET = do_POST

        def log_message(self, *args):
            pass

    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
    threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
    return sunucu, kayit


def ollama_gibi(yol, govde):
    cevap = {"model": "m", "message": {"role": "assistant", "content": '{"maddeler": []}'}, "done": True}
    return (200 if yol in ("/api/chat", "/api/show") else 404), {"Content-Type": "application/json"}, json.dumps(cevap).encode()


class GercekHttpTesti(unittest.TestCase):
    def setUp(self):
        self.sunucular = []

    def tearDown(self):
        for sunucu in self.sunucular:
            sunucu.shutdown()
            sunucu.server_close()

    def baslat(self, isleyici):
        sunucu, kayit = sunucu_baslat(isleyici)
        self.sunucular.append(sunucu)
        return f"http://127.0.0.1:{sunucu.server_address[1]}", kayit

    def test_yerel_sunucuya_http_istegi(self):
        adres, kayit = self.baslat(ollama_gibi)
        istemci = OllamaIstemci(adres, "m")
        istemci.dogrula()
        self.assertEqual(istemci.json_sohbet("s", "k", SEMA), {"maddeler": []})
        self.assertEqual([yol for yol, _ in kayit], ["/api/show", "/api/chat"])

    def test_kapali_sunucu_anlasilir_hata(self):
        sunucu = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
        port = sunucu.server_address[1]
        sunucu.server_close()  # port boş: bağlantı reddedilir
        with self.assertRaises(LLMHatasi):
            OllamaIstemci(f"http://127.0.0.1:{port}", zaman_asimi=2).json_sohbet("s", "k", SEMA)

    def test_ortam_vekili_kullanilmaz(self):
        # Eskiden HTTP_PROXY tanımlıysa (NO_PROXY yoksa) belge metni vekil sunucuya gidiyordu.
        adres, ollama_kaydi = self.baslat(ollama_gibi)
        vekil, vekil_kaydi = self.baslat(ollama_gibi)
        ortam = {"HTTP_PROXY": vekil, "http_proxy": vekil, "NO_PROXY": "", "no_proxy": ""}
        with mock.patch.dict(os.environ, ortam):
            OllamaIstemci(adres, "m").json_sohbet("s", "GİZLİ TEKLİF METNİ", SEMA)
        self.assertEqual(vekil_kaydi, [])
        self.assertEqual(len(ollama_kaydi), 1)

    def test_yonlendirme_izlenmez(self):
        hedef, hedef_kaydi = self.baslat(ollama_gibi)
        adres, _ = self.baslat(lambda yol, govde: (302, {"Location": hedef + "/api/chat"}, b""))
        with self.assertRaises(LLMHatasi):
            OllamaIstemci(adres, "m").json_sohbet("s", "k", SEMA)
        self.assertEqual(hedef_kaydi, [])

    def test_json_olmayan_govde_llm_hatasidir(self):
        # Eskiden JSONDecodeError yakalanmıyor, analiz tümden düşüyordu.
        adres, _ = self.baslat(lambda yol, govde: (200, {"Content-Type": "text/html"}, b"<html>vekil</html>"))
        with self.assertRaises(LLMHatasi):
            OllamaIstemci(adres, "m").json_sohbet("s", "k", SEMA)

    def test_ollama_hata_govdesi_gosterilir(self):
        govde = json.dumps({"error": "model 'qwen2.5:7b' not found"}).encode()
        adres, _ = self.baslat(lambda yol, g: (404, {"Content-Type": "application/json"}, govde))
        with self.assertRaises(LLMHatasi) as yakalanan:
            OllamaIstemci(adres, "qwen2.5:7b").dogrula()
        self.assertIn("not found", str(yakalanan.exception))

    def test_buyuk_yanit_sinirlanir(self):
        adres, _ = self.baslat(lambda yol, govde: (200, {"Content-Type": "application/json"}, b"[" + b"0," * 5000 + b"0]"))
        with self.assertRaises(LLMHatasi):
            OllamaIstemci(adres, "m", en_buyuk_yanit=1000).json_sohbet("s", "k", SEMA)


if __name__ == "__main__":
    unittest.main()
