Uygulamaya "Notlar" özelliği eklemek istiyorum. AGENTS.md'deki "Yeni veri türü (varlık) — üreteçle" tarifini izle.

- Veri türü: notes. Görünen adı "Not", çoğulu "Notlar". Sayfanın adresi /notlar olsun.
- Alanlar:
  - title: başlık; zorunlu, en çok 120 karakter.
  - note: notun metni; isteğe bağlı, en çok 5000 karakter, varsayılanı boş.
  - pinned: not sabitlenmiş mi; evet/hayır, varsayılanı hayır.
- Notlar listesinde sabitlenmiş notlar her zaman en üstte dursun. Sabitlenmişler kendi aralarında, ötekiler de kendi aralarında order alanına göre (küçük olan üstte) sıralansın. Bu sıralamayı web/src/features/notes/logic.ts dosyasında sortNotes(notes) adlı bir işleve yaz ve liste sayfasında onu kullan.
- Not düzenleme ekranında etiketi "Sabitle" olan bir onay kutusu olsun; kaydedince pinned alanı güncellensin.

Denetim yeşil olsun.
