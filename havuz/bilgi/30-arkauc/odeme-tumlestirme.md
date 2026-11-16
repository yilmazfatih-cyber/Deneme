---
baslik: Ödeme tümleştirme: sağlayıcıdan bağımsız kavramlar ve tuzaklar
ozet: Ödemeyi durum makinesiyle izlemek, kart verisine dokunmamak, sonucu yönlendirme yerine webhook ile kesinleştirmek, idempotentlik, kuruş tamsayı tutar, iade ve itiraz, abonelik yaşam döngüsü, sınama ortamı ve mutabakat.
etiketler: [odeme, webhook, idempotentlik, para, durum-makinesi]
duzey: ileri
guncellik: 2026-11
---

# Ödeme tümleştirme: sağlayıcıdan bağımsız kavramlar ve tuzaklar

> Bu notu ne zaman okumalı: bir ödeme sağlayıcısı (kart, havale, cüzdan) bağlanırken, abonelik eklenirken, "müşteri
> ödedi ama sipariş görünmüyor", "iki kez çekildi" ya da "ödemeden sipariş geçti" bildirimlerinde. Sağlayıcıya özgü
> çağrı adları burada yoktur; onları kendi belgesinden alın.

Bu not finans, vergi ya da hukuk danışmanlığı değildir; yükümlülükleri (fatura, KDV, tüketici hakları) bir
uzmanla doğrulayın.

## Temel fikir

Ödemede dört gerçek her şeyi belirler:

1. **Kart verisine dokunmazsınız.** Kart numarası sağlayıcının sayfasına ya da gömülü alanına girilir; sizin
   sunucunuz yalnız bir **ödeme kimliği** görür. Kart verisi sunucunuzdan geçerse (günlüğe yanlışlıkla düşmesi
   dahil) ağır bir uyum (PCI DSS) yükü doğar.
2. **Ödemenin sonucu tarayıcıdan gelmez.** "Başarılı" sayfasına yönlendirme taklit edilebilir, kapanabilir, hiç
   gelmeyebilir. Gerçek, sağlayıcının sunucudan sunucuya bildirimi (webhook) ya da sağlayıcı API'sine sorgudur.
3. **Her adım yinelenir.** Kullanıcı çift tıklar, istemci yeniden dener, sağlayıcı aynı olayı birkaç kez ve
   sırasız gönderir. Her işlem idempotent, her durum geçişi koşullu olmalı.
4. **Para tamsayıdır:** kuruş cinsinden tamsayı + para birimi. Kayan noktalı sayı yok.

## Karar tablosu

| Soru                                         | Doğru seçim                                                      | Neden                                              |
| -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Kart bilgisi nerede alınır?                  | Sağlayıcının barındırdığı sayfa ya da gömülü alanı               | Kart verisi sunucunuza hiç gelmez                  |
| Sipariş ne zaman "ödendi" olur?              | Doğrulanmış webhook (ya da sağlayıcıya sorgu) gelince            | Yönlendirme sahte/kayıp olabilir                   |
| Tutarı kim hesaplar?                         | Sunucu, veritabanındaki fiyatlardan                              | İstemcinin gönderdiği fiyat değiştirilebilir       |
| Tutar nasıl saklanır?                        | Kuruş tamsayı + para birimi kodu                                 | Yuvarlama hatası olmaz                             |
| Ödeme başlatma nasıl tekrarlanır?            | Sipariş denemesi başına idempotentlik anahtarıyla                | Çift çekim olmaz                                   |
| Olaylar nasıl uygulanır?                     | Durum makinesi + koşullu güncelleme + olay kimliğiyle yineleme ayıklama | Sırasız ve yinelenen olaya dayanıklı        |
| Kayıt doğru mu?                              | Günlük mutabakat                                                 | Kaybolan webhook ve hatalar yakalanır              |

## Ödeme akışı ve durum makinesi

```text
olusturuldu ──► dogrulama_bekliyor (3D Secure vb.) ──► isleniyor ──► basarili ──► iade_edildi / kismi_iade
     │                    │                               │              └──► itiraz ──► kazanildi / kaybedildi
     └────────────────────┴───────────────────────────────┴──► basarisiz / iptal
```

1. Sunucu siparişi ve tutarı veritabanından kurar, sağlayıcıda ödeme oturumu açar (**idempotentlik anahtarıyla**),
   kendi tablosuna `olusturuldu` yazar.
2. Kullanıcı sağlayıcının sayfasında öder (gerekirse banka doğrulaması).
3. Kullanıcı sitenize döner: sayfa "ödemeniz işleniyor" der ve durumu sunucudan yoklar ya da anlık bildirim bekler
   ([Gerçek zamanlı](gercek-zamanli.md)). **Bu dönüş hiçbir şeyi kesinleştirmez.**
4. Sağlayıcı webhook gönderir: imza doğrulanır, olay kimliğiyle yinelenme ayıklanır, durum **yalnız izin verilen
   bir önceki durumdan** ilerletilir; `basarili` geçişi siparişi bir kez tamamlar.

Olaylar sırasız gelebilir: `basarili`'dan sonra eski bir `isleniyor` gelirse durum geri gitmemelidir.

```python calistir
import sqlite3

# Hangi duruma hangi durumlardan gelinebilir: TEK tablo. Burada olmayan geçiş yok sayılır.
GECISLER = {
    "dogrulama_bekliyor": {"olusturuldu"},  # 3D Secure gibi kullanıcı adımı
    "isleniyor": {"olusturuldu", "dogrulama_bekliyor"},
    "basarili": {"olusturuldu", "dogrulama_bekliyor", "isleniyor"},
    "basarisiz": {"olusturuldu", "dogrulama_bekliyor", "isleniyor"},
    "iade_edildi": {"basarili"},
}
db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE odeme (id TEXT PRIMARY KEY, siparis TEXT NOT NULL, tutar_kurus INTEGER NOT NULL, durum TEXT NOT NULL);
CREATE TABLE islenen_olay (olay_id TEXT PRIMARY KEY);
CREATE TABLE kargo (siparis TEXT PRIMARY KEY);  -- teslimat bir kez başlamalı
INSERT INTO odeme VALUES ('od_1', 'sip_42', 15000, 'olusturuldu');
""")


def _uygula(olay_id: str, odeme_id: str, yeni: str) -> str:
    if db.execute("INSERT OR IGNORE INTO islenen_olay VALUES (?)", (olay_id,)).rowcount == 0:
        return "yinelenen olay"  # sağlayıcı aynı olayı yeniden gönderdi
    kaynaklar = sorted(GECISLER.get(yeni, ()))
    yer = ",".join("?" * len(kaynaklar))
    sql = f"UPDATE odeme SET durum = ? WHERE id = ? AND durum IN ({yer})"
    if db.execute(sql, (yeni, odeme_id, *kaynaklar)).rowcount == 0:
        return "geçersiz ya da geç kalmış geçiş"  # ör. 'basarili'dan sonra gelen eski 'isleniyor'
    if yeni == "basarili":  # geçiş bir kez olur → kargo bir kez başlar
        siparis = db.execute("SELECT siparis FROM odeme WHERE id = ?", (odeme_id,)).fetchone()[0]
        db.execute("INSERT INTO kargo VALUES (?)", (siparis,))
    return "uygulandı"


def webhook(olay_id: str, odeme_id: str, yeni: str) -> str:
    db.execute("BEGIN IMMEDIATE")
    try:
        sonuc = _uygula(olay_id, odeme_id, yeni)
    except BaseException:
        db.execute("ROLLBACK")  # olay "işlendi" sayılmasın; sağlayıcı yeniden gönderir
        raise
    db.execute("COMMIT")
    return sonuc


sonuclar = [
    webhook("ev_2", "od_1", "basarili"),  # olaylar SIRASIZ gelebilir: önce sonuç
    webhook("ev_1", "od_1", "isleniyor"),  # sonra eski ara durum
    webhook("ev_2", "od_1", "basarili"),  # aynı olay yeniden
    webhook("ev_3", "od_1", "basarisiz"),  # başarılıdan başarısıza dönülmez
]
assert sonuclar == [
    "uygulandı",
    "geçersiz ya da geç kalmış geçiş",
    "yinelenen olay",
    "geçersiz ya da geç kalmış geçiş",
]
assert db.execute("SELECT durum FROM odeme").fetchone() == ("basarili",)
assert db.execute("SELECT count(*) FROM kargo").fetchone() == (1,)
print("tamam")
```

```cikti
tamam
```

- Webhook'un içeriğine körü körüne güvenmek yerine, imzayı doğruladıktan sonra ödemenin güncel durumunu
  sağlayıcının API'sinden **yeniden sorgulamak** sağlam bir alışkanlıktır: sıra sorunu da biter.
- Webhook ucu hızlı 2xx döner, ağır işi (fatura kesme, e-posta) kuyruğa bırakır ([Webhooklar](webhooklar.md)).
- Durum geçişleri kitaplık olarak: [`kutuphane/py/kutuphane/durum_makinesi.py`](../../kutuphane/py/kutuphane/durum_makinesi.py).

## Tutar ve para birimi

```python calistir
FIYAT_KURUS = {"cay": 1000, "simit": 1500}  # fiyat VERİTABANINDAN; istemciden asla
KDV_YUZDE = 20


def toplam(sepet: list[dict]) -> dict:
    net = 0
    for satir in sepet:
        if satir["urun"] not in FIYAT_KURUS or not 1 <= satir["adet"] <= 99:
            raise ValueError("geçersiz sepet satırı")
        net += FIYAT_KURUS[satir["urun"]] * satir["adet"]  # istemcinin "fiyat" alanı okunmaz
    kdv = (net * KDV_YUZDE + 50) // 100  # tamsayıyla yarım kuruşu yukarı yuvarlama
    return {"net": net, "kdv": kdv, "brut": net + kdv, "para_birimi": "TRY"}


istemciden = [{"urun": "simit", "adet": 3, "fiyat": 1}, {"urun": "cay", "adet": 2, "fiyat": 1}]
assert toplam(istemciden) == {"net": 6500, "kdv": 1300, "brut": 7800, "para_birimi": "TRY"}
assert 0.1 * 3 != 0.3 and 10 * 3 == 30  # neden kuruş: ondalık kayan sayı yuvarlar
print("tamam")
```

```cikti
tamam
```

- Tutar her zaman para birimiyle birlikte saklanır ve karşılaştırılır; farklı para birimleri toplanmaz.
- KDV'nin satır satır mı toplamda mı yuvarlanacağı işletmenin kuralıdır; bir kez seçip belgeleyin. İndirimi
  satırlara dağıtmak ve KDV hesabı için hazır, tamsayı tabanlı yardımcı: [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py).
- Sağlayıcıya giden tutar ile sizin kaydınızdaki tutar aynı olmalı; webhook geldiğinde **tutar ve para birimini
  de** karşılaştırın (yalnız "başarılı" bilgisine bakmayın).
- Ekranda biçim Türkçe: `₺1.234,56`; hesapta asla biçimli metin kullanılmaz.

## İdempotentlik

| Nerede                         | Nasıl                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Ödeme başlatma                 | Sipariş denemesi başına anahtar; sağlayıcıya iletilir; çift tık aynı oturumu döner |
| Sizin "öde" ucunuz             | `Idempotency-Key` başlığı ([API tasarımı](api-tasarimi.md))                  |
| Webhook işleme                 | Olay kimliği tablosu + koşullu durum geçişi (yukarıdaki örnek)               |
| Sipariş tamamlama, stok düşme  | `basarili` geçişiyle aynı işlemde, bir kez                                   |
| İade                           | İade isteği başına anahtar; toplam iade ≤ çekilen tutar (kısıtla)            |

## İade ve itiraz

- İade, ödemeyi silmez: ayrı bir kayıt (tutar, neden, durum, sağlayıcı kimliği). Kısmi iadeler toplanır; toplam
  iade çekilen tutarı aşamaz (veritabanı kısıtı ya da koşullu güncelleme).
- İade de asenkron olabilir: `iade_bekliyor` → `iade_edildi` webhook ile kesinleşir.
- İtiraz (chargeback) kart sahibinin bankası üzerinden gelir; sağlayıcı webhook'la bildirir, kanıt göndermek için
  süre tanır. İtiraz anında hizmeti/erişimi ne yapacağınızı (askıya al, devam et) önceden kararlaştırın.
- Stok, fatura ve muhasebe kayıtları iade/itirazla birlikte düzeltilir; bunun da bir işi ve testi olur.

## Abonelik yaşam döngüsü

```text
deneme ──► etkin ──► ödeme_gecikti (yeniden denemeler, kullanıcıya e-posta) ──► iptal / ödenmedi
   │          └──► dönem sonunda iptal (erişim dönem bitene dek sürer)
   └──► (kart yoksa) deneme bitince düşer
```

- Erişim kararı **yerel kayıttan** verilir; yerel kayıt webhooklarla güncellenir ve mutabakatla doğrulanır.
  Her istekte sağlayıcıya sormayın.
- "Ödeme gecikti" bir ara durumdur: birkaç gün hoşgörü süresi + kullanıcıya "kartınızı güncelleyin" e-postası.
- Dönem tarihleri saat dilimine ve ay sonuna duyarlıdır: 31 Ocak'ta başlayan aylık abonelik Şubat'ta hangi gün
  yenilenir? Sağlayıcının kuralını belgesinden okuyun, kendiniz hesaplamayın ([Zaman ve saat dilimi](zaman-ve-saat-dilimi.md)).
- Plan değişikliğinde kalan sürenin hesaplanması (orantılama) sağlayıcıda yapılır; sonucu webhook'tan alın.

## Sınama ortamı

- Sınama ve canlı anahtarlar ayrı ortam değişkenlerinde; üretimde sınama anahtarı, geliştirmede canlı anahtar
  **açılışta reddedilir** (anahtar öneklerini ya da hesap kimliğini denetleyin; [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md)).
- Webhook imza anahtarı da ortama özeldir.
- Sağlayıcının sınama kartlarıyla şu senaryoları uçtan uca deneyin: başarılı, reddedilen, banka doğrulaması
  isteyen, doğrulamada vazgeçilen, iade, itiraz, aynı webhook'un iki kez gelmesi, webhook'un hiç gelmemesi.

## Mutabakat

Webhook kaybolabilir, kod hata yapabilir. Her gün sağlayıcının raporu (ya da API listesi) ile kendi kayıtlarınızı
karşılaştırın; her fark bir uyarıdır:

```python calistir
# Sağlayıcının raporu ile kendi kayıtlarımız: kimlik → (tutar_kuruş, durum)
saglayici = {"od_1": (15000, "basarili"), "od_2": (9900, "basarili"), "od_3": (5000, "iade_edildi")}
bizde = {"od_1": (15000, "basarili"), "od_3": (5000, "basarili"), "od_4": (2500, "basarili")}
ortak = saglayici.keys() & bizde.keys()
fark = {
    "bizde_yok": sorted(saglayici.keys() - bizde.keys()),  # webhook kaybolmuş: müşteri ödedi, sipariş yok!
    "saglayicida_yok": sorted(bizde.keys() - saglayici.keys()),  # yanlışlıkla "başarılı" işaretlenmiş
    "tutar_farkli": sorted(k for k in ortak if saglayici[k][0] != bizde[k][0]),
    "durum_farkli": sorted(k for k in ortak if saglayici[k][1] != bizde[k][1]),  # iade bize yansımamış
}
assert fark == {"bizde_yok": ["od_2"], "saglayicida_yok": ["od_4"], "tutar_farkli": [], "durum_farkli": ["od_3"]}
print(fark)
```

```cikti
{'bizde_yok': ['od_2'], 'saglayicida_yok': ['od_4'], 'tutar_farkli': [], 'durum_farkli': ['od_3']}
```

Mutabakat, saat dilimi sınırına dikkat eder: sağlayıcı raporu UTC gününe, muhasebe İstanbul gününe göre kesiliyorsa
gece yarısına yakın ödemeler "yok" görünür. Karşılaştırmayı aynı zaman aralığında ve biraz taşmalı yapın.

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Ödemeden sipariş tamamlandı                                   | "Başarılı" dönüş adresi ödemeyi kesinleştiriyor         | Yalnız doğrulanmış webhook/sorgu kesinleştirir                |
| Müşteri ödedi ama sipariş "bekliyor"da kaldı                  | Webhook kayboldu ya da hata verdi, kimse fark etmedi    | Yeniden deneme + günlük mutabakat + uyarı                     |
| Kargo iki kez başlatıldı                                      | Aynı webhook iki kez işlendi                            | Olay kimliği tablosu + koşullu geçiş                          |
| Başarılı ödeme sonradan "işleniyor"a döndü                    | Sırasız olay koşulsuz yazıldı                           | Durum makinesi; geri geçiş yok                                |
| 1 TL'ye televizyon satıldı                                    | Tutar istemciden alındı                                 | Sunucuda veritabanı fiyatlarıyla hesap                        |
| Toplamlar kuruş farkıyla tutmuyor                             | `float` ve karışık yuvarlama                            | Kuruş tamsayı, tek yuvarlama kuralı                           |
| Kart numaraları günlükte görüldü                              | İstek gövdesi günlüğe yazıldı; kart sunucudan geçti     | Barındırılan ödeme alanı; gövde günlüğü yok                   |
| Çift tıklamada iki ödeme oturumu açıldı                       | Ödeme başlatma idempotent değil                         | Sipariş denemesi başına anahtar                               |
| Canlıda sınama anahtarı (ya da tersi)                         | Ortam ayarı denetlenmiyor                               | Açılışta anahtar türü denetimi                                |
| İade edilen tutar ödenenden fazla                             | İade toplamı denetlenmiyor                              | Kısıt/koşullu güncelleme                                      |

## Denetim listesi

- [ ] Kart verisi sunucudan geçmiyor; ödeme gövdeleri günlüğe yazılmıyor.
- [ ] Tutar sunucuda, veritabanı fiyatlarıyla, kuruş tamsayı hesaplanıyor; para birimi yanında.
- [ ] Ödeme başlatma ve iade idempotentlik anahtarıyla.
- [ ] Sipariş yalnız doğrulanmış webhook ya da sağlayıcı sorgusuyla "ödendi" oluyor; dönüş sayfası yalnız bilgi veriyor.
- [ ] Webhook: imza, olay kimliğiyle yineleme ayıklama, durum makinesine göre koşullu geçiş, tutar karşılaştırması.
- [ ] Tamamlama (stok, kargo, erişim) geçişle aynı işlemde, bir kez.
- [ ] Sınama ve canlı anahtarlar ayrı; yanlış ortam açılışta reddediliyor.
- [ ] Günlük mutabakat çalışıyor ve fark uyarı üretiyor.
- [ ] Sınama kartlarıyla başarısız, doğrulamalı, yinelenen ve kayıp webhook senaryoları denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sağlayıcının belgesindeki çağrıları kullan, ezberden yazma. Sipariş yalnız imzası doğrulanmış
  webhook ile ödendi olur. Durum geçişlerini şu tabloya göre koşullu `UPDATE` ile yap; olay kimliğini sakla. Tutarı
  sunucuda kuruş tamsayıyla hesapla. Ödeme başlatmaya idempotentlik anahtarı ver."
- **Tipik hatalar:** başarı dönüş adresinde siparişi tamamlamak; webhook'u imzasız kabul etmek; istemcinin
  gönderdiği tutarı kullanmak; `amount * 100` ile kayan sayıdan kuruşa geçmek; sağlayıcının API'sini uydurmak;
  webhook ucunda ağır iş yapıp zaman aşımına uğramak.
- **Çıktıda arayın:** dönüş (success/return) işleyicisinde durum güncellemesi; `parseFloat`, `toFixed`, `* 100`;
  webhook işleyicisinde imza doğrulaması ve olay kimliği tablosu; `req.body.amount`.
- **Test isteyin:** "aynı webhook iki kez gelir, kargo bir kez başlar", "sırasız olay durumu geri götürmez",
  "istemcinin gönderdiği fiyat yok sayılır".

## İlgili

- [Webhooklar](webhooklar.md) (imza ve yineleme) · [API tasarımı](api-tasarimi.md) (idempotentlik anahtarı) ·
  [İşlemler ve eşzamanlılık](islemler-ve-eszamanlilik.md) · [Arka plan işleri](arka-plan-isleri.md) ·
  [Veritabanı tasarımı](veritabani-tasarimi.md) (para sütunu)
