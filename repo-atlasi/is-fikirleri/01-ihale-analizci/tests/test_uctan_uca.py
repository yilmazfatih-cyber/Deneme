import csv
import io
import os
import re
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from ihale_analizci.__main__ import Analiz, analiz_et, main, yaz
from ihale_analizci.bolum import Birim
from ihale_analizci.cikaricilar import Bulgu
from ihale_analizci.donustur import DonusturmeHatasi, MarkItDownDonusturucu, YerelDonusturucu, boyut_denetle
from ihale_analizci.llm import LLMHatasi, OllamaIstemci

ORNEK = Path(__file__).resolve().parent.parent / "ornek"


class SahteIstemci:
    model = "sahte-model"

    def __init__(self, cevap=None, hata=None, dogrulama_hatasi=None):
        self.cevap, self.hata, self.dogrulama_hatasi = cevap, hata, dogrulama_hatasi

    def dogrula(self):
        if self.dogrulama_hatasi:
            raise self.dogrulama_hatasi

    def json_sohbet(self, sistem, kullanici, sema):
        if self.hata:
            raise self.hata
        return self.cevap if "Madde 15" in kullanici else {"maddeler": []}


def calistir(*argumanlar) -> int:
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return main([str(a) for a in argumanlar])


def csv_oku(yol: Path) -> list[list[str]]:
    return list(csv.reader(io.StringIO(yol.read_bytes().decode("utf-8-sig")), delimiter=";"))


class UctanUcaTesti(unittest.TestCase):
    def test_komut_satiri_ornek_klasorde_calisir(self):
        with tempfile.TemporaryDirectory() as gecici:
            self.assertEqual(calistir(ORNEK, "-o", gecici, "--donusturucu", "yerel"), 0)
            md = (Path(gecici) / "kontrol-listesi.md").read_text(encoding="utf-8")
            self.assertIn("**Geçici teminat**: %3", md)
            self.assertIn("Kaynak: idari-sartname.html › Madde 26 - Geçici teminat › 26.1", md)
            self.assertIn("**Gecikme cezası**: binde 1", md)
            ham = (Path(gecici) / "kontrol-listesi.csv").read_bytes()
            self.assertTrue(ham.startswith(b"\xef\xbb\xbf"))  # Excel için BOM
            satirlar = csv_oku(Path(gecici) / "kontrol-listesi.csv")
            self.assertEqual(satirlar[0][:3], ["durum", "kategori", "baslik"])
            self.assertIn(["açık", "teminat", "Kesin teminat", "%6"], [s[:4] for s in satirlar])
            self.assertTrue((Path(gecici) / "markdown" / "sozlesme-tasarisi.txt.md").exists())

    def test_cp1254_kodlu_metin_okunur(self):
        with tempfile.TemporaryDirectory() as gecici:
            yol = Path(gecici) / "eski.txt"
            yol.write_bytes("Madde 41 - Kesin teminat\nİhale bedelinin %6'sı kesin teminat alınır.".encode("cp1254"))
            analiz = analiz_et(Path(gecici), YerelDonusturucu())
            self.assertEqual([(b.baslik, b.deger) for b in analiz.bulgular], [("Kesin teminat", "%6")])

    def test_desteklenmeyen_bicim_ve_bos_metin_not_dusulur(self):
        with tempfile.TemporaryDirectory() as gecici:
            (Path(gecici) / "sartname.pdf").write_bytes(b"%PDF-1.4")
            (Path(gecici) / "tarama.txt").write_text("  \n", encoding="utf-8")
            analiz = analiz_et(Path(gecici), YerelDonusturucu())
            self.assertTrue(any("sartname.pdf" in n for n in analiz.notlar))
            self.assertTrue(any("tarama.txt" in n and "OCR" in n for n in analiz.notlar))

    def test_buyuk_harfli_icerik_satirlari_uctan_uca_bulunur(self):
        # Eskiden bu üç satır başlık sanılıyor ve hiçbir madde çıkmıyordu.
        metin = (
            "Madde 4 - İhaleye ilişkin bilgiler\nSON TEKLİF VERME TARİHİ 5 ŞUBAT 2027 SAAT 14.00\n"
            "Madde 44 - Fiyat farkı\nBU İHALEDE FİYAT FARKI VERİLMEYECEKTİR.\n**Yükleniciye avans verilmeyecektir.**\n"
        )
        with tempfile.TemporaryDirectory() as gecici:
            (Path(gecici) / "s.txt").write_text(metin, encoding="utf-8")
            analiz = analiz_et(Path(gecici), YerelDonusturucu())
        ozet = [(b.baslik, b.deger, b.birim.bolum) for b in analiz.bulgular]
        self.assertEqual(
            ozet,
            [
                ("İhale (son teklif) tarihi", "05.02.2027 14:00", "Madde 4 - İhaleye ilişkin bilgiler"),
                ("Fiyat farkı", "yok", "Madde 44 - Fiyat farkı"),
                ("Avans", "yok", "Madde 44 - Fiyat farkı"),
            ],
        )

    def test_kaynak_satiri_kaydedilen_dosyadaki_satirdir(self):
        # Sayfa sonu (\x0c) eskiden satır numarasını kaydırıyordu.
        metin = "Kapak\n\x0cMadde 26 - Geçici teminat\n26.1. Bedelin %3'ü kadar geçici teminat verilir.\n"
        with tempfile.TemporaryDirectory() as gecici:
            girdi, cikti = Path(gecici) / "girdi", Path(gecici) / "cikti"
            girdi.mkdir()
            (girdi / "s.txt").write_text(metin, encoding="utf-8")
            self.assertEqual(calistir(girdi, "-o", cikti, "--donusturucu", "yerel"), 0)
            kayitli = (cikti / "markdown" / "s.txt.md").read_text(encoding="utf-8").split("\n")
            for satir in csv_oku(cikti / "kontrol-listesi.csv")[1:]:
                if satir[0] == "açık":
                    self.assertIn(satir[9], kayitli[int(satir[8]) - 1])

    def test_llm_yalnizca_kuralin_kacirdigini_ekler(self):
        cevap = {
            "maddeler": [
                {"kategori": "tarih", "baslik": "İşin süresi", "deger": "60 gün", "alinti": "60 (altmış) takvim günüdür"},
                {"kategori": "belge", "baslik": "Teslim yeri", "deger": "depo", "alinti": "idarenin deposuna teslim"},
            ]
        }
        analiz = analiz_et(ORNEK, YerelDonusturucu(), SahteIstemci(cevap))
        llm = [(b.baslik, b.birim.alt_madde) for b in analiz.bulgular if b.yontem == "llm"]
        self.assertEqual(llm, [("Teslim yeri", "15.2")])  # 15.1 kuralla zaten bulunmuştu
        self.assertTrue(any("sahte-model" in n and "1 yeni madde" in n for n in analiz.notlar))

    def test_llm_hatasinda_kurallar_yine_calisir(self):
        for istemci in [SahteIstemci(hata=LLMHatasi("bağlantı yok")), SahteIstemci(dogrulama_hatasi=LLMHatasi("bulut modeli"))]:
            analiz = analiz_et(ORNEK, YerelDonusturucu(), istemci)
            self.assertTrue(any("kullanılamadı" in n for n in analiz.notlar))
            self.assertGreater(len(analiz.bulgular), 10)

    def test_uzak_ollama_izni_rapora_yazilir(self):
        def gonder(yol, govde):
            return {"message": {"role": "assistant", "content": '{"maddeler": []}'}, "done": True}

        istemci = OllamaIstemci("http://8.8.8.8:11434", "m", gonder=gonder, uzak_izni=True)
        analiz = analiz_et(ORNEK, YerelDonusturucu(), istemci)
        self.assertTrue(any("yerel ağ dışındaki 8.8.8.8" in n for n in analiz.notlar))
        analiz = analiz_et(ORNEK, YerelDonusturucu(), OllamaIstemci("http://8.8.8.8:11434", "m", gonder=gonder))
        self.assertTrue(any("kullanılamadı" in n and "--uzak-ollama" in n for n in analiz.notlar))

    def test_csv_formul_enjeksiyonu_etkisiz(self):
        kaynak = Birim("s.txt", "Madde 7 - Belgeler", None, 3, '=HYPERLINK("http://ornek.invalid","tıkla")')
        analiz = Analiz(belgeler=["s.txt"], bulgular=[Bulgu("belge", "@SUM(1+1)", "-5", kaynak, "+uyarı")])
        with tempfile.TemporaryDirectory() as gecici:
            yaz(analiz, Path(gecici), markdown_yaz=False)
            satir = csv_oku(Path(gecici) / "kontrol-listesi.csv")[1]
        for hucre in (satir[2], satir[3], satir[4], satir[9]):  # başlık, değer, uyarı, alıntı
            self.assertTrue(hucre.startswith("'"), hucre)

    def test_markdown_raporunda_baglanti_ve_resim_etkisiz(self):
        kaynak = Birim("s.txt", "Madde 7", None, 3, "Belge listesi <img src=x>")
        bulgu = Bulgu("belge", "![x](http://ornek.invalid/a.png)", "[tıkla](http://ornek.invalid)", kaynak, yontem="llm")
        with tempfile.TemporaryDirectory() as gecici:
            yaz(Analiz(belgeler=["s.txt"], bulgular=[bulgu]), Path(gecici), markdown_yaz=False)
            md = (Path(gecici) / "kontrol-listesi.md").read_text(encoding="utf-8")
        self.assertNotIn("![x](", md)
        self.assertNotIn("[tıkla](", md)
        self.assertIsNone(re.search(r"(?<!\\)<", md))  # her "<" kaçırılmış: HTML etiketi oluşmaz
        self.assertIn("\\[x\\]", md)

    def test_bos_klasor_rapor_uretmez(self):
        with tempfile.TemporaryDirectory() as gecici:
            girdi, cikti = Path(gecici) / "girdi", Path(gecici) / "cikti"
            girdi.mkdir()
            self.assertEqual(calistir(girdi, "-o", cikti), 3)
            self.assertFalse((cikti / "kontrol-listesi.md").exists())
            self.assertEqual(analiz_et(girdi, YerelDonusturucu()).eksikler, [])  # "bulunamadı" listesi yok

    def test_cikti_girdiyle_ayni_olamaz(self):
        with tempfile.TemporaryDirectory() as gecici:
            self.assertEqual(calistir(gecici, "-o", gecici), 2)

    def test_markitdown_yoksa_anlasilir_hata(self):
        with tempfile.TemporaryDirectory() as gecici, mock.patch("ihale_analizci.__main__.donusturucu_sec", side_effect=ImportError):
            self.assertEqual(calistir(ORNEK, "-o", gecici, "--donusturucu", "markitdown"), 2)

    def test_gecersiz_ollama_adresi_anlasilir_hata(self):
        with tempfile.TemporaryDirectory() as gecici:
            self.assertEqual(calistir(ORNEK, "-o", gecici, "--donusturucu", "yerel", "--ollama-url", "ftp://x"), 2)

    def test_alt_klasor_kilit_dosyasi_ve_sembolik_baglanti_atlanir(self):
        with tempfile.TemporaryDirectory() as gecici:
            klasor = Path(gecici) / "girdi"
            klasor.mkdir()
            (klasor / "ekler").mkdir()
            (klasor / "~$idari.txt").write_text("kilit", encoding="utf-8")
            (klasor / ".DS_Store").write_text("x", encoding="utf-8")
            (klasor / "s.txt").write_text("Madde 41 - Kesin teminat\nİhale bedelinin %6'sı kesin teminat alınır.", encoding="utf-8")
            gizli = Path(gecici) / "gizli.txt"
            gizli.write_text("Madde 1 - Gizli\nGeçici teminat %1 alınır.", encoding="utf-8")
            try:
                os.symlink(gizli, klasor / "baglanti.txt")
            except (OSError, NotImplementedError):
                self.skipTest("bu sistemde sembolik bağlantı kurulamıyor")
            analiz = analiz_et(klasor, YerelDonusturucu())
        self.assertEqual(analiz.belgeler, ["s.txt"])
        notlar = " ".join(analiz.notlar)
        for parca in ["sembolik bağlantı", "alt klasörler", "kilit dosyası"]:
            self.assertIn(parca, notlar)
        self.assertNotIn(".DS_Store", notlar)

    def test_boyut_siniri_ve_zip_bombasi(self):
        with tempfile.TemporaryDirectory() as gecici:
            klasor = Path(gecici)
            (klasor / "buyuk.txt").write_text("Geçici teminat %3. " * 20, encoding="utf-8")
            analiz = analiz_et(klasor, YerelDonusturucu(), en_buyuk_bayt=100)
            self.assertTrue(any("üst sınır" in n for n in analiz.notlar))
            with zipfile.ZipFile(klasor / "bomba.docx", "w", zipfile.ZIP_DEFLATED) as paket:
                paket.writestr("word/document.xml", "0" * 2_000_000)  # birkaç KB'ye sıkışır
            with self.assertRaises(DonusturmeHatasi):
                boyut_denetle(klasor / "bomba.docx", en_buyuk=100_000)

    def test_eski_markdown_kopyalari_temizlenir_kullanici_dosyasi_kalir(self):
        with tempfile.TemporaryDirectory() as gecici:
            kok = Path(gecici)
            a, b, cikti = kok / "a", kok / "b", kok / "cikti"
            for klasor, ad in ((a, "ihale-a.txt"), (b, "ihale-b.txt")):
                klasor.mkdir()
                (klasor / ad).write_text("Madde 41 - Kesin teminat\nİhale bedelinin %6'sı kesin teminat alınır.", encoding="utf-8")
            self.assertEqual(calistir(a, "-o", cikti, "--donusturucu", "yerel"), 0)
            (cikti / "markdown" / "notlarim.md").write_text("kullanıcının dosyası", encoding="utf-8")
            self.assertEqual(calistir(b, "-o", cikti, "--donusturucu", "yerel"), 0)
            kalanlar = sorted(p.name for p in (cikti / "markdown").iterdir() if not p.name.startswith("."))
            self.assertEqual(kalanlar, ["ihale-b.txt.md", "notlarim.md"])
            self.assertEqual(calistir(b, "-o", cikti, "--donusturucu", "yerel", "--markdown-yazma"), 0)
            kalanlar = sorted(p.name for p in (cikti / "markdown").iterdir())
            self.assertEqual(kalanlar, ["notlarim.md"])

    def test_markitdown_yerel_dosyayi_adres_saymaz(self):
        # convert(str) "http:..." ile başlayan göreli dosya adını adres sayıp requests ile istek atıyordu.
        class SahteMarkItDown:
            def __init__(self):
                self.yollar = []

            def convert(self, kaynak, **_):
                raise AssertionError("convert() değil convert_local() çağrılmalı")

            def convert_local(self, yol, **_):
                self.yollar.append(yol)
                return type("Sonuc", (), {"markdown": "# Başlık"})()

        sahte = SahteMarkItDown()
        self.assertEqual(MarkItDownDonusturucu(md=sahte).markdown(Path("http:ornek.html")), "# Başlık")
        self.assertEqual(sahte.yollar, ["http:ornek.html"])


if __name__ == "__main__":
    unittest.main()
