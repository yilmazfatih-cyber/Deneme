---
title: Erişilebilir bir iletişim formu için yedi kural
description: Etiketten hata iletisine, spam önleminden başarı bildirimine kadar herkesin, ekran okuyucu ve klavye kullananların da doldurabildiği bir form.
date: 2026-10-20
tags: [Erişilebilirlik, Tasarım]
author: emre-sahin
cover: ./gorseller/form-kapak.png
coverAlt: Üç alanlı bir iletişim formu; ikinci alanın çerçevesi kırmızı ve altında bir hata iletisi var.
---

İletişim formu, bir işletme sitesinin en değerli sayfasıdır: ziyaretçinin müşteriye dönüştüğü yer orasıdır. Yine de formların çoğu, telefonda, klavyeyle ya da ekran okuyucuyla kullanan biri için yarım kalan bir deneyimdir. Aşağıdaki yedi kural bu sitenin iletişim formunda da uygulanmıştır.

## 1. Her alanın görünür bir etiketi olsun

Alanın içindeki gri ipucu metni (placeholder) etiket değildir: yazmaya başlayınca kaybolur, düşük karşıtlıkla zor okunur ve bazı ekran okuyucular onu hiç okumaz. Her alanın üstünde, `for` özniteliğiyle alana bağlı bir `<label>` bulunsun.

```html
<label for="eposta">E-posta adresiniz</label>
<input id="eposta" name="email" type="email" autocomplete="email" required />
```

## 2. Doğru alan türünü ve otomatik doldurmayı kullanın

`type="email"` telefonda @ işaretli klavyeyi açar; `autocomplete="email"` ve `autocomplete="name"` tarayıcının bilinen bilgileri tek dokunuşla doldurmasını sağlar. Ziyaretçinin yazacağı her harf, formu bırakma olasılığını artırır.

## 3. Hata iletisi alanın hemen altında olsun

"Form hatalı" demek yetmez; hangi alanın neden hatalı olduğunu ve nasıl düzeltileceğini söyleyin: "Geçerli bir e-posta adresi yazın (ornek@alan.com)." İletiyi `aria-describedby` ile alana bağlayın, alanı `aria-invalid="true"` ile işaretleyin. Böylece ekran okuyucu alana gelindiğinde hatayı da okur.

## 4. Yalnız renge güvenmeyin

Kırmızı çerçeve, renkleri ayırt edemeyen biri için hiçbir şey ifade etmez. Rengin yanında mutlaka metin ve tercihen bir simge kullanın.

> [!IMPORTANT]
> Gönder düğmesine basıldığında hata varsa formun en üstünde kısa bir özet gösterin ve odağı ilk hatalı alana taşıyın. Klavyeyle gezinen biri hatayı aramak zorunda kalmamalı.

## 5. Yapıştırmayı, kısa yolları ve yazım düzeltmeyi engellemeyin

E-posta alanına yapıştırmayı kapatmak, parola yöneticisi ya da sesle yazma kullananları cezalandırır. Ziyaretçinin alışık olduğu davranışlara dokunmayın.

## 6. Spamı ziyaretçiye yük olmadan durdurun

Resimli doğrulama bulmacaları (CAPTCHA) görme engelliler için çoğu zaman aşılamaz bir duvardır. Küçük bir sitede iki basit önlem büyük ölçüde yeterlidir:

- **Bal küpü alanı:** İnsanların görmediği, ekran okuyucudan da gizlenen bir alan. Botlar her alanı doldurur; bu alan doluysa ileti gönderilmez.
- **Süre tuzağı:** Sayfa açıldıktan sonraki birkaç saniye içinde gönderilen formlar insan işi değildir.

## 7. Sonucu açıkça bildirin

Gönderimden sonra ne olduğunu söyleyin: "Teşekkürler, iletiniz bize ulaştı. En kısa sürede yanıtlayacağız." Gönderim başarısız olursa suçlamayan bir dille alternatif yol verin: doğrudan e-posta adresi gibi. Bildirimi `role="status"` taşıyan bir alana yazın ki ekran okuyucu da duyursun.

## Kendi formunuzu denetleyin

Fareyi bir kenara bırakın ve formu yalnız klavyeyle (Tab, Shift+Tab, Enter, boşluk tuşu) doldurmayı deneyin. Sonra telefonunuzun ekran okuyucusunu (iPhone'da VoiceOver, Android'de TalkBack) açıp aynısını yapın. Takıldığınız her yer, ziyaretçinizin de takıldığı yerdir.
