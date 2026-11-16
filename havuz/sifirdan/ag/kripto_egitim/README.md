**Eğitseldir; üretimde stdlib/platform kriptosu kullanılır** (`hashlib`, `hmac`, `secrets`, `ssl`, `cryptography`).

# kripto_egitim — kriptonun yapı taşları, sıfırdan

Web'de her gün kullandığımız güvenlik parçalarının (parola özeti, oturum imzası, iki aşamalı doğrulama kodu, JWT,
modern şifreleme) içeride nasıl çalıştığını gösteren, baştan sona okunabilir Python. Her parça testte standart
kitaplıkla (`hashlib`, `hmac`, `base64`) ve RFC sınama vektörleriyle birebir karşılaştırılır.

## Ne var

| Parça                        | Dosya           | Doğrulandığı kaynak                                            |
| ---------------------------- | --------------- | -------------------------------------------------------------- |
| SHA-256, SHA-1               | `sha.py`        | FIPS 180-4 örnekleri + `hashlib` (rastgele girdilerle)          |
| HMAC, sabit zamanlı karşılaştırma | `mac.py`   | RFC 4231 vaka 2 + `hmac.digest` (SHA-1/256/512)                 |
| PBKDF2, HKDF                 | `kdf.py`        | RFC 6070, RFC 7914 §11, RFC 5869 vaka 1 ve 3 + `hashlib.pbkdf2_hmac` |
| Base64, Base32 (sıkı)        | `encoding.py`   | RFC 4648 §10 + `base64` modülü                                  |
| HOTP, TOTP, `otpauth://`     | `otp.py`        | RFC 4226 Ek D, RFC 6238 Ek B (SHA-1/256/512)                    |
| JWT HS256                    | `jwt.py`        | RFC 7515 Ek A.1 + `hmac` ile bağımsız imza                      |
| ChaCha20, Poly1305, AEAD     | `chacha.py`     | RFC 8439 §2.1.1, 2.3.2, 2.4.2, 2.5.2, 2.8.2 + `cryptography` paketi |
| Diffie-Hellman, RSA (küçük)  | `asymmetric.py` | ders kitabı örnekleri; Miller-Rabin kaba kuvvetle               |

## 5 dakikada deneme

```bash
python -m kripto_egitim ozet "merhaba"                          # sıfırdan SHA-256 ile hashlib yan yana
python -m kripto_egitim gizli-uret --hesap ayse@ornek.test --yayinci "Köprü"
python -m kripto_egitim totp --gizli JBSWY3DPEHPK3PXP           # şu anki 6 haneli kod
```

## Nasıl çalışır

```
HMAC(K, m)   = SHA256((K ⊕ 0x5c…) ‖ SHA256((K ⊕ 0x36…) ‖ m))
HOTP(K, c)   = HMAC-SHA1(K, c) → son baytın alt 4 biti = konum → 4 bayt → 31 bit → mod 10^6
TOTP(K, t)   = HOTP(K, ⌊t / 30⌋)
JWT          = b64url(başlık) "." b64url(gövde) "." b64url(HMAC-SHA256(K, "başlık.gövde"))
AEAD         = ChaCha20(K, nonce, sayaç=1) ⊕ metin;  etiket = Poly1305(ChaCha20(K, nonce, 0)[:32], ek ‖ şifreli ‖ uzunluklar)
```

İki aşamalı doğrulama akışı:

```
kayıt  : sunucu  ──generate_secret()──▶ gizli anahtar ──otpauth_uri()──▶ QR ──▶ telefon uygulaması
giriş  : telefon ──totp(anahtar, şimdi)──▶ "492039" ──▶ sunucu: verify_totp(…, last_used_counter)
                                                            └─ eşleşen sayacı saklar (aynı kod 2. kez geçmez)
```

## Saldırı yüzeyi ve alınan önlem

| Saldırı                                            | Önlem                                                     | Testi                                                   |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Zamanlamayla imza tahmini                          | `constant_time_equal` (erken çıkış yok)                   | `test_sabit_zamanli_karsilastirma`                      |
| JWT `alg: none` (imzasız belirteç)                 | boş imza ve `alg ≠ HS256` reddi                           | `test_none_algoritmasi_reddedilir`                      |
| JWT algoritma karışıklığı (RS256 ↔ HS256)          | `alg` tam olarak "HS256" olmalı; sunucu sabitler          | `test_algoritma_karisikligi_reddedilir`                 |
| JWT ayrıştırıcı farkı (yinelenen anahtar, NaN)     | `object_pairs_hook`, `parse_constant`                     | `test_yinelenen_anahtar_ve_nan_reddedilir`              |
| JWT imza değiştirilebilirliği (kanonik olmayan b64) | sıkı base64url çözücü                                    | `test_kanonik_olmayan_imza_yazilisi_reddedilir`         |
| Süresi dolmuş / başka hizmetin belirteci           | `exp`, `nbf`, `iat`, `aud`, `iss` denetimi                | `test_talep_denetimleri`, `test_izleyici_listesi_…`     |
| Kısa HMAC anahtarı                                 | HS256 için en az 32 bayt                                  | `test_kisa_anahtar_reddedilir`                          |
| TOTP kodunun yeniden oynatılması                   | `last_used_counter`                                       | `test_ayni_kod_ikinci_kez_kullanilamaz`                 |
| Unicode rakamlarla kod (`١٢٣٤٥٦`)                  | yalnız ASCII rakam                                        | `test_bicimsiz_kod_reddedilir`                          |
| AEAD şifreli metni/ek veriyi değiştirme            | önce etiket doğrulanır, sonra çözülür                     | `test_degistirilen_bayt_ya_da_ek_veri_yakalanir`        |
| Nonce yinelemesi                                   | belgelendi; sızıntı testle gösterilir                     | `test_nonce_yinelenirse_xor_sizar`                      |
| Dolgusuz RSA'nın değiştirilebilirliği              | belgelendi; gösterim testi                                | `test_dolgusuz_rsa_degistirilebilir`                    |
| DH küçük alt grup (0, 1, p−1)                      | karşı tarafın açık değeri denetlenir                      | `test_dh_gecersiz_acik_deger_reddedilir`                |

## Sınırlar

- **Yavaştır:** saf Python SHA-256 `hashlib`'ten yüzlerce kat yavaştır. PBKDF2'yi gerçek yineleme sayılarıyla
  (≥ 600 000) bununla çalıştırmayın.
- **Yan kanallara karşı korunmaz:** Python tam sayıları ve yorumlayıcı sabit zaman garanti etmez.
- SHA-512, scrypt, Argon2, X25519, Ed25519, RSA-OAEP/PSS **yok** (gerekirse `hashlib.scrypt`, `cryptography`).
- `asymmetric.py` yalnız küçük sayılarla öğretim içindir; Miller-Rabin tabanları n < 3.3·10²⁴ için kesindir.
- JWT yalnız HS256; JWK/JWKS, `kid` ile anahtar seçimi, RS/ES algoritmaları yok.

## Buradan nereye

- Gerçek uygulamada parola: `hashlib.scrypt` ya da `hashlib.pbkdf2_hmac("sha256", …, 600_000)` + `secrets.token_bytes(16)` tuz.
- Oturum imzası için bu klasörün değil `web_catisi/sessions.py`'nin yaptığına bakın: aynı fikir, stdlib `hmac` ile.
- Yeni bir yapı taşı: ayrı dosya + `tests/kripto_egitim/` altında stdlib/RFC karşılaştırmalı test (önce test).
