"""Gerçek yt-dlp + ffmpeg ile entegrasyon testi; ikisinden biri yoksa atlanır.

İnternet kullanılmaz: ffmpeg ile 2 saniyelik bir video üretilir ve 127.0.0.1'de çalışan
http.server üzerinden, "kurumun kendi ders sayfası" gibi sunulur. 127.0.0.1 yerel ağ adresi
olduğu için testler yerel_aga_izin=True kullanır; "localhost" adı ise izinli olmayan başka
bir alan adı yerine geçer.
"""

import functools
import importlib.util
import shutil
import subprocess
import tempfile
import threading
import unittest
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ders_notu.__main__ import calistir
from ders_notu.asr import ses_cikar
from ders_notu.kaynak import KaynakHatasi, ytdlp_ile_indir

ORNEK_VTT = Path(__file__).resolve().parent.parent / "ornek" / "kesirler.vtt"
HAZIR = importlib.util.find_spec("yt_dlp") is not None and shutil.which("ffmpeg") is not None

SAYFA = """<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Kesirler dersi</title></head>
<body><video controls><source src="{src}" type="video/mp4">{track}</video></body></html>"""
TRACK = '<track kind="subtitles" src="ders.vtt" srclang="tr" label="Türkçe">'
IZIN = ["127.0.0.1"]


class _Isleyici(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/yonlen":  # izinli alandan izinsiz alana yönlendirme
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{self.server.server_address[1]}/altyazili.html")
            self.send_header("Content-Length", "0")
            self.end_headers()
        elif self.path == "/akis.mp4":  # boyutunu bildirmeyen (Content-Length'siz) akış
            veri = (Path(self.directory) / "ders.mp4").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.end_headers()
            self.wfile.write(veri)
            self.close_connection = True
        else:
            super().do_GET()


@unittest.skipUnless(HAZIR, "yt-dlp ya da ffmpeg yok (isteğe bağlı entegrasyon testi)")
class YtDlpEntegrasyonTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gecici = tempfile.TemporaryDirectory()
        kok = Path(cls.gecici.name) / "site"
        kok.mkdir()
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
             "-f", "lavfi", "-i", "color=c=black:s=64x64:d=2", "-shortest", "-c:v", "mpeg4", "-c:a", "aac",
             str(kok / "ders.mp4")],
            check=True,
        )  # fmt: skip
        shutil.copy(ORNEK_VTT, kok / "ders.vtt")
        isleyici = functools.partial(_Isleyici, directory=str(kok))
        cls.sunucu = ThreadingHTTPServer(("127.0.0.1", 0), isleyici)
        threading.Thread(target=cls.sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        port = cls.sunucu.server_address[1]
        cls.adres = f"http://127.0.0.1:{port}"
        sayfalar = {
            "altyazili.html": SAYFA.format(src="ders.mp4", track=TRACK),
            "altyazisiz.html": SAYFA.format(src="ders.mp4", track=""),
            "dilsiz.html": SAYFA.format(src="ders.mp4", track='<track kind="subtitles" src="ders.vtt">'),
            "iki.html": SAYFA.format(src="ders.mp4", track="") * 2,
            "baska.html": SAYFA.format(src=f"http://localhost:{port}/ders.mp4", track=""),
            "akis.html": SAYFA.format(src="akis.mp4", track=""),
        }
        for ad, icerik in sayfalar.items():
            (kok / ad).write_text(icerik, encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.sunucu.shutdown()
        cls.sunucu.server_close()
        cls.gecici.cleanup()

    def _klasor(self, ad: str) -> Path:
        return Path(self.gecici.name) / ad

    def _indir(self, sayfa: str, klasor: str, **ayar):
        return ytdlp_ile_indir(f"{self.adres}/{sayfa}", self._klasor(klasor), ["tr"], IZIN, bekleme_sn=0, **ayar)

    def test_altyazili_sayfadan_not_uretilir_video_indirilmez(self):
        cikti = self._klasor("cikti1")
        ayar = dict(bekleme_sn=0, yerel_aga_izin=True, ara_dosyalari_sakla=True)
        not_ = calistir(f"{self.adres}/altyazili.html", cikti, ["tr"], IZIN, **ayar)
        self.assertEqual([k.terim for k in not_.kavramlar][:2], ["payda", "Pay"])
        self.assertIn("payda denir", (cikti / "transkript.md").read_text(encoding="utf-8"))
        indirilen = cikti / "ara" / "indirilen"
        self.assertEqual(list(indirilen.glob("*.mp4")), [])  # altyazı varken medya inmez
        self.assertEqual(len(list(indirilen.glob("*.vtt"))), 1)

    def test_varsayilan_calismada_ara_dosya_kalmaz(self):
        cikti = self._klasor("cikti-sil")
        calistir(f"{self.adres}/altyazili.html", cikti, ["tr"], IZIN, bekleme_sn=0, yerel_aga_izin=True)
        beklenen = ["anki-kartlari.csv", "ders-notu.md", "transkript.md"]  # geçici klasör kalmadı
        self.assertEqual(sorted(p.name for p in cikti.iterdir()), beklenen)

    def test_altyazisiz_sayfada_ses_indirilir_ve_16khz_wav_cikar(self):
        kaynak = self._indir("altyazisiz.html", "cikti2", yerel_aga_izin=True)
        self.assertIsNone(kaynak.altyazi)
        self.assertTrue(kaynak.medya and kaynak.medya.exists())
        with wave.open(str(ses_cikar(kaynak.medya, self._klasor("cikti2")))) as wav:
            self.assertEqual((wav.getnchannels(), wav.getframerate()), (1, 16000))

    def test_dilsiz_altyazi_cokertmez(self):
        # Gerçek yt-dlp, srclang/lang/label olmayan <track> için dil anahtarını None yapar.
        kaynak = self._indir("dilsiz.html", "cikti3", yerel_aga_izin=True)
        self.assertIsNone(kaynak.altyazi)
        self.assertTrue(kaynak.medya.exists())

    def test_iki_videolu_sayfada_yalnizca_ilki_iner(self):
        kaynak = self._indir("iki.html", "cikti4", yerel_aga_izin=True)
        self.assertEqual(kaynak.uyarilar, ["Sayfada 2 video var; yalnızca ilki işlendi."])
        self.assertEqual(len(list(self._klasor("cikti4").glob("*.mp4"))), 1)

    def test_baska_sunucudaki_medya_indirilmez(self):
        with self.assertRaisesRegex(KaynakHatasi, "localhost izinli alan"):
            self._indir("baska.html", "cikti5", yerel_aga_izin=True)
        self.assertEqual(list(self._klasor("cikti5").rglob("*.mp4")), [])

    def test_baska_alana_yonlendirme_reddedilir(self):
        with self.assertRaisesRegex(KaynakHatasi, "localhost izinli alan"):
            self._indir("yonlen", "cikti6", yerel_aga_izin=True)

    def test_yerel_ag_izni_olmadan_istek_gitmez(self):
        with self.assertRaisesRegex(KaynakHatasi, "yerel ağ"):
            self._indir("altyazili.html", "cikti7")

    def test_boyut_siniri_bildirilen_ve_bildirilmeyen_boyutta(self):
        with self.assertRaisesRegex(KaynakHatasi, "Medya indirilemedi"):  # Content-Length var: max_filesize
            self._indir("altyazisiz.html", "cikti8", yerel_aga_izin=True, azami_bayt=4096)
        with self.assertRaisesRegex(KaynakHatasi, "sınırını aştığı"):  # Content-Length yok: progress_hooks
            self._indir("akis.html", "cikti9", yerel_aga_izin=True, azami_bayt=4096)


if __name__ == "__main__":
    unittest.main()
