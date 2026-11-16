---
baslik: Gereksinim yazma
ozet: Kullanıcı hikâyesi, Verilen/Olduğunda/O zaman kabul ölçütleri, kapsam dışı ve uç durumlar; küçük modele verilecek iş tanımı şablonu ve belirsiz sözcük denetimi.
etiketler: [urun, gereksinim, kabul-olcutu, kullanici-hikayesi, is-tanimi]
duzey: temel
guncellik: 2026-11
---

# Gereksinim yazma

> Bu notu ne zaman okumalı: bir özelliği bir modele ya da bir insana yaptırmadan önce; model "bitti" dediği hâlde
> istediğiniz şey çıkmıyorsa; "bu bitti mi?" tartışması uzuyorsa.

## Temel fikir

Gereksinim, işin **ne zaman bitmiş sayılacağını önceden söyleyen** metindir. Üç parçası vardır:

1. **Hikâye:** kim, ne istiyor, neden.
2. **Kabul ölçütleri:** doğrulanabilir örnekler. Sıfat değil örnek: "hızlı olsun" değil "500 randevulu listede arama
   sonucu 1 saniyede gelir"; "kolay olsun" değil "ilk kez gelen müşteri 3 dokunuşta randevu alır".
3. **Sınırlar:** kapsam dışı, uç durumlar, dokunulmayacak yerler.

**Verilen / Olduğunda / O zaman** (Given / When / Then) biçimi bir ölçütü teste dönüştürülebilir kılar: başlangıç
durumu, tek eylem, gözlenebilir sonuç. Teste dönüşemeyen ölçüt belirsizdir.

Küçük model, yazılmayan her şeyi "makul" bir varsayımla doldurur. Bu yüzden modele verilen gereksinimin yarısı
**kapsam dışı** ve **dokunma** listeleridir.

## Karar tablosu: hangi biçim

| Ne anlatılıyor                                 | Biçim                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Kullanıcının gördüğü davranış                  | Hikâye + Verilen/Olduğunda/O zaman                                         |
| Kural ya da hesap (fiyat, bölüşüm, tarih)      | Örnek tablosu: girdi → beklenen çıktı (sınır değerleri dâhil)              |
| Ekran düzeni                                   | Metinle taslak + ölçüt ("Geri düğmesi her ekranda sol altta")              |
| Hata ve uç durum                               | Ayrı ölçüt satırları; ekranda görünecek metinle                            |
| Teknik iş (yükseltme, yeniden düzenleme)       | Görev + "davranış değişmez" ölçütü + doğrulama komutu                      |
| Güvenlik ya da yasal zorunluluk                | Kural cümlesi + doğrulama ("telefon numarası yalnız kuaföre görünür")      |
| Performans                                     | Ölçü + koşul + nasıl ölçüleceği ("390 px telefonda, 500 kayıtla, ilk açılış") |

## Kullanıcı hikâyesi

Biçim: "**[somut rol]** olarak **[ne]** istiyorum, böylece **[neden]**." En değerli kısım "böylece"dir: gerekçe
yazılınca daha ucuz bir çözümü tartışmak mümkün olur.

| Kötü                                              | Neden                                  | İyi                                                                                                                          |
| ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "Kullanıcı olarak bekleme listesi istiyorum."     | Rol belirsiz, gerekçe yok              | "Kuaför olarak iptal edilen saatin bekleme listesindeki ilk müşteriye önerilmesini istiyorum, böylece koltuk boş kalmaz."      |
| "Açılır menüyle hizmet seçilsin."                 | Ne yerine nasıl yazılmış               | "Müşteri olarak hizmeti seçebilmek istiyorum, böylece doğru süre ayrılır." (Biçim tasarım kararıdır.)                         |
| "Raporlar olsun."                                 | Ne raporu, kimin için, hangi karar için | "Kuaför olarak hangi gün en çok iptal olduğunu görmek istiyorum, böylece o gün kapora isteyip istemeyeceğime karar veririm." |

Hikâye büyükse bölün: bir hikâye bir oturumda (bir istemde) bitmelidir; 5–7 ölçütü aşıyorsa iki hikâyedir.

## Kabul ölçütleri: doldurulmuş örnek

```text
Hikâye: Kuaför olarak iptal edilen saatin bekleme listesindeki ilk müşteriye önerilmesini istiyorum,
        böylece koltuk boş kalmaz.                                    (Sedir, kurgusal)

K1 Verilen   salı 14:00 dolu ve bekleme listesinde sırasıyla Elif ve Mert var
   Olduğunda 14:00'ün müşterisi randevusunu iptal eder
   O zaman   Elif'e "Salı 14:00 boşaldı. Almak ister misiniz?" iletisi gider ve saat 30 dakika Elif'e ayrılır
K2 Verilen   Elif'e öneri gitmiş, 30 dakika dolmuş, Elif yanıt vermemiş
   Olduğunda süre dolar
   O zaman   öneri Mert'e geçer; Elif listede kalır
K3 Verilen   Elif'e öneri gitmiş
   Olduğunda Elif "Al" düğmesine dokunur
   O zaman   randevu Elif adına oluşur, Elif listeden çıkar, randevu kuaförün listesinde görünür
K4 Verilen   iptal edilen saate 2 saatten az kalmış
   Olduğunda müşteri iptal eder
   O zaman   öneri gönderilmez; saat kuaförün listesinde "boş" görünür

Uç durumlar:  Aynı müşteri listeye ikinci kez yazılırsa: "Zaten bekleme listesindesiniz." (kayıt eklenmez)
              Öneri süresi 22:00–08:00 arasında işlemez (gece kimse uyandırılmaz).
              Kuaför saati elle doldurursa bekleyen öneri geçersiz olur; müşteri "Bu saat doldu" görür.
Kapsam dışı:  Aynı anda birden çok kişiye öneri · sırayı kuaförün elle değiştirmesi · SMS (yalnız WhatsApp bağlantısı)
```

### Uç durum hatırlatma listesi

Her ölçüt için "ya şu olursa?" diye bu listeden geçin; uygun olanları ölçüt ya da uç durum satırı yapın:

| Eksen        | Sorular                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| Miktar       | 0 kayıt (boş durum), 1 kayıt, çok kayıt (sayfalama), en uzun metin                        |
| Metin        | Türkçe harfler (İ, ı, ğ), emoji, baştaki/sondaki boşluk, yalnız boşluk                    |
| Zaman        | Gece yarısı, ay sonu, 29 Şubat, saat dilimi, geçmiş tarih, süre dolması                   |
| Eşzamanlılık | İki kişi aynı anda aynı saati alırsa; çift dokunuş (iki kez gönderim)                     |
| Bağlantı     | Ağ yok, yavaş ağ, istek yarıda kesildi                                                    |
| Yetki        | Başkasının kaydına erişim, çıkış yapmış kullanıcı, süresi geçmiş bağlantı                 |
| Geri alma    | Silme, iptal, yanlış dokunuş sonrası geri dönüş ([UX temelleri](ux-temelleri.md))         |
| Sürüm        | Eski sürümdeki istemci, eski kayıtlarda olmayan yeni alan                                 |

## Belirsiz sözcük denetimi

Belirsiz sözcük, modelin kendi yorumunu yazacağı yerdir. Ölçütleri bir modele vermeden önce bu süzgeçten geçirin:

```python calistir
import re

VAGUE = ["hızlı", "kolay", "kolayca", "kullanıcı dostu", "sezgisel", "uygun şekilde", "gerekirse", "mümkünse",
         "vb.", "vs.", "esnek", "modern", "güzel", "makul", "yeterli", "sorunsuz", "düzgün", "optimize"]
PARTS = ("Verilen", "Olduğunda", "O zaman")


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def lint(criterion: str, lower=lower_tr) -> list[str]:
    issues = [f"eksik: {part}" for part in PARTS if part not in criterion]
    text = lower(criterion)
    issues += [f"belirsiz: {w}" for w in VAGUE if re.search(rf"(?<!\w){re.escape(w)}(?!\w)", text)]
    return issues


good = (
    "Verilen salı 14:00 dolu ve listede Elif ile Mert var Olduğunda 14:00'ün müşterisi iptal eder "
    'O zaman Elif\'e "Salı 14:00 boşaldı" iletisi gider ve saat 30 dakika Elif\'e ayrılır'
)
assert lint(good) == []
assert lint("Bekleme listesi kolay kullanılmalı") == [
    "eksik: Verilen", "eksik: Olduğunda", "eksik: O zaman", "belirsiz: kolay"]
assert lint("Verilen liste dolu Olduğunda iptal olur O zaman gerekirse bildirim gider") == ["belirsiz: gerekirse"]

shouting = "Verilen 500 kayıt var Olduğunda arama yapılır O zaman sonuç HIZLI gelir"
assert lint(shouting) == ["belirsiz: hızlı"]
# YANLIŞ: düz lower() "HIZLI"yı "hizli" yapar; belirsiz sözcük gözden kaçar
assert lint(shouting, lower=str.lower) == []
print("ölçüt denetimi tamam")
```

```cikti
ölçüt denetimi tamam
```

Süzgeç sözcük listesi kadar iyidir; ölçütün **gözlenebilir** bir sonuçla bitip bitmediğine yine siz bakarsınız
("görünür", "gider", "oluşur", tırnak içinde metin, bir sayı).

## Küçük modele iş tanımı şablonu

Havuzdaki her temelin `AGENTS.md` dosyasında komutlar, değişmez kurallar ve tarifler vardır (ör.
[`uygulama/AGENTS.md`](../../uygulama/AGENTS.md)). İş tanımı o dosyaya **atıf yapar**, onu yinelemez:

```text
GÖREV:       Bekleme listesi: iptal edilen saati listedeki ilk müşteriye öner.
TEMEL:       havuz/uygulama — önce AGENTS.md'yi baştan sona oku. Tarifler: "Yeni veri türü (varlık) — üreteçle".
OKU:         web/src/features/tasks/ (örnek kalıp), AGENTS.md → "Değişmez kurallar"
HİKÂYE:      Kuaför olarak ... istiyorum, böylece ... .
KABUL:       K1–K4 (yukarıdaki gibi, Verilen/Olduğunda/O zaman). Her K için bir test yaz.
UÇ DURUMLAR: (liste)
KAPSAM DIŞI: (liste) — bunlara dokunma; hazırlığını da yapma (boş alan, gizli düğme, ayar).
DOKUNMA:     Kimlik, oturum ve eşitleme dosyaları; shared/ içinde yalnız geriye uyumlu ekleme.
METİNLER:    Yeni arayüz metni yalnız web/src/i18n/tr.json'a; tırnak içindeki metinleri aynen kullan.
DOĞRULAMA:   npm run check → yeşil; çıktının son 20 satırını göster.
TESLİM:      Değişen dosyalar; her K'nin hangi testle korunduğu; 3–6 maddelik özet; yaptığın varsayımlar.
ÖNCE:        Kod yazmadan önce bu tanımda eksik gördüğün en çok 3 soruyu yaz ve bekle.
```

Gerçek bir örnek: Köprü projesinin (depo kökü) `docs/sprints/S01/brief.md` dosyasındaki kabul kriterleri
tablosu (K1–K13), her kriterin yanında **nasıl doğrulanacağını** da yazar ("e2e: Konuş → Hızlı ihtiyaçlar → Su").
Bu sütun, "bitti mi?" tartışmasını bitirir.

## Tuzaklar

| Belirti                                                       | Neden                                           | Çözüm                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Model "bitti" dedi; istenen bu değildi                        | Ölçüt sıfatla yazıldı, örnek yok                | Verilen/Olduğunda/O zaman; her ölçüt bir test                               |
| Hata olunca ne olacağı yayında tartışılıyor                   | Yalnız mutlu yol yazıldı                        | Her ölçüt için "ya olmazsa?"; uç durum listesinden geçin                    |
| Model istenmeyen özellik ekledi                               | Kapsam dışı yazılmadı                           | KAPSAM DIŞI + "hazırlığını da yapma"                                        |
| Model kimlik ya da eşitleme koduna dokundu                    | Dokunma listesi yok                             | DOKUNMA satırı; temelin değişmez kurallarına atıf                           |
| Testler yeşil, ölçüt karşılanmıyor                            | Testler ölçütten türetilmedi                    | Teslimde her K için test adı isteyin; testi ölçütle karşılaştırın           |
| Gereksinim çözümü dikte ediyor ("açılır menü olsun")          | "Ne" yerine "nasıl" yazıldı                     | Davranışı yazın; biçimi tasarıma bırakın (ilke varsa ilkeyi yazın)          |
| Model gereksinimin yarısını unuttu                            | Tek istemde çok hikâye                          | Bir hikâye = bir istem; en çok 5–7 ölçüt                                    |
| Ekranda "IPTAL" ya da "iPTAL" görünüyor                       | Metin kuralı yazılmadı                          | METİNLER satırı; [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md) |
| Süre ölçütü gece yarısı ya da ay sonunda bozuluyor            | Zaman uç durumları yazılmadı                    | Gece yarısı, ay sonu, saat dilimi satırları                                 |
| Ölçüt "hızlı" diyor, kimse neyin hızlı olduğunu bilmiyor      | Ölçü ve koşul yok                               | Sayı + koşul + ölçme yöntemi                                                |

## Denetim listesi

- [ ] Hikâyede somut rol, eylem ve "böylece" ile gerekçe var.
- [ ] 3–7 kabul ölçütü var; her biri Verilen/Olduğunda/O zaman ya da girdi → çıktı örneği.
- [ ] Ölçütler belirsiz sözcük süzgecinden geçti.
- [ ] En az bir hata yolu ve bir uç durum ölçütü var.
- [ ] Kapsam dışı en az 2 madde; dokunulmayacak yerler yazılı.
- [ ] Kullanıcıya görünen metinler tırnak içinde, son hâliyle.
- [ ] Doğrulama komutu ve teslimde istenenler yazılı.
- [ ] Teslimde her ölçüt bir teste eşlendi ve test adı ölçütü anlatıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** iş tanımı şablonunu doldurup verin; tek istemde tek hikâye. İlk adım olarak yalnız soruları
  isteyin ("eksik gördüğün en çok 3 soru"); küçük model kendiliğinden sormaz, varsayar.
- **Ölçüt yazdırırken:** "Her ölçüt Verilen/Olduğunda/O zaman biçiminde olsun ve gözlenebilir bir sonuçla bitsin.
  'Hızlı, kolay, uygun şekilde, gerekirse' yazma. En az bir hata yolu ve bir uç durum ekle."
- **Modelin tipik hatası:** yalnız mutlu yolu yazar; ölçüte uygulama ayrıntısı karıştırır ("durum Redux'ta
  tutulur"); test yazmadan "ölçütler karşılandı" der; kapsam dışındaki şeyin "altyapısını" kurar.
- **Çıktıda denetleyin:** K → test eşlemesi; testlerin içinde ölçütteki sayılar ve metinler geçiyor mu; değişiklikte
  kapsam dışı sözcükler var mı; DOKUNMA listesindeki dosyalar değişmiş mi (`git diff --stat`).

## İlgili

- [MVP kapsamı](mvp-kapsami.md): hikâyelerin geldiği çekirdek akış ve yapılmayacaklar.
- [Önceliklendirme](onceliklendirme.md): hangi hikâyenin önce yazılacağı.
- [İşi parçalama](../00-yontem/isi-parcalama.md): dilim ve bitti tanımı şablonu.
- [Geliştirme döngüsü ve kalite kapıları](gelistirme-dongusu-ve-kapilar.md): ölçütlerin hangi kapıda, nasıl denetlendiği.
- [İstem mühendisliği](../85-llm/istem-muhendisligi.md) ve [küçük modeller için istem](../85-llm/kucuk-modeller-icin-istem.md).
- Hazır istem kalıpları: [`rehber/ISTEMLER.md`](../../rehber/ISTEMLER.md).
- [Arayüz dili](../97-turkce/arayuz-dili.md): ölçütlerdeki tırnaklı metinlerin Türkçesi.
