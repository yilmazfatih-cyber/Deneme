---
baslik: "Örnek tasarım: bildirim sistemi"
ozet: Uygulama içi, e-posta ve anlık bildirim sisteminin kaba hesabı, tek sunuculu tasarımı (giden kutusu, planlayıcı, kanal işçileri), tercih, sessiz saat, özet, yineleme önleme ve büyüyünce değişenler.
etiketler: [ornek-tasarim, bildirim, kuyruk, eposta, anlik-bildirim]
duzey: orta
guncellik: 2026-11
---

# Örnek tasarım: bildirim sistemi

> Bu notu ne zaman okumalı: uygulamaya "yorum geldi", "görev atandı", "şifre değişti" gibi bildirimler
> eklenirken; toplu duyuru gönderilecekken; kullanıcılar aynı bildirimi iki kez aldığını ya da gece 03:00'te
> uyandırıldığını söylediğinde.

## Temel fikir

- Bildirim, bir **olayın** (yorum yazıldı) **kişiye, kanala ve zamana** göre işlenmiş hâlidir. Olayı üreten kod
  bildirimin nasıl gideceğini bilmez; yalnız olayı kaydeder.
- Akış dört adımdır: olay (giden kutusu) → **planlayıcı** (kime, hangi kanaldan, ne zaman; tercih, sessiz saat,
  özetleme, yineleme) → **kanal işçisi** (sağlayıcı çağrısı, yeniden deneme, hız sınırı) → **teslim kaydı**.
- Teslim en az bir kezdir; kullanıcı aynı bildirimi iki kez görmemelidir: yineleme ayıklama planlayıcıda ve
  sağlayıcı çağrısında (idempotentlik anahtarı) yapılır ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)).
- Güvenlik bildirimleri (yeni cihazdan giriş, şifre değişti) tercihe ve sessiz saate takılmaz.

## Gereksinimler

| Tür              | Gereksinim                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------ |
| İşlevsel         | Kanallar: uygulama içi kutu, e-posta, anlık bildirim (push); SMS hedef dışı (pahalı)        |
| İşlevsel         | Kullanıcı tür × kanal tercihini seçer; pazarlama varsayılan kapalı                          |
| İşlevsel         | Sessiz saatler 22:00–08:00 Türkiye saati; ertelenen bildirimler sabah özet olarak gider     |
| İşlevsel         | Toplu duyuru: 50 bin kullanıcıya                                                            |
| İşlevsel olmayan | Olaydan bildirime p95 < 1 dk (sessiz saat dışında); aynı bildirim iki kez gitmez           |
| İşlevsel olmayan | Sağlayıcı kesintisinde bildirim kaybolmaz, gecikir                                          |

## Kaba hesap

```python calistir
alici = 50_000  # duyuru herkese
saglayici_sinir = {"eposta": 50, "push": 500}  # sağlayıcının saniyelik gönderim sınırı: VARSAYIM, sözleşmenize bakın
for kanal, sinir in saglayici_sinir.items():
    print(f"{kanal:6}: {alici} alıcı, saniyede en çok {sinir} → kuyruğun boşalması {alici / sinir / 60:4.1f} dk")

# Push'u herkese aynı anda göndermek, açılışlarda sivri tepe yaratır (bkz. kapasite-tahmini).
acan_orani, ilk_dakika_payi, acilis_istegi = 0.25, 0.5, 10
hepsi_birden = alici * acan_orani * ilk_dakika_payi * acilis_istegi / 60
yayarak = alici / 20 * acan_orani * acilis_istegi / 60  # 20 dakikaya yayılmış gönderim
print(f"açılış tepesi: hepsi birden ~{hepsi_birden:.0f} istek/sn, 20 dk'ya yayınca ~{yayarak:.0f} istek/sn")
assert hepsi_birden > 8 * yayarak
```

```cikti
eposta: 50000 alıcı, saniyede en çok 50 → kuyruğun boşalması 16.7 dk
push  : 50000 alıcı, saniyede en çok 500 → kuyruğun boşalması  1.7 dk
açılış tepesi: hepsi birden ~1042 istek/sn, 20 dk'ya yayınca ~104 istek/sn
```

İki sonuç: (1) toplu e-posta dakikalar sürer; kullanıcıya dönük işlemsel e-postalar (şifre sıfırlama) toplu
duyurunun **arkasında beklememeli**: ayrı kuyruk ya da öncelik. (2) Anlık bildirimi bir anda herkese göndermek
kendi sunucunuza saldırmaktır; gönderimi dakikalara yayın ([Kapasite tahmini](kapasite-tahmini.md)).

## İlk tasarım: tek sunucu

```text
iş kodu ──(aynı işlem)──► olay tablosu (giden kutusu)
                              │
                     planlayıcı işçisi: tercih · sessiz saat · özet · yineleme
                              │
            ┌─────────────────┼──────────────────┐
     uygulama içi kutu   e-posta kuyruğu      push kuyruğu      (tablo tabanlı kuyruklar)
     (tablo, okunmadı)   └ e-posta işçisi     └ push işçisi ──► sağlayıcı (idempotentlik anahtarı, hız sınırı)
                                     └───────────┴──► teslim kaydı (gönderildi / başarısız / geri döndü)
```

Tablolar: `bildirim_olayi` (giden kutusu), `bildirim_tercihi (kullanici, tur, kanal)`, `bildirim` (uygulama içi
kutu: kullanıcı, tür, nesne, okundu), `teslim (bildirim_id, kanal, durum, deneme, saglayici_id)` ve
`UNIQUE (olay_id, kullanici, kanal)` — aynı olay aynı kişiye aynı kanaldan iki kez planlanamaz.

**Planlayıcının kuralları**, çalışır hâlde:

```python calistir
from collections import Counter
from datetime import datetime, timedelta, timezone

TR = timezone(timedelta(hours=3))  # Türkiye 2016'dan beri sabit UTC+3; gerçek kodda tz veritabanı ("Europe/Istanbul")
UTC = timezone.utc
TERCIH = {"ayse": {"yorum": {"push", "uygulama"}, "pazarlama": set()}}  # kullanıcı tercihleri
ACIL = {"guvenlik"}  # tercih ve sessiz saatten bağımsız; her kanaldan


def gonderim_ani(an: datetime, tur: str) -> datetime:
    yerel = an.astimezone(TR)
    if tur in ACIL or 8 <= yerel.hour < 22:
        return yerel
    sabah = yerel.replace(hour=8, minute=0, second=0, microsecond=0)  # sessiz saat: 22:00–08:00
    return sabah + timedelta(days=1) if yerel.hour >= 22 else sabah


def planla(olaylar: list[tuple[str, str, str, datetime]], gorulen: set[str]) -> Counter:
    plan: Counter = Counter()
    for olay_id, kullanici, tur, an in olaylar:
        if olay_id in gorulen:
            continue  # aynı olay ikinci kez teslim edildi (en az bir kez): yineleme yok
        gorulen.add(olay_id)
        kanallar = {"eposta", "push", "uygulama"} if tur in ACIL else TERCIH[kullanici].get(tur, set())
        for kanal in kanallar:  # aynı ana düşen aynı türden bildirimler tek özette birleşir
            plan[(kullanici, kanal, tur, gonderim_ani(an, tur).strftime("%d.%m %H:%M"))] += 1
    return plan


olaylar = [
    ("o1", "ayse", "yorum", datetime(2026, 11, 16, 17, 15, tzinfo=UTC)),  # 20:15 TR → hemen
    ("o1", "ayse", "yorum", datetime(2026, 11, 16, 17, 15, tzinfo=UTC)),  # aynı olay yeniden geldi
    ("o2", "ayse", "yorum", datetime(2026, 11, 16, 20, 10, tzinfo=UTC)),  # 23:10 TR → sabah 08:00
    ("o3", "ayse", "yorum", datetime(2026, 11, 16, 20, 40, tzinfo=UTC)),  # 23:40 TR → sabaha, özete
    ("o4", "ayse", "guvenlik", datetime(2026, 11, 17, 0, 5, tzinfo=UTC)),  # 03:05 TR, yeni cihazdan giriş → hemen
    ("o5", "ayse", "pazarlama", datetime(2026, 11, 16, 9, 0, tzinfo=UTC)),  # kullanıcı kapatmış → hiç
]
plan = planla(olaylar, set())
for (kullanici, kanal, tur, an), adet in sorted(plan.items(), key=lambda p: (p[0][3], p[0][1])):
    print(f"{an} {kanal:8} {tur:9} ×{adet}")
assert plan[("ayse", "push", "yorum", "17.11 08:00")] == 2 and len(plan) == 7
```

```cikti
16.11 20:15 push     yorum     ×1
16.11 20:15 uygulama yorum     ×1
17.11 03:05 eposta   guvenlik  ×1
17.11 03:05 push     guvenlik  ×1
17.11 03:05 uygulama guvenlik  ×1
17.11 08:00 push     yorum     ×2
17.11 08:00 uygulama yorum     ×2
```

Ayrıntılar:

- **Saat dilimi:** sessiz saat kullanıcının yerel saatine göre hesaplanır; sunucunun saati (çoğunlukla UTC) 3 saat
  kaydırır. Saklama UTC, karar yerel saatle ([Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md),
  [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py)).
- **Özet** (digest): aynı türden çok bildirim tek bildirimde birleşir ("3 yeni yorum"); bildirim yorgunluğu
  kullanıcıyı bildirimleri tümden kapatmaya iter.
- **Kanal işçisi:** sağlayıcıya `teslim.id`'yi idempotentlik anahtarı olarak verir; geçici hatada titremeli geri
  çekilmeyle dener, kalıcı hatada (geçersiz adres) durur ([Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)).
- **Geri bildirim döngüsü:** e-posta geri dönmesi (bounce) ve şikâyeti, push için geçersiz cihaz belirteci
  sağlayıcıdan gelir (webhook); adres/belirteç **bastırma listesine** alınır, yoksa gönderici itibarı düşer
  ([E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md), [Webhooklar](../30-arkauc/webhooklar.md)).
- **Uygulama içi kutu** tablodur; "okunmadı" sayacı `okunmadi_sayisi` önbelleğiyle değil sorguyla başlar.
- İşlemsel e-posta (şifre sıfırlama) ve toplu duyuru **ayrı kuyruk**ta; biri ötekini bekletmez.

## Büyüyünce ne değişir

| Eşik                                             | Değişiklik                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Duyurular dakikalarca kuyruğu tıkıyor            | Toplu gönderim için ayrı kuyruk ve işçi; parça parça (1000'lik) üretim |
| Tek sağlayıcı kesintisi bildirimleri durduruyor  | İkinci sağlayıcıya yük devri (devre kesiciyle)                        |
| Çok kiracılı ürün                                | Kiracı başına hız ve maliyet sınırı, adil kuyruk ([Çok kiracılık](cok-kiracilik.md)) |
| Bildirim analitiği (açılma, tıklama)             | Teslim olaylarını analitik deposuna akıt; asıl yolu yavaşlatma        |
| Gerçek zamanlı uygulama içi bildirim             | Kutuya yazınca dürt (SSE), istemci çeker ([Gerçek zamanlı](../30-arkauc/gercek-zamanli.md)) |

## Tuzaklar

| Belirti                                                     | Neden                                                     | Çözüm                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Aynı bildirim iki kez geldi                                 | En az bir kez teslim, yineleme ayıklama yok               | `UNIQUE (olay, kullanıcı, kanal)` + sağlayıcıya anahtar     |
| Kullanıcı gece 01:00'de uyandı                              | Sessiz saat sunucu saatiyle (UTC) hesaplandı              | Kullanıcının yerel saat dilimiyle                           |
| Şifre sıfırlama e-postası 20 dk gecikti                     | Toplu duyurunun arkasında bekledi                         | İşlemsel ve toplu ayrı kuyruk/öncelik                       |
| Duyuru gönderilince site çöktü                              | Herkese aynı anda push, açılış tepesi                     | Gönderimi dakikalara yay                                    |
| E-postalar spama düşmeye başladı                            | Geri dönen adreslere göndermeye devam                     | Bastırma listesi; geri dönme/şikâyet webhook'u              |
| Kullanıcılar bildirimleri tamamen kapattı                   | Her olay ayrı bildirim                                    | Özet, tür başına tercih, akıllı varsayılan                   |
| Sipariş kaydedildi ama bildirimi hiç gitmedi                | Olay işlemden sonra ayrı yazıldı, arada çöktü             | Olay, iş kaydıyla aynı işlemde (giden kutusu)               |
| Güvenlik bildirimi kullanıcı tercihi yüzünden gitmedi       | Acil türler tercihe tabi tutuldu                          | Acil türler listesi tercihi ve sessiz saati atlar           |

## Denetim listesi

- [ ] Olay, iş kaydıyla aynı işlemde yazılıyor; bildirim mantığı iş kodunda değil planlayıcıda.
- [ ] Tercih tür × kanal düzeyinde; pazarlama varsayılan kapalı; acil türler listesi var.
- [ ] Sessiz saat kullanıcının saat dilimiyle; ertelenenler özetleniyor.
- [ ] `UNIQUE (olay, kullanıcı, kanal)` ve sağlayıcıya idempotentlik anahtarı var.
- [ ] İşlemsel ve toplu gönderim ayrı kuyruklarda; toplu gönderim yayılıyor.
- [ ] Geri dönen adres ve geçersiz cihaz belirteci bastırılıyor.
- [ ] Kuyruk derinliği, teslim hata oranı ve olaydan bildirime gecikme panoda.

## Küçük modele yaptırırken

- **İsteme yazın:** "İş kodu yalnız `bildirim_olayi` tablosuna, iş kaydıyla aynı işlemde yazsın. Planlayıcı
  tercih, sessiz saat (Europe/Istanbul) ve özet kurallarını uygular; teslim tablosunda `UNIQUE (olay_id,
  kullanici_id, kanal)` olsun. Sağlayıcı çağrısına teslim kimliğini idempotentlik anahtarı olarak ver."
- **Modelin tipik hatası:** e-postayı iş kodunun içinde, işlem bitmeden gönderir; sessiz saati `datetime.now()`
  (sunucu saati) ile hesaplar; yeniden denemede aynı bildirimi yeniden oluşturur; toplu duyuruyu tek döngüde
  gönderir.
- **Çıktıda arayın:** iş servislerinde doğrudan `sendMail`/`push` çağrısı; saat dilimsiz `now()`; teslim
  tablosunda benzersizlik kısıtı; toplu gönderimde parça ve hız sınırı.

## İlgili

- [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) · [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) ·
  [Kapasite tahmini](kapasite-tahmini.md)
- [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) (teslim edilebilirlik, şablon, abonelikten çıkma) ·
  [Arka plan işleri](../30-arkauc/arka-plan-isleri.md)
- Havuzda e-posta bağdaştırıcısı: [`uygulama/api/src/mail/mailer.ts`](../../uygulama/api/src/mail/mailer.ts)
