"""Depodaki minik Türkçe örnek modeli baştan üretir: veri -> tokenizer -> eğitim -> paket.

Adımlar (her biri ayrı çalıştırılabilir; sırayla):
    python scripts/ornek_model.py hazirla   # Vikipedi indir, tokenizer eğit, veriyi hazırla
    python scripts/ornek_model.py egit      # yapilandirma/ornek-model.toml ile eğit (CPU, ~15 dk)
    python scripts/ornek_model.py paketle   # ornek-model/ klasörünü ve egitim-kaydi.json'u yaz

Ham veri ve ara çıktılar `veri/` ve `calisma/` altında kalır (depoya girmez); depoya yalnız
`ornek-model/` girer. Kayıt dosyası veri kimliğini, sürümünü, dosya özetlerini, ayarları,
kayıp eğrisini ve süreyi içerir.

Genişletme: Farklı bir derlemle örnek model için `RAW`, `SOZLUK` ve yapılandırma dosyasını
değiştirin; MODEL_KARTI.md'yi yeni veriye göre elle güncelleyin.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "veri" / "ham" / "trwiki.jsonl"
SOURCE_RECORD = RAW.with_suffix(".kaynak.json")
TOKENIZER = ROOT / "calisma" / "ornek-model" / "tokenizer.json"
DATA = ROOT / "veri" / "ornek-hazir"
CONFIG = ROOT / "yapilandirma" / "ornek-model.toml"
RUN = ROOT / "calisma" / "ornek-model"
OUT = ROOT / "ornek-model"
SOZLUK = 4096
TIMINGS = RUN / "sureler.json"


def _python(*args: str) -> None:
    """Paketin komut satırını alt süreç olarak çalıştırır (belgelenen yol sınansın diye)."""
    command = [sys.executable, *args]
    print("$", " ".join(command[1:]), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def _timed(name: str, *args: str) -> None:
    started = time.perf_counter()
    if args[0].endswith(".py"):
        _python(*args)
    else:
        _python("-m", "dil_modeli", *args)
    timings = json.loads(TIMINGS.read_text(encoding="utf-8")) if TIMINGS.is_file() else {}
    timings[name] = round(time.perf_counter() - started, 1)
    TIMINGS.parent.mkdir(parents=True, exist_ok=True)
    TIMINGS.write_text(json.dumps(timings, indent=2) + "\n", encoding="utf-8")


def prepare() -> None:
    if not RAW.is_file():
        _timed("indirme_sn", "scripts/ornek_veri_indir.py", "--cikti", str(RAW), "--hedef-mb", "24")
    _timed(
        "tokenizer_sn",
        "tokenizer-egit",
        "--girdi",
        str(RAW),
        "--cikti",
        str(TOKENIZER),
        "--sozluk",
        str(SOZLUK),
    )
    _timed(
        "veri_hazirlama_sn",
        "veri-hazirla",
        "--girdi",
        str(RAW),
        "--tokenizer",
        str(TOKENIZER),
        "--cikti",
        str(DATA),
        "--dogrulama-orani",
        "0.02",
    )


def train() -> None:
    _timed("egitim_sn", "egit", "--yapilandirma", str(CONFIG.relative_to(ROOT)))


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _val_texts() -> list[str]:
    """Veri hazırlamada doğrulamaya ayrılan belgelerin metni (aynı belirlenimci seçimle)."""
    from dil_modeli.corpus import iter_pieces
    from dil_modeli.data import _is_val

    settings = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))["settings"]
    return [
        piece.text
        for index, piece in enumerate(iter_pieces([RAW]))
        if _is_val(settings["seed"], index, settings["val_fraction"])
    ]


def _quality(model_dir: Path, web_dirs: dict[str, Path], val_file: Path) -> dict[str, Any]:
    """Doğrulama kaybı (float32/float16/int8) ve kayan pencereli şaşkınlık + karakter başına bit."""
    import torch

    from dil_modeli.batches import TokenData
    from dil_modeli.evaluate import evaluate_text, mean_loss
    from dil_modeli.export_web import load_web
    from dil_modeli.model_io import load_model

    data = TokenData(DATA, "dogrulama")
    device = torch.device("cpu")
    variants = {"float32": load_model(model_dir)}
    variants.update({name: load_web(path) for name, path in web_dirs.items()})
    result: dict[str, Any] = {}
    for name, (model, tokenizer) in variants.items():
        loss = mean_loss(model, data.eval_batches(16, model.config.max_seq_len), device)
        text = evaluate_text(model, tokenizer, [val_file], batch_size=16)
        result[name] = {"dogrulama_kaybi": round(loss, 4), **text.to_dict()}
        print(f"  {name}: kayıp {loss:.4f}, kayan pencere {text.to_dict()}")
    return result


def _samples(model_dir: Path) -> list[dict[str, Any]]:
    from dil_modeli.generate import generate_text
    from dil_modeli.model_io import load_model
    from dil_modeli.sampling import SamplingConfig

    model, tokenizer = load_model(model_dir)
    settings = SamplingConfig(
        max_new_tokens=60, temperature=0.8, top_p=0.95, repetition_penalty=1.1, seed=0
    )
    prompts = ["Türkiye'nin başkenti", "İstanbul", "Osmanlı İmparatorluğu", "Futbol"]
    return [
        {
            "istem": prompt,
            "cikti": generate_text(model, tokenizer, prompt, settings),
            "ayarlar": "sicaklik 0.8, top_p 0.95, yineleme_cezasi 1.1, tohum 0, 60 belirtec",
        }
        for prompt in prompts
    ]


def _curve(run_dir: Path) -> dict[str, list[list[float]]]:
    from dil_modeli.train_state import read_log

    rows = read_log(run_dir)
    return {
        "egitim": [[row["step"], row["loss"]] for row in rows if "loss" in row],
        "dogrulama": [[row["step"], row["val_loss"]] for row in rows if "val_loss" in row],
        "belirtec_per_sn": [
            [row["step"], row["tokens_per_sec"]] for row in rows if "tokens_per_sec" in row
        ],
    }


def package() -> None:
    import platform
    import shutil
    import tempfile
    import tomllib

    import torch

    from dil_modeli.config import count_parameters
    from dil_modeli.export_web import export_web
    from dil_modeli.model_io import load_model, read_config, save_model

    torch.set_num_threads(2)  # paylaşımlı makine
    run_dir = RUN / "egitim"
    best = run_dir / "en-iyi"
    model, tokenizer = load_model(best)
    for stale in (OUT / "model.safetensors", OUT / "tarayici"):
        if stale.is_dir():
            shutil.rmtree(stale)
    save_model(OUT, model, tokenizer, info=read_config(best)["info"])
    export_web(model, tokenizer, OUT / "tarayici", "int8")
    with tempfile.TemporaryDirectory() as scratch:
        half = Path(scratch) / "float16"
        export_web(model, tokenizer, half, "float16")
        val_file = Path(scratch) / "dogrulama.jsonl"
        val_file.write_text(
            "".join(json.dumps({"text": t}, ensure_ascii=False) + "\n" for t in _val_texts()),
            "utf-8",
        )
        quality = _quality(OUT, {"float16": half, "int8": OUT / "tarayici"}, val_file)
        sizes = {
            "float32": (OUT / "model.safetensors").stat().st_size,
            "float16": (half / "model.bin").stat().st_size,
            "int8": (OUT / "tarayici" / "model.bin").stat().st_size,
        }
    for name, size in sizes.items():
        quality[name]["bayt"] = size
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    record: dict[str, Any] = {
        "model": {
            "parametre": count_parameters(model.config),
            "yapilandirma": model.config.to_dict(),
        },
        "veri": {
            "kaynak": json.loads(SOURCE_RECORD.read_text(encoding="utf-8")),
            "hazirlama": {k: meta[k] for k in ("documents", "chars", "splits", "settings")},
            "tokenizer_ozeti": meta["tokenizer_fingerprint"],
        },
        "egitim": {
            "komut": "python scripts/ornek_model.py hazirla && python scripts/ornek_model.py egit",
            "yapilandirma_dosyasi": str(CONFIG.relative_to(ROOT)),
            "ayarlar": tomllib.loads(CONFIG.read_text(encoding="utf-8")),
            "en_iyi_denetim_noktasi": read_config(best)["info"],
            "sureler_sn": json.loads(TIMINGS.read_text(encoding="utf-8"))
            if TIMINGS.is_file()
            else {},
            "kayip_egrisi": _curve(run_dir),
        },
        "ortam": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "isletim_sistemi": platform.system(),
            "islemci_cekirdegi_kullanilan": 2,
        },
        "olcumler": quality,
        "ornek_ciktilar": _samples(OUT),
    }
    record["dosyalar"] = {
        str(path.relative_to(OUT)): {"bayt": path.stat().st_size, "sha256": _sha256(path)}
        for path in sorted(OUT.rglob("*"))
        if path.is_file() and path.name not in ("egitim-kaydi.json", "MODEL_KARTI.md")
    }
    (OUT / "egitim-kaydi.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n", "utf-8"
    )
    total = sum(item["bayt"] for item in record["dosyalar"].values())
    print(f"Paketlendi: {OUT} ({total / 1e6:.2f} MB model dosyası)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Depodaki örnek modeli baştan üretir.")
    parser.add_argument(
        "adim", choices=["hazirla", "egit", "paketle", "hepsi"], help="çalıştırılacak adım"
    )
    args = parser.parse_args()
    steps = {"hazirla": [prepare], "egit": [train], "paketle": [package]}
    for step in steps.get(args.adim, [prepare, train, package]):
        step()


if __name__ == "__main__":
    main()
