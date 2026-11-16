---
baslik: Kullanılabilirlik testi
ozet: Gerçek kullanıcıyı ürün başında izlemek; görev senaryosu yazmak, sesli düşünme, yardım etmeden gözlem, bulguları şiddet ve kişi sayısıyla sıralamak, küçük turlarla düzeltip yeniden sınamak ve özel kitlelerle test.
etiketler: [urun, kullanilabilirlik, test, gozlem, ux]
duzey: temel
guncellik: 2026-11
---

# Kullanılabilirlik testi

> Bu notu ne zaman okumalı: bir akış ya da ekran (taslak bile olsa) hazır olduğunda ve "anlıyorlar mı, yapabiliyorlar
> mı?" sorusu varsa; yayından önce; ölçümde belirli bir adımda kayıp görüldüğünde.

## Temel fikir

Kullanılabilirlik testi görüşme değildir: kişiye ne düşündüğünü sormazsınız, **ne yaptığını izlersiniz**. Katılımcı
gerçek bir görevi yapar, aklından geçeni sesli söyler (sesli düşünme, think-aloud); siz susar ve not alırsınız.
Takıldığı her yer bir **ürün sorunudur**.

Test **küçük turlarla** yapılır: birkaç kişi → en ağır sorunları düzelt → yeni birkaç kişiyle tekrar. İlk oturumlar en
ağır sorunları gösterir; aynı sorunlar tekrar etmeye başlayınca tur biter (pratik kural, araştırma bulgusu değil).

Görev, kullanıcının **gerçek amacıyla** yazılır, arayüzün sözcükleriyle değil: "Bu cumartesi saç kesimi için randevu
alın", "'Randevu al'a basın" değil. Bulgu, gözlenen davranış + yer + şiddet + kaç kişide görüldüğüdür; çözüm önerisi
ayrı yazılır. Testi siz de yürütebilirsiniz; tek kural yardım etmemektir.

## Karar tablosu: hangi test

| Durum                                             | Test                                                   | Kaç kişi (pratik kural) | Not                                  |
| ------------------------------------------------- | ------------------------------------------------------ | ----------------------- | ------------------------------------ |
| Erken taslak (kâğıt ya da tıklanabilir taslak)    | Yüz yüze, gözlemli                                     | Tur başına 3–5          | Akış ve sözcükler sınanır            |
| Çalışan ürün, ana akış                            | Yüz yüze ya da görüntülü, sesli düşünme                | 5                       | Görev başarısı, takılma noktaları    |
| Gözlemsiz uzaktan test (kayıt aracıyla)           | Görev + ekran kaydı                                    | 5–10                    | Soru soramazsınız; görevler çok net olmalı |
| Menüde bulunabilirlik                             | Ağaç testi ([bilgi mimarisi](bilgi-mimarisi-ve-akis.md)) | 10+                   | Tasarımsız, metin ağacıyla           |
| İki tasarım arasında seçim                        | Aynı görev, iki sürüm, sıra karışık                    | 8+                      | Yalnız büyük farklar görülür         |
| Özel kitle (yaşlı, afazi, düşük okuryazarlık)     | Yüz yüze, uzun süre, yakını yanında                    | 3–5                     | Onam ve tempo kitleye göre           |
| "Yüzde kaçı başarıyor?" sorusu                    | Daha geniş örneklem + güven aralığı                    | 20+                     | Aralık yine geniştir                 |

## Test planı

```text
Test planı — Sedir randevu sayfası (kurgusal), 2026-11-25
Soru:       Müşteri bağlantıdan yardımsız randevu alabiliyor mu? Nerede takılıyor?
Katılımcı:  5 kişi; son 3 ayda kuaföre gitmiş; Instagram kullanıyor; en az 2'si 55 yaş üstü. Ekipten ve aileden kimse yok.
Ortam:      Kendi telefonları; bağlantı Instagram'daki profilden açılır (uygulama içi tarayıcı). 20 dakika.
Görevler:
  G1  "Bu cumartesi öğleden önce saç kesimi için randevu alın."        Başarı: doğru gün ve hizmetle randevu oluştu
  G2  "Bir saat sonraya almak istiyorsunuz. Randevuyu değiştirin."     Başarı: eskisi iptal, yenisi oluştu
  G3  "Gidemeyeceksiniz. Kuaförü aramadan randevuyu iptal edin."       Başarı: iptal edildi
Ölçülen:    Görev sonucu (yardımsız / yardımla / başaramadı), süre, takılma noktaları, sözler (aynen).
Kapanış:    "En zor neresiydi?" (yanıt yorumdur; davranış kadar güçlü değildir)
İzin:       Ekran kaydı için yazılı izin; kayıt yalnız ekipte, 30 gün sonra silinir; adlar raporda geçmez.
Teşekkür:   Küçük bir hediye çeki; görev başarısına bağlı değil.
```

## Oturumu yürütmek

- **Açılış cümlesi:** "Sizi değil ürünü sınıyoruz; yanlış yapamazsınız. Takıldığınız her yer bize çok şey öğretir.
  Lütfen aklınızdan geçeni sesli söyleyin."
- **Sırasında:** susun. Sorulabilecekler: "Ne düşünüyorsunuz?", "Ne olmasını bekliyordunuz?". Söylenmeyecekler: "Şu
  düğmeye basın", "Aslında orası…". Kişi soru sorarsa soruyla yanıt verin: "Sizce?"
- **Takılınca:** kişi iki-üç dakikadır ilerleyemiyorsa görevi nazikçe bitirin, "başaramadı" yazın ve sonraki göreve
  geçin. Kişiyi bunaltmak veri kazandırmaz.
- **Not:** zaman, ekran, ne yaptı, ne dedi (aynen). İki kişiyseniz biri yürütür, biri yazar.
- **Etik:** kişi istediği an bırakabilir; teşekkür görev başarısına bağlı değildir; kayıt izinli ve süreli tutulur.

**Özel kitleler:** Köprü projesi (depo kökü, `docs/PLAN.md`) afazili kullanıcılarla testi resimli ve afazi dostu
bilgilendirilmiş onamla, bakım veren yanında olabilecek ve katılımcı istediği an bırakabilecek biçimde planlar; başarı
ölçütü "görev tamamlama ≥ %80"dir. Böyle kitlelerde görev kısa, talimat resim ve sesle, tempo yavaş olur; yorgunluk
belirtisinde mola verilir; yakını yönlendirmez, yalnız yanındadır. Mümkünse alanın uzmanıyla (Köprü'de dil ve konuşma
terapisti) birlikte yürütülür.

## Bulguları sıralamak

Şiddet ölçeği: **4 engelleyen** (görev başarısız), **3 ciddi** (çok zorlandı ya da yanlış sonuç), **2 orta**
(yavaşlattı), **1 kozmetik**. Engelleyenler kişi sayısına bakılmadan önce gelir; ötekiler şiddet × kişi oranıyla
sıralanır. Beş kişiyle yüzde raporlamayın: aralık o kadar geniştir ki hiçbir şey söylemez.

```python calistir
import math

N = 5  # bu turdaki katılımcı sayısı
# (bulgu, ekran, şiddet: 4 engelleyen · 3 ciddi · 2 orta · 1 kozmetik, kaç kişide görüldü) — Sedir, kurgusal
findings = [
    ("'Kesim' ile 'Saç kesimi' karıştırıldı", "Hizmetler", 3, 3),
    ("Cumartesi saatleri görünmüyor sanıldı; aşağı kaydırma gerekiyor", "Boş saatler", 4, 2),
    ("Telefon alanı başında +90 istiyor gibi algılandı", "Bilgiler", 2, 4),
    ("'Takvime ekle' fark edilmedi", "Onay", 1, 2),
]


def order(item: tuple[str, str, int, int]) -> tuple[bool, float]:
    _, _, severity, count = item
    return (severity < 4, -severity * count / N)  # engelleyenler her zaman önce, sonra şiddet × oran


for text, screen, severity, count in sorted(findings, key=order):
    print(f"{severity * count / N:.1f}  {screen}: {text} ({count}/{N}, şiddet {severity})")


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    p = successes / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return center - half, center + half


low, high = wilson(3, N)
assert high - low > 0.6  # beş kişiyle oran neredeyse hiçbir şey söylemez
print(f"G1 yardımsız başarı 3/{N} → aralık %{100 * low:.0f}–%{100 * high:.0f}: oran değil, sorun listesi raporlayın")
```

```cikti
1.6  Boş saatler: Cumartesi saatleri görünmüyor sanıldı; aşağı kaydırma gerekiyor (2/5, şiddet 4)
1.8  Hizmetler: 'Kesim' ile 'Saç kesimi' karıştırıldı (3/5, şiddet 3)
1.6  Bilgiler: Telefon alanı başında +90 istiyor gibi algılandı (4/5, şiddet 2)
0.4  Onay: 'Takvime ekle' fark edilmedi (2/5, şiddet 1)
G1 yardımsız başarı 3/5 → aralık %23–%88: oran değil, sorun listesi raporlayın
```

## Rapor: bir sayfa

1. **Görev sonuç tablosu:** satırlar katılımcılar, sütunlar görevler; hücrede yardımsız / yardımla / başaramadı.
2. **İlk beş bulgu:** şiddet, kaç kişide, kanıt (birebir alıntı, ekran görüntüsü), ayrı sütunda öneri.
3. **İyi çalışanlar:** değiştirilmemesi gerekenler.
4. **Sonraki tur:** neyi düzeltip ne zaman, kimlerle yeniden sınayacağınız.

Bulgular [önceliklendirme](onceliklendirme.md) listesine; ekranla ilgili ilkeler [UX temelleri](ux-temelleri.md)
notundadır. Köprü'nün inceleme biçimi (her bulgu: önem Engel / Önemli / Öneri + yer + somut düzeltme) test bulguları
için de iyi bir kalıptır.

## Tuzaklar

| Belirti                                                     | Neden                                             | Çözüm                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Katılımcı takılınca görevi biz yaptırdık                    | Yardım etme dürtüsü                               | Susun; birkaç dakika sonra görevi bitirip "başaramadı" yazın            |
| Görev metni ekrandaki düğme adını içeriyor                  | Görev ipucu veriyor                               | Kullanıcının amacıyla yazın; ekran sözcüğü kullanmayın                  |
| Test ekip arkadaşlarıyla yapıldı, her şey kolaydı           | Ürünü bilen kişiler                               | Hedef kitleden, ürünü hiç görmemiş kişiler                              |
| Katılımcı "çok güzel" dedi ama görevi yapamadı              | Söz davranış sanıldı                              | Davranışı raporlayın; sözü yorum diye ayırın                            |
| "5 kişide %60 başarı" bir hedef gibi tartışılıyor           | Küçük örneklemden oran                            | Sorun listesi raporlayın; oran gerekiyorsa aralıkla                     |
| Masaüstünde test edildi; kullanıcılar telefonda             | Ortam farkı                                       | Kendi telefonları, gerçek giriş yolu (ör. Instagram bağlantısı)         |
| Tek büyük test yapıldı, sonra hiç                           | Tur yok                                           | Küçük turlar: düzelt, yeni kişilerle yeniden sına                       |
| Bulgular "kullanıcı dikkatsiz" diye yazıldı                 | Suçlama dili                                      | Bulguyu ürün sorunu olarak yazın                                        |
| Kayıtlar izinsiz paylaşıldı                                 | Gizlilik düşünülmedi                              | Yazılı izin, sınırlı erişim, silme tarihi                               |
| Son görevlerde katılımcı yorgun ve dikkatsiz                | Oturum uzun                                       | 20–30 dakika; özel kitlede daha kısa ve molalı                          |

## Denetim listesi

- [ ] Testin sorusu tek cümle; görevler kullanıcının amacıyla, ekran sözcüğü kullanmadan yazıldı.
- [ ] Her görevin başarı ölçütü önceden yazılı.
- [ ] Katılımcılar hedef kitleden ve ürünü görmemiş; ekip ve aile yok.
- [ ] Ortam gerçek: kendi cihazları ve gerçek giriş yolu.
- [ ] Yazılı izin alındı; kayıtların erişimi ve silinme tarihi belli.
- [ ] Oturumda yardım edilmedi; takılmalar zamanla not edildi.
- [ ] Bulgular şiddet ve kişi sayısıyla sıralandı; engelleyenler önce.
- [ ] Rapor bir sayfa: görev tablosu, ilk beş bulgu, iyi çalışanlar, sonraki tur.
- [ ] Düzeltmelerden sonra yeni katılımcılarla bir tur daha yapıldı.

## Küçük modele yaptırırken

- **Görev yazdırırken:** "Şu akış için üç görev senaryosu yaz. Kullanıcının gerçek amacıyla yaz; ekrandaki düğme ve
  menü adlarını kullanma. Her görevin başarı ölçütünü yaz."
- **Notlardan bulgu çıkarırken:** "Notlardaki her takılmayı tek satır yap: ekran, ne oldu, kaç kişide. Şiddeti 1–4
  ölçeğiyle öner ve gerekçesini yaz. Alıntıları birebir kopyala. Çözümü ayrı sütunda öner."
- **Modelin tipik hatası:** görev metnine arayüz sözcüklerini koyar; söylenene dayanır ("kullanıcılar sevdi"); beş
  kişiden yüzde üretir; kullanıcıyı suçlayan dil kullanır; çözümü bulguyla karıştırır.
- **Çıktıda denetleyin:** görev metinlerinde ekrandaki sözcükler var mı; her bulguda kişi sayısı var mı; yüzde varsa
  yanında aralık var mı; alıntılar notlarda birebir geçiyor mu.

## İlgili

- [Kullanıcı görüşmesi](kullanici-gorusmesi.md): "ne yapıyorsunuz?" görüşmesi; test ise "yapabiliyor mu?" gözlemi.
- [UX temelleri](ux-temelleri.md) ve [bilgi mimarisi ve akış](bilgi-mimarisi-ve-akis.md): bulguların çoğunun çözümü.
- [Erişilebilirlik ürün kararı](erisilebilirlik-urun-karari.md): kitleden gerçek kişilerle test.
- [Fikir doğrulama](fikir-dogrulama.md): oranı aralıkla okumak.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): izleme yapılamayan üründe testle öğrenmek.
