"""Yerel dosya komutları: uret, dogrula, profil, kayma, maskele, temizle, ayir, sozluk.

Her işlev ``argparse.Namespace`` alır, iş yapar, kısa bir Türkçe özet yazar ve çıkış kodu döndürür.
Dosya biçimi uzantıdan anlaşılır (.csv, .jsonl, .json; üretimde .parquet de). ';' ayraçlı CSV
(Excel-TR) okunurken ondalık ayırıcı virgül kabul edilir.
Genişletme: yeni komutun işlevini buraya ``cmd_<ad>`` olarak yazın, ``main.py``de bağlayın.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

from verihavuzu.files import read_table, write_jsonl, write_table
from verihavuzu.kalite import report
from verihavuzu.kalite.checks import load_checks, run_checks
from verihavuzu.kalite.clean import clean_rows
from verihavuzu.kalite.dedupe import deduplicate
from verihavuzu.kalite.dictionary import data_dictionary_markdown
from verihavuzu.kalite.drift import drift_report
from verihavuzu.kalite.pii import KEY_ENV, Pseudonymizer, mask_rows
from verihavuzu.kalite.profile import profile_table
from verihavuzu.kalite.schema import load_contract, save_contract
from verihavuzu.kalite.split import (
    SplitResult,
    group_split,
    leakage_report,
    stratified_split,
    time_split,
)
from verihavuzu.kalite.validate import validate_rows
from verihavuzu.sentetik.config import load_commerce_config
from verihavuzu.sentetik.dirty import make_dirty
from verihavuzu.sentetik.registry import get_generator

DATA_SUFFIXES = (".csv", ".jsonl", ".json", ".parquet")


def _is_excel_csv(path: Path) -> bool:
    if path.suffix != ".csv":
        return False
    first = path.read_text(encoding="utf-8-sig").split("\n", 1)[0]
    return first.count(";") > first.count(",")


def _emit(markdown: str, data: Any, args: argparse.Namespace, summary: str) -> None:
    """Rapor dosyası istenmişse yazar ve özeti basar; istenmemişse Markdown'ı ekrana basar."""
    if args.rapor or args.json:
        report.write_reports(markdown, data, args.rapor, args.json)
        print(summary)
        for path in (args.rapor, args.json):
            if path:
                print(f"rapor: {path}")
    else:
        print(markdown)


def cmd_uret(args: argparse.Namespace) -> int:
    spec = get_generator(args.varlik)
    tables = spec.calistir(
        args.adet or spec.varsayilan_adet, args.tohum, load_commerce_config(args.ayar)
    )
    if args.tablo:
        unknown = [t for t in args.tablo if t not in tables]
        if unknown:
            raise ValueError(
                f"Bu üreteçte olmayan tablo: {', '.join(unknown)}. Var olanlar: {', '.join(tables)}"
            )
        tables = {name: tables[name] for name in args.tablo}
    out: Path = args.cikti
    single = out.suffix in DATA_SUFFIXES
    if single and (len(tables) > 1 or args.kirli):
        raise ValueError(
            "Birden çok tablo ya da --kirli için --cikti bir KLASÖR olmalı (uzantısız)."
        )
    for name, rows in tables.items():
        contract = spec.sozlesmeler[name]
        folder = out.parent if single else out
        if args.kirli:
            dirty = make_dirty(
                rows, args.tohum, rate=args.kirlilik, protected=contract.birincil_anahtar
            )
            suffix = "jsonl" if args.bicim == "jsonl" else "csv"
            write_table(folder / f"{name}.temiz.{suffix}", dirty.temiz)
            write_table(folder / f"{name}.kirli.{suffix}", dirty.kirli)
            write_jsonl(folder / f"{name}.bozulmalar.jsonl", dirty.kayitlar)
            print(
                f"{name}: {len(dirty.temiz)} temiz, {len(dirty.kirli)} kirli satır, "
                f"{len(dirty.kayitlar)} bozulma → {folder}"
            )
        else:
            path = out if single else out / f"{name}.{args.bicim}"
            write_table(path, rows, excel_tr=args.excel_tr)
            print(f"{name}: {len(rows)} satır → {path}")
        if args.sema:
            save_contract(contract, folder / f"{name}.sema.json")
    print("Not: üretilen kişi, şirket ve numaralar UYDURMADIR; gerçek kişilerle ilgisi yoktur.")
    return 0


def cmd_dogrula(args: argparse.Namespace) -> int:
    if not args.sema and not args.denetim:
        raise ValueError("--sema ya da --denetim (ya da ikisi) verilmeli.")
    rows = read_table(args.dosya)
    typed = args.dosya.suffix in (".jsonl", ".json")
    decimal = "," if args.ondalik_virgul or _is_excel_csv(args.dosya) else "."
    parts: list[str] = []
    data: dict[str, Any] = {"dosya": str(args.dosya)}
    ok = True
    if args.sema:
        result = validate_rows(rows, load_contract(args.sema), typed=typed, decimal=decimal)
        parts.append(report.validation_markdown(result))
        data["sema"] = result.to_dict()
        ok = ok and result.gecerli
    if args.denetim:
        results = run_checks(rows, load_checks(args.denetim), args.denetim.parent)
        parts.append(report.checks_markdown(results))
        data["denetimler"] = [r.to_dict() for r in results]
        ok = ok and all(r.gecti for r in results)
    _emit("\n".join(parts), data, args, f"{args.dosya}: {'geçerli' if ok else 'SORUN VAR'}")
    return 0 if ok else 1


def cmd_profil(args: argparse.Namespace) -> int:
    profile = profile_table(read_table(args.dosya), args.dosya.stem)
    summary = f"{args.dosya}: {profile['satir_sayisi']} satır, {profile['sutun_sayisi']} sütun"
    _emit(report.profile_markdown(profile), profile, args, summary)
    return 0


def cmd_kayma(args: argparse.Namespace) -> int:
    result = drift_report(read_table(args.referans), read_table(args.yeni), args.sutun)
    big = [c["sutun"] for c in result["sutunlar"] if c.get("psi", {}).get("yorum") == "büyük"]
    _emit(report.drift_markdown(result), result, args, f"büyük kayma: {', '.join(big) or 'yok'}")
    return 0


def cmd_maskele(args: argparse.Namespace) -> int:
    pseudo = None
    if args.yontem in ("takma_ad", "bicimli"):
        key = os.environ.get(KEY_ENV)
        if not key:
            raise ValueError(
                f"'{args.yontem}' için {KEY_ENV} ortam değişkenine gizli bir anahtar yazın "
                "(en az 16 karakter; kaybetmeyin, paylaşmayın)."
            )
        pseudo = Pseudonymizer(key.encode())
    masked, counts = mask_rows(read_table(args.dosya), args.yontem, pseudo, columns=args.sutun)
    if args.cikti:
        write_table(args.cikti, masked)
    total = sum(sum(kinds.values()) for kinds in counts.values())
    summary = f"{total} kişisel veri bulundu" + (
        f"; maskeli dosya: {args.cikti}" if args.cikti else ""
    )
    _emit(report.pii_markdown(counts, args.yontem), counts, args, summary)
    return 0


def cmd_temizle(args: argparse.Namespace) -> int:
    result = clean_rows(read_table(args.dosya))
    rows = result.satirlar
    message = (
        f"{len(result.degisiklikler)} değer düzeltildi, "
        f"{len(result.atilan_yinelenenler)} birebir yineleme atıldı"
    )
    if args.yineleme_sutunlari:
        rows, duplicates = deduplicate(rows, args.yineleme_sutunlari)
        message += f", {len(duplicates.kumeler)} bulanık yineleme kümesi birleştirildi"
    write_table(args.cikti, rows)
    if args.degisiklikler:
        write_jsonl(args.degisiklikler, result.degisiklikler)
    print(f"{message} → {args.cikti}")
    print(
        "Not: yazım hataları düzeltilmez; tür sezgisi: "
        + ", ".join(f"{k}={v}" for k, v in result.turler.items())
    )
    return 0


def cmd_ayir(args: argparse.Namespace) -> int:
    from datetime import timedelta

    rows = read_table(args.dosya)
    result: SplitResult
    if args.yontem == "zaman":
        result = time_split(
            rows, args.sutun, test_fraction=args.oran, gap=timedelta(days=args.bosluk_gun)
        )
    elif args.yontem == "grup":
        result = group_split(rows, args.sutun, test_fraction=args.oran, seed=args.tohum)
        result.bilgi["sizinti"] = leakage_report(result.egitim, result.test, [args.sutun])
    else:
        result = stratified_split(rows, args.sutun, test_fraction=args.oran, seed=args.tohum)
    suffix = args.dosya.suffix
    write_table(args.cikti / f"egitim{suffix}", result.egitim)
    write_table(args.cikti / f"test{suffix}", result.test)
    print(
        f"eğitim: {len(result.egitim)} · test: {len(result.test)} · {result.bilgi} → {args.cikti}"
    )
    return 0


def cmd_sozluk(args: argparse.Namespace) -> int:
    for path in args.sema:
        print(data_dictionary_markdown(load_contract(path)))
    return 0
