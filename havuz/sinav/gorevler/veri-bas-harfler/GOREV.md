Kişi kartlarında adın baş harflerini (avatar) göstereceğiz. verihavuzu/text.py dosyasına bunu yapan bir işlev ekle.

- Ad ve imza: initials_tr(full_name: str) -> str
- İlk ve son sözcüğün ilk harflerini büyük harfle, bitişik verir: "ayşe nur yılmaz" → "AY", "Mehmet Öz" → "MÖ".
- Tek sözcükse tek harf: "ilker" → "İ".
- Baştaki, sondaki ve aradaki fazla boşluklar önemsiz: "  can   ışık " → "CI".
- Boş metin ya da yalnız boşluk → "".
- tests/ altına testini yaz.

Denetim yeşil olsun.
