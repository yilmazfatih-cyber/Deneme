---
baslik: Gerçek zamanlı: yoklama, SSE, WebSocket ve kaçan olayı telafi
ozet: Yoklama, uzun yoklama, SSE ve WebSocket arasında seçim; yeniden bağlanma ve son olay kimliğiyle telafi, kalp atışı, vekil sorunları, çok sunuculu yayın ve dürt-sonra-çek kalıbı; çalışan SSE örneğiyle.
etiketler: [gercek-zamanli, sse, websocket, http, eszamanlilik]
duzey: orta
guncellik: 2026-11
---

# Gerçek zamanlı: yoklama, SSE, WebSocket ve kaçan olayı telafi

> Bu notu ne zaman okumalı: "başka cihazdaki değişiklik sayfayı yenilemeden görünsün", bildirim rozeti, canlı
> sohbet, işlem durumu ("ödemeniz işleniyor") gibi bir ihtiyaç doğduğunda; anlık güncellemeler yayında gecikip
> kaybolduğunda.

## Temel fikir

"Gerçek zamanlı" çoğu üründe şu demektir: **başka yerde olan değişiklik birkaç saniye içinde ekrana gelsin.** Bunun
için en basit yeterli aracı seçin ve şunu baştan kabul edin: **bağlantı kopar.** Mobil ağ değişir, telefon uykuya
geçer, vekil boşta duran bağlantıyı keser, yeni sürüm yayınlanır. Doğru tasarım kopmayı olağan sayar:

1. Bağlantı kendiliğinden yeniden kurulur (beklemeli, titremeli).
2. Kopukken kaçan olaylar **telafi edilir** (son görülen olay kimliği ya da sürüm imleci).
3. Anlık kanal yalnız "değişti" der; veri, yetki denetimi ve sıralamayla birlikte **normal API'den çekilir**
   ("dürt, sonra çek"). Böylece kaybolan bir dürtme veriyi kaybettirmez, yalnız geciktirir.

## Karar tablosu

| İhtiyaç                                                          | Seçim                        | Neden                                                          |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| 30–60 sn gecikme kabul, az kullanıcı                             | Düzenli yoklama (+ ETag/304) | En basit; vekil ve bağlantı sorunu yok                         |
| Sunucudan istemciye bildirim, saniyeler içinde                   | **SSE** (Server-Sent Events) | Düz HTTP; tarayıcı kendiliğinden yeniden bağlanır, son kimliği gönderir |
| İki yönlü, sık ve küçük mesajlar (sohbet "yazıyor…", oyun, ortak imleç) | WebSocket             | Tek bağlantıda iki yön; ama yeniden bağlanma ve telafi sizin işiniz |
| SSE/WebSocket'i engelleyen eski bir ağ                           | Uzun yoklama (long polling)  | İstek, olay olana ya da süre dolana kadar açık kalır           |
| Uygulama kapalıyken haber vermek                                 | Anlık bildirim (push)        | Açık bağlantı gerektirmez ([E-posta ve bildirim](e-posta-ve-bildirim.md)) |

- İstemciden sunucuya giden mesajlar seyrekse (form gönderme gibi) WebSocket gerekmez: SSE + normal POST yeter.
- Tarayıcı SSE'yi `EventSource` ile açar; `EventSource` özel başlık **gönderemez** (çerez gönderir). Belirteçle
  kimlik doğrulayan istemci akışı `fetch` ile okur.
- HTTP/1.1'de tarayıcı aynı kökene aynı anda yalnız birkaç bağlantı açar; çok sekmede açık SSE akışları öteki
  istekleri bekletebilir. HTTP/2 bu sınırı kaldırır.

## Yeniden bağlanma ve kaçan olayı telafi

SSE'de her olaya `id:` yazılır. Bağlantı koparsa tarayıcı `retry:` kadar bekleyip yeniden bağlanır ve son gördüğü
kimliği `Last-Event-ID` başlığıyla **kendisi** gönderir. Sunucu o kimlikten sonrakileri baştan yollar:

```js calistir
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as bekle } from 'node:timers/promises'

const gecmis = [] // gerçekte: veritabanındaki sürümlü kayıtlar; burada sınırlı bir dizi
const acik = new Set()
const yaz = (res, olay) => res.write(`id: ${olay.id}\nevent: poke\ndata: ${JSON.stringify(olay.veri)}\n\n`)

function yayinla(veri) {
  const olay = { id: gecmis.length + 1, veri }
  gecmis.push(olay)
  for (const res of acik) yaz(res, olay)
}

const sunucu = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
  res.write('retry: 3000\n\n') // koparsa 3 sn sonra yeniden bağlan
  const son = Number(req.headers['last-event-id'] ?? 0)
  for (const olay of gecmis) if (olay.id > son) yaz(res, olay) // kaçan olayları telafi et
  acik.add(res)
  req.on('close', () => acik.delete(res))
})
await new Promise((tamam) => sunucu.listen(0, '127.0.0.1', tamam))
const adres = `http://127.0.0.1:${sunucu.address().port}/olaylar`

async function dinle(basliklar, kac) {
  const iptal = new AbortController()
  const yanit = await fetch(adres, { headers: basliklar, signal: iptal.signal })
  const okuyucu = yanit.body.pipeThrough(new TextDecoderStream()).getReader()
  const kimlikler = []
  let tampon = ''
  while (kimlikler.length < kac) {
    tampon += (await okuyucu.read()).value
    for (let i; (i = tampon.indexOf('\n\n')) >= 0; tampon = tampon.slice(i + 2)) {
      const id = /^id: (\d+)$/m.exec(tampon.slice(0, i))?.[1]
      if (id) kimlikler.push(Number(id))
    }
  }
  iptal.abort() // bağlantı koptu (tünel, uyku kipi, yayın)
  return kimlikler
}

const ilk = dinle({}, 2)
while (acik.size === 0) await bekle(5)
yayinla({ alan: 'ev', rev: 1 })
yayinla({ alan: 'ev', rev: 2 })
assert.deepEqual(await ilk, [1, 2])
while (acik.size > 0) await bekle(5)
yayinla({ alan: 'ev', rev: 3 }) // istemci yokken iki değişiklik oldu
yayinla({ alan: 'ev', rev: 4 })
// EventSource yeniden bağlanırken son gördüğü kimliği bu başlıkla kendisi gönderir
assert.deepEqual(await dinle({ 'Last-Event-ID': '2' }, 2), [3, 4])
sunucu.closeAllConnections()
sunucu.close()
console.log('kaçan 3 ve 4 numaralı olaylar yeniden bağlanınca geldi')
```

```cikti
kaçan 3 ve 4 numaralı olaylar yeniden bağlanınca geldi
```

- Olay geçmişi sınırsız tutulamaz. Kimlik, tutulan pencereden eskiyse sunucu "tam eşitleme yap" der (havuzdaki
  eşitlemede bunun karşılığı imleç ve `reset`).
- Kimlik **sıralı ve kalıcı** olmalı (veritabanı sürümü, artan sayaç). Süreç belleğindeki sayaç yeniden
  başlatmada sıfırlanır; istemcinin `Last-Event-ID: 812`'si yeni süreçte anlamsız olur.
- WebSocket'te bu mekanizma yoktur: sıra numarasını ve "şuradan sonrasını gönder" mesajını kendiniz yazarsınız.
- Yeniden bağlanma beklemesine titreme ekleyin: yeni sürüm yayınlanınca binlerce istemci aynı saniyede
  bağlanmasın. Kullanıcı başına bağlantı açma hızını sınırlayın (havuzda dakikada 30).

## Kalp atışı

Boşta duran bağlantıyı vekiller ve yük dengeleyiciler bir süre sonra keser; ölmüş bir istemciyi sunucu ancak yazmaya
çalışınca fark eder. Çözüm: 15–30 sn'de bir yorum satırı (`: nabız\n\n`). Tarayıcı yorum satırını olay saymaz.
Havuzdaki sunucu 25 sn'de bir gönderir ([`events/routes.ts`](../../uygulama/api/src/modules/events/routes.ts)).

## Vekil ve zaman aşımı sorunları

| Belirti                                                | Neden                                                     | Çözüm                                                           |
| ------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| Olaylar toplu ve dakikalar sonra geliyor               | Vekil yanıtı arabelleğe alıyor                            | nginx: `proxy_buffering off`; yanıta `X-Accel-Buffering: no`    |
| Yerelde çalışıyor, yayında olay hiç gelmiyor           | Sıkıştırma ara katmanı akışı tamponluyor                  | `text/event-stream`'i sıkıştırmadan muaf tutun                  |
| Bağlantı tam 60 sn'de bir kopuyor                      | Vekilin/yük dengeleyicinin boşta zaman aşımı              | Kalp atışı aralığı < zaman aşımı; vekilde okuma süresini uzatın |
| Yayından sonra eski sunucu kapanmıyor                  | Açık akışlar kapanışı bekletiyor                          | Kapanışta bütün akışları sunucu kapatır                         |

Havuzdaki örnek yapılandırmalar (Caddy `flush_interval -1`, nginx `proxy_buffering off`, `proxy_read_timeout`):
[`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ters vekil ve HTTPS". Kapanışta akışları kapatma:
[`index.ts`](../../uygulama/api/src/index.ts).

## Çok sunuculu yayın

Bağlantı hangi sunucu kopyasına açıldıysa olayı o kopya gönderebilir. Değişiklik A kopyasında olur, istemci B'ye
bağlıysa bellek içi bir yayın merkezi onu bulamaz. Seçenekler:

- **Yayın/abone (pub/sub) katmanı:** her kopya değişikliği ortak bir kanala yayınlar, her kopya kendi
  istemcilerine iletir (Postgres `LISTEN/NOTIFY`, Redis yayın, bir mesaj aracısı).
- Bu kanallar da mesaj kaybedebilir; dürt-sonra-çek kalıbı kaybı zararsız kılar, istemci ayrıca odaklanınca ve
  belirli aralıklarla eşitler.
- Havuzdaki merkez bellek içi ve tek süreçlidir; sınırı ve çok kopyaya geçişin yolu dosyanın başında yazar
  ([`events/hub.ts`](../../uygulama/api/src/modules/events/hub.ts)).

## Dürt, sonra çek

Havuzdaki uygulama bu kalıbı uygular: bir alanda kayıt değişince alanın üyelerine yalnız
`{"workspaceId", "rev", "clientId"}` gider; istemci kendi değişikliğinin dürtmesini (`clientId` kendisiyse) yok
sayar, ötekinde normal eşitleme ucunu çağırır ([`docs/API.md`](../../uygulama/docs/API.md) → `GET /api/events`,
[`ESITLEME.md`](../../uygulama/docs/ESITLEME.md)). Kazanımlar:

- Yetki ve veri **tek yoldan** (eşitleme ucu) geçer; anlık kanalda veri sızdırma riski yoktur.
- Art arda gelen on dürtme tek bir çekmeye birleşir (istemci kısa bir süre bekleyip bir kez çeker).
- Dürtme kaybolursa veri kaybolmaz.
- Kanal değişebilir (SSE yerine WebSocket, yoklama) ama veri modeli değişmez.

Olayın içine verinin kendisini koymak ancak veri küçük, herkese aynı ve kaybı önemsizse mantıklıdır (ör. "çevrimiçi
kişi sayısı").

## Kimlik ve güvenlik

- Akış açılırken oturum denetlenir; oturum kapanınca (çıkış, şifre değişimi, hesap kapatma) sunucu akışı **keser**.
  Havuzdaki merkez bunu oturum kimliğine göre yapar.
- Kullanıcı başına açık akış sınırı (havuzda 10; aşılınca en eskisi kapanır): unutulmuş sekmeler kaynak tüketmesin.
- WebSocket el sıkışmasında tarayıcı çerezleri gönderir: `Origin` başlığını denetleyin; yoksa kötü bir site
  kullanıcı adına bağlantı kurar (siteler arası WebSocket ele geçirme).
- Belirteci adres satırına koymayın (`?token=…` günlüklere düşer); gerekiyorsa tek kullanımlık, kısa ömürlü bağlantı
  bileti kullanın.
- Kişisel veri içeren olayı yalnız yetkili kullanıcının bağlantısına gönderin; "herkese yayınla, istemci süzsün"
  yapılmaz.

## Tuzaklar

| Belirti                                                         | Neden                                                    | Çözüm                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Tünelden çıkan kullanıcı arada olan değişiklikleri hiç görmüyor | Kaçan olay telafisi yok                                  | `id` + `Last-Event-ID` ya da yeniden bağlanınca tam eşitleme |
| Sunucu yeniden başlayınca istemciler eski olayları yeniden aldı/hiç almadı | Olay kimliği süreç belleğindeki sayaç           | Kalıcı, sıralı kimlik (veritabanı sürümü)                   |
| Yayından hemen sonra veritabanı ve sunucu yükü tavan yaptı      | Bütün istemciler aynı anda yeniden bağlanıp eşitledi     | Yeniden bağlanmaya titreme; bağlantı açma hız sınırı        |
| Olaylar yalnız aynı sunucuya bağlı kullanıcılara gidiyor        | Bellek içi yayın, birden çok kopya                       | Yayın/abone katmanı + dürt-sonra-çek                        |
| Olaylar gecikmeli ve toplu geliyor                              | Vekil arabelleği ya da sıkıştırma                        | Arabelleği kapatın, akışı sıkıştırmayın                     |
| Çıkış yapan kullanıcının sekmesine olay gitmeye devam etti      | Oturum iptalinde akış kapatılmıyor                       | Oturum kimliğine göre akışı kesin                           |
| Başka bir site kullanıcı adına WebSocket açtı                   | El sıkışmada `Origin` denetimi yok                       | İzinli köken listesi                                        |
| Sunucunun bellek ve dosya tanıtıcıları doldu                    | Kullanıcı başına sınırsız bağlantı, ölü bağlantılar      | Kullanıcı başı sınır + kalp atışı                           |

## Denetim listesi

- [ ] Gereken gecikme yazıldı ve en basit yeterli araç seçildi (yoklama → SSE → WebSocket).
- [ ] Olaylar sıralı ve kalıcı bir kimlik taşıyor; yeniden bağlanınca kaçanlar geliyor ya da tam eşitleme yapılıyor.
- [ ] Anlık kanal yalnız dürtüyor; veri yetki denetimli API'den çekiliyor.
- [ ] Kalp atışı vekil zaman aşımından kısa; vekilde arabellek kapalı, akış sıkıştırılmıyor.
- [ ] Yeniden bağlanmada bekleme + titreme; bağlantı açma hız sınırı ve kullanıcı başı akış sınırı var.
- [ ] Oturum iptali akışı kesiyor; WebSocket'te `Origin` denetleniyor.
- [ ] Çok kopya varsa yayın/abone katmanı var; yoksa tek kopya kuralı belgeli.
- [ ] Düzgün kapanışta akışlar kapatılıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Anlık güncelleme için SSE kullan; olay yalnız `{kaynak, sürüm}` taşısın, istemci veriyi
  normal uçtan çeksin. Her olaya kalıcı sıralı `id` ver, `Last-Event-ID` ile kaçanları gönder. 25 sn'de bir yorum
  satırı. Oturum kapanınca akışı kapat. Yeniden bağlanmada titremeli bekleme."
- **Tipik hatalar:** küçük bir bildirim için WebSocket kütüphanesi kurmak; olayın içine bütün kaydı koymak (yetki
  kontrolü olmadan); yeniden bağlanmayı ve telafiyi hiç düşünmemek; sıkıştırma ara katmanını SSE'ye uygulamak;
  `EventSource`'a `Authorization` başlığı eklemeye çalışmak; sunucuda bağlantıları silmeyi unutmak (bellek sızıntısı).
- **Çıktıda arayın:** `id:` satırı yazılıyor mu; `last-event-id` okunuyor mu; `req.on('close'` ile bağlantı
  listeden çıkıyor mu; kalp atışı `setInterval`'ı kapanışta temizleniyor mu.
- **Test isteyin:** "koparılan istemci yeniden bağlanınca kaçan olayları alır", "çıkış yapınca akış kapanır"
  (havuzdaki SSE test yardımcısı: [`test/support/sse.ts`](../../uygulama/api/test/support/sse.ts)).

## İlgili

- [HTTP temelleri](http-temelleri.md) · [Sunucu mimarisi](sunucu-mimarisi.md) (düzgün kapanış) ·
  [Hız sınırı ve kötüye kullanım](hiz-siniri-ve-kotuye-kullanim.md) · [API tasarımı](api-tasarimi.md) (uzun süren
  işlemin durumunu izleme)
