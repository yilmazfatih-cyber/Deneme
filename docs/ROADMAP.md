# Yol haritası

Durum: ✓ yapıldı · ◐ kısmen · ○ yapılmadı

## Faz 0 — Temel (S00) ✓

- ✓ Vite + React + TypeScript (strict) + PWA iskeleti, HashRouter, Dexie, Zustand
- ✓ `npm run check`, `npm run e2e`, `npm run shots`, `npm run validate:content`
- ✓ Tasarım token'ları (`src/theme/tokens.ts`), Atkinson Hyperlegible Next (ğ, ş, ı, İ, ç, ö, ü sınandı)
- ✓ İçerik şeması (Zod) ve çapraz doğrulama; Mulberry sembol içe aktarma betiği
- ✓ CLAUDE.md, 4 ajan, `/sprint`, izinler
- ○ Yerel HTTPS dışında sprint başına önizleme bağlantısı (Netlify/Cloudflare) — hesap sahibi kurmalı

## Faz 1 — Modül A: iletişim panosu (S01) ✓

- ✓ Ana ekran, hızlı ihtiyaçlar, kategori panosu (3 seviye), cümle şeridi, hazır cümleler, kalıp kartları
- ✓ Sık kullanılanlar satırı, ilk harf/hece ile bulma, sayfalı ızgara, tutma süresi, sol el aynalama
- ✓ Vücut haritası + 0–10 ağrı ölçeği, partner ekranı, Ben kartı
- ✓ Kişisel kart (fotoğraf, kelime, ses kaydı, hazır kartın yerine geçme), kurulum sihirbazı, yedek/geri yükleme
- ◐ Tüm sabit metinler için hazır ses dosyaları (Piper, `public/audio`) — üretim iş akışı hazır; insan sesiyle kayıt değerlendirilsin
- ○ 5 afazili kullanıcıyla test (DKT ve afazi dernekleri aracılığıyla)

## Faz 2 — Modül B: öğrenme yolculuğu (S01'de öne çekildi) ◐

- ✓ 8 durak, 4 aşama, 6 basamaklı ipucu, 3 düğmeli değerlendirme, 5 kutulu aralıklı tekrar
- ✓ Isınma (otomatik diziler), eşleştirme, dinle-seç, adlandırma, cümle tamamlama, dinle-tekrar et-kaydet, gündelik senaryo
- ✓ Otomatik zorluk (seçenek sayısı 2–4), mola önerisi, nötr özet, haftalık ilerleme
- ✓ Panodan yolculuğa öneri, panoda "artık söyleyebiliyorsun" işareti
- ✓ Terapist ayarları (durak sırası, azalan/artan ipucu, oturum uzunluğu, hedef kelime), CSV ve yazdırılabilir rapor
- ○ İpucu basamaklarının sırasını tek tek değiştirme (şimdilik yalnız azalan/artan)
- ○ İlk ses ipucu için kayıtlı ses (şimdilik ilk hece okunur, tek heceli kelimede yalnız gösterilir)
- ○ DKT içerik incelemesi (ipuçları, cümle tamamlamalar, durak kelimeleri)

## Faz 3 — Genişleme ○

- ○ Bağlam sahneleri (mutfak fotoğrafında dokunulabilir nesneler), zamana göre öneri
- ○ Anlam özelliği çarkı, hangisi farklı, heceleri diz, sahnede bul
- ○ Ünlü uyumu kurallarıyla basit çekim yardımcısı
- ○ Karanlık mod

## Birikim listesi (Öneriler)

- Uzun kelimeli kartlarda etiket 22 px'ten 14 px'e kadar küçülüyor; 2 sütunlu düzen ya da kısaltılmış etiket değerlendirilsin (tasarım).
- Bazı semboller yaklaşık: eczane (ecza dolabı), hastane (ambulans), torunum (büyükanne-büyükbaba ve çocuk) — kişisel fotoğrafla değiştirilmeli (içerik).
- Cami kartı uygun sembol olmadığı için eklenmedi; kişisel fotoğrafla eklenebilir (içerik).
- Duygu sembollerinde kadın/erkek seçimi var; aile/kişi kartlarında da figür seçeneği değerlendirilsin.
- Kod bölme (bakım veren ekranlarını ayrı paket) — ilk yükleme ~185 kB gzip.
