# beceri_kiti — Agent Skills biçimini sıfırdan kurmak

Bu klasör D08 dalının **ortak çekirdeğidir**. Bir "beceri"nin (skill) yaşam döngüsünü baştan sona, yalnızca
Python standart kütüphanesiyle kurar: SKILL.md'yi okumak, doğrulamak, modele kısa bir liste sunmak, görev
için beceri seçmek, gövdeyi ve kaynakları gerektiğinde yüklemek, paketlemek, kurmadan önce taramak ve
açıklamanın ne kadar iyi tetiklendiğini ölçmek. Dalın öteki minileri (superpowers, mattpocock-skills) bu
çekirdeği kopyalamadan kullanır.

## Gereksinimler

- Python 3.10 veya üstü (burada 3.13 ile denendi). Dış paket yok; PyYAML bile yok.
- Testler çevrimdışı çalışır; gerçek bir LLM çağrılmaz.

## Çalıştırma

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/anthropic-skills/sifirdan
python3 beceri.py dogrula ornek-beceriler/fatura-ozeti               # spec profiliyle doğrula
python3 beceri.py dogrula ornek-beceriler/toplanti-notu --profil claude-code
python3 beceri.py liste ornek-beceriler                               # modele gösterilen liste (1. düzey)
python3 beceri.py sec "bu faturaların KDV toplamını çıkar" ornek-beceriler
python3 beceri.py yukle fatura-ozeti references/kdv-oranlari.md --kok ornek-beceriler
python3 beceri.py paketle ornek-beceriler/commit-mesaji /tmp/paketler
python3 beceri.py tara ornek-beceriler
python3 beceri.py tetik ornek-beceriler/commit-mesaji/evals/tetik-sorgulari.json commit-mesaji ornek-beceriler \
  --aday "Git ile ilgili yardımcı."
```

Başkasının becerisini denetlerken Python'u **yalıtılmış kipte** çalıştır: `python3 -I /tam/yol/beceri.py tara
/indirilen/beceri`. `-I` geçerli klasörü ve ortam değişkenlerini `sys.path`'e katmaz; böylece indirilen klasördeki
`json.py` gibi bir dosya senin `import json` satırını ele geçiremez. `beceri.py` kendi paketini `sys.path`'e
kendisi ekler.

## Test

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/anthropic-skills/sifirdan
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -t .
```

`PYTHONDONTWRITEBYTECODE=1` depoda `__pycache__` bırakılmasını önler (klasördeki `.gitignore` da onu dışarıda tutar).

86 test: ön bilgi ayrıştırıcı (29), doğrulayıcı (20), dizin ve seçici (8), yükleyici (8), paket (7), tarayıcı (4),
tetiklenme değerlendirmesi (7) ve komut satırı (3). Kötü niyetli ya da bozuk örnek beceriler depoda durmaz;
testler onları geçici klasörde üretip siler.

## Aşamalar

| #   | Modül                       | Ne inşa edersin                                                            | Öğrendiğin kavram                                   |
| --- | --------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | `beceri_kiti/onbilgi.py`    | YAML alt kümesi ayrıştırıcı: düz/tırnaklı skaler, `\|` `>` blokları, liste | Ön bilgi (frontmatter), girintiye dayalı ayrıştırma |
| 2   | `beceri_kiti/dogrulama.py`  | Profil kurallı doğrulayıcı (`spec`, `claude-code`, `codex-kopya`)          | Temel belirtim ve harness eklentileri ayrımı        |
| 3   | `beceri_kiti/dizin.py`      | Keşif, gölgeleme, model listesi, BM25 seçici, `/ad` ile açık çağrı         | Aşamalı açılım 1. düzey: tetik = açıklama           |
| 4   | `beceri_kiti/yukleyici.py`  | Gövdeyi ve kaynakları gerektiğinde yükleyen oturum, bağlam günlüğü, bütçe  | 2. ve 3. düzey, yol sınırlama, bağlam maliyeti      |
| 5   | `beceri_kiti/paket.py`      | Belirlenimci `.skill` zip, SHA-256 özeti, zip-slip korumalı açma           | Paketleme, tedarik zinciri bütünlüğü                |
| 6   | `beceri_kiti/guvenlik.py`   | Gizli Unicode, HTML yorumu, enjeksiyon kalıbı, ağ komutu, kanca taraması   | Üçüncü taraf beceri riski                           |
| 7   | `beceri_kiti/tetik_eval.py` | Eğitim/test bölmeli tetiklenme değerlendirmesi, aday seçimi                | Açıklama iyileştirme, aşırı uydurmadan kaçınma      |

### Aşama 1–2: biçim ve kurallar

Doğrulayıcının `spec` profili, anthropics/skills deposundaki `skills/skill-creator/scripts/quick_validate.py`
kurallarını izler (commit `2c5958e`): izinli alanlar `name`, `description`, `license`, `allowed-tools`, `metadata`,
`compatibility`; `name` küçük harf-rakam-tire, en fazla 64 karakter, tireyle başlayıp bitemez ve `--` içeremez;
`description` en fazla 1024 karakter ve `<` `>` içeremez; `compatibility` en fazla 500 karakter. `claude-code`
profili mattpocock/skills'te gördüğümüz `disable-model-invocation` ve `argument-hint` alanlarını da kabul eder;
`codex-kopya` profili ECC'nin `scripts/ci/validate-skill-host-compat.js` izin listesidir. Aynı beceri bir profilde
geçerli, ötekinde geçersiz olabilir:

```text
$ python3 beceri.py dogrula ornek-beceriler/toplanti-notu
toplanti-notu: GEÇERSİZ (spec)
  [hata] bilinmeyen-alan: "argument-hint" alanı "spec" profilinde tanımlı değil (...)
  [hata] bilinmeyen-alan: "disable-model-invocation" alanı "spec" profilinde tanımlı değil (...)
```

Uyarılar başka depolardan derlenmiş iyi uygulamalardır ve mesajda kaynağı yazar: gövde 500 satırı geçmesin
(skill-creator), SKILL.md 20 000 baytı geçmesin (superpowers `tests/skill-size`), açıklama `|` blokla yazılmasın
(ECC `validate-skills.js`), kabuk bloklarında Claude'a özgü değişken kalmasın, kurulumla birlikte gidecek klasörde
baskı senaryosu bulunmasın (superpowers `tests/skill-layout`), gövdenin işaret ettiği dosya gerçekten var olsun.

### Aşama 3–4: aşamalı açılım

`dizin.kesfet()` her SKILL.md'yi **yalnızca kapanış `---` satırına kadar** okur; gövdeye dokunmaz. Modele giden
liste her turda bağlamda durur, beceri hiç kullanılmasa bile:

```text
$ python3 beceri.py yukle fatura-ozeti references/kdv-oranlari.md --kok ornek-beceriler
düzey | beceri | ne | karakter | ~token
--- | --- | --- | --- | ---
1 | * | beceri listesi (ad + açıklama) | 465 | 117
2 | fatura-ozeti | SKILL.md gövdesi | 856 | 214
3 | fatura-ozeti | references/kdv-oranlari.md | 652 | 163
3 | fatura-ozeti | betik listesi (içerik okunmadı) | 17 | 5
toplam | | | 1990 | 498
```

Token sayıları kaba bir tahmindir (4 karakter ≈ 1 token); Türkçe metinde gerçek sayı genellikle daha yüksektir.
`kaynak_oku()` yolu çözer ve beceri klasörünün dışına çıkan her şeyi (`../`, dışarıyı gösteren sembolik bağlantı)
reddeder. Betikler yalnızca listelenir: bu araç takımı hiçbir koşulda betik çalıştırmaz.

### Aşama 5–6: paket ve güvenlik

`paketle()` önce doğrular, sonra `<ad>.skill` (zip) ve `<ad>.skill.sha256` üretir. Hariç tutma kuralları özgün
`package_skill.py` ile aynıdır: `__pycache__`, `node_modules`, `*.pyc`, `.DS_Store` ve **yalnızca kökteki**
`evals/`. Özgünden farkı, zaman damgalarını sabitleyip dosyaları sıralamasıdır: aynı girdi aynı baytları verir,
böylece yayımlanan özet anlamlı olur. `guvenli_ac()` mutlak yol, `..`, sembolik bağlantı, birden çok üst klasör ve
50 MB'ı aşan açılmış boyutu reddeder.

`tara()` sezgiseldir. Temiz örneklerde yalnızca "bu bir betik, oku" bilgisini verir; gerçek depolarda ise çok
sayıda bulgu çıkar ve çoğu meşrudur (bkz. aşağıdaki tablo). Tarayıcının işi karar vermek değil, okunacak satırları
öne çıkarmaktır.

Tarayıcıyı bu dalın kendi klasöründe de çalıştırdık ve gerçek bir sorun yakaladı: kaynak dosyalarımızın bir kısmına
`\u200b` kaçış dizisi yerine görünmez karakterin kendisi yazılmıştı (editörde fark edilmez). Hepsini kaçış dizisine
çevirdik. Ders: görünmez karakter yalnızca saldırgandan değil, araç zincirinden de gelir; taramayı kendi koduna da uygula.

### Aşama 7: tetiklenme değerlendirmesi

skill-creator'ın `run_eval.py` ve `run_loop.py` betiklerindeki kurallar: her sorgu 3 kez koşulur, eşik 0.5'tir,
sorgular `should_trigger`'a göre katmanlı bölünür (her sınıftan `max(1, int(n * 0.4))` sorgu teste), en iyi açıklama
**test** puanına göre seçilir. Gerçek ölçüm yalnızca modelin ilk araç çağrısına bakar (`Skill` ya da `Read` değilse
"tetiklenmedi"). Bizde model yerine BM25 + tohumlu gürültü kullanan `SahteYonlendirici` var; en yüksek puanlı beceri
eşiği geçerse "okunmuş" sayılır. Komut JSON yazar; aşağıda `gecmis` alanının özeti var:

```text
$ python3 beceri.py tetik ... --aday "Git ile ilgili yardımcı."
"en_iyi_aciklama": "Git ile ilgili yardımcı."   "en_iyi_puan": "4/4"   (6 eğitim, 4 test sorgusu)
sira 1  özgün açıklama               eğitim 4/6   test 3/4
sira 2  "Git ile ilgili yardımcı."   eğitim 4/6   test 4/4   ← seçilen
```

Bu sonuç bir hata değil, bir derstir. Oyuncak yönlendirici becerinin **adını** da okuduğu için (`commit-mesaji`)
zayıf açıklama olumlu sorguları yine yakalar; zengin açıklamadaki "açıklama" sözcüğü ise "pull request
açıklaması" gibi yakın-ıska bir sorguda yanlış tetiklenme üretir. Dört sorguluk bir test kümesinde tek bir sorgu
kararı çevirir. Gerçek değerlendirmede bu yüzden 20 civarı gerçekçi sorgu, çok koşu ve ayrılmış test kümesi
kullanılır; yine de küçük kümeler yanıltır.

## Gerçek depolarda denemek

Doğrulayıcıyı klonlardaki gerçek becerilere (yalnızca veri olarak okuyarak, `python3 -I` ile) uyguladığımızda:

| Depo (commit)                      | Profil        | Beceri | Geçersiz | Öne çıkan bulgular                                                                                                       |
| ---------------------------------- | ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| anthropics/skills (`2c5958e`)      | `spec`        | 19     | 1        | `claude-api` açıklaması 1068 karakter (sınır 1024); `pdf` gövdesi `REFERENCE.md`/`FORMS.md` diyor, dosyalar küçük harfli |
| obra/superpowers (`22f0b46`)       | `claude-code` | 15     | 0        | 3 bağlantı başka becerinin klasörüne gidiyor (`../using-superpowers/...`)                                                |
| mattpocock/skills (`4ae2317`)      | `claude-code` | 39     | 1        | `in-progress/software-factory` açıklamasında tırnaksız `: ` var; PyYAML da okuyamıyor                                    |
| andrej-karpathy-skills (`2c60614`) | `claude-code` | 1      | 0        | —                                                                                                                        |
| affaan-m/ECC (`d2ef268`)           | `claude-code` | 314    | 0        | 36 gövde 500 satırı, 29 SKILL.md 20 000 baytı aşıyor; 32 beceride 40 belirtim dışı alan (`tools`, `origin` …)            |
| affaan-m/ECC `.agents/skills`      | `codex-kopya` | 47     | 0        | izin listesine uyuyor                                                                                                    |

`claude-api` açıklamasının uzunluğunu PyYAML ile de ölçtük: 1068. Yani Anthropic'in kendi deposundaki bir beceri,
aynı depodaki doğrulayıcının sınırını aşıyor; harness'in bu sınırı nasıl uyguladığı ise klonda görünmüyor
(doğrulanmadı).

## Eşleme tablosu

| Mini'deki parça              | Gerçek depodaki karşılığı (anthropics/skills, `2c5958e`)                                           | Fark                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `onbilgi.oku`                | `skills/skill-creator/scripts/quick_validate.py` (PyYAML), `skills/skill-creator/scripts/utils.py` | Standart kütüphaneyle YAML alt kümesi; desteklenmeyen yapıda açık hata                                  |
| `dogrulama.dogrula` (`spec`) | `skills/skill-creator/scripts/quick_validate.py`                                                   | Ek profiller ve kaynaklı uyarılar; özgün yalnızca ilk hatayı döndürür                                   |
| `dizin.Secici`               | Harness'in model tarafı (depoda yok)                                                               | Sözcük eşleştirme; gerçek model anlamı anlar                                                            |
| `yukleyici.Oturum`           | `skills/skill-creator/SKILL.md` "Progressive Disclosure" bölümü                                    | Bağlam günlüğü ve bütçe öğretim içindir                                                                 |
| `paket.paketle`              | `skills/skill-creator/scripts/package_skill.py`                                                    | Belirlenimci zip + SHA-256 özeti eklendi                                                                |
| `paket.guvenli_ac`           | (depoda yok)                                                                                       | Zip-slip, sembolik bağlantı ve boyut denetimi                                                           |
| `guvenlik.tara`              | (depoda yok; fikir ECC `the-security-guide.md`)                                                    | Sezgisel kalıp taraması                                                                                 |
| `tetik_eval`                 | `skills/skill-creator/scripts/run_eval.py`, `run_loop.py`                                          | `claude -p` ve "ilk araç çağrısı" kuralı yerine sahte yönlendirici; açıklamaları LLM değil sen yazarsın |

## Bilinen sınırlar

- YAML alt kümesi: çapa, takma ad, etiket, akış eşlemesi ve iç içe akış listesi desteklenmez. PyYAML 1.1'in aksine
  `yes`/`no` metin olarak kalır.
- Seçici sözcük düzeyindedir; eş anlamlıları ve olumsuzlamayı ("geri alma, mesaj yazma değil") anlamaz.
- Tarayıcı bilinen kalıpları arar; kodlanmış ya da yeni bir saldırıyı kaçırabilir. Temiz sonuç güvence değildir.
- Kaynak referansı denetimi düzyazıdaki bağlantılara ve beceride var olan klasörlerle başlayan yollara bakar;
  kod bloklarındaki yolları atlar.
