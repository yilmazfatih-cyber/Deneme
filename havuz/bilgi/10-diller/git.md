---
baslik: Git
ozet: Anlık görüntü, dal ve üç alan zihinsel modeli, günlük akış, iyi kayıt iletisi, "şunu yaptım → şununla geri al" tablosu, çakışma çözme, rebase ile merge, yanlışlıkla gönderilen sır ve büyük dosya.
etiketler: [git, surum-denetimi, geri-alma, guvenlik, komut-satiri]
duzey: temel
guncellik: 2026-11
---

# Git

> Bu notu ne zaman okumalı: bir değişikliği geri almak istediğinizde; birleştirmede çakışma çıktığında; yanlış dala
> kayıt attığınızda; depoya parola ya da büyük dosya girdiğinde; modele kayıt (commit) ya da gönderme (push) işi
> verirken.

## Temel fikir

- **Kayıt (commit)** bütün projenin o anki **anlık görüntüsüdür** (fark değil) ve bir önceki kayda bağlıdır. Kayıtlar
  değişmez; "değiştirmek" yeni kayıt üretmektir.
- **Dal (branch) yalnızca bir işaretçidir**: bir kaydın adını taşıyan küçük bir etiket. Dal açmak bedavadır.
- Üç alan vardır: **çalışma alanı** (diskteki dosyalar) → `git add` → **sahne** (index, sonraki kayda girecekler)
  → `git commit` → **geçmiş**. `git status` hangi dosyanın nerede olduğunu söyler.
- Neredeyse her şey geri alınabilir: kaydedilmiş her şey `reflog`'da bir süre durur. Geri alınamayanlar:
  kaydedilmemiş değişikliği silmek (`restore`, `reset --hard`, `clean`) ve başkasının zaten indirdiği geçmişi
  yeniden yazmak.
- **Gönderilmiş (push) geçmiş yeniden yazılmaz** (`amend`, `rebase`, `reset` yalnız gönderilmemiş kayıtlarda).
  Gönderileni geri almanın yolu `revert`'tür.

## Üç alan

Örneklerdeki ilk dört satır deneme deposunu kullanıcının ayarlarından yalıtır; kendi işinizde gerekmez.

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
echo "v1" > not.txt
git status --short # ?? izlenmiyor
git add not.txt
git status --short # A  sahnede (sol sütun = sahne)
git commit -qm "Not ekle"
echo "v2" >> not.txt
git status --short # " M" çalışma alanında değişti (sağ sütun = çalışma alanı)
git add not.txt
echo "v3" >> not.txt
git status --short # MM bir kısmı sahnede, bir kısmı değil: kayda yalnız v2 girer
git branch ozellik
test "$(git rev-parse ozellik)" = "$(git rev-parse main)" && echo "yeni dal = aynı kaydı gösteren işaretçi"
```

```cikti
?? not.txt
A  not.txt
 M not.txt
MM not.txt
yeni dal = aynı kaydı gösteren işaretçi
```

## Günlük akış

| Adım                                   | Komut                                                     | Not                                                 |
| -------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| Güncel ana dalla başla                  | `git switch main && git pull`                             |                                                     |
| İş için dal aç                          | `git switch -c randevu-iptal`                             | Bir iş = bir dal                                    |
| Ne değişti                              | `git status`, `git diff`                                  | Kayıttan önce mutlaka okuyun                        |
| Seçerek sahneye al                       | `git add -p` ya da dosya adlarıyla `git add a.ts b.ts`    | `git add .` istenmeyen dosyaları (sır, çıktı) da alır |
| Sahnedekini gözden geçir                 | `git diff --staged`                                       |                                                     |
| Kaydet                                  | `git commit` (ileti düzenleyicide)                        | Aşağıdaki ileti biçimi                              |
| Ana daldaki yenilikleri al               | `git pull --rebase` (yalnız sizin dalınızsa) ya da `git merge main` |                                           |
| Gönder                                  | `git push -u origin randevu-iptal`                        | Zorla göndermek gerekirse `--force-with-lease`, asla `--force` |
| İncelemeye aç                           | Çekme isteği (PR)                                         | Ana dala doğrudan gönderilmez                       |

## İyi kayıt iletisi

```text
randevu: iptal onayı dialog penceresine taşındı

Onay window.confirm ile açılıyordu; ekran okuyucu düğmeleri okumuyor,
sol el kipinde Evet/Hayır yer değiştiriyordu. <dialog> + showModal
kullanıldı; Esc vazgeçer.
```

- İlk satır: `kapsam: ne yapıldı`, en çok ~72 karakter, sonda nokta yok. Gövde ile arasında boş satır.
- Gövde **neden**i anlatır; "ne"yi fark zaten gösterir.
- Bir kayıt = bir mantıksal değişiklik. Biçimlendirme ile davranış değişikliğini ayrı kayıtlara koyun.
- Kötü iletiler: `düzeltme`, `update`, `wip`, `son hali`, `asdf`. Altı ay sonra `git log` ile hatayı arayan kişi
  (ya da model) bunlardan hiçbir şey öğrenemez.

## Geri alma tarifleri

| Şunu yaptım                                           | Şununla geri al                                   | Gönderildiyse?                      |
| ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Dosyayı bozdum, son kayda dönmek istiyorum             | `git restore dosya` (kaydedilmemiş değişiklik **silinir**) | —                          |
| Yanlış dosyayı sahneye aldım                           | `git restore --staged dosya`                      | —                                   |
| Son kaydın iletisi yanlış / bir dosyayı unuttum         | `git add unutulan && git commit --amend`          | Yapmayın; yeni kayıt atın           |
| Son kaydı geri al, değişiklikler dursun                | `git reset --soft HEAD~1`                         | Yapmayın; `git revert`              |
| Gönderilmiş bir kaydı geri al                          | `git revert <kayıt>` (ters kayıt üretir)          | Doğru yol budur                     |
| Yanlış dala kaydettim (gönderilmedi)                   | `git switch -c dogru-dal` → `git switch -` → `git reset --hard HEAD~1` | —              |
| `reset --hard` yaptım, kayıtlar kayboldu                | `git reflog` → `git reset --hard 'HEAD@{1}'`      | —                                   |
| Dalı sildim                                           | `git reflog` → `git branch dal-adi <kayıt>`       | Uzakta da varsa oradan geri alın     |
| Birleştirme / rebase karıştı                           | `git merge --abort` / `git rebase --abort`        | —                                   |
| Yarım işi kenara koymak istiyorum                      | `git stash` → sonra `git stash pop`               | —                                   |
| İzlenen dosyayı `.gitignore`'a ekledim ama hâlâ izleniyor | `git rm --cached dosya` (diskte kalır)          | Geçmişte durmaya devam eder          |

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
for ad in Not A B; do echo "$ad" > "$ad.txt"; git add "$ad.txt"; git commit -qm "$ad ekle"; done

# Kaza: iki kayıt "silindi"
git reset -q --hard HEAD~2
git log --format=%s
# reflog HEAD'in her hareketini tutar
git reflog --format='%gs' | head -2
git reset -q --hard 'HEAD@{1}'
git log --format=%s | head -1

# Gönderilmiş kaydı geri almak: revert yeni bir ters kayıt ekler, geçmiş korunur
git revert --no-edit HEAD > /dev/null
git log --format=%s | head -2
ls
```

```cikti
Not ekle
reset: moving to HEAD~2
commit: B ekle
B ekle
Revert "B ekle"
B ekle
A.txt
Not.txt
```

`reflog` yalnız sizin bilgisayarınızdadır ve kayıtlar orada bir süre durur (varsayılan ayarlarla erişilemeyen kayıtlar
en az 30 gün); kaydedilmemiş değişiklik orada **yoktur**. Riskli bir işten önce `git stash` ya da geçici bir kayıt atın.

## Çakışma çözme

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
echo "Selam" > karsilama.txt
git add karsilama.txt
git commit -qm "Karşılama ekle"
git switch -qc ozellik
echo "Merhaba" > karsilama.txt
git commit -qam "Merhaba yap"
git switch -q main
echo "İyi günler" > karsilama.txt
git commit -qam "İyi günler yap"

if git merge ozellik > /dev/null 2>&1; then echo "beklenmedik"; exit 1; fi
git status --short # UU: iki taraf da değiştirmiş
cat karsilama.txt
# Çözüm: işaretleri silip doğru metni yazın (çoğu zaman iki tarafın birleşimi), sonra add + commit
printf 'Merhaba, iyi günler\n' > karsilama.txt
git add karsilama.txt
git commit -q --no-edit
git log --format=%s --graph
```

```cikti
UU karsilama.txt
<<<<<<< HEAD
İyi günler
=======
Merhaba
>>>>>>> ozellik
*   Merge branch 'ozellik'
|\
| * Merhaba yap
* | İyi günler yap
|/
* Karşılama ekle
```

Çakışma çözerken: `HEAD` tarafı **şu an bulunduğunuz** dal, öteki taraf gelen daldır. "Benimkini al" ya da
"onlarınkini al" demeden önce iki tarafın **neden** değiştiğini okuyun; çoğu zaman doğru sonuç ikisinin birleşimidir.
Bitirdikten sonra `grep -rn '<<<<<<<\|>>>>>>>' .` ile işaret kalmadığını ve testlerin geçtiğini denetleyin.

## rebase ile merge

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
echo "taban" > a.txt
git add a.txt
git commit -qm "Taban"
git switch -qc ozellik
echo "ö" > o.txt
git add o.txt
git commit -qm "Özellik"
git switch -q main
echo "m" > m.txt
git add m.txt
git commit -qm "Ana daldaki düzeltme"
eski=$(git rev-parse ozellik)

git switch -q ozellik
git rebase -q main # dalın kayıtlarını ana dalın ucuna YENİDEN yazar
git log --format=%s --graph
test "$(git rev-parse ozellik)" != "$eski" && echo "rebase yeni kayıt üretti: eski kimlik geçersiz"
```

```cikti
* Özellik
* Ana daldaki düzeltme
* Taban
rebase yeni kayıt üretti: eski kimlik geçersiz
```

| Durum                                                | Seçim                       | Neden                                              |
| ---------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| Yalnız sizin, henüz gönderilmemiş dalınız güncellenecek | `rebase`                    | Düz, okunur geçmiş                                 |
| Başkalarının da çalıştığı ya da gönderilmiş dal          | `merge`                     | `rebase` kayıt kimliklerini değiştirir; başkasının geçmişi bozulur |
| Dal ana dala katılıyor (PR)                            | Projenin kuralı (çoğu zaman "squash" ya da merge) | Tek tutarlı yöntem seçin                |
| Rebase sırasında her kayıtta çakışma çıkıyor            | `git rebase --abort` → `merge` | Uzun ömürlü dalda merge daha az acı verir        |

## Yanlışlıkla gönderilen sır

Silmek yetmez: sır **geçmişte** kalır ve depoyu indiren herkes görebilir.

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
echo "API_ANAHTARI=gizli123" > .env
git add .env
git commit -qm "Ayar ekle"
git rm -q .env
echo ".env" > .gitignore
git add .gitignore
git commit -qm ".env kaldır"
# Sır hâlâ geçmişte: hangi kayıtlarda geçtiği ve içeriği
git log --all -S 'API_ANAHTARI' --format=%s
git show 'HEAD~1:.env'
```

```cikti
.env kaldır
Ayar ekle
API_ANAHTARI=gizli123
```

Sıra **önemlidir**:

1. **Sırrı hemen geçersiz kılın** (anahtarı iptal edip yenisini üretin, parolayı değiştirin). Gönderildiği an
   sızmış sayılır; geçmişi temizlemek bunu geri almaz.
2. Geçmişten silmek gerekiyorsa `git filter-repo` (ayrı kurulan araç) ile dosyayı tüm geçmişten çıkarın, zorla
   gönderin ve ekipten depoyu yeniden indirmelerini isteyin. Bu bir geçmiş yeniden yazımıdır; tek başınıza yapmayın.
3. Tekrarını önleyin: `.env` `.gitignore`'da, depoda yalnız `.env.example`; kayıttan önce `git diff --staged`.

## Büyük dosya

```bash calistir
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Deneme GIT_AUTHOR_EMAIL=deneme@ornek.com GIT_COMMITTER_NAME=Deneme GIT_COMMITTER_EMAIL=deneme@ornek.com
git init -q -b main depo
cd depo
head -c 2000000 /dev/urandom > model.bin
git add model.bin
git commit -qm "Model dosyası ekle"
blob=$(git rev-parse HEAD:model.bin)
git rm -q model.bin
git commit -qm "Model dosyasını sil"
# Dosya son kayıtta yok ama depo onu sonsuza dek taşır: her klon indirir
git cat-file -e "$blob" && echo "silinen dosya hâlâ depoda: $(git cat-file -s "$blob") bayt"
# .gitignore'a sonradan eklemek izlenen dosyayı bırakmaz
echo "log" > hata.log
git add hata.log
git commit -qm "Günlük ekle"
echo "*.log" > .gitignore
git rm -q --cached hata.log # izlemeyi bırak, diskte kalsın
git check-ignore -v hata.log
```

```cikti
silinen dosya hâlâ depoda: 2000000 bayt
.gitignore:1:*.log	hata.log
```

Model ağırlığı, veri kümesi, video, derleme çıktısı depoya girmez: `.gitignore`'a yazın, dosyayı nereden
indirileceğini belgeleyin ya da Git LFS / ayrı depolama kullanın. Büyük dosya yanlışlıkla gönderildiyse temizlik,
sırdaki gibi geçmiş yeniden yazımıdır.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Kayda istenmeyen dosyalar (`.env`, `dist/`, `node_modules`) girdi | `git add .` / `git add -A`                            | `.gitignore` + seçerek ekleme; kayıttan önce `git diff --staged` |
| `.gitignore`'a eklenen dosya hâlâ değişmiş görünüyor             | Zaten izleniyordu                                       | `git rm --cached dosya`                                  |
| Başkasının dalı bozuldu, kayıtları "kayboldu"                    | Gönderilmiş geçmiş `rebase`/`amend`/`--force` ile yazıldı | Gönderileni yeniden yazmayın; `revert`; `--force-with-lease` |
| `restore` ya da `reset --hard` sonrası iş yok                    | Kaydedilmemiş değişiklik silindi                        | Önce `git stash` ya da geçici kayıt                     |
| "detached HEAD" uyarısı                                         | Dal yerine doğrudan bir kayda geçildi                   | İş yapacaksanız `git switch -c yeni-dal`                 |
| Birleştirmeden sonra dosyalarda `<<<<<<<` kaldı                  | Çakışma işaretleri silinmeden kaydedildi                | `grep` ile tarayın; testleri çalıştırın                  |
| Push reddedildi (`non-fast-forward`)                            | Uzakta sizde olmayan kayıtlar var                       | `git pull --rebase` (kendi dalınız) ya da `git pull`; zorla göndermeyin |
| Depo klonlaması çok uzun                                        | Geçmişte büyük dosyalar                                 | Temizlik (geçmiş yazımı) ya da LFS; önleyin              |
| Sır sızdı ama "sildim" denildi                                   | Geçmiş duruyor                                          | Önce sırrı geçersiz kıl, sonra geçmişi temizle            |
| Kayıt iletileri bir şey anlatmıyor                               | `wip`, `düzeltme`                                       | `kapsam: ne` + gövdede neden                            |

## Denetim listesi

- [ ] Her iş ayrı dalda; ana dala doğrudan kayıt yok.
- [ ] Kayıttan önce `git status` ve `git diff --staged` okundu; sahnede yalnız bu işin dosyaları var.
- [ ] Depoda sır yok (`.env` yok, `.env.example` var); `.gitignore` derleme çıktısı, bağımlılık ve büyük dosyaları dışlıyor.
- [ ] Kayıt iletisi `kapsam: ne yapıldı` + gövdede neden.
- [ ] Gönderilmiş geçmiş yeniden yazılmadı; geri almalar `revert` ile.
- [ ] Çakışmalardan sonra işaret kalmadı ve testler geçiyor.
- [ ] Zorla gönderme gerekiyorsa `--force-with-lease` kullanıldı ve ekip haberdar edildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kayıt atma ve gönderme **benim onayımla**. Önce `git status` ve `git diff --staged` çıktısını
  göster, kayıt iletisini öner, onaylarsam kaydet. `push --force`, `reset --hard`, `rebase`, `clean -fd`, `filter-repo`
  komutlarını çalıştırma; gerekiyorsa nedenini yazıp sor."
- **Modelin tipik hatası:** `git add .` ile her şeyi ekler (sırlar, çıktılar dahil); çakışmayı bir tarafı körü
  körüne seçerek çözer; gönderilmiş kaydı `amend` eder ve `--force` ile gönderir; "geri al" denince `reset --hard`
  ile kaydedilmemiş işi siler; anlamsız kayıt iletisi yazar.
- **Çıktıda arayın:** `--force` (ama `--force-with-lease` değil), `reset --hard`, `add .`, `add -A`, `clean -f`,
  `checkout -- .`, `.env` içeren kayıt.
- **Kurtarma:** bir şey kaybolduysa modelden önce `git reflog` çıktısını isteyin; çoğu kayıp oradan döner.

## İlgili

- [Kabuk ve bash](kabuk-ve-bash.md): komut satırı temelleri
- [Modül ve bağımlılık](modul-ve-bagimlilik.md): kilit dosyasını depoya koymak
- [Sır yönetimi](../50-guvenlik/sir-yonetimi.md): sızan sırrı döndürmek, `.env` kuralları
- [CI/CD](../60-devops/ci-cd.md): her gönderimde otomatik denetim
