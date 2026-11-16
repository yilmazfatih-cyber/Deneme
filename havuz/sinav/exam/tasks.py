"""Görev tanımları: `gorevler/<kimlik>/gorev.toml` dosyalarını okur ve doğrular.

Bir görev klasöründe şunlar bulunur (AGENTS.md → "Yeni görev"):
    gorev.toml   kimlik, temel, zorluk, tür, süre, açıklama, gizli denetimler, koruma istisnaları
    GOREV.md     ajana verilecek görev iletisi (2. ileti)
    hazirla.py   `hazirla(kopya)` — temiz kopyayı başlangıç durumuna getirir
    cozum.py     `coz(kopya)` — başvuru çözümü (ajana verilmez)
    hile.py      (isteğe bağlı) `hile(kopya)` — görevin "en kolay hilesi"; dogrula bunun yakalandığını sınar
    gizli/       gizli test dosyaları (puanlamada kopyaya konur, koşulur, silinir)

Bilinmeyen anahtar hata verir (yazım yanlışı sessizce yutulmasın).
Genişletme: gorev.toml'a yeni alan → `_ALANLAR` ya da `_GIZLI_ALANLARI`'na ad + `Task`/`HiddenCheck`'e alan.
"""

from __future__ import annotations

import hashlib
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from exam.paths import GOREVLER
from exam.tree import iter_files

ZORLUKLAR = ("kolay", "orta", "zor")
TURLER = ("ozellik", "hata", "degisiklik", "okuma", "tuzak")
TUR_ADLARI = {
    "ozellik": "özellik",
    "hata": "hata düzeltme",
    "degisiklik": "değişiklik",
    "okuma": "okuma/yorum",
    "tuzak": "tuzak",
}
DENETIM_BEKLENTISI = ("yesil", "kirmizi")
KONUMLAR = ("kopya", "gorev")

_ALANLAR = {
    "kimlik", "baslik", "temel", "zorluk", "tur", "tahmini_sure_dk", "aciklama",
    "baslangic_denetimi", "koruma", "gizli", "denetim",
}  # fmt: skip
_GIZLI_ALANLARI = {"ad", "komut", "klasor", "konum", "dosyalar", "ortam", "zaman_asimi_sn"}
_KORUMA_ALANLARI = {"izinli", "degismez"}


class TaskError(ValueError):
    """gorev.toml geçersiz ya da görev klasöründe eksik dosya var."""


@dataclass(frozen=True)
class HiddenCheck:
    """Puanlamada koşulan gizli bir denetim (çoğunlukla bir test dosyası)."""

    name: str
    command: str
    folder: str = "."
    where: str = "kopya"
    files: dict[str, str] = field(default_factory=dict)
    env: dict[str, str] = field(default_factory=dict)
    timeout_s: int = 900


@dataclass(frozen=True)
class Task:
    """Bir sınav görevi."""

    id: str
    title: str
    foundation: str
    difficulty: str
    kind: str
    minutes: int
    summary: str
    folder: Path
    hidden: tuple[HiddenCheck, ...]
    allowed: tuple[str, ...] = ()
    strict_extra: tuple[str, ...] = ()
    check_commands: tuple[str, ...] = ()
    initial_check: str | None = None

    @property
    def message_path(self) -> Path:
        return self.folder / "GOREV.md"

    @property
    def hidden_dir(self) -> Path:
        return self.folder / "gizli"

    def script(self, name: str) -> Path:
        return self.folder / f"{name}.py"

    @property
    def has_cheat(self) -> bool:
        return self.script("hile").exists()


def _require(data: dict[str, Any], key: str, kind: type, where: str) -> Any:
    value = data.get(key)
    if not isinstance(value, kind) or isinstance(value, bool) != (kind is bool):
        raise TaskError(f"{where}: `{key}` alanı eksik ya da türü yanlış ({kind.__name__} olmalı).")
    return value


def _str_map(value: Any, where: str) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in value.items()
    ):
        raise TaskError(f"{where}: metin → metin eşlemi olmalı.")
    return dict(value)


def _str_list(value: Any, where: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise TaskError(f"{where}: metin listesi olmalı.")
    return tuple(value)


def _parse_hidden(raw: Any, where: str, hidden_dir: Path) -> HiddenCheck:
    if not isinstance(raw, dict):
        raise TaskError(f"{where}: [[gizli]] bir tablo olmalı.")
    unknown = set(raw) - _GIZLI_ALANLARI
    if unknown:
        raise TaskError(f"{where}: bilinmeyen alan(lar): {', '.join(sorted(unknown))}.")
    name = _require(raw, "ad", str, where)
    where = f"{where} ({name})"
    check = HiddenCheck(
        name=name,
        command=_require(raw, "komut", str, where),
        folder=str(raw.get("klasor", ".")),
        where=str(raw.get("konum", "kopya")),
        files=_str_map(raw.get("dosyalar"), f"{where}: dosyalar"),
        env=_str_map(raw.get("ortam"), f"{where}: ortam"),
        timeout_s=int(raw.get("zaman_asimi_sn", 900)),
    )
    if check.where not in KONUMLAR:
        raise TaskError(f"{where}: konum şunlardan biri olmalı: {', '.join(KONUMLAR)}.")
    for source, target in check.files.items():
        if not (hidden_dir / source).is_file():
            raise TaskError(f"{where}: gizli/{source} bulunamadı.")
        if "sinav" not in Path(target).name:
            raise TaskError(
                f"{where}: hedef dosya adı 'sinav' içermeli ki ajanın dosyalarıyla çakışmasın: {target}"
            )
    return check


def load_task(folder: Path) -> Task:
    """`folder/gorev.toml`'u okur, doğrular ve `Task` döndürür; sorun varsa `TaskError`."""
    toml = folder / "gorev.toml"
    if not toml.is_file():
        raise TaskError(f"{folder.name}: gorev.toml yok.")
    try:
        data = tomllib.loads(toml.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as error:
        raise TaskError(f"{folder.name}/gorev.toml okunamadı: {error}") from error
    where = f"{folder.name}/gorev.toml"
    unknown = set(data) - _ALANLAR
    if unknown:
        raise TaskError(f"{where}: bilinmeyen alan(lar): {', '.join(sorted(unknown))}.")
    task_id = _require(data, "kimlik", str, where)
    if task_id != folder.name:
        raise TaskError(f"{where}: kimlik ({task_id}) klasör adıyla ({folder.name}) aynı olmalı.")
    difficulty = _require(data, "zorluk", str, where)
    kind = _require(data, "tur", str, where)
    if difficulty not in ZORLUKLAR:
        raise TaskError(f"{where}: zorluk şunlardan biri olmalı: {', '.join(ZORLUKLAR)}.")
    if kind not in TURLER:
        raise TaskError(f"{where}: tur şunlardan biri olmalı: {', '.join(TURLER)}.")
    initial = data.get("baslangic_denetimi")
    if initial is not None and initial not in DENETIM_BEKLENTISI:
        raise TaskError(f"{where}: baslangic_denetimi 'yesil' ya da 'kirmizi' olmalı.")
    protection = data.get("koruma", {})
    if not isinstance(protection, dict) or set(protection) - _KORUMA_ALANLARI:
        raise TaskError(f"{where}: [koruma] yalnız `izinli` ve `degismez` alanlarını alır.")
    check = data.get("denetim", {})
    if not isinstance(check, dict) or set(check) - {"komutlar"}:
        raise TaskError(f"{where}: [denetim] yalnız `komutlar` alanını alır.")
    hidden_raw = data.get("gizli", [])
    if not isinstance(hidden_raw, list) or not hidden_raw:
        raise TaskError(f"{where}: en az bir [[gizli]] denetim tanımlayın.")
    hidden = tuple(
        _parse_hidden(raw, f"{where} [[gizli]] #{i + 1}", folder / "gizli")
        for i, raw in enumerate(hidden_raw)
    )
    task = Task(
        id=task_id,
        title=_require(data, "baslik", str, where),
        foundation=_require(data, "temel", str, where),
        difficulty=difficulty,
        kind=kind,
        minutes=_require(data, "tahmini_sure_dk", int, where),
        summary=_require(data, "aciklama", str, where),
        folder=folder,
        hidden=hidden,
        allowed=_str_list(protection.get("izinli"), f"{where}: koruma.izinli"),
        strict_extra=_str_list(protection.get("degismez"), f"{where}: koruma.degismez"),
        check_commands=_str_list(check.get("komutlar"), f"{where}: denetim.komutlar"),
        initial_check=initial,
    )
    for required in (task.message_path, task.script("hazirla"), task.script("cozum")):
        if not required.is_file():
            raise TaskError(f"{folder.name}: {required.name} eksik.")
    return task


def all_tasks(root: Path = GOREVLER) -> list[Task]:
    """Bütün görevler (kimliğe göre sıralı)."""
    return [
        load_task(folder) for folder in sorted(root.iterdir()) if (folder / "gorev.toml").exists()
    ]


def find_task(task_id: str, root: Path = GOREVLER) -> Task:
    folder = root / task_id
    if not (folder / "gorev.toml").exists():
        known = ", ".join(t.id for t in all_tasks(root))
        raise TaskError(f"'{task_id}' adında bir görev yok. Bilinenler: {known}")
    return load_task(folder)


def task_digest(task: Task) -> str:
    """Görev klasörünün (tanım, betikler, gizli testler) özeti: görev değişirse sonuçlar ayrışır."""
    hasher = hashlib.sha256()
    for rel in iter_files(task.folder):
        hasher.update(rel.encode() + b"\0" + (task.folder / rel).read_bytes() + b"\0")
    return hasher.hexdigest()[:16]
