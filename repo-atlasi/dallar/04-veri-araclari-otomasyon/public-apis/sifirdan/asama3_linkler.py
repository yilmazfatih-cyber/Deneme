"""Aşama 3 — bağlantı denetleyici: tekrar eden linkler + eş zamanlı canlılık testi.

Gerçek depoda scripts/validate/links.py linkleri SIRAYLA (tek tek) ve 25 sn zaman
aşımıyla dener; ~2400 link için bu saatler sürebilir. Burada:
  * ThreadPoolExecutor ile eş zamanlı deniyoruz,
  * aynı sunucuya aynı anda en fazla N istek gönderiyoruz (nazik olmak için),
  * önce HEAD, sunucu HEAD'i desteklemiyorsa GET deniyoruz,
  * Cloudflare gibi bot korumalarının 403/503'ünü "kırık" saymıyoruz (asıl betik de
    has_cloudflare_protection ile bunu yapar),
  * dürüst bir User-Agent kullanıyoruz (asıl betik tarayıcı taklidi yapar; bu,
    yanlış pozitifleri azaltır ama sitelerin bot politikasını atlatmak demektir).
"""

from __future__ import annotations

import re
import socket
import ssl
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from urllib.parse import urlsplit

KULLANICI_AJANI = 'public-apis-mini-denetleyici/0.1 (egitim amacli; +https://github.com/public-apis/public-apis)'
# Markdown içindeki http(s) linkleri; ')' ']' '|' '`' gibi sınırlarda durur
LINK_RE = re.compile(r'https?://[^\s)\]>|`"\'<]+')
HEAD_DESTEKLEMEYEN = {403, 405, 501}  # bu kodlarda GET ile bir kez daha dene


def linkleri_bul(metin: str, index_sonrasi: bool = True) -> list[str]:
    """Metindeki linkleri sırasıyla döndürür (asıl betik de '## Index' sonrasına bakar)."""
    if index_sonrasi:
        konum = metin.find('## Index')
        metin = metin[konum:] if konum != -1 else metin
    return [link.rstrip('.,;:') for link in LINK_RE.findall(metin)]


def tekrarlari_bul(linkler: list[str]) -> list[str]:
    """Birden fazla geçen linkleri (sondaki '/' farkını yok sayarak) bir kez listeler."""
    sayac: dict[str, int] = {}
    tekrarlar = []
    for link in linkler:
        anahtar = link.rstrip('/')
        sayac[anahtar] = sayac.get(anahtar, 0) + 1
        if sayac[anahtar] == 2:
            tekrarlar.append(anahtar)
    return tekrarlar


@dataclass
class LinkSonucu:
    url: str
    durum: int | None = None
    hata: str | None = None
    korumali: bool = False  # bot koruması nedeniyle doğrulanamadı
    sure: float = 0.0

    @property
    def kirik(self) -> bool:
        if self.korumali:
            return False
        return self.hata is not None or (self.durum is not None and self.durum >= 400)

    def __str__(self) -> str:
        if self.hata:
            return f'HATA {self.hata}: {self.url}'
        return f'{self.durum}{" (korumalı)" if self.korumali else ""}: {self.url}'


def _korumali_mi(durum: int, basliklar) -> bool:
    sunucu = (basliklar.get('Server') or '').lower() if basliklar else ''
    return durum in (403, 503) and 'cloudflare' in sunucu


def _istek(url: str, yontem: str, zaman_asimi: float) -> tuple[int, object]:
    istek = urllib.request.Request(url, method=yontem, headers={'User-Agent': KULLANICI_AJANI})
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
            if yontem == 'GET':
                yanit.read(1024)  # gövdenin tamamını indirmeye gerek yok
            return yanit.status, yanit.headers
    except urllib.error.HTTPError as hata:
        return hata.code, hata.headers


def linki_denetle(url: str, zaman_asimi: float = 10.0) -> LinkSonucu:
    baslangic = time.monotonic()
    sonuc = LinkSonucu(url=url)
    try:
        durum, basliklar = _istek(url, 'HEAD', zaman_asimi)
        if durum in HEAD_DESTEKLEMEYEN:
            durum, basliklar = _istek(url, 'GET', zaman_asimi)
        sonuc.durum = durum
        sonuc.korumali = _korumali_mi(durum, basliklar)
    except (TimeoutError, socket.timeout):
        sonuc.hata = 'zaman aşımı'
    except urllib.error.URLError as hata:
        neden = hata.reason
        if isinstance(neden, (TimeoutError, socket.timeout)):
            sonuc.hata = 'zaman aşımı'
        elif isinstance(neden, ssl.SSLError):
            sonuc.hata = f'SSL: {neden}'
        else:
            sonuc.hata = f'bağlantı: {neden}'
    except (ConnectionError, ValueError) as hata:
        sonuc.hata = f'{type(hata).__name__}: {hata}'
    sonuc.sure = time.monotonic() - baslangic
    return sonuc


class HostSinirlayici:
    """Aynı sunucuya aynı anda en fazla `sinir` istek gitmesini sağlar."""

    def __init__(self, sinir: int):
        self._kilit = threading.Lock()
        self._semaforlar: dict[str, threading.Semaphore] = defaultdict(lambda: threading.Semaphore(sinir))

    def semafor(self, url: str) -> threading.Semaphore:
        with self._kilit:
            return self._semaforlar[urlsplit(url).netloc.lower()]


def linkleri_denetle(
    linkler: list[str], es_zamanli: int = 8, host_basina: int = 2, zaman_asimi: float = 10.0
) -> list[LinkSonucu]:
    """Linkleri eş zamanlı dener; sonuçları girdiyle AYNI sırada döndürür."""
    sinirlayici = HostSinirlayici(host_basina)

    def is_parcasi(url: str) -> LinkSonucu:
        with sinirlayici.semafor(url):
            return linki_denetle(url, zaman_asimi)

    benzersiz = list(dict.fromkeys(linkler))  # tekrarları bir kez dene, sırayı koru
    with ThreadPoolExecutor(max_workers=es_zamanli) as havuz:
        return list(havuz.map(is_parcasi, benzersiz))
