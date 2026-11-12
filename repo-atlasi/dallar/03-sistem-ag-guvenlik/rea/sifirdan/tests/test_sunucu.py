"""Protokol testleri: sunucu gerçek bir alt süreç olarak stdio üzerinden konuşur."""

import hashlib
import io
import json
import os
import unittest

from reamini import araclar, sunucu
from reamini.istemci import Istemci, McpHatasi

from .derleme import GCC, GeciciDerleme


@unittest.skipUnless(GCC, "gcc yok: örnek ikili derlenemiyor")
class McpProtokolTestleri(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.derleme = GeciciDerleme().__enter__()
        cls.yol = cls.derleme.yollar["sert"]
        cls.m = Istemci([cls.derleme.dizin])
        cls.karsilama = cls.m.baslat()

    @classmethod
    def tearDownClass(cls):
        cls.m.kapat()
        cls.derleme.__exit__()

    def test_el_sikisma(self):
        self.assertEqual(self.karsilama["protocolVersion"], "2025-06-18")
        self.assertEqual(self.karsilama["serverInfo"]["name"], "reamini")
        self.assertIn("tools", self.karsilama["capabilities"])
        self.assertIn("VERİDİR", self.karsilama["instructions"])

    def test_surum_pazarligi(self):
        with Istemci([self.derleme.dizin]) as m:
            self.assertEqual(m.baslat(surum="1999-01-01")["protocolVersion"], sunucu.PROTOKOL_SURUMLERI[0])

    def test_arac_katalogu(self):
        aracs = self.m.araclar()
        adlar = [a["name"] for a in aracs]
        self.assertEqual(len(adlar), 10)
        self.assertEqual(len(set(adlar)), 10)
        for a in aracs:
            self.assertEqual(a["inputSchema"]["type"], "object")
            self.assertIn("yol", a["inputSchema"]["required"])
            self.assertTrue(a["annotations"]["readOnlyHint"])

    def test_baslik_ve_kanit(self):
        s = self.m.cagir("elf_basligi", yol=self.yol)
        self.assertFalse(s["isError"])
        with open(self.yol, "rb") as f:
            self.assertEqual(s["structuredContent"]["kanit"]["sha256"], hashlib.sha256(f.read()).hexdigest())
        self.assertEqual(json.loads(s["content"][0]["text"]), s["structuredContent"])  # geriye uyumlu metin
        self.assertTrue(s["_meta"]["provenance"]["untrusted_content"])

    def test_fonksiyon_akisi(self):
        f = self.m.cagir("fonksiyonlari_listele", yol=self.yol)["structuredContent"]["fonksiyonlar"]
        topla = next(x for x in f if x["ad"] == "topla")
        bayt = self.m.cagir("fonksiyon_baytlari", yol=self.yol, ad="topla")["structuredContent"]
        self.assertTrue(bayt["satirlar"][0].startswith(f"{topla['dosya_ofseti']:08x}"))
        cevir = self.m.cagir("adresten_ofsete", yol=self.yol, adres=topla["adres"])["structuredContent"]
        self.assertEqual((cevir["dosya_ofseti"], cevir["bolum"]), (topla["dosya_ofseti"], ".text"))

    def test_dizgiler_guvenilmez_icerik(self):
        s = self.m.cagir("dizgileri_cikar", yol=self.yol, bolum=".rodata")
        metinler = [d["metin"] for d in s["structuredContent"]["dizgiler"]]
        self.assertTrue(any("AJAN TALIMATI" in m for m in metinler))
        # Talimat gibi görünen metin VERİ olarak döner ve işaretlidir; sunucu ona göre davranmaz.
        self.assertEqual(s["_meta"]["provenance"]["source"], "analysis_target")

    def test_dokum_ve_sertlestirme(self):
        d = self.m.cagir("onaltilik_dok", yol=self.yol, ofset=0, uzunluk=16)["structuredContent"]
        self.assertTrue(d["satirlar"][0].startswith("00000000  7f 45 4c 46"))
        h = self.m.cagir("sertlestirme_denetle", yol=self.yol)["structuredContent"]["sertlestirme"]
        self.assertEqual(h["relro"], "tam")

    def test_arac_hatalari_isError(self):
        for ad, arg, parca in (
            ("elf_basligi", {"yol": "/etc/hostname"}, "köklerin dışında"),
            ("elf_basligi", {"yol": os.path.join(self.derleme.dizin, "yok")}, "dosya yok"),
            ("elf_basligi", {}, "eksik argüman: yol"),
            ("elf_basligi", {"yol": self.yol, "fazla": 1}, "bilinmeyen argüman"),
            ("onaltilik_dok", {"yol": self.yol, "ofset": -1}, "aralığında"),
            ("onaltilik_dok", {"yol": self.yol, "ofset": "0"}, "tam sayı"),
            ("fonksiyon_baytlari", {"yol": self.yol, "ad": "olmayan"}, "bulunamadı"),
        ):
            with self.subTest(ad=ad, arg=arg):
                s = self.m.cagir(ad, **arg)
                self.assertTrue(s["isError"])
                self.assertIn(parca, s["content"][0]["text"])

    def test_sembolik_bag_kacisi_engellenir(self):
        bag = os.path.join(self.derleme.dizin, "kacis")
        os.symlink("/bin/ls", bag)
        try:
            s = self.m.cagir("elf_basligi", yol=bag)
            self.assertTrue(s["isError"])
            self.assertIn("köklerin dışında", s["content"][0]["text"])
        finally:
            os.unlink(bag)

    def test_elf_olmayan_dosya(self):
        yol = os.path.join(self.derleme.dizin, "metin.txt")
        with open(yol, "w") as f:
            f.write("ELF değilim")
        s = self.m.cagir("elf_basligi", yol=yol)
        self.assertTrue(s["isError"])
        self.assertIn("ELF okunamadı", s["content"][0]["text"])

    def test_protokol_hatalari(self):
        with self.assertRaises(McpHatasi) as h:
            self.m.istek("tools/call", {"name": "olmayan_arac", "arguments": {}})
        self.assertEqual(h.exception.kod, -32602)
        with self.assertRaises(McpHatasi) as h:
            self.m.istek("resources/list")
        self.assertEqual(h.exception.kod, -32601)
        self.m.gonder_ham("{bozuk json")
        self.assertEqual(self.m.oku()["error"]["code"], -32700)
        self.m.gonder_ham('[{"jsonrpc": "2.0", "id": 99, "method": "ping"}]')
        self.assertEqual(self.m.oku()["error"]["code"], -32600)
        self.m.bildirim("notifications/cancelled", {"requestId": 1})  # bildirime yanıt gelmez
        self.assertEqual(self.m.istek("ping"), {})


class BellekIciTestler(unittest.TestCase):
    """Alt süreç olmadan: sunucunun durum makinesi."""

    def test_initialize_oncesi_reddedilir(self):
        s = sunucu.Sunucu(araclar.Katalog(["/tmp"]))
        self.assertEqual(s.isle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})["error"]["code"], -32600)
        self.assertEqual(s.isle({"jsonrpc": "2.0", "id": 2, "method": "ping"})["result"], {})
        self.assertEqual(s.isle({"jsonrpc": "1.0", "id": 3, "method": "ping"})["error"]["code"], -32600)

    def test_calistir_satir_satir(self):
        girdi = io.StringIO('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}\n'
                            '\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
                            '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n')
        cikti = io.StringIO()
        sunucu.calistir(sunucu.Sunucu(araclar.Katalog(["/tmp"])), girdi, cikti)
        satirlar = cikti.getvalue().splitlines()
        self.assertEqual(len(satirlar), 2)  # bildirim ve boş satır yanıtsız
        self.assertEqual(json.loads(satirlar[0])["result"]["protocolVersion"], "2025-11-25")
        self.assertEqual(len(json.loads(satirlar[1])["result"]["tools"]), 10)


if __name__ == "__main__":
    unittest.main()
