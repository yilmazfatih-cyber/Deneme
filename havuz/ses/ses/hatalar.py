"""Paketin hata sınıfları: hepsi `SesHatasi`'ndan türer ve iletisi Türkçedir, ne yapılacağını söyler.

Komut satırı (`cli.py`) bu hataları kısa iletiyle ve 2 çıkış koduyla bitirir; sunucu 4xx'e çevirir.
Beklenmeyen hatalar (programlama hatası) bu sınıflardan değildir ve tam iz basılır.
Kim kullanır: paketin her yeri.
Genişletme: yeni bir hata türü gerekiyorsa buraya `SesHatasi`'ndan türeyen bir sınıf ekleyin ve
sunucudaki durum kodu eşlemesine (`sunucu/uygulama.py` → `_DURUM_KODLARI`) bir satır yazın.
"""

from __future__ import annotations


class SesHatasi(Exception):
    """Paketin bütün hatalarının atası. İleti kullanıcıya olduğu gibi gösterilir."""


class BicimHatasi(SesHatasi):
    """Girdi dosyası ya da metin beklenen biçimde değil (bozuk WAV, desteklenmeyen kodlama…)."""


class SinirHatasi(SesHatasi):
    """Bir güvenlik ya da kaynak sınırı aşıldı (ses çok uzun, dosya çok büyük, metin çok uzun)."""


class ModelBulunamadiHatasi(SesHatasi):
    """İstenen model ya da ses diskte yok; ileti indirme komutunu söyler."""


class EksikBagimlilikHatasi(SesHatasi):
    """İsteğe bağlı bir paket (faster-whisper, piper-tts, fastapi) ya da ffmpeg kurulu değil."""


class MesgulHatasi(SesHatasi):
    """Sunucu aynı anda alabileceği kadar iş alıyor; biraz sonra yeniden denenmeli."""


def eksik_paket(paket: str, ekstra: str) -> EksikBagimlilikHatasi:
    """İsteğe bağlı paket eksikse kurulum komutunu söyleyen hata üretir."""
    return EksikBagimlilikHatasi(
        f"'{paket}' paketi kurulu değil. Bu klasörde şunu çalıştırın: "
        f'uv pip install --python .venv/bin/python -e ".[{ekstra}]"'
    )


def dosya_hatasi(yol: object, hata: OSError) -> BicimHatasi:
    """İşletim sistemi dosya hatasını Türkçe, yol gösteren bir iletiye çevirir."""
    if isinstance(hata, FileNotFoundError):
        return BicimHatasi(f"Dosya bulunamadı: {yol}. Yolu ve dosya adını denetleyin.")
    if isinstance(hata, PermissionError):
        return BicimHatasi(f"Dosyayı okuma/yazma izni yok: {yol}.")
    if isinstance(hata, IsADirectoryError):
        return BicimHatasi(f"Bu bir klasör, dosya değil: {yol}.")
    return BicimHatasi(f"Dosya işlemi başarısız: {yol} ({hata.strerror or hata}).")
