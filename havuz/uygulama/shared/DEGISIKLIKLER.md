# Ortak sözleşme değişiklik günlüğü

`shared/` paketi sunucu ile istemcinin ortak sözleşmesidir. Burada yapılan her değişiklik iki tarafı da etkiler.
Bir şeyi değiştiren, en üste tarihli bir satır ekler: ne değişti, öteki taraf ne yapmalı.

Kurallar:

- Var olan bir dışa aktarımın **anlamını değiştirmeyin**; yeni ad ekleyin.
- Değişiklikten sonra `npm run test -w @uygulama/shared` yeşil kalmalıdır.
- Eşitleme davranışı değişiyorsa önce `src/testing/conformance.ts` içine senaryo ekleyin.

## Günlük

- 2026-11-16 — (api ekibi) EKLENDİ, geriye uyumlu: `adminMetricsResponseSchema` + `AdminMetricsResponse` türü ve
  `API_PATHS.adminMetrics` (`GET /api/admin/metrics`, yalnız yönetici). Web: yönetim ekranında göstermek
  isterseniz bu şemayla okuyun; başka bir şey yapmanız gerekmez.
- 2026-11-16 — İlk sürüm: varlıklar (lists, tasks), API şemaları, eşitleme protokolü v1, başvuru sunucusu ve
  uygunluk testleri.
