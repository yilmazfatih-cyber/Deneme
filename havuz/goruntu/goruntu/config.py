"""Yapılandırma: TOML dosyasını okur, komut satırı değişikliklerini (-D) uygular, şemayla doğrular.

Kim kullanır: `egit`, `degerlendir` komutları (`siniflandirma/config.py` şemasıyla).
Kaynak: `havuz/ince-ayar/ince_ayar/config.py` (kopyalanıp uyarlandı).

Kurallar:
- Alan adları TOML dosyasındaki Türkçe (ASCII) anahtarlarla **aynıdır**; tek sözlük, çeviri yok.
- Tanınmayan anahtar hatadır (`extra="forbid"`): yazım hatası sessizce yok sayılmaz.
- Yollar komutun çalıştığı klasöre (temel klasörü) göredir.
- Hazır ayarlar `yapilandirma/siniflandirma/<ad>.toml` dosyalarıdır; `-D bolum.anahtar=deger` ile
  tek tek değer değiştirilir (değer TOML olarak okunur: `-D egitim.donem=3`, `-D model.kip="tam"`).

Genişletme: yeni hazır ayar için `PRESETS`'e adı ekleyip aynı adlı TOML dosyasını yazın; kural testi
(`tests/test_rules.py`) dosyanın şemadan geçtiğini denetler.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel, ConfigDict, ValidationError

from goruntu.errors import UserError, explain_validation_error
from goruntu.messages import t

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PRESET_DIR = PROJECT_ROOT / "yapilandirma" / "siniflandirma"
PRESETS = ("cpu-deneme", "cpu-kucuk", "colab-t4")
TINY_MODEL = "minik-rastgele"

C = TypeVar("C", bound=BaseModel)


class Section(BaseModel):
    """Bütün yapılandırma bölümlerinin atası: tanınmayan anahtar hatadır."""

    model_config = ConfigDict(extra="forbid")


def preset_path(preset: str) -> Path:
    """Hazır ayar dosyasının yolu; yoksa hangi adların geçerli olduğunu söyler."""
    path = PRESET_DIR / f"{preset}.toml"
    if not path.is_file():
        raise UserError(t("ayar.hazir_yok", hazir=preset, secenekler=", ".join(PRESETS)))
    return path


def resolve_config_path(config: str | None, preset: str | None) -> Path:
    """`--ayar` ya da `--hazir` seçeneklerinden tam biri verilmelidir."""
    if config and preset:
        raise UserError(t("ayar.ikisi_birden"))
    if config:
        return Path(config)
    if preset:
        return preset_path(preset)
    raise UserError(t("ayar.eksik", secenekler=", ".join(PRESETS)))


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
    if not path.is_file():
        raise UserError(t("dosya.yok", yol=path))
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8-sig"))
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
    if isinstance(value, list | tuple):
        return "[" + ", ".join(_toml_value(item) for item in value) + "]"
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
