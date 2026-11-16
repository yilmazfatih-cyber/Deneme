# Bilgi notu biçimi

Bu klasördeki her not aynı biçimdedir. Biçimi `python araclar/dogrula.py` denetler; denetimden geçmeyen not
depoya girmez. Örnek not: [`97-turkce/buyuk-kucuk-harf.md`](97-turkce/buyuk-kucuk-harf.md).

## Not kime yazılır

- **Küçük bir dil modeline:** bir işi yaparken bağlam olarak okuyacak. Uzun anlatıyı izleyemez; tabloyu, listeyi,
  kısa kod örneğini iyi kullanır. Ona _yargı_ lazım: hangi durumda hangisi, nerede tuzak var, bitince ne denetlenir.
- **Proje sahibine:** programcı değil; modeli yönlendirebilmek için kavramı ve doğru soruyu öğrenmek istiyor.

Bu yüzden not bir ders kitabı bölümü değil, **sahadan çıkmış bir çalışma kâğıdıdır**. Her modelin zaten bildiği
tanımları yinelemeyin; modelin (ve acemi bir insanın) yanlış yaptığı yerleri yazın.

## Dosya

- Yer: `bilgi/<küme>/<kisa-ad>.md` (küme: `10-diller` gibi; dosya adı küçük harf, ASCII, tireli).
- Bir not = bir konu. 60–520 satır. Uzuyorsa bölün ve birbirine bağlayın.
- Dil: Türkçe, yalın, yetişkin tonu. Terimin İngilizcesi ilk geçtiği yerde ayraç içinde: "geri çekilme (backoff)".

## Ön bilgi (zorunlu)

```markdown
---
baslik: Türkçe büyük/küçük harf dönüşümü
ozet: i/İ ve ı/I harflerinin neden bozulduğu, her dilde doğru dönüşüm ve arama için katlama.
etiketler: [turkce, metin, unicode]
duzey: temel
guncellik: 2026-11
---
```

| Alan        | Kural                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| `baslik`    | Notun `#` başlığıyla birebir aynı                                                        |
| `ozet`      | 30–220 karakter, tek cümle: not neyi çözer                                               |
| `etiketler` | 2–8 etiket; küçük harf, ASCII, tireli (`veri-tabani`)                                    |
| `duzey`     | `temel`, `orta` ya da `ileri`                                                            |
| `guncellik` | Yazıldığı ay (`YYYY-AA`). Sürüme bağlı bilgi içeren notta okur bunun yaşına göre davranır |

## Bölümler

```markdown
# <baslik>

> Bu notu ne zaman okumalı: bir-iki cümle.

## Temel fikir              ← kavramın özü; en çok 15 satır
## Karar tablosu            ← (varsa) "durum → seçim → neden"
## Nasıl yapılır            ← adımlar, kalıplar, çalışan küçük örnekler (başlığı konuya göre adlandırın)
## Tuzaklar                 ← ZORUNLU. Tablo: belirti → neden → çözüm
## Denetim listesi          ← ZORUNLU. İş bitince tek tek işaretlenecek maddeler
## Küçük modele yaptırırken ← ZORUNLU. İsteme ne yazılır; çıktıda ne denetlenir; modelin tipik hatası
## İlgili                   ← öteki notlara ve havuzdaki temellere bağlantılar
```

Zorunlu üç bölümün başlığı tam olarak böyle yazılır. Ötekileri konuya göre adlandırabilir, ekleyebilirsiniz.

## Kod örnekleri

- Kısa (çoğu 5–25 satır) ve **tek başına çalışır** olsun: önceki bloğa bağımlı olmasın.
- Çalıştırılarak doğrulanacak bloğun dil adından sonra `calistir` yazın. Doğrulayıcı bloğu boş bir klasörde çalıştırır;
  çıkış kodu 0 olmalıdır. Savınızı `assert` ile yazın.
- Hemen ardından bir `cikti` bloğu koyarsanız çıktı onunla birebir karşılaştırılır.
- Çalıştırılabilir diller: `python` (yalnız standart kütüphane), `js` ve `ts` (Node; yalnız yerleşik modüller),
  `sql` (bellek içi SQLite), `bash`. Dış paket isteyen ya da yalnız gösterim amaçlı kod `calistir` almaz.
- "Yanlış" örneği gösteriyorsanız üstüne açıkça yazın; yanlış kod da (yanlış sonucu `assert` ederek) çalıştırılabilir.

````markdown
```python calistir
assert "i".upper() == "I"  # Python yerel kural bilmez: Türkçe için YANLIŞ
print("tamam")
```

```cikti
tamam
```
````

## Doğruluk kuralları

1. **Ezberden sürüm, fiyat, sınır, model adı yazmayın.** Çabuk eskiyen bilgiyi ya hiç yazmayın ya da
   "(Kasım 2026, doğrulanmadı)" diye işaretleyin. Kalıcı olanı yazın: ilke, ödünleşim, yöntem.
2. **Uydurma kaynak, istatistik, alıntı yok.**
3. Bir iddiayı kodla gösterebiliyorsanız gösterin ve `calistir` ile kanıtlayın.
4. Hukuk, sağlık, finans gibi alanlarda "danışmanlık değildir" notu düşün ve genel ilkede kalın.
5. Emin olmadığınız yeri "emin değilim" diye yazın; okur ona göre doğrular.

## Bağlantılar

- Notlar arası bağlantı göreli yazılır: `[Oturum yönetimi](../30-arkauc/oturum.md)`.
- Havuzdaki koda bağlantı verin: bilgi, çalışan örneğe götürmelidir (`../../uygulama/…`, `../../kutuphane/…`).
- Doğrulayıcı kırık göreli bağlantıyı hata sayar.

## Doğrulama

```bash
python araclar/dogrula.py <küme-klasörü>
```
