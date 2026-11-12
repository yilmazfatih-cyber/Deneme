# Aylık bülten üretici — HelloGitHub'ın yayın hattının küçük kopyası (Node.js)

HelloGitHub 2016'dan beri her ayın 28'inde bir "sayı" yayımlıyor: dil kategorilerine ayrılmış, numaralı, her biri bir
başlık ve kısa açıklamayla tanıtılan açık kaynak projeler. Bu mini aynı ürünü Türkçe kurar: proje önerilerini JSON'dan
okur, **başvuru kurallarına göre denetler**, numaralı Markdown sayısını, **RSS 2.0 akışını**, sayı dizinini ve öneren
katkıcılar listesini üretir.

## Gereksinimler

Node.js 20 veya üstü. Bağımlılık yok (`node:fs`, `node:util` `parseArgs`, `node:test`).

## Çalıştırma

```bash
node cli.js veri cikti --site https://bulten.example
# isteğe bağlı tıklama sayacı (her bağlantı sayaçtan geçer)
node cli.js veri cikti --site https://bulten.example --izleme https://bulten.example/tikla
```

Çıktı:

```text
cikti/
├── icerik/sayi-001.md   numaralı sayı (kategoriler sabit sırada, numaralar kesintisiz)
├── icerik/sayi-002.md
├── rss.xml              RSS 2.0, en yeni sayı en üstte
└── README.md            sayı tablosu (satır başına 5 sayı) + öneren katkıcılar
```

## Test

```bash
node --test
```

16 test (5 grup). Not: Node 22'de `node --test test/` gibi klasör vermek çalışmaz; bu klasörün içinde argümansız
`node --test` ya da `node --test 'test/*.test.js'` kullan.

## Aşamalar

| Parça (`aylik.js`)  | Ne öğretir                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `dogrula`           | Başvuru formundaki sınırlar (başlık en çok 50, açıklama 32–256 karakter, yalnız GitHub deposu), aynı projenin tekrarı |
| `sirala`            | Sabit kategori sırası + kategori içinde öneri sırası (kararlı sıralama)                                               |
| `sayiyiOlustur`     | Kesintisiz numaralama: "4." ile başlayan Markdown listesi 4'ten başlar (CommonMark başlangıç numarası)                |
| `tiklamaBaglantisi` | Tıklama sayacı ve neden `encodeURIComponent` gerektiği                                                                |
| `rssOlustur`        | RSS 2.0, RFC 822 tarihi, XML kaçışı, "şimdi" yerine veriden gelen `lastBuildDate` (belirlenimci çıktı)                |
| `dizinTablosu`      | README'deki sayı tablosu                                                                                              |
| `katkidaBulunanlar` | Öneren kullanıcıları sayma; topluluğu görünür kılmak                                                                  |
| `cli.js`            | `parseArgs`, birikimli doğrulama (her sayı öncekilere karşı), hata varsa hiçbir dosya yazmama                         |

## Gerçek depodaki karşılıklar

| Mini'deki parça     | Gerçek depodaki karşılığı (`521xueweihan/HelloGitHub`, `d65699c`)                                                                  | Fark                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `veri/sayi-*.json`  | Öneriler: `.github/ISSUE_TEMPLATE/submit-en.yaml` ve `submit-cn.yaml` formları + hellogithub.com                                   | Gerçek öneriler sitede toplanıyor; depoda yalnızca form ve yayımlanan sayılar var |
| `dogrula` sınırları | `submit-en.yaml`: `max_length: 50` (başlık), `min_length: 32`, `max_length: 256` (açıklama)                                        | Aynı sayılar                                                                      |
| `sayiyiOlustur`     | `content/HelloGitHubNNN.md`, `content/en/HelloGitHubNNN.md` (numara "1、" biçiminde, kesintisiz)                                   | Gerçekte her projede resim/GIF var; mini resim koymaz                             |
| Şablon fikri        | `script/make_content/make_content.py` (2016): `{{ hello_github_content }}` yer tutucusu                                            | Mini şablonu kodda tutar                                                          |
| `tiklamaBaglantisi` | Her bağlantı `hellogithub.com/periodical/statistics/click?target=` üzerinden                                                       | Gerçeği hedefi kodlamadan ekliyor                                                 |
| `dizinTablosu`      | `README.md` / `README_en.md` "Content" tablosu (satırda 5 sayı)                                                                    | Aynı düzen                                                                        |
| `katkidaBulunanlar` | `content/contributors.md`                                                                                                          | Gerçeği avatarlı HTML tablosu                                                     |
| `rssOlustur`        | Depoda RSS yok; bülten WeChat resmi hesabı ve siteden dağıtılıyor (doğrulanmadı: sitenin akışı)                                    | Mini açık bir standart (RSS) seçer                                                |
| Aday toplama        | `script/github_bot/github_bot.py` (2016-2017): takip edilen kullanıcıların yıldızladığı depoları API'den çekip e-postayla gönderir | Mini aday toplamaz; adaylar elle girilir                                          |

## Gerçek ölçeğe giden yol

1. Öneri formu: GitHub issue formu (YAML) ya da kendi sitende bir form; her öneriyi JSON'a çeviren küçük bir iş akışı.
2. Ön eleme: GitHub API'siyle depo yaşı, lisans, son commit, README dili; "daha önce yer aldı" denetimi tüm arşive karşı.
3. Resim/GIF: ekran görüntülerini ayrı bir depoda ya da CDN'de tutmak (HelloGitHub `img`, `img4` depolarını kullanıyor).
4. Dağıtım: RSS + e-posta bülteni + sosyal medya; sitede proje sayfaları ve "öne çıktı" rozeti (README'ye eklenen rozet
   her depoda bültene geri bağlantıdır).
5. Gelir: sayı başına sponsor alanı ve şeffaf tıklama raporu. Sayaç IP ve zaman kaydediyorsa KVKK kapsamında aydınlatma
   metni ve saklama süresi gerekir.
