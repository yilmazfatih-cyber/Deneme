#!/usr/bin/env python3
"""beceri — beceri_kiti için komut satırı.

Örnekler (bu klasörden):
  python3 beceri.py dogrula ornek-beceriler/fatura-ozeti
  python3 beceri.py dogrula ornek-beceriler/fatura-ozeti --profil codex-kopya
  python3 beceri.py liste ornek-beceriler
  python3 beceri.py sec "bu faturaların KDV toplamını çıkar" ornek-beceriler
  python3 beceri.py yukle fatura-ozeti references/kdv-oranlari.md --kok ornek-beceriler
  python3 beceri.py paketle ornek-beceriler/commit-mesaji /tmp/paketler
  python3 beceri.py tara ornek-beceriler
  python3 beceri.py tetik ornek-beceriler/commit-mesaji/evals/tetik-sorgulari.json commit-mesaji ornek-beceriler

Güvenilmeyen bir klasörü denetlerken Python'u yalıtılmış kipte çalıştır:
  python3 -I /tam/yol/beceri.py tara /indirilen/beceri
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# -I (yalıtılmış kip) betik klasörünü sys.path'e eklemez; paketi kendimiz ekliyoruz.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from beceri_kiti import (  # noqa: E402
    PROFILLER,
    Oturum,
    Secici,
    beceri_listesi_metni,
    dogrula,
    en_iyiyi_sec,
    kesfet,
    paketle,
    sorgulari_yukle,
    tara,
)
from beceri_kiti.dizin import liste_maliyeti  # noqa: E402


def _dogrula(arg) -> int:
    hata_var = False
    for dizin in arg.dizinler:
        rapor = dogrula(dizin, arg.profil)
        durum = 'GEÇERLİ' if rapor.gecerli else 'GEÇERSİZ'
        print(f'{rapor.beceri}: {durum} ({arg.profil})')
        for bulgu in rapor.bulgular:
            print(f'  {bulgu}')
        hata_var |= not rapor.gecerli
    return 1 if hata_var else 0


def _liste(arg) -> int:
    beceriler, notlar = kesfet(arg.kokler)
    print(beceri_listesi_metni(beceriler))
    print(f'\n{len(beceriler)} beceri, 1. düzey maliyeti ≈ {liste_maliyeti(beceriler)} token (kaba tahmin)')
    for b in beceriler:
        if b.kullanici_cagirir:
            print(f'  (yalnızca /{b.ad} ile: modele gösterilmez)')
    for not_ in notlar:
        print(f'  not: {not_}')
    return 0


def _sec(arg) -> int:
    beceriler, _ = kesfet(arg.kokler)
    secim = Secici(beceriler).sec(arg.gorev, k=arg.k, esik=arg.esik)
    if not secim:
        print('Uyan beceri yok: model görevi kendi bilgisiyle yapar.')
    for beceri, puan in secim:
        print(f'{beceri.ad}\t{puan:.2f}\t{beceri.aciklama[:80]}')
    return 0


def _yukle(arg) -> int:
    oturum = Oturum(arg.kokler)
    oturum.etkinlestir(arg.ad)
    for kaynak in arg.kaynaklar:
        oturum.kaynak_oku(arg.ad, kaynak)
    oturum.betikleri_listele(arg.ad)
    print(oturum.rapor())
    return 0


def _paketle(arg) -> int:
    zip_yolu, ozet_yolu = paketle(arg.dizin, arg.cikti, arg.profil)
    print(f'paket: {zip_yolu}\nözet:  {ozet_yolu}')
    return 0


def _tara(arg) -> int:
    bulgular = tara(arg.dizin)
    for bulgu in bulgular:
        print(bulgu)
    yuksek = sum(1 for b in bulgular if b.siddet == 'yüksek')
    print(f'\n{len(bulgular)} bulgu, {yuksek} yüksek. Temiz sonuç "güvenli" demek değildir; dosyaları oku.')
    return 1 if yuksek else 0


def _tetik(arg) -> int:
    beceriler, _ = kesfet(arg.kokler)
    hedef = next((b for b in beceriler if b.ad == arg.ad), None)
    if hedef is None:
        print(f'Beceri yok: {arg.ad}', file=sys.stderr)
        return 2
    rakipler = [b for b in beceriler if b.ad != arg.ad]
    adaylar = [hedef.aciklama, *arg.aday]
    sonuc = en_iyiyi_sec(hedef, adaylar, sorgulari_yukle(arg.sorgular), rakipler)
    print(json.dumps(sonuc, ensure_ascii=False, indent=2))
    return 0


def ana(argv: list[str] | None = None) -> int:
    ayristirici = argparse.ArgumentParser(prog='beceri', description='Agent Skills öğrenme araç takımı')
    alt = ayristirici.add_subparsers(dest='komut', required=True)

    p = alt.add_parser('dogrula', help='beceri klasörlerini doğrula')
    p.add_argument('dizinler', nargs='+')
    p.add_argument('--profil', default='spec', choices=sorted(PROFILLER))
    p.set_defaults(is_=_dogrula)

    p = alt.add_parser('liste', help='modele gösterilecek beceri listesini (1. düzey) yaz')
    p.add_argument('kokler', nargs='+')
    p.set_defaults(is_=_liste)

    p = alt.add_parser('sec', help='bir görev için beceri seç')
    p.add_argument('gorev')
    p.add_argument('kokler', nargs='+')
    p.add_argument('-k', type=int, default=3)
    p.add_argument('--esik', type=float, default=1.0)
    p.set_defaults(is_=_sec)

    p = alt.add_parser('yukle', help='beceriyi etkinleştir, kaynak oku, bağlam günlüğünü göster')
    p.add_argument('ad')
    p.add_argument('kaynaklar', nargs='*', help='beceri klasörüne göre kaynak yolları')
    p.add_argument('--kok', dest='kokler', action='append', required=True)
    p.set_defaults(is_=_yukle)

    p = alt.add_parser('paketle', help='.skill paketi ve SHA-256 özeti üret')
    p.add_argument('dizin')
    p.add_argument('cikti')
    p.add_argument('--profil', default='spec', choices=sorted(PROFILLER))
    p.set_defaults(is_=_paketle)

    p = alt.add_parser('tara', help='üçüncü taraf beceriyi güvenlik kalıplarına karşı tara')
    p.add_argument('dizin')
    p.set_defaults(is_=_tara)

    p = alt.add_parser('tetik', help='aday açıklamaları eğitim/test bölmesiyle karşılaştır')
    p.add_argument('sorgular', help='[{"query", "should_trigger"}] biçiminde JSON')
    p.add_argument('ad')
    p.add_argument('kokler', nargs='+')
    p.add_argument('--aday', action='append', default=[], help='denenecek başka bir açıklama (tekrarlanabilir)')
    p.set_defaults(is_=_tetik)

    arg = ayristirici.parse_args(argv)
    return arg.is_(arg)


if __name__ == '__main__':
    sys.exit(ana())
