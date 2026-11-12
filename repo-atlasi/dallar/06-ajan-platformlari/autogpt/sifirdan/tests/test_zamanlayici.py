"""Aşama 5 testleri: cron ayrıştırma, sonraki çalışma zamanı, tick ile en fazla bir kez çalıştırma, kalıcılık."""

import sqlite3
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from asama3_yurutucu import ExecutionStatus, Executor
from asama5_zamanlayici import CronExpression, Scheduler
from tests.yardimci import ornek_graf


class CronTest(unittest.TestCase):
    def test_her_on_bes_dakika(self):
        c = CronExpression("*/15 * * * *")
        self.assertEqual(c.next_after(datetime(2026, 11, 9, 10, 7)), datetime(2026, 11, 9, 10, 15))
        self.assertEqual(c.next_after(datetime(2026, 11, 9, 10, 45)), datetime(2026, 11, 9, 11, 0))

    def test_hafta_ici_sabah_dokuz(self):
        c = CronExpression("0 9 * * 1-5")
        # 14 Kasım 2026 Cumartesi → bir sonraki çalışma Pazartesi 16 Kasım 09:00
        self.assertEqual(c.next_after(datetime(2026, 11, 13, 9, 0)), datetime(2026, 11, 16, 9, 0))

    def test_liste_ve_aralik_adimi(self):
        c = CronExpression("0,30 8-18/5 * * *")
        self.assertEqual(sorted(c.saat), [8, 13, 18])
        self.assertEqual(sorted(c.dakika), [0, 30])

    def test_gun_ve_hafta_gunu_veya_kurali(self):
        c = CronExpression("0 0 1 * 0")  # ayın 1'i VEYA Pazar
        self.assertTrue(c.matches(datetime(2026, 11, 1, 0, 0)))  # Pazar ve ayın 1'i
        self.assertTrue(c.matches(datetime(2026, 11, 8, 0, 0)))  # Pazar
        self.assertFalse(c.matches(datetime(2026, 11, 9, 0, 0)))  # Pazartesi, ayın 9'u

    def test_hafta_gunu_yedi_de_pazardir(self):
        self.assertTrue(CronExpression("0 0 * * 7").matches(datetime(2026, 11, 8, 0, 0)))  # Pazar
        self.assertEqual(CronExpression("0 0 * * 5-7").hgun, {5, 6, 0})  # Cuma, Cumartesi, Pazar

    def test_gecersiz_ifadeler(self):
        for ifade in ["* * * *", "60 * * * *", "*/0 * * * *", "a * * * *", "5-1 * * * *", "0 0 * * 8"]:
            with self.subTest(ifade=ifade), self.assertRaises(ValueError):
                CronExpression(ifade)


class SchedulerTest(unittest.TestCase):
    def kur(self, db=None):
        graflar = {"siparis-siniflandir": ornek_graf()}
        return Scheduler(Executor(), graflar.__getitem__, db)

    def test_zamani_gelen_is_bir_kez_calisir(self):
        z = self.kur()
        z.add_schedule("siparis-siniflandir", "0 * * * *", {"tutarlar": [150]}, "ayse", datetime(2026, 11, 9, 10, 5))
        self.assertEqual(z.tick(datetime(2026, 11, 9, 10, 59)), [])  # henüz değil
        sonuclar = z.tick(datetime(2026, 11, 9, 11, 0))
        self.assertEqual(len(sonuclar), 1)
        self.assertEqual(sonuclar[0].status, ExecutionStatus.COMPLETED)
        self.assertEqual(sonuclar[0].outputs["buyukler"], ["Büyük sipariş: 150 TL"])
        self.assertEqual(z.tick(datetime(2026, 11, 9, 11, 0)), [])  # aynı dilim ikinci kez koşmaz
        self.assertEqual(z.list_schedules()[0]["next_run_at"], "2026-11-09T12:00:00")

    def test_zamanlama_kalici_ve_silinebilir(self):
        with tempfile.TemporaryDirectory() as klasor:
            yol = str(Path(klasor) / "zamanlama.sqlite3")
            sid = self.kur(sqlite3.connect(yol)).add_schedule(
                "siparis-siniflandir", "30 8 * * *", {"tutarlar": [1]}, "ayse", datetime(2026, 11, 9, 9, 0)
            )
            yeniden = self.kur(sqlite3.connect(yol))  # süreç yeniden başladı
            self.assertEqual(yeniden.list_schedules()[0]["next_run_at"], "2026-11-10T08:30:00")
            self.assertTrue(yeniden.delete_schedule(sid))
            self.assertEqual(yeniden.list_schedules(), [])

    def test_gecersiz_cron_kaydedilmez(self):
        z = self.kur()
        with self.assertRaises(ValueError):
            z.add_schedule("siparis-siniflandir", "her gün", {}, "ayse", datetime(2026, 11, 9))
        self.assertEqual(z.list_schedules(), [])


if __name__ == "__main__":
    unittest.main()
