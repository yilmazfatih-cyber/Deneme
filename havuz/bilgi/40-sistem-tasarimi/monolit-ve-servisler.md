---
baslik: Monolit ve servisler: modüler monolit, ayırma ölçütleri ve dağıtık monolit tuzağı
ozet: Modüler monolitin neden varsayılan olduğu, bir parçayı ayırmanın somut ölçütleri, dağıtık monolit belirtileri, ekip boyutu ile sınırlar ve servisler arası iletişim seçenekleri; sınır kural testi ve zincir hesabıyla.
etiketler: [mimari, monolit, mikroservis, moduler-monolit, iletisim]
duzey: orta
guncellik: 2026-11
---

# Monolit ve servisler: modüler monolit, ayırma ölçütleri ve dağıtık monolit tuzağı

> Bu notu ne zaman okumalı: yeni bir ürünün iskeleti kurulurken; bir model "mikroservislerle başlayalım"
> dediğinde; bir özelliği ayrı bir servis yapma fikri çıktığında; değişikliklerin her seferinde birden çok
> servise dokunduğu fark edildiğinde.

## Temel fikir

- **Modüler monolit:** tek dağıtılan birim; içinde sınırları kesin modüller. Her modülün kendi tabloları ve dar,
  açık bir arayüzü vardır; modüller birbirinin iç dosyalarına ve tablolarına dokunmaz. Tek kişilik ya da küçük
  bir ekip ve küçük bir model için **varsayılan** budur.
- Servislere ayırmak bir **ekip ve ölçek** çözümüdür, kod düzeni çözümü değil. Kod düzeni modüllerle sağlanır.
- Her ayrılan servis dağıtık sistem bedeli getirir: ağ çağrısı, kısmi arıza, iki yere yazma, sürüm uyumu, ayrı
  izleme ve dağıtım ([Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md)).
- Monolit de yatay ölçeklenir: aynı süreçten N kopya çalıştırılır ([Ölçekleme temelleri](olcekleme-temelleri.md)).
  "Ölçeklensin diye servis" çoğu zaman yanlış gerekçedir.
- Kötü ayrılmış servisler **dağıtık monolittir**: birlikte değişir, birlikte dağıtılır, birbirini senkron çağırır;
  iki dünyanın da kötüsünü verir.

## Karar tablosu: ayırma ölçütleri

| Durum                                                             | Seçim                                              | Neden                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| 1–5 kişilik ekip, tek ürün                                         | Modüler monolit                                    | En düşük işletme yükü; yeniden düzenleme ucuz          |
| Bir parçanın kaynak profili çok farklı (PDF, video, dil modeli)    | Aynı kod tabanından **ayrı işçi süreci**           | Ayrı ölçeklenir, çökmesi web'i düşürmez; servis değil |
| Farklı dil ya da çalışma zamanı gerekiyor (Python modeli + Node API) | Ayrı servis, dar ve sürümlü arayüz              | Tek süreçte birleşemez                                |
| Güvenlik sınırı (ödeme, kişisel veri kasası, yönetim paneli)       | Ayrı servis/veritabanı, en az yetki                | Sızıntının etki alanı küçülür                         |
| Gerçekten ayrı ekipler, ayrı yayın temposu                         | Ayrı servis, iş yeteneğine göre sınır             | Ekipler birbirini beklemez                            |
| "İleride büyürüz", "temiz olsun"                                   | Modüler monolit + sınır kural testi                | Ayırma kararı ölçütle verilir, umutla değil           |
| Bir modül sık değişiyor ve ötekileri bozuyor                       | Monolit içinde sınırı sıkılaştır (arayüz + test)   | Sorun bağımlılık, dağıtım birimi değil                |

Sınır **iş yeteneğine** göre çizilir (sipariş, fatura, bildirim, kimlik), teknik katmana göre değil
("veritabanı servisi", "doğrulama servisi" dağıtık monolit üretir).

## Modüler monolit nasıl kurulur

1. Klasör = modül: `modules/siparis/`, `modules/fatura/`… Her modülde dışarıya açık tek bir arayüz dosyası.
2. Her tablonun **tek sahibi** vardır; başka modül o tabloya SQL atmaz, sahibinin arayüzünü çağırır.
3. Modüller arası çağrı işlev çağrısıdır; "bir şey oldu" bildirimi süreç içi olayla yapılır (sipariş verildi →
   fatura ve bildirim modülleri dinler). İleride ayırmak gerekirse olay kuyruğa taşınır
   ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)).
4. Sınır, insan dikkatine değil **kural testine** bırakılır:

```python calistir
import ast

MODULLER = {"siparis", "fatura", "bildirim"}
# Kural: bir modül ötekinin yalnız `api` dosyasını içe aktarır; iç dosyalarına (depo, tablolar) dokunmaz.
DOSYALAR = {
    "siparis/api.py": "from siparis.depo import siparis_kaydet\n",
    "siparis/depo.py": "import sqlite3\n",
    "fatura/servis.py": "from siparis.api import siparis_getir\nfrom siparis.depo import siparis_kaydet\n",
    "bildirim/servis.py": "import siparis.depo\nfrom fatura import api as fatura_api\n",
}


def ihlaller(dosyalar: dict[str, str]) -> list[str]:
    bulunan = []
    for yol, kaynak in dosyalar.items():
        kendi = yol.split("/")[0]
        for dugum in ast.walk(ast.parse(kaynak)):
            if isinstance(dugum, ast.ImportFrom) and dugum.module:
                hedefler = [dugum.module] + [f"{dugum.module}.{a.name}" for a in dugum.names]
            elif isinstance(dugum, ast.Import):
                hedefler = [a.name for a in dugum.names]
            else:
                continue
            parca = hedefler[0].split(".")
            if parca[0] in MODULLER and parca[0] != kendi and not any(h.split(".")[1:2] == ["api"] for h in hedefler):
                bulunan.append(f"{yol}: '{hedefler[0]}' içe aktarılamaz; '{parca[0]}.api' kullanın")
    return bulunan


for satir in ihlaller(DOSYALAR):
    print(satir)
assert len(ihlaller(DOSYALAR)) == 2
```

```cikti
fatura/servis.py: 'siparis.depo' içe aktarılamaz; 'siparis.api' kullanın
bildirim/servis.py: 'siparis.depo' içe aktarılamaz; 'siparis.api' kullanın
```

Gerçek projede `DOSYALAR` yerine klasör taranır ve test her denetimde koşar; hata iletisi düzeltmeyi söyler.
TypeScript'te aynı kural ESLint'in `no-restricted-imports` kuralıyla ya da bir kural testiyle yazılır. Havuzdaki
API bir modüler monolittir: her modül `api/src/modules/<ad>/` altında `routes`, `service`, `repo` dosyalarıyla durur
([`modules/`](../../uygulama/api/src/modules/workspaces/service.ts)); kural testi her modülün kendi testi olduğunu
denetler ([`rules.test.ts`](../../uygulama/api/test/rules.test.ts)).

## Senkron zincirin bedeli

Bir istek N servisi art arda senkron çağırıyorsa erişilebilirlikler **çarpılır**, kuyruk gecikmeleri **toplanır**:

```python calistir
import math
import random

rng = random.Random(2)


def cagri_ms() -> float:  # tek servis çağrısı: çoğu 20 ms, %5'i 200 ms (kuyruk gecikmesi)
    return 200.0 if rng.random() < 0.05 else 20.0


for n in (1, 3, 5):
    erisilebilirlik = 0.999**n  # her servis %99,9; istek hepsinin aynı anda ayakta olmasını ister
    toplam = sorted(sum(cagri_ms() for _ in range(n)) for _ in range(20_000))
    p99 = toplam[math.ceil(0.99 * len(toplam)) - 1]
    kesinti_dk = (1 - erisilebilirlik) * 30 * 24 * 60
    print(f"{n} servis art arda: erişilebilirlik %{erisilebilirlik * 100:.2f} (ayda ~{kesinti_dk:3.0f} dk), p99 {p99:3.0f} ms")
assert 0.999**5 < 0.999**3 < 0.999  # her eklenen senkron halka erişilebilirliği düşürür
```

```cikti
1 servis art arda: erişilebilirlik %99.90 (ayda ~ 43 dk), p99 200 ms
3 servis art arda: erişilebilirlik %99.70 (ayda ~129 dk), p99 240 ms
5 servis art arda: erişilebilirlik %99.50 (ayda ~216 dk), p99 460 ms
```

Aynı beş adım monolit içinde işlev çağrısıdır: ağ gecikmesi ve kısmi arıza yoktur. Servis ayrılacaksa senkron
zinciri kısa tutun; kullanıcının beklemediği adımları olaya çevirin.

## Dağıtık monolit belirtileri

| Belirti                                                        | Ne anlama gelir                                  | Çare                                                  |
| -------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| İki servis her zaman birlikte dağıtılıyor                      | Arayüz sürümlü değil ya da sınır yanlış          | Geriye uyumlu arayüz; ya da birleştir                  |
| Servisler aynı veritabanı tablolarını okuyup yazıyor           | Sınır yok; gizli bağ                              | Tablonun tek sahibi; ötekiler arayüzden               |
| Bir alan eklemek 4 servisi değiştiriyor                        | Sınır iş yeteneğine göre çizilmemiş              | Sınırı yeniden çiz; birleştir                         |
| Bir istek 5+ servisi art arda çağırıyor                        | Senkron zincir; erişilebilirlik çarpılıyor       | Olaya çevir, veriyi yerel kopyala, birleştir           |
| Ortak "commons" kütüphanesi her güncellemede herkesi bozuyor   | Paylaşılan iş mantığı                            | Ortakta yalnız saf yardımcılar; iş mantığı sahibinde  |
| Yerelde çalıştırmak için 8 servis ayağa kalkmalı               | Geliştirme maliyeti işi geçti                    | Monolite dön ya da sözleşme testleri                  |

## Servisler arası iletişim

| Seçenek                          | Ne zaman                                                | Bedel                                               |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Senkron HTTP/JSON                | Kullanıcı cevabı bekliyor, çağrı az ve basit            | Zincir arıza ve gecikme; zaman aşımı şart           |
| Tipli RPC (ör. gRPC)             | İç ağ, sık çağrı, sözleşme tipli olsun                  | Araç bağımlılığı; tarayıcıdan doğrudan değil        |
| Olay / kuyruk (eşzamansız)       | "Şu oldu" bildirimi, birden çok dinleyici, cevap gerekmez | Nihai tutarlılık, yineleme, sıra ([Kuyruk ve olaylar](kuyruk-ve-olaylar.md)) |
| Paylaşılan veritabanı            | **Kaçının**                                             | Gizli bağ; şema değişikliği herkesi bozar           |
| Toplu dosya / ambar aktarımı     | Raporlama, analitik                                     | Gecikmeli veri                                      |

Her arayüz sürümlenir ve geriye uyumlu değişir (alan ekle, silme); tüketicinin beklediği biçim bir **sözleşme
testiyle** korunur ([API tasarımı](../30-arkauc/api-tasarimi.md) → sürümleme).

## Ayırmak gerekirse: adım adım

1. Modülün sınırı monolit içinde netleşir: kendi tabloları, tek arayüz dosyası, kural testi geçiyor.
2. Modül içindeki çağrılar arayüz üstünden; öteki modüllerle iletişim olaylarla.
3. Modül ayrı sürece taşınır; arayüz işlev çağrısından HTTP/kuyruğa döner (bu adımda yalnız taşıma katmanı değişir).
4. Trafik kademeli yönlendirilir; eski yol bir süre yedek kalır; geri dönüş planı yazılıdır
   ([Tasarım kararı şablonu](tasarim-karari-sablonu.md)).

Ekip boyutu notu: sistemler, onları kuran ekiplerin iletişim yapısını kopyalar (Conway yasası). Tek bir sahip ve
küçük bir model için doğru yapı tek bir dağıtım birimidir; servis sayısı ekip sayısını geçmemelidir.

## Tuzaklar

| Belirti                                                  | Neden                                               | Çözüm                                                  |
| -------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| İlk sürüm aylarca çıkmadı, altyapı işi bitmiyor          | Mikroservis + orkestrasyon ilk günden               | Modüler monolit; ayırma ölçütleri gelince ayır         |
| Modüller birbirinin tablosuna sorgu atıyor               | Sınır yalnız klasör adında                          | Tablonun sahibi; kural testi                           |
| Bir modülü değiştirmek beklenmedik yerleri bozuyor       | İç dosyalar dışarıdan içe aktarılıyor               | Arayüz dosyası + içe aktarma kural testi               |
| Servis ayrıldı, iki yere yazma tutarsızlığı başladı      | Veritabanı yazması ve olay ayrı                     | Giden kutusu                                           |
| Ayrı servis, eski monolitle aynı veritabanını kullanıyor | Yarım ayrım                                         | Önce veri sahipliğini ayır                             |
| Servisler arası çağrılarda kimlik kayboluyor             | Kullanıcı bağlamı taşınmıyor ya da her yerde farklı | [Kimlik ve yetki mimarisi](kimlik-ve-yetki-mimarisi.md) |
| PDF üretimi web sunucusunu çökertiyor                     | Ağır iş web süreciyle aynı yerde                    | Ayrı işçi süreci (aynı kod, ayrı dağıtım)              |

## Denetim listesi

- [ ] Modüller iş yeteneğine göre ayrılmış; her modülün tek arayüz dosyası var.
- [ ] Her tablonun tek sahibi var; başka modül o tabloya doğrudan sorgu atmıyor.
- [ ] Modül sınırı kural testiyle korunuyor (içe aktarma denetimi) ve test `check` içinde koşuyor.
- [ ] Ağır/uzun işler ayrı işçi sürecinde; web süreci yalnız istek-yanıt yapıyor.
- [ ] Ayrı servis önerisi, yukarıdaki ölçütlerden en az biriyle ve yazılı tasarım kararıyla geliyor.
- [ ] Servisler arası her arayüz sürümlü, geriye uyumlu ve sözleşme testli.
- [ ] Senkron zincir en çok 2–3 halka; fazlası olaya çevrildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni özelliği `modules/<ad>/` altında modül olarak ekle; öteki modüllerin yalnız arayüz
  dosyasını içe aktar, tablolarına dokunma. Ayrı servis, ayrı veritabanı ya da yeni altyapı ekleme."
- **Modelin tipik hatası:** "temiz mimari" diye ilk günden çok servis, API ağ geçidi, servis keşfi önerir;
  modüller arasında doğrudan tablo sorgusu yazar; ortak bir `utils`/`commons` dosyasına iş mantığı koyar;
  servisler arası çağrıya zaman aşımı koymaz.
- **Çıktıda arayın:** başka modülün iç dosyasından içe aktarma; başka modülün tablosuna SQL; yeni bir
  `docker-compose` servisi ya da ağ çağrısı; senkron zincirin uzunluğu.
- **Doğrulama:** sınır kural testini çalıştırın; ihlal varsa modelden arayüzü genişletmesini isteyin, kuralı
  gevşetmesini değil.

## İlgili

- [Ölçekleme temelleri](olcekleme-temelleri.md) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) ·
  [Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) · [Tasarım kararı şablonu](tasarim-karari-sablonu.md)
- [Tasarım kararı](../00-yontem/tasarim-karari.md) (işe yarayan en basit şey, erken soyutlama)
- Havuzdaki modüler monolit: [`uygulama/docs/MIMARI.md`](../../uygulama/docs/MIMARI.md),
  [`uygulama/api/TARIFLER.md`](../../uygulama/api/TARIFLER.md) (yeni uç ve modül tarifi)
