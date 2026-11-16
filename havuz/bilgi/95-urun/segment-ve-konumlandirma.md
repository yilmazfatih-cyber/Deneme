---
baslik: Segment ve konumlandırma
ozet: İlk müşteri grubunu seçmek, görüşmeye dayalı persona yazmak, bugünkü alternatifleri ve rakipleri tablolamak, konumlandırma cümlesi kurmak ve "kimin için değil" kararını vermek.
etiketler: [urun, segment, persona, rakip-analizi, konumlandirma]
duzey: temel
guncellik: 2026-11
---

# Segment ve konumlandırma

> Bu notu ne zaman okumalı: "ürünümüz herkes için" dendiğinde; ilk müşteri grubunu seçerken; rakip listesi
> çıkarırken; tanıtım sayfasını, fiyatı ve yol haritasını yazmadan önce.

## Temel fikir

**Segment**, aynı problemi aynı biçimde yaşayan, aynı yoldan ulaşılabilen ve aynı sözcüklerle konuşan insan
grubudur. Yaş ve şehir gibi demografi tek başına segment değildir; ortak **iş** ve ortak **durum** segmenttir
("tek başına çalışan, randevuyu telefonla veren kuaför").

İlk segment **dar** seçilir: problemi en çok acıtan, bugün zaman ya da para harcayan, ulaşması kolay ve birbirini
tanıyan (tavsiye eden) grup. Dar segmentte kazanıp genişlemek, geniş segmentte dağılmaktan iyidir.

**Rakip**, müşterinin bugün kullandığı her şeydir: başka ürünler, Excel, WhatsApp, defter, bir çalışan ve en sık
olanı: **hiçbir şey yapmamak**. **Konumlandırma** dört şeyi bir cümlede söyler: kimin için, hangi alternatife karşı,
neyle farklı, neden inanılır. Tanıtım sayfası, fiyat ve yol haritası bu cümleye göre yazılır. "Kimin için değil"
kararı konumlandırmanın yarısıdır.

## Karar tablosu: segment seçim ölçütleri

| Ölçüt                         | Soru                                                       | Kanıt nereden                         |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| Acı (eleyici)                 | Sorun ne sıklıkta, neye mal oluyor?                        | Görüşme: son olay, bugünkü maliyet    |
| Bugünkü harcama               | Bu iş için şimdi para ya da çalışan saati harcanıyor mu?   | Görüşme: "bugün neye para ödüyorsunuz?" |
| Kanal (eleyici)               | Onlara tekrarlanabilir bir yoldan ulaşabiliyor muyuz?      | Dernek, grup, platform; ilk 10 kişiye ulaşma denemesi |
| Ağ                            | Birbirlerini tanıyıp tavsiye ediyorlar mı?                 | Görüşme: "bunu kimden duydunuz?"      |
| Uygunluk                      | Ürünün bugünkü hâli işlerini görür mü?                     | MVP akışı, kullanılabilirlik testi    |
| Engel (eksi puan)             | Yasal, teknik ya da satış engeli var mı (sağlık verisi, uzun satın alma süreci)? | Hukukçu, görüşme      |

Acısı ya da kanalı olmayan aday puanlanmadan elenir: acı yoksa satın almaz, kanal yoksa ona ulaşamazsınız.

```python calistir
WEIGHTS = {"aci": 3, "harcama": 2, "kanal": 2, "ag": 1, "uygunluk": 2, "engel": -2}
KNOCKOUT = ("aci", "kanal")  # biri 0 ise aday elenir: acısı yok ya da ulaşamıyoruz

# Puanlar 0-3; görüşme ve gözlemden verilir (Sedir adayları, kurgusal)
candidates = {
    "Tek başına çalışan kuaför": {"aci": 3, "harcama": 1, "kanal": 3, "ag": 3, "uygunluk": 3, "engel": 0},
    "Diş kliniği": {"aci": 2, "harcama": 3, "kanal": 1, "ag": 1, "uygunluk": 1, "engel": 3},  # sağlık verisi
    "Pilates stüdyosu": {"aci": 2, "harcama": 2, "kanal": 2, "ag": 2, "uygunluk": 2, "engel": 0},
    "Özel ders veren öğretmen": {"aci": 2, "harcama": 0, "kanal": 0, "ag": 1, "uygunluk": 2, "engel": 0},
}


def score(values: dict[str, int]) -> int | None:
    if any(values[name] == 0 for name in KNOCKOUT):
        return None
    return sum(WEIGHTS[name] * value for name, value in values.items())


scored = {name: score(values) for name, values in candidates.items()}
ranked = sorted((s, n) for n, s in scored.items() if s is not None)[::-1]
for points, name in ranked:
    print(f"{points:3}  {name}")
print("elendi:", ", ".join(n for n, s in scored.items() if s is None))
assert ranked[0][1] == "Tek başına çalışan kuaför"
```

```cikti
 26  Tek başına çalışan kuaför
 20  Pilates stüdyosu
 11  Diş kliniği
elendi: Özel ders veren öğretmen
```

Puanlar düşünmeyi düzenler, kararı vermez. Diş kliniği en çok ödeyecek grup olabilir ama sağlık verisi ve dar kanal
onu ilk segment için pahalı yapar; kararın kaydı: [ürün belgesi şablonları](urun-belgesi-sablonlari.md) → karar kaydı.

## Persona: görüşmeden çıkan, hayal edilmeyen

Persona bir kişilik hikâyesi değil, **segmentin karar verdiren özelliklerinin** özetidir. Her satırı görüşme
notlarına dayanır ve kaç kişiden geldiği yazılır; dayanağı olmayan satır silinir.

```text
Persona — Gülay, tek başına çalışan kuaför                     (kurgusal; dayanak: K1, K2, K4, K5, K7)
Durum:          Tek koltuk, tek başına; günde 8–12 müşteri. Randevular WhatsApp ve telefondan.      (5/7)
Yapılacak iş:   Gününü dolu ve öngörülebilir geçirmek; müşteriyle ilgilenirken bölünmemek.
Bugünkü yol:    Defter + WhatsApp; akşam ertesi günün müşterilerine elle mesaj.                      (4/7)
Acı:            Makas elindeyken telefon; çakışan randevu; gelmeyen müşteri.                         (5/7)
Tetikleyici:    Aynı saate iki müşteri verdiği gün "bir şey bulmalıyım" diyor.                       (3/7)
Karar ölçütü:   Kurulum kolay mı, aylık bedel bir randevudan az mı, müşterim zorlanır mı?
İtirazlar:      "Daha önce bir program denedim, çok karışıktı." "Müşterilerim yaşlı, yapamazlar."
Nereden duyar:  Meslektaşından, tedarikçiden, Instagram'dan.                                         (4/7)
Sözcükleri:     "Makas elimdeyken telefon çalınca ya açmıyorum ya müşteri kaçıyor."
```

Gerçek bir örnek: Köprü (depo kökü, `docs/PLAN.md`) üç persona yazar ve her birini **amacıyla** tanımlar (afazili
kullanıcı, eski muhasebeci, kurulumu yapan kızı); tasarımı belirleyen durumlar (tek elle kullanım, okuma güçlüğü,
çabuk yorulma) personadan doğrudan ilkelere taşınır.

## Alternatifler ve rakipler

Rakip tablosu müşterinin gözünden yazılır: "neden onu kullanıyor, neden bırakıyor?"

| Alternatif                      | Kim kullanıyor            | İyi yaptığı                      | Kötü yaptığı                            | Müşteriye bedeli             |
| ------------------------------- | ------------------------- | -------------------------------- | --------------------------------------- | ---------------------------- |
| Hiçbir şey (telefonla idare)    | Çoğu                      | Bedava, alışkanlık               | İş bölünüyor, çakışma, gelmeyen müşteri | Kaçan randevu, sinir         |
| Defter + WhatsApp               | Çoğu                      | Esnek, herkes biliyor            | Hatırlatma elle; geçmiş aranamıyor      | Akşam saatleri               |
| Genel takvim uygulaması         | Bir kısmı                 | Bildirim, bedava                 | Müşteri kendi alamıyor                  | Yine telefon trafiği         |
| Büyük randevu platformları      | Zincirler                 | Çok özellik                      | Karmaşık kurulum, yüksek bedel           | Kurulum günü, aylık ücret    |
| Resepsiyon çalışanı             | Büyük salonlar            | İnsan dokunuşu                   | Pahalı; tek kişilik dükkâna uymaz        | Maaş                         |

Kurallar: rakip ürünleri adlarıyla inceliyorsanız iddia yazmadan önce kendi sayfalarından doğrulayın ve tarih atın;
özellik karşılaştırması çabuk eskir. Rakibin özelliğini kopyalamak bir strateji değildir; konumlandırmanızın
gerektirdiğini yapın.

## Konumlandırma cümlesi

Şablon: "**[Segment]** için **[ürün]**, **[bugünkü alternatif]**ten farklı olarak **[ana fark]** sağlar; çünkü **[inanmak
için neden]**. **[Kimin için değil]** için değildir."

```text
İyi:   Tek başına çalışan kuaförler için Sedir, defter ve WhatsApp'tan farklı olarak müşterinin kuaförü aramadan
       randevu almasını sağlar; çünkü kurulumu on dakikadır ve müşterinin uygulama indirmesi gerekmez.
       Çok şubeli salonlar ve klinikler için değildir (şimdilik).
Zayıf: Sedir, işletmeler için yenilikçi ve akıllı bir randevu yönetim platformudur.
```

Zayıf cümle hiçbir alternatifi anmaz, kimseyi dışarıda bırakmaz ve inanmak için bir neden vermez. İyi cümle tanıtım
sayfasının başlığını ([tanıtım sayfası](tanitim-sayfasi.md)), fiyatın değer ölçütünü ([fiyatlandırma](fiyatlandirma.md))
ve yol haritasının sınırını ([önceliklendirme](onceliklendirme.md)) doğrudan belirler.

## Tuzaklar

| Belirti                                                       | Neden                                                  | Çözüm                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Mesaj kimseye dokunmuyor                                      | Segment "herkes"                                       | Dar segment; konumlandırma cümlesine "kimin için değil" ekleyin          |
| Segment "25–45 yaş kadınlar"                                  | Demografi segment sanıldı                              | Ortak iş ve durumla tanımlayın                                          |
| Persona güzel bir hikâye ama kararları değiştirmiyor          | Görüşmesiz yazıldı, karar ölçütleri yok                | Her satır kanıtlı; tetikleyici, karar ölçütü, itiraz satırları          |
| "Rakibimiz yok"                                               | Bugünkü yol ve "hiçbir şey yapmamak" sayılmadı          | Alternatifler tablosu müşterinin gözünden                               |
| Her ay rakibin yeni özelliği kopyalanıyor                     | Konumlandırma yok ya da unutuldu                       | Cümleyi her yol haritası tartışmasının başına koyun                      |
| İki segmente birden satılıyor, ürün iki yöne çekiliyor        | Seçim yapılmadı                                        | Birini seçin; ötekini yazılı bir yeniden düşünme koşuluna bağlayın      |
| Seçilen segmente ulaşılamıyor                                 | Kanal ölçütü atlandı                                   | Kanal eleyici ölçüt; ilk 10 kişiye ulaşmayı önce deneyin                |
| Rakip tablosundaki bilgiler yanlış ya da eski                 | Ezberden ya da modelden yazıldı                        | Kaynak ve tarih; doğrulanmayanı "doğrulanmadı" diye işaretleyin          |

## Denetim listesi

- [ ] Segment ortak iş ve durumla tanımlı; demografi tek başına kullanılmadı.
- [ ] Adaylar acı, harcama, kanal, ağ, uygunluk ve engelle karşılaştırıldı; acısı ya da kanalı olmayan elendi.
- [ ] Persona her satırıyla görüşmeye dayanıyor ve kaç kişiden geldiği yazılı.
- [ ] Alternatifler tablosunda "hiçbir şey yapmamak" ve bugünkü elle yollar var.
- [ ] Rakip ürünlerle ilgili her iddianın kaynağı ve tarihi var.
- [ ] Konumlandırma cümlesi tek cümle; alternatifi, farkı, inanma nedenini ve "kimin için değil"i söylüyor.
- [ ] Segment kararı ve elenen adaylar bir karar kaydında.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu görüşme notlarından persona çıkar. Her satırın yanına dayandığı görüşme kimliklerini yaz.
  Notlarda olmayan özellik ekleme; kişilik hikâyesi yazma." ve "Alternatifler tablosunu müşterinin gözünden yaz;
  'hiçbir şey yapmamak'ı da ekle. Rakip ürün adı ve özelliği uydurma; yalnız verdiğim listeyi kullan."
- **Konumlandırma için:** "Şablona göre üç cümle seçeneği yaz; her biri bir alternatifi ansın ve 'kimin için değil'
  ile bitsin. 'Yenilikçi, akıllı, platform, çözüm' kullanma."
- **Modelin tipik hatası:** demografik ve süslü persona yazar; rakip özelliklerini ve fiyatlarını ezberden (eskimiş ya
  da uydurma) yazar; "hiçbir şey yapmamak"ı unutur; konumlandırmayı herkesi kapsayacak kadar genişletir.
- **Çıktıda denetleyin:** persona satırlarında görüşme kimliği var mı; rakip iddialarının kaynağı; konumlandırma
  cümlesinde alternatif ve "kimin için değil" var mı.

## İlgili

- [Fikir doğrulama](fikir-dogrulama.md) ve [kullanıcı görüşmesi](kullanici-gorusmesi.md): segmentin ve personanın kanıtı.
- [Tanıtım sayfası](tanitim-sayfasi.md): konumlandırmadan başlığa.
- [Fiyatlandırma](fiyatlandirma.md): alternatifin bedeli ve değer ölçütü.
- [İçerik ve büyüme](icerik-ve-buyume.md): segmentin bulunduğu kanal.
- [MVP kapsamı](mvp-kapsami.md): tek segment, tek iş.
