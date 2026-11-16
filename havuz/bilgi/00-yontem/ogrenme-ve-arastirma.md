---
baslik: Öğrenme ve araştırma
ozet: Yeni bir teknolojiyi hızlı öğrenme, belge okuma sırası, küçük deneyle soru yanıtlama, kaynağın güvenilirliğini tartma ve bilgi kesim tarihinden yeni paketlerle kurulu sürümden doğrulayarak çalışma.
etiketler: [yontem, ogrenme, arastirma, belge, surum, deney]
duzey: temel
guncellik: 2026-11
---

# Öğrenme ve araştırma

> Bu notu ne zaman okumalı: tanımadığınız bir kütüphane ya da araçla çalışacaksanız; bir model bir API'yi "şöyle
> çağrılır" diye yazdığında; internette iki çelişen yanıt bulduğunuzda; ya da "bunu nasıl öğrenirim" diye
> başlarken.

## Temel fikir

Öğrenmenin en kısa yolu **çalışan en küçük örneğe** ulaşmak, sonra yalnız işinizin gerektirdiği yerde
derinleşmektir. Okuyarak değil, çalıştırarak öğrenilir: bir soruyu otuz saniyelik bir deney, yarım saatlik
aramadan kesin yanıtlar.

İkinci kural: **kurulu sürüm gerçektir.** Sizin, internetin ve dil modelinin bildiği şey eskimiş olabilir. Bir
paketin bir işlevi var mı, hangi parametreyi alır, ne döndürür; bunların yanıtı makinedeki paketin içindedir.
Kaynakları gerçeğe yakınlığına göre tartın; dil modeli yanıtı (bu not dahil) en alttadır ve doğrulanmadan
kullanılmaz.

## Karar tablosu: kaynağın güvenilirliği

| Kaynak                                          | Güven               | Neye dikkat                                                 |
| ----------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| Kurulu paketin kaynak kodu ve tip tanımları     | En yüksek           | Gerçekten kurulu sürüme mi bakıyorsunuz (`node_modules` içi) |
| Küçük bir deneyin çıktısı                       | En yüksek           | Deney sorulan şeyi mi ölçüyor                               |
| Sürüme özgü resmî belge                         | Yüksek              | Belgenin sürümü kurulu sürümle aynı mı                      |
| Değişiklik günlüğü (CHANGELOG), göç kılavuzu    | Yüksek              | Sürüm atlarken ilk okunacak yer                             |
| Bakımcıların konu (issue) yanıtları             | Orta-yüksek         | Tarih; sonradan düzeltilmiş mi                              |
| Soru-cevap siteleri                             | Orta                | Tarih, sürüm; yorumlarda "artık böyle değil" uyarısı        |
| Blog, eğitim videosu                            | Düşük-orta          | Tarih; hangi sürüm; yazar kodu çalıştırmış mı               |
| Dil modeli yanıtı                               | Düşük               | Var olmayan işlev ve seçenek uydurabilir                    |

Bir kaynağın değerini artıran işaretler: tarih ve sürüm yazıyor; çalıştırılabilir örnek var; yazar paketin
geliştiricisi; başkaları sonuçları doğrulamış. Azaltan işaretler: tarihsiz; "her zaman", "asla" gibi kesin
yargılar; kod parçası tek başına çalışmıyor.

## Yeni bir teknolojiyi hızlı öğrenme

1. **Neyi çözüyor?** Bir paragraf: hangi problemi çözüyor, temel kavramı (zihinsel model) ne. Örnek: "Dexie,
   tarayıcıdaki IndexedDB'yi sözlerle (promise) kullanılır hâle getirir; tablo ve dizin tanımı sürümle yapılır."
2. **Başlangıç örneğini harfiyen çalıştırın.** Değiştirmeden. Çalışmıyorsa sorun ortamdadır; önce onu çözün.
3. **Bir şeyi değiştirin, sonra bilerek bozun.** Hata iletilerini tanımak, ileride saatler kazandırır.
4. **Yalnız gereken 3–5 işlevin başvuru belgesini okuyun.** Bütün belgeyi değil.
5. **Sık sorunlar, göç kılavuzu, değişiklik günlüğü:** en çok zaman kazandıran sayfalardır.
6. **Kendi işinizin en küçük sürümünü kurun:** gerçek veriyle, gerçek akışın bir dilimi.
7. **Beş satırlık not yazın:** ne öğrendiniz, hangi tuzağa düştünüz, hangi komut işe yaradı.

Belge okuma sırası: README → başlangıç → kavramlar → (gerektikçe) başvuru → sürüm atlıyorsanız göç kılavuzu →
hata gibi görünen bir şey varsa konu (issue) listesi.

## Küçük deney kurma

Soru → beklenti → en küçük betik → `assert` → not. Deney, belgede aramaktan hızlıdır ve **çalışan sürüm** için
kesin yanıt verir. Soru: "`json.dumps` Türkçe harfleri olduğu gibi yazar mı?"

```python calistir
import json

out = json.dumps({"ad": "Çağrı"})
assert out == '{"ad": "\\u00c7a\\u011fr\\u0131"}'  # varsayılan: ASCII dışı harfler kaçış dizisine döner
assert json.loads(out)["ad"] == "Çağrı"  # veri bozulmaz; yalnız gözle okunmaz olur
readable = json.dumps({"ad": "Çağrı"}, ensure_ascii=False)
assert readable == '{"ad": "Çağrı"}'
print("varsayılan çıktıda Türkçe harf yok; ensure_ascii=False ile:", readable)
```

```cikti
varsayılan çıktıda Türkçe harf yok; ensure_ascii=False ile: {"ad": "Çağrı"}
```

Deneyin sonucu bir kuraldır: "İnsanın okuyacağı JSON dosyasına `ensure_ascii=False` ve `encoding='utf-8'` ile
yazılır." Bu kuralı nota ya da projenin kurallar dosyasına ekleyin.

## Bilgi kesim tarihinden yeni şeylerle çalışma

Dil modelleri belli bir tarihe kadarki bilgiyle eğitilir. Ondan sonra çıkan sürümlerde işlev adları değişmiş,
seçenekler kaldırılmış, yeni yollar eklenmiş olabilir. Model bunu bilmez ve eski bilgiyi kendinden emin yazar.
Yöntem:

1. **Kurulu sürümü öğrenin.**
2. **Paketin içine bakın:** README, değişiklik günlüğü, tip tanımları (`.d.ts`), kaynak.
3. **İmzayı çalışan ortamdan sorun.**
4. **Küçük bir deneyle doğrulayın.**
5. **Doğrulayamadığınızı "doğrulanmadı" diye işaretleyin.**

| Soru                    | Node / npm                                                              | Python                                                                     |
| ----------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Hangi sürüm kurulu?     | `npm ls paket`                                                          | `pip show paket`                                                           |
| Ne dışa aktarıyor?      | `node -e "import('paket').then(m => console.log(Object.keys(m)))"`      | `python -c "import paket; print(dir(paket))"`                              |
| İşlevin imzası ne?      | `node_modules/paket/` altındaki `.d.ts` dosyaları                       | `python -c "import inspect, paket; print(inspect.signature(paket.f))"`     |
| Ne değişti?             | `node_modules/paket/CHANGELOG.md`                                       | Paketin `site-packages` altındaki klasörü ve `*.dist-info/METADATA`        |
| Belgeyi ağsız okumak    | Paketin README'si                                                       | `python -m pydoc paket.f`                                                  |

Python'da aynı denetimler kodun içinden de yapılır:

```python calistir
import inspect
import json
import sys
from datetime import datetime

# 1) Parametre gerçekten var mı? Ezberden değil, çalışan sürümden sor.
assert "ensure_ascii" in inspect.signature(json.dumps).parameters

# 2) Sürüme bağlı özellik: datetime.UTC Python 3.11 ile geldi
if sys.version_info >= (3, 11):
    from datetime import UTC
else:
    from datetime import timezone

    UTC = timezone.utc
assert datetime.now(UTC).tzinfo is not None

# 3) Bir modelin önerdiği işlev gerçekten var mı?
assert not hasattr(json, "dumps_pretty")  # yok: uydurma
print("tamam")
```

```cikti
tamam
```

Node'da yerleşik bir modülün kurulu sürümde ne sunduğuna bakmak:

```bash calistir
node -e "
const util = require('node:util')
const fs = require('node:fs')
console.log('util.parseArgs:', typeof util.parseArgs)
console.log('fs.globSync:', typeof fs.globSync)
console.log('util.olmayanIslev:', typeof util.olmayanIslev)
"
```

```cikti
util.parseArgs: function
fs.globSync: function
util.olmayanIslev: undefined
```

## Tuzaklar

| Belirti                                                  | Neden                                                 | Çözüm                                                       |
| -------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Eğitimdeki kod "böyle bir dışa aktarma yok" hatası veriyor | Eğitim eski ana sürüm için                          | Önce kurulu sürümü öğrenin; göç kılavuzunu okuyun           |
| Kodun yarısı eski, yarısı yeni API                       | İki sürümün örnekleri karıştı                         | Tek bir sürümün belgesine bağlı kalın                       |
| Model bir seçenek yazdı, paket onu sessizce yok sayıyor  | Seçenek uydurma ya da kaldırılmış                     | Seçeneğin adını tip tanımında arayın                        |
| Belgedeki örnek çalışmıyor                               | Belge "en son" sürüm için; kurulu olan eski           | Belgenin sürüm seçicisinden kurulu sürüme geçin             |
| `require('paket/package.json')` hata veriyor             | Paketin `exports` alanı bu yolu açmıyor               | `npm ls paket` kullanın                                     |
| Saatlerdir forumda çözüm aranıyor                        | Hata iletisi okunmadı; deney yapılmadı                | İletiyi okuyun; en küçük yeniden üretimi kurun              |
| Bir haftadır "öğreniliyor", iş başlamadı                 | Her şeyi öğrenme çabası                               | En küçük çalışan örnek; işin gerektirdiği kadar derinlik    |
| Bulunan yanıt altı yıl önceye ait                        | Tarih denetlenmedi                                    | Tarih ve sürüm yazmayan kaynağı deneyle doğrulayın          |

## Denetim listesi

- [ ] Kullanılan her paketin kurulu sürümü biliniyor (komutla bakıldı).
- [ ] Kullanılan her işlev ve seçenek kurulu paketin tip tanımında ya da kaynağında görüldü.
- [ ] Belirsiz davranışlar küçük bir deneyle sınandı; sonuç kural olarak yazıldı.
- [ ] Kaynakların tarihi ve sürümü denetlendi.
- [ ] Doğrulanamayan bilgi "doğrulanmadı" diye işaretlendi.
- [ ] Öğrenilen tuzaklar beş satırlık bir nota ya da projenin kurallar dosyasına eklendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu paketin kurulu sürümünü ve tip tanımlarını oku, sonra yaz. Ezberden API kullanma.
  Kullandığın her işlev ve seçenek için tip tanımındaki satırı göster. Emin olmadığın davranış için önce küçük bir
  deney yaz ve çalıştır." Havuzdaki temellerde paket sürümleri ilgili `package.json` ya da `pyproject.toml`
  dosyasında ve kilit dosyasındadır.
- **Modelin tipik hatası:** var olmayan işlev ya da seçenek uydurur; bir paketin eski ana sürümünün API'sini
  yazar; iki sürümü karıştırır; "bu sürümde şu özellik var" der ama bakmamıştır; deney yerine uzun açıklama yazar.
- **Çıktıda denetleyin:** modelin kullandığı her adı `node_modules` ya da `site-packages` içinde arayın; kodu
  çalıştırın; "doğrulanmadı" işareti olmadan yazılmış sürüm, sınır, fiyat bilgisine güvenmeyin.

## İlgili

- [Problem çözme döngüsü](problem-cozme-dongusu.md): varsayımı sınama.
- [Yabancı kod okuma](yabanci-kod-okuma.md): bilinmeyen bir kod tabanında yön bulma.
- [Hata ayıklama](hata-ayiklama.md): hata iletisini okumak.
- Havuzun ortak sürüm ve doğrulama kuralları: [STANDARTLAR.md](../../STANDARTLAR.md) (§8).
