import unittest

from denetim import sshd

from .yardimci import kurallar, ornek


class SshdTestleri(unittest.TestCase):
    def test_zayif_yapilandirma(self):
        b = sshd.denetle(ornek("sshd_config_zayif"), "zayif")
        bulunan = {(x.kural, x.onem) for x in b}
        for beklenen in [("SSH-001", "yuksek"), ("SSH-002", "orta"), ("SSH-005", "yuksek"), ("SSH-006", "yuksek"),
                         ("SSH-007", "yuksek"), ("SSH-008", "dusuk"), ("SSH-009", "dusuk"), ("SSH-010", "bilgi"),
                         ("SSH-011", "bilgi"), ("SSH-003", "kritik")]:
            self.assertIn(beklenen, bulunan)

    def test_ilk_deger_kazanir(self):
        root = [x for x in sshd.denetle(ornek("sshd_config_zayif"), "zayif") if x.kural == "SSH-001"]
        self.assertEqual(len(root), 1)
        self.assertEqual(root[0].konum, "zayif:4")  # 13. satırdaki 'no' etkisiz kaldı

    def test_match_blogu_ayri_raporlanir(self):
        bos = [x for x in sshd.denetle(ornek("sshd_config_zayif"), "zayif") if x.kural == "SSH-003"]
        self.assertEqual(len(bos), 1)
        self.assertIn("[Match User yedek]", bos[0].baslik)
        self.assertEqual(bos[0].konum, "zayif:18")

    def test_zayif_algoritmalar_listelenir(self):
        sifre = next(x for x in sshd.denetle(ornek("sshd_config_zayif")) if x.kural == "SSH-005")
        self.assertIn("3des-cbc", sifre.ayrinti)
        self.assertIn("aes128-cbc", sifre.ayrinti)
        self.assertNotIn("aes256-ctr", sifre.ayrinti)

    def test_saglam_yapilandirma_temiz(self):
        self.assertEqual(sshd.denetle(ornek("sshd_config_saglam")), [])

    def test_varsayilanlar(self):
        b = sshd.denetle("Port 2222\n", "bos")
        self.assertEqual(kurallar(b), ["SSH-002", "SSH-008", "SSH-011"])  # parola + 6 deneme varsayılan
        self.assertEqual(next(x for x in b if x.kural == "SSH-002").konum, "bos (varsayılan)")

    def test_esittir_ve_buyuk_harf(self):
        b = sshd.denetle("PERMITROOTLOGIN=yes\npasswordauthentication = no\nAllowUsers ali\n")
        self.assertEqual(kurallar(b), ["SSH-001", "SSH-008"])

    def test_arti_eksi_on_ekleri(self):
        self.assertEqual(sshd._liste("+3des-cbc,aes128-cbc"), ["3des-cbc", "aes128-cbc"])
        self.assertEqual(sshd._liste("-3des-cbc"), [])  # çıkarma güvenlidir


if __name__ == "__main__":
    unittest.main()
