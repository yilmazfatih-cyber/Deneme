"""HTTP sunucusu (isteğe bağlı `sunucu` ekstrası): sınıflandırma, metinle arama, benzer görüntü.

Modüller:
- `gate.py`  : istek kapısı — gövde OKUNMADAN önce boyut sınırı, yerel kipte Host/Origin, API anahtarı.
- `state.py` : sunucu durumu (sınıflandırıcı, dizin, gömme modeli, sınırlar) ve bileşen yükleme.
- `app.py`   : FastAPI uçları: GET /saglik, POST /siniflandir, POST /ara, POST /benzer.
Varsayılan kapı 8465 (şartnamede verildi; STANDARTLAR §12'de `sifirdan`'ın 8450–8469 aralığına düşüyor,
o temelde bu kapıyı kullanan kod yok — çakışırsa `--kapi`), varsayılan adres 127.0.0.1.

Genişletme: yeni uç için `app.py` içine `@app.post` ekleyin; kapının sınır tablosuna (`gate.py`
`UPLOAD_PATHS`) dosya yüklüyorsa yolunu yazın; `tests/test_server.py` içine saldırı testi ekleyin.
"""
