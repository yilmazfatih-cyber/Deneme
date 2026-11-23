#!/usr/bin/env python3
"""Tarif çalıştırıcı: havuzdaki temelleri birbirine bağlayan uçtan uca tarifleri listeler, kurar, doğrular.

Kullanım (depo kökünden ya da bu klasörden; yalnız Python standart kütüphanesi gerekir):
  python havuz/tarifler/tarif.py liste
  python havuz/tarifler/tarif.py kur belgeye-soru-uygulamasi ../sor-projem     # hedefe uygula + kur
  python havuz/tarifler/tarif.py dogrula csvden-tahmin-servisi                  # geçici klasörde kur+doğrula+sil
  python havuz/tarifler/tarif.py dogrula --hepsi --json sonuc.json              # bütün tarifler (uzun)
  python havuz/tarifler/tarif.py bicim                                          # hızlı biçim kuralları
  python havuz/tarifler/tarif.py yakala <tarif> <çalışma klasörü>               # elle değişikliği dosyalar/'a al

`dogrula` geçici klasörü `--calisma` (ya da TARIF_CALISMA) altında açar; `--tut` verilmezse sonunda siler.
Çıkış kodu: 0 başarı, 1 başarısız adım, 2 kullanım hatası.
Genişletme: yeni alt komut → `ayristirici_kur`'a parser + `komut_<ad>` işlevi + KOMUTLAR'a kayıt +
tests/test_cli.py'ye bir çağrı testi.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tarifcik.bicim import tum_sorunlar
from tarifcik.yerlestir import yakala
from tarifcik.yollar import Tarif, TarifHatasi, tarif_sec, tarifleri_bul


def komut_liste(_args: argparse.Namespace) -> int:
    tarifler = tarifleri_bul()
    genislik = max((len(t.ad) for t in tarifler), default=10)
    print(f"{'TARİF':<{genislik}}  {'TEMELLER':<22} {'SÜRE':<10} {'ZORLUK':<6}  BAŞLIK")
    for tarif in tarifler:
        temeller = " + ".join(tarif.temeller)
        print(
            f"{tarif.ad:<{genislik}}  {temeller:<22} {tarif.sure:<10} {tarif.zorluk:<6}  {tarif.baslik}"
        )
    print(f"\n{len(tarifler)} tarif. Ayrıntı: her tarifin README.md dosyası.")
    return 0


def _betik(tarif: Tarif, ad: str, proje: Path, ortam: dict[str, str] | None = None) -> int:
    komut = [sys.executable, str(tarif.klasor / ad), str(proje)]
    return subprocess.run(komut, check=False, env=ortam).returncode


def komut_kur(args: argparse.Namespace) -> int:
    tarif = tarif_sec(args.tarif)
    hedef = Path(args.hedef).expanduser().resolve()
    if hedef.exists() and any(hedef.iterdir()):
        print(f"Hedef boş değil: {hedef}. Yeni (ya da boş) bir klasör verin.", file=sys.stderr)
        return 2
    kod = _betik(tarif, "uygula.py", hedef)
    if kod == 0:
        print(f"\nKuruldu: {hedef}\nDoğrulamak için: python {tarif.klasor / 'dogrula.py'} {hedef}")
    return kod


def _dogrula_bir(tarif: Tarif, calisma: Path, tut: bool) -> dict[str, object]:
    kok = Path(tempfile.mkdtemp(prefix=f"{tarif.ad}-", dir=calisma))
    proje = kok / "proje"
    baslangic = time.monotonic()
    sonuc: dict[str, object] = {"tarif": tarif.ad, "klasor": str(proje)}
    for asama in ("uygula.py", "dogrula.py"):
        rapor = kok / f"{asama}.json"
        kod = _betik(tarif, asama, proje, dict(os.environ, TARIF_JSON=str(rapor)))
        if rapor.exists():
            sonuc[asama] = json.loads(rapor.read_text(encoding="utf-8"))
        if kod != 0:
            sonuc["basarili"] = False
            break
    else:
        sonuc["basarili"] = True
    sonuc["sure_sn"] = round(time.monotonic() - baslangic, 1)
    if tut:
        print(f"\nKurulum yerinde bırakıldı (--tut): {proje}")
    else:
        shutil.rmtree(kok, ignore_errors=True)
    return sonuc


def komut_dogrula(args: argparse.Namespace) -> int:
    if not args.hepsi and not args.tarif:
        print("Bir tarif adı ya da --hepsi verin (liste: python tarif.py liste).", file=sys.stderr)
        return 2
    tarifler = tarifleri_bul() if args.hepsi else [tarif_sec(args.tarif)]
    calisma = Path(args.calisma or os.environ.get("TARIF_CALISMA") or tempfile.gettempdir())
    calisma.mkdir(parents=True, exist_ok=True)
    sonuclar = [_dogrula_bir(tarif, calisma.resolve(), args.tut) for tarif in tarifler]
    print(f"\n{'=' * 78}\nTARİF DOĞRULAMA ÖZETİ\n{'=' * 78}")
    for sonuc in sonuclar:
        isaret = "✓" if sonuc["basarili"] else "✗"
        print(f"{isaret} {sonuc['tarif']:<32} {sonuc['sure_sn']:>8} sn")
    if args.json:
        Path(args.json).write_text(
            json.dumps(sonuclar, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Ayrıntılı sonuç: {args.json}")
    return 0 if all(s["basarili"] for s in sonuclar) else 1


def komut_bicim(_args: argparse.Namespace) -> int:
    sorunlar = tum_sorunlar()
    for sorun in sorunlar:
        print(f"- {sorun}")
    print("Biçim kuralları tutuyor." if not sorunlar else f"\n{len(sorunlar)} sorun.")
    return 0 if not sorunlar else 1


def komut_yakala(args: argparse.Namespace) -> int:
    tarif = tarif_sec(args.tarif)
    yazilan = yakala(tarif, Path(args.calisma).expanduser().resolve())
    for yol in yazilan:
        print(f"  dosyalar/{yol}")
    print(f"{len(yazilan)} dosya yazıldı → {tarif.dosyalar}. Şimdi: python tarif.py bicim")
    return 0


KOMUTLAR: dict[str, Callable[[argparse.Namespace], int]] = {
    "liste": komut_liste,
    "kur": komut_kur,
    "dogrula": komut_dogrula,
    "bicim": komut_bicim,
    "yakala": komut_yakala,
    # YENİ KOMUT BURAYA
}


def ayristirici_kur() -> argparse.ArgumentParser:
    ana = argparse.ArgumentParser(prog="python tarif.py", description="Uçtan uca tarifler.")
    alt = ana.add_subparsers(dest="komut", required=True, metavar="<komut>")
    alt.add_parser("liste", help="tarifleri listele")
    kur = alt.add_parser("kur", help="tarifi hedef klasöre uygula ve kur")
    kur.add_argument("tarif")
    kur.add_argument("hedef", help="yeni proje klasörü (yok ya da boş olmalı)")
    dogrula = alt.add_parser("dogrula", help="geçici klasörde kur + doğrula + sil")
    dogrula.add_argument("tarif", nargs="?")
    dogrula.add_argument("--hepsi", action="store_true", help="bütün tarifler")
    dogrula.add_argument("--tut", action="store_true", help="geçici kurulumu silme")
    dogrula.add_argument(
        "--calisma", help="geçici klasörlerin açılacağı yer (varsayılan: sistem geçici)"
    )
    dogrula.add_argument("--json", help="sonuçları bu dosyaya JSON olarak yaz")
    alt.add_parser("bicim", help="hızlı biçim kurallarını denetle (ağsız, saniyeler)")
    yak = alt.add_parser("yakala", help="çalışma kopyasındaki değişiklikleri dosyalar/'a yaz")
    yak.add_argument("tarif")
    yak.add_argument("calisma", help="tarifin uygulandığı ve elle değiştirildiği klasör")
    return ana


def main(argv: list[str] | None = None) -> int:
    args = ayristirici_kur().parse_args(argv)
    try:
        return KOMUTLAR[args.komut](args)
    except TarifHatasi as hata:
        print(f"Hata: {hata}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
