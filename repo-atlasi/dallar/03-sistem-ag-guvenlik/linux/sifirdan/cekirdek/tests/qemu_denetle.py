#!/usr/bin/env python3
"""Çekirdeği QEMU'da ekransız açar ve VGA metin belleğini okuyarak doğrular.

İsteğe bağlıdır (make qemu-test): qemu-system-i386 yoksa açık bir mesajla
atlanır ve 0 ile çıkar. Yalnız standart kitaplık kullanır:
  1. qemu-system-i386 -kernel cekirdek.elf -display none -qmp unix:<soket>
  2. QMP (QEMU'nun JSON denetim protokolü) ile "pmemsave": 0xB8000'deki
     80x25'lik metin belleği bir dosyaya dökülür; hücrelerin düşük baytları
     CP437 olarak çözülür.
  3. Açılış satırları, sağ üstteki sayacın ilerlemesi ve klavye yankısı
     ("send-key" ile h, i, Shift+a, Enter) denetlenir.
Kullanım: python3 tests/qemu_denetle.py cekirdek.elf
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

VGA_ADRES = 0xB8000
VGA_BOYU = 80 * 25 * 2
ZAMAN_ASIMI = 20.0


class Qmp:
    """Satır başına bir JSON mesajı: komut gönder, "return" gelene kadar oku."""

    def __init__(self, yol):
        self.soket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.soket.settimeout(ZAMAN_ASIMI)
        self.soket.connect(yol)
        self.dosya = self.soket.makefile("rw", encoding="utf-8", newline="\n")
        self._oku()  # karşılama mesajı: {"QMP": {...}}
        self.komut("qmp_capabilities")

    def _oku(self):
        satir = self.dosya.readline()
        if not satir:
            raise ConnectionError("QMP bağlantısı kapandı")
        return json.loads(satir)

    def komut(self, ad, **argumanlar):
        mesaj = {"execute": ad, "arguments": argumanlar} if argumanlar else {"execute": ad}
        self.dosya.write(json.dumps(mesaj) + "\n")
        self.dosya.flush()
        while True:
            yanit = self._oku()
            if "return" in yanit:
                return yanit["return"]
            if "error" in yanit:
                raise RuntimeError(f"QMP {ad}: {yanit['error']}")
            # {"event": ...} mesajları eşzamansızdır: atla

    def kapat(self):
        self.soket.close()


def ekran(qmp, dizin):
    """25 satırlık ekran: 80 karakterlik ham satırlar (CP437; 0x1A ok glifi
    Python'un cp437 çözücüsünde '\\x1a' denetim karakteri olarak görünür)."""
    yol = os.path.join(dizin, "vga.bin")
    qmp.komut("pmemsave", val=VGA_ADRES, size=VGA_BOYU, filename=yol)
    with open(yol, "rb") as f:
        ham = f.read()
    metin = bytes(ham[0::2]).decode("cp437")  # çift baytlar karakter, tekler renk
    return [metin[i * 80 : (i + 1) * 80] for i in range(25)]


def kirp(satirlar):
    return [x.rstrip() for x in satirlar]


def bekle(qmp, dizin, kosul, aciklama):
    son = time.monotonic() + ZAMAN_ASIMI
    satirlar = []
    while time.monotonic() < son:
        satirlar = ekran(qmp, dizin)
        if kosul(satirlar):
            return satirlar
        time.sleep(0.1)
    raise AssertionError(f"zaman aşımı: {aciklama}\n--- ekran ---\n" + "\n".join(satirlar))


def sayac(satirlar):
    """Sağ üst köşe: 61-70. sütun ' çalisma: ', 71-75. sütun saniye, 76-79 ' sn '."""
    rakamlar = satirlar[0][71:76]
    return int(rakamlar) if rakamlar.isdigit() else None


def yanki_tamam(satirlar):
    s = kirp(satirlar)
    return "> hiA" in s and s.index("> hiA") + 1 < len(s) and s[s.index("> hiA") + 1] == ">"


def tus(qmp, *adlar):
    qmp.komut("send-key", keys=[{"type": "qcode", "data": ad} for ad in adlar])
    time.sleep(0.05)


def denetle(qemu, elf, dizin):
    soket_yolu = os.path.join(dizin, "qmp.sock")
    komut = [qemu, "-kernel", elf, "-append", "selam=dunya", "-display", "none", "-monitor", "none",
             "-serial", "none", "-parallel", "none", "-net", "none", "-no-reboot",
             "-qmp", f"unix:{soket_yolu},server=on,wait=off"]
    surec = subprocess.Popen(komut, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    qmp = None
    try:
        son = time.monotonic() + ZAMAN_ASIMI
        while not os.path.exists(soket_yolu):
            if surec.poll() is not None:
                raise RuntimeError("QEMU başlamadı: " + surec.stderr.read().decode(errors="replace")[:500])
            if time.monotonic() > son:
                raise RuntimeError("QMP soketi oluşmadı")
            time.sleep(0.05)
        qmp = Qmp(soket_yolu)

        ham = bekle(qmp, dizin, lambda s: ">" in kirp(s), "klavye istemi")
        satirlar, duz = kirp(ham), "".join(ham)  # duz: 80 sütunu aşıp alt satıra taşan metin için
        tamam = [x for x in satirlar if x.startswith("[tamam]")]
        assert len(tamam) == 4, f"4 '[tamam]' satırı bekleniyordu: {tamam}"
        assert any(x.startswith("Önyükleyici: qemu") for x in satirlar), "önyükleyici adı yok"
        # QEMU, Multiboot komut satırının başına çekirdek dosyasının yolunu koyar.
        assert "Komut satiri: " in duz and "cekirdek.elf selam=dunya" in duz, "komut satırı yok"
        assert any("IRQ0-15 \x1a vektör 32-47" in x for x in satirlar), "PIC satırında → (0x1A) yok"
        print("açılış: " + " | ".join(t.replace("\x1a", "→") for t in tamam))

        ilk = bekle(qmp, dizin, lambda s: sayac(s) is not None and sayac(s) >= 1, "çalışma sayacı")
        sonraki = bekle(qmp, dizin, lambda s: (sayac(s) or 0) > sayac(ilk), "sayacın ilerlemesi")
        print(f"zamanlayıcı IRQ0: sayaç {sayac(ilk)} → {sayac(sonraki)} sn")

        for ad in ("h", "i"):
            tus(qmp, ad)
        tus(qmp, "shift", "a")
        tus(qmp, "ret")
        bekle(qmp, dizin, yanki_tamam, "klavye yankısı '> hiA' ve Enter'dan sonra yeni '> ' istemi")
        print("klavye IRQ1: '> hiA' yankılandı, Enter yeni istem açtı")
        qmp.komut("quit")
    finally:
        if qmp is not None:
            qmp.kapat()
        try:
            surec.wait(timeout=5)
        except subprocess.TimeoutExpired:
            surec.kill()
            surec.wait()
        surec.stderr.close()


def main(argv):
    if len(argv) != 2:
        print("kullanım: qemu_denetle.py cekirdek.elf", file=sys.stderr)
        return 2
    qemu = os.environ.get("QEMU") or shutil.which("qemu-system-i386")
    if not qemu:
        print("ATLANDI: qemu-system-i386 bulunamadı (sudo apt install qemu-system-x86)")
        return 0
    with tempfile.TemporaryDirectory(prefix="cekirdek-qemu-") as dizin:
        try:
            denetle(qemu, os.path.abspath(argv[1]), dizin)
        except (AssertionError, RuntimeError, OSError) as hata:
            print(f"BAŞARISIZ: {hata}", file=sys.stderr)
            return 1
    print("TAMAM: çekirdek QEMU'da açıldı; zamanlayıcı ve klavye kesmeleri çalışıyor")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
