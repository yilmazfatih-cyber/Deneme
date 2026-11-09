"""Kamu verisi (ADR-010) testleri: python3 -I -m unittest discover persona-katmani/sosyal/kamu/tests"""
import json
import os
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

PK = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PK))
sys.path.insert(0, str(PK / "db"))

import pk_db  # noqa: E402
from sosyal.kamu import meta_adlib, ogren_kamu  # noqa: E402
from sosyal.kamu.x_kamu import Butce, ButceAsildi, XKamu, ozetle  # noqa: E402
from sosyal.kamu import kamu_cli  # noqa: E402
from sosyal.ortak import baglan  # noqa: E402


class GeciciDB(unittest.TestCase):
    def setUp(self):
        self.dizin = tempfile.TemporaryDirectory()
        self.db = Path(self.dizin.name) / "t.sqlite"
        os.environ["PK_DB"] = str(self.db)
        pk_db.DB_YOLU = self.db
        pk_db.kur()
        pk_db.yukle_temel()
        self.c = baglan()
        self.c.execute("INSERT OR IGNORE INTO kiraci(id, ad) VALUES ('t','t')")
        self.c.commit()

    def tearDown(self):
        self.c.close()
        self.dizin.cleanup()


class SafIslevler(unittest.TestCase):
    def test_wilson(self):
        a, u = ogren_kamu.wilson(20, 100)
        self.assertLess(a, 0.2)
        self.assertGreater(u, 0.2)
        self.assertEqual(ogren_kamu.wilson(0, 0), (0.0, 1.0))

    def test_aktif_gun(self):
        self.assertEqual(meta_adlib.aktif_gun("2026-10-01", "2026-10-10"), 10)
        self.assertEqual(meta_adlib.aktif_gun("2026-11-01", None, date(2026, 11, 9)), 9)
        self.assertIsNone(meta_adlib.aktif_gun(None, None))

    def test_normalize_ve_yas_erisim(self):
        ham = {"id": "123", "page_id": "9", "page_name": "Örnek A", "ad_delivery_start_time": "2026-09-01T00:00:00+0000",
               "ad_delivery_stop_time": "2026-09-30T00:00:00+0000", "ad_creative_bodies": ["Tüm ürünlerde %30 indirim"],
               "publisher_platforms": ["FACEBOOK", "INSTAGRAM"], "eu_total_reach": 12000,
               "age_country_gender_reach_breakdown": [{"country": "DE", "age_gender_breakdowns": [
                   {"age_range": "18-24", "male": 100, "female": 100}, {"age_range": "65+", "male": 50, "female": 150}, {"age_range": "13-17", "male": 5}]}]}
        r = meta_adlib.normalize(ham, "rakip", ["DE"])
        self.assertEqual(r.id, "meta_adlib:123")
        self.assertEqual(r.yaratici_turu, "indirim")
        self.assertEqual(r.aktif_gun, 30)
        self.assertEqual(r.platformlar, ["facebook", "instagram"])
        self.assertEqual(r.yas_erisim, {"18-24": 0.5, "55+": 0.5})  # 13-17 atlanır

    def test_turkiye_uyarisi(self):
        _, uyari = meta_adlib.ReklamKutuphanesi(kuru=True).ara(rol="rakip", arama="x", ulkeler=("TR", "DE"))
        self.assertTrue(any("TR" in u for u in uyari))

    def test_elle_ice(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write("reklamveren,rol,baslangic,bitis,metin,platformlar,ulke,bicim\n")
            f.write("A,rakip,2026-09-01,2026-10-10,Son 2 gün indirim,instagram;facebook,TR,video\n")
            f.write(",rakip,2026-09-01,,eksik reklamveren,,TR,\n")
            f.write("B,yanlis_rol,2026-09-01,,x,,TR,\n")
        kayit, hata = meta_adlib.elle_ice(f.name)
        os.unlink(f.name)
        self.assertEqual(len(kayit), 1)
        self.assertEqual(hata, 2)
        self.assertEqual(kayit[0].platformlar, ["instagram", "facebook"])

    def test_butce(self):
        b = Butce(0.01)
        b.harca("sayim")
        with self.assertRaises(ButceAsildi):
            b.harca("okuma", 10)

    def test_ozetle_metin_dondurmez(self):
        d = ozetle([{"text": "kargo geç geldi rezalet", "public_metrics": {"like_count": 4}},
                    {"text": "harika ürün teşekkürler", "public_metrics": {"like_count": 2}}], "2026-11-09")
        self.assertEqual(d.n, 2)
        self.assertAlmostEqual(d.olumlu + d.notr + d.olumsuz, 1.0)
        self.assertNotIn("rezalet", json.dumps(d.__dict__, ensure_ascii=False))
        self.assertIn("kargo", d.konular)

    def test_x_kuru_butceyi_harcamaz(self):
        b = Butce(0.0)
        x = XKamu(b, kuru=True, bugun=date(2026, 11, 9))
        self.assertEqual(len(x.sayim("kahve", 30)), 30)
        self.assertIsNotNone(x.orneklem("kahve", 50))
        self.assertEqual(b.harcanan_usd, 0.0)


class Ogrenme(GeciciDB):
    def test_yaratici_sansur_ve_kirpma(self):
        bugun = date(2026, 11, 9)
        reklamlar = []
        for i in range(30):  # sosyal kanıt uzun yaşıyor
            reklamlar.append(meta_adlib.RakipReklam(id=f"s{i}", kaynak="elle", reklamveren="A", rol="rakip", baslangic="2026-06-01",
                                                    bitis="2026-08-01", aktif_gun=62, yaratici_turu="sosyal_kanit"))
            reklamlar.append(meta_adlib.RakipReklam(id=f"k{i}", kaynak="elle", reklamveren="A", rol="rakip", baslangic="2026-06-01",
                                                    bitis="2026-06-05", aktif_gun=5, yaratici_turu="kitlik"))
        # sansürlü: yayında ve 10 günlük → hesaba girmez
        reklamlar.append(meta_adlib.RakipReklam(id="genc", kaynak="elle", reklamveren="A", rol="rakip",
                                                baslangic=(bugun - timedelta(days=10)).isoformat(), aktif_gun=10, yaratici_turu="kitlik"))
        meta_adlib.kaydet(self.c, "t", reklamlar)
        r = ogren_kamu.rakip_yaratici(self.c, "t", bugun)
        self.assertEqual(r["sonucuBilinen"], 60)
        self.assertGreater(r["turler"]["sosyal_kanit"]["piyasaCarpani"], 1.0)
        self.assertEqual(r["turler"]["kitlik"]["piyasaCarpani"], 0.7)
        for t in r["turler"].values():
            self.assertTrue(0.7 <= t["piyasaCarpani"] <= 1.4)

    def test_ilgi_ve_ses_payi(self):
        self.c.execute("INSERT INTO kamu_sorgu(id,kiraci_id,etiket,tur,sorgu) VALUES ('t:kategori:kahve','t','kategori:kahve','kategori','kahve')")
        self.c.execute("INSERT INTO kamu_sorgu(id,kiraci_id,etiket,tur,sorgu) VALUES ('t:marka','t','marka','marka','m')")
        self.c.execute("INSERT INTO kamu_sorgu(id,kiraci_id,etiket,tur,sorgu) VALUES ('t:rakip:A','t','rakip:A','rakip','a')")
        for i in range(28):
            g = (date(2026, 10, 1) + timedelta(days=i)).isoformat()
            self.c.execute("INSERT INTO sosyal_konu_hacmi VALUES ('x','t:kategori:kahve',?,?, 'api')", (g, 100 if i < 21 else 200))
            self.c.execute("INSERT INTO sosyal_konu_hacmi VALUES ('x','t:marka',?,30,'api')", (g,))
            self.c.execute("INSERT INTO sosyal_konu_hacmi VALUES ('x','t:rakip:A',?,10,'api')", (g,))
        r = ogren_kamu.ilgi_endeksi(self.c, "t")
        self.assertAlmostEqual(r["kategoriler"]["kahve"]["endeks"], 2.0, places=3)
        self.assertAlmostEqual(r["sesPayi"]["marka"], 0.75, places=3)

    def test_hepsi_kuru_zinciri(self):
        hedef = Path(self.dizin.name) / "kamu.json"
        self.assertEqual(kamu_cli.main(["hepsi", "t", "--kuru"]), 0)
        self.assertEqual(kamu_cli.main(["disa-aktar-sim", "t", "--hedef", str(hedef)]), 0)
        v = json.loads(hedef.read_text(encoding="utf-8"))
        self.assertTrue(v["kuruVeri"])
        for k in ("ilgi", "duygu", "yaratici", "rakipYasErisim", "guven"):
            self.assertIn(k, v)
        self.assertTrue(any(d["tur"] == "marka" for d in v["duygu"]))
        # kişi verisi yok: kamu_duygu ve rakip_reklam'da yazar/kullanıcı alanı bulunmaz
        sutunlar = {r[1] for r in self.c.execute("PRAGMA table_info(kamu_duygu)")} | {r[1] for r in self.c.execute("PRAGMA table_info(rakip_reklam)")}
        self.assertFalse(sutunlar & {"yazar", "kullanici", "author_id", "username"})


if __name__ == "__main__":
    unittest.main()
