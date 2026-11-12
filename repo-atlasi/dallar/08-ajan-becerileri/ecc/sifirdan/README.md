# Çok harness'li üretici — tek kaynak, beş hedef, sahiplik durumu

ECC (`affaan-m/ECC`, commit `d2ef268`) aynı içeriği 16 kurulum hedefine kurar (15 harness; Claude Code için ev ve
proje ayrı hedeflerdir). Bunu her harness için ayrı elle yazılmış dosyalarla değil, bir **kurulum planlayıcısıyla**
yapar: `manifests/install-modules.json` modülleri, `manifests/install-profiles.json` profilleri,
`scripts/lib/install-targets/` altındaki adaptörler ise her hedefin dosyaları nereye ve hangi dönüşümle yazdığını
tanımlar; kurulum bir durum dosyası tutar (Claude hedeflerinde `.claude/ecc/install-state.json`, ötekilerde hedef
kökünde `ecc-install-state.json`).
Bu mini aynı fikrin küçük bir modelidir: `kaynak.json` → adaptörler → plan → uygula / denetle / kaldır.

## Gereksinimler

- Node.js 22 (yalnızca yerleşik modüller: `node:fs`, `node:path`, `node:crypto`, `node:util`, `node:url`; testlerde
  ayrıca `node:test`, `node:assert/strict`, `node:os`).
- ESM; klasördeki `package.json` `"type": "module"` der.

## Çalıştırma

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/ecc/sifirdan
node cli.js plan                                   # 22 dosyalık plan (özet + hedef + yol)
node cli.js plan --hedefler codex,gemini
node cli.js uygula --cikti /tmp/ornek-proje        # yaz + .beceri-kurulum.json
node cli.js denetle --cikti /tmp/ornek-proje       # eksik / eski / elle değişmiş / sahipsiz / yetim
node cli.js kaldir --cikti /tmp/ornek-proje        # yalnızca kendi yazdığı ve değişmemiş dosyaları siler
node cli.js icgudu --yigin python --proje ornek-proje
```

## Test

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/ecc/sifirdan && node --test
# ya da depo kökünden: node --test 'repo-atlasi/dallar/08-ajan-becerileri/ecc/sifirdan/test/*.test.js'
```

Node 22'de `node --test <klasör>` klasörü değil dosya kalıbını bekler; bu yüzden ya klasörün içinden `node --test`
ya da yukarıdaki kalıp kullanılır. 24 test: kaynak doğrulama, beş adaptör, taşınabilirlik dönüşümü, çakışma, kurulum
(ilk kurulum, yeniden kurulum, kullanıcı dosyası, elle değişiklik, yetim dosya), denetim, kaldırma, güvenli yol,
içgüdü seçimi ve komut satırı.

## Ne üretilir?

| Hedef            | Dosyalar                                                                                           | Biçimin kaynağı (klonda görülen)                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `claude`         | `CLAUDE.md`, `.claude/skills/<ad>/SKILL.md`                                                        | ECC `scripts/lib/install-targets/claude-project.js` (kök `.claude`, beceriler `skills/`)                  |
| `claude-eklenti` | `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/<ad>/SKILL.md`            | ECC `.claude-plugin/PLUGIN_SCHEMA_NOTES.md`: `version` zorunlu, `skills` dizi, `agents`/`hooks` alanı yok |
| `codex`          | `AGENTS.md`, `.agents/skills/<ad>/SKILL.md`, `.agents/skills/<ad>/agents/openai.yaml`              | ECC `.agents/skills/`, mattpocock `agents/openai.yaml`, ECC host-compat izin listesi                      |
| `cursor`         | `.cursor/rules/<proje>.mdc` (`alwaysApply: true`), `.cursor/rules/<ad>.mdc` (`alwaysApply: false`) | karpathy-skills `.cursor/rules/*.mdc`, ECC `.cursor/rules/*.md` (`description`, `globs`, `alwaysApply`)   |
| `gemini`         | `GEMINI.md`, `gemini-extension.json` (`contextFileName`)                                           | superpowers `gemini-extension.json` + `GEMINI.md`                                                         |

Aynı içerik her hedefe kendi kurallarıyla gider: kullanıcı-çağırır `surum-notu` becerisi Claude kopyasında
`disable-model-invocation: true` ve `argument-hint` taşır; Codex kopyasında bu alanlar ön bilgiden çıkar ve
`agents/openai.yaml` içine `policy.allow_implicit_invocation: false` olarak geçer; Gemini talimat dosyasına hiç
gömülmez. Kabuk bloklarındaki `${CLAUDE_PROJECT_DIR}` Claude dışındaki hedeflerde `$(pwd)` olur; karşılığı olmayan
Claude değişkenleri (`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}` …) uyarı üretir. Üretilen becerileri dalın Python çekirdeğiyle
denetledik: `.claude/skills/*` `claude-code` profilinde, `.agents/skills/*` `codex-kopya` profilinde geçerli.

## Sahiplik durumu: neden gerekli?

`uygula` her yazdığı dosyanın SHA-256 özetini `.beceri-kurulum.json` içine yazar. Bu küçük kayıt üç kuralı mümkün kılar:

1. **Kullanıcının dosyasına dokunma.** Diskte olan ama bizim yazmadığımız bir `CLAUDE.md` atlanır (`--zorla` hariç).
   superpowers'ın taşıma kılavuzundaki ikinci kural ve ECC'nin "mevcut kullanıcı ayarları korunur" yaklaşımı.
2. **Elle değiştirileni ezme.** Bizim yazdığımız ama sonradan elle değiştirilen dosya güncellenmez, raporlanır.
3. **Yetimi temizle, ama yalnızca değişmemişse.** Kaynaktan bir beceri silinince onun dosyaları kaldırılır.

`denetle` hiçbir şey yazmadan beş durumu ayırır: `eksik`, `eski` (kaynak değişti, dosya bizim ve dokunulmamış),
`elle_degismis`, `sahipsiz`, `yetim`. ECC deposunda gözlediğimiz türden bir sapmayı (aynı becerinin `skills/`,
`.agents/skills/` ve `.kiro/skills/` kopyalarının farklı uzunlukta olması), kendi ürettiğimiz dosyalar için otomatik
yakalamanın küçük bir modelidir.

## İçgüdüler (aşama 7)

`icguduler.js` ECC'nin oturum başında öğrenilmiş içgüdüleri seçme kuralını modeller (README'deki varsayılanlar: en
fazla 6 içgüdü, güven eşiği 0.7, 8000 karakter; proje kapsamlı ve yığınla eşleşenlere "küçük bir sıralama artışı").
Artışın miktarı belgede yok; buradaki +0.10 / +0.05 bizim seçimimizdir. Başka projenin kuralının sızmaması bilinçli
bir denetimdir: ECC v2.1'in "proje kapsamlı içgüdüler, çapraz proje bulaşmasını önlemek için" notunun karşılığı.

## Eşleme tablosu

| Mini'deki parça            | Gerçek depodaki karşılığı (affaan-m/ECC, `d2ef268`)                                                    | Fark                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `kaynak.json`              | `manifests/install-modules.json` + `install-profiles.json` + depo içeriği                              | Tek dosya; modül/profil yok                                     |
| `ADAPTORLER`               | `scripts/lib/install-targets/registry.js` + `helpers.js` `createInstallTargetAdapter`                  | 16 yerine 5 hedef; ev/proje kökü seçimi yok                     |
| `planla()`                 | `planInstallTargetScaffold` → `planOperations`                                                         | Çakışmada hata (ECC'de son kopya kazanır, kaynak yorumuna göre) |
| `tasinabilirYap()`         | `scripts/ci/validate-skill-host-compat.js` (yalnızca denetler)                                         | Biz dönüştürüyoruz; ECC CI'da hatayı yakalıyor                  |
| `uygula()` / durum dosyası | `scripts/lib/install/apply.js`, `scripts/lib/install-state.js`, `scripts/lib/install/guarded-write.js` | Tek dosya, tek kök                                              |
| `guvenliYol()`             | `scripts/lib/install/contained-fs.js`                                                                  | Sembolik bağlantı ve `..` denetimi                              |
| `denetle()`                | `scripts/ci/validate-*.js`, `validate-hooks.js` parmak izi fikri                                       | Diske karşı sapma raporu                                        |
| `icguduler.js`             | `skills/continuous-learning-v2/`, README SessionStart ayarları                                         | JSON biçimi; gözlemci ajan yok                                  |
