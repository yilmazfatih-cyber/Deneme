# Lisanslar: hangi lisans neye izin verir?

> **Bu belge hukuki danışmanlık değildir.** Kısa bir karar yardımıdır; ticari bir üründe kullanmadan
> önce kümenin kartını, lisans metnini ve gerekiyorsa bir hukukçuyu dinleyin.

## Kısa karar tablosu

| Lisans (HF etiketi) | Ticari kullanım | Atıf | Türev paylaşımı | Katalog kuralı |
| --- | --- | --- | --- | --- |
| `cc0-1.0`, `pddl`, `unlicense` | evet | gerekmez (nezaketen yapın) | serbest | evet |
| `mit`, `apache-2.0`, `bsd-*` | evet | lisans/telif bildirimi korunur | serbest | evet |
| `cc-by-4.0`, `cc-by-3.0`, `cc-by-2.0` | evet | **gerekir** | serbest | evet |
| `odc-by` | evet | **gerekir** (veri tabanı düzeyinde) | serbest | evet |
| `cc-by-sa-*`, `gfdl` | evet | **gerekir** | **aynı lisansla paylaşılmalı** (benzer paylaşım) | evet |
| `odbl` | evet | gerekir | veri tabanı türevi aynı lisansla | belirsiz (etiket tabloda değil) |
| `cc-by-nd-*` | dağıtım evet, **değiştirme hayır** | gerekir | türev yok | belirsiz (model eğitimi türev mi? açık değil) |
| `cc-by-nc-*`, `cc-by-nc-sa-*`, `cc-by-nc-nd-*` | **hayır** | gerekir | — | hayir |
| `other`, `unknown`, etiket yok | **bilinmiyor** | — | — | belirsiz |

## Katalogdaki `ticari_kullanim` alanı

- Kural (`verihavuzu/katalog/model.py → commercial_use_from_tags`) yukarıdaki tablonun son sütunudur.
- Katalog kararı kuraldan **daha kısıtlayıcı** olabilir, daha serbest olamaz (doğrulama denetler).
  Lisans etiketi izin verici olsa da şu durumlarda "belirsiz" yazıldı:
  - **Web taraması** (Common Crawl, mC4, OSCAR türevleri): derlemenin lisansı içerikteki metinlerin
    telif hakkını kapsamaz.
  - **Kazınmış (scraped) içerik**: kullanıcı yorumları, tweetler, forumlar — sitenin/platformun
    kullanım koşulları ayrıca bağlayabilir.
  - **Derleme/çeviri kümeleri**: alt kümelerin özgün lisansları farklı olabilir; makine çevirisi
    hizmetlerinin koşulları ayrıca değerlendirilmelidir.
  - **Bir dil modeliyle üretilmiş veriler**: üreten modelin kullanım koşulları ayrıca bağlayabilir.
- Erişim metni açıkça kısıtlıyorsa (ör. ImageNet: "yalnız ticari olmayan araştırma ve eğitim") "hayir".

## Bu depodaki üçüncü taraf içerik

| Dosya | Kaynak | Lisans | Bildirim |
| --- | --- | --- | --- |
| `tr/ilceler.*` | turkiye-api | MIT | `tr/ATIFLAR.md` |
| `tr/banka_kodlari.*` (unvan yazımı) | schwifty | MIT | `tr/ATIFLAR.md` |
| `tests/fixtures/tcmb/*` | TCMB günlük kur bülteni (2026-11-16'da alındı) | olgusal veri; yalnız test için | bu tablo |

Diğer `tr/` tabloları elle derlenmiş olgusal veridir (telif konusu değildir); karşılaştırma için
kullanılan kaynakların içeriği depoya kopyalanmadı.

## Pratik kurallar

1. Lisansı belirsiz içerik depoya girmez (STANDARTLAR §10).
2. Atıf gerektiren veriyi kullanan ürünün "Hakkında" ekranına ya da belgesine atıf yazın.
3. Benzer paylaşım (SA) lisanslı veriden türetilen VERİ kümesi aynı lisansla paylaşılmalıdır;
   bunun bir modelin ağırlıklarına uygulanıp uygulanmadığı tartışmalıdır — "belirsiz" sayın.
4. Kişisel veri içeren kümelerde lisans yetmez; KVKK yükümlülükleri ayrıca vardır (`KVKK_NOTLARI.md`).
