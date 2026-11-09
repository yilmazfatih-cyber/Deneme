# Kurulum

## Geliştirme ve demo

```bash
cd kahya
npm install
npm run dev        # http://localhost:5174 — demo verisi, giriş kodları ekranda
npm run demo       # derlenmiş arayüzle tek süreç: http://localhost:8787 (bellek içi veritabanı)
```

Node.js **22.18 veya üstü** gerekir (TypeScript dosyaları derlenmeden çalışır, SQLite Node’un içindedir).

## Canlı ortam (Docker)

```bash
cd kahya
cp .env.example .env            # KAHYA_DEMO=0, KAHYA_PUBLIC_URL=https://yonetim.alanadiniz.com, anahtarlar…
docker compose up -d --build
docker compose run --rm kahya node --disable-warning=ExperimentalWarning scripts/kurulum.ts \
  --sirket "Yıldız Yönetim A.Ş." --ad "Elif Aksoy" --eposta elif@alanadiniz.com --parola "en-az-12-karakterli-parola"
```

Veritabanı `kahya-veri` biriminde (`/data/kahya.db`) kalıcıdır. Şema güncellemeleri sunucu açılırken otomatik uygulanır.

### HTTPS (Caddy ile)

```
yonetim.alanadiniz.com {
  reverse_proxy localhost:8787
}
```

`KAHYA_PUBLIC_URL` bu adres olmalıdır (çerezler `Secure` olur, PayTR dönüş adresleri ve kaynak denetimi bunu kullanır).

## Canlı ortam (Docker’sız)

```bash
cd kahya
npm ci
npm run build
npm run kurulum -- --sirket "…" --ad "…" --eposta … --parola "…"
npm start
```

systemd örneği (`/etc/systemd/system/kahya.service`):

```
[Unit]
Description=Kahya site yonetimi
After=network.target

[Service]
WorkingDirectory=/opt/deneme/kahya
ExecStart=/usr/bin/node --env-file=.env --disable-warning=ExperimentalWarning server/index.ts
Restart=always
User=kahya

[Install]
WantedBy=multi-user.target
```

## Entegrasyonlar

Tanımlanmayan her kanal “kayıt modu”nda çalışır: mesaj veritabanına ve sunucu günlüğüne yazılır, dışarı gitmez.
Ayarlar → Entegrasyonlar ekranı hangi kanalın canlı olduğunu ve webhook adreslerini gösterir.

### Claude (yapay zekâ)

`ANTHROPIC_API_KEY` tanımlayın. Model `KAHYA_AI_MODEL` (varsayılan `claude-opus-5-5`). Anahtar yoksa yerel kural motoru çalışır.
Yurt dışına aktarım yükümlülükleri için [HUKUK_VE_UYUM.md](HUKUK_VE_UYUM.md).

### WhatsApp Business Cloud API

1. Meta Business hesabında WhatsApp ürününü açın, telefon numarasını doğrulayın; `WHATSAPP_PHONE_NUMBER_ID` ve kalıcı sistem
   kullanıcısı belirtecini (`WHATSAPP_TOKEN`) alın.
2. Webhook: `https://…/api/webhooks/whatsapp`, doğrulama belirteci `WHATSAPP_VERIFY_TOKEN`; `messages` alanına abone olun.
   Uygulama gizli anahtarını `WHATSAPP_APP_SECRET` olarak girin (imza doğrulaması; tanımlı değilse canlıda webhook kapalıdır).
3. 24 saat penceresi dışındaki iletiler için “Utility” kategorisinde, Türkçe, tek gövde değişkenli bir şablon onaylatın
   (ör. ad: `kahya_bilgilendirme`, gövde: “Site yönetiminden bilgilendirme: {{1}}”).
4. Graph API sürümü `WHATSAPP_API_VERSION` (varsayılan `v26.0`).

### SMS (Netgsm)

Netgsm panelinde API alt kullanıcısı açın, sunucu IP’sine izin verin, BTK onaylı gönderici adını (başlık) alın:
`NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER`. Gönderim REST v2 (`/sms/rest/v2/send`) ile yapılır; iletiler
bilgilendirme (`iysfilter: "0"`) olarak gider. Sakin girişi kodları da bu kanaldan gönderilir.

### Gelen SMS ve e-posta

Sağlayıcınızın gelen ileti yönlendirmesini şu adreslere bağlayın (başlık `X-Kahya-Secret: <KAHYA_WEBHOOK_SECRET>`):

```
POST https://…/api/webhooks/sms     {"from": "+905321112233", "text": "…", "id": "sağlayıcı-mesaj-no"}
POST https://…/api/webhooks/email   {"from": "Ad <ad@ornek.com>", "subject": "…", "text": "…", "id": "…"}
```

### E-posta (Resend)

Alan adınızı Resend’de doğrulayın; `RESEND_API_KEY` ve `EMAIL_FROM`.

### Online ödeme (PayTR)

1. PayTR üye işyeri başvurusu (aidat tahsilatının kimin adına yapılacağını avukatınızla netleştirin — bkz. HUKUK_VE_UYUM).
2. Mağaza panelinden `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
3. Bildirim URL’si: `https://…/api/webhooks/paytr`. Test süresince `PAYTR_TEST_MODE=1`.
4. Ödeme sonrası sakin `…/odeme/sonuc/<sipariş-no>` sayfasına döner; tahsilat yalnız imzası doğrulanmış bildirimle kaydedilir.

## Yedekleme

```bash
# Günlük tutarlı yedek (cron)
sqlite3 /data/kahya.db ".backup '/yedek/kahya-$(date +%F).db'"
```

Sürekli yedek için [Litestream](https://litestream.io) ile nesne depolamaya çoğaltma önerilir. Yedekleri şifreli tutun;
kişisel veri içerir.

## Güncelleme

```bash
git pull && cd kahya && npm ci && npm run build && systemctl restart kahya   # ya da: docker compose up -d --build
```

## Canlı kontrol listesi

- [ ] `KAHYA_DEMO=0`, `KAHYA_SEED_DEMO=0`
- [ ] HTTPS ve doğru `KAHYA_PUBLIC_URL`
- [ ] Güçlü yönetici parolası; kullanılmayan hesaplar devre dışı
- [ ] WhatsApp `WHATSAPP_APP_SECRET`, `KAHYA_WEBHOOK_SECRET` tanımlı
- [ ] Günlük yedek ve geri yükleme denemesi
- [ ] [HUKUK_VE_UYUM.md](HUKUK_VE_UYUM.md) kontrol listesi
