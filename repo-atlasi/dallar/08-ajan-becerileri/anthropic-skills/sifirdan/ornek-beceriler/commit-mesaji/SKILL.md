---
name: commit-mesaji
description: Hazırlanmış (staged) değişikliklerden Conventional Commits biçiminde Türkçe commit mesajı yazar. Kullanıcı commit mesajı, commit açıklaması ya da "bunu commitle" dediğinde kullan.
---

# Commit mesajı

1. `git diff --staged` çıktısını oku. Hazırlanmış değişiklik yoksa bunu söyle ve dur.
2. Türü seç: feat, fix, docs, test, refactor, chore.
3. Başlık satırı: `tür(kapsam): emir kipinde kısa özet`, en fazla 72 karakter.
4. Gövdede neyin neden değiştiğini yaz; nasıl değiştiğini diff zaten gösteriyor.

Örnek:

```text
fix(fatura): boş KDV alanında çökmeyi önle

KDV alanı olmayan faturalarda ayrıştırıcı None ile toplama yapıyordu.
```
