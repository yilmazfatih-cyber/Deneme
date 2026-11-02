"""Kaynak kayıt defteri. `get_source("yargitay")` -> adaptör örneği."""

from __future__ import annotations

import importlib

import httpx

from legalai.models import SourceId
from legalai.sources.base import BaseSource

# source_id -> (modül, sınıf). Modüller tembel yüklenir; biri eksikse diğerleri çalışır.
_REGISTRY: dict[SourceId, tuple[str, str]] = {
    SourceId.RESMI_GAZETE: ("legalai.sources.resmi_gazete", "ResmiGazeteSource"),
    SourceId.MEVZUAT: ("legalai.sources.mevzuat", "MevzuatSource"),
    SourceId.YARGITAY: ("legalai.sources.yargitay", "YargitaySource"),
    SourceId.DANISTAY: ("legalai.sources.danistay", "DanistaySource"),
    SourceId.AYM_NORM: ("legalai.sources.aym", "AymNormSource"),
    SourceId.AYM_BIREYSEL: ("legalai.sources.aym", "AymBireyselSource"),
    SourceId.UYAP_EMSAL: ("legalai.sources.uyap_emsal", "UyapEmsalSource"),
    SourceId.KVKK: ("legalai.sources.kvkk", "KvkkSource"),
    SourceId.REKABET: ("legalai.sources.rekabet", "RekabetSource"),
}


def available_sources() -> list[SourceId]:
    return list(_REGISTRY)


def get_source(source: SourceId | str, http: httpx.AsyncClient | None = None) -> BaseSource:
    sid = SourceId(source)
    module_name, class_name = _REGISTRY[sid]
    module = importlib.import_module(module_name)
    cls: type[BaseSource] = getattr(module, class_name)
    return cls(http=http)
