#!/usr/bin/env python3
"""Tek komutla deneme: dil-modeli sunucusunu başlatır, yz ile bağlanır, sohbet + değerlendirme koşar.

Kullanım (proje kökünden; yalnız standart kütüphane, iki temelin .venv'i kurulu olmalı):
    python baglanti/dene.py                       # örnek model, boş bir kapı
    python baglanti/dene.py --model dil-modeli/calisma/benim/en-iyi --sinir 10
Ne yapar: 1) `dil_modeli sun` boş kapıda başlar  2) yz/yz.dil-modeli.yaml'ın kapısı değiştirilmiş kopyası
baglanti/calisma/yz.yaml'a yazılır  3) `yz modeller`, `yz sohbet -m`, `yz degerlendir` koşar  4) sunucu
kapanır. Değerlendirme raporu: baglanti/calisma/degerlendirme/rapor.md. Çıkış kodu: bir adım kalırsa 1.
Genişletme: yeni bir yz komutu denemek için `ADIMLAR` listesine bir satır ekleyin.
"""

from __future__ import annotations

import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJE = Path(__file__).resolve().parent.parent
CALISMA = PROJE / "baglanti" / "calisma"
SORU = "Merhaba, bana kısaca kendini tanıtır mısın?"


def python(temel: str) -> str:
    alt = "Scripts/python.exe" if os.name == "nt" else "bin/python"
    yol = PROJE / temel / ".venv" / alt
    if not yol.exists():
        raise SystemExit(f"{yol} yok: önce {temel} temelinin ortamını kurun (tarifin uygula.py'si).")
    return str(yol)


def bos_kapi() -> int:
    with socket.socket() as soket:
        soket.bind(("127.0.0.1", 0))
        return int(soket.getsockname()[1])


def hazir_bekle(url: str, surec: subprocess.Popen[bytes], sure_sn: float = 180.0) -> None:
    son = time.monotonic() + sure_sn
    while time.monotonic() < son:
        if surec.poll() is not None:
            raise SystemExit(f"Model sunucusu kapandı; günlük: {CALISMA / 'sunucu.log'}")
        try:
            with urllib.request.urlopen(url, timeout=5) as yanit:  # noqa: S310 - yerel adres
                if yanit.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            time.sleep(0.5)
    raise SystemExit(f"Model sunucusu {sure_sn:.0f} sn'de hazır olmadı ({url}).")


def main(argv: list[str]) -> int:
    ayr = argparse.ArgumentParser(description="dil-modeli sunucusu + yz istemcisi deneme hattı.")
    ayr.add_argument("--model", default=str(PROJE / "dil-modeli" / "ornek-model"), help="model klasörü")
    ayr.add_argument("--sinir", type=int, default=5, help="değerlendirilecek örnek sayısı")
    secenek = ayr.parse_args(argv)
    CALISMA.mkdir(parents=True, exist_ok=True)
    kapi = bos_kapi()
    ayar = (PROJE / "yz" / "yz.dil-modeli.yaml").read_text(encoding="utf-8")
    (CALISMA / "yz.yaml").write_text(ayar.replace("127.0.0.1:8430", f"127.0.0.1:{kapi}"), encoding="utf-8")
    ortam = dict(os.environ, OMP_NUM_THREADS=os.environ.get("OMP_NUM_THREADS", "2"))
    ortam["YZ_VERI_DIZINI"] = str(CALISMA / ".yz")
    sunucu_komutu = [python("dil-modeli"), "-m", "dil_modeli", "sun", "--model", secenek.model,
                     "--kapi", str(kapi), "--ad", "ornek-model"]  # fmt: skip
    print(f"$ {' '.join(sunucu_komutu)}", flush=True)
    with (CALISMA / "sunucu.log").open("wb") as gunluk:
        surec = subprocess.Popen(sunucu_komutu, cwd=PROJE / "dil-modeli", env=ortam, stdout=gunluk,
                                 stderr=subprocess.STDOUT, start_new_session=True)  # fmt: skip
        try:
            hazir_bekle(f"http://127.0.0.1:{kapi}/v1/models", surec)
            yz, ayar_yolu = python("yz"), str(CALISMA / "yz.yaml")
            adimlar = [
                ("model listesi", [yz, "-m", "yz", "modeller", "--ayar", ayar_yolu]),
                ("tek mesajlık sohbet", [yz, "-m", "yz", "sohbet", "--ayar", ayar_yolu, "-m", SORU]),
                ("değerlendirme", [yz, "-m", "yz", "degerlendir", "gorevler/siniflandirma.yaml",
                                   "--ayar", ayar_yolu, "--sinir", str(secenek.sinir),
                                   "--cikti", str(CALISMA / "degerlendirme")]),
            ]  # fmt: skip
            for ad, komut in adimlar:
                print(f"\n== {ad}\n$ {' '.join(komut)}", flush=True)
                if subprocess.run(komut, cwd=PROJE / "yz", env=ortam, check=False).returncode != 0:
                    print(f"Adım başarısız: {ad}. Sunucu günlüğü: {CALISMA / 'sunucu.log'}")
                    return 1
        finally:
            if surec.poll() is None:
                os.killpg(surec.pid, signal.SIGTERM)
                surec.wait(timeout=15)
    print(f"\nBağlantı çalışıyor. Rapor: {CALISMA / 'degerlendirme' / 'rapor.md'}")
    print("Not: örnek model anlamsız metin üretir; doğruluğun ~%0 çıkması BEKLENEN sonuçtur.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
