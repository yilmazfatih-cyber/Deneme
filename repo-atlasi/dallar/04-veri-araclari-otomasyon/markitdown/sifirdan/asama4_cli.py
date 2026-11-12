"""Aşama 4 — komut satırı (asıl projedeki `markitdown` komutunun küçük karşılığı).

Örnekler:
  python3 asama4_cli.py rapor.docx                 # Markdown'ı ekrana yaz
  python3 asama4_cli.py rapor.docx -o rapor.md     # dosyaya yaz
  cat veri.csv | python3 asama4_cli.py -x .csv     # stdin + uzantı ipucu
  python3 asama4_cli.py --eklenti benim_eklentim veri.tsv
  python3 asama4_cli.py --listele                  # dönüştürücüleri deneme sırasıyla göster
"""

from __future__ import annotations

import argparse
import sys

from asama1_cekirdek import AkisBilgisi, MarkItDownHatasi, MiniMarkItDown


def main(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(description='Dosyaları Markdown\'a çevirir (eğitim amaçlı mini markitdown)')
    ayristirici.add_argument('dosya', nargs='?', help='girdi dosyası; verilmezse stdin okunur')
    ayristirici.add_argument('-o', '--cikti', help='çıktı dosyası (verilmezse stdout)')
    ayristirici.add_argument('-x', '--uzanti', help='uzantı ipucu, ör. .csv (stdin için yararlı)')
    ayristirici.add_argument('-m', '--mime', help='MIME ipucu, ör. text/html')
    ayristirici.add_argument('-c', '--charset', help='karakter kümesi ipucu, ör. cp1254')
    ayristirici.add_argument('--eklenti', action='append', default=[], help='register_converters içeren modül')
    ayristirici.add_argument('--listele', action='store_true', help='kayıtlı dönüştürücüleri listele')
    args = ayristirici.parse_args(argv)

    md = MiniMarkItDown(eklentiler=args.eklenti or False)
    if args.listele:
        for kayit in md.sirali_kayitlar():
            print(f'{kayit.oncelik:5.1f}  {type(kayit.donusturucu).__name__}')
        return 0

    uzanti = args.uzanti if not args.uzanti or args.uzanti.startswith('.') else '.' + args.uzanti
    ipucu = AkisBilgisi(uzanti=uzanti, mimetype=args.mime, charset=args.charset)
    try:
        if args.dosya:
            sonuc = md.convert_local(args.dosya, ipucu)
        else:
            sonuc = md.convert_stream(sys.stdin.buffer, ipucu)
    except MarkItDownHatasi as hata:
        print(f'hata: {hata}', file=sys.stderr)
        return 1

    if args.cikti:
        with open(args.cikti, 'w', encoding='utf-8') as dosya:
            dosya.write(sonuc.markdown)
    else:
        sys.stdout.write(sonuc.markdown)
    return 0


if __name__ == '__main__':
    sys.exit(main())
