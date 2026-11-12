# Kurulum (şirket bilgisayarında, bir kez)

Süre: 10–20 dakika. Gerekenler: Claude Code, Python 3.9+ (ek paket yok), Mixpanel'e bir erişim yolu.

## 1. Tabanı şirket bilgisayarına almak

Taban yalnız genel araçlardır; içinde şirket verisi yoktur. İki yol:

**A) Git ile (güncellemesi kolay).** Kişisel GitHub deponuza şirket bilgisayarından erişebiliyorsanız ve şirket
politikası izin veriyorsa, yalnız bu klasörü çekin:

```bash
git clone --filter=blob:none --sparse https://github.com/yilmazfatih-cyber/Deneme.git analitik
```

```bash
cd analitik && git sparse-checkout set analitik-taban && cd analitik-taban
```

Sonraki güncellemeler: `git pull`. `yerel/` ve `CLAUDE.local.md` git dışıdır, güncelleme onlara dokunmaz.
Şirket bilgisayarından bu depoya **asla push etmeyin** (Claude'un push etmesi `.claude/settings.json` ile kapalıdır).

**B) ZIP ile.** GitHub'da depo → Code → Download ZIP → yalnız `analitik-taban/` klasörünü istediğiniz yere kopyalayın.
Güncellemede `yerel/` klasörü ve `CLAUDE.local.md` dışındaki her şeyi yenisiyle değiştirin.

## 2. Python'u doğrulayın

```bash
python3 --version
```

3.9 veya üstü yeterli. Windows'ta `python3` yoksa `py -3 --version` deneyin; çalışan komut `CLAUDE.local.md`'ye
yazılır ve Claude onu kullanır. Python yoksa şirketin yazılım merkezinden ya da python.org'dan kurun.

## 3. İlk çalıştırma

```bash
cd analitik-taban
```

```bash
claude
```

Claude Code içinde `/kurulum` yazın. Önce denemek isterseniz `/kurulum demo`: sentetik "Örnek Mağaza" verisiyle her
komut çalışır, hiçbir şirket sistemine bağlanılmaz. Demodan gerçeğe geçmek için `yerel/ayarlar.json`'da
`"demo": false` yapıp `/kurulum`'u tekrar çalıştırın.

`/kurulum` sizden şunları ister; gizli bilgileri **sohbete değil**, `yerel/.env` dosyasına kendi düzenleyicinizle yazın.

## 4. Mixpanel erişimi (birini seçin)

| Yol              | Ne zaman                              | Token maliyeti                                             |
| ---------------- | ------------------------------------- | ---------------------------------------------------------- |
| `api` (önerilen) | Service account açabiliyorsanız       | En düşük: betik ham veriyi diske yazar, modele tablo gider |
| `mcp`            | Mixpanel MCP'yi zaten kullanıyorsanız | Orta: ham yanıt `veri-cekici` alt ajanında (Haiku) kalır   |
| `csv`            | API/MCP yoksa                         | Düşük ama elle dışa aktarım gerekir                        |

**api — service account:**

1. Mixpanel → Organization Settings → Service Accounts → Add. Hesabı projeye ekleyin; okuma için düşük bir rol
   yeter, 403 alırsanız rolü yükseltin. Organizasyon yöneticisi değilseniz bunu yöneticinizden isteyin.
2. Kullanıcı adı ve secret'ı `yerel/.env` içine yazın: `MIXPANEL_SA_USER=…`, `MIXPANEL_SA_SECRET=…`.
3. Proje ID (Project Settings → Overview) ve bölgeyi (`eu.mixpanel.com` kullanıyorsanız `eu`) `yerel/ayarlar.json`'a.
4. Not: Query API **Free planda yok** (Growth/Enterprise). Eski "API secret" yöntemi 3 Mart 2027'de kalkıyor.

**mcp — resmi Mixpanel MCP sunucusu:**

```bash
claude mcp add --transport http mixpanel https://mcp-eu.mixpanel.com/mcp
```

(US: `https://mcp.mixpanel.com/mcp`.) Claude Code'da `/mcp` ile giriş yapın; MCP organizasyonda kapalıysa yöneticiniz
açar. `yerel/ayarlar.json` → `"mixpanel": {"kaynak": "mcp"}`. Bu modda veri çekmeyi her zaman alt ajan yapar.

**csv:** Mixpanel raporunda Export → CSV, dosyayı `yerel/girdi/` altına koyun; `"kaynak": "csv"`. Olay sözlüğü için
Lexicon → Export dosyasını `python3 kit/mp.py sozluk --ice-aktar yerel/girdi/<dosya>.csv` ile içe aktarın.

## 5. Hotjar erişimi

- **API** yalnız Ask Scale planında ve yalnız anket yanıtları içindir: Hotjar → Settings → API → kimlik oluşturun,
  `HOTJAR_CLIENT_ID` / `HOTJAR_CLIENT_SECRET` → `yerel/.env`; site ID (Surveys sayfasının adresinde) →
  `yerel/ayarlar.json` `hotjar.site_id`; `"hotjar": {"kaynak": "api"}`.
- **CSV** (her planda): Surveys → yanıtlar → Download (CSV/XLSX) → `yerel/girdi/`. Isı haritası tıklama CSV'si ve kayıt
  listesi dışa aktarımı da `ozet.py` ile okunur.
- **Dikkat:** Hotjar hesapları 2026'da Contentsquare'e taşınıyor; taşınınca geçmiş kayıt ve ısı haritaları gelmez,
  Hotjar bir süre salt-okunur kalıp silinir. Saklamak istediğiniz anket ve ısı haritası verisini şimdi dışa aktarın.

## 6. `yerel/ayarlar.json` alanları

| Alan                       | Anlamı                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `demo`                     | `true` ise her şey sentetik veriden gelir                                                                                                 |
| `utc_ofset_saat`           | Mixpanel proje saat dilimi (Türkiye: 3). "Dün" bu saate göre hesaplanır                                                                   |
| `mixpanel.kaynak`          | `api`, `mcp` ya da `csv`                                                                                                                  |
| `mixpanel.bolge`           | `us`, `eu`, `in`                                                                                                                          |
| `mixpanel.proje_id`        | Proje ID (ya da `.env`'de `MIXPANEL_PROJECT_ID`)                                                                                          |
| `mixpanel.workspace_id`    | Yalnız Data Views kullanıyorsanız                                                                                                         |
| `hotjar.kaynak`, `site_id` | `api` ya da `csv`; site ID                                                                                                                |
| `boyutlar`                 | `/neden`'in kıracağı özellikler (platform, sürüm, ülke, kanal…)                                                                           |
| `kpiler`                   | `/rapor` KPI'ları: `{"ad", "olay", "tip"}` ya da oran için `{"ad", "pay", "payda", "tip"}`; `tip` = `general` (toplam) / `unique` (tekil) |
| `huniler`                  | Kayıtlı huni adları → ID (`mp.py huni --liste` ile bulunur)                                                                               |
| `deney`                    | A/B testi maruziyet olayı ve özellik adları (Mixpanel varsayılanı dolu)                                                                   |
| `esikler`                  | KPI uyarısı için göreli değişim ve z eşiği                                                                                                |

Değişiklikten sonra `python3 kit/kurulum.py baglam` (Claude'un her oturumda gördüğü kısa bağlamı yeniler).
Ayrıca `yerel/notlar.md` (sürüm/kampanya günlüğü) ve `yerel/metrikler.md` (tanımlar) dosyalarını doldurun:
`/neden` günlüğü kendisi okur; model soru sormak zorunda kalmaz.

## 7. Doğrulama

```bash
python3 kit/kurulum.py durum
```

```bash
python3 kit/mp.py kontrol
```

```bash
python3 kit/kurulum.py test
```

## 8. Sorun giderme

| Belirti                                  | Çözüm                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CERTIFICATE_VERIFY_FAILED` / SSL hatası | Şirket ağı trafiği inceliyor: kurumsal kök sertifikayı `yerel/.env` içinde `SSL_CERT_FILE=/yol/kurum.pem` olarak verin. macOS'ta python.org Python'u için "Install Certificates.command" çalıştırın. |
| "Sunucuya ulaşılamadı"                   | VPN/proxy: `yerel/.env` içine `HTTPS_PROXY=http://proxy:port`                                                                                                                                        |
| 401                                      | Service account kullanıcı/secret yanlış ya da projeye ekli değil                                                                                                                                     |
| 402/403                                  | Rol yetersiz ya da plan Query API içermiyor → `mcp` veya `csv` kullanın                                                                                                                              |
| 429                                      | Saatlik 60 sorgu doldu; önbellekteki sorgular çalışır, biraz bekleyin                                                                                                                                |
| Windows'ta garip karakter                | Kit çıktıyı UTF-8'e zorlar; terminalde `chcp 65001` de yardımcı olur                                                                                                                                 |
| İzin soruları çok                        | `.claude/settings.json` kit komutlarına izin verir; Python komutunuz farklıysa oraya ekleyin                                                                                                         |

Claude Code'u bulutta (web) çalıştırıyorsanız ortamın ağ izinlerine `mixpanel.com` / `eu.mixpanel.com`,
`data.mixpanel.com` / `data-eu.mixpanel.com` ve `api.hotjar.io` eklenmelidir.

## 9. Veri kuralları

- Şirkete özel her şey `yerel/` ve `CLAUDE.local.md` içindedir; ikisi de `.gitignore`'dadır.
- Claude'un `yerel/.env`, `yerel/veri/` ve `yerel/onbellek/` dosyalarını okuması izinlerle kapalıdır.
- Kişisel Claude'a şirket verisi taşımayın; tabanı geliştirmek için yalnız genel ihtiyacı anlatın (`docs/GELISTIRME.md`).
