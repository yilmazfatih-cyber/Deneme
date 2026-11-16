"""Model dosyası: eğitilmiş nesneleri `pickle` KULLANMADAN kaydeder ve güvenle geri yükler.

Neden pickle değil: pickle dosyası yüklenirken içine gömülmüş herhangi bir kodu çalıştırabilir;
başkasından gelen bir model dosyasını açmak bilgisayarı ele geçirmek demek olabilir.

Biçim: tek bir sıkıştırılmış `.npz` dosyası. Sayısal diziler npz'nin kendi dizileri olarak,
nesne ağacı ise `__meta__` adlı JSON metni olarak saklanır. Bir nesne yazılırken sınıf adı ve
`vars(nesne)` alanları kaydedilir; yüklenirken YALNIZ `ml_temel/registry.py` içindeki sınıflar
kurulabilir (`__init__` çağrılmadan alanlar geri yazılır). Dosya `allow_pickle=False` ile açılır.

Desteklenen değerler: None, bool, int, float (NaN/∞ dahil), str, list, tuple, set, dict, slice,
numpy dizileri (sayısal, metin, nesne) ve kayıtlı sınıfların örnekleri. Fonksiyon (ör. özel
`tokenizer`) kaydedilemez; açıklayıcı hata verilir.
Genişletme: yeni bir sınıfı kaydedilebilir yapmak için `ml_temel/registry.py`'ye ekleyin.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

FORMAT_NAME = "ml-temel-model"
FORMAT_VERSION = 1
_META_KEY = "__meta__"


class ModelFileError(ValueError):
    """Model dosyası okunamadığında ya da yazılamadığında fırlatılır."""


def _registry() -> dict[str, type]:
    from ml_temel.registry import SAVEABLE  # döngüsel içe aktarmayı önlemek için geç yükleme

    return SAVEABLE


class _Encoder:
    """Nesne ağacını JSON'a uygun yapıya çevirir; sayısal dizileri ayrı bir sözlükte toplar."""

    def __init__(self) -> None:
        self.arrays: dict[str, np.ndarray] = {}
        self.names = {cls: name for name, cls in _registry().items()}

    def encode(self, value: Any, path: str) -> Any:
        if value is None or isinstance(value, (bool, str)):
            return value
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return value if math.isfinite(value) else {"__sayi__": repr(value)}
        if isinstance(value, np.generic):
            return self.encode(value.item(), path)
        if isinstance(value, np.ndarray):
            return self._encode_array(value, path)
        if isinstance(value, tuple):
            return {"__demet__": [self.encode(v, f"{path}.{i}") for i, v in enumerate(value)]}
        if isinstance(value, slice):
            return {"__dilim__": [value.start, value.stop, value.step]}
        if isinstance(value, list):
            return [self.encode(v, f"{path}.{i}") for i, v in enumerate(value)]
        if isinstance(value, (set, frozenset)):
            return {"__kume__": [self.encode(v, path) for v in sorted(value, key=repr)]}
        if isinstance(value, dict):
            if all(isinstance(key, str) for key in value):
                return {"__sozluk__": {k: self.encode(v, f"{path}.{k}") for k, v in value.items()}}
            pairs = [[self.encode(k, path), self.encode(v, path)] for k, v in value.items()]
            return {"__ciftler__": pairs}
        cls = type(value)
        if cls in self.names:
            fields = {k: self.encode(v, f"{path}.{k}") for k, v in vars(value).items()}
            return {"__sinif__": self.names[cls], "alanlar": fields}
        raise ModelFileError(
            f"'{path}' kaydedilemiyor: {cls.__name__} türü desteklenmiyor. Fonksiyon gibi "
            "değerler (ör. özel tokenizer) model dosyasına yazılamaz; kendi sınıfınızsa "
            "`ml_temel/registry.py` içindeki SAVEABLE listesine ekleyin."
        )

    def _encode_array(self, array: np.ndarray, path: str) -> Any:
        if array.dtype.kind in "biufc":
            key = f"a{len(self.arrays)}"
            self.arrays[key] = array
            return {"__dizi__": key}
        if array.dtype.kind in "OUS":
            items = [self.encode(item, path) for item in array.ravel().tolist()]
            kind = "O" if array.dtype.kind == "O" else array.dtype.str
            return {"__nesne_dizisi__": items, "bicim": list(array.shape), "tur": kind}
        raise ModelFileError(f"'{path}': {array.dtype} türündeki dizi kaydedilemez.")


class _Decoder:
    """`_Encoder`'ın tersi; yalnız kayıtlı sınıfları kurar."""

    def __init__(self, arrays: Any) -> None:
        self.arrays = arrays
        self.registry = _registry()

    def decode(self, value: Any) -> Any:
        if isinstance(value, list):
            return [self.decode(v) for v in value]
        if not isinstance(value, dict):
            return value
        if "__sayi__" in value:
            return float(value["__sayi__"])
        if "__dizi__" in value:
            return np.array(self.arrays[value["__dizi__"]])
        if "__nesne_dizisi__" in value:
            items = [self.decode(v) for v in value["__nesne_dizisi__"]]
            dtype = object if value["tur"] == "O" else np.dtype(value["tur"])
            array = np.empty(len(items), dtype=dtype)
            array[:] = items
            return array.reshape(value["bicim"])
        if "__demet__" in value:
            return tuple(self.decode(v) for v in value["__demet__"])
        if "__dilim__" in value:
            return slice(*value["__dilim__"])
        if "__kume__" in value:
            return frozenset(self.decode(v) for v in value["__kume__"])
        if "__sozluk__" in value:
            return {k: self.decode(v) for k, v in value["__sozluk__"].items()}
        if "__ciftler__" in value:
            return {self._key(self.decode(k)): self.decode(v) for k, v in value["__ciftler__"]}
        if "__sinif__" in value:
            name = value["__sinif__"]
            if name not in self.registry:
                raise ModelFileError(
                    f"Dosyada bilinmeyen sınıf: '{name}'. Dosya daha yeni bir ml-temel sürümüyle "
                    "yazılmış olabilir ya da güvenilmeyen bir kaynaktan geliyor olabilir."
                )
            cls: Any = self.registry[name]
            instance = cls.__new__(cls)
            instance.__dict__.update({k: self.decode(v) for k, v in value["alanlar"].items()})
            return instance
        raise ModelFileError(f"Model dosyasında tanınmayan kayıt: {sorted(value)[:3]}")

    @staticmethod
    def _key(key: Any) -> Any:
        return tuple(key) if isinstance(key, list) else key


def save_model(obj: Any, path: str | Path, metadata: dict[str, Any] | None = None) -> Path:
    """`obj`'yi (ve isteğe bağlı JSON'a uygun `metadata`yı) tek bir `.npz` dosyasına yazar."""
    from ml_temel import __version__

    target = Path(path)
    if target.suffix != ".npz":
        target = target.with_name(target.name + ".npz")
    encoder = _Encoder()
    meta = {
        "bicim": FORMAT_NAME,
        "surum": FORMAT_VERSION,
        "ml_temel": __version__,
        "nesne": encoder.encode(obj, "model"),
        "ek": encoder.encode(metadata or {}, "ek"),
    }
    text = json.dumps(meta, ensure_ascii=False, allow_nan=False)
    target.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(target, **{_META_KEY: np.array(text)}, **encoder.arrays)  # type: ignore[arg-type]
    return target


def load_model(path: str | Path) -> tuple[Any, dict[str, Any]]:
    """`save_model` ile yazılmış dosyayı okur: (nesne, ek bilgiler)."""
    source = Path(path)
    if not source.exists():
        raise ModelFileError(f"Model dosyası bulunamadı: {source}")
    try:
        archive = np.load(source, allow_pickle=False)
    except (OSError, ValueError) as error:
        raise ModelFileError(f"{source} bir ml-temel model dosyası değil ({error}).") from error
    with archive:
        if _META_KEY not in archive.files:
            raise ModelFileError(
                f"{source} içinde model bilgisi yok; dosya `save_model` ile yazılmamış."
            )
        meta = json.loads(str(archive[_META_KEY]))
        if meta.get("bicim") != FORMAT_NAME:
            raise ModelFileError(f"{source} bir ml-temel model dosyası değil.")
        if int(meta.get("surum", 0)) > FORMAT_VERSION:
            raise ModelFileError(
                f"{source} daha yeni bir biçimde (sürüm {meta['surum']}) yazılmış; bu kurulum en "
                f"çok {FORMAT_VERSION} okuyabilir. ml-temel'i güncelleyin."
            )
        decoder = _Decoder(archive)
        return decoder.decode(meta["nesne"]), decoder.decode(meta["ek"])
