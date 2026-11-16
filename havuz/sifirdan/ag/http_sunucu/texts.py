"""Sunucunun kullanıcıya gösterdiği metinler — tek sözlük dosyası.

Durum satırındaki İngilizce gerekçe ifadeleri (reason phrase) protokolün parçasıdır ve çevrilmez;
hata sayfalarının GÖVDESİ Türkçedir. İç ayrıntı (yığın izi, dosya yolu) asla gövdeye yazılmaz.
Genişletme: yeni bir durum kodu için iki sözlüğe de bir satır ekleyin.
"""

from __future__ import annotations

REASONS: dict[int, str] = {
    100: "Continue",
    101: "Switching Protocols",
    200: "OK",
    201: "Created",
    204: "No Content",
    206: "Partial Content",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    411: "Length Required",
    413: "Content Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    426: "Upgrade Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
}

ERROR_TEXTS: dict[int, str] = {
    400: "İstek anlaşılamadı.",
    401: "Bu sayfa için giriş yapmanız gerekiyor.",
    403: "Bu işlem için izniniz yok.",
    404: "Aradığınız sayfa bulunamadı.",
    405: "Bu adres bu yöntemi desteklemiyor.",
    408: "İstek zamanında tamamlanmadı. Lütfen yeniden deneyin.",
    411: "İstek gövdesinin uzunluğu belirtilmeli.",
    413: "Gönderilen veri çok büyük.",
    414: "Adres çok uzun.",
    416: "İstenen bayt aralığı dosyada yok.",
    417: "İstenen ön koşul karşılanamıyor.",
    426: "Bu adres için bağlantı yükseltmesi gerekiyor.",
    429: "Çok sık istek gönderildi. Biraz bekleyip yeniden deneyin.",
    431: "İstek başlıkları çok büyük.",
    500: "Sunucuda beklenmeyen bir sorun oluştu.",
    501: "Bu özellik desteklenmiyor.",
    502: "Arka sunucudan geçerli yanıt alınamadı.",
    503: "Hizmet şu an yanıt veremiyor. Biraz sonra yeniden deneyin.",
    504: "Arka sunucu zamanında yanıt vermedi.",
    505: "Bu HTTP sürümü desteklenmiyor.",
}


def reason(status: int) -> str:
    return REASONS.get(status, "Unknown")


def error_text(status: int) -> str:
    return ERROR_TEXTS.get(status, "Bir sorun oluştu.")
