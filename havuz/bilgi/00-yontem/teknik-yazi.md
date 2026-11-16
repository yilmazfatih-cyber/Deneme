---
baslik: Teknik yazı
ozet: README, hata raporu, karar kaydı, kayıt iletisi, değişiklik özeti ve durum raporu için kısa şablonlar, iyi ve kötü örnekler ve Türkçede yalın yazma kuralları.
etiketler: [yontem, yazim, belge, commit-iletisi, hata-raporu]
duzey: temel
guncellik: 2026-11
---

# Teknik yazı

> Bu notu ne zaman okumalı: bir README, hata raporu, kayıt (commit) iletisi, değişiklik özeti ya da durum raporu
> yazarken; bir modelin yazdığı belgeyi denetlerken; ya da yazdığınız şeyin okunmadığını fark ettiğinizde.

## Temel fikir

Teknik yazının okuru **bir iş yapmak** ister: kurmak, hatayı bulmak, karar vermek, onaylamak. Ona en kısa yoldan
yetişin:

- **Sonuç önce:** ilk cümle, okurun en çok bilmek istediğini söyler. Gerekçe ve ayrıntı sonra gelir.
- **Bir paragraf, bir fikir;** kısa cümle; somut sözcük (sayı, komut, dosya adı).
- **Taranabilir yapı:** başlık, tablo, numaralı adım. Ama her şeyi madde imine çevirmeyin; neden-sonuç bağı
  cümlede kurulur.
- **Doğrulanmış içerik:** her komut çalıştırılmış, her sayının kaynağı belli.

## Yalın yazma kuralları

| Kural                                       | Kötü                                                    | İyi                                         |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| Etken çatı, doğrudan hitap                  | Komutun çalıştırılması gerekmektedir.                   | Komutu çalıştırın.                          |
| "-mektedir / -maktadır" yerine yalın zaman  | Uygulama çevrimdışı çalışabilmektedir.                  | Uygulama çevrimdışı çalışır.                |
| Somut                                       | Sayfa biraz yavaş açılıyor.                             | Sayfa telefonda 4,2 saniyede açılıyor.      |
| Tek terim                                   | şifre … parola … giriş kodu (aynı şey)                  | Hep "şifre"                                 |
| İngilizce terim ilk geçişte ayraçta         | Throttling uygulanır.                                   | Hız sınırlama (throttling) uygulanır.       |
| Küçümseyen sözcük yok                       | Basitçe şu ayarı değiştirin.                            | Şu ayarı değiştirin.                        |
| Kesin tarih                                 | Geçen hafta düzeltildi.                                 | 9 Kasım 2026'da düzeltildi.                 |
| Kısaltma ilk geçişte açık                   | KVKK gereği…                                            | Kişisel Verilerin Korunması Kanunu (KVKK) gereği… |
| Kısa cümle                                  | (26 sözcüklük cümle)                                    | İki ya da üç cümle; çoğu 20 sözcüğü aşmasın |

Uzun cümleyi ve bürokratik kipi yakalayan küçük bir denetçi:

```python calistir
import re

BUREAUCRATIC = re.compile(r"\w+(mektedir|maktadır|mekteyiz|maktayız)\b")
ABBREVIATIONS = ("vb.", "vs.", "bkz.", "örn.", "ör.", "Dr.")


def sentences(text: str) -> list[str]:
    for abbr in ABBREVIATIONS:  # kısaltmadaki nokta cümle bitirmesin
        text = text.replace(abbr, abbr.replace(".", "\x00"))
    parts = re.split(r"(?<=[.!?…])\s+", text)
    return [part.replace("\x00", ".").strip() for part in parts if part.strip()]


def review(text: str, max_words: int = 20) -> list[str]:
    notes = []
    for sentence in sentences(text):
        if len(sentence.split()) > max_words:
            notes.append(f"uzun ({len(sentence.split())} sözcük): {sentence[:40]}…")
        notes += [f"bürokratik kip: {m.group(0)}" for m in BUREAUCRATIC.finditer(sentence)]
    return notes


before = (
    "Kurulum için öncelikle bağımlılıkların yüklenmesi gerekmektedir. "
    "Bu işlem, kullanılan bilgisayarın hızına, internet bağlantısının kalitesine ve paket yöneticisinin önbelleğinde "
    "daha önce indirilmiş dosyaların bulunup bulunmadığına göre birkaç saniye ile birkaç dakika arasında sürebilmektedir. "
    "Sorun çıkarsa bkz. Sorun giderme."
)
after = "Önce bağımlılıkları kurun: npm ci. Bu, bağlantınıza göre birkaç saniye ile birkaç dakika sürer."
for note in review(before):
    print(note)
assert review(after) == []
```

```cikti
bürokratik kip: gerekmektedir
uzun (26 sözcük): Bu işlem, kullanılan bilgisayarın hızına…
bürokratik kip: sürebilmektedir
```

## Şablonlar

### README

```markdown
# Bölüş
Arkadaş gruplarında ortak harcamaları kuruşu kuruşuna bölüştürür.

## Hızlı başlangıç
    npm ci
    npm run dev        # http://localhost:5310

## Neler var
- Grup, harcama, eşit ve oranlı bölüşüm, borç sadeleştirme

## Yapılandırma
| Değişken      | Ne işe yarar          | Varsayılan |
| ------------- | --------------------- | ---------- |
| DATABASE_PATH | SQLite dosyasının yeri | ./veri.db  |

## Sınırlar
- Döviz desteklenmez. Çevrimdışı düzenleme denenmedi.

## Sorun giderme
| Belirti                     | Çözüm                          |
| --------------------------- | ------------------------------ |
| `EADDRINUSE` hatası         | 5310 kapısını kullanan süreci kapatın |
```

Kötü README tarihçe ve vizyonla başlar; okur üçüncü ekranda hâlâ nasıl çalıştıracağını bilmez. İyi README'de ilk
ekran: ne yapar, nasıl çalıştırılır. **"Sınırlar" bölümü zorunludur.**

### Hata raporu

```text
Başlık:      Harcama düzenlenince bakiye 1 kuruş kayıyor (Android, Chrome)
Ortam:       sürüm 1.4.2 · Android 14 · Chrome · Türkçe arayüz
Adımlar:     1. "Ev" grubunu açın  2. 100 TL'lik harcamayı 3 kişiye bölün  3. Harcamayı düzenleyip kaydedin
Beklenen:    Paylar 33,34 + 33,33 + 33,33; toplam 100,00
Gerçekleşen: Paylar 33,33 + 33,33 + 33,33; toplam 99,99
Sıklık:      Her seferinde (3 denemede 3)
Ek:          Ekran görüntüsü, tarayıcı konsolu çıktısı
Etki:        Grup bakiyesi sıfırlanmıyor; kullanıcılar uygulamaya güvenmiyor
```

Kötüsü: "Bakiye bozuk, acil bakılsın!!!" Adım, beklenen ve gerçekleşen yoksa hata yeniden üretilemez.

### Karar kaydı

Bağlam, seçenekler, karar, sonuçlar, yeniden düşünme koşulu. Şablon ve dolu örnek:
[Tasarım kararı](tasarim-karari.md#karar-kaydı-şablonu).

### Kayıt (commit) iletisi

Konu satırı `kapsam: ne değişti` biçiminde ve en çok 72 karakter; boş bir satır; gövdede **neden** ve **nasıl
sınandığı**. Bu depodaki alışkanlık Türkçe ve küçük harfli kapsamdır (`tvplus: …`, `havuz: …`).

```text
İyi:
bolus: artan kuruş artık ilk kişilere yazılıyor

Paylar ayrı ayrı yuvarlandığı için 100 TL / 3 kişi 99,99 TL tutuyordu.
Bölüştürme en büyük kalan yöntemine geçti (split.ts).
Sınama: split.test.ts'e 100/3 ve 0,01/2 örnekleri eklendi; düzeltmesiz kırmızı.

Kötü:  fix.    güncelleme    değişiklikler yapıldı    WIP
```

```python calistir
import re

VAGUE = {"fix", "düzeltme", "güncelleme", "değişiklikler", "wip", "update", "misc"}


def commit_problems(message: str) -> list[str]:
    lines = message.rstrip("\n").split("\n")
    subject, problems = lines[0], []
    if len(subject) > 72:
        problems.append(f"konu satırı {len(subject)} karakter (en çok 72)")
    if subject.endswith("."):
        problems.append("konu satırı nokta ile bitmesin")
    if not re.match(r"^[a-z0-9-]+: \S", subject):
        problems.append("konu 'kapsam: ne değişti' biçiminde olsun")
    if set(re.findall(r"\w+", subject.lower())) & VAGUE and len(subject.split()) < 4:
        problems.append("konu belirsiz: ne değiştiğini söyleyin")
    if len(lines) > 1 and lines[1].strip():
        problems.append("konu ile gövde arasında boş satır olsun")
    if len(lines) < 3:
        problems.append("gövde yok: neden ve nasıl sınandığını yazın")
    return problems


good = """bolus: artan kuruş artık ilk kişilere yazılıyor

Paylar ayrı ayrı yuvarlandığı için 100 TL / 3 kişi 99,99 TL tutuyordu.
Sınama: split.test.ts'e 100/3 örneği eklendi; düzeltmesiz kırmızı.
"""
assert commit_problems(good) == []
for problem in commit_problems("fix."):
    print("-", problem)
```

```cikti
- konu satırı nokta ile bitmesin
- konu 'kapsam: ne değişti' biçiminde olsun
- konu belirsiz: ne değiştiğini söyleyin
- gövde yok: neden ve nasıl sınandığını yazın
```

### Değişiklik özeti (PR açıklaması)

```markdown
## Ne
Bölüştürme en büyük kalan yöntemine geçti.
## Neden
100 TL / 3 kişi 99,99 TL tutuyordu (hata #41).
## Nasıl sınandı
`npm run check` yeşil; split.test.ts'e iki örnek; telefonda elle denendi (ekran görüntüsü ekte).
## Risk ve geri alma
Eski kayıtlar etkilenmez; geri almak için bu kaydı geri çevirmek yeter.
## Sınanmayan
Oranlı bölüşüm bu değişiklikte yok.
```

"Sınanmayan" başlığı dürüstlüğün sigortasıdır; boş kalacaksa "yok" yazın.

### Durum raporu

Tek satırlık özet en başta: **YOLUNDA / RİSKTE / GECİKTİ** ve nedeni. Sonra biten, sıradaki, engel, risk, karar
gereken, tahmin. Ayrıntılı kalıp: [Tahmin ve planlama](tahmin-ve-planlama.md#ilerleme-bildirimi). Kötü haber
özetin içinde olur, sayfanın sonunda değil.

## Tuzaklar

| Belirti                                                      | Neden                                        | Çözüm                                                        |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| Belge uzun ama okur aradığını bulamıyor                      | Sonuç sonda; yapı yok                        | Sonuç önce; başlık ve tablo                                  |
| README'deki komut çalışmıyor                                 | Komut yazıldı ama denenmedi; kod değişti     | Komutları temiz bir klonda çalıştırın; denetime bağlayın     |
| Hata raporu "çalışmıyor" diyor, yeniden üretilemiyor         | Adım, beklenen, gerçekleşen yok              | Hata raporu şablonu                                          |
| `git log` "fix", "güncelleme" ile dolu                       | Konu satırı içerik taşımıyor                 | `kapsam: ne değişti` + gövdede neden                         |
| Değişiklik özetinde "her şey test edildi" yazıyor, hata çıktı | Sınanmayan yazılmadı                        | "Nasıl sınandı" komutla, "Sınanmayan" ayrı başlıkta          |
| Durum raporunda risk son satırda                             | Kötü haberden kaçınma                        | Özet satırında durum ve neden                                |
| Aynı şeye üç farklı ad                                       | Terim tutarlılığı yok                        | Bir terim seçin; sözlüğe yazın ([Sözlük](sozluk.md))          |

## Denetim listesi

- [ ] İlk cümle sonucu ya da belgenin ne işe yaradığını söylüyor.
- [ ] Cümlelerin çoğu 20 sözcüğün altında; "-mektedir" kipi yok.
- [ ] Her komut denendi ve kopyalanabilir blokta.
- [ ] Sayıların yanında birimi ve nasıl ölçüldüğü var.
- [ ] Terimler tutarlı; İngilizcesi ilk geçişte ayraçta.
- [ ] README'de hızlı başlangıç ve "Sınırlar" var.
- [ ] Kayıt iletisinde neden ve nasıl sınandığı yazıyor.
- [ ] Değişiklik özetinde "Sınanmayan" başlığı var.

## Küçük modele yaptırırken

- **İsteme yazın:** şablonu isteme koyun, uzunluk sınırı verin ("en çok 15 satır") ve "Yalnız çalıştırdığın
  komutları yaz; çalıştırmadıysan 'denenmedi' de. Giriş ve sonuç paragrafı yazma; '-mektedir' kipini kullanma."
- **Modelin tipik hatası:** uzun ve tekrarlı yazar; her şeyi kalın ve madde imli yapar; "Bu belgede … ele
  alınacaktır" gibi boş girişler ekler; denemediği komutu "çalışır" diye yazar; uydurma sayı verir; İngilizceden
  çeviri kokan cümle kurar.
- **Çıktıda denetleyin:** komutları kendiniz çalıştırın; her sayının kaynağını sorun; yukarıdaki iki denetçiyi
  metne uygulayın; ilk cümlenin sonucu söyleyip söylemediğine bakın.

## İlgili

- [Tasarım kararı](tasarim-karari.md): karar kaydı şablonu.
- [Tahmin ve planlama](tahmin-ve-planlama.md): durum raporu ve ilerleme bildirimi.
- [Kod inceleme](kod-inceleme.md): bulgu yazma dili.
- [Arayüz dili](../97-turkce/arayuz-dili.md): kullanıcıya dönük kısa metinler.
- Havuzdaki README örneği: [uygulama/README.md](../../uygulama/README.md).
