# Repo Atlası

GitHub'ın en çok yıldız alan 51 deposunu **nasıl yapıldıklarını anlayıp sıfırdan yazabilecek** şekilde öğrenmek ve
bu depolardan **iş fikirleri** çıkarmak için hazırlanmış Türkçe bir çalışma atlası.

Yol bir ağaç gibi dallanır: **gövde** (herkesin ihtiyaç duyduğu 11 temel) → **10 dal** (web arayüzü, sistem, yapay
zekâ, ajanlar…) → **51 yaprak** (her depo) → **meyve** (bu depolarla kurulabilecek işler).

## Nereden başlamalı?

| Amacın                                | Buradan başla                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Bu depoları sıfırdan yazmayı öğrenmek | [AGAC.md](AGAC.md): ağacın tamamı, hedefe göre rotalar, takvim                       |
| Temellerim eksik mi, görmek           | [govde/README.md](govde/README.md): 11 temel düğüm, her biri için görev ve kaynak    |
| Belirli bir depoyu merak ediyorum     | [ENVANTER.md](ENVANTER.md): 51 depo, dal, lisans, yıldız; oradan depo dosyasına      |
| İş fikri arıyorum                     | [is-fikirleri/README.md](is-fikirleri/README.md): her depo için fikir, kime, MVP'ler |

## Klasörler

```text
repo-atlasi/
├── README.md              ← bu dosya
├── AGAC.md                ← dallanan öğrenme yolu (gövde → dallar → yapraklar → meyve)
├── ENVANTER.md            ← 51 deponun tablosu
├── govde/                 ← G1–G11 ortak temeller
├── dallar/
│   ├── 01-web-arayuzu/            React, Vue 2, Vue 3, Bootstrap, You Don't Know JS
│   ├── 02-uygulama-platformlari/  VS Code, Flutter, Oh My Zsh, freeCodeCamp, roadmap.sh
│   ├── 03-sistem-ag-guvenlik/     Linux, FreeDomain (DNS), the-book-of-secret-knowledge, REA, MAS (vaka)
│   ├── 04-veri-araclari-otomasyon/ yt-dlp, MarkItDown, Firecrawl, n8n, public-apis
│   ├── 05-yapay-zeka-altyapisi/   TensorFlow, Transformers, Ollama, MiroFish
│   ├── 06-ajan-platformlari/      OpenClaw, Hermes Agent, AutoGPT
│   ├── 07-kodlama-ajanlari/       opencode, claw-code, DeepSeek Harness
│   ├── 08-ajan-becerileri/        anthropics/skills, superpowers, mattpocock/skills, ECC, karpathy-skills
│   ├── 09-bilgisayar-bilimi/      TheAlgorithms, javascript-algorithms, CIU, OSSU, CS-Notes, Python-100-Days, system-design-primer
│   └── 10-kuratorluk-topluluk/    awesome, awesome-python, awesome-go, awesome-selfhosted, free-programming-books, build-your-own-x, project-based-learning, HelloGitHub, 996.ICU
│       └── <depo>/
│           ├── README.md          ← depo dosyası: mimari, öğrenmen gerekenler, sıfırdan yol, okuma rotası, alıştırmalar
│           └── sifirdan/          ← çekirdek mekanizmanın aşamalı, testli mini uygulaması
├── is-fikirleri/          ← fikir kataloğu + kodlanmış MVP'ler
└── veri/depolar.json      ← 51 deponun makine tarafından okunabilir verisi
```

## Her depo dosyasında ne var?

1. **Bir bakışta** — ne işe yarar, neden bu kadar popüler.
2. **Nasıl yapılmış: mimari** — gerçek klasör haritası, veri akışı diyagramı, önce okunacak dosyalar, derleme/test/CI,
   tasarım kararları.
3. **Öğrenmen gerekenler** — gövde düğümlerine ve diğer dallara bağlantılar.
4. **Sıfırdan yol** — aşama aşama ne inşa edeceğin, her aşamanın bitti ölçütü ve süresi; `sifirdan/` klasöründeki
   mini uygulamanın gerçek depodaki karşılıkları.
5. **Gerçek depoda okuma rotası** — mini'yi yazdıktan sonra gerçek kodu hangi sırayla okuyacağın.
6. **Alıştırmalar ve öz değerlendirme** — cevaplar katlanmış bölümlerde.
7. **İş fikri tohumları** ve **kaynaklar**.

## Mini uygulamaları çalıştırmak

Her `sifirdan/` ve her MVP klasörünün kendi `README.md`'sinde çalıştırma ve test komutu yazar. Genel kural:

| Dil        | Test komutu (ilgili klasörde)                         |
| ---------- | ----------------------------------------------------- |
| JavaScript | `node --test`                                         |
| Python     | `python3 -m unittest discover` (klasörde yazana göre) |
| Go         | `go test ./...`                                       |
| Rust       | `cargo test --offline`                                |
| C          | `make test`                                           |

Mini uygulamalar dış bağımlılık kullanmaz (Python'da yalnızca standart kütüphane ve gerektiğinde numpy, Node'da
yalnızca yerleşik modüller). Testler internetsiz çalışır.

## Etik ve hukuk notları

- `massgravel/Microsoft-Activation-Scripts` yalnızca hukuk ve etik vaka çalışması olarak incelendi; lisans atlatma
  yöntemleri anlatılmaz ve sıfırdan yol verilmez.
- İndirme ve tarama araçları (yt-dlp, Firecrawl) mini uygulamalarda yalnızca yerel test sunucularına karşı çalışır.
  Gerçek kullanımda telif hakkı, site kullanım koşulları, `robots.txt` ve KVKK'ya uymak senin sorumluluğunda.
- Tersine mühendislik (REA) yalnızca meşru amaçlarla anlatılır: kendi yazılımın, birlikte çalışabilirlik, güvenlik
  araştırması.
- Lisans ve mevzuatla ilgili bölümler hukuki tavsiye değildir.

## Nasıl hazırlandı?

- Depo listesi kullanıcıdan geldi (51 depo). Ayrıca verilen agenorit.com.au makalesine bu ortamdan erişilemedi.
- Her depo 9 Kasım 2026'da sığ ve seyrek klonla çekildi. Depo dosyaları, incelenen commit'te doğrulanmış klasör ve dosya
  yollarına dayanır; doğrulanamayan bilgiler `(doğrulanmadı)` diye işaretlidir.
- **Öğretmen ajanları:** Her dal için ayrı bir ajan depoları inceledi, dosyaları yazdı ve mini uygulamaları kodlayıp
  test etti.
- **İş fikri ajanları:** İki ajan fikir kataloğunu çıkardı ve 6 MVP'yi kodlayıp test etti.
- Mini uygulamalar ve MVP'ler özgün koddur; orijinal depolardan kod kopyalanmadı, yalnızca karşılaştırma için dosya
  yollarına atıf yapıldı.
