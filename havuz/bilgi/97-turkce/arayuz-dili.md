---
baslik: Arayüz dili
ozet: Türkçe arayüz metni yazımı; siz hitabı, eylem bildiren düğme, ne oldu + ne yapılır hata iletisi, boş durum ve onay metni, kısa cümle, sık çeviri hataları ve İngilizce-Türkçe arayüz terimleri sözlüğü.
etiketler: [turkce, arayuz-metni, ux-yazimi, hata-iletisi, yerellestirme, sozluk]
duzey: temel
guncellik: 2026-11
---

# Arayüz dili

> Bu notu ne zaman okumalı: bir düğme, hata iletisi, boş ekran ya da onay penceresi metni yazarken; İngilizce bir
> arayüzü Türkçeye çevirirken; bir modelin yazdığı arayüz metinlerini denetlerken.

## Temel fikir

Arayüz metni okunmaz, **taranır**. Kullanıcı bir işin ortasındadır; metin ona ne olduğunu ve ne yapacağını en kısa
yoldan söylemelidir. Türkçe arayüzün yerleşik kuralları:

- **Hitap "siz"dir** ve baştan sona aynı kalır: "Şifrenizi girin" ("Şifreni gir" değil, ikisi karışık hiç değil).
- **Düğme eylem bildirir:** "Kaydet", "Listeyi sil", "Gönder". Düğmede yalın fiil kökü yerleşik etiket biçimidir.
- **Hata iletisi = ne oldu + ne yapılır.** Suçlamaz, korkutmaz, teknik kod göstermez.
- **Kısa cümle, cümle düzeninde büyük harf** ("Değişiklikleri kaydet"), ünlem yok, tümü büyük harf yok.
- **Tek terim:** aynı şeye her yerde aynı ad ("şifre" ya da "parola"; biri).

Metinler koda gömülmez; tek bir sözlük dosyasında durur (havuzda:
[uygulama/web/src/i18n/tr.json](../../uygulama/web/src/i18n/tr.json)).

## Karar tablosu: metin türüne göre kalıp

| Metin türü          | Kalıp                                           | Örnek                                                         |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Düğme               | Fiil (+ gerekirse nesne), en çok üç sözcük       | Kaydet · Listeyi sil · Yeniden dene                            |
| Hata (alan altında) | Ne gerekiyor                                    | En az 12 karakter yazın.                                      |
| Hata (genel)        | Ne oldu + ne yapılır (+ eylem düğmesi)          | Kaydedilemedi: internet bağlantısı yok. Bağlantı gelince yeniden deneyin. [Yeniden dene] |
| Başarı              | Olan şey, kısa                                  | Kaydedildi.                                                   |
| Boş durum           | Burada ne olur + nasıl başlanır + tek eylem     | Henüz liste yok. İlk listenizi oluşturun. [Liste oluştur]     |
| Geri alınabilir işlem | Onay sorma; sonra "Geri al" sun               | Liste silindi. [Geri al]                                      |
| Geri alınamaz işlem | Soru başlık + sonuç + eylem adlı düğme          | "Market" listesi silinsin mi? İçindeki 12 öğe de silinecek. [Listeyi sil] [Vazgeç] |
| Yükleniyor          | Ne yükleniyor (uzun sürecekse)                  | Listeler yükleniyor…                                          |
| Bağlantı metni      | Neyi açacağını söyler                           | Kullanım koşulları (Buraya tıklayın değil)                    |

## Nasıl yazılır

### Hitap ve fiil biçimi

| Biçim                  | Örnek                | Kullanım                                              |
| ---------------------- | -------------------- | ----------------------------------------------------- |
| Yalın fiil (etiket)    | Kaydet, Gönder       | Düğme ve menü öğesi                                   |
| "-in" (siz, emir)      | Girin, Deneyin       | Yönerge ve iletiler: önerilen                         |
| "-iniz" (resmî emir)   | Giriniz, Deneyiniz   | Kaçının: dilekçe dili, uzak durur                     |
| "sen" biçimi           | Gir, Dene, şifreni   | Metinde kullanmayın; markanın bilinçli sesi değilse   |
| Edilgen geçmiş         | Kaydedildi, Silindi  | Sonuç bildirimi: kısa ve kişisiz                      |

### Hata iletisi

- Ne olduğunu kullanıcının diliyle söyleyin; teknik kod gerekiyorsa küçük ve ikincil olsun (destek için).
- Ne yapacağını söyleyin; mümkünse bunu yapan düğmeyi koyun ("Yeniden dene").
- Suçlamayın: "Hatalı giriş yaptınız" değil, "E-posta ya da şifre eşleşmedi." Giriş ekranında hangisinin yanlış
  olduğunu söylemeyin; bu bir hesabın var olup olmadığını sızdırır.
- Alan hatası alanın yanında ve ne beklendiğini söyler: "Geçersiz telefon" değil, "10 hane yazın: 532 123 45 67".
- Hata olunca kullanıcının yazdıklarını silmeyin.
- Yalnız renk ya da yalnız simge yetmez; metin de olsun (renk körlüğü, ekran okuyucu).

```text
Kötü:  Hata! Bir sorun oluştu. (Kod: 500)
İyi:   Şu an kaydedemiyoruz. Değişiklikleriniz bu cihazda duruyor; birazdan yeniden deneyin.   [Yeniden dene]

Kötü:  Hatalı giriş yaptınız. Lütfen tekrar deneyiniz.
İyi:   E-posta ya da şifre eşleşmedi. Yeniden deneyin ya da şifrenizi sıfırlayın.   [Şifremi unuttum]
```

### Onay metni

Önce sorun: bu işlem geri alınabilir mi? Alınabiliyorsa **onay sormayın**; işlemi yapıp "Geri al" sunun. Onay
penceresi her gün görülünce okunmadan geçilir. Geri alınamayan işlemde:

- Başlık eylemi ve nesneyi adlandırır: "“Market” listesi silinsin mi?" ("Emin misiniz?" bir şey söylemez).
- Gövde sonucu söyler: "İçindeki 12 öğe de silinecek. Bu işlem geri alınamaz."
- Birincil düğme eylemin adıdır: "Listeyi sil". İkincil: "Vazgeç". "Evet / Hayır" ve "Tamam / İptal" kullanmayın:
  "Siparişi iptal et?" penceresindeki "İptal" düğmesi neyi iptal eder?

### Kısalık ve biçim

- Cümle 12–15 sözcüğü geçmesin; düğme üç sözcüğü. (Köprü gibi özel kitleye yönelik üründe daha kısa: 6 sözcük.)
- Ünlem yok, "Lütfen" yok ya da çok seyrek, "başarıyla" yok: "Kaydedildi." yeter.
- Üç nokta tek karakterdir: "…". Tırnak: "“Market”" ya da düz tırnak; projede biri.
- Tümü büyük harf yok; gerekiyorsa Türkçe kuralla büyütün ([Türkçe büyük/küçük harf](buyuk-kucuk-harf.md)).
- Sayı, tarih, para metne Türkçe biçimle girer ve sayıdan sonra ad tekil kalır: "3 dosya"
  ([Yerelleştirme denetimi](yerellestirme-denetimi.md)).
- Değişkenin arkasına ek getirmeyin: "Alıcı: {ad}" ([Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md)).

## Otomatik denetim

Sözlük dosyasındaki bütün metinleri tarayan küçük bir denetçi, en sık kusurları yakalar. Yanlış alarm verebilir;
bulguyu kural testi değil inceleme ipucu olarak kullanın.

```python calistir
import re

RULES = [  # (desen, ileti)
    (r"!", "ünlem kullanmayın"),
    (r"\b[A-ZÇĞİÖŞÜ]{4,}\b", "tümü büyük harfli sözcük"),
    (r"\b(deneyiniz|giriniz|seçiniz|bekleyiniz|tıklayınız|ediniz|yapınız|yazınız)\b", "'-iniz' yerine '-in'"),
    (r"\bLütfen\b", "'Lütfen' gereksiz; doğrudan söyleyin"),
    (r"\bbaşarıyla\b", "'başarıyla' gereksiz: 'Kaydedildi.' yeter"),
    (r"(?i)\b(hatalı|yanlış) (giriş|işlem)|girdiniz\b|yaptınız\b", "kullanıcıyı suçlayan kalıp"),
    (r"\.\.\.", "üç nokta yerine '…'"),
    (r"\b(OK|Cancel|Submit|Error|Loading|Settings)\b", "İngilizce sözcük kalmış"),
    (r"\{[^}]+\}['’]?[a-zçğıöşü]", "değişkene ek gelmiş: eksiz kalıp kullanın"),
]


def lint(messages: dict[str, str]) -> list[str]:
    return [f"{key}: {note}" for key, text in messages.items() for pattern, note in RULES if re.search(pattern, text)]


messages = {
    "save.done": "İşleminiz başarıyla kaydedildi!",
    "login.error": "Hatalı giriş yaptınız. Lütfen tekrar deneyiniz.",
    "sync.loading": "Loading...",
    "share.sent": "{name}'e gönderildi",
    "save.doneGood": "Kaydedildi.",
    "login.errorGood": "E-posta ya da şifre eşleşmedi. Yeniden deneyin ya da şifrenizi sıfırlayın.",
    "welcomeGood": "Hoş geldiniz.",
}
for finding in lint(messages):
    print(finding)
assert not [finding for finding in lint(messages) if "Good" in finding]
```

```cikti
save.done: ünlem kullanmayın
save.done: 'başarıyla' gereksiz: 'Kaydedildi.' yeter
login.error: '-iniz' yerine '-in'
login.error: 'Lütfen' gereksiz; doğrudan söyleyin
login.error: kullanıcıyı suçlayan kalıp
sync.loading: üç nokta yerine '…'
sync.loading: İngilizce sözcük kalmış
share.sent: değişkene ek gelmiş: eksiz kalıp kullanın
```

## Sık yapılan çeviri hataları

| İngilizce                          | Kötü çeviri                                   | İyi                                                        |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| You have 3 new messages            | 3 yeni mesajlarınız var                       | 3 yeni mesajınız var                                       |
| Successfully saved                 | Başarılı bir şekilde kaydedilmiştir           | Kaydedildi.                                                |
| Please try again later             | Lütfen daha sonra tekrar deneyiniz            | Birazdan yeniden deneyin.                                  |
| Oops! Something went wrong         | Hay aksi! Bir şeyler ters gitti               | Kaydedilemedi. Bağlantınızı denetleyip yeniden deneyin.    |
| Are you sure you want to delete?   | Silmek istediğinize emin misiniz?             | "Market" listesi silinsin mi? İçindeki 12 öğe de silinecek. |
| Click here                         | Buraya tıklayın                               | Bağlantı metni neyi açtığını söylesin                      |
| This field is required             | Bu alan gereklidir                            | Adınızı yazın.                                             |
| Invalid email                      | Geçersiz e-posta                              | E-posta adresinde "@" eksik görünüyor.                     |
| Welcome back, {name}!              | Tekrar hoş geldin, {name}!                    | Hoş geldiniz, {name}.                                      |
| {name}'s list                      | {name}'in listesi                             | Liste sahibi: {name}                                       |
| Do you have an account?            | Bir hesaba sahip misiniz?                     | Hesabınız var mı?                                          |
| It looks like you're offline       | Görünüşe göre çevrimdışısınız                 | İnternet bağlantısı yok.                                   |

Çeviri kokan yapılar: "bir şekilde", gereksiz "tarafından" edilgeni, "sahip olmak" ("hesaba sahip olmak"),
"Bu, … anlamına gelir", "emin olun ki", her cümlede "için".

## Arayüz terimleri sözlüğü

| İngilizce                    | Önerilen Türkçe                            | Not                                                     |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Add / Remove                 | Ekle / Kaldır                              | "Kaldır" listeden çıkarır; "Sil" yok eder               |
| Archive / Restore            | Arşivle / Geri getir                       |                                                         |
| Back / Next / Continue       | Geri / İleri / Devam                       |                                                         |
| Cancel (pencereyi kapatma)   | Vazgeç                                     | "İptal" eylemin kendisiyle karışır                      |
| Close                        | Kapat                                      |                                                         |
| Confirm                      | Onayla                                     | Yıkıcı işlemde eylemin adını yazın                      |
| Copy / Paste                 | Kopyala / Yapıştır                         |                                                         |
| Create account / Sign up     | Hesap oluştur / Kaydol                     | Birini seçin                                            |
| Dashboard                    | Özet ya da Ana sayfa                       | "Gösterge paneli" sözcüğü sözcüğüne çeviridir           |
| Delete                       | Sil                                        |                                                         |
| Discard changes              | Değişiklikleri at                          |                                                         |
| Done                         | Bitti / Tamam                              |                                                         |
| Download / Upload            | İndir / Yükle                              |                                                         |
| Draft                        | Taslak                                     |                                                         |
| Edit                         | Düzenle                                    |                                                         |
| Email                        | E-posta                                    | Tireli yazılır                                          |
| Feed                         | Akış                                       | "Besleme" değil                                         |
| Filter / Sort                | Filtrele / Sırala                          | "Süz" de olur; birini seçin                             |
| Forgot password?             | Şifremi unuttum                            |                                                         |
| Help / Home                  | Yardım / Ana sayfa                         |                                                         |
| Learn more                   | Ayrıntılar                                 | "Daha fazla öğren" çeviri kokar                         |
| Loading…                     | Yükleniyor…                                |                                                         |
| Log in / Log out             | Giriş yap / Çıkış yap                      | "Oturum aç / kapat" da olur; birini seçin               |
| Notifications                | Bildirimler                                |                                                         |
| OK                           | Tamam                                      | Yalnız bilgi penceresinde                               |
| Optional / Required          | İsteğe bağlı / Zorunlu                     | Zorunlu alanda ne yazılacağını söyleyin                 |
| Password                     | Şifre (ya da Parola)                       | Birini seçin; havuzdaki uygulama "şifre" kullanır       |
| Preview                      | Önizleme                                   |                                                         |
| Privacy notice (KVKK)        | Aydınlatma metni                           | KVKK bağlamındaki yerleşik ad                           |
| Profile / Settings           | Profil / Ayarlar                           |                                                         |
| Refresh                      | Yenile                                     |                                                         |
| Reset                        | Sıfırla                                    |                                                         |
| Retry / Try again            | Yeniden dene / Yeniden deneyin             |                                                         |
| Save / Save changes          | Kaydet / Değişiklikleri kaydet             |                                                         |
| Search                       | Ara                                        |                                                         |
| Select / Select all          | Seç / Tümünü seç                           |                                                         |
| Send / Submit                | Gönder                                     | "Submit" için eylemin kendi adı daha iyi ("Siparişi ver") |
| Share                        | Paylaş                                     |                                                         |
| Show more / Show less        | Daha fazla göster / Daha az göster         |                                                         |
| Terms of service             | Kullanım koşulları                         |                                                         |
| Undo                         | Geri al                                    |                                                         |
| Update                       | Güncelle                                   |                                                         |
| Username                     | Kullanıcı adı                              |                                                         |
| Welcome                      | Hoş geldiniz                               |                                                         |
| Workspace                    | Çalışma alanı (kısaca "alan")              |                                                         |

Yazılım terimlerinin genel sözlüğü: [Yazılım terimleri sözlüğü](../00-yontem/sozluk.md).

## Tuzaklar

| Belirti                                                 | Neden                                           | Çözüm                                                       |
| ------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Bir ekranda "şifreni", ötekinde "şifrenizi"              | Hitap kararı yazılmamış                         | Siz hitabını sözlüğün başına kural olarak yazın             |
| Kullanıcı onay penceresini okumadan geçiyor             | Her işlemde onay soruluyor                      | Geri alınabilir işlemde onay yerine "Geri al"               |
| "İptal" düğmesine basan siparişi iptal ettiğini sandı   | Düğme eylemi değil pencereyi kastediyor         | Pencereyi kapatan düğme "Vazgeç"                            |
| Destek ekibine "Hata 500" ekran görüntüleri geliyor      | İleti teknik kod gösteriyor, ne yapılacağını değil | Ne oldu + ne yapılır; kod küçük ve ikincil                |
| Kullanıcı aynı formu üç kez dolduruyor                  | Hata olunca girdiler siliniyor                  | Girdiyi koruyun, hatayı alanın yanında gösterin             |
| Giriş ekranı "Bu e-posta kayıtlı değil" diyor           | Hesabın varlığı sızdırılıyor                    | "E-posta ya da şifre eşleşmedi."                            |
| Başlıklarda "BİLGİ" yerine "BILGI"                      | CSS ya da kodla yerel kuralsız büyütme          | `lang="tr"` ve Türkçe kurallı dönüşüm                       |
| Metin İngilizceden çevrilmiş gibi okunuyor              | Kalıplar sözcük sözcük aktarılmış               | Çeviri hataları tablosu; yüksek sesle okuyun                |
| Denetçi "Hoş geldiniz"i yanlış buluyor                  | Kural fazla geniş                               | Denetçiyi ipucu sayın; kuralı daraltın                      |

## Denetim listesi

- [ ] Bütün metinler tek sözlük dosyasında; kodda kullanıcıya görünen Türkçe dizge yok.
- [ ] Hitap baştan sona "siz"; yönergeler "-in" biçiminde.
- [ ] Her düğme bir eylem söylüyor; yıkıcı işlemin düğmesi eylemin adını taşıyor.
- [ ] Her hata iletisi ne olduğunu ve ne yapılacağını söylüyor; suçlama, ünlem, teknik kod yok.
- [ ] Geri alınabilir işlemlerde onay yerine "Geri al" var; geri alınamazlarda sonucu söyleyen onay var.
- [ ] Her listenin ve aramanın boş durumu yazılmış ve tek bir eylem sunuyor.
- [ ] Cümleler kısa; ünlem, "Lütfen", "başarıyla" yok; üç nokta "…".
- [ ] Aynı kavram her yerde aynı terimle anılıyor.
- [ ] Değişkenden sonra ek yok; sayıdan sonra ad tekil.
- [ ] Denetçi çalıştırıldı; bulgular tek tek değerlendirildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Arayüz metinlerini sözlük dosyasına yaz, koda gömme. Hitap 'siz', yönergeler '-in' biçiminde
  (Girin, Deneyin). Düğme eylem söylesin. Hata iletisi: ne oldu + ne yapılır; suçlama, ünlem, 'Lütfen',
  'başarıyla' yok. Değişkenin arkasına ek getirme. Terimler: <projenin terim listesi>."
- **Modelin tipik hatası:** İngilizce kalıpları sözcük sözcük çevirir ("Bir şeyler ters gitti!"); "-iniz" ve
  "Lütfen" ile resmî ve uzun yazar; "sen" ile "siz"i karıştırır; her işleme "Emin misiniz?" ekler; "3 yeni
  mesajlarınız" gibi çoğul yanlışı yapar; metni koda gömer; İngilizce sözcük bırakır ("Loading...").
- **Çıktıda denetleyin:** denetçiyi sözlük dosyasına uygulayın; yeni bileşenlerde tırnak içinde Türkçe metin
  arayın; onay pencerelerinin düğme adlarına bakın; metinleri telefonda gerçek ekranda okuyun.

## İlgili

- [Ekler ve ünlü uyumu](ekler-ve-unlu-uyumu.md): eksiz kalıplar.
- [Yerelleştirme denetimi](yerellestirme-denetimi.md): sayı, tarih, para metinleri.
- [Teknik yazı](../00-yontem/teknik-yazi.md): yalın yazma kuralları.
- Havuzdaki örnek iletiler: [API iletileri](../../uygulama/api/src/messages.ts),
  [hata kodlarının iletileri](../../uygulama/shared/src/errors.ts), [site sözlüğü](../../site/src/i18n/tr.ts).
