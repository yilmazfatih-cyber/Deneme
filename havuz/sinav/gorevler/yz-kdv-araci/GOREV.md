Ajanımız muhasebe sorularında KDV'yi yanlış hesaplıyor. Ona KDV hesaplayan hazır bir araç vermek istiyorum. AGENTS.md'deki "Yeni araç ekle" tarifini izle.

- Yeni modül: yz/arac/hazir/kdv.py. İçinde kdv_araclari() adlı bir işlev araç listesi döndürsün (zaman_araclari gibi). yz/arac/hazir paketinden içe aktarılabilsin.
- Aracın adı kdv_hesapla. Parametreleri:
  - tutar: metin, Türkçe yazım ("1.234,56" ya da "1234,56"; kuruş yoksa "1500" de olur)
  - oran: KDV oranı, yüzde olarak tam sayı; varsayılanı 20
  - dahil: tutar KDV dahil mi (evet/hayır); varsayılanı hayır
- Sonuç tek satır metin olsun, şu biçimde:
  KDV hariç: 1.000,00 TL; KDV (%20): 200,00 TL; KDV dahil: 1.200,00 TL
- Kuruşa yarım yukarı yuvarla (0,125 → 0,13). KDV dahil tutardan ayırırken KDV hariç tutar + KDV, verilen tutara kuruşu kuruşuna eşit olsun.
- Okunamayan ya da negatif tutar, 0'dan küçük ya da 100'den büyük oran hata versin; ajan hatayı görüp düzeltebilsin.
- Mutlu yol ve hata yolu için test yaz.

Denetim yeşil olsun.
