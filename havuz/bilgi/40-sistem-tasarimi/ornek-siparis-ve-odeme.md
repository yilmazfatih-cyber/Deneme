---
baslik: "Örnek tasarım: sipariş ve ödeme"
ozet: E-ticaret siparişinin uçtan uca tasarımı; sipariş durum makinesi, stok ayırma seçenekleri, webhook ile kesinleştirme, giden kutusu, iade ve değişmez denetimleri; tohumlu benzetimle fazla satış ve kayıp sipariş.
etiketler: [ornek-tasarim, e-ticaret, odeme, stok, durum-makinesi, giden-kutusu]
duzey: ileri
guncellik: 2026-11
---

# Örnek tasarım: sipariş ve ödeme

> Bu notu ne zaman okumalı: sepet, ödeme ve sipariş akışı olan bir ürün tasarlanırken; "stokta olmayan ürün satıldı",
> "müşteri ödedi ama sipariş görünmüyor", "kampanyada 'tükendi' dendi ama ürünler satılmadan kaldı" şikâyetlerinde;
> "stok ne zaman düşmeli?" sorusu sorulduğunda. Sağlayıcıyla konuşmanın ayrıntıları (webhook imzası, ödeme durum
> makinesi, kuruş tutar, mutabakat) [Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md) notundadır; bu not
> siparişi ve stoğu o parçanın çevresine yerleştirir.

Finans, vergi ya da tüketici hukuku danışmanlığı değildir.

## Temel fikir

- Sipariş ile ödeme **iki ayrı durum makinesidir**. Sipariş, ödemeye ancak doğrulanmış webhook (ya da sağlayıcıya
  sorgu) ile bağlanır; "ödeme başarılı" dönüş sayfası yalnız bilgi verir.
- Stok bir sayaç değil bir **sözdür**: "ödemeye geç" anında koşullu ve süreli ayrılır; ödeme gelince kesinleşir,
  gelmezse süre dolunca geri döner. Ayırma süresi ödeme oturumunun süresine göre seçilir.
- Her geçiş koşullu bir `UPDATE`'tir; yan etkileri (stok, giden kutusu olayı) aynı işlemdedir. Yinelenen ve sırasız
  olay zararsızdır.
- Dış çağrı (ödeme oturumu açmak, e-posta, depoya bildirim) hiçbir zaman stok satırını tutan işlemin içinde yapılmaz.
- Her gece **değişmez denetimleri** koşar ("ödendi ama ödeme yok", "ödeme var sipariş bekliyor", "eksi stok"); her
  satır bir alarmdır.

## Gereksinimler

| Tür              | Gereksinim                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| İşlevsel         | Sepet, ödemeye geç, kartla ödeme (sağlayıcının sayfası), sipariş takibi, iptal, kısmi iade          |
| İşlevsel         | Kampanya: tek üründe kısa sürede yoğun talep; "tükendi" doğru gösterilir                            |
| İşlevsel olmayan | Stoktan fazla satış **asla**; ödenen her ödemenin siparişi var ya da iadesi başladı (24 saat içinde) |
| İşlevsel olmayan | Çift tıklama, yinelenen webhook, işçi çökmesi tek sipariş ve tek çekimle sonuçlanır                 |
| Hedef dışı       | Çok depolu stok, taksit hesabı, pazar yeri (çok satıcılı ödeme dağıtımı)                           |

## Kaba hesap

```python calistir
gunluk_siparis, tepe = 2_000, 6  # varsayım: küçük-orta mağaza; akşam ve bildirim sonrası tepe çarpanı
yazma = 12  # sipariş başına: ~8 sepet işlemi + sipariş, satırlar, ödeme, giden kutusu
normal = gunluk_siparis * yazma / 86_400 * tepe
kampanya = 5_000 * 0.4 / 60  # 20:00 bildirimi: 5 bin kişinin %40'ı ilk dakikada AYNI ürüne "ödemeye geç" der
webhook = gunluk_siparis * 3 / 86_400 * tepe  # ödeme başına ~3 olay
print(f"tepede yazma ~{normal:.1f}/sn | kampanyada TEK stok satırına ~{kampanya:.0f} ayırma/sn | webhook ~{webhook:.1f}/sn")
assert normal < 5 and kampanya > 10 * normal
```

```cikti
tepede yazma ~1.7/sn | kampanyada TEK stok satırına ~33 ayırma/sn | webhook ~0.4/sn
```

Olağan yük önemsizdir; tek sunucu ve tek veritabanı yeter. Zor olan **doğruluk** ve kampanyadaki **sıcak satırdır**:
saniyede onlarca ayırma aynı stok satırına yazar. Ayırma işlemi kısa kaldıkça (dış çağrı yok, tek koşullu güncelleme)
bu sorun değildir; işlem içinde 2 saniyelik bir ödeme çağrısı yapılırsa bütün kuyruk o satırda bekler.

## İlk tasarım: tek sunucu

```text
tablolar:     urun(fiyat, stok CHECK ≥ 0) · siparis(durum, toplam, para birimi, ayirma_bitis, idempotentlik anahtarı)
              satir(siparis, urun, adet, birim_fiyat ← sipariş anındaki fiyatın kopyası) · odeme(siparis, saglayici_id,
              tutar, durum) · islenen_olay(olay_id) · iade(odeme, tutar, durum) · giden_kutusu(konu, govde, gonderildi)
ödemeye geç:  TEK işlem: satırları koşullu ayır → fiyatları kopyala → sipariş 'odeme_bekliyor' (ayırma 30 dk)
              işlemden SONRA: sağlayıcıda ödeme oturumu (anahtar = sipariş kimliği), oturum süresi < ayırma süresi
webhook:      imza → olay kimliği → TEK işlem: ödeme 'basarili' + sipariş 'odendi' + giden kutusu (e-posta, fatura, depo)
süre işi:     'odeme_bekliyor' ve süresi dolmuş → sağlayıcıya sor → ödenmemişse 'suresi_doldu' + stok geri
işçiler:      giden kutusunu boşaltır; her tüketici idempotent
her gece:     sağlayıcı mutabakatı + değişmez denetimleri
```

Ayırma, fiyat kopyası ve koşullu geçişin çalışan hâli:

```python calistir
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE urun (id TEXT PRIMARY KEY, fiyat_kurus INTEGER NOT NULL, stok INTEGER NOT NULL CHECK (stok >= 0));
CREATE TABLE siparis (id INTEGER PRIMARY KEY, durum TEXT NOT NULL, toplam_kurus INTEGER NOT NULL, ayirma_bitis REAL);
CREATE TABLE satir (siparis INTEGER, urun TEXT, adet INTEGER, birim_kurus INTEGER);  -- fiyatın anlık kopyası
CREATE TABLE giden_kutusu (id INTEGER PRIMARY KEY, konu TEXT, govde TEXT);
INSERT INTO urun VALUES ('kupa', 25000, 1), ('defter', 4000, 10);
""")
AYIRMA_SN = 30 * 60


def islem(govde):  # govde None dönerse geri al
    db.execute("BEGIN IMMEDIATE")
    try:
        sonuc = govde()
    except BaseException:
        db.execute("ROLLBACK")
        raise
    db.execute("COMMIT" if sonuc is not None else "ROLLBACK")
    return sonuc


def odemeye_gec(sepet: dict[str, int], simdi: float) -> int | None:
    """Bütün satırlar koşullu ayrılır ya da hiçbiri; fiyat siparişe kopyalanır; sipariş 'odeme_bekliyor'."""
    def govde():
        toplam, satirlar = 0, []
        for urun, adet in sorted(sepet.items()):  # sabit sıra: iki sepet birbirini ters sırada kilitlemesin
            fiyat = db.execute("UPDATE urun SET stok = stok - ? WHERE id = ? AND stok >= ? RETURNING fiyat_kurus",
                               (adet, urun, adet)).fetchone()
            if fiyat is None:
                return None  # tükendi: işlem geri alınır, öteki satırların ayırması da düşer
            toplam += fiyat[0] * adet
            satirlar.append((urun, adet, fiyat[0]))
        sid = db.execute("INSERT INTO siparis (durum, toplam_kurus, ayirma_bitis) VALUES ('odeme_bekliyor', ?, ?)",
                         (toplam, simdi + AYIRMA_SN)).lastrowid
        db.executemany("INSERT INTO satir VALUES (?, ?, ?, ?)", [(sid, *s) for s in satirlar])
        return sid
    return islem(govde)


def gec(sid: int, eski: tuple[str, ...], yeni: str, konu: str | None = None) -> bool:
    """Koşullu durum geçişi; stok iadesi ve giden kutusu olayı AYNI işlemde."""
    def govde():
        yer = ",".join("?" * len(eski))
        if db.execute(f"UPDATE siparis SET durum = ? WHERE id = ? AND durum IN ({yer})", (yeni, sid, *eski)).rowcount == 0:
            return None
        if yeni == "suresi_doldu":
            for urun, adet in db.execute("SELECT urun, adet FROM satir WHERE siparis = ?", (sid,)).fetchall():
                db.execute("UPDATE urun SET stok = stok + ? WHERE id = ?", (adet, urun))
        if konu:
            db.execute("INSERT INTO giden_kutusu (konu, govde) VALUES (?, ?)", (konu, json.dumps({"siparis": sid})))
        return True
    return bool(islem(govde))


s1 = odemeye_gec({"kupa": 1, "defter": 2}, simdi=0)
assert s1 and odemeye_gec({"kupa": 1, "defter": 1}, simdi=60) is None  # kupa bitti; defter de ayrılmadı
assert db.execute("SELECT stok FROM urun WHERE id = 'defter'").fetchone() == (8,)
db.execute("UPDATE urun SET fiyat_kurus = 30000 WHERE id = 'kupa'")  # fiyat sonradan değişti
assert db.execute("SELECT toplam_kurus FROM siparis").fetchone() == (33000,)  # sipariş kendi fiyatıyla
assert gec(s1, ("odeme_bekliyor",), "odendi", "siparis_odendi")  # webhook: ödeme kesinleşti
assert not gec(s1, ("odeme_bekliyor",), "suresi_doldu")  # geç kalan süre işi: geçiş yok, stok geri dönmez
assert not gec(s1, ("odeme_bekliyor",), "odendi", "siparis_odendi")  # aynı webhook yine: olay yinelenmez
assert db.execute("SELECT count(*) FROM giden_kutusu").fetchone() == (1,)
print("tükenen satır bütün sepeti geri aldı; fiyat kopyalandı; geç süre işi ve yinelenen webhook etkisiz")
```

```cikti
tükenen satır bütün sepeti geri aldı; fiyat kopyalandı; geç süre işi ve yinelenen webhook etkisiz
```

`CHECK (stok >= 0)` son savunma hattıdır: koşulu unutan bir kod yolu bile stoğu eksiye düşüremez, hata alır.

## Sipariş durum makinesi

```text
odeme_bekliyor ──(webhook: başarılı)──► odendi ──► hazirlaniyor ──► kargoda ──► teslim_edildi
   │   └──(webhook: başarısız ya da kullanıcı vazgeçti)──► iptal (stok geri)      │
   └──(ayırma süresi doldu ve sağlayıcı "ödenmedi" dedi)──► suresi_doldu (stok geri)  └──(iade talebi)──► iade_bekliyor ──► iade_edildi
suresi_doldu ──(geç webhook: başarılı)──► stok yeniden ayrılabilirse odendi, ayrılamazsa iade_bekliyor (otomatik iade + özür)
```

| Geçiş                               | Koşul (önceki durum)              | Aynı işlemdeki yan etki                                |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------ |
| → `odendi`                          | `odeme_bekliyor`                  | Ödeme kaydı `basarili`; giden kutusu: e-posta, fatura, depo |
| → `suresi_doldu`                    | `odeme_bekliyor`                  | Satırların stoğu geri                                  |
| `suresi_doldu` → `odendi`           | Stok yeniden koşullu ayrılabildi  | Giden kutusu olayları                                  |
| `suresi_doldu` → `iade_bekliyor`    | Stok yok                          | İade işi (idempotentlik anahtarıyla); özür e-postası   |
| → `iptal`                           | `odeme_bekliyor`                  | Stok geri; sağlayıcıda oturum iptali giden kutusundan  |
| → `iade_bekliyor`                   | `odendi`, `teslim_edildi`         | İade kaydı; stok **ürün geri gelince** artar           |

Geçişler tek bir tabloda durur; kodda dağınık `if` yoktur. Ödemenin kendi makinesi ve olay işleme:
[Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md); kitaplık: [`kutuphane/py/kutuphane/durum_makinesi.py`](../../kutuphane/py/kutuphane/durum_makinesi.py).

## Karar tablosu: stok ne zaman düşer

| Seçenek                                      | Fazla satış | Ödeyip ürünü alamayan | Satılmadan kalan stok        | Ne zaman                                   |
| -------------------------------------------- | ----------- | --------------------- | ---------------------------- | ------------------------------------------ |
| Sepete eklerken düş                          | Yok         | Yok                   | Çok (sepette unutulan)       | Neredeyse hiçbir zaman                     |
| Ödemede **göster**, onayda koşulsuz düş      | **Var**     | —                     | Az                           | Hiçbir zaman                               |
| Onayda koşullu düş                           | Yok         | Var (iade)            | Az                           | Stok bol, kampanya yok                     |
| Ödemeye geçerken süreli ayır                 | Yok         | Nadir (geç webhook)   | Ayırma süresine bağlı        | Varsayılan                                 |
| Ön sipariş (stok yok sayılır)                | —           | —                     | —                            | Tedarik süreli ürün; müşteriye açıkça yazılır |

## Benzetim: fazla satış, iade, satılmayan stok, kayıp sipariş

İki saatlik kampanya, 20 ürün, 60 alıcı. Alıcıların %35'i ödeme ekranında vazgeçer, %10'unun kartı reddedilir;
ödeme 1–20 dakika sürer; webhook'ların %5'i sağlayıcıda 1–2 saat bekler, %2'si hiç gelmez; ödeyenlerin %20'si
dönüş sayfasını beklemeden sekmeyi kapatır. Tohumlu, 50 koşunun ortalaması:

```python calistir
import heapq
import random

STOK, TOHUMLAR = 20, range(50)


def alicilar(tohum: int, n: int = 60) -> list[dict]:
    rng = random.Random(tohum)
    sonuc = []
    for _ in range(n):
        vazgecmez, kart_gecer = rng.random() > 0.35, rng.random() < 0.9
        sonuc.append({
            "geldi": rng.uniform(0, 120),  # dakika
            "oder": vazgecmez and kart_gecer,
            "sure": rng.uniform(1, 20),  # kart + banka doğrulaması
            "gecikme": rng.uniform(60, 120) if rng.random() < 0.05 else 0.1,  # webhook sağlayıcıda bekledi
            "donmez": rng.random() < 0.2,  # ödedikten sonra sekmeyi kapattı
            "kayip": rng.random() < 0.02,  # webhook hiç gelmedi
        })
    return sonuc


def benzet(alici: list[dict], strateji: str, ttl: float = 0.0) -> dict[str, int]:
    """Olaylar: 0 ödeme ekranı, 1 ödeme webhook'u, 2 ayırma süresi doldu."""
    stok, ayrilan, sayi = STOK, set(), {"satilan": 0, "iade": 0, "tukendi": 0}
    olaylar = [(a["geldi"], 0, i) for i, a in enumerate(alici)]
    heapq.heapify(olaylar)
    while olaylar:
        an, tur, i = heapq.heappop(olaylar)
        a = alici[i]
        if tur == 0:
            if stok <= 0:
                sayi["tukendi"] += 1  # ekranda "tükendi" dendi
                continue
            if strateji == "ayirma":
                stok -= 1
                ayrilan.add(i)
                heapq.heappush(olaylar, (an + ttl, 2, i))
            if a["oder"] and (strateji != "ayirma" or a["sure"] <= ttl):  # ödeme sayfası ayırmayla kapanır
                heapq.heappush(olaylar, (an + a["sure"] + a["gecikme"], 1, i))
        elif tur == 2 and i in ayrilan:
            ayrilan.discard(i)
            stok += 1
        elif tur == 1:
            if i in ayrilan:
                ayrilan.discard(i)
                sayi["satilan"] += 1
            elif strateji == "kosulsuz" or stok > 0:  # koşulsuz düşüm stoğu eksiye götürebilir
                stok -= 1
                sayi["satilan"] += 1
            else:
                sayi["iade"] += 1  # para çekildi, ürün yok
    sayi["fazla"] = max(0, sayi["satilan"] - STOK)
    return sayi


SECENEK = [("onayda koşulsuz düşüm", "kosulsuz", 0), ("onayda koşullu düşüm", "kosullu", 0),
           ("süreli ayırma 10 dk", "ayirma", 10), ("süreli ayırma 30 dk", "ayirma", 30),
           ("süreli ayırma 120 dk", "ayirma", 120)]
ort = {}
for ad, strateji, ttl in SECENEK:
    sonuclar = [benzet(alicilar(tohum), strateji, ttl) for tohum in TOHUMLAR]
    ort[ad] = {k: sum(s[k] for s in sonuclar) / len(sonuclar) for k in sonuclar[0]}
print(f"{'50 koşu ortalaması':22} satılan  fazla  iade  'tükendi' denen")
for ad, s in ort.items():
    print(f"{ad:22} {s['satilan']:7.1f} {s['fazla']:6.1f} {s['iade']:5.1f} {s['tukendi']:8.1f}")
odeyen = [a for t in TOHUMLAR for a in alicilar(t) if a["oder"]]
print(f"ödeyen {len(odeyen)} alıcıdan siparişsiz kalan: dönüş sayfasıyla {sum(a['donmez'] for a in odeyen)},"
      f" webhook ile {sum(a['kayip'] for a in odeyen)}, webhook + günlük mutabakatla 0")
assert ort["onayda koşulsuz düşüm"]["fazla"] > 0 and ort["onayda koşullu düşüm"]["iade"] > 0
assert ort["süreli ayırma 30 dk"]["satilan"] > max(ort["süreli ayırma 10 dk"]["satilan"], ort["süreli ayırma 120 dk"]["satilan"])
```

```cikti
50 koşu ortalaması     satılan  fazla  iade  'tükendi' denen
onayda koşulsuz düşüm     23.6    3.6   0.0     19.3
onayda koşullu düşüm      20.0    0.0   3.6     19.3
süreli ayırma 10 dk       16.1    0.0   0.0      3.2
süreli ayırma 30 dk       19.5    0.0   0.4     27.0
süreli ayırma 120 dk      11.7    0.0   0.0     40.0
ödeyen 1756 alıcıdan siparişsiz kalan: dönüş sayfasıyla 345, webhook ile 44, webhook + günlük mutabakatla 0
```

Okuma:

- **Koşulsuz düşüm** kampanya başına ortalama 3,6 ürün fazla sattı. **Koşullu düşüm** fazla satışı bitirdi ama aynı
  sayıda müşteri parasını ödeyip ürünü alamadı (iade ve özür).
- **10 dakikalık ayırma** yavaş ödeyenin sayfasını kapattı; ürünlerin bir kısmı satılmadan kaldı. **120 dakikalık
  ayırma** vazgeçenlerin stoğu kampanya boyunca kilitlemesine yol açtı: 40 kişiye "tükendi" dendi, ürünlerin yarısı
  satılmadı. **30 dakika** (ödeme süresinin üst ucu + pay) dengeli; kalan 0,4 iade, süresi dolan ayırmanın geç gelen
  webhook'udur.
- Dönüş sayfasıyla kesinleştirmek ödeyenlerin ~%20'sini siparişsiz bırakır; webhook %2,5'e indirir; günlük mutabakat
  sıfırlar.
- Varsayımlar (vazgeçme oranı, ödeme süresi, geç webhook oranı) uydurmadır; kendi ölçümlerinizi koyun. Yöntem aynı
  kalır: seçeneği kendi dağılımınızla benzetip karar verin.

## Geç gelen ödeme

- Ödeme oturumunun süresi ayırma süresinden **kısa** olmalı (ör. oturum 25 dk, ayırma 30 dk); böylece kullanıcı
  ayırması düşmüş bir siparişi ödeyemez.
- Süre işi ayırmayı bırakmadan önce sağlayıcıya sorar: "bu sipariş için ödeme sürüyor ya da başarılı mı?" Sürüyorsa
  ayırmayı kısa bir süre daha uzatır; benzetimdeki son iadeler böyle sıfırlanır.
- Yine de `suresi_doldu` sonrası başarılı webhook gelirse: stok varsa sipariş canlanır, yoksa otomatik iade başlar ve
  kullanıcıya açıkça yazılır ("Ödemeniz ulaştığında ürün tükenmişti; ödemeniz iade edildi.").

## İade

- İade talebi kendi kaydıdır ve kendi idempotentlik anahtarını taşır; iade toplamı ödenen tutarı aşamaz (kısıt ya da
  koşullu güncelleme). Ayrıntı: [Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md) → iade ve itiraz.
- Stok, iade **onayıyla** değil ürün depoya **geri gelince** artar (hasarlı ya da eksik dönebilir).
- Kısmi iade satır bazındadır; kupon ve kargo ücretinin satırlara dağıtımı işletme kuralıdır ve bir kez yazılır
  (kuruş tamsayı dağıtım: [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py)).

## Değişmez denetimleri

Sağlayıcı mutabakatı (kendi kayıtlarınız ile sağlayıcının raporu) ödeme notundadır. Sipariş tarafında da her gece
"olamaz" dediğiniz durumları sorgulayın; her satır bir alarmdır, sıfır satır beklenir:

```sql calistir
CREATE TABLE urun (id TEXT PRIMARY KEY, stok INTEGER NOT NULL);  -- gerçekte CHECK (stok >= 0) da olur
CREATE TABLE siparis (id TEXT PRIMARY KEY, durum TEXT NOT NULL, toplam_kurus INTEGER NOT NULL);
CREATE TABLE odeme (id TEXT PRIMARY KEY, siparis TEXT NOT NULL, tutar_kurus INTEGER NOT NULL, durum TEXT NOT NULL);
CREATE TABLE iade (id TEXT PRIMARY KEY, odeme TEXT NOT NULL, tutar_kurus INTEGER NOT NULL);
CREATE TABLE giden_kutusu (id INTEGER PRIMARY KEY, konu TEXT NOT NULL, olusturma TEXT NOT NULL, gonderildi INTEGER NOT NULL);
INSERT INTO urun VALUES ('kupa', -1), ('defter', 4);
INSERT INTO siparis VALUES ('s1', 'odendi', 15000), ('s2', 'odendi', 9900), ('s3', 'odeme_bekliyor', 5000), ('s4', 'odendi', 4000);
INSERT INTO odeme VALUES ('o1', 's1', 15000, 'basarili'), ('o3', 's3', 5000, 'basarili'), ('o4', 's4', 3000, 'basarili');
INSERT INTO iade VALUES ('i1', 'o1', 10000), ('i2', 'o1', 8000);
INSERT INTO giden_kutusu VALUES (1, 'siparis_odendi', '2026-11-23T10:00:00Z', 0), (2, 'siparis_odendi', '2026-11-23T10:39:00Z', 0);
SELECT 'ödendi ama başarılı ödeme yok', id FROM siparis s
 WHERE durum = 'odendi' AND NOT EXISTS (SELECT 1 FROM odeme WHERE siparis = s.id AND durum = 'basarili');
SELECT 'ödeme başarılı, sipariş bekliyor (kayıp sipariş)', s.id FROM siparis s
  JOIN odeme o ON o.siparis = s.id AND o.durum = 'basarili' WHERE s.durum IN ('odeme_bekliyor', 'suresi_doldu');
SELECT 'tutar uyuşmuyor', s.id FROM siparis s
  JOIN odeme o ON o.siparis = s.id AND o.durum = 'basarili' WHERE o.tutar_kurus <> s.toplam_kurus;
SELECT 'eksi stok', id FROM urun WHERE stok < 0;
SELECT 'iade ödemeyi aşıyor', o.id FROM odeme o JOIN iade i ON i.odeme = o.id
 GROUP BY o.id, o.tutar_kurus HAVING sum(i.tutar_kurus) > o.tutar_kurus;
SELECT 'giden kutusu 10 dakikadır takılı', id FROM giden_kutusu  -- "şimdi" 10:40
 WHERE gonderildi = 0 AND olusturma < strftime('%Y-%m-%dT%H:%M:%SZ', '2026-11-23T10:40:00Z', '-10 minutes');
```

```cikti
ödendi ama başarılı ödeme yok|s2
ödeme başarılı, sipariş bekliyor (kayıp sipariş)|s3
tutar uyuşmuyor|s4
eksi stok|kupa
iade ödemeyi aşıyor|o1
giden kutusu 10 dakikadır takılı|1
```

- Denetim **düzeltmez**, gösterir: her ihlal bir insanın bakacağı kayıttır. Kendiliğinden düzelten iş, hatanın
  nedenini gizler.
- "Ödeme başarılı, sipariş bekliyor" satırı müşterinin parasını almış ama ürününü göndermiyor olmanızdır: en yüksek
  öncelik. Olay işleme hatası ya da kaybolan webhook; mutabakat ile birlikte okuyun.

## Büyüyünce ne değişir

| Eşik                                               | Değişiklik                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Kampanyada tek ürün satırı kilit beklemesi yaratıyor | Bekleme odası (sıraya al, saniyede N kişiyi ödemeye geçir); stoğu birkaç kovaya bölüp koşullu düşme |
| Birden çok depo                                    | Depo başına stok; ayırma depoyu da seçer; bölünmüş gönderi siparişin alt durumları olur      |
| Birden çok ödeme sağlayıcısı                       | Ödeme kaydında sağlayıcı alanı; mutabakat sağlayıcı başına; webhook ucu sağlayıcı başına      |
| Muhasebe kesin iz istiyor                          | Stok ve para için hareket defteri (her değişiklik bir satır); bakiye defterden türetilir     |
| Sipariş sayısı veritabanını zorluyor               | Biten siparişleri arşiv tablosuna; okuma kopyası raporlar için ([Veritabanı ölçekleme](veritabani-olcekleme.md)) |

## Tuzaklar

| Belirti                                                       | Neden                                                     | Çözüm                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Stoktan fazla sipariş kesinleşti                              | Stok ödeme ekranında gösterildi, onayda koşulsuz düşüldü  | Koşullu ayırma; `CHECK (stok >= 0)`                           |
| Müşteri ödedi, ürün tükenmiş                                   | Onayda koşullu düşüm; ayırma yok                          | Ödemeye geçerken süreli ayırma                                |
| Kampanyada "tükendi" dendi, akşam ürünler satılmadan kaldı     | Ayırma süresi çok uzun; vazgeçenler stoğu kilitledi       | Ayırma = ödeme oturumu + pay; vazgeçmeyi ölç                  |
| Yavaş ödeyenler "süreniz doldu" görüyor                        | Ayırma süresi ödeme süresinden kısa                       | Ödeme süresi dağılımını ölçüp ayırmayı ona göre seçin         |
| Müşteri ödedi, sipariş "bekliyor"da kaldı                      | Kesinleştirme dönüş sayfasında; ya da webhook kayboldu    | Webhook + süre işinde sağlayıcı sorgusu + mutabakat           |
| Geç webhook'tan sonra aynı ürün iki kişiye gitti               | Süresi dolan siparişe koşulsuz `odendi` yazıldı           | `suresi_doldu` → `odendi` yalnız stok yeniden ayrılırsa       |
| Fiyat değişince eski siparişlerin tutarı değişti               | Satır canlı fiyatı okuyor                                 | Fiyatın sipariş anındaki kopyası                              |
| Kampanyada ödeme ekranı dakikalarca dönüyor                    | Ayırma işleminin içinde sağlayıcı çağrısı                  | Dış çağrı işlemden sonra; işlem kısa                          |
| İki sepet karşılıklı bekleyip zaman aşımına düştü              | Satırlar farklı sırayla kilitlendi                        | Ürünleri sabit sırayla ayırın                                 |
| İade edilen ürün stoğa hemen döndü, hasarlıydı                 | Stok iade onayıyla artırıldı                              | Stok ürün depoya gelince artar                                |
| Aynı webhook iki fatura kesti                                  | Geçiş koşulsuz; olay yan etkiyle ayrı işlemde             | Koşullu geçiş + aynı işlemde giden kutusu                     |

## Denetim listesi

- [ ] Ayırma tek işlemde, satırlar sabit sırayla, koşullu güncellemeyle; tükenen satır bütün sepeti geri alıyor.
- [ ] `stok` sütununda `CHECK (stok >= 0)` var.
- [ ] Satırlar fiyatın sipariş anındaki kopyasını taşıyor.
- [ ] Ayırma süresi ölçülmüş ödeme süresine göre seçildi; ödeme oturumu ayırmadan kısa.
- [ ] Sipariş yalnız doğrulanmış webhook ya da sağlayıcı sorgusuyla `odendi` oluyor; dönüş sayfası yalnız bilgi.
- [ ] Süre işi ayırmayı bırakmadan önce sağlayıcıya soruyor; geç webhook akışı (canlandır ya da iade) yazılı ve testli.
- [ ] Her geçiş koşullu ve yan etkisiyle aynı işlemde; e-posta, fatura, depo bildirimi giden kutusundan.
- [ ] Hiçbir işlem içinde dış çağrı yok.
- [ ] Değişmez denetimleri ve sağlayıcı mutabakatı her gece koşuyor; her ihlal uyarı.
- [ ] Fazla satış, iade, satılmayan stok ve kayıp sipariş sayıları panoda.

## Küçük modele yaptırırken

- **İsteme yazın:** "Ödemeye geçişi tek işlemde yaz: sepet satırlarını sabit sırayla `UPDATE urun SET stok = stok - ?
  WHERE id = ? AND stok >= ?` ile ayır; biri tutmazsa bütün işlemi geri al. Fiyatı satıra kopyala. Ödeme oturumunu
  işlemden sonra, sipariş kimliğini idempotentlik anahtarı yaparak aç. Sipariş geçişlerini şu tabloya göre koşullu
  `UPDATE` ile yap; yan etkileri giden kutusuna aynı işlemde yaz. Şu testleri yaz: tükenen satır, yinelenen webhook,
  süresi dolmuş siparişe geç webhook, fiyat değişimi."
- **Modelin tipik hatası:** stoğu `SELECT` ile okuyup sonra `UPDATE stok = ?` yazar (yarış); siparişi dönüş sayfasında
  `odendi` yapar; ödeme sağlayıcısını işlemin içinde çağırır; satırda canlı fiyatı okur; süre işinde ödeme durumunu
  sormadan stoğu bırakır; iadede stoğu hemen artırır.
- **Çıktıda arayın:** `stok = ?` biçimindeki mutlak yazma; işlem bloğu içinde `fetch`/`requests`/`httpx`; `return_url`
  işleyicisinde durum güncellemesi; geçişlerde `AND durum IN (…)` koşulu.
- **Test isteyin:** yukarıdaki dört test + "değişmez denetimleri temiz veride boş döner".

## İlgili

- [Ödeme tümleştirme](../30-arkauc/odeme-tumlestirme.md) (ödeme makinesi, webhook, mutabakat) ·
  [Webhooklar](../30-arkauc/webhooklar.md) · [Dış API istemcisi](../30-arkauc/dis-api-istemcisi.md) (ödeme oturumu
  çağrısı, idempotentlik anahtarı)
- [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (giden kutusu) · [Kalıcı iş kuyruğu](../30-arkauc/kalici-is-kuyrugu.md)
  (süre işi, iade işi) · [İşlemler ve eşzamanlılık](../30-arkauc/islemler-ve-eszamanlilik.md)
- [Randevu sistemi örneği](ornek-randevu-sistemi.md) (aynı süreli tutma fikri, kontenjan yerine dilim) ·
  [Kapasite tahmini](kapasite-tahmini.md)
- Havuzda: [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py),
  [`kutuphane/py/kutuphane/durum_makinesi.py`](../../kutuphane/py/kutuphane/durum_makinesi.py)
