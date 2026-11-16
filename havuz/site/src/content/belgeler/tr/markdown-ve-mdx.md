---
title: Markdown ve MDX
description: Yazılarda kullanılabilecek biçimler; uyarı kutuları, kod blokları, tablolar, şekiller, dipnotlar ve MDX bileşenleri.
group: İçerik
order: 70
---

İçerik dosyaları **Markdown** (`.md`) ya da **MDX** (`.mdx`) olabilir. Markdown çoğu iş için yeterlidir; sayfaya düğme ya da ekip listesi gibi bir bileşen koymak istediğinizde MDX kullanın.

## Temel biçimler

```md
## Bölüm başlığı (h2)
### Alt başlık (h3)

**kalın**, *eğik*, `kod`, [bağlantı](/blog/)

- madde
- madde

1. adım
2. adım
```

İç bağlantıları `/` ile başlatın (`/blog/`, `/belgeler/hizli-baslangic/`). Site bir alt klasörde yayınlansa bile bu bağlantılar kendiliğinden düzeltilir. Başlıklar Türkçe karaktersiz kimlik alır: "## Özellikler ve Fiyat" başlığına `#ozellikler-ve-fiyat` ile bağlantı verebilirsiniz.

## Uyarı kutuları

Bir alıntıyı uyarı kutusuna çevirmek için ilk satıra türünü yazın:

```md
> [!TIP]
> Kısa bir ipucu.
```

> [!TIP]
> Kısa bir ipucu. Kullanılabilen türler: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`.

## Kod blokları

Dili ve isteğe bağlı başlığı çitin yanına yazın. Süslü ayraç içindeki satırlar vurgulanır:

````md
```ts title="src/site.config.ts" {2}
export const siteConfig = defineSiteConfig({
  name: 'Sedir',
})
```
````

```ts title="src/site.config.ts" {2}
export const siteConfig = defineSiteConfig({
  name: 'Sedir',
})
```

Renklendirme derlemede yapılır; her bloğun bir Kopyala düğmesi olur.

## Tablolar ve dipnotlar

```md
| Paket | Fiyat |
| --- | --- |
| İşletme | 349 TL |

Bir dipnot[^1].

[^1]: Dipnotun metni.
```

Tablolar dar ekranda yatay kaydırılır; dipnotlar sayfanın sonunda listelenir.

## Görsel ve şekil

```md
![Kuaför koltuğunda müşteri](./gorseller/salon.jpg "Alt yazı isteğe bağlıdır")
```

Görseller derlemede en iyilenir. Tırnak içinde bir alt yazı verirseniz görsel, alt yazılı bir şekle dönüşür. Köşeli ayraç içindeki **alt metni** her zaman yazın.

## MDX bileşenleri

`.mdx` dosyalarında aşağıdaki bileşenler içe aktarmadan kullanılabilir:

| Bileşen | Örnek |
| --- | --- |
| `Callout` | `<Callout type="warning" title="Dikkat">Metin</Callout>` |
| `LinkButton` | `<LinkButton href="/iletisim/">Bize yazın</LinkButton>` |
| `Badge` | `<Badge>Yeni</Badge>` |
| `Card` | `<Card title="Belgeler" href="/belgeler/" icon="book-open">Kısa açıklama</Card>` |
| `Figure` | `<Figure src={gorsel} alt="…" caption="…" />` (görseli dosyanın başında içe aktarın) |
| `CodeBlock` | `<CodeBlock lang="bash" code="npm run dev" title="Terminal" />` |
| `Team` | `<Team />` (ekip listesi) |

> [!WARNING]
> MDX'te `<` ve `{` karakterlerinin özel anlamı vardır. Düz metinde "5 < 10" ya da "{ad}" yazmanız gerekirse dosyayı `.md` olarak bırakın ya da bu kısımları kod biçiminde (`` `5 < 10` ``) yazın.
