import copy
import datetime as dt
import io
import json
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import uretici
from uretici import dogrula, kebab, kimlik, ozgur_mu, readme, satir, yukle

VERI = Path(__file__).resolve().parent.parent / "veri"
BUGUN = dt.date(2026, 11, 9)


class YardimciTesti(unittest.TestCase):
    def test_kebab(self):
        self.assertEqual(kebab("Eski Oynatıcı"), "eski-oynatici")
        self.assertEqual(kebab("Şifrelik"), "sifrelik")
        self.assertEqual(kebab("Kasa Pro"), "kasa-pro")

    def test_kimlik(self):
        self.assertEqual(kimlik("Anti-özellikler"), "anti-özellikler")
        self.assertEqual(kimlik("Awesome Kendi Sunucum - Özgür Olmayan"), "awesome-kendi-sunucum---özgür-olmayan")


class DogrulamaTesti(unittest.TestCase):
    def setUp(self):
        self.veri = yukle(VERI)

    def test_ornek_veri_normal_kipte_temiz(self):
        rapor = dogrula(self.veri, BUGUN)
        self.assertEqual(rapor.hatalar, [])
        self.assertTrue(any("eski-oynatici.json: 526 gündür" in u for u in rapor.uyarilar))
        self.assertTrue(any("yarim-not.json: 222 gündür" in u for u in rapor.uyarilar))

    def test_kati_kip_bayat_projeyi_hata_yapar(self):
        rapor = dogrula(self.veri, BUGUN, kati=True)
        self.assertEqual(rapor.hatalar, ["eski-oynatici.json: 526 gündür güncellenmemiş (sınır 365)"])

    def test_atlama_listesi(self):
        atla = {"https://git.example/eski-oynatici/eski-oynatici"}
        self.assertEqual(dogrula(self.veri, BUGUN, kati=True, atla=atla).hatalar, [])

    def test_hatali_kayitlar(self):
        y = copy.deepcopy(self.veri.yazilimlar[0])
        y.update(
            _dosya="yanlis-ad.json",
            licenses=["WTF-1.0"],
            platforms=["Cobol"],
            tags=["Yok Böyle Etiket"],
            description="x" * 251,
            archived=True,
        )
        self.veri.yazilimlar.append(y)
        hatalar = dogrula(self.veri, BUGUN).hatalar
        for parca in ("kebab-case", "bilinmeyen lisans", "bilinmeyen platform", "bilinmeyen etiket", "251 karakter", "nokta", "arşivlenmiş"):
            self.assertTrue(any(parca in h for h in hatalar), parca)

    def test_ozgur_yazilimda_kaynak_zorunlu(self):
        del self.veri.yazilimlar[0]["source_code_url"]
        self.assertTrue(any("source_code_url" in h for h in dogrula(self.veri, BUGUN).hatalar))

    def test_etiket_en_az_uc_yazilim(self):
        self.veri.yazilimlar = [y for y in self.veri.yazilimlar if y["name"] != "Klasörüm"]
        hatalar = dogrula(self.veri, BUGUN).hatalar
        self.assertIn("etiket 'Dosya Eşitleme': 2 yazılım kullanıyor, en az 3 olmalı", hatalar)


class UretimTesti(unittest.TestCase):
    def setUp(self):
        self.veri = yukle(VERI)

    def test_ozgur_ve_ozgur_olmayan_ayrilir(self):
        ozgur, degil = readme(self.veri, True), readme(self.veri, False)
        self.assertNotIn("Kasa Pro", ozgur)
        self.assertIn("Kasa Pro", degil)
        self.assertNotIn("### Dosya Eşitleme", degil)  # boş kategori non-free sayfasında yok
        self.assertFalse(ozgur_mu(next(y for y in self.veri.yazilimlar if y["name"] == "Kasa Pro"), self.veri))

    def test_yazilim_yalnizca_ilk_etiketinde(self):
        metin = readme(self.veri)
        self.assertEqual(metin.count("- [Bulutkasa]"), 1)
        self.assertLess(metin.index("- [Bulutkasa]"), metin.index("### Medya Akışı"))

    def test_satir_bicimi(self):
        sesli = next(y for y in self.veri.yazilimlar if y["name"] == "Sesli")
        self.assertEqual(
            satir(sesli),
            "- [Sesli](https://sesli.example) `⚠` - Müzik akışı sunucusu; şarkı sözlerini harici bir hizmetten çeker. "
            "([Kaynak Kod](https://git.example/sesli/sesli)) `MIT` `Go/Docker`",
        )
        esitle = next(y for y in self.veri.yazilimlar if y["name"] == "Esitle")
        self.assertNotIn("Kaynak Kod", satir(esitle))  # web sitesi zaten kaynak deposu

    def test_turkce_siralama(self):
        metin = readme(self.veri)
        sira = [metin.index(f"- [{ad}]") for ad in ("Anahtarlık", "Parolam", "Şifrelik")]
        self.assertEqual(sira, sorted(sira))  # Ş, P'den sonra gelir

    def test_icindekiler_baglantilari_basliklara_gider(self):
        metin = readme(self.veri)
        kimlikler = {kimlik(s.lstrip("# ").strip()) for s in metin.splitlines() if s.startswith("#")}
        baglantilar = [s.split("](#")[1].rstrip(")") for s in metin.splitlines() if s.strip().startswith("- [") and "](#" in s]
        self.assertTrue(baglantilar)
        self.assertEqual([b for b in baglantilar if b not in kimlikler], [])

    def test_belirlenimci(self):
        self.assertEqual(readme(self.veri), readme(yukle(VERI)))


class CliTesti(unittest.TestCase):
    def test_uret_ve_kati_kip(self):
        with tempfile.TemporaryDirectory() as gecici:
            hedef = Path(gecici) / "veri"
            shutil.copytree(VERI, hedef)
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(uretici.main([str(hedef), "--cikti", f"{gecici}/cikti", "--bugun", "2026-11-09"]), 0)
                self.assertEqual(uretici.main([str(hedef), "--cikti", f"{gecici}/c2", "--bugun", "2026-11-09", "--kati"]), 1)
            self.assertTrue((Path(gecici) / "cikti" / "non-free.md").exists())
            self.assertFalse((Path(gecici) / "c2").exists())  # hata varken çıktı yazılmaz
            kayit = json.loads((hedef / "software" / "esitle.json").read_text("utf-8"))
            kayit["licenses"] = ["Bilinmez"]
            (hedef / "software" / "esitle.json").write_text(json.dumps(kayit), "utf-8")
            hata = io.StringIO()
            with redirect_stdout(io.StringIO()), redirect_stderr(hata):
                self.assertEqual(uretici.main([str(hedef), "--cikti", f"{gecici}/c3", "--bugun", "2026-11-09"]), 1)
            self.assertIn("bilinmeyen lisans 'Bilinmez'", hata.getvalue())


if __name__ == "__main__":
    unittest.main()
