import re
import struct
import subprocess
import unittest

from reamini import elf

from .derleme import GCC, READELF, GeciciDerleme


@unittest.skipUnless(GCC, "gcc yok: örnek ikili derlenemiyor")
class ElfTestleri(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.derleme = GeciciDerleme().__enter__()
        cls.y = cls.derleme.yollar

    @classmethod
    def tearDownClass(cls):
        cls.derleme.__exit__()

    def ac(self, ad):
        with open(self.y[ad], "rb") as f:
            veri = f.read()
        return veri, elf.Elf(veri)

    def test_baslik(self):
        _, e = self.ac("sert")
        o = e.ozet()
        self.assertEqual((o["sinif"], o["bayt_sirasi"], o["tur"]), ("ELF64", "little", "ET_DYN"))
        self.assertIn(o["makine"], ("x86-64", "AArch64"))
        self.assertGreater(o["giris_noktasi"], 0)

    def test_fonksiyonlar_ve_ofsetler(self):
        veri, e = self.ac("sert")
        f = {x["ad"]: x for x in e.fonksiyonlar()}
        for ad in ("main", "topla", "gizli_hesap"):
            self.assertIn(ad, f)
            self.assertEqual(f[ad]["bolum"], ".text")
        self.assertEqual(f["gizli_hesap"]["bag"], "LOCAL")  # static fonksiyon
        self.assertEqual(f["topla"]["bag"], "GLOBAL")
        adresler = [x["adres"] for x in e.fonksiyonlar()]
        self.assertEqual(adresler, sorted(adresler))
        ofset, bolum = e.adres_ofset(f["main"]["adres"])
        self.assertEqual((ofset, bolum), (f["main"]["dosya_ofseti"], ".text"))
        self.assertGreater(len(veri[ofset : ofset + f["main"]["boyut"]]), 0)

    def test_dizgiler(self):
        _, e = self.ac("sert")
        rodata = [d["metin"] for d in e.dizgiler(bolum=".rodata")]
        self.assertTrue(any("REA-mini merhaba" in m for m in rodata))
        self.assertTrue(any("AJAN TALIMATI" in m for m in rodata))
        with self.assertRaises(elf.ElfHatasi):
            e.dizgiler(bolum=".bss")  # NOBITS: dosyada baytı yok

    def test_sertlestirme(self):
        _, sert = self.ac("sert")
        s = sert.sertlestirme()
        self.assertEqual((s["pie"], s["nx"], s["relro"], s["yigin_kanaryasi"], s["soyulmus"]),
                         ("evet", "evet", "tam", "evet", False))
        self.assertTrue(any(a.endswith("_chk") for a in s["fortify"]))
        self.assertIn("libc.so.6", s["gereken_kitapliklar"])
        z = self.ac("zayif")[1].sertlestirme()
        self.assertEqual((z["pie"], z["nx"], z["relro"], z["yigin_kanaryasi"]),
                         ("hayır (ET_EXEC: sabit adres)", "hayır (yığın çalıştırılabilir)", "yok", "hayır"))

    def test_soyulmus(self):
        _, e = self.ac("soyulmus")
        self.assertIsNone(e.bolum(".symtab"))
        self.assertTrue(e.sertlestirme()["soyulmus"])
        self.assertEqual(e.fonksiyonlar(), [])  # dynsym'de yalnız içe aktarılanlar (UNDEF) var
        self.assertTrue(any(s["ad"] == "printf" or s["ad"].startswith("__printf") for s in e.semboller()))

    def test_elf32_nesne(self):
        if "nesne32" not in self.y:
            self.skipTest("gcc -m32 -c kullanılamıyor")
        _, e = self.ac("nesne32")
        self.assertEqual((e.ozet()["sinif"], e.ozet()["tur"], e.ozet()["makine"]), ("ELF32", "ET_REL", "x86"))
        self.assertIn("topla", {s["ad"] for s in e.semboller() if s["tur"] == "FUNC"})

    @unittest.skipUnless(READELF, "readelf yok")
    def test_readelf_ile_capraz_denetim(self):
        _, e = self.ac("sert")
        cikti = subprocess.run([READELF, "-SW", self.y["sert"]], capture_output=True, text=True).stdout
        readelf_bolumler = re.findall(r"\]\s+(\.\S+)", cikti)
        self.assertEqual([b["ad"] for b in e.bolumler if b["ad"]], readelf_bolumler)
        semboller = subprocess.run([READELF, "-sW", self.y["sert"]], capture_output=True, text=True).stdout
        readelf_fonk = {s.split("@")[0] for s in re.findall(r"FUNC\s+\S+\s+\S+\s+\d+\s+(\S+)", semboller)}
        self.assertLessEqual({f["ad"] for f in e.fonksiyonlar()}, readelf_fonk)


class ElfElYapimiTestleri(unittest.TestCase):
    def test_big_endian_baslik(self):
        # Elle kurulmuş, bölümsüz ELF64 big-endian başlığı (ör. eski PowerPC64).
        baslik = b"\x7fELF" + bytes([2, 2, 1, 0]) + b"\0" * 8
        baslik += struct.pack(">HHIQQQIHHHHHH", 2, 21, 1, 0x10000000, 0, 0, 0, 64, 0, 0, 0, 0, 0)
        o = elf.Elf(baslik).ozet()
        self.assertEqual((o["sinif"], o["bayt_sirasi"], o["makine"], o["giris_noktasi"]),
                         ("ELF64", "big", "PowerPC64", 0x10000000))

    def test_bozuk_dosyalar(self):
        for veri in (b"", b"MZ\x90\x00" + b"\0" * 60, b"\x7fELF" + bytes([3, 1]) + b"\0" * 58,
                     b"\x7fELF" + bytes([2, 1]) + b"\0" * 10):
            with self.subTest(veri=veri[:6]), self.assertRaises(elf.ElfHatasi):
                elf.Elf(veri)

    def test_onaltilik(self):
        self.assertEqual(elf.onaltilik(b"\x7fELF\x02", 0x1000),
                         ["00001000  7f 45 4c 46 02" + " " * 33 + "  |.ELF.|"])


if __name__ == "__main__":
    unittest.main()
