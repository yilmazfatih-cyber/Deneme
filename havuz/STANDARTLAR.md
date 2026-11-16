# Havuz standartları

Bu belge havuzdaki **her temelin** (klasörün) uyduğu ortak kurallardır. Yeni bir temel ekleyen ya da var olanı
değiştiren herkes — insan ya da model — önce bunu okur.

## 1. Kimin için yazıyoruz

Havuzdaki her dosyanın iki okuru vardır:

1. **Proje sahibi.** Programcı değildir. Türkçe okur. Komutları kopyalayıp çalıştırır; hata çıkarsa hata metnini bir
   modele yapıştırır. Ona "neden" ve "nasıl çalıştırılır" lazımdır, iç ayrıntı değil.
2. **Küçük bir dil modeli.** Bu kodu bundan sonra o genişletecek. Bağlamı dardır, uzun dosyalarda kaybolur, bir kuralı
   unutabilir, var olmayan bir fonksiyonu uydurabilir. Ona **raylar** lazımdır: küçük dosyalar, kopyalanacak örnekler,
   tek komutluk denetim, ne yapacağını söyleyen hata iletileri.

Her tasarım kararında şu soruyu sorun: _"Küçük bir model bu dosyayı tek başına açtığında doğru şeyi yapabilir mi?"_

## 2. Bağımsızlık

- Her temel **tek başına kopyalanabilir**: kardeş klasörlerden içe aktarma yok, depo köküne bağımlılık yok.
- Her temelin kendi `package.json` ya da `pyproject.toml` dosyası, kilit dosyası, `.gitignore`'u, testleri vardır.
- İki temel aynı küçük yardımcıya ihtiyaç duyarsa her biri kendi kopyasını taşır; asıl kaynak başlık yorumunda yazılır.

## 3. Dil

| Ne                                                                  | Hangi dil                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| README, AGENTS.md, `docs/`, kod yorumları, komut satırı yardım metni | Türkçe (ç, ğ, ı, İ, ö, ş, ü doğru yazılır)                   |
| Kullanıcının gördüğü arayüz metni                                   | Türkçe; koda gömülmez, tek bir sözlük dosyasında durur       |
| Değişken, fonksiyon, sınıf, kaynak dosya adları                     | İngilizce (`createSession`, `rate_limit.py`)                 |
| Üst klasör ve belge dosyası adları                                  | Türkçe, yalnız ASCII (`uygulama/`, `docs/MIMARI.md`)         |
| npm betik adları                                                    | İngilizce, alışılmış adlar (`dev`, `build`, `check`, `test`) |
| Python komut satırı alt komutları                                   | Türkçe, yalnız ASCII (`egit`, `uret`, `dogrula`, `sun`)      |

Türkçe metin işleme: büyük/küçük harf **her zaman** yerel kuralla (`toLocaleUpperCase('tr-TR')`, Python'da kendi
`upper_tr` yardımcımız). `i → İ`, `ı → I` hatası bir kusurdur; mümkünse lint ya da testle yakalanır.

## 4. Her temelde bulunan dosyalar

```
<temel>/
├─ README.md        insan için: ne işe yarar, 5 dakikada çalıştırma, neler var, sınırlar
├─ AGENTS.md        model için: komutlar, harita, değişmez kurallar, tarifler, sık hatalar, bitti tanımı
├─ havuz.json       makine için: kurulum ve denetim komutları, yer tutucular (aşağıda)
├─ .gitignore
├─ docs/KARARLAR.md hangi teknoloji neden seçildi, hangi seçenek neden elendi (kısa kayıtlar)
└─ docs/MIMARI.md   parçalar ve aralarındaki veri akışı (büyük temellerde)
```

### `havuz.json`

```json
{
  "ad": "uygulama",
  "baslik": "Tam yığın uygulama temeli",
  "ozet": "Tek cümlelik açıklama.",
  "tur": "node",
  "gereksinim": { "node": ">=22.12" },
  "kur": ["npm ci"],
  "denetle": ["npm run check"],
  "uzunDenetim": ["npm run e2e"],
  "baslat": "npm run dev",
  "yerTutucular": [{ "ara": "havuz-uygulama", "anlam": "paket adı (küçük harf, tire)" }],
  "kopyalamaHaric": ["node_modules", "dist"]
}
```

- `tur`: `node`, `python` ya da `karma`.
- Python temellerinde `kur` yerine `"python": { "ekstra": "dev" }` yazılır; araçlar sanal ortamı kendisi kurar
  (`python -m venv .venv` + `pip install -e ".[dev]"`) ve `denetle` komutlarını o ortamla çalıştırır.
- `denetle` **hızlı** olmalıdır (hedef: 2 dakikanın altı, ağ gerektirmez). Yavaş ya da tarayıcı isteyen her şey
  `uzunDenetim`e gider.
- `yerTutucular`: temel yeni bir projeye kopyalanırken değiştirilecek metinler (paket adı, görünen ad…).

## 5. Tek komutluk denetim

| Tür    | Komut                     | İçinde ne var                                                          |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| Node   | `npm run check`           | tip denetimi + lint + biçim denetimi + birim testler (+ içerik/kural) |
| Python | `python scripts/check.py` | `ruff check` + `ruff format --check` + `mypy` + `pytest`               |

Kural: **Denetim yeşil değilse iş bitmemiştir.** Bir testi atlamak, devre dışı bırakmak ya da beklentiyi gevşetmek
çözüm değildir; ya kod düzeltilir ya da testin neden yanlış olduğu yazılarak test düzeltilir.

## 6. Kod kuralları (küçük model dostu)

1. **Küçük dosya, tek iş.** Kaynak dosya ~300 satırı, fonksiyon ~60 satırı aşmaz (yumuşak sınır).
2. **Başlık yorumu.** Her kaynak dosya 3–10 satırlık Türkçe bir başlıkla açılır: dosya ne yapar, kim kullanır,
   nasıl genişletilir (`Genişletme:` satırı).
3. **Açık, sıradan kod.** Üst-programlama, derin kalıtım, sihirli otomatik keşif yok. Bir şeyi kaydetmek gerekiyorsa
   tek bir kayıt dosyası vardır ve içinde `YENİ … BURAYA` yorumu bulunur.
4. **Kopyalanacak örnek.** Her kalıbın (varlık, sayfa, uç nokta, katman, üreteç…) tam çalışan bir örneği ve
   testi vardır. Yeni iş, o örnek kopyalanıp uyarlanarak yapılır.
5. **Üreteçler.** Sık yinelenen iş için betik yazılır (`npm run gen -- …`); model dosyaları elle kurmak yerine
   üreteci çalıştırır, sonra boşlukları doldurur.
6. **Sınırda doğrulama.** Dışarıdan gelen her veri (istek gövdesi, dosya, ortam değişkeni, model çıktısı) şemayla
   doğrulanır (TypeScript'te Zod, Python'da Pydantic).
7. **Sıkı tipler.** TypeScript `strict` + `noUncheckedIndexedAccess`; Python'da her fonksiyonda tip imzası, `mypy`.
8. **Belirlenimci.** Rastgelelik tohumludur; saat ve rastgele kaynak işlevlere parametreyle verilir ki test edilsin.
9. **Yarım iş yok.** Depoda `TODO` gövdeli fonksiyon, boş `pass`, "sonra yazılacak" taslağı bulunmaz. Kapsam dışı
   kalan şey README'nin "Sınırlar" bölümüne yazılır.
10. **Hata iletileri yol gösterir.** Kullanıcıya dönük hata Türkçedir, suçlamaz, ne yapılacağını söyler. Kural
    testlerinin iletisi düzeltme adımını içerir ("… bulunamadı: `npm run gen -- migration x` çalıştırın").

## 7. Kural testleri

Her temel, kendi kurallarını **testle** korur. Örnekler: her varlığın bir migrasyonu var mı; kullanılan her sözlük
anahtarı sözlükte var mı; her sayfanın başlığı var mı; yasaklı çağrı (`toUpperCase()`) kullanılmış mı; her veri
dosyasının kaynak kaydı var mı. Bu testler `check` içinde koşar.

## 8. Bağımlılıklar

- Az ve yaygın. Bir bağımlılık ancak ~300 satırdan fazla riskli kodu kurtarıyorsa eklenir; gerekçesi
  `docs/KARARLAR.md`'ye yazılır.
- Sürümler kilit dosyasıyla sabitlenir (`package-lock.json`). Kurulum komutu kilitten kurar (`npm ci`).
- Kasım 2026 itibarıyla ortak sürüm çizgisi: Node ≥ 22.12 (yerel TypeScript çalıştırma), TypeScript `~6.0`
  (typescript-eslint 7'yi henüz desteklemiyor), Python ≥ 3.11.
- Sürüme bağlı bir API'yi **ezberden yazmayın**: kurulu paketin kendi kaynak kodundan ya da belgelerinden doğrulayın.

## 9. Testler

- Hızlı, çevrimdışı, belirlenimci. Ağ isteyen test varsayılan olarak atlanır ve bir ortam değişkeniyle açılır.
- Saf mantık birim testsiz, ekran uçtan uca testsiz eklenmez.
- Sayısal kod başka bir gerçeklemeyle karşılaştırılır (sonlu fark, kaba kuvvet, başvuru kütüphanesi).
- Tarayıcı testleri telefon boyutunda da koşar (390×844 ve 360×800) ve axe erişilebilirlik taraması içerir.

## 10. Güvenlik ve gizlilik

- Depoda sır yok: yalnız `.env.example`. Günlüklere parola, belirteç, kişisel veri yazılmaz.
- SQL her zaman parametreli. Kullanıcı girdisi HTML'e kaçışsız basılmaz.
- Varsayılanlar güvenli taraftadır (kapalı CORS, kısa ömürlü belirteç, en az yetki).
- Üçüncü taraf veri ve modelin lisansı, dosyanın yanındaki kayıtta yazar. Lisansı belirsiz içerik depoya girmez.

## 11. Dürüstlük

- README'de **"Sınırlar"** bölümü zorunludur: ne denenmedi, ne eksik, nerede yanılıyor olabilir.
- Doğrulanmamış bilgi (sürüm, model adı, lisans, rakam) doğrulanmış gibi yazılmaz; "doğrulanmadı" diye işaretlenir.
- Ölçüm veren her cümlenin yanında nasıl ölçüldüğü yazar.

## 12. Varsayılan kapılar (çakışmasın diye)

| Temel      | Kapı                                      |
| ---------- | ----------------------------------------- |
| uygulama   | web 5310 · önizleme 5311 · API 8310       |
| site       | geliştirme 4410 · önizleme 4411           |
| yz         | 8420                                      |
| dil-modeli | 8430                                      |
| veri       | 8440                                      |
| sifirdan   | 8450–8469                                 |

Testler sabit kapı yerine boş bir kapı (`0`) ister.

## 13. `AGENTS.md` şablonu

```markdown
# <Temel adı> — model talimatları

## Bu temel ne yapar

(3–5 satır)

## Komutlar

(tablo; hepsi bu klasörden çalışır)

## Harita

("Şunu değiştireceksen şuraya bak" tablosu: klasör/dosya → sorumluluk)

## Değişmez kurallar

(numaralı; her kuralın yanında onu hangi test/lint'in koruduğu)

## Tarifler

(en sık 5–10 iş; her biri: dokunulacak dosyalar, numaralı adımlar, doğrulama komutu)

## Sık yapılan hatalar

(belirti → neden → çözüm tablosu)

## Bitti tanımı

(kontrol listesi)
```
