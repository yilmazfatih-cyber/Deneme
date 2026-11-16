---
baslik: Yapay zekâ özellikli uygulamada güvenlik
ozet: Dil modelini güvenilmez bileşen saymak; aracın kullanıcının yetkisiyle çalışması, özel veri + güvenilmez içerik + dış kanal üçlüsü, model çıktısının dönüştüğü klasik açıklar ve model dosyası riskleri.
etiketler: [guvenlik, llm, istem-enjeksiyonu, ajan, yetki, kisisel-veri]
duzey: orta
guncellik: 2026-11
---

# Yapay zekâ özellikli uygulamada güvenlik

> Bu notu ne zaman okumalı: var olan bir uygulamaya sohbet, özetleme, "belgeye sor", e-posta asistanı ya da araç
> kullanan ajan eklenirken; model veritabanına, dosyalara, e-postaya, web'e erişecekken; bir model dosyası ya da
> MCP sunucusu indirilirken. İstem enjeksiyonunun kendisi, çıktı süzgeçleri ve maskeleme ayrıntısı:
> [Dil modeli uygulamalarında güvenlik](../85-llm/llm-guvenligi.md); bu not uygulama güvenliği tarafıdır.

## Temel fikir

Modeli uygulamanın içinde **güvenilmez bir kullanıcı** gibi düşünün: ne yazacağını kesin bilemezsiniz ve
bağlamına metin koyabilen herkes (kullanıcı, belge yazarı, web sayfası, e-posta gönderen) onu yönlendirmeyi
deneyebilir. İstem enjeksiyonunun tam çözümü yoktur; bu yüzden güvenlik **istemle değil mimariyle** kurulur:

1. **Model ne yapabilir?** Yalnız kullanıcının zaten yapabildiğini, yalnız gereken araçlarla, dünyayı
   değiştirenlerde insan onayıyla.
2. **Model çıktısı nereye gidiyor?** Her çıktı dış girdi gibi doğrulanır; gittiği yerin klasik açığı (XSS, SQL,
   SSRF, yol geçişi, toplu atama) ayrıca kapatılır.
3. **Model neyi görüyor ve nereye gönderiyor?** Sırlar bağlama girmez; kişisel veri en aza iner; veri dışarı
   çıkabilecek kanallar sayılır.

Uygulamanın mevcut tehdit modeline yeni bir satır eklenir: "model çıktısı ve modelin okuduğu içerik = giriş
noktası" ([Tehdit modelleme](tehdit-modelleme.md)).

## Karar tablosu

| Özellik                                         | Risk düzeyi | Gereken                                                               |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| Kullanıcının kendi metnini özetleme/çevirme     | Düşük       | Çıktı kaçışı; kişisel veri maskeleme; boyut ve hız sınırı             |
| Kullanıcının kendi belgelerine soru (RAG)       | Orta        | Getirmede yetki süzgeci; dolaylı enjeksiyon uyarısı; kaynak gösterme  |
| Salt okuma araçları (kendi verisini sorgulama)  | Orta        | Araç oturumla kurulur; salt okunur bağlantı; satır ve süre sınırı      |
| Dışarıdan içerik okuma (web, gelen e-posta)     | Yüksek      | Bu içerik varken dış kanal ya kapalı ya da onaylı                     |
| Dünyayı değiştiren araç (gönder, öde, sil)      | Yüksek      | Her çağrıda insan onayı; onay özeti koddan; argüman kuralları         |
| Model kod/komut çalıştırıyor                    | En yüksek   | Ağsız, sırsız, kaynak sınırlı korumalı alan + onay; çoğu zaman gereksiz |

## Araç kullanıcının yetkisiyle çalışır

En sık yapılan mimari hata: araç, **kimin adına** çalıştığını modelin verdiği argümandan öğrenir. SQL parametreli
olsa bile model (ya da modeli yönlendiren belge) başka bir kullanıcı kimliği yazar ve araç sorgusuz uygular. Bu,
"karışık vekil" (confused deputy) hatasıdır: yetkili olan uygulama, yetkisiz birinin isteğini kendi yetkisiyle
yapar. Doğrusu: araçlar **oturumdan kurulur**; kimlik ve kiracı argüman değildir.

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE fatura (id INTEGER PRIMARY KEY, kullanici TEXT NOT NULL, aciklama TEXT, tutar_kurus INTEGER);
INSERT INTO fatura VALUES (1, 'ayse', 'Kasım faturası', 125000), (2, 'mehmet', 'Gizli proje', 990000);
""")


# YANLIŞ: kimlik modelin argümanından geliyor
def fatura_getir_yanlis(kullanici: str, fatura_id: int) -> str:
    sorgu = "SELECT aciklama FROM fatura WHERE id = ? AND kullanici = ?"
    satir = db.execute(sorgu, (fatura_id, kullanici)).fetchone()
    return satir[0] if satir else "bulunamadı"


# Ayşe'nin yüklediği belgedeki gizli satırı izleyen modelin ürettiği çağrı:
cagri = {"ad": "fatura_getir", "argumanlar": {"kullanici": "mehmet", "fatura_id": 2}}
assert fatura_getir_yanlis(**cagri["argumanlar"]) == "Gizli proje"  # parametreli SQL, yine de sızdı


# DOĞRU: araçlar oturumla kurulur; model yalnız işin argümanını verir
def araclari_kur(oturum: dict) -> dict:
    def fatura_getir(fatura_id: int) -> str:
        sorgu = "SELECT aciklama FROM fatura WHERE id = ? AND kullanici = ?"
        satir = db.execute(sorgu, (fatura_id, oturum["kullanici"])).fetchone()
        return satir[0] if satir else "bulunamadı"

    return {"fatura_getir": fatura_getir}


def cagir(araclar: dict, cagri: dict) -> str:
    islev = araclar.get(cagri["ad"])
    if islev is None:
        return "böyle bir araç yok"
    try:
        return islev(**cagri["argumanlar"])
    except TypeError:
        return "geçersiz argüman"  # şemada olmayan 'kullanici' argümanı reddedilir


araclar = araclari_kur({"kullanici": "ayse"})
# TEST: aynı saldırı çağrısı doğru tasarımda işe yaramaz
assert cagir(araclar, cagri) == "geçersiz argüman"
assert cagir(araclar, {"ad": "fatura_getir", "argumanlar": {"fatura_id": 2}}) == "bulunamadı"
assert cagir(araclar, {"ad": "fatura_getir", "argumanlar": {"fatura_id": 1}}) == "Kasım faturası"
print("tamam")
```

```cikti
tamam
```

Aynı ilke RAG'da: yetki **getirme anında** uygulanır (kiracı süzgeci sorgunun içinde), "şu belgeleri gösterme"
istemi koruma değildir ([Yetkilendirme](../30-arkauc/yetkilendirme.md)). Önbellek ve konuşma belleğinin anahtarı
kullanıcı/kiracıyı içerir; yoksa bir kullanıcının yanıtı ötekine gider.

## Özel veri + güvenilmez içerik + dış kanal

Üçü aynı ajanda birleşince dolaylı enjeksiyon **veri sızdırmaya** dönüşür: model özel veriyi okur, güvenilmez
içerikteki talimatı izler, dış kanaldan (e-posta, web isteği, arayüzde dış görsel) gönderir. Bu üçlüyü ajan
yapılandırmasında kural testiyle yakalamak, istemle önlemeye çalışmaktan sağlamdır:

```python calistir
from dataclasses import dataclass


@dataclass(frozen=True)
class Arac:
    ad: str
    ozel_veri_okur: bool = False  # kullanıcının ya da şirketin verisi
    guvenilmez_icerik_okur: bool = False  # web, gelen e-posta, yüklenen belge, başkasının yazdığı metin
    disari_gonderir: bool = False  # e-posta, web isteği, webhook; arayüzde dış görsel/bağlantı gösterimi de
    onayli: bool = False  # her çağrıda insan onayı


def ucluyu_denetle(ajan: str, araclar: list[Arac]) -> list[str]:
    ozel = any(a.ozel_veri_okur for a in araclar)
    guvenilmez = any(a.guvenilmez_icerik_okur for a in araclar)
    kanallar = [a.ad for a in araclar if a.disari_gonderir and not a.onayli]
    if ozel and guvenilmez and kanallar:
        return [f"{ajan}: özel veri + güvenilmez içerik + onaysız dış kanal ({', '.join(kanallar)})"]
    return []


gelen_kutusu = Arac("gelen_kutusu_oku", ozel_veri_okur=True, guvenilmez_icerik_okur=True)
for sorun in ucluyu_denetle("eposta-asistani", [gelen_kutusu, Arac("eposta_gonder", disari_gonderir=True)]):
    print(sorun)
# Düzeltme 1: gönderim her seferinde onaylı
assert ucluyu_denetle("eposta-asistani", [gelen_kutusu, Arac("eposta_gonder", disari_gonderir=True, onayli=True)]) == []
# Düzeltme 2: ajan göndermez, yalnız taslak kaydeder
assert ucluyu_denetle("taslakci", [gelen_kutusu, Arac("taslak_kaydet")]) == []
```

```cikti
eposta-asistani: özel veri + güvenilmez içerik + onaysız dış kanal (eposta_gonder)
```

Onay ekranı modelin özetini değil, **kodun argümanlardan ürettiği** özeti gösterir ("ali@ornek.com adresine,
3 ekli, şu konuyla"). Havuzda: tehlikeli araç onay kancası olmadan çalışmaz
([`yz/yz/arac/kutu.py`](../../yz/yz/arac/kutu.py)), onay kancaları [`yz/yz/ajan/onay.py`](../../yz/yz/ajan/onay.py),
ada göre izin listesi [`yz/yz/guvenlik/izin.py`](../../yz/yz/guvenlik/izin.py); MCP üzerinden tehlikeli araç
yayımlanmaz ([`yz/docs/MCP.md`](../../yz/docs/MCP.md)).

## Model çıktısı hangi klasik açığa dönüşür

| Çıktı nereye gidiyor                     | Klasik açık                       | Önlem                                                                 | Not                                             |
| ---------------------------------------- | --------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Sayfaya basılıyor (Markdown/HTML)        | XSS; dış görselle veri sızdırma   | Düz metin ya da güvenli işleyici + temizleyici; dış görsel izin listesi | [XSS ve CSP](xss-ve-csp.md), [LLM güvenliği](../85-llm/llm-guvenligi.md) |
| SQL olarak çalıştırılıyor                | SQL enjeksiyonu, veri silme       | Salt okunur bağlantı + yetkilendirici; tablo izin listesi              | [Enjeksiyon](enjeksiyon.md), [`sqlite.py`](../../yz/yz/arac/hazir/sqlite.py) |
| Adres olarak isteniyor ("sayfayı getir") | SSRF                              | `adres_denetle`: şema, kapı, çözülen IP; yönlendirme yok               | [SSRF](ssrf-ve-dis-istekler.md)                  |
| Dosya yolu olarak kullanılıyor           | Yol geçişi, gizli dosya okuma     | Kök klasöre hapis, `resolve` + `is_relative_to`, gizli dosya reddi     | [Dosya yükleme](dosya-yukleme-guvenligi.md), [`dosya.py`](../../yz/yz/arac/hazir/dosya.py) |
| Kabuk komutu ya da kod                   | Komut çalıştırma                  | Hiç ya da ağsız/sırsız korumalı alan + onay                            | [Enjeksiyon](enjeksiyon.md)                      |
| JSON kayda yazılıyor                     | Toplu atama (`"rol": "yonetici"`) | Şema + alan izin listesi; sunucu alanları modelden okunmaz             | [Erişim açıkları](erisim-denetimi-aciklari.md)   |
| E-posta/ileti olarak gidiyor             | Oltalama, sızdırma                | Alıcı izin listesi, onay, dış bağlantı süzgeci                         | yukarıdaki üçlü                                  |
| Başka bir modelin/ajanın girdisi         | Enjeksiyon zincirde yayılır       | Ara çıktılar da şemayla doğrulanır                                     | [Görev bölme](../85-llm/gorev-bolme-ve-zincirler.md) |

## Kişisel veri, sırlar ve günlük

- **Sırlar bağlama girmez:** API anahtarı, veritabanı parolası, iç adres sistem istemine yazılmaz; sistem istemi
  sızabilir. Araç kimlik bilgisini kodda tutar, model yalnız sonucu görür.
- **Kişisel veri:** dış modele göndermeden önce maskeleyin, yanıtı geri açın
  ([`yz/yz/guvenlik/maske.py`](../../yz/yz/guvenlik/maske.py)); gerekiyorsa yerel model. Sağlayıcıya giden veri bir
  aktarımdır: envantere yazılır ([KVKK pratiği](kvkk-pratik.md)).
- **Kullanıcı verisiyle ince ayar:** model eğitim verisini ezberleyip başkasına yazabilir; kişisel veriyi önceden
  temizleyin, hukuki dayanağı yazın.
- **Günlük ve denetim:** her araç çağrısı (ad, maskelenmiş argümanlar, onay kararı, kullanıcı) denetim izine;
  istem ve yanıt günlüğe maskelenerek ve kısa süreyle ([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)).
- **Kötüye kullanım ve maliyet:** kullanıcı başına hız sınırı ve günlük bütçe, girdi uzunluğu sınırı, ajan adım
  sınırı ve süre sınırı ([Ajanlar ve araçlar](../85-llm/ajanlar-ve-araclar.md)).

## Model dosyaları ve araç sunucuları: tedarik zinciri

| Bileşen                                   | Risk                                                        | Önlem                                                                  |
| ----------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Model ağırlıkları (`.pt`, `.bin`, `.pkl`) | Pickle tabanlı dosya **yüklenirken kod çalıştırır** ([Seri çözme](guvensiz-seri-cozme.md)) | `safetensors`; PyTorch'ta `weights_only=True` (havuz: [`model_io.py`](../../dil-modeli/dil_modeli/model_io.py)) |
| "Uzak kodu çalıştır" ayarları (`trust_remote_code`) | Model deposundaki Python kodu sizin makinenizde çalışır | Yalnız incelenmiş depo, sabitlenmiş sürüm (commit)                   |
| MCP sunucusu, eklenti, araç paketi        | Ajanın eriştiği her şeye erişen üçüncü taraf kod            | Bağımlılık gibi değerlendirin, sürüm sabitleyin, en dar izin ([Tedarik zinciri](tedarik-zinciri.md), [Araç protokolleri](../85-llm/arac-protokolleri-ve-mcp.md)) |
| Uzaktan çekilen istem şablonu             | Şablonu değiştiren, uygulamanın davranışını değiştirir      | Şablonlar depoda ve sürümlü                                            |

## Tuzaklar

| Belirti                                                         | Neden                                                      | Çözüm                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Asistan başka kullanıcının kaydını getirdi                      | Araç kimliği modelin argümanından aldı                     | Araçları oturumla kurun; kimlik argüman olmasın                     |
| Belgedeki gizli satır asistana e-posta gönderttirdi             | Özel veri + güvenilmez içerik + onaysız dış kanal          | Üçlü kural testi; gönderim onaylı ya da taslak                      |
| "Sistem istemine 'asla paylaşma' yazdık" ama paylaştı           | İstem güvenlik sınırı değildir                             | Yetkiyi kodda daraltın                                              |
| Yanıttaki görsel bağlantısı kullanıcı verisini dışarı taşıdı     | Arayüz dış görseli otomatik yükledi                        | Dış görsel izin listesi ([LLM güvenliği](../85-llm/llm-guvenligi.md)) |
| Ajanın sorgu aracı tablo sildi                                  | Yazma yetkili bağlantı                                     | Salt okunur bağlantı + yetkilendirici                               |
| Model "sayfa getir" aracıyla iç ağ adresini okudu               | Araçta SSRF denetimi yok                                   | `adres_denetle`                                                     |
| İndirilen model dosyası açılınca beklenmedik süreç başladı      | Pickle tabanlı ağırlık                                     | `safetensors`; `weights_only=True`                                  |
| Fatura birden yükseldi                                          | Kullanıcı başına bütçe ve adım sınırı yok                  | Hız sınırı, günlük bütçe, adım ve süre sınırı                       |
| Bir kullanıcının sohbet yanıtı başkasına gösterildi              | Önbellek anahtarında kullanıcı/kiracı yok                  | Anahtara kullanıcı ve kiracı                                        |

## Denetim listesi

- [ ] Tehdit modelinde model çıktısı, modelin okuduğu içerik ve her araç ayrı giriş noktası olarak yazılı.
- [ ] Araçlar oturumla kuruluyor; kimlik/kiracı argüman değil; araç kullanıcının yapamadığı hiçbir şeyi yapamıyor.
- [ ] Ajan yapılandırmasında "özel veri + güvenilmez içerik + onaysız dış kanal" kural testi var.
- [ ] Dünyayı değiştiren araçlar onaysız çalışmıyor; onay özeti koddan üretiliyor.
- [ ] Model çıktısının gittiği her yerde ilgili klasik önlem var (kaçış, salt okunur SQL, SSRF denetimi, yol
      denetimi, alan izin listesi).
- [ ] Sistem isteminde sır yok; kişisel veri dış modele maskelenerek gidiyor; sağlayıcı envanterde.
- [ ] Araç çağrıları denetim izinde; kullanıcı başına hız sınırı ve bütçe var.
- [ ] Model dosyaları `safetensors` ya da güvenli yükleme kipiyle; `trust_remote_code` yok ya da sabitlenmiş sürüm.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni araç ekliyorsan `araclari_kur(oturum)` kalıbını kullan: kullanıcı ve kiracı oturumdan
  gelir, araç şemasında yer almaz. Araç dünyayı değiştiriyorsa `tehlikeli=True` yap. Aracın girdisi adres, dosya
  yolu ya da SQL ise ilgili denetimi (adres_denetle, guvenli_yol, salt okunur bağlantı) çağır."
- **Modelin tipik hatası:** araca `user_id` argümanı eklemek; "güvenlik için" sistem istemine yasak listesi yazıp
  kodda denetim yapmamak; model çıktısını `innerHTML` ile basmak; ajan aracına tam yetkili veritabanı bağlantısı
  vermek; `torch.load` ile güvenilmeyen dosya açmak.
- **Çıktıda denetleyin:** araç şemalarında `user`, `kullanici`, `tenant`, `owner` argümanları; `tehlikeli` işaretsiz
  gönderim/silme araçları; `trust_remote_code=True`; sistem isteminde anahtar ya da iç adres.
- **Test isteyin:** "model başka kullanıcının kimliğiyle çağrı üretirse araç reddeder" testi; üçlü kural testi;
  araç girdisine `../`, `http://127.1/`, `DROP TABLE` verilince reddedildiğini gösteren testler.

## İlgili

- Enjeksiyon, çıktı süzgeçleri, maskeleme: [Dil modeli uygulamalarında güvenlik](../85-llm/llm-guvenligi.md) ·
  ajan döngüsü ve onay: [Ajanlar ve araçlar](../85-llm/ajanlar-ve-araclar.md)
- Çalışan kod: [`yz/yz/guvenlik/`](../../yz/yz/guvenlik/izin.py) (izin listesi, maskeleme, süzgeçler),
  [`yz/yz/arac/hazir/sqlite.py`](../../yz/yz/arac/hazir/sqlite.py) (motor düzeyinde salt okuma),
  [`yz/yz/arac/hazir/dosya.py`](../../yz/yz/arac/hazir/dosya.py) (kök klasöre hapis)
- [Tehdit modelleme](tehdit-modelleme.md) · [Erişim açıkları](erisim-denetimi-aciklari.md) · [SSRF](ssrf-ve-dis-istekler.md)
