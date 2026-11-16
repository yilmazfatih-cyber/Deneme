# Bilgi hazinesi — model talimatları

## Bu klasör ne

Konu konu çalışma kâğıtları. Bir işe başlamadan önce ilgili notu oku: karar tablosu doğru yolu, "Tuzaklar"
bölümü kaçınılacak hatayı, "Denetim listesi" işin bittiğini nasıl anlayacağını, "Küçük modele yaptırırken" bölümü
senin tipik hatanı söyler.

## Komutlar (depo kökünden)

| Komut | Ne yapar |
| --- | --- |
| `python havuz/bilgi/araclar/ara.py "<soru>"` | En ilgili bölümleri bulur (dosya:satır ile) |
| `python havuz/bilgi/araclar/ara.py "<soru>" --tam --adet 1` | En iyi bölümün tamamını yazar |
| `python havuz/bilgi/araclar/dogrula.py <küme ya da dosya>` | Biçim, bağlantı, görünmez karakter ve kod örneklerini denetler |
| `python havuz/bilgi/araclar/dogrula.py --indeks` | Bütün notları doğrular, `INDEX.md` ve `indeks.json`'u yeniden üretir |

## Değişmez kurallar

1. Not biçimi [`BICIM.md`](BICIM.md)'deki gibidir; `dogrula.py` uygular. Zorunlu bölümler: `## Tuzaklar`,
   `## Denetim listesi`, `## Küçük modele yaptırırken`.
2. Kod örneği çalıştırılabiliyorsa `calistir` işareti alır ve `assert` ile savını kanıtlar. Örneği değiştirdiysen
   doğrulayıcıyı çalıştır; kırmızıysa örneği düzelt, `calistir` işaretini kaldırma.
3. Ezberden sürüm, fiyat, sınır, model adı yazma. Doğrulayamadığını "doğrulanmadı" diye işaretle.
4. Kod bloğunda görünmez karakter yazma; kaçış dizisi kullan (`"\u200b"`). Doğrulayıcı yakalar.
5. `INDEX.md` ve `indeks.json` elle düzenlenmez; `--indeks` ile üretilir.
6. Bir notu yeniden adlandırırsan ona verilen bağlantılar kırılır; doğrulayıcının listelediği her bağlantıyı düzelt.

## Tarifler

**Yeni not eklemek**

1. Doğru kümeyi seç (`README.md`'deki tablo). Benzer bir not varsa yeni not yerine ona bölüm ekle.
2. Örnek not olarak [`97-turkce/buyuk-kucuk-harf.md`](97-turkce/buyuk-kucuk-harf.md)'yi kopyala; ön bilgiyi ve
   bölümleri doldur.
3. Kod örneklerine `calistir` ekle; çıktıyı göstermek istiyorsan ardından `cikti` bloğu koy.
4. `python havuz/bilgi/araclar/dogrula.py <küme>/<dosya>.md` yeşil olsun.
5. `python havuz/bilgi/araclar/dogrula.py --indeks` ile dizini güncelle.

**Var olan notu güncellemek:** yalnız ilgili bölümü değiştir; `guncellik` alanını o ayla değiştir; doğrula.

## Sık hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "kırık bağlantı" | Hedef not yok ya da adı farklı | Dosya adını `ls` ile doğrula; göreli yolu düzelt |
| "çıktı `cikti` bloğuyla aynı değil" | Örnek değişti ya da sürüm farkı | Örneği çalıştır, gerçek çıktıyı incele; doğruysa `cikti`yi güncelle |
| "zorunlu bölüm eksik" | Başlık farklı yazılmış | Başlıkları `BICIM.md`'deki gibi birebir yaz |
| "kod bloğunda görünmez karakter" | Dosya yazma aracı `\u…` kaçışını karaktere çevirdi | Kaçış dizisini yeniden yaz; gerekirse `chr(0x200B)` kullan |
| Arama ilgili notu bulmuyor | Sözcük farklı | Eş anlamlı ya da daha genel sözcük dene; `INDEX.md`'ye bak |

## Bitti tanımı

- [ ] `dogrula.py` yeşil (kod örnekleri dahil)
- [ ] `INDEX.md` güncellendi
- [ ] Yeni bilgi doğrulanmış ya da "doğrulanmadı" diye işaretli
