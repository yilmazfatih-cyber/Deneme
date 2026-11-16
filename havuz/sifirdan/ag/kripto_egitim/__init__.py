"""kripto_egitim — EĞİTSELDİR; üretimde stdlib/platform kriptosu kullanılır.

Sıfırdan yazılmış SHA-256/SHA-1, HMAC, PBKDF2, HKDF, Base64/Base32, HOTP/TOTP, JWT HS256,
ChaCha20-Poly1305 ve küçük sayılarla DH/RSA gösterimi. Her biri testte `hashlib`/`hmac`/`base64` ve
RFC sınama vektörleriyle karşılaştırılır.
Genişletme: yeni bir yapı taşı için ayrı bir dosya açın, burada dışa aktarın, `tests/kripto_egitim/`
altına başvuru gerçeklemesiyle farksal test yazın.
"""

from kripto_egitim.chacha import AuthenticationError, aead_decrypt, aead_encrypt
from kripto_egitim.encoding import b32decode, b32encode, b64decode, b64encode
from kripto_egitim.jwt import JwtError, sign_hs256, verify_hs256
from kripto_egitim.kdf import hkdf, pbkdf2_hmac
from kripto_egitim.mac import Hmac, constant_time_equal, hmac_digest
from kripto_egitim.otp import generate_secret, hotp, otpauth_uri, totp, verify_totp
from kripto_egitim.sha import sha1, sha256

__all__ = [
    "AuthenticationError",
    "Hmac",
    "JwtError",
    "aead_decrypt",
    "aead_encrypt",
    "b32decode",
    "b32encode",
    "b64decode",
    "b64encode",
    "constant_time_equal",
    "generate_secret",
    "hkdf",
    "hmac_digest",
    "hotp",
    "otpauth_uri",
    "pbkdf2_hmac",
    "sha1",
    "sha256",
    "sign_hs256",
    "totp",
    "verify_hs256",
    "verify_totp",
]
