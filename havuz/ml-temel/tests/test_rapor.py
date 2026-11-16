"""Rapor, model kartı ve HTML: bölümler, Türkçe sayı yazımı, HTML kaçışı (kullanıcı verisi)."""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pytest

from ml_temel.tablo.html_report import markdown_to_html, render_html
from ml_temel.tablo.model_card import render_model_card
from ml_temel.tablo.report import num, render_report
from ml_temel.tablo.training import TrainingConfig, train
from ml_temel.veri import make_churn_table

NOW = datetime(2026, 11, 16, 9, 0)


@pytest.fixture(scope="module")
def churn_results() -> dict:
    table = make_churn_table(400, random_state=11)
    hostile = table.with_column("<script>alert(1)</script>", np.arange(len(table)) % 3 * 1.0)
    return train(hostile, TrainingConfig(target="kayip", models=("dogrusal",), fast=True), NOW)[1]


def test_turkish_number_formatting() -> None:
    assert num(0.83349) == "0,833"
    assert num(12.5, 1) == "12,5"
    assert num(float("nan")) == "—"
    assert num(None) == "—"


def test_report_sections_and_card(churn_results: dict) -> None:
    report = render_report(churn_results, "ciktilar/x/model.npz")
    for heading in (
        "## Özet",
        "## Uyarılar",
        "## Veri",
        "## Değerlendirme yöntemi",
        "## Aday modeller",
        "## Sınama sonuçları",
        "## Olasılık kalibrasyonu",
        "## Karar eşiği",
        "## Sütun önemleri",
        "## Nasıl kullanılır",
        "## Sınırlar",
    ):
        assert heading in report, heading
    assert "ciktilar/x/model.npz" in report
    assert "0." not in report.split("## Özet")[1].split("## Uyarılar")[0]  # ondalık virgül
    card = render_model_card(churn_results)
    assert "## Amaçlanan kullanım" in card
    assert "`sehir`" in card.split("## Etik ve adalet")[1]  # hassas olabilecek sütun işaretlendi


def test_html_escapes_user_text(churn_results: dict) -> None:
    page = render_html(churn_results, render_report(churn_results))
    assert "<script>" not in page
    assert "&lt;script&gt;" in page
    assert page.count("<svg") == 3  # adaylar, kalibrasyon, önem
    assert (
        markdown_to_html("**kalın** `kod` <b>")
        == "<p><strong>kalın</strong> <code>kod</code> &lt;b&gt;</p>\n\n"
    )


def test_regression_and_multiclass_reports_skip_binary_sections() -> None:
    table = make_churn_table(300, random_state=12)
    config = TrainingConfig(target="aylik_ucret", models=("dogrusal",), fast=True)
    report = render_report(train(table, config, NOW)[1])
    assert "Mutlak hata: ortanca" in report
    assert "## Olasılık kalibrasyonu" not in report
    assert "## Karar eşiği" not in report
    config = TrainingConfig(target="sozlesme", models=("dogrusal",), fast=True)
    report = render_report(train(table, config, NOW)[1])
    assert "Çok sınıflı sınıflandırma (3 sınıf)" in report
    assert "## Olasılık kalibrasyonu" not in report
    assert "## Karar eşiği ve karışıklık matrisi" in report
