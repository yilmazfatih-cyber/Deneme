"""Katalog YAML dosyalarını okur ve `Catalog` nesnesi döner."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

from .schema import Catalog, ModelSpec, ModuleSpec

CATALOG_DIR = Path(__file__).resolve().parents[2] / "catalog"


def _load_yaml(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or []
    if not isinstance(data, list):
        raise ValueError(f"{path}: liste bekleniyordu")
    return data


def load_catalog(catalog_dir: Path | None = None) -> Catalog:
    d = catalog_dir or CATALOG_DIR
    models = {m["id"]: ModelSpec.model_validate(m) for m in _load_yaml(d / "models.yaml")}
    modules = {m["id"]: ModuleSpec.model_validate(m) for m in _load_yaml(d / "modules.yaml")}
    return Catalog(models=models, modules=modules)


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    return load_catalog()
