"""Eğitim durumunun diske yazılması (bire bir sürdürme), JSONL günlük ve güvenli Ctrl+C.

`egitim-durumu.pt` tek dosyadır ve tek seferde yerine konur (yarım kalmaz): model ağırlıkları,
eniyileyici momentleri, ölçekleyici, adım sayısı, en iyi doğrulama kaybı. Yığın örneklemesi ve
öğrenme oranı adım numarasının saf işlevi olduğu için başka durum gerekmez.
Dosya `torch.load(..., weights_only=True)` ile okunur: içinden kod çalıştırılamaz.

Genişletme: Eğitime yeni bir durum eklerseniz (ör. EMA ağırlıkları) `save_state` sözlüğüne ve
`train.py` içindeki yüklemeye ekleyin; "sürdürme bire bir" testi (tests/test_train.py) geçmeli.
"""

from __future__ import annotations

import json
import os
import signal
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import torch

STATE_NAME = "egitim-durumu.pt"
LOG_NAME = "gunluk.jsonl"


def save_state(path: Path, state: dict[str, Any]) -> None:
    """Durumu önce geçici dosyaya yazar, sonra yerine koyar."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    torch.save(state, temporary)
    os.replace(temporary, path)


def load_state(path: Path, device: torch.device) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Sürdürülecek eğitim bulunamadı: {path}. --surdur seçeneğini kaldırıp baştan başlatın "
            "ya da out_dir'i denetleyin."
        )
    state: dict[str, Any] = torch.load(path, map_location=device, weights_only=True)
    return state


class JsonlLogger:
    """Her satırı bir JSON nesnesi olan günlük. Sürdürmede eski adımların ötesi kırpılır."""

    def __init__(self, path: Path, *, keep_until: int | None = None) -> None:
        self._path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        kept: list[str] = []
        if keep_until is not None and path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip() and json.loads(line).get("step", 0) <= keep_until:
                    kept.append(line)
        path.write_text("".join(line + "\n" for line in kept), encoding="utf-8")

    def write(self, record: dict[str, Any]) -> None:
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_log(path: str | Path) -> list[dict[str, Any]]:
    """Günlüğü okur (rapor ve testler için)."""
    file = Path(path)
    if file.is_dir():
        file = file / LOG_NAME
    if not file.is_file():
        raise FileNotFoundError(f"Günlük dosyası bulunamadı: {file}")
    return [
        json.loads(line) for line in file.read_text(encoding="utf-8").splitlines() if line.strip()
    ]


class StopRequest:
    """Ctrl+C'yi bayrağa çevirir: eğitim adımın ortasında değil, adım bitince durur.

    İkinci Ctrl+C hemen keser. Ana iş parçacığı dışında (ör. testler) hiçbir şey yapmaz.
    """

    def __init__(self, log: Callable[[str], None]) -> None:
        self.requested = False
        self._log = log
        self._previous: Any = None

    def _handle(self, signum: int, frame: Any) -> None:
        if self.requested:
            raise KeyboardInterrupt
        self.requested = True
        self._log(
            "Durdurma isteği alındı; bu adım bitince kaydedilip durulacak "
            "(hemen kesmek için yine Ctrl+C)."
        )

    def __enter__(self) -> StopRequest:
        if threading.current_thread() is threading.main_thread():
            self._previous = signal.signal(signal.SIGINT, self._handle)
        return self

    def __exit__(self, *exc: object) -> None:
        if self._previous is not None:
            signal.signal(signal.SIGINT, self._previous)
