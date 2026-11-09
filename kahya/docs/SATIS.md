# Türkiye’de satış ve büyüme planı

Bu belge ürünü satmak isteyen kurucu içindir. Rakamlar **varsayımdır**; pilot verisiyle güncelleyin.

## İki iş modeli

| Model                                         | Ne satılır                                                                                 | Gelir                                   | Not                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. Yazılım (SaaS)**                         | Kâhya’yı mevcut site yönetim şirketlerine lisanslamak                                      | Daire başına aylık abonelik             | Hızlı başlar, sermaye ister ama düşük; rakip yazılımlarla fiyat rekabeti                    |
| **B. Yapay zekâ ile işleyen yönetim şirketi** | Kendi yönetim şirketinizi kurup yerel firmaları devralmak; işi Kâhya ile otomatikleştirmek | Sitelerden alınan yönetim hizmet bedeli | Supa’nın İngiltere’de izlediği yol (kullanıcının paylaştığı habere göre £21M tohum yatırım) |

Önerilen sıra: **A ile başlayıp ürünü olgunlaştırmak, sonra B’ye geçmek.** Model B’de yazılım bir maliyet kalemi değil, rakiplere
karşı marj avantajıdır: aynı personelle daha fazla daire yönetilir.

## Değer önerisi — pilotta ölçülecekler

| Metrik                                           | Nasıl ölçülür (Kâhya’da)                      |
| ------------------------------------------------ | --------------------------------------------- |
| Personel başına yönetilen bağımsız bölüm         | daire sayısı / aktif personel kullanıcısı     |
| Mesajın ilk yanıt süresi                         | gelen mesaj → ilk giden yanıt zaman damgaları |
| Yapay zekânın kendiliğinden tamamladığı iş oranı | Pano → “Yapay zekâ bu ay” (otomatik / toplam) |
| Aylık tahsilat oranı ve ortalama gecikme günü    | Pano, Finans → Borç durumu, yaşlandırma       |
| Banka eşleştirmede elle müdahale oranı           | onaylanan öneri / toplam banka satırı         |
| Talep hizmet süresi aşımı                        | Talepler → “Süre aşıldı”                      |

Satış görüşmesinde tek cümle: **“WhatsApp’tan gelen her mesaj otomatik kayda dönüşür, havaleler kendiliğinden eşleşir, gecikme
kanuna uygun hesaplanır; yöneticiniz yalnız onaylar.”**

## Fiyatlandırma (başlangıç önerisi)

- Daire başına aylık sabit ücret, site büyüklüğüne göre kademeli; yıllık peşin ödemeye indirim.
- Kurulum ve veri devri ücreti (CSV şablonlarıyla birkaç saatlik iş).
- Yapay zekâ maliyeti düşüktür: 1.000 daire için ayda yaklaşık 22 $ (Claude Opus 5.5) — ayrıntı [YAPAY_ZEKA.md](YAPAY_ZEKA.md).
- SMS ve WhatsApp ileti ücretlerini ya pakete katın ya da kullanım kadar yansıtın.
- Fiyatı piyasadaki yazılımların ve yönetim şirketlerinin daire başı hizmet bedellerinin altında konumlandırmak yerine
  **tahsilat artışı ve personel tasarrufu** üzerinden anlatın.

## 90 günlük pilot

| Hafta | İş                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------- |
| 1     | Portföy devri: siteler, bloklar, daireler, malik/kiracı (CSV), devir bakiyeleri, belgeler, tedarikçiler |
| 2     | WhatsApp hattı ve SMS başlığı; sakinlere duyuru ve portal tanıtımı                                      |
| 3–4   | Yapay zekâ “öneri” modunda; personel onaylar, düzeltmeler kaydedilir                                    |
| 5–8   | Banka dökümü eşleştirme rutini; hatırlatmalar öneri modunda                                             |
| 9–12  | Talep açma ve usta atama otomatiğe; karşılaştırmalı rapor (önce / sonra)                                |

Başarı ölçütü örneği: tahsilat oranında artış, ilk yanıt süresinde düşüş, personel başına daire sayısında artış.

## Devral ve otomatikleştir (Model B) oyun planı

**Hedef firma profili:** 300–3.000 bağımsız bölüm yöneten, kurucusu emekliliğe yaklaşan, Excel/defterle çalışan, iyi itibarlı
yerel yönetim şirketleri.

**Ön inceleme listesi**

- [ ] Site listesi, yönetim sözleşmeleri, süreleri ve fesih koşulları
- [ ] Son 12 ayın tahsilat ve alacak yaşlandırması (devir bakiyeleri bu listeden aktarılır)
- [ ] Banka hesaplarının kimin adına olduğu, kasa ve yedek akçe bakiyeleri
- [ ] Personel (kapıcı, güvenlik) sözleşmeleri, SGK, açık davalar
- [ ] Tedarikçi sözleşmeleri, periyodik kontrol belgeleri (asansör etiketleri dahil)
- [ ] KVKK: aydınlatma metinleri, veri envanteri, VERBİS

**Değerleme mantığı:** yıllık tekrarlayan yönetim hizmet geliri × sözleşme sürekliliği × marj. Kâhya ile işletildiğinde marjın ne
kadar artacağını pilot verisiyle gösterin; alım fiyatını bugünkü, değer yaratmayı yarınki marj üzerinden kurun.

**İlk 30 gün entegrasyonu (Kâhya’da)**

1. Ayarlar → yeni siteler; Portföy devri ekranından daireler ve kişiler (önce “Kontrol et”).
2. Devir bakiyeleri (borç pozitif, avans negatif) — eski yönetimin gecikme tazminatı ayrı tutulur.
3. Yönetim planı, iç yönetmelik ve son kurul kararları Belgeler’e; asistan hemen yanıt vermeye başlar.
4. Tedarikçiler ve periyodik kontroller; geciken kontroller panoda kırmızı görünür.
5. Sakinlere duyuru: yeni WhatsApp hattı, portal girişi (telefon numarası), ödeme yolları.
6. İlk ay sonunda: tahsilat, mesaj hacmi ve talep sürelerini devralma öncesiyle karşılaştırın.

## Satış kanalları

- Yönetim şirketleriyle doğrudan görüşme; sektör dernekleri ve gayrimenkul fuarları.
- Yeni konut projeleri: müteahhidin teslim sonrası ilk yönetimini üstlenmek.
- Sakin tavsiyesi: portal deneyimi en iyi pazarlamadır.
- İçerik: KMK’ya göre gecikme tazminatı hesaplayıcı, işletme projesi şablonu, genel kurul çağrı metni gibi ücretsiz araçlar.

## Ticari kurulum kontrol listesi

- [ ] Şirket kuruluşu, vergi levhası, e-Fatura/e-Arşiv (hizmet bedeli faturaları için)
- [ ] KVKK: aydınlatma metni, VERBİS, yurt dışı aktarım standart sözleşmesi (Claude kullanılıyorsa)
- [ ] Netgsm başlık onayı, WhatsApp Business doğrulaması ve şablon onayı
- [ ] PayTR üye işyeri; aidat fonlarının akışı için hukuki görüş (6493 sayılı Kanun)
- [ ] Mesleki sorumluluk sigortası; standart yönetim sözleşmesi
- [ ] Sunucu: Türkiye’de barındırma, günlük yedek, erişim kayıtları

## Ürün yol haritası (öneri)

| Öncelik | İş                                                                            |
| ------- | ----------------------------------------------------------------------------- |
| Yüksek  | Banka API’si ile hesap hareketlerinin otomatik çekilmesi (CSV yükleme yerine) |
| Yüksek  | WhatsApp’tan gelen fotoğraf ve konumun talebe eklenmesi                       |
| Yüksek  | e-Fatura entegrasyonu (yönetim hizmet bedeli ve gider faturaları)             |
| Orta    | Personel (kapıcı/güvenlik) puantaj ve bordro özeti                            |
| Orta    | Telefon santrali + sesli asistan (arayan sakinin talebini kayda dönüştürme)   |
| Orta    | Mobil uygulama ve anlık bildirim                                              |
| Düşük   | PostgreSQL ve çok sunucu (bkz. MIMARI → Ölçekleme yolu)                       |
