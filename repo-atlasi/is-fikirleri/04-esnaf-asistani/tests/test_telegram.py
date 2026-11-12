"""Telegram bağdaştırıcısı: gerçek API yerine yerel sahte sunucularla (çevrimdışı) test edilir."""

import dataclasses
import http.client
import json
import socketserver
import threading
import time
import unittest

from esnaf.telegram import (
    HizSiniri,
    Seritler,
    TelegramHatasi,
    TelegramIstemcisi,
    guncellemeyi_isle,
    uzun_yoklama,
    webhook_sunucusu,
)
from tests.yardimci import SahteSunucu, isletme, yonlendirici

TOKEN = "123:GIZLI-BELIRTEC"
GIZLI = "webhook-gizli-anahtar-0123"
SAHIP = 999


def ozel_mesaj(guncelleme_id, metin, sohbet_id=42, tur="private"):
    return {
        "update_id": guncelleme_id,
        "message": {"message_id": guncelleme_id, "from": {"id": sohbet_id, "first_name": "Ali"},
                    "chat": {"id": sohbet_id, "type": tur}, "date": 0, "text": metin},
    }


class SahteTelegram:
    def __init__(self, guncellemeler=(), engelleyen=None):
        self.kuyruk = [list(guncellemeler)]
        self.engelleyen = engelleyen  # bu sohbete gönderim 403 alır (müşteri botu engellemiş)
        self.sunucu = SahteSunucu(self.yanitla)

    def yanitla(self, yol, govde):
        if yol.endswith("/getUpdates"):
            return 200, {"ok": True, "result": self.kuyruk.pop(0) if self.kuyruk else []}
        if yol.endswith("/sendMessage"):
            if govde.get("chat_id") == self.engelleyen:
                return 403, {"ok": False, "description": "Forbidden: bot was blocked by the user"}
            return 200, {"ok": True, "result": {"message_id": 1}}
        return 404, {"ok": False, "description": "Not Found"}

    def gonderilenler(self):
        return [g for y, g, _ in self.sunucu.istekler if y.endswith("/sendMessage")]


class HamSunucu:
    """HTTP'yi elle konuşan sunucu: bağlantıyı yanıtsız kapatabilir ya da yarım gövde gönderebilir."""

    def __init__(self, davranislar):
        self.davranislar = list(davranislar)  # "kapat" | "eksik" | bayt (tam JSON gövde)
        dis = self

        class Isleyici(socketserver.StreamRequestHandler):
            def handle(self):
                uzunluk = 0
                while True:
                    satir = self.rfile.readline()
                    if satir in (b"", b"\r\n", b"\n"):
                        break
                    if satir.lower().startswith(b"content-length:"):
                        uzunluk = int(satir.split(b":")[1])
                self.rfile.read(uzunluk)
                davranis = dis.davranislar.pop(0) if dis.davranislar else b'{"ok": true, "result": []}'
                if davranis == "kapat":
                    return
                if davranis == "eksik":
                    self.wfile.write(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{\"ok\":")
                    return
                self.wfile.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n"
                                 + f"Content-Length: {len(davranis)}\r\n\r\n".encode() + davranis)

        self.sunucu = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Isleyici)
        self.sunucu.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.sunucu.server_address[1]}"
        threading.Thread(target=self.sunucu.serve_forever, daemon=True).start()

    def kapat(self):
        self.sunucu.shutdown()
        self.sunucu.server_close()


class IstemciTesti(unittest.TestCase):
    def test_api_hatasi_belirteci_sizdirmaz(self):
        sunucu = SahteSunucu(lambda yol, govde: (401, {"ok": False, "description": "Unauthorized"}))
        self.addCleanup(sunucu.kapat)
        with self.assertRaises(TelegramHatasi) as baglam:
            TelegramIstemcisi(TOKEN, taban_url=sunucu.url).cagir("getMe")
        self.assertIn("Unauthorized", str(baglam.exception))
        self.assertNotIn("GIZLI", str(baglam.exception) + repr(TelegramIstemcisi(TOKEN)))

    def test_json_olmayan_hata_sayfasi_durum_kodunu_bildirir(self):
        sunucu = SahteSunucu(lambda yol, govde: (502, b"<html>Bad Gateway</html>"))
        self.addCleanup(sunucu.kapat)
        with self.assertRaises(TelegramHatasi) as baglam:
            TelegramIstemcisi(TOKEN, taban_url=sunucu.url).cagir("getMe")
        self.assertIn("HTTP 502", str(baglam.exception))

    def test_kopan_baglanti_ve_yarim_govde_telegram_hatasi_olur(self):  # regresyon: süreç ölüyordu
        ham = HamSunucu(["kapat", "eksik", b"<html>proxy</html>"])
        self.addCleanup(ham.kapat)
        istemci = TelegramIstemcisi(TOKEN, taban_url=ham.url, zaman_asimi=5)
        for beklenen in ("RemoteDisconnected", "IncompleteRead", "JSON değil"):
            with self.subTest(beklenen=beklenen), self.assertRaises(TelegramHatasi) as baglam:
                istemci.cagir("getUpdates")
            self.assertIn(beklenen, str(baglam.exception))
            self.assertNotIn("GIZLI", str(baglam.exception))


class UzunYoklamaTesti(unittest.TestCase):
    def test_mesaj_alir_yanit_gonderir_offset_ilerletir(self):
        tg = SahteTelegram([ozel_mesaj(7, "merhaba"), ozel_mesaj(8, "grup mesajı", -5, "group")])
        self.addCleanup(tg.sunucu.kapat)
        istemci = TelegramIstemcisi(TOKEN, taban_url=tg.sunucu.url)
        uzun_yoklama(istemci, yonlendirici(self), tur=2, bekleme_sn=0)

        gonderilen = tg.gonderilenler()
        self.assertEqual({g["chat_id"] for g in gonderilen}, {42})  # grup mesajı yok sayıldı
        self.assertIn("KVKK", gonderilen[0]["text"])
        self.assertIn("keyboard", gonderilen[-1]["reply_markup"])
        ikinci_yoklama = [g for y, g, _ in tg.sunucu.istekler if y.endswith("/getUpdates")][1]
        self.assertEqual(ikinci_yoklama["offset"], 9)
        self.assertTrue(all(y.startswith(f"/bot{TOKEN}/") for y, _, _ in tg.sunucu.istekler))

    def test_baglanti_hatasindan_sonra_artan_beklemeyle_devam_eder(self):  # regresyon: döngü ölüyordu
        sonuc = json.dumps({"ok": True, "result": [ozel_mesaj(5, "fiyatlar")]}).encode()
        ham = HamSunucu(["kapat", "eksik", sonuc])
        self.addCleanup(ham.kapat)
        uykular = []
        istemci = TelegramIstemcisi(TOKEN, taban_url=ham.url, zaman_asimi=5)
        uzun_yoklama(istemci, yonlendirici(self), tur=3, bekleme_sn=0, uyku=uykular.append)
        self.assertEqual(uykular, [5, 10])
        self.assertEqual(ham.davranislar, [])  # üçüncü yoklama da yapıldı


class GidenMesajTesti(unittest.TestCase):
    def test_musteri_engellese_de_sahip_bildirimi_gider(self):
        tg = SahteTelegram(engelleyen=42)
        self.addCleanup(tg.sunucu.kapat)
        y = yonlendirici(self, dataclasses.replace(isletme(), sahip_sohbet_id=SAHIP))
        istemci = TelegramIstemcisi(TOKEN, taban_url=tg.sunucu.url)
        with self.assertLogs("esnaf.telegram", "WARNING"):
            gonderilen = guncellemeyi_isle(ozel_mesaj(1, "yetkili lütfen"), y, istemci)
        self.assertEqual(gonderilen, 1)
        self.assertEqual(tg.gonderilenler()[-1]["chat_id"], SAHIP)


class WebhookTesti(unittest.TestCase):
    def setUp(self):
        self.tg = SahteTelegram()
        self.addCleanup(self.tg.sunucu.kapat)
        istemci = TelegramIstemcisi(TOKEN, taban_url=self.tg.sunucu.url)
        self.y = yonlendirici(self)
        self.sunucu = webhook_sunucusu(istemci, self.y, GIZLI, ("127.0.0.1", 0))
        threading.Thread(target=self.sunucu.serve_forever, daemon=True).start()
        self.addCleanup(self.sunucu.server_close)
        self.addCleanup(self.sunucu.shutdown)

    def gonder(self, govde, gizli=GIZLI, yol="/telegram", uzunluk=None):
        baglanti = http.client.HTTPConnection("127.0.0.1", self.sunucu.server_address[1], timeout=5)
        veri = json.dumps(govde).encode()
        basliklar = {"X-Telegram-Bot-Api-Secret-Token": gizli, "Content-Length": str(uzunluk or len(veri))}
        baglanti.request("POST", yol, body=veri, headers=basliklar)
        kod = baglanti.getresponse().status
        baglanti.close()
        return kod

    def test_gizli_anahtar_ve_sinirlar(self):
        self.assertEqual(self.gonder(ozel_mesaj(1, "merhaba"), gizli="yanlis"), 401)
        self.assertEqual(self.gonder(ozel_mesaj(1, "merhaba"), yol="/baska"), 404)
        self.assertEqual(self.gonder(ozel_mesaj(1, "merhaba"), uzunluk=5_000_000), 413)
        self.assertEqual(self.gonder([1, 2]), 400)  # Update nesnesi değil
        self.sunucu.seritler.bekle()
        self.assertEqual(self.tg.gonderilenler(), [])
        self.assertEqual(self.gonder(ozel_mesaj(1, "fiyatlar")), 200)
        self.sunucu.seritler.bekle()
        self.assertIn("Fiyat listemiz", self.tg.gonderilenler()[-1]["text"])

    def test_ayni_update_id_bir_kez_islenir(self):  # Telegram yeniden teslim ederse devir iki kez açılmasın
        for _ in range(2):
            self.assertEqual(self.gonder(ozel_mesaj(77, "yetkiliyle görüşmek istiyorum")), 200)
        self.sunucu.seritler.bekle()
        self.assertEqual(len(self.y.depo.acik_devirler()), 1)

    def test_yanit_islemeyi_beklemez(self):  # yavaş model çağrısı Telegram'ın teslim onayını geciktirmesin
        birak = threading.Event()
        asil = self.y.isle
        self.y.isle = lambda *a, **k: (birak.wait(5), asil(*a, **k))[1]
        baslangic = time.monotonic()
        self.assertEqual(self.gonder(ozel_mesaj(3, "merhaba")), 200)
        self.assertLess(time.monotonic() - baslangic, 2)
        birak.set()
        self.sunucu.seritler.bekle()
        self.assertTrue(self.tg.gonderilenler())

    def test_gizli_anahtar_kurallari(self):
        for gizli in ("kisa", "bosluklu gizli anahtar 0123", "x" * 257):
            with self.subTest(gizli=gizli[:20]), self.assertRaises(ValueError):
                webhook_sunucusu(TelegramIstemcisi(TOKEN), self.y, gizli)


class HizSiniriTesti(unittest.TestCase):
    def test_kayan_pencere(self):
        saat = {"an": 0.0}
        sinir = HizSiniri(azami=2, pencere_sn=60, saat=lambda: saat["an"])
        self.assertEqual([sinir.izin(1) for _ in range(3)], [True, True, False])
        self.assertTrue(sinir.izin(2))  # başka sohbet etkilenmez
        saat["an"] = 61.0
        self.assertTrue(sinir.izin(1))

    def test_sessiz_sohbetler_budanir(self):  # bellek sınırsız büyümesin
        saat = {"an": 0.0}
        sinir = HizSiniri(saat=lambda: saat["an"])
        for sohbet in range(999):
            sinir.izin(sohbet)
        saat["an"] = 120.0
        sinir.izin(5000)  # 1000. çağrı budamayı tetikler
        self.assertEqual(len(sinir), 1)


class SeritTesti(unittest.TestCase):
    def test_hata_seridi_durdurmaz_ve_sira_korunur(self):
        islenen = []

        def isle(g):
            if g["update_id"] == 2:
                raise RuntimeError("bozuk")
            islenen.append(g["update_id"])

        seritler = Seritler(isle, serit_sayisi=2)
        self.addCleanup(seritler.durdur)
        with self.assertLogs("esnaf.telegram", "ERROR"):
            for no in range(1, 6):
                self.assertEqual(seritler.ekle(ozel_mesaj(no, "x", sohbet_id=7)), "kabul")
            seritler.bekle()
        self.assertEqual(islenen, [1, 3, 4, 5])
        self.assertEqual(seritler.ekle(ozel_mesaj(3, "x", sohbet_id=7)), "tekrar")


if __name__ == "__main__":
    unittest.main()
