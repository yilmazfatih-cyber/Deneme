"""Tekil değer denetimleri: her denetimin en az bir geçerli ve bir geçersiz örneği (kural testi
``tests/test_rules.py`` her ``VALIDATORS`` anahtarının burada örneği olduğunu denetler)."""

from __future__ import annotations

import pytest

from verihavuzu.kalite.validators import validate

EXAMPLES: dict[str, tuple[list[str], list[str]]] = {
    "tckn": (["10000000146"], ["10000000147", "0123"]),
    "vkn": (["4540536920"], ["4540536921"]),
    "iban": (["GB82WEST12345698765432", "TR330006100519786457841326"], ["GB82WEST12345698765433"]),
    "iban_tr": (["TR330006100519786457841326"], ["GB82WEST12345698765432"]),
    "kart_no": (["4111 1111 1111 1111"], ["4111 1111 1111 1112", "79927398713"]),
    "eposta": (["ali.veli@ornek.example"], ["ali@", "ali..veli@ornek.example", "ali veli@x.com"]),
    "telefon_tr": (["+903124441234", "+905321234567"], ["05321234567", "+9053212345"]),
    "cep_tr": (["+905321234567"], ["+903124441234"]),
    "posta_kodu": (["34710", "06420"], ["82000", "3471"]),
    "plaka": (["6", "06", "81"], ["0", "82", "a"]),
    "il": (["İstanbul", "istanbul", "Hakkâri", "İçel"], ["Atlantis"]),
}


@pytest.mark.parametrize("kind", sorted(EXAMPLES))
def test_validator_examples(kind: str) -> None:
    valid, invalid = EXAMPLES[kind]
    assert all(validate(kind, value) for value in valid), kind
    assert not any(validate(kind, value) for value in invalid), kind


def test_unknown_validator_names_options() -> None:
    with pytest.raises(KeyError, match="Seçenekler"):
        validate("yok", "x")
