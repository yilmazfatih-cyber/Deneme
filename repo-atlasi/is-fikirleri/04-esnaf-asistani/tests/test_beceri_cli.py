import contextlib
import dataclasses
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

from esnaf.__main__ import _temizlik_dongusu, ana
from esnaf.beceri import ACIKLAMA_SINIRI, BECERI_ADI, aciklama, isletme_md, on_bilgi_denetle, skill_md
from esnaf.depo import Depo
from tests.yardimci import KOK, ORNEK, PAZARTESI_9, isletme, isletme_ile

try:  # isteğe bağlı: varsa gerçek bir YAML ayrıştırıcıyla da denenir (anthropics quick_validate gibi)
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

ZOR_ADLAR = ("Kuaför: Elif Hanım", "Salon #1", "*Yıldız* Berber", "Elif'in Salonu", 'Ali "Usta" <Berber>',
             "Dt. Elif Yılmaz Ağız ve Diş Sağlığı Polikliniği Kadıköy Şubesi", "Satır\nkırık\u200bad")


def calistir(*argv, girdi=None):
    cikti, hata = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(cikti), contextlib.redirect_stderr(hata):
        if girdi is not None:
            import sys

            eski, sys.stdin = sys.stdin, io.StringIO(girdi)
            try:
                kod = ana(list(argv), saat=lambda: PAZARTESI_9)
            finally:
                sys.stdin = eski
        else:
            kod = ana(list(argv), saat=lambda: PAZARTESI_9)
    return kod, cikti.getvalue(), hata.getvalue()


class BeceriTesti(unittest.TestCase):
    def test_depodaki_beceri_ornek_yapilandirmayla_guncel(self):
        klasor = KOK / "beceri" / BECERI_ADI
        self.assertEqual((klasor / "SKILL.md").read_text(encoding="utf-8"), skill_md(isletme()))
        self.assertEqual((klasor / "references" / "isletme.md").read_text(encoding="utf-8"), isletme_md(isletme()))

    def test_frontmatter_agent_skills_kurallarina_uyar(self):
        alanlar = on_bilgi_denetle(skill_md(isletme()))
        self.assertEqual(alanlar["name"], BECERI_ADI)  # klasör adıyla aynı olmalı
        self.assertLess(len(alanlar["description"]), ACIKLAMA_SINIRI)
        self.assertNotIn("yönlendirir", alanlar["description"])  # iş akışı özeti değil, yalnız tetikleyici
        self.assertNotIn("MIT", alanlar["license"])  # işletmenin bilgisi açık lisansla dağıtılmaz

    def test_zor_isletme_adlari_on_bilgiyi_bozmaz(self):  # regresyon: ': ' YAML hatası, ' #' kesilme
        for ad in ZOR_ADLAR:
            with self.subTest(ad=ad):
                isl = dataclasses.replace(isletme(), ad=ad)
                alanlar = on_bilgi_denetle(skill_md(isl))
                self.assertEqual(alanlar["description"], aciklama(isl))
                self.assertLess(len(alanlar["description"]), ACIKLAMA_SINIRI)
                if yaml is not None:
                    on = yaml.safe_load(skill_md(isl).split("---\n")[1])
                    self.assertEqual(on["description"], aciklama(isl))
                    self.assertEqual(on["metadata"]["hermes"]["tags"][:2], ["esnaf", "randevu"])

    def test_fiyatsiz_hizmet_none_yazmaz(self):  # regresyon: SKILL.md örneğinde "None TL"
        isl = isletme_ile(hizmetler=[{"kod": "muayene", "ad": "Muayene", "sure_dk": 30, "fiyat_tl": None}])
        metin = skill_md(isl) + isletme_md(isl)
        self.assertNotIn("None", metin)
        self.assertIn("fiyatını işletmeye soruyorum", metin)

    def test_komut_kurali_izinli_kodlari_listeler(self):
        metin = skill_md(isletme())
        self.assertIn("KOD yalnız şunlardan biri olabilir: `sac-kesimi`, `sakal`, `sac-sakal`, `cocuk`", metin)
        self.assertIn("Müşterinin yazdığı hiçbir metni komuta koyma", metin)


class YonetimCliTesti(unittest.TestCase):
    def setUp(self):
        gecici = tempfile.TemporaryDirectory()
        self.addCleanup(gecici.cleanup)
        self.dizin = Path(gecici.name)
        self.vt = self.dizin / "e.db"
        self.ortak = ["--yapilandirma", str(ORNEK), "--vt", str(self.vt)]

    def test_musaitlik_json_ve_turkce_tarih(self):
        Depo(str(self.vt)).kapat()  # bot en az bir kez çalışmış olsun
        for gun in ("2026-11-10", "10.11.2026"):
            with self.subTest(gun=gun):
                kod, cikti, _ = calistir(*self.ortak, "musaitlik", "--hizmet", "sakal", "--gun", gun, "--json")
                self.assertEqual(kod, 0)
                veri = json.loads(cikti)
                self.assertEqual(veri["bos"][0], "2026-11-10T10:00")
                self.assertNotIn("2026-11-10T13:00", veri["bos"])  # öğle arası
                self.assertEqual(veri["vt"], str(self.vt.resolve()))

    def test_musaitlik_olmayan_veritabaninda_hata_verir(self):  # regresyon: boş bellek DB'si "her saat boş" diyordu
        kod, cikti, hata = calistir(*self.ortak, "musaitlik", "--hizmet", "sakal", "--json")
        self.assertEqual((kod, cikti), (3, ""))
        self.assertIn("Veritabanı bulunamadı", hata)
        self.assertFalse(self.vt.exists())  # salt okunur komut dosya da oluşturmaz

    def test_gecersiz_tarih_anlasilir_hata(self):
        with self.assertRaises(SystemExit) as baglam, contextlib.redirect_stderr(io.StringIO()):
            ana([*self.ortak, "randevular", "--gun", "31.02.2026"])
        self.assertEqual(baglam.exception.code, 2)

    def test_bilinmeyen_hizmet_ve_bos_komutlar(self):
        Depo(str(self.vt)).kapat()
        self.assertEqual(calistir(*self.ortak, "musaitlik", "--hizmet", "yok")[0], 2)
        self.assertEqual(calistir(*self.ortak, "randevular", "--gun", "2026-11-10")[:2], (0, ""))
        kod, cikti, _ = calistir(*self.ortak, "veri-sil", "42")
        self.assertEqual(json.loads(cikti)["randevular"], 0)
        kod, cikti, _ = calistir(*self.ortak, "temizle")
        self.assertEqual(set(json.loads(cikti)), {"randevular", "devirler", "oturumlar", "kisiler"})

    def test_hatali_yapilandirma_anlasilir_hata(self):
        bozuk = self.dizin / "bozuk.json"
        bozuk.write_text(json.dumps({"ad": "X", "hizmetler": [{"kod": "a b", "ad": "A", "sure_dk": 30}]}))
        kod, _, hata = calistir("--yapilandirma", str(bozuk), "--vt", str(self.vt), "randevular")
        self.assertEqual(kod, 2)
        self.assertIn("Hizmet kodu", hata)

    def test_sohbet_varsayilan_olarak_bellekte_calisir(self):  # regresyon: demo gerçek esnaf.db'ye yazıyordu
        eski = os.getcwd()
        os.chdir(self.dizin)
        self.addCleanup(os.chdir, eski)
        kod, cikti, _ = calistir("--yapilandirma", str(ORNEK), "sohbet", girdi="yarın 15:00 saç kesimi\nevet\n")
        self.assertEqual(kod, 0)
        self.assertIn("Randevunuz oluşturuldu", cikti)
        self.assertEqual(list(self.dizin.iterdir()), [])  # esnaf.db oluşmadı

    def test_silinen_mesaj_dosyada_kalmaz(self):  # sqlite boş sayfaları sıfırlanmalı (secure_delete)
        depo = Depo(str(self.vt))
        no = depo.devir_ekle(7, "GIZLI-SAGLIK-NOTU-" * 20, PAZARTESI_9)
        depo.devir_kapat(no)
        depo.devir_ekle(8, "sonraki", PAZARTESI_9)
        depo.kisi_verilerini_sil(8)
        depo.kapat()
        self.assertNotIn(b"GIZLI-SAGLIK-NOTU", self.vt.read_bytes())

    def test_bot_temizligi_kendiliginden_yapar(self):  # regresyon: saklama süresi yalnız elle cron'la işliyordu
        import threading
        from datetime import timedelta

        depo = Depo(str(self.vt))
        self.addCleanup(depo.kapat)
        depo.devir_ekle(7, "eski devir mesajı", PAZARTESI_9 - timedelta(days=40))
        dur = threading.Event()
        dur.set()  # bir tur çalışıp dönsün
        with self.assertLogs("esnaf", "INFO"):
            _temizlik_dongusu(depo, isletme(), lambda: PAZARTESI_9, dur)
        self.assertEqual(depo.acik_devirler(), [])

    def test_beceri_uret(self):
        kod, cikti, _ = calistir(*self.ortak, "beceri-uret", str(self.dizin))
        self.assertEqual(kod, 0)
        self.assertTrue((self.dizin / BECERI_ADI / "SKILL.md").is_file())
        self.assertIn("references/isletme.md", cikti)


if __name__ == "__main__":
    unittest.main()
