"""Maskeleme / geri açma (Presidio ve GLiNER olmadan, yerleşik kural tarayıcısıyla)."""

from __future__ import annotations

from datetime import timedelta

import pytest

from aiplatform.db import session_scope
from aiplatform.kvkk import mask, scan, unmask
from aiplatform.kvkk.mask import (
    Masker,
    StreamUnmasker,
    load_mapping,
    mask_structure,
    purge_expired,
    unmask_structure,
)
from aiplatform.kvkk.models import MaskMapping, utcnow
from aiplatform.kvkk.recognizers import fallback_scan, scan_text
from aiplatform.kvkk.tckn import generate_valid_tckn, generate_valid_tr_iban

TCKN = generate_valid_tckn(101)
TCKN2 = generate_valid_tckn(202)
IBAN = generate_valid_tr_iban(303)
IBAN_SPACED = " ".join(IBAN[i : i + 4] for i in range(0, 26, 4))
PHONE = "+90 532 123 45 67"
EMAIL = "ayse.kaya@ornek-sirket.com.tr"
TEXT = (
    f"Müşteri TCKN {TCKN}, IBAN: {IBAN_SPACED}. Telefon {PHONE}, e-posta {EMAIL}. "
    f"Tekrar: {TCKN}. Eşinin numarası {TCKN2}."
)


def test_fallback_scan_scores():
    bad = TCKN[:-1] + str((int(TCKN[-1]) + 1) % 10)
    found = {f.text: f for f in fallback_scan(f"geçerli {TCKN} geçersiz {bad}")}
    assert found[TCKN].entity_type == "TR_TCKN" and found[TCKN].score == pytest.approx(0.95)
    assert found[bad].score == pytest.approx(0.1)


def test_scan_finds_all_types():
    findings, meta = scan_text(TEXT)
    types = [f.entity_type for f in findings]
    assert types.count("TR_TCKN") == 3
    assert "TR_IBAN" in types and "TR_PHONE" in types and "EMAIL_ADDRESS" in types
    assert meta["ner"] == "devre dışı"
    assert meta["engine"] in ("yerleşik", "presidio")


def test_phone_formats():
    for p in ("0532 123 45 67", "05321234567", "+905321234567", "0 (212) 555 11 22", "0212-555-11-22"):
        findings, _ = scan_text(f"Ara: {p} lütfen")
        assert [f.entity_type for f in findings] == ["TR_PHONE"], p


def test_plate_and_dob():
    findings, _ = scan_text("Araç 34 ABC 123, doğum tarihi: 12.03.1980, sözleşme tarihi 01.02.2024")
    types = {f.entity_type: f.text for f in findings}
    assert types["TR_PLATE"] == "34 ABC 123"
    assert types["DATE_OF_BIRTH"] == "12.03.1980"
    assert "01.02.2024" not in [f.text for f in findings]  # bağlamsız tarih kişisel veri sayılmaz


def test_mask_roundtrip():
    r = mask(TEXT)
    for secret in (TCKN, TCKN2, IBAN_SPACED, PHONE, EMAIL):
        assert secret not in r.masked_text
    assert r.masked_text.count("<TCKN_1>") == 2  # aynı değer aynı yer tutucu
    assert "<TCKN_2>" in r.masked_text
    for ph in ("<IBAN_1>", "<TELEFON_1>", "<EPOSTA_1>"):
        assert ph in r.masked_text
    assert r.count == 6
    assert all("text" not in f for f in r.findings)  # bulgular özgün değeri taşımaz
    assert unmask(r.masked_text, r.mapping_id) == TEXT
    # model yanıtında yer tutucular farklı sırada gelse de geri açılır
    assert unmask("Sayın <TCKN_2> ve <TCKN_1>", r.mapping_id) == f"Sayın {TCKN2} ve {TCKN}"


def test_mapping_is_encrypted_at_rest():
    pytest.importorskip("cryptography")
    r = mask(f"TCKN {TCKN}")
    with session_scope() as s:
        row = s.get(MaskMapping, r.mapping_id)
        assert row.encrypted is True
        assert TCKN not in row.mapping_json
    assert load_mapping(r.mapping_id)["placeholders"]["<TCKN_1>"] == TCKN


def test_mask_extends_existing_mapping():
    r1 = mask(f"A: {TCKN}")
    r2 = mask(f"B: {TCKN2} ve {TCKN}", mapping_id=r1.mapping_id)
    assert r2.mapping_id == r1.mapping_id
    assert r2.masked_text == "B: <TCKN_2> ve <TCKN_1>"


def test_unmask_unknown_mapping():
    with pytest.raises(KeyError):
        unmask("<TCKN_1>", "yok")


def test_purge_expired():
    r = mask(f"TCKN {TCKN}")
    with session_scope() as s:
        s.get(MaskMapping, r.mapping_id).created_at = utcnow() - timedelta(days=400)
    assert purge_expired() == 1
    assert load_mapping(r.mapping_id) is None


def test_scan_api_and_entities_filter():
    out = scan(TEXT, entities=["EMAIL_ADDRESS"])
    assert [f["entity_type"] for f in out["findings"]] == ["EMAIL_ADDRESS"]
    with_text = scan(TEXT, include_text=True)
    assert any(f.get("text") == EMAIL for f in with_text["findings"])


def test_structure_and_stream_unmask():
    m = Masker()
    payload = {
        "messages": [{"role": "user", "content": f"Benim TCKN {TCKN}"}],
        "style": "kisa",
        "image": "QUJD" * 200,
        "n": 3,
    }
    masked = mask_structure(payload, m)
    assert TCKN not in str(masked) and masked["image"] == payload["image"] and masked["n"] == 3
    assert unmask_structure(masked, m.placeholders) == payload

    su = StreamUnmasker(m.placeholders)
    out = su.feed("Kimlik: <TC") + su.feed("KN_1> doğrulandı") + su.flush()
    assert out == f"Kimlik: {TCKN} doğrulandı"
