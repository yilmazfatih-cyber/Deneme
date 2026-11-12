"""Sayfa getirme: adres denetimi, robots.txt, alan adı başına hız sınırı, Firecrawl ve yerleşik yedek getirici.

Firecrawl uç noktası firecrawl/firecrawl @ a0535ec'de doğrulandı: apps/api/src/routes/v2.ts (POST /v2/scrape),
apps/api/src/controllers/v2/types.ts (formats, onlyMainContent, maxAge, storeInCache, location; yanıt
{success, warning?, data: Document}), apps/python-sdk/firecrawl/v2/utils/http_client.py (Authorization: Bearer
<anahtar>). Bulut: https://api.firecrawl.dev; kendi sunucunuzda varsayılan port 3002 ve kimlik doğrulama kapalıdır
(SELF_HOST.md). Firecrawl tek sayfalık taramada robots.txt'e yalnızca ekip bayrağı ya da güvenli kip açıksa bakar
(apps/api/src/scraper/scrapeURL/shouldCheckRobots.ts) ve kendi adıyla (FireCrawlAgent/FirecrawlAgent,
apps/api/src/lib/robots-txt.ts) bakar. Bu yüzden radar, sayfayı Firecrawl'a sormadan önce robots.txt'i hem kendi
adıyla hem Firecrawl'ın adıyla kendisi denetler.

Güvenlik: hedef URL'ler müşteriden gelir. Yalnızca http/https kabul edilir; yerleşik getirici bağlantıyı açarken
adresi denetler (yerel, özel, bağlantı yerel ve çoklu yayın adresleri reddedilir), böylece yönlendirmeler ve DNS
yeniden bağlama da kapsanır. Yanıt boyutu ve toplam süre sınırlıdır. Ortamdaki HTTP(S)_PROXY hedef sitelere uygulanmaz.
"""

import http.client
import ipaddress
import json
import re
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

FIRECRAWL_AJANLARI = ("FireCrawlAgent", "FirecrawlAgent")
AZAMI_SAYFA_BAYT = 5 * 1024 * 1024
AZAMI_API_BAYT = 20 * 1024 * 1024
AZAMI_ROBOTS_BAYT = 512 * 1024  # RFC 9309: en az 500 KiB okunmalı; fazlası kesilir
AZAMI_YONLENDIRME = 5
GECICI_DURUMLAR = {429, 500, 502, 503, 504}
_META_KODLAMA = re.compile(rb"""<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)""", re.I)


class GetirmeHatasi(Exception):
    pass


class RobotsEngeli(GetirmeHatasi):
    pass


class GuvenlikEngeli(GetirmeHatasi):
    """İzin verilmeyen şema ya da yerel/özel ağ adresi (SSRF koruması)."""


class GeciciHata(GetirmeHatasi):
    """Zaman aşımı, bağlantı hatası, HTTP 429/5xx: yerleşik getirici bir kez daha dener."""


@dataclass
class Sayfa:
    url: str
    html: str
    markdown: str | None = None
    urun_profili: dict | None = None
    kaynak: str = "dogrudan"
    uyarilar: list[str] = field(default_factory=list)


def url_metni(url: str) -> str:
    """Hata iletileri için: adresteki kullanıcı adı/parola gizlenir, boy kısaltılır."""
    try:
        p = urlparse(url)
        if p.username or p.password:
            url = p._replace(netloc="***@" + p.netloc.rsplit("@", 1)[-1]).geturl()
    except ValueError:  # hata iletisi yazarken yeni hata çıkmasın
        pass
    return url if len(url) <= 200 else url[:197] + "..."


def url_denetle(url: str) -> str:
    """Yalnızca http/https ve ana makine adı olan adresler; file://, ftp:// ve kullanıcı:parola içeren adres reddedilir."""
    try:
        p = urlparse(url) if isinstance(url, str) else None
        gecerli = p is not None and p.scheme in ("http", "https") and bool(p.hostname)
    except ValueError:  # ör. kapanmamış IPv6 köşeli parantezi
        gecerli = False
    if not gecerli:
        raise GuvenlikEngeli(f"Yalnızca http/https adresleri taranır: {str(url)[:120]}")
    if p.username or p.password:
        raise GuvenlikEngeli("Adreste kullanıcı adı/parola olamaz")
    return url


def adres_guvenli_mi(ip: str) -> bool:
    adres = ipaddress.ip_address(ip.split("%", 1)[0])
    if isinstance(adres, ipaddress.IPv6Address) and adres.ipv4_mapped:
        adres = adres.ipv4_mapped
    return adres.is_global and not adres.is_multicast


def _cozumle_ve_denetle(ana_makine: str, port: int, cozumle) -> list:
    try:
        bilgiler = cozumle(ana_makine, port, type=socket.SOCK_STREAM)
    except OSError as hata:
        raise GeciciHata(f"{ana_makine}: ad çözülemedi ({hata})") from hata
    for *_, sockaddr in bilgiler:
        if not adres_guvenli_mi(sockaddr[0]):
            raise GuvenlikEngeli(f"{ana_makine} yerel ya da özel bir ağ adresine çözülüyor ({sockaddr[0]}); taranmaz")
    return bilgiler


def adres_denetle(url: str, cozumle=socket.getaddrinfo) -> None:
    """Firecrawl'a gönderilmeden önceki ön denetim (Firecrawl sayfayı kendi ağından ister)."""
    p = urlparse(url_denetle(url))
    _cozumle_ve_denetle(p.hostname, p.port or (443 if p.scheme == "https" else 80), cozumle)


def _acici(guvenli: bool, robots=None, cozumle=socket.getaddrinfo) -> urllib.request.OpenerDirector:
    """Hedef siteler için urllib açıcısı: yalnızca http/https, vekil sunucu yok, en çok 5 yönlendirme.

    guvenli=True iken bağlantı, çözülen adres denetlendikten sonra o adrese açılır (denetim ile bağlantı arasında
    adres değişemez). robots verilirse yönlendirilen adres de robots.txt'e göre denetlenir.
    """

    def baglan(adres, timeout=None, source_address=None, *_, **__):
        ana_makine, port = adres
        son_hata = None
        for aile, tur, proto, _, sockaddr in _cozumle_ve_denetle(ana_makine, port, cozumle):
            soket = socket.socket(aile, tur, proto)
            try:
                if isinstance(timeout, (int, float)):
                    soket.settimeout(timeout)
                soket.connect(sockaddr)
                return soket
            except OSError as hata:
                soket.close()
                son_hata = hata
        raise son_hata or OSError(f"{ana_makine}: bağlanılamadı")

    class HTTPBaglantisi(http.client.HTTPConnection):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            if guvenli:
                self._create_connection = baglan

    class HTTPSBaglantisi(http.client.HTTPSConnection):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            if guvenli:
                self._create_connection = baglan

    class HTTPIsleyici(urllib.request.HTTPHandler):
        def http_open(self, req):
            return self.do_open(HTTPBaglantisi, req)

    class HTTPSIsleyici(urllib.request.HTTPSHandler):
        def https_open(self, req):
            return self.do_open(HTTPSBaglantisi, req, context=self._context)

    class Yonlendirme(urllib.request.HTTPRedirectHandler):
        max_redirections = AZAMI_YONLENDIRME

        def redirect_request(self, req, fp, code, msg, headers, newurl):
            url_denetle(newurl)
            if robots is not None and not robots.izin_var_mi(newurl):
                raise RobotsEngeli(f"Yönlendirilen adres robots.txt'te yasak: {url_metni(newurl)}")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    acici = urllib.request.OpenerDirector()
    for isleyici in (
        urllib.request.UnknownHandler(),
        HTTPIsleyici(),
        HTTPSIsleyici(),
        urllib.request.HTTPDefaultErrorHandler(),
        Yonlendirme(),
        urllib.request.HTTPErrorProcessor(),
    ):
        acici.add_handler(isleyici)
    return acici


def _sinirli_oku(akis, azami_bayt: int, son_an: float, url: str, kes: bool = False) -> bytes:
    """En çok azami_bayt okur; kes=False iken fazlası hata. Yavaş damlatan sunucuya karşı toplam süre sınırı."""
    uzunluk = (akis.headers.get("Content-Length") or "") if akis.headers else ""
    if not kes and uzunluk.isdigit() and int(uzunluk) > azami_bayt:
        raise GetirmeHatasi(f"{url_metni(url)}: yanıt çok büyük ({int(uzunluk)} bayt)")
    oku = getattr(akis, "read1", akis.read)  # read1: tek alım; süre denetimi parçalar arasında işler
    parcalar, toplam = [], 0
    while toplam <= azami_bayt:
        if time.monotonic() > son_an:
            raise GeciciHata(f"{url_metni(url)}: toplam süre aşıldı")
        parca = oku(min(65536, azami_bayt + 1 - toplam))
        if not parca:
            break
        parcalar.append(parca)
        toplam += len(parca)
    veri = b"".join(parcalar)
    if len(veri) > azami_bayt:
        if not kes:
            raise GetirmeHatasi(f"{url_metni(url)}: yanıt {azami_bayt} baytı aşıyor")
        veri = veri[:azami_bayt]
    return veri


def http_istegi(url, ajan, zaman_asimi, veri=None, basliklar=None, acici=None, azami_bayt=AZAMI_SAYFA_BAYT, kes=False):
    """(durum, gövde, karakter kodlaması ya da None). acici verilmezse urllib'in varsayılanı (operatörün uç noktaları)."""
    istek = urllib.request.Request(url, data=veri, headers={"User-Agent": ajan, **(basliklar or {})})
    son_an = time.monotonic() + 3 * zaman_asimi
    ac = acici.open if acici is not None else urllib.request.urlopen
    try:
        with ac(istek, timeout=zaman_asimi) as yanit:
            return yanit.status, _sinirli_oku(yanit, azami_bayt, son_an, url, kes), yanit.headers.get_content_charset()
    except urllib.error.HTTPError as hata:
        with hata:
            kodlama = hata.headers.get_content_charset() if hata.headers else None
            return hata.code, _sinirli_oku(hata, azami_bayt, son_an, url, kes=True), kodlama
    except OSError as hata:
        raise GeciciHata(f"{url_metni(url)}: {hata}") from hata


def metni_coz(govde: bytes, baslik_kodlamasi: str | None) -> str:
    """HTTP başlığındaki karakter kodlaması → sayfadaki <meta charset> → UTF-8. Bilinmeyen kodlama turu durdurmaz."""
    m = _META_KODLAMA.search(govde[:4096])
    meta = m.group(1).decode("ascii") if m else None
    for aday in (baslik_kodlamasi, meta, "utf-8"):
        if aday:
            try:
                return govde.decode(aday, "replace")
            except LookupError:
                continue
    return govde.decode("utf-8", "replace")


class RobotsDenetcisi:
    """robots.txt kök başına bir kez okunur. 401/403, 5xx ya da ulaşılamazsa → hiçbir şey çekilmez; diğer 4xx → serbest.

    Kural, verilen tüm kullanıcı ajanlarına birlikte uygulanır: radarın adı ve Firecrawl kullanılıyorsa onunki.
    """

    def __init__(self, ajan: str, zaman_asimi: float = 10, ek_ajanlar=(), ozel_aglara_izin=False, cozumle=None):
        self.ajan, self.zaman_asimi, self.ajanlar = ajan, zaman_asimi, (ajan, *ek_ajanlar)
        self._acici = _acici(not ozel_aglara_izin, cozumle=cozumle or socket.getaddrinfo)
        self._onbellek: dict[str, RobotFileParser] = {}

    def _okuyucu(self, url: str) -> RobotFileParser:
        p = urlparse(url_denetle(url))
        kok = f"{p.scheme}://{p.netloc}"
        if kok not in self._onbellek:
            okuyucu = RobotFileParser()
            try:
                durum, govde, kodlama = http_istegi(
                    kok + "/robots.txt", self.ajan, self.zaman_asimi, acici=self._acici, azami_bayt=AZAMI_ROBOTS_BAYT, kes=True
                )
            except GuvenlikEngeli:
                raise
            except GetirmeHatasi:
                durum, govde, kodlama = 503, b"", None
            if durum in (401, 403) or durum >= 500:
                okuyucu.disallow_all = True
            elif durum >= 400:
                okuyucu.allow_all = True
            else:
                okuyucu.parse(metni_coz(govde, kodlama).splitlines())
            self._onbellek[kok] = okuyucu
        return self._onbellek[kok]

    def izin_var_mi(self, url: str) -> bool:
        okuyucu = self._okuyucu(url)
        return all(okuyucu.can_fetch(ajan, url) for ajan in self.ajanlar)

    def gecikme(self, url: str) -> float | None:
        """robots.txt'teki Crawl-delay (saniye); birden çok ajan için en büyüğü."""
        okuyucu = self._okuyucu(url)
        degerler = [d for ajan in self.ajanlar if (d := okuyucu.crawl_delay(ajan)) is not None]
        return float(max(degerler)) if degerler else None


class HizSinirlayici:
    """Aynı alan adına iki istek arasında en az `aralik_sn` (ya da robots.txt Crawl-delay) saniye bekler."""

    def __init__(self, aralik_sn: float, saat=time.monotonic, uyu=time.sleep):
        self.aralik, self.saat, self.uyu, self._son = aralik_sn, saat, uyu, {}

    def bekle(self, url: str, en_az_sn: float | None = None) -> None:
        aralik = max(self.aralik, en_az_sn or 0)
        alan = urlparse(url).netloc
        if alan in self._son and (gecen := self.saat() - self._son[alan]) < aralik:
            self.uyu(aralik - gecen)
        self._son[alan] = self.saat()


class DogrudanGetirici:
    ad = "dogrudan"

    def __init__(self, ajan, zaman_asimi=20, robots=None, ozel_aglara_izin=False, cozumle=None, azami_bayt=AZAMI_SAYFA_BAYT):
        self.ajan, self.zaman_asimi, self.azami_bayt = ajan, zaman_asimi, azami_bayt
        self._acici = _acici(not ozel_aglara_izin, robots=robots, cozumle=cozumle or socket.getaddrinfo)

    def getir(self, url: str) -> Sayfa:
        url_denetle(url)
        basliklar = {"Accept-Language": "tr-TR,tr;q=0.9"}
        durum, govde, kodlama = http_istegi(url, self.ajan, self.zaman_asimi, None, basliklar, self._acici, self.azami_bayt)
        if durum in GECICI_DURUMLAR:
            raise GeciciHata(f"{url_metni(url)}: HTTP {durum}")
        if durum >= 300:  # izlenmeyen yönlendirme (döngü, izin verilmeyen şema) de hatadır
            raise GetirmeHatasi(f"{url_metni(url)}: HTTP {durum}")
        return Sayfa(url, metni_coz(govde, kodlama))


class FirecrawlGetirici:
    ad = "firecrawl"

    def __init__(self, api_url, api_anahtari=None, urun_bicimi=False, zaman_asimi=90, gonder=None, konum=None):
        self.api_url, self.api_anahtari = api_url.rstrip("/"), api_anahtari
        self.urun_bicimi, self.zaman_asimi, self.konum = urun_bicimi, zaman_asimi, konum
        self._gonder = gonder or self._http_post

    def _http_post(self, yol: str, govde: dict) -> dict:
        basliklar = {"Content-Type": "application/json"}
        if self.api_anahtari:
            basliklar["Authorization"] = f"Bearer {self.api_anahtari}"
        veri = json.dumps(govde).encode("utf-8")
        durum, ham, _ = http_istegi(self.api_url + yol, "FiyatRadar", self.zaman_asimi, veri, basliklar, azami_bayt=AZAMI_API_BAYT)
        try:
            return json.loads(ham)
        except (ValueError, RecursionError) as hata:
            raise GetirmeHatasi(f"Firecrawl HTTP {durum}: JSON olmayan yanıt") from hata

    def getir(self, url: str) -> Sayfa:
        bicimler = ["markdown", "rawHtml"] + ([{"type": "product"}] if self.urun_bicimi else [])
        # maxAge 0: önbellekteki eski sayfa yerine taze tarama (fiyat izlemede şart).
        # storeInCache false: sayfa Firecrawl'ın dizinine yazılmaz (veri en aza indirme).
        govde = {"url": url, "formats": bicimler, "onlyMainContent": False, "maxAge": 0, "storeInCache": False}
        if self.konum:  # yalnızca konum destekleyen motorlarda (bulut); bkz. scrapeURL/engines/index.ts
            govde["location"] = {"country": self.konum, "languages": ["tr-TR"]}
        yanit = self._gonder("/v2/scrape", govde)
        if not isinstance(yanit, dict) or not yanit.get("success"):
            neden = yanit.get("error") if isinstance(yanit, dict) else None
            raise GetirmeHatasi(f"Firecrawl: {str(neden or 'beklenmeyen yanıt')[:200]}")
        veri = yanit.get("data")
        if not isinstance(veri, dict):
            raise GetirmeHatasi("Firecrawl: yanıtta sayfa verisi yok")
        meta = veri.get("metadata") if isinstance(veri.get("metadata"), dict) else {}
        try:
            durum = int(meta.get("statusCode") or 200)
        except (TypeError, ValueError):
            durum = 200
        if durum >= 400:
            raise GetirmeHatasi(f"{url_metni(url)}: hedef site HTTP {durum}")
        html, md, urun = veri.get("rawHtml") or veri.get("html"), veri.get("markdown"), veri.get("product")
        uyarilar = [f"Firecrawl uyarısı: {str(u)[:300]}" for u in (yanit.get("warning"), veri.get("warning")) if u]
        return Sayfa(
            url,
            html if isinstance(html, str) else "",
            md if isinstance(md, str) else None,
            urun if isinstance(urun, dict) else None,
            "firecrawl",
            uyarilar,
        )


class Getirici:
    """adres → robots.txt → hız sınırı → birincil getirici → (hata olursa) yedek getirici.

    Son getirici (yedek ya da tek getirici) geçici hatada bir kez daha dener; her deneme hız sınırına uyar.
    """

    def __init__(self, robots, hiz, birincil, yedek=None, adres_denetci=None, azami_gecikme_sn: float = 60):
        self.robots, self.hiz, self.birincil, self.yedek = robots, hiz, birincil, yedek
        self.adres_denetci, self.azami_gecikme = adres_denetci, azami_gecikme_sn

    def getir(self, url: str) -> tuple[Sayfa, list[str]]:
        url_denetle(url)
        if self.adres_denetci is not None:
            self.adres_denetci(url)
        if not self.robots.izin_var_mi(url):
            raise RobotsEngeli(f"robots.txt bu sayfaya izin vermiyor: {url_metni(url)}")
        gecikme = self.robots.gecikme(url)
        if gecikme is not None and gecikme > self.azami_gecikme:
            raise RobotsEngeli(f"robots.txt Crawl-delay {gecikme:g} sn, radarın sınırı {self.azami_gecikme:g} sn: atlandı")
        if self.yedek is None:
            return self._dene(self.birincil, url, gecikme, 2)
        try:
            return self._dene(self.birincil, url, gecikme, 1)
        except (RobotsEngeli, GuvenlikEngeli):
            raise
        except GetirmeHatasi as hata:
            sayfa, notlar = self._dene(self.yedek, url, gecikme, 2)
            return sayfa, [f"{self.birincil.ad} başarısız, yerleşik getirici kullanıldı: {hata}"] + notlar

    def _dene(self, getirici, url: str, gecikme: float | None, deneme_sayisi: int) -> tuple[Sayfa, list[str]]:
        for deneme in range(1, deneme_sayisi + 1):
            self.hiz.bekle(url, gecikme)
            try:
                sayfa = getirici.getir(url)
                return sayfa, list(sayfa.uyarilar)
            except GeciciHata:
                if deneme == deneme_sayisi:
                    raise
        raise AssertionError("ulaşılmaz")
