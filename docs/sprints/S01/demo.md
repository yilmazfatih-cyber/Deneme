# S01 demo notu

## Ne yapıldı

- **Altyapı:** Vite + React + TypeScript (strict) PWA, IndexedDB (Dexie), içerik şeması (Zod), ESLint/Prettier,
  Vitest (46 birim test), Playwright (2 telefon boyutunda 28 uçtan uca test + axe), ekran görüntüsü betiği, CI iş akışı.
- **Modül A:** ana ekran, hızlı ihtiyaçlar, 19 kategorili pano, cümle şeridi (geri alınabilir temizle), hazır cümleler,
  5 kalıp, harf/hece ile bulma, sık kullanılanlar satırı, vücut haritası + ağrı ölçeği, partner ekranı, Ben kartı.
- **Modül B:** 8 durak, 4 aşama, 6 basamaklı ipucu, 3 düğmeli değerlendirme, 5 kutulu tekrar, ısınma, eşleştirme,
  dinle-seç, adlandırma, cümle tamamlama, gündelik senaryo, dinle-tekrar et-kaydet, otomatik zorluk, mola önerisi,
  haftalık ilerleme, panodan öneri ve "artık söyleyebiliyorsun" işareti.
- **Bakım veren / terapist:** kişisel kart (fotoğraf + kelime + ses; hazır kartın yerine geçebilir), görünüm ve ses
  ayarları, Türkçe ses testi, kurulum sihirbazı, durak sırası, azalan/artan ipucu, CSV ve yazdırılabilir rapor,
  `.zip` yedek/geri yükleme, kalıcı depolama, aylık yedek hatırlatması.
- **İçerik:** 152 kelime kartı, 163 Mulberry sembolü, arayüz metinleri.
- **Kit:** `CLAUDE.md`, 4 ajan, `/sprint`, izinler, plan/yol haritası/kararlar/tasarım/içerik belgeleri.

## Telefonda nasıl denenir

1. Bilgisayarda: `npm install` ve `npm run dev:https`.
2. Telefon aynı Wi-Fi'de: çıktıdaki `https://<bilgisayar-ip>:5173` adresini açın, sertifika uyarısını kabul edin.
3. Kurulum sihirbazını geçin (sol el seçeneğini deneyin), **Ses testi**'ne dokunun.
4. **Konuş → Hızlı ihtiyaçlar → Su**: "Su istiyorum" duyulmalı.
5. **Konuş → Sonraki → Kalıplar → "\___ ağrıyor" → Vücut → Baş**: "Başım ağrıyor".
6. **Ayarlar → Kişisel kartlar → Kart ekle**: fotoğraf çekin, "Elif" yazın, sesinizi kaydedin; Konuş → Kişiler'de en başta görünmeli.
7. **Öğren → Bugünkü pratiğe başla**: ısınma, ardından eşleştirme / dinle-seç; sonda "Bugün N kelime çalıştın."
8. Gerçek kurulum için `npm run build` ve `dist/` klasörünü Netlify / Cloudflare Pages'e yükleyin; adresi telefonda
   açıp "Ana ekrana ekle" deyin, sonra uçak modunda açın.

Ekran görüntüleri: `shots/telefon-390/`, `shots/telefon-360/`.

## Kabul kriterleri

| #      | Durum | Not                                            |
| ------ | ----- | ---------------------------------------------- |
| K1–K13 | ✓     | Tümü otomatik testlerle doğrulandı (Chromium). |

## Açık sorular ve bilinen sınırlar

1. **DKT incelemesi yapılmadı.** İpuçları, cümle tamamlamalar, durak kelimeleri ve aşama geçiş eşikleri bir dil ve konuşma
   terapistince gözden geçirilmeli. Kullanıcı testinden önce gerekli.
2. **Hazır ses dosyası yok.** Tüm okumalar cihazın Türkçe sesiyle ya da kişisel kayıtla. Hızlı ihtiyaçlar + en sık 300 kelime
   için seslendirme yapılacak mı, kim seslendirecek?
3. **Uzman ajan incelemeleri** (`reviews/`) bu sprintte yürütülmedi; tasarım ve içerik kontrolleri otomatik testlere
   (dokunma alanı, kontrast, yatay kaydırma, axe, ton) dayanıyor. Bir sonraki sprint `/sprint` akışıyla tam yürütülmeli.
4. **iOS Safari ve gerçek cihaz** denenmedi; testler masaüstü Chromium'da telefon boyutunda çalıştı. Mikrofon kaydı ve
   "Ana Ekrana Ekle" iOS'ta elle denenmeli.
5. **Uzun kelimeli kartlar** 3 sütunda 22 px'ten küçülüyor (en az 14 px). 2 sütun varsayılanı mı tercih edilmeli?
6. **Yaklaşık semboller** (eczane, hastane, torunum) — `docs/content/icerik-rehberi.md`.
7. **Önizleme bağlantısı** (Netlify/Cloudflare) hesap sahibince kurulmalı.
