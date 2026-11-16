# Depo haritası — model talimatları

Bu depo birden çok bağımsız proje içerir. Hangi klasörde çalışıyorsan önce **o klasörün** talimat dosyasını oku;
projeler birbirinin dosyasını değiştirmez.

| Klasör           | Proje                                                                | Önce oku                                        |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| kök (`src/` …)   | Köprü: afazili yetişkinler için iletişim panosu (PWA)                | `CLAUDE.md`                                     |
| `havuz/`         | Temeller havuzu: uygulama, site, dil modeli, veri, ML, bilgi notları | `havuz/AGENTS.md`, sonra temelin `AGENTS.md`'si |
| `bolus/`         | Bölüş: ev içi ortak harcama (derlemesiz)                             | `bolus/README.md`                               |
| `tvplus/`        | TV+ akış uygulaması denemesi                                         | `tvplus/README.md`                              |
| `moda-radar/`    | Moda Radar: sezon tahmini ve yatırım kararı                          | `moda-radar/CLAUDE.md`                          |
| `ozetci/`        | 1B altı açık modellerle PDF/e-posta özetleyici                       | `ozetci/README.md`                              |
| `ai-platform/`   | Yerel yapay zekâ platformu (ERP eklentisi)                           | `ai-platform/README.md`                         |
| `yatirim-ajani/` | Hisse araştırma ve sanal işlem ajanı                                 | `yatirim-ajani/README.md`                       |

Ortak kurallar:

1. Değişikliği tek projenin klasöründe tut.
2. O projenin denetim komutu yeşil olmadan işi bitmiş sayma; çıktısını göster.
3. Testi silme, atlama ya da gevşetme; uydurma komut, paket, sürüm yazma.
4. Kullanıcıya görünen metin Türkçe; Türkçe büyük/küçük harf için `havuz/bilgi/97-turkce/buyuk-kucuk-harf.md`.
5. Sır yazma; kullanıcı istemeden `git push` yapma.
