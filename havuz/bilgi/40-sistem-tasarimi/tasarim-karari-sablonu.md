---
baslik: Tasarım kararı şablonu: sistem tasarım belgesi
ozet: Özellik ya da altyapı değişikliği için tasarım belgesi şablonu (bağlam, hedef dışı, sayılı gereksinim, kaba hesap, seçenekler, karar, risk, geçiş ve geri dönüş planı, ölçüm), doldurulmuş örnek ve denetleyici.
etiketler: [tasarim-belgesi, karar, sablon, mimari, yontem]
duzey: temel
guncellik: 2026-11
---

# Tasarım kararı şablonu: sistem tasarım belgesi

> Bu notu ne zaman okumalı: birkaç günden uzun sürecek, veri modelini değiştirecek, yeni bir altyapı parçası
> (kuyruk, önbellek sunucusu, ikinci veritabanı, ayrı servis) ekleyecek ya da geri alınması zor bir işe
> başlamadan önce; bir modelden "bunu nasıl tasarlarız" sorusuna yazılı cevap istendiğinde.

## Temel fikir

- Tasarım belgesi **koddan önce** yazılır ve tek bir soruyu cevaplar: "Neyi, neden böyle yapıyoruz; neyi
  yapmıyoruz; ters giderse ne yaparız?" Bir-üç sayfa yeter.
- En değerli bölümler en çok atlananlardır: **hedef dışı** (kapsamı sınırlar), **"hiçbir şey yapmamak" seçeneği**
  (değişikliğin gerçekten gerekli olduğunu sınar), **geri dönüş planı** (tetikleyicisiyle).
- Gereksinimler **sayıyla** yazılır: "hızlı olsun" değil "p95 < 300 ms"; "çok kullanıcı" değil "günde 20 bin etkin".
- Küçük, tek bir karar için tasarım belgesi değil **karar kaydı** yeter (yarım sayfa):
  [Tasarım kararı](../00-yontem/tasarim-karari.md) → "Karar kaydı şablonu". Bu şablon, birden çok kararı ve geçişi
  olan işler içindir.

## Karar tablosu: hangi belge

| İş                                                                   | Belge                          |
| -------------------------------------------------------------------- | ------------------------------ |
| Tek, geri alınabilir karar (kütüphane, iç düzen)                     | Gerek yok ya da bir satır not  |
| Tek, geri alınması pahalı karar (para tipi, kimlik türü)             | Karar kaydı (`docs/KARARLAR.md`) |
| Yeni altyapı parçası, veri modeli değişikliği, servis ayırma, göç    | Tasarım belgesi (bu şablon)    |
| Kesintiden sonra                                                     | [Olay sonrası değerlendirme](../60-devops/olay-sonrasi-degerlendirme.md); çıkan iş için tasarım belgesi |

## Şablon

Kopyalanıp `docs/tasarim/NNN-kisa-ad.md` olarak kaydedilir.

```markdown
# TB-NNN: <Kısa, eylem bildiren başlık>

Durum: taslak | incelemede | kabul | uygulandı | vazgeçildi · Tarih: YYYY-AA-GG · Sahip: … · İnceleyen: …

## Bağlam
Sorun ne, kimi etkiliyor, neden şimdi? Ölçüm ve kanıt (sayı, günlük, destek talebi). Bugünkü tasarımın özeti.

## Hedefler
Ölçülebilir 2–4 madde.

## Hedef dışı
Bu işin bilerek yapmayacağı şeyler (ileride ayrı iş olabilir).

## Gereksinimler
İşlevsel ve işlevsel olmayan; SAYIYLA: hacim, gecikme (yüzdelik), erişilebilirlik, maliyet, veri saklama.

## Kaba hesap
İstek/sn (ortalama ve tepe), depolama, bant genişliği, eşzamanlılık. Varsayımların kaynağı.

## Seçenekler
1. Hiçbir şey yapmamak — bedeli ne?
2. Seçenek A — nasıl çalışır; artı; eksi; maliyet; geri alınabilir mi?
3. Seçenek B — …

## Karar
Seçilen seçenek ve gerekçesi; elenenlerin neden elendiği tek cümleyle.

## Tasarım
Parçalar, veri modeli (tablo/alan), akış (adım adım), hata durumları, güvenlik ve gizlilik etkisi.

## Riskler
| Risk | Olasılık / etki | Önlem |

## Geçiş planı
Adımlar, özellik bayrağı, migrasyon sırası (önce genişlet, sonra daralt), kimin etkileneceği.

## Geri dönüş planı
Tetikleyici (hangi ölçüm hangi eşiği geçerse), adımlar, veriye ne olur, ne kadar sürer.

## Ölçüm
Başarı ölçütü, pano ve uyarılar; kaç gün sonra değerlendirilecek.

## Açık sorular
Cevabı henüz bilinmeyenler ve kimin cevaplayacağı.
```

## Doldurulmuş kısa örnek

Havuzdaki API'de arka plan işleri bellek içidir ve yeniden başlatmada kaybolur
([`background.ts`](../../uygulama/api/src/lib/background.ts) başlığı). Aşağıdaki belge bunun çözümünü tasarlar
(sayılar örnektir):

```markdown
# TB-003: E-posta gönderimini kalıcı iş kuyruğuna taşımak

Durum: incelemede · Tarih: 2026-11-16 · Sahip: Ayşe · İnceleyen: Mehmet

## Bağlam
Şifre sıfırlama ve davet e-postaları bellek içi arka plan işiyle gönderiliyor. Dağıtımda süreç yeniden başlayınca
bekleyen e-postalar kayboluyor; sağlayıcı geçici hata verince yeniden deneme yok. Son 30 günde 14 "e-posta
gelmedi" destek talebi var.

## Hedefler
- Kabul edilen her e-posta 10 dk içinde gönderilir ya da "başarısız" olarak görünür.
- Dağıtım ve yeniden başlatma e-posta kaybettirmez.

## Hedef dışı
- Toplu duyuru e-postası, açılma takibi, ikinci e-posta sağlayıcısı.

## Gereksinimler
- Günde ~2 000 e-posta, tepe dakikada 50; kuyruğa girişten gönderime p95 < 60 sn.
- Aynı e-posta iki kez gitmez; iş, onu doğuran işlemle aynı veritabanı işleminde kaydedilir.

## Kaba hesap
- 2 000/gün ≈ 0,02 iş/sn (tepe ~1 iş/sn). 30 gün saklamayla tablo ~60 bin satır. SQLite fazlasıyla yeter.

## Seçenekler
1. Hiçbir şey yapmamak — maliyet yok; ayda ~14 kayıp e-posta ve destek yükü sürer.
2. Redis + iş kuyruğu kütüphanesi — olgun araç; yeni altyapı, yedek ve izleme; tek sunucuda gereksiz.
3. SQLite iş tablosu + yoklayıcı işçi (giden kutusu) — yeni bağımlılık yok; iş, iş kaydıyla aynı işlemde.

## Karar
3. Kaybı giden kutusuyla sıfırlar ve altyapı eklemez. 2 elendi: tek sunuculu üründe işletme yükü kazancından büyük.

## Tasarım
Tablo `is (id, tur, yuk_json, durum, deneme, kira_bitis, sonraki_deneme, olusturma)`. Yoklayıcı her saniye
`durum='bekliyor' AND sonraki_deneme <= simdi` işleri kirayla alır; sağlayıcıya iş kimliği idempotentlik anahtarı
olarak gider. Geçici hatada titremeli geri çekilme; 5 denemeden sonra `olu`.

## Riskler
| Risk | Olasılık / etki | Önlem |
| Yoklama veritabanını yorar | düşük / orta | Dizinli sorgu, boşken 5 sn'ye çıkan aralık |
| Kira dolup iş iki kez çalışır | düşük / düşük | Sağlayıcıya idempotentlik anahtarı |
| Zehirli iş kuyruğu tıkar | düşük / orta | 5 deneme, ölü mektup, uyarı |

## Geçiş planı
1. Migrasyon: `is` tablosu (eklemeli). 2. `KALICI_KUYRUK=1` bayrağıyla önce davet e-postaları. 3. Bir hafta
gözlem, sonra şifre sıfırlama.

## Geri dönüş planı
Tetikleyici: gönderim hata oranı %5'i ya da en eski işin yaşı 15 dk'yı geçerse. Adım: bayrak kapatılır, eski yol
çalışır; tablodaki bekleyen işler bayrak açılınca gönderilir. Veri kaybı yok; süre 5 dk.

## Ölçüm
"E-posta gelmedi" talebi ayda 2'nin altında; kuyruk yaşı p95 < 60 sn; ölü mektup ~0. Pano: derinlik, en eski iş
yaşı, deneme ve hata sayısı. Değerlendirme: 30 gün sonra.

## Açık sorular
- Ölü mektuptaki işler yönetici panelinden yeniden kuyruğa alınabilmeli mi? (Mehmet)
```

## Belgeyi denetlemek

Şablonun iskeleti bir betikle denetlenir: eksik bölüm, tek seçenek, "hiçbir şey yapmamak"ın yokluğu, sayısız
gereksinim ve tetikleyicisiz geri dönüş planı yakalanır. İçeriğin doğruluğunu insan inceler; betik, en sık
unutulanı yakalar (küçük modelin çıktısını denetlemek için de kullanılır):

```python calistir
import re

ZORUNLU = ["Bağlam", "Hedefler", "Hedef dışı", "Gereksinimler", "Kaba hesap", "Seçenekler", "Karar", "Riskler",
           "Geçiş planı", "Geri dönüş planı", "Ölçüm"]


def denetle(belge: str) -> list[str]:
    """Tasarım belgesinin iskeletini denetler. İçeriği değil, unutulan bölümü ve boş sözleri yakalar."""
    bolumler: dict[str, list[str]] = {}
    ad = None
    for satir in belge.splitlines():
        if satir.startswith("## "):
            ad = satir[3:].strip()
            bolumler[ad] = []
        elif ad:
            bolumler[ad].append(satir)
    metin = {b: "\n".join(s).strip() for b, s in bolumler.items()}
    sorunlar = [f"bölüm eksik ya da boş: {b}" for b in ZORUNLU if not metin.get(b)]
    secenekler = metin.get("Seçenekler", "")
    if len(re.findall(r"^\d+\.", secenekler, re.M)) < 2:
        sorunlar.append("en az iki numaralı seçenek gerekli")
    if "hiçbir şey yapma" not in secenekler.lower():
        sorunlar.append("'hiçbir şey yapmamak' seçeneği yazılmamış")
    if metin.get("Gereksinimler") and not re.search(r"\d", metin["Gereksinimler"]):
        sorunlar.append("gereksinimlerde sayı yok (gecikme, hacim, erişilebilirlik)")
    if not re.search(r"tetikleyici|eşik", metin.get("Geri dönüş planı", ""), re.I):
        sorunlar.append("geri dönüş planında tetikleyici yok")
    return sorunlar


eksik = """## Bağlam
E-postalar bazen kayboluyor.
## Seçenekler
1. Redis kuyruğu
## Karar
Redis kullanacağız.
## Geri dönüş planı
Gerekirse geri alırız.
"""
tam = """## Bağlam
Bellek içi arka plan işi yeniden başlatmada e-posta kaybediyor.
## Hedefler
Kabul edilen e-posta 10 dk içinde gider.
## Hedef dışı
Toplu duyuru.
## Gereksinimler
Günde 2000 e-posta, p95 < 60 sn, çift gönderim yok.
## Kaba hesap
0,02 iş/sn; 30 günlük tablo ~60 bin satır.
## Seçenekler
1. Hiçbir şey yapmamak
2. Redis + kuyruk kütüphanesi
3. SQLite iş tablosu + yoklayıcı
## Karar
3.
## Riskler
Çift gönderim: idempotentlik anahtarı.
## Geçiş planı
Özellik bayrağıyla önce davet e-postaları.
## Geri dönüş planı
Tetikleyici: hata oranı %5 üstü. Bayrak kapatılır.
## Ölçüm
"E-posta gelmedi" talebi ayda 2'nin altında.
"""
for satir in denetle(eksik):
    print("-", satir)
assert len(denetle(eksik)) == 10 and denetle(tam) == []
```

```cikti
- bölüm eksik ya da boş: Hedefler
- bölüm eksik ya da boş: Hedef dışı
- bölüm eksik ya da boş: Gereksinimler
- bölüm eksik ya da boş: Kaba hesap
- bölüm eksik ya da boş: Riskler
- bölüm eksik ya da boş: Geçiş planı
- bölüm eksik ya da boş: Ölçüm
- en az iki numaralı seçenek gerekli
- 'hiçbir şey yapmamak' seçeneği yazılmamış
- geri dönüş planında tetikleyici yok
```

## Nasıl yazılır, nasıl incelenir

1. **Önce bağlam ve hedef dışı.** Sorun tek paragrafta anlatılamıyorsa tasarıma geçilmez.
2. **Kaba hesap** ([Kapasite tahmini](kapasite-tahmini.md)) seçenekleri eler: çoğu zaman tek sunucunun yettiği
   ortaya çıkar ve altyapı seçenekleri düşer.
3. **Seçenekler** dürüst yazılır: önerilen seçeneğin eksileri ve elenenlerin artıları da yazılır.
4. **Geri alınabilirlik** her seçeneğin yanında: veri biçimi, herkese açık arayüz, kişisel veri toplama tek yönlü
   kapıdır ([Tasarım kararı](../00-yontem/tasarim-karari.md)).
5. **Geçiş** genişlet-sonra-daralt sırasıyla planlanır: yeni sütun/tablo eklenir, iki yol bir süre birlikte çalışır,
   eski yol en son kaldırılır ([Migrasyonlar](../30-arkauc/migrasyonlar.md)); kademeli açılış, özellik bayrağı ve
   geri alma: [Dağıtım stratejileri](../60-devops/dagitim-stratejileri.md).
6. **İnceleme soruları:** Hedef dışı yeterince açık mı? Sayılar nereden geldi? En basit seçenek neden yetmiyor?
   Tetikleyici ölçülebiliyor mu ve panoda mı? Gizlilik ve güvenlik etkisi yazıldı mı
   ([Tehdit modelleme](../50-guvenlik/tehdit-modelleme.md))?
7. **Uygulandıktan sonra** belgeye "Sonuç" eklenir: ölçüm ne dedi, ne farklı oldu. Belge yaşayan kayıttır.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Belge, verilmiş bir kararın gerekçelendirilmesi gibi          | Tek seçenek; "hiçbir şey yapmamak" yok                   | En az iki seçenek + hiçbir şey yapmamak                    |
| İş bitmiyor, kapsam sürekli büyüyor                           | Hedef dışı yazılmadı                                     | Hedef dışı bölümü; yeni istek ayrı belgeye                 |
| "Hızlı", "ölçeklenebilir" gibi ölçülemeyen hedefler           | Gereksinimler sayısız                                    | Yüzdelik, hacim, eşik                                      |
| Geçiş sırasında sorun çıktı, kimse ne yapacağını bilmiyor     | Geri dönüş planı yok ya da tetikleyicisiz                | Tetikleyici + adım + veri durumu + süre                    |
| Altı ay sonra aynı tartışma baştan yapıldı                    | Elenen seçeneklerin gerekçesi yazılmadı                  | Her elenen seçenek için tek cümle                          |
| Belge 20 sayfa, kimse okumadı                                 | Uygulama ayrıntısı belgeye taşındı                       | 1–3 sayfa; ayrıntı koda ve testlere                        |
| Uygulama belgeden saptı, belge güncellenmedi                  | Belge "bir kez yazılır" sanıldı                          | Durum alanı ve "Sonuç" bölümü                              |

## Denetim listesi

- [ ] Bütün zorunlu bölümler dolu; denetleyici betik temiz çıkıyor.
- [ ] Hedefler ve gereksinimler sayılı; hedef dışı yazılı.
- [ ] Kaba hesap var ve varsayımların kaynağı yazılı.
- [ ] En az iki seçenek + "hiçbir şey yapmamak"; her birinin eksisi ve geri alınabilirliği yazılı.
- [ ] Geçiş planı genişlet-sonra-daralt sırasında; özellik bayrağı ya da kademeli açılış var.
- [ ] Geri dönüş planının ölçülebilir tetikleyicisi, adımları ve veri durumu yazılı.
- [ ] Başarı ölçütü, pano ve değerlendirme tarihi yazılı.
- [ ] Uygulandıktan sonra "Sonuç" eklendi; `docs/KARARLAR.md`'ye tek satırlık karar kaydı düşüldü.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu iş için `docs/tasarim/` altına şablona uygun bir tasarım belgesi yaz. Gereksinimleri
  sayıyla yaz; kaba hesabı Python işlevi olarak göster; en az iki seçenek ve 'hiçbir şey yapmamak'; geri dönüş
  planına ölçülebilir tetikleyici koy. Kod yazma; önce belge."
- **Modelin tipik hatası:** tek seçenek yazıp gerekçelendirir; sayısız sıfatlarla gereksinim yazar ("ölçeklenebilir,
  sağlam"); geri dönüş planını "gerekirse geri alırız" diye geçer; gereksiz altyapı (Kubernetes, mikroservis)
  önerir; hedef dışı bölümünü boş bırakır.
- **Çıktıda denetleyin:** yukarıdaki denetleyiciyi çalıştırın; sonra kaba hesabın sayılarının gereksinimlerle
  tutup tutmadığına ve önerilen seçeneğin en basit yeterli seçenek olup olmadığına bakın.
- **İkinci tur:** "Önerdiğin seçeneğin en güçlü üç karşı argümanını yaz" deyin; model kendi zayıf noktasını bulur.

## İlgili

- [Tasarım kararı](../00-yontem/tasarim-karari.md) (karar kaydı, iki yönlü/tek yönlü kapı) ·
  [İşi parçalama](../00-yontem/isi-parcalama.md) · [Tahmin ve planlama](../00-yontem/tahmin-ve-planlama.md)
- [Kapasite tahmini](kapasite-tahmini.md) · [Ölçekleme temelleri](olcekleme-temelleri.md) ·
  [Monolit ve servisler](monolit-ve-servisler.md)
- Örnek tasarımlar: [URL kısaltıcı](ornek-url-kisaltici.md), [Bildirim sistemi](ornek-bildirim-sistemi.md),
  [Sohbet uygulaması](ornek-sohbet-uygulamasi.md), [Dosya paylaşımı](ornek-dosya-paylasimi.md),
  [Haber akışı](ornek-haber-akisi.md), [Arama ve öneri](ornek-arama-ve-oneri.md),
  [Randevu sistemi](ornek-randevu-sistemi.md)
- Havuzdaki karar kayıtları: [`uygulama/api/KARARLAR.md`](../../uygulama/api/KARARLAR.md),
  [`uygulama/docs/MEZAR_TASI.md`](../../uygulama/docs/MEZAR_TASI.md) (uygulanmamış tasarım notu örneği)
