---
baslik: Çevrimdışı-önce ve eşitleme: yerel yazma, çakışma çözme ve mezar taşları
ozet: Yerel-önce yaklaşımın ne zaman uygun olduğu; LWW, alan düzeyi, CRDT ve işlem dönüşümü arasında karar tablosu; mezar taşları, saat sorunları ve havuzdaki çalışan eşitlemenin nerede yetmeyeceği; çalışan örneklerle.
etiketler: [cevrimdisi, esitleme, crdt, cakisma, mezar-tasi, yerel-once]
duzey: ileri
guncellik: 2026-11
---

# Çevrimdışı-önce ve eşitleme: yerel yazma, çakışma çözme ve mezar taşları

> Bu notu ne zaman okumalı: uygulama internetsiz de çalışmalıysa; aynı veri birden çok cihazda ya da birden çok
> kişi tarafından düzenleniyorsa; "telefonda sildim, bilgisayarda geri geldi" ya da "değişikliğim kayboldu"
> şikâyeti geldiğinde; havuzdaki `uygulama` temeline yeni bir varlık ya da eşitleme davranışı eklenirken.

## Temel fikir

- **Yerel-önce** (local-first): arayüz her zaman cihazdaki veritabanını okur ve oraya yazar; ağ yalnız
  **eşitleme** içindir. Kazanç: anında tepki, internetsiz çalışma, sunucu çökse de kullanılabilir uygulama.
- Bedel: aynı veri iki yerde değişebilir. Tasarımın merkezindeki soru: **"İki cihaz aynı şeyi değiştirince ne
  olur?"** Cevap veri türüne göre seçilir; tek bir kural her veriye uymaz.
- Silme bir **kayıttır** (mezar taşı); yoksa çevrimdışı cihaz silmeyi hiç öğrenemez ve kayıt "dirilir".
- Sıra cihaz saatiyle kurulmaz; sunucunun varış sırası ya da mantıksal saat kullanılır.
- Her işlem çevrimdışı yapılamaz: benzersizlik, stok, ödeme gibi **sunucunun son sözü** gereken işlemler çevrimiçi
  ister ya da "beklemede" olarak gösterilir.

## Karar tablosu: yerel-önce uygun mu

| Veri / işlem                                            | Yaklaşım                                                    | Neden                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Kişisel not, görev, liste, form taslağı, saha kaydı     | Yerel-önce + eşitleme                                       | Çakışma seyrek; internetsizlik sık                    |
| Aile/ekip içinde paylaşılan listeler                    | Yerel-önce + alan düzeyinde birleştirme                     | Farklı alanlar birleşir; aynı alanda son gelen kazanır |
| Ortak metin düzenleme (aynı paragrafa iki kişi)         | CRDT ya da işlem dönüşümü (hazır kütüphane)                 | Karakter düzeyinde birleştirme gerekir                |
| Stok, rezervasyon, koltuk, ödeme, benzersiz ad          | Çevrimiçi işlem; çevrimdışında "beklemede"                  | Doğruluğu tek yer garanti eder                        |
| Çok büyük paylaşılan veri (katalog, arşiv)              | Kısmi eşitleme ya da çevrimiçi sorgu + önbellek             | Her şeyi cihaza indirmek olmaz                        |
| Yalnız okunan içerik (yardım sayfaları, fiyat listesi)  | Servis çalışanı önbelleği ([PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md)) | Eşitleme protokolü gerekmez |

## Çakışma çözme seçenekleri

| Seçenek                              | Nasıl çalışır                                          | İyi olduğu yer                       | Bedeli / tuzağı                                         |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- |
| Kayıt düzeyinde son yazan kazanır (LWW) | Son gelen kaydın tamamı yazılır                     | Tek alanlı ya da tek kişilik kayıt    | Farklı alanlardaki eşzamanlı değişiklik kaybolur        |
| Alan düzeyinde LWW                   | Her değişiklik yalnız dokunduğu alanları taşır         | Çoğu uygulama kaydı (havuzdaki seçim) | Aynı alanda biri kaybolur; kayıtlar arası kural yok      |
| CRDT (çakışmasız birleşen veri tipi) | Sayaç, küme, liste, metin; birleştirme matematiksel olarak çakışmasız | Sayaç, etiket kümesi, ortak metin | Karmaşık; metin için hazır kütüphane gerekir; meta veri büyür |
| İşlem dönüşümü (OT)                  | Merkezi sunucu eşzamanlı düzenlemeleri dönüştürür      | Merkezi, çevrimiçi ortak düzenleme    | Sunucu şart; doğru yazması çok zor                      |
| Kullanıcıya sor / iki sürümü sakla   | Çakışma işaretlenir, kullanıcı seçer                   | Değerli, nadir çakışan veri (sözleşme) | Kullanıcıyı yorar; arayüz ister                         |
| Alana özgü kural                     | "En büyük", "birleşim", "toplam", "en erken tarih"     | İş kuralı belliyse                    | Her alan için ayrı düşünülmeli                          |
| Sunucu reddi                         | Kural ihlal eden değişiklik reddedilir, kullanıcıya söylenir | Yetki, doğrulama, iş kuralı    | Reddedilen değişikliğin geri alınması gösterilmeli       |

**Kayıt düzeyi ↔ alan düzeyi** farkı en sık karşılaşılan veri kaybıdır:

```python calistir
taban = {"baslik": "Fatura öde", "bitti": False, "not": ""}
telefon = {"bitti": True}  # çevrimdışıyken yalnız "bitti" alanını değiştirdi
bilgisayar = {"not": "son gün cuma"}  # aynı anda yalnız "not" alanını değiştirdi

# YANLIŞ: kayıt düzeyinde "son yazan kazanır" — son gelen kaydın TAMAMI yazılır
kayit_lww = {**taban, **telefon}  # telefon önce eşitledi
kayit_lww = {**taban, **bilgisayar}  # bilgisayar, kendi bildiği tam kaydı gönderdi
assert kayit_lww["bitti"] is False  # telefonun "bitti" işareti kayboldu

# DOĞRU: alan düzeyinde — her değişiklik yalnız dokunduğu alanları taşır (havuzdaki `patch`)
kayit = dict(taban)
for yama in (telefon, bilgisayar):  # sunucu varış sırasıyla uygular
    kayit.update(yama)
assert kayit == {"baslik": "Fatura öde", "bitti": True, "not": "son gün cuma"}
print("kayıt düzeyi LWW bir değişikliği sildi; alan düzeyi ikisini de korudu")
```

```cikti
kayıt düzeyi LWW bir değişikliği sildi; alan düzeyi ikisini de korudu
```

Sayaç gibi verilerde alan düzeyi de yetmez: iki cihaz aynı değeri okuyup artırırsa biri kaybolur. Durumu
çakışmasız birleşen bir sayaç (CRDT) her cihazın katkısını ayrı tutar:

```python calistir
class PNSayac:
    """Durumu çakışmasız birleşen sayaç (CRDT): her cihaz yalnız kendi artış/azalışını sayar."""

    def __init__(self) -> None:
        self.artis: dict[str, int] = {}
        self.azalis: dict[str, int] = {}

    def arttir(self, cihaz: str, n: int = 1) -> None:
        self.artis[cihaz] = self.artis.get(cihaz, 0) + n

    def azalt(self, cihaz: str, n: int = 1) -> None:
        self.azalis[cihaz] = self.azalis.get(cihaz, 0) + n

    def birlestir(self, oteki: "PNSayac") -> None:  # sıra ve yineleme fark etmez: max
        for kendi, gelen in ((self.artis, oteki.artis), (self.azalis, oteki.azalis)):
            for cihaz, n in gelen.items():
                kendi[cihaz] = max(kendi.get(cihaz, 0), n)

    def deger(self) -> int:
        return sum(self.artis.values()) - sum(self.azalis.values())


# YANLIŞ: değeri LWW ile yazmak — ikisi de 10'u okuyup kendi sonucunu yazar
deger_lww = max(10 + 3, 10 + 2)  # hangisi son gelirse; artışların biri kaybolur
assert deger_lww != 15

a, b = PNSayac(), PNSayac()
a.arttir("ortak", 10)
b.birlestir(a)  # ikisi de 10'dan başlıyor
a.arttir("telefon", 3)
b.arttir("tablet", 2)
b.azalt("tablet", 1)
a.birlestir(b)
b.birlestir(a)
a.birlestir(b)  # aynı durumu yeniden birleştirmek zararsız
assert a.deger() == b.deger() == 14
print("LWW sayaç bir artışı kaybetti; PN-sayaç iki cihazda da 14")
```

```cikti
LWW sayaç bir artışı kaybetti; PN-sayaç iki cihazda da 14
```

Sunucu merkezli bir eşitlemede daha basit yol da vardır: sayacı değer olarak değil **işlem** olarak göndermek
("+3"), sunucunun işlemleri sırayla uygulaması. Bunun için işlemin idempotent olması (aynı "+3" iki kez gelirse bir
kez sayılması) gerekir; havuzdaki eşitleme bunu cihaz başına artan değişiklik numarasıyla (`mid`) sağlar.

## Mezar taşları

Silinen kaydı gerçekten silerseniz, silmeyi görmemiş bir cihaz eşitlerken kaydı geri getirir:

```python calistir
def birlestir(a: dict, b: dict) -> dict:
    """Durum birleştirme: her kayıt için sürümü büyük olan kazanır (iki cihaz eşitlenirken)."""
    sonuc = dict(a)
    for kimlik, kayit in b.items():
        if kimlik not in sonuc or kayit["surum"] > sonuc[kimlik]["surum"]:
            sonuc[kimlik] = kayit
    return sonuc


ortak = {"g1": {"surum": 1, "silindi": False, "baslik": "Süt al"}}

# YANLIŞ: silme = kaydı yok etmek. Telefon siler; tablet (silmeyi görmemiş) eşitleyince kayıt geri gelir.
telefon, tablet = dict(ortak), dict(ortak)
del telefon["g1"]
assert "g1" in birlestir(telefon, tablet)  # "silinen kayıt dirildi"

# DOĞRU: silme = daha yüksek sürümlü mezar taşı
telefon = {"g1": {"surum": 2, "silindi": True, "baslik": "Süt al"}}
sonuc = birlestir(telefon, tablet)
assert sonuc["g1"]["silindi"] is True  # mezar taşı eski kopyayı yener; geri alma da mümkün (sürüm 3)
print("mezar taşısız silme dirildi; mezar taşıyla silme kalıcı")
```

```cikti
mezar taşısız silme dirildi; mezar taşıyla silme kalıcı
```

- Mezar taşı, silmeyi **geri alınabilir** kılar ("Son silinenler"): yanlışlıkla silen kullanıcı onaysız kayıp yaşamaz.
- Mezar taşları birikir. Temizlemek ancak **en uzun çevrimdışı süreden** sonra güvenlidir; erken temizlik
  dirilmeyi geri getirir. Güvenli yöntem (saklama süresi, alan başına ufuk, eski imleçli cihaza anlık görüntü):
  [`uygulama/docs/MEZAR_TASI.md`](../../uygulama/docs/MEZAR_TASI.md).
- Kişisel veri silme talebinde mezar taşı da içerik taşımamalıdır: veri alanları boşaltılır, yalnız kimlik ve
  "silindi" kalır ([Veri yaşam döngüsü](veri-yasam-dongusu.md)).

## Saat sorunları

- Cihaz saatleri dakikalarca, bazen günlerce yanlıştır (elle ayar, pil bitmesi). Cihaz saatiyle "son yazan kazanır"
  saati geri olan cihazı hep kaybettirir ([Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) → saatler).
- Sıra için seçenekler: **sunucunun varış sırası** (en basit; havuzdaki seçim), mantıksal saat (Lamport), melez
  mantıksal saat (sunucusuz, eşler arası eşitlemede).
- Cihaz saati yalnız bilgi olarak saklanır ("telefonda 14:02'de düzenlendi"); karar için kullanılmaz.

## Havuzdaki çalışan gerçekleme

`uygulama` temeli bu notun "alan düzeyinde LWW + sunucu sırası + mezar taşı" seçimini uçtan uca gerçekler:

| Parça                                                           | Nerede                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Değişiklik türleri (`put`, `patch`, `delete`, `restore`)        | [`shared/src/sync.ts`](../../uygulama/shared/src/sync.ts) → `mutationSchema` |
| "Değişikliği kayda uygula" — sunucu ve istemcide **aynı** işlev | `sync.ts` → `applyMutation`                                            |
| Görünen hâl = sunucu hâli + bekleyen yerel değişiklikler        | `sync.ts` → `rebase`; [`shared/src/replica.ts`](../../uygulama/shared/src/replica.ts) → `planReconcile` |
| Giden kutusu, yinelenen gönderimi ayıklama (`mid`)              | [`docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md) → "Onay ve yinelenen gönderim" |
| İmleç (`rev`), sayfalama, eski sayfanın yeni hâli ezmemesi     | `ESITLEME.md` → "İmleç"                                                |
| Red, erişim kaybı, sunucunun eski yedeğe dönmesi (`reset`)      | `ESITLEME.md` → "Reddetme", "Erişim kaybı", "Reset"                    |
| Mezar taşı temizliği (tasarım, uygulanmadı)                     | [`docs/MEZAR_TASI.md`](../../uygulama/docs/MEZAR_TASI.md)              |

Yeni bir varlık eklerken kural: şema değişikliği **geriye uyumlu** olur (yeni alan varsayılanla eklenir; alan
silinmez, türü değişmez), çünkü eski sürümlü cihazlar aylarca eşitlemeye devam eder. Protokolü değiştiren her
şey `PROTOCOL_VERSION`'ı artırır ve hem sunucuda hem istemcide aynı anda yayınlanır.

## Ne zaman yetmez

| İhtiyaç                                                    | Neden yetmez                                                 | Ne gerekir                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| İki kişi aynı metni aynı anda yazıyor                      | Aynı alanda son gelen kazanır; diğerinin metni kaybolur      | Metin CRDT'si ya da OT (hazır kütüphane)            |
| "Aynı adla iki liste olmasın", "görevin listesi var olmalı" | Kayıtlar arası kural yok; çevrimdışı yazmalar her sırayla gelir | Sunucuda kural + red; ya da çevrimiçi işlem    |
| Kayıt başına farklı yetki                                  | Yetki alan düzeyinde                                         | Kayıt düzeyi yetki + kısmi eşitleme                 |
| Yüz binlerce kayıt, büyük dosyalar                         | Cihaz her şeyi indirir                                       | Kısmi eşitleme, dosyalar için ayrı depolama         |
| Sayaç ve stok gibi birikimli değerler                      | Alan LWW artışları kaybeder                                  | İşlem olarak gönderim ya da CRDT sayaç              |
| Çok sık silinen veri                                       | Mezar taşları birikir                                        | Mezar taşı temizliği (`MEZAR_TASI.md`)              |

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| "İşaretlediğim görev geri işaretsiz oldu"                     | Kayıt düzeyinde LWW; öteki cihaz tam kaydı gönderdi       | Düzenlemede yalnız değişen alanları gönder (`patch`)        |
| Silinen kayıt birkaç gün sonra geri geldi                      | Mezar taşı yok ya da erken temizlendi                     | Mezar taşı; temizlik en uzun çevrimdışı süreden sonra       |
| Bir cihazın düzenlemeleri hep kaybediyor                      | Cihaz saatiyle sıralama                                   | Sunucu sırası                                               |
| Beğeni sayısı eksik                                           | Sayaç değer olarak LWW ile yazılıyor                       | İşlem olarak gönder ya da CRDT sayaç                        |
| Yanıt kaybolunca değişiklik iki kez uygulandı                 | Gönderim idempotent değil                                 | Cihaz başına artan değişiklik numarası                      |
| Güncellemeden sonra eski uygulamalar eşitlerken veri bozuldu  | Alan silindi ya da türü değişti                           | Yalnız eklemeli şema değişikliği; protokol sürümü           |
| Kullanıcı reddedilen değişikliğini hâlâ ekranda görüyor        | Red sessiz yutuldu, yerel hâl düzeltilmedi                 | Görünen hâli yeniden hesapla (rebase), kullanıcıya bildir   |
| Sunucu yedekten dönünce cihazlar veriyi sildi                 | İmleç sunucudan ileride; istemci körü körüne uydu         | `reset` durumu: eşitlemeyi durdur, kullanıcıya sor          |

## Denetim listesi

- [ ] Her veri türü için çakışma kuralı yazılı (alan LWW, CRDT, kullanıcıya sor, sunucu reddi).
- [ ] Düzenlemeler yalnız değişen alanları gönderiyor; tam kayıt yazımı yalnız oluşturmada.
- [ ] Silme mezar taşıyla; geri alma çalışıyor; temizlik politikası yazılı.
- [ ] Sıra sunucuda veriliyor; cihaz saati karar için kullanılmıyor.
- [ ] Gönderim idempotent (cihaz başına artan numara ya da anahtar); yanıt kaybı testi var.
- [ ] Çevrimiçi gerektiren işlemler (benzersizlik, stok, ödeme) ayrı ve arayüzde "beklemede" gösteriliyor.
- [ ] Şema değişikliği eklemeli; eski istemciyle eşitleme testi var.
- [ ] Arayüz eşitleme durumunu, reddedilen değişikliği ve çevrimdışı kipi gösteriyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu veri havuzdaki eşitleme protokolüyle yazılacak: düzenlemede yalnız değişen alanları
  `patch` olarak gönder, silmede `delete` kullan (kaydı yok etme). Sıralama için cihaz saatini kullanma. Yeni alanı
  varsayılan değerle ekle; var olan alanı silme ya da türünü değiştirme."
- **Modelin tipik hatası:** düzenlemede kaydın tamamını gönderir; silmede kaydı yerel veritabanından gerçekten
  siler; `updatedAt` karşılaştırmasıyla birleştirme yazar; bir alanı yeniden adlandırır; çevrimdışında
  benzersizlik denetimi yapıp "tamam" der.
- **Çıktıda arayın:** `put` ile düzenleme, `db.delete(` ile yerel silme, `Date.now()`/`updatedAt` ile karar veren
  birleştirme, şemada `.default(` olmadan eklenen alan.
- **Test isteyin:** "iki cihaz farklı alanları çevrimdışı değiştirir, ikisi de korunur" ve "çevrimdışı cihaz
  silmeyi sonradan öğrenir" senaryoları; havuzdaki uygunluk testleri örnek alınır
  (`uygulama/shared/src/testing/conformance.ts`).

## İlgili

- [Tutarlılık modelleri](tutarlilik-modelleri.md) (kendi yazdığını oku, CAP'in pratik anlamı) ·
  [Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) (saatler) · [Veri yaşam döngüsü](veri-yasam-dongusu.md)
- [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md) (servis çalışanı, IndexedDB şema yükseltme) ·
  [Durum yönetimi seçimi](../20-web-onyuz/durum-yonetimi-secimi.md)
- Havuz: [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md), [`uygulama/docs/MIMARI.md`](../../uygulama/docs/MIMARI.md);
  sıfırdan CRDT'ler (sayaç, küme, kayıt, metin için RGA, nedensel teslim):
  [`sifirdan/veri/crdt/README.md`](../../sifirdan/veri/crdt/README.md)
