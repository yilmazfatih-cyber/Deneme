import unittest

from asama1_ayristirici import (
    KimlikUretici,
    ascii_katla,
    ayristir,
    buyut,
    duz_metin,
    github_kimligi,
    kucult,
    siralama_anahtari,
)


class GithubKimligiTesti(unittest.TestCase):
    def test_turkce_harfler_korunur(self):
        self.assertEqual(github_kimligi("Algoritma ve Veri Yapıları"), "algoritma-ve-veri-yapıları")
        self.assertEqual(github_kimligi("Güvenlik ve Gizlilik"), "güvenlik-ve-gizlilik")

    def test_buyuk_i_birlesen_nokta_uretir(self):
        # GitHub (ve onu taklit eden github-slugger) 'İ' harfini 'i' + U+0307 yapar; görünmez ama bağlantıyı bozar.
        kimlik = github_kimligi("İçindekiler")
        self.assertEqual(kimlik, "i\u0307çindekiler")
        self.assertNotEqual(kimlik, "içindekiler")

    def test_noktalama_atilir_bosluk_tire_olur(self):
        self.assertEqual(github_kimligi("C++"), "c")
        self.assertEqual(github_kimligi("Data Ingestion / ETL"), "data-ingestion--etl")
        self.assertEqual(github_kimligi("Calendar & Contacts"), "calendar--contacts")
        self.assertEqual(github_kimligi(".NET Framework"), "net-framework")

    def test_satir_ici_isaretler_ayiklanir(self):
        self.assertEqual(github_kimligi(duz_metin("Build your own `Git`")), "build-your-own-git")
        self.assertEqual(duz_metin("[Awesome Python](https://awesome-python.com/)"), "Awesome Python")
        self.assertEqual(duz_metin('<a id="cpp"></a>C++'), "C++")

    def test_ayni_baslik_ikinci_kez_sonek_alir(self):
        u = KimlikUretici()
        self.assertEqual([u.uret("Araçlar"), u.uret("Araçlar"), u.uret("Araçlar")], ["araçlar", "araçlar-1", "araçlar-2"])

    def test_ascii_katla(self):
        self.assertEqual(ascii_katla("yapıları güvenlik ÇĞİÖŞÜ"), "yapilari guvenlik CGIOSU")


class SiralamaTesti(unittest.TestCase):
    def test_turkce_alfabe(self):
        kelimeler = ["incir", "ırmak", "çay", "ceviz", "ödev", "otel", "şeker", "su", "üzüm", "uçak"]
        beklenen = ["ceviz", "çay", "ırmak", "incir", "otel", "ödev", "su", "şeker", "uçak", "üzüm"]
        self.assertEqual(sorted(kelimeler, key=lambda k: siralama_anahtari(k, "tr")), beklenen)

    def test_turkce_buyuk_kucuk_harf(self):
        self.assertEqual(kucult("ISPARTA İZMİR", "tr"), "ısparta izmir")
        self.assertEqual(buyut("istanbul ılgaz", "tr"), "İSTANBUL ILGAZ")
        self.assertEqual(kucult("ISPARTA", "en"), "isparta")

    def test_bosluk_birlesik_yazimdan_once(self):
        self.assertLess(siralama_anahtari("one two"), siralama_anahtari("onetwo"))

    def test_bayt_sirasi_ile_dil_sirasi_farki(self):
        adlar = ["Brisbane", "Bärner"]
        self.assertEqual(sorted(adlar, key=lambda a: siralama_anahtari(a, "en")), ["Bärner", "Brisbane"])
        self.assertEqual(sorted(adlar, key=lambda a: siralama_anahtari(a, "bayt")), ["Brisbane", "Bärner"])

    def test_noktalama_yok_sayma(self):
        a, b = "Git, GitHub ve GitLab", "Git İleri Eğitim"
        self.assertLess(siralama_anahtari(b, "tr"), siralama_anahtari(a, "tr"))
        self.assertLess(siralama_anahtari(a, "tr", True), siralama_anahtari(b, "tr", True))


class AyristirmaTesti(unittest.TestCase):
    METIN = "\n".join(
        [
            "# Liste",
            "",
            "## Araçlar",
            "",
            "- [Bir](https://a.example/1) - Birinci.",
            "  - [Alt](https://a.example/alt) - Alt girdi.",
            "- Ara başlık",
            "  - [İki](https://a.example/2) - İkinci.",
            "",
            "_Diğerleri_",
            "",
            "- [Üç](https://a.example/(parantez)) - Parantezli adres.",
            "",
            "```md",
            "- [Kod](https://kod.example) - Kod bloğunda, sayılmaz.",
            "```",
            "<!--",
            "- [Yorum](https://yorum.example) - Yorumda, sayılmaz.",
            "-->",
            '### <a id="ozel"></a>Özel Çapa',
        ]
    )

    def test_basliklar_ve_kimlikler(self):
        belge = ayristir(self.METIN)
        self.assertEqual([(b.duzey, b.metin) for b in belge.basliklar], [(1, "Liste"), (2, "Araçlar"), (3, "Özel Çapa")])
        self.assertEqual(belge.basliklar[2].acik_kimlik, "ozel")
        self.assertIn("ozel", belge.kimlikler())
        self.assertIn("araçlar", belge.kimlikler())

    def test_girdiler_ic_ice_ve_bloklar(self):
        belge = ayristir(self.METIN)
        adlar = [g.ad for g in belge.girdiler]
        self.assertEqual(adlar, ["Bir", "Alt", "İki", "Üç"])
        bir, alt, iki, uc = belge.girdiler
        self.assertIsNone(bir.ust_satir)
        self.assertEqual(alt.ust_satir, bir.satir)
        self.assertEqual(iki.ust_satir, 7)  # "- Ara başlık" maddesi
        self.assertEqual(uc.url, "https://a.example/(parantez)")
        self.assertGreater(uc.blok, bir.blok)  # araya paragraf girdi: ayrı liste
        self.assertEqual([m.metin for m in belge.maddeler], ["Ara başlık"])

    def test_setext_basliklar(self):
        # 996.ICU README'si başlıkları alt çizgiyle yazar: "Başlık" + "===" ya da "---".
        belge = ayristir("996.ICU\n===\n\nNedir?\n---\n\n- [A](https://a.example) - A.\n\nparagraf\n\n---\n")
        self.assertEqual([(b.duzey, b.metin) for b in belge.basliklar], [(1, "996.ICU"), (2, "Nedir?")])
        self.assertEqual(belge.girdiler[0].bolum, 1)  # girdi "Nedir?" bölümünde
        # boş satırdan sonra gelen "---" yatay çizgidir, başlık değil

    def test_kod_ve_yorum_atlanir(self):
        belge = ayristir(self.METIN)
        self.assertNotIn("Kod", [g.ad for g in belge.girdiler])
        self.assertNotIn("Yorum", [g.ad for g in belge.girdiler])
        self.assertIn(15, belge.atlanan_satirlar)


if __name__ == "__main__":
    unittest.main()
