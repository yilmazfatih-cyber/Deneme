"""Eğitim testleri (minik rastgele model, ağsız): çıktı dosyaları, dondurulmuş gövdede BatchNorm ve
ağırlıkların gerçekten donması, erken durdurma, dengesizlik seçenekleri, kuru çalıştırma, ayar denetimi."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import torch

from goruntu.errors import UserError
from goruntu.io_utils import read_json
from goruntu.siniflandirma.model import (
    build_backbone,
    head_parameters,
    load_checkpoint,
    make_classifier,
    set_backbone_frozen,
    set_train_mode,
)
from goruntu.siniflandirma.train import run_training
from tests.conftest import tiny_config


def test_egitim_ciktilari(trained_model: Path) -> None:
    for name in (
        "degerlendirme.json",
        "rapor.txt",
        "gunluk.jsonl",
        "ayrim.json",
        "ozet.json",
        "yapilandirma.toml",
        "model/model.json",
        "model/agirliklar.safetensors",
    ):
        assert (trained_model / name).is_file(), name
    meta = read_json(trained_model / "model" / "model.json")
    assert meta["etiketler"] == ["daire", "kare", "üçgen"] and meta["mimari"] == "test_resnet"
    assert meta["on_isleme"]["yukseklik"] == 32 and meta["sicaklik"] > 0
    log = [json.loads(line) for line in (trained_model / "gunluk.jsonl").read_text().splitlines()]
    assert [row["donem"] for row in log] == [1, 2] and "makro_f1" in log[0]
    result = read_json(trained_model / "degerlendirme.json")
    assert result["kume"] == "test" and len(result["karisiklik_matrisi"]) == 3
    split = read_json(trained_model / "ayrim.json")
    test_files = {row["dosya"] for row in split["parcalar"]["test"]}
    train_files = {row["dosya"] for row in split["parcalar"]["egitim"]}
    assert test_files and not test_files & train_files


def test_kopyalar_parcalar_arasinda_bolunmez(trained_model: Path) -> None:
    split = read_json(trained_model / "ayrim.json")
    side = {row["dosya"]: name for name, rows in split["parcalar"].items() for row in rows}
    copies = [path for path in side if path.endswith("_kopya.jpg")]
    assert copies
    for copy in copies:
        assert side[copy] == side[copy.replace("_kopya", "")]


def test_kayit_yeniden_yuklenir_ve_ayni_sonucu_verir(trained_model: Path) -> None:
    model, _ = load_checkpoint(trained_model)
    again, _ = load_checkpoint(trained_model / "model")
    batch = torch.randint(0, 256, (2, 32, 32, 3), dtype=torch.uint8)
    with torch.inference_mode():
        assert torch.equal(model(batch), again(batch))
    assert not model.training


def test_donuk_govdede_yalniz_bas_degisir_batchnorm_kaymaz() -> None:
    from goruntu.siniflandirma.loop import build_optimizer

    backbone, spec, _ = build_backbone("minik-rastgele", 3, False, size=32)
    model = make_classifier(backbone, spec)
    set_backbone_frozen(model, True)
    set_train_mode(model, True)
    before = {k: v.clone() for k, v in model.state_dict().items()}
    head = {id(p) for p in head_parameters(model)}
    optimizer = build_optimizer(model, 0.1, 1.0, 0.0)
    for _ in range(3):
        loss = model(torch.randint(0, 256, (4, 32, 32, 3), dtype=torch.uint8)).sum()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    after = model.state_dict()
    changed = {k for k in before if not torch.equal(before[k], after[k])}
    head_names = {n for n, p in model.named_parameters() if id(p) in head}
    assert changed == head_names  # running_mean/var dahil gövdede hiçbir şey değişmedi


def test_veri_kumesi_isci_sureclerine_tasinabilir(shape_dataset: Path) -> None:
    """macOS/Windows'ta (spawn) veri işçileri veri kümesini pickle ile taşır."""
    import pickle

    from goruntu.hazirlik.loader import DEFAULT_LIMITS
    from goruntu.hazirlik.model_input import InputSpec
    from goruntu.siniflandirma.config import AugmentSection
    from goruntu.siniflandirma.data import build_augmentation, make_dataset
    from goruntu.siniflandirma.dataset import discover

    spec = InputSpec(yukseklik=32, genislik=32)
    samples = discover(shape_dataset).samples[:4]
    dataset = make_dataset(
        samples,
        ["daire", "kare", "üçgen"],
        spec,
        DEFAULT_LIMITS,
        build_augmentation(spec, AugmentSection()),
    )
    copy = pickle.loads(pickle.dumps(dataset))
    image, label = copy[0]
    assert tuple(image.shape) == (32, 32, 3) and image.dtype == torch.uint8 and label in (0, 1, 2)


def test_erken_durdurma(shape_dataset: Path, tmp_path: Path) -> None:
    config = tiny_config(
        shape_dataset,
        tmp_path / "erken",
        "egitim.donem=6",
        "egitim.erken_durdurma=1",
        'egitim.izlenen="kayip"',
        "egitim.ogrenme_orani=1e-12",
    )
    summary = run_training(config)
    assert summary["son_donem"] < 6 and summary["en_iyi_donem"] < summary["son_donem"]


@pytest.mark.parametrize("method", ["dengeli-ornekleme", "yok"])
def test_dengesizlik_secenekleri(shape_dataset: Path, tmp_path: Path, method: str) -> None:
    config = tiny_config(
        shape_dataset,
        tmp_path / method,
        "egitim.donem=1",
        f'egitim.dengesizlik="{method}"',
        "esik.hedef_dogruluk=0.9",
    )
    summary = run_training(config)
    assert summary["degerlendirme_kumesi"] == "test"


def test_kuru_calistirma_egitmez(shape_dataset: Path, tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    out = tmp_path / "kuru"
    assert run_training(tiny_config(shape_dataset, out), dry_run=True) == {"kuru": True}
    printed = capsys.readouterr().out
    assert "Eğitim planı" in printed and "tahmini bellek" in printed and "GFLOP" in printed
    assert not (out / "model").exists()


def test_rastgele_govdeyle_bas_kipi_reddedilir(shape_dataset: Path, tmp_path: Path) -> None:
    with pytest.raises(UserError, match="model.kip"):
        tiny_config(shape_dataset, tmp_path, 'model.kip="bas"')


def test_bilinmeyen_model_acik_hata() -> None:
    with pytest.raises(UserError, match="bulunamadı"):
        build_backbone("timm/boyle_bir_model_yok.x", 2, False)


def test_profil_gercek_parametre_sayisini_verir(shape_dataset: Path, tmp_path: Path) -> None:
    from goruntu.siniflandirma.plan import memory_gb, profile_model

    config = tiny_config(shape_dataset, tmp_path)
    profile = profile_model(config, 3)
    backbone, _, _ = build_backbone("minik-rastgele", 3, False, size=32)
    assert profile.parameters == sum(p.numel() for p in backbone.parameters())
    assert profile.forward_flops > 0 and profile.height == 32
    from goruntu.hardware import Amp

    assert 0 < memory_gb(profile, config, Amp(None)) < 1
