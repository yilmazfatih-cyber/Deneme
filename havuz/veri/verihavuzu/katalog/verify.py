"""Katalog kayıtlarını Hugging Face API'siyle doğrular: var mı, kimliği değişmiş mi, lisans ve boyut
etiketleri katalogla aynı mı, Türkçe denen küme gerçekten Türkçe etiketli mi, ticari kullanım kararı
lisansa göre fazla serbest mi? Ayrıca o günün indirme sayısını ve son değişiklik tarihini kaydeder.

Uç: ``GET https://huggingface.co/api/datasets/<kimlik>`` (yanıt alanları: id, tags, gated,
private, disabled, downloads, likes, lastModified, sha, usedStorage, cardData). ``downloads`` HF'nin
verdiği son 30 günlük indirme sayısıdır. Ağ ister; komut: ``python scripts/verify_catalog.py``.
Genişletme: yeni bir denetim için ``_differences`` içine bir blok ekleyin.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from verihavuzu.files import json_text, write_text_atomic
from verihavuzu.hat.fetch import Fetcher, FetchError
from verihavuzu.katalog.model import (
    NO_TAG,
    DatasetEntry,
    commercial_use_from_tags,
    is_not_more_permissive,
)
from verihavuzu.paths import catalog_dir

API = "https://huggingface.co/api/datasets/"


def _tags(data: dict[str, Any], prefix: str) -> list[str]:
    return [tag.split(":", 1)[1] for tag in data.get("tags", []) if tag.startswith(prefix + ":")]


def turkish_configs(data: dict[str, Any]) -> list[str]:
    """Türkçe görünen yapılandırma adları: "tr", "tur_Latn", "xquad.tr", "en-tr", "ara-tur"…"""
    card = data.get("cardData") or {}
    names = [str(c.get("config_name")) for c in card.get("configs") or [] if isinstance(c, dict)]
    pattern = re.compile(r"(^|[._\-])(tr|tur|tu|turkish)([._\-]|$)|tur_latn", re.IGNORECASE)
    return [name for name in names if pattern.search(name)]


def summarize_api(data: dict[str, Any]) -> dict[str, Any]:
    """API yanıtından saklanacak alanlar."""
    return {
        "id": data.get("id"),
        "lisans": _tags(data, "license"),
        "boyut": _tags(data, "size_categories"),
        "dil": _tags(data, "language"),
        "gorevler": _tags(data, "task_categories"),
        "gated": data.get("gated"),
        "private": data.get("private"),
        "disabled": data.get("disabled"),
        "indirme_30_gun": data.get("downloads"),
        "begeni": data.get("likes"),
        "son_degisiklik": data.get("lastModified"),
        "sha": data.get("sha"),
        "depolama_bayt": data.get("usedStorage"),
        "turkce_yapilandirmalar": turkish_configs(data)[:20],
    }


def _differences(entry: DatasetEntry, api: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if api["id"] != entry.kimlik:
        problems.append(f"kimlik değişmiş: {api['id']}")
    if api["private"] or api["disabled"]:
        problems.append("küme özel ya da devre dışı")
    tags = api["lisans"]
    if sorted(entry.license_tags()) != sorted(tags):
        problems.append(f"lisans etiketi farklı: API {', '.join(tags) or NO_TAG}")
    size = (
        api["boyut"][0]
        if len(api["boyut"]) == 1
        else (NO_TAG if not api["boyut"] else ",".join(api["boyut"]))
    )
    if entry.boyut != size:
        problems.append(f"boyut etiketi farklı: API {size}")
    turkish = {"tr", "tur"} & set(api["dil"]) or api["turkce_yapilandirmalar"]
    if "tr" in entry.dil and not turkish:
        problems.append(
            "katalog Türkçe diyor ama API'de Türkçe dil etiketi ya da yapılandırması yok"
        )
    by_rule, _ = commercial_use_from_tags(tags)
    if not is_not_more_permissive(entry.ticari_kullanim, by_rule):
        problems.append(
            f"ticari kullanım '{entry.ticari_kullanim}' lisans kuralından ('{by_rule}') serbest"
        )
    return problems


def verify_entry(entry: DatasetEntry, fetcher: Fetcher) -> dict[str, Any]:
    url = API + entry.kimlik
    try:
        reply = fetcher.get(url)
    except FetchError as error:
        return {"kimlik": entry.kimlik, "durum": "erisilemedi", "farklar": [str(error)]}
    if reply.status in (401, 403, 404):
        return {"kimlik": entry.kimlik, "durum": "bulunamadi", "farklar": [f"HTTP {reply.status}"]}
    if reply.status != 200:
        return {"kimlik": entry.kimlik, "durum": "erisilemedi", "farklar": [f"HTTP {reply.status}"]}
    api = summarize_api(json.loads(reply.body.decode("utf-8")))
    problems = _differences(entry, api)
    rule, reason = commercial_use_from_tags(api["lisans"])
    return {
        "kimlik": entry.kimlik,
        "durum": "uyumsuz" if problems else "dogrulandi",
        "farklar": problems,
        "ticari_kural": rule,
        "ticari_kural_gerekce": reason,
        "ticari_katalog": entry.ticari_kullanim,
        "api": api,
    }


def verify_catalog(
    entries: list[DatasetEntry], fetcher: Fetcher, *, user_agent: str
) -> dict[str, Any]:
    results = [verify_entry(entry, fetcher) for entry in entries]
    return {
        "dogrulama_zamani": datetime.now(UTC).isoformat(timespec="seconds"),
        "kaynak": API + "<kimlik>",
        "kullanici_aracisi": user_agent,
        "ozet": dict(Counter(item["durum"] for item in results)),
        "kumeler": results,
    }


def latest_report() -> Path | None:
    """``katalog/`` altındaki en yeni ``dogrulama-*.json`` dosyası."""
    reports = sorted(catalog_dir().glob("dogrulama-*.json"))
    return reports[-1] if reports else None


def unverified(entries: list[DatasetEntry], report_path: Path | None) -> list[str]:
    """Son doğrulamada "dogrulandi" olmayan (ya da hiç bulunmayan) kayıtlar — ağ istemez."""
    if report_path is None:
        return [f"{entry.kimlik}: doğrulama dosyası yok" for entry in entries]
    report = json.loads(report_path.read_text(encoding="utf-8"))
    status = {item["kimlik"]: item["durum"] for item in report["kumeler"]}
    return [
        f"{entry.kimlik}: {status.get(entry.kimlik, 'doğrulama dosyasında yok')}"
        for entry in entries
        if status.get(entry.kimlik) != "dogrulandi"
    ]


def write_verification(
    entries: list[DatasetEntry], fetcher: Fetcher
) -> tuple[Path, dict[str, Any]]:
    """Ağdan doğrular ve ``katalog/dogrulama-<bugün>.json``a yazar."""
    report = verify_catalog(entries, fetcher, user_agent=fetcher.config.user_agent)
    path = catalog_dir() / f"dogrulama-{date.today().isoformat()}.json"
    write_text_atomic(path, json_text(report))
    return path, report
