"""Kaynak C testleri: python3 -I -m unittest discover persona-katmani/sosyal/tests (geçici DB, PK_DB)."""
from __future__ import annotations

import contextlib
import io
import json
import math
import os
import sys
import tempfile
import unittest
from pathlib import Path

PK = Path(__file__).resolve().parents[2]
_GECICI = tempfile.TemporaryDirectory()
os.environ["PK_DB"] = str(Path(_GECICI.name) / "test.sqlite")
sys.path.insert(0, str(PK))

from sosyal import csv_ice, ogren  # noqa: E402
from sosyal.ortak import (IcerikKaydi, MetrikKaydi, baglan, cinsiyet, kaydet_icerik, kaydet_metrikler, pk_db, yaratici_turu,  # noqa: E402
                          yas_bandi)
from sosyal.sosyal_cli import cek  # noqa: E402

_BAGLANTILAR = []


def vt():
    """Test bağlantısı; modül sonunda kapatılır."""
    c = baglan()
    _BAGLANTILAR.append(c)
    return c


def setUpModule():
    pk_db.DB_YOLU = Path(os.environ["PK_DB"])
    with contextlib.redirect_stdout(io.StringIO()):
        pk_db.kur()
        pk_db.yukle_temel()


def tearDownModule():
    for c in _BAGLANTILAR:
        c.close()
    _GECICI.cleanup()


class SozlukTesti(unittest.TestCase):
    def test_yas_bandi(self):
        beklenen = {"18-24": "18-24", "55-64": "55+", "65+": "55+", "AGE_55_100": "55+", "AGE_18_24": "18-24", "AGE_25_TO_34": "25-34",
                    "Age 35 to 49": "35-44", "45-54": "45-54", "13-17": None, "AGE_13_17": None, "Unknown": None, "Bilinmiyor": None}
        for ham, bant in beklenen.items():
            self.assertEqual(yas_bandi(ham), bant, ham)

    def test_cinsiyet(self):
        self.assertEqual([cinsiyet(x) for x in ("female", "Kadın", "MALE", "erkek", "unknown", "NONE")], ["K", "K", "E", "E", "bilinmiyor", "bilinmiyor"])

    def test_yaratici_turu(self):
        ornek = {"Kış koleksiyonunda %30 indirim": "indirim", "Büyük kampanya başladı": "indirim", "Son 3 gün! Stoklar tükeniyor": "kitlik",
                 "Sınırlı sayıda üretildi": "kitlik", "Binlerce kişi bu montu seçti": "sosyal_kanit", "En çok satan kahve makinesi": "sosyal_kanit",
                 "Mont seçerken nelere dikkat etmeli?": "bilgi", "Yeni kulaklığın özellikleri": "bilgi", "Evde sıcak bir akşam": "duygusal",
                 "Sonbahar renkleri": "duygusal"}
        for metin, tur in ornek.items():
            self.assertEqual(yaratici_turu(metin), tur, metin)


META_EN = """Ad name,Age,Gender,Day,Impressions,Reach,Link clicks,Amount spent (TRY),3-second video plays,Video plays at 100%,Results,Frequency
Kış indirimi %30,18-24,female,2026-10-01,12000,9000,150,540.50,3000,600,4,1.3
Kış indirimi %30,65+,male,2026-10-01,800,700,6,40.00,120,40,0,1.1
Kış indirimi %30,13-17,female,2026-10-01,300,250,3,10.00,50,10,0,1.0
"""
META_TR = """Reklam adı;Yaş;Cinsiyet;Gün;Gösterimler;Bağlantı tıklamaları;Harcanan tutar (TRY);Sonuçlar;Bilinmeyen sütun
Son 3 gün stoklar tükeniyor;25-34;Kadın;01.10.2026;1.250;31;1.234,56;2;x
Son 3 gün stoklar tükeniyor;55-64;Erkek;01.10.2026;900;12;88,10;0;y
"""
TIKTOK = """Ad name,Age,Gender,Date,Impressions,Clicks,Cost,2-second video views,Video views at 100%,Conversions
Binlerce kişi bunu seçti,AGE_18_24,FEMALE,2026-10-02,5000,60,120.5,2200,400,3
Binlerce kişi bunu seçti,AGE_13_17,MALE,2026-10-02,500,9,10,200,30,0
Binlerce kişi bunu seçti,AGE_55_100,MALE,2026-10-02,700,5,15,210,60,0
"""
X_CSV = """Tweet text,Age,Date,Impressions,URL clicks,Engagements,Spend
Nasıl seçilir? Rehber,25-34,2026-10-03,4000,28,90,75.0
Nasıl seçilir? Rehber,50+,2026-10-03,1500,9,20,30.0
"""


class CsvTesti(unittest.TestCase):
    def test_meta_ingilizce(self):
        ic, m, r = csv_ice.oku("meta", META_EN, "meta.csv")
        self.assertEqual(len(ic), 1)
        self.assertEqual(ic[0].yaratici_turu, "indirim")
        self.assertEqual(ic[0].bicim, "video")
        self.assertEqual({x.yas_bandi for x in m}, {"18-24", "55+"})  # 13-17 atlandı
        a = next(x for x in m if x.yas_bandi == "18-24")
        self.assertEqual((a.gosterim, a.tiklama, a.video_3sn, a.video_tam, a.donusum, a.harcama_tl, a.cinsiyet), (12000, 150, 3000, 600, 4, 540.5, "K"))
        self.assertEqual(r["atlanan"], 1)
        self.assertIn("Frequency", r["yok_sayilan"])

    def test_meta_turkce(self):
        ic, m, r = csv_ice.oku("facebook", META_TR, "meta_tr.csv")
        self.assertEqual(ic[0].yaratici_turu, "kitlik")
        a = next(x for x in m if x.yas_bandi == "25-34")
        self.assertEqual((a.gosterim, a.tiklama, a.harcama_tl, a.tarih, a.cinsiyet), (1250, 31, 1234.56, "2026-10-01", "K"))
        self.assertEqual(next(x for x in m if x.cinsiyet == "E").yas_bandi, "55+")
        self.assertIn("Bilinmeyen sütun", r["yok_sayilan"])

    def test_tiktok(self):
        ic, m, _ = csv_ice.oku("tiktok", TIKTOK, "tt.csv")
        self.assertEqual(ic[0].platform, "tiktok")
        self.assertEqual(ic[0].yaratici_turu, "sosyal_kanit")
        self.assertEqual(sorted(x.yas_bandi for x in m), ["18-24", "55+"])
        self.assertEqual(next(x for x in m if x.yas_bandi == "18-24").video_3sn, 2200)

    def test_x(self):
        ic, m, _ = csv_ice.oku("x", X_CSV, "x.csv")
        self.assertEqual(ic[0].yaratici_turu, "bilgi")
        self.assertEqual({x.yas_bandi: x.cinsiyet for x in m}, {"25-34": "hepsi", "55+": "hepsi"})
        self.assertEqual(next(x for x in m if x.yas_bandi == "25-34").tiklama, 28)

    def test_taninmayan_dosya(self):
        with self.assertRaises(ValueError):
            csv_ice.oku("meta", "a,b,c\n1,2,3\n", "bos.csv")


class KuruCekimTesti(unittest.TestCase):
    def test_yazma_ve_tekrar(self):
        with contextlib.redirect_stdout(io.StringIO()):
            s1 = cek("meta", "kuru_test", "2026-09-01", "2026-10-30", kuru=True)
        c = vt()
        n = c.execute("SELECT count(*) FROM sosyal_metrik m JOIN sosyal_icerik i ON i.id=m.icerik_id JOIN sosyal_hesap h ON h.id=i.hesap_id WHERE h.kiraci_id='kuru_test'").fetchone()[0]
        self.assertEqual(n, s1["metrik"])
        self.assertGreater(n, 500)
        self.assertTrue(c.execute("SELECT 1 FROM kiraci WHERE id='kuru_test'").fetchone())
        satir = c.execute("SELECT id, gosterim FROM sosyal_metrik WHERE icerik_id LIKE '%kuru-kuru_test-%' ORDER BY id LIMIT 1").fetchone()
        c.execute("UPDATE sosyal_metrik SET gosterim=-1 WHERE id=?", (satir["id"],))
        c.commit()
        with contextlib.redirect_stdout(io.StringIO()):
            cek("meta", "kuru_test", "2026-09-01", "2026-10-30", kuru=True)
        c = vt()
        n2 = c.execute("SELECT count(*) FROM sosyal_metrik m JOIN sosyal_icerik i ON i.id=m.icerik_id JOIN sosyal_hesap h ON h.id=i.hesap_id WHERE h.kiraci_id='kuru_test'").fetchone()[0]
        self.assertEqual(n2, n)  # UNIQUE: yeni satır yok
        self.assertEqual(c.execute("SELECT gosterim FROM sosyal_metrik WHERE id=?", (satir["id"],)).fetchone()[0], satir["gosterim"])  # güncellendi
        self.assertTrue(c.execute("SELECT count(*) FROM denetim_kaydi WHERE nesne='sosyal:meta:kuru_test'").fetchone()[0] >= 2)


class C1Testi(unittest.TestCase):
    def test_carpan_sinirlari(self):
        self.assertAlmostEqual(ogren.carpan(math.log(10), 1e9)[0], 2.0, places=6)
        self.assertAlmostEqual(ogren.carpan(math.log(0.01), 1e9)[0], 0.5, places=6)
        self.assertTrue(ogren.carpan(math.log(10), 1e9)[1])  # aykırı
        self.assertAlmostEqual(ogren.carpan(math.log(10), 1000)[0], math.exp(1000 / 21000 * math.log(10)), places=6)

    def test_kuru_veride_aralik(self):
        with contextlib.redirect_stdout(io.StringIO()):
            for p in ("meta", "tiktok", "x"):
                cek(p, "c1_test", "2026-09-01", "2026-10-30", kuru=True)
            s = ogren.reklam_oncul(vt(), "c1_test", "t1", sessiz=True)
        c = vt()
        for (crp,) in c.execute("SELECT carpan FROM sosyal_ogrenim WHERE kiraci_id='c1_test' AND surum='t1'"):
            self.assertTrue(0.5 <= crp <= 2.0)
        self.assertEqual(set(s["yasBandi"]), {"18-24", "25-34", "35-44", "45-54", "55+"})
        o = c.execute("SELECT count(*), min(etiket), max(kaynaklar) FROM oncul WHERE surum='t1' AND kapsam_id='TR' AND seviye='S1'").fetchone()
        self.assertEqual(o[0], 14)  # 7 segment × 2 parametre
        self.assertEqual(o[1], "kismen_yerel")
        self.assertIn("sosyal:tiktok", o[2])
        with contextlib.redirect_stdout(io.StringIO()):
            ogren.reklam_oncul(vt(), "c1_test", "t1", sessiz=True)  # aynı sürüm → değiştirir
        self.assertEqual(vt().execute("SELECT count(*) FROM oncul WHERE surum='t1' AND kapsam_id='TR'").fetchone()[0], 14)

    def test_dusuk_gosterimde_bire_yakin(self):
        c = vt()
        c.execute("INSERT OR IGNORE INTO kiraci(id, ad) VALUES ('az','az')")
        for i, (bant, tik) in enumerate((("18-24", 40), ("55+", 2))):  # CTR %8 vs %0.4: ham oran ~20 kat
            ic = IcerikKaydi(f"facebook:az-{i}", "facebook", "az", "reklam", "gorsel", None, None, None, "Yeni sezon")
            kaydet_icerik(c, "az", ic)
            kaydet_metrikler(c, [MetrikKaydi(ic.id, "2026-10-01", bant, "K", "hepsi", 500, None, tik)])
        c.commit()
        s = ogren.reklam_oncul(c, "az", "t2", sessiz=True)
        for b in ("18-24", "55+"):
            self.assertLess(abs(s["yasBandi"][b]["dikkat_esigi"] - 1), 0.08, b)
            self.assertEqual(s["yasBandi"][b]["guven"], "dusuk")

    def test_wilson(self):
        lo, hi = ogren.wilson(10, 1000)
        self.assertAlmostEqual(lo, 0.00544, places=4)
        self.assertAlmostEqual(hi, 0.01828, places=4)


class C2Testi(unittest.TestCase):
    def test_brier(self):
        self.assertAlmostEqual(ogren.brier(0.7, 1), 0.09)
        self.assertAlmostEqual(ogren.brier(0.7, 0), 0.49)
        c = vt()
        c.execute("INSERT OR IGNORE INTO kiraci(id, ad) VALUES ('k2','k2')")
        c.execute("INSERT INTO kampanya(id, kiraci_id, ad, gercek_mi) VALUES ('k2-kamp','k2','test',1)")
        ic = IcerikKaydi("tiktok:k2-1", "tiktok", "k2", "reklam", "video", None, None, None, "x", kampanya_id="k2-kamp")
        kaydet_icerik(c, "k2", ic)
        # iki yaş bandı: toplam 10.000 gösterim, 150 tıklama (CTR %1.5), 20 dönüşüm (%0.2); 'hepsi' satırı yok → çift sayım yok
        kaydet_metrikler(c, [MetrikKaydi(ic.id, "2026-10-01", "18-24", "K", "hepsi", 6000, None, 100, donusum=15),
                             MetrikKaydi(ic.id, "2026-10-01", "25-34", "E", "hepsi", 4000, None, 50, donusum=5),
                             MetrikKaydi(ic.id, "2026-10-01", "hepsi", "K", "hepsi", 99999, None, 9999)])  # yalnız cinsiyet kırılımı: sayılmaz
        c.commit()
        with contextlib.redirect_stdout(io.StringIO()):
            ogren.kor_tahmin_ekle(c, "k2-kosu", "k2-kamp", json.dumps({"olasilik": 0.7, "kazanan": "A", "metrik": "ctr", "esik": 0.01}))
            ogren.kor_tahmin_ekle(c, "k2-kosu", "k2-kamp", json.dumps({"olasilik": 0.3, "kazanan": "A", "metrik": "ctr", "esik": 0.02}))
            ogren.kor_tahmin_ekle(c, "k2-kosu", "k2-kamp", json.dumps({"olasilik": 0.8, "kazanan": "A", "metrik": "donusum_orani", "esik": 0.005}))
            oz = ogren.kalibrasyon(c, "k2")
        # elle: CTR .015 ≥ .01 → 1, (0.7−1)²=0.09 · CTR .015 < .02 → 0, (0.3−0)²=0.09 · dönüşüm .002 < .005 → 0, (0.8−0)²=0.64
        self.assertEqual(oz["n"], 3)
        self.assertAlmostEqual(oz["ortalama_brier"], round((0.09 + 0.09 + 0.64) / 3, 4))
        self.assertAlmostEqual(oz["isabet"], round(2 / 3, 4))
        hashler = [r[0] for r in c.execute("SELECT muhur_hash FROM kor_tahmin")]
        self.assertTrue(all(len(h) == 64 for h in hashler))
        g = json.loads(c.execute("SELECT gercek_sonuc FROM kor_tahmin ORDER BY id LIMIT 1").fetchone()[0])
        self.assertEqual((g["gosterim"], g["tiklama"]), (10000, 150))


class DisaAktarimTesti(unittest.TestCase):
    def test_sema(self):
        with contextlib.redirect_stdout(io.StringIO()):
            for p in ("meta", "tiktok", "x"):
                cek(p, "sim_test", "2026-09-01", "2026-10-30", kuru=True)
            ogren.reklam_oncul(vt(), "sim_test", "t3", sessiz=True)
            hedef = Path(_GECICI.name) / "ogrenilen" / "reklam.json"
            ogren.disa_aktar_sim(vt(), "sim_test", hedef, sessiz=True)
        d = json.loads(hedef.read_text(encoding="utf-8"))
        self.assertEqual(d["surum"], "t3")
        self.assertEqual(d["kaynak"], "sosyal")
        self.assertIn(d["guven"], ("dusuk", "orta", "yuksek"))
        self.assertTrue(set(d["yasBandi"]) <= {"18-24", "25-34", "35-44", "45-54", "55+"} and d["yasBandi"])
        for v in d["yasBandi"].values():
            self.assertEqual(set(v), {"dikkat_esigi", "tau_reklam_tolerans"})
            self.assertTrue(all(0.5 <= x <= 2 for x in v.values()))
        self.assertTrue(set(d["yaratici"]) <= {"indirim", "duygusal", "bilgi", "sosyal_kanit", "kitlik"} and d["yaratici"])
        for v in d["yaratici"].values():
            self.assertEqual(set(v), {"tiklamaCarpani"})
            self.assertTrue(0.5 <= v["tiklamaCarpani"] <= 2)
        self.assertTrue(d["kuruVeri"])

    def test_sosyal_sinyal(self):
        with contextlib.redirect_stdout(io.StringIO()):
            for p in ("meta", "x"):
                cek(p, "c3_test", "2026-09-01", "2026-10-30", kuru=True)
            s = ogren.sosyal_sinyal(vt(), "c3_test", "t4", sessiz=True)
        self.assertTrue(all(0.7 <= v["w_sosyal_kanit"] <= 1.3 for v in s["platformlar"].values()))
        self.assertGreater(s["platformlar"]["hepsi"]["w_sosyal_kanit"], 1.0)  # kuru veride denge pozitif
        self.assertGreater(s["konular"]["kış modası"]["ilgi_endeksi"], 100)  # yükselen konu
        self.assertEqual(s["guven"], "dusuk")


if __name__ == "__main__":
    unittest.main()
