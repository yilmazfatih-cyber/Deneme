"""Kuru çalıştırma (`egit --kuru`): plan + bellek ve süre KESTİRİMİ; model indirilmez, eğitim başlamaz.

Kim kullanır: `train.py`.

Nasıl kestirilir (ayrıntı ve ölçümle karşılaştırma: docs/KARARLAR.md K10, docs/DENEME_KAYDI.md):
- Model ağırlıksız ("meta" aygıtında) kurulur: kesin parametre sayısı, ileri geçiş FLOP'u
  (`torch.utils.flop_counter`) ve katman çıktılarının toplam boyutu (etkinleştirme belleği) bulunur.
- Bellek = ağırlıklar (4 B/parametre) + eğitilenlerin gradyan ve AdamW durumu (12 B/parametre)
  + etkinleştirmeler (tam kipte çıktı toplamı × yığın; baş kipinde bunun ~%20'si) + sabit pay.
  CPU'da 3 modelle ölçülen tepe bellekle %60–105 arası tuttu; aralık −%40 / +%50 verilir.
- Süre: bu makinede, rastgele ağırlıklı aynı modelle küçük bir yığında 2 adım ÖLÇÜLÜR ve örnek başına
  süreden uzatılır. Hazır ayar başka bir donanımı hedefliyorsa (`hedef_tflops`), FLOP ÷ etkin hız
  kaba kestirimi de yazılır. Veri okuma (JPEG çözme) süresi dahil DEĞİLDİR.

Genişletme: plana yeni satır için `render_plan` içindeki `rows` listesine `(başlık, değer)` ekleyin
(başlıklar `messages.py` → `plan.satir.*`).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

from goruntu.hardware import Amp, Device
from goruntu.messages import t
from goruntu.siniflandirma.config import ClassifierConfig
from goruntu.siniflandirma.prepare import PreparedData

GB = 1024**3
HEAD_ACTIVATION_SHARE = 0.2
OVERHEAD_GB = {"cpu": 0.75, "cuda": 0.6, "mps": 0.75}


@dataclass(frozen=True)
class ModelProfile:
    parameters: int
    trainable: int
    forward_flops: float  # tek görüntü, ileri geçiş
    activation_bytes: float  # tek görüntü, katman çıktıları toplamı (fp32)
    height: int
    width: int


def profile_model(config: ClassifierConfig, classes: int) -> ModelProfile:
    """Modeli meta aygıtında kurar: parametre, FLOP ve etkinleştirme boyutu (ağırlık indirilmez)."""
    import timm
    import torch
    from timm.data import resolve_model_data_config
    from torch.utils.flop_counter import FlopCounterMode

    from goruntu.hazirlik.model_input import spec_from_timm
    from goruntu.siniflandirma.model import creation_kwargs, timm_name

    name = timm_name(config.model.taban)
    with torch.device("meta"):
        model = timm.create_model(
            name,
            pretrained=False,
            num_classes=classes,
            **creation_kwargs(name, config.model.girdi_boyutu),
        )
    spec = spec_from_timm(resolve_model_data_config(model), config.model.girdi_boyutu)
    total = sum(p.numel() for p in model.parameters())
    head = sum(p.numel() for p in model.get_classifier().parameters())
    outputs: list[int] = []

    def hook(_module: Any, _inputs: Any, output: Any) -> None:
        outputs.append(output.numel() if isinstance(output, torch.Tensor) else 0)

    leaves = [m for m in model.modules() if not list(m.children())]
    handles = [leaf.register_forward_hook(hook) for leaf in leaves]
    counter = FlopCounterMode(display=False)
    with counter, torch.no_grad():
        model(torch.empty(1, 3, spec.yukseklik, spec.genislik, device="meta"))
    for handle in handles:
        handle.remove()
    trainable = head if config.model.kip == "bas" else total
    return ModelProfile(
        total,
        trainable,
        float(counter.get_total_flops()),
        sum(outputs) * 4.0,
        spec.yukseklik,
        spec.genislik,
    )


def memory_gb(profile: ModelProfile, config: ClassifierConfig, amp: Amp) -> float:
    batch = config.egitim.yigin
    share = HEAD_ACTIVATION_SHARE if config.model.kip == "bas" else 1.0
    activations = profile.activation_bytes * batch * share * (0.5 if amp.dtype else 1.0)
    weights = profile.parameters * 4 + profile.trainable * 12
    inputs = batch * profile.height * profile.width * 3
    return (weights + activations + inputs) / GB


def measure_seconds_per_image(config: ClassifierConfig, classes: int, device: Device) -> float:
    """Rastgele ağırlıklı modelle küçük yığında 2 adım; ikincinin süresi / yığın (ısınma hariç)."""
    import timm
    import torch

    from goruntu.siniflandirma.model import creation_kwargs, timm_name

    batch = max(2, min(config.egitim.yigin, 8))
    name = timm_name(config.model.taban)
    extra = creation_kwargs(name, config.model.girdi_boyutu)
    model = timm.create_model(name, pretrained=False, num_classes=classes, **extra)
    model = model.to(device.kind).train()
    if config.model.kip == "bas":
        for parameter in model.parameters():
            parameter.requires_grad = False
        for parameter in model.get_classifier().parameters():
            parameter.requires_grad = True
    size = config.model.girdi_boyutu or model.pretrained_cfg.get("input_size", (3, 224, 224))[-1]
    images = torch.randn(batch, 3, size, size, device=device.kind)
    targets = torch.zeros(batch, dtype=torch.long, device=device.kind)
    elapsed = 0.0
    for _ in range(2):
        started = time.perf_counter()
        torch.nn.functional.cross_entropy(model(images), targets).backward()
        elapsed = time.perf_counter() - started
    return elapsed / batch


def _verdict(estimate: float, limit: float | None) -> str:
    low, high = estimate * 0.6, estimate * 1.5
    span = t("plan.aralik", dusuk=f"{low:.1f}", yuksek=f"{high:.1f}")
    if limit is None:
        return span
    if high <= limit:
        return span + " " + t("plan.sigar", gb=f"{limit:.0f}")
    if low <= limit:
        return span + " " + t("plan.sinirda", gb=f"{limit:.0f}")
    return span + " " + t("plan.sigmaz", gb=f"{limit:.0f}")


def _available_gb() -> float | None:
    try:
        for line in open("/proc/meminfo", encoding="ascii"):  # noqa: SIM115 - kısa okuma
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1024**2
    except OSError:
        return None
    return None


def _duration(seconds: float) -> str:
    if seconds < 90:
        return t("plan.saniye", sn=f"{seconds:.0f}")
    minutes = seconds / 60
    if minutes < 120:
        return t("plan.dakika", dk=f"{minutes:.1f}")
    return t("plan.saat", saat=f"{minutes / 60:.1f}")


def render_plan(
    config: ClassifierConfig,
    data: PreparedData,
    device: Device,
    amp: Amp,
    threads: int,
    notes: list[str],
) -> str:
    """Planı hizalı satırlar ve uyarı listesi olarak biçimlendirir."""
    train = config.egitim
    steps = train.donem * math.ceil(max(len(data.train), 1) / train.yigin)
    rows: list[tuple[str, str]] = [
        (t("plan.satir.taban"), config.model.taban),
        (
            t("plan.satir.kip"),
            t("plan.kip.bas") if config.model.kip == "bas" else t("plan.kip.tam"),
        ),
        (t("plan.satir.aygit"), f"{device.name} · {amp.label} · {threads}"),
        (
            t("plan.satir.adim"),
            t("plan.adim_ayrinti", adim=steps, yigin=train.yigin, oran=train.ogrenme_orani),
        ),
        (t("plan.satir.dengesizlik"), train.dengesizlik),
        (t("plan.satir.cikti"), train.cikti),
    ]
    try:
        profile = profile_model(config, len(data.labels))
    except (
        Exception
    ) as exc:  # meta aygıtında kurulamayan model: kestirim atlanır, plan yine yazılır
        notes = [*notes, t("plan.profil_yok", ayrinti=str(exc).splitlines()[0][:200])]
        return _render(rows, notes)
    target_gb = train.hedef_bellek_gb or (
        device.memory_gb if device.kind == "cuda" else _available_gb()
    )
    estimate = memory_gb(profile, config, amp) + OVERHEAD_GB.get(device.kind, 0.75)
    rows += [
        (
            t("plan.satir.parametre"),
            f"{profile.parameters:,} / {profile.trainable:,}".replace(",", "."),
        ),
        (t("plan.satir.girdi"), f"{profile.height}×{profile.width}"),
        (t("plan.satir.flop"), f"{profile.forward_flops / 1e9:.2f} GFLOP"),
        (t("plan.satir.bellek"), _verdict(estimate, target_gb)),
    ]
    images = train.donem * len(data.train)
    try:
        per_image = measure_seconds_per_image(config, len(data.labels), device)
        rows.append((t("plan.satir.sure_olcum"), _duration(per_image * images)))
    except Exception as exc:  # ölçüm yapılamadı (bellek yetmez…): plan yine yazılır
        notes = [*notes, t("plan.olcum_yok", ayrinti=str(exc).splitlines()[0][:200])]
    if train.hedef_tflops > 0:
        factor = 1 if config.model.kip == "bas" else 3
        seconds = profile.forward_flops * factor * images / (train.hedef_tflops * 1e12)
        rows.append((t("plan.satir.sure_hedef"), _duration(seconds)))
    return _render(rows, [*notes, t("plan.veri_okuma_haric")])


def _render(rows: list[tuple[str, str]], notes: list[str]) -> str:
    width = max(len(label) for label, _ in rows)
    lines = ["", t("plan.baslik"), "=" * len(t("plan.baslik"))]
    lines += [f"{label.ljust(width)} : {value}" for label, value in rows]
    if notes:
        lines += ["", t("plan.uyarilar"), *(f"  - {note}" for note in notes)]
    lines += ["", t("plan.kuru_bitti")]
    return "\n".join(lines)
