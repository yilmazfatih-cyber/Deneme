---
baslik: Kod inceleme
ozet: Kod incelemede öncelik sırası, adım adım inceleme, sık bulunan kusur türleri, bulguyu önem + yer + somut öneriyle yazma ve kendi değişikliğini inceleme.
etiketler: [yontem, kod-inceleme, kalite, guvenlik, geri-bildirim]
duzey: orta
guncellik: 2026-11
---

# Kod inceleme

> Bu notu ne zaman okumalı: bir değişikliği (kendinizin, bir ekip arkadaşınızın ya da bir modelin) birleştirmeden
> önce; bir modelden inceleme isteyecekseniz; ya da incelemeler "biçim yorumu" ile dolup hatalar yine kaçıyorsa.

## Temel fikir

İnceleme, testlerin yakalayamadığını yakalar: yanlış anlaşılmış istek, güvenlik açığı, bakımı zorlaştıran tasarım,
okunmayan kod. Öncelik sırası sabittir:

**doğruluk → güvenlik → tasarım → okunaklılık → biçim**

Biçim (girinti, tırnak, satır uzunluğu) insan zamanı harcamamalıdır; onu Prettier, ruff gibi araçlar denetler.
İnceleme yalnız farkı (diff) okumak değildir: değişikliği çalıştırmak, çağıranlara bakmak ve "şu girdi gelirse ne
olur" diye düşünmektir. Her bulgu **önem + yer + somut öneri** taşır; yazar neyin zorunlu olduğunu bilmelidir.

## Karar tablosu: önem düzeyi

| Bulgu                                                                                   | Önem    | Sonuç                                         |
| --------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| Yanlış sonuç, veri kaybı, güvenlik açığı, kişisel veri sızıntısı, kırılan sözleşme (API) | Engel   | Birleştirilmez; düzeltilip yeniden incelenir  |
| Eksik uç durum, eksik test, bakım yükü getiren tasarım, erişilebilirlik sorunu          | Önemli  | Bu değişiklikte ya da aynı sprintte kapanır   |
| Daha iyi ad, küçük sadeleştirme, üslup tercihi                                          | Öneri   | Yazar karar verir; istenirse birikim listesine |

Kuşkudaysanız düzeyi düşük seçin ve soru sorun. Zevkinizi "Önemli" diye yazmak incelemeye güveni bitirir.

## İnceleme adımları

1. **Açıklamayı okuyun:** ne değişti, neden, nasıl test edildi. Açıklama yoksa önce onu isteyin. Değişiklik tek
   bir iş mi? İki işi birden yapan değişikliği bölmesini isteyin. Birkaç yüz satırı aşan fark derin incelenemez.
2. **Otomatik denetimlere bakın:** tip, lint, testler geçti mi? Geçmediyse incelemeye başlamayın.
3. **Testlerden başlayın:** neyi iddia ediyorlar? Değişiklik olmasa kırmızı olurlar mıydı? Test farkına ayrıca
   bakın: beklenen değer değişmiş ya da test silinmiş mi?
4. **Çekirdeği, sonra çevreyi okuyun:** değişen işlev → onu çağıranlar (`grep` ile) → aynı dosyadaki komşular.
5. **Girdi düşünün:** boş, tek öğe, çok büyük, Türkçe karakter, negatif, eşzamanlı iki istek, bağımlılık hata
   verirse, yetkisiz kullanıcı, eski sürümden kalan veri.
6. **Çalıştırın:** arayüz değişikliğinde zorunlu. Telefon boyutunda, klavyeyle, karanlık temada bakın.
7. **Bulguları yazın** (aşağıdaki dil) ve kararı açıkça verin: onay, değişiklik iste ya da yalnız yorum.

## Sık bulunan kusurlar

**Doğruluk**

- Sınır hatası (`<` / `<=`), boş liste, `null`/`undefined`, sıfıra bölme.
- Yutulan hata (`except: pass`, boş `catch`), unutulmuş `await`, işlenmeyen söz (promise).
- İki yazma işlemi var, işlem (transaction) yok: yarıda kalırsa veri tutarsız.
- Yeniden deneme var, idempotentlik yok: çift kayıt.
- Saat dilimi: dilimsiz tarih-saat, sunucunun "bugün"ü.
- Para `float`; sayılar metin gibi sıralanıyor.
- Paylaşılan değiştirilebilir durum; döngüde kapanış.

**Güvenlik**

- SQL'e, kabuk komutuna, HTML'e kullanıcı girdisi birleştirilmiş.
- Yetki denetimi eksik: kayıt kimliği değiştirilince başkasının verisi geliyor (IDOR).
- Koda gömülü sır; günlükte parola, belirteç, kişisel veri.
- Kullanıcının verdiği dosya yolu ya da adres doğrudan kullanılıyor (dizin aşma, SSRF).
- Belirteç `Math.random` ile üretiliyor; girdi boyutu sınırsız.

**Tasarım**

- Mantık yanlış katmanda (arayüzde iş kuralı, veri katmanında biçimleme).
- Var olan yardımcının kopyası yazılmış; yeni bağımlılık gereksiz.
- Herkese açık bir imza sürümlenmeden değişmiş.
- Tek gerçeklemeli yeni soyutlama ([Tasarım kararı](tasarim-karari.md)).

**Okunaklılık ve test**

- Ad, yaptığı işi söylemiyor; işlev birden çok iş yapıyor; sihirli sayı.
- Yorum kodu yineliyor ama "neden"i söylemiyor.
- Test yalnız "hata vermedi"yi denetliyor ya da beklenen değeri uygulama koduyla aynı formülle hesaplıyor.

**Türkçe ve yerelleştirme**

- Düz `toUpperCase()` / `.upper()`; metin sıralaması kod noktasıyla; tarih ve para elle biçimlenmiş.
- Kullanıcıya görünen metin koda gömülmüş, sözlükte değil.

## Bulguyu yazma dili

Kalıp: **önem — yer — sorun — neden önemli — öneri.**

```text
Kötü:  "Bu kod kötü."   "Neden böyle yaptın?"   "Bunu düzelt."

İyi:   Önemli — api/src/orders.ts:42
       `amount` parseFloat ile okunuyor; "1.234,56" girişi 1.234 olur, kullanıcı 1000 kat az öder.
       Öneri: parseMoneyTr kullanın ve "1.234,56" için bir test ekleyin.

İyi:   Öneri — web/src/ListPage.tsx:17
       `data2` adı ne tuttuğunu söylemiyor; `archivedLists` olabilir mi?
```

- Kod hakkında yazın, kişi hakkında değil: "bu işlev …", "sen …" değil.
- Emin değilseniz soru sorun: "Liste boşsa burada ne olur?"
- İyi olanı da yazın: "Hata iletisi çok açık olmuş." Beğenilen kalıp korunur.
- Bir kalıp birçok yerde varsa her birine ayrı yorum yerine bir kez yazıp "aynısı: x, y, z" deyin.

## Otomatik ön inceleme

İnsan (ya da model) incelemesinden önce ucuz bir tarama, en bilinen kalıpları yakalar. Bu bir **eleme**dir, inceleme
değil: kaçırdığı çok şey olur, yanlış alarm da verir.

```python calistir
import re

RULES = [  # (önem, desen, ileti) — yalnız EKLENEN satırlara uygulanır
    ("Engel", r"(api_?key|secret|password|parola|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]", "koda gömülü sır"),
    ("Engel", r"execute\(\s*f['\"]|execute\([^)]*['\"]\s*\+", "SQL'e değer gömülmüş: parametreli sorgu kullanın"),
    ("Önemli", r"except(\s+Exception)?\s*:\s*pass", "hata sessizce yutuluyor"),
    ("Önemli", r"\.(toUpperCase|toLowerCase|upper|lower)\(\)", "yerel ayarsız harf dönüşümü"),
    ("Önemli", r"parseFloat\(", "sayı/para parseFloat ile okunuyor"),
    ("Öneri", r"console\.log\(|\bprint\(", "hata ayıklama çıktısı kalmış olabilir"),
    ("Öneri", r"\b(TODO|FIXME)\b", "yarım iş işareti"),
]


def scan(diff: str) -> list[tuple[str, int, str]]:
    findings = []
    for number, line in enumerate(diff.splitlines(), 1):
        if not line.startswith("+") or line.startswith("+++"):
            continue  # silinen ve bağlam satırları atlanır
        for severity, pattern, message in RULES:
            if re.search(pattern, line[1:], re.IGNORECASE):
                findings.append((severity, number, message))
    return findings


diff = """\
+++ b/api/orders.py
+def find(db, name):
+    return db.execute(f"SELECT * FROM orders WHERE name = '{name}'")
+API_KEY = "ornek-gizli-deger-123456"
+    title = name.upper()
-    print("eski satır")
+    print(title)
+    try:
+        send_mail(order)
+    except Exception: pass
"""
for severity, number, message in scan(diff):
    print(f"{severity} · {number}. satır · {message}")
```

```cikti
Engel · 3. satır · SQL'e değer gömülmüş: parametreli sorgu kullanın
Engel · 4. satır · koda gömülü sır
Önemli · 5. satır · yerel ayarsız harf dönüşümü
Öneri · 7. satır · hata ayıklama çıktısı kalmış olabilir
Önemli · 10. satır · hata sessizce yutuluyor
```

Kalıcı olanı lint kuralına çevirin (havuzdaki örnek: [uygulama/eslint.config.js](../../uygulama/eslint.config.js));
lint, her değişikliği yorulmadan tarar.

## Kendi değişikliğinizi inceleme

Teslim etmeden önce farkı, başkasının yazdığı kod gibi okuyun:

- [ ] Geçici `print`, `console.log`, yorum satırına alınmış kod kalmadı.
- [ ] İlgisiz değişiklik yok (biçim düzeltmesi, yeniden adlandırma ayrı kayıtta).
- [ ] Yeni davranışın testi var ve değişiklik geri alınınca kırmızı oluyor.
- [ ] Açıklamada ne, neden, nasıl test edildi ve **neyin test edilmediği** yazıyor.
- [ ] Yukarıdaki kusur listesinin ilgili maddelerine tek tek bakıldı.

## Tuzaklar

| Belirti                                                  | Neden                                          | Çözüm                                                          |
| -------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| İncelemede on biçim yorumu var, hata yine kaçtı           | Öncelik sırası ters                            | Biçimi araca bırakın; doğruluk ve güvenlikle başlayın          |
| 1500 satırlık değişiklik "uygun" diye onaylandı          | Büyük fark derin okunamaz                      | Değişikliği bölmesini isteyin                                  |
| Fark doğru, ama başka bir ekran kırıldı                  | Yalnız fark okundu, çağıranlara bakılmadı      | Değişen işlevin kullanımlarını arayın                          |
| Yazar hangi yorumun zorunlu olduğunu anlamadı            | Önem belirtilmedi                              | Her bulguya Engel / Önemli / Öneri                             |
| İnceleyen kendi üslubunu dayatıyor                       | Zevk ile kusur karıştı                         | Zevk "Öneri"dir; karar yazarındır                              |
| Testler geçiyor çünkü beklenen değerler değiştirilmiş    | Test farkına bakılmadı                         | Test farkını ayrıca okuyun; neden değiştiğini sorun            |
| İnceleme günlerce bekliyor                               | Değişiklikler büyük, tur yavaş                 | Küçük değişiklik, aynı gün tur                                 |
| Model incelemesi var olmayan hatalar listeliyor          | Model kanıtsız iddia üretti                    | Her doğruluk bulgusu için hatayı gösteren girdi isteyin        |

## Denetim listesi

- [ ] Açıklama var: ne, neden, nasıl test edildi.
- [ ] Otomatik denetimler yeşil.
- [ ] Testler okundu; test farkında gevşetme yok.
- [ ] Değişen işlevlerin çağıranlarına bakıldı.
- [ ] Boş, büyük, Türkçe karakterli, eşzamanlı ve yetkisiz girdiler düşünüldü.
- [ ] Güvenlik maddeleri (birleştirilmiş girdi, yetki, sır, günlük) tek tek denetlendi.
- [ ] Arayüz değişikliği telefon boyutunda çalıştırılıp görüldü.
- [ ] Her bulgu önem + yer + somut öneri taşıyor; karar açıkça yazıldı.

## Küçük modele yaptırırken

- **İnceleyen olarak:** "Bu farkı incele. Öncelik: doğruluk, güvenlik, tasarım, okunaklılık; biçime bakma. Her
  bulgu için önem (Engel/Önemli/Öneri), dosya:satır, sorun ve somut öneri yaz. Doğruluk bulgusunda hatayı
  gösteren bir girdi örneği ver; veremiyorsan bulguyu 'kuşku' diye işaretle."
- **Modelin tipik hatası:** yüzeysel üslup yorumlarıyla listeyi doldurur; var olmayan hata uydurur; güvenlik ve
  yetki denetimini atlar; farkın dışındaki çağıranlara bakmaz; her şeye "Önemli" der.
- **Yazar olarak:** model kendi değişikliğini teslim ederken "Kendi farkını yukarıdaki listeyle incele; neyi test
  etmediğini ayrı bir başlıkta yaz" deyin. Modelin "her şey test edildi" cümlesine değil, gösterdiği komut
  çıktısına güvenin.
- **Çıktıda denetleyin:** Engel düzeyindeki her bulguyu kendiniz doğrulayın (girdi örneğini çalıştırın); doğrulanmayan
  bulguyu düşürün.

## İlgili

- [Yeniden düzenleme](yeniden-duzenleme.md): inceleme sonrası güvenli temizlik.
- [Test stratejisi](test-stratejisi.md): testin neyi kanıtladığını değerlendirmek.
- [Teknik yazı](teknik-yazi.md): değişiklik özeti ve kayıt iletisi.
- [Hata sınıfları ve imzaları](hata-siniflari.md): incelemede aranacak kalıplar.
