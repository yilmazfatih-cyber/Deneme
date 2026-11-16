# Mezar taşı temizliği: tasarım notu (uygulanmadı)

**Durum:** yalnız tasarım. Bugün silinen kayıtlar (`records.deleted = 1`, "mezar taşı") hiç silinmez. Bu belge,
ileride temizlik gerekirse veri kaybı ve "dirilen kayıt" hatası olmadan nasıl yapılacağını anlatır.

## Sorun

Mezar taşı, silmenin çevrimdışı cihazlara ulaşmasının tek yoludur: cihaz bir sonraki eşitlemede imlecinden
sonraki kayıtları alır ve `deleted: true` görünce yereldeki kaydı siler. Mezar taşını sunucudan silersek:

1. **Kaçırılan silme:** O silmeden önceki bir imleçle gelen cihaz, silmeyi hiç görmez; kaydı yerelde tutar ve
   kullanıcıya göstermeye devam eder.
2. **Dirilme:** Aynı cihaz, o kayda bekleyen bir `patch` gönderirse sunucuda kayıt yoktur → `not_found` ile
   reddedilir (bu zararsız); ama bir `put` gönderirse kayıt sunucuda yeniden doğar.
3. **`restore` kırılır:** Mezar taşı yoksa "silmeyi geri al" `not_found` alır.

Bugünkü protokol (sürüm 1) imleci sunucunun bilgisinden **geride** olan cihaza "eksik silme olabilir" diyecek bir
alana sahip değildir (`reset` yalnız imleç İLERİDEYKEN kullanılır).

## Önerilen tasarım

1. **Saklama süresi:** `TOMBSTONE_RETENTION_DAYS` (ör. 90). Bu süreden eski mezar taşları temizlenebilir.
2. **Alan başına ufuk:** `workspaces.purged_rev` sütunu (yeni migrasyon). Temizlik, bir alandaki
   `deleted = 1 AND updated_at < şimdi − süre` kayıtları siler ve silinenlerin en büyük `rev`'ini
   `purged_rev`'e yazar (aynı işlemde).
3. **Protokol sürüm 2 — anlık görüntü (snapshot):** istemcinin imleci `0 < imleç < purged_rev` ise sunucu o alan
   için `snapshot: true` döner ve kayıtları imleç yerine baştan (rev 0'dan) sayfalar. İstemci bu modda,
   sayfalama bitince, **sunucunun bildirdiği hâli olup da** anlık görüntüde gelmeyen kayıtlarını yerelden siler
   (bekleyen yerel değişikliği olanlar kurallara göre yeniden tabanlanır). Bu, `planReconcile`
   (`shared/src/replica.ts`) ve `shared/src/testing/memoryServer.ts` değişikliği demektir; `PROTOCOL_VERSION` 2 olur.
4. **Uygunluk senaryoları** (önce bunlar yazılır, `shared/src/testing/conformance.ts`):
   - eski imleçli cihaz temizlikten sonra eşitleyince silinen kaydı yerelden kaldırır;
   - temizlikten sonra eski cihazın `put`'u kaydı yeni bir kayıt olarak açar (bilinçli: kullanıcı yazmıştır);
   - `restore` temizlenmiş kayıt için `not_found` döner ve istemci bunu kullanıcıya "geri alınamadı" diye gösterir.
5. **Bakım işi:** `api/src/maintenance.ts`'e temizlik adımı (günde bir, küçük partiler hâlinde: kilit uzun
   tutulmasın). Silinen satır sayısı ve süre günlüğe yazılır.
6. **Daha akıllı ufuk (isteğe bağlı):** sunucu her eşitlemede istemcinin gönderdiği imleçleri
   `client_cursors(client_id, workspace_id, cursor, seen_at)` tablosuna yazar; yalnız **son 90 günde görülen
   bütün cihazların** imlecinden küçük `rev`'li mezar taşları silinir. Böylece etkin cihazlar hiç anlık görüntüye
   düşmez; yalnız uzun süre açılmamış cihazlar düşer.

## Neden şimdi yapılmadı

Protokol değişikliği iki tarafı (shared + web deposu + API) birlikte etkiler ve yakınsama testleriyle
doğrulanmalıdır. Mezar taşları küçük JSON satırlarıdır; tipik bir kişisel/aile uygulamasında yıllarca sorun
yaratmaz. Ölçüt: `SELECT count(*) FROM records WHERE deleted = 1` canlı kayıtların birkaç katına çıkarsa bu
tasarım uygulanır.
