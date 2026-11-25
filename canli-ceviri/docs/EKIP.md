# Canlı Çeviri — ekip ve akış

## Roller

| Ajan               | Model            | İş                                                                             | Yazdığı yerler                                         |
| ------------------ | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `ceviri-lideri`    | oturumun modeli  | Brief, görev dağıtımı, Mac derlemesi, çelişki çözümü, demo notu                | `CLAUDE.md`, `README.md`, `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/EKIP.md`, brief ve demo |
| `ios-gelistirici`  | Opus             | SwiftUI ekranları, durum, ses hattı kodu, Xcode projesi, derleme iş akışı      | `CanliCeviri/`, `CanliCeviri.xcodeproj/`, `scripts/`, iOS iş akışı |
| `web-gelistirici`  | Opus             | Web deneme sürümü ve akış testi                                                | `web/`, `tests/`                                       |
| `ses-uzmani`       | Opus             | Ses yolu, tanıma, seslendirme, kesintiler: şartname ve inceleme (kod yazmaz)   | `docs/ses-hatti.md`, inceleme dosyası                  |
| `arayuz-denetcisi` | Sonnet           | Tasarım şartnamesi, ekran ve erişilebilirlik incelemesi (kod yazmaz)           | `docs/tasarim.md`, inceleme dosyası                    |
| `kalite-sorumlusu` | Opus             | Bağımsız kod incelemesi, kabul kriterleri, cihaz testi belgesi (kod yazmaz)    | `docs/cihaz-testi.md`, inceleme dosyası                |
| `buyume-sorumlusu` | Sonnet           | Huni, mağaza sayfası, fiyat ve elde tutma incelemesi; öncelikli öneriler (kod yazmaz)  | `docs/buyume/`                                         |

Tanımlar `.claude/agents/` altındadır. Oturumu bu klasörde `claude --agent ceviri-lideri` ile ya da depo kökünden
`/ceviri` ile başlatın.

## Sprint akışı

```
brief ─→ plan kapısı ─→ uygulama ─→ otomatik kapı ─→ uzman incelemesi ─→ demo notu ─→ insan kapısı
(lider)  (ses, arayüz)  (iOS, web)  (Mac derlemesi,   (ses, arayüz,       (lider)      (gerçek iPhone
                                     web testi)        kalite)                          + AirPods)
                              ↑__________ en fazla 3 düzeltme turu __________│
```

1. **Brief:** lider amacı, kapsamı, kabul kriterlerini ve dosyalar arası sözleşmeleri yazar.
2. **Plan kapısı:** ses uzmanı ses hattı şartnamesini ve mevcut kodun incelemesini, arayüz denetçisi tasarım
   şartnamesini yazar. Lider çelişkileri brief'te karara bağlar.
3. **Uygulama:** iOS ve web geliştiricileri kendi dosyalarında, aynı anda çalışır.
4. **Otomatik kapı:** lider dala gönderir; Mac derlemesi çalışır (derleme + simülatör ekran görüntüleri). Web testi
   yerelde çalışır. Kırmızıysa çıktı olduğu gibi sahibine gider.
5. **Uzman incelemesi:** üç inceleme `docs/sprints/SNN/reviews/` altına yazılır. Engel ve Önemliler sahibine döner.
6. **Demo notu:** lider neyin yapıldığını, kabul kriterlerinin durumunu ve neyin yalnız gerçek cihazda
   doğrulanabileceğini yazar.
7. **İnsan kapısı:** proje sahibi `docs/cihaz-testi.md` adımlarını gerçek iPhone ve AirPods ile dener; sorun olursa
   Tanılama kaydını gönderir. Sonuçlar bir sonraki sprintin girdisidir.

## Kurallar

- Her dosyanın tek yazarı vardır (`CLAUDE.md` → klasör sahipliği). Ajanlar birbirinin dosyasını değiştirmez.
- Alt ajanlar birbirine mesaj atmaz; bulgular inceleme dosyalarından akar, lider taşır.
- Git'i yalnız lider kullanır. Kendi dalına commit ve push serbest; varsayılan dala birleştirme ve yayın için proje
  sahibine sorulur.
- Bütçe: bir sprintte en fazla 12 alt görev, en fazla 3 düzeltme turu.
- Hiçbir ajan denemediğini denenmiş gibi yazmaz (ilke 8).
