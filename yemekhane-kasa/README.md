# Yemekhane Kasa — kameradan otomatik adisyon

Kasanın üstündeki kamera tepsiyi görür, tepsideki yemekleri **günün menüsüyle eşler**, menüdeki fiyatlarla
**fiyatlandırır** ve adisyonu **POS'a gönderir**. Kamera 3–4 saniyede bir bakar (`cekim_araligi_sn`, varsayılan 3,5);
aynı tepsi iki kez ücretlendirilmez, tepsiye sonradan eklenen tatlı aynı siparişin güncellemesi olur.

```
kamera ──► tepsi bölgesi ──► boş mu? hareketli mi?  ──► (3–4 sn'de bir) ──► Claude: menü eşleme ──► fiyat ──► POS
           (kırpma)          (yerel, ücretsiz,            değişiklik varsa      (yalnız menü         (kuruş, KDV,   (JSON,
                              0,3 sn'de bir)                                     kimlikleri)          fiks menü)     HTTP)
```

- **Fiyatı model söylemez.** Model yalnız "tepside hangi menü kalemleri var" der; yanıtı JSON şemasıyla kısıtlıdır ve
  kimlik yalnız günün menüsündekilerden biri olabilir. Fiyat, KDV, yarım porsiyon ve fiks menü indirimi kodda,
  kuruş hassasiyetinde hesaplanır.
- **Gereksiz çağrı yok.** Tezgâhın boş olup olmadığı ve görüntünün değişip değişmediği yerelde ölçülür. Yapay zekâ
  yalnız yeni ya da değişmiş tepside çağrılır; kasada bekleyen tepsi için her 3,5 sn'de para harcanmaz.
- **Kasiyer son sözü söyler.** Emin olunmayan kalem, menüde bulunamayan yemek ya da modelin uyarısı adisyona
  `kontrol_gerekli` olarak yazılır.
- **Her şey kayıtlı.** Her tanıma ve gönderim, tepsi görüntüsüyle birlikte `kayitlar/` altında saklanır (itiraz için).

## Hızlı deneme (kamera ve API anahtarı gerekmez)

```bash
cd yemekhane-kasa
python -m venv .venv && . .venv/bin/activate
pip install -e ".[kamera,claude,test]"
python -m yemekhane_kasa demo
```

Demo; boş tezgâh → tepsi → ışığı değişen aynı tepsi → tatlı eklenen tepsi → boşluk → aynı yemekleri alan ikinci
müşteri sahnelerini gerçek servis döngüsüyle oynatır. Ekranda iki "YENİ SİPARİŞ" ve bir "GÜNCELLEME (rev. 2)" görürsünüz.

HTTP entegrasyonunu görmek için iki terminal:

```bash
python -m yemekhane_kasa pos-simulator --port 8099
```

```bash
python -m yemekhane_kasa demo --pos-adres http://127.0.0.1:8099/siparis
```

## Yemekhanede kurulum

1. **Kamera:** Kasadaki tepsi alanını tepeden (60–100 cm) gören sabit bir USB ya da IP kamera. Tepsinin konacağı yeri
   tezgâhta işaretleyin; ışık sabit olsun, yemeklere parlama gelmesin. Görüntüye müşterilerin yüzü girmesin.
2. **Ayarlar:** `cp ayarlar.ornek.yaml ayarlar.yaml` ve `kamera.kaynak` (USB için `0`, IP kamera için `rtsp://...`).
   Parolaları dosyaya değil ortam değişkenine yazın: `rtsp://admin:${KAMERA_PAROLA}@192.168.1.20/stream1`.
3. **Tepsi bölgesi ve boş tezgâh:** Tezgâh boşken `python -m yemekhane_kasa kalibre`. Komut boş tezgâhı kaydeder ve
   `kalibrasyon/tam_kare.jpg` dosyasına bölgeyi kırmızı çerçeveyle çizer. `kamera.bolge` değerini
   (`[x, y, genişlik, yükseklik]`, karenin oranı) çerçeve tam tepsi alanını çevreleyene dek düzeltip komutu yeniden
   çalıştırın. Kalibrasyon yapılmazsa boş tezgâh ilk "tepsi yok" yanıtıyla öğrenilir, ama yapılması önerilir.
4. **Menü:** `menuler/ornek-menu.yaml` örneğini kendi yemeklerinizle düzenleyin; her gün ayrı dosya için
   `menu: menuler/{tarih}.yaml`. **`tarif` alanı** (renk, kap, üstündeki süs) tanımanın en büyük yardımcısıdır; benzer
   yemekler varsa (iki çorba, iki pilav) her birine kendi kabınızda çekilmiş bir `gorsel` fotoğrafı ekleyin.
   `python -m yemekhane_kasa menu-dogrula` dosyayı denetler. Menü servis çalışırken düzenlenebilir.
5. **Deneme:** Birkaç gerçek tepsiyi telefonla tepeden çekin ve `python -m yemekhane_kasa dene tepsi.jpg` ile fişi
   görün. Modeli ve tarifleri burada ayarlayın (`--gonder` POS'a da yollar, `--json` POS'a gidecek mesajı yazar).
6. **Çalıştırma:** `export ANTHROPIC_API_KEY=...` ve `python -m yemekhane_kasa calistir`.

Kasa bilgisayarında sürekli çalışsın diye örnek systemd birimi:

```ini
[Unit]
Description=Yemekhane kasa
After=network-online.target

[Service]
WorkingDirectory=/opt/yemekhane-kasa
Environment=ANTHROPIC_API_KEY=...
ExecStart=/opt/yemekhane-kasa/.venv/bin/python -m yemekhane_kasa calistir
Restart=always

[Install]
WantedBy=multi-user.target
```

## Nasıl karar veriyor

| Durum                                                   | Ne olur                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Tezgâh boş                                              | Açık sipariş kapanır; yapay zekâ çağrılmaz                       |
| Tepsi kondu (görüntü durulunca)                         | Hemen tanınır → **yeni** sipariş                                 |
| Tepsi duruyor, görüntü değişmedi                        | 3–4 sn'de bir bakılır; çağrı da gönderim de yok                  |
| Görüntü değişti, yemekler aynı (el geçti, ışık değişti) | Bir kez tanınır; POS'a bir şey gitmez                            |
| Yemek eklendi/çıkarıldı                                 | Aynı sipariş numarasıyla **güncelleme** (revizyon + 1)           |
| Tepsi kayıyor                                           | Durulana dek (en çok bir aralık) beklenir                        |
| Boşluktan sonra aynı yemekleri alan yeni müşteri        | **Yeni** sipariş                                                 |
| POS'a ulaşılamadı                                       | Tepsi durdukça her çekimde yeniden denenir; gitmezse kayda düşer |
| Tanıma başarısız (internet, zaman aşımı)                | Hiçbir şey gönderilmez; sonraki çekimde yeniden denenir          |
| Güven düşük, menüde olmayan yemek, model uyarısı        | Adisyon gider, `kontrol_gerekli: true` ve nedenleriyle           |

## POS entegrasyonu

`pos.tur`: `http` (JSON POST), `klasor` (her mesaj bir JSON dosyası; klasör izleyen POS yazılımları için) ya da
`konsol` (fişi ekrana yazar). Mesaj (`sema: yemekhane-kasa/siparis@1`), tutarlar tamsayı **kuruş**:

```json
{
  "sema": "yemekhane-kasa/siparis@1",
  "islem": "yeni",
  "siparis_no": "20261112-123005-001",
  "revizyon": 1,
  "zaman": "2026-11-12T12:30:05+03:00",
  "kasa": "kasa-1",
  "para_birimi": "TRY",
  "kalemler": [
    {
      "menu_id": "kuru_fasulye",
      "ad": "Kuru fasulye",
      "plu": "2001",
      "kategori": "ana_yemek",
      "porsiyon": "tam",
      "adet": 1,
      "birim_fiyat_kurus": 12000,
      "tutar_kurus": 12000,
      "kdv_orani": 10,
      "guven": 0.94
    }
  ],
  "indirimler": [
    { "ad": "Öğle menüsü", "tutar_kurus": 2500, "menu_idler": ["mercimek_corbasi", "kuru_fasulye", "pirinc_pilavi"] }
  ],
  "ara_toplam_kurus": 26000,
  "indirim_toplami_kurus": 2500,
  "toplam_kurus": 23500,
  "toplam_metin": "235,00 TL",
  "kdv": [{ "oran": 10, "matrah_kurus": 21364, "tutar_kurus": 2136 }],
  "kontrol_gerekli": false,
  "kontrol_nedenleri": [],
  "taninmayanlar": [],
  "gorsel": "kayitlar/2026-11-12/20261112-123005-001-r1.jpg"
}
```

(Örnekte kalemlerin yalnız biri gösterildi.) Alıcı tarafın kuralları:

- `islem`: `yeni`, `guncelle` ya da (`kapanis_bildir: true` ise) `kapandi`. Siparişi **`siparis_no`'ya göre
  güncelleyin** (upsert); en yüksek `revizyon` geçerlidir, eskisi geç gelirse yok sayın.
- Her HTTP isteğinde `Idempotency-Key: <siparis_no>/<revizyon>` başlığı vardır; aynı anahtar ikinci kez gelirse
  yok sayın. 2xx başarıdır; ağ hatası, 408/425/429 ve 5xx kısa aralıklarla yeniden denenir, diğer 4xx denenmez.
- `kontrol_gerekli: true` ise kasiyerin onayını isteyin. Ödeme alınmış bir siparişe güncelleme gelirse (müşteri
  ödedikten sonra tepsiye ekleme yaptıysa) uyarı gösterin.
- `pos.surekli_gonder: true`: tepsi durdukça son mesaj her çekimde aynı anahtarla yeniden gelir ("güncel sepet"
  isteyen POS'lar için).

**Yazarkasa POS (ÖKC) kullananlar:** Yeni nesil ödeme kaydedici cihazlar satışı dışarıdan, üreticinin entegrasyon
protokolü (GMP3 ya da cihazın uygulama/REST arayüzü) üzerinden alır. Bu servis `http` ile bir köprü programa ya da
cihazın yerel arayüzüne bağlanır; `plu` ve `kdv_orani` alanları cihazdaki ürün ve KDV grubuna eşlenir. Cihazınızın
markasını ve modelini söylerseniz ona özel adaptör yazılabilir: `gonder(mesaj) -> PosSonucu` yöntemi olan bir sınıf
yeterlidir (bkz. `yemekhane_kasa/pos.py`).

## Model, hız ve maliyet

Varsayılan model **Claude Opus 5.5**, düşük efor (`tanima.efor: low`) ve yapılandırılmış çıktıyla çalışır; güvenlik
sınıflandırıcısının olası yanlış reddine karşı sunucu tarafı yedek model (`fallbacks: "default"`) açıktır
(`tanima.yedek_model: false` ile kapanır). Menü, kurallar ve referans fotoğraflar önbelleğe alınır; her çağrıda
asıl ücretlenen yalnız tepsinin karesidir (1024 px'e küçültülür, ~1.000 girdi token'ı).

Kabaca, Kasım 2026 liste fiyatlarıyla bir tanıma (çıktı ve düşünme ~300 token varsayımıyla):

| Model                          | Bir tanıma | 500 tepsi/gün (~700 tanıma) |
| ------------------------------ | ---------- | --------------------------- |
| `claude-opus-5-5` (varsayılan) | ~1 sent    | ~7–8 $                      |
| `claude-haiku-5-5`             | ~0,03 sent | ~0,2 $                      |

Haiku 5.5 ~40 kat ucuzdur ve daha hızlı yanıt verir; tek satırla seçilir (`tanima.model: claude-haiku-5-5`).
Hangisinin yeterince doğru olduğuna kendi tepsilerinizle `dene` komutunu iki modelle çalıştırarak karar verin.
Gerçek token kullanımı ve süre her tanımada `kayitlar/<gün>/olaylar.jsonl` dosyasına yazılır.

## Gizlilik (KVKK)

- API'ye yalnız **tepsi bölgesi** gönderilir; bölgeyi müşterinin yüzü girmeyecek biçimde ayarlayın.
- Gönderilen siparişlerin tepsi görüntüleri `kayit.saklama_gun` (varsayılan 30) gün sonra silinir;
  `kayit.gorsel_sakla: false` ile hiç saklanmaz.
- Kasada kamera bulunduğunu ve amacını bir aydınlatma metniyle duyurun.

## Sınırlar

- **İnternet gerekir.** Bağlantı yoksa tanıma yapılmaz, POS'a bir şey gitmez; kasiyer elle girer.
- İki müşteri arasında tezgâh **bir an boş görünmelidir**. Tepsiler hiç boşluk olmadan birbirini itiyorsa ve
  yemekleri de aynıysa ikinci tepsi yeni sipariş sayılmaz (yanlışlıkla çift ücretlendirme yerine bu tercih edildi).
- Tepsisiz bırakılan tek küçük ürün (yalnız bir şişe ayran) bölgenin çok küçük bir kısmını kaplar; boş tezgâh
  sanılıyorsa `esikler.bos` değerini düşürün ya da ürünün tepsiyle bırakılmasını isteyin.
- Yarım porsiyon görüntüden tahmin edilir; kaplarınız farklıysa `tarif`e yazın.
- Ekmek, peçete, çatal-bıçak gibi şeyler yok sayılır (menüde `yok_say` listesi); fiyatlanacaksa menüye ekleyin.

## Geliştirme

```bash
pip install -e ".[test]"
pytest
ruff check . && ruff format --check .
```

| Modül        | İş                                                                      |
| ------------ | ----------------------------------------------------------------------- |
| `servis.py`  | Döngü: yoklama, çekim zamanlaması, gönderim, yeniden deneme             |
| `takip.py`   | Boş tezgâh dedektörü ve tepsi durum makinesi (yeni / aynı / güncelleme) |
| `tanima.py`  | Claude isteği, şema, önbellek; sahte tanıyıcı                           |
| `fiyat.py`   | Adisyon: birleştirme, yarım porsiyon, fiks menü, KDV dökümü             |
| `menu.py`    | Menü şeması, doğrulama, dosya izleme                                    |
| `pos.py`     | Mesaj sözleşmesi, HTTP / klasör / konsol adaptörleri                    |
| `kamera.py`  | OpenCV kamera (arka planda son kare), fotoğraf klasörü                  |
| `goruntu.py` | Bölge kırpma, değişim imzası, JPEG                                      |
| `kayit.py`   | Denetim kaydı ve saklama süresi                                         |
| `demo.py`    | Yapay sahnelerle uçtan uca gösterim                                     |
