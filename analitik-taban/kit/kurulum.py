#!/usr/bin/env python3
"""Çalışma alanı kurulumu ve durum.

python3 kit/kurulum.py baslat [--demo]   yerel/ klasörünü ve örnek dosyaları oluşturur
python3 kit/kurulum.py baglam            CLAUDE.local.md bağlam dosyasını yeniden üretir
python3 kit/kurulum.py durum             neyin hazır olduğunu söyler (gizli değer göstermez)
python3 kit/kurulum.py test              birim testleri çalıştırır
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analitik import (
    SURUM,  # noqa: E402
    boru_kapandi,
    sozluk,  # noqa: E402
    utf8_cikti,
)
from analitik import ayarlar as A  # noqa: E402
from analitik import baglam as baglam_modulu  # noqa: E402

KIT = Path(__file__).resolve().parent
ORNEK = KIT / "ornekler"
ALT_DIZINLER = ("veri", "onbellek", "girdi", "raporlar")
KOPYALAR = {
    "ayarlar.json": "ayarlar.json",
    "env.ornek": ".env",
    "notlar.md": "notlar.md",
    "metrikler.md": "metrikler.md",
    "temalar.json": "temalar.json",
}


def baglam(sessiz: bool = False) -> Path:
    yol = baglam_modulu.yaz(A.yukle())
    if not sessiz:
        print(f"Bağlam yazıldı: {A.goreli(yol)} ({len(yol.read_text(encoding='utf-8').split())} kelime)")
    return yol


def baslat(demo: bool) -> None:
    yerel = A.yerel_dizin()
    yerel.mkdir(parents=True, exist_ok=True)
    for ad in ALT_DIZINLER:
        (yerel / ad).mkdir(exist_ok=True)
    olusan = []
    for kaynak, hedef in KOPYALAR.items():
        hedef_yol = yerel / hedef
        if not hedef_yol.exists():
            shutil.copyfile(ORNEK / kaynak, hedef_yol)
            olusan.append(hedef)
    if demo:
        from analitik import demo as D

        D.calisma_alani_kur(yerel)
        olusan.append("demo verisi (ayarlar, sözlük, örnek anket)")
    baglam(sessiz=True)
    print(f"yerel/ hazır ({A.goreli(yerel)}). Oluşturulan: {', '.join(olusan) or 'yok (zaten vardı)'}")
    if demo:
        print("Demo modu açık: tüm Mixpanel/Hotjar çağrıları sentetik veriden yanıtlanır (şirket verisi yok).")
    else:
        print("Sıradaki adım: yerel/.env dosyasını kendi düzenleyicinizde doldurun, sonra: python3 kit/mp.py kontrol")


def durum() -> None:
    ayar = A.yukle()
    yerel = A.yerel_dizin()
    var = lambda b: "var" if b else "YOK"  # noqa: E731
    print(f"Analitik taban {SURUM} · Python {sys.version.split()[0]} · yerel/: {var(yerel.exists())}")
    if not yerel.exists():
        print("Sıradaki adım: python3 kit/kurulum.py baslat  (denemek için: --demo)")
        return
    mp = ayar["mixpanel"]
    sa = ayar.gizli("MIXPANEL_SA_USER") and ayar.gizli("MIXPANEL_SA_SECRET")
    eski = ayar.gizli("MIXPANEL_API_SECRET")
    proje = mp.get("proje_id") or ayar.gizli("MIXPANEL_PROJECT_ID")
    print(
        f"Mod: {'DEMO' if ayar.demo else mp.get('kaynak', 'api')} · bölge {mp.get('bolge')} · proje ID {var(proje)} · "
        f"service account {var(sa)} · API secret {var(eski)}"
    )
    hj = ayar["hotjar"]
    hj_anahtar = ayar.gizli("HOTJAR_CLIENT_ID") and ayar.gizli("HOTJAR_CLIENT_SECRET")
    print(f"Hotjar: {hj.get('kaynak')} · site ID {var(hj.get('site_id'))} · API anahtarı {var(hj_anahtar)}")
    s = sozluk.yukle(ayar)
    print(
        f"Sözlük: {(str(len(s['olaylar'])) + ' olay, ' + s.get('olusturma', '?')[:10]) if s else 'YOK'} · "
        f"KPI: {len(ayar.get('kpiler') or [])} · huni: {len(ayar.get('huniler') or {})} · "
        f"CLAUDE.local.md: {var(baglam_modulu.yol().exists())}"
    )
    girdi = sorted(p.name for p in (yerel / "girdi").glob("*") if p.is_file()) if (yerel / "girdi").exists() else []
    if girdi:
        print("girdi/: " + ", ".join(girdi[:10]) + (f" (+{len(girdi) - 10})" if len(girdi) > 10 else ""))
    if not ayar.demo and mp.get("kaynak") == "api" and not (sa or eski):
        print("Sıradaki adım: yerel/.env içine Mixpanel service account bilgilerini yazın.")
    elif not s:
        print("Sıradaki adım: python3 kit/mp.py sozluk")


def test() -> None:
    sonuc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(KIT / "tests"), "-t", str(KIT)],
        capture_output=True,
        text=True,
    )
    satirlar = (sonuc.stderr or sonuc.stdout).strip().splitlines()
    print("\n".join(satirlar[-3:] if sonuc.returncode == 0 else satirlar[-40:]))
    sys.exit(sonuc.returncode)


def main(argv=None) -> int:
    utf8_cikti()
    ap = argparse.ArgumentParser(
        prog="kurulum.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    alt = ap.add_subparsers(dest="komut", required=True)
    b = alt.add_parser("baslat", help="yerel/ klasörünü oluştur")
    b.add_argument("--demo", action="store_true", help="sentetik veriyle demo modu")
    alt.add_parser("baglam", help="CLAUDE.local.md bağlamını yeniden üret")
    alt.add_parser("durum", help="kurulum durumu")
    alt.add_parser("test", help="birim testleri çalıştır")
    alt.add_parser("surum", help="taban sürümü")
    arg = ap.parse_args(argv)
    try:
        if arg.komut == "baslat":
            baslat(arg.demo)
        elif arg.komut == "baglam":
            baglam()
        elif arg.komut == "durum":
            durum()
        elif arg.komut == "test":
            test()
        elif arg.komut == "surum":
            print(SURUM)
    except BrokenPipeError:
        return boru_kapandi()
    except (A.AyarHatasi, json.JSONDecodeError) as hata:
        print(f"HATA: {hata}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
