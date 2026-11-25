---
name: ceviri-sprint
description: Canlı Çeviri'de bir sprinti baştan sona yürütür (brief → plan kapısı → uygulama → Mac derlemesi → uzman incelemesi → demo notu). "/ceviri-sprint S02" gibi sprint numarasıyla çağrılır; ceviri-lideri ajanını lider olarak kullanır.
---

# /ceviri-sprint SNN

Argüman: sprint kimliği (ör. `S02`). Yoksa `docs/sprints/` altındaki en büyük numaranın bir fazlasını kullan.
Yollar `canli-ceviri/` klasörüne göredir. Önce `CLAUDE.md` ve `docs/EKIP.md` dosyalarını oku.

1. `docs/ROADMAP.md`'den bu sprintin hedefini al. `docs/sprints/SNN/` klasörünü ve `reviews/`, `shots/` alt
   klasörlerini oluştur.
2. **Brief** (`brief.md`): amaç, kapsam içi / dışı, ölçülebilir kabul kriterleri, dosyalar arası sözleşmeler, ilgili
   ilkeler, riskler. Bir önceki sprintin `demo.md` dosyasındaki açık sorular ve `docs/cihaz-testi.md` sonuçları girdidir.
3. **Plan kapısı:** `ses-uzmani` → `docs/ses-hatti.md` güncellemesi ve `reviews/ses-uzmani-1.md`;
   `arayuz-denetcisi` → `docs/tasarim.md` güncellemesi ve `reviews/arayuz-denetcisi-1.md`. Çelişkileri brief'in
   "Kararlar" bölümünde karara bağla.
4. **Uygulama:** `ios-gelistirici` ve `web-gelistirici`'yi brief, şartname ve inceleme yollarıyla, aynı anda çağır.
5. **Otomatik kapı:**
   - `python3 scripts/swift-sozdizimi.py --proje`, `node tests/web-akis.cjs`; kök dosyalar değiştiyse `npm run check`.
   - Dala commit ve push; "Canlı Çeviri (iOS derleme)" iş akışının sonucunu ve kaydını oku. Kırmızıysa ya da uyarı
     varsa derleyici çıktısını olduğu gibi `ios-gelistirici`'ye geri ver.
   - Görüntüleri al: `git fetch origin canli-ceviri-ekran` ve dosyaları `docs/sprints/SNN/shots/` altına kopyala.
6. **Uzman incelemesi:** `ses-uzmani`, `arayuz-denetcisi`, `kalite-sorumlusu` → `reviews/<ajan>-<tur>.md`.
   Engel / Önemli varsa sahibine düzelttir, turu artır. **En fazla 3 tur.**
7. **Demo notu** (`demo.md`): yapılanlar, telefonda deneme adımları, kabul kriterleri tablosu (✓ / açık), simülatörde
   ve sahte servislerle doğrulananlar ile yalnız gerçek cihazda doğrulanabilecekler ayrı ayrı, açık sorular, birikime
   düşen Öneriler (`docs/ROADMAP.md`'ye de ekle).
8. Proje sahibine kısa özet ver. Kendi dalına commit ve push serbest; **varsayılan dala birleştirme ve yayın için sor.**

Bütçe: en fazla 12 alt görev. Alt ajanlar git kullanmaz ve birbirinin dosyasını değiştirmez.
