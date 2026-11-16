"""ChaCha20/Poly1305/AEAD: RFC 8439 vektörleri + `cryptography` ile farksal test; DH ve RSA
gösterimi.
"""

from __future__ import annotations

import math
import random

import pytest
from hypothesis import given
from hypothesis import strategies as st

from kripto_egitim.asymmetric import (
    dh_public,
    dh_shared,
    generate_prime,
    is_prime,
    mod_inverse,
    rsa_decrypt,
    rsa_encrypt,
    rsa_from_primes,
    rsa_sign,
    rsa_verify,
)
from kripto_egitim.chacha import (
    AuthenticationError,
    aead_decrypt,
    aead_encrypt,
    chacha20_block,
    chacha20_xor,
    poly1305_mac,
    quarter_round,
)

SUNSCREEN = (
    b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future,"
    b" sunscreen would be it."
)


def test_ceyrek_tur_rfc8439_2_1_1() -> None:
    result = quarter_round(0x11111111, 0x01020304, 0x9B8D6F43, 0x01234567)
    assert result == (0xEA2A92F4, 0xCB1CF8CE, 0x4581472E, 0x5881C4BB)


def test_blok_islevi_rfc8439_2_3_2() -> None:
    block = chacha20_block(bytes(range(32)), 1, bytes.fromhex("000000090000004a00000000"))
    assert block.hex() == (
        "10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e"
        "d2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e"
    )


def test_sifreleme_rfc8439_2_4_2() -> None:
    nonce = bytes.fromhex("000000000000004a00000000")
    ciphertext = chacha20_xor(bytes(range(32)), 1, nonce, SUNSCREEN)
    assert ciphertext.hex().startswith(
        "6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0b"
    )
    assert ciphertext.hex().endswith("5af90bbf74a35be6b40b8eedf2785e42874d")
    assert chacha20_xor(bytes(range(32)), 1, nonce, ciphertext) == SUNSCREEN


def test_poly1305_rfc8439_2_5_2() -> None:
    key = bytes.fromhex("85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b")
    tag = poly1305_mac(b"Cryptographic Forum Research Group", key)
    assert tag.hex() == "a8061dc1305136c6c22b8baf0c0127a9"


def test_aead_rfc8439_2_8_2() -> None:
    key = bytes(range(0x80, 0xA0))
    nonce = bytes.fromhex("070000004041424344454647")
    aad = bytes.fromhex("50515253c0c1c2c3c4c5c6c7")
    ciphertext, tag = aead_encrypt(key, nonce, SUNSCREEN, aad)
    assert tag.hex() == "1ae10b594f09e26a7e902ecbd0600691"
    assert ciphertext.hex().startswith(
        "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6"
    )
    assert aead_decrypt(key, nonce, ciphertext, tag, aad) == SUNSCREEN


@given(
    st.binary(min_size=32, max_size=32),
    st.binary(min_size=12, max_size=12),
    st.binary(max_size=150),
)
def test_aead_cryptography_paketiyle_ayni(key: bytes, nonce: bytes, plaintext: bytes) -> None:
    aead = pytest.importorskip("cryptography.hazmat.primitives.ciphers.aead")
    ciphertext, tag = aead_encrypt(key, nonce, plaintext, b"ek-veri")
    assert ciphertext + tag == aead.ChaCha20Poly1305(key).encrypt(nonce, plaintext, b"ek-veri")


def test_degistirilen_bayt_ya_da_ek_veri_yakalanir() -> None:
    key, nonce = bytes(32), bytes(12)
    ciphertext, tag = aead_encrypt(key, nonce, b"gizli not", b"kullanici=7")
    flipped = bytes([ciphertext[0] ^ 1]) + ciphertext[1:]
    with pytest.raises(AuthenticationError):
        aead_decrypt(key, nonce, flipped, tag, b"kullanici=7")
    with pytest.raises(AuthenticationError):
        aead_decrypt(key, nonce, ciphertext, tag, b"kullanici=8")


def test_nonce_yinelenirse_xor_sizar() -> None:
    """Aynı nonce iki iletide kullanılırsa c1 ⊕ c2 = m1 ⊕ m2 olur: anahtarsız bilgi sızar."""
    key, nonce = bytes(32), bytes(12)
    m1, m2 = b"saldiri yarin", b"saldiri bugun"
    c1, _ = aead_encrypt(key, nonce, m1)
    c2, _ = aead_encrypt(key, nonce, m2)
    leak = bytes(a ^ b for a, b in zip(c1, c2, strict=True))
    assert leak == bytes(a ^ b for a, b in zip(m1, m2, strict=True))


def test_parametre_denetimleri() -> None:
    with pytest.raises(ValueError, match="32"):
        chacha20_block(b"kisa", 0, bytes(12))
    with pytest.raises(ValueError, match="taşar"):
        chacha20_xor(bytes(32), 2**32 - 1, bytes(12), bytes(65))


def test_miller_rabin_kaba_kuvvetle_ayni() -> None:
    def naive(n: int) -> bool:
        return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))

    assert [n for n in range(5000) if is_prime(n)] == [n for n in range(5000) if naive(n)]
    assert not is_prime(3215031751)  # 2, 3, 5, 7 tabanlarını kandıran güçlü sözde asal
    assert is_prime(2**61 - 1)


def test_tohumlu_asal_uretimi_belirlenimci() -> None:
    first = generate_prime(32, random.Random(7))
    assert first == generate_prime(32, random.Random(7))
    assert is_prime(first)
    assert first.bit_length() == 32


def test_rsa_ders_kitabi_ornegi() -> None:
    key = rsa_from_primes(61, 53, e=17)
    assert key.n == 3233
    assert key.d == 413  # λ(3233) = ekok(60, 52) = 780 ve 17·413 ≡ 1 (mod 780)
    assert rsa_encrypt(65, key) == 2790
    assert rsa_decrypt(2790, key) == 65
    signature = rsa_sign(42, key)
    assert rsa_verify(42, signature, key)
    assert not rsa_verify(43, signature, key)


def test_dolgusuz_rsa_degistirilebilir() -> None:
    """E(m1)·E(m2) = E(m1·m2): saldırgan şifreli metni anahtarsız değiştirebilir. Bu yüzden OAEP
    gerekir.
    """
    key = rsa_from_primes(1009, 1013, e=17)
    c1, c2 = rsa_encrypt(12, key), rsa_encrypt(34, key)
    assert rsa_decrypt(c1 * c2 % key.n, key) == 12 * 34


def test_mod_ters_ve_hatalar() -> None:
    assert 17 * mod_inverse(17, 780) % 780 == 1
    with pytest.raises(ValueError, match="tersi yok"):
        mod_inverse(6, 9)
    with pytest.raises(ValueError, match="farklı iki asal"):
        rsa_from_primes(61, 61)


def test_diffie_hellman_iki_taraf_ayni_sirra_ulasir() -> None:
    p, g = 23, 5
    alice_public = dh_public(4, g, p)
    bob_public = dh_public(3, g, p)
    assert (alice_public, bob_public) == (4, 10)
    assert dh_shared(bob_public, 4, p) == dh_shared(alice_public, 3, p) == 18


def test_dh_gecersiz_acik_deger_reddedilir() -> None:
    for bad in (0, 1, 22, 23):
        with pytest.raises(ValueError, match="geçersiz"):
            dh_shared(bad, 4, 23)
