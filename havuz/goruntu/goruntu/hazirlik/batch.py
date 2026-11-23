"""Klasör → klasör toplu işlem: `hazirla` (yön + boyut + biçim + temizlik) ve `temizle` (yalnız üst veri).

Kim kullanır: `goruntu/komutlar/prepare.py`.

Her dosya için: güvenli açma (sınırlar), EXIF yönünün piksellere uygulanması, (hazirla'da)
boyutlandırma, üst verisiz yeniden kodlama, atomik yazma. Açılamayan dosya ATLANIR, işlem sürer;
nedenler rapora yazılır. Kaynak dosyalara dokunulmaz (`temizle --yerinde` hariç; o da önce geçici
dosyaya yazar, sonra yerine koyar). Klasör yapısı çıktıda aynen korunur.

Genişletme: yeni bir adım (ör. filigran) için `prepare_one` içinde `encode_clean` çağrısından önce
görüntüyü dönüştürün; seçeneğini `PrepareOptions`'a ve komut satırına ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from goruntu.errors import ImageRejectedError
from goruntu.hazirlik.loader import LoadLimits, decode, normalize_mode, open_checked
from goruntu.hazirlik.metadata import (
    EXTENSION,
    OutputFormat,
    encode_clean,
    inspect_metadata,
    jpeg_tables,
    keeps_format,
)
from goruntu.hazirlik.resize import FitMode, resize_image, thumbnail
from goruntu.io_utils import write_bytes_atomic
from goruntu.messages import t


@dataclass(frozen=True)
class PrepareOptions:
    box: tuple[int, int] = (1024, 1024)
    mode: FitMode = "sigdir"
    fmt: OutputFormat | None = "webp"  # None: kaynağın biçimi
    quality: int = 88
    thumbnail_edge: int = 0
    upscale: bool = False
    keep_icc: bool = True


@dataclass
class Outcome:
    source: Path
    target: Path | None = None
    status: str = "tamam"  # "tamam" | "reddedildi"
    reason: str = ""
    message: str = ""
    findings: dict[str, Any] = field(default_factory=dict)
    size_before: int = 0
    size_after: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "kaynak": str(self.source),
            "hedef": str(self.target) if self.target else None,
            "durum": self.status,
            "neden": self.reason,
            "ileti": self.message,
            "bulgular": self.findings,
            "bayt_once": self.size_before,
            "bayt_sonra": self.size_after,
        }


def target_path(source: Path, root: Path, out_dir: Path, fmt: OutputFormat) -> Path:
    """Kaynağın kök klasöre göre yolunu çıktı klasörüne taşır, uzantıyı biçime göre değiştirir."""
    relative = source.relative_to(root) if source.is_relative_to(root) else Path(source.name)
    return (out_dir / relative).with_suffix(EXTENSION[fmt])


def _open(source: Path, limits: LoadLimits) -> tuple[Any, Any, dict[str, Any]]:
    opened = open_checked(source, limits)
    findings = inspect_metadata(opened).to_dict()
    oriented = decode(opened, source.name)
    return opened, oriented, findings


def prepare_one(
    source: Path, target: Path, options: PrepareOptions, limits: LoadLimits, fmt: OutputFormat
) -> Outcome:
    """Tek dosya: aç → yön → boyut → üst verisiz kodla → yaz (+ küçük resim)."""
    outcome = Outcome(source, size_before=source.stat().st_size if source.is_file() else 0)
    try:
        opened, oriented, outcome.findings = _open(source, limits)
        keep_alpha = fmt in ("png", "webp", "avif")
        image = normalize_mode(oriented, keep_alpha=keep_alpha, name=source.name)
        resized = resize_image(image, options.box, options.mode, upscale=options.upscale)
        icc = opened.info.get("icc_profile") if options.keep_icc else None
        data = encode_clean(resized, fmt, options.quality, icc_profile=icc)
        write_bytes_atomic(target, data)
        if options.thumbnail_edge:
            small = thumbnail(image, options.thumbnail_edge)
            small_target = target.with_name(f"{target.stem}_kucuk{EXTENSION['webp']}")
            write_bytes_atomic(small_target, encode_clean(small, "webp", 80))
    except ImageRejectedError as exc:
        outcome.status, outcome.reason, outcome.message = "reddedildi", exc.reason, str(exc)
        return outcome
    outcome.target, outcome.size_after = target, len(data)
    return outcome


IN_PLACE_FORMATS = ("JPEG", "MPO", "PNG", "WEBP", "AVIF")


def clean_one(
    source: Path,
    target_base: Path,
    limits: LoadLimits,
    keep_icc: bool = True,
    in_place: bool = False,
) -> Outcome:
    """Yalnız üst veri temizliği: boyut değişmez, biçim korunur (kayıpsız kaynak → PNG).

    `target_base` uzantısı biçime göre ayarlanır; `in_place` ise kaynak dosyanın kendisi yenilenir
    (yalnız biçimi değişmeyecek dosyalarda: JPEG, PNG, WebP, AVIF).
    """
    outcome = Outcome(source, size_before=source.stat().st_size if source.is_file() else 0)
    try:
        opened, oriented, outcome.findings = _open(source, limits)
        if in_place and opened.format not in IN_PLACE_FORMATS:
            raise ImageRejectedError("yerinde_olmaz", t("temizle.yerinde_olmaz", yol=source))
        fmt = keeps_format(opened.format)
        image = normalize_mode(oriented, keep_alpha=fmt != "jpeg", name=source.name)
        tables = jpeg_tables(opened) if fmt == "jpeg" else {}
        icc = opened.info.get("icc_profile") if keep_icc else None
        data = encode_clean(image, fmt, 95, icc_profile=icc, tables=tables or None)
        target = source if in_place else target_base.with_suffix(EXTENSION[fmt])
        write_bytes_atomic(target, data)
    except ImageRejectedError as exc:
        outcome.status, outcome.reason, outcome.message = "reddedildi", exc.reason, str(exc)
        return outcome
    outcome.target, outcome.size_after = target, len(data)
    return outcome


def summarize(outcomes: list[Outcome]) -> dict[str, int]:
    """Rapor özeti: işlenen, reddedilen ve kişisel üst veri bulunan dosya sayıları."""
    done = [o for o in outcomes if o.status == "tamam"]
    return {
        "toplam": len(outcomes),
        "islenen": len(done),
        "reddedilen": len(outcomes) - len(done),
        "gps_bulunan": sum(1 for o in outcomes if o.findings.get("gps")),
        "kisisel_bulunan": sum(1 for o in outcomes if o.findings.get("kisisel")),
        "yon_duzeltilen": sum(1 for o in outcomes if o.findings.get("yon", 1) != 1),
    }
