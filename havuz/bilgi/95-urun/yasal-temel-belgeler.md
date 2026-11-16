---
baslik: Yasal temel belgeler
ozet: Bir dijital ürün için hangi yasal metinlerin gerektiği, aydınlatma ile açık rızanın farkı, çerez ve ticari ileti onayı, sık hatalar ve ne zaman avukata gidileceği; hukuki danışmanlık değildir.
etiketler: [urun, hukuk, kvkk, gizlilik, cerez, mesafeli-satis]
duzey: temel
guncellik: 2026-11
---

# Yasal temel belgeler

> Bu notu ne zaman okumalı: form, kayıt, ödeme, bülten ya da analiz aracı eklemeden önce; yayından önce; bir bulut
> ya da yapay zekâ servisine kullanıcı verisi göndermeye başlamadan önce.
>
> **Hukuki danışmanlık değildir.** Bu not, Türkiye'de yayına çıkan küçük bir dijital ürünün hangi soruları sorması
> gerektiğini gösteren bir yön bulma kâğıdıdır (Kasım 2026). Mevzuat ve Kurul kararları değişir; metinleri
> yayımlamadan önce bir hukukçuya inceletin.

## Temel fikir

Kişisel veri işleyen her ürün, e-posta toplayan tek alanlı bir form bile, 6698 sayılı Kişisel Verilerin Korunması
Kanunu (KVKK) kapsamındadır. Taban her zaman **aydınlatmadır**: veriyi toplarken kimin, hangi veriyi, hangi amaçla,
hangi hukuki sebeple ve kime aktararak işlediğini söylemek.

**Açık rıza** ayrı bir şeydir: kanundaki başka bir işleme şartı yoksa istenir; belirli bir konuya ilişkin,
bilgilendirmeye dayanan ve özgür iradeyle verilen onaydır; zorunlu olmayan bir işleme için hizmet şartı yapılamaz ve
her an geri alınabilir.

Gereken belgeler ürünün **ne yaptığına** göre değişir: satış, abonelik, çerez, bülten, yurt dışı servis, sağlık
verisi. En iyi yasal belge **az veri toplayan üründür**: toplamadığınız veri için metin, güvenlik önlemi ve ihlal
riski yoktur. Şablon bir başlangıçtır; havuzdaki [`site`](../../site/) temelinin gizlilik, KVKK ve çerez şablonları
köşeli ayraçlı alanlarla ve görünür bir "şablondur" uyarısıyla gelir.

## Karar tablosu: ürün ne yapıyor → hangi belge

| Ürününüz şunu yapıyorsa                                            | Genellikle gereken                                                                | Havuzda                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- |
| Kişisel veri topluyor (form, kayıt, e-posta, telefon)              | KVKK aydınlatma metni, gizlilik politikası, başvuru yolu                          | [`kvkk.md`](../../site/src/content/sayfalar/tr/kvkk.md), [`gizlilik.md`](../../site/src/content/sayfalar/tr/gizlilik.md) |
| Zorunlu olmayan çerez ya da izleme (analiz, reklam, sosyal piksel) | Çerez politikası + bunlar için **önceden** açık rıza (tercih paneli)              | [`cerez-politikasi.md`](../../site/src/content/sayfalar/tr/cerez-politikasi.md) (varsayılan: izleme yok) |
| Hesap açtırıyor, hizmet veriyor                                    | Kullanım koşulları: hesap, kabul edilebilir kullanım, sorumluluk, fesih, değişiklik | Yok; hukukçuyla yazılır                    |
| Tüketiciye uzaktan satış (abonelik, dijital içerik, ürün)          | Ön bilgilendirme formu, mesafeli satış sözleşmesi, cayma hakkı ve istisnaları, iade | Yok                                        |
| Bülten, kampanya e-postası ya da SMS                               | Ayrı ve işaretsiz ileti onayı, her iletide ret yolu, İleti Yönetim Sistemi (İYS)  | Ayrıntı: [içerik ve büyüme](icerik-ve-buyume.md) |
| Müşterinizin müşterilerinin verisini işliyor (işletmelere yazılım) | Müşterinizle veri işleme sözleşmesi ya da hizmet sözleşmesinde KVKK maddesi       | —                                           |
| Sağlık, biyometrik, din gibi **özel nitelikli** veri               | Daha sıkı şartlar ve güvenlik; **önce hukukçu**                                   | —                                           |
| Yurt dışındaki servise veri gidiyor (bulut, e-posta, yapay zekâ)   | Yurt dışına aktarım şartları (son yıllarda değişti); aydınlatmada belirtme        | KVKK şablonunda ilgili alan                 |
| Çocuklara yönelik                                                  | Veli onayı ve ek kurallar; **önce hukukçu**                                       | —                                           |
| Kullanıcılar içerik yüklüyor ya da yorum yazıyor                   | Kullanım koşullarında içerik kuralları; şikâyet ve kaldırma yolu                  | —                                           |
| Her durumda                                                        | İşletmenin unvanı, adresi ve iletişim bilgisi sitede kolay bulunur                 | Site alt bilgisi, Hakkında                  |

İki ek soru: **VERBİS** kaydı yükümlülüğü çalışan sayısına, yıllık mali bilançoya ve ana faaliyetin özel nitelikli
veri işlemek olup olmadığına bağlıdır (güncel eşikleri doğrulayın). Ürün adını seçmeden önce **marka araştırması**
yapın; başkasının tescilli markası yayından sonra ad değiştirtir.

## Aydınlatma ile açık rıza

|                       | Aydınlatma                                     | Açık rıza                                                               |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Nedir                 | Bilgi verme yükümlülüğü                        | Kişinin belirli bir işleme için verdiği onay                            |
| Ne zaman              | Her işlemede, veri toplanırken                 | Yalnız başka bir işleme şartı yoksa (pazarlama, zorunlu olmayan çerez, bazı özel nitelikli veri ve aktarımlar) |
| Biçim                 | Okunacak metin; "okudum" onayı gerektirmez     | Ayrı, **önceden işaretsiz** kutu; her amaç için ayrı                     |
| Hizmete bağlanır mı   | —                                              | Zorunlu olmayan işleme için hayır                                       |
| Geri alınır mı        | —                                              | Her an, verildiği kadar kolay                                           |

Sık hatalar: aydınlatma metninin altına "okudum, onaylıyorum" kutusu koyup bunu açık rıza saymak; sözleşme için zaten
gerekli veriye ayrıca rıza istemek (yanıltıcıdır: rıza geri alınınca ne olacak?); bülten, analiz ve üçüncü taraf
paylaşımını tek kutuda toplamak; aydınlatma ile rızayı tek metinde birleştirmek. Aydınlatma ve rıza ayrı tutulur.
Geliştirici tarafı (rızanın bir kayıt olarak saklanması, veri envanteri, saklama ve silme işi, yurt dışı aktarım
soruları): [KVKK pratiği](../50-guvenlik/kvkk-pratik.md).

## Kendi ürününüz için liste çıkarmak

Aşağıdaki işlev, karar tablosunu kaba bir denetime çevirir. Amaç hukukçuya giderken **doğru soru listesiyle**
gitmektir; listenin kendisi hukuki görüş değildir.

```python calistir
def documents(p: dict[str, bool]) -> list[str]:
    """Ürünün yaptıklarından gereken belge ve işlerin KABA listesi. Hukuki danışmanlık değildir."""
    docs: list[str] = []
    if p["kisisel_veri_bize_ulasiyor"]:
        docs += ["KVKK aydınlatma metni", "gizlilik politikası", "başvuru yolu"]
    else:
        docs += ["gizlilik bildirimi: veri toplanmadığını ve cihazda kaldığını söyler"]
    if p["zorunlu_olmayan_cerez"]:
        docs += ["çerez politikası", "zorunlu olmayan çerezlere önceden açık rıza"]
    if p["hesap_ve_hizmet"]:
        docs += ["kullanım koşulları"]
    if p["tuketiciye_uzaktan_satis"]:
        docs += ["ön bilgilendirme formu", "mesafeli satış sözleşmesi", "cayma ve iade koşulları"]
    if p["ticari_ileti"]:
        docs += ["ayrı ve işaretsiz ileti onayı + ret yolu + İYS"]
    if p["musterinin_musterisinin_verisi"]:
        docs += ["veri işleme sözleşmesi (müşterinizle)"]
    if p["kisisel_veri_bize_ulasiyor"] and p["yurt_disi_servis"]:
        docs += ["yurt dışına aktarım değerlendirmesi → hukukçu"]
    if p["kisisel_veri_bize_ulasiyor"] and p["ozel_nitelikli_veri"]:
        docs += ["özel nitelikli veri → önce hukukçu"]
    return docs


sedir = {  # kurgusal: işletmelere satan randevu yazılımı
    "kisisel_veri_bize_ulasiyor": True, "zorunlu_olmayan_cerez": False, "hesap_ve_hizmet": True,
    "tuketiciye_uzaktan_satis": False, "ticari_ileti": True, "musterinin_musterisinin_verisi": True,
    "yurt_disi_servis": True,
    "ozel_nitelikli_veri": True,  # diş kliniğinde "kanal tedavisi" randevusu sağlık verisi olabilir
}
kopru = {  # Köprü (depo kökü): veri yalnız telefonda; sunucu, analiz, reklam yok
    "kisisel_veri_bize_ulasiyor": False, "zorunlu_olmayan_cerez": False, "hesap_ve_hizmet": False,
    "tuketiciye_uzaktan_satis": False, "ticari_ileti": False, "musterinin_musterisinin_verisi": False,
    "yurt_disi_servis": False, "ozel_nitelikli_veri": True,
}
assert "özel nitelikli veri → önce hukukçu" in documents(sedir)
assert documents(kopru) == ["gizlilik bildirimi: veri toplanmadığını ve cihazda kaldığını söyler"]
for item in documents(sedir):
    print("-", item)
```

```cikti
- KVKK aydınlatma metni
- gizlilik politikası
- başvuru yolu
- kullanım koşulları
- ayrı ve işaretsiz ileti onayı + ret yolu + İYS
- veri işleme sözleşmesi (müşterinizle)
- yurt dışına aktarım değerlendirmesi → hukukçu
- özel nitelikli veri → önce hukukçu
```

İki ders: (1) **İşletmelere yazılım satıyorsanız** müşterinizin müşterilerinin verisini onun adına işlersiniz: müşteri
"veri sorumlusu", siz çoğunlukla "veri işleyen"siniz. Aydınlatmayı müşteri yapar; siz ona araç verirsiniz (ör. randevu
sayfasında kendi aydınlatma metnini gösterebileceği alan) ve aranızda yazılı bir sözleşme olur. (2) **Hizmet adı bile
sağlık verisi olabilir:** "kanal tedavisi", "fizik tedavi seansı" bir kişinin sağlık durumunu ele verir. Köprü'de
liste kısadır çünkü veri cihazdan hiç çıkmaz; bulut yedeği ya da eşitleme eklendiği gün liste baştan çıkarılır.

## Site temelindeki şablonları doldurmak

1. Köşeli ayraçlı her alanı doldurun: unvan, adres, e-posta, KEP (varsa), barındırma, form ve e-posta sağlayıcıları,
   bunların yurt dışında olup olmadığı, saklama süreleri.
2. **KVKK metni:** veri kategorileri tablosunu ürününüzün gerçekten topladığı veriyle eşleyin; hukuki sebepleri
   hukukçuyla belirleyin; başvuru yolunu yazın.
3. **Çerez politikası:** `site.config.ts` → `analytics` açıldıysa ya da bir sosyal medya, harita, video gömüldüyse
   tabloyu güncelleyin ve rıza mekanizmasını ekleyin. Varsayılan sitede izleme yoktur ve tablo bunu söyler.
4. Hukukçu incelemesinden sonra ön bilgide `legalTemplate: true` satırını kaldırın (sayfadaki "şablondur" uyarısı
   kalkar) ve `updated` tarihini güncelleyin.
5. Formların yanına aydınlatma bağlantısı, bülten kutusuna ayrı ve işaretsiz onay koyun.

Veriyle çalışırken uygulanacak pratik KVKK denetim listesi (amaç, hukuki sebep, en aza indirme, saklama, güvenlik,
aktarım, ihlal): [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md). Takma ad ile anonim verinin farkı:
[gizlilik ve anonimleştirme](../70-veri/gizlilik-ve-anonimlestirme.md). Teknik güvenlik önlemleri:
[tehdit modelleme](../50-guvenlik/tehdit-modelleme.md); ihlal anında ilk saat:
[olay müdahalesi](../50-guvenlik/olay-mudahalesi.md).

## Ne zaman avukata gidilir

- Özel nitelikli veri (sağlık, biyometrik, din, ceza), çocuklar.
- Yurt dışındaki bir servise kişisel veri gönderimi (yapay zekâ API'si dâhil).
- Tüketiciye satış, abonelik, otomatik yenileme, cayma ve iade koşulları.
- Kullanıcı içeriği barındıran platform; pazar yeri (aracı hizmet sağlayıcı).
- Kişi hakkında yalnız otomatik sistemle alınan ve onu etkileyen kararlar (puanlama, eleme).
- Düzenlenmiş sektörler: sağlık, finans, ödeme, eğitim.
- Kurumsal müşterinin sözleşmesi ve onun istediği güvenlik ekleri.
- Veri ihlali olduğunda: Kurul'a ve kişilere bildirim süreleri kısadır; güncel süreyi kvkk.gov.tr'den doğrulayın ve
  hemen destek alın.

## Tuzaklar

| Belirti                                                          | Neden                                                      | Çözüm                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sitede köşeli ayraçlı "[Şirket unvanı]" yayında kaldı            | Şablon doldurulmadan yayımlandı                            | Yayın öncesi denetimde `[` araması; `legalTemplate` uyarısı kalkmadıysa yayın yok |
| "Okudum, onaylıyorum" kutusu açık rıza sanılıyor                 | Aydınlatma ile rıza karıştı                                | Aydınlatma metin; rıza ayrı, amaç başına, işaretsiz kutu                    |
| Kayıt formunda bülten onayı önceden işaretli                     | Dönüşüm kaygısı                                            | İşaretsiz; ayrı; onay kaydı tutulur                                         |
| Analiz aracı eklendi, çerez politikası "izleme yok" diyor        | Metin koddan sonra güncellenmedi                           | Kod değişikliği ile metin değişikliği aynı işte                             |
| Yapay zekâ servisine müşteri verisi gidiyor, metinde yok          | Yurt dışı aktarım ve üçüncü taraf düşünülmedi              | Aydınlatmaya ekleyin; önce maskeleyin; hukukçuya sorun                       |
| Diş kliniği müşterisinin randevu notları sağlık verisi çıktı     | Hizmet adı ve not alanı sağlık durumunu ele veriyor         | Not alanını sınırlayın; özel nitelikli veri değerlendirmesi                 |
| Kullanıcı hesabını silmek istiyor, yol yok                       | Silme ve başvuru süreci tasarlanmadı                       | Hesap silme ve veri indirme ürün içinde; başvurular kayıtlı ve süreli       |
| Şablon başka bir siteden kopyalandı                              | Başkasının işleyişi sizinki sanıldı                        | Metni kendi veri akışınıza göre yazın; kopya metin yanlış güvence verir     |
| Ürün adı yayından sonra değişmek zorunda kaldı                   | Marka araştırması yapılmadı                                | Adı seçmeden önce marka araştırması                                         |

## Denetim listesi

- [ ] Ürünün topladığı her kişisel veri, amacı ve nereye gittiği (sağlayıcılar, yurt dışı) tek tabloda yazılı.
- [ ] Toplanmasına gerek olmayan veri toplanmıyor.
- [ ] Aydınlatma metni, veri toplanan her yerden (form, kayıt, randevu sayfası) bir dokunuşla açılıyor.
- [ ] Açık rıza gereken her işleme için ayrı, işaretsiz onay var ve geri alınabiliyor.
- [ ] Çerez politikası, sitedeki gerçek çerez ve depolama kullanımıyla aynı.
- [ ] Tüketiciye satış varsa ön bilgilendirme, mesafeli satış sözleşmesi, cayma ve iade metinleri hazır.
- [ ] Ticari ileti onayı, ret yolu ve İYS durumu netleşti.
- [ ] Şablonlarda köşeli ayraç kalmadı; hukukçu incelemesi yapıldı; `legalTemplate` uyarısı kaldırıldı.
- [ ] Hesap silme, veri indirme ve başvuru yolu çalışıyor.
- [ ] Özel nitelikli veri, çocuk, yurt dışı aktarım ve tüketici satışı için hukukçu görüşü alındı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu metin bir şablondur; hukuki görüş yazma. Yalnız şu bilgileri şablondaki köşeli ayraçlara yerleştir:
  <unvan, adres, sağlayıcılar, saklama süreleri>. Bilmediğin alanı doldurma, `[DOLDURULACAK: …]` olarak bırak.
  Kanun maddesi, süre ya da sayı ekleme."
- **Veri envanteri çıkartırken:** "Koddaki formları, API gövdelerini ve veritabanı tablolarını tara; toplanan her alanı,
  nereye kaydedildiğini ve hangi dış servise gittiğini tablo yap." Bu, modelin iyi yaptığı bir iştir ve hukukçuya
  giderken en değerli belgedir.
- **Modelin tipik hatası:** kendinden emin hukuki yorum yazar; madde numarası ve süre uydurur; başka ülkenin kuralını
  (GDPR) Türkiye'ye taşır; aydınlatma ile rızayı birleştirir; bülten kutusunu işaretli yapar.
- **Çıktıda denetleyin:** metinde kalan `[` işaretleri; her madde numarası ve sürenin kaynağı; onay kutularının
  varsayılan değeri (işaretsiz olmalı); çerez tablosunun koddaki gerçek kullanımla eşleşmesi.

## İlgili

- [Tanıtım sayfası](tanitim-sayfasi.md): formun yanında aydınlatma bağlantısı, dürüst iddialar.
- [Fiyatlandırma](fiyatlandirma.md): KDV gösterimi, abonelik iptali.
- [Tutma ve iptal akışı](tutma-ve-iptal-akisi.md): dürüst iptal akışı ve karanlık örüntülerden kaçınmak.
- [İçerik ve büyüme](icerik-ve-buyume.md): ticari ileti onayı ve İYS.
- [Yapay zekâ özelliği tasarlama](yapay-zeka-ozelligi-tasarlama.md): yapay zekâ servisine veri göndermek.
- [Lansman](lansman.md): yayın öncesi yasal denetim maddeleri.
- [KVKK pratiği](../50-guvenlik/kvkk-pratik.md): veri envanteri, saklama ve silme, başvurular (geliştirici tarafı).
- Pratik KVKK denetimi ve maskeleme araçları: [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md).
