"""Çatının kullanıcıya gösterdiği metinler — tek sözlük dosyası (uygulama metinleri
`ornek/metinler.py`).

Genişletme: yeni bir metin için `TEXTS`'e anahtar ekleyin; kodda `text("anahtar")` kullanın.
`tests/test_kurallar.py` kodda kullanılan her anahtarın burada olduğunu denetler.
"""

from __future__ import annotations

TEXTS: dict[str, str] = {
    "csrf": "Güvenlik doğrulaması başarısız. Sayfayı yenileyip yeniden deneyin.",
    "hata.400": "İstek anlaşılamadı.",
    "hata.403": "Bu işlem için izniniz yok.",
    "hata.404": "Aradığınız sayfa bulunamadı.",
    "hata.405": "Bu adres bu işlemi desteklemiyor.",
    "hata.413": "Gönderilen veri çok büyük.",
    "hata.415": "Gönderilen verinin türü desteklenmiyor.",
    "hata.500": "Beklenmeyen bir sorun oluştu. Biraz sonra yeniden deneyin.",
    "hata.genel": "Bir sorun oluştu.",
    "hata.baslik": "Bir sorun var",
}


def text(key: str) -> str:
    return TEXTS[key]


def error_text(status: int) -> str:
    return TEXTS.get(f"hata.{status}", TEXTS["hata.genel"])
