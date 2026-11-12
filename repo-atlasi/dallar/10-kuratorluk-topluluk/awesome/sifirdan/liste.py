"""liste — liste araçlarının komut satırı arayüzü.

    python3 liste.py denetle README.md [--hazir fpb] [--yerel tr] [--json]
    python3 liste.py baglanti README.md [--eszamanli 8] [--durum durum.json] [--json]
    python3 liste.py uret ornekler/turkce-kaynaklar.json [-o README.md] [--denetle]
    python3 liste.py ceviri --matris docs/
    python3 liste.py ceviri --temel README.md i18n/tr_TR.md i18n/de_DE.md

Çıkış kodu: 0 = temiz, 1 = hata bulundu (CI'da iş akışını kırmızıya çevirir).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from dataclasses import asdict, replace
from pathlib import Path

from asama1_ayristirici import ayristir
from asama2_denetim import HAZIR_AYARLAR, bicimle, denetle
from asama3_baglanti import SAGLIKLI, durum_guncelle, hepsini_kontrol_et, kaldirma_adaylari
from asama4_uretici import VeriHatasi, dosyadan_uret, tazelik_farki
from asama5_ceviri import dil_matrisi, eksikler, karsilastir


def _oku(yol: str) -> str:
    return Path(yol).read_text(encoding="utf-8")


def komut_denetle(arg: argparse.Namespace) -> int:
    ayar = HAZIR_AYARLAR[arg.hazir]
    if arg.yerel:
        ayar = replace(ayar, yerel=arg.yerel)
    if arg.isaret is not None:
        ayar = replace(ayar, madde_isareti=arg.isaret)
    bulgular = denetle(_oku(arg.dosya), ayar)
    if arg.json:
        print(json.dumps([asdict(b) for b in bulgular], ensure_ascii=False, indent=2))
    elif bulgular:
        print(bicimle(bulgular, arg.dosya))
    hata = sum(1 for b in bulgular if b.onem == "hata")
    print(f"{len(bulgular)} bulgu ({hata} hata, {len(bulgular) - hata} uyarı)", file=sys.stderr)
    return 1 if hata else 0


def komut_baglanti(arg: argparse.Namespace) -> int:
    belge = ayristir(_oku(arg.dosya))
    urller = [g.url for g in belge.girdiler if g.url.startswith(("http://", "https://"))]
    sonuclar = hepsini_kontrol_et(
        urller, eszamanli=arg.eszamanli, alan_basina=arg.alan_basina, zaman_asimi=arg.zaman_asimi
    )
    sorunlu = [s for s in sonuclar if s.sinif not in SAGLIKLI]
    if arg.json:
        print(json.dumps([asdict(s) for s in sonuclar], ensure_ascii=False, indent=2))
    else:
        for s in sorunlu:
            print(f"{s.sinif:16} {s.durum or '-':>4}  {s.url}  {s.aciklama}")
    if arg.durum:
        eski = json.loads(_oku(arg.durum)) if Path(arg.durum).exists() else {}
        yeni = durum_guncelle(eski, sonuclar, arg.bugun or dt.date.today().isoformat())
        Path(arg.durum).write_text(json.dumps(yeni, ensure_ascii=False, indent=2, sort_keys=True) + "\n", "utf-8")
        for url in kaldirma_adaylari(yeni):
            print(f"KALDIRMA ADAYI  {url}", file=sys.stderr)
    print(f"{len(set(urller))} adres, {len(sorunlu)} sorunlu", file=sys.stderr)
    return 1 if any(s.sinif not in SAGLIKLI | {"ENGELLI"} for s in sonuclar) else 0


def komut_uret(arg: argparse.Namespace) -> int:
    try:
        metin = dosyadan_uret(arg.veri)
    except VeriHatasi as hata:
        print("Veri hatalı:\n- " + "\n- ".join(hata.hatalar), file=sys.stderr)
        return 1
    if arg.denetle:
        fark = tazelik_farki(_oku(arg.cikti) if arg.cikti and Path(arg.cikti).exists() else "", metin)
        if fark:
            print(fark)
            print("README güncel değil: 'liste.py uret' ile yeniden üret.", file=sys.stderr)
            return 1
        return 0
    if arg.cikti:
        Path(arg.cikti).write_text(metin, encoding="utf-8")
    else:
        print(metin, end="")
    return 0


def komut_ceviri(arg: argparse.Namespace) -> int:
    if arg.matris:
        adlar = sorted(p.name for p in Path(arg.matris).glob("*.md"))
        for dil, eksik in eksikler(dil_matrisi(adlar)).items():
            print(f"{dil:6} eksik: {', '.join(eksik)}")
        return 0
    if not arg.temel:
        print("--temel ya da --matris gerekli", file=sys.stderr)
        return 2
    temel = _oku(arg.temel)
    for yol in arg.ceviriler:
        rapor = karsilastir(temel, _oku(yol))
        durum = "gözden geçir" if rapor["uyarilar"] else "tamam"
        print(f"{yol}: {durum}")
        for uyari in rapor["uyarilar"]:
            print(f"  - {uyari}")
    return 0


def ayrastirici() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="liste", description="Liste araçları: denetle, baglanti, uret, ceviri")
    alt = ap.add_subparsers(dest="komut", required=True)

    d = alt.add_parser("denetle", help="Markdown listesini kurallara göre denetle")
    d.add_argument("dosya")
    d.add_argument("--hazir", choices=sorted(HAZIR_AYARLAR), default="varsayilan", help="hazır kural seti")
    d.add_argument("--yerel", choices=["en", "tr", "bayt"], help="alfabetik sıra dili")
    d.add_argument("--isaret", help="beklenen madde işareti ('-' ya da '*'; boş = serbest)")
    d.add_argument("--json", action="store_true")
    d.set_defaults(islev=komut_denetle)

    b = alt.add_parser("baglanti", help="listedeki adresleri paralel denetle")
    b.add_argument("dosya")
    b.add_argument("--eszamanli", type=int, default=8)
    b.add_argument("--alan-basina", type=int, default=2)
    b.add_argument("--zaman-asimi", type=float, default=5.0)
    b.add_argument("--durum", help="ardışık hata sayaçlarının tutulduğu JSON dosyası")
    b.add_argument("--bugun", help="YYYY-AA-GG (testler için)")
    b.add_argument("--json", action="store_true")
    b.set_defaults(islev=komut_baglanti)

    u = alt.add_parser("uret", help="JSON veriden README üret")
    u.add_argument("veri")
    u.add_argument("-o", "--cikti")
    u.add_argument("--denetle", action="store_true", help="dosya güncel değilse 1 ile çık")
    u.set_defaults(islev=komut_uret)

    c = alt.add_parser("ceviri", help="çeviri kapsamını raporla")
    c.add_argument("--matris", metavar="KLASOR", help="AD-dil.md dosyalarından eksik çeviri tablosu")
    c.add_argument("--temel", help="karşılaştırmada kaynak metin")
    c.add_argument("ceviriler", nargs="*")
    c.set_defaults(islev=komut_ceviri)
    return ap


def main(argv: list[str] | None = None) -> int:
    arg = ayrastirici().parse_args(argv)
    return arg.islev(arg)


if __name__ == "__main__":
    sys.exit(main())
