"""ELF ayrıştırıcı (sıfırdan, yalnız struct).

Bir ELF dosyası üç tablo etrafında kuruludur:
  * ELF başlığı (ofset 0): sınıf (32/64), bayt sırası, tür, makine, giriş noktası
  * Bölüm (section) tabloları: bağlayıcının görüşü — .text, .rodata, .symtab ...
  * Bölüt (segment / program header) tablosu: yükleyicinin görüşü — PT_LOAD ...
Semboller .symtab/.dynsym'de durur; adları sh_link'in gösterdiği dizgi tablosundadır.
Kaynak: System V gABI, elf(5). Gerçek dünyada: readelf, pyelftools, rea src/domain/elf*.ts
"""

import hashlib
import struct

TURLER = {0: "ET_NONE", 1: "ET_REL", 2: "ET_EXEC", 3: "ET_DYN", 4: "ET_CORE"}
MAKINELER = {3: "x86", 8: "MIPS", 20: "PowerPC", 21: "PowerPC64", 40: "ARM", 62: "x86-64", 183: "AArch64",
             243: "RISC-V"}
BOLUM_TURLERI = {0: "NULL", 1: "PROGBITS", 2: "SYMTAB", 3: "STRTAB", 4: "RELA", 5: "HASH", 6: "DYNAMIC", 7: "NOTE",
                 8: "NOBITS", 9: "REL", 11: "DYNSYM", 14: "INIT_ARRAY", 15: "FINI_ARRAY", 0x6FFFFFF6: "GNU_HASH",
                 0x6FFFFFFE: "VERNEED", 0x6FFFFFFF: "VERSYM"}
BOLUT_TURLERI = {0: "NULL", 1: "LOAD", 2: "DYNAMIC", 3: "INTERP", 4: "NOTE", 6: "PHDR", 7: "TLS",
                 0x6474E550: "GNU_EH_FRAME", 0x6474E551: "GNU_STACK", 0x6474E552: "GNU_RELRO",
                 0x6474E553: "GNU_PROPERTY"}
BAGLAR = {0: "LOCAL", 1: "GLOBAL", 2: "WEAK"}
SEMBOL_TURLERI = {0: "NOTYPE", 1: "OBJECT", 2: "FUNC", 3: "SECTION", 4: "FILE", 6: "TLS"}
SHT_SYMTAB, SHT_DYNSYM, SHT_NOBITS, SHT_DYNAMIC = 2, 11, 8, 6
SHF_WRITE, SHF_ALLOC, SHF_EXEC = 1, 2, 4
PF_X, PF_W, PF_R = 1, 2, 4
SHN_UNDEF, SHN_XINDEX = 0, 0xFFFF
DT_NEEDED, DT_BIND_NOW, DT_FLAGS, DT_FLAGS_1 = 1, 24, 30, 0x6FFFFFFB
DF_BIND_NOW, DF_1_NOW, DF_1_PIE = 0x8, 0x1, 0x08000000


class ElfHatasi(ValueError):
    pass


class Elf:
    def __init__(self, veri):
        self.veri = veri
        if veri[:4] != b"\x7fELF":
            raise ElfHatasi("ELF değil: sihirli baytlar yok")
        if len(veri) < 52 or veri[4] not in (1, 2) or veri[5] not in (1, 2):
            raise ElfHatasi("geçersiz e_ident (sınıf/bayt sırası)")
        self.bit = 32 if veri[4] == 1 else 64
        self.bs = "<" if veri[5] == 1 else ">"
        bicim = "HHIIIIIHHHHHH" if self.bit == 32 else "HHIQQQIHHHHHH"
        try:
            (self.tur, self.makine, _, self.giris, self.phoff, self.shoff, self.bayraklar, _, self.phentsize,
             self.phnum, self.shentsize, self.shnum, self.shstrndx) = self._oku(bicim, 16)
        except struct.error:
            raise ElfHatasi("ELF başlığı kesik") from None
        self.bolumler = self._bolumler()
        self.bolutler = self._bolutler()

    def _oku(self, bicim, ofset):
        return struct.unpack_from(self.bs + bicim, self.veri, ofset)

    def _dizgi(self, ofset):
        if not 0 <= ofset < len(self.veri):
            return ""
        son = self.veri.find(b"\0", ofset)
        return self.veri[ofset : son if son != -1 else len(self.veri)].decode("utf-8", "replace")

    def _bolumler(self):
        if self.shoff == 0:
            return []
        bicim = "IIIIIIIIII" if self.bit == 32 else "IIQQQQIIQQ"
        sayi, dizgi_indeksi = self.shnum, self.shstrndx
        if sayi == 0 or dizgi_indeksi == SHN_XINDEX:  # genişletilmiş numaralama: gerçek değer bölüm 0'da
            ilk = self._oku(bicim, self.shoff)
            sayi = sayi or ilk[5]
            dizgi_indeksi = ilk[6] if dizgi_indeksi == SHN_XINDEX else dizgi_indeksi
        if self.shoff + sayi * self.shentsize > len(self.veri):
            raise ElfHatasi("bölüm tablosu dosyanın sonunu aşıyor")
        ham = [self._oku(bicim, self.shoff + i * self.shentsize) for i in range(sayi)]
        adlar_ofseti = ham[dizgi_indeksi][4] if dizgi_indeksi < len(ham) else None
        bolumler = []
        for i, (ad, tur, bayrak, adres, ofset, boyut, bag, bilgi, hiza, girdi) in enumerate(ham):
            bolumler.append({
                "indeks": i, "ad": self._dizgi(adlar_ofseti + ad) if adlar_ofseti is not None else "",
                "tur": BOLUM_TURLERI.get(tur, hex(tur)), "tur_kodu": tur, "bayraklar": bayrak, "adres": adres,
                "ofset": ofset, "boyut": boyut, "baglanti": bag, "girdi_boyu": girdi,
            })
        return bolumler

    def _bolutler(self):
        if self.phoff == 0:
            return []
        if self.phoff + self.phnum * self.phentsize > len(self.veri):
            raise ElfHatasi("program başlığı tablosu dosyanın sonunu aşıyor")
        sonuc = []
        for i in range(self.phnum):
            o = self.phoff + i * self.phentsize
            if self.bit == 32:
                tur, ofset, sanal, fiziksel, dosya_boyu, bellek_boyu, bayrak, hiza = self._oku("IIIIIIII", o)
            else:
                tur, bayrak, ofset, sanal, fiziksel, dosya_boyu, bellek_boyu, hiza = self._oku("IIQQQQQQ", o)
            izin = ("R" if bayrak & PF_R else "-") + ("W" if bayrak & PF_W else "-") + ("X" if bayrak & PF_X else "-")
            sonuc.append({"tur": BOLUT_TURLERI.get(tur, hex(tur)), "ofset": ofset, "sanal_adres": sanal,
                          "dosya_boyu": dosya_boyu, "bellek_boyu": bellek_boyu, "izinler": izin})
        return sonuc

    # ------------------------------------------------------------ sorgular

    def bolum(self, ad):
        return next((b for b in self.bolumler if b["ad"] == ad), None)

    def semboller(self):
        """Önce .symtab (tam), yoksa .dynsym (dışa açık) — soyulmuş ikililerde yalnız dynsym kalır."""
        sonuc = []
        for tablo in sorted((b for b in self.bolumler if b["tur_kodu"] in (SHT_SYMTAB, SHT_DYNSYM)),
                            key=lambda b: b["tur_kodu"]):
            dizgiler = self.bolumler[tablo["baglanti"]]["ofset"]
            boy = tablo["girdi_boyu"] or (16 if self.bit == 32 else 24)
            for j in range(1, tablo["boyut"] // boy):  # 0. girdi her zaman boştur
                o = tablo["ofset"] + j * boy
                if self.bit == 32:
                    ad, deger, boyut, bilgi, _, bolum_indeksi = self._oku("IIIBBH", o)
                else:
                    ad, bilgi, _, bolum_indeksi, deger, boyut = self._oku("IBBHQQ", o)
                bolum = (self.bolumler[bolum_indeksi]["ad"] if 0 < bolum_indeksi < len(self.bolumler) else
                         ("UNDEF" if bolum_indeksi == SHN_UNDEF else hex(bolum_indeksi)))
                sonuc.append({"ad": self._dizgi(dizgiler + ad), "deger": deger, "boyut": boyut,
                              "tur": SEMBOL_TURLERI.get(bilgi & 0xF, str(bilgi & 0xF)),
                              "bag": BAGLAR.get(bilgi >> 4, str(bilgi >> 4)), "bolum": bolum, "tablo": tablo["ad"]})
            if sonuc and tablo["tur_kodu"] == SHT_SYMTAB:
                break
        return sonuc

    def adres_ofset(self, adres):
        """Sanal adres → dosya ofseti (yüklenen ve dosyada yer kaplayan bölümler üzerinden)."""
        for b in self.bolumler:
            if b["bayraklar"] & SHF_ALLOC and b["tur_kodu"] != SHT_NOBITS and b["adres"] <= adres < b["adres"] + b[
                    "boyut"]:
                return b["ofset"] + (adres - b["adres"]), b["ad"]
        return None, None

    def fonksiyonlar(self):
        sonuc = []
        for s in self.semboller():
            if s["tur"] == "FUNC" and s["deger"] and s["bolum"] != "UNDEF":
                ofset, bolum = self.adres_ofset(s["deger"])
                sonuc.append({"ad": s["ad"], "adres": s["deger"], "boyut": s["boyut"], "bag": s["bag"],
                              "bolum": bolum or s["bolum"], "dosya_ofseti": ofset})
        return sorted(sonuc, key=lambda f: f["adres"])

    def dizgiler(self, en_az=4, bolum=None, azami=200):
        """Yazdırılabilir ASCII dizileri (strings(1) gibi) ve dosya ofsetleri."""
        if bolum:
            b = self.bolum(bolum)
            if b is None or b["tur_kodu"] == SHT_NOBITS:
                raise ElfHatasi(f"dosyada yer kaplayan '{bolum}' bölümü yok")
            bas, son = b["ofset"], b["ofset"] + b["boyut"]
        else:
            bas, son = 0, len(self.veri)
        sonuc, i = [], bas
        while i < son and len(sonuc) < azami:
            j = i
            while j < son and 0x20 <= self.veri[j] < 0x7F:
                j += 1
            if j - i >= en_az:
                sonuc.append({"ofset": i, "metin": self.veri[i:j].decode("ascii")})
            i = j + 1
        return sonuc

    def dinamik(self):
        b = next((x for x in self.bolumler if x["tur_kodu"] == SHT_DYNAMIC), None)
        if b is None:
            return []
        boy = 8 if self.bit == 32 else 16
        dizgiler = self.bolumler[b["baglanti"]]["ofset"]
        girdiler = []
        for j in range(b["boyut"] // boy):
            etiket, deger = self._oku("iI" if self.bit == 32 else "qQ", b["ofset"] + j * boy)
            if etiket == 0:
                break
            girdiler.append((etiket, self._dizgi(dizgiler + deger) if etiket == DT_NEEDED else deger))
        return girdiler

    def sertlestirme(self):
        """checksec'in baktığı başlıca işaretler — yalnız başlıklardan, çalıştırmadan."""
        bolut = {b["tur"]: b for b in self.bolutler}
        dyn = self.dinamik()
        bayrak = sum(d for e, d in dyn if e == DT_FLAGS)
        bayrak1 = sum(d for e, d in dyn if e == DT_FLAGS_1)
        hemen = any(e == DT_BIND_NOW for e, _ in dyn) or bayrak & DF_BIND_NOW or bayrak1 & DF_1_NOW
        # .symtab'da tanımsız semboller sürümlü yazılır: "__stack_chk_fail@GLIBC_2.4"
        adlar = {s["ad"].split("@")[0] for s in self.semboller()}
        if self.tur == 2:
            pie = "hayır (ET_EXEC: sabit adres)"
        elif self.tur == 3:
            pie = "evet" if ("INTERP" in bolut or bayrak1 & DF_1_PIE) else "paylaşımlı kitaplık (DSO)"
        else:
            pie = "uygulanamaz"
        return {
            "pie": pie,
            "nx": ("evet" if "X" not in bolut["GNU_STACK"]["izinler"] else "hayır (yığın çalıştırılabilir)")
            if "GNU_STACK" in bolut else "bilinmiyor (GNU_STACK yok)",
            "relro": ("tam" if hemen else "kısmi") if "GNU_RELRO" in bolut else "yok",
            "yigin_kanaryasi": "evet" if "__stack_chk_fail" in adlar else "hayır",
            "fortify": sorted(a for a in adlar if a.startswith("__") and a.endswith("_chk") and a != "__stack_chk_fail"),
            "soyulmus": self.bolum(".symtab") is None,
            "gereken_kitapliklar": [d for e, d in dyn if e == DT_NEEDED],
        }

    def ozet(self):
        return {
            "sinif": f"ELF{self.bit}", "bayt_sirasi": "little" if self.bs == "<" else "big",
            "tur": TURLER.get(self.tur, hex(self.tur)), "makine": MAKINELER.get(self.makine, str(self.makine)),
            "giris_noktasi": self.giris, "bolum_sayisi": len(self.bolumler), "bolut_sayisi": len(self.bolutler),
        }


def onaltilik(veri, baslangic=0):
    """'00001000  48 89 e5 ...  |H..|' biçiminde satırlar."""
    satirlar = []
    for i in range(0, len(veri), 16):
        parca = veri[i : i + 16]
        hex_kisim = " ".join(f"{b:02x}" for b in parca)
        ascii_kisim = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in parca)
        satirlar.append(f"{baslangic + i:08x}  {hex_kisim:<47}  |{ascii_kisim}|")
    return satirlar


def ozet_kimlik(veri, yol):
    """Kanıt öznesi: hangi dosya, hangi içerik (rea'daki Evidence subject fikri)."""
    return {"yol": yol, "sha256": hashlib.sha256(veri).hexdigest(), "boyut": len(veri)}
