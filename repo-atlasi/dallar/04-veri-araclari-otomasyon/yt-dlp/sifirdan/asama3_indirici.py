"""Aşama 3 — HTTP indirici: .part dosyası, Range ile devam, ilerleme kancaları, hız sınırı.

Asıl karşılığı yt_dlp/downloader/http.py (HttpFD) ve ortak sınıfı downloader/common.py
(FileDownloader). Öğretilen mekanizmalar:
  * Önce '<ad>.part' dosyasına yaz, bitince atomik olarak yeniden adlandır.
  * Bağlantı koparsa 'Range: bytes=<eldeki>-' ile kaldığın yerden iste.
  * Sunucu Range'i yok sayıp 200 dönerse devam ETME, baştan yaz (asıl kod da
    Content-Range başlığını denetler: bazı sunucular Range'i desteklemez).
  * 416 (aralık karşılanamaz) çoğu zaman "dosya zaten tamam" demektir.
  * Her parça sonrası ilerleme kancalarını çağır: {'status': 'downloading', ...}.
"""

from __future__ import annotations

import http.client
import os
import re
import time
import urllib.error
import urllib.request

KULLANICI_AJANI = 'mini-ytdl/0.1 (egitim amacli)'


class IndirmeHatasi(Exception):
    pass


class BaglantiKesildi(Exception):
    """Yeniden denemeye değer geçici hata."""


def _content_range(baslik: str | None) -> tuple[int | None, int | None]:
    """'bytes 100-199/1000' -> (100, 1000); 'bytes */1000' -> (None, 1000)."""
    eslesme = re.match(r'bytes\s+(?:(\d+)-\d+|\*)/(\d+|\*)', baslik or '')
    if not eslesme:
        return None, None
    baslangic = int(eslesme.group(1)) if eslesme.group(1) else None
    toplam = int(eslesme.group(2)) if eslesme.group(2) != '*' else None
    return baslangic, toplam


class HttpIndirici:
    def __init__(
        self,
        ilerleme_kancalari=(),
        yeniden_deneme: int = 3,
        parca_boyutu: int = 16 * 1024,
        hiz_siniri: float | None = None,
        devam: bool = True,
        zaman_asimi: float = 20.0,
    ):
        self.kancalar = list(ilerleme_kancalari)
        self.yeniden_deneme = yeniden_deneme
        self.parca_boyutu = parca_boyutu
        self.hiz_siniri = hiz_siniri  # bayt/sn; sunucuya nazik olmak için
        self.devam = devam
        self.zaman_asimi = zaman_asimi
        self.mesajlar: list[str] = []

    def _kanca(self, durum: dict) -> None:
        for kanca in self.kancalar:
            kanca(durum)

    def indir(self, url: str, hedef: str) -> str:
        if os.path.exists(hedef):
            boyut = os.path.getsize(hedef)
            self.mesajlar.append(f'{hedef} zaten indirilmiş')
            self._kanca({'status': 'finished', 'filename': hedef, 'downloaded_bytes': boyut, 'total_bytes': boyut})
            return hedef
        gecici = hedef + '.part'
        deneme = 0
        baslangic = time.monotonic()
        while True:
            try:
                indirilen = self._bir_deneme(url, gecici, hedef)
                break
            except (BaglantiKesildi, ConnectionError, TimeoutError, http.client.IncompleteRead) as hata:
                deneme += 1
                self.mesajlar.append(f'Yeniden deneme {deneme}/{self.yeniden_deneme}: {hata!r}')
                if deneme > self.yeniden_deneme:
                    self._kanca({'status': 'error', 'filename': hedef, 'tmpfilename': gecici})
                    raise IndirmeHatasi(f'{self.yeniden_deneme} denemeden sonra vazgeçildi: {hata!r}') from hata
                time.sleep(min(0.05 * 2**deneme, 2.0))  # üstel geri çekilme
        os.replace(gecici, hedef)  # atomik: yarım dosya asla son adı taşımaz
        self._kanca(
            {
                'status': 'finished',
                'filename': hedef,
                'downloaded_bytes': indirilen,
                'total_bytes': indirilen,
                'elapsed': time.monotonic() - baslangic,
            }
        )
        return hedef

    def _ac(self, url: str, mevcut: int):
        basliklar = {'User-Agent': KULLANICI_AJANI}
        if mevcut:
            basliklar['Range'] = f'bytes={mevcut}-'
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=basliklar), timeout=self.zaman_asimi)
        except urllib.error.HTTPError as hata:
            if hata.code == 416 and mevcut:
                return hata  # çağıran yorumlasın
            if hata.code >= 500:
                raise BaglantiKesildi(f'HTTP {hata.code}') from hata
            raise IndirmeHatasi(f'HTTP {hata.code}: {url}') from hata
        except urllib.error.URLError as hata:
            raise BaglantiKesildi(str(hata.reason)) from hata

    def _bir_deneme(self, url: str, gecici: str, hedef: str) -> int:
        mevcut = os.path.getsize(gecici) if self.devam and os.path.exists(gecici) else 0
        yanit = self._ac(url, mevcut)
        with yanit:
            if mevcut and yanit.status == 416:
                _, toplam = _content_range(yanit.headers.get('Content-Range'))
                if toplam is None or toplam == mevcut:
                    return mevcut  # elimizdeki .part zaten tam dosya
                os.remove(gecici)  # .part sunucudakinden büyük: bozuk, baştan başla
                raise BaglantiKesildi('416: yerel parça geçersiz')
            kip = 'wb'
            if mevcut:
                baslangic, _ = _content_range(yanit.headers.get('Content-Range'))
                if yanit.status == 206 and baslangic == mevcut:
                    kip = 'ab'
                    self.mesajlar.append(f'{mevcut}. bayttan devam ediliyor')
                else:
                    self.mesajlar.append('Sunucu devam etmeyi desteklemiyor; baştan indiriliyor')
                    mevcut = 0
            uzunluk = yanit.headers.get('Content-Length')
            toplam = mevcut + int(uzunluk) if uzunluk is not None else None
            return self._akit(yanit, gecici, hedef, kip, mevcut, toplam)

    def _akit(self, yanit, gecici: str, hedef: str, kip: str, mevcut: int, toplam: int | None) -> int:
        indirilen, bu_oturum = mevcut, 0
        baslangic = time.monotonic()
        with open(gecici, kip) as dosya:
            while True:
                parca = yanit.read(self.parca_boyutu)  # kopukluk IncompleteRead fırlatır
                if not parca:
                    break
                dosya.write(parca)
                indirilen += len(parca)
                bu_oturum += len(parca)
                gecen = time.monotonic() - baslangic
                if self.hiz_siniri:
                    gereken = bu_oturum / self.hiz_siniri
                    if gereken > gecen:
                        time.sleep(gereken - gecen)
                        gecen = gereken
                hiz = bu_oturum / gecen if gecen > 0 else None
                self._kanca(
                    {
                        'status': 'downloading',
                        'filename': hedef,
                        'tmpfilename': gecici,
                        'downloaded_bytes': indirilen,
                        'total_bytes': toplam,
                        'speed': hiz,
                        'eta': (toplam - indirilen) / hiz if hiz and toplam else None,
                    }
                )
        if toplam is not None and indirilen < toplam:
            raise BaglantiKesildi(f'{indirilen}/{toplam} bayt geldi')
        return indirilen


def boyut_bicimle(bayt: float | None) -> str:
    if bayt is None:
        return '?'
    for birim in ('B', 'KiB', 'MiB', 'GiB'):
        if abs(bayt) < 1024 or birim == 'GiB':
            return f'{bayt:.1f}{birim}' if birim != 'B' else f'{int(bayt)}B'
        bayt /= 1024
    return f'{bayt:.1f}GiB'
