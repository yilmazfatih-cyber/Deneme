"""Tariflerin biçim kuralları (hızlı, ağsız): `tarif.py bicim` ve tests/test_bicim.py kullanır.

Her kural bir "sorun listesi" döndürür; boş liste = kural tutuyor. İletiler düzeltme adımını söyler.
  1. Zorunlu dosyalar (README.md, tarif.json, uygula.py, dogrula.py, dosyalar/) ve geçerli tarif.json.
  2. README'de zorunlu bölümler (ZORUNLU_BOLUMLER) — "Bu tarif ne zaman YANLIŞ seçimdir" dahil.
  3. dosyalar/ yolları: ilk klasör tarif.json'da; yeni dosya havuzdaki temelde YOK; yama hedefi VAR ve
     yama havuzun BUGÜNKÜ hâline birebir uygulanıyor (temel değişip tarif eskidiyse burada yakalanır).
  4. Görünmez karakter yok (bütün metin dosyalarında; STANDARTLAR §6.11); sır dosyası (.env) yok.
  5. tarifler/README.md dizini her tarifi listeler.
Genişletme: yeni kural → `sorunlar_*` işlevi + `tum_sorunlar`'a ekleyin + tests/test_bicim.py'de
kuralın gerçekten yakaladığını gösteren bir test.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

from tarifcik.yama import YamaHatasi, yama_uygula
from tarifcik.yerlestir import YAMA_UZANTISI, atlanir_mi, hedef_yolu, tarif_dosyalari
from tarifcik.yollar import (
    TARIFLER,
    ZORUNLU_DOSYALAR,
    Tarif,
    TarifHatasi,
    havuz_koku,
    tarif_oku,
)

ZORUNLU_BOLUMLER = (
    "Amaç",
    "Hangi temeller",
    "Ön koşullar",
    "Adım adım",
    "Nasıl doğrulanır",
    "Sık sorunlar",
    "Küçük modele yaptırırken",
    "Bu tarif ne zaman YANLIŞ seçimdir",
    "Sınırlar",
)
METIN_UZANTILARI = {
    ".md", ".json", ".py", ".ts", ".tsx", ".js", ".mjs", ".astro", ".css", ".html", ".patch",
    ".yaml", ".yml", ".toml", ".txt", ".sh", ".service", ".timer", ".jsonl", ".sql", "",
}  # fmt: skip


def gorunmez_mi(karakter: str) -> bool:
    """Ekranda görünmeyen ya da sıradan boşluktan ayırt edilemeyen karakter (kacis.py ile aynı kural)."""
    kategori = unicodedata.category(karakter)
    if kategori in ("Cf", "Zl", "Zp"):
        return True
    if kategori == "Zs":
        return karakter != " "
    if kategori == "Cc":
        return karakter not in "\t\n\r"
    return kategori == "Mn" and 0x0300 <= ord(karakter) <= 0x036F


def gorunmez_sorunlari(klasor: Path) -> list[str]:
    sorunlar: list[str] = []
    for yol in sorted(klasor.rglob("*")):
        goreli = yol.relative_to(klasor)
        if not yol.is_file() or atlanir_mi(goreli) or yol.suffix not in METIN_UZANTILARI:
            continue
        try:
            metin = yol.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            sorunlar.append(f"{goreli}: UTF-8 değil (tarifler yalnız UTF-8 metin dosyası taşır)")
            continue
        for no, satir in enumerate(metin.splitlines(), start=1):
            bulunan = [f"U+{ord(k):04X}" for k in satir if gorunmez_mi(k)]
            if bulunan:
                sorunlar.append(
                    f"{goreli}:{no}: görünmez karakter {', '.join(bulunan)} — kaçış dizisiyle yazın "
                    "(kodda chr(0x200B) ya da metinde açıklama)"
                )
    return sorunlar


def basliklar(readme: str) -> list[str]:
    return [satir.lstrip("#").strip() for satir in readme.splitlines() if satir.startswith("## ")]


def readme_sorunlari(tarif: Tarif) -> list[str]:
    yol = tarif.klasor / "README.md"
    if not yol.is_file():
        return []
    mevcut = basliklar(yol.read_text(encoding="utf-8"))
    return [
        f"{tarif.ad}/README.md: '## {bolum}' bölümü yok (zorunlu bölümler: bicim.ZORUNLU_BOLUMLER)"
        for bolum in ZORUNLU_BOLUMLER
        if not any(baslik.startswith(bolum) for baslik in mevcut)
    ]


def dosya_sorunlari(tarif: Tarif) -> list[str]:
    """dosyalar/ kuralları (yukarıdaki 3. madde)."""
    sorunlar: list[str] = []
    dosyalar = tarif_dosyalari(tarif)
    if not dosyalar:
        sorunlar.append(f"{tarif.ad}: dosyalar/ boş ya da yok")
    for goreli in dosyalar:
        ad = f"{tarif.ad}/dosyalar/{goreli.as_posix()}"
        if goreli.parts[0] not in tarif.koklar:
            sorunlar.append(
                f"{ad}: ilk klasör tarif.json'daki temeller/ekKlasorler'den biri olmalı"
            )
            continue
        if atlanir_mi(goreli):
            sorunlar.append(
                f"{ad}: bu yol kopyalamada atlanır (.env, node_modules, dist…); taşımayın"
            )
            continue
        if goreli.parts[0] not in tarif.temeller:
            if goreli.name.endswith(YAMA_UZANTISI):
                sorunlar.append(f"{ad}: ek klasörde yama olmaz; dosyanın tam hâlini koyun")
            continue
        asil = havuz_koku() / hedef_yolu(goreli)
        if goreli.name.endswith(YAMA_UZANTISI):
            if not asil.is_file():
                sorunlar.append(f"{ad}: yamanın hedefi havuzda yok ({hedef_yolu(goreli)})")
                continue
            try:
                yama_uygula(asil.read_text(encoding="utf-8"), (tarif.dosyalar / goreli).read_text(
                    encoding="utf-8"), str(hedef_yolu(goreli)))  # fmt: skip
            except YamaHatasi as hata:
                sorunlar.append(f"{ad}: yama havuzun bugünkü hâline uygulanmıyor: {hata}")
        elif asil.exists():
            sorunlar.append(
                f"{ad}: havuzda bu yolda dosya var; değişikliği tam dosya değil yama (.patch) olarak "
                "taşıyın (`python tarif.py yakala` bunu kendisi yapar)"
            )
    return sorunlar


def tarif_sorunlari(klasor: Path) -> list[str]:
    """Tek bir tarif klasörünün bütün sorunları."""
    sorunlar = [
        f"{klasor.name}: {dosya} eksik"
        for dosya in ZORUNLU_DOSYALAR
        if not (klasor / dosya).exists()
    ]
    if not (klasor / "tarif.json").exists():
        return sorunlar
    try:
        tarif = tarif_oku(klasor)
    except TarifHatasi as hata:
        return [*sorunlar, str(hata)]
    for temel in tarif.temeller:
        if not (havuz_koku() / temel / "havuz.json").is_file():
            sorunlar.append(f"{tarif.ad}: tarif.json'daki '{temel}' havuzda bir temel değil")
    return sorunlar + readme_sorunlari(tarif) + dosya_sorunlari(tarif)


def dizin_sorunlari(tarifler: list[Path]) -> list[str]:
    """tarifler/README.md her tarife bağlantı vermeli; satırda tarif.json'daki süre ve zorluk yazmalı."""
    yol = TARIFLER / "README.md"
    if not yol.is_file():
        return ["README.md (tarif dizini) yok"]
    satirlar = yol.read_text(encoding="utf-8").splitlines()
    sorunlar: list[str] = []
    for klasor in tarifler:
        satir = next((s for s in satirlar if f"]({klasor.name}/)" in s), None)
        if satir is None:
            sorunlar.append(
                f"README.md: '{klasor.name}' tarifi dizin tablosunda yok (`[{klasor.name}]({klasor.name}/)`)"
            )
            continue
        try:
            tarif = tarif_oku(klasor)
        except TarifHatasi:
            continue  # tarif.json sorunu tarif_sorunlari'nda raporlanır
        hucreler = [h.strip() for h in satir.strip().strip("|").split("|")]
        if tarif.sure not in hucreler or tarif.zorluk not in hucreler:
            sorunlar.append(
                f"README.md: '{klasor.name}' satırında süre ({tarif.sure}) ve zorluk ({tarif.zorluk}) "
                "tarif.json'dakiyle aynı olmalı"
            )
    return sorunlar


def tarif_klasorleri() -> list[Path]:
    """İçinde tarif.json, uygula.py ya da dogrula.py olan klasörler (yarım kalmış tarifi de yakalar)."""
    adaylar = {yol.parent for ad in ZORUNLU_DOSYALAR[1:] for yol in TARIFLER.glob(f"*/{ad}")}
    return sorted(adaylar)


def tum_sorunlar() -> list[str]:
    klasorler = tarif_klasorleri()
    sorunlar: list[str] = []
    for klasor in klasorler:
        sorunlar += tarif_sorunlari(klasor)
    return sorunlar + dizin_sorunlari(klasorler) + gorunmez_sorunlari(TARIFLER)
