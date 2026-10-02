---
name: sprint
description: Köprü'de bir sprinti baştan sona yürütür (brief → plan kapısı → uygulama → otomatik kapı → uzman incelemesi → demo notu). "/sprint S02" gibi sprint numarasıyla çağrılır; ürün sorumlusu ajanı lider olarak kullanır.
---

# /sprint SNN

Argüman: sprint kimliği (ör. `S02`). Yoksa `docs/sprints/` altındaki en büyük numaranın bir fazlasını kullan.

1. `docs/ROADMAP.md`'den bu sprintin hedefini al. `docs/sprints/SNN/` klasörünü ve `reviews/` alt klasörünü oluştur.
2. **Brief** (`brief.md`): amaç, kapsam içi/dışı, ekran başına ölçülebilir kabul kriterleri, ilgili ilkeler, riskler.
3. **Plan kapısı:** `tasarimci` → `design.md` (ekran şartnameleri), `icerikci` → `content.md` + `content/` değişiklikleri.
   İkisini brief ile karşılaştır; çelişkileri brief'te karara bağla.
4. **Uygulama:** `kodcu`'yu brief, `design.md` ve `content.md` yollarıyla çağır.
5. **Otomatik kapı:** `npm run check`, `npm run e2e`, `SHOTS_DIR=docs/sprints/SNN/shots npm run shots`. Kırmızıysa kodcuya geri.
6. **Uzman incelemesi:** `tasarimci` ve `icerikci` → `reviews/<ajan>-1.md`. Engel/Önemli varsa sahibine düzelttir,
   inceleme turunu artır (`-2`, `-3`). **En fazla 3 tur.**
7. **Demo notu** (`demo.md`): yapılanlar, telefonda deneme adımları (önizleme bağlantısı veya `npm run dev:https`),
   kabul kriterleri tablosu (✓ / açık), açık sorular, birikim listesine düşen Öneriler (`docs/ROADMAP.md`'ye de ekle).
8. Kullanıcıya kısa özet ver ve onay iste. **Commit yalnızca onaydan sonra; push yapma.**
