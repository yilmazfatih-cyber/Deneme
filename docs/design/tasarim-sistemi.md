# Tasarım sistemi

Kaynak değerler: `src/theme/tokens.ts` (CSS değişkeni olarak köke uygulanır). Kontrastlar `tests/unit/tokens.test.ts`
ile doğrulanır. Görsel dil sakin, sıcak ve yetişkin: kırık beyaz zemin, az ama anlamlı renk, büyük kartlar, tek tip piktogram.

## Renk

| Rol                    | Renk      | Kontrast            | Not                                                    |
| ---------------------- | --------- | ------------------- | ------------------------------------------------------ |
| Zemin                  | `#FAF8F5` | —                   | Saf beyazdan daha az parlar                            |
| Ana metin              | `#1F2328` | 14,9:1 zeminde      |                                                        |
| İkincil metin          | `#4A5160` | 7,5:1 zeminde       |                                                        |
| Birincil eylem (mavi)  | `#1B4F9C` | 7,9:1 beyaz yazıyla | Söyle, Devam                                           |
| Evet (yeşil)           | `#1E7B3C` | 5,3:1 beyaz yazıyla | Her zaman ✓ simgesi ve "Evet" yazısıyla                |
| Hayır / Acil (kırmızı) | `#B3261E` | 6,5:1 beyaz yazıyla | Her zaman ✕ ve "Hayır" ile; hata mesajında kullanılmaz |
| Kenarlık               | `#8A8F98` | 3,1:1 zeminde       |                                                        |

Kategori kenarlıkları (Fitzgerald anahtarından uyarlandı; yalnız kenarlık, hepsi zemine karşı ≥ 3:1):
kişiler sarı `#A07800` · eylemler yeşil `#2E7D32` · nesneler turuncu `#B85A00` · yerler mor `#6F42C1` ·
duygular ve sohbet pembe `#C2185B` · sorular mavi `#1565C0`.

> Sarı, plandaki açık sarıdan koyulaştırıldı: açık sarı zemine karşı 3:1'i geçmiyordu.

Renk tek başına anlam taşımaz: her anlam simge + kelime + konumla da verilir. Yüksek kontrast modu beyaz zemin, siyah
metin ve 4 px kenarlık kullanır. Karanlık mod Faz 3'te.

## Tipografi

- Atkinson Hyperlegible Next 400/700; Türkçe karakterler latin + latin-ext alt kümelerinde.
- Kart etiketi 22 px, gövde 18 px, başlık 26 px, partner ekranı 44 px; "Büyük yazı" +%30.
- **pt ve px:** plandaki "22 pt" mobil (iOS noktası) birimidir ve CSS px'e eşittir; 22 px uygulandı.
- **Uzun kelimeler:** 3 sütunda en uzun sözcük karta sığmazsa etiket sözcük bölünmeden küçülür (en az 14 px;
  `--len` + kapsayıcı sorgu birimi). Heceden bölünmüş etiket ("Yumurt-a") okunurluğu bozduğu için bu tercih edildi.
- Tümü büyük harf yok; büyük harf gereken yerde `toLocaleUpperCase('tr-TR')`.

## Dokunma ve düzen

- Dokunma alanı ≥ 72 px (Playwright testi tüm görünür düğmeleri ölçer); kartlar arası 12 px; kenar boşluğu 16 px.
- Yalnız tek dokunuş; kaydırma, uzun basma ve çift dokunma zorunlu değil. Sayfalar "Önceki / Sonraki" ile değişir.
- "Dokunmayı tutma süresi" (0 / 0,3 / 0,6 / 1 sn): kart basılı tutulunca altında dolan çubuk; klavye ve ekran okuyucu hemen seçer.
- **Alt çubuk:** Geri · Evet · Hayır her ekranda aynı yerde. Sol el modunda sıra, şerit düğmeleri, ızgara ve sayfa
  düğmeleri aynalanır.
- Görme alanı kaybı için "Tek sütun" ve "Ekranın sol yarısı" (en fazla 2 sütun, içerik sol %62'de) düzenleri.

## Kart anatomisi

Üstte resim (alanın ~%70'i, `object-fit: contain`; fotoğrafta `cover`), altta kelime, kategori renginde 4 px kenarlık,
14 px köşe. Seçilince 0,7 sn kalın çerçeve ve açık mavi zemin; kelime sesli okunur. "Artık söyleyebiliyorsun"
işareti sağ üstte küçük yeşil onay halkası (ödül değil, bilgi).

## Ekranlar ve yerleşim (360 × 800)

```
┌──────────────────────────────┐
│ Cümle şeridi (56)            │
│ [Söyle][Geri al][Temizle][Göster] (72)
│ [hazır cümle][hazır cümle] (72)
│ ┌────┐┌────┐┌────┐           │
│ │kart││kart││kart│  ızgara   │  satırlar kalan yüksekliği paylaşır (≥ 72)
│ └────┘└────┘└────┘           │
│ [Önceki]  Başlık  [Sonraki]  │
├──────────────────────────────┤
│ [ Geri ][ Evet ✓ ][ Hayır ✕ ]│  sabit alt çubuk (88)
└──────────────────────────────┘
```

Vücut haritası: 240×400 birimlik çizim, en dar bölge 54 birim (360 px ekranda ≈ 74 px).
Ağrı ölçeği: 0, 2, 4, 6, 8, 10 — sade yüzler, 2 sütun.

## Hareket ve ses

Animasyon yalnız seçim çerçevesi ve tutma çubuğu; `prefers-reduced-motion` açıkken kapalı. Başarı geri bildirimi
iki notalı yumuşak bir ton; konfeti, alkış, karakter yok.

## Piktogramlar

Mulberry Symbols (CC BY-SA 4.0), değiştirilmeden. Kişisel fotoğraflar her zaman sembolden önce gelir.
Simgeler (`src/components/Icon.tsx`) yalnız arayüz eylemleri için ve her zaman bir kelimeyle birlikte.
