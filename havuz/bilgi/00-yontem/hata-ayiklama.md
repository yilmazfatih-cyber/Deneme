---
baslik: Hata ayıklama
ozet: Yeniden üret, en küçük örneğe indir, hipotez kur, tek değişkeni değiştir, doğrula; kodda ve geçmişte ikili arama, günlükleme taktikleri ve "düzeldi ama neden" durumu.
etiketler: [yontem, hata-ayiklama, ikili-arama, gunlukleme, git-bisect]
duzey: orta
guncellik: 2026-11
---

# Hata ayıklama

> Bu notu ne zaman okumalı: bir şey beklenmedik davranıyorsa; hata iletisi anlamsız geliyorsa; "dün çalışıyordu"
> diyorsanız; bir hata bazen çıkıp bazen çıkmıyorsa; ya da bir düzeltme işe yaradı ama nedenini bilmiyorsanız.

## Temel fikir

Hata ayıklama bir **arama** işidir: hata bir yerde duruyor, siz yerini bilmiyorsunuz. Her adım ya arama alanını
daraltmalı ya da bir hipotezi sınamalıdır. Rastgele değişiklik ikisini de yapmaz. Sıra şudur:

1. **Yeniden üret** — tek komutla, her seferinde.
2. **Küçült** — hatayı hâlâ üreten en küçük girdiye, en kısa adımlara in.
3. **Hipotez kur** — "X yüzünden; öyleyse Y'yi değiştirirsem hata kaybolur."
4. **Tek değişkeni değiştir** — sonucu gör; etkisizse geri al.
5. **Doğrula ve kalıcılaştır** — kök nedeni düzelt, düzeltmesiz kodda kalan bir gerileme testi yaz.

Üretemediğiniz hatayı düzelttiğinizi kanıtlayamazsınız. Bu yüzden ilk iş her zaman yeniden üretmektir.

## Karar tablosu

| Durum                                       | İlk teknik                                                      | Neden                                        |
| ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Hata her seferinde çıkıyor                  | Tek komutluk yeniden üretim → küçültme                          | En hızlı yol; hipotezi kolay sınanır         |
| "Dün çalışıyordu"                           | Geçmişte ikili arama (`git bisect`)                             | log₂(n) denemede suçlu kaydı bulur           |
| Büyük girdide patlıyor (dosya, istek, veri) | Girdiyi ikiye bölerek küçültme (delta debugging)                | Hatayı tetikleyen birkaç satır kalır         |
| Bazen çıkıyor                               | Koşulları topla, tohumlu tekrarla, zamanlamayı günlüğe yaz      | Yarış, saat, sıra ya da önbellek kokusu      |
| Yalnız sunucuda / yalnız telefonda          | Ortam farkını listele (sürüm, ayar, veri, saat dilimi, dil)     | Kod aynı; değişen ortamdır                   |
| Uzun bir işlem zincirinin sonu yanlış       | Kodda ikili arama: zincirin ortasında ara değeri denetle        | Yanlış değerin doğduğu adımı bulur           |
| Hata iletisi var                            | İletinin tamamını oku; kendi kodundaki ilk satıra git           | Yanıtın yarısı çoğu zaman iletidedir         |
| Yavaşlık                                    | Ölçüm (bkz. [Performans yöntemi](performans-yontemi.md))         | Tahmin edilen darboğaz çoğu zaman yanlıştır |

## Adım adım: bir örnek

Belirti: "Bölüş'te grup bakiyesi bazen 1 kuruş tutmuyor."

1. **Yeniden üret.** "Bazen" yetmez. Hangi grup, hangi harcamalar? Kayıtlardan bir örnek bulun: 100 TL, üç kişi.
   Bunu tek komutluk bir sınamaya çevirin: `npm test -- bakiye`. Artık her seferinde kırmızı.
2. **Küçült.** Grupta 40 harcama var. Yarısını silin: hata sürüyor mu? Sürüyorsa o yarıyla devam edin. Sonunda
   tek harcama kalır: 100 TL / 3.
3. **Hipotez kur.** İki aday: (a) tutar ondalıklı sayı (`float`) olarak bölünüyor; (b) yuvarlama her kişide ayrı
   yapılıyor, artan kuruş kimseye yazılmıyor. Her biri ne öngörüyor? (a) ise `33.333333…` ara değeri görülür; (b)
   ise paylar `33,33 × 3 = 99,99` olur.
4. **Tek değişken.** Bölüştürme işlevinin çıktısını yazdırın: `[3333, 3333, 3333]` kuruş. (b) doğrulandı; (a) da
   olabilir ama sonucu değiştirmiyor. Düzeltme: en büyük kalan yöntemi, artan kuruş ilk kişilere.
5. **Doğrula.** Sınama yeşil. Düzeltmeyi geri alın: kırmızıya dönüyor mu? Dönüyorsa test gerçekten bu hatayı
   yakalıyor. Aynı kalıbı başka yerde arayın (`grep -rn "Math.round(" src/`): başka bölüştürme var mı?

Kök nedeni hatanın **görüldüğü** yerde değil **doğduğu** yerde düzeltin. Bakiye ekranına "+1 kuruş düzeltmesi"
eklemek belirtiyi saklar; bölüştürme işlevi düzelince bütün ekranlar düzelir.

## Hata iletisini okumak

- İletinin **tamamını** okuyun. Python'da son satır hatanın türü ve iletisidir; üstteki satırlar çağrı zinciridir.
- Zincirde **kendi kodunuzdaki ilk satırı** bulun; kütüphane satırlarını atlayın. Hata çoğu zaman kütüphaneye
  verdiğiniz yanlış değerdir.
- "During handling of the above exception…" ya da `cause` zinciri varsa ilk hatayı okuyun; sonrakiler onun
  gölgesidir.
- İletideki sabit metni kod tabanında ve kurulu kütüphanede arayın (`grep -rn "metin" node_modules/paket/`).
  İletiyi üreten satır, hangi koşulun bozulduğunu söyler.
- `NoneType has no attribute …` / `Cannot read properties of undefined`: hata o satırda değil, değeri `None`
  yapan önceki adımdadır. Değerin nereden geldiğini geriye doğru izleyin.

## İkili arama: kodda, veride, geçmişte

**Kodda:** Bir işlem zinciri `oku → temizle → dönüştür → hesapla → biçimle` sonunda yanlışsa, ortadaki
`dönüştür` çıktısını denetleyin. Doğruysa hata sonraki yarıda, değilse önceki yarıdadır. Beş adımlık zincirde en
çok üç bakış yeter.

**Geçmişte:** Hata dün yoktu, bugün var; arada 200 kayıt (commit) var. Sırayla denemek 200 adım sürer; ikili arama
en çok ⌈log₂ 200⌉ = 8 adım. Mantık şudur:

```python calistir
import math


def first_bad(commits: list[str], is_bad) -> tuple[int, int]:
    """commits[0] sağlam, commits[-1] bozuk bilinir; ilk bozuk kaydın sırasını ve deneme sayısını döndürür."""
    good, bad, steps = 0, len(commits) - 1, 0
    while bad - good > 1:
        mid = (good + bad) // 2
        steps += 1
        if is_bad(commits[mid]):
            bad = mid
        else:
            good = mid
    return bad, steps


commits = [f"k{i:03d}" for i in range(200)]
index, steps = first_bad(commits, lambda c: int(c[1:]) >= 137)  # hatayı k137 getirdi
assert index == 137 and steps <= math.ceil(math.log2(len(commits)))
print(f"{len(commits)} kayıt, {steps} denemede bulundu: {commits[index]}")
```

```cikti
200 kayıt, 7 denemede bulundu: k137
```

Git bunu kendisi yapar. Hatayı yakalayan bir sınama betiği yazın; `git bisect run` her adımda onu çalıştırır:

```bash
git bisect start
git bisect bad                    # şu anki kayıt bozuk
git bisect good v1.4.0            # bu sürüm sağlamdı
git bisect run ./sinama.sh        # çıkış 0 = sağlam, 125 = bu kaydı atla, 1–127 arası diğerleri = bozuk
git bisect reset                  # bitince başladığınız yere dönün
```

Betikte kurulamayan ya da derlenemeyen kayıtlar için `exit 125` verin; yoksa bisect yanlış kaydı suçlar.

**Veride (delta debugging):** 1000 satırlık içe aktarma patlıyor. Satırları gruplar hâlinde atın; hata sürüyorsa
atılan grup gereksizdir. Sonunda hatayı tetikleyen birkaç satır kalır:

```python calistir
def minimize(items: list, fails) -> list:
    """Hatayı hâlâ üreten küçük bir alt liste bulur (sadeleştirilmiş delta debugging)."""
    assert fails(items), "başlangıç girdisi hatayı üretmeli"
    chunk = len(items) // 2
    while chunk >= 1:
        i, shrunk = 0, False
        while i < len(items):
            candidate = items[:i] + items[i + chunk :]  # bir grubu çıkar
            if candidate and fails(candidate):
                items, shrunk = candidate, True  # grup gereksizmiş: atıldı
            else:
                i += chunk
        if not shrunk:
            chunk //= 2
    return items


rows = [{"id": i, "tutar": "10,00"} for i in range(1000)]
rows[877] = {"id": 123, "tutar": "5,00"}  # gizli kopya kimlik


def import_fails(batch: list) -> bool:  # gerçekte: içe aktarma işlevi hata fırlatıyor mu?
    ids = [row["id"] for row in batch]
    return len(ids) != len(set(ids))


small = minimize(rows, import_fails)
assert [row["id"] for row in small] == [123, 123]
print(f"1000 satır → {len(small)} satır")
```

```cikti
1000 satır → 2 satır
```

## Günlükleme taktikleri

- **Sınırlarda yazın:** şüpheli işlevin girdisini ve çıktısını; ağdan, dosyadan, veritabanından gelen değeri.
- **Kararı yazın:** hangi dala girildi, neden. `"indirim uygulanmadı: kupon süresi dolmuş"` bir sayfa yığın
  izinden değerlidir.
- **Görünmeyeni görünür yapın:** `print(x)` sondaki boşluğu, bölünmez boşluğu, sıfır genişlikli karakteri
  göstermez. Harf ve rakam dışındaki her karakteri kod noktasıyla yazdıran küçük bir yardımcı gösterir
  (`repr` ve `ascii` de kaçış dizisiyle gösterir):

```python calistir
def visible(text: str) -> str:
    """Harf/rakam dışındaki her karakteri <U+XXXX> diye gösterir."""
    return "".join(ch if ch.isalnum() else f"<U+{ord(ch):04X}>" for ch in text)


for name in ["Ahmet", "Ahmet ", "Ahmet\xa0", "Ahmet\N{ZERO WIDTH SPACE}"]:
    print(visible(name), name == "Ahmet")  # print(name) dördünü de "Ahmet" diye gösterir
```

```cikti
Ahmet True
Ahmet<U+0020> False
Ahmet<U+00A0> False
Ahmet<U+200B> False
```

- **İlişkilendirin:** her isteğe bir kimlik verin ve o isteğin bütün satırlarına yazın. Eşzamanlı isteklerin
  satırları karışınca hangi satırın hangi isteğe ait olduğu ancak böyle anlaşılır.
- **Sırayı tekdüze saatle verin:** süre ölçümünde ve olay sırasında duvar saati (`time.time`, `Date.now`) geri
  gidebilir; `time.monotonic` / `performance.now` gitmez.
- **Sır ve kişisel veri yazmayın:** parola, belirteç, TCKN, tam kart numarası günlüğe girmez; gerekirse maskeleyin.
- **Temizleyin:** hata bulununca geçici `print`leri silin; kalıcı değeri olanı uygun düzeyde (`debug`) bırakın.

## Düzeldi ama neden?

Nedenini bilmediğiniz düzeltme düzeltme değildir; çoğu zaman hatayı saklar ve hata başka biçimde geri gelir.
Bitti demeden önce üç soru:

1. **Düzeltmeyi geri alınca hata dönüyor mu?** Dönmüyorsa düzelten şey sizin değişikliğiniz değil (önbellek
   temizlendi, veri değişti, zamanlama kaydı).
2. **Mekanizmayı tek cümleyle anlatabiliyor musunuz?** "Paylar ayrı ayrı yuvarlanıyordu, artan kuruş kayboluyordu."
   Anlatamıyorsanız henüz bitmedi.
3. **Gerileme testi düzeltmesiz kodda kırmızı mı?** Değilse test bu hatayı yakalamıyor.

Sahte düzeltmelerin tanıdık yüzleri: `sleep` eklemek, zaman aşımını uzatmak, `try/except: pass`, her yere
`?.` ya da `if x is None: return`, önbelleği temizlemek, sunucuyu yeniden başlatmak, içe aktarma sırasını
değiştirmek. Bunlar belirtiyi susturur; nedeni değil.

## Tuzaklar

| Belirti                                                  | Neden                                                   | Çözüm                                                        |
| -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Saatlerdir "düzeltme" deneniyor, hata yerinde            | Yeniden üretim yok ya da hipotez yok                    | Durun: tek komutluk yeniden üretim, sonra yazılı hipotez     |
| Beş şey birden değişti, hata gitti; hangisi bilinmiyor   | Tek değişken kuralı çiğnendi                            | Hepsini geri alın, birer birer uygulayın                     |
| Günlük eklenince hata kayboluyor                         | Zamanlama ya da yarış (günlük yazmak süreyi değiştirir) | Sıra ve süreyi kaydeden ucuz günlük; yarış için bkz. [Hata sınıfları](hata-siniflari.md) |
| Düzeltme yapıldı, iki hafta sonra aynı hata başka ekranda | Belirti düzeltildi, kök neden değil                     | Değerin doğduğu yeri düzeltin; aynı kalıbı kod tabanında arayın |
| `git bisect` alakasız bir kaydı suçluyor                 | Derlenmeyen kayıtlar "bozuk" sayıldı ya da sınama kararsız | Derlenmeyende `exit 125`; sınamayı önce kararlı yapın       |
| Hata yalnız üretimde                                     | Ortam farkı: sürüm, ayar, veri boyutu, dil, saat dilimi | Farkları tablo yapıp birer birer eşitleyin                   |
| Yığın izinin ilk satırı kütüphanede, orada aranıyor      | Kendi kodunuzdaki çağrı atlandı                         | Zincirde kendi kodunuzdaki ilk satıra gidin                  |
| Test yeşile döndü çünkü beklenen değer değiştirildi       | Test gevşetildi                                         | Önce hangisi yanlış karar verin: kod mu, test mi; yazın      |

## Denetim listesi

- [ ] Hata tek komutla yeniden üretiliyor (komut rapora yazıldı).
- [ ] Girdi ve adımlar hatayı hâlâ üreten en küçük hâle indirildi.
- [ ] Hipotez yazıldı ve sınandı; elenen hipotezler de not edildi.
- [ ] Düzeltme kök nedeni hedefliyor; mekanizma tek cümleyle anlatılabiliyor.
- [ ] Gerileme testi düzeltmesiz kodda kırmızı, düzeltmeyle yeşil (ikisi de görüldü).
- [ ] Aynı kalıp kod tabanında arandı; benzer yerler düzeltildi ya da not edildi.
- [ ] Geçici günlük satırları temizlendi; günlükte sır ve kişisel veri yok.
- [ ] Bütün testler yeşil; yalnız ilgili test değil.

## Küçük modele yaptırırken

- **İsteme yazın:** hata iletisinin tamamı (kısaltmadan), yeniden üretme komutu, beklenen ve gerçekleşen, son
  değişiklikler. Sonra: "Düzeltme yazma. Önce üç hipotez yaz; her biri için onu doğrulayacak ya da çürütecek tek
  bir sınama öner. Sınamaları çalıştır, sonuçları göster."
- **Modelin tipik hatası:** hemen düzeltme önerir; belirtiyi saklayan savunma kodu ekler (`if (!x) return`,
  `try/except: pass`); birden çok şeyi aynı anda değiştirir; zaman aşımını uzatır; testi yeniden çalıştırmadan
  "düzeldi" der; testteki beklenen değeri değiştirip yeşile boyar.
- **Çıktıda denetleyin:** değişiklik hatanın doğduğu yerde mi, görüldüğü yerde mi? Yeni `try`, `catch`, `sleep`,
  `timeout`, `?.` var mı? Gerileme testi var mı ve model onun düzeltmesiz kodda kırmızı olduğunu gösterdi mi?
- **Takılırsa:** "Bildiklerini ve elediğin hipotezleri yaz" deyin; yeni bir düzeltme denemesi istemeyin.

## İlgili

- [Hata sınıfları ve imzaları](hata-siniflari.md): belirtiden olası nedene hızlı geçiş tablosu.
- [Problem çözme döngüsü](problem-cozme-dongusu.md): zaman kutusu ve varsayım sınama.
- [Test stratejisi](test-stratejisi.md): gerileme testini doğru düzeyde yazmak.
- [Yabancı kod okuma](yabanci-kod-okuma.md): hatanın geçtiği bilinmeyen kodda yön bulmak.
