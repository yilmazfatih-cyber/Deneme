import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ders_notu.altyazi import Parca, ayristir, metni_coz, zaman_sn, zaman_yaz
from ders_notu.asr import ses_cikar, whisper_ile_yaz
from ders_notu.kaynak import KaynakHatasi
from ders_notu.llm import GonderimIzniHatasi, LLMHatasi, OllamaIstemci, bulut_modeli_mi
from ders_notu.ozet import Kavram, bolumlere_ayir, bosluga_cevir, bosluk_sorulari, ders_notu_olustur, onemli_cumleler

ORNEK = Path(__file__).resolve().parent.parent / "ornek" / "kesirler.vtt"


class AltyaziTesti(unittest.TestCase):
    def test_zaman_bicimleri(self):
        self.assertEqual(zaman_sn("00:04.500"), 4.5)
        self.assertEqual(zaman_sn("01:02:03,250"), 3723.25)  # SRT virgül kullanır
        self.assertEqual(zaman_yaz(3723.25), "1:02:03")
        self.assertEqual(zaman_yaz(65), "01:05")

    def test_vtt_etiket_ayar_ve_not_bloklari(self):
        parcalar = ayristir(ORNEK.read_text(encoding="utf-8"))
        self.assertEqual(len(parcalar), 12)
        self.assertEqual(parcalar[2].metin, "Kesir çizgisinin altındaki sayıya payda denir.")  # <c> atıldı
        self.assertEqual((parcalar[2].bas, parcalar[2].son), (9.0, 14.0))  # "align:start" atıldı

    def test_kayan_otomatik_altyazi_tekrari_atilir(self):
        vtt = (
            "WEBVTT\n\n00:00.000 --> 00:02.000\nmerhaba arkadaşlar\n\n"
            "00:02.000 --> 00:04.000\nmerhaba arkadaşlar\nbugün kesirler &amp; ondalık"
        )
        self.assertEqual([p.metin for p in ayristir(vtt)], ["merhaba arkadaşlar", "bugün kesirler & ondalık"])

    def test_srt(self):
        srt = (
            "1\r\n00:00:01,000 --> 00:00:03,000\r\nBirinci satır\r\n\r\n"
            "2\r\n00:00:03,000 --> 00:00:05,000\r\n<i>İkinci</i> satır\r\n"
        )
        self.assertEqual([(p.bas, p.metin) for p in ayristir(srt)], [(1.0, "Birinci satır"), (3.0, "İkinci satır")])

    def test_karsilastirma_isaretleri_korunur_satir_ici_imler_silinir(self):
        # Hata: "<[^>]+>" düzenli ifadesi "3 < 5 ve 7 > 2" içindeki "< 5 ve 7 >" kısmını etiket sanıp siliyordu.
        srt = (
            "1\n00:00:01,000 --> 00:00:03,000\n3 < 5 ve 7 > 2 doğrudur\n\n"
            "2\n00:00:03,000 --> 00:00:05,000\n<v Ayşe Hoca>Pay<br>ve <c.sari>payda</c><00:00:04.500>\n"
        )
        self.assertEqual([p.metin for p in ayristir(srt)], ["3 < 5 ve 7 > 2 doğrudur", "Pay ve payda"])

    def test_bozuk_zaman_damgasi_atlanir_ve_bildirilir(self):
        # Hata: okunamayan zaman damgası ValueError/IndexError ile tüm çalışmayı düşürüyordu.
        vtt = (
            "WEBVTT\n\n00:00.000 --> 00:02.000\nbir\n\nbozuk --> 00:04.000\niki\n\n"
            "00:04.000 -->\nüç\n\n00:05.000 --> 00:06.000\ndört"
        )
        uyarilar = []
        self.assertEqual([p.metin for p in ayristir(vtt, uyarilar)], ["bir", "dört"])
        self.assertIn("2 altyazı bloğunun", uyarilar[0])

    def test_turkce_kodlamalar_okunur(self):
        # Hata: Windows-1254 kaydedilmiş Türkçe .srt UnicodeDecodeError ile çöküyordu.
        metin = "1\r\n00:00:01,000 --> 00:00:02,000\r\nŞişli'de ığdır ve İzmir\r\n"
        self.assertEqual(metni_coz(metin.encode("utf-8")), (metin, None))
        self.assertEqual(metni_coz(b"\xef\xbb\xbf" + metin.encode("utf-8"))[0], metin)
        self.assertEqual(metni_coz(metin.encode("utf-16"))[0], metin)
        cozulen, uyari = metni_coz(metin.encode("cp1254"))
        self.assertEqual(cozulen, metin)
        self.assertIn("Windows-1254", uyari)

    def test_whisper_ciktisi_parcaya_donusur(self):
        parcalar = [{"text": " Merhaba,  dünya.", "timestamp": (0.0, 2.0)}, {"text": "Son", "timestamp": (2.0, None)}]
        sahte = lambda girdi, **kw: {"text": "x", "chunks": parcalar}  # noqa: E731
        beklenen = [Parca(0.0, 2.0, "Merhaba, dünya."), Parca(2.0, 2.0, "Son")]
        self.assertEqual(whisper_ile_yaz(Path("a.wav"), boru=sahte), beklenen)

    def test_whisper_bos_ciktida_bos_liste(self):
        # Hata: konuşma yoksa [Parca(0, 0, "")] dönüyor, boş transkriptten not üretiliyordu.
        sahte = lambda girdi, **kw: {"text": "  ", "chunks": []}  # noqa: E731
        self.assertEqual(whisper_ile_yaz(Path("a.wav"), boru=sahte), [])

    def test_whisper_hatasi_anlasilir_hataya_doner(self):
        # Hata: bozuk ses dosyasında transformers'ın ValueError'ı yığın izi olarak kullanıcıya düşüyordu.
        def bozuk(girdi, **kw):
            raise ValueError("Soundfile is either not in the correct format or is malformed.")

        with self.assertRaisesRegex(KaynakHatasi, "yazıya dökemedi"):
            whisper_ile_yaz(Path("a.wav"), boru=bozuk)

    def test_ffmpeg_yoksa_anlasilir_hata(self):
        # Hata: ffmpeg yokken FileNotFoundError yığın izi olarak kullanıcıya düşüyordu.
        with tempfile.TemporaryDirectory() as gecici, self.assertRaisesRegex(KaynakHatasi, "ffmpeg bulunamadı"):
            ses_cikar(Path(gecici) / "ders.mp4", Path(gecici), ffmpeg="olmayan-ffmpeg-programi")


class OzetTesti(unittest.TestCase):
    def setUp(self):
        self.parcalar = ayristir(ORNEK.read_text(encoding="utf-8"))

    def test_bolumleme_sinirda_keser_ve_zamani_korur(self):
        bolumler = bolumlere_ayir(self.parcalar, karakter_siniri=200)
        self.assertGreater(len(bolumler), 2)
        self.assertEqual(bolumler[0].bas, 0.0)
        self.assertEqual(bolumler[-1].son, 66.0)
        self.assertEqual(" ".join(b.metin for b in bolumler), " ".join(p.metin for p in self.parcalar))

    def test_cikarimsal_kavram_ve_soru(self):
        not_ = ders_notu_olustur("Kesirler", self.parcalar)
        self.assertEqual(not_.yontem, "çıkarımsal")
        terimler = [(k.terim, k.zaman) for k in not_.kavramlar]
        self.assertEqual(terimler[:3], [("payda", 9.0), ("Pay", 19.5), ("basit kesir", 25.0)])
        self.assertIn(("tam sayılı kesir", 37.0), terimler)
        soru = not_.sorular[0]
        self.assertEqual(soru.soru, "Kesir çizgisinin altındaki sayıya _____ denir.")
        self.assertIn(soru.cevap, soru.secenekler)

    def test_az_kavramda_acik_uclu_soru(self):
        not_ = ders_notu_olustur("x", [Parca(0, 1, "Kesrin üstündeki sayıya pay denir.")])
        self.assertEqual([(s.cevap, s.secenekler) for s in bosluk_sorulari(not_.kavramlar)], [("pay", [])])

    def test_bosluk_sorusu_cevabi_acik_birakmaz(self):
        # Hata: re.sub(..., count=1, IGNORECASE) "Paydanın" içindeki "Pay"ı boşluğa çevirip cevabı açık bırakıyordu.
        kavram = Kavram("pay", "Paydanın üstündeki sayıya pay denir.", 0.0)
        self.assertEqual(bosluk_sorulari([kavram])[0].soru, "Paydanın üstündeki sayıya _____ denir.")
        # Türkçe büyük/küçük harf: "ILIK" = "ılık", ama "ilik" başka kelimedir.
        cumle = "ILIK su, ilik değildir: ılık suya ılık su denir."
        self.assertEqual(bosluga_cevir(cumle, "ılık su"), "_____, ilik değildir: ılık suya _____ denir.")
        self.assertIsNone(bosluga_cevir("Bu cümlede yok.", "payda"))

    def test_iki_satira_bolunmus_tanim_dogru_zamani_alir(self):
        # Hata: cümle bir satırın ortasında başlayınca zaman bölüm başına (0.0) düşüyordu.
        parcalar = [
            Parca(0, 2, "Bugün kesirleri göreceğiz."),
            Parca(2, 4, "Evet. Payı paydasından"),
            Parca(4, 6, "küçük olan kesirlere basit kesir denir."),
        ]
        not_ = ders_notu_olustur("x", parcalar)
        self.assertEqual([(k.terim, k.zaman) for k in not_.kavramlar], [("basit kesir", 2.0)])

    def test_noktalamasiz_altyazi_pencerelere_bolunur(self):
        metin = " ".join(["kesir"] * 5 + ["pay payda"] * 40)
        self.assertTrue(all(len(c.split()) <= 30 for c in onemli_cumleler(metin, 3)))

    def test_llm_harita_indirgeme_ve_uydurma_suzgeci(self):
        cagrilar = []

        def gonder(yol, govde):
            cagrilar.append(govde)
            if "ana_fikirler" in govde["format"]["properties"]:
                ana = ["Payda bölünmeyi gösterir."]
                icerik = {"baslik": "Kesirlere giriş", "giris": "Pay ve payda.", "ana_fikirler": ana}
            else:
                icerik = {
                    "ozet": ["Payda, bütünün kaç parçaya bölündüğüdür."],
                    "kavramlar": [
                        {"terim": "payda", "tanim": "alttaki sayı"},
                        {"terim": "integral", "tanim": "uydurma"},
                    ],
                    "sorular": [
                        {"soru": "Alttaki sayı?", "secenekler": ["pay", "payda"], "dogru": 1},
                        {"soru": "Bozuk", "secenekler": ["a"], "dogru": 3},
                    ],
                }
            return {"message": {"content": json.dumps(icerik, ensure_ascii=False)}}

        not_ = ders_notu_olustur("Kesirler", self.parcalar, OllamaIstemci(gonder=gonder))
        self.assertEqual(not_.yontem, "llm")
        self.assertEqual(not_.baslik, "Kesirlere giriş")
        self.assertEqual([k.terim for k in not_.kavramlar], ["payda"])  # "integral" transkriptte yok
        self.assertEqual([(s.cevap, s.zaman) for s in not_.sorular], [("payda", 9.0)])
        self.assertEqual(len(cagrilar), 2)  # 1 bölüm (harita) + 1 indirgeme
        self.assertIs(cagrilar[0]["stream"], False)

    def test_llm_bozuk_yapi_cokertmez(self):
        # Hata: şemaya uymayan öğe (metin listesi, eksik alan, bool "dogru") AttributeError/KeyError ile çöküyordu.
        def gonder(yol, govde):
            if "ana_fikirler" in govde["format"]["properties"]:
                icerik = {"baslik": "", "giris": None, "ana_fikirler": "tek metin"}
            else:
                icerik = {
                    "ozet": "liste değil",
                    "kavramlar": ["payda", {"terim": "payda"}, {"terim": "payda", "tanim": "alttaki sayı"}],
                    "sorular": [
                        "metin",
                        {"soru": "Harfler?", "secenekler": "ab", "dogru": 0},
                        {"soru": "Aynı şık?", "secenekler": ["pay", "Pay"], "dogru": 0},
                        {"soru": "Mantıksal?", "secenekler": ["pay", "payda"], "dogru": True},
                    ],
                }
            return {"message": {"content": json.dumps(icerik)}}

        not_ = ders_notu_olustur("Kesirler", self.parcalar, OllamaIstemci(gonder=gonder))
        self.assertEqual((not_.yontem, not_.baslik, not_.giris), ("llm", "Kesirler", ""))
        self.assertEqual([(k.terim, k.tanim) for k in not_.kavramlar], [("payda", "alttaki sayı")])
        self.assertEqual((not_.sorular, not_.ana_fikirler), ([], []))

    def test_llm_nesne_olmayan_json_yedege_duser(self):
        def gonder(yol, govde):
            return {"message": {"content": "[1, 2]"}}

        not_ = ders_notu_olustur("Kesirler", self.parcalar, OllamaIstemci(gonder=gonder))
        self.assertEqual(not_.yontem, "çıkarımsal")
        self.assertIn("JSON nesnesi", not_.uyarilar[0])

    def test_llm_hatasinda_cikarimsal_yedek(self):
        def gonder(yol, govde):
            raise LLMHatasi("bağlantı reddedildi")

        not_ = ders_notu_olustur("Kesirler", self.parcalar, OllamaIstemci(gonder=gonder))
        self.assertEqual(not_.yontem, "çıkarımsal")
        self.assertIn("bağlantı reddedildi", not_.uyarilar[0])


class _SahteOllama(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path == "/bozuk/api/chat":
            kod, govde = 200, b"merhaba"
        elif self.path == "/yok/api/chat":
            kod, govde = 404, b'{"error": "model \\"x\\" not found"}'
        else:
            kod, govde = 200, json.dumps({"message": {"content": '{"ozet": []}'}}).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)


class OllamaTesti(unittest.TestCase):
    def test_bulut_modeli_ve_uzak_sunucu_izinsiz_reddedilir(self):
        # KVKK md. 9: ":cloud" / "-cloud" modelleri (ollama internal/modelref) transkripti yurt dışına gönderir.
        for model in ("gemma4:cloud", "gpt-oss:120b-cloud", "qwen3:480B-CLOUD"):
            self.assertTrue(bulut_modeli_mi(model), model)
            with self.assertRaises(GonderimIzniHatasi):
                OllamaIstemci(model=model)
        for model in ("qwen2.5:7b", "cloud", "kayit.local:5000/cloud", "gemma4:local"):
            self.assertFalse(bulut_modeli_mi(model), model)
        with self.assertRaises(GonderimIzniHatasi):
            OllamaIstemci("https://ollama.com", "gemma4:31b", uzak_izni=True)
        self.assertEqual(OllamaIstemci(model="gemma4:cloud", bulut_izni=True).model, "gemma4:cloud")
        # Yerel ağ dışındaki sunucu (ör. kiralık GPU) açık izin ister; kurum içi adresler serbest.
        with self.assertRaisesRegex(GonderimIzniHatasi, "--uzak-ollama"):
            OllamaIstemci("http://gpu.ornek-bulut.com:11434")
        self.assertTrue(OllamaIstemci("http://gpu.ornek-bulut.com:11434", uzak_izni=True))
        for adres in ("http://127.0.0.1:11434", "http://10.0.0.5:11434", "http://ollama.lan:11434", "http://gpu:11434"):
            self.assertTrue(OllamaIstemci(adres), adres)

    def test_http_hatalari_llm_hatasina_doner(self):
        # Hata: JSON olmayan yanıt JSONDecodeError olarak yedek yolunu atlayıp programı düşürüyordu.
        sunucu = ThreadingHTTPServer(("127.0.0.1", 0), _SahteOllama)
        threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        adres = f"http://127.0.0.1:{sunucu.server_address[1]}"
        try:
            with self.assertRaisesRegex(LLMHatasi, "JSON değil"):
                OllamaIstemci(f"{adres}/bozuk").json_sohbet("s", "k", {})
            with self.assertRaisesRegex(LLMHatasi, "404.*not found"):
                OllamaIstemci(f"{adres}/yok").json_sohbet("s", "k", {})
            self.assertEqual(OllamaIstemci(adres).json_sohbet("s", "k", {}), {"ozet": []})
        finally:
            sunucu.shutdown()
            sunucu.server_close()


if __name__ == "__main__":
    unittest.main()
