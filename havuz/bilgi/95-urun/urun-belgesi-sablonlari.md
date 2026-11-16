---
baslik: Ürün belgesi şablonları
ozet: Tek sayfalık ürün planı, yol haritası, ürün karar kaydı, iş özeti ve sürüm notu için doldurulmuş kısa şablonlar; belge klasörü düzeni ve Köprü projesinin docs düzeni örnek olarak.
etiketler: [urun, belge, sablon, yol-haritasi, surum-notu, karar-kaydi]
duzey: temel
guncellik: 2026-11
---

# Ürün belgesi şablonları

> Bu notu ne zaman okumalı: bir ürüne başlarken (hangi belgeler gerekir?); bir modele iş vermeden önce bağlam
> hazırlarken; sürüm çıkarken; aynı ürün kararı ikinci kez tartışılmaya başladığında.

## Temel fikir

Ürün belgeleri dört soruyu yanıtlar: **Ne yapıyoruz ve neden?** (ürün planı) · **Sırada ne var?** (yol haritası) ·
**Neyi neden seçtik?** (karar kaydı) · **Ne değişti?** (sürüm notu). Bunlara iş paketlerinin başındaki **özet** ve
sonundaki **demo notu** eklenir.

Kısa olan okunur: tek sayfa plan, yarım sayfa karar kaydı, 3–6 maddelik sürüm notu. Uzun belgeyi ne insan ne küçük
model sonuna kadar okur. Belgeler modelin **bağlamıdır**: her istemde planın kapsam bölümü ve ilgili karar kayıtları
verilirse model kapsam dışına daha az çıkar.

Belgeler yaşar: plan değişince tarih atılır; karar kayıtları silinmez, "yerini aldı" diye kapanır. Her belgenin tek bir
sahibi vardır.

## Karar tablosu: hangi belge, ne zaman

| Belge                        | Ne zaman                                     | Uzunluk               | Okuyan                         | Önerilen yer                      |
| ---------------------------- | -------------------------------------------- | --------------------- | ------------------------------ | --------------------------------- |
| İlkeler ve bitti tanımı      | Başlarken                                    | Yarım sayfa           | Herkes; her model oturumu      | `CLAUDE.md` ya da `AGENTS.md`     |
| Tek sayfalık ürün planı      | Başlarken; büyük yön değişikliğinde          | Bir sayfa             | Herkes; her model istemi       | `docs/PLAN.md`                    |
| Yol haritası                 | Planla birlikte; haftalık güncelleme         | Yarım sayfa           | Ekip; dışa tarihsiz sürümü     | `docs/ROADMAP.md`                 |
| Karar kaydı                  | Geri alması pahalı her kararda               | Yarım sayfa           | Gelecekteki siz ve model       | `docs/decisions/ADR-NNN-ad.md`    |
| İş özeti (brief)             | Her iş paketinden önce                       | Bir sayfa             | Model, ekip                    | `docs/sprints/SNN/brief.md`       |
| Demo notu                    | Her iş paketinden sonra                      | Yarım sayfa           | Sahip                          | `docs/sprints/SNN/demo.md`        |
| İnceleme bulguları           | İş paketi incelenince                        | Bulgu başına 3 satır  | Ekip                           | `docs/sprints/SNN/reviews/`       |
| Sürüm notu                   | Her yayında                                  | 3–6 madde             | Kullanıcı                      | Uygulama içi + site               |
| Ölçüt kartı                  | Ölçüt panoya girmeden                        | Kart                  | Ekip                           | [ürün ölçütleri](../70-veri/urun-olcutleri.md) biçiminde |

**Gerçek bir örnek:** depo kökündeki Köprü projesi bu düzenin tamamını kullanır: `CLAUDE.md` (on ilke, bitti tanımı,
kalite kapıları, klasör sahipliği), `docs/PLAN.md` (vizyon, kullanıcılar, modüller, başarı ölçütleri, riskler),
`docs/ROADMAP.md` (fazlar, ✓ ◐ ○ durum işaretleri, birikim listesi), `docs/decisions/ADR-001-teknoloji.md` ve
`ADR-002-cumle-ve-yerler.md` (Durum · Bağlam · Karar · Sonuçlar), `docs/sprints/S01/brief.md` (amaç, kapsam
içinde/dışında, doğrulama sütunlu kabul kriterleri) ve `demo.md` (ne yapıldı, telefonda nasıl denenir, açık
sorular). Yeni bir ürün için bu klasör yapısını kopyalamak iyi bir başlangıçtır.

## 1. Tek sayfalık ürün planı

```markdown
# Sedir — ürün planı                               (kurgusal) · 2026-11-20 · sahibi: Ayşe
## Sorun
Tek başına çalışan kuaförler telefonla randevu verirken işleri bölünüyor; haftada birkaç randevu kaçıyor.
Bugün defter ve WhatsApp ile idare ediyorlar.
## Kimin için
Tek başına ya da 1–3 çalışanla çalışan kuaför. Kimin için DEĞİL: zincir salonlar, klinikler (şimdilik).
## Değer önerisi
Müşteri kuaförü aramadan bağlantıdan boş saati seçer; hatırlatmayı Sedir gönderir.
## Başarı ölçütleri
| Ölçüt                                             | Şimdi | Hedef (2027-03) |
| Aktivasyon: ilk 7 günde bağlantıdan ≥ 3 randevu   | %40   | %55             |
| 8. hafta tutma                                    | %24   | %30             |
| Ödeyen hesap                                      | 0     | 150             |
## Kapsam
İçinde: randevu sayfası, günlük liste, iptal, hatırlatma. Dışında: ödeme ve kapora, çok şube, raporlar, mağaza uygulaması.
## İlkeler
1. Kurulum 10 dakikayı geçmez. 2. Müşteri üye olmadan randevu alır. 3. Telefon numarası yalnız kuaföre görünür.
## Riskler
Müşteriler bağlantıyı kullanmaz → elle yapılan deney (tamamlandı, geçti) · İleti maliyeti dövizle artar → kullanım bazlı paket
## Bağlantılar
Yol haritası: ROADMAP.md · Kararlar: decisions/ · Ölçüt kartları: olcutler.md
```

"Kimin için değil" satırı ve sayılı başarı ölçütleri en çok atlanan iki parçadır. Ölçütün nasıl seçileceği:
[ölçüm ve öğrenme](olcum-ve-ogrenme.md); kapsamın nasıl kesileceği: [MVP kapsamı](mvp-kapsami.md).

## 2. Yol haritası

```markdown
# Yol haritası — Sedir                       Durum: ✓ yapıldı · ◐ kısmen · ○ yapılmadı · güncelleme 2026-11-20
## Şimdi (bu ay)
- ◐ Kurulum sihirbazı — yeni hesapların yarısı kurulumda bırakıyor → hedef: aktivasyon %55
## Sonra (1–3 ay)
- ○ Otomatik hatırlatma — destekte en sık 2. konu
- ○ Çok çalışanlı takvim — bayram öncesi talep (gecikme maliyeti yüksek)
## Belki (kanıt bekliyor)
- ○ Kapora · ○ Raporlar · ○ Takvim eşitlemesi — istek defterinde her biri için ≥ 3 müşteri bekleniyor
## Birikim listesi (öneriler)
- Hizmet adları uzun olunca kartta taşıyor; iki satır mı, kısaltma mı? (tasarım)
```

Sıralamanın nasıl yapıldığı ve tarih sözü kuralları: [önceliklendirme](onceliklendirme.md).

## 3. Ürün karar kaydı

Teknik ve ürün kararları aynı biçimi kullanır; şablonun gerekçesi [tasarım kararı](../00-yontem/tasarim-karari.md)
notundadır. Ürün kararına örnek:

```markdown
## ADR-003: İlk sürümde yalnız tek başına çalışan kuaför               (kurgusal)
Tarih: 2026-11-20 · Durum: kabul edildi
**Bağlam:** Görüşmelerde klinikler ödeme ve hasta notu istedi; kuaförler yalnız randevu. İki grubu birden
desteklemek ilk sürümü iki katına çıkarıyor; klinikte sağlık verisi hukuki inceleme gerektiriyor.
**Seçenekler:** 1. İkisi birden — kapsam iki kat. 2. Yalnız klinik — ödeme ve sağlık verisi baştan.
3. Yalnız kuaför — en dar, en hızlı öğrenme.
**Karar:** 3.
**Sonuçlar:** (+) Üç haftada çıkış. (−) Klinik talepleri istek defterine; iki klinik pilotu bekliyor.
**Yeniden düşünme koşulu:** Kuaförde aktivasyon %55'i geçerse ya da 10+ klinik ön kayıt bırakırsa.
```

Köprü'nün `ADR-002-cumle-ve-yerler.md` kaydı bir ürün kararının ödünleşimini açıkça yazar: yeni kişisel kart eklenince
bölümdeki hazır kartların bir adım kaymasını "bilinçli bir uzlaşma" olarak kaydeder. Bedeli yazılmamış karar, ilk
şikâyette geri alınır.

## 4. İş özeti ve demo notu

```markdown
# S04 — Bekleme listesi                                    (iş özeti; kurgusal)
## Amaç
İptal edilen saatin boş kalmaması.
## Kapsam
İçinde: listeye yazılma, sıradaki kişiye öneri, 30 dakikalık süre. Dışında: SMS, sırayı elle değiştirme.
## Kabul ölçütleri
| #  | Ölçüt                                                     | Doğrulama                          |
| K1 | İptalde listedeki ilk kişiye öneri gider                  | uçtan uca: iptal → öneri iletisi   |
| K2 | 30 dakika yanıt yoksa öneri sıradakine geçer              | birim test (saat parametreyle)     |
| K3 | Saate 2 saatten az kaldıysa öneri gönderilmez             | birim test                         |
## İlgili ilkeler ve riskler
İlke 3 (telefon numarası yalnız kuaföre). Risk: gece yarısı ve ay sonu süre hesabı.
```

Demo notu dört başlıktır: **ne yapıldı**, **nasıl denenir** (adım adım, telefonda), **kabul ölçütlerinin durumu**,
**açık sorular ve bilinen sınırlar**. Ölçütlerin nasıl yazılacağı: [gereksinim yazma](gereksinim-yazma.md).

## 5. Sürüm notu

Kullanıcı için yazılır: ne değişti ve ona ne kazandırıyor; düzeltilenler; bilmesi gereken bir şey varsa ne yapmalı.
Teknik ayrıntı, yeniden düzenleme, bağımlılık güncellemesi yazılmaz.

```text
Sedir 1.4 — 3 Aralık 2026                                         (kurgusal)
Yeni
· Bekleme listesi: iptal edilen saat listedeki ilk müşteriye önerilir.
Düzeltildi
· Gece yarısından sonra alınan randevular bazen önceki güne yazılıyordu.
Bilmeniz gereken
· Bekleme listesi Ayarlar → Randevular'dan açılır; başlangıçta kapalıdır.
```

Belgeleri bir modele yazdırdıysanız kısa bir denetimden geçirin:

```python calistir
import re

PLAN_SECTIONS = ["Sorun", "Kimin için", "Değer önerisi", "Başarı ölçütleri", "Kapsam", "İlkeler", "Riskler"]
DECISION_FIELDS = ["Durum", "Bağlam", "Seçenekler", "Karar", "Sonuçlar", "Yeniden düşünme"]
JARGON = ["refactor", "bump", "deps", "endpoint", "entity", "merge", "pr ", "tz ", "migration", "yeniden düzenle"]


def missing(text: str, required: list[str]) -> list[str]:
    return [name for name in required if name not in text]


def release_note_issues(note: str) -> list[str]:
    items = [line for line in note.splitlines() if line.lstrip().startswith(("·", "-", "*"))]
    issues = [] if 1 <= len(items) <= 6 else [f"{len(items)} madde; 1–6 olsun"]
    lowered = note.lower() + " "
    return issues + [f"iç dil: {word.strip()}" for word in JARGON if word in lowered]


def next_decision_id(files: list[str], prefix: str = "ADR") -> str:
    numbers = [int(m.group(1)) for f in files if (m := re.match(rf"{prefix}-(\d{{3}})-", f))]
    return f"{prefix}-{max(numbers, default=0) + 1:03d}"


good_note = """Sedir 1.4 — 3 Aralık 2026
Yeni
· Bekleme listesi: iptal edilen saat listedeki ilk müşteriye önerilir.
Düzeltildi
· Gece yarısından sonra alınan randevular bazen önceki güne yazılıyordu."""
bad_note = "v1.4.0\n- refactor booking service\n- fix TZ bug\n- add waitlist entity\n- bump deps"

assert release_note_issues(good_note) == []
print(release_note_issues(bad_note))
assert missing("## Sorun\n## Kimin için\n## Kapsam", PLAN_SECTIONS) == [
    "Değer önerisi", "Başarı ölçütleri", "İlkeler", "Riskler"]
assert missing("Durum: kabul · Bağlam · Karar · Sonuçlar", DECISION_FIELDS) == ["Seçenekler", "Yeniden düşünme"]
print(next_decision_id(["ADR-001-teknoloji.md", "ADR-002-cumle-ve-yerler.md"]))
```

```cikti
['iç dil: refactor', 'iç dil: bump', 'iç dil: deps', 'iç dil: entity', 'iç dil: tz']
ADR-003
```

## Klasör düzeni

```text
CLAUDE.md ya da AGENTS.md   ilkeler, bitti tanımı, komutlar, klasör sahipliği (model her oturumda okur)
docs/
  PLAN.md                   tek sayfalık ürün planı
  ROADMAP.md                yol haritası + birikim listesi
  decisions/                ADR-001-ad.md … (numara artar; kayıt silinmez, "yerini aldı" ile kapanır)
  sprints/S01/              brief.md · demo.md · reviews/ · shots/
```

Havuzdaki temellerde karar kayıtlarının karşılığı her temelin `docs/KARARLAR.md` dosyasıdır
([`STANDARTLAR.md`](../../STANDARTLAR.md) §4).

## Tuzaklar

| Belirti                                                      | Neden                                                 | Çözüm                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Plan yirmi sayfa; kimse okumuyor, model yarısını unutuyor     | Her şey tek belgeye yazıldı                           | Tek sayfa plan; ayrıntı ayrı belgelerde, bağlantıyla                     |
| Aynı karar her ay yeniden tartışılıyor                       | Karar kaydı yok ya da elenen seçenekler yazılmadı     | Kayıt + seçenekler + yeniden düşünme koşulu                              |
| Yol haritasındaki tarihlerin hepsi kaydı                     | Uzak işe tarih verildi                                | Şimdi / Sonra / Belki; tarih yalnız yakın işe                            |
| Sürüm notu geliştirici dilinde                               | İç değişiklikler kullanıcıya yazıldı                  | Kullanıcının fark ettiği değişiklik, onun diliyle                        |
| Belgeler koddan geri kaldı                                   | Güncelleme işin parçası sayılmadı                     | Bitti tanımına "belge güncellendi" maddesi                               |
| Eski kayıt silindi, neden değiştiğini kimse bilmiyor          | Kayıt üzerine yazıldı                                 | Silmeyin; "yerini aldı: ADR-009" ile kapatın                             |
| Model planın "dışında" listesindeki şeyi ekledi              | Plan isteme konmadı                                   | Her istemde planın kapsam bölümü                                         |
| Herkes her belgeyi değiştiriyor, çelişkiler birikiyor        | Belgenin sahibi yok                                   | Belge başına tek sahip (Köprü'deki klasör sahipliği tablosu gibi)        |
| Başarı ölçütü "kullanıcılar memnun olsun"                    | Ölçüt sayısız                                         | Ölçüt, şimdiki değer, hedef, tarih                                       |

## Denetim listesi

- [ ] Tek sayfalık plan var: sorun, kimin için (ve kimin için değil), değer önerisi, sayılı başarı ölçütleri,
      kapsam (içinde/dışında), ilkeler, riskler.
- [ ] Yol haritası Şimdi / Sonra / Belki; dışa açık sürümünde tarih yok.
- [ ] Geri alması pahalı her ürün kararı numaralı bir kayıtta; seçenekler ve yeniden düşünme koşulu yazılı.
- [ ] Her iş paketi bir özetle başlıyor (amaç, kapsam, doğrulama sütunlu ölçütler) ve bir demo notuyla bitiyor.
- [ ] Her sürümün kullanıcı dilinde 1–6 maddelik notu var.
- [ ] Her belgenin sahibi ve son güncelleme tarihi belli.
- [ ] Modelin her oturumda okuduğu dosya ilkeleri, bitti tanımını ve komutları içeriyor.

## Küçük modele yaptırırken

- **Taslak için:** "Şu şablonu doldur; bilmediğin alanı `[?]` olarak bırak. Ölçüt, rakam, tarih uydurma. Plan bir
  sayfayı geçmesin." `[?]` alanlarını siz doldurursunuz.
- **Sürüm notu için:** "Şu kayıt iletilerinden (`git log --oneline`) kullanıcıya dönük sürüm notu yaz: yalnız
  kullanıcının fark edeceği değişiklikler, onun diliyle, en çok 6 madde. Yeniden düzenleme ve bağımlılık
  güncellemesini yazma."
- **Karar kaydı için:** "Seçenekleri ve her birinin artısını, eksisini yaz; kararı ben vereceğim."
- **Modelin tipik hatası:** uzun ve süslü belge; ölçüt ve tarih uydurma; sürüm notuna iç ayrıntı; karar kaydında
  seçenekleri ve bedeli atlama; eski kaydı silip yenisini yazma.
- **Çıktıda denetleyin:** yukarıdaki süzgeç; uzunluk; `[?]` alanları; "kimin için değil" ve "dışında" satırlarının
  dolu olması.

## İlgili

- [Tasarım kararı](../00-yontem/tasarim-karari.md) ve [teknik yazı](../00-yontem/teknik-yazi.md): karar kaydı ve yazım kuralları.
- [Tahmin ve planlama](../00-yontem/tahmin-ve-planlama.md): yol haritasındaki aralıklı tahmin.
- [MVP kapsamı](mvp-kapsami.md), [gereksinim yazma](gereksinim-yazma.md), [önceliklendirme](onceliklendirme.md).
- [Geliştirme döngüsü ve kalite kapıları](gelistirme-dongusu-ve-kapilar.md): özet, inceleme ve demo notunun döngüdeki yeri.
- [Segment ve konumlandırma](segment-ve-konumlandirma.md): planın "kimin için" ve "değer önerisi" bölümleri.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): başarı ölçütü ve öğrenme kaydı.
- [Mobil ve mağaza](mobil-ve-magaza.md): sürüm numarası ve mağaza sürüm notu.
