# Köprü — ortak anayasa

Köprü, kelime bulmakta zorlanan afazili yetişkinlerin resimlerle kendini ifade etmesini (Modül A: pano) ve
zamanla kelimelerini geri kazanmasını (Modül B: öğrenme yolculuğu) sağlayan, internetsiz çalışan Türkçe bir PWA'dır.
Ürün planı: `docs/PLAN.md` · Yol haritası: `docs/ROADMAP.md` · Kararlar: `docs/decisions/`.

## On ilke (her inceleme bunlara göre yapılır)

1. **Önce görsel, sonra kelime:** Her öğe resim + kelime + ses üçlüsüyle gelir. Hiçbir işlev yalnızca okumaya dayanmaz.
2. **Bir ekranda bir iş:** Ekran başına tek birincil eylem; menü derinliği en fazla 3 seviye.
3. **Büyük ve tek elle:** Dokunma alanı en az 72 px (≈ 11 mm); sol el modu tüm düzeni aynalar.
4. **Yerler değişmez:** Bir kelimenin panodaki yeri sabittir. Sık kullanılanlar ayrı satırda durur, ızgarayı karıştırmaz.
5. **Hata affeder:** Her işlem geri alınabilir; onaysız silme yok; süre baskısı yok.
6. **Yetişkine saygı:** Çocuksu çizim, ton ve ödül yok. İçerik yetişkin hayatından: ilaç, banka, torun, iş.
7. **Önce kişisel:** Kendi fotoğrafları, kendi kelimeleri, ailesinin sesi hazır içerikten önce gelir.
8. **Başarısızlık hissettirmez:** Kırmızı çarpı yok, puan kaybı yok; ipucu her zaman bir dokunuş uzakta.
9. **Gizli ve çevrimdışı:** İlk açılıştan sonra internet gerekmez; reklam yok; veri telefonda kalır.
10. **Terapinin yerini almaz:** Uygulama pratik ve iletişim desteğidir; tedavi vaadinde bulunmaz.

## Komutlar

| Komut                      | Ne yapar                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`              | Geliştirme sunucusu (`npm run dev:https` telefonda mikrofon/SW için HTTPS)  |
| `npm run check`            | Tip denetimi + ESLint + Prettier + birim testler + içerik doğrulama         |
| `npm run validate:content` | `content/` altındaki JSON'ları Zod şemasıyla ve çapraz kurallarla doğrular  |
| `npm run e2e`              | Derler, Playwright ile 390×844 ve 360×800'de uçtan uca test + axe taraması  |
| `npm run shots`            | Her ekranın görüntüsü (`SHOTS_DIR=docs/sprints/SNN/shots npm run shots`)    |
| `npm run symbols`          | İçerikte kullanılan Mulberry sembollerini kopyalar (`MULBERRY_DIR` gerekir) |
| `npm run icons`            | `public/icons/icon.svg`'den PWA simgelerini üretir                          |

Önceden kurulu Chromium kullanmak için: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome`.

## Klasör sahipliği (her klasörün tek yazarı vardır)

| Yol                                                                                            | Sahibi                 |
| ---------------------------------------------------------------------------------------------- | ---------------------- |
| `CLAUDE.md`, `docs/PLAN.md`, `docs/ROADMAP.md`, `docs/sprints/*/brief.md`, `demo.md`           | urun-sorumlusu         |
| `docs/decisions/`                                                                              | urun-sorumlusu + kodcu |
| `src/` (`src/theme/tokens.ts` ve `src/i18n/tr.json` hariç), `tests/`, `scripts/`, yapılandırma | kodcu                  |
| `src/theme/tokens.ts`, `docs/design/`                                                          | tasarimci              |
| `content/`, `src/i18n/tr.json`, `docs/content/`, `public/symbols/`, `public/audio/`            | icerikci               |

Ajanlar birbirinin dosyasını değiştirmez; geri bildirim `docs/sprints/SNN/reviews/<ajan>-<tur>.md` dosyasına yazılır.
Her bulgu: **önem** (Engel / Önemli / Öneri) + **yer** (dosya veya ekran) + **somut düzeltme önerisi**.
Engel varsa iş geri döner; Önemli olanlar aynı sprintte kapanır; Öneriler `docs/ROADMAP.md` birikim listesine yazılır.

## Mimari özeti

- **Statik site, sunucu yok.** Kod `src/`, içerik `content/` (JSON), kişiye özel her şey IndexedDB'de (Dexie, `src/db`).
- **İçerik koddan ayrı:** İçerikçi yalnızca `content/` dosyalarını düzenler; `npm run validate:content` derlemeden önce doğrular.
  Şema: `src/content/schema.ts`.
- **Türkçe cümle kurma:** Çekim üretilmez. Kelime kartlarının `forms` alanındaki hazır biçimler kalıp kartlarıyla
  ("___ istiyorum") birleşir; hazır biçim yoksa kalıbın `fallback` metni kullanılır (`src/features/board/sentence.ts`).
- **Ses önceliği:** kişisel kayıt → `public/audio` hazır dosya → cihazın Türkçe sesi (`src/lib/speech.ts`).
- **Aralıklı tekrar:** 5 kutu (1, 2, 4, 7, 14 gün), 4 aşama (Tanı, Hatırla, Kullan, Sürdür) — `src/lib/srs.ts`.
- **Yönlendirme:** `HashRouter` — her statik barındırmada (GitHub Pages dahil) yenilemede 404 olmaz.
- Büyük harf her zaman `toLocaleUpperCase('tr-TR')` ile (`src/lib/text.ts`); `i → İ` hatası olmaz.

## "Bitti" tanımı (her ekran)

- [ ] Tüm dokunma alanları ≥ 72 px; 360 px genişlikte yatay kaydırma yok
- [ ] Her öğe resim + kelime + ses taşıyor
- [ ] Evet / Hayır / Geri sabit yerinde; sol el modunda düzen aynalanıyor
- [ ] Metinler yetişkin dilinde, cümleler en fazla 6 kelime, Türkçe karakterler doğru
- [ ] Uçak modunda çalışıyor
- [ ] Ekran okuyucu etiketleri var
- [ ] Hata durumunda kırmızı çarpı veya suçlayıcı metin yok
- [ ] 390×844 ve 360×800 ekran görüntüleri sprint klasöründe

## Kalite kapıları

1. **Plan kapısı** (ürün sorumlusu): tasarım şartnamesi ve içerik paketi kabul kriterleriyle uyumlu.
2. **Otomatik kapı** (kodcu): `npm run check` ve `npm run e2e` hatasız; axe taramasında kritik bulgu yok.
3. **Uzman incelemesi** (tasarımcı, içerikçi): Engel yok; Önemli bulgular kapandı.
4. **İnsan kapısı** (proje sahibi, mümkünse bir DKT ile): telefonda demo.

Bir sprintte en fazla **3 düzeltme turu**. Üçüncü turdan sonra Engel kalırsa lider durur, seçenekleri `demo.md`'ye yazar ve sorar.
Commit ancak insan onayından sonra atılır; `git push` insan tarafından yapılır.
