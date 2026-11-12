"""Aşama 1 — çıkarıcılar: URL'yi tanı, sayfayı oku, "bilgi sözlüğü" (info dict) döndür.

yt-dlp'nin en kalabalık klasörü yt_dlp/extractor/'dır (~1.750 çıkarıcı sınıfı).
Hepsi aynı sözleşmeye uyar (yt_dlp/extractor/common.py içindeki InfoExtractor):
  * _VALID_URL  : bu çıkarıcının tanıdığı URL'lerin düzenli ifadesi,
  * suitable()  : URL bu desene uyuyor mu,
  * _real_extract(url) : asıl iş; {'id', 'title', 'formats': [...]} sözlüğü döner.
Kayıt sırası önemlidir: URL'yi tanıyan İLK çıkarıcı kazanır, "genel" çıkarıcı en
sondadır (asıl projede GenericIE).

Etik not: buradaki örnek çıkarıcılar yalnızca yerel test sunucusunu (127.0.0.1)
tanır. Gerçek sitelerin kullanım koşulları ve telif hakkı ayrı bir konudur.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from html import unescape
from urllib.parse import urljoin, urlsplit

KULLANICI_AJANI = 'mini-ytdl/0.1 (egitim amacli)'
_YOK = object()
_KAYIT: list[type['BilgiCikarici']] = []


class CikariciHatasi(Exception):
    def __init__(self, mesaj: str, video_id: str | None = None, beklenen: bool = False):
        super().__init__(mesaj)
        self.video_id = video_id
        self.beklenen = beklenen  # True: kullanıcı hatası (ör. 404), hata raporu istenmez


class BilgiCikarici:
    _VALID_URL: str | tuple[str, ...] | None = None
    IE_NAME = ''
    _GENEL = False  # True ise kayıt sırasında en sona konur

    def __init_subclass__(cls, **kwargs):
        # Alt sınıf tanımlandığı anda kayda girer. Asıl projede bu iş, bütün sınıfları
        # içe aktaran _extractors.py + make_lazy_extractors.py ile yapılır.
        super().__init_subclass__(**kwargs)
        if cls._VALID_URL:
            _KAYIT.append(cls)

    def __init__(self, ydl=None):
        self._ydl = ydl

    @classmethod
    def ie_key(cls) -> str:
        return cls.__name__[:-2] if cls.__name__.endswith('IE') else cls.__name__

    @classmethod
    def _url_eslesmesi(cls, url: str) -> re.Match | None:
        # Derlenmiş deseni YALNIZCA bu sınıfın sözlüğünde önbellekle; getattr üst
        # sınıfın önbelleğini de bulurdu (asıl koddaki yorumla aynı gerekçe).
        if '_VALID_URL_RE' not in cls.__dict__:
            desenler = cls._VALID_URL if isinstance(cls._VALID_URL, tuple) else (cls._VALID_URL,)
            cls._VALID_URL_RE = tuple(re.compile(d) for d in desenler if d)
        return next((m for m in (r.match(url) for r in cls._VALID_URL_RE) if m), None)

    @classmethod
    def suitable(cls, url: str) -> bool:
        return cls._url_eslesmesi(url) is not None

    @classmethod
    def _id_al(cls, url: str) -> str:
        return cls._url_eslesmesi(url).group('id')

    def extract(self, url: str) -> dict:
        try:
            return self._real_extract(url)
        except CikariciHatasi:
            raise
        except (KeyError, ValueError, IndexError, TypeError) as hata:
            # Site yapısı değiştiğinde en sık görülen hatalar; kullanıcıya anlamlı mesaj ver
            raise CikariciHatasi(f'{self.IE_NAME}: beklenmeyen sayfa yapısı ({type(hata).__name__}: {hata})') from hata

    def _real_extract(self, url: str) -> dict:
        raise NotImplementedError

    # --- yardımcılar (asıl projede _download_webpage, _search_regex, _og_search_*) ---
    def _sayfa_indir(self, url: str, video_id: str | None = None) -> str:
        istek = urllib.request.Request(url, headers={'User-Agent': KULLANICI_AJANI})
        try:
            with urllib.request.urlopen(istek, timeout=15) as yanit:
                return yanit.read().decode(yanit.headers.get_content_charset() or 'utf-8', errors='replace')
        except urllib.error.HTTPError as hata:
            raise CikariciHatasi(f'HTTP {hata.code}: {url}', video_id, beklenen=hata.code == 404) from hata
        except urllib.error.URLError as hata:
            raise CikariciHatasi(f'Bağlantı hatası: {hata.reason}', video_id) from hata

    def _regex_ara(self, desen: str, metin: str, ad: str, varsayilan=_YOK, bayraklar: int = 0):
        eslesme = re.search(desen, metin, bayraklar)
        if eslesme:
            return next((g for g in eslesme.groups() if g is not None), eslesme.group(0))
        if varsayilan is not _YOK:
            return varsayilan
        raise CikariciHatasi(f'{self.IE_NAME}: {ad} bulunamadı')

    def _og_ozelligi(self, ad: str, html: str) -> str | None:
        ozellik = rf'property=["\']og:{re.escape(ad)}["\']'
        deger = self._regex_ara(
            rf'<meta[^>]+{ozellik}[^>]+content=["\']([^"\']*)|<meta[^>]+content=["\']([^"\']*)["\'][^>]+{ozellik}',
            html,
            f'og:{ad}',
            varsayilan=None,
        )
        return unescape(deger) if deger is not None else None

    @staticmethod
    def url_sonucu(url: str, ie_key: str | None = None, video_id: str | None = None) -> dict:
        """'Bunu başka bir çıkarıcı çözsün' sonucu (oynatma listelerinde kullanılır)."""
        return {'_type': 'url', 'url': url, 'ie_key': ie_key, 'id': video_id}

    @staticmethod
    def liste_sonucu(girdiler, liste_id: str | None = None, baslik: str | None = None) -> dict:
        return {'_type': 'playlist', 'id': liste_id, 'title': baslik, 'entries': list(girdiler)}


YEREL = r'https?://(?:127\.0\.0\.1|localhost)(?::\d+)?'


class OrnekVideoIE(BilgiCikarici):
    """Yerel test sitesindeki /izle/<id> sayfası.

    Sayfa verisini <script type="application/json"> içinde taşır; gerçek sitelerin
    çoğu da bilgiyi böyle gömülü JSON'da tutar ve çıkarıcı onu düzenli ifadeyle bulur.
    """

    IE_NAME = 'ornek'
    _VALID_URL = YEREL + r'/izle/(?P<id>[A-Za-z0-9_-]+)'

    def _real_extract(self, url):
        video_id = self._id_al(url)
        html = self._sayfa_indir(url, video_id)
        ham = self._regex_ara(
            r'<script[^>]+id=["\']video-verisi["\'][^>]*>(.+?)</script>', html, 'video verisi', bayraklar=re.S
        )
        veri = json.loads(ham)
        formatlar = [
            {
                'format_id': f['id'],
                'url': urljoin(url, f['url']),
                'ext': f['uzanti'],
                'height': f.get('yukseklik'),
                'width': f.get('genislik'),
                'fps': f.get('fps'),
                'vcodec': f.get('vcodec', 'none'),
                'acodec': f.get('acodec', 'none'),
                'tbr': f.get('tbr'),
                'filesize': f.get('boyut'),
            }
            for f in veri['formatlar']
        ]
        return {
            'id': video_id,
            'title': veri.get('baslik') or self._og_ozelligi('title', html) or video_id,
            'uploader': veri.get('yukleyen'),
            'duration': veri.get('sure'),
            'description': self._og_ozelligi('description', html),
            'formats': formatlar,
        }


class OrnekListeIE(BilgiCikarici):
    IE_NAME = 'ornek:liste'
    _VALID_URL = YEREL + r'/liste/(?P<id>[A-Za-z0-9_-]+)'

    def _real_extract(self, url):
        liste_id = self._id_al(url)
        html = self._sayfa_indir(url, liste_id)
        baslik = self._regex_ara(r'<h1[^>]*>([^<]+)</h1>', html, 'liste başlığı', varsayilan=liste_id)
        girdiler = [
            self.url_sonucu(urljoin(url, yol), ie_key='OrnekVideo', video_id=vid)
            for yol, vid in re.findall(r'<a[^>]+class="video"[^>]+href="(/izle/([^"]+))"', html)
        ]
        return self.liste_sonucu(girdiler, liste_id, unescape(baslik))


class GenelIE(BilgiCikarici):
    """Son çare: sayfada <video src>, <source src> ya da og:video arar."""

    IE_NAME = 'genel'
    _GENEL = True
    _VALID_URL = r'https?://.+'

    def _real_extract(self, url):
        html = self._sayfa_indir(url)
        kaynak = self._regex_ara(r'<(?:video|source)[^>]+src=["\']([^"\']+)["\']', html, 'video', varsayilan=None)
        kaynak = kaynak or self._og_ozelligi('video', html)
        if not kaynak:
            raise CikariciHatasi(f'Desteklenmeyen URL: {url}', beklenen=True)
        video_url = urljoin(url, kaynak)
        dosya = urlsplit(video_url).path.rstrip('/').rsplit('/', 1)[-1]
        video_id, _, uzanti = dosya.rpartition('.')
        baslik = self._og_ozelligi('title', html)
        baslik = baslik or self._regex_ara(r'<title>([^<]+)</title>', html, 'başlık', varsayilan=video_id or dosya)
        return {'id': video_id or dosya, 'title': unescape(baslik), 'url': video_url, 'ext': uzanti or 'mp4'}


def cikarici_siniflari() -> list[type[BilgiCikarici]]:
    """Deneme sırası: kayıt sırası, ama genel çıkarıcılar en sonda."""
    return [c for c in _KAYIT if not c._GENEL] + [c for c in _KAYIT if c._GENEL]
