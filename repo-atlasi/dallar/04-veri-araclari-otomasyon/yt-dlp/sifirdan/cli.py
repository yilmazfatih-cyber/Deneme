"""Komut satırı (yt-dlp seçeneklerinin küçük bir alt kümesi, aynı adlarla).

  python3 cli.py URL                       # varsayılan: bv*+ba/b
  python3 cli.py URL -F                    # formatları listele
  python3 cli.py URL -f "b[height<=480]"   # seçim dili
  python3 cli.py URL -S "res:720,+size"    # sıralama
  python3 cli.py URL -o "%(uploader)s/%(title)s.%(ext)s" -P indirilenler
  python3 cli.py URL -x                    # sesi çıkar (ffmpeg gerekir)
  python3 cli.py URL --limit-rate 200K     # sunucuya nazik ol

Varsayılan olarak yalnızca 127.0.0.1/localhost'a bağlanır (bkz. --allow-host).
"""

from __future__ import annotations

import argparse
import sys

from asama2_format import SAYISAL_ALANLAR, _sayi
from asama3_indirici import boyut_bicimle
from asama5_sonislem import BilgiJsonYazPP, FFmpegSesCikarPP
from asama6_ydl import MiniYDL, YdlHatasi


def ilerleme_yazdir(durum: dict) -> None:
    if durum['status'] == 'downloading':
        toplam = durum.get('total_bytes')
        yuzde = f'{100 * durum["downloaded_bytes"] / toplam:5.1f}%' if toplam else '  ?  '
        hiz = boyut_bicimle(durum.get('speed')) + '/s'
        print(f'\r[indir] {yuzde} / {boyut_bicimle(toplam)}  {hiz}   ', end='', file=sys.stderr)
    elif durum['status'] == 'finished':
        print(f'\r[indir] %100 {boyut_bicimle(durum.get("total_bytes"))}          ', file=sys.stderr)


def formatlari_listele(bilgi: dict) -> None:
    print(f'{"ID":<12}{"UZANTI":<8}{"ÇÖZÜNÜRLÜK":<12}{"TBR":>7}  {"VCODEC":<10}{"ACODEC":<10}{"BOYUT":>10}')
    for f in bilgi['formats']:
        cozunurluk = f'{f["height"]}p' if f.get('height') else ('yalnız ses' if f.get('vcodec') == 'none' else '?')
        print(
            f'{f["format_id"]:<12}{f.get("ext") or "?":<8}{cozunurluk:<12}{f.get("tbr") or "":>7}  '
            f'{f.get("vcodec") or "?":<10}{f.get("acodec") or "?":<10}{boyut_bicimle(f.get("filesize")):>10}'
        )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description='Eğitim amaçlı mini yt-dlp')
    p.add_argument('urller', nargs='+', metavar='URL')
    p.add_argument('-f', '--format', help='format seçimi, ör. "bv*+ba/b"')
    p.add_argument('-S', '--format-sort', default='', help='sıralama alanları, ör. "res:720,+size"')
    p.add_argument('-F', '--list-formats', action='store_true')
    p.add_argument('-o', '--output', default='%(title)s [%(id)s].%(ext)s')
    p.add_argument('-P', '--paths', default='.')
    p.add_argument('-s', '--simulate', action='store_true')
    p.add_argument('-x', '--extract-audio', action='store_true')
    p.add_argument('-k', '--keep-video', action='store_true')
    p.add_argument('--write-info-json', action='store_true')
    p.add_argument('--restrict-filenames', action='store_true')
    p.add_argument('--limit-rate', help='bayt/sn, ör. 500K')
    p.add_argument('--allow-host', action='append', default=[], help='bağlanılabilecek ek sunucu (kendi içeriğiniz)')
    p.add_argument('-q', '--quiet', action='store_true')
    args = p.parse_args(argv)

    alanlar = tuple(a for a in args.format_sort.split(',') if a.strip())
    for alan in alanlar:
        if alan.strip().lstrip('+').split(':')[0] not in {*SAYISAL_ALANLAR, 'hasvid', 'hasaud', 'vcodec', 'ext', 'id'}:
            p.error(f'bilinmeyen sıralama alanı: {alan}')
    params = {
        'format': args.format,
        'format_sort': alanlar,
        'outtmpl': args.output,
        'paths': args.paths,
        'simulate': args.simulate or args.list_formats,
        'keepvideo': args.keep_video,
        'restrictfilenames': args.restrict_filenames,
        'ratelimit': _sayi(args.limit_rate) if args.limit_rate else None,
        'allowed_hosts': ('127.0.0.1', 'localhost', *args.allow_host),
        'quiet': args.quiet,
        'progress_hooks': () if args.quiet else (ilerleme_yazdir,),
    }
    ydl = MiniYDL(params)
    if args.write_info_json:
        ydl.add_post_processor(BilgiJsonYazPP())
    if args.extract_audio:
        ydl.add_post_processor(FFmpegSesCikarPP())

    if args.list_formats:
        for url in args.urller:
            try:
                formatlari_listele(ydl.extract_info(url, download=False))
            except YdlHatasi as hata:
                print(f'HATA: {hata}', file=sys.stderr)
                return 1
        return 0
    return 1 if ydl.download(args.urller) else 0


if __name__ == '__main__':
    sys.exit(main())
