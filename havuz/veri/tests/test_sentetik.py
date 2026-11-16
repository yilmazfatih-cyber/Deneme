"""Sentetik üreteçler: belirlenimcilik, sözleşmeye uyum ve ilişkisel tutarlılık."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from decimal import Decimal

import pytest

from verihavuzu import geo, ids
from verihavuzu.files import jsonl_text
from verihavuzu.kalite.validate import validate_rows
from verihavuzu.numwords import amount_to_words
from verihavuzu.sentetik import identifiers as fake
from verihavuzu.sentetik.banking import generate_banking
from verihavuzu.sentetik.base import Rng, Tables
from verihavuzu.sentetik.commerce import generate_commerce
from verihavuzu.sentetik.companies import generate_companies
from verihavuzu.sentetik.config import CommerceConfig
from verihavuzu.sentetik.invoices import invoices_from_commerce, split_vat
from verihavuzu.sentetik.people import REFERENCE_DATE, age_on, generate_people
from verihavuzu.sentetik.registry import GENERATORS


def _run(name: str, count: int, seed: int) -> Tables:
    return GENERATORS[name].calistir(count, seed, CommerceConfig())


@pytest.mark.parametrize("name", sorted(GENERATORS))
def test_every_generator_is_deterministic_and_matches_its_contract(name: str) -> None:
    spec = GENERATORS[name]
    count = min(spec.varsayilan_adet, 60)
    first, second, other = _run(name, count, 5), _run(name, count, 5), _run(name, count, 6)
    assert first.keys() == spec.sozlesmeler.keys()
    for table, rows in first.items():
        assert rows, f"{name}/{table} boş"
        assert jsonl_text(rows) == jsonl_text(second[table]), f"{name}/{table} belirlenimci değil"
        result = validate_rows(rows, spec.sozlesmeler[table], typed=True)
        assert result.gecerli, [(i.satir, i.sutun, i.mesaj) for i in result.sorunlar[:5]]
    assert any(jsonl_text(first[t]) != jsonl_text(other[t]) for t in first), "tohum etkisiz"


def test_streams_are_independent_of_other_streams() -> None:
    rng = Rng(1, "a")
    assert rng.child("x").random() == Rng(1, "a").child("x").random()
    assert rng.child("x").random() != rng.child("y").random()


def test_fake_identifiers_are_valid() -> None:
    rng = Rng(3)
    for _ in range(300):
        assert ids.is_valid_tckn(fake.fake_tckn(rng))
        assert ids.is_valid_vkn(fake.fake_vkn(rng))
        assert ids.is_valid_iban_tr(fake.fake_iban_tr(rng))
        assert ids.is_valid_card_number(fake.fake_card_number(rng))
        assert fake.fake_mobile(rng).startswith("+905")
    assert fake.email_local_part("Şule Nur", "Öztürk") == "sulenur.ozturk"


def test_people_are_internally_consistent() -> None:
    rows = generate_people(400, 21)
    assert len({row["tckn"] for row in rows}) == 400
    assert len({row["eposta"] for row in rows}) == 400
    for row in rows:
        assert geo.is_district_of(row["ilce"], row["plaka"]), row
        assert geo.province(row["plaka"])["ad"] == row["il"]
        assert geo.postal_code_matches_province(row["posta_kodu"], row["plaka"])
        local, domain = row["eposta"].split("@")
        assert local.startswith(fake.email_local_part(row["ad"], row["soyad"]))
        assert domain in fake.EMAIL_DOMAINS
        assert 18 <= age_on(row["dogum_tarihi"], REFERENCE_DATE) <= 90
    assert Counter(row["cinsiyet"] for row in rows)["K"] in range(160, 241)


def test_companies_are_internally_consistent() -> None:
    banks = set(fake.bank_codes())
    for row in generate_companies(150, 8):
        assert row["unvan"].endswith(row["tur"])
        assert ids.is_valid_vkn(row["vkn"])
        assert ids.is_valid_iban_tr(row["iban"]) and row["iban"][4:9] in banks
        area_code = int(row["telefon"][3:6])
        assert area_code in geo.province(row["plaka"])["alan_kodlari"]


@pytest.fixture(scope="module")
def shop() -> Tables:
    return generate_commerce(150, 99)


def test_commerce_referential_integrity(shop: Tables) -> None:
    customers = {row["musteri_id"]: row for row in shop["musteriler"]}
    products = {row["urun_id"] for row in shop["urunler"]}
    orders = {row["siparis_id"]: row for row in shop["siparisler"]}
    items = {row["kalem_id"]: row for row in shop["siparis_kalemleri"]}
    for order in orders.values():
        customer = customers[order["musteri_id"]]
        assert customer["kayit_tarihi"] <= datetime.fromisoformat(order["siparis_zamani"]).date()
    for item in items.values():
        assert item["siparis_id"] in orders and item["urun_id"] in products
    for refund in shop["iadeler"]:
        item = items[refund["kalem_id"]]
        order = orders[refund["siparis_id"]]
        assert item["siparis_id"] == refund["siparis_id"]
        assert order["durum"] in ("iade_edildi", "kismi_iade")
        assert refund["adet"] <= item["adet"]
        assert refund["iade_tarihi"] > order["teslim_tarihi"]
        assert refund["tutar"] == item["birim_fiyat"] * refund["adet"]
    times = [row["siparis_zamani"] for row in shop["siparisler"]]
    assert times == sorted(times), "sipariş numaraları zamanla artmalı"


def test_commerce_amounts_add_up(shop: Tables) -> None:
    cfg = CommerceConfig()
    lines: dict[str, list[dict[str, object]]] = {}
    for item in shop["siparis_kalemleri"]:
        lines.setdefault(item["siparis_id"], []).append(item)
        assert item["tutar"] == item["birim_fiyat"] * item["adet"]
        assert item["birim_fiyat"] <= item["liste_fiyati"]
    for order in shop["siparisler"]:
        own = lines[order["siparis_id"]]
        subtotal = sum((Decimal(str(line["tutar"])) for line in own), Decimal(0))
        assert order["ara_toplam"] == subtotal
        assert order["toplam"] == order["ara_toplam"] + order["kargo_ucreti"]
        free = order["ara_toplam"] >= cfg.ucretsiz_kargo_esigi
        assert order["kargo_ucreti"] == (Decimal("0.00") if free else cfg.kargo_ucreti)
        if order["durum"] == "iptal":
            assert order["teslim_tarihi"] is None
    statuses = Counter(row["durum"] for row in shop["siparisler"])
    assert statuses["teslim_edildi"] > statuses["kismi_iade"] > 0


def test_campaign_days_have_more_orders_than_ordinary_days(shop: Tables) -> None:
    cfg = CommerceConfig()
    per_day = Counter(row["siparis_zamani"][:10] for row in shop["siparisler"])
    days = [
        date(2025, 1, 1).fromordinal(n)
        for n in range(date(2025, 1, 1).toordinal(), date(2025, 12, 31).toordinal() + 1)
    ]
    campaign = [per_day[d.isoformat()] for d in days if cfg.campaign_on(d)]
    ordinary = [per_day[d.isoformat()] for d in days if not cfg.campaign_on(d)]
    assert sum(campaign) / len(campaign) > 2 * sum(ordinary) / len(ordinary)


def test_invoices_match_orders_and_vat(shop: Tables) -> None:
    result = invoices_from_commerce(shop)
    orders = {row["siparis_id"]: row for row in shop["siparisler"]}
    by_invoice: dict[str, list[dict[str, object]]] = {}
    for line in result["fatura_kalemleri"]:
        by_invoice.setdefault(str(line["fatura_no"]), []).append(line)
        assert line["matrah"] + line["kdv_tutari"] == line["tutar"]
        expected_vat = line["matrah"] * Decimal(line["kdv_orani"]) / 100
        assert abs(line["kdv_tutari"] - expected_vat) <= Decimal("0.01")
    assert len(result["faturalar"]) == sum(o["durum"] != "iptal" for o in orders.values())
    for invoice in result["faturalar"]:
        assert invoice["genel_toplam"] == orders[invoice["siparis_id"]]["toplam"]
        own = by_invoice[invoice["fatura_no"]]
        assert invoice["matrah"] + invoice["kdv_tutari"] == invoice["genel_toplam"]
        assert sum(Decimal(str(line["tutar"])) for line in own) == invoice["genel_toplam"]
        assert invoice["yazi_ile"] == "Yalnız " + amount_to_words(invoice["genel_toplam"])
        assert len(invoice["fatura_no"]) == 16


def test_vat_split_and_configurable_rates() -> None:
    assert split_vat(Decimal("120.00"), 20) == (Decimal("100.00"), Decimal("20.00"))
    assert split_vat(Decimal("0.01"), 20) == (Decimal("0.01"), Decimal("0.00"))
    custom = CommerceConfig(kdv_oranlari={"dusuk": 1, "indirimli": 8, "genel": 18})
    tables = generate_commerce(40, 3, config=custom)
    assert {row["kdv_orani"] for row in tables["urunler"]} <= {1, 8, 18}
    lines = invoices_from_commerce(tables, custom)["fatura_kalemleri"]
    assert {line["kdv_orani"] for line in lines} <= {1, 8, 18}


def test_bank_balances_are_consistent() -> None:
    tables = generate_banking(8, 4, months=6)
    opening = {row["hesap_id"]: row["acilis_bakiyesi"] for row in tables["hesaplar"]}
    for account in tables["hesaplar"]:
        assert ids.is_valid_iban_tr(account["iban"])
    balance = dict(opening)
    previous_time: dict[str, str] = {}
    for row in tables["hareketler"]:
        account = row["hesap_id"]
        balance[account] += row["tutar"]
        assert row["bakiye"] == balance[account] and row["bakiye"] >= 0
        assert row["zaman"] >= previous_time.get(account, "")
        previous_time[account] = row["zaman"]
        assert (row["tutar"] > 0) == (row["tur"] in ("maas", "eft_gelen"))
    kinds = Counter(row["tur"] for row in tables["hareketler"])
    assert kinds["maas"] == 8 * 6
