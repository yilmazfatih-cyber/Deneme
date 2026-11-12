import copy
import json
import unittest
from pathlib import Path

from asama2_denetim import denetle
from asama4_uretici import VeriHatasi, dogrula, tazelik_farki, uret

ORNEK = json.loads((Path(__file__).resolve().parent.parent / "ornekler" / "turkce-kaynaklar.json").read_text("utf-8"))


def kucuk_veri(**ek) -> dict:
    veri = {
        "baslik": "Awesome Deneme",
        "aciklama": "Deneme listesi.",
        "yerel": "tr",
        "kategoriler": [
            {"ad": "İş Akışı", "girdiler": [{"ad": "B", "url": "https://b.example", "aciklama": "B aracı."}]},
            {
                "ad": "Araçlar",
                "girdiler": [
                    {"ad": "Zeta", "url": "https://z.example", "aciklama": "Z aracı.", "yildiz": 10},
                    {"ad": "Alfa", "url": "https://a.example", "aciklama": "A aracı.", "yildiz": 5},
                    {"ad": "Orta", "url": "https://o.example", "aciklama": "O aracı.", "yildiz": 50},
                ],
            },
        ],
    }
    veri.update(ek)
    return veri


class UretimTesti(unittest.TestCase):
    def test_ornek_veri_sirali_ve_icindekiler_dogru(self):
        metin = uret(ORNEK)
        basliklar = [s for s in metin.splitlines() if s.startswith("## ")]
        # Türkçe sıra: K < Ö < P < T (bayt sırasında Ö en sona düşerdi)
        self.assertEqual(basliklar, ["## Contents", "## Kitaplar", "## Öğreticiler", "## Podcastler", "## Topluluklar", "## Contributing"])
        self.assertIn("- [Öğreticiler](#öğreticiler)", metin)
        self.assertNotIn("[Contributing]", metin)  # awesome kuralı: Contributing İçindekiler'de olmaz
        self.assertTrue(metin.endswith("\n") and not metin.endswith("\n\n"))

    def test_uretilen_readme_denetimden_gecer(self):
        self.assertEqual(denetle(uret(ORNEK), yerel="tr"), [])
        self.assertEqual(denetle(uret(kucuk_veri(ascii_capa=True)), yerel="tr"), [])

    def test_belirlenimci_ve_girdi_sirasindan_bagimsiz(self):
        karisik = copy.deepcopy(ORNEK)
        karisik["kategoriler"].reverse()
        for kategori in karisik["kategoriler"]:
            kategori["girdiler"].reverse()
        self.assertEqual(uret(ORNEK), uret(karisik))

    def test_ascii_capa(self):
        metin = uret(kucuk_veri(ascii_capa=True))
        self.assertIn('## <a id="is-akisi"></a>İş Akışı', metin)
        self.assertIn("- [İş Akışı](#is-akisi)", metin)
        self.assertIn('## <a id="araclar"></a>Araçlar', metin)
        self.assertIn("- [Araçlar](#araclar)", metin)
        varsayilan = uret(kucuk_veri())
        self.assertIn("- [İş Akışı](#i\u0307ş-akışı)", varsayilan)  # GitHub kuralı: görünmez birleşen nokta

    def test_metrik_siralama(self):
        metin = uret(kucuk_veri(siralama="metrik", metrik_alani="yildiz"))
        sira = [s.split("]")[0][3:] for s in metin.splitlines() if s.startswith("- [") and "example" in s]
        self.assertEqual(sira, ["Orta", "Zeta", "Alfa", "B"])

    def test_veri_sirasi_korunabilir(self):
        metin = uret(kucuk_veri(siralama="veri"))
        self.assertLess(metin.index("## İş Akışı"), metin.index("## Araçlar"))


class DogrulamaTesti(unittest.TestCase):
    def test_hatalar_toplu_raporlanir(self):
        veri = kucuk_veri()
        veri["kategoriler"][1]["girdiler"] += [
            {"ad": "Eksik", "url": "https://e.example"},
            {"ad": "Şema", "url": "ftp://s.example", "aciklama": "Şema."},
            {"ad": "Nokta", "url": "https://n.example", "aciklama": "Noktasız"},
            {"ad": "Kopya", "url": "http://www.a.example/", "aciklama": "Kopya."},
        ]
        veri["kategoriler"].append({"ad": "Boş", "girdiler": []})
        hatalar = dogrula(veri)
        self.assertEqual(len(hatalar), 5)
        with self.assertRaises(VeriHatasi) as baglam:
            uret(veri)
        self.assertEqual(baglam.exception.hatalar, hatalar)

    def test_zorunlu_ust_alanlar(self):
        self.assertEqual(len(dogrula({})), 3)

    def test_en_az_girdi(self):
        self.assertTrue(any("en az 3" in h for h in dogrula(kucuk_veri(), en_az_girdi=3)))


class TazelikTesti(unittest.TestCase):
    def test_guncel_dosya_fark_vermez(self):
        metin = uret(ORNEK)
        self.assertEqual(tazelik_farki(metin, metin), "")

    def test_elle_duzenleme_yakalanir(self):
        metin = uret(ORNEK)
        elle = metin.replace("Pro Git", "Pro Git (elle eklendi)")
        fark = tazelik_farki(elle, metin)
        self.assertIn("--- README.md (diskteki)", fark)
        self.assertIn("+- [Pro Git]", fark)


if __name__ == "__main__":
    unittest.main()
