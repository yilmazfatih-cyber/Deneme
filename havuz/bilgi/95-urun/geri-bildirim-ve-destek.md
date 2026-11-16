---
baslik: Geri bildirim ve destek
ozet: Geri bildirim toplama yolları, talepleri etiketleyip farklı kişi sayısıyla önceliklendirmek, suçlamayan Türkçe destek yanıt şablonları ve sık sorulan sorudan belgeye ya da arayüz düzeltmesine giden yol.
etiketler: [urun, geri-bildirim, destek, etiketleme, sss]
duzey: temel
guncellik: 2026-11
---

# Geri bildirim ve destek

> Bu notu ne zaman okumalı: kullanıcılar yazmaya başladığında; bir destek yanıtı yazarken ya da yazdırırken;
> geri bildirimler birikti ve ne yapacağınızı bilmiyorsanız; SSS ya da yardım belgesi yazmadan önce.

## Temel fikir

Destek talebi ürünün en dürüst ölçüm kaynağıdır: her talep ya eksik bir belge, ya kafa karıştıran bir ekran, ya bir
hata ya da bir istektir. Toplamak kolaydır; değer **etiketlemede ve saymada**dır. Her talep tek bir türe ve alana
etiketlenir; **kaç farklı kişiden** geldiği sayılır.

İstek çözüm değildir: "Excel'e aktarma olsun" isteğinin altında bir iş vardır ("muhasebeciye aylık rapor"). Önce o
işi sorun. Yanıtlar suçlamaz: kullanıcının takıldığı adım bir **ürün sorunudur**.

Döngü: talep → yanıt → etiket → haftalık sayım → karar (belge yaz, ekranı düzelt, hatayı düzelt, istek defterine
yaz) → kullanıcıya "düzeldi" haberi. Son adım en çok atlanandır ve güveni en ucuza kazandırandır.

## Karar tablosu: talep türü → yanıt ve karar

| Tür                          | Örnek                              | İlk yanıt                                                        | Ürün kararı                                                     |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Hata                         | "Hatırlatmalar gitmedi"            | Teşekkür, sorun bizdeyse söyle, geçici yol, ne zaman dönüleceği   | Şiddet × kişi sayısı; engelleyen hata hemen                     |
| Nasıl yapılır sorusu         | "Mola saatini nasıl eklerim?"      | Numaralı adımlar + belge bağlantısı                               | 3+ farklı kişi → belge; 5+ → ekran sorunu, düzeltmeye           |
| Özellik isteği               | "Excel'e aktarma olsun"            | Teşekkür + "hangi iş için?" + bugünkü geçici yol                  | İstek defteri; üç bağımsız müşteri kuralı ([önceliklendirme](onceliklendirme.md)) |
| Ödeme ve fatura              | "İki kez para çekildi"             | Aynı gün; somut tutar ve tarih; belge                             | Güven sorunu: öncelikli                                         |
| Şikâyet, öfke                | "Hiçbir şey çalışmıyor"            | Önce kabul; gerekiyorsa özür; sonra tek somut adım                | Kök nedeni bulun                                                |
| Veri ve gizlilik başvurusu   | "Verilerimi silin"                 | Kaydı alın; yasal süre içinde yanıt                               | Ayrı etiket ve süre takibi ([yasal](yasal-temel-belgeler.md))   |
| Övgü                         | "Çok işime yaradı"                 | Teşekkür; görüş olarak kullanmak için **izin** isteyin            | İzinli referans adayı                                           |

## Toplama yolları

| Yol                                                    | Güçlü yanı                          | Zayıf yanı                               |
| ------------------------------------------------------ | ----------------------------------- | ---------------------------------------- |
| Destek e-postası ya da mesaj hattı                     | Bağlamı zengin, kişisel             | Yalnız sorun yaşayan yazar               |
| Ürün içi "Geri bildirim" düğmesi (ekran ve sürüm otomatik eklenir) | Bağlam kendiliğinden gelir | Kısa ve dağınık metin               |
| Aktivasyondan sonra tek soruluk anket                  | Düzenli, karşılaştırılabilir        | Düşük yanıt                              |
| İptal anında tek soru (seçenek + serbest metin)        | Kayıp nedenini gösterir             | Kısa ve duygusal                         |
| Görüşme ([kullanıcı görüşmesi](kullanici-gorusmesi.md)) | Derin                              | Zahmetli                                 |
| Mağaza yorumları, sosyal medya                         | Kamuya açık                         | Gürültülü; yanıtınız da herkese açıktır  |
| Kullanım verisi                                        | Davranışı gösterir                  | Nedeni söylemez                          |

Tek bir memnuniyet puanı (ör. 0–10 tavsiye puanı) küçük örneklemde oynaktır; yanına mutlaka açık uçlu "neden?"
sorusu koyun; öğreten o metindir.

## Etiketleme ve önceliklendirme

Kapalı bir etiket listesi kullanın: **tür** (hata, soru, istek, ödeme, şikâyet, veri, övgü) × **alan** (kurulum,
randevu sayfası, hatırlatma, ödeme, hesap) × **segment** (ücretsiz/ücretli, kuaför/klinik) × hatalarda **şiddet**
(engelleyen, çevresi var, kozmetik). Haftalık sayım farklı kişi sayısıyla yapılır:

```python calistir
from collections import defaultdict

SEVERITY = {"engelleyen": 3, "çevresi var": 2, "kozmetik": 1}
# (kişi, tür, konu, şiddet) — son 30 gün, Sedir, kurgusal
tickets = [
    ("K1", "soru", "mola-saati", None), ("K2", "soru", "mola-saati", None), ("K3", "soru", "mola-saati", None),
    ("K1", "soru", "mola-saati", None), ("K4", "soru", "mola-saati", None), ("K5", "soru", "mola-saati", None),
    ("K2", "soru", "fatura-indirme", None), ("K6", "soru", "fatura-indirme", None), ("K7", "soru", "fatura-indirme", None),
    ("K3", "hata", "hatirlatma-gitmedi", "engelleyen"), ("K8", "hata", "hatirlatma-gitmedi", "engelleyen"),
    ("K9", "hata", "hatirlatma-gitmedi", "engelleyen"), ("K4", "hata", "rapor-tarih-bicimi", "kozmetik"),
    ("K5", "hata", "rapor-tarih-bicimi", "kozmetik"), ("K6", "istek", "excel-aktarma", None),
    ("K6", "istek", "excel-aktarma", None), ("K7", "istek", "excel-aktarma", None),
]
people: dict[tuple[str, str], set[str]] = defaultdict(set)
severity: dict[tuple[str, str], str] = {}
for person, kind, topic, level in tickets:
    people[(kind, topic)].add(person)
    if level:
        severity[(kind, topic)] = level


def action(kind: str, topic: str) -> str:
    n = len(people[(kind, topic)])
    if kind == "hata":
        return f"{n} kişi × {severity[(kind, topic)]} → puan {n * SEVERITY[severity[(kind, topic)]]}"
    if kind == "soru":
        return f"{n} kişi → " + ("arayüz sorunu (5+)" if n >= 5 else "belge yaz (3+)" if n >= 3 else "hazır yanıt")
    return f"{n} kişi → istek defteri" + ("" if n >= 3 else " (üç müşteri bekleniyor)")


for kind, topic in sorted(people, key=lambda key: (key[0], -len(people[key]))):
    print(f"{kind:5} {topic}: {action(kind, topic)}")
assert len(people[("soru", "mola-saati")]) == 5  # K1 iki kez yazdı, bir kişi sayılır
assert action("istek", "excel-aktarma").endswith("(üç müşteri bekleniyor)")
```

```cikti
hata  hatirlatma-gitmedi: 3 kişi × engelleyen → puan 9
hata  rapor-tarih-bicimi: 2 kişi × kozmetik → puan 2
istek excel-aktarma: 2 kişi → istek defteri (üç müşteri bekleniyor)
soru  mola-saati: 5 kişi → arayüz sorunu (5+)
soru  fatura-indirme: 3 kişi → belge yaz (3+)
```

Eşikler (3 ve 5) pratik kurallardır; kendi hacminize göre ayarlayın. Önemli olan, kararın tek bir yüksek sesli
kullanıcıya göre değil, farklı kişi sayısına göre verilmesidir.

## Destek yanıt şablonları

Kurallar: adıyla hitap; teşekkür; sorun bizdeyse açıkça söyleyin; **tek somut sonraki adım ve zaman**; varsa geçici
yol; kısa cümle; etken çatı; imzada bir kişinin adı. Yasak: suçlama ("yanlış kullanmışsınız", "dikkatli
okusaydınız"), kaçamak ("sistem böyle çalışıyor"), bürokratik kalıp ("talebiniz alınmıştır", "bilginize").

```text
[Hata]
Merhaba Gülay Hanım,
Yazdığınız için teşekkür ederim. Hatırlatmaların dün akşam gitmediğini görüyorum; sorun bizde.
Bugün saat 17:00'ye kadar size yeniden yazacağım. Bu arada yarınki randevular için "Bugün" ekranındaki
"Hatırlat" düğmesiyle iletiyi elle gönderebilirsiniz. Kusura bakmayın.
Can, Sedir

[Nasıl yapılır]
Merhaba Mert Bey,
Mola saatini şöyle eklersiniz: 1. Ayarlar → Çalışma saatleri  2. Günün yanındaki "Mola ekle"  3. Saatleri seçip "Kaydet".
Kısa bir video da var: [bağlantı]. Bu adımı başkaları da zor buldu; ekranı sadeleştirmek için not aldık.

[Özellik isteği]
Merhaba Nihan Hanım,
Öneriniz için teşekkürler. Excel'e aktarmayı hangi iş için kullanacaksınız: muhasebeciye aylık rapor mu, kendi
takibiniz mi? Bunu bilmek doğru çözümü seçmemize yardım eder. Şimdilik "Dışa aktar" düğmesiyle listeyi tablo
dosyası olarak indirip Excel'de açabilirsiniz.

[Ödeme hatası]
Merhaba Kerem Bey,
Haklısınız: bu ay ücretiniz iki kez çekilmiş; hata bizim ödeme adımımızda. Fazla çekilen 349 TL'nin iadesini bugün
başlattım; bankanıza göre birkaç iş günü içinde hesabınıza geçer. İade belgesi ektedir. Özür dilerim.

[Düzeldi haberi]
Merhaba Gülay Hanım, geçen hafta bildirdiğiniz hatırlatma sorunu düzeldi. Bildirdiğiniz için teşekkürler; sizin
sayenizde herkes için düzeldi.
```

Bir modele yanıt taslağı yazdırıyorsanız göndermeden önce bu süzgeçten geçirin:

```python calistir
import re

BLAME = ["yanlış kullan", "dikkatli oku", "sizin hata", "zaten yazıyor", "sistem böyle",
         "yapacak bir şey yok", "kılavuzu okuyunuz"]
BUREAUCRATIC = ["talebiniz alınmıştır", "bilginize", "tarafımızca", "sayın kullanıcı", "gereği yapılacaktır"]
NEXT_STEP = re.compile(r"(bugün|yarın|saat|\d+\.|adım|düğme|bağlantı)")


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def review(reply: str) -> list[str]:
    text = lower_tr(reply)
    issues = [f"suçlayıcı: {p}" for p in BLAME if p in text]
    issues += [f"bürokratik: {p}" for p in BUREAUCRATIC if p in text]
    if not reply.startswith("Merhaba ") or reply.startswith("Merhaba,"):
        issues.append("adıyla hitap yok")
    if not NEXT_STEP.search(text):
        issues.append("sonraki adım ya da zaman yok")
    return issues


good = ("Merhaba Gülay Hanım,\nYazdığınız için teşekkür ederim. Hatırlatmaların dün gitmediğini görüyorum; sorun bizde.\n"
        "Bugün saat 17:00'ye kadar size yeniden yazacağım. Bu arada \"Hatırlat\" düğmesiyle iletiyi elle gönderebilirsiniz.\n"
        "Can, Sedir")
bad = ("Sayın kullanıcı, talebiniz alınmıştır. Sistem böyle çalışmaktadır; kılavuzu dikkatli okusaydınız "
       "sorun yaşamazdınız. Bilginize.")
assert review(good) == []
for issue in review(bad):
    print(issue)
```

```cikti
suçlayıcı: dikkatli oku
suçlayıcı: sistem böyle
bürokratik: talebiniz alınmıştır
bürokratik: bilginize
bürokratik: sayın kullanıcı
adıyla hitap yok
sonraki adım ya da zaman yok
```

## Sık sorulandan belgeye

1. Aynı soru 30 günde **3+ farklı kişiden** geldiyse yardım belgesi yazın ve hazır yanıta bağlantısını koyun.
2. **5+ kişiden** geldiyse sorun belgede değil ekrandadır: düzeltmeyi sıraya alın ([UX temelleri](ux-temelleri.md)).
   Düzeltmeden sonra aynı sorunun sayısı düştü mü, bakın.
3. Belge biçimi: başlık kullanıcının sorusu ("Mola saatini nasıl eklerim?"), 3–6 numaralı adım, ekran görüntüsü,
   ilgili belgeler. Site temelinde: `npm run new -- belge "Başlık"`; ana sayfa SSS'si
   [`sss/tr.json`](../../site/src/content/sss/tr.json).
4. **Bilinen sorunlar** sayfası tutun: ne bozuk, geçici yol, beklenen düzelme. Destek yükünü azaltır, güveni artırır.

## Küçük ekipte destek düzeni

- Tek kanal ve tek paylaşılan gelen kutusu; kişisel e-postalarda talep kaybolur. Site temelinin iletişim formu
  ([`ContactForm.astro`](../../site/src/components/ContactForm.astro)) bir form servisine ya da e-postaya bağlanır.
- Tutabileceğiniz bir yanıt süresi sözü ("iş günlerinde aynı gün"); kaçırırsanız önce siz yazın.
- Her talep tek satır kayıt: tarih, kişi kimliği, tür, alan, özet, durum. Gereğinden fazla kişisel veri tutmayın;
  saklama süresi belirleyin.
- Haftada bir 30 dakika: sayımlar ve ilk üç konu için karar; kararlar [önceliklendirme](onceliklendirme.md) listesine.
- Yapay zekâyla taslak yanıt yazdırılabilir; gönderen insandır. Müşteri metnini dış bir servise vermeden önce
  kişisel veriyi temizleyin ([yapay zekâ özelliği tasarlama](yapay-zeka-ozelligi-tasarlama.md)).

## Tuzaklar

| Belirti                                                        | Neden                                                 | Çözüm                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Aynı soruya her hafta yeniden yanıt yazılıyor                  | Belge ve hazır yanıt yok                              | 3+ kuralı; belge + hazır yanıt                                          |
| En yüksek sesli müşteri yol haritasını belirledi               | Geçiş sayıldı, kişi sayılmadı                         | Farklı kişi sayısı ve segment                                           |
| İstek aynen yapıldı, kimse kullanmadı                          | İsteğin altındaki iş sorulmadı                        | "Hangi iş için?" sorusu; işi çözen en küçük yol                          |
| Yanıtlar kibar ama soğuk                                       | Bürokratik kalıp dil                                  | Adıyla hitap, etken çatı, kısa cümle, kişi adıyla imza                  |
| Müşteri suçlandığını hissetti                                  | "Yanlış kullanmışsınız" dili                          | Takılınan adımı ürün sorunu olarak yazın                                |
| Hata bildiren düzeldiğini hiç öğrenmedi                        | Kapanış adımı yok                                     | "Düzeldi" haberi; kayıtta "bildirildi" durumu                           |
| Söz verilen saat kaçtı                                         | Gerçekçi olmayan söz                                  | Tutabileceğiniz süre; kaçarsa önce siz yazın                            |
| Veri silme başvurusu genel taleplerin arasında kayboldu        | Ayrı süreç yok                                        | Ayrı etiket, süre takibi, kayıt                                          |
| Model taslağı müşteriye olmayan bir özelliği vaat etti         | Yapay zekâ taslağı denetlenmeden gönderildi           | İnsan onayı; yalnız belgede yazanı söyleyin                              |

## Denetim listesi

- [ ] Tek destek kanalı, paylaşılan gelen kutusu ve yazılı bir yanıt süresi sözü var.
- [ ] Her talep kapalı listeden tür, alan, segment ve (hatada) şiddetle etiketleniyor.
- [ ] Haftalık sayım farklı kişi sayısıyla yapılıyor; ilk üç konu için karar yazılıyor.
- [ ] 3+ kişinin sorduğu soru için belge, 5+ için ekran düzeltmesi sırada.
- [ ] Hazır yanıtlar süzgeçten geçiyor: hitap, sonraki adım ve zaman, suçlama ve kalıp dil yok.
- [ ] Hata bildirenlere "düzeldi" haberi gidiyor; bilinen sorunlar sayfası güncel.
- [ ] Özellik isteklerinde altındaki iş soruluyor ve istek defterine yazılıyor.
- [ ] Veri ve gizlilik başvuruları ayrı etiketle ve süreyle izleniyor.

## Küçük modele yaptırırken

- **Yanıt taslağı için:** "Bu talebe yanıt taslağı yaz: adıyla hitap et, teşekkür et, sorun bizdeyse açıkça söyle,
  tek somut sonraki adımı ve ne zaman döneceğimizi yaz, varsa geçici yolu ver. Suçlama, 'sistem böyle', 'talebiniz
  alınmıştır' yazma. Belgede olmayan özellik ya da tarih vaat etme. En çok 6 cümle."
- **Etiketleme için:** "Her talebi şu türlerden birine ve şu alanlardan birine etiketle; emin değilsen 'belirsiz' yaz.
  Yeni etiket uydurma." Kapalı listeyi isteme yapıştırın.
- **Modelin tipik hatası:** aşırı özür ve kalıp dil; olmayan özellik ya da tarih vaadi; "lütfen kılavuzu okuyunuz" gibi
  örtülü suçlama; listede olmayan etiket uydurma; sayımı geçişle yapma.
- **Çıktıda denetleyin:** yanıt süzgeci; etiketlerin listede olması; sayımın kişi bazlı olması; gönderenin insan olması.

## İlgili

- [Kullanıcı görüşmesi](kullanici-gorusmesi.md): talebin altındaki işi sormak ve sentez.
- [Önceliklendirme](onceliklendirme.md): istek defteri, üç müşteri kuralı, gerekçeli "hayır".
- [Lansman](lansman.md): ilk hafta destek ve geri bildirim.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): destek kayıtlarını ölçüm kaynağı olarak kullanmak.
- [Yasal temel belgeler](yasal-temel-belgeler.md): veri ve gizlilik başvuruları.
- Hata iletisi ve arayüz dili: `97-turkce` kümesi.
