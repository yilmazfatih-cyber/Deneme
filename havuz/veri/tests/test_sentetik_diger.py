"""Sentetik üreteçler (2): zaman serisi, churn, destek, web günlüğü, kirli kip, ayarlar."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from verihavuzu.calendar_tr import is_fixed_holiday
from verihavuzu.sentetik.churn import TRUE_COEFFICIENTS, generate_churn, logit_of, sigmoid
from verihavuzu.sentetik.config import load_commerce_config
from verihavuzu.sentetik.dirty import column_kind, make_dirty, mojibake
from verihavuzu.sentetik.invoices import generate_invoices
from verihavuzu.sentetik.support import generate_tickets
from verihavuzu.sentetik.timeseries import generate_timeseries
from verihavuzu.sentetik.weblog import EVENTS, generate_weblog


def test_timeseries_components_and_labels() -> None:
    rows = generate_timeseries(730, 3, series=2, anomaly_rate=0.03)
    assert len(rows) == 1460
    labelled = [row for row in rows if row["anomali"]]
    assert {row["anomali_turu"] for row in labelled} >= {"ani_artis", "ani_dusus", "eksik"}
    for row in rows:
        assert row["tatil"] == is_fixed_holiday(row["tarih"])
        if row["anomali_turu"] == "eksik":
            assert row["deger"] is None
        elif not row["anomali"]:
            assert abs(row["deger"] / row["beklenen"] - 1) < 0.3  # gürültü σ = %5
        expected = row["egilim"] * row["haftalik_etki"] * row["yillik_etki"]
        expected *= 0.55 if row["tatil"] else 1.0
        assert math.isclose(expected, row["beklenen"], rel_tol=2e-3)
    spikes = [row for row in labelled if row["anomali_turu"] == "ani_artis"]
    assert all(row["deger"] > row["beklenen"] * 1.4 for row in spikes)


def test_churn_probabilities_follow_the_published_formula() -> None:
    rows = generate_churn(3000, 12)
    for row in rows:
        assert abs(sigmoid(logit_of(row)) - row["gercek_olasilik"]) < 1e-4
    rate = sum(row["churn"] for row in rows) / len(rows)
    assert 0.08 < rate < 0.35
    monthly = [row["churn"] for row in rows if row["sozlesme"] == "aylik"]
    two_year = [row["churn"] for row in rows if row["sozlesme"] == "iki_yillik"]
    assert sum(monthly) / len(monthly) > 2 * sum(two_year) / len(two_year)


def test_churn_causal_structure_is_recoverable() -> None:
    np = pytest.importorskip("numpy")  # analiz ekstrası kuruluysa koşar
    rows = generate_churn(40000, 5)
    names = [
        "sozlesme_aylik",
        "kidem_ay",
        "destek_talebi",
        "odeme_gecikmesi",
        "kullanim_saat",
        "aylik_ucret_100",
        "eposta_acma_orani",
        "rastgele_ozellik",
    ]
    features = np.array(
        [
            [
                1.0,
                r["sozlesme"] == "aylik",
                r["kidem_ay"],
                r["destek_talebi"],
                r["odeme_gecikmesi"],
                r["kullanim_saat"],
                r["aylik_ucret"] / 100,
                r["eposta_acma_orani"],
                r["rastgele_ozellik"],
            ]
            for r in rows
        ],
        dtype=float,
    )
    target = np.array([r["churn"] for r in rows], dtype=float)
    weights = np.zeros(features.shape[1])
    for _ in range(25):  # Newton-Raphson (IRLS) ile lojistik regresyon
        prob = 1 / (1 + np.exp(-features @ weights))
        hessian = features.T @ (features * (prob * (1 - prob))[:, None])
        weights += np.linalg.solve(hessian, features.T @ (target - prob))
    fitted = dict(zip(["sabit", *names], weights.tolist(), strict=True))
    for name, truth in TRUE_COEFFICIENTS.items():
        assert abs(fitted[name] - truth) < max(0.12, 0.25 * abs(truth)), (name, fitted[name])
    assert abs(fitted["eposta_acma_orani"]) < 0.3  # kullanım modeldeyken etkisiz kalmalı
    assert abs(fitted["rastgele_ozellik"]) < 0.06


def test_tickets_are_filled_and_consistent() -> None:
    rows = generate_tickets(400, 2)
    times = [row["olusturma_zamani"] for row in rows]
    assert times == sorted(times)
    for row in rows:
        assert "{" not in row["metin"] and "}" not in row["metin"]
        if row["durum"] in ("acik", "beklemede"):
            assert row["cozum_suresi_saat"] is None and row["memnuniyet"] is None
        else:
            assert row["cozum_suresi_saat"] is not None and row["cozum_suresi_saat"] > 0


def test_weblog_sessions_respect_the_funnel() -> None:
    rows = generate_weblog(600, 4)
    sessions: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        sessions[str(row["oturum_id"])].append(row)
    for events in sessions.values():
        times = [str(e["zaman"]) for e in events]
        assert times == sorted(times)
        steps = [EVENTS.index(str(e["olay"])) for e in events]
        assert steps == sorted(steps) and steps[0] == 0
        assert len({e["kullanici_id"] for e in events}) == 1
        if "satin_al" in [e["olay"] for e in events]:
            assert {"sepete_ekle", "odeme_baslat"} <= {e["olay"] for e in events}
    purchases = sum("satin_al" in [e["olay"] for e in ev] for ev in sessions.values())
    assert 0.02 < purchases / len(sessions) < 0.25


def _undo(result_rows: list[dict[str, str]], log: list[dict[str, object]]) -> list[dict[str, str]]:
    restored = [dict(row) for row in result_rows]
    duplicates = set()
    for entry in log:
        number = int(str(entry["satir"]))
        if entry["bozulma"] == "yineleme":
            duplicates.add(number)
        else:
            row = restored[number - 1]
            assert row[str(entry["sutun"])] == entry["kirli"]
            row[str(entry["sutun"])] = str(entry["temiz"])
    return [row for index, row in enumerate(restored, start=1) if index not in duplicates]


def test_dirty_mode_is_fully_traceable() -> None:
    rows = generate_invoices(80, 7)["faturalar"]
    result = make_dirty(rows, 7, rate=0.12, protected=["fatura_no"])
    kinds = {str(entry["bozulma"]) for entry in result.kayitlar}
    assert kinds == {
        "eksik",
        "yineleme",
        "yazim_hatasi",
        "tarih_bicimi",
        "ondalik",
        "mojibake",
        "bosluk",
    }
    assert _undo(result.kirli, result.kayitlar) == result.temiz
    for entry in result.kayitlar:
        if entry["bozulma"] == "yineleme":
            copy, source = int(str(entry["satir"])), int(str(entry["kaynak_satir"]))
            assert source < copy
            assert result.kirli[copy - 1]["fatura_no"] == result.kirli[source - 1]["fatura_no"]
    again = make_dirty(rows, 7, rate=0.12, protected=["fatura_no"])
    assert again.kirli == result.kirli and again.kayitlar == result.kayitlar


def test_dirty_helpers() -> None:
    assert mojibake("İstanbul") == "Ä°stanbul"
    assert mojibake("çağ") == "Ã§aÄŸ"
    for text in ("Şişli Ağaç Ünlü Çöp", "ığüşöçİĞÜŞÖÇ"):
        broken = mojibake(text)
        assert broken is not None and broken.encode("cp1252").decode("utf-8") == text
    assert mojibake("plain") is None
    assert column_kind(["2025-01-02", ""]) == "tarih"
    assert column_kind(["12", "3"]) == "tam_sayi"
    assert column_kind(["12.50", "3"]) == "ondalik"
    assert column_kind(["Ankara", "3"]) == "metin"


def test_config_file_is_validated(tmp_path: Path) -> None:
    good = tmp_path / "ayar.json"
    good.write_text(
        json.dumps(
            {"kdv_oranlari": {"dusuk": 1, "indirimli": 10, "genel": 20}, "gunluk_siparis": 3}
        ),
        encoding="utf-8",
    )
    assert load_commerce_config(good).gunluk_siparis == 3
    bad = tmp_path / "bozuk.json"
    bad.write_text(json.dumps({"kdv_oranlari": {"genel": 20}, "fazla": 1}), encoding="utf-8")
    with pytest.raises(ValueError, match="Ayar dosyası geçersiz"):
        load_commerce_config(bad)
    assert load_commerce_config(None).kargo_ucreti == Decimal("49.90")
    assert load_commerce_config(None).campaign_on(date(2025, 11, 22)) is not None
