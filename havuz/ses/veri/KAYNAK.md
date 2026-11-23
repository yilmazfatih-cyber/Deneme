# veri/ — kaynak kaydı

| Dosya | Ne | Kaynak / lisans |
| --- | --- | --- |
| `gidis_donus.jsonl` | 20 kısa, gündelik Türkçe sınama cümlesi (sayı, tarih, saat, para, yüzde, telefon, kısaltma) | Bu temel için elle yazıldı (2026-11-23); eğitim verisi DEĞİL, sınama metnidir. Temelin lisansıyla (MIT) |

`scripts/gidis_donus.py` bu cümleleri seslendirir, yeniden yazıya çevirir ve ölçer.
Kendi kayıtlarınızla ölçmek için aynı biçimde `ses` alanlı bir JSONL yazın (AGENTS.md tarifi).
