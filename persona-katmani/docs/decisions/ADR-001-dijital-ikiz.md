# ADR-001 · Persona dijital ikiz olacak (F-1)

Tarih: 2026-11-07 · Durum: Kabul edildi (proje sahibi)

## Karar

Persona Katmanı, müşterinin **her bir gerçek müşterisi için ayrı bir dijital ikiz** üretebilecek. İkiz, o kişinin
gözlemlenen davranış verisinden **istatistiksel olarak** kestirilen bir parametre vektörüyle (kayıptan kaçınma, zaman tercihi,
reklam toleransı, sosyal kanıt duyarlılığı, fiyat duyarlılığı vb.) tanımlanır; parametrelerin öncülleri (prior) literatürdeki
etki büyüklükleri ve bireysel farklılık bulgularından gelir (`data/davranis-etkileri.xlsx`).

Bu karar `FELSEFI-KARARLAR.md` F-1'deki ekibin (a) önerisinin yerine **(b)'nin ötesinde** bir seçimdir: segment örneği değil, birey ikizi.

## Sonuçları

- `02-persona-uretimi.md` §5'e `evidence_grounded_individual` sınıfı eklenir; en küçük birim artık hücre değil kişidir.
- `06-guven-gizlilik.md` §6'daki "gerçek kişiyi taklit engeli" ikiz için kaldırılır; yerine **rıza akışı, kişinin çıktıları görme ve
  silme hakkı, kiracı anahtarıyla şifreli kişi düzeyi depo** zorunlu olur. Bu iş 06'nın bir sonraki turunda tasarlanır.
- Yeni bölüm: `07-dijital-ikiz-istatistik.md` (kişi başı parametre kestirimi, hiyerarşik model, soğuk başlangıç, doğrulama).
- Rapor dili: ikiz çıktıları "bu kişinin modeli böyle davrandı" diye sunulur; kişinin kendisine atıf yapılmaz (F-1 dil kuralı korunur).
- Açık riskler: yeniden tanımlama, az veriyle aşırı kesin ikiz (shrinkage ile kontrol), kişilik hakkı (hukuki görüş gerekir).
