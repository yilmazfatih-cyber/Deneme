import os
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone

from denetim import sertifika

from .yardimci import ornek

UTC = timezone.utc


class DerTestleri(unittest.TestCase):
    def test_ornek_sertifika(self):
        der = sertifika.pem_oku(ornek("sertifika.pem"))
        self.assertEqual(len(der), 1)
        s = sertifika.coz(der[0])
        # Beklenen değerler: openssl x509 -in sertifika.pem -noout -serial -dates -subject
        self.assertEqual(s["seri"], 0x611BD54B7E3C2C9E85283289DC582F35E471D812)
        self.assertEqual(s["konu"], "denetim.ornek.test")
        self.assertEqual(s["baslangic"], datetime(2026, 11, 9, 12, 49, 25, tzinfo=UTC))
        self.assertEqual(s["bitis"], datetime(2036, 11, 6, 12, 49, 25, tzinfo=UTC))
        self.assertTrue(s["kendinden_imzali"])

    def test_utctime_yuzyil_kurali(self):
        self.assertEqual(sertifika.zaman_coz(0x17, "491231235959Z").year, 2049)
        self.assertEqual(sertifika.zaman_coz(0x17, "500101000000Z").year, 1950)
        self.assertEqual(sertifika.zaman_coz(0x18, "20991231235959Z").year, 2099)
        with self.assertRaises(sertifika.DerHatasi):
            sertifika.zaman_coz(0x17, "4912312359+0300")

    def test_uzun_bicim_uzunluk(self):
        veri = bytes([0x04, 0x82, 0x01, 0x00]) + b"x" * 256
        self.assertEqual(sertifika.tlv(veri, 0), (0x04, 4, 260))
        with self.assertRaises(sertifika.DerHatasi):
            sertifika.tlv(veri[:100], 0)

    def test_bozuk_girdi(self):
        der = sertifika.pem_oku(ornek("sertifika.pem"))[0]
        for kesik in (b"", b"\x30", der[:40], b"\x31" + der[1:]):
            with self.subTest(n=len(kesik)), self.assertRaises(sertifika.DerHatasi):
                sertifika.coz(kesik)


class SureDenetimTestleri(unittest.TestCase):
    def setUp(self):
        self.s = sertifika.coz(sertifika.pem_oku(ornek("sertifika.pem"))[0])

    def onemler(self, simdi):
        return sorted((b.kural, b.onem) for b in sertifika.denetle(self.s, simdi=simdi))

    def test_gecerli(self):
        self.assertEqual(self.onemler(datetime(2030, 1, 1, tzinfo=UTC)), [("TLS-004", "orta")])

    def test_yaklasan_ve_dolmus(self):
        bitis = self.s["bitis"]
        self.assertIn(("TLS-002", "orta"), self.onemler(bitis - timedelta(days=20)))
        self.assertIn(("TLS-002", "yuksek"), self.onemler(bitis - timedelta(days=3)))
        self.assertIn(("TLS-001", "kritik"), self.onemler(bitis + timedelta(days=1)))
        self.assertIn(("TLS-003", "yuksek"), self.onemler(self.s["baslangic"] - timedelta(hours=1)))


@unittest.skipUnless(shutil.which("openssl"), "openssl yok")
class CanliTlsTesti(unittest.TestCase):
    """Yerel bir TLS sunucusu (127.0.0.1) kurup sertifikasını el sıkışmayla okur."""

    def test_yerel_sunucu(self):
        with tempfile.TemporaryDirectory() as d:
            sert, anahtar = os.path.join(d, "s.pem"), os.path.join(d, "a.pem")
            subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
                            "-nodes", "-keyout", anahtar, "-out", sert, "-days", "10", "-subj", "/CN=yerel.test"],
                           check=True, capture_output=True)
            baglam = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            baglam.load_cert_chain(sert, anahtar)
            dinleyici = socket.create_server(("127.0.0.1", 0))
            port = dinleyici.getsockname()[1]

            def hizmet():
                baglanti, _ = dinleyici.accept()
                try:
                    with baglam.wrap_socket(baglanti, server_side=True) as tls:
                        tls.recv(1)
                except (ssl.SSLError, OSError):
                    pass

            t = threading.Thread(target=hizmet, daemon=True)
            t.start()
            der = sertifika.sunucudan_al("127.0.0.1", port)
            t.join(timeout=5)
            dinleyici.close()
        s = sertifika.coz(der)
        self.assertEqual(s["konu"], "yerel.test")
        bulgular = sertifika.denetle(s)  # 10 günlük sertifika → 30 günlük eşikte uyarı
        self.assertIn(("TLS-002", "orta"), [(b.kural, b.onem) for b in bulgular])


if __name__ == "__main__":
    unittest.main()
