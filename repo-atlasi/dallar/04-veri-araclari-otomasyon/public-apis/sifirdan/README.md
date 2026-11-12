# public-apis — sıfırdan mini sürüm: liste doğrulayıcı, link denetleyici, JSON dışa aktarıcı

Bu klasör, public-apis deposunun **listeyi ayakta tutan araçlarını** sıfırdan yazar. Liste düz bir
Markdown dosyasıdır; asıl mühendislik onun etrafındaki doğrulama betiklerinde ve CI'dadır. Mini sürüm
orijinal koddan kopya değildir; aynı kuralları daha küçük, okunabilir fonksiyonlarla uygular ve asıl
betiklerdeki iki boşluğu kapatır.

## Gereksinimler

- Python 3.11+ (yalnızca standart kütüphane; asıl betikler `requests` kullanır, biz `urllib` kullanıyoruz)
- İnternet gerekmez: testler yerel bir `http.server` ile çalışır.

## Çalıştırma

```bash
cd sifirdan
python3 cli.py dogrula ornek/README.ornek.md              # biçim kuralları -> "Biçim kurallarına uygun."
python3 cli.py dogrula ornek/README.ornek.md --tum-dosya  # asıl betik gibi tüm '###' başlıklarını kategori say
python3 cli.py tekrarlar ornek/README.ornek.md            # tekrar eden linkler
python3 cli.py json ornek/README.ornek.md -o apis.json    # yapılandırılmış veri
python3 cli.py linkler /yol/public-apis/README.md --sinir 20  # gerçek listede canlılık testi (AĞ GEREKİR, nazik ol)
```

Hata bulunursa çıkış kodu 1 olur; CI adımı bu sayede kırmızıya döner.

## Test

```bash
python3 -m unittest discover -s . -t .                   # sifirdan/ içinden: 23 test
python3 -m unittest discover -s sifirdan -t sifirdan     # ya da public-apis/ klasöründen
```

## Aşamalar

| Aşama | Dosya                   | Ne öğretir                                                                                                                            |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_ayristir.py`    | Satır satır Markdown tablosu ayrıştırma; `## Index` bölümü; iki farklı başlık yazımı                                                  |
| 2     | `asama2_dogrula.py`     | Kural motoru: her kural küçük bir fonksiyon, hatalar `(L042) mesaj` biçiminde ve satıra göre                                          |
| 3     | `asama3_linkler.py`     | Eş zamanlı HTTP (thread havuzu), host başına sınır, HEAD→GET, zaman aşımı, bot koruması tespiti                                       |
| 4     | `asama4_json.py`        | Metinden yapılandırılmış veriye: normalizasyon (`Yes`→`true`), özet istatistik                                                        |
| -     | `cli.py`                | Alt komutlu CLI, CI dostu çıkış kodları                                                                                               |
| -     | `ornek/README.ornek.md` | Kurgusal örnek liste (`example.*` alan adları). `prettier-ignore` ile korunur: Prettier tabloyu hizalarsa "tek boşluk" kuralı bozulur |

## Gerçek depoyla eşleme

| Mini'deki parça                      | Gerçek depodaki karşılığı                                                                                  | Fark                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ayristir()`                         | `scripts/validate/format.py` → `get_categories_content`                                                    | Asıl betik tüm `###` başlıklarını kategori sayar; biz varsayılan olarak `## Index` sonrasına bakarız        |
| `kaydi_denetle()` ve alt kuralları   | `format.py` → `check_entry`, `check_title`, `check_description`, `check_auth`, `check_https`, `check_cors` | Aynı kurallar; fazladan sütunlara yalnızca boşsa izin veririz (asıl betik `>= 5` der)                       |
| `kategoriyi_denetle()`               | `format.py` → `check_alphabetical_order`, `check_file_format`                                              | Son kategorinin "en az 3 kayıt" kuralını da denetleriz; sırayı bozan ilk satırı gösteririz                  |
| `linkleri_bul()`, `tekrarlari_bul()` | `scripts/validate/links.py` → `find_links_in_text`, `check_duplicate_links`                                | Daha sade düzenli ifade                                                                                     |
| `linkleri_denetle()`                 | `links.py` → `check_if_list_of_links_are_working`                                                          | Asıl betik linkleri sırayla dener ve tarayıcı taklidi yapan User-Agent kullanır; biz eş zamanlı + dürüst UA |
| `_korumali_mi()`                     | `links.py` → `has_cloudflare_protection`                                                                   | Yalnızca `Server: cloudflare` + 403/503 kontrolü                                                            |
| `disa_aktar()`                       | Ayrı proje: `davemachado/public-api` (README'de bağlantısı var)                                            | Şema bizim; o projenin API şekli doğrulanmadı                                                               |
| `cli.py`                             | `.github/workflows/test_of_push_and_pull.yml`, `validate_links.yml`                                        | CI yerine yerel komut                                                                                       |

## Gerçek README üzerinde ölçüm (8870667, 2026-11-08)

Doğrulayıcımızı gerçek README'ye (veri olarak) uyguladığımızda: 51 kategori, 2.338 kayıt; normal kipte
53 bulgu (29'u alfabetik sıra, 12'si 100 karakteri aşan açıklama, 3'ü " API" ile biten başlık, 3'ü boş
olmayan fazla sütun), asıl betiği taklit eden `--tum-dosya` kipinde 146 bulgu (sponsor ve MCP bölümleri de
kategori sanılıyor) ve 5 tekrar eden link. Bu sayılar bizim kurallarımıza göredir; asıl CI'ın bugünkü
durumu (yeşil/kırmızı) doğrulanmadı.

## Etik not

Link denetleyicisini başkalarının sunucularına karşı çalıştırırken `--host-basina` değerini düşük tut,
`--sinir` ile küçük başla ve dürüst User-Agent'ı değiştirme. Bot korumasını atlatmaya çalışmak sitenin
kurallarını çiğnemek demektir.
