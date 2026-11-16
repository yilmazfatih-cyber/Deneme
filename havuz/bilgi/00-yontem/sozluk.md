---
baslik: Yazılım terimleri sözlüğü
ozet: Yazılımda sık geçen 198 terimin Türkçe ve İngilizce karşılığı ile tek cümlelik açıklaması; modelle konuşurken doğru ve tutarlı sözcüğü bulmak için.
etiketler: [yontem, sozluk, terim, turkce, iletisim]
duzey: temel
guncellik: 2026-11
---

# Yazılım terimleri sözlüğü

> Bu notu ne zaman okumalı: bir modelle konuşurken doğru terimi arıyorsanız; bir belgede ya da arayüzde aynı şeye
> farklı adlar verildiğini fark ettiyseniz; ya da modelin yanıtındaki İngilizce bir terimin ne demek olduğunu
> bilmiyorsanız.

## Temel fikir

Doğru terim, modelin doğru şeyi yapmasının yarısıdır. Türkçede bazı sözcükler birden çok kavramı karşılar:
"kayıt" git kaydı (commit), veritabanı satırı (record) ya da üye olma (sign-up) olabilir; "dizin" hem klasör hem
veritabanı dizinidir; "belirteç" hem dil modelinin metin parçası hem kimlik dizgesidir. Modeller çoğunlukla
İngilizce metinle eğitildiği için **Türkçe terimi yazıp ilk geçişte İngilizcesini ayraç içinde vermek** yanlış
anlamayı en aza indirir: "veritabanına bir kayıt (record) ekle".

İkinci kural tutarlılıktır: bir projede aynı kavrama tek ad verilir. "Şifre" mi "parola" mı; seçin, yazın ve hep
onu kullanın.

## Nasıl kullanılır

- Türkçe ya da İngilizce terimi sayfada arayın; tablolar Türkçe alfabe sırasındadır.
- Bazı terimler Türkçe konuşmada da İngilizce söylenir (commit, branch, deploy, PR). İkisi de anlaşılır; önemli
  olan bir belgede ya da istemde tek birini tutarlı kullanmaktır.
- Projeye özgü seçimleri (ör. "şifre"; "alan" = workspace) projenin kurallar dosyasına yazın ve isteme ekleyin.

Bir metinde aynı kavram için yarışan adları yakalayan küçük bir denetçi:

```python calistir
import re

SYNONYMS = [  # aynı kavram için yarışan adlar; projede her gruptan BİRİ seçilir
    ("şifre", "parola"),
    ("belirteç", "jeton", "token"),
    ("e-posta", "eposta", "mail"),
    ("dağıtım", "deploy"),
]


def lower_tr(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").lower()


def mixed_terms(text: str) -> list[tuple[str, ...]]:
    words = re.findall(r"[\w-]+", lower_tr(text))
    found = []
    for group in SYNONYMS:
        used = tuple(term for term in group if any(word.startswith(term) for word in words))
        if len(used) > 1:
            found.append(used)
    return found


text = (
    "Şifrenizi girin. Parolanız en az 12 karakter olsun. "
    "E-posta adresinize bir jeton gönderdik; belirteç 10 dakika geçerlidir."
)
for used in mixed_terms(text):
    print("karışık kullanım:", " / ".join(used))
assert mixed_terms("Şifrenizi girin. Şifreniz en az 12 karakter olsun.") == []
```

```cikti
karışık kullanım: şifre / parola
karışık kullanım: belirteç / jeton
```

## Terimler: A–Ç

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| açık kaynak | open source | Kaynak kodu herkese açık, lisansına göre kullanılıp değiştirilebilen yazılım. |
| ağırlık (model) | weights | Modelin eğitimde öğrendiği sayıların bütünü; model dosyası çoğunlukla bunlardır. |
| ajan | agent | Bir hedefe ulaşmak için araçları kendisi seçip art arda çağıran dil modeli düzeni. |
| akış | stream / streaming | Verinin tamamı beklenmeden parça parça gönderilmesi ya da işlenmesi. |
| alan adı | domain name | Sitenin okunabilir adresi (ornek.com); DNS ile IP adresine çevrilir. |
| anonimleştirme | anonymization | Verinin bir kişiyle bir daha ilişkilendirilemeyecek hâle getirilmesi. |
| API | application programming interface | Bir yazılımın başka yazılımlara sunduğu çağrılabilir işlevler ve kurallar. |
| araç çağırma | tool calling | Dil modelinin tanımlı bir işlevi çağırmak için yapılı istek üretmesi. |
| arayüz (kullanıcı) | user interface (UI) | Kullanıcının gördüğü ve dokunduğu ekranlar. |
| arayüz (programlama) | interface | Bir türün sağlaması gereken alan ve işlevlerin tanımı. |
| ara katman | middleware | İstekle yanıt arasına girip ortak işi (kimlik, günlük, sınır) yapan kod. |
| arka uç | backend | Sunucuda çalışan, veriyi ve iş kurallarını yöneten kısım. |
| aşırı öğrenme | overfitting | Modelin eğitim verisini ezberleyip yeni veride kötüleşmesi. |
| ayrıştırma | parsing | Metni (JSON, tarih, komut) programın kullanabileceği yapıya çevirme. |
| bağımlılık | dependency | Projenin çalışmak için ihtiyaç duyduğu dış paket ya da servis. |
| bağlam penceresi | context window | Dil modelinin bir seferde görebildiği en çok belirteç sayısı. |
| barındırma | hosting | Sitenin ya da uygulamanın yayında durduğu servis. |
| bayrak (özellik) | feature flag | Bir özelliği yeni sürüm çıkarmadan açıp kapatmaya yarayan ayar. |
| belirteçleyici | tokenizer | Metni belirteçlere bölen bileşen. |
| belirteç (dil modeli) | token | Dil modelinin işlediği metin parçası; ücret ve sınırlar bununla sayılır. |
| belirteç (kimlik) | token | Kimliği ya da yetkiyi kanıtlamak için istekle taşınan gizli dizge. |
| bellek sızıntısı | memory leak | Artık gerekmeyen verinin bırakılmaması; bellek sürekli büyür. |
| benzersizlik kısıtı | unique constraint | Bir sütunda aynı değerin iki kez bulunmasını veritabanında engelleyen kural. |
| betik | script | Bir işi otomatik yapan kısa program. |
| bileşen | component | Arayüzün yeniden kullanılabilen parçası (ör. React bileşeni). |
| bilgi kesim tarihi | knowledge cutoff | Dil modelinin eğitim verisinin bittiği tarih; sonrasını bilmez. |
| birim testi | unit test | Tek bir işlevi ya da küçük bir parçayı yalıtık sınayan test. |
| birincil anahtar | primary key | Tablodaki her satırı benzersiz tanımlayan sütun. |
| birleştirme | merge | İki dalın değişikliklerini tek dalda toplama. |
| bütünleşme testi | integration test | Birden çok parçanın (kod, veritabanı, HTTP) birlikte çalışmasını sınayan test. |
| CI/CD | continuous integration / delivery | Her değişiklikte testlerin ve yayının otomatik çalışması. |
| CORS | cross-origin resource sharing | Tarayıcının bir sayfadan başka alan adına istek atmasına izin verme kuralları. |
| çakışma | conflict | İki değişikliğin aynı yeri farklı biçimde değiştirmesi (git birleştirmede, eşitlemede). |
| çalışma zamanı | runtime | Kodu çalıştıran ortam (Node, tarayıcı, Python) ya da kodun çalıştığı an. |
| çatı | framework | Uygulamanın iskeletini ve kurallarını belirleyen kütüphane (React, Astro, FastAPI). |
| çekme isteği | pull request (PR) | Bir daldaki değişikliklerin incelenip ana dala alınması için açılan istek. |
| çerez | cookie | Tarayıcının bir site için saklayıp her istekte geri gönderdiği küçük veri. |
| çevrimdışı | offline | İnternet bağlantısı olmadan çalışma. |
| çıkarım | inference | Eğitilmiş bir modeli yeni girdiyle çalıştırıp çıktı alma. |

## Terimler: D–F

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| dağıtım | deployment | Yeni sürümü sunucuya ya da barındırmaya koyup çalışır hâle getirme. |
| dal | branch | Git'te ana çizgiden ayrılıp bağımsız ilerleyen değişiklik çizgisi. |
| darboğaz | bottleneck | Toplam süreyi belirleyen en yavaş parça. |
| değerlendirme (model) | evaluation (eval) | Model çıktısını ölçütlerle ve test kümesiyle puanlama. |
| denetim kaydı | audit log | Kimin neyi ne zaman değiştirdiğinin sonradan değiştirilemeyen kaydı. |
| depo | repository (repo) | Projenin dosyalarını ve değişiklik geçmişini tutan git klasörü. |
| derlem | corpus | Eğitim ya da çözümleme için toplanmış metin bütünü. |
| derleme | build / compile | Kaynak kodu çalıştırılabilir ya da yayımlanabilir çıktıya dönüştürme. |
| dizge | string | Metin değeri; günlük dilde "metin" ya da "string" denir. |
| dizin (dosya) | directory | Dosya sistemindeki klasör. |
| dizin (veritabanı) | index | Aramayı hızlandıran, sütun değerlerini sıralı tutan yapı. |
| DNS | domain name system | Alan adlarını IP adreslerine çeviren sistem. |
| doğrulama kümesi | validation set | Eğitim sırasında ayar seçmek için ayrılan, eğitime girmeyen veri. |
| doğrulama (girdi) | validation | Gelen verinin beklenen biçime ve kurallara uyduğunu denetleme. |
| doğruluk (model) | accuracy | Doğru tahminlerin bütün tahminlere oranı; dengesiz veride yanıltır. |
| durağan site | static site | Sunucu kodu olmadan, önceden üretilmiş dosyalarla sunulan site. |
| durum | state | Programın belli bir andaki verisi (form içeriği, açık sekme, oturum). |
| durum kodu (HTTP) | status code | Yanıtın sonucunu bildiren sayı: 200 tamam, 404 yok, 500 sunucu hatası. |
| durum makinesi | state machine | Bir nesnenin hangi durumdan hangisine geçebileceğini tanımlayan model. |
| duyarlılık (model) | recall | Gerçek olumlu örneklerin ne kadarını modelin yakaladığı. |
| düzenli ifade | regular expression (regex) | Metin örüntüsünü tanımlayan desen dili. |
| en az yetki | least privilege | Her bileşene ve kişiye işini yapacak kadar izin verme ilkesi. |
| en iyileme | optimization | Bir şeyi daha hızlı, küçük ya da ucuz hâle getirme. |
| erişilebilirlik | accessibility (a11y) | Engelli kullanıcıların da (ekran okuyucu, klavye) ürünü kullanabilmesi. |
| erişim belirteci | access token | İstekle gönderilen, yetkiyi kanıtlayan kısa ömürlü dizge. |
| eşitleme | synchronization (sync) | İki yerdeki verinin (cihaz ve sunucu) aynı hâle getirilmesi. |
| eşzamanlılık | concurrency | Birden çok işin aynı zaman diliminde iç içe ilerlemesi. |
| eşzamansız | asynchronous (async) | Sonucu beklerken programın durmadan başka işe devam etmesi. |
| etiket (veri) | label | Eğitim verisinde bir girdinin doğru yanıtı. |
| fark | diff | İki sürüm arasındaki satır değişiklikleri. |
| farksal test | differential testing | Bir gerçeklemeyi başvuru gerçeklemesiyle aynı girdilerde karşılaştırma. |

## Terimler: G–I

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| gecikme | latency | Bir isteğin yanıtlanması için geçen süre. |
| gerçekleme | implementation | Bir arayüzün ya da algoritmanın çalışan kodu. |
| gerileme | regression | Daha önce çalışan bir şeyin yeni bir değişiklikle bozulması. |
| geri alma | rollback / revert | Bir değişikliği ya da yayını önceki hâline döndürme. |
| geri çekilme | backoff | Yeniden denemeler arasındaki beklemeyi giderek artırma. |
| girdi/çıktı (G/Ç) | input/output (I/O) | Disk, ağ gibi dış dünyayla veri alışverişi. |
| göç (veritabanı) | migration | Veritabanı şemasını sürümlü ve sıralı adımlarla değiştirme. |
| gömme | embedding | Metnin anlamını taşıyan sayı dizisi; benzerlik aramasında kullanılır. |
| gözlemlenebilirlik | observability | Sistemin içini günlük, ölçü ve iz kayıtlarıyla dışarıdan anlayabilme. |
| günlük | log | Programın çalışırken yazdığı olay kayıtları. |
| halüsinasyon | hallucination | Dil modelinin kendinden emin biçimde uydurma bilgi üretmesi. |
| harmanlama | collation | Metinlerin dile göre sıralanma ve karşılaştırılma kuralları. |
| hata ayıklama | debugging | Hatanın nedenini bulup giderme süreci. |
| hata (kusur) | bug | Programın beklenenden farklı davranmasına yol açan kusur. |
| hız sınırlama | rate limiting | Bir istemcinin belli sürede yapabileceği istek sayısını kısıtlama. |

## Terimler: İ–K

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| idempotent | idempotent | Aynı işlemi iki kez yapmanın bir kez yapmakla aynı sonucu verdiği. |
| ince ayar | fine-tuning | Önceden eğitilmiş bir modeli küçük, özel bir veriyle yeniden eğitme. |
| istek | request | İstemcinin sunucuya gönderdiği ileti (HTTP isteği). |
| istem | prompt | Dil modeline verilen talimat ve bağlam metni. |
| istemci | client | Sunucudan hizmet isteyen taraf (tarayıcı, mobil uygulama). |
| istisna | exception | Çalışma sırasında fırlatılan, yakalanmazsa programı durduran hata nesnesi. |
| işlem (veritabanı) | transaction | Ya hepsi ya hiçbiri uygulanan değişiklikler bütünü. |
| işlev | function | Girdi alıp iş yapan, adı olan kod parçası. |
| iş hacmi | throughput | Birim zamanda işlenen iş miktarı (istek/saniye). |
| iş parçacığı | thread | Aynı süreç içinde paralel yürüyebilen yürütme birimi. |
| izin | permission | Bir kullanıcının ya da uygulamanın neyi yapabileceği. |
| JSON | JavaScript Object Notation | Anahtar–değer temelli, metin tabanlı veri biçimi. |
| kabuk | shell | Komut satırını yorumlayan program (bash, zsh). |
| kapı | port | Bir makinede bir servisin dinlediği numaralı giriş (ör. 5310). |
| kapsayıcı | container | Uygulamayı bağımlılıklarıyla yalıtık çalıştıran paket (Docker). |
| karakterizasyon testi | characterization test | Var olan davranışı, doğruluğuna bakmadan kayda geçiren test. |
| karma | hash | Veriden üretilen sabit uzunlukta parmak izi; geri çevrilemez. |
| katman | layer | Sorumlulukları ayrılmış kod düzeyi (arayüz, servis, veri). |
| kayan nokta | floating point | Ondalık sayıların yaklaşık tutulduğu ikili biçim; para için uygun değildir. |
| kayıp (model) | loss | Modelin hatasını ölçen, eğitimde küçültülen sayı. |
| kayıt (git) | commit | Değişikliklerin bir iletiyle birlikte depoya kaydedilmiş anlık hâli. |
| kaynak kodu | source code | İnsanın yazdığı, okunabilen program metni. |
| kaynaştırma ünsüzü | buffer consonant | Türkçede iki ünlü yan yana gelince araya giren y, n, s, ş. |
| kesinlik (model) | precision | Modelin "olumlu" dediklerinin ne kadarının gerçekten olumlu olduğu. |
| kesit çıkarıcı | profiler | Programın zamanı ve belleği nerede harcadığını ölçen araç. |
| kesme imi | apostrophe | Özel ada getirilen eki ayıran işaret (Ankara'ya). |
| kilit dosyası | lock file | Kurulan bağımlılıkların tam sürümlerini sabitleyen dosya (package-lock.json). |
| kimlik doğrulama | authentication | Kullanıcının kim olduğunu kanıtlaması; giriş yapma. |
| kişisel veri | personal data | Bir kişiyi doğrudan ya da dolaylı tanımlayan her bilgi (KVKK). |
| klonlama | clone | Uzak bir deponun bütün geçmişiyle yerel kopyasını alma. |
| kodlama (karakter) | encoding | Metnin bayta çevrilme kuralı (UTF-8, Windows-1254). |
| komut satırı | command line (CLI) | Komutların yazılarak çalıştırıldığı metin arayüzü. |
| kuyruk | queue | İşlerin sırayla işlenmek üzere beklediği yapı ya da servis. |
| küme (veri yapısı) | set | Tekrarsız öğe topluluğu; üyelik denetimi hızlıdır. |
| kütüphane | library | Başka kodların çağırdığı hazır işlevler paketi. |

## Terimler: L–Ö

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| lint | linter | Kodda hata riskini ve üslup kurallarını otomatik tarayan araç. |
| lisans | license | Yazılımın ya da verinin hangi koşullarla kullanılabileceğini belirleyen metin. |
| LoRA | low-rank adaptation | Modelin yalnız küçük ek matrislerini eğiterek yapılan ucuz ince ayar. |
| makine öğrenmesi | machine learning | Kuralları elle yazmak yerine veriden öğrenen yöntemler. |
| maskeleme | masking | Kişisel veriyi gösterirken bir kısmını gizleme (123******01). |
| modül | module | İçe aktarılabilen, kendi içinde bütün kod dosyası ya da birimi. |
| nicemleme | quantization | Model ağırlıklarını daha az bitle saklayarak küçültme ve hızlandırma. |
| normalleştirme | normalization | Veriyi tek biçime indirme (Unicode NFC; veritabanında tekrarı azaltma). |
| olay | event | Sistemde olan ve dinleyicilerin tepki verebildiği şey (tıklama, yeni sipariş). |
| ortam değişkeni | environment variable | Programa dışarıdan verilen ayar (DATABASE_URL gibi). |
| oturum | session | Kullanıcının girişten çıkışa kadar tanınmasını sağlayan kayıt. |
| ölçeklenme | scaling | Artan yükü kaynak ekleyerek karşılama: dikey (güçlü makine), yatay (çok makine). |
| önbellek | cache | Pahalı bir sonucu yeniden kullanmak için geçici olarak saklama. |
| ön uç | frontend | Tarayıcıda ya da cihazda çalışan, kullanıcının gördüğü kısım. |
| örnekleme (dil modeli) | sampling | Bir sonraki belirtecin olasılıklara göre seçilmesi. |
| özellik | feature | Ürünün kullanıcıya sunduğu bir yetenek; ML'de girdinin bir niteliği. |
| özellik tabanlı test | property-based testing | Rastgele girdilerle "her zaman doğru olmalı" kuralını sınama. |

## Terimler: P–Ş

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| paket | package | Yayımlanmış, kurulabilir kod birimi (npm, PyPI). |
| paket yöneticisi | package manager | Paketleri kuran ve sürümlerini yöneten araç (npm, pip, uv). |
| parametre | parameter | İşlevin aldığı girdi; modelde öğrenilen her bir sayı. |
| parola karması | password hash | Parolanın geri çevrilemez, tuzlu ve kasıtlı olarak yavaş karması. |
| PWA | progressive web app | Telefona kurulabilen, çevrimdışı çalışabilen web uygulaması. |
| RAG | retrieval-augmented generation | Modele yanıt öncesi ilgili belgeleri bulup bağlam olarak verme. |
| rol | role | Bir kullanıcı grubuna verilen izin kümesi (yönetici, üye). |
| saat dilimi | time zone | Bir bölgenin UTC'ye göre saat farkı ve yaz saati kuralları. |
| sağlama hanesi | check digit | Numaranın yanlış yazılmasını yakalayan, hesapla bulunan basamak. |
| sahte (test) | fake | Testte gerçeğinin yerine geçen hafif ama çalışan gerçekleme. |
| sanal ortam | virtual environment (venv) | Python paketlerini projeye yalıtık kuran klasör. |
| sayfalama | pagination | Uzun bir listeyi parça parça (sayfa sayfa) getirme. |
| sertifika (TLS) | certificate | Sitenin kimliğini kanıtlayan, şifreli bağlantıyı sağlayan belge. |
| servis çalışanı | service worker | Tarayıcıda sayfadan bağımsız çalışıp önbelleği ve çevrimdışılığı yöneten betik. |
| sıcaklık | temperature | Dil modelinin çıktısındaki rastgeleliği ayarlayan değer. |
| sınıflandırma | classification | Girdiyi önceden belli sınıflardan birine atama. |
| sır | secret | Parola, API anahtarı gibi açığa çıkmaması gereken değer. |
| sızma (veri) | data leakage | Test bilgisinin eğitime karışması; model olduğundan iyi görünür. |
| sorgu | query | Veritabanından veri isteyen ifade (SQL). |
| sözleşme (API) | contract | İki tarafın uymak zorunda olduğu istek ve yanıt biçimi. |
| SQL enjeksiyonu | SQL injection | Kullanıcı girdisinin sorguya kod olarak karışması. |
| sunucu | server | İstekleri karşılayan program ya da makine. |
| süreç | process | İşletim sisteminde çalışan bir programın örneği. |
| sürüm | version | Yazılımın numaralı hâli (1.4.2). |
| sürüm denetimi | version control | Dosyaların değişiklik geçmişini tutan sistem (git). |
| şaşkınlık | perplexity | Dil modelinin metne ne kadar şaşırdığını ölçen değer; düşükse iyidir. |
| şema | schema | Verinin alanlarını ve türlerini tanımlayan yapı. |
| şifreleme | encryption | Veriyi anahtarsız okunamaz hâle getirme; karmanın tersine geri çevrilebilir. |

## Terimler: T–Z

| Türkçe | İngilizce | Açıklama |
| --- | --- | --- |
| taklit (test) | mock | Testte çağrı beklentilerini denetleyen yapay nesne. |
| test kapsamı | test coverage | Testlerin çalıştırdığı kod oranı; tek başına kalite ölçüsü değildir. |
| tip | type | Bir değerin çeşidi (sayı, metin); TypeScript'te çalıştırmadan denetlenir. |
| tip denetimi | type checking | Türlerin tutarlı olduğunu kodu çalıştırmadan doğrulama. |
| TLS / HTTPS | transport layer security | Ağ trafiğini şifreleyen protokol; HTTPS onun üstünde HTTP'dir. |
| tohum | seed | Rastgele sayı üretecini hep aynı diziyi üretecek biçimde başlatan değer. |
| uçtan uca test | end-to-end test (E2E) | Gerçek tarayıcıda kullanıcı gibi tıklayarak bütün sistemi sınayan test. |
| uç nokta | endpoint | API'nin belli bir adresi ve yöntemi (POST /api/lists). |
| uluslararasılaştırma | internationalization (i18n) | Ürünü yerelleştirmeye hazır kurma: metinleri koddan ayırma. |
| ünlü uyumu | vowel harmony | Türkçede ekin ünlüsünün sözcüğün son ünlüsüne uyması (Ankara'da, İzmir'de). |
| üreteç | generator | Yeni dosya iskeleti üreten betik ya da değerleri birer birer üreten işlev. |
| üretim ortamı | production | Gerçek kullanıcıların kullandığı canlı sistem. |
| varsayılan | default | Belirtilmezse kullanılan değer. |
| vektör veritabanı | vector database | Gömmeleri saklayıp benzerlik araması yapan veritabanı. |
| veritabanı | database | Verinin düzenli saklandığı ve sorgulandığı sistem. |
| veri kümesi | dataset | Eğitim, test ya da çözümleme için düzenlenmiş veri bütünü. |
| XSS | cross-site scripting | Kullanıcı girdisinin sayfaya betik olarak basılıp çalışması. |
| yapılandırma | configuration | Programın davranışını koddan ayrı belirleyen ayarlar. |
| yapılı çıktı | structured output | Dil modelinden bir şemaya uyan (JSON) yanıt alma. |
| yarış durumu | race condition | Sonucun işlemlerin zamanlamasına bağlı olduğu hata. |
| yayın | release | Yeni sürümün kullanıcılara sunulması. |
| yedek | backup | Verinin geri yüklenebilir kopyası; geri yükleme denenmemişse güvenilmez. |
| yeniden deneme | retry | Başarısız bir işlemi bir süre sonra tekrar deneme. |
| yeniden düzenleme | refactoring | Davranışı değiştirmeden kodun yapısını iyileştirme. |
| yerelleştirme | localization (l10n) | Ürünü bir dile ve kültüre uyarlama: metin, tarih, para biçimi. |
| yetkilendirme | authorization | Kimliği bilinen kullanıcının neye izni olduğunu denetleme. |
| yığın izi | stack trace | Hatanın oluştuğu andaki işlev çağrı zinciri. |
| yönlendirme | routing | Gelen isteği ya da sayfa adresini doğru işleyiciye gönderme. |
| yürüyen iskelet | walking skeleton | Bütün katmanlardan geçen en ince, çalışan ilk sürüm. |
| yüzdelik | percentile (p95) | Ölçümlerin belli bir oranının altında kaldığı değer; p95 = %95'i bunun altında. |
| zamanlanmış görev | scheduled job (cron) | Belli aralıklarla kendiliğinden çalışan iş. |
| zaman aşımı | timeout | Bir işlemin en çok ne kadar bekleneceği sınırı. |
| zaman damgası | timestamp | Bir olayın gerçekleştiği anın kaydı. |

## Tuzaklar

| Belirti                                                                   | Neden                                                     | Çözüm                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| "Kayıt ekle" dendi; model veritabanı yerine git kaydı (commit) açtı       | "Kayıt" üç anlama gelir                                   | Ayraçla belirtin: kayıt (commit) / kayıt (record) / üye kaydı (sign-up)     |
| "Dizini güncelle" dendi; model klasör oluşturdu                           | "Dizin" hem klasör (directory) hem veritabanı dizini (index) | "klasör" ya da "dizin (index)" yazın                                     |
| Dil modeli sınırı konuşulurken model oturum belirtecine dokundu           | "Belirteç" iki ayrı kavram                                | "dil modeli belirteci (token)" / "erişim belirteci (access token)"          |
| "Arayüzü değiştir" dendi; model TypeScript arayüzünü değiştirdi           | Kullanıcı arayüzü (UI) ile tip arayüzü (interface)         | "ekran" ya da "arayüz (UI)"; tip için "arayüz (interface)"                  |
| "Yayına al" dendi; model yalnız sürüm numarasını artırdı                  | Sürüm, yayın, dağıtım karıştı                             | Sürüm numaradır; yayın kullanıcıya sunmaktır; dağıtım sunucuya koymaktır    |
| "Geri al" dendi; model git geçmişini yeniden yazdı                        | Geri alma (undo), geri çevirme (revert), sıfırlama (reset) farkı | "Son kaydı geri çeviren yeni bir kayıt (revert)" gibi açık yazın    |
| Parolaların "şifrelenerek" saklandığı söylendi                            | Şifreleme ile karma karıştı                               | Parola karması (password hash): geri çevrilemez                             |
| Giriş hatası düzeltilirken yetki denetimi gevşetildi                      | Kimlik doğrulama ile yetkilendirme karıştı                | Kim olduğu: kimlik doğrulama; neye izni olduğu: yetkilendirme               |
| Modelin "%95 doğruluk" raporu yanıltıcı çıktı                             | Doğruluk, kesinlik, duyarlılık karıştı                    | Üçünü ayrı isteyin; dengesiz veride doğruluğa güvenmeyin                    |
| Bir belgede şifre, parola ve giriş kodu birlikte geçiyor                  | Terim seçilmedi                                           | Projede tek terim; yukarıdaki denetçiyi çalıştırın                          |

## Denetim listesi

- [ ] İstemde çok anlamlı terimler (kayıt, dizin, belirteç, arayüz, geri al) İngilizcesiyle birlikte yazıldı.
- [ ] Projenin terim seçimleri tek bir dosyada yazılı ve isteme ekleniyor.
- [ ] Belgede ve arayüzde her kavram için tek ad kullanılıyor (denetçi temiz).
- [ ] İngilizce terim ilk geçişte Türkçesiyle (ya da Türkçe terim İngilizcesiyle) verildi.
- [ ] Yeni bir terim seçmeden önce bu sözlükte ve proje sözlüğünde karşılığı arandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu projede şu terimleri kullan: şifre (parola değil), alan (workspace), kayıt (commit).
  Teknik terimi Türkçe yaz, ilk geçişte İngilizcesini ayraçta ver. Kullanıcıya görünen metinde İngilizce terim
  kullanma."
- **Modelin tipik hatası:** aynı yanıtta aynı kavrama iki üç ad verir; İngilizce terime Türkçe ek getirip belgeye
  yazar ("deploy'ladım" konuşmada olur, belgede olmaz); yerleşmiş bir İngilizce terime zorlama bir karşılık uydurur;
  çok anlamlı terimi bağlamdan yanlış okur.
- **Çıktıda denetleyin:** denetçiyi metne uygulayın; çok anlamlı terimlerin hangi anlamda kullanıldığı açık mı;
  arayüz metninde İngilizce sözcük kalmış mı.

## İlgili

- [Teknik yazı](teknik-yazi.md): tek terim kuralı ve yalın yazım.
- [Arayüz dili](../97-turkce/arayuz-dili.md): kullanıcıya görünen metnin terimleri (İngilizce → Türkçe).
- Türkçenin dil olguları: [Ekler ve ünlü uyumu](../97-turkce/ekler-ve-unlu-uyumu.md),
  [Türkçe metin işleme](../97-turkce/turkce-metin-isleme.md).
