# Veri kartı şablonu

Her veri kümesinin yanında bir `VERI_KARTI.md` bulunur. `ornekler/` altındaki kartlar
`verihavuzu/sentetik/examples.py → render_card` ile bu şablona göre otomatik üretilir; dışarıdan
gelen gerçek bir küme için aşağıdakini kopyalayıp doldurun. Bilmediğiniz alanı uydurmayın:
"bilinmiyor" yazın.

```markdown
# Veri kartı: <küme adı>

> Uyarı satırı: uydurma mı, gerçek mi? Kişisel veri içeriyor mu?

## Amaç
Bu küme ne için toplandı/üretildi; ne için KULLANILMAMALI?

## Kaynak ve üretim
- Kaynak: (adres, kurum, tarih) ya da üretim komutu + tohum
- Toplama yöntemi: (anket, kazıma, sistem kaydı, sentetik…)
- Sürüm ve tarih:
- Lisans: (etiket + metin bağlantısı; ticari kullanım: evet/hayır/belirsiz)
- Atıf metni:

## Dosyalar
| Dosya | Satır | Bayt | SHA-256 |

## Sütunlar
(`python -m verihavuzu sozluk <tablo>.sema.json` çıktısı)

## Kişisel veri ve KVKK
- Hangi sütunlar kişisel veri? Maskelendi mi? Hukuki sebep?
- Saklama süresi:

## Bilinen yapı, yanlılıklar ve sınırlar
- Örnekleme yanlılığı, eksik dönemler, bilinen hatalar, etiket gürültüsü
- (Sentetikse) gerçek cevaplar: nedensel yapı, anomali etiketleri, değişmezler

## Bakım
- Kim günceller, ne sıklıkla? Son doğrulama tarihi:
```
