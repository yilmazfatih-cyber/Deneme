---
name: tvplus-lab
description: TV+ Lab ile churn nedenlerini derin analiz eder, uygulamayı Mixpanel verisinden kurulan simülasyonda çalıştırır ve A/B deneylerini simülasyonda dener. "/tvplus-lab churn neden artıyor?", "/tvplus-lab sayfa-siralama deneyini simüle et", "/tvplus-lab top10'u aşağı alırsak ne olur?" gibi. Ham veri kullanıcının makinesinde kalır; yalnız toplamlar okunur.
---

# /tvplus-lab <soru>

Lab, `tvplus/lab/` altındaki yerel analiz hattıdır (ayrıntı: `tvplus/docs/LAB.md`). Tek kapısı `lab` komutudur:

- MCP aracı varsa: `mcp__tvplus-lab__lab` → `{ "komut": "churn neden; churn tetik" }`
- Yoksa: `npm --prefix tvplus run --silent lab -- churn neden` (aynı metni verir)

## Değişmez kurallar

1. **Ham veriye dokunma.** `tvplus/.data/lab/**` altını ve Mixpanel dışa aktarım dosyalarını `Read`/`cat`/`grep` ile
   açma; yalnız `lab` komutunun çıktısını oku. Kullanıcıdan veri, kimlik ya da anahtar yapıştırmasını isteme.
   Mixpanel kimlik bilgisi yalnız kullanıcının kendi terminalindeki ortam değişkenlerinde durur.
2. **Sayıları uydurma.** Her sayı araçtan gelir. Çıktıda `SENTETİK` yazıyorsa bulguyu "demo verisi" diye aktar.
3. **Az tur, az çıktı.** Bir çağrıda birden çok komutu `;` ile gönder. Önce özet (`churn`), sonra yalnız gereken
   ayrıntı. `--json` kullanma (kompakt metin daha kısadır). Sonuçlar önbelleklidir; `--yeniden` yalnız veri ya da
   parametre değiştiyse.
4. **Nedensellik iddiasında dürüst ol.** Churn nedenleri gözlemsel veriden gelir (benzer kullanıcılarla eşleştirilmiş
   risk); simülasyon gerçek A/B'nin yerini tutmaz. Çıktıdaki uyarıları ve karne puanını birlikte aktar.

## Akışlar

**Nereden başlanır:** `durum` — hangi adımda olunduğunu ve sıradaki komutu söyler. Veri hiç yoksa kullanıcıya
`tvplus/docs/LAB.md` "Kendi verinle kurulum" bölümünü göster (keşif → eşleme → içe alma → kur); yöntemi görmek için
`demo` sentetik veriyle tüm hattı kurar.

**Churn neden?**

1. `durum; churn` → tanım, oran, önem sırasıyla bulgular.
2. `churn neden; churn tetik` → neden aileleri (pay · birincil · giderilirse) ve tetikleyici deneyimler (RO, aralık).
3. Gerekirse: `churn kim` (hangi kesim), `churn yeni` (ilk hafta), `churn etken <ad>` (tek özellik), `churn tanim`.
4. Hazır analizlerin yanıtlamadığı soru için: `sorgu <tablo> --grup … --olc … --nerede …` (`sorgu` yardım verir).

**Bir değişiklik işe yarar mı? (simülasyon)**

1. `sim durum` → köprü ve karne var mı. Yoksa `sim kur; sim karne` (1–2 dk). Karne puanı ve ✗ ölçüler sonucun ne
   kadar güvenilir olduğunu söyler; `sim varsayim` hangi parametrenin veriden, hangisinin varsayım olduğunu.
2. `deney liste` → tanımlı deneyler, bayraklar, ölçüler.
3. Tanımlı deney: `deney calistir <anahtar>`. Tanımsız fikir: `deney dene --bayrak home.top10=low` (uygulama kodu),
   `--hata 0.5 --takilma 0.5` (ortam), `--devam 1.2 --arama-hata 0.7` (davranış varsayımı).
4. Karar satırını oku: **aday** (gerçek deneye değer) · **riskli** (koruma ölçüsü bozuldu) · **zararlı** · **etkisiz**.
5. Gerçek deney planı: `deney guc --olcu <ölçü> [--trafik 0.5]` → hangi sürede hangi etki görülür.

**Gerçek deney sonucu:** veride maruziyet olayı varsa `deney gercek` adları listeler, `deney gercek "<ad>"` çözümler
(CUPED, örneklem oranı denetimi).

**Yeni bir deney fikrini uygulamaya eklemek** (kod değişikliği; kullanıcı isterse):
bayrak → `tvplus/shared/flags.ts` · davranış → `tvplus/server/src/services/discovery/lolomo.ts` (ana sayfa) ya da
ilgili servis · tanım → `tvplus/content/experiments.json` · sonra `deney calistir <anahtar>`.

## Çıktıyı okuma

- **pay**: churn riskinin o nedene atfedilen kısmı · **birincil**: baskın nedeni o olan churn olayları ·
  **giderilirse**: o nedenin zararlı etkileri hiç olmasaydı beklenen azalma (üst sınır, hedef değil).
- **RO**: o deneyimin yaşandığı günün "son gün" olma riski ÷ benzer kullanıcıların yaşamadığı günlerdeki risk.
- **taban risk**: özel bir işaret yokken de var olan gitme riski; hiçbir ürün değişikliğiyle sıfırlanmaz.
- **karne**: simülasyonun gerçeği yeniden üretme puanı (0–1; uydurulmayan ölçüler). 0.8 altı ya da ilgili ölçüde ✗
  varsa deney sonucunu yalnız yön olarak aktar.
- Deney tablosu: ★ birincil · ◆ koruma · aralık göreli farkın %95 güven aralığıdır.

Kullanıcıya yanıt: önce bir cümlelik sonuç, sonra en çok 3–5 kanıt satırı (sayılar araçtan olduğu gibi), sonra
önerilen sıradaki adım. İnsan için tam görünüm: `rapor` (tek dosyalık HTML) ya da Stüdyo → Kayıp Analizi / Deney
Laboratuvarı.
