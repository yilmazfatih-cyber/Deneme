# Mimari

```
 WhatsApp Cloud API ─┐                         ┌─────────────── Arayüz (React, dist/) ───────────────┐
 Netgsm / SMS hook ──┤  /api/webhooks/*        │  Yönetim paneli (/)         Sakin portalı (/portal) │
 E-posta hook ───────┤                         └───────────────┬──────────────────────────────────────┘
 PayTR bildirimi ────┘                                         │ /api/y/*  (personel)   /api/portal/* (sakin)
                     ▼                                         ▼
          ┌──────────────────────── Hono uygulaması (server/app.ts) ────────────────────────┐
          │ güvenlik başlıkları · CSRF (Origin) · gövde sınırı · oturum ve rol · kuruluş kapsamı │
          ├──────────────┬───────────────┬────────────────┬─────────────────┬────────────────┤
          │ routes/      │ services/     │ domain/         │ ai/             │ integrations/  │
          │ HTTP, zod    │ iş akışları   │ saf iş kuralları │ Claude + kural  │ mesaj, ödeme   │
          └──────────────┴───────┬───────┴────────────────┴─────────────────┴────────────────┘
                                 ▼
                      node:sqlite (WAL) — data/kahya.db       Otopilot (15 dk’da bir, job_runs ile tekil)
```

## Katmanlar

| Klasör                 | Sorumluluk                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/domain/`       | Saf fonksiyonlar, test edilir: para (kuruş, en büyük kalan bölüşümü), tarih, cari hesap ve gecikme tazminatı, aidat dağıtımı, genel kurul yeter sayıları, KVKK maskeleme, Türkçe metin, BM25 arama, banka CSV ayrıştırma, daire eşleştirme |
| `server/services/`     | İş akışları: tahakkuk, tahsilat, gelen kutusu hattı, öneri uygulama, hatırlatma, toplantı, asistan, pano, otopilot                                                                                                                         |
| `server/routes/`       | HTTP uçları; her gövde zod ile doğrulanır, her kayıt kuruluş ve site yetkisiyle süzülür                                                                                                                                                    |
| `server/ai/`           | `AIService`: Claude (yapılandırılmış çıktı) ya da kural motoru; istemler `prompts.ts`, şemalar `schemas.ts`                                                                                                                                |
| `server/integrations/` | WhatsApp Cloud API, Netgsm REST v2, Resend, PayTR iFrame; yapılandırılmamış kanal “kayıt modu”nda çalışır                                                                                                                                  |
| `shared/labels.ts`     | Sunucu ve arayüzün ortak sabitleri ve Türkçe etiketleri                                                                                                                                                                                    |
| `web/`                 | React arayüzü; `lib.ts` (API, `useApi`, biçimlendirme), `context.tsx` (oturum, site, bildirim)                                                                                                                                             |

## Veri modeli (özet)

| Tablo                                             | Not                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `orgs`, `users`, `user_sites`, `sessions`         | Kuruluş (yönetim şirketi), personel ve sakin kullanıcıları, site atamaları, oturumlar |
| `sites`, `blocks`, `units`                        | Site/apartman, blok, bağımsız bölüm (arsa payı, m², tür)                              |
| `people`, `occupancies`                           | Kişiler (iletişim izinleri, KVKK) ve malik/kiracı ilişkisi, aidatı ödeyen             |
| `budgets`, `budget_lines`                         | İşletme projesi (taslak / onaylı / geçici) ve dağıtım anahtarlı kalemler              |
| `charges`, `payments`                             | Borç (aidat, ek toplama, gecikme, devir) ve tahsilat; iptal kaydı silinmez            |
| `expenses`, `vendors`                             | Giderler ve tedarikçiler                                                              |
| `tickets`, `ticket_events`                        | Talepler, hizmet süresi, zaman çizelgesi (sakine açık/iç not)                         |
| `messages`                                        | Gelen ve giden tüm mesajlar; yapay zekâ sınıflandırması `triage` alanında (JSON)      |
| `ai_actions`                                      | Yapay zekâ önerileri ve işlemleri: durum, motor, model, token, maskelenen veri sayısı |
| `meetings`, `agenda_items`, `attendance`, `votes` | Kat malikleri kurulu                                                                  |
| `compliance_items`                                | Periyodik kontroller                                                                  |
| `documents`, `doc_chunks`                         | Asistanın bilgi kaynağı (parçalara bölünmüş metin)                                    |
| `payment_intents`, `bank_imports`, `bank_rows`    | Online ödeme ve banka dökümü eşleştirme                                               |
| `reminders`, `audit_log`, `job_runs`              | Hatırlatma geçmişi, denetim günlüğü, zamanlanmış işlerin tekillik kaydı               |

Şema `server/db/schema.ts` içinde sürümlüdür (`PRAGMA user_version`); yeni sürüm `MIGRATIONS` dizisine eklenir.

## API

| Önek            | Erişim               | Örnek uçlar                                                                                                                                                                                               |
| --------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth`     | herkes               | `POST login`, `POST otp`, `POST otp/verify`, `POST logout`, `GET me`                                                                                                                                      |
| `/api/y`        | personel             | `dashboard`, `sites`, `units/:id`, `people`, `finance`, `budgets`, `payments`, `bank-imports`, `tickets`, `inbox`, `actions`, `announcements`, `meetings`, `compliance`, `documents`, `settings`, `users` |
| `/api/portal`   | sakin                | `home`, `units/:id/statement`, `tickets`, `ask`, `pay`, `payments/:oid`, `meetings`, `privacy`                                                                                                            |
| `/api/webhooks` | imza / gizli anahtar | `whatsapp` (GET doğrulama, POST mesaj), `sms`, `email`, `paytr`                                                                                                                                           |

Hatalar `{ "error": "Türkçe açıklama" }` biçimindedir.

## Güvenlik

- Parolalar scrypt; oturum belirteci yalnız `HttpOnly; SameSite=Lax` çerezde, veritabanında SHA-256 özeti. HTTPS’te `Secure`.
- Sakin girişi: 6 haneli tek kullanımlık kod, 5 dakika, 5 deneme; numara kayıtlı mı bilgisi dışarı sızdırılmaz.
- Yazma istekleri yalnız JSON kabul eder; form gönderimleri için `Origin` denetimi (CSRF). CSP, `frame-ancestors 'none'`.
- Her sorgu `org_id` ile süzülür; site yöneticisi `user_sites` ile sınırlıdır (testler: `tests/api/app.test.ts`).
- Webhook’lar: Meta `X-Hub-Signature-256`, PayTR HMAC, genel uçlar `X-Kahya-Secret`. Aynı mesaj/bildirim iki kez işlenmez.
- Hız sınırları giriş ve kod isteklerinde (tek sunucu için bellek içi).

## Ölçekleme yolu

Tek sunucu + SQLite yüzlerce site ve on binlerce bağımsız bölüm için yeterlidir. Büyüdükçe:

1. **Yedek:** SQLite WAL dosyasını [Litestream](https://litestream.io) ile nesne depolamaya sürekli yedekleyin.
2. **Birden çok sunucu:** veri katmanı (`server/db/db.ts`: `all/get/run/tx`) PostgreSQL’e taşınır; hız sınırı ve otopilot
   kilidi Redis’e ya da veritabanına alınır.
3. **Mesaj hacmi:** webhook’lar zaten hemen 200 döner (`server/background.ts`); yoğunlukta bir iş kuyruğuna geçilir.
4. **Belge araması:** BM25 yerel çalışır; çok büyük belge setlerinde gömme tabanlı aramaya geçilebilir.
