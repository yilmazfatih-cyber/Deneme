"""Arama komutları: `indeksle`, `ara`, `benzer`, `sifir-atis`, `arama-olc`.

Kim kullanır: `goruntu/commands.py`. Gömme modeli (torch/transformers) yalnız komut çalışınca yüklenir.

Genişletme: yeni bir arama komutu için `_add_<ad>` + `_<ad>` yazıp dosya sonuna `Command(...)` ekleyin,
`commands.py` sözlüğüne kaydedin.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from goruntu import console
from goruntu.errors import UserError
from goruntu.io_utils import sha256_file, write_json
from goruntu.komutlar.base import Command, add_json_argument, add_limit_arguments, limits_from
from goruntu.messages import t


def _add_model_argument(parser: argparse.ArgumentParser, default: str | None) -> None:
    parser.add_argument(
        "--model", default=default, metavar="AD", help=t("yardim.secenek.gomme_model")
    )


def _add_indeksle(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("klasor", metavar="KLASOR", help=t("yardim.secenek.klasor"))
    parser.add_argument("--dizin", required=True, metavar="KLASOR", help=t("yardim.secenek.dizin"))
    _add_model_argument(parser, "siglip2")
    parser.add_argument(
        "--yigin", type=int, default=16, metavar="N", help=t("yardim.secenek.yigin")
    )
    add_limit_arguments(parser)


def _indeksle(args: argparse.Namespace) -> int:
    from goruntu.arama.build import index_files
    from goruntu.arama.embedders import ALIASES, make_embedder
    from goruntu.arama.index import META_FILE, ImageIndex
    from goruntu.kopya.scan import list_images

    directory = Path(args.dizin)
    model_id = ALIASES.get(args.model, args.model)
    existing = ImageIndex.load(directory) if (directory / META_FILE).is_file() else None
    if existing is not None and existing.meta.model != model_id:
        raise UserError(t("arama.model_farkli", dizin=existing.meta.model, model=model_id))
    embedder = make_embedder(args.model, args.yigin)
    index = existing or ImageIndex(embedder.name, embedder.dim)
    added, rejected = index_files(
        index, list_images(Path(args.klasor)), embedder, limits_from(args), args.yigin
    )
    index.save(directory)
    for path, message in rejected:
        console.warn(t("arama.atlandi", yol=path, ayrinti=message))
    console.result(t("arama.dizin_ozeti", eklenen=added, toplam=len(index), yol=directory))
    return 0


def _print_results(results: list[tuple[Any, float]], json_path: str | None) -> None:
    rows = [
        {"sira": i, "yol": item.yol, "benzerlik": round(score, 4), "kimlik": item.kimlik}
        for i, (item, score) in enumerate(results, start=1)
    ]
    for row in rows:
        console.result(f"{row['sira']:>3}  {row['benzerlik']:.4f}  {row['yol']}")
    if json_path:
        write_json(Path(json_path), rows)


def _add_ara(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("metin", metavar="METIN", help=t("yardim.secenek.metin"))
    parser.add_argument("--dizin", required=True, metavar="KLASOR", help=t("yardim.secenek.dizin"))
    parser.add_argument("-k", type=int, default=5, help=t("yardim.secenek.k"))
    add_json_argument(parser)


def _ara(args: argparse.Namespace) -> int:
    from goruntu.arama.embedders import embedder_for_index
    from goruntu.arama.index import ImageIndex

    index = ImageIndex.load(Path(args.dizin))
    embedder = embedder_for_index(index.meta.model)
    query = embedder.embed_texts([args.metin])
    _print_results(index.search(query, args.k), args.json)
    return 0


def _add_benzer(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("goruntu", metavar="GORUNTU", help=t("yardim.secenek.sorgu_goruntu"))
    parser.add_argument("--dizin", required=True, metavar="KLASOR", help=t("yardim.secenek.dizin"))
    parser.add_argument("-k", type=int, default=5, help=t("yardim.secenek.k"))
    add_limit_arguments(parser)
    add_json_argument(parser)


def _benzer(args: argparse.Namespace) -> int:
    from goruntu.arama.build import embed_query_image
    from goruntu.arama.embedders import embedder_for_index
    from goruntu.arama.index import ImageIndex

    index = ImageIndex.load(Path(args.dizin))
    embedder = embedder_for_index(index.meta.model)
    path = Path(args.goruntu)
    query = embed_query_image(embedder, path, limits_from(args))
    exclude = {sha256_file(path)}  # sorgunun kendisi dizindeyse sonuçlarda gösterilmez
    _print_results(index.search(query, args.k, exclude), args.json)
    return 0


def _add_sifir_atis(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "goruntuler", nargs="+", metavar="GORUNTU", help=t("yardim.secenek.goruntuler")
    )
    parser.add_argument(
        "--etiketler", required=True, metavar="A,B,C", help=t("yardim.secenek.etiketler")
    )
    parser.add_argument("--dil", choices=("tr", "en"), default="tr", help=t("yardim.secenek.dil"))
    _add_model_argument(parser, "siglip2")
    add_limit_arguments(parser)
    add_json_argument(parser)


def _sifir_atis(args: argparse.Namespace) -> int:
    from goruntu.arama.embedders import make_embedder
    from goruntu.arama.zero_shot import TEMPLATES, zero_shot
    from goruntu.hazirlik.loader import load_rgb
    from goruntu.kopya.scan import list_images

    labels = [label.strip() for label in args.etiketler.split(",") if label.strip()]
    if len(labels) < 2:
        raise UserError(t("arama.az_etiket"))
    paths = [p for item in args.goruntuler for p in list_images(Path(item))]
    embedder = make_embedder(args.model)
    images = [load_rgb(path, limits_from(args)) for path in paths]
    probabilities = zero_shot(embedder, images, labels, TEMPLATES[args.dil])
    rows = []
    for path, row in zip(paths, probabilities, strict=True):
        best = int(row.argmax())
        rows.append({"dosya": str(path), "etiket": labels[best], "olasilik": float(row[best])})
        console.result(f"{path}\t{labels[best]}\t{row[best]:.3f}")
    if args.json:
        write_json(Path(args.json), rows)
    return 0


def _add_arama_olc(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("klasor", metavar="KLASOR", help=t("yardim.secenek.sinifli_klasor"))
    _add_model_argument(parser, "siglip2")
    parser.add_argument("--dil", choices=("tr", "en"), default="tr", help=t("yardim.secenek.dil"))
    add_limit_arguments(parser)
    add_json_argument(parser)


def _arama_olc(args: argparse.Namespace) -> int:
    from goruntu.arama.embedders import make_embedder
    from goruntu.arama.evaluate import image_recall_at_k, text_hits_at_k
    from goruntu.arama.zero_shot import TEMPLATES, label_vectors
    from goruntu.hazirlik.loader import load_rgb
    from goruntu.siniflandirma.dataset import discover

    discovery = discover(Path(args.klasor))
    samples = discovery.all_samples
    embedder = make_embedder(args.model)
    vectors = embedder.embed_images([load_rgb(s.path, limits_from(args)) for s in samples])
    truth = [discovery.labels.index(s.label) for s in samples]
    result: dict[str, Any] = {
        "model": embedder.name,
        "ornek": len(samples),
        **image_recall_at_k(vectors, truth),
    }
    if embedder.supports_text:
        queries = label_vectors(embedder, discovery.labels, TEMPLATES[args.dil])
        result.update(text_hits_at_k(vectors, truth, queries, list(range(len(discovery.labels)))))
        result["sifir_atis_dogruluk"] = float(
            ((vectors @ queries.T).argmax(axis=1) == truth).mean()
        )
    for key, value in result.items():
        console.result(f"{key}: {value:.4f}" if isinstance(value, float) else f"{key}: {value}")
    if args.json:
        write_json(Path(args.json), result)
    return 0


INDEKSLE = Command("yardim.komut.indeksle", _add_indeksle, _indeksle)
ARA = Command("yardim.komut.ara", _add_ara, _ara)
BENZER = Command("yardim.komut.benzer", _add_benzer, _benzer)
SIFIR_ATIS = Command("yardim.komut.sifir_atis", _add_sifir_atis, _sifir_atis)
ARAMA_OLC = Command("yardim.komut.arama_olc", _add_arama_olc, _arama_olc)
