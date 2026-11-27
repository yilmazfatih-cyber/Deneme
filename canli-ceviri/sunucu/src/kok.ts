// Sabitlenmiş güven kökü: "Apple Root CA - G3".
//
// App Store'un imzaladığı her işlemin (JWS) sertifika zinciri bu köke bağlanmak zorundadır. Üretim yolunda başka kök
// kabul edilmez; kökü değiştirmenin tek yolu bu dosyayı değiştirmektir (ortam değişkeni ya da yapılandırma ile olmaz).
//
// SHA-256 parmak izi (DER üzerinden):
//   63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
// Konu: CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
// Seri no: 2D:C5:FC:88:D2:C5:4B:95 · Geçerlilik: 2014-04-30 → 2039-04-30 · Anahtar: ECDSA P-384
//
// Elle doğrulama (Apple'ın yayımladığı kopyayla karşılaştırma):
//   curl -fsSO https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
//   npm run kok -- AppleRootCA-G3.cer
// Parmak izi https://www.apple.com/certificateauthority/ sayfasındaki "Apple Root CA - G3" satırıyla aynı olmalıdır.
// Aynı karşılaştırmayı iş akışı da her çalışmada yapar (.github/workflows/canli-ceviri-sunucu.yml).

import { base64Coz } from './yardimci'

export const APPLE_KOK_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179'

export const APPLE_KOK_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

/** PEM metnini DER baytlarına çevirir. Bozuk metinde hata fırlatır. */
export function pemdenDer(pem: string): Uint8Array {
  const govde = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '')
  const der = base64Coz(govde)
  if (der === null || der.length === 0) {
    throw new Error('Kök sertifika PEM metni çözülemedi.')
  }
  return der
}

/** Sabitlenmiş Apple kökünün DER baytları. */
export const APPLE_KOK_G3_DER: Uint8Array = pemdenDer(APPLE_KOK_G3_PEM)
