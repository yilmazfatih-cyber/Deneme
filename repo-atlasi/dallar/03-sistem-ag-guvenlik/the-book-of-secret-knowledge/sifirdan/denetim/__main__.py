"""Komut satırı: python3 -m denetim <alt-komut> ...

    sshd  DOSYA                      sshd_config denetimi
    soket [DOSYA ...]                /proc/net/tcp biçimli dosyalar (yoksa bu makinenin)
    tls   --pem DOSYA | --sunucu ana_bilgisayar:port
    log   DOSYA [--yil 2026]         auth.log kaba kuvvet analizi

Ortak: --json (makine okunur çıktı), --esik ONEM (bu ve üstü bulgu → çıkış kodu 1)
"""

import argparse
import os
import sys

from . import bulgu, kaba_kuvvet, sertifika, soketler, sshd


def _oku(yol):
    with open(yol, encoding="utf-8", errors="replace") as f:
        return f.read()


def main(argv=None):
    p = argparse.ArgumentParser(prog="denetim", description="Kendi sunucunuz için savunma amaçlı öz denetim")
    p.add_argument("--json", action="store_true")
    p.add_argument("--esik", default="yuksek", choices=list(bulgu.ONEM_SIRASI))
    alt = p.add_subparsers(dest="komut", required=True)
    alt.add_parser("sshd").add_argument("dosya")
    alt.add_parser("soket").add_argument("dosyalar", nargs="*")
    t = alt.add_parser("tls")
    t.add_argument("--pem")
    t.add_argument("--sunucu")
    t.add_argument("--uyari-gun", type=int, default=30)
    g = alt.add_parser("log")
    g.add_argument("dosya")
    g.add_argument("--yil", type=int)
    a = p.parse_args(argv)

    if a.komut == "sshd":
        bulgular = sshd.denetle(_oku(a.dosya), a.dosya)
    elif a.komut == "soket":
        dosyalar = a.dosyalar or [y for y in ("/proc/net/tcp", "/proc/net/tcp6") if os.path.exists(y)]
        bulgular = []
        for yol in dosyalar:
            bulgular += soketler.denetle(soketler.ayristir(_oku(yol)), yol)
    elif a.komut == "tls":
        if a.pem:
            dersler, kaynak = sertifika.pem_oku(_oku(a.pem)), a.pem
        elif a.sunucu:
            ana, _, port = a.sunucu.rpartition(":")
            dersler, kaynak = [sertifika.sunucudan_al(ana, int(port))], a.sunucu
        else:
            p.error("tls için --pem ya da --sunucu gerekli")
        bulgular = []
        for der in dersler:
            bulgular += sertifika.denetle(sertifika.coz(der), uyari_gun=a.uyari_gun, kaynak=kaynak)
    else:
        bulgular, _ = kaba_kuvvet.analiz(_oku(a.dosya), yil=a.yil)

    print(bulgu.rapor(bulgular, "json" if a.json else "metin"))
    return bulgu.cikis_kodu(bulgular, a.esik)


if __name__ == "__main__":
    sys.exit(main())
