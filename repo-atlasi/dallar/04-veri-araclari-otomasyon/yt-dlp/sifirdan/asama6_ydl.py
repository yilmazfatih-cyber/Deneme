"""Aşama 6 — orkestratör: çıkar -> çöz -> seç -> adlandır -> indir -> son işle.

Asıl proje: yt_dlp/YoutubeDL.py (4.500+ satır). Akış:
  extract_info(url)
    -> uygun çıkarıcıyı bul, ie.extract(url)
    -> process_ie_result: '_type' 'url' ise yeniden çıkar, 'playlist' ise her girdiyi işle
    -> process_video_result: formatları sırala, '-f' tanımına göre seç
    -> process_info: dosya adını şablondan üret, indir, son işlemcileri çalıştır
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlsplit

from asama1_cikarici import CikariciHatasi, cikarici_siniflari
from asama2_format import FormatHatasi, formatlari_sec, formatlari_sirala
from asama3_indirici import HttpIndirici, IndirmeHatasi
from asama4_sablon import guvenli_yol, sablonu_uygula
from asama5_sonislem import FFmpegBirlestirPP, SonIslemci, SonIslemHatasi, ffmpeg_var

VARSAYILAN_FORMAT = 'bv*+ba/b'


class YdlHatasi(Exception):
    pass


class MiniYDL:
    VARSAYILANLAR = {
        'format': None,  # None: ffmpeg varsa 'bv*+ba/b', yoksa 'b/bv*+ba' (asıl koddaki mantık)
        'format_sort': (),
        'outtmpl': '%(title)s [%(id)s].%(ext)s',
        'paths': '.',
        'simulate': False,
        'quiet': True,
        'keepvideo': False,
        'restrictfilenames': False,
        'ratelimit': None,
        'retries': 3,
        # Etik/güvenlik: yalnızca bu sunuculara bağlan. None = sınırsız (kendi sunucunuz için).
        'allowed_hosts': ('127.0.0.1', 'localhost'),
        'progress_hooks': (),
    }

    def __init__(self, params: dict | None = None):
        self.params = {**self.VARSAYILANLAR, **(params or {})}
        self._ies = [sinif(self) for sinif in cikarici_siniflari()]
        self._pps: dict[str, list[SonIslemci]] = {'pre_process': [], 'post_process': []}
        self._kancalar = list(self.params['progress_hooks'])
        self.ciktilar: list[str] = []
        self.indirilenler: list[str] = []

    # --- yardımcılar -----------------------------------------------------------------
    def ekrana(self, mesaj: str) -> None:
        self.ciktilar.append(mesaj)
        if not self.params['quiet']:
            print(mesaj)

    def add_post_processor(self, pp: SonIslemci, when: str = 'post_process') -> None:
        pp._ydl = self
        self._pps[when].append(pp)

    def add_progress_hook(self, kanca) -> None:
        self._kancalar.append(kanca)

    def _format_tanimi(self) -> str:
        if self.params['format']:
            return self.params['format']
        return VARSAYILAN_FORMAT if ffmpeg_var() else 'b/bv*+ba'

    def _indirici(self) -> HttpIndirici:
        return HttpIndirici(self._kancalar, yeniden_deneme=self.params['retries'], hiz_siniri=self.params['ratelimit'])

    # --- 1) çıkarma -------------------------------------------------------------------
    def extract_info(self, url: str, download: bool = True, ie_key: str | None = None, ek: dict | None = None):
        izinli = self.params['allowed_hosts']
        host = urlsplit(url).hostname or ''
        if izinli is not None and host not in izinli:
            raise YdlHatasi(
                f'"{host}" izinli sunucular arasında değil. Bu eğitim aracı yalnızca içeriği size ait '
                'ya da indirme izniniz olan sunuculara bağlanmak için tasarlandı (allowed_hosts).'
            )
        for ie in self._ies:
            if ie_key and ie.ie_key() != ie_key:
                continue
            if not ie.suitable(url):
                continue
            self.ekrana(f'[{ie.IE_NAME}] Çıkarılıyor: {url}')
            try:
                sonuc = ie.extract(url)
            except CikariciHatasi as hata:
                raise YdlHatasi(f'[{ie.IE_NAME}] {hata}') from hata
            sonuc.setdefault('webpage_url', url)
            sonuc.update({'extractor': ie.IE_NAME, 'extractor_key': ie.ie_key()})
            return self.process_ie_result(sonuc, download, ek)
        raise YdlHatasi(f'Uygun çıkarıcı bulunamadı: {url}')

    # --- 2) sonucu çözme ---------------------------------------------------------------
    def process_ie_result(self, sonuc: dict, download: bool = True, ek: dict | None = None) -> dict:
        tur = sonuc.get('_type', 'video')
        if tur == 'url':
            return self.extract_info(sonuc['url'], download, ie_key=sonuc.get('ie_key'), ek=ek)
        if tur == 'playlist':
            girdiler = sonuc['entries']
            self.ekrana(f'[liste] {sonuc.get("title")}: {len(girdiler)} öğe')
            islenmis = []
            for sira, girdi in enumerate(girdiler, 1):
                liste_bilgisi = {
                    'playlist': sonuc.get('title') or sonuc.get('id'),
                    'playlist_id': sonuc.get('id'),
                    'playlist_index': sira,
                    'n_entries': len(girdiler),
                }
                islenmis.append(self.process_ie_result(girdi, download, {**(ek or {}), **liste_bilgisi}))
            return {**sonuc, 'entries': islenmis}
        return self.process_video_result({**sonuc, **(ek or {})}, download)

    # --- 3) format seçimi --------------------------------------------------------------
    def process_video_result(self, bilgi: dict, download: bool = True) -> dict:
        formatlar = bilgi.get('formats')
        if not formatlar and bilgi.get('url'):
            # Tek URL'li sonuç: kendisi tek format sayılır; codec bilinmiyor (None)
            formatlar = [{'format_id': '0', 'url': bilgi['url'], 'ext': bilgi.get('ext', 'mp4')}]
        if not formatlar:
            raise YdlHatasi(f'{bilgi.get("id")}: hiç format yok')
        for sira, f in enumerate(formatlar):
            f.setdefault('format_id', str(sira))
        formatlar = formatlari_sirala(formatlar, self.params['format_sort'])
        tanim = self._format_tanimi()
        secilenler = formatlari_sec(formatlar, tanim)
        if not secilenler:
            raise YdlHatasi(f'{bilgi.get("id")}: istenen format yok ({tanim})')
        bilgi = {**bilgi, 'formats': formatlar}
        indirmeler = []
        for secilen in secilenler:
            kopya = {**bilgi, **secilen}
            indirmeler.append(self.process_info(kopya) if download else kopya)
        bilgi['requested_downloads'] = indirmeler
        return bilgi

    def prepare_filename(self, bilgi: dict) -> str:
        goreli = sablonu_uygula(self.params['outtmpl'], bilgi, kisitli=self.params['restrictfilenames'])
        return guvenli_yol(self.params['paths'], goreli)

    # --- 4) indirme ve son işlem ---------------------------------------------------------
    def process_info(self, bilgi: dict) -> dict:
        bilgi = self.run_all_pps('pre_process', bilgi)
        dosya = self.prepare_filename(bilgi)
        bilgi['filepath'] = dosya
        if self.params['simulate']:
            self.ekrana(f'[simülasyon] {bilgi["format_id"]} -> {dosya}')
            return bilgi
        os.makedirs(os.path.dirname(dosya), exist_ok=True)
        if 'requested_formats' in bilgi:
            if not ffmpeg_var():
                raise YdlHatasi('Ayrı video ve ses akışlarını birleştirmek için ffmpeg gerekli (ya da -f b kullanın).')
            parcalar = []
            for parca in bilgi['requested_formats']:
                parca_yolu = f'{os.path.splitext(dosya)[0]}.f{parca["format_id"]}.{parca["ext"]}'
                self.ekrana(f'[indir] {parca["format_id"]} -> {parca_yolu}')
                self._indirici().indir(parca['url'], parca_yolu)
                parcalar.append(parca_yolu)
            bilgi['__parca_dosyalari'] = parcalar
            bilgi = self.run_pp(FFmpegBirlestirPP(self), bilgi)
        else:
            self.ekrana(f'[indir] {bilgi["format_id"]} -> {dosya}')
            self._indirici().indir(bilgi['url'], dosya)
        bilgi = self.run_all_pps('post_process', bilgi)
        self.indirilenler.append(bilgi['filepath'])
        return bilgi

    def run_pp(self, pp: SonIslemci, bilgi: dict) -> dict:
        silinecekler, bilgi = pp.run(bilgi)
        if silinecekler and not self.params['keepvideo']:
            for yol in silinecekler:
                if yol != bilgi.get('filepath') and os.path.exists(yol):
                    os.remove(yol)
                    self.ekrana(f'Ara dosya silindi: {yol} (-k ile saklanır)')
        return bilgi

    def run_all_pps(self, ne_zaman: str, bilgi: dict) -> dict:
        for pp in self._pps[ne_zaman]:
            bilgi = self.run_pp(pp, bilgi)
        return bilgi

    def download(self, urller: list[str]) -> int:
        """Komut satırı davranışı: hatalı URL'yi raporla, diğerlerine devam et."""
        hata_sayisi = 0
        for url in urller:
            try:
                self.extract_info(url, download=True)
            except (YdlHatasi, IndirmeHatasi, SonIslemHatasi, FormatHatasi, OSError) as hata:
                hata_sayisi += 1
                self.ciktilar.append(f'HATA: {hata}')
                print(f'HATA: {hata}', file=sys.stderr)  # sessiz kipte de hatalar görünür
        return hata_sayisi
