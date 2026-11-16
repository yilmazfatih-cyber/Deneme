---
baslik: Tutarlılık modelleri: güçlü, nihai ve arası
ozet: Güçlü ve nihai tutarlılık, kendi yazdığını oku, monoton okuma ve kayıp güncelleme; CAP/PACELC'in pratik anlamı, bayat verinin arayüze yansıması ve çözüm kalıpları; çalışan örneklerle.
etiketler: [tutarlilik, kopya, cap, eszamanlilik, dagitik-sistem]
duzey: ileri
guncellik: 2026-11
---

# Tutarlılık modelleri: güçlü, nihai ve arası

> Bu notu ne zaman okumalı: okuma kopyası, önbellek, arama dizini, çevrimdışı çalışma ya da ikinci bir servis
> eklenirken; kullanıcı "kaydettim ama eski hâli görüyorum", "yorum göründü sonra kayboldu" dediğinde; stok,
> bakiye, koltuk gibi "iki kişi aynı anda alırsa" sorusu olan bir özellik yazılırken.

## Temel fikir

- Tutarlılık modeli, "bir okuma hangi yazmaları görmeyi **garanti eder**" sözleşmesidir.
- **Güçlü** (doğrusallaştırılabilir, linearizable): her okuma en son tamamlanmış yazmayı görür. Tek veritabanında,
  birincilden ve işlem içinde okuyunca elinizdedir.
- **Nihai** (eventual): yazmalar sonunda her kopyaya ulaşır; ne zaman ulaşacağı belirsizdir, arada bayat okuma olur.
- İkisinin arasında kullanıcıyı en çok ilgilendiren **oturum garantileri** vardır: kendi yazdığını oku
  (read-your-writes), monoton okuma (zaman geri gitmez), nedensel sıra (cevap sorudan önce görünmez).
- Tek sunucu + tek veritabanında bu sorunların çoğu yoktur. **Her kopya** sorunu geri getirir: okuma kopyası,
  önbellek, CDN, arama dizini, çevrimdışı cihaz, ikinci sekme, başka bir servisin veritabanı.

## Karar tablosu: hangi veri hangi garantiyi ister

| Veri / ekran                                         | Gereken garanti            | Nasıl                                                         |
| ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| Bakiye, ödeme, stok düşme, koltuk, benzersiz ad      | Güçlü                      | Tek birincil, işlem, koşullu güncelleme, benzersizlik kısıtı  |
| "Kaydet"ten sonraki ekran, profil, ayarlar           | Kendi yazdığını oku        | Sürüm belirteci, yazandan sonra birincil, istemcide birleştirme |
| Yorum dizisi, sohbet, görev geçmişi                  | Nedensel / tutarlı sıra    | Sunucunun verdiği sıra numarası; istemci sırayı ona göre kurar |
| Sayfalar arası gezinme (liste → ayrıntı → liste)     | Monoton okuma              | Oturumun gördüğü en yüksek sürüm; yapışkan kopya              |
| Beğeni, görüntülenme sayısı, öneriler                | Nihai (saniye–dakika)      | Kopya, önbellek, toplu sayaç; "yaklaşık" dil                  |
| Arama sonuçları                                      | Nihai                      | "Yeni kayıt birkaç saniye içinde aranabilir"                  |
| Rapor, pano                                          | Nihai (dakika–saat)        | Kopya ya da ambar; ekranda "son güncelleme" zamanı            |

Seçim **veri başına** yapılır, sistem başına değil: aynı uygulamada bakiye güçlü, beğeni sayısı nihai olabilir.

## Kendi yazdığını oku ve monoton okuma

Okuma kopyası birincili geriden izler. Kullanıcı adını değiştirip sayfayı yenilediğinde okuma geride kalmış bir
kopyaya giderse eski adı görür ve "kaydetmedi" sanıp yeniden dener. İki kopya farklı geride kalırsa bir yorum
görünür, sonraki yenilemede kaybolur. İkisinin de çaresi aynıdır: istemci gördüğü/yazdığı **en yüksek sürümü**
taşır; o sürüme ulaşmamış kopya kullanılmaz.

```python calistir
gunluk: list[tuple[float, int, str, str]] = []  # birincilin yazma günlüğü: (zaman, sürüm, anahtar, değer)


def yaz(t: float, anahtar: str, deger: str) -> int:
    gunluk.append((t, len(gunluk) + 1, anahtar, deger))
    return len(gunluk)  # yeni sürüm: istemciye "en az bu sürümü gör" belirteci olarak döner


def oku(t: float, anahtar: str, gecikme: float) -> tuple[str | None, int]:
    """`gecikme` sn geriden gelen bir kopyadan oku → (değer, kopyanın ulaştığı sürüm). gecikme=0: birincil."""
    deger, surum = None, 0
    for zaman, s, a, d in gunluk:
        if zaman <= t - gecikme:
            surum, deger = s, (d if a == anahtar else deger)
    return deger, surum


def oku_belirtecli(t: float, anahtar: str, en_az: int, gecikme: float) -> str | None:
    deger, surum = oku(t, anahtar, gecikme)
    return deger if surum >= en_az else oku(t, anahtar, 0)[0]  # kopya geride: birincile düş


yaz(0.0, "ad", "Ayşe")
belirtec = yaz(10.0, "ad", "Ayşe Yılmaz")  # kullanıcı adını değiştirdi
# 0,2 sn sonra sayfa yenileniyor; okuma 1 sn geriden gelen kopyaya gidiyor
assert oku(10.2, "ad", gecikme=1.0)[0] == "Ayşe"  # YANLIŞ: "kaydetmedi mi?" → kullanıcı yeniden dener
assert oku_belirtecli(10.2, "ad", belirtec, gecikme=1.0) == "Ayşe Yılmaz"  # DOĞRU: kendi yazdığını görür
assert oku_belirtecli(12.0, "ad", belirtec, gecikme=1.0) == "Ayşe Yılmaz"  # kopya yetişince kopyadan okur

# Monoton okuma: iki kopya, gecikmeleri farklı; yük dengeleyici sırayla birine gönderiyor
yaz(20.0, "yorum:7", "Harika fikir")
gorulen = [oku(20.5, "yorum:7", 0.1)[0], oku(20.6, "yorum:7", 2.0)[0]]
assert gorulen == ["Harika fikir", None]  # YANLIŞ: yorum göründü, sonra kayboldu
en_yuksek = oku(20.5, "yorum:7", 0.1)[1]  # oturum, gördüğü en yüksek sürümü saklar
assert oku_belirtecli(20.6, "yorum:7", en_yuksek, gecikme=2.0) == "Harika fikir"  # DOĞRU: geri gitmez
print("kendi yazdığını oku ve monoton okuma: belirteçle düzeldi")
```

```cikti
kendi yazdığını oku ve monoton okuma: belirteçle düzeldi
```

Belirteç gerçekte birincilin günlük konumudur (Postgres'te LSN) ya da kaydın sürüm sütunu; çerezde ya da istek
başlığında taşınır. Daha basit seçenek: kullanıcı yazdıktan sonra birkaç saniye onun okumalarını birincile
yönlendirmek (gecikme o süreyi aşarsa yine bozulur).

Havuzdaki eşitleme bu sorunu istemcide çözer: ekranda görünen, **sunucunun son bildirdiği hâl + henüz
onaylanmamış kendi değişikliklerim**dir ([`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md) →
"Yeniden tabanlama"); imleç hiç geri gitmez, eski bir sayfa yeni hâli ezmez (monoton okuma).

## Kayıp güncelleme

İki istek aynı kaydı okur, okuduğu değerden yeni değeri hesaplar ve üzerine yazar: birinin değişikliği kaybolur.
Kopya olmasa bile, tek veritabanında olur. Çareler (çalışan örnekleri:
[İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md) → "Kayıp güncelleme ve üç çözüm"):

| Çare                                    | Biçim                                                                 | Ne zaman                     |
| --------------------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| Hesabı veritabanına yaptır              | `UPDATE stok SET adet = adet - 1 WHERE urun = ? AND adet > 0`         | Sayaç, stok, bakiye          |
| İyimser kilit (sürüm sütunu)            | `UPDATE … SET …, surum = surum + 1 WHERE id = ? AND surum = ?`; 0 satır → "değişti" | Formla düzenleme |
| Kötümser kilit                          | Postgres'te `SELECT … FOR UPDATE`; SQLite'ta `BEGIN IMMEDIATE`        | Kısa ve sık çakışan işlem    |

Sistem tasarımı açısından önemli olan: bu çareler **tek bir yazma noktası** (birincil veritabanı) varsayar. Aynı
kayıt iki yerde yazılabiliyorsa (iki bölge, çevrimdışı cihaz) koşullu güncelleme yetmez; çakışma çözme gerekir
([Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md)).

HTTP'de aynı fikir `ETag` + `If-Match` başlıklarıdır: istemci okuduğu sürümü gönderir, sunucu değişmişse 412 döner
([HTTP temelleri](../30-arkauc/http-temelleri.md)). Uzun formlarda (iki kişi aynı belgeyi düzenliyor) kullanıcıya
"bu kayıt siz düzenlerken değişti" deyip iki hâli göstermek, sessizce üzerine yazmaktan iyidir.

## CAP ve PACELC: pratik anlamı

- **CAP:** ağ bölündüğünde (partition) bir taraf ötekine ulaşamaz. O an iki seçenek vardır: ya bazı istekleri
  **reddedersiniz** (tutarlılık) ya da cevap verip bayat/çakışan veri riskini alırsınız (erişilebilirlik).
  Bölünmeyi seçemezsiniz; ağ bölünür.
- **PACELC:** bölünme **yokken** de bir seçim vardır: gecikme ↔ tutarlılık. Eşzamanlı kopyalama (yazma, kopyanın
  onayını bekler) tutarlı ama yavaştır; eşzamansız kopyalama hızlıdır ama kopya geride kalır.

| Özellik                                   | Bölünmede seçim             | Neden                                                     |
| ----------------------------------------- | --------------------------- | --------------------------------------------------------- |
| Çevrimdışı not/görev uygulaması           | Erişilebilirlik             | Kullanıcı yazmaya devam eder; çakışma sonra çözülür       |
| Ödeme, para transferi                     | Tutarlılık                  | "Şu an yapılamıyor" demek, çift ödemeden iyidir           |
| Bilet/koltuk satışı                       | Tutarlılık (satış anında)   | Aynı koltuk iki kişiye satılmaz; göz atma bayat olabilir  |
| Sosyal akış, beğeni                       | Erişilebilirlik             | Birkaç saniye bayatlık kimseyi incitmez                   |
| Kullanıcı adı alma                        | Tutarlılık                  | Benzersizlik tek yerde (birincil veritabanı) denetlenir   |

Tek sunuculu bir üründe "bölünme" en çok **istemci ile sunucu** arasında yaşanır: telefon çevrimdışı. Bu yüzden
CAP'in pratik sorusu şudur: "çevrimdışıyken bu işlem yapılabilir mi?" Ayrıntı:
[Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md). Satış anında tutarlılığın çalışan örneği (çift
rezervasyonu veritabanına engelletmek, süreli tutma): [Randevu sistemi örneği](ornek-randevu-sistemi.md).

## Arayüze yansıması

- **İyimser güncelleme** (optimistic UI): değişikliği hemen göster, arkada gönder; başarısız olursa geri al ve
  söyle. Bu, istemci tarafında "kendi yazdığını oku"dur.
- **Durum göstergesi:** "kaydediliyor… / kaydedildi / çevrimdışı, sonra gönderilecek / sorun var". Havuzdaki web
  uygulaması bunu tek yerde üretir ([`web/src/lib/sync/status.ts`](../../uygulama/web/src/lib/sync/status.ts)).
- **Bayatlık görünür olsun:** "son eşitleme 3 dk önce", rapor üstünde "veriler 10:40 itibarıyla".
- **Kesinlik vaat etmeyin:** sayaçlarda "1,2 B beğeni"; arama için "yeni kayıt birkaç saniye içinde görünür".
- **Reddi sessiz yutmayın:** sunucu bir değişikliği kabul etmezse kullanıcı bunu görür ve neyin geri alındığını
  bilir ([`ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Reddetme").
- **Çakışmada seçim kullanıcıya:** veri kaybı riski varsa kendiliğinden karar vermeyin ("Buradakini gönder /
  Sunucudakini al").

## Çözüm kalıpları

| Kalıp                                        | Çözdüğü sorun                     | Bedeli                                              |
| -------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| Yazandan sonra birincilden oku (zaman penceresi) | Kendi yazdığını oku          | Birincile ek okuma; gecikme pencereyi aşarsa bozulur |
| Sürüm belirteci (LSN, rev)                   | Kendi yazdığını oku + monoton     | Belirteci taşımak; kopya geride kalınca birincil yükü |
| Yapışkan kopya (oturum → tek kopya)          | Monoton okuma                     | Kopya ölünce oturum geri gidebilir                   |
| İstemcide birleştirme (bekleyenler üste)     | Kendi yazdığını oku               | İstemci karmaşıklığı; sunucu reddederse geri alma    |
| Koşullu güncelleme, sürüm sütunu, If-Match   | Kayıp güncelleme                  | İstemci "değişti" durumunu ele almalı                |
| Tek sıralayıcı (sunucunun verdiği numara)    | Nedensel sıra, tutarlı önek       | Sıralayıcı tek nokta; parçalanırsa sıra parça içi    |
| Benzersizliği tek yerde denetleme            | Çift kayıt                        | O işlem çevrimdışı yapılamaz                         |

## Tuzaklar

| Belirti                                                      | Neden                                                | Çözüm                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| "Kaydettim ama eski hâli görüyorum"                          | Okuma kopyadan ya da önbellekten, kopya geride       | Sürüm belirteci ya da yazandan sonra birincil            |
| Yorum göründü, yenileyince kayboldu                          | Okumalar farklı gecikmeli kopyalara gidiyor          | Oturumun gördüğü en yüksek sürüm; yapışkan kopya         |
| Stok eksiye düştü, aynı koltuk iki kişiye satıldı            | Oku-hesapla-yaz yarışı                               | Koşullu güncelleme, benzersizlik kısıtı                  |
| İki kişi aynı formu düzenledi, birinin değişikliği yok        | Son kaydeden sessizce üzerine yazdı                  | Sürüm sütunu / If-Match; çakışmayı kullanıcıya göster    |
| Cevap, sorduğu sorudan önce görünüyor                        | İstemci saatine ya da varış sırasına göre sıralama   | Sunucunun verdiği sıra numarası                          |
| Kullanıcı adı benzersizliği çevrimdışı kayıtta bozuldu       | Benzersizlik istemcide denetlendi                    | Sunucuda kısıt; çevrimdışında "geçici" işaretle          |
| Yeni eklenen ürün aramada yok, kullanıcı ikinci kez ekliyor  | Arama dizini nihai tutarlı, arayüz bunu söylemiyor   | Eklemeden sonra kaydı doğrudan göster; "birazdan aranabilir" |
| Rapor ile ekran farklı sayı gösteriyor                       | Biri kopyadan biri birincilden                       | Kaynağı ve zamanı ekranda yazın                          |

## Denetim listesi

- [ ] Her veri türü için gereken garanti yazılı (yukarıdaki tablo gibi).
- [ ] Para, stok, benzersizlik gibi işlemler birincilde, işlem içinde, koşullu güncellemeyle.
- [ ] Kopyadan/önbellekten okunan her ekranda kendi yazdığını oku sorunu ele alındı.
- [ ] Sıra önemli verilerde sıra numarasını sunucu veriyor; istemci saatine göre sıralanmıyor.
- [ ] Düzenleme formlarında sürüm/ETag denetimi var; çakışma kullanıcıya gösteriliyor.
- [ ] Arayüzde kaydetme durumu ve bayatlık görünür; reddedilen değişiklik bildiriliyor.
- [ ] Testte "yaz, hemen oku" ve "iki eşzamanlı yazma" senaryoları var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu veri için gereken tutarlılık şu: … Para/stok/benzersizlik işlemlerini tek ifadeli
  koşullu güncellemeyle ya da sürüm sütunuyla yaz; oku-hesapla-yaz yapma. Kaydet sonrası ekran birincilden ya da
  istemcideki yeni değerden okusun."
- **Modelin tipik hatası:** `SELECT` ile okuyup Python/JS'de hesaplayıp `UPDATE` ile yazar (kayıp güncelleme);
  okuma kopyası ekleyip bütün okumaları oraya yönlendirir; sıralamayı istemci saatine bırakır; "eventual
  consistency" deyip arayüzde hiçbir gösterge koymaz.
- **Çıktıda arayın:** `UPDATE … SET x = ?` biçiminde, okunmuş değerden hesaplanmış yazmalar; `WHERE … AND surum = ?`
  olmayan düzenleme uçları; `rowcount == 0` durumunun ele alınıp alınmadığı.
- **Test isteyin:** iki eşzamanlı satışın stoğu iki düşürdüğünü ve aynı sürümle iki düzenlemeden ikincisinin
  reddedildiğini gösteren testler.

## İlgili

- [Veritabanı ölçekleme](veritabani-olcekleme.md) (okuma kopyası yönlendirme) ·
  [Önbellek katmanları](onbellek-katmanlari.md) (bayat önbellek) ·
  [Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) (saat, bölünme, uzlaşma)
- [Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (sıra garantisi)
- [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md) (yalıtım düzeyleri, kayıp güncelleme,
  denetle-sonra-yaz yarışı) · [Veri getirme](../20-web-onyuz/veri-getirme.md) (istemcide bayat veri ve iyimser güncelleme)
- Havuzdaki çalışan örnek: [`uygulama/shared/src/sync.ts`](../../uygulama/shared/src/sync.ts) (`rebase`),
  [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md); MVCC ve kilitlemeyle yalıtım anomalilerinin
  sıfırdan gösterimi: [`sifirdan/veri/islem/README.md`](../../sifirdan/veri/islem/README.md)
