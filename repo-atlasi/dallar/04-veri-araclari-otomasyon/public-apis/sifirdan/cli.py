"""Komut satırı: python3 cli.py <komut> README.md

Komutlar:
  dogrula    biçim kurallarını denetler (CI'daki format.py'nin karşılığı)
  tekrarlar  tekrar eden linkleri listeler (links.py --only_duplicate_links_checker)
  linkler    linklerin canlı olup olmadığını eş zamanlı dener (ağ gerektirir!)
  json       README'yi JSON'a aktarır

Hata bulunursa çıkış kodu 1 olur; böylece CI adımı kırmızıya döner.
"""

from __future__ import annotations

import argparse
import json
import sys

from asama1_ayristir import dosyadan_ayristir
from asama2_dogrula import belgeyi_denetle
from asama3_linkler import linkleri_bul, linkleri_denetle, tekrarlari_bul
from asama4_json import disa_aktar, json_yaz


def main(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(description='public-apis biçiminde README araçları (eğitim amaçlı)')
    alt = ayristirici.add_subparsers(dest='komut', required=True)

    p = alt.add_parser('dogrula', help='biçim kurallarını denetle')
    p.add_argument('dosya')
    p.add_argument('--tum-dosya', action='store_true', help="asıl betik gibi tüm '###' başlıklarını kategori say")

    p = alt.add_parser('tekrarlar', help='tekrar eden linkler')
    p.add_argument('dosya')

    p = alt.add_parser('linkler', help='linkleri eş zamanlı dene')
    p.add_argument('dosya')
    p.add_argument('--es-zamanli', type=int, default=8)
    p.add_argument('--host-basina', type=int, default=2)
    p.add_argument('--zaman-asimi', type=float, default=10.0)
    p.add_argument('--sinir', type=int, default=0, help='yalnızca ilk N linki dene (0 = hepsi)')

    p = alt.add_parser('json', help='JSON dışa aktar')
    p.add_argument('dosya')
    p.add_argument('-o', '--cikti', help='yazılacak dosya (verilmezse stdout)')

    args = ayristirici.parse_args(argv)

    if args.komut == 'dogrula':
        hatalar = belgeyi_denetle(dosyadan_ayristir(args.dosya, tum_dosya=args.tum_dosya))
        for hata in hatalar:
            print(hata)
        print(f'{len(hatalar)} hata bulundu.' if hatalar else 'Biçim kurallarına uygun.')
        return 1 if hatalar else 0

    with open(args.dosya, encoding='utf-8') as dosya:
        metin = dosya.read()

    if args.komut == 'tekrarlar':
        tekrarlar = tekrarlari_bul(linkleri_bul(metin))
        for link in tekrarlar:
            print(link)
        print(f'{len(tekrarlar)} tekrar eden link.' if tekrarlar else 'Tekrar eden link yok.')
        return 1 if tekrarlar else 0

    if args.komut == 'linkler':
        linkler = linkleri_bul(metin)
        if args.sinir:
            linkler = linkler[: args.sinir]
        print(f'{len(linkler)} link deneniyor...', file=sys.stderr)
        sonuclar = linkleri_denetle(linkler, args.es_zamanli, args.host_basina, args.zaman_asimi)
        kiriklar = [s for s in sonuclar if s.kirik]
        for sonuc in kiriklar:
            print(sonuc)
        print(f'{len(kiriklar)} / {len(sonuclar)} link sorunlu.')
        return 1 if kiriklar else 0

    belge = dosyadan_ayristir(args.dosya)
    if args.cikti:
        veri = json_yaz(belge, args.cikti)
        print(f'{veri["kayit_sayisi"]} kayıt, {veri["kategori_sayisi"]} kategori -> {args.cikti}')
    else:
        print(json.dumps(disa_aktar(belge), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
