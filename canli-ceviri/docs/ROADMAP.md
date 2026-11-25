# Canlı Çeviri — yol haritası

## Yapılanlar

| Tarih      | İş                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 19.11.2026 | iPhone uygulamasının ilk sürümü: Xcode projesi, üç sekme, ses hattı, dayanıklılık düzeltmeleri             |
| 23.11.2026 | AirPods durum satırı; web deneme sürümü ve akış testi; `/canli-ceviri/` altında yayın                       |
| 25.11.2026 | Mac derleme iş akışı: uygulama ilk kez derlendi (Xcode 26.6, hatasız ve uyarısız); ekip ve anayasa kuruldu |

## Sprintler

| Sprint | Hedef                                                                                                   | Durum   |
| ------ | ------------------------------------------------------------------------------------------------------- | ------- |
| S01    | Cihaz denemesine hazır sürüm: bağımsız kod incelemesi, Tanılama, anahtarın Anahtar Zinciri'nde saklanması, erişilebilirlik, simülatör ekran görüntüleri, cihaz testi belgesi | sürüyor |
| S02    | Cihaz denemesinden çıkan sorunlar (proje sahibinin `docs/cihaz-testi.md` sonuçlarına göre)               | bekliyor |

## Birikim (öncelik sırasıyla)

- Çift yönlü konuşma: kişinin Türkçe söylediğini karşı tarafın diline çevirip telefonun hoparlöründen okumak.
- Arka planda ve ekran kilitliyken dinleme (ses arka plan kipi; gizlilik göstergesi ve pil etkisiyle birlikte düşünülmeli).
- Mac'siz kurulum: derlemeden imzasız `.ipa` üretmek ya da TestFlight (ücretli geliştirici hesabı gerekir).
- Geçmişi isteğe bağlı saklama ve dışa aktarma.
- Kaynak dili kendiliğinden tanıma.
- Web sürümünde çeviriyi cihazda yapma (tarayıcı desteklediğinde) ve mikrofon seçimi.
- Daha çok kaynak dil; hedef dilin seçilebilmesi.
