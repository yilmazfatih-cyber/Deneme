"""Yapılandırma: TOML dosyasını okur, komut satırı değişikliklerini uygular, şemayla doğrular.

Kim kullanır: her görev kendi yapılandırma sınıfını (`tasks/<görev>/config.py`) buradaki ortak
bölümlerden kurar ve `load_config` ile yükler.

Kurallar:
- Alan adları TOML dosyasındaki Türkçe (ASCII) anahtarlarla **aynıdır**; tek sözlük, çeviri yok.
- Tanınmayan anahtar hatadır (`extra="forbid"`): yazım hatası sessizce yok sayılmaz.
- Yollar komutun çalıştığı klasöre (temel klasörü) göredir.
- Hazır ayarlar `yapilandirma/<görev>/<hazır>.toml` dosyalarıdır (`cpu-deneme`, `colab-t4`,
  `tek-gpu-24gb`); `-D bolum.anahtar=deger` ile tek tek değer değiştirilir.

Genişletme: bütün görevlerde geçerli yeni bir alan için buradaki bölüme, tek göreve özgü alan
için o görevin `config.py` dosyasına ekleyin; sonra hazır ayar dosyalarına yazın.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ince_ayar.errors import UserError, explain_validation_error
from ince_ayar.io_utils import read_text
from ince_ayar.messages import t

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRESET_DIR = PROJECT_ROOT / "yapilandirma"
PRESETS = ("cpu-deneme", "colab-t4", "tek-gpu-24gb")
TINY_MODEL = "minik-rastgele"

C = TypeVar("C", bound=BaseModel)


class Section(BaseModel):
    """Bütün yapılandırma bölümlerinin atası: tanınmayan anahtar hatadır."""

    model_config = ConfigDict(extra="forbid")


class ModelSection(Section):
    taban: str = Field(description="Hugging Face kimliği, yerel klasör ya da 'minik-rastgele'")
    surum: str = Field("", description="Depo sürümü (commit/etiket); boşsa en güncel")
    uzak_kod: bool = Field(False, description="Depodaki özel Python kodunu çalıştırmaya izin ver")
    duyarlik: Literal["oto", "fp32", "fp16", "bf16"] = "oto"


class DataSection(Section):
    egitim: str = Field(description="Eğitim verisi (JSONL ya da CSV)")
    dogrulama: str = Field("", description="Ayrı doğrulama dosyası; boşsa eğitimden ayrılır")
    dogrulama_orani: float = Field(0.1, gt=0.0, lt=0.5)
    azami_uzunluk: int = Field(256, ge=8)
    grup_alani: str = Field("", description="Aynı tarafta tutulacak örnekleri gösteren alan adı")
    benzerlik_esigi: float = Field(0.85, ge=0.5, le=1.0)
    kodlama: str = "utf-8"
    tohum: int = 42


class TrainSection(Section):
    cikti: str = Field(description="Çıktı klasörü")
    donem: float = Field(3.0, gt=0.0)
    azami_adim: int = Field(-1, description="-1: dönem sayısı belirler; >0: bu adımda dur")
    ogrenme_orani: float = Field(gt=0.0)
    yigin: int = Field(ge=1)
    biriktirme: int = Field(1, ge=1, description="Gradyan biriktirme adımı")
    degerlendirme_yigini: int = Field(8, ge=1)
    isinma_orani: float = Field(0.05, ge=0.0, lt=1.0)
    agirlik_curumesi: float = Field(0.01, ge=0.0)
    zamanlayici: Literal["linear", "cosine", "constant"] = "linear"
    kayit_adimi: int = Field(10, ge=1)
    tohum: int = 42
    is_parcacigi: int = Field(0, ge=0, description="CPU iş parçacığı; 0: otomatik (en çok 4)")
    hedef_bellek_gb: float = Field(
        0.0,
        ge=0.0,
        description="Hazır ayarın hedeflediği GPU belleği; kuru çalıştırmada kıyas için",
    )


def preset_path(task: str, preset: str) -> Path:
    """Hazır ayar dosyasının yolu; yoksa hangi adların geçerli olduğunu söyler."""
    path = PRESET_DIR / task / f"{preset}.toml"
    if not path.is_file():
        raise UserError(
            t("ayar.hazir_yok", hazir=preset, gorev=task, secenekler=", ".join(PRESETS))
        )
    return path


def resolve_config_path(task: str, config: str | None, preset: str | None) -> Path:
    """`--ayar` ya da `--hazir` seçeneklerinden tam biri verilmelidir."""
    if config and preset:
        raise UserError(t("ayar.ikisi_birden"))
    if config:
        return Path(config)
    if preset:
        return preset_path(task, preset)
    raise UserError(t("ayar.eksik", gorev=task))


def parse_override(text: str) -> tuple[list[str], Any]:
    """'egitim.yigin=8' → (['egitim', 'yigin'], 8). Değer TOML olarak okunur; olmazsa düz metin."""
    key, separator, raw = text.partition("=")
    if not separator or not key.strip():
        raise UserError(t("ayar.degistir_bicim", girdi=text))
    try:
        value = tomllib.loads(f"v = {raw}")["v"]
    except tomllib.TOMLDecodeError:
        value = raw.strip()
    return key.strip().split("."), value


def apply_overrides(data: dict[str, Any], overrides: list[str]) -> dict[str, Any]:
    """`-D` ile verilen değişiklikleri sözlüğe işler (yerinde değiştirir ve döndürür)."""
    for text in overrides:
        keys, value = parse_override(text)
        node = data
        for key in keys[:-1]:
            child = node.setdefault(key, {})
            if not isinstance(child, dict):
                raise UserError(t("ayar.degistir_bicim", girdi=text))
            node = child
        node[keys[-1]] = value
    return data


def load_config(path: Path, schema: type[C], overrides: list[str] | None = None) -> C:
    """TOML dosyasını okur, değişiklikleri uygular ve `schema` ile doğrular."""
    try:
        data = tomllib.loads(read_text(path))
    except tomllib.TOMLDecodeError as exc:
        raise UserError(t("ayar.toml_bozuk", yol=path, ayrinti=str(exc))) from exc
    apply_overrides(data, overrides or [])
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        problems = "\n  ".join(explain_validation_error(exc))
        raise UserError(t("ayar.gecersiz", yol=path, liste=problems)) from exc


def dump_config(config: BaseModel) -> str:
    """Çözülmüş yapılandırmayı TOML metni olarak yazar (çıktı klasörüne kayıt için)."""
    lines: list[str] = []
    payload = config.model_dump()
    for key, value in payload.items():
        if not isinstance(value, dict):
            lines.append(f"{key} = {_toml_value(value)}")
    for key, value in payload.items():
        if isinstance(value, dict):
            lines.append(f"\n[{key}]")
            lines.extend(f"{name} = {_toml_value(item)}" for name, item in value.items())
    return "\n".join(lines) + "\n"


def _toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return repr(value)
    if isinstance(value, list):
        return "[" + ", ".join(_toml_value(item) for item in value) + "]"
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
