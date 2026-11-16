#!/usr/bin/env python3
"""CI için denetlenecek temelleri seçer ve GitHub Actions çıktısı olarak yazar: `temeller=["site","uygulama"]`.

Kural:
  - Elle çalıştırmada (workflow_dispatch) `GIRDI` doluysa yalnız o temel; boşsa hepsi.
  - push / pull_request'te değişen dosyalara bakılır. Ortak bir dosya (araclar/, STANDARTLAR.md, iş akışı)
    değiştiyse hepsi; yoksa yalnız dosyası değişen temeller. Karşılaştırma yapılamazsa (yeni dal) hepsi.

Ortam değişkenleri (iş akışı verir): OLAY, GIRDI, ONCEKI (push öncesi kayıt), TABAN (PR taban kaydı).

Yerelde deneme:
  OLAY=push ONCEKI=HEAD~1 python havuz/araclar/ci_sec.py

Genişletme: "her şeyi denetlet" sayılan yeni bir ortak yol için ORTAK_YOLLAR'a ekleyin.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

from ortak import HAVUZ, temel_sec, temelleri_bul

ORTAK_YOLLAR = ("havuz/araclar/", "havuz/STANDARTLAR.md", ".github/workflows/havuz.yml")
SIFIR = "0" * 40


def degisen_dosyalar(taban: str) -> list[str] | None:
    if not taban or taban == SIFIR:
        return None
    try:
        cikti = subprocess.run(
            ["git", "diff", "--name-only", f"{taban}...HEAD"],
            cwd=HAVUZ.parent, capture_output=True, text=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return [satir.strip() for satir in cikti.stdout.splitlines() if satir.strip()]


def sec() -> list[str]:
    temeller = temelleri_bul()
    hepsi = [temel.goreli for temel in temeller]
    olay = os.environ.get("OLAY", "")
    if olay == "workflow_dispatch":
        girdi = os.environ.get("GIRDI", "").strip()
        return [temel.goreli for temel in temel_sec([girdi])] if girdi else hepsi
    taban = os.environ.get("TABAN") or os.environ.get("ONCEKI", "")
    dosyalar = degisen_dosyalar(taban)
    if dosyalar is None or any(dosya.startswith(ORTAK_YOLLAR) for dosya in dosyalar):
        return hepsi
    secilen: list[str] = []
    for dosya in dosyalar:
        if not dosya.startswith("havuz/"):
            continue
        adaylar = [t.goreli for t in temeller if dosya.startswith(f"havuz/{t.goreli}/")]
        if adaylar:
            en_uzun = max(adaylar, key=len)
            if en_uzun not in secilen:
                secilen.append(en_uzun)
    return sorted(secilen)


def main() -> int:
    secilen = sec()
    print(f"temeller={json.dumps(secilen)}")
    print(f"Denetlenecek: {', '.join(secilen) or '(yok)'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
