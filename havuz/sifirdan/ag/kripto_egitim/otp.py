"""HOTP (RFC 4226) ve TOTP (RFC 6238): iki aşamalı doğrulama kodları — sıfırdan.

Akış:
    kayıt:  sunucu gizli anahtar üretir → `otpauth://` adresi (QR) → doğrulayıcı uygulama
    giriş:  uygulama HOTP(anahtar, ⌊zaman / 30⌋) üretir → sunucu aynısını hesaplar, sabit
            zamanda karşılaştırır
HOTP: HMAC-SHA1(anahtar, sayaç) → "dinamik kesme" (son baytın alt 4 biti konum) → 31 bit → mod
10^basamak.
Güvenlik: aynı zaman diliminde kodun ikinci kez kullanılmasını engellemek için `verify_totp` eşleşen
sayacı döndürür; çağıran onu saklayıp bir sonraki doğrulamada `last_used_counter` olarak verir
(yeniden oynatma koruması).
EĞİTSELDİR: üretimde aynı algoritma `hmac`/`hashlib` ile yazılır; deneme sayısı da sınırlanmalıdır
(6 haneli kod yalnız 10^6 olasılıktır).
Genişletme: SHA-256/512 için `digestmod=hashlib.sha256` verin; `otpauth_uri` içindeki `algorithm` da
değişmelidir.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from urllib.parse import quote, urlencode

from kripto_egitim.encoding import b32encode
from kripto_egitim.mac import HashFactory, constant_time_equal, hmac_digest
from kripto_egitim.sha import sha1


def hotp(key: bytes, counter: int, digits: int = 6, digestmod: HashFactory = sha1) -> str:
    """Sayaca dayalı tek kullanımlık parola."""
    if not 6 <= digits <= 9:
        raise ValueError("Basamak sayısı 6 ile 9 arasında olmalı.")
    if not 0 <= counter < 2**64:
        raise ValueError("Sayaç 64 bitlik işaretsiz bir tam sayı olmalı.")
    mac = hmac_digest(key, counter.to_bytes(8, "big"), digestmod)
    offset = mac[-1] & 0x0F  # dinamik kesme: konumu MAC'in kendisi seçer
    value = int.from_bytes(mac[offset : offset + 4], "big") & 0x7FFFFFFF  # işaret bitini at
    return str(value % 10**digits).zfill(digits)


def time_counter(at: float, step: int = 30, t0: int = 0) -> int:
    """Unix zamanından TOTP sayacı: ⌊(at − T0) / adım⌋."""
    if at < t0:
        raise ValueError("Zaman, başlangıç anından (T0) önce olamaz.")
    return int((at - t0) // step)


def totp(
    key: bytes,
    at: float,
    step: int = 30,
    t0: int = 0,
    digits: int = 6,
    digestmod: HashFactory = sha1,
) -> str:
    """Zamana dayalı tek kullanımlık parola. `at`: Unix zamanı (saniye); testte sabit verilir."""
    return hotp(key, time_counter(at, step, t0), digits, digestmod)


def verify_totp(
    key: bytes,
    code: str,
    at: float,
    *,
    window: int = 1,
    step: int = 30,
    digits: int = 6,
    digestmod: HashFactory = sha1,
    last_used_counter: int | None = None,
) -> int | None:
    """Kodu doğrular; eşleşen sayacı (saklanmak üzere) ya da `None` döndürür.

    `window=1`: saat kayması için bir önceki ve bir sonraki dilim de kabul edilir. Tüm adaylar erken
    çıkmadan denenir; böylece hangi dilimin tuttuğu süreden anlaşılmaz.
    """
    candidate = code.replace(" ", "")
    if len(candidate) != digits or not candidate.isascii() or not candidate.isdigit():
        return None
    current = time_counter(at, step)
    matched: int | None = None
    for counter in range(max(0, current - window), current + window + 1):
        expected = hotp(key, counter, digits, digestmod)
        if constant_time_equal(expected.encode(), candidate.encode()) and matched is None:
            matched = counter
    if matched is not None and last_used_counter is not None and matched <= last_used_counter:
        return None  # aynı (ya da daha eski) dilimin kodu ikinci kez kullanılamaz
    return matched


def generate_secret(
    nbytes: int = 20, randbytes: Callable[[int], bytes] = secrets.token_bytes
) -> str:
    """RFC 4226'nın önerdiği 160 bitlik rastgele anahtar, Base32 (dolgusuz) olarak."""
    if nbytes < 16:
        raise ValueError("Anahtar en az 128 bit (16 bayt) olmalı.")
    return b32encode(randbytes(nbytes), pad=False)


def otpauth_uri(
    secret_b32: str,
    account: str,
    issuer: str,
    digits: int = 6,
    period: int = 30,
    algorithm: str = "SHA1",
) -> str:
    """Doğrulayıcı uygulamaların QR kodundan okuduğu adres (Google Authenticator "Key Uri Format").

    Etiket "Yayıncı:hesap" biçimindedir; her parça ayrı ayrı yüzde-kodlanır (Türkçe harfler UTF-8
    olarak).
    """
    if ":" in issuer or ":" in account:
        raise ValueError("Yayıncı ve hesap adı ':' içeremez (etiket ayracıdır).")
    label = f"{quote(issuer, safe='')}:{quote(account, safe='@')}"
    params = urlencode(
        {
            "secret": secret_b32,
            "issuer": issuer,
            "algorithm": algorithm,
            "digits": digits,
            "period": period,
        },
        quote_via=quote,
    )
    return f"otpauth://totp/{label}?{params}"
