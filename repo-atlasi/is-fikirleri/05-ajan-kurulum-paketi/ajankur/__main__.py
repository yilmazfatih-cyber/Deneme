"""Komut satırı: python3 -m ajankur {analiz,uret,denetle} ...

Çıkış kodları: 0 başarı (denetle: HATA yok), 1 denetle HATA buldu, 2 kullanım hatası (yol yok vb.).
"""

from __future__ import annotations

import argparse
import json
import sys

from .analiz import analiz_et, rapor
from .denetle import denetle
from .denetle import rapor as denetim_raporu
from .uret import uret


def ana(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python3 -m ajankur", description="AI kodlama ajanı kurulum paketi")
    alt = p.add_subparsers(dest="komut", required=True)
    a = alt.add_parser("analiz", help="depodaki yığını ve komutları tespit et (salt okunur)")
    a.add_argument("depo")
    a.add_argument("--json", action="store_true")
    u = alt.add_parser("uret", help="AGENTS.md, CLAUDE.md, beceriler, kanca ve rehber üret")
    u.add_argument("depo")
    u.add_argument("--cikti", help="dosyaları depo yerine bu klasöre yaz (önizleme)")
    u.add_argument("--dil", choices=("tr", "en"), default="tr")
    u.add_argument("--beceri-dizini", default=".agents/skills", help="ör. .claude/skills ya da .opencode/skills")
    u.add_argument("--uzerine-yaz", action="store_true", help="var olan dosyaların üzerine yaz")
    d = alt.add_parser("denetle", help="becerileri, kancaları ve MCP ayarını denetle; HATA varsa çıkış kodu 1")
    d.add_argument("yol")
    d.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    try:
        if args.komut == "analiz":
            sonuc = analiz_et(args.depo)
            print(json.dumps(sonuc.sozluk(), ensure_ascii=False, indent=2) if args.json else rapor(sonuc))
            return 0
        if args.komut == "uret":
            for yazim in uret(analiz_et(args.depo), args.cikti, args.dil, args.beceri_dizini, args.uzerine_yaz):
                print(f"{yazim.durum:<10} {yazim.yol}" if len(yazim.durum) <= 10 else f"{yazim.yol}: {yazim.durum}")
            return 0
        bulgular = denetle(args.yol)
    except OSError as hata:  # yol yok, klasör değil, yazma izni yok...
        print(f"ajankur: {hata}", file=sys.stderr)  # CI'de yanlış yol "temiz" sanılmasın
        return 2
    print(denetim_raporu(bulgular, args.json))
    return 1 if any(b.seviye == "HATA" for b in bulgular) else 0


if __name__ == "__main__":
    sys.exit(ana())
