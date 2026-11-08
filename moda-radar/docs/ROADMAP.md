# Moda Radar — yol haritası

Her aşama bir "sezon" döngüsüyle (`/sezon <KOD>`) yürütülür. Aşama bitişi: `CLAUDE.md` "Bitti" tanımı + karne.

| Aşama               | Hedef                                                                                                                  | Kapsam dışı                                 | Kabul                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| **P0 Pilot**        | Yalnız **renk**, yalnız **kadın üst giyim**, yalnız **Zara TR ve LCW**. Podyum→raf gecikmesini iki geçmiş sezonda ölç. | Kumaş, desen, yatırım kartı, pazar segmenti | SS25 ve FW25 geriye testinde ilk 10 renk isabeti ≥ taban (a) ve (c); karne yayımlı |
| **P1 Nitelik**      | Taksonomi tam; kumaş görünümü, desen, siluet, detay çıkarımı; 5 İstanbul segmenti (pazar hariç)                        | Yatırım kartı                               | Çift etiketleme uyumu ≥ 0,80; nitelik yön doğruluğu > taban                        |
| **P2 Yatırım**      | Yatırım kartları, çıkış uyarısı, maliyet bantları; satın almacıyla 1 sezon paralel deneme                              | Yeni ülke                                   | 20 kartlık pilot listesi; satın almacı geri bildirimi belgelendi                   |
| **P3 Pazar + ülke** | Pazar segmenti (toptancı Instagram + saha fotoğrafı); ikinci ülke (aday: Almanya veya Körfez)                          | Gösterge paneli                             | Pazar segmenti gecikmesi ölçüldü; ikinci ülke yalnız `content/` ekleyerek çalıştı  |
| **P4 Ürün**         | Gösterge paneli, haftalık otomatik rapor (GitHub Actions), abonelik denemesi                                           |                                             | Haftalık rapor 4 hafta kesintisiz                                                  |

## Birikim listesi

- Coloro kütüphanesi eşlemesi (lisans sorulacak)
- Beden ve kalıp (fit) ekseni; Türkiye beden dağılımı
- Erkek giyim ve çocuk giyim kategorileri
- Dizi ve TikTok fenomen takibi için ayrı sinyal katmanı
- "Adsız trend" kümeleme uyarısı (gömme vektörü ile)
