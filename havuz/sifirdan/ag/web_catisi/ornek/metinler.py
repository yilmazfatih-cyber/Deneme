"""Örnek uygulamanın kullanıcıya gösterdiği TÜM metinler — tek sözlük (koda Türkçe metin gömülmez).

Genişletme: yeni metin için buraya anahtar ekleyin, kodda `t("anahtar")` kullanın.
`tests/test_kurallar.py` kullanılan her anahtarın burada olduğunu denetler.
"""

from __future__ import annotations

METINLER: dict[str, str] = {
    "uygulama": "Not Defteri",
    "ana.baslik": "Notlarınız tek yerde",
    "ana.tanitim": "Hesap açın, notlarınızı yazın; yalnız siz görürsünüz.",
    "menu.giris": "Giriş",
    "menu.kayit": "Hesap aç",
    "menu.cikis": "Çıkış",
    "menu.notlar": "Notlarım",
    "kayit.baslik": "Hesap aç",
    "giris.baslik": "Giriş yap",
    "alan.ad": "Kullanıcı adı",
    "alan.parola": "Parola",
    "alan.not_baslik": "Başlık",
    "alan.not_metin": "Not",
    "alan.dosya": "Metin dosyası (.txt)",
    "dugme.kayit": "Hesabı aç",
    "dugme.giris": "Giriş yap",
    "dugme.ekle": "Notu kaydet",
    "dugme.sil": "Sil",
    "dugme.yukle": "Dosyayı not olarak ekle",
    "notlar.baslik": "Notlarım",
    "notlar.bos": "Henüz notunuz yok. İlk notunuzu aşağıdan yazın.",
    "notlar.yeni": "Yeni not",
    "notlar.yukle": "Dosyadan not",
    "hata.ad": "Kullanıcı adı 3–32 karakter olmalı; harf, rakam, nokta, tire ya da alt çizgi.",
    "hata.parola": "Parola en az 8, en çok 128 karakter olmalı.",
    "hata.ad_alinmis": "Bu kullanıcı adı alınmış. Başka bir ad deneyin.",
    "hata.giris": "Kullanıcı adı ya da parola hatalı.",
    "hata.cok_deneme": "Çok fazla deneme yapıldı. 15 dakika sonra yeniden deneyin.",
    "hata.not_baslik": "Başlık 1–200 karakter olmalı.",
    "hata.not_metin": "Not en çok 10 000 karakter olabilir.",
    "hata.dosya": "Yalnız UTF-8 kodlu, en çok 64 KB'lık .txt dosyası eklenebilir.",
    "bilgi.kayit": "Hesabınız açıldı. Hoş geldiniz!",
    "bilgi.giris": "Giriş yaptınız.",
    "bilgi.cikis": "Çıkış yaptınız. Tüm cihazlardaki oturumlarınız kapandı.",
    "bilgi.not_eklendi": "Not kaydedildi.",
    "bilgi.not_silindi": "Not silindi.",
}


def t(key: str) -> str:
    return METINLER[key]
