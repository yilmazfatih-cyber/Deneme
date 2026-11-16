---
title: Sayfa ekleme
description: Hakkında, gizlilik ya da kampanya gibi tek tek sayfalar ekleme; yasal metin şablonları ve ekip listesi.
group: İçerik
order: 60
---

Blog yazısı ya da belge olmayan sayfalar (Hakkında, Gizlilik, bir kampanya sayfası) `src/content/sayfalar/<dil>/` altında durur. Dosya adı, sayfanın adresi olur: `hakkinda.md` → `/hakkinda/`.

## Üreteçle yeni sayfa

```bash title="Terminal"
npm run new -- sayfa "Kariyer"
```

Komut `src/content/sayfalar/tr/kariyer.md` dosyasını açar ve sayfanın adresini (`/kariyer/`) yazar. Sayfanın menüde görünmesi için `src/site.config.ts` içindeki `nav` ya da `footer` listesine bir bağlantı ekleyin.

## Sayfaya özel alanlar

| Alan | Anlamı |
| --- | --- |
| `legalTemplate: true` | Sayfanın başında "şablondur, hukuki danışmanlık değildir" uyarısı gösterilir |
| `showTeam: true` | Sayfanın sonunda ekip listesi (`src/content/ekip/<dil>.json`) gösterilir |
| `updated` | "Son güncelleme" tarihi gösterilir |

## Yasal metin şablonları

Gizlilik politikası, KVKK aydınlatma metni ve çerez politikası **şablon** olarak gelir. Köşeli ayraç içindeki alanları (`[Şirket unvanı]` gibi) kendi bilgilerinizle doldurun.

> [!CAUTION]
> Bu metinler hukuki danışmanlık değildir. Kendi işleyişinize göre düzenleyin ve yayımlamadan önce bir hukukçuya inceletin. İnceleme bittiğinde `legalTemplate: true` satırını silebilirsiniz.

## Ayrılmış adresler

Bazı adresler sitenin kendi bölümlerine aittir ve sayfa adı olarak kullanılamaz: `blog`, `belgeler`, `iletisim`, `en`, `og`, `pagefind` gibi. Böyle bir ad seçerseniz `npm run check` sizi uyarır.
