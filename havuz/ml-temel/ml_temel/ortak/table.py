"""Table: adlandırılmış sütunlardan oluşan küçük bir tablo (pandas'sız "veri çerçevesi").

Fikir: her sütun aynı uzunlukta bir numpy dizisidir. Sayısal sütunlar float64 (eksik = NaN),
kategori/metin sütunları object dizisidir (eksik = None). Tablo değişmezdir: her işlem yeni bir
`Table` döndürür; satır seçimi (`take_rows`) çapraz doğrulamanın katlara bölmesi için vardır.

Kim kullanır: `tablo` (CSV'den okunan veri), `onisleme.ColumnTransformer` (sütunları adıyla seçer),
`secim` (satır seçer).
Genişletme: yeni bir tablo işlemi gerekiyorsa buraya yöntem olarak ekleyin; yerinde değişiklik
yapan yöntem eklemeyin (çapraz doğrulamada sızıntıya yol açar).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike, IntArray


class Table:
    """Sütun adı → numpy dizisi eşlemesi; bütün sütunlar aynı uzunluktadır."""

    def __init__(self, columns: Mapping[str, ArrayLike]) -> None:
        self._columns: dict[str, Array] = {}
        length: int | None = None
        for name, values in columns.items():
            array = np.asarray(values)
            if array.ndim != 1:
                raise ValueError(f"'{name}' sütunu 1 boyutlu olmalı; verilen biçim {array.shape}.")
            if length is None:
                length = array.shape[0]
            elif array.shape[0] != length:
                raise ValueError(
                    f"'{name}' sütununda {array.shape[0]} satır var; diğer sütunlarda {length}. "
                    "Bütün sütunlar aynı uzunlukta olmalı."
                )
            self._columns[str(name)] = array
        self._length = length or 0

    @property
    def names(self) -> list[str]:
        """Sütun adları (dosyadaki sırayla)."""
        return list(self._columns)

    @property
    def shape(self) -> tuple[int, int]:
        return (self._length, len(self._columns))

    def __len__(self) -> int:
        return self._length

    def __contains__(self, name: object) -> bool:
        return name in self._columns

    def __iter__(self) -> Iterator[str]:
        return iter(self._columns)

    def __getitem__(self, name: str) -> Array:
        if name not in self._columns:
            raise KeyError(
                f"'{name}' adlı sütun yok. "
                f"Var olan sütunlar: {', '.join(self._columns) or '(yok)'}."
            )
        return self._columns[name]

    def __repr__(self) -> str:
        return f"Table({self._length} satır × {len(self._columns)} sütun: {self.names})"

    def take_rows(self, rows: IntArray) -> Table:
        """Yalnız verilen satırları (indeks ya da mantıksal maske) içeren yeni tablo."""
        index = np.asarray(rows)
        return Table({name: values[index] for name, values in self._columns.items()})

    def select(self, names: Sequence[str]) -> Table:
        """Yalnız verilen sütunları (verilen sırayla) içeren yeni tablo."""
        return Table({name: self[name] for name in names})

    def drop(self, names: Sequence[str]) -> Table:
        """Verilen sütunlar çıkarılmış yeni tablo (olmayan ad sessizce geçilir)."""
        removed = set(names)
        return Table({n: values for n, values in self._columns.items() if n not in removed})

    def with_column(self, name: str, values: ArrayLike) -> Table:
        """Bir sütunu eklenmiş ya da değiştirilmiş yeni tablo."""
        columns: dict[str, ArrayLike] = dict(self._columns)
        columns[name] = values
        return Table(columns)

    def to_matrix(self, names: Sequence[str] | None = None) -> Array:
        """Seçilen (sayısal) sütunları satır × sütun float64 matrisine dizer."""
        chosen = list(names) if names is not None else self.names
        if not chosen:
            return np.empty((self._length, 0), dtype=np.float64)
        try:
            return np.column_stack([np.asarray(self[name], dtype=np.float64) for name in chosen])
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"Sütunlar sayıya çevrilemedi ({error}). Kategori sütunlarını `to_object_matrix` "
                "ile alıp `OneHotEncoder`/`OrdinalEncoder` ile kodlayın."
            ) from error

    def to_object_matrix(self, names: Sequence[str] | None = None) -> Array:
        """Seçilen sütunları olduğu gibi (object) satır × sütun matrisine dizer."""
        chosen = list(names) if names is not None else self.names
        matrix = np.empty((self._length, len(chosen)), dtype=object)
        for position, name in enumerate(chosen):
            matrix[:, position] = self[name]
        return matrix
