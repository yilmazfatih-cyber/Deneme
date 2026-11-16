"""TabularModel: eğitilmiş tablo modelinin kendisi — sütun hazırlığı + hat + kalibrasyon + eşik.

Bu nesne model dosyasına yazılır (`persistence.save_model`) ve `tahmin` / `degerlendir`
komutlarında geri okunur. Ham tablo (CSV'den okunduğu gibi) alır:

  1. `prepare`: modelin beklediği sütunları seçer, tarih sütunlarından ay ve haftanın günü
     sütunları türetir (durumsuz; veriden bir şey öğrenmez, bu yüzden sızıntı yaratmaz).
  2. `pipeline`: ön işleme (ColumnTransformer) + model; çapraz doğrulamada her katta yeniden
     eğitilmiş olan nesnenin bütün eğitim verisiyle eğitilmiş hâli.
  3. `calibrator` (ikili sınıflamada isteğe bağlı): ham olasılığın log-oranını düzeltir.
  4. `threshold`: ikili sınıflamada "pozitif" demek için olasılık eşiği (varsayılan 0.5).
Genişletme: yeni bir türetilmiş sütun için `derive_columns`'a ekleyin (durumsuz kalmalı!).
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.tablo.messages import t
from ml_temel.tablo.schema import parse_dates

_PROBABILITY_EPS = 1e-6


def derive_columns(table: Table, date_columns: list[str]) -> Table:
    """Tarih sütunlarını ay (1-12) ve haftanın günü (0 = Pazartesi) sütunlarıyla değiştirir."""
    result = table
    for name in date_columns:
        days = parse_dates(np.asarray(table[name], dtype=object), threshold=0.0)
        if days is None:
            days = np.full(len(table), np.nan)
        whole_days = np.floor(np.where(np.isfinite(days), days, 0.0)).astype(np.int64)
        stamps = whole_days.astype("datetime64[D]")
        months = (stamps.astype("datetime64[M]").astype(np.int64) % 12 + 1).astype(np.float64)
        weekdays = ((stamps.astype(np.int64) + 3) % 7).astype(np.float64)  # 1970-01-01 Perşembe
        result = result.drop([name])
        result = result.with_column(f"{name}__ay", np.where(np.isfinite(days), months, np.nan))
        result = result.with_column(
            f"{name}__haftagunu", np.where(np.isfinite(days), weekdays, np.nan)
        )
    return result


def logit(probability: Array) -> Array:
    clipped = np.clip(probability, _PROBABILITY_EPS, 1.0 - _PROBABILITY_EPS)
    return np.log(clipped / (1.0 - clipped))


class TabularModel:
    """Ham tablodan tahmin yapan, dosyaya yazılabilen bütünleşik model."""

    def __init__(
        self,
        task: str,
        target: str,
        input_columns: list[str],
        date_columns: list[str],
        pipeline: Any,
        classes: Array | None = None,
        positive_class: Any = None,
        calibrator: Any = None,
        threshold: float = 0.5,
    ) -> None:
        self.task = task
        self.target = target
        self.input_columns = input_columns
        self.date_columns = date_columns
        self.pipeline = pipeline
        self.classes = classes
        self.positive_class = positive_class
        self.calibrator = calibrator
        self.threshold = threshold

    @property
    def classes_(self) -> Array | None:
        """scikit-learn adıyla sınıflar (değerlendirme yardımcıları bu adı bekler)."""
        return self.classes

    def prepare(self, table: Table) -> Table:
        """Ham tablodan modelin girdisini hazırlar (eksik sütun varsa açıklayıcı hata)."""
        missing = [name for name in self.input_columns if name not in table]
        if missing:
            raise ValueError(t("sutun_eksik", sutunlar=", ".join(missing)))
        return derive_columns(table.select(self.input_columns), self.date_columns)

    def raw_proba(self, table: Table) -> Array:
        """Kalibrasyonsuz sınıf olasılıkları; sütunlar `classes` sırasında."""
        probabilities: Array = np.asarray(self.pipeline.predict_proba(self.prepare(table)))
        return probabilities

    def predict_proba(self, table: Table) -> Array:
        probabilities = self.raw_proba(table)
        if self.calibrator is None or probabilities.shape[1] != 2:
            return probabilities
        column = self.positive_index()  # pozitif sınıf 0. sütunda da olabilir ("evet" < "hayır")
        positive = np.asarray(self.calibrator.predict(logit(probabilities[:, column])), dtype=float)
        calibrated = np.empty_like(probabilities)
        calibrated[:, column], calibrated[:, 1 - column] = positive, 1.0 - positive
        return calibrated

    def positive_index(self) -> int:
        assert self.classes is not None
        return int(np.flatnonzero(self.classes == self.positive_class)[0])

    def predict(self, table: Table) -> Array:
        if self.task == "regresyon":
            prediction: Array = np.asarray(self.pipeline.predict(self.prepare(table)), dtype=float)
            return prediction
        assert self.classes is not None
        probabilities = self.predict_proba(table)
        if probabilities.shape[1] == 2:
            positive = self.positive_index()
            chosen = np.where(probabilities[:, positive] >= self.threshold, positive, 1 - positive)
            labels: Array = self.classes[chosen]
            return labels
        labels = self.classes[probabilities.argmax(axis=1)]
        return labels
