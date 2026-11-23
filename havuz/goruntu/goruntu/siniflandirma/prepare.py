"""Veri hazırlığı: klasörü keşfet → her görüntüyü güvenle aç ve özetle → sızıntısız ayır → kaydet.

Kim kullanır: `train.py` (eğitim ve `--kuru`), `plan.py`.

Çıktı `PreparedData`: eğitim/doğrulama/test örnek listeleri, sınıflar, açılamayan dosyalar ve
`ayrim.json` içeriği (hangi dosya hangi parçada, kopya grupları, etiket çelişkileri, sızıntılar).
`ayrim.json` sonradan "bu test görüntüsü eğitimde var mıydı?" sorusunu yanıtlamak içindir.

Genişletme: ayrıma yeni bir denetim eklerken sonucunu `report` sözlüğüne yazın; `notes`'a kullanıcının
anlayacağı bir cümle ekleyin (iletiler `messages.py`'de).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from goruntu import console
from goruntu.errors import UserError
from goruntu.hazirlik.loader import LoadLimits
from goruntu.kopya.scan import ScanResult, scan_files
from goruntu.messages import t
from goruntu.siniflandirma.config import ClassifierConfig
from goruntu.siniflandirma.dataset import Discovery, Sample, discover
from goruntu.siniflandirma.split import TEST, TRAIN, VALIDATION, leaks_between, plan_split


@dataclass
class PreparedData:
    labels: list[str]
    splits: dict[str, list[Sample]]
    rejected: list[tuple[Path, str, str]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    report: dict[str, Any] = field(default_factory=dict)

    @property
    def train(self) -> list[Sample]:
        return self.splits.get(TRAIN, [])

    @property
    def validation(self) -> list[Sample]:
        return self.splits.get(VALIDATION, [])

    @property
    def test(self) -> list[Sample]:
        return self.splits.get(TEST, [])

    def counts(self) -> dict[str, dict[str, int]]:
        return {
            name: dict(sorted(Counter(s.label for s in rows).items()))
            for name, rows in self.splits.items()
        }


def _scan(samples: list[Sample], config: ClassifierConfig) -> tuple[list[Sample], ScanResult]:
    limits = LoadLimits(config.veri.azami_piksel, config.veri.azami_bayt)
    scan = scan_files([s.path for s in samples], config.veri.kopya_yontemi, limits)
    ok = {image.path for image in scan.images}
    return [s for s in samples if s.path in ok], scan


def _split(
    samples: list[Sample],
    scan: ScanResult,
    labels: list[str],
    config: ClassifierConfig,
    test: float,
) -> tuple[dict[str, list[Sample]], dict[str, Any], list[str]]:
    index = [labels.index(s.label) for s in samples]
    plan = plan_split(
        index,
        scan.matrix(),
        [s.group for s in samples],
        config.veri.dogrulama_orani,
        test,
        config.veri.kopya_esigi,
        config.veri.tohum,
    )
    splits = {name: [samples[i] for i in rows] for name, rows in plan.indices.items()}
    notes = [t("ayrim.sinif_egitime", sinif=labels[label]) for label in plan.moved_labels]
    if plan.conflicts:
        notes.append(t("ayrim.celiski", sayi=len(plan.conflicts)))
    report = {
        "kopya_cifti": plan.duplicate_pairs,
        "en_buyuk_grup": plan.largest_group,
        "celiskiler": [
            [str(samples[a].path), str(samples[b].path)] for a, b in plan.conflicts[:200]
        ],
    }
    return splits, report, notes


def _predefined(discovery: Discovery, config: ClassifierConfig) -> PreparedData:
    assert discovery.predefined is not None
    splits: dict[str, list[Sample]] = {}
    scans: dict[str, ScanResult] = {}
    rejected: list[tuple[Path, str, str]] = []
    for name, rows in discovery.predefined.items():
        splits[name], scans[name] = _scan(rows, config)
        rejected += scans[name].rejected
    notes: list[str] = []
    report: dict[str, Any] = {"hazir_ayrim": True, "sizintilar": {}}
    if VALIDATION not in splits:
        sub, sub_report, sub_notes = _split(
            splits[TRAIN], scans[TRAIN], discovery.labels, config, 0.0
        )
        splits[TRAIN], splits[VALIDATION] = sub[TRAIN], sub.get(VALIDATION, [])
        report.update(sub_report)
        notes += sub_notes
    for other in (VALIDATION, TEST):
        if other in scans:
            leaks = leaks_between(
                scans[TRAIN].matrix(), scans[other].matrix(), config.veri.kopya_esigi
            )
            report["sizintilar"][other] = [
                [str(scans[TRAIN].images[a].path), str(scans[other].images[b].path), d]
                for a, b, d in leaks[:200]
            ]
            if leaks:
                notes.append(t("ayrim.hazir_sizinti", parca=other, sayi=len(leaks)))
    return PreparedData(discovery.labels, splits, rejected, notes, report)


def prepare_data(config: ClassifierConfig) -> PreparedData:
    """Klasörü keşfeder, görüntüleri doğrular/özetler ve sızıntısız ayrımı kurar."""
    root = Path(config.veri.klasor)
    discovery = discover(root, config.veri.grup_deseni)
    console.info(t("veri.bulundu", sayi=len(discovery.all_samples), sinif=len(discovery.labels)))
    if discovery.predefined is not None:
        data = _predefined(discovery, config)
    else:
        samples, scan = _scan(discovery.samples, config)
        splits, report, notes = _split(
            samples, scan, discovery.labels, config, config.veri.test_orani
        )
        data = PreparedData(discovery.labels, splits, scan.rejected, notes, report)
    data.notes = discovery.notes + data.notes
    if data.rejected:
        data.notes.append(t("veri.reddedilen", sayi=len(data.rejected)))
    missing = sorted(set(discovery.labels) - {s.label for s in data.train})
    if missing:
        raise UserError(t("veri.egitimde_yok", siniflar=", ".join(missing)))
    data.report["parcalar"] = {
        name: [{"dosya": str(s.path), "etiket": s.label} for s in rows]
        for name, rows in data.splits.items()
    }
    data.report["reddedilen"] = [
        {"dosya": str(path), "neden": reason} for path, reason, _ in data.rejected
    ]
    return data
