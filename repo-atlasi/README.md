# Repo Atlası

GitHub'da çok yıldız almış, seçilmiş 51 depoyu **nasıl yapıldıklarını anlayıp sıfırdan yazabilecek** şekilde öğrenmek ve
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
| Bir terimi anlamadım                  | [SOZLUK.md](SOZLUK.md): harness, fiber, KV önbelleği, SKILL.md… Türkçe açıklamalar   |

## Klasörler

```text
repo-atlasi/
├── README.md              ← bu dosya
├── AGAC.md                ← dallanan öğrenme yolu (gövde → dallar → yapraklar → meyve)
├── ENVANTER.md            ← 51 deponun tablosu
├── SOZLUK.md              ← terim sözlüğü
├── testleri-calistir.sh   ← tüm mini uygulama ve MVP testlerini tek komutla çalıştırır
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
│           └── sifirdan/          ← (44 depoda) çekirdek mekanizmanın aşamalı, testli mini uygulaması
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

Hepsini tek komutla çalıştırmak için (depo kökünden):

```bash
bash repo-atlasi/testleri-calistir.sh
```

Yalnızca bazılarını çalıştırmak için klasör adından bir parça ver: `bash repo-atlasi/testleri-calistir.sh react n8n`.
Betik her mini uygulamanın ve MVP'nin testini kendi klasöründe çalıştırır, geçici dosyaları depo dışına yazar ve
sonunda "N geçti, M kaldı" özeti verir. Gereken bir araç ya da Python modülü (ör. Go, zsh, numpy) kurulu değilse o testleri "ATLANDI" diye geçer.

Tek bir klasörde elle çalıştırmak istersen her `sifirdan/` ve MVP klasörünün `README.md`'sinde komut yazar. Genel kural:

| Dil        | Test komutu (ilgili klasörün içinde)                                            |
| ---------- | ------------------------------------------------------------------------------- |
| JavaScript | `npm test` (`package.json` varsa) ya da `node --test`                           |
| Python     | `python3 -m unittest discover -s tests -t .` (klasör adı `testler` de olabilir) |
| Go         | `go test ./...`                                                                 |
| Rust       | `cargo test --offline`                                                          |
| C          | `make test`                                                                     |
| Bash/zsh   | `bash test.sh`                                                                  |

Node 22'de `node --test <klasör>` biçimi klasörü taramaz; komutu klasörün içinden argümansız ya da bir glob ile çalıştır.

Mini uygulamalar dış bağımlılık kullanmaz (Python'da yalnızca standart kütüphane ve gerektiğinde numpy, Node'da
yalnızca yerleşik modüller). Testler internetsiz çalışır. MVP'lerden bazıları gerçek kütüphaneleri (markitdown,
yt-dlp) isteğe bağlı kullanır; o kütüphaneler kurulu değilse ilgili entegrasyon testleri atlanır, birim testleri yine
çalışır.

## Etik ve hukuk notları

- `massgravel/Microsoft-Activation-Scripts` yalnızca hukuk ve etik vaka çalışması olarak incelendi; lisans atlatma
  yöntemleri anlatılmaz ve aracın sıfırdan yolu verilmez. Mini'si yasal karşılığıdır: kurulu yazılımı satın alınan
  lisanslarla karşılaştıran bir uyum raporu.
- Mini uygulamaların testleri internetsiz çalışır; ağ testleri yalnızca `127.0.0.1`'deki yerel sunuculara bağlanır.
  yt-dlp mini'si varsayılan olarak yalnızca `127.0.0.1` ve `localhost`'a bağlanır. Firecrawl mini'si gerçek sitelere
  de çıkabilir: doğrudan yazılmış özel ağ adreslerini ve oraya giden yönlendirmeleri reddeder (`--yerel` ile açılır;
  iç IP'ye çözülen alan adları kapsam dışı). Tarayıcısı (`tara`) ayrıca `robots.txt`'ye ve `Crawl-delay`'e uyar; tek
  sayfa kazıma (`kazi`, `/v2/scrape`) `robots.txt`'ye bakmaz. Gerçek kullanımda telif hakkı, site kullanım koşulları,
  `robots.txt` ve KVKK'ya uymak senin sorumluluğunda.
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
- **Doğrulama ve onarım:** Sonra her dal ve her MVP ayrı bir denetimden geçti. Denetçiler iddiaları klondaki
  dosyalarla yeniden karşılaştırdı ve kodu ayrıca sınadı. Dallarda toplanan 158 bulgu düzeltildi, 13'ü klonda çürütülüp
  reddedildi; denetim sırasında bulunan 123 yeni sorun da düzeltildi. MVP'lerde 120 düzeltme yapıldı; her hata
  düzeltmesi bir gerileme testiyle korunuyor. Süreler tek kurala (1 gün ≈ 5 saat, 1 hafta ≈ 10 saat), önkoşullar
  yaprakların birleşimine bağlandı.
- **Son bağımsız denetim:** Atlas commit edildikten sonra üç ayrı denetçi onu bir kez daha taradı; her bulguyu başka
  bir ajan yeniden üretmeye çalıştı. Engel çıkmadı. Doğrulanan 20 Önemli bulgu ve 16 Öneri düzeltildi; düzeltmeler de
  ayrıca diff üzerinden incelendi.
- **Son otomatik denetim:** 50 test takımı (44 mini uygulama, 6 MVP) geçiyor; Markdown dosyalarında kırık bağlantı ya
  da çapa yok; 131 mermaid diyagramı iki sürümde (11.4.1 ve 11.17.2) hatasız çiziliyor; Prettier temiz; görünmez
  karakter yok. Atlasın JS dosyaları ESLint'in önerilen kurallarıyla da tarandı; kalan uyarılar kasıtlı (YDKJS
  koanlarındaki dil tuhaflıkları, alt çizgiyle başlayan kullanılmayan parametreler, tarayıcı kodundaki `document`).
- **Açık kalanlar:** Mevzuat ayrıntıları ve bazı platform kuralları `(doğrulanmadı)` diye işaretli; bir iş fikrini
  satışa çıkarmadan önce bir hukukçuya doğrulatmalısın. MVP'ler gerçek bir yerel modelle (Ollama, Whisper) uçtan uca
  denenmedi; testleri sahte sunucularla çalışır.
- Mini uygulamalar ve MVP'ler özgün koddur; orijinal depolardan kod kopyalanmadı, yalnızca karşılaştırma için dosya
  yollarına atıf yapıldı.
