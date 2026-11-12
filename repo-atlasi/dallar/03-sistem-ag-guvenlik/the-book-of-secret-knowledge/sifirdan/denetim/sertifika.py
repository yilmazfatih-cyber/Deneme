"""X.509 sertifika süresi denetimi — DER/ASN.1 ayrıştırıcı sıfırdan.

    Certificate  ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
    TBSCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber INTEGER,
                       signature AlgorithmIdentifier, issuer Name, validity Validity,
                       subject Name, subjectPublicKeyInfo, ... }
    Validity     ::= SEQUENCE { notBefore Time, notAfter Time }
    Time         ::= UTCTime (YYMMDDHHMMSSZ) | GeneralizedTime (YYYYMMDDHHMMSSZ)

Her DER öğesi TLV'dir: etiket baytı, uzunluk (kısa ya da 0x8n uzun biçim), değer.
Kaynak: RFC 5280 §4.1, ITU-T X.690.
"""

import base64
import re
import socket
import ssl
from datetime import datetime, timezone

from .bulgu import Bulgu

SEQUENCE, SET, INTEGER, OID, UTC_TIME, GEN_TIME = 0x30, 0x31, 0x02, 0x06, 0x17, 0x18
CN_OID = bytes([0x55, 0x04, 0x03])  # 2.5.4.3 commonName
DIZGI_ETIKETLERI = {0x0C: "utf-8", 0x13: "ascii", 0x16: "ascii", 0x14: "latin-1", 0x1E: "utf-16-be"}


class DerHatasi(ValueError):
    pass


def tlv(veri, ofset):
    """(etiket, değer_başı, değer_sonu) döndürür."""
    if ofset + 2 > len(veri):
        raise DerHatasi("TLV başlığı eksik")
    etiket, uzunluk, i = veri[ofset], veri[ofset + 1], ofset + 2
    if uzunluk & 0x80:
        n = uzunluk & 0x7F
        if n == 0 or n > 4 or i + n > len(veri):
            raise DerHatasi("geçersiz uzun biçim uzunluk")
        uzunluk, i = int.from_bytes(veri[i : i + n], "big"), i + n
    if i + uzunluk > len(veri):
        raise DerHatasi("değer verinin sonunu aşıyor")
    return etiket, i, i + uzunluk


def cocuklar(veri, bas, son):
    """Bir SEQUENCE/SET'in içindeki öğeleri sırayla üretir."""
    while bas < son:
        etiket, d_bas, d_son = tlv(veri, bas)
        yield etiket, d_bas, d_son
        bas = d_son


def zaman_coz(etiket, metin):
    if etiket == UTC_TIME:  # RFC 5280: YY >= 50 → 19YY, değilse 20YY
        yy = int(metin[:2])
        metin = ("19" if yy >= 50 else "20") + metin
    elif etiket != GEN_TIME:
        raise DerHatasi("zaman türü değil")
    if not re.fullmatch(r"\d{14}Z", metin):
        raise DerHatasi(f"desteklenmeyen zaman biçimi: {metin}")
    return datetime.strptime(metin, "%Y%m%d%H%M%SZ").replace(tzinfo=timezone.utc)


def _cn(veri, bas, son):
    """Name (SEQUENCE OF SET OF SEQUENCE {OID, değer}) içinden commonName."""
    for _, rdn_bas, rdn_son in cocuklar(veri, bas, son):
        for _, atv_bas, atv_son in cocuklar(veri, rdn_bas, rdn_son):
            ogeler = list(cocuklar(veri, atv_bas, atv_son))
            if len(ogeler) == 2 and ogeler[0][0] == OID and veri[ogeler[0][1] : ogeler[0][2]] == CN_OID:
                etiket, d_bas, d_son = ogeler[1]
                return veri[d_bas:d_son].decode(DIZGI_ETIKETLERI.get(etiket, "latin-1"), "replace")
    return None


def coz(der):
    """DER sertifika → sözlük (seri, konu, yayıncı, başlangıç, bitiş, kendinden_imzalı)."""
    etiket, bas, son = tlv(der, 0)
    if etiket != SEQUENCE:
        raise DerHatasi("sertifika bir SEQUENCE değil")
    etiket, tbs_bas, tbs_son = tlv(der, bas)
    ogeler = list(cocuklar(der, tbs_bas, tbs_son))
    if ogeler and ogeler[0][0] == 0xA0:  # [0] EXPLICIT version
        ogeler = ogeler[1:]
    if len(ogeler) < 5 or ogeler[0][0] != INTEGER:
        raise DerHatasi("TBSCertificate beklenen yapıda değil")
    seri = int.from_bytes(der[ogeler[0][1] : ogeler[0][2]], "big")
    yayinci, gecerlilik, konu = ogeler[2], ogeler[3], ogeler[4]
    zamanlar = [zaman_coz(e, der[b:s].decode("ascii")) for e, b, s in cocuklar(der, gecerlilik[1], gecerlilik[2])]
    if len(zamanlar) != 2:
        raise DerHatasi("Validity iki zaman içermeli")
    konu_ham, yayinci_ham = der[konu[1] : konu[2]], der[yayinci[1] : yayinci[2]]
    return {
        "seri": seri,
        "konu": _cn(der, konu[1], konu[2]),
        "yayinci": _cn(der, yayinci[1], yayinci[2]),
        "baslangic": zamanlar[0],
        "bitis": zamanlar[1],
        "kendinden_imzali": konu_ham == yayinci_ham,
    }


def pem_oku(metin):
    """PEM metnindeki tüm sertifikaları DER olarak döndürür."""
    bloklar = re.findall(r"-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----", metin, re.S)
    return [base64.b64decode("".join(b.split())) for b in bloklar]


def sunucudan_al(ana_bilgisayar, port, zaman_asimi=5.0):
    """TLS el sıkışması yapıp sunucunun sertifikasını DER olarak alır.

    Doğrulama kapalıdır: amaç güvenilir bağlantı kurmak değil, süresi dolmuş
    ya da kendinden imzalı sertifikayı da GÖREBİLMEKTİR. Bu bağlantı üzerinden
    veri gönderilmez."""
    baglam = ssl.create_default_context()
    baglam.check_hostname = False
    baglam.verify_mode = ssl.CERT_NONE
    with socket.create_connection((ana_bilgisayar, port), timeout=zaman_asimi) as ham:
        with baglam.wrap_socket(ham, server_hostname=ana_bilgisayar) as tls:
            return tls.getpeercert(binary_form=True)


def denetle(sertifika, simdi=None, uyari_gun=30, kaynak=""):
    simdi = simdi or datetime.now(timezone.utc)
    kalan = sertifika["bitis"] - simdi
    gun = kalan.total_seconds() / 86400
    ad = sertifika["konu"] or "?"
    bulgular = []
    if gun < 0:
        bulgular.append(Bulgu("kritik", "TLS-001", f"sertifikanın süresi dolmuş: {ad}",
                              f"Bitiş: {sertifika['bitis']:%Y-%m-%d %H:%M} UTC ({-gun:.0f} gün önce).",
                              "Sertifikayı hemen yenileyin; otomatik yenilemeyi (ACME) kurun.", kaynak))
    elif gun <= uyari_gun:
        bulgular.append(Bulgu("yuksek" if gun <= 7 else "orta", "TLS-002", f"sertifika yakında doluyor: {ad}",
                              f"{gun:.1f} gün kaldı (bitiş {sertifika['bitis']:%Y-%m-%d} UTC).",
                              "Yenileme işinin çalıştığını doğrulayın; izlemeye eşik ekleyin.", kaynak))
    if simdi < sertifika["baslangic"]:
        bulgular.append(Bulgu("yuksek", "TLS-003", f"sertifika henüz geçerli değil: {ad}",
                              f"Başlangıç: {sertifika['baslangic']:%Y-%m-%d %H:%M} UTC.",
                              "Sunucu saatini (NTP) ve sertifikayı kontrol edin.", kaynak))
    if sertifika["kendinden_imzali"]:
        bulgular.append(Bulgu("orta", "TLS-004", f"kendinden imzalı sertifika: {ad}",
                              "Tarayıcılar ve istemciler bu sertifikaya güvenmez.",
                              "Herkese açık servislerde tanınmış bir CA (ör. Let's Encrypt) kullanın.", kaynak))
    if not bulgular:
        bulgular.append(Bulgu("bilgi", "TLS-000", f"sertifika geçerli: {ad}", f"{gun:.0f} gün kaldı.",
                              "İzlemeye devam edin.", kaynak))
    return bulgular
