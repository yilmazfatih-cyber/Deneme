#!/usr/bin/env python3
"""superpowers mini'si için komut satırı.

  python3 kos.py transkript --tohum 3            # becerisiz tek koşunun transkripti
  python3 kos.py transkript --tohum 3 --beceriyle
  python3 kos.py karsilastir --kosu 30           # beceriyle/becerisiz tablo (ortalama ± sapma, fark)
  python3 kos.py kirmizi-yesil                   # RED → GREEN kararı
  python3 kos.py ifade                           # aynı yönergenin iki yazımı + kontrol
  python3 kos.py kanca --ortam claude            # oturum başı kancasının JSON çıktısı
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _cekirdek  # noqa: E402,F401
from baslangic_kancasi import oturum_basi  # noqa: E402
from beceri_kiti.onbilgi import oku  # noqa: E402
from degerlendirme import SISTEM_ISTEMI, ifade_karsilastir, karsilastir, kirmizi_yesil, kos, tablo  # noqa: E402
from sahte_model import VARSAYILAN_GOREV  # noqa: E402

KLASOR = Path(__file__).resolve().parent / 'ornek-beceriler'
ORTAMLAR = {
    'claude': {'CLAUDE_PLUGIN_ROOT': '/eklenti'},
    'cursor': {'CURSOR_PLUGIN_ROOT': '/eklenti', 'CLAUDE_PLUGIN_ROOT': '/eklenti'},
    'copilot': {'CLAUDE_PLUGIN_ROOT': '/eklenti', 'COPILOT_CLI': '1'},
    'diger': {},
}


def beceri_metni() -> str:
    return oku((KLASOR / 'test-once' / 'SKILL.md').read_text(encoding='utf-8')).govde


def ana(argv: list[str] | None = None) -> int:
    ayr = argparse.ArgumentParser(prog='kos')
    alt = ayr.add_subparsers(dest='komut', required=True)
    p = alt.add_parser('transkript')
    p.add_argument('--tohum', type=int, default=0)
    p.add_argument('--beceriyle', action='store_true')
    p = alt.add_parser('karsilastir')
    p.add_argument('--kosu', type=int, default=20)
    alt.add_parser('kirmizi-yesil')
    alt.add_parser('ifade')
    p = alt.add_parser('kanca')
    p.add_argument('--ortam', choices=sorted(ORTAMLAR), default='claude')
    p.add_argument('--alt-ajan', action='store_true')
    arg = ayr.parse_args(argv)

    if arg.komut == 'transkript':
        baglam = SISTEM_ISTEMI + ('\n\n' + beceri_metni() if arg.beceriyle else '')
        sonuc, olcum = kos(VARSAYILAN_GOREV, baglam, arg.tohum)
        print(sonuc.metin)
        print(f'\n{olcum}  geçti={olcum.gecti}')
    elif arg.komut == 'karsilastir':
        print(tablo(karsilastir(beceri_metni(), kosu=arg.kosu)))
    elif arg.komut == 'kirmizi-yesil':
        sonuc = kirmizi_yesil(beceri_metni())
        print(f'{sonuc["karar"]} (becerisiz {sonuc["becerisiz"]:.2f}, beceriyle {sonuc["beceriyle"]:.2f})')
    elif arg.komut == 'ifade':
        varyantlar = {
            'yasak biçimi': 'Test yazmadan kod yazma.',
            'tarif biçimi': 'Önce başarısız bir test yaz, sonra kodu.',
        }
        for ad, ist in ifade_karsilastir(varyantlar).items():
            print(f'{ad:24} test_once = {ist["ortalama"]:.2f} ± {ist["sapma"]:.2f}')
    elif arg.komut == 'kanca':
        oturum = {'parentID': 'ust-oturum'} if arg.alt_ajan else {}
        cikti = oturum_basi(KLASOR / 'beceri-kullanimi', ORTAMLAR[arg.ortam], oturum)
        print(cikti if cikti is not None else '(alt ajan: enjeksiyon yok)')
        if cikti:
            print('\nalanlar:', list(json.loads(cikti)))
    return 0


if __name__ == '__main__':
    sys.exit(ana())
