"""Demo modunda kurulumdan rapora tüm komutlar: ekili sorunları doğru buluyor mu, çıktılar kısa mı?"""

import contextlib
import io
import os
import tempfile
import unittest
from pathlib import Path

import hj as hj_cli
import kurulum as kurulum_cli
import mp as mp_cli
import ozet as ozet_cli
from analitik import ayarlar as A

AZAMI_SATIR = 40  # modele giden her çıktı kısa kalmalı


class DemoUctanUca(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.eski_ortam = dict(os.environ)
        cls.gecici = tempfile.TemporaryDirectory()
        cls.yerel = Path(cls.gecici.name) / "yerel"
        os.environ["ANALITIK_YEREL"] = str(cls.yerel)
        for anahtar in (
            "ANALITIK_BUGUN",
            "ANALITIK_DEMO",
            "MIXPANEL_QUERY_BASE",
            "MIXPANEL_EXPORT_BASE",
            "MIXPANEL_APP_BASE",
            "HOTJAR_API_BASE",
        ):
            os.environ.pop(anahtar, None)
        cls.calistir(kurulum_cli, ["baslat", "--demo"])

    @classmethod
    def tearDownClass(cls):
        os.environ.clear()
        os.environ.update(cls.eski_ortam)
        cls.gecici.cleanup()

    @staticmethod
    def calistir(modul, argv):
        cikti = io.StringIO()
        with contextlib.redirect_stdout(cikti):
            kod = modul.main(argv)
        return kod, cikti.getvalue()

    def komut(self, modul, argv, azami=AZAMI_SATIR):
        kod, cikti = self.calistir(modul, argv)
        self.assertEqual(kod, 0, cikti)
        self.assertLessEqual(len(cikti.strip().splitlines()), azami, cikti)
        return cikti

    def test_kurulum_ve_baglam(self):
        self.assertTrue((self.yerel / "sozluk.json").exists())
        baglam = (self.yerel.parent / "CLAUDE.local.md").read_text(encoding="utf-8")
        self.assertIn("DEMO", A.yukle().get("proje_adi"))
        self.assertIn("Kayıtlı huniler: Kayıt=1001", baglam)
        self.assertLess(len(baglam.split()), 220, "bağlam her oturumda yüklenir; kısa kalmalı")
        cikti = self.komut(kurulum_cli, ["durum"])
        self.assertIn("Mod: DEMO", cikti)

    def test_ara(self):
        cikti = self.komut(mp_cli, ["ara", "ödeme"])
        self.assertIn("Checkout Started", cikti)
        cikti = self.komut(mp_cli, ["ara", "purchse"])
        self.assertIn("Yakın adlar: Purchase", cikti)

    def test_neden_android_bulur(self):
        cikti = self.komut(mp_cli, ["neden", "Purchase", "--donem", "hafta"])
        self.assertIn("Yoğunlaşma: $os", cikti)
        self.assertIn("Android", cikti)
        self.assertIn("Karma kayması", cikti)
        self.assertIn("$app_version_string", cikti)
        self.assertIn("Android 5.2.0", cikti)  # olay günlüğü notu
        oran = self.komut(mp_cli, ["neden", "--pay", "Purchase", "--payda", "Checkout Started", "--donem", "hafta"])
        satirlar = [s for s in oran.splitlines() if s.startswith("| $os") or s.startswith("| $app_version_string")]
        self.assertTrue(any("Android" in s for s in satirlar[:2]), oran)
        self.assertTrue(any("5.2.0" in s for s in satirlar[:2]), oran)

    def test_neden_csv_koprusu(self):
        yol = self.yerel / "girdi" / "neden.csv"
        yol.write_text(
            "boyut,segment,a,b\n$os,Android,253,346\n$os,iOS,310,293\n$os,(toplam),748,836\n"
            "ulke,TR,520,580\nulke,DE,60,70\n",
            encoding="utf-8",
        )
        cikti = self.komut(mp_cli, ["neden", "--csv", str(yol)])
        self.assertIn("Android", cikti)

    def test_kpi(self):
        cikti = self.komut(mp_cli, ["kpi", "--donem", "hafta", "--rapor"])
        self.assertIn("⚠ Ödeme dönüşümü", cikti)
        rapor = next((self.yerel / "raporlar").glob("*kpi-hafta*.md")).read_text(encoding="utf-8")
        self.assertIn("## Yorum", rapor)
        self.assertIn("| KPI", rapor)

    def test_huni_ve_yerel_huni_ayni(self):
        kayitli = self.komut(mp_cli, ["huni", "Satın alma", "--aralik", "2026-10-20:2026-10-26"])
        yerel = self.komut(
            mp_cli,
            [
                "huni-yerel",
                "View Product",
                "Add to Cart",
                "Checkout Started",
                "Purchase",
                "--aralik",
                "2026-10-20:2026-10-26",
                "--pencere",
                "7g",
            ],
        )

        def sayilar(metin):
            return [
                s.split("|")[3].strip()
                for s in metin.splitlines()
                if s.startswith("|") and s.split("|")[1].strip().isdigit()
            ]

        self.assertEqual(sayilar(kayitli), sayilar(yerel))
        self.assertEqual(len(sayilar(kayitli)), 4)
        segment = self.komut(mp_cli, ["huni", "1002", "--on", "$os", "--aralik", "14g"])
        self.assertRegex(segment, r"Android .*⚠")

    def test_tutunma_kayitli_seri_kirilim(self):
        self.assertIn("ağırlıklı ort.", self.komut(mp_cli, ["tutunma", "Sign Up", "App Open", "--sayi", "7"]))
        self.assertIn("(genel)", self.komut(mp_cli, ["kayitli", "2002"]))
        self.assertIn("Huni:", self.komut(mp_cli, ["kayitli", "2003"]))
        self.assertIn("App Open", self.komut(mp_cli, ["seri", "App Open", "--tip", "unique"]))
        self.assertIn("TOPLAM", self.komut(mp_cli, ["kirilim", "Purchase", "--on", "utm_source"]))
        self.assertIn("5.2.0", self.komut(mp_cli, ["degerler", "Purchase", "$app_version_string"]))

    def test_deney(self):
        cikti = self.komut(
            mp_cli, ["deney", "Yeni Sepet", "--donusum", "Purchase", "--aralik", "2026-10-19:2026-11-08"]
        )
        self.assertIn("SRM: p=", cikti)
        self.assertRegex(cikti, r"Yeni Sepet: (HENÜZ BELİRSİZ|ANLAMLI)")
        kod, cikti = self.calistir(mp_cli, ["deney", "Olmayan", "--donusum", "Purchase"])
        self.assertEqual(kod, 2)
        self.assertIn("maruziyet bulunamadı", cikti)

    def test_hotjar_akisi(self):
        cikti = self.komut(hj_cli, ["indir", "survey_7f3c2a10-demo-4b1e-9c55-nps000000001"])
        self.assertIn("640 yanıt indirildi", cikti)
        dosya = "hotjar-anket-7f3c2a10-dem.csv"
        self.assertIn("NPS", self.komut(hj_cli, ["ozet", dosya, "--grup", "Cihaz"]))
        ornek = self.komut(hj_cli, ["ornek", dosya, "--n", "15"], azami=25)
        self.assertNotRegex(ornek, r"@")
        tema = self.komut(hj_cli, ["tema", dosya, "--kurallar", str(self.yerel / "temalar.json"), "--grup", "Cihaz"])
        self.assertIn("Ödeme / kart", tema)
        self.assertIn("Eşleşmeyen", tema)

    def test_ozet_genis_csv(self):
        cikti = self.komut(ozet_cli, [str(self.yerel / "girdi" / "demo-mixpanel-disa-aktarim.csv")])
        self.assertIn("Geniş zaman serisi", cikti)
        self.assertIn("Android", cikti)

    def test_hatali_girdiler_kibar(self):
        for modul, argv in (
            (mp_cli, ["neden"]),
            (mp_cli, ["huni", "olmayan-huni"]),
            (mp_cli, ["seri", "Purchase", "--aralik", "2026-13-01:2026-13-02"]),
            (mp_cli, ["kirilim", "Purchase", "--on", "$os", "--filtre", "bozuk"]),
            (hj_cli, ["ozet", "yok.csv"]),
            (ozet_cli, ["yok.csv"]),
        ):
            kod, cikti = self.calistir(modul, argv)
            self.assertEqual(kod, 2, f"{argv}: {cikti}")
            self.assertTrue(cikti.startswith("HATA: "), cikti)
            self.assertNotIn("Traceback", cikti)


if __name__ == "__main__":
    unittest.main()
