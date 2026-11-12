import json
import os
import subprocess
import sys
import unittest

from .yardimci import KOK


def cli(*argumanlar):
    return subprocess.run([sys.executable, "-B", "-m", "denetim", *argumanlar], capture_output=True, text=True,
                          cwd=KOK, timeout=30)


class CliTestleri(unittest.TestCase):
    def test_sshd_cikis_kodu(self):
        zayif = cli("sshd", os.path.join("ornekler", "sshd_config_zayif"))
        self.assertEqual(zayif.returncode, 1)
        self.assertIn("[KRİTİK] SSH-003", zayif.stdout)
        self.assertIn("Özet:", zayif.stdout)
        saglam = cli("sshd", os.path.join("ornekler", "sshd_config_saglam"))
        self.assertEqual((saglam.returncode, saglam.stdout.strip()), (0, "Bulgu yok."))

    def test_json_ve_esik(self):
        s = cli("--json", "--esik", "kritik", "soket", "ornekler/proc_net_tcp", "ornekler/proc_net_tcp6")
        self.assertEqual(s.returncode, 0)  # en yüksek bulgu 'yuksek' < 'kritik'
        veri = json.loads(s.stdout)
        self.assertEqual(veri[0]["onem"], "yuksek")  # önem sırasına göre dizili
        self.assertEqual({b["kural"] for b in veri}, {"NET-000", "NET-001", "NET-002"})

    def test_log_ve_tls(self):
        log = cli("log", "ornekler/auth_log.txt", "--yil", "2026")
        self.assertEqual(log.returncode, 1)
        self.assertIn("LOG-003", log.stdout)
        tls = cli("tls", "--pem", "ornekler/sertifika.pem")
        self.assertIn("TLS-004", tls.stdout)


if __name__ == "__main__":
    unittest.main()
