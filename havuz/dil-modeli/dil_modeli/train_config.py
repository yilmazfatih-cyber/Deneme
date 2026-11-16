"""Eğitim yapılandırması: dataclass + TOML dosyası + komut satırından üzerine yazma.

Öncelik sırası: varsayılanlar < TOML dosyası (`--yapilandirma`) < `--ayar anahtar=değer`.
Model alanları `model.` önekiyle verilir: `--ayar model.dim=192`. Hazır dosyalar: `yapilandirma/`.
`train.py` ve `cli_train.py` kullanır.

Genişletme: Yeni bir eğitim ayarı için buraya varsayılanıyla bir alan ekleyin, gerekirse
`__post_init__` içinde denetleyin ve `yapilandirma/*.toml` dosyalarına açıklamasıyla yazın.
"""

from __future__ import annotations

import dataclasses
import difflib
import tomllib
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import ModelConfig, preset_config
from .device import PRECISIONS


@dataclass(frozen=True)
class TrainConfig:
    # --- veri ve çıktı ---
    data_dir: str = "veri/hazir"  # `veri-hazirla` çıktısı
    out_dir: str = "calisma/deneme"  # denetim noktaları ve günlük buraya yazılır
    # --- model ---
    preset: str = "bebek"  # hazır boyut: bebek | mini | kucuk | orta
    model: dict[str, Any] = field(default_factory=dict)  # hazır boyutun üzerine yazılacak alanlar
    # --- eniyileme ---
    max_steps: int = 2000  # toplam eniyileyici adımı
    batch_size: int = 16  # bir adımda işlenen dizi sayısı
    seq_len: int = 0  # eğitim penceresi (belirteç); 0: modelin bağlam uzunluğu
    grad_accum: int = 1  # gradyan biriktirme: etkin yığın = batch_size x grad_accum
    learning_rate: float = 1e-3
    min_lr_ratio: float = 0.1  # kosinüsün indiği en düşük oran (learning_rate'in katı)
    warmup_steps: int = 100
    weight_decay: float = 0.1
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0  # gradyan normu sınırı (0: kapalı)
    seed: int = 0
    # --- aygıt ---
    device: str = "auto"  # auto | cuda | mps | cpu
    precision: str = "auto"  # auto | fp32 | bf16 | fp16 (karışık duyarlık yalnız CUDA'da)
    compile: bool = False  # torch.compile (GPU'da hızlandırır; ilk adımlar derleme için yavaştır)
    threads: int = 0  # CPU iş parçacığı sayısı (0: PyTorch varsayılanı)
    # --- izleme ---
    log_every: int = 10  # kaç adımda bir kayıp yazılsın
    eval_every: int = 200  # kaç adımda bir doğrulama + denetim noktası
    eval_batches: int = 20  # doğrulamada en çok kaç yığın
    sample_tokens: int = 60  # her doğrulamada üretilecek örnek uzunluğu (0: örnek üretme)
    sample_prompt: str = ""  # örnek üretimin istemi (boş: belge başından)
    max_minutes: float = 0.0  # süre sınırı (0: yok); dolunca kaydedip durur, sonra sürdürülebilir

    def __post_init__(self) -> None:
        positive = (
            "max_steps",
            "batch_size",
            "grad_accum",
            "log_every",
            "eval_every",
            "eval_batches",
        )
        for name in positive:
            if getattr(self, name) < 1:
                raise ValueError(
                    f"Eğitim ayarı '{name}' en az 1 olmalı; verilen: {getattr(self, name)}."
                )
        for name in (
            "seq_len",
            "warmup_steps",
            "threads",
            "sample_tokens",
            "max_minutes",
            "grad_clip",
        ):
            if getattr(self, name) < 0:
                raise ValueError(f"Eğitim ayarı '{name}' negatif olamaz.")
        if self.learning_rate <= 0:
            raise ValueError("'learning_rate' pozitif olmalı (örnek: 1e-3).")
        if not 0.0 <= self.min_lr_ratio <= 1.0:
            raise ValueError("'min_lr_ratio' 0 ile 1 arasında olmalı.")
        if self.precision not in PRECISIONS:
            raise ValueError(f"'precision' şunlardan biri olmalı: {', '.join(PRECISIONS)}.")

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TrainConfig:
        """Sözlükten kurar: bilinmeyen anahtar ve yanlış tür açık bir hatayla reddedilir."""
        defaults = {f.name: f for f in dataclasses.fields(cls)}
        values: dict[str, Any] = {}
        for key, value in data.items():
            if key not in defaults:
                close = difflib.get_close_matches(key, defaults, n=1)
                hint = f" Bunu mu demek istediniz: '{close[0]}'?" if close else ""
                raise ValueError(f"Bilinmeyen eğitim ayarı: '{key}'.{hint}")
            values[key] = _coerce(key, value, defaults[key].type)
        return cls(**values)

    def model_config(self, vocab_size: int) -> ModelConfig:
        """Hazır boyut + `model` tablosundaki değişikliklerle model yapılandırması."""
        return preset_config(self.preset, vocab_size, **self.model)

    def window(self, model_config: ModelConfig) -> int:
        """Eğitim penceresinin uzunluğu (belirteç)."""
        if self.seq_len > model_config.max_seq_len:
            raise ValueError(
                f"'seq_len' ({self.seq_len}) modelin bağlamından "
                f"({model_config.max_seq_len}) büyük "
                "olamaz. model.max_seq_len değerini büyütün ya da seq_len'i küçültün."
            )
        return self.seq_len or model_config.max_seq_len


def _coerce(key: str, value: Any, annotation: Any) -> Any:
    """Değeri alanın türüne uydurur (tamsayı -> ondalık serbest; gerisi tam eşleşmeli)."""
    kind = str(annotation)
    ok = {
        "int": isinstance(value, int) and not isinstance(value, bool),
        "float": isinstance(value, int | float) and not isinstance(value, bool),
        "bool": isinstance(value, bool),
        "str": isinstance(value, str),
    }.get(kind, isinstance(value, dict))
    if not ok:
        names = {"int": "tamsayı", "float": "sayı", "bool": "true/false", "str": "metin"}
        raise ValueError(
            f"Eğitim ayarı '{key}' {names.get(kind, 'tablo')} olmalı; verilen: {value!r}."
        )
    return float(value) if kind == "float" else value


def parse_override(item: str) -> tuple[str, Any]:
    """`anahtar=değer` yazısını ayrıştırır; değer TOML kuralıyla okunur, olmazsa metin sayılır."""
    key, separator, raw = item.partition("=")
    if not separator or not key.strip():
        raise ValueError(f"--ayar '{item}' biçimi yanlış. Örnek: --ayar max_steps=500")
    try:
        value = tomllib.loads(f"v = {raw}")["v"]
    except tomllib.TOMLDecodeError:
        value = raw.strip()
    return key.strip(), value


def load_train_config(path: str | Path | None = None, overrides: Sequence[str] = ()) -> TrainConfig:
    """TOML dosyasını (varsa) okur, `--ayar` değerlerini üzerine yazar."""
    data: dict[str, Any] = {}
    if path is not None:
        file = Path(path)
        if not file.is_file():
            raise FileNotFoundError(f"Yapılandırma dosyası bulunamadı: {file}")
        try:
            data = tomllib.loads(file.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as error:
            raise ValueError(f"{file} geçerli bir TOML dosyası değil: {error}") from None
    for item in overrides:
        key, value = parse_override(item)
        if key.startswith("model."):
            table = data.setdefault("model", {})
            if not isinstance(table, dict):
                raise ValueError("'model' bir tablo olmalı ([model] başlığı altında).")
            table[key.removeprefix("model.")] = value
        else:
            data[key] = value
    return TrainConfig.from_dict(data)
