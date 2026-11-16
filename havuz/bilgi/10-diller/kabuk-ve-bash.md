---
baslik: Kabuk ve bash
ozet: Tırnaklama kuralları, set -euo pipefail ve delikleri, değişken açılımı, boru ve yönlendirme sırası, trap ile temizlik, boşluklu dosya adında güvenli döngü, sık komutların tuzakları ve ne zaman Python'a geçileceği.
etiketler: [bash, kabuk, betik, komut-satiri, macos]
duzey: temel
guncellik: 2026-11
---

# Kabuk ve bash

> Bu notu ne zaman okumalı: bir kabuk betiği (`.sh`) yazarken ya da incelerken; CI adımı, kurulum betiği, `package.json`
> içindeki komut yazarken; "boşluklu dosya adında bozuldu", "hata verdi ama betik devam etti", "macOS'ta çalışmıyor"
> gibi bir sorunda.

## Temel fikir

- Kabuk her satırı çalıştırmadan önce **açar** (expand): değişkenleri yerine koyar, sonucu boşluklardan **böler** ve
  `*` gibi desenleri dosya adlarına çevirir. Tırnaksız `$degisken` bu yüzden boşluklu adda iki argüman olur.
- Kural: **her değişkeni çift tırnağa alın** (`"$dosya"`, `"${dizi[@]}"`). Bilinçli istisna yoksa tırnaksız
  değişken hatadır.
- Bash varsayılan olarak hatada **durmaz**. Betiğin ilk satırı `set -euo pipefail` olmalıdır; ama bu bile her
  hatayı yakalamaz (aşağıda delikleri).
- Kabuk metin yapıştırmak için iyidir, veri işlemek için kötüdür. 30–50 satırı geçen, döngü içinde karar veren ya da
  CSV/JSON ayrıştıran betik Python'a taşınmalıdır.
- macOS'ta varsayılan kabuk **zsh**, `/bin/bash` ise çok eski bir sürümdür (3.2); `sed`, `date`, `grep` gibi
  araçlar GNU değil BSD sürümüdür. Linux'ta çalışan betik macOS'ta bozulabilir. Bu nottaki örnekler GNU bash 5.2 ile
  denendi.

## Betik iskeleti

```bash
#!/usr/bin/env bash
# yedekle.sh — veri klasörünü tarihli arşive alır. Kullanım: ./yedekle.sh <kaynak> <hedef-klasör>
set -euo pipefail

kaynak=${1:?Kullanım: ./yedekle.sh <kaynak> <hedef-klasör>}
hedef=${2:?Kullanım: ./yedekle.sh <kaynak> <hedef-klasör>}
gecici=$(mktemp -d)
trap 'rm -rf "$gecici"' EXIT # betik nasıl biterse bitsin geçici klasör silinir

arsiv="$gecici/yedek-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$arsiv" -C "$kaynak" .
mv -- "$arsiv" "$hedef/"
echo "Yedek alındı: $hedef/${arsiv##*/}"
```

Çalıştırırken `bash yedekle.sh …` ya da `chmod +x` + `./yedekle.sh …` kullanın; `sh yedekle.sh` başka bir kabuk
(dash) çalıştırabilir ve bash'e özgü sözdizimi bozulur.

## Tırnaklama

```bash calistir
dosya="aylık rapor.txt"
touch "$dosya" "notlar.txt"

# YANLIŞ: tırnaksız değişken boşlukta bölünür → "aylık" ve "rapor.txt" diye iki ad
if ls $dosya > /dev/null 2>&1; then echo "beklenmedik"; exit 1; fi
ls "$dosya" # DOĞRU

# Tek tırnak hiçbir şeyi açmaz; çift tırnak $ ve $(…) açar
ad="Ayşe"
echo 'Merhaba $ad'
echo "Merhaba $ad"

# Dizi: her öğe ayrı argüman kalsın diye "${dizi[@]}"
dosyalar=("aylık rapor.txt" "notlar.txt")
printf '<%s>\n' "${dosyalar[@]}"
printf '<%s>\n' ${dosyalar[@]} # YANLIŞ: üç parça oldu

# Tırnaksız değişkendeki * dosya adlarına açılır
desen="*.txt"
echo "tırnaklı: $desen"

# Boş değişken tırnaksızsa [ ] sözdizimi bozulur
x=""
[ $x = evet ] 2> hata.txt || true
grep -o 'unary operator expected' hata.txt
[ "$x" = evet ] || echo "tırnaklı karşılaştırma güvenli"
```

```cikti
aylık rapor.txt
Merhaba $ad
Merhaba Ayşe
<aylık rapor.txt>
<notlar.txt>
<aylık>
<rapor.txt>
<notlar.txt>
tırnaklı: *.txt
unary operator expected
tırnaklı karşılaştırma güvenli
```

`$(komut)` ile yakalanan çıktı da aynı kurala uyar: `"$(komut)"`. Ters tırnak (`` `komut` ``) eski yazımdır,
iç içe kullanılamaz; `$(…)` yazın.

## set -euo pipefail

| Ayar          | Ne yapar                                                    | Olmazsa                                                  |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `-e`          | Bir komut başarısız olunca betik durur                       | Hata sonrası betik yanlış veriyle devam eder              |
| `-u`          | Tanımsız değişken hata olur                                  | Yazım hatalı değişken boş metin olur (`rm -rf "$KLASR/"`) |
| `-o pipefail` | Boru hattında herhangi bir komut başarısızsa hat başarısız   | Yalnız son komutun sonucu sayılır, hata kaybolur          |

```bash calistir
bash -c 'false | true; echo "pipefail yok: $?"'
bash -c 'set -o pipefail; false | true; echo "pipefail var: $?"'
bash -c 'set -u; KLASOR=/tmp; echo "$KLAOSR"' 2> /dev/null || echo "-u yazım hatasını yakaladı"
# Boş olmaması gereken değişken: ${ad:?ileti} boşsa ya da tanımsızsa durdurur
bash -c 'KLASOR=""; echo "silinecek: ${KLASOR:?KLASOR boş}/"' 2> /dev/null || echo ":? boş değişkeni durdurdu"
```

```cikti
pipefail yok: 0
pipefail var: 1
-u yazım hatasını yakaladı
:? boş değişkeni durdurdu
```

`-e`'nin **çalışmadığı** yerler (hepsi denendi):

```bash calistir
# 1) if, while, && ve || içinde çağrılan işlevin içinde -e kapalıdır
bash -c 'set -e; f() { false; echo "f devam etti"; }; if f; then :; fi'
# 2) local x=$(…) komutun hatasını maskeler: local'in kendisi başarılıdır
bash -c 'set -e; g() { local x=$(false); echo "local maskeledi: $?"; }; g'
# Düzeltme: önce tanımla, sonra ata
bash -c 'set -e; g() { local x; x=$(false); echo "buraya gelinmez"; }; g' || echo "ayrı atama -e ile durdu"
```

```cikti
f devam etti
local maskeledi: 0
ayrı atama -e ile durdu
```

Kritik adımda `-e`'ye güvenmeyin; sonucu açıkça denetleyin: `komut || { echo "Yedek alınamadı" >&2; exit 1; }`.

## Değişken açılımı

```bash calistir
dosya="yedek/2026-11-16.tar.gz"
echo "${dosya##*/}" # en uzun */ önekini sil: dosya adı
echo "${dosya%/*}"  # en kısa /* sonekini sil: klasör
echo "${dosya%%.*}" # ilk noktadan sonrasını sil
echo "${dosya%.gz}" # belirli soneki sil
echo "${TANIMSIZ:-varsayılan}"
echo "$((7 / 2)) $((7 % 2))" # yalnız tamsayı aritmetiği; ondalık için başka araç
ad="Ayşe"
cat << EOF
açılır: $ad
EOF
cat << 'EOF'
açılmaz: $ad
EOF
```

```cikti
2026-11-16.tar.gz
yedek
yedek/2026-11-16
yedek/2026-11-16.tar
varsayılan
3 1
açılır: Ayşe
açılmaz: $ad
```

Başka bir dosyaya şablon yazarken (`cat > ayar.sh << 'EOF'`) sınırlayıcıyı tırnaklayın; yoksa şablondaki `$` yazma
anında açılır.

## Boru, yönlendirme ve sıra

```bash calistir
# Sıra önemlidir: önce dosyaya yönlendir, SONRA hatayı çıktıya bağla
{ echo "çıktı"; echo "hata" >&2; } > hepsi.txt 2>&1
# Ters sıra: 2>&1 o anki çıktıya (ekrana) bağlanır, hata dosyaya GİTMEZ
{ echo "çıktı"; echo "hata" >&2; } 2>&1 > yalniz.txt
echo "--- hepsi.txt"
cat hepsi.txt
echo "--- yalniz.txt"
cat yalniz.txt
```

```cikti
hata
--- hepsi.txt
çıktı
hata
--- yalniz.txt
çıktı
```

| Yazım              | Anlamı                                                            |
| ------------------ | ----------------------------------------------------------------- |
| `> dosya` / `>> dosya` | Çıktıyı yaz (üstüne) / sona ekle                              |
| `2> /dev/null`     | Hata iletilerini at (hata **kodunu** atmaz)                        |
| `> dosya 2>&1`     | Çıktı ve hata aynı dosyaya                                        |
| `a \| b`             | `a`'nın çıktısı `b`'nin girdisi; ikisi aynı anda çalışır          |
| `< <(komut)`       | Komutun çıktısını dosya gibi oku (süreç yerine koyma)              |
| `<<< "$metin"`     | Değişkeni komuta girdi olarak ver                                 |

## Geçici dosya ve temizlik

```bash calistir
cat > is.sh << 'EOF'
set -euo pipefail
gecici=$(mktemp -d)
trap 'rm -rf "$gecici"' EXIT
echo "$gecici"
echo "ara sonuç" > "$gecici/ara.txt"
false # iş yarıda hata verdi
EOF
yol=$(bash is.sh) || true
test -n "$yol" && test ! -e "$yol" && echo "hata olsa da geçici klasör silindi"
```

```cikti
hata olsa da geçici klasör silindi
```

Sabit adlı geçici dosya (`/tmp/cikti.txt`) kullanmayın: aynı anda çalışan iki betik birbirinin dosyasını ezer ve
başka kullanıcı o adı önceden oluşturabilir. Her zaman `mktemp` + `trap … EXIT`.

## Güvenli döngü

```bash calistir
mkdir belgeler
touch "belgeler/aylık rapor.txt" "belgeler/not.txt" "belgeler/-tire.txt"

# YANLIŞ: ls çıktısını bölmek (boşluklu ad iki parça oldu)
sayac=0
for f in $(ls belgeler); do sayac=$((sayac + 1)); done
echo "ls ile: $sayac"

# DOĞRU 1: desen (glob)
sayac=0
for f in belgeler/*; do sayac=$((sayac + 1)); done
echo "desen ile: $sayac"

# DOĞRU 2: find -print0 + read -d '' (alt klasörler, her türlü ad)
sayac=0
while IFS= read -r -d '' f; do sayac=$((sayac + 1)); done < <(find belgeler -type f -print0)
echo "find ile: $sayac"

# TUZAK: boru içindeki while ALT KABUKTA çalışır; sayaç dışarı çıkmaz
sayac=0
find belgeler -type f | while IFS= read -r f; do sayac=$((sayac + 1)); done
echo "boru içinde: $sayac"

# '-' ile başlayan ad seçenek sanılır: -- ya da ./ ile koruyun
cd belgeler
if ls * > /dev/null 2>&1; then echo "beklenmedik"; else echo "ls *: '-tire.txt' seçenek sanıldı"; fi
ls -- * > /dev/null && echo "ls -- * güvenli"
```

```cikti
ls ile: 4
desen ile: 3
find ile: 3
boru içinde: 0
ls *: '-tire.txt' seçenek sanıldı
ls -- * güvenli
```

## Sık komutlar ve tuzakları

| İş                              | Komut                                               | Tuzak                                                      |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Metin ara (alt klasörlerde)      | `grep -rn "desen" klasor/` (ya da `rg "desen"`)     | Desen düzenli ifadedir; düz metin için `-F`                 |
| Dosya bul                       | `find . -name '*.log' -mtime +7`                    | Deseni tırnaklayın, yoksa kabuk önce kendisi açar           |
| Bulunanlarla komut çalıştır      | `find . -name '*.tmp' -print0 \| xargs -0 rm --`     | `-print0`/`-0` olmadan boşluklu ad bölünür                  |
| Dosyada değiştir                 | `sed -i 's/eski/yeni/g' dosya`                      | macOS'ta `sed -i '' …`; taşınabilir değil → Python         |
| Sütun al                        | `cut -d, -f2`, `awk -F, '{print $2}'`               | Tırnaklı CSV alanını bozar (aşağıda) → Python `csv`         |
| Say, sırala, tekille             | `sort \| uniq -c \| sort -rn`                         | `uniq` yalnız **ardışık** tekrarı birleştirir: önce `sort`  |
| Satır say                       | `wc -l`                                             | Son satırda satır sonu yoksa bir eksik sayar                |
| Tarih                           | `date -u +%Y-%m-%dT%H:%M:%SZ`                       | `date -d` GNU'ya özgüdür, macOS'ta yok                      |
| HTTP                            | `curl -fsSL adres`                                  | `-f` olmadan 404/500 de "başarılı" çıkış verir             |
| JSON                            | `jq '.alan' dosya.json`                             | Ayrıca kurulur; yoksa `python3 -m json.tool`               |
| Kapıyı kim tutuyor              | `lsof -i :5310`                                     |                                                            |
| Sıralama                        | `LC_ALL=C sort`                                     | Yerel ayara göre sıra değişir; betikte sabitleyin           |

```bash calistir
printf 'a\nb' | wc -l                                  # 2 satır ama 1 sayar
printf 'elma\narmut\nelma\n' | uniq | wc -l            # sıralanmadığı için tekrar silinmedi
printf 'elma\narmut\nelma\n' | sort | uniq -c | sed 's/^ *//'
echo '"Yılmaz, Ayşe",34' | cut -d, -f2                 # tırnaklı alan bölündü: yaş yerine ad parçası
echo 'istanbul ılık' | tr '[:lower:]' '[:upper:]'      # GNU tr bayt bazlı: i→I oldu, ı hiç değişmedi
```

```cikti
1
3
1 armut
2 elma
 Ayşe"
ISTANBUL ıLıK
```

## Ne zaman kabuk, ne zaman Python

| Durum                                                      | Seçim   |
| ---------------------------------------------------------- | ------- |
| Birkaç komutu sırayla çalıştırmak, CI adımı, kurulum        | Kabuk   |
| 30–50 satırı geçti, işlevler ve iç içe `if` çoğaldı         | Python  |
| CSV, JSON, YAML okumak; tarih ve ondalık hesap               | Python  |
| Türkçe metin dönüştürmek (büyük/küçük harf, sıralama)        | Python  |
| Windows'ta da çalışmalı                                     | Python  |
| Hata yönetimi ve yeniden deneme gerekiyor                    | Python  |
| Tek satırlık metin süzme (grep, sort, uniq)                  | Kabuk   |

Python'dan komut çalıştırırken `subprocess.run([...], check=True)` liste biçimini kullanın; `shell=True` ve metin
birleştirme, kabuktaki tırnaklama sorunlarını ve komut enjeksiyonunu geri getirir.

## Tuzaklar

| Belirti                                                     | Neden                                                 | Çözüm                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Boşluklu dosya adında "No such file"                         | Tırnaksız değişken bölündü                            | `"$degisken"`; ShellCheck uyarısı SC2086                   |
| `*` içeren değer dosya listesine dönüştü                      | Tırnaksız değişkende desen açılımı                    | Çift tırnak                                               |
| Hata verdi ama betik devam etti                              | `set -e` yok ya da `-e`'nin çalışmadığı yerde          | `set -euo pipefail`; kritik adımda `\|\| exit 1`           |
| Boru hattının hatası görünmedi                               | `pipefail` yok                                        | `set -o pipefail`                                         |
| `rm -rf "$KLASOR/"` beklenmedik yeri sildi                    | Değişken boş/tanımsız                                 | `"${KLASOR:?}"`, `-u`; silmeden önce yolu yazdırın         |
| `local x=$(komut)` hatası yakalanmadı                         | `local` sonucu maskeler                               | `local x; x=$(komut)`                                     |
| Döngü sonrası sayaç 0                                       | Boru içindeki `while` alt kabukta                      | `while … done < <(komut)`                                 |
| `-` ile başlayan dosya adı seçenek sanıldı                    | `rm *`, `ls *`                                        | `rm -- *` ya da `rm ./*`                                  |
| Linux'ta çalışan betik macOS'ta hata veriyor                  | BSD araçları (`sed -i`, `date -d`), bash 3.2           | Taşınabilir yazım ya da Python; `#!/usr/bin/env bash`      |
| zsh'te çalıştırınca davranış farklı                          | zsh tırnaksız değişkeni bölmez, dizi indisi 1'den başlar | Betiği `bash betik.sh` ile çalıştırın                    |
| Aynı anda iki çalışma birbirinin dosyasını bozdu              | Sabit adlı geçici dosya                               | `mktemp` + `trap … EXIT`                                  |
| Sıralama makineden makineye değişiyor                         | Yerel ayara bağlı `sort`                              | `LC_ALL=C sort`                                           |
| CSV'den yanlış sütun geldi                                   | `cut`/`awk` tırnaklı alanı bilmez                      | Python `csv` modülü                                       |

## Denetim listesi

- [ ] İlk satır `#!/usr/bin/env bash`, ikincisi `set -euo pipefail`.
- [ ] Her değişken ve `$(…)` çift tırnakta; diziler `"${dizi[@]}"` ile.
- [ ] Zorunlu argümanlar `${1:?Kullanım: …}` ile denetleniyor; kullanım iletisi Türkçe ve yol gösteriyor.
- [ ] Geçici dosyalar `mktemp` ile, temizlik `trap … EXIT` ile.
- [ ] Silme ve taşıma komutlarında `--` var; silinen yol değişkense `:?` ile korunuyor.
- [ ] Dosya döngüleri desen ya da `find -print0` ile; `$(ls)` yok.
- [ ] `sed -i`, `date -d`, `grep -P`, `readlink -f`, `declare -A`, `mapfile` kullanılmışsa macOS'ta denendi.
- [ ] ShellCheck (kuruluysa) uyarısız; yoksa yukarıdaki maddeler elle tarandı.
- [ ] 50 satırı aşan ya da veri ayrıştıran betik Python'a taşındı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bash betiği yaz: `set -euo pipefail`, her değişken çift tırnakta, geçici dosya `mktemp` +
  `trap`, dosya döngüsü `find -print0` ile, argümanlar `${1:?…}` ile denetlensin. macOS'ta da çalışmalı: GNU'ya
  özgü seçenek kullanma. 40 satırı geçecekse Python yaz."
- **Modelin tipik hatası:** Değişkenleri tırnaksız bırakır; `for f in $(ls …)` yazar; `cd klasor` başarısını
  denetlemez; `sed -i` ve `date -d` ile macOS'u bozar; CSV'yi `cut` ile böler; `curl`'e `-f` vermez; hatayı
  `2>/dev/null` ile gizler.
- **Çıktıda arayın:** tırnaksız `$` (özellikle `rm`, `mv`, `cp`, `cd` satırlarında), `$(ls`, `sed -i`, `date -d`,
  `2>/dev/null`, `curl ` (`-f` var mı), `/tmp/` ile başlayan sabit ad.
- **Doğrulama:** betiği boşluklu ve `-` ile başlayan dosya adı içeren bir klasörde, bir de eksik argümanla
  çalıştırın.

## İlgili

- [Düzenli ifadeler](duzenli-ifadeler.md): `grep` ve `sed` desenleri
- [Git](git.md): komut satırında sürüm denetimi
- [Python tuzakları](python-tuzaklar.md): kabuktan Python'a geçince
- [Unicode ve kodlama](unicode-ve-kodlama.md): uçbirimde bozuk Türkçe karakter
- [Sunucuda Linux temelleri](../60-devops/linux-temelleri.md): izinler, süreçler, servisler, günlükler
- [Enjeksiyon](../50-guvenlik/enjeksiyon.md): kabuk komutuna kullanıcı girdisi
- Kabuk yerine TypeScript ile yazılmış geliştirme betikleri (üreteç, geliştirme sunucusu):
  [`uygulama/scripts`](../../uygulama/scripts)
