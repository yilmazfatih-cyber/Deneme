"""Bölge dosyası (zone file) ayrıştırıcı — RFC 1035 §5'in bir alt kümesi.

Desteklenen: $ORIGIN, $TTL, '@', göreli/mutlak adlar, boş sahip alanı (bir
önceki sahip), ';' yorumları, çok satırlı '( ... )', tırnaklı TXT, süre
birimleri (1h, 2d, 1w). Kayıt türleri: SOA, NS, A, AAAA, CNAME, MX, TXT.
Desteklenmeyen: $INCLUDE, $GENERATE, joker (*) kayıtlar, DNSSEC türleri.
"""

import ipaddress
import re

from . import tel

_SURE = re.compile(r"(\d+)([smhdw]?)", re.IGNORECASE)
_CARPAN = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}


class BolgeHatasi(ValueError):
    def __init__(self, satir, mesaj):
        super().__init__(f"satır {satir}: {mesaj}")
        self.satir = satir


def sure_coz(metin):
    """'3600' ya da '1h30m' → saniye. Geçersizse None."""
    if not re.fullmatch(r"(\d+[smhdw]?)+", metin, re.IGNORECASE):
        return None
    return sum(int(n) * _CARPAN[b.lower()] for n, b in _SURE.findall(metin))


class Bolge:
    """Bir bölgenin bellekteki hâli: ad → tür → kayıt listesi (RRset)."""

    def __init__(self, koken):
        self.koken = tel.normalle(koken)
        self.kayitlar = {}

    def ekle(self, k):
        self.kayitlar.setdefault(tel.normalle(k.ad), {}).setdefault(k.tur, []).append(k)

    def rrset(self, ad, tur):
        return list(self.kayitlar.get(ad, {}).get(tur, []))

    def kumeler(self, ad):
        return [k for liste in self.kayitlar.get(ad, {}).values() for k in liste]

    def icinde_mi(self, ad):
        return ad == self.koken or ad.endswith("." + self.koken)

    def ad_var_mi(self, ad):
        return bool(self.kayitlar.get(ad))

    def bos_ara_dugum_mu(self, ad):
        """'b.ornek.test' kaydı yok ama 'a.b.ornek.test' varsa ad VARDIR (RFC 8020):
        yanıt NXDOMAIN değil, veri yok (NODATA) olmalıdır."""
        return any(n.endswith("." + ad) for n in self.kayitlar)

    def kesim_bul(self, ad):
        """Kökten aşağı yürür; apex dışında NS taşıyan ilk ad delegasyon noktasıdır."""
        if not self.icinde_mi(ad) or ad == self.koken:
            return None
        ek = ad[: -len(self.koken) - 1].split(".")
        for i in range(len(ek) - 1, -1, -1):
            aday = ".".join(ek[i:]) + "." + self.koken
            if self.rrset(aday, tel.NS):
                return aday
        return None

    @property
    def soa(self):
        return self.rrset(self.koken, tel.SOA)[0]


def _mantiksal_satirlar(metin):
    """Yorumları atar, '( ... )' gruplarını tek satırda birleştirir.
    (satır_no, boşlukla_başlıyor_mu, jetonlar) üretir; jeton: (tırnaklı_mı, metin)."""
    jetonlar, bas_no, bosluk_basi, derinlik = [], None, False, 0
    for no, satir in enumerate(metin.splitlines(), 1):
        if derinlik == 0:
            bas_no, bosluk_basi, jetonlar = no, satir[:1] in (" ", "\t"), []
        i = 0
        while i < len(satir):
            c = satir[i]
            if c == ";":
                break
            if c in " \t":
                i += 1
            elif c == "(":
                derinlik += 1
                i += 1
            elif c == ")":
                derinlik -= 1
                if derinlik < 0:
                    raise BolgeHatasi(no, "fazladan ')'")
                i += 1
            elif c == '"':
                j, parca = i + 1, []
                while j < len(satir) and satir[j] != '"':
                    if satir[j] == "\\" and j + 1 < len(satir):
                        j += 1
                    parca.append(satir[j])
                    j += 1
                if j >= len(satir):
                    raise BolgeHatasi(no, "kapanmamış tırnak")
                jetonlar.append((True, "".join(parca)))
                i = j + 1
            else:
                j = i
                while j < len(satir) and satir[j] not in ' \t;()"':
                    j += 1
                jetonlar.append((False, satir[i:j]))
                i = j
        if derinlik == 0 and jetonlar:
            yield bas_no, bosluk_basi, jetonlar
    if derinlik:
        raise BolgeHatasi(bas_no, "kapanmamış '('")


def _ad(metin, koken):
    if metin == "@":
        return koken
    if metin.endswith("."):
        return tel.normalle(metin)
    return tel.normalle(metin + "." + koken) if koken else tel.normalle(metin)


def _rdata(tur, alanlar, koken, no):
    duz = [m for _, m in alanlar]
    try:
        if tur == tel.A:
            return str(ipaddress.IPv4Address(duz[0]))
        if tur == tel.AAAA:
            return str(ipaddress.IPv6Address(duz[0]))
        if tur in (tel.NS, tel.CNAME):
            return _ad(duz[0], koken)
        if tur == tel.MX:
            return (int(duz[0]), _ad(duz[1], koken))
        if tur == tel.TXT:
            if not duz:
                raise IndexError
            return tuple(duz)
        if tur == tel.SOA:
            sayilar = [sure_coz(x) for x in duz[2:]]
            if len(sayilar) != 5 or None in sayilar:
                raise ValueError("SOA beş sayı ister: seri yenile tekrar sona_erme asgari")
            return tel.Soa(_ad(duz[0], koken), _ad(duz[1], koken), *sayilar)
    except (IndexError, ValueError) as e:
        raise BolgeHatasi(no, f"{tel.TUR_ADI[tur]} verisi geçersiz: {' '.join(duz)} ({e})") from None
    raise BolgeHatasi(no, f"desteklenmeyen tür: {tur}")


def oku(metin, koken=None):
    """Bölge dosyası metnini ayrıştırıp doğrulanmış bir Bolge döndürür."""
    koken = tel.normalle(koken) if koken else None
    varsayilan_ttl, onceki_sahip, kayitlar = None, None, []
    for no, bosluk_basi, jetonlar in _mantiksal_satirlar(metin):
        ilk = jetonlar[0][1]
        if ilk.upper() == "$ORIGIN":
            koken = tel.normalle(jetonlar[1][1])
            continue
        if ilk.upper() == "$TTL":
            varsayilan_ttl = sure_coz(jetonlar[1][1])
            if varsayilan_ttl is None:
                raise BolgeHatasi(no, "$TTL geçersiz")
            continue
        if ilk.startswith("$"):
            raise BolgeHatasi(no, f"desteklenmeyen yönerge: {ilk}")
        if koken is None:
            raise BolgeHatasi(no, "köken bilinmiyor: $ORIGIN ekleyin")
        if bosluk_basi:
            if onceki_sahip is None:
                raise BolgeHatasi(no, "ilk kaydın sahibi boş olamaz")
            sahip, kalan = onceki_sahip, jetonlar
        else:
            sahip, kalan = _ad(ilk, koken), jetonlar[1:]
        ttl = None
        while kalan and not kalan[0][0]:  # TTL ve sınıf herhangi bir sırada gelebilir
            m = kalan[0][1]
            if m.upper() == "IN":
                kalan = kalan[1:]
            elif sure_coz(m) is not None and ttl is None:
                ttl, kalan = sure_coz(m), kalan[1:]
            else:
                break
        if not kalan or kalan[0][1].upper() not in tel.TURLER:
            raise BolgeHatasi(no, "kayıt türü eksik ya da bilinmiyor")
        tur = tel.TURLER[kalan[0][1].upper()]
        if ttl is None:
            ttl = varsayilan_ttl
        if ttl is None:
            raise BolgeHatasi(no, "TTL yok: $TTL yönergesi ekleyin")
        kayitlar.append((no, tel.Kayit(sahip, tur, ttl, _rdata(tur, kalan[1:], koken, no))))
        onceki_sahip = sahip
    return _dogrula(koken, kayitlar)


def _dogrula(koken, kayitlar):
    if koken is None:
        raise BolgeHatasi(0, "boş bölge")
    b = Bolge(koken)
    for no, k in kayitlar:
        if not b.icinde_mi(k.ad):
            raise BolgeHatasi(no, f"bölge dışı veri: {k.ad} ({koken} altında değil)")
        b.ekle(k)
    if len(b.rrset(b.koken, tel.SOA)) != 1:
        raise BolgeHatasi(0, "apex'te tam olarak bir SOA olmalı")
    if not b.rrset(b.koken, tel.NS):
        raise BolgeHatasi(0, "apex'te en az bir NS olmalı")
    for ad, turler in b.kayitlar.items():
        if tel.CNAME in turler and (len(turler) > 1 or len(turler[tel.CNAME]) > 1):
            raise BolgeHatasi(0, f"{ad}: CNAME başka veriyle bir arada olamaz (RFC 1034 §3.6.2)")
    return b
