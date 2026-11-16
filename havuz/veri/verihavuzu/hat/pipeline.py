"""Hat çalıştırıcı: çek → doğrula → dönüştür → yükle; koşu günlüğü, karantina, artımlı durum.

Bir hat ``PipelineSpec``tir: adı, hedef tablosu, anahtar sütunları ve üç işlev:
  ``cek(ctx)``        → ham kayıtları üretir (ağdan ``ctx.fetcher`` ile; artımlıysa ``ctx.state``
                        içindeki son konumdan başlar ve yeni konumu ``ctx.state``e yazar)
  ``dogrula(kayit)``  → sorun listesi (boşsa kayıt geçerli; doluysa satır karantinaya gider)
  ``donustur(kayit)`` → depoya yazılacak satır
Yükleme anahtara göre upsert'tür (idempotent). Durum dosyası yalnız koşu başarıyla biterse
güncellenir; yarıda kalan koşu bir sonraki çalıştırmada aynı yerden yeniden dener.
Dosyalar (``calisma/`` altında): ``durum/<hat>.json``, ``karantina/<hat>/<koşu>.jsonl``,
``hat_gunlugu.jsonl`` (her koşunun özeti; kişisel veri yazılmaz).
Genişletme: yeni hat için ``examples/tcmb.py``yi kopyalayın ve ``registry.py``ye kaydedin.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from verihavuzu.files import json_text, write_jsonl, write_text_atomic
from verihavuzu.hat.fetch import Fetcher
from verihavuzu.hat.storage import Store

Row = dict[str, Any]


@dataclass
class RunContext:
    fetcher: Fetcher
    state: dict[str, Any]
    params: dict[str, Any]
    today: date
    messages: list[str] = field(default_factory=list)

    def log(self, message: str) -> None:
        self.messages.append(message)


@dataclass(frozen=True)
class PipelineSpec:
    ad: str
    aciklama: str
    tablo: str
    anahtar: list[str]
    cek: Callable[[RunContext], Iterable[Row]]
    dogrula: Callable[[Row], list[str]]
    donustur: Callable[[Row], Row]


@dataclass
class RunRecord:
    hat: str
    kosu_id: str
    baslangic: str
    bitis: str = ""
    durum: str = "calisiyor"  # basarili · karantinali (bazı satırlar ayrıldı) · hata
    cekilen: int = 0
    gecerli: int = 0
    karantina: int = 0
    eklenen: int = 0
    guncellenen: int = 0
    degismeyen: int = 0
    hata: str | None = None
    iletiler: list[str] = field(default_factory=list)


def _state_path(work_dir: Path, name: str) -> Path:
    return work_dir / "durum" / f"{name}.json"


def load_state(work_dir: Path, name: str) -> dict[str, Any]:
    path = _state_path(work_dir, name)
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def run_pipeline(
    spec: PipelineSpec,
    store: Store,
    fetcher: Fetcher,
    work_dir: Path,
    *,
    params: dict[str, Any] | None = None,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> RunRecord:
    """Hattı bir kez çalıştırır ve koşu kaydını döndürür (hata olsa da günlüğe yazar)."""
    started = now()
    record = RunRecord(spec.ad, started.strftime("%Y%m%dT%H%M%S"), started.isoformat())
    state = load_state(work_dir, spec.ad)
    context = RunContext(fetcher, dict(state), dict(params or {}), started.date())
    try:
        raw = list(spec.cek(context))
        record.cekilen = len(raw)
        valid: list[Row] = []
        quarantined: list[Row] = []
        for number, item in enumerate(raw, start=1):
            problems = spec.dogrula(item)
            if problems:
                quarantined.append({"sira": number, "sorunlar": problems, "kayit": item})
            else:
                valid.append(spec.donustur(item))
        record.gecerli, record.karantina = len(valid), len(quarantined)
        if quarantined:
            write_jsonl(work_dir / "karantina" / spec.ad / f"{record.kosu_id}.jsonl", quarantined)
        stats = store.upsert(spec.tablo, valid, spec.anahtar)
        record.eklenen, record.guncellenen, record.degismeyen = (
            stats.eklenen,
            stats.guncellenen,
            stats.degismeyen,
        )
        write_text_atomic(_state_path(work_dir, spec.ad), json_text(context.state))
        record.durum = "karantinali" if quarantined else "basarili"
    except Exception as error:
        record.durum, record.hata = "hata", f"{type(error).__name__}: {error}"
        raise
    finally:
        record.bitis = now().isoformat()
        record.iletiler = context.messages[-50:]
        log_path = work_dir / "hat_gunlugu.jsonl"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")
    return record
