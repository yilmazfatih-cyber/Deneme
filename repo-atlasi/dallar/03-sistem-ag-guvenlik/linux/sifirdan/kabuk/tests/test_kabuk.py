"""Mini kabuk için senaryo testleri: `make test` çalıştırır.

Her test kabuğa bir betik verir (stdin ya da -c) ve stdout/stderr/çıkış kodunu
denetler. Zaman aşımı, kapatılmamış boru uçlarının yol açtığı askıda kalmaları
yakalar: yazma ucu açık kalırsa okuyucu hiç EOF görmez ve test 5 sn'de düşer.
"""

import os
import resource
import shutil
import subprocess
import tempfile
import unittest

KABUK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "kabuk")


def calistir(betik, cwd=None, argumanlar=()):
    return subprocess.run(
        [KABUK, *argumanlar],
        input=betik,
        capture_output=True,
        text=True,
        timeout=5,
        cwd=cwd,
    )


class TemelTestler(unittest.TestCase):
    def test_basit_komut(self):
        s = calistir("echo merhaba dünya\n")
        self.assertEqual(s.stdout, "merhaba dünya\n")
        self.assertEqual(s.returncode, 0)

    def test_c_kipi(self):
        s = calistir("", argumanlar=("-c", "echo tek satır"))
        self.assertEqual(s.stdout, "tek satır\n")

    def test_tirnaklar_ve_kacis(self):
        s = calistir("echo \"a  b\" 'c|d' e\\ f \"\\\"x\\\"\"\n")
        self.assertEqual(s.stdout, 'a  b c|d e f "x"\n')

    def test_degisken_genisletme(self):
        s = subprocess.run(
            [KABUK, "-c", "echo $KABUK_TEST '$KABUK_TEST' \"[$KABUK_TEST]\" $ $YOK_BOYLE_BIR_DEGISKEN."],
            capture_output=True, text=True, timeout=5, env={**os.environ, "KABUK_TEST": "deger"},
        )
        self.assertEqual(s.stdout, "deger $KABUK_TEST [deger] $ .\n")

    def test_yorum_ve_bos_satir(self):
        s = calistir("# yorum satırı\n\n   \necho a#b # sondaki yorum\n")
        self.assertEqual(s.stdout, "a#b\n")


class BoruVeYonlendirmeTestleri(unittest.TestCase):
    def setUp(self):
        self.dizin = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dizin)

    def test_boru_hatti(self):
        s = calistir("printf 'b\\na\\nc\\n' | sort | head -n 2\n")
        self.assertEqual(s.stdout, "a\nb\n")

    def test_uzun_boru_hatti(self):
        s = calistir("seq 1 1000 | grep 7 | wc -l | tr -d ' '\n")
        self.assertEqual(s.stdout.strip(), "271")

    def test_cikti_ekleme_girdi(self):
        s = calistir("echo bir > f.txt\necho iki >> f.txt\ncat < f.txt\necho üç > f.txt\ncat f.txt\n", cwd=self.dizin)
        self.assertEqual(s.stdout, "bir\niki\nüç\n")

    def test_yonlendirme_ve_boru_birlikte(self):
        with open(os.path.join(self.dizin, "giris.txt"), "w") as f:
            f.write("kabuk\nçekirdek\n")
        s = calistir("tr a-z A-Z < giris.txt | sort > cikis.txt\n", cwd=self.dizin)
        self.assertEqual(s.returncode, 0)
        with open(os.path.join(self.dizin, "cikis.txt")) as f:
            self.assertEqual(f.read(), "KABUK\nçEKIRDEK\n")

    def test_olmayan_girdi_dosyasi(self):
        s = calistir("cat < yok.txt\necho $?\n", cwd=self.dizin)
        self.assertIn("yok.txt", s.stderr)
        self.assertEqual(s.stdout, "1\n")

    def test_tanitici_sizintisi_yok(self):
        # ls kendi /proc/self/fd dizinini listeler. Kabuk boru uçlarını sızdırsaydı
        # 0, 1, 2 ve ls'in açtığı dizin tanıtıcısından fazlasını görürdük.
        s = calistir("ls /proc/self/fd | cat\n")
        taniticilar = s.stdout.split()
        self.assertEqual(sorted(taniticilar)[:3], ["0", "1", "2"])
        self.assertLessEqual(len(taniticilar), 4, taniticilar)

    @unittest.skipUnless(os.path.isdir("/proc/self/fd"), "/proc yok")
    def test_pipe2_hatasi_yarida_temizler(self):
        # RLIMIT_NOFILE=5: 0-2 dolu, ilk boru 3-4'ü alır; ikinci pipe2 beşinci
        # tanıtıcıyı isteyince EMFILE ile düşer. Kabuk açık kalan okuma ucunu
        # kapatmalı (yes SIGPIPE ile ölür) ve çocuğu beklemeli; sonra kendi
        # tanıtıcı tablosunda yalnız 0, 1, 2 kalmalı.
        def sinirla():
            resource.setrlimit(resource.RLIMIT_NOFILE, (5, 5))

        with subprocess.Popen(
            [KABUK], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, preexec_fn=sinirla,
        ) as p:
            betik = f"yes | cat | cat > /dev/null\necho $?\nls /proc/{p.pid}/fd\n"
            cikti, hata = p.communicate(betik, timeout=5)
        self.assertIn("pipe2", hata)
        self.assertEqual(cikti.split(), ["1", "0", "1", "2"])


class YerlesikVeDurumTestleri(unittest.TestCase):
    def test_cd_ve_pwd(self):
        dizin = os.path.realpath(tempfile.mkdtemp())
        try:
            s = calistir(f"cd {dizin}\npwd\ncd /olmayan/dizin\necho $?\n")
            self.assertEqual(s.stdout, f"{dizin}\n1\n")
            self.assertIn("cd: /olmayan/dizin", s.stderr)
        finally:
            os.rmdir(dizin)

    def test_cd_boru_icinde_kabugu_etkilemez(self):
        s = calistir("cd / | true\npwd\n", cwd="/tmp")
        self.assertEqual(os.path.realpath(s.stdout.strip()), os.path.realpath("/tmp"))

    def test_cikis_kodlari(self):
        s = calistir("false\necho $?\ntrue\necho $?\nolmayan_komut_xyz\necho $?\n")
        self.assertEqual(s.stdout, "1\n0\n127\n")
        self.assertIn("olmayan_komut_xyz: komut bulunamadı", s.stderr)

    def test_boru_hatti_durumu_son_komutundur(self):
        s = calistir("false | true\necho $?\ntrue | false\necho $?\n")
        self.assertEqual(s.stdout, "0\n1\n")

    def test_sinyalle_olen_cocuk(self):
        s = calistir("sh -c 'kill -TERM $$'\necho $?\n")
        self.assertEqual(s.stdout, "143\n")  # 128 + SIGTERM(15)

    def test_exit(self):
        s = calistir("echo önce\nexit 3\necho sonra\n")
        self.assertEqual(s.stdout, "önce\n")
        self.assertEqual(s.returncode, 3)

    def test_eof_son_durumu_dondurur(self):
        self.assertEqual(calistir("false\n").returncode, 1)


class SozdizimiTestleri(unittest.TestCase):
    def test_hatalar(self):
        for satir in ("| cat", "echo a |", "echo >", "cat <", "echo 'kapanmadı", 'echo "kapanmadı'):
            with self.subTest(satir=satir):
                s = calistir(satir + "\necho $?\n")
                self.assertEqual(s.stdout, "2\n")
                self.assertTrue(s.stderr.startswith("kabuk:"), s.stderr)


@unittest.skipUnless(shutil.which("strace"), "strace yok")
class SistemCagrisiTesti(unittest.TestCase):
    def test_strace_ile_cagri_sirasi(self):
        with tempfile.TemporaryDirectory() as d:
            iz = os.path.join(d, "iz.txt")
            s = subprocess.run(
                ["strace", "-f", "-qq", "-o", iz, "-e", "trace=pipe,pipe2,dup2,execve,wait4,clone,clone3,fork,vfork",
                 KABUK, "-c", "echo a | cat"],
                capture_output=True, text=True, timeout=10,
            )
            if s.returncode != 0 or not os.path.exists(iz):
                self.skipTest("ptrace bu ortamda kullanılamıyor: " + s.stderr[:200])
            with open(iz) as f:
                metin = f.read()
        self.assertEqual(s.stdout, "a\n")
        self.assertRegex(metin, r"pipe2?\(")
        self.assertRegex(metin, r"clone3?\(|fork\(")
        self.assertIn("dup2(", metin)
        self.assertGreaterEqual(metin.count("execve("), 3)  # kabuk + echo + cat
        self.assertIn("wait4(", metin)


if __name__ == "__main__":
    unittest.main()
