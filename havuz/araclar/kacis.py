#!/usr/bin/env python3
"""Kaynak koddaki görünmez ve birleşen karakterleri bulur; okunur kaçış dizisine (\\u200b gibi) çevirir.

Neden: sıfır genişlikli boşluk, BOM, yön denetim karakterleri, bölünmez boşluk ve birleşen işaretler ekranda
görünmez. Bir model ya da insan `"[ ]"` gibi boş görünen bir dizgiyi "sadeleştirip" kodu bozabilir; yön denetim
karakterleri kodun okunduğundan farklı çalışmasına yol açabilir ("Trojan Source"). Kaynakta bunların yerine
`"\\u200b"` yazılır: aynı anlam, görünür biçim.

Kullanım:
  python havuz/araclar/kacis.py havuz/yz                # bul ve düzelt
  python havuz/araclar/kacis.py --denetle havuz          # yalnız bul; bulursa çıkış kodu 1 (CI)

Kapsam: .py .ts .js .mjs .cjs dosyaları. Python'da yalnız (ham olmayan) dizgi ve yorumlar düzeltilir; ham dizgi
(r"...") içindekiler raporlanır, elle bakılır. Veri dosyaları (.json, .csv…) ve JSX/HTML/Markdown kapsam dışıdır.

Genişletme: yeni bir karakter sınıfı için `kacirilacak_mi` işlevine kural ekleyin.
"""

from __future__ import annotations

import argparse
import ast
import io
import sys
import tokenize
import unicodedata
from pathlib import Path

UZANTILAR = {".py", ".ts", ".js", ".mjs", ".cjs"}
ATLANAN = {"node_modules", ".venv", "__pycache__", "dist", "dist-alt", "dist-yerel", "dev-dist", ".astro",
           ".mypy_cache", ".ruff_cache", ".pytest_cache", ".hypothesis", "test-results", "playwright-report", "build"}


def gorunmez_mi(ch: str) -> bool:
    """Ekranda hiç görünmeyen ya da sıradan boşluktan ayırt edilemeyen karakter mi?"""
    kategori = unicodedata.category(ch)
    if kategori in ("Cf", "Zl", "Zp"):
        return True
    if kategori == "Zs":
        return ch != " "
    return kategori == "Cc" and ch not in "\t\n\r"


def birlesen_mi(ch: str) -> bool:
    """Latin birleşen işareti (U+0300–U+036F): kendi başına görünmez, önceki harfin üstüne biner."""
    return unicodedata.category(ch) == "Mn" and 0x0300 <= ord(ch) <= 0x036F


def kacirilacak_mi(ch: str) -> bool:
    return gorunmez_mi(ch) or birlesen_mi(ch)


def kacis(ch: str, dil: str) -> str:
    kod = ord(ch)
    if kod <= 0xFFFF:
        return f"\\u{kod:04x}"
    return f"\\U{kod:08x}" if dil == "py" else f"\\u{{{kod:x}}}"


def js_duzelt(metin: str) -> tuple[str, list[str]]:
    """JS/TS: dizgi, şablon, düzenli ifade ve yorumlarda kaçış aynı anlamı taşır; hepsi çevrilir."""
    return "".join(kacis(ch, "js") if kacirilacak_mi(ch) else ch for ch in metin), []


def belge_dizgileri(metin: str) -> set[tuple[int, int]]:
    """Modül, sınıf ve işlev belge dizgilerinin (docstring) başlangıç–bitiş satırları: bunlar düz yazıdır."""
    try:
        agac = ast.parse(metin)
    except SyntaxError:
        return set()
    araliklar: set[tuple[int, int]] = set()
    for dugum in ast.walk(agac):
        if isinstance(dugum, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and dugum.body:
            ilk = dugum.body[0]
            if isinstance(ilk, ast.Expr) and isinstance(ilk.value, ast.Constant) and isinstance(ilk.value.value, str):
                araliklar.add((ilk.lineno, ilk.end_lineno or ilk.lineno))
    return araliklar


def py_duzelt(metin: str) -> tuple[str, list[str]]:
    """Python: tokenize ile yalnız güvenli yerleri (ham olmayan dizgi, f-dizgi parçası, yorum) çevirir.

    Yorum ve belge dizgisi düz yazıdır: oradaki birleşen işaretler (x̂, ȳ gibi gösterimler) görünür olduğu için
    bırakılır; yalnız gerçekten görünmez karakterler çevrilir. Veri dizgilerinde ikisi de çevrilir.
    """
    # tokenize satırları yalnız "\n"de böler; splitlines() U+2028 gibi karakterlerde de böler ve numaralar kayar.
    satirlar = io.StringIO(metin).readlines()
    guvenli: set[tuple[int, int]] = set()
    duz_yazi: set[tuple[int, int]] = set()
    belgeler = belge_dizgileri(metin)
    ham_fdizgi: list[bool] = []
    try:
        belirtecler = list(tokenize.generate_tokens(io.StringIO(metin).readline))
    except (tokenize.TokenError, SyntaxError) as hata:
        return metin, [f"ayrıştırılamadı ({hata}); dosyaya elle bakın"]
    fstart = getattr(tokenize, "FSTRING_START", -1)
    fmiddle = getattr(tokenize, "FSTRING_MIDDLE", -1)
    fend = getattr(tokenize, "FSTRING_END", -1)
    for belirtec in belirtecler:
        tur = belirtec.type
        if tur == fstart:
            ham_fdizgi.append("r" in belirtec.string.lower().split('"')[0].split("'")[0])
            continue
        if tur == fend:
            if ham_fdizgi:
                ham_fdizgi.pop()
            continue
        if tur == tokenize.STRING:
            onek = belirtec.string[: len(belirtec.string) - len(belirtec.string.lstrip("rRbBuUfF"))].lower()
            if "r" in onek or "b" in onek:
                continue
        elif tur == fmiddle:
            if ham_fdizgi and ham_fdizgi[-1]:
                continue
        elif tur != tokenize.COMMENT:
            continue
        (bas_satir, bas_sutun), (son_satir, son_sutun) = belirtec.start, belirtec.end
        yazi = tur == tokenize.COMMENT or (bas_satir, son_satir) in belgeler
        for satir in range(bas_satir, son_satir + 1):
            ilk = bas_sutun if satir == bas_satir else 0
            son = son_sutun if satir == son_satir else len(satirlar[satir - 1])
            for sutun in range(ilk, son):
                guvenli.add((satir, sutun))
                if yazi:
                    duz_yazi.add((satir, sutun))
    sorunlar: list[str] = []
    yeni: list[str] = []
    for no, satir in enumerate(satirlar, start=1):
        parcalar = []
        for sutun, ch in enumerate(satir):
            konum = (no, sutun)
            if konum in duz_yazi and birlesen_mi(ch):
                parcalar.append(ch)  # düz yazıdaki gösterim (x̂): bırak
                continue
            if kacirilacak_mi(ch):
                if konum in guvenli:
                    parcalar.append(kacis(ch, "py"))
                    continue
                sorunlar.append(f"{no}. satır: U+{ord(ch):04X} ham dizgide ya da kod içinde; elle bakın")
            parcalar.append(ch)
        yeni.append("".join(parcalar))
    return "".join(yeni), sorunlar


def sayac(metin: str, uzanti: str) -> int:
    """Düzeltilmesi gereken karakter sayısı (Python'da düz yazıdaki birleşen işaretler sayılmaz)."""
    if uzanti != ".py":
        return sum(1 for ch in metin if kacirilacak_mi(ch))
    yeni, sorunlar = py_duzelt(metin)
    return sum(1 for ch in metin if kacirilacak_mi(ch)) - sum(1 for ch in yeni if birlesen_mi(ch)) + len(sorunlar)


def dosyalar(yollar: list[Path]) -> list[Path]:
    sonuc: list[Path] = []
    for yol in yollar:
        adaylar = [yol] if yol.is_file() else sorted(yol.rglob("*"))
        for aday in adaylar:
            if (aday.is_file() and aday.suffix in UZANTILAR and not set(aday.parts) & ATLANAN
                    and not any(parca.endswith(".egg-info") for parca in aday.parts)):
                sonuc.append(aday)
    return sonuc


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Görünmez karakterleri kaçış dizisine çevirir.")
    ayristirici.add_argument("yol", nargs="+", type=Path, help="dosya ya da klasör")
    ayristirici.add_argument("--denetle", action="store_true", help="değiştirme; bulursa çıkış kodu 1")
    secenekler = ayristirici.parse_args()

    bulunan = 0
    for dosya in dosyalar(secenekler.yol):
        try:
            metin = dosya.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if not any(kacirilacak_mi(ch) for ch in metin):
            continue
        adet = sayac(metin, dosya.suffix)
        if adet == 0:
            continue
        yeni, sorunlar = py_duzelt(metin) if dosya.suffix == ".py" else js_duzelt(metin)
        bulunan += adet
        if secenekler.denetle:
            print(f"{dosya}: {adet} görünmez karakter (düzeltmek için: python havuz/araclar/kacis.py {dosya})")
        elif yeni != metin:
            dosya.write_text(yeni, encoding="utf-8")
            print(f"düzeltildi: {dosya}")
        for sorun in sorunlar:
            print(f"  {dosya}: {sorun}")
    if not secenekler.denetle and bulunan:
        print("\nŞimdi temelin denetimini çalıştırın: kaçış dizileri satırı uzatır, biçimleyici düzeltir.")
    if secenekler.denetle and bulunan:
        print(f"\nToplam {bulunan} görünmez karakter. Kaynakta kaçış dizisi yazın (ör. \"\\u200b\").")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
