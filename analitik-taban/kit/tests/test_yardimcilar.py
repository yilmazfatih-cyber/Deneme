import json
import random
import tempfile
import unittest
import zipfile
from pathlib import Path

from analitik import analiz, ayarlar, csvoku, ozetle, sozluk
from analitik.demo import kosul_derle
from analitik.hotjar import duzlestir
from analitik.mixpanel import filtre_ifadesi


def _kaba_kuvvet_huni(olaylar, adimlar, pencere, bas, bit):
    """Her olası başlangıç için açgözlü eşleşme; en ileri gideni say (O(n²), yalnız test için)."""
    kullanici = {}
    for u, o, t, _ in olaylar:
        kullanici.setdefault(u, []).append((t, o))
    toplam = [0] * len(adimlar)
    for liste in kullanici.values():
        liste.sort()
        en = 0
        for i, (t0, o0) in enumerate(liste):
            if o0 != adimlar[0] or not bas <= t0 <= bit:
                continue
            derinlik, j = 1, i + 1
            while derinlik < len(adimlar) and j < len(liste):
                t, o = liste[j]
                if t - t0 > pencere:
                    break
                if o == adimlar[derinlik]:
                    derinlik += 1
                j += 1
            en = max(en, derinlik)
        for k in range(en):
            toplam[k] += 1
    return toplam


class HuniDogrulama(unittest.TestCase):
    def test_rastgele_dizilerde_kaba_kuvvetle_ayni(self):
        rnd = random.Random(3)
        adimlar = ["A", "B", "C"]
        for _ in range(300):
            olaylar = [(f"u{rnd.randint(1, 4)}", rnd.choice("ABCD"), rnd.randint(0, 50), None) for _ in range(12)]
            beklenen = _kaba_kuvvet_huni(olaylar, adimlar, 10, 0, 40)
            # eş zamanlı olaylarda sıra belirsiz; kaba kuvvet yalnız benzersiz zamanlarda karşılaştırılır
            zamanlar = [(u, t) for u, _, t, _ in olaylar]
            if len(set(zamanlar)) != len(zamanlar):
                continue
            self.assertEqual(analiz.huni_hesapla(olaylar, adimlar, 10, 0, 40)["toplam"], beklenen, olaylar)


class FiltreTesti(unittest.TestCase):
    def test_filtre_ifadeleri_demo_degerlendiriciyle_tutarli(self):
        ifade = filtre_ifadesi(["$os=Android", "surum~5.2", "tutar>=100", "plan!=free", "aktif=true", "kod=7"])
        kosul = kosul_derle(ifade)
        temel = {"$os": "Android", "surum": "5.2.0", "tutar": 150.0, "plan": "pro", "aktif": True, "kod": "7"}
        self.assertTrue(kosul(temel))
        for anahtar, deger in (
            ("$os", "iOS"),
            ("surum", "5.1.0"),
            ("tutar", 99.0),
            ("plan", "free"),
            ("aktif", False),
            ("kod", "8"),
        ):
            self.assertFalse(kosul({**temel, anahtar: deger}), anahtar)
        self.assertTrue(kosul({**temel, "kod": 7.0}))
        self.assertFalse(kosul({k: v for k, v in temel.items() if k != "plan"}) is None)
        self.assertEqual(filtre_ifadesi([], "  "), None)
        with self.assertRaises(ValueError):
            filtre_ifadesi(["bozuk"])

    def test_where_ozel_ifadeler(self):
        k = kosul_derle('not defined(properties["x"]) or properties["y"] in ["a", "b"]')
        self.assertTrue(k({}))
        self.assertTrue(k({"x": 1, "y": "b"}))
        self.assertFalse(k({"x": 1, "y": "c"}))


class AyarTesti(unittest.TestCase):
    def test_env_okuma(self):
        with tempfile.TemporaryDirectory() as d:
            yol = Path(d) / ".env"
            yol.write_text("# yorum\nexport A=1\nB='iki # değil yorum'\nC=üç # yorum\nD=\n=bos\n", encoding="utf-8")
            self.assertEqual(ayarlar.env_oku(yol), {"A": "1", "B": "iki # değil yorum", "C": "üç", "D": ""})

    def test_derin_birlestirme_ve_hatali_json(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "ayarlar.json").write_text('{"_aciklama": "x", "mixpanel": {"bolge": "eu"}}', encoding="utf-8")
            ayar = ayarlar.yukle(Path(d))
            self.assertEqual(ayar["mixpanel"]["bolge"], "eu")
            self.assertEqual(ayar["mixpanel"]["kaynak"], "api")
            self.assertNotIn("_aciklama", ayar.veri)
            self.assertEqual(ayarlar.VARSAYILAN["mixpanel"]["bolge"], "us")
            (Path(d) / "ayarlar.json").write_text('{"mixpanel": {', encoding="utf-8")
            with self.assertRaises(ayarlar.AyarHatasi):
                ayarlar.yukle(Path(d))


class SozlukTesti(unittest.TestCase):
    def test_ice_aktar_csv_json_ve_ara(self):
        with tempfile.TemporaryDirectory() as d:
            csv_yol = Path(d) / "lexicon.csv"
            csv_yol.write_text(
                "Entity Type,Entity Name,Property Name,Description,Volume\n"
                "Event,Sipariş Verildi,tutar,Sipariş tamamlandı,1.204\nEvent,Sipariş Verildi,para,,\n"
                "Profile,$email,,,\nEvent,İndirim Kodu Girildi,kod,,30\n",
                encoding="utf-8",
            )
            s = sozluk.ice_aktar(csv_yol)
            adlar = {o["ad"]: o for o in s["olaylar"]}
            self.assertEqual(set(adlar), {"Sipariş Verildi", "İndirim Kodu Girildi"})
            self.assertEqual(adlar["Sipariş Verildi"]["ozellikler"], ["tutar", "para"])
            self.assertEqual(adlar["Sipariş Verildi"]["hacim"], 1204)
            self.assertEqual(sozluk.ara(s, "SİPARİŞ")["olaylar"][0]["ad"], "Sipariş Verildi")
            self.assertEqual(sozluk.ara(s, "indirim")["olaylar"][0]["ad"], "İndirim Kodu Girildi")
            self.assertEqual(sozluk.ara(s, "tutar")["ozellikler"][0][0], "tutar")
            json_yol = Path(d) / "s.json"
            json_yol.write_text(json.dumps([{"name": "Login", "properties": ["method"]}, "Logout"]), encoding="utf-8")
            self.assertEqual(len(sozluk.ice_aktar(json_yol)["olaylar"]), 2)


class OzetTesti(unittest.TestCase):
    def test_isi_haritasi(self):
        b = ["Element CSS selector", "Total # of clicks", "Visible in image", "% of total"]
        s = [["#odeme-btn", "120", "Yes", "60%"], ["div.banner", "50", "No", "25%"], ["a.logo", "30", "Yes", "15%"]]
        cikti = ozetle.csv_ozet(b, s, "isi.csv")
        self.assertIn("görüntüde olmayan öğelere tıklama %25,0", cikti)
        self.assertIn("#odeme-btn", cikti)

    def test_devam_satirlari_ve_coklu_secim(self):
        b = ["Number", "Puan", "Seçim"]
        s = [["1", "9", "Sepet"], ["", "", "Arama"], ["2", "6", "Kampanya"]]
        birlesik = ozetle.devam_satirlarini_birlestir(b, s)
        self.assertEqual(birlesik, [["1", "9", "Sepet | Arama"], ["2", "6", "Kampanya"]])

    def test_xlsx(self):
        with tempfile.TemporaryDirectory() as d:
            yol = Path(d) / "a.xlsx"
            with zipfile.ZipFile(yol, "w") as z:
                z.writestr(
                    "xl/sharedStrings.xml",
                    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                    "<si><t>Date Submitted</t></si><si><t>Yorum</t></si><si><t>Ödeme yavaş</t></si></sst>",
                )
                z.writestr(
                    "xl/worksheets/sheet1.xml",
                    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr">'
                    "<is><t>Puan</t></is></c></row>"
                    '<row r="2"><c r="A2"><v>46000.5</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>9</v></c></row>'
                    "</sheetData></worksheet>",
                )
            basliklar, satirlar = csvoku.oku(yol)
        self.assertEqual(basliklar, ["Date Submitted", "Yorum", "Puan"])
        self.assertEqual(satirlar, [["2025-12-09 12:00:00", "Ödeme yavaş", "9"]])

    def test_filtre(self):
        b = ["Puan", "URL"]
        s = [["9", "https://x/odeme"], ["3", "https://x/sepet"], ["6", "https://x/ODEME/2"]]
        self.assertEqual(len(ozetle.satir_filtrele(b, s, ["Puan<=6"])), 2)
        self.assertEqual(len(ozetle.satir_filtrele(b, s, ["URL~odeme", "Puan<=6"])), 1)


class HotjarDuzlestirme(unittest.TestCase):
    def test_coklu_secim_yorum_ve_nitelik(self):
        anket = {
            "questions": [
                {"id": "q1", "text": "Puan", "type": "nps"},
                {"id": "q2", "text": "Neden", "type": "long-text"},
                {"id": "q3", "text": "Bitti", "type": "thank-you"},
            ]
        }
        yanitlar = [
            {
                "id": "r1",
                "created_time": "2026-11-01T10:00:00Z",
                "is_complete": True,
                "answers": [
                    {"question_id": "q1", "answer": "10"},
                    {"question_id": "q2", "answer": "Hızlı"},
                    {"question_id": "q2", "answer": "Kolay", "comment": "çok"},
                ],
                "user_attributes": [{"name": "plan", "value": "pro"}],
                "tags": [{"name": "vip"}],
            }
        ]
        b, s = duzlestir(anket, yanitlar)
        satir = dict(zip(b, s[0]))
        self.assertEqual(satir["Puan"], "10")
        self.assertEqual(satir["Neden"], "Hızlı | Kolay")
        self.assertEqual(satir["Neden (yorum)"], "çok")
        self.assertEqual(satir["nitelik:plan"], "pro")
        self.assertEqual(satir["Etiketler"], "vip")
        self.assertNotIn("Bitti", b)


if __name__ == "__main__":
    unittest.main()
