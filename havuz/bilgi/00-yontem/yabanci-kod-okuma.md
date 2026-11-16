---
baslik: Yabancı kod okuma
ozet: Bilinmeyen bir kod tabanında yön bulma; giriş noktaları, bir akışı uçtan uca izleme, arama stratejileri, testleri belge gibi okuma, not çıkarma ve ne kadarını anlamanın yettiği.
etiketler: [yontem, kod-okuma, arama, kod-tabani, git]
duzey: temel
guncellik: 2026-11
---

# Yabancı kod okuma

> Bu notu ne zaman okumalı: daha önce görmediğiniz bir depoda değişiklik yapacaksanız; bir hatanın geçtiği kodu
> tanımıyorsanız; bir modelin "şu dosyada şu işlev var" demesini denetleyecekseniz.

## Temel fikir

Kod tabanı baştan sona okunmaz; ona **soru sorulur**. Amaç her şeyi anlamak değil, değişikliği güvenle yapacak
kadarını anlamaktır. Sıra şudur: çalıştır → giriş noktalarını bul → bir akışı uçtan uca izle → değiştireceğin
parçayı, onu çağıranları ve testlerini oku. Gerçeği kod söyler; belge, yorum ve adlar yalnız ipucudur. Bir
iddiayı (ör. "bu işlev veritabanına yazmaz") ancak kodu okuyarak ya da çalıştırarak doğrulayın.

## Karar tablosu: ne kadarını anlamak yeter

| İş                                         | En az okunacak                                            | Neden                                   |
| ------------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| Tek işlevde hata düzeltme                  | O işlev, çağıranları, testleri                            | Davranış değişikliği çağıranlara yayılır |
| Var olana benzeyen yeni özellik            | En yakın örneğin uçtan uca yolu                           | Yerel üslubu kopyalamak için            |
| Yeniden adlandırma, imza değişikliği       | Bütün kullanım yerleri (metin içinde geçenler dahil)      | Kırılma her kullanım yerinde olabilir   |
| Bağımlılık güncelleme                      | Paketin kullanıldığı yerler + paketin değişiklik günlüğü  | Kırılma yalnız kullanılan yerdedir      |
| Güvenlik incelemesi                        | Bütün girişler (istek, dosya, ortam) ve yetki denetimleri | Saldırı yüzeyi girişlerdir              |
| Performans sorunu                          | Ölçümün gösterdiği sıcak yol                              | Geri kalanı sonucu değiştirmez          |
| Bir soruyu yanıtlamak                      | Yalnız o soruyla ilgili akış                              | Gerisi zaman kaybıdır                   |

## 1. On beş dakikalık keşif

Sırayla bakın ve her birinden bir-iki satır not alın:

- `README.md`, varsa `AGENTS.md`, `docs/MIMARI.md`, `docs/KARARLAR.md`: amaç, komutlar, değişmez kurallar.
- `package.json` içindeki `scripts` ya da `pyproject.toml`: hangi komutlar var, hangi çatı (framework)
  kullanılıyor. Çatı, dosyaların nerede durduğunu ve nasıl adlandırıldığını belirler.
- Klasör ağacı, iki düzey: `find . -maxdepth 2 -not -path "*/node_modules*" -not -path "*/.git*"`.
- Giriş noktaları: `main.tsx`, `index.ts`, `app.ts`, `routes`, `cli.py`, `__main__.py`, `Dockerfile` içindeki
  `CMD`, `package.json` içindeki `bin`.
- Yapılandırma: `.env.example`, `config.ts`. Ortama göre değişen her davranış buradan okunur.
- Testler klasörü: test adları, sistemin ne yaptığının en kısa listesidir.
- Son değişiklikler: `git log --oneline -20`. Hangi bölge canlı, hangisi yıllardır dokunulmamış.

## 2. Çalıştırın

Kurun, testleri çalıştırın, uygulamayı açın. Çalıştıramadığınız kod hakkında yalnız tahmin yürütürsünüz.
Çalışmayan adımı not edin; çoğu zaman belgede eksik kalmış bir ön koşuldur.

## 3. Bir akışı uçtan uca izleyin

Bir kullanıcı eylemi seçin ve izini sürün: arayüz → olay işleyici → API çağrısı → yönlendirme (route) → servis →
veri katmanı → SQL. Zinciri `dosya:satır` biçiminde yazın. Havuzdaki uygulamanın API'si bu katmanlarla kurulu:
[`routes.ts`](../../uygulama/api/src/modules/workspaces/routes.ts) → `service.ts` → `repo.ts`.

Python'da "bu işlev kimi çağırıyor" sorusunu standart kütüphanedeki `ast` ile kaba ama hızlı yanıtlayabilirsiniz:

```python calistir
import ast
from pathlib import Path

files = {  # küçük bir örnek kod tabanı; gerçekte diskte zaten vardır
    "routes.py": "from service import create_order\n\ndef post_order(req):\n    return create_order(req['items'])\n",
    "service.py": "from repo import save\nfrom pricing import total\n\ndef create_order(items):\n"
    "    return save({'items': items, 'total': total(items)})\n",
    "pricing.py": "def total(items):\n    return sum(i['price'] for i in items)\n",
    "repo.py": "def save(order):\n    return order\n",
}
Path("kod").mkdir()
for name, source in files.items():
    Path("kod", name).write_text(source, encoding="utf-8")

calls: dict[str, list[str]] = {}
for path in sorted(Path("kod").glob("*.py")):
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.FunctionDef):
            names = {n.func.id for n in ast.walk(node) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
            calls[f"{path.stem}.{node.name}"] = sorted(names)


def trace(func: str, depth: int = 0) -> None:
    print("  " * depth + func)
    for name in calls.get(func, []):
        target = next((key for key in calls if key.endswith("." + name)), None)
        if target:  # yerleşik işlevler (sum gibi) atlanır
            trace(target, depth + 1)


trace("routes.post_order")
```

```cikti
routes.post_order
  service.create_order
    repo.save
    pricing.total
```

Bu araç dinamik çağrıları (`getattr`, kayıt tabloları, metinle kurulan adlar) görmez; editörün "tanıma git" ve
"kullanımları bul" komutları da göremez. Arama boş dönerse bu olasılığı aklınızda tutun.

## 4. Arama stratejileri

| Ne arıyorsunuz                       | Nasıl                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- |
| Ekranda gördüğünüz metnin kodu       | Metni arayın → sözlük anahtarı → anahtarı kullanan bileşen                 |
| Bir hata iletisinin kaynağı          | İletinin sabit kısmını kodda **ve** kurulu paketlerde arayın               |
| Bir uç noktayı çağıran ve karşılayan | Adres parçasını arayın (`/api/lists`): hem istemci hem sunucu çıkar        |
| Bir işlevin tanımı                   | `grep -rn "def ad\|function ad\|ad ="`; editörde "tanıma git"              |
| Bir işlevin bütün kullanımları       | Adını arayın; dinamik kullanım için tırnak içinde metin olarak da arayın   |
| Bir satırın neden öyle yazıldığı     | `git blame dosya` → kayıt iletisi; `git log -L 40,60:dosya` satır geçmişi  |
| Bir metnin ne zaman eklenip kalktığı | `git log -S "metin" --oneline` (kazma araması, pickaxe)                    |
| Bir ayarın etkisi                    | Ortam değişkeninin adını arayın                                            |
| Benzer bir örnek                     | Aynı türden kardeş klasörlere bakın (`ls src/modules/`)                    |

Ekrandaki metinden koda üç aramada inmek:

```bash calistir
mkdir -p src/i18n src/features/lists src/api  # küçük bir örnek proje
cat > src/i18n/tr.json <<'EOF'
{ "lists.empty": "Henüz liste yok." }
EOF
cat > src/features/lists/ListPage.tsx <<'EOF'
export const ListPage = ({ items }) => (items.length ? <Lists items={items} /> : <p>{t('lists.empty')}</p>)
EOF
cat > src/api/lists.ts <<'EOF'
export const fetchLists = () => fetch('/api/lists')
EOF

grep -rn "Henüz liste yok" src           # 1) ekrandaki metin → sözlük anahtarı
grep -rn "lists.empty" src --include=*.tsx  # 2) anahtar → onu kullanan bileşen
grep -rn "/api/lists" src                # 3) adres → çağıran kod
```

```cikti
src/i18n/tr.json:1:{ "lists.empty": "Henüz liste yok." }
src/features/lists/ListPage.tsx:1:export const ListPage = ({ items }) => (items.length ? <Lists items={items} /> : <p>{t('lists.empty')}</p>)
src/api/lists.ts:1:export const fetchLists = () => fetch('/api/lists')
```

## 5. Testleri belge gibi okuyun

- Test adları davranışın tanımıdır: "süresi dolmuş davet kabul edilmez" bir kuralı söyler.
- Test verisi (fixture) gerçekçi veriyi gösterir: alanların biçimi, tipik değerler.
- Testin kapsadığı uç durumlar geçmişte yaşanmış hatalardır.
- **Test edilmeyen** davranış en riskli bölgedir; orayı değiştirirken önce test yazın.
- Bir değerin gerçekte ne olduğunu merak ediyorsanız ilgili tek testi çalıştırıp içine geçici bir `print` koyun.

## 6. Not çıkarın: harita

```text
Amaç:        Ekip görev listesi; çevrimdışı çalışır, sunucuyla eşitlenir.
Komutlar:    npm ci · npm run check · npm run dev
Akış:        "Görev ekle" → web/src/features/tasks/… → shared/src/api.ts → api/src/modules/sync/routes.ts
             → service.ts → repo.ts (INSERT)
Terimler:    "alan" = workspace; "üye" = member; "mezar taşı" = silinen kaydın izi
Kurallar:    Her yazma işlemi denetim kaydı bırakır; kullanıcı metni tr.json'dadır.
Açık sorular: Silinen görev kaç gün geri getirilebilir?
```

Haritayı bir dosyada tutun ve her yeni oturumda modele verin; aynı keşfi her seferinde baştan yaptırmayın.

## 7. Değiştirmeden önce

En yakın örneği bulun ve onun üslubunu izleyin: dosya yeri, adlandırma, hata işleme, test biçimi. Kod tabanında
iki farklı üslup varsa en son değiştirilmiş olanı izleyin (`git log -- yol` ile bakın).

## Tuzaklar

| Belirti                                                     | Neden                                                         | Çözüm                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Bir gündür okuyorsunuz, değişikliği hâlâ yapamıyorsunuz      | Sorusuz okuma                                                 | Tek soru, tek akış; gerisini okumayın                         |
| Yorumda yazanla kod farklı davranıyor                       | Yorum bayat                                                   | Koda güvenin; yorumu düzeltin                                 |
| `getUser` veritabanına yazıyor                              | Ada güvenildi                                                 | Gövdeyi okuyun; yan etkileri not edin                         |
| `grep` boş dönüyor ama özellik çalışıyor                    | Dinamik dağıtım: kayıt tablosu, birleştirilen ad, dosya adına göre yönlendirme | Adın parçalarını arayın; kayıt dosyasını bulun |
| Düzelttiğiniz kod hiç çalışmıyor                            | Ölü kopya ya da üretilmiş (generated) dosya düzenlendi        | Değişikliğin çalıştığını günlükle görün; dosya başında "üretildi" uyarısı arayın |
| Yerelde başka, sunucuda başka davranıyor                    | Ortam değişkeni ya da özellik bayrağı                         | `.env.example` ve yapılandırmayı okuyun                       |
| Yeni kod çevresine hiç benzemiyor                           | Yerel üslup izlenmedi                                         | En yakın örneği kopyalayıp uyarlayın                          |
| "Kullanılmıyor" denen işlev silindi, üretim bozuldu         | Dinamik ya da dış kullanım (betik, zamanlanmış iş, başka depo) | Silmeden önce metin araması, günlük ve sahibine soru         |

## Denetim listesi

- [ ] Depo kuruldu ve testler çalıştırıldı (sonuç not edildi).
- [ ] Giriş noktaları ve ilgili akış `dosya:satır` zinciri olarak yazıldı.
- [ ] Değiştirilecek parçanın bütün çağıranları bulundu (metin araması dahil).
- [ ] İlgili testler okundu; test edilmeyen davranış için önce test yazıldı.
- [ ] Yeni kod en yakın örneğin üslubunu izliyor.
- [ ] Harita dosyası güncel; açık sorular sahibine iletildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Değişiklik yapmadan önce bir harita çıkar: ilgili dosyalar ve akış zinciri `dosya:satır`
  biçiminde. Her iddiaya kanıt göster (arama çıktısı ya da dosyadan alıntı). Görmediğin dosya için tahmin yürütme;
  'bulamadım' de." Havuzdaki temellerde önce `AGENTS.md` okutun.
- **Modelin tipik hatası:** çatının alışılmış düzenine göre var olmayan dosya ve işlev uydurur; başka bir
  projeden kalıp getirir; dosyanın ilk satırlarını okuyup gerisini varsayar; bir işlevin iki kopyasından yanlış
  olanı düzenler.
- **Çıktıda denetleyin:** modelin andığı her yolu `ls` ile, her işlevi `grep` ile doğrulayın. Yeni kodun dosya
  yerini ve biçimini en yakın örnekle karşılaştırın.

## İlgili

- [Hata ayıklama](hata-ayiklama.md): hatanın geçtiği kodda yön bulmak.
- [Yeniden düzenleme](yeniden-duzenleme.md): okuduğunuz kodu güvenle değiştirmek.
- Model için yazılmış harita örneği: [uygulama/AGENTS.md](../../uygulama/AGENTS.md),
  mimari özeti: [uygulama/docs/MIMARI.md](../../uygulama/docs/MIMARI.md).
- Diğer kümelerden: [Git](../10-diller/git.md).
