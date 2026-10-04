# Minik Usta — proje anayasası

> Bu klasör Deneme reposunun içinde bağımsız bir projedir. Üst klasördeki `../CLAUDE.md` (Köprü projesi) bu proje için
> **geçerli değildir**; yalnızca bu dosya ve `docs/BRIEF.md` bağlayıcıdır. Ajanların görünmesi için Claude Code'u
> `minik-usta/` klasöründe başlatın.

## Proje özeti

1. **Minik Usta** (EN: *Little Builder*, çalışma adı) dikey ekranlı bir mobil blok yerleştirme bulmacasıdır.
2. Oyuncu soldaki 6×8 malzeme sahasından blok alır, duvarın üstünden kaldır–taşı–indir ya da geçitten geçirir.
3. Sağdaki 2 sütunluk şantiyede renk planını inşa eder; her bölüm somut bir yapı parçası üretir.
4. İmza hareket "yukarı–aşağı"dır: çözümdeki şantiye yerleştirmelerinin ≥ %60'ı duvar üstünden (YAO).
5. Derinlik: renk + şekil + erişim (kazı) + yerçekimi + engeller (duvar, saha, şantiye).
6. Meta: yıldızla kasaba inşası, 5 hikaye bölümü, can/altın, galibiyet serisi, Sallanan Köprü, Usta Ligi (MVP'de botlu).
7. MVP: 50 bölüm, 5 hikaye bölümü, kasaba ekranı, 2 etkinlik, ekonomi; mağaza sahte satın almalı.
8. Önce mobil web (Vite + TypeScript + Phaser), sonra Capacitor ile iOS/Android.
9. Kahraman Tuna (8), Usta Dede, köpek Kepçe ve rakip Bay Gribeton; Renkli Tepe kasabası.
10. Tek doğruluk kaynağı: `docs/BRIEF.md`. Kararlar: `docs/DECISIONS.md`. Yorumlar: `docs/REVIEW_LOG.md`.

## Ajanlar ve sahiplik matrisi

| Ajan           | Karar alanı                                                                 | Sahip olduğu dosyalar                                                                                   |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `product-lead` | Kurallar, mekanikler, engeller, 50 bölüm, zorluk eğrisi, meta, oyun dengesi | `docs/GDD.md`, `docs/OBSTACLES.md`, `docs/LEVELS.md`, `docs/META.md`, `levels/*.json`, `config/*.json`  |
| `design-lead`  | Görsel yön, UI/UX, animasyon ve his, hikaye, karakterler, asset listesi     | `docs/ART_DIRECTION.md`, `docs/UX_FLOWS.md`, `docs/JUICE.md`, `docs/STORY.md`, `docs/ASSET_LIST.md`, `src/theme/tokens.json` |
| `code-lead`    | Teknik mimari, tüm kod, araçlar, testler, performans                        | `docs/TECH_DESIGN.md`, `docs/LEVEL_REPORT.md` (üretilen), `src/**` (tokens.json hariç), `tools/**`, `tests/**`, `package.json`, tüm yapılandırma |
| `entrepreneur` | Pazar, konumlandırma, monetizasyon ve fiyatlar, KPI, LiveOps, kapsam, hukuk | `docs/BUSINESS.md`, `docs/NAMING.md`, `docs/STORE_LISTING.md`, `docs/ANALYTICS.md` (code-lead ile)     |
| Orkestratör    | Fazlar, çatışma çözümü, karar günlüğü                                       | `CLAUDE.md`, `docs/BRIEF.md`, `docs/DECISIONS.md` (herkes ÖNERİ ekleyebilir), `.claude/agents/*`        |

- Ajanlar başkasının dosyasını düzenlemez; `docs/REVIEW_LOG.md`'ye `[kaynak → hedef] konu: yorum` biçiminde yazar, sahibi uygular.
- Çatışmada her taraf 3 satırlık pozisyon yazar; orkestratör sahiplik matrisine göre karar verir, ciddi olanları proje sahibine sorar.
- Fiyatlar entrepreneur'ün, oyun içi denge product-lead'indir; çakışma DECISIONS.md'ye birlikte yazılır.

## Klasör haritası

```
minik-usta/
├─ CLAUDE.md                bu dosya
├─ .claude/agents/          product-lead, design-lead, code-lead, entrepreneur
├─ docs/                    BRIEF, DECISIONS, REVIEW_LOG ve ajan belgeleri
├─ levels/                  level_001.json … level_050.json        (Faz 2–3)
├─ config/                  economy.json, events.json             (Faz 1–3)
├─ src/
│  ├─ core/                 saf, deterministik oyun mantığı (Phaser/DOM/gerçek zaman yok)
│  ├─ scenes/               Phaser sahneleri (şimdilik BootScene)
│  ├─ ui/  meta/  services/ arayüz bileşenleri, meta sistemler, kayıt/analytics/ses/i18n
│  ├─ theme/                tokens.json (design-lead), prosedürel doku üretimi
│  ├─ i18n/                 tr.json, en.json
│  └─ config/               display.ts (1080×1920 tasarım çözünürlüğü)
├─ tools/                   validate-levels, solve, playtest-bot, level-preview, screens
├─ tests/                   Vitest testleri (test adında kural kimliği: "K-17 …")
└─ artifacts/screens/       ekran görüntüleri (git dışı)
```

## npm komutları

| Komut                     | Ne yapar                                                    | Durum   |
| ------------------------- | ----------------------------------------------------------- | ------- |
| `npm run dev`             | Vite geliştirme sunucusu, `--host` ile aynı ağdaki telefondan | Hazır   |
| `npm run build`           | Tip denetimi + üretim derlemesi (`dist/`)                   | Hazır   |
| `npm run preview`         | Derlenmiş sürümü sunar                                      | Hazır   |
| `npm test`                | Vitest birim testleri                                       | Hazır   |
| `npm run typecheck`       | `tsc --noEmit`                                              | Hazır   |
| `npm run lint` / `format` | ESLint / Prettier                                           | Hazır   |
| `npm run check`           | typecheck + lint + format:check + test                      | Hazır   |
| `npm run levels:validate` | Bölüm JSON'larını zod şeması ve mantık kurallarıyla doğrular | Faz 2   |
| `npm run levels:solve`    | Solver: minimum hamle, çözüm dizisi, YAO                    | Faz 3   |
| `npm run levels:bot`      | Playtest botu (acemi/orta/usta × 500) → LEVEL_REPORT        | Faz 3   |
| `npm run levels:preview`  | Bölümlerin ASCII/PNG önizlemesi                             | Faz 3   |
| `npm run levels:check`    | validate + solve + bot                                      | Faz 3   |
| `npm run screens`         | Playwright ile 390×844 ekran görüntüleri → `artifacts/screens/` | Faz 2 |

Playwright önceden kurulu Chromium'u kullanır (`/opt/pw-browsers/chromium`); `playwright install` çalıştırılmaz.

## Dil kuralları

- Belgeler **Türkçe**. Kod, dosya adları, değişken adları ve commit mesajları **İngilizce**.
- Oyun içi tüm metinler i18n anahtarıyla (`src/i18n/tr.json`, `en.json`); varsayılan TR, ek EN. Kodda sabit metin yok.
- Büyük harf dönüşümü `toLocaleUpperCase('tr-TR')` ile (i → İ).
- Belirsiz ifade yasak: "genelde", "bazen", "uygun şekilde" yerine sayı ve koşul.

## Kural kimliği sistemi

- Oyun kuralları `docs/GDD.md`'de **K-xx** kimliğiyle (K-01, K-02 …) yazılır; her kural test edilebilir ve en az bir örnek içerir.
- Engeller **W** (duvar), **Y** (saha), **S** (şantiye), **G** (yerçekimi) önekleriyle (`docs/OBSTACLES.md`).
- Kararlar **D-xxx** (`docs/DECISIONS.md`). Durum: KABUL | ÖNERİ | RET.
- Her K-xx kuralının en az bir testi vardır; test adı kural kimliğini içerir. Kimlikler yeniden kullanılmaz.

## Fazlar

0 Kurulum → 1 Tasarım → 2 Dikey dilim → 3 İçerik → 4 Meta → 5 Cila. Her faz sonunda dur, proje sahibine özet + açık
sorular + sonraki faz planı sun, onay bekle; commit `phase-N: ...`. Faz 1 onaylanmadan oyun koduna geçilmez.

## Bitti tanımı (kalite çıtası)

- [ ] `npm test`, `npm run build`, `npm run levels:check` yeşil; konsolda hata yok.
- [ ] Orta seviye telefonda 60 FPS; Chrome DevTools 4× CPU yavaşlatmasında ≥ 50 FPS.
- [ ] Sürükleme: dokunuş ile blok hareketi arasında tek kare; blok parmağın altında kaybolmaz.
- [ ] 50 bölümün tamamı çözülebilir, her bölümde YAO ≥ %60, zorluk eğrisi hedef aralıklarda.
- [ ] İlk açılıştan Bölüm 1'e ≤ 10 saniye ve ≤ 3 dokunuş.
- [ ] Her GDD kuralının en az bir testi var.
- [ ] Tüm ekranların görüntüleri design-lead tarafından incelenmiş; açık kritik yorum yok.
- [ ] Tüm metinler i18n'de, TR/EN eksiksiz; Türkçe karakterler fontta doğru görünüyor.
