"""Hazırlık kaydı: bir görev klasörünün başlangıç durumunu ve kimliğini saklar.

Kayıt görev klasörünün DIŞINDA durur (`calisma/kayitlar/<koşu>/`): ajan kendi klasöründeki her şeyi
değiştirebilir ama başlangıç özetlerine ve anlık görüntüye dokunamaz. Görev klasöründe yalnız
`.sinav-kosu` adlı tek satırlık bir işaret dosyası bulunur (koşu kimliği); silinse de kayıt klasör
yoluyla bulunur.
Genişletme: kayda yeni alan → `Record`'a varsayılanlı alan (eski kayıtlar okunmaya devam etsin).
"""

from __future__ import annotations

import json
import secrets
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from exam.paths import records_dir
from exam.tree import Manifest, Snapshot

POINTER = ".sinav-kosu"


class RecordError(RuntimeError):
    """Görev klasörünün hazırlık kaydı bulunamadı ya da bozuk."""


@dataclass
class Record:
    run_id: str
    task_id: str
    foundation: str
    folder: str
    copy_name: str
    prepared_at: str
    prompt_digest: str
    task_digest: str
    foundation_digest: str = ""
    manifest: Manifest = field(default_factory=dict)
    installed: bool = True
    version: int = 1

    @property
    def dir(self) -> Path:
        return records_dir() / self.run_id

    @property
    def copy_root(self) -> Path:
        return Path(self.folder) / self.copy_name

    def snapshot(self) -> Snapshot:
        return Snapshot(self.dir / "baslangic.tar.gz")

    def save(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        text = json.dumps(asdict(self), ensure_ascii=False, indent=1)
        (self.dir / "kayit.json").write_text(text + "\n", encoding="utf-8")


def new_run_id(task_id: str, now: datetime) -> str:
    return f"{now:%Y%m%d-%H%M%S}-{task_id}-{secrets.token_hex(3)}"


def load(run_id: str) -> Record:
    path = records_dir() / run_id / "kayit.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return Record(**data)
    except (OSError, json.JSONDecodeError, TypeError) as error:
        raise RecordError(f"Kayıt okunamadı: {path} ({error})") from error


def find_for_folder(folder: Path) -> Record:
    """Görev klasörünün kaydını bulur: önce işaret dosyası, yoksa klasör yolu."""
    folder = folder.resolve()
    pointer = folder / POINTER
    if pointer.is_file():
        run_id = pointer.read_text(encoding="utf-8").strip()
        if (records_dir() / run_id / "kayit.json").is_file():
            return load(run_id)
    candidates = []
    if records_dir().is_dir():
        for path in sorted(records_dir().glob("*/kayit.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if data.get("folder") == str(folder):
                candidates.append(path.parent.name)
    if not candidates:
        raise RecordError(
            f"{folder} için hazırlık kaydı yok. Bu klasör `python havuz/sinav/sinav.py hazirla "
            "<görev> <klasör>` ile mi açıldı? Kayıtlar: " + str(records_dir())
        )
    return load(candidates[-1])
