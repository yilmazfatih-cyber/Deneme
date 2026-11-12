"""Aşama 1: tohum metinden varlık, tutum, ilişki ve ontoloji."""

import unittest

import minifish as mf
from minifish.seed import split_sentences
from tests.yardimci import ILISKILER, TOHUM, VARLIKLAR


class Cikarim(unittest.TestCase):
    def test_varlik_tipleri(self):
        beklenen = {
            "Yalıkent Belediyesi": "GovernmentAgency",
            "Yalıkent Esnaf Derneği": "NGO",
            "Kıyı Postası": "MediaOutlet",
            "Yalıkent Üniversitesi": "University",
            "Murat Demir": "Person",
            "Selin Yurt": "Person",
        }
        for ad, tip in beklenen.items():
            self.assertEqual(VARLIKLAR[ad].type, tip, ad)
        self.assertEqual(VARLIKLAR["Murat Demir"].role, "kafe sahibi")

    def test_tutumlar(self):
        self.assertEqual(VARLIKLAR["Yalıkent Belediyesi"].stance, 1.0)  # planı açıklayan
        self.assertEqual(VARLIKLAR["Yalıkent Esnaf Derneği"].stance, -1.0)
        self.assertEqual(VARLIKLAR["Hasan Çelik"].stance, -1.0)
        self.assertEqual(VARLIKLAR["Kıyı Postası"].stance, 0.0)  # haberleştirdi: tarafsız
        self.assertEqual(VARLIKLAR["Ayşe Tan"].stance, 1.0)  # "<kurum> öğretim üyesi <kişi>" kalıbı

    def test_iliskiler_ve_ontoloji(self):
        turler = {(r.source, r.type, r.target) for r in ILISKILER}
        self.assertIn(("Yalıkent Belediyesi", "PROPOSES", "PLAN"), turler)
        self.assertIn(("Kıyı Postası", "REPORTS_ON", "PLAN"), turler)
        self.assertIn(("Ayşe Tan", "AFFILIATED_WITH", "Yalıkent Üniversitesi"), turler)
        ont = mf.build_ontology(VARLIKLAR, ILISKILER)
        self.assertEqual(ont["entity_types"][-2:], ["Person", "Organization"])  # MiroFish'teki yedek tipler

    def test_cumle_bolme_ve_bos_metin(self):
        self.assertEqual(len(split_sentences(TOHUM)), 10)
        self.assertEqual(mf.extract("hiçbir varlık yok burada."), ({}, []))


if __name__ == "__main__":
    unittest.main()
