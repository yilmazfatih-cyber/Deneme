# KVKK tasarımı

Platformun KVKK yaklaşımı tek cümleyle: **kişisel veri, kişinin bilgisayarından maskelenmeden çıkmaz; sunucu
şirket içindedir; hiçbir veri internete gitmez; her çağrı denetim günlüğüne yazılır; ERP'ye otomatik yazma yoktur.**

## Veri akışı

```
çalışan PC                                   GPU sunucu (şirket içi)
──────────                                   ──────────────────────
metin ──► KVKK Kalkanı ──► maskeli metin ───► modül / ana model ───► maskeli yanıt
            │  eşleme (mapping_id)                                        │
            │  yalnız PC'de, şifreli, süreli                               │
            └──────────────────────── geri açma (unmask) ◄────────────────┘
```

- **Kural tabanlı tanıyıcılar** (`kvkk/recognizers.py`): TCKN (11 hane + sağlama algoritması), VKN (10 hane +
  sağlama), TR IBAN (mod-97), telefon, e-posta, plaka. Sağlama algoritmaları yanlış pozitifleri düşürür.
- **Varlık tanıma** (GLiNER multi-PII, Apache-2.0): ad-soyad, adres, kurum, doğum tarihi, sağlık bilgisi gibi
  serbest metin varlıkları. Etiketler ayarlanabilir.
- **Yer tutucular** tutarlıdır (`<KISI_1>` aynı kişi için aynı kalır), böylece model bağlamı kaybetmez.
- **Eşleme** `mask_mappings` tablosunda, `cryptography` kuruluysa Fernet ile şifreli, `AIP_AUDIT_RETENTION_DAYS`
  sonra silinir. Sunucuya `mapping_id` gönderilmez.
- Maskeleme zorunluluğu modül kataloğunda bildirilir (`kvkk.masking_required`); yerel çalışan modüllerde
  (hesap motoru, Docling, sınıflandırma) metin bilgisayarı terk etmediği için zorunlu değildir.

## İlkeler ve teknik karşılıkları

| İlke | Karşılığı |
| --- | --- |
| Veri yerelliği | Tüm modeller şirket içi sunucuda; dış ağ yalnız kurulumda (model indirme) gerekir; sonrası kapatılabilir |
| Veri minimizasyonu | İstemci tarafı maskeleme; sunucu yalnız maskeli metin görür |
| Amaç sınırlaması | Her modülün `kvkk.purpose` alanı VERBİS envanter kalemidir; mağaza kartında görünür |
| Özel nitelikli veri | `kvkk.special_categories=true` modüller (OCR, ses, KVKK Kalkanı) arayüzde ayrıca uyarır; sağlık/sendika/din etiketleri GLiNER'da açık |
| Aydınlatma ve rıza | Ses kaydı modülü açık rıza ister (kurulum sihirbazı not düşer); ses klonlama platformda yoktur |
| Denetim izi | `audit_log`: zaman, kullanıcı, modül, eylem, model, süre, maskelenen varlık sayısı, durum, içerik özeti (hash). İçerik yazılmaz |
| Saklama ve imha | Günlük ve eşlemeler süre sonunda silinir (`purge_expired`) |
| İnsan gözetimi | ERP'ye yazan her eylem `approvals` kuyruğunda; finans hesapları deterministik kodda; ajanın yazma araçları onaylı |
| Tedarik güvenliği | Katalogdaki her model HF API ile doğrulandı (`docs/model_dogrulama_2026-11-08.json`); yalnız safetensors/GGUF, pickle yok; lisans sınıfı `noncommercial` olan model kataloğa giremez (şema reddeder) |
| Kötüye kullanım | Güvenlik Denetimi modülü (Granite Guardian) prompt injection ve politika dışı istekleri geçitte durdurur |

## Müşteri bazında doldurulacaklar

1. Veri işleme envanteri: kurulu modüllerin `purpose`, `data_categories`, `retention_days` alanlarından
   `GET /api/audit/summary` ve katalog ile üretilir.
2. Aydınlatma metni ekleri: yapay zekâ destekli işleme, ses kaydı, görüntü işleme maddeleri.
3. Erişim matrisi: ERP rolleri → modül paketi (Finans → Finans Analisti vb.).
4. Saklama süresi kararı: `AIP_AUDIT_RETENTION_DAYS` (varsayılan 30).
5. Sızma testi: Güvenlik Denetimi test seti ile düzenli tarama.

## Platformun yapmadıkları

- Kişisel veriyi internete, bulut API'lerine veya üçüncü tarafa göndermez.
- ERP'ye onaysız yazmaz.
- Finansal sonuçları modele hesaplatmaz.
- Ses klonlamaz, biyometrik veri işlemez.
