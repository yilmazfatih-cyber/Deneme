"""Ağla ilgili komutlar: katalog (ara, listele, dogrula), indir, hat (listele, calistir).

``katalog ara``/``listele``, ``katalog dogrula --cevrimdisi`` ve ``hat listele`` ağ istemez.
Getirici ayarları: kullanıcı aracısı ``VERIHAVUZU_KULLANICI_ARACISI``, HTTP önbelleği
``calisma/http_onbellek``, indirilen dosyalar ``calisma/indirilen``.
Genişletme: yeni bir ağ komutu için ``Fetcher``ı ``_fetcher()`` ile alın (nazik varsayılanlar).
"""

from __future__ import annotations

import argparse
from datetime import date

from verihavuzu.hat.fetch import FetchConfig, Fetcher
from verihavuzu.hat.pipeline import run_pipeline
from verihavuzu.hat.registry import PIPELINES, get_pipeline
from verihavuzu.hat.storage import open_store
from verihavuzu.katalog.catalog import find, load_catalog, search
from verihavuzu.katalog.download import download
from verihavuzu.katalog.model import DatasetEntry
from verihavuzu.katalog.verify import latest_report, unverified, write_verification
from verihavuzu.paths import work_dir


def _fetcher(min_interval: float = 1.0) -> Fetcher:
    return Fetcher(FetchConfig(min_interval=min_interval, cache_dir=work_dir() / "http_onbellek"))


def _print_entries(entries: list[DatasetEntry]) -> None:
    for entry in entries:
        print(
            f"{entry.kimlik:50s} {entry.gorev:22s} ticari={entry.ticari_kullanim:8s} "
            f"lisans={entry.lisans} · boyut={entry.boyut}"
        )
    print(f"({len(entries)} kayıt)")


def cmd_katalog_ara(args: argparse.Namespace) -> int:
    found = search(
        load_catalog(),
        " ".join(args.sorgu),
        gorev=args.gorev,
        alan=args.alan,
        dil=args.dil,
        ticari=args.ticari,
    )
    _print_entries(found)
    return 0 if found else 1


def cmd_katalog_listele(args: argparse.Namespace) -> int:
    _print_entries(load_catalog())
    return 0


def cmd_katalog_dogrula(args: argparse.Namespace) -> int:
    entries = load_catalog()
    if args.cevrimdisi:
        path = latest_report()
        problems = unverified(entries, path)
        for problem in problems:
            print(f"doğrulanmamış: {problem}")
        print(
            f"{len(entries) - len(problems)}/{len(entries)} kayıt doğrulanmış "
            f"({path.name if path else 'dosya yok'})"
        )
        return 1 if problems else 0
    path, result = write_verification(entries, _fetcher())
    print(f"özet: {result['ozet']} → {path}")
    return 0 if set(result["ozet"]) == {"dogrulandi"} else 1


def cmd_indir(args: argparse.Namespace) -> int:
    if find(load_catalog(), args.kimlik) is None:
        print(f"uyarı: {args.kimlik} katalogda yok; lisansını kendiniz denetleyin.")
    result = download(
        args.kimlik, args.cikti, _fetcher(0.5), sample=args.ornek, max_mb=args.en_buyuk_mb
    )
    print(result)
    return 0


def cmd_hat_listele(args: argparse.Namespace) -> int:
    for name, spec in PIPELINES.items():
        print(
            f"{name:20s} {spec.aciklama} → tablo {spec.tablo} (anahtar: {', '.join(spec.anahtar)})"
        )
    return 0


def cmd_hat_calistir(args: argparse.Namespace) -> int:
    spec = get_pipeline(args.ad)
    extension = {"sqlite": ".sqlite", "duckdb": ".duckdb", "csv": "", "jsonl": ""}[args.depo]
    store_path = args.depo_yolu or work_dir() / "hat" / f"{spec.ad}{extension}"
    params = {
        "baslangic": date.fromisoformat(args.baslangic) if args.baslangic else None,
        "bitis": date.fromisoformat(args.bitis) if args.bitis else None,
    }
    store = open_store(args.depo, store_path)
    try:
        record = run_pipeline(spec, store, _fetcher(), work_dir(), params=params)
    finally:
        store.close()
    print(
        f"{record.durum}: çekilen {record.cekilen}, eklenen {record.eklenen}, güncellenen "
        f"{record.guncellenen}, değişmeyen {record.degismeyen}, "
        f"karantina {record.karantina} → {store_path}"
    )
    for message in record.iletiler:
        print(f"  {message}")
    return 0 if record.durum == "basarili" else 1
