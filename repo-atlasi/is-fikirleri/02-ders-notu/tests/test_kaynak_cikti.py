import csv
import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from ders_notu.__main__ import calistir, main
from ders_notu.altyazi import ayristir
from ders_notu.cikti import anki_csv, not_md, turkce_tarih
from ders_notu.kaynak import (
    KaynakHatasi,
    adres_reddi,
    alan_izinli_mi,
    altyazi_dili,
    baslik_yap,
    boyut_kancasi,
    url_suzgeci,
    yerel_ag_mi,
    yerel_kaynak,
    ytdlp_ile_indir,
)
from ders_notu.ozet import Soru, ders_notu_olustur

ORNEK = Path(__file__).resolve().parent.parent / "ornek" / "kesirler.vtt"
CIKTI_DOSYALARI = ["anki-kartlari.csv", "ders-notu.md", "transkript.md"]


def sahte_ydl(bilgi_ilk: dict, bilgi_son: dict, kayit: list):
    """yt_dlp.YoutubeDL yerine geçen sınıf: aldığı ayarları kaydeder, hazır bilgi sözlüğü döndürür."""

    class SahteYDL:
        def __init__(self, ayar):
            self.ayar = ayar
            kayit.append(ayar)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def extract_info(self, url, download=True):
            if isinstance(bilgi_son, Exception):
                raise bilgi_son
            return bilgi_son if download else bilgi_ilk

    return SahteYDL


class KaynakTesti(unittest.TestCase):
    def test_izinli_alan_adi(self):
        self.assertTrue(alan_izinli_mi("https://ders.kursum.com/video/1", ["kursum.com"]))
        self.assertTrue(alan_izinli_mi("https://KURSUM.com./x", ["https://kursum.com/"]))  # sondaki nokta, URL biçimi
        self.assertTrue(alan_izinli_mi("https://xn--iek-1lab.com/d", ["çiçek.com"]))  # Türkçe alan adı = punycode
        self.assertFalse(alan_izinli_mi("https://kursum.com.baska.io/x", ["kursum.com"]))
        self.assertFalse(alan_izinli_mi("https://notkursum.com/x", ["kursum.com"]))
        self.assertFalse(alan_izinli_mi("https://kursum.com/x", ["", " "]))

    def test_adres_reddi_ve_yerel_ag(self):
        izinli = ["kursum.com", "127.0.0.1", "169.254.169.254", "2130706433", "localhost"]
        self.assertIsNone(adres_reddi("https://kursum.com/d", izinli))
        # Ayrıştırıcı farkıyla atlatma: "\" ve "@" farklı kütüphanelerde farklı sunucuya gider.
        hileli = ["https://kursum.com@evil.com/", "https://evil.com\\@kursum.com/"]
        for url in [*hileli, "ftp://kursum.com/x", "https://kursum.com/a b"]:
            self.assertIsNotNone(adres_reddi(url, izinli), url)
        yerel = ["http://127.0.0.1:8000/", "http://169.254.169.254/latest", "http://2130706433/", "http://localhost/"]
        for url in yerel:
            self.assertIn("yerel ağ", adres_reddi(url, izinli))
            self.assertIsNone(adres_reddi(url, izinli, yerel_aga_izin=True))
        for host in ["::1", "[::ffff:127.0.0.1]", "10.0.0.5", "224.0.0.1", "100.64.0.1", "127.1", "sunucu", "x.local"]:
            self.assertTrue(yerel_ag_mi(host), host)
        for host in ["kursum.com", "93.184.216.34"]:
            self.assertFalse(yerel_ag_mi(host), host)

    def test_yerel_ag_adresi_izinsiz_indirilmez(self):
        kayit = []
        with tempfile.TemporaryDirectory() as gecici, self.assertRaisesRegex(KaynakHatasi, "yerel ağ"):
            ytdlp_ile_indir("http://127.0.0.1:9/d", Path(gecici), ["tr"], ["127.0.0.1"], sahte_ydl({}, {}, kayit))
        self.assertEqual(kayit, [])

    def test_url_suzgeci(self):
        suzgec = url_suzgeci(["kursum.com"])
        # Yalnızca altyazı inecekse medya adresi denetlenmez.
        self.assertIsNone(suzgec({"webpage_url": "https://kursum.com/d", "url": "https://cdn.baska.net/v.mp4"}))
        secilen = {"tr": {"url": "https://baska.net/a.vtt"}}
        altyazi = {"webpage_url": "https://kursum.com/d", "requested_subtitles": secilen}
        with self.assertRaisesRegex(KaynakHatasi, "baska.net"):
            suzgec(altyazi, incomplete=False)
        self.assertIsNone(suzgec(altyazi, incomplete=True))  # eksik bilgide yalnızca sayfa adresi denetlenir
        with self.assertRaisesRegex(KaynakHatasi, "localhost"):
            suzgec({"webpage_url": "https://localhost/d"}, incomplete=True)  # başka alana yönlendirme
        medya = url_suzgeci(["kursum.com"], medya_indirilecek=True)
        bicimler = [{"url": "https://cdn.kursum.com/v"}, {"url": "https://baska.net/a"}]
        with self.assertRaisesRegex(KaynakHatasi, "baska.net"):
            medya({"webpage_url": "https://kursum.com/d", "requested_formats": bicimler})
        self.assertIsNone(medya({"webpage_url": "https://kursum.com/d", "url": "https://cdn.kursum.com/v.mp4"}))

    def test_boyut_kancasi(self):
        kanca = boyut_kancasi(1000)
        kanca({"status": "downloading", "downloaded_bytes": 1000})
        kanca({"status": "finished", "downloaded_bytes": 5000})
        with self.assertRaisesRegex(KaynakHatasi, "sınırını aştığı"):
            kanca({"status": "downloading", "downloaded_bytes": 1001})

    def test_izinsiz_alanda_indirme_baslamaz(self):
        kayit = []
        with self.assertRaises(KaynakHatasi):
            ytdlp_ile_indir("https://www.youtube.com/watch?v=x", Path("/tmp"), ["tr"], [], sahte_ydl({}, {}, kayit))
        self.assertEqual(kayit, [])

    def test_altyazi_varsa_yalnizca_altyazi_istenir(self):
        # Hata: dili olmayan <track> (anahtar None) AttributeError ile çöküyordu.
        kayit = []
        with tempfile.TemporaryDirectory() as gecici:
            vtt = Path(gecici) / "d-1.tr-TR.vtt"
            vtt.write_text("WEBVTT\n", encoding="utf-8")
            girdi = {"title": "Kesirler", "subtitles": {None: [{}], "tr-TR": [{"ext": "vtt"}]}}
            ilk = {"_type": "playlist", "playlist_count": 2, "entries": [girdi]}
            secilen = {"tr-TR": {"filepath": str(vtt)}}
            son = {"_type": "playlist", "entries": [{"title": "Kesirler", "requested_subtitles": secilen}]}
            ydl = sahte_ydl(ilk, son, kayit)
            kaynak = ytdlp_ile_indir("https://kursum.com/d", Path(gecici), ["tr"], ["kursum.com"], ydl, 0)
        self.assertEqual((kaynak.baslik, kaynak.altyazi, kaynak.medya), ("Kesirler", vtt, None))
        self.assertEqual(kaynak.uyarilar, ["Sayfada 2 video var; yalnızca ilki işlendi."])
        self.assertTrue(kayit[1]["skip_download"])
        self.assertEqual(kayit[1]["subtitleslangs"], ["tr\\-TR"])  # yt-dlp dil kodunu düzenli ifade sayar
        for ayar in kayit:
            self.assertEqual((ayar["allowed_extractors"], ayar["playlist_items"]), (["generic", "html5"], "1"))
            self.assertEqual(ayar["max_filesize"], 2048 * 1024 * 1024)
            self.assertTrue(callable(ayar["match_filter"]) and callable(ayar["progress_hooks"][0]))
        self.assertTrue(kayit[0]["outtmpl"]["default"].startswith("%(id)s"))

    def test_altyazi_yoksa_ses_indirilir(self):
        kayit = []
        with tempfile.TemporaryDirectory() as gecici:
            ses = Path(gecici) / "ders.m4a"
            ses.write_bytes(b"x")
            son = {"title": "Ders", "requested_downloads": [{"filepath": str(ses)}]}
            ydl = sahte_ydl({"subtitles": {"en": [{}]}}, son, kayit)
            kaynak = ytdlp_ile_indir("https://kursum.com/d", Path(gecici), ["tr"], ["kursum.com"], ydl, 0)
        self.assertEqual((kaynak.altyazi, kaynak.medya), (None, ses))
        self.assertEqual(kayit[1]["format"], "bestaudio/worst")

    def test_indirme_olmadiysa_anlasilir_hata(self):
        # max_filesize aşılınca yt-dlp hata vermeden indirmez; filepath olmaz.
        son = {"title": "Ders", "requested_downloads": [{"format_id": "0"}]}
        with tempfile.TemporaryDirectory() as gecici, self.assertRaisesRegex(KaynakHatasi, "Medya indirilemedi"):
            ytdlp_ile_indir("https://kursum.com/d", Path(gecici), ["tr"], ["kursum.com"], sahte_ydl({}, son, []), 0)

    def test_ytdlp_hatasi_sarmalanir_jeton_gizlenir(self):
        hata = RuntimeError("HTTP Error 403: https://kursum.com/v.mp4?token=GIZLI")
        with tempfile.TemporaryDirectory() as gecici, self.assertRaises(KaynakHatasi) as ctx:
            ytdlp_ile_indir("https://kursum.com/d", Path(gecici), ["tr"], ["kursum.com"], sahte_ydl({}, hata, []), 0)
        self.assertIn("https://kursum.com/v.mp4?...", str(ctx.exception))
        self.assertNotIn("GIZLI", str(ctx.exception))

    def test_dil_kodu_eslesmesi(self):
        bilgi = {"subtitles": {"../../x": [{}], None: [{}], "TR": [{}]}, "automatic_captions": {"tr": [{}]}}
        self.assertEqual(altyazi_dili(bilgi, ["tr"]), "TR")
        self.assertEqual(altyazi_dili({"subtitles": {"tr_TR": [{}]}}, ["tr-tr"]), "tr_TR")
        self.assertIsNone(altyazi_dili({"subtitles": {"en": [{}]}}, ["tr"]))

    def test_yerel_video_yanindaki_altyazi_bulunur(self):
        with tempfile.TemporaryDirectory() as gecici:
            video = Path(gecici) / "islem-onceligi.mp4"
            video.write_bytes(b"")
            (Path(gecici) / "islem-onceligi.tr.srt").write_text("1\n", encoding="utf-8")
            kaynak = yerel_kaynak(video, ["tr", "../x"])
            beklenen = ("İslem onceligi", "islem-onceligi.mp4", "islem-onceligi.tr.srt")
            self.assertEqual((kaynak.baslik, kaynak.adres, kaynak.altyazi.name), beklenen)
            with self.assertRaises(KaynakHatasi):
                yerel_kaynak(Path(gecici), ["tr"])  # klasör dosya değildir
        self.assertEqual(baslik_yap("ılık_su"), "Ilık su")
        self.assertEqual(baslik_yap("--"), "Ders")


class CiktiTesti(unittest.TestCase):
    def setUp(self):
        self.not_ = ders_notu_olustur("Kesirler", ayristir(ORNEK.read_text(encoding="utf-8")))

    def test_markdown_not(self):
        md = not_md(self.not_, "ornek/kesirler.vtt", datetime(2026, 11, 12, 7, 30, tzinfo=timezone.utc))
        beklenen = "Kaynak: kesirler.vtt · Yöntem: çıkarımsal · Oluşturulma: 12 Kasım 2026, 10:30 (Türkiye saati)"
        self.assertIn(beklenen, md)
        self.assertIn("## Kavram sözlüğü", md)
        self.assertIn("| payda | Kesir çizgisinin altındaki sayıya payda denir. | 00:09 |", md)
        self.assertIn("<details><summary>Cevap</summary>payda.", md)

    def test_markdown_html_kacis_ve_kaynak_gizleme(self):
        # Hata: altyazıdaki "&lt;img ...&gt;" ayrıştırmada etikete dönüşüp nota ham HTML olarak giriyordu;
        # kaynak satırı imzalı bağlantının jetonunu ve kullanıcının yerel klasör yolunu yazıyordu.
        self.not_.sorular.append(Soru("<img src=x onerror=alert(1)> nedir?", "<script>", 0.0))
        self.not_.kavramlar[0].terim = "a|b"
        md = not_md(self.not_, "https://kullanici:parola@kursum.com/ders?token=GIZLI#t=1")
        self.assertNotIn("<img", md)
        self.assertNotIn("<script>", md)
        self.assertIn("&lt;img src=x onerror=alert(1)&gt; nedir?", md)
        self.assertIn("| a\\|b |", md)
        self.assertIn("Kaynak: https://kursum.com/ders?... ·", md)
        self.assertNotIn("GIZLI", md)
        self.assertNotIn("parola", md)
        self.assertIn("Kaynak: ders.mp4 ·", not_md(self.not_, "/home/ayse/Belgeler/ders.mp4"))

    def test_anki_dosyasi(self):
        with tempfile.TemporaryDirectory() as gecici:
            yol = Path(gecici) / "anki.csv"
            adet = anki_csv(self.not_, yol, "Matematik")
            satirlar = yol.read_text(encoding="utf-8").splitlines()
        self.assertEqual(satirlar[:4], ["#separator:Comma", "#html:true", "#tags column:3", "#deck:Matematik"])
        kartlar = list(csv.reader(io.StringIO("\n".join(satirlar[4:]))))
        self.assertEqual(len(kartlar), adet)
        self.assertEqual(kartlar[1][0], "Pay")
        self.assertIn("<br>A) ", kartlar[-1][0])  # çoktan seçmeli soru
        self.assertEqual({k[2] for k in kartlar}, {"kavram", "soru"})

    def test_anki_formul_enjeksiyonu_ve_deste_adi(self):
        # Hata: "=" ile başlayan alan, dosya tabloda açılınca formül olarak çalışabiliyordu; deste adındaki satır
        # sonu dosyaya yeni bir başlık satırı ekleyebiliyordu.
        self.not_.sorular.append(Soru('=HYPERLINK("http://x","tıkla")', "-5", 0.0))
        with tempfile.TemporaryDirectory() as gecici:
            yol = Path(gecici) / "anki.csv"
            anki_csv(self.not_, yol, "Matematik\n#notetype:X")
            satirlar = yol.read_text(encoding="utf-8").splitlines()
        self.assertEqual(satirlar[3], "#deck:Matematik #notetype:X")
        son = list(csv.reader(io.StringIO("\n".join(satirlar[4:]))))[-1]
        self.assertTrue(son[0].startswith("&#61;HYPERLINK("))
        self.assertEqual(son[1], "&#45;5")

    def test_turkce_tarih_ve_saat_dilimi(self):
        self.assertEqual(turkce_tarih(datetime(2026, 11, 12, 7, 30, tzinfo=timezone.utc)), "12 Kasım 2026, 10:30")
        self.assertEqual(turkce_tarih(datetime(2026, 12, 31, 22, 15, tzinfo=timezone.utc)), "1 Ocak 2027, 01:15")
        self.assertEqual(turkce_tarih(datetime(2026, 8, 5, 9, 5)), "5 Ağustos 2026, 09:05")  # saat dilimsiz: TSİ

    def test_ara_dosyalar_silinir_istenirse_saklanir(self):
        # Hata: indirilen medya ve 16 kHz WAV çıktı klasöründe kalıyordu (veri en aza indirme, KVKK md. 4).
        parca = {"text": "Kesrin üstündeki sayıya pay denir.", "timestamp": (0.0, 3.0)}
        boru = lambda girdi, **kw: {"chunks": [parca]}  # noqa: E731

        def sahte_ses_cikar(medya, klasor):
            wav = klasor / "ders.16k.wav"
            wav.write_bytes(b"RIFF")
            return wav

        with tempfile.TemporaryDirectory() as gecici, mock.patch("ders_notu.__main__.ses_cikar", sahte_ses_cikar):
            video, cikti = Path(gecici) / "ders.mp4", Path(gecici) / "cikti"
            video.write_bytes(b"")
            not_ = calistir(str(video), cikti, ["tr"], [], asr=True, boru=boru)
            self.assertEqual([k.terim for k in not_.kavramlar], ["pay"])
            self.assertEqual(sorted(p.name for p in cikti.iterdir()), CIKTI_DOSYALARI)
            calistir(str(video), cikti, ["tr"], [], asr=True, boru=boru, ara_dosyalari_sakla=True)
            self.assertTrue((cikti / "ara" / "ders.16k.wav").is_file())

    def test_komut_satiri(self):
        with tempfile.TemporaryDirectory() as gecici:
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(ORNEK), "-o", gecici]), 0)
            self.assertEqual(sorted(p.name for p in Path(gecici).iterdir()), CIKTI_DOSYALARI)
            for argv, beklenen in [
                (["https://example.com/ders"], "izinli alan"),
                ([str(ORNEK), "--ollama-url", "http://127.0.0.1:9", "--model", "gemma4:cloud"], "KVKK md. 9"),
                ([str(ORNEK), "--ollama-url", "http://gpu.ornek-bulut.com:11434"], "--uzak-ollama"),
                ([str(ORNEK), "--dil", "../x"], "geçersiz dil"),
                (["olmayan-ders.vtt"], "bulunamadı"),
                # Hata: bozuk adresler urlsplit'in ValueError'ıyla yığın izi bırakıyordu.
                (["http://[::1"], "çözümlenemedi"),
                ([str(ORNEK), "--ollama-url", "http://[::1"], "Geçersiz Ollama adresi"),
            ]:
                with redirect_stderr(io.StringIO()) as hata:
                    self.assertEqual(main([*argv, "-o", gecici]), 2, argv)
                self.assertIn(beklenen, hata.getvalue())


if __name__ == "__main__":
    unittest.main()
