# İthalat ajanı

Alibaba'da Türkiye'ye getirilip satılabilecek **hazır giyim ve aksesuar** ürünlerini düzenli arayan ajan.
Her aday için tüm masraflarıyla birim maliyeti hesaplar: ürün, kargo, gümrük vergisi, ilave gümrük vergisi, KDV,
gümrükleme ve ödeme masrafı. Bu maliyet Türkiye'deki fiyatın **en fazla üçte biri** ise ürünü raporlar.
İndirime giren ve fiyatı düşen ilanları ayrı bir bölümde gösterir.

> **Vergi ya da hukuk danışmanlığı değildir.** Oranlar 12 haneli GTİP'e göre değişir. Siparişten önce GTİP'i ve
> oranları bir gümrük müşavirine doğrulatın, numune alın. Satış için ticari ithalat ve vergi numarası gerekir.
> Markalı, logolu ya da "replica" ürün ithal etmek ve satmak suçtur. Ajan bu ürünleri eler.

## Nasıl çalışır

```
Zamanlanmış görev (Claude Code, abonelik)        ithalat-ajani/TARAMA.md
  │  sıradaki 3 kategori (rotasyon + mevsim), TCMB kuru, geçmiş
  ▼
3 × ithalat-avcisi (Sonnet, WebSearch)            .claude/agents/ithalat-avcisi.md
  │  Alibaba: birim fiyat, MOQ, kademeler, ağırlık, indirim · Türkiye: Trendyol/Hepsiburada fiyatları
  ▼
aday JSON  →  python -m ithalat_ajani degerlendir  (vergi tablosu + maliyet formülü; dil modeli hesap yapmaz)
  ▼
rapor (Markdown) + geçmiş (SQLite)  →  ithalat-ciktilari dalı · fırsat varsa GitHub Issue · telefona bildirim
```

Dil modeli yalnız veri toplar. Hesap ve karar koddadır, testlidir ve her raporda varsayımlarıyla yazılır.

## Hesap

Birim başına:

| Kalem                 | Formül                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Ücretli ağırlık       | max(ağırlık × 1,10 ambalaj, en × boy × yükseklik / 5000)                                   |
| Kargo                 | ücretli kg × **5 $/kg**                                                                    |
| Gümrük kıymeti (CIF)  | mal + kargo + sigorta (%0,5)                                                               |
| GV, İGV               | CIF × oran (vergi tablosundan; Çin menşeli, ticari ithalat)                                |
| Sabit pay             | sevkiyat başına 12.000 TL (müşavir, beyanname, ardiye, yurt içi) × mal bedeli / 3.000 $    |
| Ödeme                 | mal × %3 (kart/havale komisyonu, kur farkı)                                                |
| **Birim maliyet**     | (mal + ödeme + kargo + sigorta) × kur + GV + İGV + sabit pay, KDV hariç                    |
| İthalat KDV'si        | (CIF + GV + İGV) × KDV; ödenir ama satışta indirilir, bu yüzden maliyete girmez            |
| **Kat**               | (Türkiye fiyatı / (1 + KDV)) / birim maliyet                                               |
| Pazaryeri kârı (bilgi) | KDV hariç satış − %21,5 komisyon − 90 TL sipariş gideri − iade payı − birim maliyet       |

İki taraf da KDV hariç karşılaştırılır. Bu, "raf fiyatı ≥ 3 × KDV dahil ödediğim her şey" kuralından biraz daha
sıkıdır. Kur TCMB döviz satış kurudur (gümrüğün kullandığı kur).

Örnek (kur 50,18): 2,60 $'lık, 70 gramlık twill eşarp → kargo 19 TL, GV %8 12 TL, İGV %39 59 TL, sabit pay 10 TL
→ **236 TL** birim maliyet. Trendyol medyanı 924 TL → KDV hariç 840 TL → **kat 3,57 → UYGUN**.
Aynı hesapta 2,90 $'lık, 190 gramlık basic tişört 316 TL'ye gelir; 349 TL'lik Türkiye fiyatıyla kat 1,0.
Hafif aksesuar kargo ve vergide avantajlıdır. Ağır ve %51 vergili basic giyim nadiren tutar.

## Kararlar

| Karar           | Anlamı                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `UYGUN`         | kat ≥ 3 ve kanıt yeterli                                                                              |
| `UYGUN-DOGRULA` | kat ≥ 3 ama doğrulanacak bir şey var: üçten az Türkiye ilanı, tahmini vergi ya da ağırlık, MOQ bütçeyi aşıyor, tek adet satışta pazaryeri kârı eksi |
| `YAKIN`         | 2,5 ≤ kat < 3                                                                                         |
| `ELENDI`        | kat < 2,5 ya da marka/taklit riski                                                                    |

Vergi oranı "tahmini" olan kategorilerde (takı, gözlük, saat, saç aksesuarı, şapka, kemer) ürün ayrıca İGV +15
puanla sınanır; o senaryoda da 3 kat tutmazsa `UYGUN-DOGRULA` olur.

## İndirimler ve fiyat takibi

- **Alibaba kampanyası:** İlan indirimdeyse (Deals, flash sale, kupon) avcı indirimsiz fiyatı ve bitiş tarihini yazar.
  Rapor indirimli katı ve indirim bitince katı gösterir. Eşiği yalnız indirimle geçen ürün **süreli fırsat** olarak
  işaretlenir: indirim bitmeden sipariş gerekir.
- **Fiyatı düşenler:** Her tarama, önceki taramalarda iyi çıkan ilanların fiyatını yeniden ölçer. Önceki ölçüme göre
  %3'ten fazla ucuzlayan ilan, eski → yeni fiyat ve kat değişimiyle listelenir.
- **Türkiye indirimleri:** Karar şu anki raf fiyatıyla verilir. Türkiye ilanlarının bir kısmı indirimdeyse (Kasım
  indirim dönemi gibi), normal fiyatla hesaplanan kat rapora not edilir.

## Vergi tablosu

`ithalat_ajani/tarife.toml`: 24 kategori (10 hazır giyim, 13 aksesuar, 1 ayakkabı). Tabloyu görmek için
`python -m ithalat_ajani kategoriler` komutunu çalıştırın.

- Hazır giyim (61–62. fasıl): GV %12 (sütyen %6,5), İGV %39 (7709 sayılı CK, RG 16.10.2023), KDV %10.
- Çanta ve cüzdan (4202): GV %2,7–9,7, İGV %39 (2025), KDV %10 (tekstil/deri) ya da %20 (PU).
- Ayakkabı (64): GV %16,9, İGV %40 (2025).
- Takı, gözlük, saat, saç aksesuarı, şapka, kemer: GV %2,7–5. Bunların İGV'si doğrulanamadı, %30 varsayıldı
  (`guven = "tahmini"`).

Bir oranı doğruladığınızda dosyadaki değeri, `kaynak` alanını ve `surum` tarihini güncelleyin.

## Kurulum ve kullanım

```bash
cd ithalat-ajani
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[test]"
cp ayarlar.ornek.toml ayarlar.toml   # isterseniz; varsayılanlar yukarıdaki tablodur
```

```bash
python -m ithalat_ajani kur                       # TCMB USD/EUR (günlük önbellek)
python -m ithalat_ajani kategoriler               # vergi tablosu
python -m ithalat_ajani kategoriler --siradaki 3  # sıradaki taramanın kategorileri

# Tek ürün: 2,80 $, 60 g eşarp, Türkiye'de 450/599/750 TL
python -m ithalat_ajani hesapla --kategori esarp-sal --fiyat-usd 2.8 --agirlik-kg 0.06 \
  --tr-fiyat 450 --tr-fiyat 599 --tr-fiyat 750 --moq 100 [--indirimsiz-usd 3.5]

# Aday dosyası (biçim: ornekler/ornek-adaylar.json) → rapor + geçmiş
python -m ithalat_ajani degerlendir ornekler/ornek-adaylar.json --kaydetme
python -m ithalat_ajani gecmis --gun 30 --durum UYGUN UYGUN-DOGRULA
```

Claude Code'da depo kökünden `/ithalat` (tam tarama), `/ithalat eşarp` (tek kategori) ya da
`/ithalat hesapla esarp-sal 2.8$ 0.06kg 599TL` yazabilirsiniz.

## Düzenli çalışma

Claude Code zamanlanmış görevi her gün `TARAMA.md` akışını çalıştırır. Abonelikle çalışır, API anahtarı gerekmez.
Her taramada 3 kategoriye bakar; 24 kategori yaklaşık 8 günde bir döner. Mevsim dışı kategoriler sona kalır.

- Çıktılar kod dallarına değil **`ithalat-ciktilari`** dalına yazılır: `veri/ithalat.db` ve
  `raporlar/tarama-*.md` (ham aday dosyaları da `raporlar/adaylar-*.json`).
- Yeni uygun ürün ya da süreli fırsat varsa `İthalat fırsatları — YYYY-MM-DD` başlıklı bir GitHub Issue açılır.
- Oturumun son mesajı telefona bildirim olarak düşer.

## Bilmeniz gerekenler

- **Veri arama sonucundan gelir.** Bu bulut ortamında alibaba.com ve trendyol.com'a doğrudan bağlantı kapalıdır.
  Avcı fiyatı WebSearch sonuçlarından okur. Rapordaki bağlantıyı açıp fiyatı, MOQ'yu ve ağırlığı kendiniz görün.
- **Kargo 5 $/kg bir varsayımdır.** 2026 piyasası hava kargoda 4,5–6,5 $/kg. Kargocunuzun teklifine göre
  `ayarlar.toml` dosyasında güncelleyin. Tedarikçiden depoya Çin içi kargo ücretliyse onu da ekleyin.
- **Kargo muafiyeti yok.** 6 Şubat 2026'dan beri posta/hızlı kargoda 30 € muafiyeti kalktı. Kişisel gönderi
  rejimi (%60 tek vergi) satış için kullanılamaz.
- **Gümrük kıymeti:** Çok düşük beyan edilen giyimde gözetim belgesi ya da kıymet incelemesi çıkabilir.
- **Sipariş öncesi:** numune; GTİP ve oran teyidi; tekstilde Türkçe etiket ve lif oranı; gözlükte UV ve CE;
  pilli üründe hava kargo kısıtı; tedarikçinin Trade Assurance kapsamı.
- **Pazaryeri kârı tahmindir.** Komisyon, kargo anlaşması, iade oranı ve reklam satıcıya göre değişir. Ucuz ürünlerde
  sipariş başı kargo kârı siler. Bu ürünleri set olarak satmak gerekir; rapor bunları ayrıca işaretler.

## Testler

```bash
python -m pytest -q
```

Testler ağa çıkmaz: TCMB çağrısı sahte yanıtla sınanır.
