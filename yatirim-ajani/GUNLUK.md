# "Bugün neye yatırılır" — istek üzerine oturum yönergesi

Bu oturum kullanıcı istediğinde (günde bir ya da daha seyrek) Claude Code içinde çalışır; aboneliği
kullanır, API anahtarı yok. Çıktı: **bugün / bu saat** için hisse bazlı, olasılıklı öneriler ve bir
GitHub Issue. Sanal portföy ve tahmin karnesi içindir; emir kullanıcı tarafından Midas'ta verilir.

Roller ve bütçe `EKIP.md` ile aynıdır (baş = bu oturum; analist opus, mühendis sonnet, stajyer haiku;
en fazla 8 alt görev). Fark: ufuk haftalık değil **bugün + gece + bu hafta**.

## Akış

1. **Veri.** `ajan-ciktilari` dalını çek (EKIP.md 1. adım). Son çubuk 2 günden eskiyse Actions
   "Yatırım ajanı" → `veri-egitim` tetikle ve bekle.
2. **Hafıza.** Bilgi veritabanı:
   - `python -m yatirim_ajani bilgi-sorgu --son 30` → son 30 günün olayları ve anlamları
   - `python -m yatirim_ajani bilgi-sorgu --kapsam yerel_makro --son 90 --kisa` → makro rejim
   - `python -m yatirim_ajani bilgi-benzer --k 3` → bugünkü sayısal duruma benzeyen geçmiş olaylar ve
     "o zaman sonraki 20 günde ne oldu" (takip_20g). Bu, geçmiş veri katsayısıdır: benzer durumda kitle
     nasıl davranmış, sonrası ne olmuş. Kanıt değil, önsel.
3. **Model ve simülasyon.** `raporlar/egitim-*.md` ve `raporlar/simulasyon-*.md` dosyalarını mühendise
   yorumlat. Temel gerçekler (Kas 2024–Kas 2026 verisinde): BIST'te kazanç gecede oluşur, gün içi
   açılış→kapanış ortalaması negatiftir; her gün al-sat maliyetle ölür; saatlik yön tahmini test
   günlerinde sıfır korelasyonludur. Bu yüzden öneriler **gece/haftalık tutma** eksenlidir; saatlik
   katman yalnız giriş-çıkış zamanlaması ve "işlem yok" kararı içindir.
4. **Bugünün haberleri.** Stajyer: KAP bildirimleri (son 24–48 saat), TCMB/makro takvim, küresel risk
   (ABD endeksleri, Brent, DXY), sektör haberleri. Yalnız bugüne kadar olanlar.
5. **Tezler.** Analist her aday hisse için: karar (AL/TUT/SAT/IZLE), olasılık, ufuk (`ufuk_gun`: gece
   için 1, hafta için 5, ay için 30), eşik getiri, gerekçe (yönetim kalitesi ayrı başlık), riskler,
   kaynaklar. Ayrı bir satır: **gece taşınsın mı?** (evet/hayır + neden). Kurallar: kanıtsız olasılık
   0,50'ye yakın; 0,80 üstü neredeyse hiç; AL için > 0,55; maliyet sonrası beklenen < %0,5 ise
   "işlem yok".
6. **Kaydet.** Tez JSON → `python -m yatirim_ajani tez-yukle <dosya> --piyasa bist`. Yeni öğrenilen
   anlamlı olaylar → `bilgi_kaynak/gunluk-YYYYMMDD.json` (Olay şeması, `bilgi/sema.py`) →
   `python -m yatirim_ajani bilgi-yukle <dosya>`.
7. **Yayınla.** `veri/ajan.db`, `raporlar/`, `bilgi_kaynak/` → `ajan-ciktilari` dalına commit+push
   (yalnız bu dal). Rapor `raporlar/gunluk-bist-YYYYMMDD-HHMM.md`; GitHub Issue: başlık
   "Bugün neye yatırılır — YYYY-MM-DD HH:MM", etiket `gunluk-oneri`.

## Rapor biçimi

- Tarih-saat, piyasa durumu (1 cümle), bilgi veritabanından en benzer geçmiş olay ve sonrası.
- Tablo: hisse | karar | olasılık | ufuk | gece taşı? | beklenen net | gerekçe (1 satır).
- "İşlem yok" listesi ve nedenleri.
- Karne: çözülmüş tahmin sayısı, Brier, beceri skoru.
- Uyarı: yatırım tavsiyesi değildir; sanal portföy; öneri uygulanmasa da sanal hesap uygulanmış sayar.
