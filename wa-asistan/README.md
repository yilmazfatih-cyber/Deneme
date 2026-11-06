# wa-asistan — WhatsApp'ta çoklu-model kişisel asistan

Kendi bilgisayarında çalışan, **kendi WhatsApp hesabına bağlı cihaz olarak** takılan, tek bir API anahtarıyla
yüzlerce modele erişen ve harcamayı **TL ile tahmini olarak** tutan kişisel asistan.

[AnyModelBot](https://github.com/modelflare-ai/AnyModelBot) fikrinden esinlenildi (yerel öncelikli, önce sahip,
`/model` ile model değiştirme, harcama takibi). AnyModelBot'ta WhatsApp kanalı yoktur; bu proje onu sıfırdan,
WhatsApp için yazar. AnyModelBot'tan kod kopyalanmadı; kuyruk ve erişim fikirleri yeniden yazıldı.

Araştırma bulguları ve kararlar: [docs/ARASTIRMA.md](docs/ARASTIRMA.md)

## Neler yapar

- **Kendine mesaj sohbetinde** (ve izin verdiğin kişilerin birebir mesajlarında) yanıt verir. Gruplara, yabancılara
  ve durum paylaşımlarına hiç bakmaz.
- **Tek anahtar, çok model.** Varsayılan [OpenRouter](https://openrouter.ai). Modelflare ya da herhangi bir OpenAI
  uyumlu `/v1` adresi ayarla değişir. Sohbet başına `/model` ile model seçilir.
- **TL maliyet defteri.** Her yanıtın bedeli (sağlayıcı bildirirse onun rakamı, yoksa fiyat listesinden tahmin)
  USD olarak kaydedilir, güncel kurla TL'ye çevrilir. `/maliyet` bugünü, ayı ve modelleri gösterir. Aylık TL sınırı
  koyabilirsin.
- **Kişisel bilgilerin.** Aile, sağlık, iş, kişiler, takvim bilgilerini bilgisayarındaki düz dosyalara koyarsın. Bot her
  soruda yalnızca ilgili parçaları modele verir. Bölüm "Kişisel bilgilerini bağla".
- **Resim, sesli mesaj, metin dosyası.** Görsel destekli modele resim gönderebilirsin. Sesli mesaj için ayrıca bir
  konuşma-yazıya servisi ayarlanır (isteğe bağlı).

## Nasıl çalışır

```
Telefonun (WhatsApp)  ──bağlı cihaz──►  wa-asistan (Node, Baileys)  ──►  Model sağlayıcı (tek anahtar)
   "kendine mesaj"                       │  erişim · kuyruk · komutlar         OpenRouter / Modelflare / /v1
   + izinli kişiler                      │  kişisel bilgi (data/profil, yerel)
                                         │  maliyet defteri (TL)  ◄── kur: TCMB → frankfurter → er-api
                                         └──(isteğe bağlı)──►  Hermes API sunucusu (bkz. aşağıda)
```

## Kurulum

Gerekenler: Node.js 22.12 veya üstü, bir model sağlayıcı anahtarı, WhatsApp'lı bir telefon.

```bash
cd wa-asistan
npm install
cp env.example .env       # LLM_API_KEY değerini yaz
npm start
```

İlk çalıştırmada terminalde bir **QR kodu** çıkar. Telefonda WhatsApp › Bağlı cihazlar › Cihaz bağla ile okut.
QR yerine kod istersen `.env` içine `PAIRING_PHONE=905321234567` yaz; terminalde 8 haneli bir kod çıkar
(WhatsApp › Bağlı cihazlar › Telefon numarasıyla bağla).

Bağlandıktan sonra WhatsApp'ta **kendi numaranla olan "Kendine mesaj" sohbetini** aç ve `/yardim` yaz.

Oturum bilgileri `data/auth/` altında kalır. Bu klasör hesabına erişim anahtarlarını içerir: kimseyle paylaşma,
yedeklersen şifreli sakla. `data/` klasörü Git'e hiç girmez.

## Komutlar

| Komut                 | Ne yapar                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `/yardim`             | Komut listesi                                                                                             |
| `/model`              | Şu anki model, 1M token fiyatı (TL), bağlam uzunluğu                                                      |
| `/model hizli`        | Model seç: tam kimlik, takma ad (`hizli`, `akilli`, `ucuz`, `ucretsiz`, `otomatik`) veya adın bir parçası |
| `/modeller [kelime]`  | Model ara. `/modeller yenile` listeyi sağlayıcıdan yeniler                                                |
| `/yeni`               | Sohbet geçmişini temizle (model ve notlar kalır)                                                          |
| `/sistem [metin]`     | Bu sohbet için sistem istemini göster / değiştir (`/sistem sil` sıfırlar)                                 |
| `/not ekle <metin>`   | Her yanıtta modele verilen kısa bir not ekle (`/not`, `/not sil 2`)                                       |
| `/profil`             | Kişisel bilgi dosyalarının özeti                                                                          |
| `/hatirla <metin>`    | Kişisel bilgilere tarihli bir satır ekle                                                                  |
| `/unut <no>`          | `/hatirla` ile eklenen bir satırı sil (silinen satır `.silinenler.txt` içinde saklanır)                   |
| `/maliyet`            | Bugün, bu ay ve toplam harcama (TL ve USD), en çok kullanılan modeller                                    |
| `/butce [TL]`         | Aylık TL sınırını göster / ayarla. `0` = sınırsız                                                         |
| `/kur`                | Kuru ve kaynağını göster. `/kur 41,5` elle sabitler, `/kur guncelle` yeniler                              |
| `/durum`              | Model, sağlayıcı, kur, bütçe, çalışma süresi                                                              |
| `/izin ekle <numara>` | (Yalnızca sahip) bir kişiyi izin listesine ekle. `/izin`, `/izin sil <numara>`                            |
| `/altbilgi`           | Her yanıtın altındaki `≈ 0,12 TL · model` satırını aç / kapat                                             |

Komutlar Türkçe karakter olmadan da çalışır (`/yardım` = `/yardim`). Komutlar modeli çağırmaz, para harcatmaz.

## Kişisel bilgilerini bağla

Bütün kişisel bilgilerin **bilgisayarında, `data/profil/` klasöründe** düz Markdown dosyaları olarak durur. Dosyaları
istediğin editörle yazarsın; bot değişiklikleri anında görür.

```
data/profil/
  temel.md      her soruda otomatik eklenir (kısa tut: ad, şehir, dil tercihin, alışkanlıkların)
  aile.md       "## Kardeşler", "## Anne" gibi başlıklar altında
  saglik.md     "## İlaçlar", "## Doktorlar" …
  is.md  arac.md  ev.md  …   istediğin kadar dosya
  hatirla.md    /hatirla komutunun yazdığı satırlar
  kisiler.md    içe aktarılan kişiler
  takvim.md     içe aktarılan etkinlikler (takvim.json önümüzdeki 7 günü her soruya ekler)
```

**Nasıl seçilir?** Dosyalar başlıklara göre parçalanır. Her mesajda sorudaki kelimelerle parçalar puanlanır
(Türkçe ekleri tolere eden basit bir kök eşleştirme) ve en ilgili birkaç parça, 3.500 karaktere kadar, modele
"veri" olarak verilir. Vektör veritabanı yok, internet gerekmez. İyi sonuç için başlıkları anlamlı yaz: `## İlaçlar`,
`## Plaka`, `## Wi-Fi`.

**İçe aktarma.** Google Kişiler'den vCard (`.vcf`) veya CSV, takvimden `.ics` dışa aktar ve yerelde çalıştır:

```bash
npm run ice-aktar -- ~/Downloads/contacts.vcf
npm run ice-aktar -- ~/Downloads/takvim.ics
```

Dosya hiçbir yerden dolaşmaz; WhatsApp'a göndermen gerekmez. Eski `kisiler.md` / `takvim.md` `.eski` olarak yedeklenir.
Google'ın CSV başlıkları desen eşleştirmeyle okunur; 2026 dışa aktarımıyla birebir denenemedi, başlıklar farklıysa
`.vcf` kullan.

**Neyi asla kaydetmez?** `/hatirla` ve içe aktarma; şifre/anahtar, geçerli bir TC kimlik numarası, IBAN ve kart
numarası gibi görünen metni **reddeder veya atlar**. Bunları profil dosyalarına kendin elle yazarsan bot engellemez:
yazma.

**E-posta, banka ekstresi, sağlık raporu gibi büyük arşivleri toptan bağlama.** Hepsi bir model sağlayıcısına gidebilecek
bilgilerdir. Küçük, seçilmiş özetler yaz.

### Gizlilik: nereye ne gider?

| Yerinde kalır                                  | Sağlayıcıya gider                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Tüm profil dosyaları, kişiler, takvim          | Yalnızca o soru için seçilen profil parçaları (en çok ~3.500 karakter) |
| Sohbet geçmişi (`data/chats`), maliyet defteri | Sohbet geçmişinin son kısmı ve sorunun kendisi                         |
| WhatsApp oturum anahtarları (`data/auth`)      | Hiçbir zaman                                                           |

Model sağlayıcıya giden her şey o şirketin kurallarına tabidir. OpenRouter'da verinin eğitimde kullanılmaması için
hesap ayarlarında veri toplamayı kapat. Kişisel verinin yurt dışındaki bir sağlayıcıya aktarılması 6698 sayılı KVKK
kapsamında bir "aktarım"dır; bunun senin için ne anlama geldiğini bilmek istiyorsan bir uzmana danış. Geçmişi diske
yazmak istemezsen `HISTORY_PERSIST=false`.

## Maliyet ve TL

- Her yanıtta OpenRouter, bedeli USD olarak bildirir (`usage.cost`); bot bunu aynen kaydeder. Bildirmeyen sağlayıcıda
  katalogdaki token fiyatından tahmin edilir. Fiyatı hiç bilinmeyen model "maliyet bilinmiyor" diye işaretlenir ve
  tutar olarak 0 sayılır: bütçe sınırı bunları yakalayamaz, `/maliyet` kaç tane olduğunu söyler.
- **Kur sırası:** elle girilen (`USD_TRY` veya `/kur 41,5`) → taze önbellek → TCMB `today.xml` (USD satış) →
  frankfurter → open.er-api → eski önbellek. Hiçbiri yoksa defter yalnızca USD tutar; yanıtlar bundan etkilenmez.
- **`TL_CARPAN`:** Kartından gerçekte çıkan tutar genelde sağlayıcı bedelinin üstündedir (OpenRouter kredi yüklemede
  %5,5 komisyon alır; bankalar kur farkı ekler). Çarpanı 1,09 gibi bir değere ayarlarsan TL rakamı buna yaklaşır.
  Varsayılan 1'dir.
- **Rakamlar tahminidir.** Kesin tutar sağlayıcının panelindedir.

### "TL ile tek fatura" nasıl olur?

Yerel olarak TL ile fatura kesen, güvenilirliği doğrulanmış bir çoklu-model toplayıcı bulunamadı (bazı yerli girişimler
TL yükleme ve e-fatura iddiasında; bağımsız doğrulama yok). Kişisel kullanımda pratik çözüm: sağlayıcıya seyrek ve
büyük bir ön ödeme yap. Kart ekstresinde tek satır görünür, binlerce küçük istek ayrı satır olmaz. Şirket adına
alıyorsan KDV/stopaj için mali müşavirine danış. Bir ürün olarak yapılsaydı gerekenler: iyzico/PayTR ile TL yükleme,
kullanıcı başına sağlayıcı anahtarı ve bütçe, e-fatura entegrasyonu. Bu proje bunların hiçbirini yapmaz.

## Sağlayıcı seçimi

| Sağlayıcı   | `.env`                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| OpenRouter  | Varsayılan. `LLM_BASE_URL=https://openrouter.ai/api/v1`                                                                            |
| Modelflare  | `LLM_BASE_URL=https://modelflare.dev/v1`, `DEFAULT_MODEL` zorunlu. Mesaj başına bedel alanı doğrulanmadı; bot fiyattan tahmin eder |
| Başka `/v1` | `LLM_BASE_URL=…`, `LLM_PROVIDER=generic`, `DEFAULT_MODEL` zorunlu                                                                  |

### Hermes Agent'ı beyin olarak kullanmak (isteğe bağlı, denenmedi)

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research) kendi araçları, becerileri ve belleğiyle
çalışan bir ajan çalışma ortamıdır ve OpenAI uyumlu yerel bir API sunucusu açabilir. Bu sayede wa-asistan WhatsApp
tarafını, Hermes de düşünme tarafını yapar. **Bu bağlantı yazıldı ama bu ortamda Hermes kurulup denenemedi.**
Araştırmaya göre adımlar:

1. Hermes'i kendi belgelerine göre kur (Python 3.14, Node 26 ve ek paketler ister; ağır bir kurulumdur).
2. Hermes'in `.env` dosyasında `API_SERVER_ENABLED=true` ve rastgele bir `API_SERVER_KEY` ayarla. Adres
   `http://127.0.0.1:8642/v1` olur.
3. **Hermes'in kendi WhatsApp bağdaştırıcısını açma.** Aynı numaraya iki Baileys bağlantısı bağlanmaz; soketi wa-asistan tutar.
4. **Araç setini daralt** (`hermes tools`: terminal, kod çalıştırma, tarayıcıyı kapat) ve onay kipini `manual` yap. Aksi halde
   telefondan gelen bir mesaj bilgisayarında komut çalıştırabilir.
5. wa-asistan `.env`: `LLM_BASE_URL=http://127.0.0.1:8642/v1`, `LLM_API_KEY=<API_SERVER_KEY>`, `LLM_PROVIDER=generic`,
   `DEFAULT_MODEL=<Hermes'in bildirdiği ad>`; isteğe bağlı `LLM_EXTRA_HEADERS={"X-Hermes-Session-Id":"wa"}`.

Hermes harcamayı bildirmez, bu yüzden defter "maliyet bilinmiyor" yazar; gerçek harcama Hermes'in `/usage` çıktısındadır.
Hermes'in kendi belleği çok küçüktür (yaklaşık 3,5 bin karakter); geniş kişisel bilgi için yine `data/profil` kullanılır.

## Riskler ve sınırlar

- **Resmî olmayan istemci.** Baileys, WhatsApp Web protokolünü kullanır. WhatsApp bunu şartlarına aykırı sayar;
  hesabın geçici veya kalıcı olarak kısıtlanması mümkündür. Azaltmak için bot: yalnızca kendine mesaja ve izinli
  kişilere yanıt verir, kimseyle sohbet başlatmaz, gruplara bakmaz, mesajlar arasında bekler, çevrimiçi görünmez.
  Yine de risk sıfır değildir. Asıl hesabını riske atmak istemiyorsan ikinci bir numara (eSIM) kullan.
- **Resmî alternatif: WhatsApp Cloud API.** Kişisel numarada çalışmaz; ikinci bir numara ve Meta işletme hesabı ister,
  işletme dışı kişisel kullanımı ve genel amaçlı yapay zekâ asistanlarını sınırlayan şartlar vardır. Ayrıntı
  [docs/ARASTIRMA.md](docs/ARASTIRMA.md) içinde.
- **Gerçek hesapla uçtan uca deneme yapılmadı.** Bu geliştirme ortamında WhatsApp'a erişim yok. Mesaj eşleme, erişim
  kuralları, komutlar, maliyet, kur ve profil katmanı birim testleriyle doğrulandı; bağlantı katmanı derlendi ama canlı
  denenmedi. İlk gerçek çalıştırmada "kendine mesaj" sohbetinin hangi biçimde (telefon ya da LID) geldiğini log'dan kontrol et.
- **Bilgisayar açık olmalı.** Bot senin bilgisayarında çalışır; kapalıyken yanıt vermez.
- **Gruplar, sesli yanıt, PDF okuma** yok.

## Geliştirme

```bash
npm run check      # tip denetimi + biçim + testler (hepsi çevrimdışı)
npm test
npm run format
```

## Yol haritası

- Gerçek hesapla uçtan uca doğrulama ve bulgulara göre düzeltme
- PDF ve görsel belgelerden profile aktarma (yerel, onaylı)
- İsteğe bağlı whatsmeow (Go) taşıma katmanı; Baileys sorun çıkarırsa
- Hermes bağlantısının denenmesi ve belgelenmesi

## Lisans

MIT. Baileys MIT lisanslıdır; bağımlılığı olan `libsignal` GPL-3.0'dır. Programı dağıtmayı düşünüyorsan lisans
koşullarına bak. Kişisel kullanım için sorun yoktur.
