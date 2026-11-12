"""Ücretsiz alt alan adı hizmeti için kayıt kuruluşu (registry) modeli.

Roller: kayıt kuruluşu (registry) bir son eki (ör. ucretsiz.test) işletir ve
üst bölgeyi yayımlar; kayıt şirketi (registrar) müşteri adına işlem yapar —
burada ikisi tek sınıfta; tescil eden (registrant) hesap sahibidir.

İşlemler EPP (RFC 5730/5731) adlarıyla anılır ve EPP sonuç kodları döner:
  1000 tamam · 1001 beklemede · 2003 eksik parametre · 2004 değer aralığı
  2005 sözdizimi · 2201 yetki · 2302 nesne var · 2303 nesne yok
  2304 durum engelliyor · 2306 politika · 2308 veri yönetimi politikası

Kötüye kullanıma karşı katmanlar: ayrılmış adlar, kimlik avı sözcük denetimi
(homoglif normalleme ile) → insan incelemesi, hesap başına alan adı sınırı,
saatlik deneme sınırı, NS doğrulama, şikâyet → askıya alma (delegasyon
bölgeden çıkar), süre dolumu ve ödemesiz dönem.
"""

import ipaddress
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

AYRILMIS = {
    "www", "mail", "ns", "ns1", "ns2", "dns", "whois", "rdap", "api", "admin", "root",
    "abuse", "destek", "guvenlik", "postmaster", "hostmaster", "webmaster", "localhost",
}
SUPHELI_SOZCUKLER = ("paypal", "apple", "microsoft", "google", "banka", "bank", "edevlet", "giris", "login",
                     "dogrula", "verify", "sifre", "wallet", "cuzdan")
_HOMOGLIF = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})
_ETIKET = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_OZEL_AGLAR = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")]

KAYIT_SURESI = timedelta(days=365)
YENILEME_PENCERESI = timedelta(days=60)  # bitişe 60 gün kala yenilenebilir
ODEMESIZ_DONEM = timedelta(days=30)  # süre dolduktan sonra sahibine ayrılan süre


@dataclass
class Sonuc:
    kod: int
    mesaj: str

    @property
    def basarili(self):
        return self.kod < 2000


@dataclass
class AlanAdi:
    ad: str
    hesap: str
    ad_sunuculari: list
    yapistiricilar: dict  # NS adı → IP; NS bu alan adının içindeyse zorunlu
    durum: str  # aktif | incelemede | askida | suresi_doldu
    kayit_tarihi: datetime
    bitis_tarihi: datetime
    degisiklik_tarihi: datetime
    iletisim: dict = field(default_factory=dict)


def _utc_simdi():
    return datetime.now(timezone.utc)


def etiket_denetle(etiket):
    """LDH kuralı (harf-rakam-tire, RFC 1123/5891). Sorun varsa Sonuc döndürür."""
    if not etiket or len(etiket) > 63:
        return Sonuc(2004, "etiket 1-63 karakter olmalı")
    if not _ETIKET.match(etiket):
        return Sonuc(2005, "yalnız küçük harf, rakam ve tire; tire ile başlayamaz/bitemez")
    if etiket[2:4] == "--":
        return Sonuc(2005, "3-4. karakterde '--' IDN (xn--) için ayrılmıştır; IDN desteklenmiyor")
    return None


def _adres_kaydi(ad, ip):
    """Yapıştırıcı (glue) satırı: IPv4 adresi A, IPv6 adresi AAAA kaydıdır."""
    tur = "AAAA" if ipaddress.ip_address(ip).version == 6 else "A"
    return f"{ad}. IN {tur} {ip}"


def kimlik_avi_supheli(etiket):
    """Homoglifleri normalleyip ('paypa1' → 'paypal') şüpheli sözcük arar."""
    normal = etiket.translate(_HOMOGLIF).replace("-", "").replace("rn", "m")
    return next((s for s in SUPHELI_SOZCUKLER if s in normal), None)


class Sicil:
    def __init__(self, son_ek, kendi_ns, saat=_utc_simdi, hesap_siniri=1, saatlik_deneme=5):
        self.son_ek = son_ek.rstrip(".").lower()
        self.kendi_ns = kendi_ns  # {"ns1.ucretsiz.test": "192.0.2.53", ...}
        self.saat = saat
        self.hesap_siniri = hesap_siniri
        self.saatlik_deneme = saatlik_deneme
        self.alanlar = {}
        self.denemeler = {}  # hesap → deneme zamanları
        self.biletler = []  # kötüye kullanım şikâyetleri
        self.gunluk = []  # denetim izi
        self._seri = None

    # ---------------------------------------------------------- yardımcılar

    def _iz(self, hesap, islem, ad, sonuc):
        self.gunluk.append((self.saat().isoformat(), hesap, islem, ad, sonuc.kod))
        return sonuc

    def _sahip_dogrula(self, hesap, ad):
        a = self.alanlar.get(ad)
        if a is None:
            return None, Sonuc(2303, f"{ad} kayıtlı değil")
        if a.hesap != hesap:
            return None, Sonuc(2201, "bu alan adı başka bir hesaba ait")
        return a, None

    def _ns_denetle(self, ad, ad_sunuculari, yapistiricilar):
        ad_sunuculari = [n.rstrip(".").lower() for n in ad_sunuculari]
        if not 2 <= len(set(ad_sunuculari)) <= 4:
            return None, Sonuc(2004, "2-4 farklı ad sunucusu gerekir (tek NS tek hata noktasıdır)")
        for ns in ad_sunuculari:
            try:
                ipaddress.ip_address(ns)
                return None, Sonuc(2005, f"{ns}: NS alanına IP değil ad sunucusu ADI yazılır")
            except ValueError:
                pass
            if "." not in ns or any(etiket_denetle(e) for e in ns.split(".")):
                return None, Sonuc(2005, f"{ns}: geçersiz ad sunucusu adı")
        temiz = {}
        for ns in ad_sunuculari:
            icinde = ns == ad or ns.endswith("." + ad)
            if icinde and ns not in yapistiricilar:
                return None, Sonuc(2003, f"{ns} alan adının içinde: yapıştırıcı (glue) IP gerekli")
            if icinde:
                try:
                    ip = ipaddress.ip_address(yapistiricilar[ns])
                except ValueError:
                    return None, Sonuc(2005, f"{ns}: yapıştırıcı IP geçersiz")
                if ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local or any(
                    ip in ag for ag in _OZEL_AGLAR
                ):
                    return None, Sonuc(2306, f"{ns}: yapıştırıcı IP herkese açık olmalı ({ip})")
                temiz[ns] = str(ip)
        return (ad_sunuculari, temiz), None

    def _deneme_izni(self, hesap):
        simdi = self.saat()
        son_saat = [t for t in self.denemeler.get(hesap, []) if simdi - t < timedelta(hours=1)]
        son_saat.append(simdi)
        self.denemeler[hesap] = son_saat
        return len(son_saat) <= self.saatlik_deneme

    # ---------------------------------------------------------- EPP işlemleri

    def kaydet(self, hesap, etiket, ad_sunuculari, yapistiricilar=None, iletisim=None):
        """domain:create"""
        etiket = etiket.lower()
        ad = f"{etiket}.{self.son_ek}"
        if not self._deneme_izni(hesap):
            return self._iz(hesap, "create", ad, Sonuc(2308, "saatlik deneme sınırı aşıldı; sonra tekrar deneyin"))
        hata = etiket_denetle(etiket)
        if hata:
            return self._iz(hesap, "create", ad, hata)
        if etiket in AYRILMIS:
            return self._iz(hesap, "create", ad, Sonuc(2306, f"'{etiket}' ayrılmış bir addır"))
        if ad in self.alanlar:
            return self._iz(hesap, "create", ad, Sonuc(2302, f"{ad} zaten kayıtlı"))
        aktifler = [a for a in self.alanlar.values() if a.hesap == hesap and a.durum != "suresi_doldu"]
        if len(aktifler) >= self.hesap_siniri:
            return self._iz(hesap, "create", ad, Sonuc(2308, f"hesap başına en fazla {self.hesap_siniri} alan adı"))
        ns, hata = self._ns_denetle(ad, ad_sunuculari, yapistiricilar or {})
        if hata:
            return self._iz(hesap, "create", ad, hata)
        simdi = self.saat()
        supheli = kimlik_avi_supheli(etiket)
        self.alanlar[ad] = AlanAdi(
            ad, hesap, ns[0], ns[1], "incelemede" if supheli else "aktif", simdi, simdi + KAYIT_SURESI, simdi,
            dict(iletisim or {}),
        )
        if supheli:
            return self._iz(hesap, "create", ad, Sonuc(1001, f"'{supheli}' içeriyor: insan incelemesine alındı"))
        return self._iz(hesap, "create", ad, Sonuc(1000, f"{ad} kaydedildi"))

    def ns_guncelle(self, hesap, ad, ad_sunuculari, yapistiricilar=None):
        """domain:update (yalnız ad sunucuları)"""
        a, hata = self._sahip_dogrula(hesap, ad)
        if hata:
            return self._iz(hesap, "update", ad, hata)
        if a.durum == "askida":
            return self._iz(hesap, "update", ad, Sonuc(2304, "askıdaki alan adı güncellenemez"))
        ns, hata = self._ns_denetle(ad, ad_sunuculari, yapistiricilar or {})
        if hata:
            return self._iz(hesap, "update", ad, hata)
        a.ad_sunuculari, a.yapistiricilar, a.degisiklik_tarihi = ns[0], ns[1], self.saat()
        return self._iz(hesap, "update", ad, Sonuc(1000, "ad sunucuları güncellendi"))

    def yenile(self, hesap, ad):
        """domain:renew — bitişe 60 gün kala ya da ödemesiz dönemde."""
        a, hata = self._sahip_dogrula(hesap, ad)
        if hata:
            return self._iz(hesap, "renew", ad, hata)
        if a.durum == "askida":
            return self._iz(hesap, "renew", ad, Sonuc(2304, "askıdaki alan adı yenilenemez"))
        if self.saat() < a.bitis_tarihi - YENILEME_PENCERESI:
            return self._iz(hesap, "renew", ad, Sonuc(2306, "yenileme penceresi henüz açılmadı"))
        a.bitis_tarihi = max(a.bitis_tarihi, self.saat()) + KAYIT_SURESI
        if a.durum == "suresi_doldu":
            a.durum = "aktif"
        a.degisiklik_tarihi = self.saat()
        return self._iz(hesap, "renew", ad, Sonuc(1000, f"yeni bitiş: {a.bitis_tarihi.date()}"))

    def sil(self, hesap, ad):
        """domain:delete"""
        a, hata = self._sahip_dogrula(hesap, ad)
        if hata:
            return self._iz(hesap, "delete", ad, hata)
        if a.durum == "askida":
            return self._iz(hesap, "delete", ad, Sonuc(2304, "askıdaki alan adı silinemez (kanıt korunur)"))
        del self.alanlar[ad]
        return self._iz(hesap, "delete", ad, Sonuc(1000, f"{ad} silindi"))

    # ---------------------------------------------------------- kötüye kullanım

    def sikayet_et(self, ad, kategori, kanit):
        """Şikâyet bileti açar; karar insan incelemesindedir."""
        bilet = {"no": len(self.biletler) + 1, "ad": ad, "kategori": kategori, "kanit": kanit,
                 "zaman": self.saat().isoformat(), "durum": "acik"}
        self.biletler.append(bilet)
        return bilet

    def askiya_al(self, ad, gerekce, bilet_no=None):
        a = self.alanlar.get(ad)
        if a is None:
            return Sonuc(2303, f"{ad} kayıtlı değil")
        a.durum, a.degisiklik_tarihi = "askida", self.saat()
        for b in self.biletler:
            if b["no"] == bilet_no:
                b["durum"] = "kapandi: askiya alindi"
        return self._iz("sicil", "suspend", ad, Sonuc(1000, f"askıya alındı: {gerekce}"))

    def incelemeyi_onayla(self, ad):
        a = self.alanlar.get(ad)
        if a is None or a.durum != "incelemede":
            return Sonuc(2304, "incelemede bekleyen böyle bir alan adı yok")
        a.durum = "aktif"
        return self._iz("sicil", "approve", ad, Sonuc(1000, "onaylandı"))

    def sure_islerini_yurut(self):
        """Zamanlanmış iş: süresi dolanları pasifleştir, ödemesiz dönemi bitenleri serbest bırak."""
        simdi, serbest = self.saat(), []
        for ad, a in list(self.alanlar.items()):
            if a.durum == "aktif" and simdi >= a.bitis_tarihi:
                a.durum = "suresi_doldu"
                self._iz("sicil", "expire", ad, Sonuc(1000, "süresi doldu"))
            if a.durum == "suresi_doldu" and simdi >= a.bitis_tarihi + ODEMESIZ_DONEM:
                del self.alanlar[ad]
                serbest.append(ad)
                self._iz("sicil", "release", ad, Sonuc(1000, "serbest bırakıldı"))
        return serbest

    # ---------------------------------------------------------- yayımlama

    def seri_numarasi(self):
        """YYYYAAGGnn: aynı gün her yayımda nn artar (ikincil sunucular değişikliği böyle anlar)."""
        bugun = int(self.saat().strftime("%Y%m%d")) * 100
        self._seri = bugun if self._seri is None or self._seri < bugun else self._seri + 1
        return self._seri

    def bolge_metni(self, ttl=3600):
        """Yalnız AKTİF alan adlarının delegasyonlarını içeren üst bölge."""
        nsler = sorted(self.kendi_ns)
        satirlar = [
            f"$ORIGIN {self.son_ek}.",
            f"$TTL {ttl}",
            f"@ IN SOA {nsler[0]}. hostmaster.{self.son_ek}. ( {self.seri_numarasi()} 7200 900 1209600 300 )",
        ]
        satirlar += [f"@ IN NS {ns}." for ns in nsler]
        satirlar += [_adres_kaydi(ns, ip) for ns, ip in sorted(self.kendi_ns.items())]
        for ad, a in sorted(self.alanlar.items()):
            if a.durum != "aktif":
                continue  # incelemede/askıda/süresi dolmuş: delegasyon yok → NXDOMAIN
            satirlar.append(f"; {ad} (bitiş {a.bitis_tarihi.date()})")
            satirlar += [f"{ad}. IN NS {ns}." for ns in a.ad_sunuculari]
            satirlar += [_adres_kaydi(ns, ip) for ns, ip in sorted(a.yapistiricilar.items())]
        return "\n".join(satirlar) + "\n"

    def rdap(self, ad):
        """RDAP (RFC 9083) biçimine benzeyen sorgu sonucu; kişisel veriler gizlenir."""
        a = self.alanlar.get(ad)
        if a is None:
            return {"errorCode": 404, "title": "Bulunamadı"}
        durumlar = {"aktif": ["active"], "incelemede": ["pending create"], "askida": ["server hold"],
                    "suresi_doldu": ["inactive", "redemption period"]}
        return {
            "rdapConformance": ["rdap_level_0"],
            "objectClassName": "domain",
            "ldhName": a.ad,
            "status": durumlar[a.durum],
            "events": [
                {"eventAction": "registration", "eventDate": a.kayit_tarihi.isoformat()},
                {"eventAction": "expiration", "eventDate": a.bitis_tarihi.isoformat()},
                {"eventAction": "last changed", "eventDate": a.degisiklik_tarihi.isoformat()},
            ],
            "nameservers": [{"objectClassName": "nameserver", "ldhName": ns} for ns in a.ad_sunuculari],
            "entities": [{
                "objectClassName": "entity",
                "roles": ["registrant"],
                "vcardArray": ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "REDACTED FOR PRIVACY"]]],
            }],
            "remarks": [{"title": "Gizlilik", "description": ["Kişisel veriler KVKK/GDPR gereği gösterilmez."]}],
        }
