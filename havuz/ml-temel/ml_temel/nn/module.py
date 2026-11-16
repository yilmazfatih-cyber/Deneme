"""Module ve Parameter: öğrenilebilir ağırlıkları olan katmanların ortak tabanı.

Fikir: `Parameter`, gradyanı her zaman tutulan bir `Tensor`'dur. `Module`, kendi alanlarını
(`self.weight`, `self.layers`…) gezerek içindeki bütün parametreleri bulur; ek bir kayıt işlemi
yoktur. Alt katmanlar alan olarak ya da liste içinde tutulabilir. Parametre adları alan yoludur:
`blocks.0.attention.query.weight` — `state_dict` ve `.npz` dosyası bu adları kullanır.

Kim kullanır: `nn` içindeki bütün katmanlar ve kullanıcı modelleri.
Genişletme: yeni katman = `Module`'dan türeyen, `forward` tanımlayan sınıf
(AGENTS.md → "Yeni katman ekle").
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any, Self

import numpy as np

from ml_temel.autograd.tensor import Tensor, TensorLike
from ml_temel.ortak.types import Array


class Parameter(Tensor):
    """Öğrenilebilir ağırlık: `requires_grad=True` olan Tensor."""

    __slots__ = ()

    def __init__(self, data: TensorLike) -> None:
        super().__init__(data, requires_grad=True)
        self.data = np.array(self.data, dtype=np.float64)  # kendi kopyası: dışarıdaki dizi bozulmaz


class Module:
    """Katmanların tabanı: parametre bulma, eğitim/değerlendirme kipi, ağırlık kaydetme/yükleme."""

    training: bool = True

    def forward(self, *args: Any, **kwargs: Any) -> Any:
        raise NotImplementedError(
            f"{type(self).__name__} sınıfı `forward` yöntemini tanımlamalı (ileri hesap orada)."
        )

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.forward(*args, **kwargs)

    # --- parametreler ---------------------------------------------------------------------
    def named_parameters(self) -> list[tuple[str, Parameter]]:
        """(ad, parametre) çiftleri; paylaşılan (bağlı) ağırlık yalnız ilk adıyla bir kez geçer."""
        found: list[tuple[str, Parameter]] = []
        seen: set[int] = set()
        for name, parameter in self._walk(""):
            if id(parameter) not in seen:
                seen.add(id(parameter))
                found.append((name, parameter))
        return found

    def _walk(self, prefix: str) -> Iterator[tuple[str, Parameter]]:
        for name, value in vars(self).items():
            yield from _walk_value(f"{prefix}{name}", value)

    def parameters(self) -> list[Parameter]:
        """Bütün öğrenilebilir parametreler (optimizer'a bunu verin)."""
        return [parameter for _, parameter in self.named_parameters()]

    def num_parameters(self) -> int:
        """Toplam öğrenilebilir sayı adedi."""
        return sum(parameter.size for parameter in self.parameters())

    def modules(self) -> list[Module]:
        """Kendisi dahil bütün alt katmanlar."""
        found: list[Module] = [self]
        for value in vars(self).values():
            items = value if isinstance(value, (list, tuple)) else [value]
            for item in items:
                if isinstance(item, Module):
                    found.extend(item.modules())
        return found

    def zero_grad(self) -> None:
        """Bütün parametre gradyanlarını sıfırlar (her eğitim adımının başında çağırın)."""
        for parameter in self.parameters():
            parameter.grad = None

    # --- kip ------------------------------------------------------------------------------
    def train(self, mode: bool = True) -> Self:
        """Eğitim kipi: Dropout etkin."""
        for module in self.modules():
            module.training = mode
        return self

    def eval(self) -> Self:
        """Değerlendirme kipi: Dropout kapalı."""
        return self.train(False)

    # --- ağırlıkları kaydet / yükle --------------------------------------------------------
    def state_dict(self) -> dict[str, Array]:
        """Parametre adı → ağırlık dizisi (kopya)."""
        return {name: parameter.data.copy() for name, parameter in self.named_parameters()}

    def load_state_dict(self, state: dict[str, Array]) -> None:
        """Ağırlıkları yükler; adlar ve biçimler modelle birebir uyuşmalıdır."""
        own = dict(self.named_parameters())
        missing = sorted(set(own) - set(state))
        unexpected = sorted(set(state) - set(own))
        if missing or unexpected:
            raise ValueError(
                f"Ağırlık adları modelle uyuşmuyor. Dosyada eksik: {missing or 'yok'}; "
                f"modelde olmayan: {unexpected or 'yok'}. Modeli, ağırlıkların kaydedildiği "
                "kurucu parametreleriyle (katman sayısı, boyutlar) kurduğunuzdan emin olun."
            )
        for name, parameter in own.items():
            value = np.asarray(state[name], dtype=np.float64)
            if value.shape != parameter.shape:
                raise ValueError(
                    f"'{name}' biçimi uyuşmuyor: dosyada {value.shape}, modelde {parameter.shape}."
                )
            parameter.data = value.copy()

    def save(self, path: str | Path) -> Path:
        """Ağırlıkları `.npz` dosyasına yazar; yazılan dosyanın yolunu döndürür."""
        target = Path(path)
        if target.suffix != ".npz":
            target = target.with_name(target.name + ".npz")
        target.parent.mkdir(parents=True, exist_ok=True)
        np.savez(target, **self.state_dict())  # type: ignore[arg-type]
        return target

    def load(self, path: str | Path) -> Self:
        """`save` ile yazılmış `.npz` dosyasından ağırlıkları yükler."""
        with np.load(Path(path), allow_pickle=False) as archive:
            self.load_state_dict({name: archive[name] for name in archive.files})
        return self


def _walk_value(name: str, value: Any) -> Iterator[tuple[str, Parameter]]:
    """Bir alanın içindeki parametreleri (doğrudan, alt katmanda ya da listede) bulur."""
    if isinstance(value, Parameter):
        yield name, value
    elif isinstance(value, Module):
        yield from value._walk(f"{name}.")
    elif isinstance(value, (list, tuple)):
        for position, item in enumerate(value):
            yield from _walk_value(f"{name}.{position}", item)
