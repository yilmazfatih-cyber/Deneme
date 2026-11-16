"""Kalite: şema sözleşmesi, doğrulama, denetimler (ekilmiş hatalar), profil, temizleme."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import jsonschema
import pytest

from verihavuzu.files import jsonl_text
from verihavuzu.kalite import checks
from verihavuzu.kalite.clean import clean_rows, clean_value, fix_mojibake
from verihavuzu.kalite.profile import infer_type, profile_table, quantile
from verihavuzu.kalite.schema import Column, TableContract, load_contract, save_contract
from verihavuzu.kalite.validate import validate_rows
from verihavuzu.kalite.values import canonical_number, is_missing, parse_number
from verihavuzu.sentetik.commerce import generate_commerce
from verihavuzu.sentetik.config import CommerceConfig
from verihavuzu.sentetik.dirty import make_dirty
from verihavuzu.sentetik.invoices import generate_invoices
from verihavuzu.sentetik.registry import GENERATORS

# --- şema ve doğrulama ------------------------------------------------------------------------


@pytest.mark.parametrize("name", sorted(GENERATORS))
def test_contracts_are_standard_json_schema_and_round_trip(name: str, tmp_path: Path) -> None:
    spec = GENERATORS[name]
    tables = spec.calistir(min(40, spec.varsayilan_adet), 2, CommerceConfig())
    for table, contract in spec.sozlesmeler.items():
        schema = contract.to_json_schema()
        jsonschema.Draft202012Validator.check_schema(schema)
        path = tmp_path / f"{table}.sema.json"
        save_contract(contract, path)
        assert load_contract(path) == contract
        validator = jsonschema.Draft202012Validator(schema)
        for row in json.loads("[" + jsonl_text(tables[table]).strip().replace("\n", ",") + "]"):
            errors = list(validator.iter_errors(row))
            assert not errors, (table, errors[0].message)


def _contract() -> TableContract:
    return TableContract(
        ad="deneme",
        birincil_anahtar=["no"],
        sutunlar=[
            Column(ad="no", tur="tam_sayi", en_az=1, benzersiz=True),
            Column(ad="tckn", tur="metin", denetim="tckn"),
            Column(ad="tutar", tur="ondalik", en_az=0, en_cok=1000),
            Column(ad="durum", tur="metin", izinli=["acik", "kapali"]),
            Column(ad="tarih", tur="tarih", zorunlu=False),
            Column(ad="kod", tur="metin", desen=r"^[A-Z]{2}\d{3}$"),
        ],
    )


def test_validation_reports_each_seeded_problem_once() -> None:
    rows = [
        {
            "no": "1",
            "tckn": "10000000146",
            "tutar": "12.5",
            "durum": "acik",
            "tarih": "2026-11-16",
            "kod": "AB123",
        },
        {
            "no": "2",
            "tckn": "10000000147",
            "tutar": "12.5",
            "durum": "acik",
            "tarih": "",
            "kod": "AB123",
        },
        {
            "no": "2",
            "tckn": "10000000146",
            "tutar": "1200",
            "durum": "acik",
            "tarih": "",
            "kod": "AB123",
        },
        {
            "no": "x",
            "tckn": "10000000146",
            "tutar": "1,5",
            "durum": "ACIK",
            "tarih": "16.11.2026",
            "kod": "ab123",
        },
        {
            "no": "5",
            "tckn": "",
            "tutar": "-1",
            "durum": "kapali",
            "tarih": "2026-02-30",
            "kod": "AB1234",
        },
    ]
    result = validate_rows(rows, _contract())
    found = sorted((i.satir, i.sutun, i.kural) for i in result.sorunlar)
    assert found == [
        (2, "tckn", "denetim"),
        (3, "no", "anahtar"),
        (3, "no", "benzersiz"),
        (3, "tutar", "aralik"),
        (4, "durum", "izinli"),
        (4, "kod", "desen"),
        (4, "no", "tur"),
        (4, "tarih", "tur"),
        (4, "tutar", "tur"),
        (5, "kod", "desen"),
        (5, "tarih", "tur"),
        (5, "tckn", "zorunlu"),
        (5, "tutar", "aralik"),
    ]
    masked = [i.deger for i in result.sorunlar if i.sutun == "tckn" and i.deger]
    assert masked == ["•••••••••47"]  # kişisel veri raporda maskeli
    comma = validate_rows([dict(rows[0], tutar="12,5")], _contract(), decimal=",")
    assert comma.gecerli


def test_validation_detects_missing_and_extra_columns_and_json_types() -> None:
    result = validate_rows([{"no": 1, "fazla": "x"}], _contract(), typed=True)
    rules = {(i.kural, i.sutun) for i in result.sorunlar}
    assert ("eksik_sutun", "tckn") in rules and ("fazla_sutun", "fazla") in rules
    typed = validate_rows(
        [
            {
                "no": "1",
                "tckn": "10000000146",
                "tutar": 5,
                "durum": "acik",
                "tarih": None,
                "kod": "AB123",
            }
        ],
        _contract(),
        typed=True,
    )
    assert [(i.sutun, i.kural) for i in typed.sorunlar] == [("no", "tur")]


def test_contract_rejects_bad_definitions() -> None:
    with pytest.raises(ValueError, match="bilinmeyen denetim"):
        Column(ad="x", tur="metin", denetim="yok_boyle")
    with pytest.raises(ValueError, match="yinelenen"):
        TableContract(ad="t", sutunlar=[Column(ad="a", tur="metin"), Column(ad="a", tur="metin")])
    with pytest.raises(ValueError, match="Desteklenmeyen"):
        TableContract.from_json_schema({"type": "object", "properties": {}, "oneOf": []})
    with pytest.raises(ValueError, match="desteklenmeyen anahtar"):
        TableContract.from_json_schema(
            {"type": "object", "properties": {"a": {"type": "string", "$ref": "#/x"}}}
        )


# --- denetimler: ekilmiş hatalar yakalanmalı ------------------------------------------------------


def test_checks_catch_seeded_errors() -> None:
    shop = generate_commerce(60, 4)
    orders = [dict(row) for row in shop["siparisler"][:200]]
    items = [dict(row) for row in shop["siparis_kalemleri"][:300]]
    customers = shop["musteriler"]
    orders[10]["siparis_id"] = orders[9]["siparis_id"]  # yinelenen anahtar → satır 11
    orders[20]["musteri_id"] = "M999999"  # öksüz yabancı anahtar → satır 21
    orders[30]["toplam"] = Decimal("-5")  # aralık dışı → satır 31
    orders[40]["kanal"] = "faks"  # izinli değil → satır 41
    orders[50]["siparis_id"] = "SP12"  # desen → satır 51
    orders[60]["odeme_yontemi"] = None  # boş → satır 61
    assert checks.check_unique(orders, ["siparis_id"]).ornek_satirlar == [11]
    fk = checks.check_foreign_key(orders, "musteri_id", customers, "musteri_id")
    assert fk.ornek_satirlar == [21] and not fk.gecti
    assert checks.check_range(orders, "toplam", minimum=0).ornek_satirlar == [31]
    assert checks.check_allowed(orders, "kanal", ["web", "mobil_uygulama"]).ornek_satirlar == [41]
    assert checks.check_pattern(orders, "siparis_id", r"SP\d{7}").ornek_satirlar == [51]
    assert checks.check_not_null(orders, "odeme_yontemi").ornek_satirlar == [61]
    people = [dict(row) for row in customers[:50]]
    people[7]["tckn"] = people[7]["tckn"][:-1] + str((int(people[7]["tckn"][-1]) + 1) % 10)
    assert checks.check_valid(people, "tckn", "tckn").ornek_satirlar == [8]
    order_ids = {row["siparis_id"] for row in orders}
    rule = checks.check_rule(
        items, "kalem siparişi listede", lambda r: r["siparis_id"] in order_ids
    )
    assert rule.hatali_satir == sum(row["siparis_id"] not in order_ids for row in items)


def test_declarative_checks_from_json(tmp_path: Path) -> None:
    (tmp_path / "musteriler.jsonl").write_text(
        '{"musteri_id": "M1"}\n{"musteri_id": "M2"}\n', encoding="utf-8"
    )
    spec_file = tmp_path / "denetimler.json"
    spec_file.write_text(
        json.dumps(
            {
                "denetimler": [
                    {"tur": "benzersiz", "sutun": "siparis_id"},
                    {
                        "tur": "yabanci_anahtar",
                        "sutun": "musteri_id",
                        "hedef_dosya": "musteriler.jsonl",
                        "hedef_sutun": "musteri_id",
                    },
                    {"tur": "aralik", "sutun": "tutar", "en_az": 0},
                    {"tur": "gecerli", "sutun": "iban", "denetim": "iban_tr"},
                ]
            }
        ),
        encoding="utf-8",
    )
    rows = [
        {
            "siparis_id": "A",
            "musteri_id": "M1",
            "tutar": "10,5",
            "iban": "TR330006100519786457841326",
        },
        {
            "siparis_id": "A",
            "musteri_id": "M3",
            "tutar": "-1",
            "iban": "TR330006100519786457841327",
        },
    ]
    results = checks.run_checks(rows, checks.load_checks(spec_file), tmp_path)
    assert [r.hatali_satir for r in results] == [1, 1, 1, 1]
    with pytest.raises(ValueError, match="'desen' alanı gerekli"):
        checks.run_checks(rows, [checks.CheckSpec(tur="desen", sutun="x")], tmp_path)


# --- değer okuma, profil -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1234", "1234"),
        ("-12.5", "-12.5"),
        ("12,5", "12.5"),
        ("1.234,56", "1234.56"),
        ("1,234.56", "1234.56"),
        ("1 234,56", "1234.56"),
        (" 7\u00a0", "7"),
        ("1.234", "1.234"),
        ("12.345.678", "12345678"),
        ("abc", None),
        ("1,2,3", None),
        ("", None),
    ],
)
def test_parse_number(text: str, expected: str | None) -> None:
    assert canonical_number(text) == expected
    assert (parse_number(text) is None) == (expected is None)


def test_missing_markers_and_quantile() -> None:
    assert all(is_missing(v) for v in (None, "", " ", "NULL", "n/a", "YOK", "-", "NaN"))
    assert not any(is_missing(v) for v in ("0", "yoksul", 0, False))
    assert quantile([1.0, 2.0, 3.0, 4.0], 0.5) == 2.5  # numpy varsayılanı da 2.5 verir
    assert quantile([10.0, 20.0, 30.0], 0.25) == 15.0


def test_profile_infers_types_and_flags_outliers_and_pii() -> None:
    rows = [
        {
            "tutar": str(100 + i % 7),
            "tckn": "10000000146",
            "tarih": f"2025-01-{1 + i % 28:02d}",
            "aktif": "true" if i % 2 else "false",
            "ad": f"Ad {i}",
        }
        for i in range(200)
    ]
    rows[5]["tutar"] = "9999"  # ekilmiş aykırı değer
    rows[6]["tutar"] = ""
    profile = profile_table(rows, "deneme")
    by_name = {c["sutun"]: c for c in profile["sutunlar"]}
    assert by_name["tutar"]["tur"] == "tam_sayi" and by_name["tutar"]["eksik"] == 1
    assert by_name["tutar"]["sayisal"]["iqr_aykiri"] == 1
    assert by_name["tutar"]["sayisal"]["aykiri_ornekleri"] == [9999.0]
    assert by_name["tckn"]["tur"] == "kod" and by_name["tckn"]["kisisel_veri_ipucu"] == {
        "tckn": 1.0
    }
    assert by_name["tarih"]["tur"] == "tarih" and by_name["aktif"]["tur"] == "mantiksal"
    assert by_name["ad"]["aday_anahtar"]
    assert infer_type(["2025-01-01T10:00:00", "2025-01-02T11:30:00"])[0] == "zaman"
    assert infer_type(["evet", "HAYIR"])[0] == "mantiksal"


# --- temizleme: kirli kipin geri alınabilir her bozulması geri alınmalı -----------------------


def test_clean_value_examples() -> None:
    assert fix_mojibake("Ä°stanbul ÅžiÅŸli") == "İstanbul Şişli"
    assert fix_mojibake("Ağaç") == "Ağaç"
    assert clean_value("  Ä°zmir\u00a0 ") == "İzmir"
    assert clean_value("N/A") is None
    assert clean_value("16 Kasım 2026", "tarih") == "2026-11-16"
    assert clean_value("1.234,50", "ondalik") == "1234.50"


def test_cleaning_reverses_reversible_corruptions() -> None:
    rows = generate_invoices(60, 13)["faturalar"]
    dirty = make_dirty(rows, 13, rate=0.15, protected=["fatura_no"])
    result = clean_rows(dirty.kirli, drop_exact_duplicates=False)
    corrupted = {(int(e["satir"]), str(e["sutun"])): e for e in dirty.kayitlar if e["sutun"]}
    duplicates_before = 0
    for number, row in enumerate(result.satirlar, start=1):
        if any(int(e["satir"]) == number for e in dirty.kayitlar if e["bozulma"] == "yineleme"):
            duplicates_before += 1
            continue
        truth = dirty.temiz[number - 1 - duplicates_before]
        for column, value in row.items():
            entry = corrupted.get((number, column))
            kind = entry["bozulma"] if entry else None
            if kind is None or kind in ("bosluk", "mojibake", "tarih_bicimi", "ondalik"):
                if result.turler[column] == "ondalik" and value is not None:
                    assert Decimal(value) == Decimal(truth[column]), (number, column, entry)
                else:
                    assert value == truth[column], (number, column, entry)
            elif kind == "eksik":
                assert value is None


def test_exact_duplicates_are_dropped_after_cleaning() -> None:
    rows = [
        {"ad": "Ali", "il": "İzmir"},
        {"ad": " Ali ", "il": "Ä°zmir"},
        {"ad": "Ayşe", "il": "Van"},
    ]
    result = clean_rows(rows)
    assert result.atilan_yinelenenler == [2]
    assert [r["ad"] for r in result.satirlar] == ["Ali", "Ayşe"]
    assert {(c["satir"], c["sutun"]) for c in result.degisiklikler} == {(2, "ad"), (2, "il")}
