# Kâhya — çalışma kuralları

Kâhya, Türkiye’deki site yönetim şirketleri için yapay zekâ destekli yönetim yazılımıdır. Ürün özeti: `README.md`.
Mimari: `docs/MIMARI.md` · Yapay zekâ: `docs/YAPAY_ZEKA.md` · Hukuk: `docs/HUKUK_VE_UYUM.md` · Kurulum: `docs/KURULUM.md`.

Bu klasör depodaki Köprü projesinden bağımsızdır; Köprü’nün ajan ve klasör sahipliği kuralları burada geçerli değildir.

## Komutlar (kahya/ içinde)

| Komut           | Ne yapar                                  |
| --------------- | ----------------------------------------- |
| `npm run dev`   | API + arayüz, demo verisi                 |
| `npm run check` | `tsc -b` + Vitest (birim ve API testleri) |
| `npm run e2e`   | Derler, Playwright uçtan uca akışlar      |
| `npm run shots` | `docs/ekran/` ekran görüntüleri           |

Biçim ve lint depo kökünden: `npx prettier --write kahya` · `npx eslint kahya` (kök CI bunları denetler).

## Kurallar

1. **Para kuruştur (tamsayı).** Bölüştürmede `splitByWeights` (en büyük kalan) kullanılır; toplam kuruşu kuruşuna korunur.
2. **İş tarihleri İstanbul saatine göre `YYYY-AA-GG`**; `server/domain/dates.ts` dışında tarih aritmetiği yazılmaz.
3. **Her sorgu kuruluşa göre süzülür.** Site kaydına `assertSite`, birime `assertUnit`, sakine `assertResidentUnit` ile erişilir.
   Yeni uç eklerken `tests/api/app.test.ts` içindeki kuruluş izolasyonu testine bir satır ekleyin.
4. **Dil modeline yalnız `AIService` üzerinden gidilir;** metin `maskPII` ile maskelenir, yanıt `unmask` ile geri konur.
   Kişisel veri sunucu günlüğüne yazılmaz.
5. **Para, tarih ve hukuki hesap deterministik koddur;** model yalnız metni anlar ve yazar. Hatırlatma ve tutanak şablonla üretilir.
6. **KMK kuralları madde numarasıyla yorumlanır** (`domain/ledger.ts`, `domain/quorum.ts`, `shared/labels.ts`). Kural değişirse
   `docs/HUKUK_VE_UYUM.md` aynı commit’te güncellenir.
7. **Arayüz metinleri Türkçe, kısa ve saygılı;** büyük harf `toLocaleUpperCase('tr-TR')` ile.
8. **Silme yok, iptal var:** tahsilat ve borç kayıtları `status = 'iptal'` olur; önemli işlemler `audit()` ile günlüğe yazılır.
9. Şema değişikliği `server/db/schema.ts` → `MIGRATIONS` dizisine **yeni sürüm** olarak eklenir; eski sürümler değiştirilmez
   (ilk canlı kurulumdan sonra).
10. TypeScript yalnız silinebilir sözdizimiyle yazılır (`erasableSyntaxOnly`): enum, namespace, parametre özelliği yok;
    göreli içe aktarmalar `.ts` uzantısıyla.
