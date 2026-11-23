"""Klasör yapısından veri: sınıf başına bir klasör (`kok/<sınıf>/*.jpg`), alt klasörler serbest.

Kim kullanır: `train.py`, `plan.py`, `evaluate.py` (`--veri` klasörüyle değerlendirme).

İki düzen tanınır:
1. Düz:        kok/ayakkabı/1.jpg, kok/çanta/2.jpg …  → ayrım `split.py` ile yapılır.
2. Hazır ayrım: kok/egitim/<sınıf>/…, kok/test/<sınıf>/… (isteğe bağlı kok/dogrulama/<sınıf>/…;
   İngilizce train/val/validation/test adları da tanınır). Ayrım olduğu gibi kullanılır; parçalar
   arası yakın kopyalar yine de denetlenip UYARI olarak raporlanır.
Sınıf adı klasör adıdır, Unicode NFC'ye çevrilir (macOS'un ayrışık "ç"si ayrı sınıf olmasın).
Yalnız harf büyüklüğüyle ayrışan sınıflar ("Çanta" / "çanta") için uyarı verilir.
`grup_deseni`: sınıf klasörüne göreli yola (ör. "urun12/on.jpg") uygulanan düzenli ifade; ilk yakalama
grubu grup anahtarıdır (aynı anahtar → aynı ayrım parçası).

Genişletme: CSV/JSONL listesinden (yol, etiket) okumak gerekirse buraya `from_listing` yazın ve
`Discovery` döndürün; ayrım ve eğitim değişmeden çalışır.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from goruntu.errors import UserError
from goruntu.kopya.scan import list_images
from goruntu.messages import t
from goruntu.text_tr import lower_tr, nfc

SPLIT_ALIASES = {
    "egitim": "egitim",
    "train": "egitim",
    "dogrulama": "dogrulama",
    "val": "dogrulama",
    "validation": "dogrulama",
    "test": "test",
}


@dataclass(frozen=True)
class Sample:
    path: Path
    label: str
    group: str | None = None


@dataclass
class Discovery:
    labels: list[str]
    samples: list[Sample]
    predefined: dict[str, list[Sample]] | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def all_samples(self) -> list[Sample]:
        if self.predefined is None:
            return self.samples
        return [sample for rows in self.predefined.values() for sample in rows]


def _children(folder: Path) -> list[Path]:
    return sorted(
        (p for p in folder.iterdir() if p.is_dir() and not p.name.startswith(".")),
        key=lambda path: nfc(path.name),
    )


def _class_samples(
    folder: Path, pattern: re.Pattern[str] | None, notes: list[str]
) -> dict[str, list[Sample]]:
    by_label: dict[str, list[Sample]] = {}
    for class_dir in _children(folder):
        if class_dir.name == "__MACOSX":
            continue
        label = nfc(class_dir.name)
        rows = by_label.setdefault(label, [])
        for path in list_images(class_dir):
            group = None
            if pattern is not None:
                match = pattern.search(nfc(path.relative_to(class_dir).as_posix()))
                group = f"{label}/{match.group(1)}" if match else None
            rows.append(Sample(path, label, group))
    loose = [p for p in list_images(folder, recursive=False) if p.parent == folder]
    if loose:
        notes.append(t("veri.kok_dosyalari", sayi=len(loose), yol=folder))
    return by_label


def discover(root: Path, group_pattern: str = "") -> Discovery:
    """Klasörü tarar; sınıfları ve örnekleri döndürür (dosyalar henüz açılmaz)."""
    if not root.is_dir():
        raise UserError(t("dosya.klasor_yok", yol=root))
    pattern = re.compile(group_pattern) if group_pattern else None
    notes: list[str] = []
    children = _children(root)
    split_dirs = {SPLIT_ALIASES[c.name]: c for c in children if c.name in SPLIT_ALIASES}
    if split_dirs:
        if len(split_dirs) != len(children) or "egitim" not in split_dirs:
            raise UserError(t("veri.karisik_duzen", yol=root))
        predefined = {
            name: [s for rows in _class_samples(folder, pattern, notes).values() for s in rows]
            for name, folder in split_dirs.items()
        }
        labels = sorted({s.label for rows in predefined.values() for s in rows})
        discovery = Discovery(labels, [], predefined, notes)
    else:
        by_label = _class_samples(root, pattern, notes)
        for label, rows in by_label.items():
            if not rows:
                notes.append(t("veri.bos_sinif", sinif=label))
        samples = [s for rows in by_label.values() for s in rows]
        labels = sorted(label for label, rows in by_label.items() if rows)
        discovery = Discovery(labels, samples, None, notes)
    _check(discovery, root)
    return discovery


def _check(discovery: Discovery, root: Path) -> None:
    if len(discovery.labels) < 2:
        raise UserError(t("veri.az_sinif", yol=root, sayi=len(discovery.labels)))
    folded = Counter(lower_tr(label) for label in discovery.labels)
    clashes = sorted(label for label in discovery.labels if folded[lower_tr(label)] > 1)
    if clashes:
        discovery.notes.append(t("veri.buyuk_kucuk", siniflar=", ".join(clashes)))
    counts = Counter(sample.label for sample in discovery.all_samples)
    for label in discovery.labels:
        if counts[label] < 5:
            discovery.notes.append(t("veri.az_ornek", sinif=label, sayi=counts[label]))
    largest, smallest = max(counts.values()), min(counts.values())
    if smallest and largest / smallest >= 3:
        discovery.notes.append(t("veri.dengesiz", buyuk=largest, kucuk=smallest))
