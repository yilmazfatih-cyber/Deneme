#!/usr/bin/env python3
"""Canlı Çeviri: Swift dosyalarında sözdizimi ön denetimi.

Bulut oturumunda Xcode yoktur; bu betik yalnızca sözdizimi hatalarını (eksik ayraç, yarım ifade) yakalar.
Tür denetimi yapmaz ve derlemenin yerini tutmaz: gerçek derleme GitHub'daki Mac'te, dala push edilince çalışır.

Kullanım (depo kökünden ya da canli-ceviri/ içinden):
    python3 canli-ceviri/scripts/swift-sozdizimi.py            # CanliCeviri/ altındaki tüm .swift dosyaları
    python3 canli-ceviri/scripts/swift-sozdizimi.py --proje    # ayrıca project.pbxproj dosyasını da denetler
    python3 canli-ceviri/scripts/swift-sozdizimi.py Dosya.swift ...

Gerekenler: pip install tree-sitter tree-sitter-language-pack openstep_parser
"""

import re
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
KAYNAK = KOK / "CanliCeviri"
PROJE = KOK / "CanliCeviri.xcodeproj" / "project.pbxproj"
SEMALAR = KOK / "CanliCeviri.xcodeproj" / "xcshareddata" / "xcschemes"


def swift_denetle(dosyalar):
    try:
        from tree_sitter_language_pack import get_parser
    except ImportError:
        print("Eksik paket. Kurmak için: pip install tree-sitter tree-sitter-language-pack")
        return 2
    ayristirici = get_parser("swift")
    sorun = 0
    for yol in dosyalar:
        kaynak = yol.read_bytes()
        bulunan = []

        def gez(dugum):
            if dugum.type == "ERROR" or dugum.is_missing:
                satir = dugum.start_point[0] + 1
                parca = kaynak[dugum.start_byte : dugum.end_byte].decode("utf-8", "replace")[:70]
                tur = f"eksik {dugum.type}" if dugum.is_missing else "sözdizimi hatası"
                bulunan.append(f"    {yol.relative_to(KOK)}:{satir}: {tur} {parca!r}")
                return
            for alt in dugum.children:
                gez(alt)

        gez(ayristirici.parse(kaynak).root_node)
        sorun += len(bulunan)
        print(("TAMAM  " if not bulunan else "SORUN  ") + str(yol.relative_to(KOK)))
        for satir in bulunan:
            print(satir)
    return sorun


def proje_denetle():
    try:
        from openstep_parser import OpenStepDecoder
    except ImportError:
        print("Eksik paket. Kurmak için: pip install openstep_parser")
        return 2
    metin = PROJE.read_text(encoding="utf-8")
    try:
        proje = OpenStepDecoder.ParseFromString(metin)
    except Exception as hata:  # ayrıştırıcı her biçim hatasında farklı tür fırlatır
        print(f"SORUN  {PROJE.relative_to(KOK)}: okunamadı ({hata})")
        return 1
    nesneler = proje["objects"]
    tanimsiz = sorted(set(re.findall(r"\b[0-9A-F]{24}\b", metin)) - set(nesneler))
    if proje["rootObject"] not in nesneler or tanimsiz:
        print(f"SORUN  {PROJE.relative_to(KOK)}: tanımsız başvuru {tanimsiz or proje['rootObject']}")
        return 1
    print(f"TAMAM  {PROJE.relative_to(KOK)} ({len(nesneler)} nesne, tüm başvurular tanımlı)")
    return sema_denetle(nesneler)


def sema_denetle(nesneler):
    """Paylaşılan şemalar: XML okunur mu, hedef kimlikleri projede var mı, StoreKit dosyası yerinde mi."""
    import xml.etree.ElementTree as ET

    sorun = 0
    for yol in sorted(SEMALAR.glob("*.xcscheme")):
        ad = yol.relative_to(KOK)
        try:
            kok = ET.parse(yol).getroot()
        except ET.ParseError as hata:
            print(f"SORUN  {ad}: XML okunamadı ({hata})")
            sorun += 1
            continue
        bulunan = []
        for ref in kok.iter("BuildableReference"):
            kimlik = ref.get("BlueprintIdentifier")
            if kimlik not in nesneler:
                bulunan.append(f"tanımsız hedef {kimlik}")
            if ref.get("ReferencedContainer") != "container:CanliCeviri.xcodeproj":
                bulunan.append(f"beklenmeyen kap {ref.get('ReferencedContainer')}")
        arsiv = kok.find("ArchiveAction")
        if arsiv is None or arsiv.get("buildConfiguration") != "Release":
            bulunan.append("ArchiveAction Release değil")
        for eylem in kok:
            sk = eylem.find("StoreKitConfigurationFileReference")
            if sk is None:
                continue
            if eylem.tag != "LaunchAction":
                bulunan.append(f"StoreKit yapılandırması {eylem.tag} içinde (yalnız LaunchAction olmalı)")
            # Yol, xcshareddata klasörüne göredir (Xcode'un yazdığı "../../…" biçimi).
            hedef = (SEMALAR.parent / sk.get("identifier", "")).resolve()
            if not hedef.is_file():
                bulunan.append(f"StoreKit dosyası yok: {sk.get('identifier')}")
        sorun += len(bulunan)
        print(("TAMAM  " if not bulunan else "SORUN  ") + str(ad))
        for satir in bulunan:
            print(f"    {satir}")
    return sorun


def main():
    secenekler = [a for a in sys.argv[1:] if a.startswith("--")]
    verilen = [Path(a).resolve() for a in sys.argv[1:] if not a.startswith("--")]
    dosyalar = verilen or sorted(KAYNAK.rglob("*.swift"))
    sorun = swift_denetle(dosyalar)
    if "--proje" in secenekler:
        sorun += proje_denetle()
    print(f"\n{len(dosyalar)} dosya, {sorun} sorun" + ("" if sorun else " (yalnız sözdizimi; derleme Mac'te yapılır)"))
    sys.exit(1 if sorun else 0)


if __name__ == "__main__":
    main()
