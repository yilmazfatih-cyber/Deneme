"""Küçük sayılarla Diffie-Hellman ve "ders kitabı" RSA — YALNIZ ÖĞRETİM İÇİN.

Diffie-Hellman: herkesin bildiği (p, g); Ayşe gizli a seçip A = g^a mod p yollar, Burak gizli b
seçip B = g^b mod p yollar; ikisi de s = B^a = A^b = g^(ab) mod p sırrına ulaşır. Dinleyen yalnız A
ve B'yi görür.
RSA: n = p·q; e·d ≡ 1 (mod λ(n)); şifreleme c = m^e mod n, çözme m = c^d mod n.
Neden üretimde KULLANILMAZ: sayılar küçük (anında çarpanlarına ayrılır); dolgusuz RSA
belirlenimcidir (aynı ileti → aynı şifreli metin) ve "değiştirilebilir"dir (E(m1)·E(m2) = E(m1·m2));
DH kimlik doğrulamasızsa ortadaki adam saldırısına açıktır. Üretimde X25519 / Ed25519 / RSA-OAEP /
RSA-PSS kullanan bir kitaplık seçilir.
Genişletme: Miller-Rabin tabanları sabittir (n < 3.3·10^24 için kesin); daha büyük sayılar için
rastgele taban ekleyin.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

# Bu tabanlarla Miller-Rabin, n < 3.317·10^24 için kesin sonuç verir (bilinen sonuç; testte kaba
# kuvvetle sınanır).
_MR_BASES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
_MR_LIMIT = 3_317_044_064_679_887_385_961_981


def mod_inverse(a: int, m: int) -> int:
    """a·x ≡ 1 (mod m) olan x; genişletilmiş Öklid algoritmasıyla."""
    old_r, r = a % m, m
    old_s, s = 1, 0
    while r:
        quotient = old_r // r
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
    if old_r != 1:
        raise ValueError(f"{a} sayısının mod {m} tersi yok (ortak bölen {old_r}).")
    return old_s % m


def is_prime(n: int) -> bool:
    """Miller-Rabin (sabit tabanlarla, belirlenimci). Gösterim için yalnız küçük sayılar."""
    if n > _MR_LIMIT:
        raise ValueError("Bu gösterim yalnız 3.3·10^24'ten küçük sayılar için kesindir.")
    if n < 2:
        return False
    for p in _MR_BASES:
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d, s = d // 2, s + 1
    for base in _MR_BASES:
        x = pow(base, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


def generate_prime(bits: int, rng: random.Random) -> int:
    """Tohumlu üreteçle `bits` bitlik asal (gösterim; gerçek anahtar için `secrets` + büyük bit
    sayısı gerekir).
    """
    if not 8 <= bits <= 80:
        raise ValueError("Gösterim için 8–80 bitlik asallar desteklenir.")
    while True:
        candidate = (
            rng.getrandbits(bits) | (1 << (bits - 1)) | 1
        )  # en üst bit (uzunluk) ve tek sayı
        if is_prime(candidate):
            return candidate


@dataclass(frozen=True)
class RsaKey:
    n: int
    e: int
    d: int
    p: int
    q: int


def rsa_from_primes(p: int, q: int, e: int = 65537) -> RsaKey:
    """İki asaldan anahtar. d, Carmichael λ(n) = ekok(p−1, q−1) modülünde e'nin tersidir."""
    if p == q or not (is_prime(p) and is_prime(q)):
        raise ValueError("p ve q farklı iki asal olmalı.")
    carmichael = math.lcm(p - 1, q - 1)
    if math.gcd(e, carmichael) != 1:
        raise ValueError("e, λ(n) ile aralarında asal olmalı; başka bir e seçin.")
    return RsaKey(n=p * q, e=e, d=mod_inverse(e, carmichael), p=p, q=q)


def rsa_encrypt(message: int, key: RsaKey) -> int:
    """Ders kitabı RSA şifreleme (dolgusuz!). 0 ≤ m < n olmalı."""
    if not 0 <= message < key.n:
        raise ValueError("İleti 0 ile n−1 arasında olmalı.")
    return pow(message, key.e, key.n)


def rsa_decrypt(ciphertext: int, key: RsaKey) -> int:
    return pow(ciphertext, key.d, key.n)


def rsa_sign(message: int, key: RsaKey) -> int:
    """Ders kitabı imza: s = m^d mod n (gerçekte özet + PSS dolgusu imzalanır)."""
    return pow(message, key.d, key.n)


def rsa_verify(message: int, signature: int, key: RsaKey) -> bool:
    return pow(signature, key.e, key.n) == message % key.n


def dh_public(private: int, g: int, p: int) -> int:
    """Açık değer A = g^a mod p."""
    if not 1 < private < p - 1:
        raise ValueError("Gizli üs 2 ile p−2 arasında olmalı.")
    return pow(g, private, p)


def dh_shared(other_public: int, private: int, p: int) -> int:
    """Ortak sır s = B^a mod p. Karşı tarafın değeri denetlenir: 0, 1 ve p−1 sırrı tahmin edilebilir
    kılar.
    """
    if not 1 < other_public < p - 1:
        raise ValueError("Karşı tarafın açık değeri geçersiz (küçük alt grup saldırısı).")
    return pow(other_public, private, p)
