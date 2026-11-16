"""Sentetik veri hattı: tohumları okur, öğretmene sorar, ayrıştırır, süzer, kaynak kaydıyla yazar.

Kim kullanır: `synth/cli.py` (`sohbet uret`, `gomme uret`).

Dosyalar (`cikti = veri/uretilen.jsonl` ise):
- `veri/uretilen.jsonl`            : kabul edilen satırlar (her satırda `kaynak` kaydı ve `grup`)
- `veri/uretilen.reddedilen.jsonl` : reddedilen adaylar ve nedenleri (incelemek için)
- `veri/uretilen.kayit.json`       : koşu özeti (sayılar, öğretmen, istem sürümü, ayarlar)

Yeniden üretilebilirlik: tohumlar dosya sırasıyla işlenir; i. tohumun isteği `tohum + i` ile
gönderilir. Her satıra öğretmen, lisans, istem sürümü + özeti, tohum, sıcaklık ve tarih yazılır.
`--devam` ile yarıda kalan koşu, tamamlanmış tohumları atlayarak sürer.

Genişletme: yeni tarif için `synth/recipes.py`, yeni süzgeç için `synth/filters.py`.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError

from ince_ayar import console
from ince_ayar.data.validate import load_chat, load_pairs
from ince_ayar.errors import UserError, explain_validation_error
from ince_ayar.io_utils import append_jsonl, read_rows, write_json
from ince_ayar.messages import t
from ince_ayar.synth.client import TeacherClient
from ince_ayar.synth.config import SeedRow, SynthConfig
from ince_ayar.synth.filters import QualityFilter
from ince_ayar.synth.recipes import RECIPES, Prompt, load_prompt, parse_candidates


@dataclass
class SynthStats:
    requests: int = 0
    candidates: int = 0
    accepted: int = 0
    skipped_seeds: int = 0
    rejected: Counter[str] = field(default_factory=Counter)

    def to_dict(self) -> dict[str, Any]:
        return {
            "istek": self.requests,
            "aday": self.candidates,
            "kabul": self.accepted,
            "atlanan_tohum": self.skipped_seeds,
            "ret": dict(sorted(self.rejected.items())),
        }


def side_paths(output: Path) -> tuple[Path, Path]:
    """Reddedilenler ve kayıt dosyasının yolları."""
    stem = output.with_suffix("")
    return Path(f"{stem}.reddedilen.jsonl"), Path(f"{stem}.kayit.json")


def load_seeds(path: Path, needs_document: bool) -> list[SeedRow]:
    """Tohum dosyasını okur ve doğrular; kimlikler benzersiz olmalıdır."""
    seeds: list[SeedRow] = []
    problems: list[str] = []
    for raw in read_rows(path):
        if raw.data is None:
            problems.append(f"{raw.line}. satır: {raw.error}")
            continue
        try:
            seed = SeedRow.model_validate(raw.data)
        except ValidationError as exc:
            problems.extend(f"{raw.line}. satır: {line}" for line in explain_validation_error(exc))
            continue
        if needs_document and not seed.belge.strip():
            problems.append(f"{raw.line}. satır: {t('uret.belge_gerekli')}")
        seeds.append(seed)
    duplicates = [k for k, n in Counter(s.kimlik for s in seeds).items() if n > 1]
    problems.extend(t("uret.kimlik_yineleniyor", kimlik=k) for k in duplicates)
    if problems:
        raise UserError(t("uret.tohum_hatali", yol=path, liste="\n  ".join(problems[:20])))
    return seeds


def _existing_texts(config: SynthConfig) -> list[str]:
    texts: list[str] = []
    for name in config.suzgec.mevcut_veri:
        if config.tarif == "talimat":
            rows = load_chat(Path(name)).rows
            texts.extend(m["content"] for r in rows for m in r.messages if m["role"] == "user")
        else:
            texts.extend(row.query for row in load_pairs(Path(name)).rows)
    return texts


def _resume_state(output: Path, quality: QualityFilter, field_name: str) -> set[str]:
    """Önceki koşunun tamamladığı tohum kimlikleri; kabul edilenler yineleme dizinine eklenir."""
    done: set[str] = set()
    if not output.exists():
        return done
    for raw in read_rows(output):
        if raw.data is None:
            continue
        done.add(str(raw.data.get("grup", "")))
        if field_name == "sorgu":
            quality.remember({"sorgu": str(raw.data.get("sorgu", ""))})
        else:
            users = [m["content"] for m in raw.data.get("messages", []) if m.get("role") == "user"]
            quality.remember({"talimat": users[-1] if users else ""})
    return done


def provenance(
    config: SynthConfig, prompt: Prompt, seed: SeedRow, request_seed: int, order: int, today: date
) -> dict[str, Any]:
    """Satıra yazılan kaynak kaydı. Uç noktanın yalnız sunucu adı yazılır (yol, anahtar yazılmaz)."""
    return {
        "tur": "sentetik",
        "tarif": config.tarif,
        "ogretmen_model": config.ogretmen.model,
        "ogretmen_lisansi": config.ogretmen.lisans,
        "uc_nokta": urlparse(config.ogretmen.uc_nokta).netloc or config.ogretmen.uc_nokta,
        "istem_surumu": prompt.version,
        "istem_ozeti": prompt.digest,
        "tohum": request_seed,
        "sicaklik": config.ogretmen.sicaklik,
        "tohum_kimligi": seed.kimlik,
        "sira": order,
        "tarih": today.isoformat(),
    }


def run_pipeline(
    config: SynthConfig,
    client: TeacherClient,
    limit: int | None = None,
    resume: bool = False,
    today: Callable[[], date] = date.today,
) -> SynthStats:
    """Hattı çalıştırır ve sayıları döndürür."""
    recipe = RECIPES[config.tarif]
    prompt = load_prompt(config.tarif, config.istem)
    seeds = load_seeds(Path(config.girdi), recipe.needs_document)[: limit or None]
    output = Path(config.cikti)
    rejected_path, record_path = side_paths(output)
    quality = QualityFilter(config.suzgec, recipe.dedup_field)
    quality.add_existing(_existing_texts(config))
    done = _resume_state(output, quality, recipe.dedup_field) if resume else set()
    if not resume:
        for path in (output, rejected_path):
            path.unlink(missing_ok=True)
    stats = SynthStats()
    for index, seed in enumerate(seeds):
        if seed.kimlik in done:
            stats.skipped_seeds += 1
            continue
        request_seed = config.tohum + index
        messages = [{"role": "user", "content": prompt.render(seed, config.ornek_sayisi)}]
        reply = client.complete(
            messages, config.ogretmen.sicaklik, config.ogretmen.azami_belirtec, request_seed
        )
        stats.requests += 1
        candidates, problem = parse_candidates(config.tarif, reply)
        if problem:
            stats.rejected["bicim"] += 1
            append_jsonl(
                rejected_path,
                {
                    "tohum_kimligi": seed.kimlik,
                    "neden": "bicim",
                    "ayrinti": problem,
                    "yanit": reply[:2000],
                },
            )
            continue
        for order, candidate in enumerate(candidates):
            stats.candidates += 1
            reason = quality.check(candidate)
            if reason:
                stats.rejected[reason] += 1
                append_jsonl(
                    rejected_path, {"tohum_kimligi": seed.kimlik, "neden": reason, **candidate}
                )
                continue
            row = recipe.to_row(candidate, seed, config.sistem_istemi)
            row["kaynak"] = provenance(config, prompt, seed, request_seed, order, today())
            append_jsonl(output, row)
            stats.accepted += 1
        console.info(t("uret.ilerleme", sira=index + 1, toplam=len(seeds), kabul=stats.accepted))
    record = {
        "ayar": config.model_dump(),
        "istem_surumu": prompt.version,
        "istem_ozeti": prompt.digest,
        "sonuc": stats.to_dict(),
        "tarih": today().isoformat(),
    }
    write_json(record_path, record)
    return stats
