---
title: İletişim formu
description: Sunucusuz iletişim formunu bir form servisine bağlama, e-posta yedeği, spam önlemleri ve bülten kaydı.
group: Özellikler
order: 110
---

İletişim formu bir sunucu gerektirmez. İki biçimde çalışır:

1. **Form servisiyle (önerilen):** `PUBLIC_FORM_ENDPOINT` tanımlıysa ileti o adrese gönderilir; ziyaretçi sayfadan ayrılmadan "İletiniz bize ulaştı" iletisini görür.
2. **E-posta yedeği:** Adres tanımlı değilse form, ziyaretçinin e-posta uygulamasını hazır bir iletiyle açar (`mailto:`). Alıcı, `src/site.config.ts` → `contact.email` adresidir.

## Bir servise bağlamak

Proje klasöründe `.env` adlı bir dosya oluşturun (örnek: `.env.example`) ve servisin size verdiği adresi yazın:

```bash title=".env"
PUBLIC_FORM_ENDPOINT=https://formspree.io/f/abcdwxyz
```

Sonra siteyi yeniden derleyin. Yayın servisinde (GitHub Actions, Netlify, Cloudflare Pages) aynı değişkeni ortam değişkeni olarak tanımlayın.

Form, bu adrese şu JSON gövdesini `POST` eder (`Content-Type: application/json`, `Accept: application/json`):

```json
{ "name": "Ayşe Kaya", "email": "ayse@ornek.com", "message": "…", "page": "https://…/iletisim/", "lang": "tr" }
```

Yanıt 2xx ise başarı, değilse "gönderilemedi" iletisi ve doğrudan e-posta adresi gösterilir. JavaScript kapalıysa form aynı adrese klasik biçimde (form alanları olarak) gönderilir.

> [!NOTE]
> Bu biçimde JSON kabul eden servislerden biri Formspree'dir. Bazı servisler gövdede ek bir alan ister (ör. bir erişim anahtarı); öyleyse formun betiğine (`src/scripts/contact-form.ts`) o alanı eklemeniz gerekir. Belirli servislerle bu ortamda gerçek gönderim denenmedi.

## Spam önlemleri

- **Bal küpü:** Ziyaretçinin görmediği, ekran okuyucudan da gizlenen bir alan vardır (`_gotcha`). Doluysa ileti gönderilmez ama bot başarılı olduğunu sanır.
- **Süre tuzağı:** Sayfa açıldıktan sonraki üç saniye içinde gönderilen form reddedilir ve ziyaretçiden biraz sonra yeniden denemesi istenir.

Daha güçlü korumaya ihtiyaç duyarsanız form servisinizin kendi spam süzgecini açın.

## Erişilebilirlik

Her alanın görünür bir etiketi vardır; hatalar alanın hemen altında yazılır ve alana bağlanır (`aria-describedby`, `aria-invalid`). Gönderimde hata varsa formun üstünde bir özet çıkar ve odak ilk hatalı alana gider. Sonuç iletisi ekran okuyucularca duyurulur.

## Bülten kaydı

Blog sayfalarında görünen bülten kutusu, yalnız `PUBLIC_NEWSLETTER_ENDPOINT` tanımlıysa çizilir. Kutu, e-posta adresini o adrese `{ "email": "…", "lang": "tr" }` gövdesiyle gönderir.

```bash title=".env"
PUBLIC_NEWSLETTER_ENDPOINT=https://bulten-servisiniz.example/abone
```
