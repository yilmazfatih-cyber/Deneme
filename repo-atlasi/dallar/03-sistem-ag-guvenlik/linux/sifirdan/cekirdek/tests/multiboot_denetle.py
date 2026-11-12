#!/usr/bin/env python3
"""Derlenen çekirdeğin Multiboot (v1) ve ELF gereksinimlerini doğrular.

QEMU olmadan "önyüklenebilir mi?" sorusunun statik kısmını yanıtlar:
  1. ELF32, little-endian, EM_386, ET_EXEC mi?
  2. Multiboot başlığı ilk 8192 bayt içinde, 4 bayt hizalı ve sağlaması doğru mu?
  3. Yüklenebilir bölütler (PT_LOAD) 1 MiB ve üstüne mi yerleşiyor?
  4. Giriş noktası çalıştırılabilir bir bölütün içinde mi?
  5. Dinamik bağlama izi (PT_INTERP / PT_DYNAMIC) yok mu? kmain sembolü var mı?

Kullanım: python3 tests/multiboot_denetle.py cekirdek.elf
"""

import struct
import sys

MB_SIHIR = 0x1BADB002
ARAMA_SINIRI = 8192
PT_LOAD, PT_DYNAMIC, PT_INTERP = 1, 2, 3
PF_X = 1
SHT_SYMTAB = 2


def multiboot_basligi_bul(veri):
    """(ofset, bayraklar) döndürür; bulunamazsa None."""
    for ofset in range(0, min(ARAMA_SINIRI, len(veri)) - 11, 4):
        sihir, bayraklar, saglama = struct.unpack_from("<III", veri, ofset)
        if sihir == MB_SIHIR and (sihir + bayraklar + saglama) & 0xFFFFFFFF == 0:
            return ofset, bayraklar
    return None


def bolutler(veri):
    e_phoff = struct.unpack_from("<I", veri, 28)[0]
    e_phentsize, e_phnum = struct.unpack_from("<HH", veri, 42)
    for i in range(e_phnum):
        p_type, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_flags, _ = struct.unpack_from(
            "<8I", veri, e_phoff + i * e_phentsize
        )
        yield {"tur": p_type, "ofset": p_offset, "fiziksel": p_paddr, "dosya": p_filesz, "bayrak": p_flags,
               "sanal": p_vaddr, "bellek": p_memsz}


def sembol_adlari(veri):
    e_shoff = struct.unpack_from("<I", veri, 32)[0]
    e_shentsize, e_shnum = struct.unpack_from("<HH", veri, 46)
    bolumler = [struct.unpack_from("<10I", veri, e_shoff + i * e_shentsize) for i in range(e_shnum)]
    adlar = set()
    for b in bolumler:
        if b[1] != SHT_SYMTAB:
            continue
        dizgi = bolumler[b[6]]  # sh_link → sembol adlarının dizgi tablosu
        for j in range(b[5] // 16):  # Elf32_Sym = 16 bayt
            st_name = struct.unpack_from("<I", veri, b[4] + j * 16)[0]
            bas = dizgi[4] + st_name
            adlar.add(veri[bas:veri.index(b"\0", bas)].decode("ascii", "replace"))
    return adlar


def denetle(yol):
    with open(yol, "rb") as f:
        veri = f.read()
    hatalar = []
    if veri[:4] != b"\x7fELF":
        return ["ELF sihirli baytları yok"]
    if veri[4] != 1 or veri[5] != 1:
        hatalar.append("ELF32 little-endian değil (QEMU -kernel yalnız 32 bit ELF multiboot yükler)")
    e_type, e_machine = struct.unpack_from("<HH", veri, 16)
    if e_machine != 3:
        hatalar.append(f"e_machine={e_machine}, EM_386 (3) bekleniyordu")
    if e_type != 2:
        hatalar.append(f"e_type={e_type}, ET_EXEC (2) bekleniyordu")

    baslik = multiboot_basligi_bul(veri)
    if baslik is None:
        hatalar.append("ilk 8192 baytta geçerli multiboot başlığı yok")
    else:
        ofset, bayraklar = baslik
        print(f"multiboot başlığı: dosya ofseti {ofset:#x}, bayraklar {bayraklar:#x}")
        if bayraklar & 0x10000:
            hatalar.append("a.out çekirdeği (bit 16) ELF için gereksiz")

    giris = struct.unpack_from("<I", veri, 24)[0]
    yuklenen = [b for b in bolutler(veri) if b["tur"] == PT_LOAD]
    if not yuklenen:
        hatalar.append("PT_LOAD bölütü yok")
    for b in yuklenen:
        if b["fiziksel"] < 0x100000:
            hatalar.append(f"bölüt {b['fiziksel']:#x} adresinde: 1 MiB altı BIOS/VGA alanıdır")
    if not any(b["bayrak"] & PF_X and b["sanal"] <= giris < b["sanal"] + b["bellek"] for b in yuklenen):
        hatalar.append(f"giriş noktası {giris:#x} çalıştırılabilir bir bölütte değil")
    if any(b["tur"] in (PT_INTERP, PT_DYNAMIC) for b in bolutler(veri)):
        hatalar.append("dinamik bağlama izi var; çekirdek statik olmalı")
    if "kmain" not in sembol_adlari(veri):
        hatalar.append("kmain sembolü bulunamadı")
    print(f"giriş noktası: {giris:#x}, yüklenebilir bölüt sayısı: {len(yuklenen)}")
    return hatalar


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    hatalar = denetle(sys.argv[1])
    for h in hatalar:
        print("HATA:", h)
    if hatalar:
        return 1
    print("TAMAM: çekirdek multiboot ve ELF denetimlerinden geçti")
    return 0


if __name__ == "__main__":
    sys.exit(main())
