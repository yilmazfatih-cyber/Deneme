# mini_git — sürüm denetimi, içeriden

Git'in çekirdeği: dosyaların her sürümünü **içeriğinin özetiyle (SHA-1) adlandırılmış** nesneler olarak
saklamak; anlık görüntüleri (commit) zincirlemek; dallar, fark (Myers) ve üç yollu birleştirme. Nesneler
**bayt bayt gerçek git'le aynıdır**: aynı dosyalar ve aynı yazar/tarihle aynı commit sha'sı çıkar, gerçek
git bizim nesne depomuzu okur ve `git fsck --strict` onaylar (testli). Yalnız standart kitaplık.

```bash
python -m mini_git init
python -m mini_git add .
python -m mini_git commit -m "İlk kayıt"          # yazar: MINIGIT_AUTHOR="Ad <eposta>"
python -m mini_git checkout -b ozellik
python -m mini_git status
python -m mini_git diff [--staged] [sürüm [sürüm]]
python -m mini_git log [--oneline] [-n 5]
python -m mini_git branch [ad] [-d|-D ad]   ·   tag v1.0 [sürüm]   ·   checkout main   ·   merge ozellik
python -m mini_git cat-file HEAD              # nesnenin içini göster (öğrenmek için)
```

Python'dan: `from mini_git import Repository, add, commit, merge, log, diff` (bkz. `__init__.py`).
Sürüm yazımı: `HEAD`, dal, etiket, kısa sha (≥ 4 hane), `HEAD~2` (2. ilk ebeveyn).

## Nasıl çalışır

```
 çalışma ağacı ── add ──► index (hazırlık) ── commit ──► commit nesnesi ──► dal işaretçisi ilerler
   dosyalar               yol → (kip, blob sha)          tree + ebeveyn(ler)     refs/heads/main
```

- **Nesneler** (`objects.py`): her şey `"<tür> <uzunluk>\0<gövde>"` baytlarının SHA-1'iyle adlanır ve zlib'le
  `.minigit/objects/ab/cdef…` yoluna yazılır. Aynı içerik bir kez saklanır (içerik adresli).
- **Ağaç** (`repo.write_tree`): index'teki düz yol listesi klasör klasör tree nesnelerine dönüşür.
- **Dallar ve etiketler**: `refs/heads/<ad>`, `refs/tags/<ad>` dosyalarında tek satır sha. `HEAD` ya bir
  dalı (`ref: refs/heads/main`) ya da doğrudan bir commit'i (kopuk HEAD) gösterir.
- **Fark** (`diff.py`): Myers'ın O((N+M)·D) algoritması en kısa düzenleme betiğini bulur; çıktı `git diff`
  biçiminde (3 satır bağlam, aralarındaki boşluk ≤ 6 satır olan parçalar birleşir).
- **Birleştirme** (`merge.py`, `switch.py`): ortak ata bulunur. Hedef zaten atamızsa "zaten güncel"; biz
  hedefin atasıysak **hızlı ileri sarma** (yalnız işaretçi ilerler). Değilse dosya dosya üç yollu
  birleştirme: bir taraf değiştirdiyse onunki; ikisi de değiştirdiyse satır düzeyinde **diff3** (üç
  dosyada da değişmemiş satırlar sabit nokta; aradaki parçada yalnız bir taraf değiştiyse o, ikisi de
  aynı değiştiyse o, yoksa çakışma işaretleri). Çakışma yoksa iki ebeveynli commit; varsa `MERGE_HEAD`
  yazılır, kullanıcı düzeltip `add` + `commit` eder.

## Bayt düzenleri

```
blob:    "blob 6\0" + b"merhaba"…                           sha = SHA-1(bu baytlar)

tree:    "tree <uzunluk>\0" + girdi + girdi + …
         girdi = "<kip> <ad>\0" + 20 baytlık İKİLİ sha
         kip: 100644 dosya · 100755 çalıştırılabilir · 40000 klasör (başında 0 YOK)
         sıra: ada göre bayt sırası, ama klasör adı sonunda "/" varmış gibi karşılaştırılır:
               "a.b/" < "a.txt" < "a/"   →   a.b (klasör), a.txt (dosya), a (klasör)

commit:  "commit <uzunluk>\0" +
         "tree 2534d7…\n"
         "parent 168e63…\n"                      (0, 1 ya da 2 satır; birleştirmede 2)
         "author Ayşe Yılmaz <ayse@ornek.tr> 1700000000 +0000\n"
         "committer Ayşe Yılmaz <ayse@ornek.tr> 1700000000 +0000\n"
         "\n"
         "İlk kayıt\n"                           (ileti hep "\n" ile biter)

.minigit/index (bizim biçimimiz, git'inki DEĞİL — bilerek okunur metin):
         MINIGIT-INDEX 1
         100644 587be6b4c3f93f93c489c0111bba5596147a26cb\ta.txt
         100755 1a2485251c33a70432394c93fb89330ef214bfc9\tcalistir.sh
```

## Dosya haritası

| Dosya         | Sorumluluk                                                                       |
| ------------- | -------------------------------------------------------------------------------- |
| `objects.py`  | nesne biçimleri (blob/tree/commit), SHA-1, zlib, `ObjectStore`                     |
| `repo.py`     | `Repository`: `.minigit` yerleşimi, başvurular, sürüm çözme, index, çalışma ağacı, tree yazma/okuma |
| `commands.py` | add, commit, status, log, diff, branch, tag; `Signature`                          |
| `switch.py`   | checkout ve merge (çalışma ağacını güvenle değiştiren komutlar)                  |
| `diff.py`     | Myers düzenleme betiği, birleşik fark, LCS başvurusu                              |
| `merge.py`    | ortak ata, diff3 satır birleştirme, ağaç birleştirme                              |
| `__main__.py` | komut satırı                                                                       |

## Güvenceler (testle kanıtlanan)

- **Gerçek git'le aynı sha:** Türkçe adlı iç içe klasörler, satır sonu olmayan ve boş dosyalar,
  çalıştırılabilir betik ve çok satırlı iletiyle iki commit; blob, tree ve commit sha'ları gerçek git'in
  ürettiğiyle aynı. Gerçek git bizim depomuzda `rev-parse`, `cat-file`, `ls-tree` çalıştırır;
  nesnelerimiz `git fsck --strict`'ten geçer. (git kurulu değilse bu testler atlanır.)
- **Birleştirme git'le aynı karar verir:** rastgele üç yollu durumlarda (hızlı: 40, `--uzun`: 400)
  "çakışma var mı" kararı `git merge-file` ile aynı, çakışmasız sonuç bayt bayt aynı. Geliştirme
  sırasında 1000 durumda ölçüldü: 212 temiz sonuç aynı; 788 çakışmanın 587'sinde işaretli çıktı da aynı.
- **Myers en kısadır:** düzenleme betiği uygulanınca hedefi verir ve uzunluğu LCS ile hesaplanan en küçük
  değere eşittir (Hypothesis).
- **Veri kaybetmeme kuralları:** kaydedilmemiş değişiklik varken checkout/merge reddedilir; izlenmeyen
  dosyanın üzerine yazılacaksa reddedilir; birleştirilmemiş dal `-D` olmadan silinmez; çakışma
  çözülmeden commit edilemez.

## Sağlamadıkları (dürüst sınırlar)

- **Çakışma blokları git'inkinden bazen geniştir:** git çakışma bölgesindeki ortak satırları kırpar ve
  bölgeyi böler ("zealous" iyileştirme); burada yapılmaz (ölçümde çakışmaların ~%25'inde fark).
- **Index git'in ikili biçiminde değil:** `.minigit/index` metindir; gerçek git o klasörde çalışma ağacı
  komutları (`status`, `add`) çalıştıramaz, yalnız nesne/başvuru komutları çalışır.
- **Yok:** uzak depo (fetch/push/clone), paket dosyaları (packfile), `.gitignore`, sembolik bağ,
  açıklamalı etiket nesnesi, rebase/cherry-pick/stash, `merge --abort`, yeniden adlandırma algılama,
  alt modüller. Satır sonu dönüştürme yapılmaz (bayt neyse o). Yollarda satır sonu karakteri olamaz.
- **Ortak ata:** çapraz (criss-cross) geçmişte en yeni ata seçilir; git'in "recursive" stratejisi gibi
  ataları birleştirmez.
- **Başarım:** her `status` bütün dosyaların özetini yeniden hesaplar (git boyut/zaman önbelleği tutar).

## Buradan nereye

1. **`.gitignore`:** `repo.working_files`'a desen süzgeci (`fnmatch`), klasör desenleri ve `!` istisna.
2. **Paket dosyaları:** çok nesneyi delta sıkıştırmayla tek dosyada saklamak; `ObjectStore.read`'e
   ikinci arama yolu.
3. **Uzak depo:** başka bir `.minigit`'ten eksik nesneleri ve başvuruları kopyalayan `fetch`/`push`.
4. **Çakışma iyileştirme:** çakışma bloğunun başındaki/sonundaki ortak satırları dışarı alıp bloğu bölmek
   (git ile tam aynı çıktı için).
5. **`merge --abort` ve `stash`:** birleştirme öncesi index ve çalışma ağacını ayrı bir commit/tree olarak
   saklayıp geri yüklemek.
6. **SHA-256 depolar:** `objects.py`'de özet işlevi ve 32 baytlık ikili ad.
