"""DNS tel biçimi (RFC 1035 §4): mesajı baytlara çevirme ve baytlardan çözme.

Bir DNS mesajı = 12 baytlık başlık + soru bölümü + üç kayıt bölümü
(cevap, yetki, ek). Adlar "etiket uzunluğu + etiket" dizileri olarak yazılır
ve tekrar eden son ekler 2 baytlık işaretçilerle sıkıştırılır (§4.1.4).
"""

import ipaddress
import struct
from dataclasses import dataclass, field

TURLER = {"A": 1, "NS": 2, "CNAME": 5, "SOA": 6, "MX": 15, "TXT": 16, "AAAA": 28, "DS": 43, "ANY": 255}
TUR_ADI = {kod: ad for ad, kod in TURLER.items()}
A, NS, CNAME, SOA, MX, TXT, AAAA, DS, ANY = (TURLER[t] for t in ("A", "NS", "CNAME", "SOA", "MX", "TXT", "AAAA", "DS", "ANY"))
SINIF_IN = 1

NOERROR, FORMERR, SERVFAIL, NXDOMAIN, NOTIMP, REFUSED = range(6)
RCODE_ADI = {0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED"}


class BicimHatasi(ValueError):
    """Çözülemeyen ya da kurallara aykırı mesaj; sunucu bunu FORMERR'e çevirir."""


def normalle(ad):
    """'Www.Ornek.TEST.' → 'www.ornek.test'. DNS adları büyük/küçük harf duyarsızdır."""
    return ad.rstrip(".").lower()


@dataclass
class Soru:
    ad: str
    tur: int
    sinif: int = SINIF_IN


@dataclass
class Soa:
    birincil: str  # MNAME: birincil ad sunucusu
    sorumlu: str  # RNAME: e-posta, '@' yerine '.'
    seri: int
    yenile: int
    tekrar: int
    sona_erme: int
    asgari: int  # olumsuz yanıtların önbellek süresi (RFC 2308)


@dataclass
class Kayit:
    """Kaynak kaydı (RR). veri, türe göre: A/AAAA/NS/CNAME → str,
    MX → (tercih, ad), TXT → tuple[str, ...], SOA → Soa, bilinmeyen → bytes."""

    ad: str
    tur: int
    ttl: int
    veri: object
    sinif: int = SINIF_IN


@dataclass
class Mesaj:
    kimlik: int = 0
    qr: bool = False  # 0 = sorgu, 1 = yanıt
    opcode: int = 0  # 0 = standart sorgu
    aa: bool = False  # yetkili yanıt
    tc: bool = False  # kesildi (truncated): TCP ile yeniden dene
    rd: bool = False  # özyineleme istendi
    ra: bool = False  # özyineleme sunuluyor
    rcode: int = NOERROR
    sorular: list = field(default_factory=list)
    cevaplar: list = field(default_factory=list)
    yetkililer: list = field(default_factory=list)
    ekler: list = field(default_factory=list)


# ---------------------------------------------------------------- kodlama


class _Yazici:
    def __init__(self):
        self.tampon = bytearray()
        self.sozluk = {}  # sıkıştırma tablosu: ad soneki (küçük harf) → ofset

    def ad(self, ad):
        etiketler = [e for e in ad.rstrip(".").split(".") if e]
        if sum(len(e) + 1 for e in etiketler) + 1 > 255:
            raise BicimHatasi(f"ad 255 baytı aşıyor: {ad}")
        for i in range(len(etiketler)):
            sonek = ".".join(etiketler[i:]).lower()
            if sonek in self.sozluk:  # bu son ek daha önce yazıldı: işaretçi yeter
                self.tampon += struct.pack("!H", 0xC000 | self.sozluk[sonek])
                return
            if len(self.tampon) < 0x4000:  # işaretçi 14 bit: ilk 16 KiB'a işaret edebilir
                self.sozluk[sonek] = len(self.tampon)
            try:
                bayt = etiketler[i].encode("ascii")
            except UnicodeEncodeError:
                raise BicimHatasi(f"ASCII olmayan etiket (önce punycode'a çevir): {etiketler[i]}") from None
            if len(bayt) > 63:
                raise BicimHatasi(f"etiket 63 baytı aşıyor: {etiketler[i]}")
            self.tampon += bytes([len(bayt)]) + bayt
        self.tampon += b"\0"

    def kayit(self, k):
        self.ad(k.ad)
        self.tampon += struct.pack("!HHI", k.tur, k.sinif, k.ttl)
        uzunluk_yeri = len(self.tampon)
        self.tampon += b"\0\0"
        bas = len(self.tampon)
        if k.tur == A:
            self.tampon += ipaddress.IPv4Address(k.veri).packed
        elif k.tur == AAAA:
            self.tampon += ipaddress.IPv6Address(k.veri).packed
        elif k.tur in (NS, CNAME):
            self.ad(k.veri)
        elif k.tur == MX:
            tercih, hedef = k.veri
            self.tampon += struct.pack("!H", tercih)
            self.ad(hedef)
        elif k.tur == TXT:
            for parca in k.veri:  # her parça bir <character-string>: uzunluk + ≤255 bayt
                bayt = parca.encode("utf-8")
                if len(bayt) > 255:
                    raise BicimHatasi("TXT parçası 255 baytı aşıyor; birden çok parçaya böl")
                self.tampon += bytes([len(bayt)]) + bayt
        elif k.tur == SOA:
            s = k.veri
            self.ad(s.birincil)
            self.ad(s.sorumlu)
            self.tampon += struct.pack("!IIIII", s.seri, s.yenile, s.tekrar, s.sona_erme, s.asgari)
        else:
            self.tampon += bytes(k.veri)
        struct.pack_into("!H", self.tampon, uzunluk_yeri, len(self.tampon) - bas)


def kodla(m):
    """Mesaj → bayt dizisi."""
    y = _Yazici()
    bayrak = (
        (m.qr << 15) | (m.opcode << 11) | (m.aa << 10) | (m.tc << 9) | (m.rd << 8) | (m.ra << 7) | (m.rcode & 0xF)
    )
    y.tampon += struct.pack(
        "!6H", m.kimlik, bayrak, len(m.sorular), len(m.cevaplar), len(m.yetkililer), len(m.ekler)
    )
    for s in m.sorular:
        y.ad(s.ad)
        y.tampon += struct.pack("!HH", s.tur, s.sinif)
    for k in m.cevaplar + m.yetkililer + m.ekler:
        y.kayit(k)
    return bytes(y.tampon)


# ---------------------------------------------------------------- çözme


def ad_oku(veri, ofset):
    """(ad, sonraki_ofset) döndürür.

    Döngü koruması: her işaretçi, o an okunan etiket dizisinin BAŞLADIĞI
    yerden kesinlikle daha geriye işaret etmelidir. "sinir" her atlamada
    küçüldüğü için kötü niyetli bir mesaj sonsuz döngü kuramaz. (Yalnız
    "işaretçi kendi konumundan geride olsun" demek yetmez: etiketler aynı
    işaretçiye geri dönüp döngü kurabilir; testi var.)"""
    etiketler = []
    donus = None
    sinir = ofset
    toplam = 1
    while True:
        if ofset >= len(veri):
            raise BicimHatasi("ad mesajın sonunu aşıyor")
        n = veri[ofset]
        if n & 0xC0 == 0xC0:
            if ofset + 1 >= len(veri):
                raise BicimHatasi("yarım işaretçi")
            hedef = ((n & 0x3F) << 8) | veri[ofset + 1]
            if hedef >= sinir:
                raise BicimHatasi("işaretçi geriye işaret etmiyor (döngü girişimi)")
            if donus is None:
                donus = ofset + 2
            ofset = sinir = hedef
            continue
        if n & 0xC0:
            raise BicimHatasi("desteklenmeyen etiket türü")
        ofset += 1
        if n == 0:
            break
        etiket = veri[ofset : ofset + n]
        if len(etiket) < n:
            raise BicimHatasi("etiket mesajın sonunu aşıyor")
        toplam += n + 1
        if toplam > 255:
            raise BicimHatasi("ad 255 baytı aşıyor")
        try:
            etiketler.append(etiket.decode("ascii"))
        except UnicodeDecodeError:
            raise BicimHatasi("ASCII olmayan etiket") from None
        ofset += n
    return ".".join(etiketler), (donus if donus is not None else ofset)


def _kayit_oku(veri, ofset):
    ad, ofset = ad_oku(veri, ofset)
    if ofset + 10 > len(veri):
        raise BicimHatasi("kayıt başlığı eksik")
    tur, sinif, ttl, uzunluk = struct.unpack_from("!HHIH", veri, ofset)
    ofset += 10
    son = ofset + uzunluk
    if son > len(veri):
        raise BicimHatasi("RDATA mesajın sonunu aşıyor")
    ham = veri[ofset:son]
    if tur == A:
        if uzunluk != 4:
            raise BicimHatasi("A kaydı 4 bayt olmalı")
        deger = str(ipaddress.IPv4Address(ham))
    elif tur == AAAA:
        if uzunluk != 16:
            raise BicimHatasi("AAAA kaydı 16 bayt olmalı")
        deger = str(ipaddress.IPv6Address(ham))
    elif tur in (NS, CNAME):
        deger, _ = ad_oku(veri, ofset)
    elif tur == MX:
        if uzunluk < 3:
            raise BicimHatasi("MX kaydı çok kısa")
        hedef, _ = ad_oku(veri, ofset + 2)
        deger = (struct.unpack_from("!H", veri, ofset)[0], hedef)
    elif tur == TXT:
        parcalar, i = [], 0
        while i < len(ham):
            n = ham[i]
            if i + 1 + n > len(ham):
                raise BicimHatasi("TXT parçası taşıyor")
            parcalar.append(ham[i + 1 : i + 1 + n].decode("utf-8", "replace"))
            i += 1 + n
        deger = tuple(parcalar)
    elif tur == SOA:
        birincil, o = ad_oku(veri, ofset)
        sorumlu, o = ad_oku(veri, o)
        if o + 20 != son:
            raise BicimHatasi("SOA RDATA uzunluğu tutarsız")
        deger = Soa(birincil, sorumlu, *struct.unpack_from("!IIIII", veri, o))
    else:
        deger = bytes(ham)
    return Kayit(ad, tur, ttl, deger, sinif), son


def coz(veri):
    """Bayt dizisi → Mesaj. Bozuk girdide BicimHatasi fırlatır."""
    if len(veri) < 12:
        raise BicimHatasi("başlık 12 bayttan kısa")
    kimlik, bayrak, qd, an, ns, ar = struct.unpack_from("!6H", veri)
    m = Mesaj(
        kimlik=kimlik,
        qr=bool(bayrak >> 15 & 1),
        opcode=bayrak >> 11 & 0xF,
        aa=bool(bayrak >> 10 & 1),
        tc=bool(bayrak >> 9 & 1),
        rd=bool(bayrak >> 8 & 1),
        ra=bool(bayrak >> 7 & 1),
        rcode=bayrak & 0xF,
    )
    ofset = 12
    for _ in range(qd):
        ad, ofset = ad_oku(veri, ofset)
        if ofset + 4 > len(veri):
            raise BicimHatasi("soru eksik")
        tur, sinif = struct.unpack_from("!HH", veri, ofset)
        ofset += 4
        m.sorular.append(Soru(ad, tur, sinif))
    for liste, sayi in ((m.cevaplar, an), (m.yetkililer, ns), (m.ekler, ar)):
        for _ in range(sayi):
            k, ofset = _kayit_oku(veri, ofset)
            liste.append(k)
    return m


def kayit_metni(k):
    """dig benzeri tek satırlık sunum."""
    tur = TUR_ADI.get(k.tur, f"TYPE{k.tur}")
    if k.tur == MX:
        veri = f"{k.veri[0]} {k.veri[1]}."
    elif k.tur in (NS, CNAME):
        veri = k.veri + "."
    elif k.tur == TXT:
        veri = " ".join('"' + p.replace('"', '\\"') + '"' for p in k.veri)
    elif k.tur == SOA:
        s = k.veri
        veri = f"{s.birincil}. {s.sorumlu}. {s.seri} {s.yenile} {s.tekrar} {s.sona_erme} {s.asgari}"
    else:
        veri = str(k.veri)
    return f"{k.ad}.\t{k.ttl}\tIN\t{tur}\t{veri}"
