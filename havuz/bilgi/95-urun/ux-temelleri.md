---
baslik: UX temelleri
ozet: Bilişsel yük, tanıma ve hatırlama, Hick ve Fitts sezgisi, tutarlılık, geri bildirim, hata önleme ve geri alma, boş ve ilk durum, akış çizme; Köprü'nün on ilkesiyle örnekli.
etiketler: [urun, ux, kullanilabilirlik, tasarim-ilkeleri, arayuz]
duzey: temel
guncellik: 2026-11
---

# UX temelleri

> Bu notu ne zaman okumalı: bir ekranı tasarlatırken ya da bir modelin yaptığı ekranı incelerken; kullanıcılar
> "nereye basacağımı bilemedim" dediğinde; bir ürünün tasarım ilkelerini yazarken.

## Temel fikir

İyi arayüz kullanıcının **düşünmesi gereken şeyi azaltır**. Altı sezgi işin çoğunu taşır:

1. **Bilişsel yük:** insan aynı anda az şey tutar. Ekrandaki seçenek, metin ve karar azaldıkça hata azalır.
2. **Tanıma > hatırlama:** seçenek görünür olmalı; kullanıcı kod, biçim, yol ezberlememeli.
3. **Hick:** seçenek arttıkça karar süresi artar; ama iç içe menüye bölmek kararı hızlandırmaz.
4. **Fitts:** hedef büyüdükçe ve yakınlaştıkça dokunmak hızlanır ve hatasızlaşır.
5. **Tutarlılık ve geri bildirim:** aynı şey hep aynı yerde ve adla; her eylemin anında görünür bir sonucu var.
6. **Hata affeder:** önce hata önlenir; olursa geri alınır; onaysız ve geri alınamaz yıkıcı işlem yoktur.

Bunlar kural değil sezgidir; son sözü [kullanılabilirlik testi](kullanilabilirlik-testi.md) söyler.

## Karar tablosu

| Durum                                                   | İlke                        | Karar                                                                    |
| ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Ekranda üç birincil görünümlü düğme                     | Bilişsel yük                | Ekran başına tek birincil eylem; ötekiler ikincil ya da menüde           |
| Kullanıcı bir değeri hatırlayıp yazıyor (kod, tarih)    | Tanıma > hatırlama          | Seçim listesi, takvim, son kullanılanlar, öneri                          |
| 20+ seçenekli düz liste                                 | Hick + tarama               | Gruplayın, arama ve sık kullanılanlar ekleyin; derin menüye bölmeyin     |
| Sık kullanılan küçük düğme ekranın üst köşesinde        | Fitts                       | Büyütün; başparmağın ulaştığı alt bölgeye alın                           |
| "Sil" düğmesi "Kaydet"in hemen yanında                  | Fitts (tersine), hata önleme | Uzaklaştırın; geri alınabilir yapın                                     |
| Aynı işlev bir yerde "Kaydet", bir yerde "Tamam"        | Tutarlılık                  | Tek sözlük; eylemi söyleyen aynı fiil, aynı simge, aynı yer              |
| Dokunuştan sonra bir şey olmuyor gibi                   | Geri bildirim               | Anında görsel tepki; uzun işte ilerleme ve iptal                         |
| Sık ve geri alınabilir yıkıcı işlem (sil, arşivle)      | Hata affeder                | Hemen yap + "Geri al" bildirimi; onay penceresi koyma                    |
| Seyrek ve geri alınamaz işlem (hesabı sil, ödeme)       | Hata affeder                | Onay penceresi; düğmede eylemin adı ("Hesabı sil"), "Tamam" değil        |
| Boş liste ekranı                                        | İlk durum                   | Ne olduğu + neden boş + ilk adımı başlatan tek düğme                    |
| Form hatası                                             | Hata önleme, suçlamama      | Hata alanın yanında, nasıl düzeleceğini söyler; yazılanlar korunur       |

## Hick ve Fitts: sayıyla sezgi

Fitts zorluğu `log2(uzaklık / genişlik + 1)`, Hick karar yükü `log2(seçenek + 1)` ile büyür. Mutlak süre vermezler
(sabitleri ölçümle bulunur); **karşılaştırma** için kullanılırlar:

```python calistir
import math


def fitts_id(distance: float, width: float) -> float:
    """Fitts zorluk göstergesi (bit): uzaklık arttıkça ve hedef küçüldükçe büyür."""
    return math.log2(distance / width + 1)


def hick_bits(choices: int) -> float:
    """Hick: eşit olası, tanıdık seçenekler arasında karar yükü (bit)."""
    return math.log2(choices + 1)


for width in (24, 44, 72):  # aynı uzaklıkta (300 px) üç hedef boyu
    print(f"{width} px hedef: zorluk {fitts_id(300, width):.2f} bit")
assert fitts_id(300, 72) < fitts_id(300, 44) < fitts_id(300, 24)
assert fitts_id(100, 44) < fitts_id(600, 72)  # yakın ve orta boy, uzak ve büyükten kolay

flat = hick_bits(16)  # 16 seçenek tek ekranda
nested = hick_bits(4) + hick_bits(4)  # 4 grup × 4 seçenek, iki seviye
print(f"düz 16 seçenek: {flat:.2f} bit · iç içe 4+4: {nested:.2f} bit")
assert flat < nested  # derinlik kararı hızlandırmaz: her seviye bir karar daha
```

```cikti
24 px hedef: zorluk 3.75 bit
44 px hedef: zorluk 2.97 bit
72 px hedef: zorluk 2.37 bit
düz 16 seçenek: 4.09 bit · iç içe 4+4: 4.64 bit
```

Çıkarımlar: (1) Hedefi büyütmek, özellikle titreyen ya da tek elle kullanan kişide, en ucuz kazançtır. (2) Seçenekleri
iç içe menülere bölmek karar yükünü azaltmaz; her seviye bir karar ve bir dokunuş daha ekler. Geniş ve iyi
gruplanmış tek ekran, derin menüden iyidir; derinlik sınırı bu yüzden konur
([bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md)). (3) Hick yalnız tanıdık seçenekler için geçerlidir; yabancı
seçenekleri insanlar tek tek okur. Orada iyi ad, simge ve gruplama hızlandırır.

## Köprü'nün on ilkesi: ilkeden karara

Köprü projesinin (depo kökü) `CLAUDE.md` dosyasındaki on ilke, genel UX sezgilerinin bir kullanıcı grubuna
(afazili yetişkinler) uyarlanmış hâlidir. Kendi ürününüz için aynı biçimi kullanın: **ilke → karar → denetim**.

| Köprü ilkesi                  | UX kavramı                            | Somut karar                                                 | Nasıl denetleniyor              |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| 1. Önce görsel, sonra kelime  | Tanıma > hatırlama; okuma yükü        | Her öğe resim + kelime + ses                                | İçerik şeması doğrulaması       |
| 2. Bir ekranda bir iş         | Bilişsel yük, Hick                    | Ekran başına tek birincil eylem; menü derinliği ≤ 3         | Şema kuralı + uçtan uca test    |
| 3. Büyük ve tek elle          | Fitts; motor güçlük                   | Dokunma alanı ≥ 72 px; sol el modu düzeni aynalar           | Uçtan uca testte ölçüm          |
| 4. Yerler değişmez            | Tutarlılık; uzamsal bellek            | Kart sırası sabit; sık kullanılanlar ayrı satırda           | Uçtan uca test                  |
| 5. Hata affeder               | Hata önleme, geri alma                | Onaysız silme yok; her işlem geri alınabilir; süre baskısı yok | Birim + uçtan uca test       |
| 6. Yetişkine saygı            | Ton, güven                            | Çocuksu çizim, ton ve ödül yok                              | Uzman incelemesi                |
| 7. Önce kişisel               | Tanıma; anlam                         | Kendi fotoğrafı ve sesi hazır içerikten önce                | Uçtan uca test                  |
| 8. Başarısızlık hissettirmez  | Geri bildirim tonu                    | Kırmızı çarpı ve puan kaybı yok; ipucu bir dokunuş uzakta   | Uzman incelemesi + test         |
| 9. Gizli ve çevrimdışı        | Güven; kullanım bağlamı               | İlk açılıştan sonra internet gerekmez                       | Çevrimdışı uçtan uca test       |
| 10. Terapinin yerini almaz    | Beklenti yönetimi                     | Tedavi vaadi yok                                            | Metin incelemesi                |

İlkenin işe yaraması için "nasıl denetleniyor" sütunu dolu olmalıdır; Köprü'de bu sütun "bitti" tanımına ve
otomatik testlere bağlıdır (72 px, 360 px'te yatay kaydırma yok, uçak kipinde çalışma).

## Geri bildirim: yaygın süre eşikleri

| Yanıt süresi    | Ne gösterilir                                                                 |
| --------------- | ----------------------------------------------------------------------------- |
| ~0,1 sn altı    | Anlık hissedilir; düğmenin basılı görünmesi yeter                             |
| ~1 sn'ye kadar  | Akış bozulmaz; gösterge gerekmez                                              |
| Birkaç saniye   | Dönen gösterge ya da iskelet ekran; düğme ikinci dokunuşa kilitli             |
| ~10 sn üstü     | İlerleme, kalan süre, iptal; mümkünse arka planda yapıp bitince haber verin   |

Çift dokunuş en sık hatadır: kullanıcı tepki görmeyince bir daha basar, iki kayıt oluşur. Gönderirken düğmeyi
kilitleyin ve sunucuda yinelenen isteği tanıyın.

## Hata önleme ve geri alma

- **Önleyin:** yazmak yerine seçtirin; biçimleri esnek kabul edin ("0532 123 45 67", "5321234567" ve "+90 532…"
  aynı numaradır); güvenli varsayılan seçin; yapılamayan işin düğmesini gizlemek yerine nedenini söyleyin.
- **Geri alınabilir yapın:** sık işlemde "Sil → Geri al" (birkaç saniyelik bildirim) ve "Son silinenler". Havuzdaki
  [`uygulama`](../../uygulama/AGENTS.md) temelinin 10. değişmez kuralı tam budur: yıkıcı işlem ya onaylıdır ya geri
  alınabilir.
- **Onayı seyrek tutun:** her işlemde onay penceresi çıkarsa kullanıcı okumadan "Tamam"a basar (onay yorgunluğu).
- **Hata iletisi:** ne oldu + nasıl düzelir, suçlamadan. "Geçersiz giriş!" değil, "Telefon numarası 10 haneli
  olmalı. Örnek: 532 123 45 67". Yazılanlar silinmez.

## Boş ve ilk durum

Her liste ekranının beş hâli vardır: **ilk boş** (hiç kayıt yok), **süzgeç boş** (arama sonuç vermedi),
**yükleniyor**, **hata**, **dolu**. Modeller çoğunlukla yalnız "dolu"yu yapar.

| Durum        | Örnek metin (Sedir, kurgusal)                                                            | Düğme                 |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------- |
| İlk boş      | "Henüz randevu yok. Bağlantınızı paylaşınca müşterilerin randevuları burada görünür."     | "Bağlantıyı kopyala"  |
| Süzgeç boş   | "'Elif' ile eşleşen randevu yok."                                                        | "Aramayı temizle"     |
| Yükleniyor   | (iskelet satırlar; metin yok)                                                            | —                     |
| Hata         | "Randevular yüklenemedi. İnternet bağlantınızı kontrol edip yeniden deneyin."             | "Yeniden dene"        |

İlk boş durum, ürünün ilk izlenimidir: ne işe yaradığını söyler ve **ilk değerli eyleme** götürür
([bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md) → ilk kullanım deneyimi).

## Akış çizme (metinle)

Kutu = tek işi olan bir ekran; ok = tek eylem; dal = hata ya da uç durum. Akışın üstüne hedefi yazın, sonra
dokunuşları sayın.

```text
Akış: Müşteri randevu alır (Sedir, kurgusal)                   Hedef: ≤ 4 dokunuş, ≤ 60 saniye
[Instagram'daki bağlantı] --dokun--> [Hizmetler]
  --hizmet seç--> [Boş saatler: bugün + 6 gün]
      └─ boş saat yok --> [“Bu hafta dolu. Bekleme listesine yazılmak ister misiniz?”]
  --saat seç--> [Ad ve telefon]
      └─ telefon hatalı --> aynı ekran; ileti alanın yanında; yazılanlar korunur
  --Onayla--> [“Randevunuz alındı: Salı 14:00” + Takvime ekle + İptal bağlantısı]
Dokunuş: bağlantı 1 + hizmet 1 + saat 1 + onay 1 = 4 (ad ve telefon yazmak hariç)
```

## Tuzaklar

| Belirti                                                          | Neden                                              | Çözüm                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Kullanıcı ekranda donup kalıyor                                  | Çok seçenek, birincil eylem belirsiz               | Tek birincil eylem; ötekiler ikincil                                   |
| "Yanlışlıkla sildim" şikâyetleri                                 | Sil düğmesi yakın, geri alma yok                   | Uzaklaştırın; "Geri al" ve "Son silinenler"                             |
| Kullanıcı onay pencerelerini okumadan geçiyor                    | Her işlemde onay: onay yorgunluğu                  | Sık işlemde geri al; onayı seyrek ve geri alınamaz işe saklayın          |
| Yaşlı kullanıcılar düğmeleri ıskalıyor                           | Küçük hedef (Fitts)                                | Alt sınırı ürün kararıyla büyütün (ör. 48 px; motor güçlükte 72 px)     |
| İki randevu oluştu, kullanıcı "bir kez bastım" diyor             | Geri bildirim yok, düğme kilitlenmiyor             | Anında tepki; gönderirken kilit; sunucuda yinelenen isteği tanıma       |
| Boş ekranda yalnız "Kayıt bulunamadı" yazıyor                    | İlk durum tasarlanmadı                             | Ne / neden boş / ilk adım düğmesi                                       |
| Aranan ayar dördüncü seviyede                                    | Derinlik genişliğe tercih edildi                   | ≤ 3 seviye; geniş ve gruplanmış ekran; arama                            |
| Liste her açılışta yeniden sıralanıyor, kullanıcı yerini kaybediyor | Sıklığa göre otomatik sıralama                  | Sabit sıra; sık kullanılanlar ayrı satırda (Köprü ilke 4)              |
| Ekran görüntüsünde güzel, telefonda kullanılamıyor               | Masaüstünde tasarlandı ve bakıldı                  | 360 px genişlikte, tek elle deneyin                                    |

## Denetim listesi

- [ ] Her ekranın tek birincil eylemi var ve görsel olarak en belirgin olan o.
- [ ] Kullanıcı hiçbir değeri ezberlemek zorunda değil (seçim, öneri, son kullanılanlar).
- [ ] Dokunma hedefleri ürünün yazılı alt sınırının üstünde.
- [ ] Yıkıcı düğmeler birincil düğmeden uzak; sık işlemde geri al, seyrek ve geri alınamaz işlemde onay.
- [ ] Her eylem anında görsel tepki veriyor; uzun işte ilerleme ve iptal var; gönderim düğmesi kilitleniyor.
- [ ] Aynı işlev her yerde aynı ad, simge ve yerde (metinler tek sözlükte).
- [ ] Her liste ekranında ilk boş, süzgeç boş, yükleniyor ve hata hâlleri yapıldı.
- [ ] Hata iletileri suçlamıyor, nasıl düzeleceğini söylüyor, yazılanları koruyor.
- [ ] Ana akışlar metinle çizildi; dokunuş hedefi yazılı ve tutuyor.
- [ ] Ürün ilkeleri "ilke → karar → denetim" biçiminde yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ekranda tek birincil eylem olsun: <eylem>. Ötekiler ikincil görünümde. İlk boş, süzgeç boş,
  yükleniyor ve hata hâllerini de yap. Silme 'Geri al' bildirimiyle geri alınabilir olsun; onay penceresi koyma.
  Gönderirken düğmeyi kilitle. Metinleri sözlük dosyasına yaz."
- **Modelin tipik hatası:** bütün eylemleri aynı ağırlıkta düğme yapar; boş durumu "Veri yok" diye geçer; hata
  iletisini İngilizce kalıptan çevirir ("Geçersiz giriş"); silmede hem onay hem geri al koyar ya da hiçbirini;
  simge düğmesine erişilebilir ad vermez.
- **Çıktıda denetleyin:** 360 px genişlikte ekran görüntüsü isteyin; birincil düğme sayısını sayın; dört hâli tek tek
  açtırın; metinler sözlükte mi bakın.
- **İnceleme istemi:** "Bu ekranı şu altı ilkeyle incele: tek birincil eylem, tanıma > hatırlama, dokunma alanı,
  geri alma, geri bildirim, boş ve hata hâlleri. Her bulgu için önem (Engel / Önemli / Öneri), yer ve somut
  düzeltme yaz." (Köprü'nün inceleme biçimi.)

## İlgili

- [Bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md): ekran envanteri, derinlik, dokunuş sayısı, ilk kullanım.
- [Erişilebilirlik ürün kararı](erisilebilirlik-urun-karari.md): dokunma alanı ve karşıtlık alt sınırları.
- [Kullanılabilirlik testi](kullanilabilirlik-testi.md): sezgiyi kullanıcıyla sınamak.
- [Gereksinim yazma](gereksinim-yazma.md): boş, hata ve uç durumları ölçüte çevirmek.
- Uygulama ayrıntıları: [formlar](../20-web-onyuz/formlar.md) (doğrulama zamanı, çift gönderim, hata gösterimi),
  [erişilebilirlik uygulaması](../20-web-onyuz/erisilebilirlik-uygulama.md) (odak, klavye, erişilebilir ad).
  Arayüz dili ve hata iletisi yazımı: `97-turkce` kümesi.
- Hazır bileşenler (boş durum, onay penceresi, eylemli bildirim): [`uygulama`](../../uygulama/).
