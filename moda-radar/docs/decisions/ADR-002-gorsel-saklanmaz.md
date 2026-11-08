# ADR-002: Ham görsel saklanmaz, yalnız çıkarılmış etiket saklanır

**Durum:** Kabul · 2026-11-08 · bas-mimar + veri-muhendisi

## Bağlam

Defile ve perakende görselleri telifli; perakende siteleri tarama konusunda hassas; görsellerde kişiler var.

## Karar

- Görsel bellekte işlenir (nitelik JSON + renk kümeleri + gömme vektörü üretilir) ve atılır. Diske yazılmaz, depoya girmez.
- Her kayıt `kaynak_url`, `tarama_tarihi`, `kaynak_turu` taşır; yeniden işleme gerekirse kaynaktan tekrar alınır.
- Segmentasyonda yüz bölgesi maskelenir; yüz gömmesi üretilmez.
- Saha fotoğrafı (pazar) için yönerge: tezgah ve ürün, insan yok; yine de yüz varsa kırpılır, orijinal silinir.
- Tarama hızı saniyede ≤ 1 istek; robots.txt'e uyulur; engellenen alan listesi `content/tarama-yasak.json`.

## Sonuçlar

Depo küçük kalır, telif ve kişisel veri riski düşer; bedeli, modeli yeniden eğitirken kaynağa tekrar gitmek.
