---
baslik: Tehdit modelleme: küçük bir uygulama için 30 dakika
ozet: Varlıkları, giriş noktalarını ve güven sınırlarını çıkarıp STRIDE sorularıyla önlem ve testi olan bir tehdit listesi yapmak; havuzdaki uygulama temeli için doldurulmuş örnek.
etiketler: [guvenlik, tehdit-modeli, stride, tasarim]
duzey: orta
guncellik: 2026-11
---

# Tehdit modelleme: küçük bir uygulama için 30 dakika

> Bu notu ne zaman okumalı: yeni bir özellik giriş, ödeme, dosya yükleme, dış adrese istek, paylaşım, yönetici
> paneli ya da yapay zekâ aracı ekliyorsa; yayından önce; bir modele "bu güvenli mi?" diye sormadan önce (soru bu
> notla somutlaşır).

## Temel fikir

Tehdit modeli dört soruya verilmiş yazılı cevaptır:

1. **Ne yapıyoruz?** Bileşenler, veri akışı ve güven sınırları (kaba bir çizim yeter).
2. **Ne ters gidebilir?** Her sınır geçişinde STRIDE soruları.
3. **Ne yapacağız?** Her tehdide bir karar: önle, azalt, bilerek kabul et (gerekçesiyle) ya da aktar.
4. **İyi yaptık mı?** Her "önlendi" satırının bir testi var; model kodla birlikte güncelleniyor.

Çıktı bir belge değil, **satırlardır**: "şu giriş noktasında şu tehdit → şu önlem (dosya) → şu test". 30 dakikada
çıkan 12 satır, hiç yapılmamış kusursuz modelden iyidir. Model, saldırganı değil **sınırları** düşünmekle başlar:
güvenlik hatalarının çoğu verinin güven düzeyinin değiştiği yerde, birinin "bu zaten doğrulanmıştır" sandığı
noktada çıkar.

## Karar tablosu: ne zaman, ne kadar

| Durum                                                                    | Ne kadar                         | Neden                                        |
| ------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------- |
| Metin, renk, yerleşim değişikliği                                        | Gerek yok                        | Güven sınırı değişmiyor                      |
| Var olan kalıpla yeni uç (aynı yetki modeli, CRUD)                       | 5 dk: yalnız **E** ve **I** soruları | En sık hata yetki unutmak ve veri sızdırmak |
| Yeni giriş noktası türü: dosya, webhook, dış URL, e-posta alma, YZ aracı | 30 dk tam tur                    | Yeni sınır, yeni saldırı türü getirir        |
| Kimlik, oturum, ödeme ya da rol modeli değişiyor                         | 30 dk + ikinci bir göz           | Hata pahalı ve sessizdir                     |
| Yayından önce; sonra yılda bir                                           | Bütün sistem turu                | Küçük değişiklikler birikip modeli eskitir   |

## 30 dakikalık akış

| Süre  | Adım             | Çıktı                                                                                    |
| ----- | ---------------- | ---------------------------------------------------------------------------------------- |
| 5 dk  | Varlıklar        | Neyi koruyoruz? Veri, yetenek (para/e-posta gönderme), sır, erişilebilirlik              |
| 5 dk  | Giriş noktaları  | Dışarıdan veri ya da komut alan her yer: uçlar, dosyalar, kuyruklar, betikler, yedekler  |
| 5 dk  | Güven sınırları  | Verinin güveninin değiştiği yerler; her birine bir numara                                 |
| 10 dk | STRIDE soruları  | Her sınır × altı harf; cevabı "bilmiyorum" olan her soru bir satır olur                   |
| 5 dk  | Karar ve öncelik | Her satıra önlem, test, sahip; olasılık × etki ile sıra                                  |

Varlıklarda yalnız veriyi saymayın. "Sistem adına e-posta gönderebilmek" de varlıktır (spam aracı olursunuz);
"sunucunun iç ağa istek atabilmesi" de (bkz. [SSRF](ssrf-ve-dis-istekler.md)).

Giriş noktalarında unutulanlar: yönetici betikleri, zamanlanmış işler, gelen webhook'lar, içe aktarılan CSV,
e-postadaki bağlantılar (belirteç taşır), ters vekilin eklediği başlıklar (`X-Forwarded-For`), bağımlılıklar
([Tedarik zinciri](tedarik-zinciri.md)), yedek dosyaları, operatörün kabuk erişimi ve modele verilen araçlar.

## STRIDE soruları

| Harf | Tehdit                                    | Bozulan özellik | Sorulacak sorular                                                                                    | İlgili not                                                         |
| ---- | ----------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S    | Kimlik sahteciliği (spoofing)             | Kimlik          | Kimliği nereden biliyoruz? Belirteç çalınır/tahmin edilirse? Başlık uydurulursa (`X-Forwarded-For`)? | [Oturum](oturum-guvenligi.md), [Parola](parola-ve-hesap-guvenligi.md) |
| T    | Kurcalama (tampering)                     | Bütünlük        | İstemci hangi alanı değiştirebilir? Fiyat, rol, sahip istekten mi okunuyor? İmzasız veri var mı?      | [Erişim açıkları](erisim-denetimi-aciklari.md)                     |
| R    | İnkâr (repudiation)                       | Hesap verebilirlik | "Ben yapmadım" diyene ne gösteririz? Yönetici işlemleri kayıtlı mı? Kayıt silinebilir mi?          | [Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)                   |
| I    | Bilgi sızıntısı (information disclosure)  | Gizlilik        | Başkasının kaydı okunabilir mi? Hata iletisi, günlük, önbellek, yedek neyi açık eder?                | [Erişim açıkları](erisim-denetimi-aciklari.md), [KVKK](kvkk-pratik.md) |
| D    | Hizmet engelleme (denial of service)      | Erişilebilirlik | Tek istek ne kadar iş yaptırır (özet, dosya, sorgu)? Sınırsız liste, gövde, yükleme var mı?          | [Dosya yükleme](dosya-yukleme-guvenligi.md)                        |
| E    | Yetki yükseltme (elevation of privilege)  | Yetki           | Kim neyi yapabilir, nerede denetleniyor? Gizli uç var mı? Girdi kod olarak çalışabilir mi?            | [Enjeksiyon](enjeksiyon.md), [Erişim açıkları](erisim-denetimi-aciklari.md) |

Her soru bir sınırla birlikte sorulur: "tarayıcı → API sınırında **T** nedir?" Sorunun cevabı bir dosya adıyla
verilemiyorsa ("şurada denetleniyor: `permissions.ts`") o satır **açık** kalır.

## Doldurulmuş örnek: havuzdaki uygulama temeli

Konu: [`uygulama/`](../../uygulama/README.md) (Hono API + SQLite + React PWA). Çalışan karşılığı ve kararların
tamamı: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md).

```text
 [Tarayıcı / PWA] --(1)--> [Ters vekil] --(2)--> [API (Hono)] --(3)--> [SQLite dosyası] --(5)--> [Yedek]
        ^                                             |  \--(4)--> [E-posta sağlayıcısı] --> [Kullanıcının kutusu]
        |                                             |
   [Kötü site] (CSRF)                     [Operatör: create-admin, backup betikleri] --(6)
 Sınırlar: (1) internet → sunucu  (2) vekil → uygulama: başlıklara güven  (3) uygulama → veri
           (4) uygulama → dış servis  (5) üretim → yedek ortamı  (6) operatör kabuğu → üretim
```

**Varlıklar:** hesaplar (e-posta, ad, parola özeti), oturum belirteçleri, alanlardaki kayıtlar ve paylaşımın
gizliliği, denetim günlüğü, yedekler, ortam sırları (e-posta API anahtarı), "bizim adımıza e-posta gönderme"
yeteneği.

**Giriş noktaları:** `/api/auth/*` (oturumsuz), `/api/invites/:token` (oturumsuz), `/api/sync`, `/api/events`
(SSE), `/api/workspaces/*`, `/api/account/*`, `/api/admin/*`, statik dosyalar, e-postadaki sıfırlama/davet
bağlantıları, `X-Forwarded-For` başlığı, operatör betikleri, yedek dosyaları.

| No  | Sınır | Giriş noktası             | Harf | Tehdit                                     | Karar ve önlem (dosya)                                       | Test / durum                                 |
| --- | ----- | ------------------------- | ---- | ------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| T1  | 1     | `POST /api/auth/login`    | S    | Parola deneme                              | Hız sınırı IP ve IP+e-posta (`http/rateLimit.ts`); scrypt     | `security.test.ts` → "hız sınırı"            |
| T2  | 1     | `POST /api/auth/login`    | I    | Yanıttan hesap varlığını öğrenme           | Tek tip ileti + sahte özet (`lib/password.ts → burn`)         | `security.test.ts` → "hesap varlığı"         |
| T3  | 1     | `POST /api/auth/register` | I    | Kayıtla hesap varlığını öğrenme            | **Kabul:** kullanılabilirlik için; IP başına saatte 10       | Kabul, `GUVENLIK.md` §2                      |
| T4  | 1     | Değiştiren her uç         | S    | Kötü sitenin kullanıcı adına istek atması  | SameSite + köken denetimi + zorunlu JSON (`http/csrf.ts`)     | `security.test.ts` → "CSRF"                  |
| T5  | 1     | `/api/workspaces/:id/*`   | I    | Başkasının alanını okuma (IDOR)            | Üye değilse 404 (`workspaces/permissions.ts`)                 | `security.test.ts` → "başkasının alanı"      |
| T6  | 1     | `POST /api/sync`          | E    | İzleyicinin yazması                        | Değişiklik başına rol denetimi (`sync/service.ts`)            | `security.test.ts` → "izleyici yazamaz"      |
| T7  | 1     | Yeni eklenen her uç       | E    | Oturum kapısının unutulması                | Herkese açık uçlar listesi (`PUBLIC_ROUTES`)                  | `rules.test.ts` → "oturumsuz isteğe 401"     |
| T8  | 2     | `X-Forwarded-For`         | S    | Uydurma IP ile hız sınırını aşmak          | `TRUST_PROXY` sayısı kadar sağdan okuma (`http/clientIp.ts`)  | `security.test.ts` → "TRUST_PROXY kapalıyken" |
| T9  | 3     | Veritabanı dosyası        | I    | Dosya sızınca oturum çalma                 | Belirteçlerin yalnız SHA-256 özeti (`lib/random.ts`)          | Var                                          |
| T10 | 4     | Davet/sıfırlama e-postası | T    | Kullanıcı adıyla HTML enjeksiyonu          | Her değer kaçışlanır (`mail/templates.ts → escapeHtml`)       | Var                                          |
| T11 | 1     | Günlükler                 | I    | Günlükte parola/belirteç/e-posta           | Adres kalıbı yazılır, gövde yazılmaz (`http/requestLog.ts`)   | `security.test.ts` → "günlükte … geçmez"     |
| T12 | 5     | Yedek dosyaları           | I    | Şifresiz yedeğin sızması                   | **Açık:** yedekler şifrelenmiyor                             | Eksik → [Yedek](yedek-ve-fidye-yazilimi.md)  |
| T13 | 1     | Hesap ele geçirme         | S    | Çalınan parolayla giriş                    | **Açık:** iki aşamalı doğrulama yok                          | Eksik, `GUVENLIK.md` §5                      |
| T14 | 6     | `create-admin` betiği     | E    | Sunucuya erişen herkesin yönetici açması   | **Kabul:** kabuk erişimi zaten tam yetkidir; kabuğu koruyun  | Kabul                                        |

T3, T12, T13, T14 bu modelin değeridir: bilinen eksikler yazılıdır, kimse "güvenli" sanıp geçmez.

## Tehdit kaydını kodla denetlemek

Liste uzayınca iki kural unutulur: "önlendi" denen satırın testi yoktur, yeni eklenen giriş noktası hiç
düşünülmemiştir. Kaydı veri olarak tutup sınamak ikisini de yakalar; öncelik de buradan çıkar.

```python calistir
from dataclasses import dataclass


@dataclass(frozen=True)
class Tehdit:
    no: str
    giris: str
    harf: str
    olasilik: int  # 1 düşük – 3 yüksek
    etki: int  # 1 düşük – 3 yüksek
    durum: str  # "onlendi" | "kabul" | "acik"
    kanit: str  # önlendiyse test adı, kabulse gerekçe


GIRIS_NOKTALARI = {"login", "register", "workspaces", "sync", "xff", "yedek", "create-admin"}
KAYIT = [
    Tehdit("T1", "login", "S", 3, 3, "onlendi", "security.test.ts: hız sınırı"),
    Tehdit("T3", "register", "I", 3, 1, "kabul", "kullanılabilirlik; IP başına saatte 10"),
    Tehdit("T5", "workspaces", "I", 3, 3, "onlendi", "security.test.ts: başkasının alanı"),
    Tehdit("T6", "sync", "E", 2, 3, "onlendi", "security.test.ts: izleyici yazamaz"),
    Tehdit("T8", "xff", "S", 2, 2, "onlendi", "security.test.ts: TRUST_PROXY"),
    Tehdit("T12", "yedek", "I", 1, 3, "acik", ""),
    Tehdit("T13", "login", "S", 2, 3, "acik", ""),
    Tehdit("T14", "create-admin", "E", 1, 3, "kabul", "kabuk erişimi zaten tam yetki"),
]

dusunulmemis = GIRIS_NOKTALARI - {t.giris for t in KAYIT}
assert not dusunulmemis, f"tehdit düşünülmemiş giriş noktası: {dusunulmemis}"
for t in KAYIT:
    assert t.durum in {"onlendi", "kabul", "acik"}, t.no
    assert t.durum == "acik" or t.kanit, f"{t.no}: '{t.durum}' deniyor ama test/gerekçe yazılmamış"

acik = sorted((t for t in KAYIT if t.durum == "acik"), key=lambda t: (-t.olasilik * t.etki, t.no))
for t in acik:
    print(f"{t.no} öncelik={t.olasilik * t.etki} {t.giris} ({t.harf})")
```

```cikti
T13 öncelik=6 login (S)
T12 öncelik=3 yedek (I)
```

Puanlama kaba bir sıralama aracıdır, ölçüm değildir. 3 × 3 = 9 olan açık satır yayını durdurur; 1–2 puanlılar
birikim listesine yazılır.

## Tuzaklar

| Belirti                                                                | Neden                                                          | Çözüm                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Liste "SQL enjeksiyonu, XSS, DDoS" gibi genel adlarla dolu             | Sistem çizilmeden ezber liste yazıldı                          | Önce sınırlar; her satır bir giriş noktası ve dosya adı taşısın        |
| "Önlendi" yazıyor ama kodda karşılığı yok                              | Önlem niyet olarak yazıldı                                     | Kanıt sütunu: test adı ya da dosya; yoksa durum "açık"                 |
| Olay sonrası "bunu hiç düşünmemiştik": betik, yedek, CI                | Yalnız HTTP uçları sayıldı                                     | Giriş noktası listesine operatör, yedek, CI, bağımlılık, e-posta ekleyin |
| `X-Forwarded-For` ile hız sınırı aşılıyor                              | Vekil → uygulama sınırı çizilmedi; başlıklara güvenildi        | Sınır (2)'yi modele koyun; `TRUST_PROXY` ayarını testleyin             |
| Model bir yıl önceki sistemi anlatıyor                                 | Kodla birlikte güncellenmiyor                                  | "Yeni giriş noktası" değişikliğinde modeli güncellemek bitti tanımında |
| Her şey "yüksek risk"; hiçbir şey yapılmıyor                           | Öncelik yok                                                    | Olasılık × etki; 9'lar yayından önce, gerisi listeye                   |
| "HTTPS var, güvenliyiz"                                                | Taşıma güvenliği uygulama hatalarını kapatmaz                  | HTTPS tek satırdır; S, T, E satırları ayrı ayrı cevaplanır             |
| Bilinen eksik herkesçe biliniyor ama hiçbir yerde yazmıyor              | "Kabul" kararı sözlü kaldı                                     | Kabul satırı gerekçe ve tarihle yazılır; README "Sınırlar"a da          |
| Yapay zekâ aracı eklendi, kimse model çıktısını giriş noktası saymadı  | Model "bizim kodumuz" sanıldı                                  | Model çıktısı ve getirilen belge = güvenilmez girdi ([YZ güvenliği](yapay-zeka-uygulama-guvenligi.md)) |

## Denetim listesi

- [ ] Varlık listesi veri, yetenek, sır ve erişilebilirliği kapsıyor.
- [ ] Giriş noktaları HTTP uçları dışında betikleri, işleri, webhook'ları, e-posta bağlantılarını, yedekleri,
      vekil başlıklarını ve YZ araçlarını içeriyor.
- [ ] Her güven sınırı numaralı; her satır bir sınıra bağlı.
- [ ] Her sınır için altı STRIDE sorusu soruldu; "bilmiyorum" cevapları satır oldu.
- [ ] Her "önlendi" satırında test adı ya da dosya var; her "kabul" satırında gerekçe ve tarih var.
- [ ] 9 puanlı açık satır kalmadı; kalanlar birikim listesinde.
- [ ] Kabul edilen riskler README'nin "Sınırlar" bölümünde de yazıyor.
- [ ] Model, değişikliğin yapıldığı dalda kodla birlikte güncellendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Şu özellik için tehdit modeli çıkar: [özellik]. Önce varlıkları, giriş noktalarını ve güven
  sınırlarını listele. Sonra her sınır için STRIDE'ın altı harfini sor. Çıktı tablo olsun: no, sınır, giriş
  noktası, harf, tehdit, önlem (dosya yolu), test (dosya ve test adı), durum (önlendi/kabul/açık). Kodda
  göremediğin önlemi 'önlendi' yazma; 'açık' yaz."
- **Modelin tipik hatası:** genel bir OWASP listesini kopyalar; özelliğe özgü sınırı (vekil başlığı, e-posta
  bağlantısı, yedek) atlar; kodda olmayan önlemi var sayar; her satıra "yüksek" yazar.
- **Çıktıda denetleyin:** her "önlendi" satırındaki dosya ve test adını açıp gerçekten var mı bakın; tabloda en az
  bir "kabul" ya da "açık" satırı olmaması şüphelidir.
- **Test isteyin:** açık satırların her biri için "saldırgan denedi, olmadı" testi; örnek kalıp:
  [`security.test.ts`](../../uygulama/api/test/security.test.ts).

## İlgili

- Sınıf haritası: [OWASP özeti](owasp-ozet.md) · Yayından önce: [Yayın öncesi denetim](yayin-oncesi-guvenlik-denetimi.md)
- Çalışan karşılık: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) (§1 tehdit modeli, §5 bilinen
  sınırlar), kural testi [`rules.test.ts`](../../uygulama/api/test/rules.test.ts)
- Yetki modeli: [Yetkilendirme](../30-arkauc/yetkilendirme.md) · Kimlik: [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md)
