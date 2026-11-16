---
baslik: Sır yönetimi: nerede durur, sızınca ne yapılır
ozet: Sır envanteri ve yerleri, depoya kaçan sırrın neden geçmişte kaldığı ve önce döndürülmesi, .env kuralları, CI sırları, istemci paketine sızan ortam değişkenleri, sır taraması ve en az yetki; çalışan örneklerle.
etiketler: [guvenlik, sir, env, ci, git, en-az-yetki]
duzey: temel
guncellik: 2026-11
---

# Sır yönetimi: nerede durur, sızınca ne yapılır

> Bu notu ne zaman okumalı: projeye API anahtarı, veritabanı parolası, imza anahtarı eklenirken; CI'ya dağıtım
> yetkisi verilirken; ön yüze yeni bir ortam değişkeni eklenirken; bir sırrın depoya, sohbete, ekran görüntüsüne
> ya da günlüğe düştüğü fark edildiğinde. Ayarların okunması ve açılışta doğrulanması:
> [Yapılandırma ve sırlar](../30-arkauc/yapilandirma-ve-sirlar.md).

## Temel fikir

Sır, kendisini bilene **yetki veren** her değerdir: API anahtarı, veritabanı parolası, imza/şifreleme anahtarı,
webhook gizli anahtarı, dağıtım belirteci, özel anahtar. Dört kural:

1. **Depoda yok, istemcide yok.** Depoya giren sır geçmişte kalır; tarayıcıya/mobil uygulamaya giren sır herkese
   açıktır.
2. **Dar yetki.** Her sır yalnız gereken işi, yalnız bir ortamda yapabilir; sızınca açtığı kapı küçüktür.
3. **Döndürülebilir.** Her sırrın nasıl değiştirileceği önceden bilinir ve denenmiştir.
4. **Sızınca önce döndür.** Silmek yetmez; sızan değer artık başkasınındır.

Hesaplar da sırdır: barındırma paneli, alan adı kayıt hesabı, DNS, e-posta sağlayıcısı, Git barındırma hesabı.
Bunlardan biri ele geçerse bütün sırlar zaten okunur; hepsinde iki aşamalı doğrulama açık olmalıdır.

## Karar tablosu: sır nerede durur

| Yer                          | Ne durur                                              | Kural                                                                  |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Depo                         | Yalnız `.env.example` (sahte değerlerle)              | Gerçek değer hiçbir dalda, hiçbir commit'te                            |
| Geliştirici makinesi         | `.env` (`.gitignore`'da), dar yetkili geliştirme anahtarları | Üretim sırrı geliştirici makinesinde durmaz                      |
| CI                           | CI'nin sır deposu; ortama/dala bağlı                  | Çatal (fork) isteklerine verilmez; günlüğe basılmaz                    |
| Üretim                       | Barındırıcının sır paneli ya da sır yöneticisi        | Çalışma anında verilir; görüntüye ve derleme argümanına girmez         |
| Tarayıcı paketi, mobil uygulama | **Hiçbir sır**                                     | Pakette ne varsa herkes okur                                           |
| Ekip içi paylaşım            | Parola yöneticisinin paylaşılan kasası                | Sohbet, e-posta, belge, ekran görüntüsü yok                            |

## Sır envanteri

Her projede kısa bir tablo tutun; döndürme günü geldiğinde ya da sızıntıda ilk bakılan yer budur. Havuzdaki
uygulama için:

| Sır / hesap                          | Ne açar                                  | Nerede                         | Yetkisini daraltma                      | Döndürme                              |
| ------------------------------------ | ---------------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------- |
| `MAIL_HTTP_KEY`                      | Bizim adımıza e-posta gönderme           | Barındırıcı paneli             | Yalnız "gönder" yetkili anahtar         | Sağlayıcıda yeni anahtar → panel → eskisini sil |
| Veritabanı dosyası ve yedekleri      | Bütün kayıtlar, parola özetleri          | Kalıcı disk, yedek alanı       | Yedek alanına yalnız yazma yetkisi      | Sızarsa oturumları düşür, parola değiştirt |
| Yönetici hesabı (`ADMIN_EMAILS`)     | Kullanıcıları kapatma/açma               | Uygulama                       | Tek kişi; güçlü ve benzersiz parola     | Parola değişimi                       |
| Barındırma, alan adı, DNS, Git hesapları | Her şey                              | Sağlayıcı panelleri            | İki aşamalı doğrulama; ayrı kurtarma e-postası | Parola + oturumları kapatma      |

Oturum belirteçleri yapılandırma sırrı değildir: her kullanıcıya rastgele üretilir ve veritabanında yalnız özeti
durur ([`random.ts`](../../uygulama/api/src/lib/random.ts)); bu yüzden uygulamada döndürülecek "oturum imza
anahtarı" yoktur.

## Depoya kaçan sır geçmişte kalır

Son commit'te silinen sır, geçmişteki commit'te durur; depoyu klonlayan, çatallayan, önbelleğe alan herkeste de
durur. Gösterim (geçici bir depoda):

```bash calistir
git -c init.defaultBranch=ana init -q depo && cd depo
g() { git -c user.name=ornek -c user.email=ornek@ornek.test -c commit.gpgsign=false "$@"; }
printf 'MAIL_HTTP_KEY=ornek_0123456789abcdef\n' > .env
g add .env && g commit -q -m "ayarlar"
git rm -q .env && printf '.env\n' > .gitignore && g add .gitignore && g commit -q -m "sırrı sil"
test ! -e .env  # çalışma klasöründe yok…
git log -p | grep -q "ornek_0123456789abcdef"  # …ama geçmişte duruyor
git log --oneline -S "ornek_0123456789abcdef" | wc -l  # değeri ekleyen ve silen commit'ler
```

```cikti
2
```

`git log -S "<değer>"` bir değerin hangi commit'lerde eklenip silindiğini bulur; sızıntının ne zamandan beri
açıkta olduğunu söyler.

## Sızınca: sıra önemlidir

1. **Döndür (dakikalar içinde):** sağlayıcıda yeni anahtar üret, üretime koy, **eskisini iptal et**. Sızan
   değerin artık işe yaramaması tek gerçek çözümdür.
2. **Kullanıldı mı bak:** sağlayıcının erişim günlüğünde sızıntı anından (`git log -S`) bu yana beklenmedik
   kullanım var mı (bilinmeyen IP, olağandışı hacim, yeni kaynak oluşturma).
3. **Kodu düzelt:** değer koddan çıkar, ortam değişkenine geçer; `.gitignore` ve tarayıcı eklenir.
4. **Geçmişi temizle (isteğe bağlı, döndürmeden sonra):** geçmişi yeniden yazan araçlar (ör. `git filter-repo`)
   ve zorla gönderme gerekir; ekipteki herkes yeniden klonlar. Döndürülmüş bir değer için çoğu zaman gerekmez.
5. **Kaydet:** ne sızdı, ne zaman, nerede göründü, ne yapıldı ([Olay müdahalesi](olay-mudahalesi.md)).

Herkese açık bir depoya gönderilen sırrın dakikalar içinde otomatik tarayıcılarca bulunduğunu varsayın; "kimse
görmemiştir" diye beklemeyin.

## `.env` kuralları

- `.env` hem `.gitignore`'da hem `.dockerignore`'da (havuzdaki uygulamada ikisi de var).
- `.env.example` her değişkeni **sahte** değerle ve bir açıklama satırıyla listeler; yeni değişken eklenince
  güncellenir.
- Sır komut satırı argümanı olarak verilmez (`ps` çıktısında görünür); ortam değişkeni ya da dosyadan okunur.
- Uygulama açılışta ayarları doğrular ama **değerleri yazmaz**; hata iletisinde yalnız değişken adı geçer.
- Docker görüntüsüne `COPY .env` ya da `ARG`/`ENV` ile sır gömülmez: katmanlarda ve görüntü geçmişinde kalır.
  Sır çalışma anında verilir.
- Geliştirme ile üretim aynı değeri paylaşmaz; geliştirme anahtarının yetkisi dardır (test kipi, kısıtlı kota).

## Sır taraması

Gönderimden önce (commit kancası) ve CI'da çalışan bir tarama, sızıntıyı depoya girmeden yakalar. Gerçek
projede bakımı süren bir araç kullanın (ör. gitleaks, trufflehog; kural setlerini sürümünüzde doğrulayın).
Mantığı şudur: bilinen biçimler + sır adlı alanlarda yüksek rastgelelikli değer, sahte değerler hariç.

```python calistir
import math
import re
from collections import Counter

BILINEN = [  # biçimler örnektir; araçların güncel kural setini kullanın
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "özel anahtar"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "bulut erişim anahtarı"),
    (re.compile(r"\b(sk|rk)_live_[A-Za-z0-9]{16,}"), "canlı ödeme anahtarı"),
]
ATAMA = re.compile(r"(?i)\b(\w*(secret|token|password|parola|sifre|api_?key|private)\w*)\s*[:=]\s*[\"']?([^\s\"']+)")
SAHTE = re.compile(r"(?i)^(<.*>|\$\{.*\}|degistir.*|changeme.*|x{3,}|ornek.*|example.*|test|dummy|\*+)$")


def entropi(deger: str) -> float:  # karakter başına bit
    sayim = Counter(deger)
    return -sum(c / len(deger) * math.log2(c / len(deger)) for c in sayim.values())


def tara(dosya: str, metin: str) -> list[str]:
    bulgular = []
    for no, satir in enumerate(metin.splitlines(), start=1):
        bulgular += [f"{dosya}:{no} {ad}" for kalip, ad in BILINEN if kalip.search(satir)]
        for eslesme in ATAMA.finditer(satir):
            deger = eslesme.group(3)
            if not SAHTE.match(deger) and len(deger) >= 16 and entropi(deger) >= 3.5:
                bulgular.append(f"{dosya}:{no} {eslesme.group(1)} yüksek rastgelelikli değer")
    return bulgular


DOSYALAR = {
    ".env.example": "MAIL_HTTP_KEY=<saglayicinin-anahtari>\nSESSION_SECRET=degistir-beni-en-az-32-karakter\n",
    "ayar.py": 'JWT_SECRET = "f3Kq9vX2mZ7pL1wR8tY4nB6c"\nDEBUG_TOKEN = "test"\nODEME = "sk_live_51Hx9QwErTyUiOpAsDfGh"\n',
}
bulgular = [b for ad, metin in DOSYALAR.items() for b in tara(ad, metin)]
for bulgu in bulgular:
    print(bulgu)
assert not any(b.startswith(".env.example") for b in bulgular)  # TEST: sahte değerler alarm vermez
```

```cikti
ayar.py:1 JWT_SECRET yüksek rastgelelikli değer
ayar.py:3 canlı ödeme anahtarı
```

Tarama yalnız son durumu değil **geçmişi** de taramalıdır (araçların "bütün geçmiş" kipi); depo ilk kez
taranırken geçmişte unutulmuş sırlar çıkar.

## İstemciye sızan ortam değişkenleri

Ön yüz paketleyicileri belirli önekli değişkenleri **derleme anında pakete gömer**: Vite'ta `VITE_`, Next.js'te
`NEXT_PUBLIC_`, Create React App'te `REACT_APP_`, Expo'da `EXPO_PUBLIC_`. Bu değişkenler herkesin indirdiği
JavaScript dosyasında düz metin durur. Havuzdaki web uygulamasında tek böyle değişken vardır ve sır değildir:
[`VITE_API_URL`](../../uygulama/web/src/vite-env.d.ts).

İstemcide kullanılmak üzere tasarlanmış "herkese açık" anahtarlar (ödeme sağlayıcısının yayımlanabilir anahtarı,
harita anahtarı) pakete girebilir; bunlar sağlayıcı panelinde alan adı ve kota ile kısıtlanır. Gizli anahtarla
yapılacak iş sunucuya taşınır; istemci sunucunuzu çağırır.

İki kural testi bunu otomatik yakalar: açık önekli değişkende sır adı ve derleme çıktısında sunucu sırrının değeri.

```python calistir
import pathlib
import re
import tempfile

ACIK_ONEKLER = ("VITE_", "NEXT_PUBLIC_", "REACT_APP_", "EXPO_PUBLIC_")
SIR_ADI = re.compile(r"SECRET|TOKEN|PASSWORD|PRIVATE|_KEY$")


def ortam_denetle(ortam: dict[str, str]) -> list[str]:
    return [ad for ad in ortam if ad.startswith(ACIK_ONEKLER) and SIR_ADI.search(ad)]


def paket_denetle(klasor: pathlib.Path, ortam: dict[str, str]) -> list[str]:
    sirlar = {ad: deger for ad, deger in ortam.items() if not ad.startswith(ACIK_ONEKLER) and len(deger) >= 8}
    bulgular = []
    for dosya in sorted(klasor.rglob("*")):
        if dosya.is_file():
            metin = dosya.read_text(encoding="utf-8", errors="ignore")
            bulgular += [f"{dosya.name}: {ad} değeri pakette" for ad, deger in sirlar.items() if deger in metin]
    return bulgular


ORTAM = {"VITE_API_URL": "https://api.ornek.com", "VITE_MAIL_KEY": "x", "MAIL_HTTP_KEY": "uretim-anahtari-0123456789"}
dist = pathlib.Path(tempfile.mkdtemp())
(dist / "index.js").write_text('fetch(u,{headers:{Authorization:"Bearer uretim-anahtari-0123456789"}})')  # YANLIŞ
(dist / "app.css").write_text("body{margin:0}")
# TEST: iki yanlış da yakalanır
assert ortam_denetle(ORTAM) == ["VITE_MAIL_KEY"]
assert paket_denetle(dist, ORTAM) == ["index.js: MAIL_HTTP_KEY değeri pakette"]
print("tamam")
```

```cikti
tamam
```

Bu denetimi derlemeden sonra CI'da çalıştırın; ikinci denetim, sırrın `define` gibi başka bir yoldan pakete
girmesini de yakalar. Mobil uygulama ikili dosyası da aynıdır: içine konan anahtar çıkarılabilir.

## CI sırları

- Sırlar CI'nin sır deposunda; mümkünse **ortama** (üretim, önizleme) bağlı ve korumalı dallarla sınırlı.
- Çatal depolardan gelen değişiklik isteklerinde sırlar verilmez; bu varsayılanı değiştiren tetikleyicilerle
  (GitHub'da `pull_request_target` gibi) güvenilmeyen kodu sırlarla çalıştırmayın.
- CI günlüğündeki maskeleme yalnız değerin birebir aynısını gizler; base64'lenmiş ya da bölünmüş hâli görünür.
  Sırrı hiçbir adımda yazdırmayın (`set -x` dahil).
- Bulut dağıtımında uzun ömürlü anahtar yerine kısa ömürlü kimlik federasyonu (OIDC) tercih edin; desteği
  sağlayıcınızda doğrulayın.
- İş akışlarının varsayılan belirteç yetkisini "okuma"ya indirin; yazma yalnız gereken işte.
- Üçüncü taraf eylem/eklenti sırlarınızı görür: sürümü sabitleyin ([Tedarik zinciri](tedarik-zinciri.md)).

## En az yetki

| Sır türü                     | Daraltma                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Veritabanı kullanıcısı        | Uygulama kullanıcısı tablo oluşturamaz/silemez; göç ayrı kullanıcıyla             |
| Üçüncü taraf API anahtarı     | Yalnız gereken kapsam (salt okuma, yalnız gönderim); ortam başına ayrı anahtar    |
| Yedek alanı kimliği           | Yalnız yazma; silme ve üzerine yazma yetkisi yok ([Yedek](yedek-ve-fidye-yazilimi.md)) |
| Dağıtım belirteci             | Tek depo/tek proje; süreli                                                         |
| Yapay zekâ aracına verilen erişim | Salt okuma, dar klasör/tablo ([YZ uygulama güvenliği](yapay-zeka-uygulama-guvenligi.md)) |

## Tuzaklar

| Belirti                                                              | Neden                                                     | Çözüm                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Sağlayıcıdan "anahtarınız herkese açık depoda bulundu" e-postası     | `.env` ya da kodda sabit değer gönderildi                 | Hemen döndür; sonra temizle; tarayıcı ekle                        |
| Sır silindi ama hâlâ kötüye kullanılıyor                             | Geçmişte duruyor; döndürülmedi                            | Döndürme ilk adımdır                                              |
| Tarayıcının geliştirici araçlarında gizli anahtar görünüyor          | `VITE_`/`NEXT_PUBLIC_` önekli değişkene sır yazıldı        | İş sunucuya; paket denetimi CI'da                                 |
| Docker görüntüsünü indiren herkes veritabanı parolasını okuyor       | `COPY .env` ya da `ENV PAROLA=…`                           | Çalışma anında ortam; `.dockerignore`                             |
| CI günlüğünde anahtar görünüyor                                      | `echo`, `set -x`, hata ayıklama çıktısı                    | Sırrı yazdıran adımı kaldırın; döndürün                           |
| Bir anahtar sızdı, bütün ortamlar etkilendi                          | Geliştirme, önizleme, üretim aynı anahtarı kullanıyor     | Ortam başına ayrı anahtar                                         |
| Ayrılan çalışan hâlâ erişebiliyor                                    | Ortak hesap, paylaşılan parola                            | Kişisel hesaplar; ayrılışta döndürme listesi                       |
| Sohbette paylaşılan parola aylar sonra aramada çıkıyor               | Sır sohbetle paylaşıldı                                   | Parola yöneticisi; paylaşılmışsa döndür                            |
| Modele yapıştırılan günlükte anahtar vardı                           | Günlük maskesiz                                           | Günlüğe sır yazmayın; modele göndermeden maskeleyin               |

## Denetim listesi

- [ ] Sır envanteri yazılı: ne açar, nerede durur, nasıl daraltıldı, nasıl döndürülür.
- [ ] `git log -p | grep` ve bir tarayıcıyla bütün geçmiş tarandı; bulunan her sır döndürüldü.
- [ ] `.env` `.gitignore` ve `.dockerignore`'da; `.env.example` güncel ve sahte değerli.
- [ ] Commit kancası ve CI'da sır taraması çalışıyor.
- [ ] Açık önekli (`VITE_` vb.) değişkenlerde sır yok; derleme çıktısı sunucu sırlarının değeri için taranıyor.
- [ ] CI sırları ortama/dala bağlı; çatal isteklerine verilmiyor; hiçbir adım sır yazdırmıyor.
- [ ] Her sır yalnız gereken yetkide ve ortam başına ayrı; barındırma, alan adı, DNS, Git hesaplarında iki
      aşamalı doğrulama açık.
- [ ] Sızıntı adımları (döndür → kullanım denetimi → düzelt → kaydet) yazılı ve bir sır için bir kez denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni sırrı koda yazma; `config.ts`'e ortam değişkeni olarak ekle, `.env.example`'a sahte
  değerle ekle, açılış doğrulamasına koy. Bu değer tarayıcıda gerekmiyorsa `VITE_` öneki kullanma. Değeri hiçbir
  günlüğe yazma."
- **Modelin tipik hatası:** "çalışsın diye" anahtarı koda ya da `VITE_` değişkenine koymak; `.env` dosyasını
  oluşturup commit'e eklemek; hata ayıklarken ayar nesnesinin tamamını yazdırmak; sızıntıda "geçmişten sildim"
  deyip döndürmeyi atlamak.
- **Çıktıda denetleyin:** değişiklikte 16+ karakterlik rastgele görünen dizgi, `sk_`, `-----BEGIN`, `password =`,
  yeni `VITE_` değişkeni, `console.log(config` / `print(ayarlar`; `git status`'ta `.env`.
- **Test isteyin:** yukarıdaki `ortam_denetle` ve `paket_denetle` kural testleri; açılış doğrulamasının sır
  değerini değil adını yazdığını sınayan test.

## İlgili

- Ayarların doğrulanması ve anahtar halkası: [Yapılandırma ve sırlar](../30-arkauc/yapilandirma-ve-sirlar.md)
- Şifreleme anahtarları ve zarf şifreleme: [Kriptografi kullanımı](kriptografi-kullanimi.md)
- Sızıntı bir olaya dönüştüyse: [Olay müdahalesi](olay-mudahalesi.md) · Günlükte sır: [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)
- Çalışan kod: [`uygulama/api/src/config.ts`](../../uygulama/api/src/config.ts) (açılışta doğrulama),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) (ortam değişkenleri tablosu); günlükte sır
  ve kişisel veri maskeleme [`yz/yz/guvenlik/maske.py`](../../yz/yz/guvenlik/maske.py)
