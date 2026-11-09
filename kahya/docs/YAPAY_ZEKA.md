# Yapay zekâ katmanı

Kâhya’da yapay zekâ “personelin yerine karar veren” değil, **işi hazırlayan ve onaya sunan** bir katmandır. Her işlem
`ai_actions` tablosuna yazılır; yönetici neyin otomatik, neyin onaylı yapılacağını Ayarlar’dan seçer.

## Görevler

| Görev               | Nerede                                | Motor          | Çıktı                                                                                                 |
| ------------------- | ------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Mesaj sınıflandırma | `services/inbox.ts` → `ai.triage`     | Claude / kural | niyet, kategori, aciliyet, özet, talep gerekir mi, blok/daire ipucu, güvenlik talimatı, yanıt taslağı |
| Sakin sorusu        | `services/assistant.ts` → `ai.answer` | Claude / kural | belge parçalarına ve hesap özetine dayalı yanıt, kullanılan kaynaklar, personele aktarılsın mı        |
| Duyuru taslağı      | `routes/ops.ts` → `ai.announcement`   | Claude / kural | başlık ve metin                                                                                       |
| Usta önerisi        | `services/tickets.ts`                 | kural          | uzmanlık + puan + açık iş yüküne göre sıralama                                                        |
| Banka eşleştirme    | `domain/matcher.ts`                   | kural          | blok/daire deseni + gönderen adı + beklenen tutar → güven puanı                                       |
| Ödeme hatırlatması  | `services/reminders.ts`               | şablon         | tutarlar sistemden gelir; model metin uydurmaz                                                        |
| Tutanak taslağı     | `services/meetings.ts`                | şablon         | katılım ve oylardan yeter sayı hesabıyla                                                              |
| Akıllı uyarılar     | `services/dashboard.ts`               | kural          | süre aşımı, geciken kontrol, 90+ gün borç, gider sıçraması                                            |

Para, tarih ve hukuki hesap gerektiren her şey **deterministik koddur**; dil modeli yalnız metni anlamak ve yazmak için kullanılır.

## Claude entegrasyonu

- İstemci: `@anthropic-ai/sdk`, `client.beta.messages.parse` + `betaZodOutputFormat(şema)` → çıktı Zod şemasıyla doğrulanır (`server/ai/claude.ts`).
- Model: varsayılan `claude-opus-5-5`; `KAHYA_AI_MODEL` ile değişir (yüksek hacimde `claude-haiku-5-5` düşünülebilir).
- Çaba (effort): sınıflandırma ve duyuru `low`, soru yanıtlama `medium`.
- Sunucu tarafı yedek model: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Model yine reddederse (`stop_reason: "refusal"`) ya da şemaya uymayan çıktı gelirse hata yakalanır ve **aynı görev kural motoruyla tamamlanır**; nedeni işlem günlüğüne yazılır.
- Sistem istemleri `server/ai/prompts.ts` içinde, değişmez metinlerdir (önbelleğe uygun). Değişken bilgi kullanıcı mesajında gelir.

## KVKK: maskeleme

`server/domain/pii.ts` modele gidecek metinde şunları yer tutucuyla değiştirir:

| Veri           | Yer tutucu    | Yöntem                                                                        |
| -------------- | ------------- | ----------------------------------------------------------------------------- |
| T.C. kimlik no | `[TCKN_1]`    | 11 hane + resmî sağlama algoritması                                           |
| IBAN           | `[IBAN_1]`    | TR + mod-97 doğrulaması                                                       |
| Kart numarası  | `[KART_1]`    | 13–19 hane + Luhn                                                             |
| Telefon        | `[TELEFON_1]` | Türkiye numara biçimleri                                                      |
| E-posta        | `[EPOSTA_1]`  | desen                                                                         |
| Kişi adları    | `[KISI_1]`    | gönderen ve ilgili kişilerin kayıtlı adları (Ayşe/Ayse/AYŞE farkına duyarsız) |

Eşleme tablosu sunucuda kalır; modelin yanıtındaki yer tutucular yerel olarak geri konur (“Merhaba [KISI_1]” → “Merhaba Ayşe Kaya”).
Maskelenen veri sayısı her işlemde kaydedilir ve arayüzde “KVKK: 3 veri maskelendi” olarak görünür.
Daire numarası, tutar ve tarih maskelenmez (sınıflandırma için gereklidir ve tek başına kimlik belirlemez).

> Maskeleme riski azaltır ama yurt dışına aktarım yükümlülüğünü tek başına ortadan kaldırmaz; bkz. [HUKUK_VE_UYUM.md](HUKUK_VE_UYUM.md).
> Veri hiç çıkmasın isteniyorsa `KAHYA_AI=kural` ile yalnız yerel motor çalışır.

## Özerklik (Ayarlar → Yapay zekâ özerkliği)

| İşlem                      | Kapalı            | Öneri (varsayılan)          | Otomatik                        |
| -------------------------- | ----------------- | --------------------------- | ------------------------------- |
| Gelen mesajdan talep açma  | talep açılmaz     | onay kuyruğuna düşer        | talep hemen açılır (varsayılan) |
| Gelen mesaja yanıt         | yanıt hazırlanmaz | taslak onay kuyruğuna düşer | yanıt aynı kanaldan gider       |
| Talebe usta atama          | öneri yok         | en uygun usta önerilir      | atanır, iş emri SMS’i gider     |
| Geciken aidat hatırlatması | hatırlatma yok    | günlük öneri listesi        | aşamasına göre gönderilir       |

**Acil durum istisnası:** gaz kokusu, yangın, su baskını, asansörde mahsur kalma, kıvılcım gibi durumlarda (öncelik `acil`)
talep ayardan bağımsız olarak **her zaman** açılır ve nöbetçi telefona SMS gider; güvenlik talimatı içeren yanıt, yanıt ayarı
“kapalı” değilse **onay beklemeden** gönderilir.

## Kural motoru

`server/ai/rules.ts` API anahtarı yokken ya da Claude’a ulaşılamadığında aynı şemayı üretir. Türkçe karakter farkına duyarsız
(“sızıntı” = “sizinti”), kelime başından eşleşir (“komşu” içindeki “su” tesisat sayılmaz), tehlike kelimeleri önceliklidir.
Test kümesi: `tests/unit/rules.test.ts`. Gerçek mesajlarla yeni örnekler ekleyerek geliştirilir.

## Maliyet tahmini (Claude)

Mesaj başına yaklaşık 1.200 girdi ve 400–600 çıktı token’ı (düşük çaba). Fiyatlar Ekim 2026 liste fiyatıdır; güncelini kontrol edin.

| Model              | Girdi / çıktı ($ / 1M token) | Mesaj başına | 1.000 daire × ayda 1,5 mesaj |
| ------------------ | ---------------------------- | ------------ | ---------------------------- |
| `claude-opus-5-5`  | 4 / 20                       | ≈ 0,015 $    | ≈ 22 $ / ay                  |
| `claude-haiku-5-5` | 0,10 / 0,50                  | ≈ 0,0004 $   | ≈ 0,6 $ / ay                 |

Gerçek tüketim her işlemde `ai_actions.input_tokens / output_tokens` olarak kaydedilir; Onaylar → İşlem günlüğü’nden izlenir.

## Kaliteyi ölçmek

1. Pilot sitelerden 200–300 gerçek (maskelenmiş) mesajı toplayın; doğru kategori, aciliyet ve “talep gerekir mi” etiketlerini personel girsin.
2. Bu kümeyi hem kural motoru hem Claude ile çalıştırıp doğruluk ve “acil kaçırma” oranını karşılaştırın (acil kaçırma sıfır olmalı).
3. Onay kuyruğundaki düzeltmeler (personelin değiştirdiği kategori/öncelik/metin) yeni örnek kaynağıdır.
4. Otomatik moda geçiş kademeli olsun: önce talep açma, sonra usta atama, en son yanıt gönderme.
