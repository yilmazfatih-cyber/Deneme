"""Tek dosyalık web arayüzü (derleme adımı yok): index.html (sohbet), kayit.html (ajan dökümü),
sozluk.json (arayüzün bütün Türkçe metinleri). Sunucu bu dosyaları paket içinden okur.

Genişletme: yeni metin → önce sozluk.json'a anahtar ekleyin, HTML'de `data-t="anahtar"` ya da
`t('anahtar')` ile kullanın (kural testi: tests/test_kurallar.py eksik anahtarı yakalar).
"""
