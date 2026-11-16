---
baslik: Mobil ve mağaza
ozet: Telefonda açılan web uygulaması, paketlenmiş web ve yerel uygulama arasında ürün kararı; mağaza sürecinin genel adımları, gizlilik beyanı, inceleme, sürümleme ve zorunlu güncelleme politikası.
etiketler: [urun, mobil, pwa, uygulama-magazasi, surumleme]
duzey: temel
guncellik: 2026-11
---

# Mobil ve mağaza

> Bu notu ne zaman okumalı: "uygulamamız mağazada olsun mu?" sorusu geldiğinde; mağazaya ilk kez başvurmadan önce;
> sürüm numarası ve güncelleme politikası belirlerken. PWA'nın teknik ayrıntısı (manifest, servis çalışanı, iOS
> farkları): [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md). Mağaza ücretleri, komisyonlar ve süreler
> değişir; bu notta bilerek yazılmamıştır, güncel hâlini mağazanın kendi belgelerinden okuyun.

## Temel fikir

Telefonda üç yol vardır:

1. **PWA:** telefonda tarayıcıyla açılan, ana ekrana eklenebilen, internetsiz de çalışabilen web uygulaması. Tek kod,
   anında güncelleme, mağaza onayı yok.
2. **Paketlenmiş web:** aynı web kodunun ince bir yerel kabukla mağazaya konması (Android için "güvenilir web
   etkinliği", iki platform için Capacitor gibi kabuklar).
3. **Yerel uygulama:** her platform için ayrı ya da çapraz platform çatısıyla yazılan uygulama.

Varsayılan sıra: **önce PWA ile talebi doğrula, mağazaya gerçek bir neden olunca geç.** Gerçek nedenler: kitlenin
uygulamayı mağazada araması, web'in vermediği bir cihaz özelliği, iOS'ta güvenilir bildirim, kurumsal müşterinin
şartı. Köprü bu kararı yazılı vermiştir: "mağaza onayı gerektirmemeli; ileride gerekirse aynı web kodu Capacitor ile
paketlenebilir" (depo kökü, `docs/decisions/ADR-001-teknoloji.md`).

Mağazaya çıkınca iki şey kalıcıdır: **paket kimliği** (değiştirilemez) ve **sahadaki eski sürümler** (kullanıcı
güncellemeden aylarca kullanabilir). Sürümleme ve geriye uyumlu API bu yüzden ürün kararıdır.

## Karar tablosu

| İhtiyaç                                       | PWA                                  | Paketlenmiş web                         | Yerel                          |
| --------------------------------------------- | ------------------------------------ | --------------------------------------- | ------------------------------ |
| İlk sürümü hızlı çıkarmak                     | En hızlı                             | Orta                                    | En yavaş                       |
| Mağazada bulunmak, aramada çıkmak             | Yok                                  | Var                                     | Var                            |
| Bildirim                                      | Android'de var; iOS'ta yalnız ana ekrana eklenince | Var                     | Var                            |
| Cihaz özelliği (Bluetooth, NFC, arka plan konum, widget, sağlık verisi) | Kısıtlı        | Eklentiyle kısmen                       | Tam                            |
| Güncelleme hızı                               | Anında                               | Web kısmı hızlı; kabuk incelemeden geçer | Her sürüm incelemeden geçer   |
| Dijital içerik ya da abonelik satışı          | Web ödemesi                          | Mağaza ödeme kuralları                  | Mağaza ödeme kuralları         |
| Bakım yükü                                    | Tek kod                              | Tek kod + kabuk                         | Platform başına ya da çatı     |
| Google hizmetleri olmayan Android telefonlar  | Çalışır                              | Mağazaya bağlı                          | Mağazaya bağlı                 |
| Mağaza reddi riski                            | Yok                                  | "Yalnız web sitesini saran uygulama" gerekçesiyle red olabilir | Düşük (kurallara uyulursa) |

Pratik not: Sedir gibi ürünlerde müşteri bağlantıyı çoğunlukla **Instagram ya da WhatsApp'ın uygulama içi
tarayıcısında** açar. Orada kurulum düğmesi çıkmaz, depolama ve dosya yükleme farklı davranabilir: kritik akışları bu
tarayıcılarda deneyin ve kritik veriyi yalnız cihazda tutmayın.

## Mağaza sürecinin genel adımları

1. **Geliştirici hesabı:** bireysel ya da kurumsal. Kurumsal hesapta şirket kimliği doğrulanır (zaman alabilir;
   erken başlayın). Hesap kimin adına açılırsa uygulamanın sahibi odur: şirket adına açın.
2. **Uygulama kaydı:** görünen ad, **paket kimliği** (`com.sirket.urun` biçiminde; bir kez seçilir, değişmez),
   kategori, yaş derecelendirme anketi. Adı seçmeden önce marka araştırması ([yasal temel belgeler](yasal-temel-belgeler.md)).
3. **Gizlilik:** gizlilik politikası adresi ve **veri beyanı** (hangi veri, hangi amaçla, kimlikle bağlı mı, izleme var
   mı). Beyan, koddaki **her** üçüncü taraf kütüphanenin (analiz, hata raporlama, reklam) topladığı veriyle tutarlı
   olmalıdır.
4. **Hesap silme:** hesap açtıran uygulama, hesabı uygulama içinden silme yolu da sunmalıdır (iki büyük mağazanın
   kuralı; ayrıntıyı güncel yönergeden doğrulayın).
5. **Mağaza sayfası:** Türkçe başlık ve açıklama, ekran görüntüleri (istenen cihaz boyutlarında), destek adresi.
   Tanıtım sayfasındaki ilkeler burada da geçerlidir ([tanıtım sayfası](tanitim-sayfasi.md)).
6. **Test kanalı:** önce iç test, sonra kapalı test. Yeni kişisel geliştirici hesaplarından üretime çıkmadan önce
   belirli sayıda testçiyle kapalı test istenebilir (sayı ve süre değişti; doğrulayın).
7. **İnceleme:** sık red nedenleri: yalnız web sitesini saran, yerel değeri olmayan uygulama; çökme; inceleme ekibine
   test hesabı ve not verilmemesi; gizlilik politikası yok ya da beyanla çelişiyor; izin isteğinin gerekçesi yok; dijital
   satışta mağaza ödemesi dışına yönlendirme (bölgesel kurallar değişiyor); yer tutucu içerik.
8. **Yayın:** kademeli yayın (önce kullanıcıların küçük bir yüzdesi), sürüm notu ([ürün belgesi şablonları](urun-belgesi-sablonlari.md)).
9. **Sonrası:** çökme raporları, mağaza yorumlarına yanıt ([geri bildirim ve destek](geri-bildirim-ve-destek.md)),
   eski sürümlerin desteği.

## Sürümleme ve güncelleme politikası

- **Görünen sürüm** anlamlı sürüm biçimindedir: `BÜYÜK.KÜÇÜK.YAMA` (1.10.0). Büyük: geriye uyumsuz değişiklik; küçük:
  yeni özellik; yama: hata düzeltmesi.
- **Yapı numarası** her yüklemede artan bir tam sayıdır; mağaza aynı ya da küçük numarayı kabul etmez.
- Sürüm **Ayarlar → Hakkında**'da görünür; destek isterken ilk soru odur.
- **En düşük desteklenen sürüm** yazılı tutulur. Zorunlu güncelleme ekranı yalnız güvenlik açığında ya da geriye
  uyumsuz API değişikliğinde gösterilir; ötekilerde güncelleme yalnız önerilir.
- API, sahadaki eski sürümleri bozmadan değişir: alan eklenir, silinmez; anlam değişecekse yeni sürümlü uç açılır.
- PWA'da güncelleme anlıktır ama kullanıcıya nasıl sunulacağı (sor ya da kendiliğinden yenile) bir karardır; havuzdaki
  [`uygulama`](../../uygulama/) temeli "Yeni sürüm hazır · Yenile" bildirimi gösterir.

```python calistir
def parse(version: str) -> tuple[int, int, int]:
    major, minor, patch = (int(part) for part in version.split("."))
    return major, minor, patch


assert "1.10.0" < "1.9.3"  # YANLIŞ: metin olarak karşılaştırma 1.10'u eski sanır
assert parse("1.10.0") > parse("1.9.3")  # DOĞRU: sayı olarak


def update_policy(installed: str, latest: str, min_supported: str) -> str:
    if parse(installed) < parse(min_supported):
        return "zorunlu güncelleme"  # yalnız güvenlik ya da geriye uyumsuz API değişikliğinde yükseltilir
    if parse(installed) < parse(latest):
        return "güncelleme öner"
    return "güncel"


LATEST, MIN_SUPPORTED = "1.10.0", "1.8.0"
for installed in ("1.7.4", "1.9.3", "1.10.0"):
    print(f"{installed}: {update_policy(installed, LATEST, MIN_SUPPORTED)}")

builds = [41, 42, 42, 44]  # mağazaya yüklenen yapı numaraları
duplicates = [b for i, b in enumerate(builds[1:], 1) if b <= builds[i - 1]]
assert duplicates == [42]  # her yükleme bir öncekinden büyük olmalı: ikinci 42 reddedilir
```

```cikti
1.7.4: zorunlu güncelleme
1.9.3: güncelleme öner
1.10.0: güncel
```

## Tuzaklar

| Belirti                                                      | Neden                                                   | Çözüm                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mağaza "yalnız web sitesi" diye reddetti                     | Paketlenmiş uygulamanın yerel bir değeri yok            | PWA'da kalın ya da gerçek bir yerel özellik ekleyin                      |
| Kullanıcılar uygulamayı yeni bir uygulama gibi gördü         | Paket kimliği değiştirildi                              | Kimliği baştan doğru seçin; asla değiştirmeyin                           |
| Veri beyanı "veri toplamıyoruz" diyor, analiz kütüphanesi var | Beyan koddan bağımsız yazıldı                           | Kütüphane envanteri çıkarın; beyanı ona göre doldurun                    |
| Eski sürümdeki kullanıcılar API değişince çöktü              | Geriye uyumsuz API değişikliği                          | En düşük desteklenen sürüm, zorunlu güncelleme ekranı, sürümlü uç        |
| 1.10 sürümü 1.9'dan eski sanıldı                             | Sürümler metin olarak karşılaştırıldı                    | Sayısal karşılaştırma (yukarıdaki kod)                                   |
| İnceleme ekibi giriş yapamadı, red                           | Test hesabı ve inceleme notu verilmedi                  | İnceleme notu + çalışan test hesabı                                      |
| iOS kullanıcıları "nasıl kurarım?" diye soruyor              | iOS'ta kurulum istemi yok                               | "Paylaş → Ana Ekrana Ekle" yol gösteren kart                             |
| Instagram'dan açılan sayfada bilgiler kayboluyor             | Uygulama içi tarayıcının depolaması farklı              | Bu tarayıcılarda test; kritik veriyi sunucuda tutun                      |
| Mağaza sürümündeki hatanın düzeltmesi günler sürdü           | İnceleme süresi; yayın tek seferde %100                 | Kademeli yayın; sunucudan kapatılabilen özellik bayrağı                  |
| Dijital abonelik satışı mağaza kuralına takıldı              | Mağaza ödeme kuralları önceden okunmadı                 | Kuralları ve bölgesel farkları başvurudan önce okuyun                    |
| Hesap kurucunun kişisel adına açılmış, ortak ayrılınca kilit | Hesap sahipliği düşünülmedi                             | Şirket adına hesap; en az iki yönetici                                   |

## Denetim listesi

- [ ] PWA / paketlenmiş / yerel kararı yazılı gerekçeyle verildi; talep önce PWA ile doğrulandı ya da neden
      doğrulanmadığı yazılı.
- [ ] Geliştirici hesabı şirket adına; en az iki yönetici var.
- [ ] Paket kimliği ve uygulama adı kalıcı seçildi; marka araştırması yapıldı.
- [ ] Gizlilik politikası adresi ve veri beyanı koddaki her kütüphaneyle tutarlı.
- [ ] Hesap açtıran uygulamada uygulama içinden hesap silme var.
- [ ] İnceleme notu ve test hesabı hazır.
- [ ] Görünen sürüm `BÜYÜK.KÜÇÜK.YAMA`; yapı numarası her yüklemede artıyor; sürüm Ayarlar'da görünüyor.
- [ ] En düşük desteklenen sürüm ve zorunlu güncelleme politikası yazılı; API geriye uyumlu.
- [ ] Kademeli yayın ve çökme raporları açık.
- [ ] Uygulama içi tarayıcılarda (Instagram, WhatsApp) ve küçük ekranda denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sürüm karşılaştırmasını sayısal yap; metin karşılaştırma kullanma. Zorunlu güncelleme yalnız en
  düşük desteklenen sürümün altında. Sürüm numarasını Ayarlar → Hakkında'da göster."
- **Mağaza beyanı için:** "Koddaki üçüncü taraf kütüphaneleri ve her birinin topladığı veriyi listele; emin olmadığını
  'doğrulanmadı' diye işaretle; listede olmayanı uydurma."
- **Modelin tipik hatası:** sürümleri metin olarak karşılaştırır; paket kimliğini "düzeltmek" için değiştirir; hesap
  silmeyi unutur; ücret, komisyon ve süreleri ezberden (eskimiş) yazar; analiz kütüphanesi varken "veri toplanmıyor"
  der.
- **Çıktıda denetleyin:** 1.9 ile 1.10'u karşılaştıran test; paket kimliğinin değişmediği; beyan ile kütüphane listesinin
  eşleşmesi; ücret ya da süre içeren cümlelerin kaynağı.

## İlgili

- [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) ve [duyarlı tasarım ve mobil](../20-web-onyuz/duyarli-tasarim-ve-mobil.md).
- [MVP kapsamı](mvp-kapsami.md): ilk sürümde tek kanal.
- [Lansman](lansman.md): kademeli yayın ve ilk hafta izleme.
- [Yasal temel belgeler](yasal-temel-belgeler.md): gizlilik politikası ve marka araştırması.
- [Ürün belgesi şablonları](urun-belgesi-sablonlari.md): sürüm notu ve karar kaydı.
- Hazır PWA temeli: [`uygulama`](../../uygulama/) (çevrimdışı, kurulabilir, güncelleme bildirimi).
