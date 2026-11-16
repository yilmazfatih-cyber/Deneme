"""Eğitim belleği **tahmini**: kuru çalıştırmada "bu ayar bu karta sığar mı" sorusuna kaba yanıt.

Kim kullanır: her görevin `egit --kuru` eylemi (`plan.py` üzerinden).

Tahmin dört kalemin toplamıdır (ayrıntı ve varsayımlar: `docs/HIPERPARAMETRE.md` § Bellek):
1. Ağırlıklar      : parametre × bayt (fp32: 4, fp16/bf16: 2, 4-bit: doğrusal katmanlar ≈ 0,55;
                     gömme tablosu 4-bit'e çevrilmez, 2 bayt kalır).
2. Eğitilenler     : eğitilen parametre × 16 bayt (ağırlık 4 + gradyan 4 + AdamW'nin iki momenti 8).
3. Etkinleştirmeler: yığın × uzunluk × gizli boyut × bayt × çarpan. Çarpan, bir katmanın geri yayılım
                     için sakladığı tensör sayısıdır (K = 8 + 3·d_ara/d). Gradyan denetimi açıksa
                     aynı anda yalnız bir katmanın içi + her katman için bir ara kayıt tutulur.
4. Sabit pay       : CUDA bağlamı ve kütüphaneler (GPU'da ~1 GB, CPU'da ~0,5 GB).

Sonuç ±%30 aralıkla verilir. **Bu bir ölçüm değildir**: formül CPU'da küçük bir modelle karşılaş-
tırılmış (bkz. `docs/DENEME_KAYDI.md`), GPU'da doğrulanmamıştır.

Genişletme: yeni bir mimari ailesi için `read_shape` içindeki alan adı eşlemelerine ekleme yapın.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

GB = 1024**3
LOW_FACTOR, HIGH_FACTOR = 0.75, 1.3
FOUR_BIT_BYTES = 0.55
TRAINABLE_BYTES = 16  # ağırlık + gradyan + AdamW momentleri (fp32)
ATTENTION_MODULES = ("q_proj", "k_proj", "v_proj", "o_proj", "query", "key", "value")
SOURCE_FILE, SOURCE_API, SOURCE_FORMULA = "ağırlık dosyası", "Hugging Face API", "kestirim"


@dataclass(frozen=True)
class ModelShape:
    parameters: int
    hidden: int
    layers: int
    intermediate: int
    vocab: int
    source: str  # parametre sayısının nereden geldiği


@dataclass(frozen=True)
class MemoryEstimate:
    weights_gb: float
    trainable_gb: float
    activations_gb: float
    overhead_gb: float
    trainable_parameters: int
    assumptions: list[str] = field(default_factory=list)

    @property
    def total_gb(self) -> float:
        return self.weights_gb + self.trainable_gb + self.activations_gb + self.overhead_gb

    @property
    def low_gb(self) -> float:
        return self.total_gb * LOW_FACTOR

    @property
    def high_gb(self) -> float:
        return self.total_gb * HIGH_FACTOR


def _first(config: Any, names: tuple[str, ...], default: int) -> int:
    for name in names:
        value = getattr(config, name, None)
        if isinstance(value, int) and value > 0:
            return value
    return default


def formula_parameters(hidden: int, layers: int, intermediate: int, vocab: int) -> int:
    """Standart dönüştürücü için kaba parametre sayısı (gömme + katman başına dikkat ve MLP)."""
    per_layer = 4 * hidden * hidden + 3 * hidden * intermediate
    return vocab * hidden + layers * per_layer


def count_safetensors_parameters(directory: Path) -> int | None:
    """Yerel klasördeki .safetensors başlıklarından parametre sayısını okur (ağırlık yüklemeden)."""
    files = sorted(directory.glob("*.safetensors"))
    if not files:
        return None
    from safetensors import safe_open

    total = 0
    for file in files:
        with safe_open(str(file), framework="np") as handle:
            for key in handle.keys():  # noqa: SIM118 - safetensors nesnesi sözlük değildir
                size = 1
                for dimension in handle.get_slice(key).get_shape():
                    size *= dimension
                total += size
    return total


def _hub_parameters(base: str) -> int | None:
    try:
        from huggingface_hub import HfApi

        info = HfApi().model_info(base, timeout=10)
        total = getattr(getattr(info, "safetensors", None), "total", None)
        return int(total) if total else None
    except Exception:  # ağ yok, depo yok, kapalı depo: tahmin formülüne düşülür
        return None


def read_shape(base: str) -> ModelShape:
    """Modelin boyutlarını yapılandırmasından, parametre sayısını en güvenilir kaynaktan okur."""
    from transformers import AutoConfig

    config = AutoConfig.from_pretrained(base)
    config = getattr(config, "text_config", None) or config
    hidden = _first(config, ("hidden_size", "d_model", "n_embd", "dim"), 768)
    layers = _first(config, ("num_hidden_layers", "n_layer", "num_layers", "n_layers"), 12)
    intermediate = _first(config, ("intermediate_size", "n_inner", "hidden_dim", "d_ff"), 4 * hidden)
    vocab = _first(config, ("vocab_size",), 32000)
    parameters: int | None = None
    source = SOURCE_FORMULA
    if Path(base).is_dir():
        parameters, source = count_safetensors_parameters(Path(base)), SOURCE_FILE
    else:
        parameters, source = _hub_parameters(base), SOURCE_API
    if parameters is None:
        parameters, source = formula_parameters(hidden, layers, intermediate, vocab), SOURCE_FORMULA
    return ModelShape(parameters, hidden, layers, intermediate, vocab, source)


def lora_parameters(shape: ModelShape, rank: int, targets: str | list[str]) -> int:
    """LoRA'nın ekleyeceği parametre sayısı için kestirim (her hedef katman: r × (giriş + çıkış))."""
    attention = 2 * rank * shape.hidden
    mlp = rank * (shape.hidden + shape.intermediate)
    if isinstance(targets, str):  # "all-linear": 4 dikkat izdüşümü + 3 MLP katmanı
        return shape.layers * (4 * attention + 3 * mlp)
    per_layer = sum(attention if name in ATTENTION_MODULES else mlp for name in targets)
    return shape.layers * per_layer


def _activation_bytes(
    shape: ModelShape, batch: int, length: int, element_bytes: int, checkpointing: bool, extra: float
) -> float:
    multiplier = 8 + 3 * shape.intermediate / shape.hidden + extra
    per_tensor = batch * length * shape.hidden * element_bytes
    if checkpointing:
        return (shape.layers + multiplier) * per_tensor
    return shape.layers * multiplier * per_tensor


def estimate_lora(
    shape: ModelShape,
    rank: int,
    targets: str | list[str],
    batch: int,
    length: int,
    mixed_precision: bool,
    weight_bytes: float,
    four_bit: bool,
    checkpointing: bool,
    on_gpu: bool,
) -> MemoryEstimate:
    """LoRA eğitimi için bellek tahmini."""
    trainable = lora_parameters(shape, rank, targets)
    if four_bit:
        embedding = shape.vocab * shape.hidden
        weights = embedding * 2 + max(shape.parameters - embedding, 0) * FOUR_BIT_BYTES
    else:
        weights = shape.parameters * weight_bytes
    lora_extra = 6 + shape.intermediate / shape.hidden  # bağdaştırıcı giriş kopyaları
    activations = _activation_bytes(
        shape, batch, length, 2 if mixed_precision else 4, checkpointing, lora_extra
    )
    return MemoryEstimate(
        weights_gb=weights / GB,
        trainable_gb=trainable * TRAINABLE_BYTES / GB,
        activations_gb=activations / GB,
        overhead_gb=1.0 if on_gpu else 0.5,
        trainable_parameters=trainable,
        assumptions=[f"parametre sayısı kaynağı: {shape.source}", "LoRA parametresi: kestirim"],
    )


def estimate_full(
    shape: ModelShape, batch: int, length: int, mixed_precision: bool, on_gpu: bool
) -> MemoryEstimate:
    """Tam ince ayar (bütün ağırlıklar eğitilir; kodlayıcı görevleri) için bellek tahmini."""
    activations = _activation_bytes(shape, batch, length, 2 if mixed_precision else 4, False, 0.0)
    return MemoryEstimate(
        weights_gb=0.0,  # ağırlıklar "eğitilenler" kalemindedir (16 bayt/parametre)
        trainable_gb=shape.parameters * TRAINABLE_BYTES / GB,
        activations_gb=activations / GB,
        overhead_gb=1.0 if on_gpu else 0.5,
        trainable_parameters=shape.parameters,
        assumptions=[f"parametre sayısı kaynağı: {shape.source}"],
    )
