"""tablo: şema, ayrım stratejileri, kalibrasyon sütunu, sızıntı uyarıları, uçtan uca eğitim."""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pytest

from ml_temel.klasik import LogisticRegression, SigmoidCalibration
from ml_temel.ortak.table import Table
from ml_temel.tablo.model import TabularModel, derive_columns
from ml_temel.tablo.schema import choose_positive, infer_column, infer_task
from ml_temel.tablo.splitting import make_split
from ml_temel.tablo.training import TrainingConfig, train
from ml_temel.veri import make_churn_table

NOW = datetime(2026, 11, 16, 9, 0)


def test_column_kinds_are_inferred_with_reasons() -> None:
    n = 60
    objects = lambda values: np.array(values, dtype=object)  # noqa: E731
    assert infer_column("musteri_no", np.arange(n, dtype=float)).kind == "kimlik"
    assert infer_column("yas", np.arange(n, dtype=float)).kind == "sayisal"
    assert infer_column("ulke", objects(["TR"] * n)).kind == "sabit"
    assert infer_column("sehir", objects(["İzmir", "Iğdır"] * 30)).kind == "kategori"
    assert infer_column("kod", objects([f"K{i}" for i in range(n)])).kind == "kimlik"
    dates = objects([f"{d:02d}.03.2024" for d in range(1, 31)] * 2)
    assert infer_column("tarih", dates).kind == "tarih"
    words = ["kargo", "geç", "geldi", "ürün", "kırık", "iade", "istiyorum", "çok", "güzel"]
    rng = np.random.default_rng(0)
    texts = objects([" ".join(rng.choice(words, 5)) for _ in range(n)])
    assert infer_column("yorum", texts).kind == "metin"


def test_task_and_positive_class() -> None:
    assert infer_task(np.array([0.0, 1.0, 1.0])) == "siniflandirma"
    assert infer_task(np.array(["a", "b"], dtype=object)) == "siniflandirma"
    assert infer_task(np.linspace(0, 1, 50)) == "regresyon"
    assert choose_positive(np.array(["evet", "hayır"], dtype=object), np.array([10, 90])) == "evet"
    assert choose_positive(np.array([0.0, 1.0]), np.array([80, 20])) == 1.0
    assert (
        choose_positive(np.array(["kaldı", "gitti"], dtype=object), np.array([90, 10])) == "gitti"
    )


def test_derived_date_columns_are_stateless() -> None:
    table = Table({"t": np.array(["16.11.2026", "2024-02-29", None], dtype=object)})
    derived = derive_columns(table, ["t"])
    np.testing.assert_allclose(derived["t__ay"][:2], [11, 2])
    np.testing.assert_allclose(derived["t__haftagunu"][:2], [0, 3])  # Pazartesi, Perşembe
    assert np.isnan(derived["t__ay"][2])


def test_calibration_is_applied_to_the_positive_column_even_if_it_is_first() -> None:
    # Bu test, pozitif sınıf 0. sütundayken kalibrasyonun yanlış sütuna uygulandığı bir hatayı
    # yakalamak için yazıldı ("evet" < "hayır" alfabetik sırada önce gelir).
    rng = np.random.default_rng(0)
    x = rng.standard_normal(300)
    labels = np.where(x + 0.5 * rng.standard_normal(300) > 0, "evet", "hayır").astype(object)
    table = Table({"x": x})
    pipeline = LogisticRegression().fit(x[:, None], labels)

    class Matrix:  # Table → numpy köprüsü (yalnız bu test için)
        classes_ = pipeline.classes_

        def predict_proba(self, data: Table) -> np.ndarray:
            return pipeline.predict_proba(data.to_matrix())

    calibrator = SigmoidCalibration()
    calibrator.a_, calibrator.b_ = -1.0, 0.0  # birim eşleme: olasılık değişmemeli
    model = TabularModel(
        "siniflandirma", "y", ["x"], [], Matrix(), pipeline.classes_, "evet", calibrator
    )
    np.testing.assert_allclose(model.predict_proba(table), model.raw_proba(table), atol=1e-6)


def test_split_plans_respect_time_and_groups() -> None:
    y = np.repeat([0, 1], 50)
    time = np.random.default_rng(0).permutation(100).astype(float)
    plan = make_split(
        100, y, "siniflandirma", time=time, groups=None, test_size=0.2, folds=3, seed=0
    )
    train_rows, test_rows = plan.order[plan.train], plan.order[plan.test]
    assert time[train_rows].max() < time[test_rows].min()  # sınama hep gelecekte
    for fold_train, fold_test in plan.folds:
        assert time[train_rows][fold_train].max() < time[train_rows][fold_test].min()
    groups = np.repeat(np.arange(20), 5).astype(object)
    plan = make_split(
        100, y, "siniflandirma", time=None, groups=groups, test_size=0.2, folds=4, seed=0
    )
    train_rows, test_rows = plan.order[plan.train], plan.order[plan.test]
    assert not set(groups[train_rows]) & set(groups[test_rows])
    for fold_train, fold_test in plan.folds:
        assert not set(groups[train_rows][fold_train]) & set(groups[train_rows][fold_test])


def test_training_on_churn_data_is_sane() -> None:
    table = make_churn_table(700, random_state=1)
    config = TrainingConfig(target="kayip", models=("dogrusal", "artirma"), fast=True)
    model, results = train(table, config, NOW)
    assert results["veri"]["pozitif"] == "evet"
    assert results["en_iyi"] in ("dogrusal", "artirma")
    metric = results["ana_olcut"]
    assert metric == "roc_auc"
    test = results["sinama"]["olcutler"][metric]
    assert test["alt"] <= test["deger"] <= test["ust"]
    assert test["deger"] > results["sinama"]["taban"][metric]["deger"] + 0.1
    assert results["uyarilar"] == [
        "Modele alınmayan sütunlar: musteri_no (kimlik).",
        "Sınama kümesi küçük (140 satır): güven aralıkları geniş, sonuçları temkinli okuyun.",
    ]
    assert results["onem"][0]["sutun"] in (
        "sozlesme",
        "destek_cagrisi",
        "memnuniyet",
        "abonelik_ay",
    )
    predictions = model.predict(table.drop(["kayip"]))
    assert set(predictions.tolist()) <= {"evet", "hayır"}
    assert results["ayrim"]["strateji"] == "katmanli"


def test_leaky_column_and_duplicates_are_reported() -> None:
    table = make_churn_table(500, random_state=2)
    leaky = table.with_column("iptal_kodu", np.where(table["kayip"] == "evet", 1.0, 0.0))
    _, results = train(leaky, TrainingConfig(target="kayip", models=("dogrusal",), fast=True), NOW)
    text = " ".join(results["uyarilar"])
    assert "şüphe uyandıracak kadar yüksek" in text
    assert "'iptal_kodu' tek başına" in text
    doubled = Table({name: np.concatenate([table[name], table[name]]) for name in table.names})
    _, results = train(
        doubled, TrainingConfig(target="kayip", models=("dogrusal",), fast=True), NOW
    )
    assert any("kopya satırlar" in warning for warning in results["uyarilar"])


def test_regression_multiclass_and_input_errors() -> None:
    table = make_churn_table(400, random_state=3)
    _, results = train(
        table, TrainingConfig(target="aylik_ucret", models=("dogrusal",), fast=True), NOW
    )
    assert results["veri"]["gorev"] == "regresyon"
    assert results["sinama"]["olcutler"]["r2"]["deger"] > 0.8
    _, results = train(
        table, TrainingConfig(target="sozlesme", models=("dogrusal",), fast=True), NOW
    )
    assert results["ana_olcut"] == "log_loss"
    assert len(results["veri"]["siniflar"]) == 3
    with pytest.raises(ValueError, match="adlı sütun yok"):
        train(table, TrainingConfig(target="yok"), NOW)
    with pytest.raises(ValueError, match="Bilinmeyen model"):
        train(table, TrainingConfig(target="kayip", models=("sihirli",)), NOW)
    with pytest.raises(ValueError, match="en az"):
        train(table.take_rows(np.arange(10)), TrainingConfig(target="kayip"), NOW)
    with pytest.raises(ValueError, match="pozitif"):
        train(table, TrainingConfig(target="kayip", positive="belki", models=("dogrusal",)), NOW)
    model, _ = train(table, TrainingConfig(target="kayip", models=("dogrusal",), fast=True), NOW)
    with pytest.raises(ValueError, match="beklediği sütunlar"):
        model.predict(table.drop(["sehir"]))
