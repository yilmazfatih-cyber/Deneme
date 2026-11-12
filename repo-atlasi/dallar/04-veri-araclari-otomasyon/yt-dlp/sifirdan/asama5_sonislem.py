"""Aşama 5 — son işlemciler (postprocessor) zinciri ve ffmpeg.

Asıl proje: yt_dlp/postprocessor/common.py (PostProcessor) ve ffmpeg.py
(FFmpegExtractAudioPP, FFmpegMergerPP ...). Sözleşme çok sadedir:

    run(bilgi) -> (silinecek_dosyalar, yeni_bilgi)

Zincirdeki her işlemci bir öncekinin döndürdüğü bilgiyle çalışır. Hangi dosyanın
silineceğine işlemci değil, orkestratör (YoutubeDL.run_pp) karar verir; böylece
'-k / --keep-video' tek bir yerde uygulanır.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess


class SonIslemHatasi(Exception):
    pass


def ffmpeg_var() -> bool:
    return shutil.which('ffmpeg') is not None and shutil.which('ffprobe') is not None


def ffmpeg_calistir(argumanlar: list[str]) -> None:
    komut = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *argumanlar]
    sonuc = subprocess.run(komut, capture_output=True, text=True, check=False)
    if sonuc.returncode != 0:
        raise SonIslemHatasi(f'ffmpeg hata verdi: {sonuc.stderr.strip()[-300:]}')


def ses_codec(yol: str) -> str | None:
    komut = ['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name']
    komut += ['-of', 'default=noprint_wrappers=1:nokey=1', yol]
    sonuc = subprocess.run(komut, capture_output=True, text=True, check=False)
    return sonuc.stdout.strip() or None


class SonIslemci:
    def __init__(self, ydl=None):
        self._ydl = ydl

    def ekrana(self, mesaj: str) -> None:
        if self._ydl is not None:
            self._ydl.ekrana(f'[{type(self).__name__}] {mesaj}')

    def run(self, bilgi: dict) -> tuple[list[str], dict]:
        return [], bilgi


class FFmpegSesCikarPP(SonIslemci):
    """Videodaki sesi yeniden kodlamadan (-acodec copy) ayrı dosyaya çıkarır."""

    UZANTILAR = {'aac': 'm4a', 'mp3': 'mp3', 'opus': 'opus', 'vorbis': 'ogg', 'flac': 'flac'}

    def run(self, bilgi):
        yol = bilgi['filepath']
        codec = ses_codec(yol)
        if not codec:
            raise SonIslemHatasi(f'{yol} içinde ses akışı yok')
        uzanti = self.UZANTILAR.get(codec, 'mka')  # Matroska ses kabı her codec'i taşır
        yeni = os.path.splitext(yol)[0] + '.' + uzanti
        if yeni == yol:
            return [], bilgi
        self.ekrana(f'Ses çıkarılıyor ({codec}) -> {yeni}')
        ffmpeg_calistir(['-i', yol, '-vn', '-acodec', 'copy', yeni])
        return [yol], {**bilgi, 'filepath': yeni, 'ext': uzanti, 'vcodec': 'none'}


class FFmpegBirlestirPP(SonIslemci):
    """Ayrı indirilen video ve ses akışlarını tek kaba koyar (yeniden kodlama yok)."""

    def run(self, bilgi):
        parcalar = bilgi['__parca_dosyalari']
        argumanlar, eslemeler = [], []
        for i, (yol, bicim) in enumerate(zip(parcalar, bilgi['requested_formats'])):
            argumanlar += ['-i', yol]
            if bicim.get('vcodec') != 'none':
                eslemeler += ['-map', f'{i}:v:0']
            if bicim.get('acodec') != 'none':
                eslemeler += ['-map', f'{i}:a:0']
        self.ekrana(f'Birleştiriliyor -> {bilgi["filepath"]}')
        ffmpeg_calistir([*argumanlar, *eslemeler, '-c', 'copy', bilgi['filepath']])
        yeni = {k: v for k, v in bilgi.items() if k != '__parca_dosyalari'}
        return list(parcalar), yeni


class BilgiJsonYazPP(SonIslemci):
    """'<ad>.info.json' yazar. (Asıl projede --write-info-json ayrı bir adımdır.)"""

    def run(self, bilgi):
        yol = os.path.splitext(bilgi['filepath'])[0] + '.info.json'
        temiz = {k: v for k, v in bilgi.items() if not k.startswith('_')}
        with open(yol, 'w', encoding='utf-8') as dosya:
            json.dump(temiz, dosya, ensure_ascii=False, indent=2, default=str)
        self.ekrana(f'Bilgi yazıldı -> {yol}')
        return [], {**bilgi, 'infojson_filename': yol}
