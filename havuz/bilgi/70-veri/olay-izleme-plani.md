---
baslik: Olay izleme planı
ozet: Ürün olaylarını tutarlı adlandırma, özellik sözlüğü, kimlik birleştirme ve gizlilik; doldurulmuş izleme planı şablonu, yinelenen ve bağlamı eksik olay hataları.
etiketler: [veri, analitik, olay, izleme-plani, gizlilik, urun]
duzey: orta
guncellik: 2026-11
---

# Olay izleme planı

> Bu notu ne zaman okumalı: uygulamaya ölçüm (analitik) eklemeden önce; yeni bir özellik için "neyi ölçelim?"
> sorulduğunda; panodaki sayılar veritabanıyla tutmadığında ya da olay adları karmakarışık olduğunda.

## Temel fikir

İzleme planı (tracking plan), ürün ile veri arasındaki **sözleşmedir**: hangi olay, tam olarak ne zaman tetiklenir,
hangi özellikleri hangi türde taşır, hangi soruyu yanıtlar, sahibi kim. Önce plan yazılır, sonra kod; kod planın
dışına çıkamaz (bir sarmalayıcı ya da test doğrular).

- **Olay** kullanıcının ya da sistemin yaptığı anlamlı iştir ve geçmiş zamanla adlandırılır: `gorev_tamamlandi`.
  Tıklamayı değil sonucu ölçer.
- **Özellik** (property) olayın bağlamıdır: `liste_turu`, `kaynak`. Adı tutarlı, türü sabit, değerleri kapalı küme.
- **Kimlik:** girişten önce anonim cihaz kimliği, sonra kullanıcı kimliği; ikisini bağlayan olay `giris_yapildi`.
- Yanıtlayacağı soru yazılamayan olay eklenmez. Az ama doğru olay, çok ama kirli olaydan değerlidir.

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Kayıt, ödeme, sipariş gibi gerçek sonuçlar | Sunucuda, işlem veritabanına yazıldıktan sonra tetikle | İstemci olayı engellenir, yeniden denenir, başarısız işlemi de sayar |
| Ekran görüntüleme, form terk etme, dokunma | İstemcide | Yalnız istemci bilir |
| Bir işin denemesi ve sonucu ayrı önemli | İki olay: `odeme_baslatildi`, `odeme_tamamlandi` (+ `odeme_basarisiz {hata_kodu}`) | Huni ve hata oranı ayrı ölçülür |
| Aynı işin çeşitleri (paylaş: bağlantı, e-posta, QR) | Tek olay + özellik: `liste_paylasildi {yontem}` | Olay listesi şişmez; toplam tek sorgu |
| Değeri sınırsız alan (arama metni, ürün adı) | Özelliğe koyma ya da kategoriye indir | Kişisel veri sızar, değer sayısı patlar |
| Kullanıcı niteliği (plan, kayıt tarihi) | Kullanıcı tablosunda; geçmiş değer gerekiyorsa olay anındaki değeri olaya da yaz | Her olayda taşımak ağır; ama plan değişir |
| Çevrimdışı çalışan uygulama | Yerelde kuyruk + toplu gönderim; `olay_id`, cihaz zamanı, varış zamanı | Yeniden gönderim ve geç varış kaçınılmaz |
| Ürün "veriniz cihazda kalır" diyor | Ya hiç gönderme ya açık izinle yalnız toplu sayaç | Olay gönderimi bu sözü bozar |

## Adlandırma kuralları

| Kural | Doğru | Yanlış |
| --- | --- | --- |
| `nesne_eylem`, eylem geçmiş zamanda | `gorev_olusturuldu`, `liste_paylasildi` | `gorevOlustur`, `click_save_button` |
| Küçük harf, ASCII, alt çizgi | `abonelik_baslatildi` | `Abonelik Başlatıldı`, `abonelik-baslatildi` |
| Nesne önce gelir | `odeme_baslatildi`, `odeme_tamamlandi` | `baslatildi_odeme` |
| Birim, adın sonunda | `sure_ms`, `tutar_kurus`, `gecen_sure_saat` | `sure`, `tutar` |
| Değerler kapalı küme, küçük harf | `yontem: kopyala \| paylas` | serbest metin, `"Kopyala"` |
| Mantıksal özellik soru gibi okunur | `ilk_kez: true` | `durum: "evet"` |

Nesne önce gelince aynı nesnenin olayları sıralı listede yan yana durur. Türkçe karakter yok: araçlar, SQL ve
dosya adları ASCII'de güvenlidir; `gorev_tamamlandı` ile `gorev_tamamlandi` iki ayrı olay olur.

## İzleme planı şablonu

Her olayda kendiliğinden bulunan **ortak alanlar** tek sarmalayıcıda (`track()`) eklenir; çağıran kod yazmaz:
`olay_id` (istemcide üretilen benzersiz kimlik), `olay`, `olay_zamani` (cihaz, UTC), `varis_zamani` (sunucu),
`anonim_id`, `kullanici_id` (varsa), `oturum_id`, `platform`, `uygulama_surumu`, `plan_surumu`.

```markdown
| Olay | Ne zaman tetiklenir (tek cümle) | Nerede | Özellikler (ad: tür, değerler) | Yanıtladığı soru | Sahibi | Durum |
| ---- | ------------------------------- | ------ | ------------------------------ | ---------------- | ------ | ----- |
```

Doldurulmuş örnek, çevrimdışı çalışan bir görev listesi uygulaması için:

| Olay | Ne zaman tetiklenir | Nerede | Özellikler | Yanıtladığı soru |
| --- | --- | --- | --- | --- |
| `kayit_tamamlandi` | Hesap sunucuda oluşturulunca | sunucu | `yontem: eposta` | Kayıt hunisi nerede kaybediyor? |
| `giris_yapildi` | Oturum açılınca | sunucu | `yontem: eposta \| baglanti` | Kimlik birleştirme anı |
| `gorev_olusturuldu` | Görev yerelde kaydedilince (çevrimdışı da) | istemci | `liste_turu: kisisel \| paylasimli`, `kaynak: hizli_ekle \| form`, `son_tarih_var: bool` | Çekirdek eylem ne sıklıkta? |
| `gorev_tamamlandi` | Görev "tamamlandı" işaretlenince | istemci | `liste_turu`, `gecen_sure_saat: int` | Kuzey yıldızı ölçütünün girdisi |
| `gorev_silindi` | Silme onaylanınca | istemci | `liste_turu` | Silme sık mı? |
| `silme_geri_alindi` | "Geri al" seçilince | istemci | `gecen_sure_sn: int` | Geri al düğmesi işe yarıyor mu? |
| `liste_paylasildi` | Davet bağlantısı oluşturulunca | sunucu | `yontem: kopyala \| paylas`, `rol: duzenleyen \| izleyici` | Ürün kendiliğinden yayılıyor mu? |
| `davet_kabul_edildi` | Davetli alana katılınca | sunucu | `rol` | Paylaşım dönüşümü |
| `esitleme_basarisiz` | Eşitleme denemesi hata verince | istemci | `hata_kodu` (kapalı küme), `bekleyen_degisiklik: int` | Eşitleme güvenilir mi? |

## Olayı plana göre doğrulamak

Plan bir veri dosyası olursa her olay gönderilmeden (ya da testte) denetlenir. Aşağıdaki denetleyici en sık beş
hatayı yakalar: kurala uymayan ad, plan dışı olay, eksik ortak alan, izinli olmayan değer, kişisel veri.

```python calistir
import re

PLAN = {
    "gorev_olusturuldu": {"liste_turu": {"kisisel", "paylasimli"}, "kaynak": {"hizli_ekle", "form"}},
    "gorev_tamamlandi": {"liste_turu": {"kisisel", "paylasimli"}, "gecen_sure_saat": int},
    "liste_paylasildi": {"yontem": {"kopyala", "paylas"}, "rol": {"duzenleyen", "izleyici"}},
}
ORTAK = {"olay_id", "olay", "olay_zamani", "anonim_id", "platform", "uygulama_surumu"}
KISISEL_ALAN = {"eposta", "telefon", "ad_soyad", "tckn", "adres"}
EPOSTA = re.compile(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", re.I)
AD_KURALI = re.compile(r"[a-z]+(_[a-z]+)+")


def denetle(olay: dict) -> list[str]:
    ad, sorunlar = olay.get("olay", ""), []
    if not AD_KURALI.fullmatch(ad):
        sorunlar.append(f"ad kurala uymuyor: {ad!r}")
    elif ad not in PLAN:
        sorunlar.append(f"planda yok: {ad!r}")
    if eksik := sorted(ORTAK - olay.keys()):
        sorunlar.append(f"ortak alan eksik: {eksik}")
    for alan, deger in olay.items():
        if alan in KISISEL_ALAN or (isinstance(deger, str) and EPOSTA.search(deger)):
            sorunlar.append(f"kişisel veri: {alan}")
    for alan, kural in PLAN.get(ad, {}).items():
        deger = olay.get(alan)
        if isinstance(kural, set) and deger not in kural:
            sorunlar.append(f"{alan}={deger!r} izinli değil")
        if kural is int and not isinstance(deger, int):
            sorunlar.append(f"{alan} tam sayı olmalı: {deger!r}")
    return sorunlar


ortak = {"olay_id": "e1", "olay_zamani": "2026-11-16T09:00:00Z", "anonim_id": "c1",
         "platform": "web", "uygulama_surumu": "1.4.0"}
olaylar = [
    {**ortak, "olay": "gorev_olusturuldu", "liste_turu": "kisisel", "kaynak": "form"},
    {**ortak, "olay": "GorevTamamlandi", "liste_turu": "kisisel", "gecen_sure_saat": 5},
    {**ortak, "olay": "gorev_tamamlandi", "liste_turu": "Kisisel", "gecen_sure_saat": "5"},
    {**ortak, "olay": "liste_paylasildi", "yontem": "kopyala", "rol": "izleyici", "not": "ayse@ornek.com"},
    {k: v for k, v in {**ortak, "olay": "gorev_olusturuldu", "liste_turu": "kisisel",
                       "kaynak": "form"}.items() if k != "uygulama_surumu"},
]
for sira, olay in enumerate(olaylar, start=1):
    print(sira, " | ".join(denetle(olay)) or "geçti")
assert denetle(olaylar[0]) == []
```

```cikti
1 geçti
2 ad kurala uymuyor: 'GorevTamamlandi'
3 liste_turu='Kisisel' izinli değil | gecen_sure_saat tam sayı olmalı: '5'
4 kişisel veri: not
5 ortak alan eksik: ['uygulama_surumu']
```

Bu denetimi iki yere koyun: geliştirmede sarmalayıcı hata fırlatsın (yanlış olay hiç yazılmasın), üretimde
geçersiz olay ayrı bir "karantina" tablosuna gitsin ve sayısı panoda görünsün.

## Kimlik birleştirme

Kimlik birleştirme (identity stitching): kullanıcı önce anonim gezer, sonra giriş yapar; aynı kişi iki cihaz kullanır.
"Kaç kişi?" sorusunun üç yanıtı:

```sql calistir
CREATE TABLE olay (anonim_id TEXT, kullanici_id TEXT, olay TEXT, zaman TEXT);
INSERT INTO olay VALUES
  ('c1', NULL, 'uygulama_acildi', '2026-11-01T08:00:00Z'),
  ('c1', NULL, 'gorev_olusturuldu', '2026-11-01T08:01:00Z'),
  ('c1', 'k1', 'giris_yapildi', '2026-11-01T08:05:00Z'),
  ('c1', 'k1', 'gorev_tamamlandi', '2026-11-01T09:00:00Z'),
  ('c2', 'k1', 'giris_yapildi', '2026-11-02T20:00:00Z'),
  ('c2', 'k1', 'gorev_olusturuldu', '2026-11-02T20:02:00Z'),
  ('c3', NULL, 'uygulama_acildi', '2026-11-03T10:00:00Z'),
  ('c3', 'k2', 'giris_yapildi', '2026-11-03T10:03:00Z'),
  ('c4', NULL, 'uygulama_acildi', '2026-11-04T12:00:00Z');
-- YANLIŞ 1: cihaz sayısı (aynı kişinin iki cihazı iki kişi)
SELECT 'cihaz kimliği', COUNT(DISTINCT anonim_id) FROM olay;
-- YANLIŞ 2: satır satır "varsa kullanıcı, yoksa cihaz" (giriş öncesi satırlar ayrı kişi)
SELECT 'satır bazında', COUNT(DISTINCT COALESCE(kullanici_id, anonim_id)) FROM olay;
-- DOĞRU: eşleme tablosu; yalnız TEK kullanıcıya bağlanan cihazlar birleştirilir
CREATE TABLE kimlik_esleme AS
  SELECT anonim_id, MIN(kullanici_id) AS kullanici_id FROM olay
  WHERE kullanici_id IS NOT NULL GROUP BY anonim_id HAVING COUNT(DISTINCT kullanici_id) = 1;
SELECT 'birleştirilmiş', COUNT(DISTINCT COALESCE(o.kullanici_id, e.kullanici_id, o.anonim_id))
FROM olay o LEFT JOIN kimlik_esleme e USING (anonim_id);
```

```cikti
cihaz kimliği|4
satır bazında|5
birleştirilmiş|3
```

Kurallar: kullanıcı kimliği iç ve anlamsız bir kimliktir (e-posta değil). Paylaşılan cihaz (aile tableti) birden
çok kullanıcıya bağlanır; onun giriş öncesi olayları kimseye yazılmaz. Birleştirme kuralı yazılı olsun: ölçütlerin
paydası buna bağlıdır.

## Yinelenen olay

İki ayrı kaynak vardır. **Yeniden gönderim:** çevrimdışı kuyruk ya da ağ hatası aynı olayı aynı `olay_id` ile iki kez
yollar. **Çift tetikleme:** kod aynı işi iki kez bildirir (ör. efekt yeniden çalışır); `olay_id` farklıdır ama
olaylar saniyenin altında arayla gelir.

```sql calistir
CREATE TABLE ham_olay (olay_id TEXT, kullanici_id TEXT, olay TEXT, gorev_id TEXT, olay_zamani TEXT);
INSERT INTO ham_olay VALUES
  ('a1', 'k1', 'gorev_tamamlandi', 'g1', '2026-11-05T08:00:00Z'),
  ('a1', 'k1', 'gorev_tamamlandi', 'g1', '2026-11-05T08:00:00Z'),
  ('a2', 'k1', 'gorev_tamamlandi', 'g2', '2026-11-05T09:00:00Z'),
  ('a3', 'k1', 'gorev_tamamlandi', 'g2', '2026-11-05T09:00:00.4Z'),
  ('b1', 'k2', 'gorev_tamamlandi', 'g7', '2026-11-05T10:00:00Z');
SELECT 'ham satır', COUNT(*) FROM ham_olay;
SELECT 'olay_id ile tekil', COUNT(DISTINCT olay_id) FROM ham_olay;
-- Çift tetikleme şüphesi: aynı kullanıcı, olay ve görev; 2 saniyeden yakın; farklı olay_id
SELECT 'çift tetikleme', a.gorev_id FROM ham_olay a JOIN ham_olay b
  ON a.kullanici_id = b.kullanici_id AND a.olay = b.olay AND a.gorev_id = b.gorev_id AND a.olay_id < b.olay_id
WHERE abs(julianday(b.olay_zamani) - julianday(a.olay_zamani)) * 86400 < 2;
-- Doğal anahtarı olan olayda en güvenli sayım: tamamlanan görev sayısı
SELECT 'tamamlanan görev', COUNT(DISTINCT gorev_id) FROM ham_olay;
```

```cikti
ham satır|5
olay_id ile tekil|4
çift tetikleme|g2
tamamlanan görev|3
```

`olay_id` istemcide, olay oluşurken üretilmezse yeniden gönderimi ayırmanın güvenilir yolu kalmaz. Çift tetiklemeyi
sorguyla bulup kodda düzeltin; sorguyla gizlemeyin.

## Eksik bağlam ve gizlilik

- **Bağlam sonradan eklenemez.** `uygulama_surumu` yoksa "hata yeni sürümle mi başladı?" yanıtlanamaz; `platform`
  yoksa iOS–Android farkı görünmez. Ortak alanları sarmalayıcı ekler; satıcı SDK'sını doğrudan çağırmak yasaktır.
- **Olaya kişisel veri girmez:** e-posta, telefon, ad, TCKN, adres, serbest metin. Olay verisi geniş paylaşılır,
  dışa aktarılır, yıllarca saklanır. Sayfa adresini yazarken sorgu dizgesini (query string) atın ve yol şablonunu
  yazın: `/liste/:id`. Adreste belirteç ya da e-posta olabilir.
- **Özet (hash) gizlemez.** Elinde e-posta listesi olan herkes aynı SHA-256 özetini hesaplayıp eşleştirir;
  telefon ve doğum tarihi gibi değerler de denenerek geri bulunur ([gizlilik notu](gizlilik-ve-anonimlestirme.md)).
  Takma ad hâlâ kişisel veridir.
- Ham olayların saklama süresi ve izin (rıza) gereksinimi işin başında yazılır. Hukuki görüş yerine geçmez;
  KVKK için [`veri/docs/KVKK_NOTLARI.md`](../../veri/docs/KVKK_NOTLARI.md).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Kayıt olayı sayısı veritabanındaki kullanıcıdan fazla | Olay düğmeye basınca istemcide tetikleniyor; başarısız kayıt da sayılıyor | Sonucu sunucuda, veritabanına yazdıktan sonra tetikleyin |
| Aynı iş iki adla görünüyor (`GorevTamamlandi`, `gorev_tamamlandi`) | Plan ve doğrulama yok | Tek sözlük + sarmalayıcıda doğrulama; eski adları eşleme tablosuyla birleştirin |
| Bir özellik bazen sayı bazen metin (`"149,90"`) | İstemciler farklı biçimliyor | Tür plana yazılır, doğrulanır; para tam sayı kuruş |
| Huni ters: tamamlanan > başlatılan | Bir adım sunucuda, öteki istemcide; istemci olayı kayboluyor | Huninin adımları aynı kaynaktan; kaybı sunucu sayısıyla ölçün |
| Yeni sürümden sonra etkinlik %30 düştü | Davranış değil, tetikleme yeri ya da ad değişti | `plan_surumu` + sürüm geçişinde olay sayılarını karşılaştırın |
| Kullanıcı sayısı olması gerekenin iki katı | Cihaz kimliği sayılıyor | Kimlik eşleme tablosu |
| Olay sayısı yayından sonra ikiye katlandı | Olay efektte tetikleniyor; her yeniden çizimde tekrar | Olayı kullanıcı eyleminin işleyicisinde ya da sunucuda tetikleyin |
| Panoda geliştirici ve test hesapları | İç kullanıcı ayrılmamış | `ic_kullanici` işareti; test ortamı ayrı proje anahtarı |
| Olay özelliklerinde e-posta görünüyor | Tam URL ya da form alanı olduğu gibi yazılmış | Sorgu dizgesini atın; kişisel alan denetimi |
| Olay zamanı 1970 ya da gelecek | Cihaz saati bozuk | Varış zamanını saklayın; farkı büyük olanları işaretleyin |
| Bazı günler olay neredeyse yok | Reklam engelleyici ya da çevrimdışı kuyruk boşaltılamadı | Sunucu sayılarıyla karşılaştırın; kuyruk boyutunu ölçün |

## Denetim listesi

- [ ] Her olayın planda satırı var: tetiklenme anı (tek cümle), yer, özellikler ve türleri, yanıtladığı soru, sahibi.
- [ ] Adlar `nesne_eylem`, küçük harf, ASCII; plan dışı olay gönderilemiyor (sarmalayıcı ya da test).
- [ ] Ortak alanlar (`olay_id`, iki zaman, `anonim_id`, `kullanici_id`, `platform`, `uygulama_surumu`,
      `plan_surumu`) tek sarmalayıcıda ekleniyor.
- [ ] Para, kayıt ve sipariş olayları sunucuda, işlem başarıyla yazıldıktan sonra tetikleniyor.
- [ ] `olay_id` istemcide üretiliyor; analiz sorguları onunla tekilleştiriyor.
- [ ] Kimlik birleştirme kuralı yazılı; paylaşılan cihaz durumu tanımlı.
- [ ] Hiçbir özellikte kişisel veri yok; URL'lerden sorgu dizgesi atılıyor (test var).
- [ ] İç ve test kullanıcıları ayrılabiliyor.
- [ ] Yeni sürüm yayınında olay sayıları önceki sürümle karşılaştırıldı.
- [ ] Ham olay saklama süresi ve izin durumu yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Olayları yalnız `track(ad, ozellikler)` sarmalayıcısıyla gönder. Ad ve özellikler
  `izleme-plani.json` dosyasındaki tanıma uymalı; uymuyorsa geliştirmede hata fırlat. Kayıt ve ödeme olaylarını
  sunucuda, veritabanına yazdıktan sonra tetikle. Özelliklere e-posta, telefon, ad, serbest metin koyma. Yeni olay
  eklersen aynı değişiklikte plana satır ve doğrulama testi ekle."
- **Modelin tipik hatası:** olayı düğmenin tıklamasına koyar (sonuç değil deneme ölçülür); olayı efekt içinde
  tetikler; aynı olayı her dosyada farklı yazar; "kolaylık olsun" diye e-postayı özelliğe ekler; tam URL gönderir;
  `olay_id`'yi sunucuda üretir.
- **Çıktıda denetleyin:** koddaki bütün `track(` çağrılarını listeletip plan tablosuyla karşılaştırın; `eposta`,
  `telefon`, `email`, `phone`, `location.href` aratın; sunucu olaylarının işlem başarısından sonra çağrıldığına bakın.
- **Sorun:** "Bu olay hangi soruyu yanıtlıyor ve o soruyu hangi sorgu yanıtlayacak?" Sorgu yazılamıyorsa olay ya
  gereksizdir ya da özelliği eksiktir.

## İlgili

- [Analitik veri modeli](analitik-veri-modeli.md) — olay tablosu, iki zaman damgası, saat dilimi
- [Ürün ölçütleri](urun-olcutleri.md) — olaylardan ölçüt tanımı
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — huni, tutma, oturumlama sorguları
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — olay tablosuna beklenti yazmak
- [Gizlilik ve anonimleştirme](gizlilik-ve-anonimlestirme.md)
- Efektte tetiklenen işin tekrarı: [React etkileri ve kancaları](../20-web-onyuz/react-etkiler-ve-kancalar.md)
- Huni olaylarıyla örnek günlük: [`veri/ornekler/web_olaylari/`](../../veri/ornekler/web_olaylari/VERI_KARTI.md);
  kişisel veri tarama: [`veri/verihavuzu/kalite/pii.py`](../../veri/verihavuzu/kalite/pii.py)
- Örnek planın uyduğu uygulama (çevrimdışı görev listesi): [`uygulama/`](../../uygulama/README.md)
- [Ölçüm ve öğrenme](../95-urun/olcum-ve-ogrenme.md) — ölçümün ürün kararı tarafı
- [KVKK pratiği](../50-guvenlik/kvkk-pratik.md) — veri envanteri, aydınlatma, rıza
- [Çevrimdışı-önce ve eşitleme](../40-sistem-tasarimi/cevrimdisi-once-ve-esitleme.md) — yerel kuyruk ve saat sorunları
