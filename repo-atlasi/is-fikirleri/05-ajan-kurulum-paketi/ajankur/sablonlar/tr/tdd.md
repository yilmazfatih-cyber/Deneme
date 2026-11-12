# Test önce geliştirme

## Ne zaman

Yeni davranış, hata düzeltmesi ya da davranışı değiştiren yeniden düzenleme. Tek seferlik deneme kodu, üretilmiş
dosyalar ve yalnız yapılandırma değişikliği için ekiple konuşarak atlanabilir.

## Döngü

1. **Kırmızı:** davranışı anlatan tek bir test yaz ({{TEST_DESENI}}). Çalıştır: {{TEK_TEST}}. Testin doğru
   sebeple kırıldığını gör; eksik içe aktarma ya da yazım hatası "kırmızı" sayılmaz.
2. **Yeşil:** testi geçirecek en küçük kodu yaz. Sonraki testlerin ihtiyacını şimdiden kodlama.
3. **Temizle:** testler yeşilken adları ve tekrarları düzelt; davranış değiştirme.
4. **Tüm paket:** {{TEST}}. Sonra bir sonraki davranışa geç: her turda bir test, bir küçük çözüm.

## İyi test

- Davranışı genel arayüzden sınar; özel fonksiyonlara ya da veritabanı satırlarına bakmaz.
- Beklenen değer bağımsız bir kaynaktan gelir (elle hesaplanmış örnek, belge). Kodun yaptığı hesabı testte tekrar
  etmek hiçbir şey kanıtlamaz.
- Adı bir cümle gibi okunur: "boş sepetle ödeme reddedilir".
- Sahte nesne yalnız sınırda kullanılır (ağ, saat, dosya sistemi, ödeme sağlayıcısı).

## Kırmızı bayraklar

- Yeni test ilk çalıştırmada geçiyorsa yeni bir şey sınamıyordur.
- Testi geçirmek için testi değiştirmek: önce testin neden yanlış olduğunu yaz.
- "Testi sonra yazarız": insanla konuşmadan verilecek bir karar değildir.

## Bitti ölçütü

{{TEST}} yeşil{{EK_KAPILAR}}; yeni davranışın en az bir testi var ve o test önce kırmızı görüldü.
