# Kod inceleme

## Ne zaman

İnceleme isteği (pull request) açmadan önce kendi değişikliğini incelerken ya da bir ekip arkadaşının değişikliğini
incelerken.

## Önce

- Değişikliğin amacını tek cümleyle yaz. Farkı gör: `git diff {{ANA_DAL}}...HEAD`.
- Otomatik kapılar: {{KAPILAR}}. Kırmızı kapı varken insan incelemesi istenmez.

## Kontrol listesi (önem sırasıyla)

1. **Doğruluk:** sınır durumları (boş, çok büyük, eksik alan), hata yolları, eşzamanlılık, saat dilimi.
2. **Güvenlik:** girdi doğrulama, yetki denetimi, günlüklere sızan gizli bilgi, SQL ya da komut enjeksiyonu, yeni
   bağımlılığın kaynağı ve lisansı.
3. **Testler:** yeni davranışın testi var mı, test davranışı mı yoksa uygulama ayrıntısını mı sınıyor?
4. **Kapsam:** değişiklik istenenle sınırlı mı, gereksiz soyutlama ya da ilgisiz dosya var mı?
5. **Okunabilirlik:** adlar, güncelliğini yitirmiş yorumlar, ölü kod.

## Bulgu yazımı

Her bulgu üç parçalıdır: **önem** (Engel, Önemli, Öneri), **yer** (`dosya:satır`) ve **somut düzeltme önerisi**.
Zevk farklarını "Öneri" olarak işaretle; Engel yalnız doğruluk, güvenlik ve veri kaybı içindir.

## Geri bildirim alırken

Her yorumu kodda doğrula. Yorum yanlışsa kanıtla itiraz et; belirsizse sor. Doğrulamadan "haklısınız" deyip
uygulama.
