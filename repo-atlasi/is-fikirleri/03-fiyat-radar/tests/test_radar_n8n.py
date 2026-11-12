import io
import json
import os
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from fiyat_radar.__main__ import main, tur
from fiyat_radar.bildir import BildirimHatasi, telegram_gonder
from fiyat_radar.depo import Depo, Olcum
from fiyat_radar.getir import FIRECRAWL_AJANLARI, DogrudanGetirici, Getirici, HizSinirlayici, RobotsDenetcisi, Sayfa
from fiyat_radar.n8n import is_akisi
from fiyat_radar.radar import AyarHatasi, Calisma, Degisim, calistir, getirici_kur, karsilastir
from fiyat_radar.rapor import TELEGRAM_SINIRI, html_eposta, markdown, n8n_yaniti, telegram_metni
from fiyat_radar.sunucu import ANAHTAR_BASLIGI, sunucu_kur

from tests.yerel_sunucu import YerelSunucu, urun_sayfasi

KOK = Path(__file__).resolve().parent.parent
AJAN = "FiyatRadar/0.1"


def ayar(adres: str, rakipler: list | None = None, **ek) -> dict:
    rakipler = rakipler or [{"magaza": "Rakip A", "url": adres + "/a"}, {"magaza": "Rakip B", "url": adres + "/gizli/b"}]
    temel = {"esik_yuzde": 1, "istekler_arasi_sn": 0, "ozel_aglara_izin": True}
    return {**temel, **ek, "urunler": [{"ad": "Kahve makinesi", "kendi_fiyatim": "2.499,90 TL", "rakipler": rakipler}]}


def getirici() -> Getirici:
    robots = RobotsDenetcisi(AJAN, ozel_aglara_izin=True)
    return Getirici(robots, HizSinirlayici(0), DogrudanGetirici(AJAN, robots=robots, ozel_aglara_izin=True))


class SahteGetirici:
    """Her çağrıda saati ilerletir; istenen URL'leri sırayla kaydeder."""

    def __init__(self, saat=None, adim=0.0, hatali=()):
        self.saat, self.adim, self.hatali, self.istenen = saat, adim, hatali, []

    def getir(self, url):
        self.istenen.append(url)
        if self.saat:
            self.saat.an += self.adim
        if any(url.endswith(h) for h in self.hatali):
            raise ValueError("ayrıştırıcıda beklenmeyen durum")
        return Sayfa(url, urun_sayfasi("100 TL")), []


class SahteSaat:
    def __init__(self):
        self.an = 0.0

    def __call__(self):
        return self.an


class DepoluTest(unittest.TestCase):
    def depo(self, yol: str = ":memory:") -> Depo:
        depo = Depo(yol)
        self.addCleanup(depo.kapat)
        return depo


class RadarTesti(DepoluTest):
    def test_iki_tur_degisiklik_bulur(self):
        depo = self.depo()
        with YerelSunucu({"/a": urun_sayfasi("2.599,90 TL")}) as s:
            ilk = calistir(ayar(s.adres), depo, getirici(), datetime(2026, 11, 9, 8, 0))
            s.sayfalar["/a"] = urun_sayfasi("2.399,90 TL", eski="2.599,90 TL", kampanya="Kargo bedava")
            ikinci = calistir(ayar(s.adres), depo, getirici(), datetime(2026, 11, 10, 8, 0))
        self.assertEqual([d.tur for d in ilk.degisimler], ["ilk", "hata"])  # B: robots.txt engeli
        self.assertIn("robots.txt", ilk.hatalar[0].mesaj)
        mesajlar = [d.mesaj for d in ikinci.onemli]
        self.assertIn("Fiyat düştü: 2.599,90 TL → 2.399,90 TL (%7,7)", mesajlar)
        self.assertIn("Yeni kampanya: Kargo bedava", mesajlar)
        self.assertTrue(any("sizin fiyatınızın (2.499,90 TL) %4,0 altında" in m for m in mesajlar))

    def test_ucuz_rakip_yalnizca_durum_degisince_bildirilir(self):
        # Hata: rakip sizden ucuz olduğu sürece her tur "değişiklik" sayılıyor, her gün Telegram mesajı gidiyordu.
        depo, tek = self.depo(), lambda adres: [{"magaza": "Rakip A", "url": adres + "/a"}]
        with YerelSunucu({"/a": urun_sayfasi("2.399,90 TL")}) as s:
            turlar = [calistir(ayar(s.adres, tek(s.adres)), depo, getirici(), datetime(2026, 11, g, 8)) for g in (9, 10)]
            fiyatim_dustu = ayar(s.adres, tek(s.adres))
            fiyatim_dustu["urunler"][0]["kendi_fiyatim"] = "2.299,90 TL"
            turlar.append(calistir(fiyatim_dustu, depo, getirici(), datetime(2026, 11, 11, 8)))
        ilk, ikinci, ucuncu = turlar
        self.assertEqual([d.tur for d in ilk.onemli], ["ucuz-rakip"])
        self.assertEqual((ikinci.onemli, [d.tur for d in ikinci.surenler]), ([], ["ucuz-rakip-suruyor"]))
        self.assertFalse(n8n_yaniti(ikinci)["bildirim_gerekli"])
        self.assertIn("Sizden ucuz rakipler (sürüyor)", markdown(ikinci))
        self.assertEqual([d.mesaj for d in ucuncu.onemli], ["Artık hiçbir rakip sizden ucuz değil (sizin fiyatınız 2.299,90 TL)"])

    def test_esik_alti_fiyat_oynamasi_ve_stok(self):
        once = Olcum("t", "U", "M", "u", fiyat=100000, stokta=True)
        simdi = Olcum("t", "U", "M", "u", fiyat=100500, stokta=False)
        self.assertEqual([d.mesaj for d in karsilastir(once, simdi, esik_yuzde=1)], ["Stokta yok"])

    def test_kampanya_buyuk_kucuk_harf_degisimi_sayilmaz(self):
        once = Olcum("t", "U", "M", "u", fiyat=100, kampanyalar=["SEPETTE %10 İNDİRİM"])
        simdi = Olcum("t", "U", "M", "u", fiyat=100, kampanyalar=["Sepette %10 indirim"])
        self.assertEqual(karsilastir(once, simdi, 1), [])

    def test_saat_dilimi_acik_ve_ayarlanabilir(self):
        # Hata: zaman sunucunun yerel saatinden alınıyordu (Docker'da UTC → raporda 05:00).
        utc_05 = datetime(2026, 11, 9, 5, 0, tzinfo=timezone.utc)
        calisma = calistir(ayar("http://x.example"), self.depo(), SahteGetirici(), utc_05)
        self.assertEqual(calisma.zaman, "2026-11-09T08:00:00+03:00")
        self.assertTrue(telegram_metni(calisma).startswith("Fiyat radarı · 09.11.2026 08:00"))
        utc = calistir(ayar("http://x.example", saat_dilimi="UTC"), self.depo(), SahteGetirici(), utc_05)
        self.assertEqual(utc.zaman, "2026-11-09T05:00:00+00:00")
        self.assertTrue(calistir(ayar("http://x.example"), self.depo(), SahteGetirici()).zaman.endswith("+03:00"))
        with self.assertRaises(AyarHatasi):
            calistir(ayar("http://x.example", saat_dilimi="Mars/Olympus"), self.depo(), SahteGetirici())

    def test_para_birimi_tl_degilse_karsilastirilmaz(self):
        sayfa = '<script type="application/ld+json">{"@type": "Product", "offers": {"price": "49.90", "priceCurrency": "USD"}}</script>'
        with YerelSunucu({"/a": sayfa}) as s:
            calisma = calistir(ayar(s.adres, [{"magaza": "Rakip A", "url": s.adres + "/a"}]), self.depo(), getirici())
        self.assertIn("Türk lirası değil (USD)", calisma.olcumler[0].hata)
        self.assertEqual([d.tur for d in calisma.degisimler], ["hata"])

    def test_beklenmeyen_hata_turu_durdurmaz(self):
        sahte = SahteGetirici(hatali=("/a",))
        calisma = calistir(ayar("http://x.example"), self.depo(), sahte)
        self.assertIn("Beklenmeyen hata (ValueError)", calisma.olcumler[0].hata)
        self.assertEqual(calisma.olcumler[1].fiyat, 10000)

    def test_sure_butcesi_ve_sirali_tarama(self):
        rakipler = [{"magaza": m, "url": f"http://x.example/{m}"} for m in ("A", "B", "C")]
        depo, saat = self.depo(), SahteSaat()
        sahte = SahteGetirici(saat, adim=10)
        ilk = calistir(ayar("", rakipler, tur_butcesi_sn=15), depo, sahte, datetime(2026, 11, 9, 8), saat=saat)
        self.assertEqual((len(ilk.olcumler), ilk.atlananlar), (2, ["Kahve makinesi / C"]))
        self.assertIn("1 sayfa sonraki tura kaldı", n8n_yaniti(ilk)["telegram_metni"])
        self.assertEqual(n8n_yaniti(ilk)["atlanan_sayisi"], 1)
        sahte.istenen.clear()
        calistir(ayar("", rakipler, tur_butcesi_sn=15), depo, sahte, datetime(2026, 11, 10, 8), saat=saat)
        self.assertEqual(sahte.istenen, ["http://x.example/C", "http://x.example/A"])  # kalan sayfa önce

    def test_ayar_dogrulama(self):
        temel = ayar("http://x.example")
        bozuklar = [
            {**temel, "urunler": []},
            {**temel, "urunler": [{"ad": " ", "rakipler": [{"magaza": "A", "url": "http://x.example/a"}]}]},
            {**temel, "urunler": [{"ad": "U", "rakipler": []}]},
            {**temel, "urunler": [{"ad": "U", "rakipler": [{"magaza": "A", "url": "file:///etc/passwd"}]}]},
            {**temel, "urunler": [{"ad": "U", "kendi_fiyatim": "sorunuz", "rakipler": [{"magaza": "A", "url": "http://x.example"}]}]},
            {**temel, "urunler": [{"ad": "U", "rakipler": [{"magaza": "A", "url": "http://x.example/1"}, {"magaza": "a ", "url": "http://x.example/2"}]}]},
            {**temel, "esik_yuzde": -1},
            {**temel, "tur_butcesi_sn": 0},
            {**temel, "istekler_arasi_sn": "5"},
            {**temel, "firecrawl": True},
        ]
        for bozuk in bozuklar:
            with self.assertRaises(AyarHatasi, msg=json.dumps(bozuk, ensure_ascii=False)[:120]):
                calistir(bozuk, self.depo(), SahteGetirici())
        with tempfile.TemporaryDirectory() as gecici:
            yol = Path(gecici) / "ayar.json"
            yol.write_text('{"urunler": [}', encoding="utf-8")
            with redirect_stderr(io.StringIO()) as hata_akisi:
                self.assertEqual(main(["calistir", "--ayar", str(yol), "--db", str(Path(gecici) / "r.sqlite")]), 2)
        self.assertIn("Ayar hatası", hata_akisi.getvalue())

    def test_depo_dosyada_kalici(self):
        with tempfile.TemporaryDirectory() as gecici:
            yol = str(Path(gecici) / "r.sqlite")
            depo = Depo(yol)
            depo.ekle(Olcum("t1", "U", "M", "u", fiyat=5000, kampanyalar=["9 taksit"]))
            depo.ekle(Olcum("t2", "U", "M", "u", hata="HTTP 503"))  # hatalı ölçüm "son başarılı" sayılmaz
            depo.kapat()
            ikinci = Depo(yol)
            son = ikinci.son_basarili("U", "M")
            ikinci.kapat()
        self.assertEqual((son.zaman, son.fiyat, son.kampanyalar), ("t1", 5000, ["9 taksit"]))

    def test_saklama_suresi_ve_gercek_silme(self):
        isaret = "GIZLI-MAGAZA-ISARETI-7Q"
        with tempfile.TemporaryDirectory() as gecici:
            yol = str(Path(gecici) / "r.sqlite")
            depo = Depo(yol)
            depo.ekle(Olcum("2024-01-01T08:00:00+03:00", "U", isaret, "http://x.example/eski", fiyat=100))
            calistir(ayar("http://x.example", saklama_gun=30), depo, SahteGetirici(), datetime(2026, 11, 9, 8))
            kalan = depo.db.execute("SELECT COUNT(*) FROM olcum WHERE magaza = ?", (isaret,)).fetchone()[0]
            depo.kapat()
            ham = Path(yol).read_bytes()
        self.assertEqual(kalan, 0)
        self.assertNotIn(isaret.encode(), ham)  # secure_delete: silinen satır dosyada okunamaz

    def test_firecrawl_yalnizca_anahtar_ya_da_kendi_sunucusu_varsa(self):
        fc = {"urunler": [], "firecrawl": {"api_url": "https://api.firecrawl.dev"}}
        self.assertEqual(getirici_kur(fc, ortam={}).birincil.ad, "dogrudan")
        bulut = getirici_kur(fc, ortam={"FIRECRAWL_API_KEY": "fc-x"})
        self.assertEqual(bulut.birincil.ad, "firecrawl")
        self.assertEqual(bulut.robots.ajanlar[1:], FIRECRAWL_AJANLARI)  # robots.txt Firecrawl'ın adıyla da denetlenir
        self.assertEqual(getirici_kur({"firecrawl": {"api_url": "http://firecrawl:3002"}}, ortam={}).birincil.ad, "firecrawl")
        # Hata: boş nesne ("firecrawl": {}) yanlış değer sayılıyor, anahtar olsa bile Firecrawl hiç kullanılmıyordu
        self.assertEqual(getirici_kur({"firecrawl": {}}, ortam={"FIRECRAWL_API_KEY": "fc-x"}).birincil.ad, "firecrawl")
        self.assertIsNotNone(getirici_kur({}, ortam={}).adres_denetci)  # varsayılan: özel ağ adresleri reddedilir


class RaporTesti(DepoluTest):
    def setUp(self):
        with YerelSunucu({"/a": urun_sayfasi("2.599,90 TL")}) as s:
            self.calisma = calistir(ayar(s.adres), self.depo(), getirici(), datetime(2026, 11, 9, 8, 0))

    def test_telegram_ve_n8n_yaniti(self):
        yanit = n8n_yaniti(self.calisma)
        self.assertTrue(yanit["telegram_metni"].startswith("Fiyat radarı · 09.11.2026 08:00"))
        self.assertEqual((yanit["degisim_sayisi"], yanit["hata_sayisi"], yanit["bildirim_gerekli"]), (0, 1, True))
        self.calisma.notlar.clear()
        self.calisma.degisimler += self.calisma.hatalar * 200
        self.assertLessEqual(len(telegram_metni(self.calisma)), TELEGRAM_SINIRI)

    def test_telegram_html_kacisi(self):
        # n8n Telegram düğümü HTML kipinde: <, > ve & kaçmalı; "_" ve "[" olduğu gibi kalır (Markdown kipi bozulurdu).
        self.calisma.degisimler.append(Degisim("fiyat", "Kahve <X> & Co", "Rakip_A", "Okunamadı: https://r.example/a_b?[1]"))
        yanit = n8n_yaniti(self.calisma)
        self.assertIn("Kahve &lt;X&gt; &amp; Co / Rakip_A: Okunamadı: https://r.example/a_b?[1]", yanit["telegram_html"])
        self.assertIn("Kahve <X> & Co", yanit["telegram_metni"])

    def test_html_ve_markdown_kacis(self):
        self.calisma.olcumler[0].kampanyalar = ["<script>x</script>"]
        self.assertIn("&lt;script&gt;", html_eposta(self.calisma))
        self.calisma.olcumler[0].urun = "Kupa | 2'li\nset"
        self.assertIn("| Kupa \\| 2'li set | Rakip A |", markdown(self.calisma))


def ham_istek(port: int, veri: bytes) -> bytes:
    with socket.create_connection(("127.0.0.1", port), timeout=5) as so:
        so.sendall(veri)
        parcalar = []
        while parca := so.recv(4096):
            parcalar.append(parca)
        return b"".join(parcalar)


class SunucuVeN8nTesti(unittest.TestCase):
    def setUp(self):
        self.sunucu = sunucu_kur("127.0.0.1", 0, "gizli-anahtar", lambda: {"degisim_sayisi": 2})
        threading.Thread(target=self.sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        self.port = self.sunucu.server_address[1]

    def tearDown(self):
        self.sunucu.shutdown()
        self.sunucu.server_close()

    def test_sunucu_anahtar_ister(self):
        with self.assertRaises(ValueError):
            sunucu_kur("127.0.0.1", 0, "", dict)
        adres = f"http://127.0.0.1:{self.port}"
        with urllib.request.urlopen(adres + "/saglik") as y:
            self.assertEqual(json.load(y), {"durum": "hazır"})
        with self.assertRaises(urllib.error.HTTPError) as hata:
            urllib.request.urlopen(urllib.request.Request(adres + "/calistir", data=b"", method="POST"))
        self.assertEqual(hata.exception.code, 401)
        istek = urllib.request.Request(adres + "/calistir", data=b"{}", headers={ANAHTAR_BASLIGI: "gizli-anahtar"})
        with urllib.request.urlopen(istek) as y:
            self.assertEqual(json.load(y), {"degisim_sayisi": 2})

    def test_sunucu_govde_sinirlari(self):
        # Hata: gövde anahtar denetiminden önce okunuyordu; kimliksiz istemci 1 GB beklettirebiliyordu.
        bas = b"POST /calistir HTTP/1.1\r\nHost: x\r\n"
        anahtar = ANAHTAR_BASLIGI.encode() + b": gizli-anahtar\r\n"
        self.assertIn(b" 401 ", ham_istek(self.port, bas + b"Content-Length: 1000000000\r\n\r\n"))
        self.assertIn(b" 413 ", ham_istek(self.port, bas + anahtar + b"Content-Length: 1000000000\r\n\r\n"))
        self.assertIn(b" 400 ", ham_istek(self.port, bas + anahtar + b"Content-Length: abc\r\n\r\n"))
        self.assertIn(b" 400 ", ham_istek(self.port, bas + anahtar + b"Transfer-Encoding: chunked\r\n\r\n-5\r\n"))
        tamam = ham_istek(self.port, bas + anahtar + b"Transfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n")
        self.assertIn(b" 200 ", tamam)
        self.assertIn(b'"degisim_sayisi": 2', tamam)

    def test_is_akisi_yapisi_ve_depodaki_dosya(self):
        akis = is_akisi()
        adlar = {d["name"] for d in akis["nodes"]}
        for kaynak, cikislar in akis["connections"].items():
            self.assertIn(kaynak, adlar)
            self.assertTrue(all(h["node"] in adlar for cikis in cikislar["main"] for h in cikis))
        turler = [d["type"] for d in akis["nodes"]]
        self.assertEqual(turler, [f"n8n-nodes-base.{t}" for t in ("scheduleTrigger", "httpRequest", "if", "telegram")])
        self.assertNotIn("n8n-nodes-base.executeCommand", turler)  # n8n'de varsayılan olarak kapalı
        # Hata: saat dilimi yoktu (n8n varsayılanı America/New_York) ve Telegram düğümü Markdown kipine düşüyordu.
        self.assertEqual(akis["settings"]["timezone"], "Europe/Istanbul")
        telegram = akis["nodes"][3]["parameters"]
        self.assertEqual((telegram["text"], telegram["additionalFields"]["parse_mode"]), ("={{ $json.telegram_html }}", "HTML"))
        self.assertEqual(akis["nodes"][1]["parameters"]["options"]["timeout"], 900000)
        dosya = json.loads((KOK / "n8n" / "fiyat-radar.workflow.json").read_text(encoding="utf-8"))
        self.assertEqual(dosya, akis, "n8n/fiyat-radar.workflow.json yeniden üretilmeli: python3 -m fiyat_radar n8n")
        with self.assertRaises(ValueError):
            is_akisi(saat=24)
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            main(["n8n", "--saat", "24"])

    def test_komut_satiri_tur_ve_dosyalar(self):
        with YerelSunucu({"/a": urun_sayfasi("2.599,90 TL")}) as s, tempfile.TemporaryDirectory() as gecici:
            ayar_yolu = Path(gecici) / "ayar.json"
            ayar_yolu.write_text(json.dumps(ayar(s.adres)), encoding="utf-8")
            argv = ["calistir", "--ayar", str(ayar_yolu), "--db", str(Path(gecici) / "r.sqlite"), "--cikti", gecici]
            with redirect_stdout(io.StringIO()) as cikti:
                self.assertEqual(main(argv), 0)
            self.assertIn("Fiyat radarı", cikti.getvalue())
            self.assertIn("| Kahve makinesi | Rakip A | 2.599,90 TL |", (Path(gecici) / "rapor.md").read_text(encoding="utf-8"))
            ikinci = tur(ayar_yolu, Path(gecici) / "r.sqlite", Path(gecici))
            self.assertEqual([d.tur for d in ikinci.degisimler], ["hata"])  # fiyat aynı: değişiklik yok


class TelegramTesti(unittest.TestCase):
    def test_dogrudan_gonderim_duz_metin(self):
        with YerelSunucu({}) as s:
            telegram_gonder("Okunamadı: https://r.example/a_b [1]", -1001234, "123:GIZLI", api_url=s.adres)
            istek = s.istekler[0]
        self.assertEqual(istek["yol"], "/bot123:GIZLI/sendMessage")
        self.assertEqual((istek["govde"]["chat_id"], istek["govde"]["text"]), (-1001234, "Okunamadı: https://r.example/a_b [1]"))
        self.assertNotIn("parse_mode", istek["govde"])  # düz metin: "_" ve "[" iletiyi bozmaz

    def test_hata_iletisinde_belirtec_yok(self):
        with YerelSunucu({}) as s:
            s.telegram_yaniti = (400, {"ok": False, "description": "Bad Request: chat not found"})
            with self.assertRaises(BildirimHatasi) as hata:
                telegram_gonder("x", 1, "123:GIZLI", api_url=s.adres)
        self.assertIn("chat not found", str(hata.exception))
        for neden in [("x", 1, "123:GIZLI", "http://127.0.0.1:9"), ("x", 1, "", "http://127.0.0.1:9"), ("x", None, "1:A", "http://127.0.0.1:9")]:
            with self.assertRaises(BildirimHatasi) as hata:
                telegram_gonder(*neden[:3], api_url=neden[3], zaman_asimi=2)
            self.assertNotIn("GIZLI", str(hata.exception))
            # İç istisna (adresinde belirteç olabilir) hata dökümünde görünmez
            self.assertTrue(hata.exception.__suppress_context__ or hata.exception.__context__ is None)

    def test_komut_satiri_telegram_secenegi(self):
        with YerelSunucu({"/a": urun_sayfasi("2.599,90 TL")}) as s, tempfile.TemporaryDirectory() as gecici:
            ayar_yolu = Path(gecici) / "ayar.json"
            ayar_yolu.write_text(json.dumps({**ayar(s.adres), "telegram": {"sohbet_kimligi": "-100", "api_url": s.adres}}), encoding="utf-8")
            argv = ["calistir", "--ayar", str(ayar_yolu), "--db", str(Path(gecici) / "r.sqlite"), "--cikti", gecici, "--telegram"]
            with mock.patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "9:ABC"}), redirect_stdout(io.StringIO()):
                self.assertEqual(main(argv), 0)
            gonderilen = [i for i in s.istekler if i["yol"].startswith("/bot")]
        self.assertEqual(len(gonderilen), 1)  # Rakip B robots engeli → bildirim gerekli
        self.assertTrue(gonderilen[0]["govde"]["text"].startswith("Fiyat radarı"))


if __name__ == "__main__":
    unittest.main()
