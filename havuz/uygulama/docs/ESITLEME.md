# Eşitleme: nasıl çalışır?

Bu belge, cihazların verisinin nasıl aynı kaldığını **sade Türkçeyle** anlatır. Kodun kendisi
`shared/src/sync.ts` (sözleşme ve "bir değişikliği uygula"), `shared/src/replica.ts` (istemcinin uzlaştırma
mantığı) ve `shared/src/testing/memoryServer.ts` (sunucunun başvuru davranışı) içindedir. Web tarafı bu ortak
kodu Dexie (IndexedDB) üstünde çalıştırır: `web/src/lib/sync/`.

Satır numaraları 16 Kasım 2026 hâline göredir; kod değişince kayabilir, işlev adları kaymaz.

## Kısaca

1. Kullanıcı bir şey yazınca **önce kendi cihazına** yazılır. İnternet gerekmez.
2. Aynı anda bu yazma bir **değişiklik** olarak **giden kutusuna** konur.
3. Bağlantı olunca giden kutusu `POST /api/sync` ile gönderilir; aynı yanıtla başka cihazların değişiklikleri de gelir.
4. Gelen yanıt, cihazdaki veriyle **tek bir veritabanı işleminde** uzlaştırılır.

Tek değişmez kural: **ekranda görünen = sunucunun son bildirdiği + henüz onaylanmamış kendi değişikliklerim.**

## Kavramlar

### Değişiklik (mutation)

Her yazma dört türden biridir (`shared/src/sync.ts:49` → `mutationSchema`):

| Tür       | Ne yapar                                                                       |
| --------- | ------------------------------------------------------------------------------ |
| `put`     | Kaydı bütünüyle yazar (yeni kayıt ya da tam üzerine yazma; silinmişi diriltir) |
| `patch`   | Yalnız verilen alanları değiştirir (düzenlemelerde HEP bu kullanılır)          |
| `delete`  | Kaydı silinmiş işaretler                                                       |
| `restore` | Silinmiş kaydı geri getirir                                                    |

Her değişikliğin cihaz içinde artan bir **sıra numarası** (`mid`) vardır. Web'de bu numarayı Dexie verir
(`outbox` tablosu, `++mid`: `web/src/lib/store/schema.ts`). Numara hiç geri gitmez.

"Bir değişikliği bir kayda uygula" kuralı **tek bir işlevdir** ve sunucuda da istemcide de aynen çalışır:
`applyMutation` (`shared/src/sync.ts:210`). İki tarafın aynı sonuca varmasının sırrı budur.

Web'de yazma yolu: `web/src/lib/store/records.ts` → `writeRecord`. Önce `applyMutation` ile doğrular ve
uygular (geçersiz veri hiçbir şeyi değiştirmez), sonra görünen hâli ve giden kutusu satırını **aynı Dexie
işleminde** yazar. Düzenlemede yalnız gerçekten değişen alanlar gönderilir (`diffPatch`).

### İmleç (cursor)

Sunucu her çalışma alanındaki her değişikliğe artan bir numara (`rev`) verir (`memoryServer.ts:133`).
Cihaz, her alan için "en son hangi numarayı gördüm" bilgisini saklar: **imleç**. İstek bu imleçleri taşır
(`syncRequestSchema`, `sync.ts:107`); sunucu yalnız imleçten sonraki kayıtları döndürür ve yeni imleci verir
(`workspaceChangesSchema`, `sync.ts:125`). Çok kayıt varsa yanıt sayfalanır (`more: true`,
alan başına en çok 500 kayıt: `sync.ts:28`); web motoru `more` bitene dek kendiliğinden yeniden ister
(`web/src/lib/sync/engine.ts` → `run`).

### Mezar taşı (tombstone)

Silinen kayıt gerçekten silinmez; `deleted: true` işaretlenir (`sync.ts:223`). Neden? Çevrimdışı bir cihaz
silmeyi ancak böyle öğrenebilir: bir sonraki eşitlemede kaydı `deleted: true` olarak görür. Bu yüzden silme
**geri alınabilir** (`restore`) ve "Son silinenler" ekranı mümkündür. Mezar taşları bugün hiç temizlenmez;
ileride gerekirse güvenli yöntem: `docs/MEZAR_TASI.md` (API ekibinin tasarım notu).

### Alan düzeyinde "son yazan kazanır"

`patch` yalnız verdiği alanları değiştirir (`sync.ts:219`). İki cihaz **farklı alanları** değiştirirse
(biri "tamamlandı", öteki "not") ikisi de korunur. **Aynı alanı** değiştirirlerse sunucuya **son varan**
kazanır; cihaz saatine bakılmaz (saatler yanlış olabilir). Sıra, sunucunun değişikliği işleme sırasıdır.

### Yeniden tabanlama (rebase)

Sunucudan bir kaydın yeni hâli geldiğinde cihazda o kayıt için **henüz onaylanmamış** değişiklik olabilir.
Görünen hâl şöyle hesaplanır: sunucunun yeni hâli + bekleyen değişiklikler sırayla yeniden uygulanır
(`rebase`, `sync.ts:238`). Bu, `planReconcile` içinde her etkilenen kayıt için yapılır (`replica.ts:144`).
Böylece kullanıcının çevrimdışı yazdığı şey, başkasının değişikliği gelince **kaybolmaz**.

Eski bir sayfa geç gelirse yeni hâli ezmez: gelen kayıt yalnız `rev` daha büyükse kabul edilir
(`replica.ts:177`). İmleç de hiç geri gitmez.

### Onay ve yinelenen gönderim

Yanıt, sunucunun bu cihazdan işlediği son sıra numarasını taşır (`lastMutationId`, `sync.ts:142`). Cihaz bu
numaraya kadarki değişiklikleri giden kutusundan siler. Yanıt yolda kaybolursa cihaz aynı değişiklikleri yeniden
gönderir; sunucu daha önce işlediklerini atlar (`memoryServer.ts:113`). Yani gönderim **bir kez etkili** olur.
Web testi: `web/test/sync/engine.test.ts` → "yanıt yolda kaybolursa…".

### Reddetme

Sunucu bir değişikliği kabul etmeyebilir: veri şemaya uymuyor, kullanıcının yazma yetkisi yok (izleyici),
kayıt yok… Reddedilen değişiklik yanıtta listelenir (`rejected`, `sync.ts:144`) ve **yeniden denenmez**
(`memoryServer.ts:114`). Cihazda kaydın görünen hâli sunucunun bildiğine döner (rebase bunu kendiliğinden
yapar). Web, kullanıcıya bildirim gösterir ve son 20 reddi Ayarlar → Eşitleme'de listeler
(`web/src/lib/sync/apply.ts` → `rejections`).

### Erişim kaybı

Yanıt, kullanıcının **şu an** üyesi olduğu alanların listesini taşır. Listede olmayan ama cihazda izi olan alan
"düşürülür": o alanın kayıtları ve bekleyen değişiklikleri cihazdan silinir (`replica.ts:149`). Kullanıcıya
"… alanına erişiminiz kalktı" bildirimi gösterilir.

### Reset (sunucu eski bir yedeğe döndü)

Cihazın imleci sunucunun bildiğinden **ilerideyse** (`memoryServer.ts:160`), sunucu eski bir yedekten geri
yüklenmiş demektir. Sunucu `reset: true` döner (`sync.ts:136`); cihaz hiçbir şeyi kendiliğinden silmez,
**eşitlemeyi durdurur** ve kullanıcıya sorar:

- **Buradakini gönder** (önerilen): cihazdaki her kayıt sunucuya yeniden yazılır (`put`/`delete`).
- **Sunucudakini al**: cihazdaki kayıtlar ve bekleyen değişiklikler atılır, alan baştan indirilir.

Başvuru gerçekleme: `MemoryReplica.resolveReset` (`testing/memoryReplica.ts:133`); web:
`web/src/lib/sync/apply.ts` → `resolveReset`, pencere: `web/src/features/sync/SyncNotices.tsx`.
Karar verilene dek **bütün** eşitleme durur (yalnız o alan değil): bekleyen bir değişikliğin geri sarılmış
sunucuya uygulanıp yerel veriyi bozmasını önlemek için bilinçli bir seçimdir.

## Web motoru (`web/src/lib/sync/`)

| Dosya         | Görevi                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| `apply.ts`    | İsteği kur (`readSyncRequest`), yanıtı TEK işlemde uygula (`applySyncResponse`), reset kararı |
| `engine.ts`   | Tek uçuş, döngü (`more`), üstel geri çekilme, 401/sürüm/413 durumları, olaylar                |
| `lock.ts`     | Çok sekme: tur aynı anda tek sekmede (Web Locks; yoksa veritabanında süreli kira)             |
| `triggers.ts` | Ne zaman eşitlenir: yerel yazma (gecikmeli), çevrimiçi olma, sekmeye dönme, aralık, dürtme    |
| `events.ts`   | `GET /api/events` akışını `fetch` ile okur; `poke` gelince eşitleme ister                     |
| `status.ts`   | Gösterge için durum: çevrimdışı / eşitleniyor / eşitlendi / sorun var                         |

**Eşdeğerlik kanıtı:** `web/test/sync/equivalence.test.ts`, aynı rastgele senaryoyu Dexie deposunda ve
başvuru gerçeklemesi `MemoryReplica`'da adım adım koşturur; her adımda kayıtlar, sunucu anlık görüntüleri,
giden kutusu, imleçler, alanlar ve reset durumu birebir aynı olmalıdır (12 tohum × 220 adım; red, erişim kaybı,
reset ve sayfalama durumlarından geçtiği de denetlenir).

## Sınırlar: ne zaman yetmez?

- **Aynı alana eşzamanlı yazma birleşmez.** İki kişi aynı görevin notunu aynı anda değiştirirse biri kazanır,
  öteki kaybolur (alan düzeyinde son yazan kazanır). Ortak metin düzenleme (Google Docs gibi) için CRDT gerekir;
  bu temel bunu yapmaz.
- **Kayıtlar arası kural yok.** Sunucu "görevin listesi var mı" diye bakmaz (çevrimdışı yazmalar her sırayla
  gelebilir); arayüz silinmiş listedeki görevi "listesiz" gösterir. Benzersizlik (ör. "aynı adla iki liste
  olmasın") istenirse uygulama düzeyinde ele alınmalıdır.
- **Yetki alan düzeyindedir**, kayıt düzeyinde değil: bir alandaki herkes (rolüne göre) bütün kayıtları görür.
- **Her şey indirilir.** Cihaz, üyesi olduğu alanların bütün kayıtlarını saklar; çok büyük veri (yüz binlerce
  kayıt, büyük dosyalar) için kısmi eşitleme gerekir. Kayıt başına sınır 64 KB'tır (`sync.ts:30`).
- **Mezar taşları birikir** (temizlenmez). Çok sık silinen veride depolama büyür; bkz. `docs/MEZAR_TASI.md`.
- **Şema değişikliği geriye uyumlu olmalı.** Yeni alan `.default(...)` ile eklenir; alan silmek ya da türünü
  değiştirmek eski cihazların verisini bozar (kural testi: `shared/test/entities.test.ts`).
- **Protokol sürümü** (`PROTOCOL_VERSION`) değişirse eski istemciler `upgrade_required` alır ve "sayfayı
  yenileyin" denir; iki sürüm aynı anda desteklenmez.
