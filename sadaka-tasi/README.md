# Sadaka Taşı — dayanışma sandığı (demo)

Her ay ödenen aidatın %20'si aynı ay sadaka olur, %70'i dayanışma havuzunda kara günler için bekler, %10'u işletmeye gider.
Kara günü gelen üyeye kurul, belgelenen ihtiyaca göre ve herkese aynı olan yardım tavanına kadar destek olur. Havuzda
ihtiyatın üstünde kalan her kuruş her ay yine sadakaya döner.

- **İş planı:** [`IS-PLANI.md`](IS-PLANI.md): hukuki çerçeve, sandık kuralları, finans, yol haritası.
- **Adres:** `https://<kullanıcı>.github.io/<depo>/sadaka-tasi/`. GitHub Pages iş akışı klasörü olduğu gibi yayınlar.

> Bu bir tasarım örneğidir. Gerçek para alınmaz; kişiler, kurumlar ve rakamlar örnektir. Demo verisi yalnız tarayıcının
> localStorage'ında durur. Sandık bir sigorta ürünü değildir.

## Neler var

| Sayfa       | İçerik                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Ana sayfa   | Aidatın bölünüşü, üç adım, sadaka taşı geleneği, örnek sandığın rakamları, "bu bir sigorta değil"            |
| Nasıl işler | Bekleme süresi, yardım tavanı, kara gün örnekleri, başvurudan ödemeye, kurul, afet kuralı, ay sonu dağıtımı  |
| Hesapla     | Kişisel aidat hesaplayıcı; 12–60 aylık sandık projeksiyonu, afet senaryosu, grafikler ve tablo görünümü      |
| Şeffaflık   | Havuz, ihtiyat akçesi, aylık para akışı grafiği, sadaka alanları, filtreli defter                            |
| Sorular     | Sigorta, iade, tavan, zekât, kurul, veri ve afet soruları                                                    |
| Hesabım     | Kalan yardım tavanı, talepler (belge ekleme, itiraz, geri çekme), aidatın nereye gittiği, aidat ve ara verme |
| Talep       | Kara gün türü, belgelenen tutar, belge adları, ödeme yeri; canlı tavan ve inceleme yolu kontrolü             |
| Kurul       | Bekleyen talepler; onay, kısmi onay, belge isteme, gerekçeli ret; ödeme payı ve sıra durumu                  |
| Demo şeridi | **Ayı kapat**: aidatlar alınır, sıradakiler ödenir, ihtiyatın üstü sadakaya dağıtılır. **Baştan başlat**     |

## Geliştirme

Derleme yok. Klasörü bir statik sunucuyla açın (ES modülleri `file://` ile çalışmaz):

```bash
npx serve sadaka-tasi
```

Kurallar `kurallar.mjs` dosyasında saf fonksiyonlardır. Tutarlar kuruş cinsinden tam sayıdır. Testler:

```bash
node --test sadaka-tasi/*.test.mjs
```

| Dosya                                            | Görev                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `kurallar.mjs`                                   | `VARSAYILAN_KURALLAR`, yardım tavanı, talep doğrulama, kurul kararı, ay sonu kapanışı, projeksiyon |
| `kurallar.test.mjs`                              | Kural testleri: kuruş korunumu, tavan, sıra ve oransal ödeme, örnek verinin tutarlılığı            |
| `ornek.mjs`                                      | Demo sandığı: Eylül 2025'ten bugüne aynı kurallarla, sabit tohumla üretilir                        |
| `grafik.mjs`                                     | Parçalı çubuk, ölçer, sütun ve çizgi grafikleri, yatay çubuklar; her grafik tablo görünümüyle      |
| `app.mjs`                                        | Sayfalar, eylemler, formlar, ipuçları                                                              |
| `stil.css`                                       | Renk ve yazı belirteçleri (açık ve koyu tema), bileşenler                                          |
| `index.html`, `manifest.webmanifest`, `icon.svg` | Kabuk                                                                                              |

Kuralları değiştirmek için `VARSAYILAN_KURALLAR` nesnesini düzenleyin. Site, hesaplayıcı, projeksiyon ve testler aynı
değerleri kullanır.
