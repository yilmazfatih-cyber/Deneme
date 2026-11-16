---
title: Klasör yapısı
description: Hangi dosyanın ne işe yaradığı ve neyi değiştirmek için nereye bakmanız gerektiği, tek sayfada.
group: Başlangıç
order: 20
---

Sitenin tamamı tek bir klasörde durur. Günlük işlerin neredeyse hepsi iki yerde yapılır: **`src/site.config.ts`** ve **`src/content/`**.

## Sık dokunulan yerler

| Yol | Ne işe yarar? |
| --- | --- |
| `src/site.config.ts` | Site adı, adresi, dilleri, menü, alt bilgi, iletişim bilgileri, marka renkleri |
| `src/content/blog/<dil>/` | Blog yazıları (Markdown ya da MDX) |
| `src/content/belgeler/<dil>/` | Bu belgeler gibi, yan menülü kılavuz sayfaları |
| `src/content/sayfalar/<dil>/` | Hakkında, gizlilik gibi tek tek sayfalar |
| `src/content/anasayfa/<dil>.json` | Ana sayfanın başlıkları ve metinleri |
| `src/content/ozellikler/`, `sss/`, `fiyatlar/`, `referanslar/`, `ekip/` | Ana sayfadaki listeler |
| `src/i18n/tr.ts`, `en.ts` | Düğme, etiket ve hata iletisi gibi arayüz metinleri |

## Ara sıra dokunulan yerler

| Yol | Ne işe yarar? |
| --- | --- |
| `astro.config.ts` | Yazı tipleri ve teknik ayarlar |
| `src/views/HomeView.astro` | Ana sayfa bölümlerinin sırası |
| `src/components/` | Başlık, alt bilgi, kartlar, form gibi yapı taşları |
| `src/styles/global.css` | Düğme, kart, metin gibi ortak görünümler |
| `src/lib/theme.ts` | Zemin, metin ve çizgi renkleri (nötr tonlar) |

## Dokunmanız gerekmeyen yerler

- `dist/` ve `dist-alt/`: derleme çıktısı. Her derlemede baştan üretilir.
- `node_modules/`: kurulan paketler. `npm ci` ile yeniden oluşur.
- `.astro/`: Astro'nun kendi önbelleği.

> [!NOTE]
> Bir dosyanın ne işe yaradığından emin değilseniz dosyanın en üstündeki açıklamaya bakın. Bu temeldeki her kaynak dosya, ne yaptığını ve nasıl genişletileceğini anlatan kısa bir Türkçe başlıkla açılır.
