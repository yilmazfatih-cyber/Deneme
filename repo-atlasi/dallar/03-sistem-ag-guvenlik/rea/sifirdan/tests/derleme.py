"""Testler için örnek ikilileri geçici bir dizinde derler (gcc yoksa testler atlanır)."""

import os
import shutil
import subprocess
import tempfile

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KAYNAK = os.path.join(KOK, "ornekler", "ornek.c")
GCC = shutil.which("gcc")
READELF = shutil.which("readelf")

DEGISKENLER = {
    # Sertleştirilmiş: PIE + tam RELRO + kanarya + FORTIFY
    "sert": ["-O2", "-fPIE", "-pie", "-fstack-protector-all", "-D_FORTIFY_SOURCE=2", "-Wl,-z,relro,-z,now"],
    # Zayıf: sabit adres, çalıştırılabilir yığın, RELRO yok, kanarya yok
    "zayif": ["-O0", "-fno-pie", "-no-pie", "-fno-stack-protector", "-Wl,-z,norelro", "-z", "execstack"],
    # Soyulmuş: .symtab yok
    "soyulmus": ["-O2", "-s"],
}


def derle(dizin):
    """{ad: yol} döndürür; ayrıca 32 bit yeniden konumlanabilir nesne (ET_REL) dener."""
    yollar = {}
    for ad, bayraklar in DEGISKENLER.items():
        yol = os.path.join(dizin, f"ornek_{ad}")
        subprocess.run([GCC, *bayraklar, KAYNAK, "-o", yol], check=True, capture_output=True)
        yollar[ad] = yol
    # 32 bit libc başlıkları çoğu sistemde kurulu değildir; başlıksız bir kaynak yeter.
    kaynak32, nesne32 = os.path.join(dizin, "ornek32.c"), os.path.join(dizin, "ornek32.o")
    with open(kaynak32, "w") as f:
        f.write('int topla(int a, int b) { return a + b; }\nconst char ETIKET[] = "ELF32 ornek";\n')
    komut = [GCC, "-m32", "-ffreestanding", "-c", "-O1", kaynak32, "-o", nesne32]
    if subprocess.run(komut, capture_output=True).returncode == 0:
        yollar["nesne32"] = nesne32
    return yollar


class GeciciDerleme:
    def __enter__(self):
        self.dizin = os.path.realpath(tempfile.mkdtemp(prefix="reamini-"))
        self.yollar = derle(self.dizin)
        return self

    def __exit__(self, *_):
        shutil.rmtree(self.dizin, ignore_errors=True)
