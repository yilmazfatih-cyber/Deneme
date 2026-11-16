"""Kişisel veri bulma ve maskeleme: sağlama denetimi, bağlam, yöntemler, tutarlı takma ad."""

from __future__ import annotations

import pytest

from verihavuzu import ids
from verihavuzu.kalite import pii
from verihavuzu.sentetik.people import generate_people

KEY = b"0123456789abcdef0123456789abcdef"


def _kinds(text: str) -> list[str]:
    return [f.tur for f in pii.find_pii(text)]


def test_detects_valid_values_and_ignores_invalid_checksums() -> None:
    text = (
        "TCKN 10000000146, yanlış 10000000147; IBAN TR33 0006 1005 1978 6457 8413 26; "
        "e-posta ali.veli@ornek.example; kart 4111 1111 1111 1111; yanlış kart 4111 1111 1111 1112; "
        "tel 0532 123 45 67; ev (0312) 444 12 34"
    )
    assert _kinds(text) == ["tckn", "iban", "eposta", "kart_no", "telefon", "telefon"]


def test_vkn_needs_context_in_free_text_but_not_as_whole_cell() -> None:
    assert _kinds("vergi no: 4540536920") == ["vkn"]
    assert "vkn" not in _kinds("sipariş 4540536920 tamam")
    masked, counts = pii.mask_rows([{"vkn": "4540536920", "not": "kod 4540536920"}], "sil")
    assert masked[0]["vkn"] == "[VKN]"
    assert counts["vkn"] == {"vkn": 1}


def test_phone_normalization() -> None:
    assert pii.normalize_phone("0532 123 45 67") == "+905321234567"
    assert pii.normalize_phone("+90 (312) 444 12 34") == "+903124441234"
    assert pii.normalize_phone("0090 216 555 66 77") == "+902165556677"
    assert pii.normalize_phone("0999 123 45 67") is None  # 999 alan kodu yok


def test_mask_methods() -> None:
    text = "TCKN 10000000146 ve e-posta ali@ornek.example"
    assert pii.mask_text(text, "sil")[0] == "TCKN [TCKN] ve e-posta [EPOSTA]"
    assert pii.mask_text(text, "maskele")[0] == "TCKN •••••••••46 ve e-posta a•••@ornek.example"
    with pytest.raises(ValueError, match=pii.KEY_ENV):
        pii.mask_text(text, "takma_ad")


def test_pseudonyms_are_consistent_and_key_dependent() -> None:
    pseudo = pii.Pseudonymizer(KEY)
    other = pii.Pseudonymizer(b"another-secret-key-of-32-bytes!!")
    first = pii.mask_text("10000000146", "takma_ad", pseudo)[0]
    assert first == pii.mask_text("TCKN: 10000000146", "takma_ad", pseudo)[0].split(": ")[1]
    assert first != pii.mask_text("10000000146", "takma_ad", other)[0]
    # Telefonun farklı yazımları aynı takma adı alır (önce normalleştirilir).
    a = pii.mask_text("0532 123 45 67", "takma_ad", pseudo)[0]
    b = pii.mask_text("+90 532 123 45 67", "takma_ad", pseudo)[0]
    assert a == b and a.startswith("[TELEFON-")
    with pytest.raises(ValueError, match="16 bayt"):
        pii.Pseudonymizer(b"kisa")


def test_format_preserving_pseudonyms_are_valid() -> None:
    pseudo = pii.Pseudonymizer(KEY)
    people = generate_people(60, 5)
    masked, counts = pii.mask_rows(people, "bicimli", pseudo, columns=["tckn", "telefon", "eposta"])
    assert counts == {"tckn": {"tckn": 60}, "telefon": {"telefon": 60}, "eposta": {"eposta": 60}}
    for original, row in zip(people, masked, strict=True):
        assert row["tckn"] != original["tckn"] and ids.is_valid_tckn(row["tckn"])
        assert row["telefon"].startswith("+905") and len(row["telefon"]) == 13
        assert row["eposta"].endswith("@ornek.example")
        assert row["ad"] == original["ad"]  # seçilmeyen sütuna dokunulmaz
    again, _ = pii.mask_rows(people, "bicimli", pseudo, columns=["tckn"])
    assert [r["tckn"] for r in again] == [r["tckn"] for r in masked]
    iban = pii.mask_text("TR330006100519786457841326", "bicimli", pseudo)[0]
    assert ids.is_valid_iban_tr(iban) and iban[4:9] == "00061"  # banka kodu korunur


def test_scan_counts_columns_without_changing_rows() -> None:
    people = generate_people(30, 6)
    counts = pii.scan_rows(people)
    assert counts["tckn"] == {"tckn": 30}
    assert counts["eposta"] == {"eposta": 30}
    assert "ad" not in counts and "il" not in counts
