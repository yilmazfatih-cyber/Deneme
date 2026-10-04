# Karar günlüğü

Biçim:

```
### D-012 — Başlık
Durum: KABUL | ÖNERİ | RET     Sahip: ajan     Tarih: YYYY-AA-GG
Karar: ...
Gerekçe: ...
Etkilenen: ...
```

---

### D-001 — Proje, Deneme reposunda `minik-usta/` alt klasöründe yaşar
Durum: KABUL     Sahip: orkestratör     Tarih: 2026-10-04
Karar: Minik Usta ayrı bir GitHub reposu yerine `yilmazfatih-cyber/Deneme` reposunun `minik-usta/` klasöründe, `claude/determined-bardeen-3j767o` dalında geliştirilir. Klasör kendi `package.json`, `CLAUDE.md` ve `.claude/agents/` dosyalarıyla bağımsızdır; ileride olduğu gibi ayrı repoya taşınabilir. Brifteki "git init" adımı, mevcut repo kullanıldığı için uygulanmadı.
Gerekçe: Proje sahibi yeni repo istedi; oturumun repo oluşturma izni yok (GitHub 403). Kökte Köprü projesi yaşadığı için kökü değiştirmek Köprü'yü bozardı.
Etkilenen: tüm yollar `minik-usta/` köküne göredir; kök `.prettierignore` ve `eslint.config.js`'e `minik-usta` yok sayma satırı eklendi.

### D-002 — Teknik yığın sürümleri (npm'den doğrulandı, 2026-10-04)
Durum: KABUL     Sahip: code-lead     Tarih: 2026-10-04
Karar: phaser 4.2.1 (latest), vite 8.3.2, vitest 5.0.3, eslint 10.12.0, typescript-eslint 8.71.0, prettier 3.9.9, @playwright/test 1.63.0; typescript **6.0.3** (latest 7.0.2 değil).
Gerekçe: `npm view <paket> version`. typescript-eslint 8.71.0 peer bağımlılığı `typescript >=4.8.4 <6.1.0`; TS 7 ile lint kırılır. Phaser 4 güncel kararlı ana sürümdür (dist-tag `latest`).
Etkilenen: package.json, docs/TECH_DESIGN.md

### D-003 — `src/theme/tokens.json` design-lead'indir
Durum: KABUL     Sahip: orkestratör     Tarih: 2026-10-04
Karar: `src/**` code-lead'in olsa da `src/theme/tokens.json` design-lead'e aittir (ajan tanımları böyle). Kod bu dosyayı yalnızca okur.
Gerekçe: İki ajan tanımı arasındaki sahiplik çakışmasını açıkça çözmek.
Etkilenen: CLAUDE.md sahiplik matrisi
