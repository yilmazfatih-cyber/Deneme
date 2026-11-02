# Döngü — adet takibi

Flo'daki akışla çalışan, Türkçe, çevrimdışı bir adet ve döngü takip uygulaması (PWA). Sunucu ve hesap yoktur;
tüm veriler telefonda (`localStorage`) kalır.

## Neler var

| Ekran        | Özellikler                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kurulum      | Son adet tarihi, adet süresi, döngü uzunluğu (hepsi atlanabilir; varsayılan 28 / 5 gün)                                                                           |
| Bugün        | Döngü halkası (adet günü / adete kalan gün / gecikme / yumurtlama / doğurgan pencere), hafta şeridi, **Adet başladı / Adet bitti**, gebelik olasılığı, evre ipucu |
| Günlük kayıt | Kanama miktarı, 12 belirti, 8 ruh hali, vajinal akıntı, cinsellik, not — alttan açılan panel                                                                      |
| Takvim       | Aylık görünüm: kayıtlı adet (dolu), tahmini adet (kesikli), doğurgan pencere, yumurtlama; herhangi bir güne dokunup adet işaretleme veya belirti ekleme           |
| Analiz       | Ortalama döngü ve adet süresi, düzenlilik, döngü uzunluğu grafiği, sık belirtiler ve ruh halleri, geçmiş döngüler                                                 |
| Ayarlar      | Ortalama yerine elle uzunluk, adet yaklaşınca uyarı, `.json` yedek alma / geri yükleme, verileri silme                                                            |

## Tahmin mantığı (`src/lib/cycle.ts`)

- Döngü uzunluğu = son 6 döngünün ortalaması (yoksa profil değeri); adet süresi = onaylanmış son 6 adetin ortalaması.
- Sonraki adet = son adet başlangıcı + döngü uzunluğu. Yumurtlama = sonraki adet − 14 gün.
  Doğurgan pencere = yumurtlama − 5 … yumurtlama + 1.
- Gelecek aylar için tahmin zincirleme ilerletilir; geçmiş günler kaydedilen adetlere dayanır.
- Tahminler ortalamadır; doğum kontrolü veya tıbbi tanı yerine geçmez.

## Çalıştırma

```bash
cd adet-takip
npm install
npm run dev        # http://localhost:5173
npm run check      # tip denetimi + birim testler
npm run build      # dist/ — herhangi bir statik barındırmaya (GitHub Pages dahil) kopyalanabilir
```

Telefonda: bağlantıyı Chrome/Safari'de açıp **Ana ekrana ekle** deyin; ilk açılıştan sonra internetsiz çalışır.
