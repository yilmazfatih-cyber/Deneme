"""Uydurma kimlik numaraları: TCKN, VKN, IBAN, telefon, e-posta, posta kodu, kart numarası.

Hepsinin BİÇİMİ ve SAĞLAMASI geçerlidir, içeriği rastgeledir. Rastgele seçildikleri için gerçek
bir numarayla tesadüfen çakışabilirler; asla birini tanımlamak için kullanmayın.
E-posta alan adları RFC 2606/6761 ile ayrılmış uzantılardadır (.example, .test): gerçek bir
posta kutusuna ulaşamazlar. Sağlama algoritmaları ``verihavuzu/ids.py``dedir.
Genişletme: yeni bir numara türü için ``fake_x(rng)`` işlevi ekleyin ve ``tests/test_sentetik.py``
içinde üretilenlerin denetimden geçtiğini sınayın.
"""

from __future__ import annotations

from collections.abc import Callable

from verihavuzu import ids
from verihavuzu.reference import load
from verihavuzu.sentetik.base import Rng
from verihavuzu.text import fold_ascii, lower_tr

EMAIL_DOMAINS = ("ornek.example", "posta.example", "eposta.test", "kurum.example")
TEST_CARD_PREFIXES = ("4", "5")  # yalnız biçim için; kart ağı iddiası yoktur


def fake_tckn(rng: Rng) -> str:
    """Sağlaması geçerli, uydurma 11 haneli T.C. kimlik numarası."""
    first9 = str(rng.randint(1, 9)) + rng.digits(8)
    return first9 + ids.tckn_check_digits(first9)


def fake_vkn(rng: Rng) -> str:
    """Sağlaması geçerli, uydurma 10 haneli vergi kimlik numarası."""
    first9 = rng.digits(9)
    return first9 + ids.vkn_check_digit(first9)


def bank_codes() -> list[str]:
    """``tr/banka_kodlari.json`` içindeki 5 haneli banka kodları."""
    return [row["kod"] for row in load("banka_kodlari")]


def fake_iban_tr(rng: Rng, bank_code: str | None = None) -> str:
    """Mod 97 sağlaması geçerli TR IBAN'ı: TR + 2 sağlama + 5 banka + "0" + 16 hesap hanesi."""
    code = bank_code or rng.choice(bank_codes())
    bban = code + "0" + rng.digits(16)
    return "TR" + ids.iban_check_digits("TR", bban) + bban


def fake_mobile(rng: Rng) -> str:
    """Cep telefonu biçiminde numara: +905XXXXXXXXX (operatör bilgisi taşımaz)."""
    return "+905" + rng.choice("0345") + rng.digits(8)


def fake_landline(rng: Rng, area_code: int) -> str:
    """Verilen alan koduyla sabit hat biçiminde numara: +90AAAXXXXXXX."""
    return f"+90{area_code}" + str(rng.randint(2, 9)) + rng.digits(6)


def email_local_part(first_name: str, last_name: str) -> str:
    """ "Şule Öztürk" → "sule.ozturk" (Türkçe harfler ASCII'ye indirgenir, boşluk atılır)."""

    def clean(text: str) -> str:
        return "".join(ch for ch in fold_ascii(lower_tr(text)) if ch.isalnum())

    return f"{clean(first_name)}.{clean(last_name)}"


def fake_email(rng: Rng, first_name: str, last_name: str) -> str:
    """Ada dayalı, ayrılmış alan adında e-posta: ``sule.ozturk42@ornek.example``."""
    local = email_local_part(first_name, last_name)
    if rng.bernoulli(0.6):
        local += str(rng.randint(1, 99))
    return f"{local}@{rng.choice(EMAIL_DOMAINS)}"


def fake_postal_code(rng: Rng, plate: int) -> str:
    """İlk iki hanesi plaka kodu olan 5 haneli posta kodu (kalan haneler rastgele)."""
    return f"{plate:02d}" + rng.digits(3)


def fake_card_number(rng: Rng, length: int = 16) -> str:
    """Luhn sağlaması geçerli, uydurma kart numarası (yalnız maskeleme testleri için)."""
    body = rng.choice(TEST_CARD_PREFIXES) + rng.digits(length - 2)
    return body + ids.luhn_check_digit(body)


class UniqueValues:
    """Aynı değerin iki kez üretilmesini engeller (ör. iki kişiye aynı TCKN düşmesin)."""

    def __init__(self) -> None:
        self.seen: set[str] = set()

    def take(self, make: Callable[[], str]) -> str:
        """``make`` işlevini yeni bir değer bulana dek çağırır (en çok 1000 deneme)."""
        for _ in range(1000):
            value = make()
            if value not in self.seen:
                self.seen.add(value)
                return value
        raise RuntimeError("Benzersiz değer üretilemedi; değer uzayı tükenmiş olabilir.")
