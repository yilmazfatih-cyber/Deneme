---
baslik: MVP kapsamı
ozet: En küçük değerli ürünü tanımlamak; tek kullanıcı ve tek iş, dikey dilim, yapılmayacaklar listesi, elle yapılacak kısımlar, kapsam kesme ve doldurulmuş bir MVP tanımı.
etiketler: [urun, mvp, kapsam, dilimleme, planlama]
duzey: temel
guncellik: 2026-11
---

# MVP kapsamı

> Bu notu ne zaman okumalı: problemi doğrulanmış bir fikrin ilk sürümünü planlarken; özellik listesi her gün
> uzuyorsa ya da "ilk sürüm" haftalardır bitmiyorsa.

## Temel fikir

MVP (minimum viable product, en küçük değerli ürün) yarım ürün değildir: **tek bir kullanıcı grubu için tek bir
işi baştan sona gerçekten gören** en küçük üründür. Ölçüt basittir: hedef kullanıcı onu gerçek hayatında bir kez
kullanıp sonucu alabiliyor mu?

MVP'nin amacı öğrenmektir. Bu yüzden tanımına özellik değil **öğrenme hedefi** yazılır ("ilk 10 kuaförün en az
6'sı iki haftada bağlantıdan 10 randevu alır"). Kesme sırası: önce kullanıcı (tek grup), sonra iş (tek iş),
sonra akış (tek mutlu yol), en son her adımın yolu (kod, hazır araç ya da **elle**).

İki liste kapsamın yarısıdır: **yapılmayacaklar** (yazılmayan her şey sessizce kapsama girer) ve **elle
yapılacaklar** (ilk müşterilerin kurulumunu, faturasını, hatırlatmasını siz yaparsınız). Bir işi elle onuncu kez
yaptığınızda otomatikleştirirsiniz; ilk gün değil. Süre sabittir, kapsam değişkendir: sığmayan iş süreyi uzatmaz,
kesilir.

## Karar tablosu: bir özellik MVP'ye girer mi?

| Soru                                                               | Evetse                                       |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Çekirdek işin bir adımı mı, onsuz iş bitmiyor mu?                  | Girer; ama en ucuz biçimiyle                  |
| O adım elle ya da hazır bir araçla (form, tablo, e-posta) yapılabilir mi? | Elle yapılır; kod yazılmaz            |
| Güvenlik, veri kaybı ya da yasal zorunluluk mu?                    | Girer: kesilemez taban                       |
| Öğrenme hedefini ölçmek için gerekli mi (olay kaydı gibi)?         | Girer; en basit hâliyle                      |
| "Rakipte var", "olsa güzel olur", "ileride lazım olur"             | Girmez → yapılmayacaklar                     |
| Tek bir müşterinin özel isteği                                     | Girmez; o müşteri için elle yapılır          |
| Kolay ve görünür (tema, ayar ekranı, yönetim paneli)               | Girmez; çekirdek akışa bağlanmıyor           |

**Kesilemez taban:** veri kaybı olmaması (yedek), güvenlik (kimlik, yetki, kişisel verinin yalnız sahibine
görünmesi), yasal zorunluluklar ([yasal temel belgeler](yasal-temel-belgeler.md)), temel erişilebilirlik
([erişilebilirlik kararı](erisilebilirlik-urun-karari.md)). Bunlar "sonra cilalanacak kalite" değil, kapsamın
tabanıdır.

## Nasıl yapılır

1. **Tek cümle yazın:** "[Grup] için, [tek iş]i [ölçülebilir sonuç] ile yapan ürün."
2. **Çekirdek akışı yazın:** kullanıcının adımları, 4–8 adım. Akış bir [dikey dilimdir](../00-yontem/isi-parcalama.md):
   her adım arayüzden veriye kadar uçtan uca çalışır.
3. **Her adıma yol atayın:** kod, hazır araç ya da elle. Hedef, kod yazılan adım sayısını en aza indirmektir.
4. **Her özelliği bir adıma bağlayın.** Bağlanamayan özellik "yapılmayacaklar" listesine gider.
5. **Kesilemezleri ekleyin.**
6. **Öğrenme hedefini ve zaman kutusunu yazın.** Kod eforu kutuya sığmıyorsa elle yapılabilen adımları elle
   yapın; yine sığmıyorsa grubu ya da işi daraltın.
7. **Tek sayfada tutun** ([ürün belgesi şablonları](urun-belgesi-sablonlari.md)) ve her istemde modele verin.

### Doldurulmuş MVP tanımı (Sedir, kurgusal)

Sedir, havuzdaki [`site`](../../site/) temelinin kurgusal örnek markasıdır (randevu yazılımı).

```text
MVP — Sedir v0.1                                       Zaman kutusu: 3 hafta (2026-12-21'e kadar)
Kimin için:     Tek başına çalışan kuaför. Çalışanlı salonlar, klinikler bu sürümde YOK.
Tek iş:         Müşteri, kuaförü aramadan bağlantıdan boş saati seçip randevu alır; kuaför bunu listesinde görür.
Öğrenme hedefi: İlk 10 kuaförün en az 6'sı, ilk 2 haftada bağlantıdan en az 10 randevu alır.
Çekirdek akış ve yolu:
  1. Kuaför hizmetlerini ve çalışma saatlerini girer ......... ELLE (kurulumu görüntülü görüşmede biz yaparız)
  2. Kuaför bağlantıyı Instagram profiline koyar ............. ELLE (yönergeyi biz göndeririz)
  3. Müşteri bağlantıyı açar, boş saatleri görür .............. KOD
  4. Müşteri ad ve telefon yazar, randevuyu alır .............. KOD
  5. Kuaför günün randevularını görür ......................... KOD (tek ekran, liste)
  6. Müşteriye hatırlatma gider ................................ ELLE (her akşam biz WhatsApp'tan; 10 kuaförde yeter)
  7. Müşteri randevuyu iptal eder .............................. KOD (iptal bağlantısı)
Kesilemez:      Telefon numarası yalnız kuaföre görünür; randevu sayfasında aydınlatma metni; günlük yedek.
Yapılmayacaklar (bu sürüm):
  ödeme ve kapora · fatura · çok çalışan / şube · bekleme listesi · SMS ve WhatsApp otomasyonu ·
  takvim eşitlemesi · raporlar · mağaza uygulaması (telefonda açılan web sayfası yeter) · müşteri üyeliği · İngilizce
Elle iş defteri: Kurulum (kuaför başına ~30 dk, sahibi: Ayşe) · Hatırlatma (her akşam 20:00, sahibi: Can)
Ölçüm:          randevu_olusturuldu {kaynak: baglanti|elle} · randevu_iptal_edildi — başka olay yok.
Bitti ölçütü:   3-4-5-7 adımları uçtan uca testte geçer; 2 gerçek kuaförle bir gün denenir.
```

### Kod eforu zaman kutusuna sığmıyorsa

İlk taslakta kurulum ekranı ve hatırlatma otomasyonu da koda yazılmıştı; toplam 19 gün, kutu 10 gün. Kural:
elle yapılabilen en pahalı kod adımını elle'ye çevir, bütçeye inene dek tekrarla. Elle yapılamayan adımlar
kalırsa süre uzatılmaz; grup ya da iş daraltılır.

```python calistir
BUDGET = 10  # zaman kutusundaki kodlama günü

# (adım, yol, efor_gün, elle yapılabilir mi) — Sedir v0.1, kurgusal; ilk taslak
steps = [
    ("Kurulum: hizmetler ve saatler", "kod", 4, True),
    ("Bağlantıyı Instagram'a koyma", "elle", 0, True),
    ("Boş saatleri görme", "kod", 4, False),
    ("Randevu alma", "kod", 3, False),
    ("Günün randevuları", "kod", 2, False),
    ("Hatırlatma iletisi", "kod", 5, True),
    ("İptal", "kod", 1, False),
]


def cut_to_budget(plan: list[tuple[str, str, int, bool]], budget: int) -> tuple[list[tuple[str, str, int]], int]:
    """Bütçe aşılıyorsa elle yapılabilen en pahalı kod adımlarını ELLE'ye çevirir."""
    result = [[name, way, effort, manual] for name, way, effort, manual in plan]
    total = sum(effort for _, way, effort, _ in result if way == "kod")
    for step in sorted(result, key=lambda item: -item[2]):
        if total <= budget:
            break
        if step[1] == "kod" and step[3]:
            total -= step[2]
            step[1], step[2] = "elle", 0
    return [(name, way, effort) for name, way, effort, _ in result], total


assert sum(e for _, way, e, _ in steps if way == "kod") == 19  # ilk taslak bütçeyi aşıyor
plan, total = cut_to_budget(steps, BUDGET)
assert total <= BUDGET, "elle yapılacak aday kalmadı: grubu ya da işi daralt"
assert all(way in {"kod", "elle", "arac"} for _, way, _ in plan)  # her adımın bir yolu var

features = {  # özellik → çekirdek akıştaki adım (None: hiçbir adıma bağlanmıyor)
    "randevu sayfası": "Boş saatleri görme",
    "randevu formu": "Randevu alma",
    "günlük liste": "Günün randevuları",
    "iptal bağlantısı": "İptal",
    "kapora": None,
    "bekleme listesi": None,
    "koyu tema": None,
}
not_doing = sorted(name for name, step in features.items() if step is None)
for name, way, effort in plan:
    print(f"{way:4}  {effort} gün  {name}")
print(f"kod toplamı: {total} gün / {BUDGET}")
print("yapılmayacaklar:", ", ".join(not_doing))
```

```cikti
elle  0 gün  Kurulum: hizmetler ve saatler
elle  0 gün  Bağlantıyı Instagram'a koyma
kod   4 gün  Boş saatleri görme
kod   3 gün  Randevu alma
kod   2 gün  Günün randevuları
elle  0 gün  Hatırlatma iletisi
kod   1 gün  İptal
kod toplamı: 10 gün / 10
yapılmayacaklar: bekleme listesi, kapora, koyu tema
```

### Kapsam kesme teknikleri

| Teknik                         | Önce                                       | Sonra (MVP)                                             |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| Grubu daralt                   | Kuaför, diş kliniği, pilates stüdyosu      | Yalnız tek başına çalışan kuaför                        |
| Mutlu yolu yap, istisnayı elle çöz | Çakışma çözücü, yeniden planlama sihirbazı | Çakışmada kuaför müşteriyi arar                     |
| Sabit veri                     | Hizmet düzenleme ekranı                    | Hizmetleri kurulumda biz gireriz                        |
| Tek kanal                      | Web + iOS + Android                        | Telefonda açılan web sayfası ([mobil ve mağaza](mobil-ve-magaza.md)) |
| Tek dil, tek para birimi       | Türkçe + İngilizce, TL + avro              | Türkçe, TL                                              |
| Rol yok                        | Sahip, çalışan, resepsiyon rolleri         | Tek kullanıcı                                           |
| Hesap yok                      | Kayıt, giriş, şifre sıfırlama              | Kişisel araçsa hesapsız, cihazda saklama ([`uygulama`](../../uygulama/) hesapsız kipi) |
| Hazır araç                     | Kendi e-posta sunucusu, kendi formu        | Form servisi, e-posta, ortak tablo                      |
| Bekle, gör                     | "İleride lazım olur" altyapısı             | İlk gerçek müşteri isteyince                            |

Gerçek bir örnek: Köprü projesinin (depo kökü) `docs/PLAN.md` dosyasında "MVP kapsamı dışında" satırı (konuşma
tanıma, bulut eşitlemesi, Türkçe dışı diller, ayrı terapist paneli, mağaza sürümü) ve
`docs/sprints/S01/brief.md` içindeki "İçinde / Dışında" bölümü tam bu listedir.

## Tuzaklar

| Belirti                                                           | Neden                                                 | Çözüm                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| İlk sürüm haftalardır bitmiyor                                    | Kapsam süreyle değil istekle büyüyor                  | Zaman kutusu; süre sabit, kapsam değişken; yapılmayacaklar yazılı            |
| MVP çıktı, kullanılmadı; "daha çok özellik lazım" denildi         | Çekirdek iş bitmiyor ya da problem yanlış             | Önce akışın her adımı gerçekten çalışıyor mu bakın; sonra görüşme, özellik değil |
| MVP o kadar kırık ki bir şey öğrenilmedi                          | "Minimum" kalite tabanının altına indi                | Tek mutlu yol pürüzsüz; kesilemezler yerinde                                |
| Elle yapılan hatırlatma bir akşam unutuldu, müşteriler gelmedi    | Elle işin sahibi ve saati yok                         | "Elle iş defteri": her elle adımın sahibi, sıklığı, saati                   |
| Her yeni müşteri bir özel istek getirdi, hepsi koda girdi         | Özel istek kapsama alındı                             | O müşteri için elle yapın; üç müşteri isterse yol haritasına                |
| İlk hafta yönetim paneli, rol sistemi, tema seçimi yapıldı        | Kolay ve görünür iş önce seçildi                      | Çekirdek akışa bağlanmayan iş girmez                                        |
| "Önce bütün veritabanını kuralım" planı                           | Yatay dilimleme                                       | Dikey dilim: her adım uçtan uca ([işi parçalama](../00-yontem/isi-parcalama.md)) |
| Öğrenme hedefi tartışmalı, kimse sayıyı bilmiyor                  | Olay kaydı MVP'den kesildi                            | Hedefi ölçen en az iki olay kesilemez listededir                            |
| Mağaza incelemesi takvimi haftalarca kaydırdı                     | Mağaza uygulaması MVP'ye alındı                       | Önce telefonda açılan web; mağaza, talep doğrulanınca                       |

## Denetim listesi

- [ ] Tek cümle: grup + tek iş + ölçülebilir sonuç.
- [ ] Çekirdek akış 4–8 adım; her adımın yolu (kod / hazır araç / elle) yazılı.
- [ ] Her özellik bir akış adımına bağlı; bağlanmayanlar yapılmayacaklar listesinde.
- [ ] Yapılmayacaklar listesi en az 5 madde ve tanımla aynı sayfada.
- [ ] Kesilemezler (güvenlik, veri kaybı, yasal, temel erişilebilirlik) yazılı.
- [ ] Öğrenme hedefi sayı ve tarih içeriyor; onu ölçen olaylar listede.
- [ ] Zaman kutusu var; kod eforu kutuya sığıyor.
- [ ] Her elle adımın sahibi, sıklığı ve saati belli.
- [ ] Mutlu yol uçtan uca testle korunuyor.

## Küçük modele yaptırırken

- **Tanım yazdırırken ters sırayla isteyin:** "Önce bu sürümde YAPILMAYACAKLAR listesini yaz (en az 8 madde), sonra
  çekirdek akışı (en çok 7 adım), sonra her adımın yolunu (kod / hazır araç / elle)." Liste önce yazılınca model
  kapsamı daha az şişirir.
- **Kod yazdırırken:** MVP tanımını isteme yapıştırın ve şunu ekleyin: "Yapılmayacaklar listesindeki hiçbir şeyi
  ekleme; hazırlığını da yapma (boş tablo, gizli düğme, ileride kullanılacak alan, ayar). Yalnız şu adımı yap:
  <adım>."
- **Modelin tipik hatası:** "ileride lazım olur" diye genelleştirir (rol sistemi, çok dil altyapısı, ayar ekranı);
  yönetim paneli ekler; elle yapılacak adımı otomatikleştirmeye girişir; akışı katman katman planlar.
- **Çıktıda denetleyin:** değişiklikte yapılmayacaklar listesindeki sözcükleri arayın ("kapora", "role", "i18n",
  "admin"); her yeni ekran ve tablo için "akıştaki hangi adım?" diye sorun; yanıtı yoksa geri aldırın.

## İlgili

- [Fikir doğrulama](fikir-dogrulama.md): MVP'den önce gelen deneyler ve elle yapılan hizmet.
- [Segment ve konumlandırma](segment-ve-konumlandirma.md): "tek grup" seçimi ve "kimin için değil".
- [Geliştirme döngüsü ve kalite kapıları](gelistirme-dongusu-ve-kapilar.md): MVP'yi dilim dilim, kapılarla yapmak.
- [Gereksinim yazma](gereksinim-yazma.md): akıştaki her adımı kabul ölçütüyle yazmak.
- [Önceliklendirme](onceliklendirme.md): MVP'den sonra gelen işleri sıralamak.
- [Ürün belgesi şablonları](urun-belgesi-sablonlari.md): tek sayfalık plan ve karar kaydı.
- [İşi parçalama](../00-yontem/isi-parcalama.md): dikey dilim ve yürüyen iskelet.
- [Tahmin ve planlama](../00-yontem/tahmin-ve-planlama.md): tarih sabitken kapsam kesmek, aralıkla tahmin.
- Hazır temeller: [`uygulama`](../../uygulama/) (hesapsız ya da hesaplı PWA), [`site`](../../site/) (tanıtım sayfası).
