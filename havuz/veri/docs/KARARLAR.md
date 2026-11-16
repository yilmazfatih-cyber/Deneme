# Kararlar

Kısa kayıtlar: ne seçildi, neden, hangi seçenek neden elendi.

**K1 — Çekirdek bağımlılık yalnız stdlib + pydantic.** Şartname gereği. PyYAML, jsonschema, numpy,
pandas, duckdb ve python-stdnum çekirdekte YOK: DuckDB/pandas `analiz` ekstrasında (Parquet çıktısı,
SQL tarifleri, Parquet örnekleme); stdnum, PyYAML, jsonschema, hypothesis yalnız `dev`te ve yalnız
testlerde "başvuru gerçeklemesi" olarak kullanılır; babel/holidays/pycountry/schwifty `dogrulama`
ekstrasında ve yalnız `scripts/verify_reference.py`de.

**K2 — Şema: standart JSON Schema (2020-12) alt kümesi + kendi doğrulayıcımız.** Sözleşme Python'da
`TableContract` olarak yazılır, `.sema.json` olarak dışa aktarılır. Doğrulayıcıyı kendimiz yazdık
çünkü (1) CSV metin değerlerini türe çevirerek denetlemek, (2) Türkçe ve satır/sütun belirten iletiler,
(3) `x-denetim` (TCKN/IBAN sağlaması) ve `x-benzersiz` gerekiyordu. Desteklenmeyen JSON Schema
anahtarı sessizce yok sayılmaz, hata verir. Testler aynı şemaları ve verileri `jsonschema` kitaplığıyla
da sınar (bu, boş olabilen sütunda `enum`a `null` eklenmesi gerektiğini yakaladı).

**K3 — Katalog YAML'ı için küçük, katı bir okuyucu.** PyYAML çekirdeğe girmesin diye. Yalnız katalogun
kullandığı biçim desteklenir; belirsiz düz değerler (`yes`, `1.5`, `2026-11-16`, içinde boşluk olan
metin) tırnaksız yazılırsa hata verir. Gerçek katalog ve rastgele üretilmiş değerler PyYAML ile
karşılaştırılır (özellik testi kaçış ve `?` karakteri hatalarını yakaladı).

**K4 — Sağlama algoritmaları bu temelin kendi kopyası.** Kardeş temel (`havuz/kutuphane`) de yazıyor
ama bağımsızlık kuralı gereği içe aktarılmaz. Algoritmalar tanımından yazıldı ve python-stdnum ile
binlerce rastgele numara üzerinde karşılaştırılıyor.

**K5 — Tohumlu adlandırılmış akışlar (`Rng(tohum, "akış")`, sha256 ile türetme).** Bir üretece yeni alan
eklemek diğer alanların değerlerini kaydırmasın diye. Yalnız sürümler arası kararlı `random`
işlevleri kullanılır; bayt bayt yeniden üretim aynı Python ana sürümünde ve aynı paket sürümünde
garanti edilir (test: `tests/test_ornekler.py`).

**K6 — Para `Decimal` ve yarım yukarı yuvarlama.** Faturada matrah = tutar/(1+oran) yuvarlanır, KDV =
tutar − matrah; böylece toplamlar kuruşu kuruşuna tutar. `amount_to_words` float kabul etmez.

**K7 — İlçe kaynağı turkiye-api (MIT).** Dört kaynak karşılaştırıldı; turkiye-api, turkey-neighbourhoods
(PTT listesinden) ve Memleketim ile harfi harfine aynı; turkey-location-data'da 2, enisbt'de 6 fark
(eski/yanlış yazım ve eksik ilçe). Bölgede turkiye-api'nin iki hatası (Çankırı, Hakkari) ikinci kaynak
ve genel bilgiyle düzeltildi; meta dosyasında yazılı.

**K8 — Dışarıda bırakılanlar:** dinî bayramlar (Hicrî takvim + resmî ilan), mahalle ve posta kodu
listeleri (73 bin satır, PTT kaynağının yeniden dağıtım koşulu denetlenmedi, sık değişir), nüfus/alan/
koordinat (yıllık değişir, kaynak lisansı denetlenmedi), operatör önekleri, tam banka listesi
(resmî kaynağa erişilemedi). Gerekçeler `docs/BASVURU_VERILERI.md`de.

**K9 — Ruff satır uzunluğu 100; testlerde E501 kapalı.** Testlerdeki uzun satırlar çoğunlukla
parametre tablolarıdır; bölmek okunurluğu bozuyordu. Kaynak kodda kural tam uygulanır.

**K10 — Kirli veri kipi bozulma KAYDI tutar.** Her bozulmanın satırı, sütunu, türü, temiz ve kirli
değeri yazılır; test kaydı geriye uygulayıp temiz veriye ulaşıldığını doğrular. Kimlik (birincil
anahtar) sütunları varsayılan olarak bozulmaz ki izlenebilirlik kurulabilsin.

**K11 — Katalogda ticari kullanım kuralı yalnız lisans etiketine bakar, katalog kararı daha
kısıtlayıcı olabilir.** Web taraması, kazınmış (scraped) yorum, tweet, çeviri ya da derleme kümelerinde
lisans etiketi izin verici olsa da "belirsiz" yazıldı (kartlardaki açıklamaya dayanarak). ImageNet
erişim metni ticari olmayan kullanım dediği için "hayir". Doğrulama, katalog kararının kuraldan daha
serbest olmadığını denetler.

**K12 — İndirme dosyayı belleğe alır, dosya başına sınır koyar (varsayılan 300 MB).** Akış (streaming)
indirme ve parça parça SHA-256, getiricinin önbellek/yeniden deneme mantığını karmaşıklaştırırdı; büyük
kümeler için `datasets` kitaplığı önerilir.

**K13 — Örnek hat: TCMB günlük kurları.** Türkiye'de sık gereken, robots.txt'nin izin verdiği, ETag
ve Last-Modified veren, hafta sonu/tatilde 404 dönen (gerçekçi kenar durumları) bir kaynak. Kayıtlı
yanıtlar `tests/fixtures/tcmb/` altında (2026-11-16'da alındı; olgusal kur verisi).

**K14 — Durak sözcükler elle seçildi, kaynak listeler kopyalanmadı.** stopwords-iso listesinde bozuk
kodlamalı girdiler var ('altmýþ'); spaCy listesi çok geniş (çekimli biçimler). 260 sözcüğün 211'i bu
iki listede de var; kalanlar kesin işlev sözcükleri.

**K15 — Sentetik e-postalar ayrılmış alan adlarında** (`.example`, `.test`; RFC 2606/6761): yanlışlıkla
gerçek bir kutuya posta gitmesin. Telefon ve kimlik numaraları için böyle ayrılmış bir aralık
bilinmediğinden yalnız uyarı yazılır.

**K16 — Profilde "kod" türü:** rakamdan oluşan ve başında 0/+ olan ya da sabit uzunlukta (≥ 5) olan
sütunlar sayı sayılmaz (TCKN'nin ortalaması anlamsız; temizlikte "+90" kaybolmasın). Sezgidir; yanılabilir.

**K17 — Kişisel veri bulmada öncelik ve bağlam:** IBAN > e-posta > TCKN > kart > VKN > telefon. Serbest
metinde VKN için yakında "vkn/vergi" sözcüğü aranır (rastgele 10 haneli sayıların ~%10'u VKN
sağlamasını tutar); hücrenin tamamı geçerli VKN ise sütun değeri sayılır. Kart numarası 2–6 ya da 9 ile
başlamalı (ISO/IEC 7812 sektör hanesi) — "0090 …" telefonu kart sanılmasın.

**K18 — KDV oranları ayar dosyasında, veri dosyasında değil.** Oranlar karar ile değişebilir; varsayılan
%1/%10/%20 ikincil kaynaklarla teyit edildi (resmî metin okunamadı). Ürün → oran eşlemesi kurgusal.

**K19 — Komut satırı argparse ile ve Türkçeleştirilmiş.** typer/click bağımlılığı eklenmedi; "usage",
bölüm başlıkları ve yaygın hata iletileri Türkçeye çevrildi.

**K20 — Kilit dosyası `uv.lock`.** Kurulum komutu şartnamedeki gibi `uv pip install -e ".[dev,analiz]"`;
kilitli kurulum için `uv sync --extra dev --extra analiz`.
