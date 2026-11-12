"""Araç kataloğu: her araç = ad + açıklama + JSON Schema + işleyici.

Güvenlik sınırları (rea'nın "yalnız yerel, kanıtlı, güvenilmeyen içerik
işaretli" ilkelerinin küçük hâli):
  * Kök izin listesi: yalnız --kok ile verilen dizinlerin altındaki dosyalar
    okunur. realpath ile '..' ve sembolik bağ kaçışları engellenir.
  * Salt okuma ve boyut sınırı: dosya açılır, okunur; asla çalıştırılmaz.
  * Kanıt: her sonuç dosyanın sha256'sını ve ilgili ofsetleri taşır.
  * Güvenilmeyen içerik: hedeften gelen metin (dizgiler, sembol adları) ajana
    talimat değil VERİDİR; sonuçlar _meta.provenance.untrusted_content ile işaretlenir.
"""

import os

from . import elf

AZAMI_DOSYA = 64 * 1024 * 1024
AZAMI_DOKUM = 4096


class AracHatasi(Exception):
    """Araç yürütme hatası: MCP'de isError=true olan sonuç olarak döner."""


class Arac:
    def __init__(self, ad, aciklama, ozellikler, gerekli, isleyici, hedef_icerigi=True):
        self.ad, self.aciklama, self.isleyici, self.hedef_icerigi = ad, aciklama, isleyici, hedef_icerigi
        self.sema = {"type": "object", "properties": ozellikler, "required": gerekli, "additionalProperties": False}

    def tanim(self):
        return {"name": self.ad, "description": self.aciklama, "inputSchema": self.sema,
                "annotations": {"readOnlyHint": True, "openWorldHint": False}}


def sema_dogrula(sema, argumanlar):
    """JSON Schema'nın küçük bir alt kümesi: required, additionalProperties, type, min/max."""
    if not isinstance(argumanlar, dict):
        return "argümanlar bir nesne olmalı"
    for ad in sema["required"]:
        if ad not in argumanlar:
            return f"eksik argüman: {ad}"
    for ad, deger in argumanlar.items():
        ozellik = sema["properties"].get(ad)
        if ozellik is None:
            return f"bilinmeyen argüman: {ad}"
        tur = ozellik["type"]
        if tur == "integer" and (isinstance(deger, bool) or not isinstance(deger, int)):
            return f"{ad} tam sayı olmalı"
        if tur == "string" and not isinstance(deger, str):
            return f"{ad} metin olmalı"
        if tur == "integer" and not ozellik.get("minimum", deger) <= deger <= ozellik.get("maximum", deger):
            return f"{ad} {ozellik.get('minimum')}..{ozellik.get('maximum')} aralığında olmalı"
    return None


class Katalog:
    def __init__(self, kokler):
        self.kokler = [os.path.realpath(k) for k in kokler]
        self.araclar = {a.ad: a for a in self._tanimla()}

    # ------------------------------------------------------------ güvenli dosya erişimi

    def _yukle(self, yol):
        gercek = os.path.realpath(yol)
        if not any(gercek == k or gercek.startswith(k + os.sep) for k in self.kokler):
            raise AracHatasi(f"izin verilen köklerin dışında: {yol}")
        if not os.path.isfile(gercek):
            raise AracHatasi(f"dosya yok: {yol}")
        if os.path.getsize(gercek) > AZAMI_DOSYA:
            raise AracHatasi("dosya boyut sınırını aşıyor")
        with open(gercek, "rb") as f:
            veri = f.read()
        try:
            return veri, elf.Elf(veri), elf.ozet_kimlik(veri, gercek)
        except (elf.ElfHatasi, IndexError, ValueError) as e:
            raise AracHatasi(f"ELF okunamadı: {e}") from None

    # ------------------------------------------------------------ işleyiciler

    def _baslik(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        return {"kanit": kimlik, "baslik": e.ozet()}

    def _bolumler(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        return {"kanit": kimlik, "bolumler": [{k: v for k, v in b.items() if k != "tur_kodu"} for b in e.bolumler]}

    def _bolutler(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        return {"kanit": kimlik, "bolutler": e.bolutler}

    def _semboller(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        semboller = [s for s in e.semboller() if a.get("ad_icerir", "") in s["ad"]]
        if "tur" in a:
            semboller = [s for s in semboller if s["tur"] == a["tur"].upper()]
        azami = a.get("azami", 200)
        return {"kanit": kimlik, "toplam": len(semboller), "semboller": semboller[:azami]}

    def _fonksiyonlar(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        f = e.fonksiyonlar()
        return {"kanit": kimlik, "toplam": len(f), "fonksiyonlar": f[: a.get("azami", 200)],
                "bilinmeyenler": [] if f else ["sembol tablosu yok ya da soyulmuş: fonksiyon sınırları bilinmiyor"]}

    def _dizgiler(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        try:
            d = e.dizgiler(a.get("en_az", 4), a.get("bolum"), a.get("azami", 200))
        except elf.ElfHatasi as h:
            raise AracHatasi(str(h)) from None
        return {"kanit": kimlik, "dizgiler": d}

    def _dokum(self, a):
        veri, _, kimlik = self._yukle(a["yol"])
        ofset, uzunluk = a["ofset"], a.get("uzunluk", 256)
        if ofset >= len(veri):
            raise AracHatasi(f"ofset dosya boyunu ({len(veri)}) aşıyor")
        return {"kanit": kimlik, "ofset": ofset, "satirlar": elf.onaltilik(veri[ofset : ofset + uzunluk], ofset)}

    def _fonksiyon_baytlari(self, a):
        veri, e, kimlik = self._yukle(a["yol"])
        f = next((x for x in e.fonksiyonlar() if x["ad"] == a["ad"]), None)
        if f is None:
            raise AracHatasi(f"fonksiyon bulunamadı: {a['ad']} (önce fonksiyonlari_listele)")
        if f["dosya_ofseti"] is None:
            raise AracHatasi("fonksiyonun dosya ofseti hesaplanamadı")
        uzunluk = min(f["boyut"] or 64, AZAMI_DOKUM)
        ham = veri[f["dosya_ofseti"] : f["dosya_ofseti"] + uzunluk]
        return {"kanit": kimlik, "fonksiyon": f, "satirlar": elf.onaltilik(ham, f["dosya_ofseti"]),
                "not": "Ayrık kodlama (disassembly) için: objdump -d --start-address=ADRES ikili"}

    def _sertlestirme(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        return {"kanit": kimlik, "sertlestirme": e.sertlestirme()}

    def _adres_ofset(self, a):
        _, e, kimlik = self._yukle(a["yol"])
        ofset, bolum = e.adres_ofset(a["adres"])
        if ofset is None:
            raise AracHatasi(f"{a['adres']:#x} dosyada yer kaplayan hiçbir bölümde değil")
        return {"kanit": kimlik, "adres": a["adres"], "dosya_ofseti": ofset, "bolum": bolum}

    # ------------------------------------------------------------ katalog

    def _tanimla(self):
        yol = {"type": "string", "description": "İzin verilen kök altındaki ELF dosyasının yolu"}
        azami = {"type": "integer", "minimum": 1, "maximum": 2000, "description": "En fazla kaç öğe"}
        return [
            Arac("elf_basligi", "ELF başlığını özetler: sınıf, bayt sırası, tür, makine, giriş noktası.",
                 {"yol": yol}, ["yol"], self._baslik),
            Arac("bolumleri_listele", "Bölüm (section) tablosu: ad, tür, adres, dosya ofseti, boyut.",
                 {"yol": yol}, ["yol"], self._bolumler),
            Arac("bolutleri_listele", "Program başlıkları (segment): yükleyicinin göreceği düzen ve izinler.",
                 {"yol": yol}, ["yol"], self._bolutler),
            Arac("sembolleri_listele", "Sembol tablosu (.symtab, yoksa .dynsym); ad ve türe göre süzülebilir.",
                 {"yol": yol, "ad_icerir": {"type": "string"}, "tur": {"type": "string"}, "azami": azami},
                 ["yol"], self._semboller),
            Arac("fonksiyonlari_listele", "FUNC sembollerini adres sırasıyla, dosya ofsetleriyle listeler.",
                 {"yol": yol, "azami": azami}, ["yol"], self._fonksiyonlar),
            Arac("dizgileri_cikar", "Yazdırılabilir ASCII dizgileri ofsetleriyle çıkarır (strings gibi).",
                 {"yol": yol, "en_az": {"type": "integer", "minimum": 2, "maximum": 64},
                  "bolum": {"type": "string"}, "azami": azami}, ["yol"], self._dizgiler),
            Arac("onaltilik_dok", "Verilen dosya ofsetinden onaltılık + ASCII döküm.",
                 {"yol": yol, "ofset": {"type": "integer", "minimum": 0, "maximum": AZAMI_DOSYA},
                  "uzunluk": {"type": "integer", "minimum": 1, "maximum": AZAMI_DOKUM}}, ["yol", "ofset"],
                 self._dokum),
            Arac("fonksiyon_baytlari", "Adı verilen fonksiyonun makine kodu baytlarını döker.",
                 {"yol": yol, "ad": {"type": "string"}}, ["yol", "ad"], self._fonksiyon_baytlari),
            Arac("sertlestirme_denetle", "PIE, NX, RELRO, yığın kanaryası, FORTIFY izleri, gereken kitaplıklar.",
                 {"yol": yol}, ["yol"], self._sertlestirme),
            Arac("adresten_ofsete", "Sanal adresi dosya ofsetine ve bölüm adına çevirir.",
                 {"yol": yol, "adres": {"type": "integer", "minimum": 0, "maximum": 2**64 - 1}},
                 ["yol", "adres"], self._adres_ofset),
        ]
