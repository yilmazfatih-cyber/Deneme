---
baslik: Olay sonrası değerlendirme
ozet: Kesinti ya da veri kaybından sonra suçlamasız değerlendirme; olay sırasında yapılacaklar, şablon (zaman çizelgesi, etki, kök neden, önlemler), iyi önlemin ölçütü ve kısa bir örnek.
etiketler: [olay-yonetimi, postmortem, kok-neden, devops, yontem]
duzey: temel
guncellik: 2026-11
---

# Olay sonrası değerlendirme

> Bu notu ne zaman okumalı: bir kesintiden, veri kaybından ya da güvenlik olayından sonra; kıl payı atlatılmış bir
> sorundan sonra; aynı sorun ikinci kez yaşandığında.

## Temel fikir

Değerlendirmenin amacı suçlu bulmak değil, **aynı türden hatayı olanaksız ya da zararsız kılmaktır.** Suçlanan
insanlar (ve modelle çalışıyorsanız, "model yanlış yaptı" demek) bilgiyi saklar ya da yüzeyde bırakır; bir sonraki
olay daha büyük olur. İnsan ya da model hatası bir **başlangıç noktasıdır**, kök neden değildir: soru "sistem bu
hatanın yapılmasına ve fark edilmemesine neden izin verdi?" sorusudur.

Değerlendirme olaydan sonraki birkaç gün içinde, hafıza tazeyken yazılır; kısadır; olgular saat dilimli zamanlarla,
önlemler sorumlu ve tarihle yazılır. Önlemi olmayan değerlendirme bir hikâyedir.

## Karar tablosu

| Durum                                                         | Yazılır mı                    | Derinlik                                   |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Kullanıcılar etkilendi (kesinti, hata, yavaşlık)              | Evet                          | Tam şablon                                 |
| Veri kayboldu ya da bozuldu                                   | Evet                          | Tam şablon + veri etkisinin dökümü         |
| Güvenlik olayı ya da şüphesi                                  | Evet                          | Tam şablon + hukuki değerlendirme (danışmanlık değildir; bir hukukçuya sorun) |
| Kıl payı atlatıldı (yedek yarım çıktı ama gerek olmadı)       | Evet                          | Kısa: ne olacaktı, neden olmadı, önlem     |
| Aynı sorun ikinci kez                                         | Evet                          | Önceki değerlendirmenin önlemleri neden işlemedi |
| Kullanıcıya yansımayan tek seferlik hata                      | Gerekmez                      | Hata kaydı yeter                           |

## Olay sırasında

1. **Önce kanamayı durdurun:** geri alın, özelliği kapatın, bakım sayfası açın ([Dağıtım](dagitim-stratejileri.md)).
   Kök nedeni aramak sonraya kalır.
2. **Bir kişi yönetir;** her adımı saatiyle (saat dilimiyle) not eder: ne görüldü, ne yapıldı, sonuç.
3. **Kanıtı koruyun:** yeniden başlatmadan önce günlükleri kopyalayın; geri yüklemeden önce bozuk veritabanının
   kopyasını alın.
4. **Kullanıcıya haber verin:** kısa, dürüst, suçlamasız; kesin süre vaat etmeden "bir sonraki bilgi saat 14:00'te".
5. **Bitince** "düzeldi" duyurusu ve 1–3 gün içinde değerlendirme. Hata ayıklama yöntemi:
   [Hata ayıklama](../00-yontem/hata-ayiklama.md).

## Şablon

```markdown
# Olay: <tek cümle> (YYYY-AA-GG)

Durum: taslak | gözden geçirildi · Yazan: <rol> · Katılanlar: <roller>

## Özet
Üç cümle: ne oldu, kimi ne kadar etkiledi, nasıl düzeldi.

## Etki
- Kim, kaç kişi, ne kadar süre (sayılarla).
- Veri kaybı ya da sızıntı var mı; hangi veri, hangi aralık.
- Yasal bildirim gerekiyor mu: hukukçuya soruldu mu?

## Zaman çizelgesi (saat dilimiyle)
| Saat | Olay |
| ---- | ---- |
| …    | ilk belirti / başlangıç |
| …    | fark edildi (nasıl?) |
| …    | ilk müdahale |
| …    | düzeldi |

## Kök neden ve katkıda bulunan etkenler
"Neden?" sorusunu, değiştirilebilir bir sistem özelliğine varana dek sorun (çoğu zaman 3–5 kez).

## Ne iyi gitti · ne kötü gitti · nerede şanslıydık

## Önlemler
| Önlem | Tür (önle / erken fark et / etkiyi azalt / kurtar) | Sorumlu | Tarih | Durum |
| ----- | -------------------------------------------------- | ------- | ----- | ----- |

## Öğrenilenler
```

## Suçlamasız dil

| Suçlayıcı                                     | Suçlamasız (sisteme bakan)                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| "Yedeği almayı unuttu."                       | "Yedek elle alınıyordu; zamanlama ve tazelik uyarısı yoktu."                      |
| "Model yanlış yolu yazdı."                    | "Ayar kalıcı disk dışındaki bir yola izin veriyordu; bunu yakalayan denetim yoktu." |
| "Üretimde komutu dikkatsizce çalıştırdı."     | "Komut ortamı sormadan üretim veritabanında çalışabiliyordu."                     |
| "Daha dikkatli olmalıyız."                    | (Önlem değildir; yerine somut bir denetim, uyarı ya da kısıt yazın.)               |

## İyi önlemin ölçütü

| Tür              | Ne yapar                                   | Örnek                                                             |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Önle             | Hatayı olanaksız kılar                     | Üretimde kalıcı kök dışındaki `DATABASE_PATH` ile açılmayı reddetmek |
| Erken fark et    | Hatayı dakikalar içinde görünür kılar      | "Kayıtlı kullanıcı sayısı birden düştü" uyarısı                   |
| Etkiyi azalt     | Zararı küçültür                            | Saatlik yedek (kayıp penceresini daraltır)                        |
| Kurtar           | Dönüşü hızlandırır                         | Aylık geri yükleme tatbikatı, yazılı geri yükleme adımları        |

İyi önlem **somut**, **doğrulanabilir**, **sahipli** ve **tarihli**dir. "İzlemeyi iyileştirmek" önlem değildir;
"en yeni yedek 26 saatten eskiyse telefona uyarı; sorumlu: proje sahibi; 30 Kasım" önlemdir. Önlemlerin durumu bir
sonraki ay gözden geçirilir; kapanmayan önlem bir sonraki olayın kök nedenidir.

## Kısa örnek

**Olay: Yeniden başlatmada kullanıcı verisi silindi (2026-11-03)** — Durum: gözden geçirildi · Yazan: proje sahibi

**Özet.** Uygulama kalıcı diski olmayan bir planda çalışıyordu. Platform bakımı için servis yeniden başlatılınca
SQLite dosyası silindi. 2 Kasım gecesinin yedeği geri yüklendi; yedekten sonraki kayıtlar kurtarılamadı.

**Etki.** 12 kullanıcı 9 sa 20 dk boyunca giriş yapamadı. Kalıcı kayıp: 2 Kasım 03:17 ile 3 Kasım 02:10 arasındaki
kayıtlar (yaklaşık 40 görev). Veri dışarı sızmadı; bildirim yükümlülüğü hukukçuya soruldu.

**Zaman çizelgesi (TSİ).** 02:10 servis yeniden başladı, boş veritabanı açıldı · 08:40 bir kullanıcı "hesabım yok"
diye yazdı · 09:05 kayıt kapatıldı, kullanıcılara not düşüldü · 11:30 kalıcı disk eklendi, yedek geri yüklendi.

**Kök neden zinciri.** Veriler neden silindi? → Yeniden başlatma kapsayıcının dosya sistemini sıfırladı. → Neden
veritabanı oradaydı? → `DATABASE_PATH` varsayılan `.data/` yolundaydı; plan kalıcı disk içermiyordu. → Neden yayından
önce görülmedi? → İlk yayın listesinde "yeniden başlatma testi" yoktu. → Neden 6,5 saat sonra fark edildi? → Sağlık
ucu boş veritabanında da "ok" dönüyordu (açılışta migrasyonlar tabloları yeniden kurmuştu); veri kaybını gösteren bir
iş ölçütü uyarısı yoktu.

**İyi giden:** yedek sunucu dışındaydı ve geri yükleme adımları yazılıydı. **Kötü giden:** yeniden başlatma testi
yapılmamıştı. **Şans:** yedek betiği bir hafta önce kurulmuştu.

| Önlem                                                                 | Tür           | Sorumlu       | Tarih      | Durum  |
| --------------------------------------------------------------------- | ------------- | ------------- | ---------- | ------ |
| Kalıcı disk, `DATABASE_PATH=/data/uygulama.db`                        | önle          | proje sahibi  | 2026-11-03 | bitti  |
| Üretimde kalıcı kök dışındaki yolla açılmayı reddet ([Yayın yolu](yayin-yolu-secimi.md)) | önle | proje sahibi | 2026-11-10 | açık |
| İlk yayın listesine yeniden başlatma testi                            | önle          | proje sahibi  | 2026-11-05 | bitti  |
| "Kullanıcı sayısı birden düştü" uyarısı                               | erken fark et | proje sahibi  | 2026-11-17 | açık   |
| Ayda bir geri yükleme tatbikatı                                        | kurtar        | proje sahibi  | her ay     | açık   |

**Öğrenilen.** Kalıcı diski olmayan plan + SQLite bir gösterim düzenidir, üretim değildir.

Zaman çizelgesinden ölçütler ve hedefle karşılaştırma:

```python calistir
from datetime import datetime, timedelta

cizelge = [  # (zaman, olay): her satırda saat dilimi
    ("2026-11-03T02:10+03:00", "başlangıç"),  # platform bakımı: servis yeniden başlatıldı, veritabanı silindi
    ("2026-11-03T08:40+03:00", "fark edildi"),  # kullanıcı e-postası: "hesabım yok"
    ("2026-11-03T09:05+03:00", "müdahale"),  # kayıt kapatıldı, kullanıcılara not düşüldü
    ("2026-11-03T11:30+03:00", "düzeldi"),  # kalıcı disk eklendi, yedek geri yüklendi
]
an = {olay: datetime.fromisoformat(zaman) for zaman, olay in cizelge}
assert all(t.tzinfo is not None for t in an.values()), "her saatte saat dilimi olmalı"
assert list(an.values()) == sorted(an.values()), "çizelge zamana göre sıralı olmalı"


def sure(fark: timedelta) -> str:
    dakika = int(fark.total_seconds() // 60)
    return f"{dakika // 60} sa {dakika % 60} dk"


etki = an["düzeldi"] - an["başlangıç"]
print(f"fark etme: {sure(an['fark edildi'] - an['başlangıç'])} · düzeltme: {sure(an['düzeldi'] - an['fark edildi'])}"
      f" · toplam etki: {sure(etki)}")
pay_dk = 30 * 24 * 60 * (1 - 0.999)  # %99,9 hedefinin 30 günlük kesinti payı
kat = etki.total_seconds() / 60 / pay_dk
pay_metin = f"{pay_dk:.1f}".replace(".", ",")  # Türkçe ondalık virgül
print(f"%99,9 hedefi ayda {pay_metin} dk kesinti payı verir; bu olay payın {kat:.0f} katı")
```

```cikti
fark etme: 6 sa 30 dk · düzeltme: 2 sa 50 dk · toplam etki: 9 sa 20 dk
%99,9 hedefi ayda 43,2 dk kesinti payı verir; bu olay payın 13 katı
```

Fark etme süresi düzeltme süresinden uzunsa önce **izlemeye** yatırım yapın ([İzleme ve uyarı](izleme-ve-uyari.md)).

## Tuzaklar

| Belirti                                                          | Neden                                                       | Çözüm                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Değerlendirme "X yanlış yaptı" ile bitiyor                       | Kök neden insanda bırakıldı                                 | "Sistem neden izin verdi, neden fark etmedi?" diye sürdürün        |
| Önlemler "dikkatli olunacak", "izleme iyileştirilecek"           | Somut değil, doğrulanamaz                                   | Somut denetim/uyarı/kısıt; sorumlu ve tarih                        |
| Aynı olay üç ay sonra yeniden                                    | Önlemler yazıldı ama kapanmadı                              | Aylık önlem gözden geçirmesi                                       |
| Zaman çizelgesi tutarsız, saatler karışık                        | Saat dilimi yazılmamış; sunucu UTC, insanlar TSİ            | Her saatte saat dilimi; tek dilimde yazın                          |
| Olay sırasında herkes aynı anda bir şey deniyor                  | Yöneten kişi yok                                            | Bir kişi yönetir ve not tutar                                      |
| Kök neden bulunamıyor: günlükler gitmiş                          | Yeniden başlatma kanıtı sildi                               | Önce kanıtı kopyalayın, sonra müdahale edin                        |
| Değerlendirme haftalar sonra yazıldı, ayrıntılar unutuldu        | Erteleme                                                    | 1–3 gün içinde; olay sırasında tutulan notlarla                    |
| Kıl payı olaylar hiç yazılmıyor                                  | "Bir şey olmadı" düşüncesi                                  | Kıl payını da kısa şablonla yazın: ucuz ders                        |
| Değerlendirmede kişisel veri ve sır var                          | Günlük parçaları olduğu gibi yapıştırıldı                   | Kimlikleri ve sırları maskeleyin                                   |

## Denetim listesi

- [ ] Özet üç cümle; etki sayılarla (kim, kaç, ne kadar süre, hangi veri).
- [ ] Zaman çizelgesindeki her satırda saat dilimi; başlangıç, fark etme, müdahale ve düzelme anları var.
- [ ] Kök neden zinciri değiştirilebilir bir sistem özelliğinde bitiyor; "insan/model hatası" son halka değil.
- [ ] Her önlem somut, doğrulanabilir, sahipli ve tarihli; türü yazılı.
- [ ] En az bir "erken fark et" önlemi var (fark etme süresi uzunsa).
- [ ] Değerlendirme suçlamasız dille yazılmış; kişisel veri ve sır maskeli.
- [ ] Önlemlerin durumu bir sonraki ay gözden geçirildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu notlardan ve günlük parçalarından şablona göre olay değerlendirmesi yaz. Suçlamasız dil kullan;
  kök neden zincirini değiştirilebilir bir sistem özelliğine varana dek sürdür. Önlemleri tablo yap: tür, sorumlu,
  tarih. Bilmediğin saati ya da sayıyı uydurma; 'bilinmiyor' yaz."
- **Modelin tipik hatası:** eksik saatleri ve etki sayılarını uydurmak; kök nedeni "insan hatası" diye bırakmak;
  "daha dikkatli olunacak" türü önlemler; bir olaya beş ayrı kök neden yazıp hiçbirini önleme bağlamamak.
- **Çıktıda denetleyin:** zaman çizelgesindeki her saatin kaynağı (günlük, e-posta) var mı; her önlemin sahibi ve
  tarihi var mı; "dikkat", "özen", "iyileştir" sözcükleri önlem sütununda geçiyor mu.

## İlgili

- [İzleme ve uyarı](izleme-ve-uyari.md) — fark etme süresini kısaltmak
- [Dağıtım stratejileri](dagitim-stratejileri.md) — geri alma
- [Veritabanı yedekleme](veritabani-yedekleme.md) — kurtarma ve tatbikat
- [Olay müdahalesi](../50-guvenlik/olay-mudahalesi.md) — güvenlik olayında ilk saat, kanıt, bildirim
- [Güvenilirlik düşüncesi](../00-yontem/guvenilirlik-dusuncesi.md) · [Hata ayıklama](../00-yontem/hata-ayiklama.md) ·
  [Teknik yazı](../00-yontem/teknik-yazi.md)
- Çalışan karşılık: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Bir şey ters giderse"
