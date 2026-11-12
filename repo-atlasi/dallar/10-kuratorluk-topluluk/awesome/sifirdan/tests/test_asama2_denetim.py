import unittest
from collections import Counter
from pathlib import Path

from asama2_denetim import HAZIR_AYARLAR, Ayarlar, bicimle, denetle

ORNEKLER = Path(__file__).resolve().parent.parent / "ornekler"

TEMIZ = """# Awesome Temiz [![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

> Kuralların tümüne uyan küçük bir liste.

## Contents

- [Araçlar](#araçlar)
- [Kütüphaneler](#kütüphaneler)

## Araçlar

- [Alfa](https://alfa.example) - Birinci araç.
- [Beta](https://beta.example) - İkinci araç.

## Kütüphaneler

- [Çekirdek](https://cekirdek.example) - iOS için çekirdek kütüphane.
- [Delta](https://delta.example) - Dördüncü kütüphane.

## Contributing

Katkı kuralları için [contributing.md](contributing.md).
"""


def kurallar(metin: str, **ayar) -> Counter:
    return Counter(b.kural for b in denetle(metin, **ayar))


class TemizListeTesti(unittest.TestCase):
    def test_temiz_liste_bulgu_vermez(self):
        self.assertEqual(denetle(TEMIZ, yerel="tr"), [])


class KuralTesti(unittest.TestCase):
    def test_madde_isareti_ve_ayirici(self):
        metin = "## A\n\n* [Bir](https://a.example) - Bir.\n- [İki](https://b.example) – İki.\n- [Üç](https://c.example)- Üç.\n"
        mesajlar = [b.mesaj for b in denetle(metin, alfabetik=False) if b.kural == "girdi-bicimi"]
        self.assertEqual(len(mesajlar), 3)
        self.assertTrue(any("en/em tire" in m for m in mesajlar))

    def test_bozuk_baglanti_satiri(self):
        self.assertEqual(kurallar("## A\n\n- [Ad] (https://a.example) - Açıklama.\n")["girdi-bicimi"], 1)

    def test_aciklama_kurallari(self):
        metin = "## A\n\n- [A](https://a.example) - küçük harf.\n- [B](https://b.example) - Noktasız\n- [C](https://c.example)\n"
        self.assertEqual(kurallar(metin)["aciklama"], 3)

    def test_buyuk_harf_turkce_ve_istisna(self):
        tr = "## A\n\n- [A](https://a.example) - ışık hızında.\n- [B](https://b.example) - iOS uygulaması.\n"
        bulgular = [b for b in denetle(tr, yerel="tr") if b.kural == "aciklama"]
        self.assertEqual([b.satir for b in bulgular], [3])  # 'iOS' istisna; 'ışık' hatalı

    def test_alfabetik_turkce(self):
        metin = "## A\n\n- [ırmak](https://a.example) - Bir.\n- [incir](https://b.example) - İki.\n"
        self.assertEqual(kurallar(metin, yerel="tr")["alfabetik"], 0)
        self.assertEqual(kurallar(metin, yerel="en")["alfabetik"], 1)

    def test_alfabetik_paragrafla_ayrilan_listeler_ayri(self):
        metin = "## A\n\n- [Zeta](https://z.example) - Z.\n\n_Diğer_\n\n- [Alfa](https://a.example) - A.\n"
        self.assertEqual(kurallar(metin)["alfabetik"], 0)

    def test_yinelenen_baglanti_yazim_farklari(self):
        metin = (
            "## A\n\n- [A](https://github.com/Kisi/Depo) - A.\n"
            "- [B](http://www.github.com/kisi/depo/) - B.\n- [C](https://github.com/kisi/depo#readme) - C.\n"
        )
        self.assertEqual(kurallar(metin, alfabetik=False)["yinelenen-baglanti"], 2)
        izinli = frozenset({"github.com/kisi/depo"})
        self.assertEqual(kurallar(metin, alfabetik=False, izinli_yinelenenler=izinli)["yinelenen-baglanti"], 0)

    def test_sema_kisaltici_https(self):
        metin = (
            "## A\n\n- [A](javascript:alert(1)) - A.\n- [B](https://bit.ly/x) - B.\n"
            "- [C](http://c.example) - C.\n- [D](docs/yerel.md) - Göreli bağlantı serbest.\n"
        )
        sayim = kurallar(metin)
        self.assertEqual((sayim["guvensiz-sema"], sayim["kisaltici"], sayim["https"]), (1, 1, 1))

    def test_icindekiler_turkce_ipucu_ve_eksik_baslik(self):
        metin = (
            "## Contents\n\n- [Veri Yapıları](#veri-yapilari)\n\n## Veri Yapıları\n\n"
            "- [A](https://a.example) - A.\n\n## Eksik Bölüm\n\n- [B](https://b.example) - B.\n"
        )
        bulgular = [b for b in denetle(metin) if b.kural == "icindekiler"]
        self.assertEqual(len(bulgular), 2)
        self.assertIn("veri-yapıları", bulgular[0].mesaj)
        self.assertIn("Eksik Bölüm", bulgular[1].mesaj)

    def test_icindekiler_acik_capa_kabul_edilir(self):
        metin = '## Contents\n\n- [C++](#cpp)\n\n## <a id="cpp"></a>C++\n\n- [A](https://a.example) - A.\n'
        self.assertEqual(kurallar(metin)["icindekiler"], 0)

    def test_icindekiler_kapsami_ust_duzey_bolumde_biter(self):
        # awesome-python düzeni: İçindekiler ### başlıklara gider; sonraki "## Resources" kapsam dışı.
        metin = (
            "## Categories\n\n- [Web](#web)\n\n## Projects\n\n### Web\n\n- [A](https://a.example) - A.\n\n"
            "## Resources\n\n### Podcasts\n\n- [B](https://b.example) - B.\n"
        )
        self.assertEqual(kurallar(metin)["icindekiler"], 0)

    def test_adsiz_icindekiler_algilanir(self):
        # build-your-own-x düzeni: "Contents" başlığı yok, #bağlantılı ilk liste İçindekiler sayılır.
        metin = (
            "## Build your own X\n\n* [A](#build-your-own-a)\n* [B](#build-your-own-b)\n* [C](#build-your-own-c)\n\n"
            "#### Build your own `Z`\n* [z](https://z.example)\n#### Build your own `A`\n* [a](https://a.example)\n"
            "#### Build your own `B`\n* [b](https://b.example)\n#### Build your own `C`\n* [c](https://c.example)\n"
        )
        bulgular = [b for b in denetle(metin, HAZIR_AYARLAR["pbl"], madde_isareti="*") if b.kural == "icindekiler"]
        self.assertEqual([b.mesaj for b in bulgular], ["'Build your own Z' başlığı İçindekiler'de yok"])

    def test_bos_bolum_tanitim_sondaki_bosluk(self):
        metin = (
            "## A\n\n- [A](https://a.example) - The best tool ever.  \n\n## B\n\n```\nkod  \n```\n"
            "\n## C\n\n- [C](https://c.example) - Dünyanın en iyi aracı.\n"
        )
        sayim = kurallar(metin)
        self.assertEqual((sayim["bos-bolum"], sayim["tanitim-dili"], sayim["sondaki-bosluk"]), (1, 2, 1))

    def test_ust_sinir_alt_kullanim_alanlarini_ayri_sayar(self):
        satirlar = ["## A", "", "- Birinci alan"]
        satirlar += [f"  - [a{i}](https://a.example/{i}) - A." for i in range(6)]
        satirlar += ["- İkinci alan", "  - [b](https://b.example) - B."]
        bulgular = [b for b in denetle("\n".join(satirlar), HAZIR_AYARLAR["python"]) if b.kural == "bolum-ust-siniri"]
        self.assertEqual(len(bulgular), 1)
        self.assertIn("6 girdi", bulgular[0].mesaj)


class HazirAyarTesti(unittest.TestCase):
    def test_fpb_bicimi(self):
        metin = "### Go\n\n* [Go El Kitabı](https://a.example) - Karl Seguin (PDF)\n* [Türkçe Go](https://b.example)\n"
        self.assertEqual(denetle(metin, HAZIR_AYARLAR["fpb"], yerel="tr"), [])

    def test_awesome_ana_listesi_alfabetik_degil(self):
        metin = "## A\n\n- [Zeta](https://z.example) - Z.\n- [Alfa](https://a.example) - A.\n"
        self.assertEqual(denetle(metin, HAZIR_AYARLAR["awesome"]), [])
        self.assertEqual(kurallar(metin)["alfabetik"], 1)

    def test_ayarlar_degismez(self):
        ayar = Ayarlar()
        denetle(TEMIZ, ayar, yerel="tr")
        self.assertEqual(ayar.yerel, "en")


class OrnekDosyaTesti(unittest.TestCase):
    def test_bozuk_liste_beklenen_kurallari_tetikler(self):
        bulgular = denetle((ORNEKLER / "bozuk-liste.txt").read_text(encoding="utf-8"), yerel="tr")
        beklenen = {
            "icindekiler",
            "aciklama",
            "alfabetik",
            "sondaki-bosluk",
            "https",
            "girdi-bicimi",
            "kisaltici",
            "guvensiz-sema",
            "yinelenen-baglanti",
            "tanitim-dili",
            "bos-bolum",
        }
        self.assertEqual({b.kural for b in bulgular}, beklenen)
        # Türkçe sırada 'ırmak' 'incir'den önce gelir: o bölümde sıra hatası yok.
        self.assertFalse([b for b in bulgular if b.kural == "alfabetik" and "ırmak" in b.mesaj])

    def test_bicimle(self):
        cikti = bicimle(denetle("## A\n\n- [A](https://a.example) - a\n"), "x.md")
        self.assertTrue(cikti.startswith("x.md:3: [hata] aciklama:"))


if __name__ == "__main__":
    unittest.main()
