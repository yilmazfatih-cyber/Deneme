"""Katalogdaki bir kümeyi Hugging Face'ten indirir (ağ ister).

1. Dosya listesi: ``GET https://huggingface.co/api/datasets/<kimlik>/tree/main?recursive=1``
2. Veri dosyaları (.parquet, .csv, .tsv, .jsonl, .json) seçilir; ``--ornek N`` verilirse yalnız EN
   KÜÇÜK veri dosyası indirilir ve ilk N satırı ``ornek.jsonl``e yazılır (Parquet için DuckDB
   gerekir).
3. Dosyalar ``https://huggingface.co/datasets/<kimlik>/resolve/main/<yol>`` adresinden alınır;
   büyük (LFS) dosyalarda SHA-256 özeti dosya listesindekiyle karşılaştırılır.
Erişim onayı isteyen (gated) kümeler için önce web sayfasında koşulları kabul edin, sonra
``HF_TOKEN`` ortam değişkenini ayarlayın (belirteç günlüğe yazılmaz).
Büyük kümeler için ``datasets`` kitaplığı daha uygundur; burada dosya başına üst sınır vardır.
Genişletme: yeni bir dosya türü için ``DATA_SUFFIXES``e ekleyin ve ``_sample_rows``a
okuyucusunu yazın.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

from verihavuzu.files import write_jsonl
from verihavuzu.hat.fetch import Fetcher
from verihavuzu.text import slug_tr

API = "https://huggingface.co/api/datasets/"
FILES = "https://huggingface.co/datasets/"
DATA_SUFFIXES = (".parquet", ".csv", ".tsv", ".jsonl", ".json")
DEFAULT_MAX_MB = 300


class DownloadError(RuntimeError):
    """İndirme başarısız (ileti Türkçedir ve ne yapılacağını söyler)."""


@dataclass
class RemoteFile:
    path: str
    size: int
    sha256: str | None


def _auth() -> dict[str, str]:
    token = os.environ.get("HF_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


def _next_page(link_header: str | None) -> str | None:
    """``Link: <adres>; rel="next"`` üst bilgisinden sonraki sayfa adresi."""
    for part in (link_header or "").split(","):
        if 'rel="next"' in part and "<" in part and ">" in part:
            return part[part.index("<") + 1 : part.index(">")]
    return None


def list_data_files(kimlik: str, fetcher: Fetcher, *, max_pages: int = 20) -> list[RemoteFile]:
    """Depodaki veri dosyaları (sayfalı liste izlenir, en çok ``max_pages`` sayfa)."""
    url: str | None = f"{API}{kimlik}/tree/main?recursive=1"
    files: list[RemoteFile] = []
    for _ in range(max_pages):
        if url is None:
            break
        reply = fetcher.get(url, extra_headers=_auth())
        if reply.status in (401, 403):
            raise DownloadError(
                f"{kimlik} erişim onayı istiyor: "
                f"https://huggingface.co/datasets/{kimlik} sayfasında "
                "koşulları kabul edin ve HF_TOKEN ortam değişkenini ayarlayın."
            )
        if reply.status == 404:
            raise DownloadError(f"Küme bulunamadı: {kimlik}. Kimliği 'katalog ara' ile denetleyin.")
        if reply.status != 200:
            raise DownloadError(f"Dosya listesi alınamadı (HTTP {reply.status}).")
        for item in json.loads(reply.body.decode("utf-8")):
            path = str(item.get("path", ""))
            if item.get("type") == "file" and path.endswith(DATA_SUFFIXES):
                lfs = item.get("lfs") or {}
                size = int(lfs.get("size", item.get("size", 0)))
                files.append(RemoteFile(path, size, lfs.get("oid")))
        url = _next_page(reply.headers.get("link"))
    return files


def _safe_target(base: Path, relative: str) -> Path:
    """Uzak dosya yolunu klasör içinde tutar (``..`` ile dışarı çıkılamaz)."""
    path = (base / relative).resolve()
    if not path.is_relative_to(base.resolve()):
        raise DownloadError(f"Güvenli olmayan dosya yolu reddedildi: {relative!r}")
    return path


def _fetch_file(kimlik: str, remote: RemoteFile, fetcher: Fetcher, max_bytes: int) -> bytes:
    if remote.size > max_bytes:
        raise DownloadError(
            f"{remote.path} {remote.size / 1e6:.0f} MB; sınır {max_bytes / 1e6:.0f} MB. "
            "Gerekiyorsa --en-buyuk-mb ile artırın ya da datasets kitaplığını kullanın."
        )
    url = f"{FILES}{kimlik}/resolve/main/{quote(remote.path)}"
    reply = fetcher.get(url, extra_headers=_auth())
    if reply.status in (401, 403):
        raise DownloadError(
            f"{kimlik}: erişim reddedildi; koşulları kabul edip HF_TOKEN ayarlayın."
        )
    if reply.status != 200:
        raise DownloadError(f"{remote.path} indirilemedi (HTTP {reply.status}).")
    if remote.sha256 and hashlib.sha256(reply.body).hexdigest() != remote.sha256:
        raise DownloadError(f"{remote.path}: SHA-256 özeti tutmuyor; dosya bozuk inmiş olabilir.")
    return reply.body


def _sample_rows(name: str, body: bytes, count: int, scratch: Path) -> list[dict[str, Any]]:
    if name.endswith(".jsonl"):
        lines = [line for line in body.decode("utf-8").splitlines() if line.strip()][:count]
        return [json.loads(line) for line in lines]
    if name.endswith(".json"):
        data = json.loads(body.decode("utf-8"))
        rows = data if isinstance(data, list) else data.get("data", [])
        return list(rows[:count])
    if name.endswith((".csv", ".tsv")):
        reader = csv.DictReader(
            io.StringIO(body.decode("utf-8-sig")), delimiter="\t" if name.endswith(".tsv") else ","
        )
        return [dict(row) for _, row in zip(range(count), reader, strict=False)]
    try:
        import duckdb
    except ImportError as error:
        raise DownloadError(
            'Parquet örneği için DuckDB gerekir: pip install -e ".[analiz]"'
        ) from error
    path = scratch / "gecici.parquet"
    path.write_bytes(body)
    try:
        connection = duckdb.connect()
        cursor = connection.execute("SELECT * FROM read_parquet(?) LIMIT ?", [str(path), count])
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, values, strict=True)) for values in cursor.fetchall()]
        connection.close()
    finally:
        path.unlink(missing_ok=True)
    return [
        {
            k: (v if isinstance(v, str | int | float | bool | type(None)) else str(v))
            for k, v in r.items()
        }
        for r in rows
    ]


def download(
    kimlik: str,
    out_dir: Path,
    fetcher: Fetcher,
    *,
    sample: int | None = None,
    max_mb: int = DEFAULT_MAX_MB,
) -> dict[str, Any]:
    """Kümeyi indirir; özet sözlüğü döndürür (dosyalar, satır sayısı)."""
    files = list_data_files(kimlik, fetcher)
    if not files:
        raise DownloadError(f"{kimlik}: veri dosyası (.parquet/.csv/.jsonl/.json) bulunamadı.")
    target = out_dir / slug_tr(kimlik.replace("/", "--"))
    target.mkdir(parents=True, exist_ok=True)
    max_bytes = max_mb * 1_000_000
    if sample is not None:
        smallest = min(files, key=lambda f: f.size)
        body = _fetch_file(kimlik, smallest, fetcher, max_bytes)
        rows = _sample_rows(smallest.path, body, sample, target)
        write_jsonl(target / "ornek.jsonl", rows)
        return {
            "kimlik": kimlik,
            "klasor": str(target),
            "kaynak_dosya": smallest.path,
            "satir": len(rows),
        }
    written = []
    for remote in files:
        body = _fetch_file(kimlik, remote, fetcher, max_bytes)
        path = _safe_target(target, remote.path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        written.append(remote.path)
    return {"kimlik": kimlik, "klasor": str(target), "dosyalar": written}
