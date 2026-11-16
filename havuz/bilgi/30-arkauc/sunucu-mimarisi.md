---
baslik: Sunucu mimarisi: katmanlar, bağımlılıklar, durumsuzluk, kapanış ve sağlık
ozet: Arka uç kodunu yönlendirme, doğrulama, iş kuralı ve veri erişimi katmanlarına ayırmak, bağımlılıkları dışarıdan vermek, modül sınırları, durumsuz sunucu, düzgün kapanış ve sağlık ucu; çalışan örneklerle.
etiketler: [mimari, sunucu, test, yayin, api]
duzey: orta
guncellik: 2026-11
---

# Sunucu mimarisi: katmanlar, bağımlılıklar, durumsuzluk, kapanış ve sağlık

> Bu notu ne zaman okumalı: yeni bir arka uç projesi kurulurken ya da var olan proje büyüyüp "her şey her yerde"
> hâline geldiğinde; testler yavaş, ağ isteyen ve kırılgan olduğunda; yayın sırasında istekler yarıda kesildiğinde;
> ikinci bir sunucu kopyası eklenmek istendiğinde.

## Temel fikir

Her istek aynı boru hattından geçer ve her boru tek iş yapar:

```text
istek → yönlendirme (HTTP) → doğrulama (şema) → iş kuralı (servis) → veri erişimi (depo) → veritabanı
```

Katmanlar yalnız bir alttakini bilir; iş kuralı HTTP nesnesi görmez, depo yetki bilmez. Bağımlılıklar (veritabanı,
saat, rastgele kaynak, e-posta gönderici, günlükçü, ayar) uygulamanın **tek bir kurulum noktasında** oluşturulup
dışarıdan verilir; bu yüzden testler ağsız ve zamanı ileri sararak çalışır. Sunucu kendi belleğinde kullanıcı
durumu tutmaz (durumsuz), kapanırken içerideki işleri bitirir ve sağlığını bir uçtan bildirir.

## Katmanlar

| Katman          | İşi                                                          | Yapmaz                                          | Havuzdaki örnek                               |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- |
| Yönlendirme     | Yöntem + adres → işleyici; durum kodu, başlık, çerez         | İş kuralı, SQL                                  | [`account/routes.ts`](../../uygulama/api/src/modules/account/routes.ts) |
| Doğrulama       | Gövde, parametre, sorgu dizgisi şemayla; tipli nesneye çevirir | Veritabanına bakmak                           | [`http/body.ts`](../../uygulama/api/src/http/body.ts) + paylaşılan şemalar |
| İş kuralı       | Yetki, değişmezler, durum geçişleri, işlem sınırı            | HTTP nesnesine dokunmak, SQL yazmak             | [`account/service.ts`](../../uygulama/api/src/modules/account/service.ts) |
| Veri erişimi    | Parametreli SQL, satır ↔ nesne çevirisi                      | Yetki, iş kuralı                                | [`workspaces/repo.ts`](../../uygulama/api/src/modules/workspaces/repo.ts) |
| Ara katmanlar   | İstek kimliği, günlük, güvenlik başlıkları, CORS, hız sınırı, gövde sınırı, CSRF, oturum | Uca özgü kural      | [`app.ts`](../../uygulama/api/src/app.ts) (sıra yorumuyla) |

Doğrulama **sınırda** bir kez yapılır; içeride tipli nesne dolaşır ("doğrula değil, ayrıştır": ham girdiyi tipli
bir değere çevir, çeviremiyorsan reddet). Hata çevirisi tek bir hata işleyicidedir
([Hata yönetimi ve günlükleme](hata-yonetimi-ve-gunlukleme.md)).

## Bağımlılıkları dışarıdan verme

Havuzdaki API'de `createApp(deps)` bütün bağımlılıkları parametre alır; ortak servisler (`context.ts`) tek yerde
kurulur; sunucuyu başlatan `index.ts` gerçek veritabanını, gerçek saati ve gerçek göndericiyi verir, testler bellek
içi veritabanını, ileri sarılabilen saati ve sahte göndericiyi verir. Aynı kalıbın küçük hâli:

```python calistir
from datetime import datetime, timedelta, timezone


class SahteSaat:  # gerçeği: datetime.now(timezone.utc) döndüren aynı arayüz
    def __init__(self, an: datetime):
        self.an = an

    def simdi(self) -> datetime:
        return self.an

    def ilerlet(self, **sure) -> None:
        self.an += timedelta(**sure)


class BellekDavetDeposu:  # gerçeği: aynı yöntemleri SQL ile yapan depo
    def __init__(self):
        self.kayitlar: dict[str, dict] = {}

    def ekle(self, belirtec: str, bitis: datetime) -> None:
        self.kayitlar[belirtec] = {"bitis": bitis, "kullanildi": False}

    def bul(self, belirtec: str) -> dict | None:
        return self.kayitlar.get(belirtec)

    def kullanildi_isaretle(self, belirtec: str) -> None:
        self.kayitlar[belirtec]["kullanildi"] = True


class DavetHatasi(Exception):
    pass


class DavetServisi:  # İŞ KURALI: HTTP bilmez, SQL bilmez; bağımlılıkları dışarıdan alır
    def __init__(self, depo, saat, sure: timedelta = timedelta(days=7)):
        self.depo, self.saat, self.sure = depo, saat, sure

    def olustur(self, belirtec: str) -> None:
        self.depo.ekle(belirtec, self.saat.simdi() + self.sure)

    def kabul_et(self, belirtec: str) -> None:
        davet = self.depo.bul(belirtec)
        if davet is None or davet["kullanildi"] or davet["bitis"] <= self.saat.simdi():
            raise DavetHatasi("invalid_token")  # üç durum da aynı yanıt: belirteç tahmini işe yaramasın
        self.depo.kullanildi_isaretle(belirtec)


def davet_kabul_ucu(servis: DavetServisi, govde: object) -> tuple[int, dict]:  # YÖNLENDİRME + DOĞRULAMA
    belirtec = govde.get("token") if isinstance(govde, dict) else None
    if not isinstance(belirtec, str) or len(belirtec) != 43:
        return 400, {"error": {"code": "validation"}}
    try:
        servis.kabul_et(belirtec)
    except DavetHatasi as hata:
        return 400, {"error": {"code": str(hata)}}
    return 200, {"ok": True}


saat = SahteSaat(datetime(2026, 11, 16, 9, 0, tzinfo=timezone.utc))
servis = DavetServisi(BellekDavetDeposu(), saat)
servis.olustur("a" * 43)
saat.ilerlet(days=8)  # test 8 gün beklemez
assert davet_kabul_ucu(servis, {"token": "a" * 43}) == (400, {"error": {"code": "invalid_token"}})
servis.olustur("b" * 43)
assert davet_kabul_ucu(servis, {"token": "b" * 43}) == (200, {"ok": True})
assert davet_kabul_ucu(servis, {"token": "b" * 43})[0] == 400  # tek kullanımlık
assert davet_kabul_ucu(servis, {"token": 42}) == (400, {"error": {"code": "validation"}})  # sınırda doğrulama
print("tamam")
```

```cikti
tamam
```

Kurallar: bağımlılık kurucuya ya da işleve parametre olarak gelir; modül içinde `new Date()`, `Math.random()`,
`process.env`, küresel veritabanı nesnesi kullanılmaz. Bağımlılık enjeksiyonu çerçevesi gerekmez; düz parametre
yeter ve küçük model için en okunur olanıdır.

## Modül sınırları ve monolitte düzen

- Kod **özelliğe göre** klasörlenir (`modules/auth`, `modules/workspaces`, `modules/sync`), teknik türe göre değil
  (`controllers/`, `models/`). Bir özellik değişince tek klasör değişir.
- Her modül kendi tablolarının sahibidir; başka modül o tablolara modülün servis/depo işlevleri üzerinden erişir.
  İki modül birbirini döngüsel içe aktarıyorsa sınır yanlış çizilmiştir.
- Ortak çekirdek küçük tutulur: hata türleri, kimlik üretimi, metin yardımcıları, saat arayüzü.
- Yeni modül tek bir kayıt yerine bağlanır (havuzda `app.ts` → `// YENİ MODÜL BURAYA`); kendiliğinden keşif yok.
- **Önce modüler monolit.** Ayrı servise bölmenin gerekçesi bağımsız ölçekleme, ayrı ekip, farklı güvenlik sınırı ya
  da farklı teknolojidir. Gerekçesiz bölmek, ağ üzerinden konuşan ama birlikte yayınlanması gereken "dağıtık
  monolit" doğurur ([Monolit ve servisler](../40-sistem-tasarimi/monolit-ve-servisler.md),
  [Dağıtık sistem yanılgıları](../40-sistem-tasarimi/dagitik-sistem-yanilgilari.md)).

## Durumsuz sunucu

Sunucu kopyası her an değiştirilebilmeli (yayın, çökme, ölçekleme). Bunun için kullanıcıya ait durum süreç
belleğinde ya da yerel diskte tutulmaz:

| Durum                       | Yeri                                       | Havuzdaki durum                                    |
| --------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Oturum                      | Veritabanı (ya da ortak önbellek)          | `sessions` tablosu                                 |
| Yüklenen dosya              | Nesne depolama / kalıcı disk               | Yükleme yok                                        |
| Hız sınırı sayaçları        | Ortak depo                                 | Bellek içi — tek kopya kuralıyla bilinçli kabul    |
| Anlık bağlantılar (SSE)     | Kopyada kalır; olaylar yayın/abone ile     | Bellek içi merkez — tek kopya                      |
| Zamanlanmış işler           | Tek lider ya da dönem kilidi               | Süreç içi bakım işi — tek kopya                    |
| Önbellek                    | Bellekte olabilir (kaybı zararsızsa)       | —                                                  |

Havuzdaki API SQLite ve bellek içi sayaçlar yüzünden **tek kopya** çalışır; bu sınır ve çok kopyaya geçişin yolu
yazılıdır ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → §7). Ölçekleme kararları:
[Ölçekleme temelleri](../40-sistem-tasarimi/olcekleme-temelleri.md).

## Düzgün kapanış

Yayında eski kopya `SIGTERM` alır. Hemen çıkarsa içerideki istekler yarıda kesilir, kuyruktan alınmış işler
kaybolur. Doğru sıra: hazır olmadığını bildir → yeni bağlantı alma → sürenleri bitir (süre sınırıyla) → anlık
akışları kapat → arka plan işlerini bekle → veritabanını kapat → çık.

```js calistir
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as bekle } from 'node:timers/promises'

let kapaniyor = false
const olaylar = []
const sunucu = createServer(async (req, res) => {
  if (req.url === '/saglik/hazir') {
    res.writeHead(kapaniyor ? 503 : 200).end() // kapanırken yük dengeleyici yeni istek göndermesin
    return
  }
  await bekle(300) // süren bir istek (ör. rapor)
  if (kapaniyor) res.setHeader('Connection', 'close') // istemci bu bağlantıyı yeniden kullanmasın
  res.end('bitti')
  olaylar.push('istek bitti')
})
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}`

function kapat() {
  // gerçekte: process.on('SIGTERM', kapat)
  kapaniyor = true
  setTimeout(() => process.exit(1), 10_000).unref() // takılırsa zorla çık
  sunucu.close(() => olaylar.push('sunucu kapandı')) // yeni bağlantı almaz, sürenleri bekler
  sunucu.closeIdleConnections() // boşta bekleyen keep-alive bağlantılarını kapat
  // gerçek uygulamada burada: açık SSE akışlarını kapat, arka plan işlerini bekle, veritabanını kapat
}

const suren = fetch(`${adres}/rapor`).then((y) => y.text())
await bekle(50)
kapat()
assert.equal(await suren, 'bitti') // içerideki istek yarıda kesilmedi
await assert.rejects(fetch(`${adres}/rapor`)) // yeni bağlantı kabul edilmiyor
for (let i = 0; i < 100 && olaylar.length < 2; i++) await bekle(10)
assert.deepEqual(olaylar, ['istek bitti', 'sunucu kapandı'])
console.log('süren istek bitti, sonra sunucu kapandı')
```

```cikti
süren istek bitti, sonra sunucu kapandı
```

Sahadan iki ayrıntı:

- `close()` açık **keep-alive** ve **SSE** bağlantıları kapanmadan geri çağırmaz; boştakileri kapatın, kapanırken
  yanıtlara `Connection: close` ekleyin, akışları sunucu kapatsın. Havuzdaki kapanış bunu yapar
  ([`index.ts`](../../uygulama/api/src/index.ts)).
- Süreç yöneticisi sinyali `npm start` üzerinden gönderirse arada bir kabuk vardır ve `SIGTERM` her ortamda Node'a
  ulaşmaz; kapanış atlanır. Üretimde süreci doğrudan `node …` ile başlatın (havuzda gözlenen durum:
  [`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Süreç yöneticisiyle").

## Sağlık ucu

| Uç türü                   | Soru                                       | İçerik                                             | Başarısızsa                       |
| ------------------------- | ------------------------------------------ | -------------------------------------------------- | --------------------------------- |
| Canlılık (liveness)       | Süreç takıldı mı?                          | Hiçbir bağımlılığa sormaz; hemen 200               | Süreç yeniden başlatılır          |
| Hazırlık (readiness)      | Şu an istek alabilir miyim?                | Veritabanına basit sorgu; göçler bitti mi; kapanmıyor muyum | Trafik bu kopyaya gönderilmez |
| Dışarıdan izleme          | Kullanıcı açısından hizmet ayakta mı?      | Gerçek adres üzerinden hazırlık ucu                | Uyarı                             |

- Canlılık ucuna veritabanı denetimi koymayın: veritabanı yavaşladığında bütün kopyalar "ölü" sayılıp aynı anda
  yeniden başlatılır ve sorun büyür.
- Dış servisleri (e-posta sağlayıcısı) hazırlığa bağlamayın; onların arızası sizin bütün trafiğinizi kesmesin.
- Sağlık ucu oturumsuzdur ve az bilgi verir (sürüm ve zaman yeter; bağımlılık ayrıntısı, ayar değeri yok).
- Havuzdaki tek uç hazırlık türündedir: veritabanına `SELECT 1` atar ([`health/routes.ts`](../../uygulama/api/src/modules/health/routes.ts)).

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Bir iş kuralını değiştirmek beş dosyaya dokunmayı gerektiriyor | Kural rotalara ve depolara dağılmış                      | Kuralı servise taşıyın; rota ve depo inceltilir            |
| Testler ağ istiyor, yavaş ve ara sıra düşüyor                 | Bağımlılıklar modül içinde kuruluyor; gerçek saat        | Dışarıdan verilen bağımlılıklar; sahte saat                |
| Süre/son kullanma testleri günler beklemek istiyor            | `new Date()` doğrudan kullanılmış                        | Saat parametresi                                           |
| İkinci kopya eklenince oturumlar rastgele düşüyor             | Oturum süreç belleğinde                                  | Oturum veritabanında                                       |
| Yayın sırasında istekler 502 ile kesiliyor                    | `SIGTERM`'de hemen çıkış                                 | Düzgün kapanış + hazırlık ucu 503                          |
| Sunucu kapanmıyor, süreç yöneticisi zorla öldürüyor           | Keep-alive/SSE bağlantıları açık                         | Boşta olanları kapatın, akışları sunucu kapatsın           |
| Veritabanı yavaşlayınca bütün kopyalar yeniden başlatıldı     | Canlılık ucu veritabanına bağlı                          | Canlılık bağımlılıksız; veritabanı hazırlıkta              |
| Modüller birbirini içe aktarıyor, değişiklik zincirleme kırıyor | Sınırlar özelliğe göre değil                           | Özellik klasörleri; başka modüle yalnız servis üzerinden    |
| "Mikroservise geçtik", her yayında dört servis birlikte değişiyor | Gerekçesiz bölme                                     | Modüler monolite dönün ya da sınırları yeniden çizin       |

## Denetim listesi

- [ ] Rota işleyicisi: kimlik kapısı → doğrulama → servis çağrısı → yanıt; içinde SQL ve iş kuralı yok.
- [ ] Doğrulama sınırda ve şemayla; içeride tipli nesneler dolaşıyor.
- [ ] Bağımlılıklar tek kurulum noktasında oluşturulup dışarıdan veriliyor; modüllerde `new Date()`/`process.env` yok.
- [ ] Kod özelliğe göre klasörlü; modüller başka modülün tablosuna doğrudan dokunmuyor.
- [ ] Kullanıcı durumu süreç belleğinde değil (ya da tek kopya kararı belgeli).
- [ ] `SIGTERM`'de düzgün kapanış: hazırlık 503, yeni bağlantı yok, sürenler bitiyor, akışlar ve veritabanı kapanıyor, zaman aşımıyla zorla çıkış.
- [ ] Süreç üretimde doğrudan `node` ile başlıyor.
- [ ] Canlılık ve hazırlık ayrımı yapılmış; sağlık ucu oturumsuz ve az bilgili.
- [ ] Testler ağsız ve sahte saatle koşuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni özelliği `modules/<ad>/` altında `routes.ts` + `service.ts` + `repo.ts` olarak yaz; örnek
  `modules/account/`. Rota yalnız doğrular ve servisi çağırır; SQL yalnız depoda; saat ve veritabanı `ctx`'ten gelir.
  Modülü `app.ts`'teki kayıt satırına ekle." (Tarif: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni uç nokta ekle".)
- **Tipik hatalar:** her şeyi rota işleyicisine yazmak; `import db from '../db'` gibi küresel nesne; doğrulamayı
  servisin ortasında yapmak; `Date.now()`; kapanışı hiç düşünmemek; sağlık ucunu dış servislere bağlamak.
- **Çıktıda arayın:** `routes.ts` içinde `SELECT`/`INSERT`; modül dosyalarında `new Date(`, `Date.now(`, `process.env`;
  yeni modülün kayıt satırı; `SIGTERM` işleyicisi.

## İlgili

- [Veri erişim katmanı](veri-erisim-katmani.md) · [Hata yönetimi ve günlükleme](hata-yonetimi-ve-gunlukleme.md) ·
  [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md) · [Gerçek zamanlı](gercek-zamanli.md) (akışları kapatma) ·
  [Zaman ve saat dilimi](zaman-ve-saat-dilimi.md) (saati enjekte etme)
- Havuzdaki mimari anlatımı: [`uygulama/docs/MIMARI.md`](../../uygulama/docs/MIMARI.md); API haritası:
  [`uygulama/api/README.md`](../../uygulama/api/README.md).
- Dayanıklılık kalıpları (zaman aşımı, devre kesici, yeniden deneme bütçesi):
  [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md); sağlık ucunu izleyen taraf:
  [Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md); kapsayıcıda sinyal ve kapanış:
  [Docker](../60-devops/docker.md).
