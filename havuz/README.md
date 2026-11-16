# Havuz — küçük bir modelin üstüne çalışabileceği temeller

Bu klasör, büyük bir modelin sıfırdan kurduğu, **çalışan, testli ve belgeli** başlangıç noktalarından oluşur. Amaç:
bundan sonra daha küçük bir modelle çalışırken zor kısımları yeniden yazdırmak yerine bu temellerin **üstüne**
inşa etmek. Her temel tek başına kopyalanabilir; her birinin tek komutluk bir denetimi, model için talimat dosyası
(`AGENTS.md`) ve kopyalanacak örnekleri vardır.

> İlk kez okuyorsanız: [`rehber/KUCUK_MODELLE_CALISMA.md`](rehber/KUCUK_MODELLE_CALISMA.md) — küçük bir modelle
> nasıl çalışılır, neye dokundurulmaz, model yoldan çıkınca ne yapılır. Hazır istemler:
> [`rehber/ISTEMLER.md`](rehber/ISTEMLER.md). Bilgisayarınızı hazırlamak: [`rehber/KURULUM.md`](rehber/KURULUM.md).

## Ne istiyorsunuz → nereden başlamalı

| İstediğiniz                                                       | Temel                                   | İlk komut (temelin klasöründe)                 |
| ----------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| Telefonda çalışan, hesaplı, çok cihazlı, internetsiz uygulama     | [`uygulama/`](uygulama/README.md)       | `npm ci && npm run dev`                        |
| Tanıtım sitesi, blog, belge sitesi                                | [`site/`](site/README.md)               | `npm ci && npm run dev`                        |
| Uygulamaya yapay zekâ özelliği (belgeye soru, bilgi çıkarma, ajan) | [`yz/`](yz/README.md)                   | `python -m yz --yardim`                        |
| Kendi dil modelini sıfırdan eğitmek                               | [`dil-modeli/`](dil-modeli/README.md)   | `python -m dil_modeli uret --model ornek-model` |
| Açık bir modeli kendi işine uydurmak (ince ayar)                  | [`ince-ayar/`](ince-ayar/README.md)     | `python -m ince_ayar --yardim`                 |
| Bir tablodan (CSV) tahmin modeli ve rapor                         | [`ml-temel/`](ml-temel/README.md)       | `python -m ml_temel egit --veri … --hedef …`   |
| Türkçe başvuru verisi, sahte veri, veri temizleme ve kalite       | [`veri/`](veri/README.md)               | `python -m verihavuzu --help`                  |
| Tek dosyalık hazır yardımcılar (Türkçe, para, tarih, doğrulama…)  | [`kutuphane/`](kutuphane/README.md)     | dosyayı projenize kopyalayın                   |
| Bir algoritma ya da veri yapısı                                   | [`algoritma/`](algoritma/README.md)     | `docs/DIZIN.md`                                |
| "İçeride nasıl çalışır" — sıfırdan yazılmış mini sistemler        | [`sifirdan/`](#sifirdan)                | her sistemin kendi README'si                   |
| Bir konuda karar vermek, tuzaktan kaçınmak                        | [`bilgi/`](bilgi/)                      | `python bilgi/araclar/ara.py "<soru>"`         |

Python temellerinde önce sanal ortam kurulur (her temelin README'sinde yazar) ya da aşağıdaki denetim aracı
`--kur` ile hepsini kendisi yapar.

## Temeller

<!-- durum:baslangic — bu tablo `python havuz/araclar/durum.py --markdown` ile üretilir -->

| Temel | Tür | Ne işe yarar | Kaynak / test dosyası | Satır |
| --- | --- | --- | --- | ---: |
| [`dil-modeli`](dil-modeli/) | karma | Bayt düzeyi BPE tokenizer, LLaMA uyumlu PyTorch modeli, sürdürülebilir eğitim, üretim, LoRA ince ayarı, Hugging Face/GGUF/tarayıcı/ONNX aktarımı, OpenAI uyumlu sunucu ve bağımlılıksız JS çalışma zamanı; minik Türkçe örnek modelle. | 63 / 27 | 10.455 |
| [`ince-ayar`](ince-ayar/) | python | Sohbet (LoRA), sınıflandırma (ONNX), gömme ve varlık tanıma ince ayarı; veri araçları, sentetik veri hattı, doğrulanmış model kataloğu ve Colab defteri. | 95 / 18 | 12.364 |
| [`kutuphane`](kutuphane/) | karma | Türkçe metin, ek, sayı/para/tarih biçimi, kimlik doğrulama ile genel yardımcıların iki dilde, ortak sınama vektörleriyle kanıtlanmış ve dosya dosya kopyalanan hâli. | 61 / 56 | 18.432 |
| [`ml-temel`](ml-temel/) | python | Otomatik türev, sinir ağı katmanları, scikit-learn arayüzlü klasik modeller, sızıntısız değerlendirme ve bir CSV'den tek komutla model + Türkçe rapor üreten araç; tek çalışma zamanı bağımlılığı numpy. | 104 / 22 | 15.819 |
| [`site`](site/) | node | Astro 7 ile statik, çok dilli, erişilebilir ve SEO denetimli site temeli; tek ayar dosyası ve içerik dosyalarıyla kişiselleştirilir. | 119 / 34 | 11.268 |
| [`uygulama`](uygulama/) | node | Çevrimdışı-önce PWA (React + Dexie) + API (Hono + node:sqlite) + ortak şema ve eşitleme; hesapsız ve hesaplı iki kip, paylaşımlı alanlar, üreteçler. | 186 / 80 | 24.734 |
| [`veri`](veri/) | python | Doğrulanmış Türkçe başvuru verileri, ilişkisel tutarlı sentetik veri üreteçleri, veri kalitesi araçları, nazik veri hattı iskeleti ve doğrulanmış açık veri kataloğu. | 65 / 21 | 10.822 |
| [`yz`](yz/) | python | Küçük modellerin zayıflıklarını (bozuk JSON, araç çağrısı hataları, uydurma) doğrula-onar döngüleri, sıkı şemalar ve ölçümle kapatan sağlayıcı katmanı, yapılı çıktı, ajan, RAG, değerlendirme, MCP ve sohbet sunucusu. | 90 / 27 | 16.112 |

<!-- durum:son -->

<a id="sifirdan"></a>

### Sıfırdan mini sistemler (`sifirdan/`)

Her biri tek klasör, birkaç yüz satır, bağımlılıksız ve başvuru gerçeklemesiyle karşılaştırılarak sınanmış:

| Kol                                      | Sistemler                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`sifirdan/dil`](sifirdan/dil/)          | yorumlayıcı, bayt kodu sanal makinesi, regex motoru, JSON, şablon motoru, Markdown, ifade hesaplayıcı, metin farkı, test çerçevesi |
| [`sifirdan/veri`](sifirdan/veri/)        | LSM anahtar-değer deposu, B+ ağacı, mini SQL, MVCC işlemleri, arama motoru, CRDT'ler, mini git, Raft, iş kuyruğu, önbellek sunucusu |
| [`sifirdan/ag`](sifirdan/ag/)            | HTTP sunucusu ve istemcisi, WebSocket, web çatısı, ORM, kriptografi eğitimi (TOTP, JWT…), DNS, kabuk, ters vekil, e-posta |
| [`sifirdan/arayuz`](sifirdan/arayuz/)    | sinyaller, sanal DOM, yönlendirici, durum deposu, form, e-tablo, metin düzenleyici, 2B oyun motoru, ışın izleyici, SVG grafik, paketleyici, animasyon |

## Bilgi hazinesi (`bilgi/`)

Konu konu **çalışma kâğıtları**: karar tabloları, tuzaklar (belirti → neden → çözüm), denetim listeleri ve "küçük
modele yaptırırken" bölümü. Kod örneklerinin çoğu çalıştırılarak doğrulanır. Dizin: [`bilgi/INDEX.md`](bilgi/INDEX.md).

| Küme | Konu |
| --- | --- |
| `00-yontem` | problem çözme, hata ayıklama, işi parçalama, kod inceleme, test stratejisi, teknik yazı, sözlük |
| `10-diller` | TypeScript, JavaScript, Python, SQL, HTML, CSS, kabuk, regex, git, veri biçimleri, Unicode |
| `20-web-onyuz` | React, durum, formlar, erişilebilirlik, mobil web, performans, PWA, ön yüz güvenliği |
| `30-arkauc` | HTTP ve API, kimlik ve yetki, veritabanı, migrasyon, işlem, önbellek, kuyruk, ödeme, webhook |
| `40-sistem-tasarimi` | ölçekleme, kapasite, tutarlılık, dayanıklılık, gözlemlenebilirlik, örnek tasarımlar |
| `50-guvenlik` | tehdit modeli, enjeksiyon, XSS, CSRF, SSRF, parola ve oturum, kriptografi kullanımı, KVKK |
| `60-devops` | yayın yolu, Docker, CI/CD, DNS, HTTPS, ters vekil, yedek, izleme, ilk yayın listesi |
| `70-veri` | analitik SQL, ürün ölçütleri, A/B testi, istatistik, görselleştirme, veri kalitesi |
| `80-ml` | çerçeveleme, sızıntı, değerlendirme, kalibrasyon, ağaç toplulukları, derin öğrenme, MLOps |
| `85-llm` | istem, küçük modeller, yapılı çıktı, RAG, ajan, değerlendirme, yerel çalıştırma, güvenlik |
| `92-matematik` | kayan nokta, olasılık, lineer cebir, kalkülüs, optimizasyon, bilgi kuramı, finans hesabı |
| `95-urun` | fikir doğrulama, MVP, gereksinim, UX, tanıtım sayfası, SEO, fiyatlandırma, lansman |
| `97-turkce` | büyük/küçük harf, ekler, arayüz dili, Türkçe metin işleme, TCKN/VKN/IBAN, sayı ve para |

```bash
python havuz/bilgi/araclar/ara.py "n+1 sorgu nedir"        # arama
python havuz/bilgi/araclar/dogrula.py                       # bütün notları ve kod örneklerini doğrula
```

## Ortak araçlar (`araclar/`)

Depo kökünden çalıştırılır; yalnız Python standart kütüphanesi kullanır.

| Komut | Ne yapar |
| --- | --- |
| `python havuz/araclar/durum.py` | Envanter ve standart denetimi (her temelde zorunlu dosyalar var mı) |
| `python havuz/araclar/denetle.py <temel> --kur` | Temelin bağımlılıklarını kurar ve denetimini çalıştırır; sonda özet |
| `python havuz/araclar/denetle.py --kur` | Bütün temeller |
| `python havuz/araclar/yeni_proje.py <temel> <hedef> [--git]` | Temeli yeni bir projeye kopyalar (ortam, önbellek, `.env` kopyalanmaz) |

## Sürekli denetim

`.github/workflows/havuz.yml`, `havuz/` altında bir değişiklik gönderildiğinde **yalnız değişen temelleri** temiz bir
makinede kurup denetler; ortak araçlar ya da kurallar değiştiyse hepsini. Ayrıca her seferinde standart denetimini ve
bilgi notlarının doğrulamasını çalıştırır. GitHub'da **Actions → Havuz → Run workflow** ile bir temel seçip elle de
çalıştırabilirsiniz.

## Kurallar

Bütün temeller [`STANDARTLAR.md`](STANDARTLAR.md)'ye uyar: bağımsızlık, Türkçe belgeler, tek komutluk denetim, kural
testleri, sırların depoya girmemesi, dürüst "Sınırlar" bölümü. Modeller için kısa sürüm: [`AGENTS.md`](AGENTS.md).

## Sınırlar

- Her temel bu ortamda (Linux, Node 22, Python 3.13, yalnız CPU, yalnız Chromium) temiz kurulumla denetlendi.
  Windows, macOS, Safari, Firefox ve GPU ile **denenmedi**; her temelin README'sindeki "Sınırlar" bölümü ayrıntıyı verir.
- Dış hizmetler (barındırma, e-posta sağlayıcısı, ödeme, Ollama gibi yerel model sunucuları) çoğunlukla gerçek
  hesapla denenmedi; sahte yanıtlarla sınandı. Hangilerinin denendiği temelin README'sinde yazar.
- Sürüm, model adı ve lisans bilgileri Kasım 2026 tarihlidir; katalog dosyaları doğrulama tarihini taşır.
- Yasal sayfa şablonları, KVKK notları ve finans hesapları **danışmanlık değildir**.
- Örnek dil modeli (`dil-modeli/ornek-model`) öğretim amaçlıdır: Türkçeye benzeyen ama anlamsız metin üretir.
