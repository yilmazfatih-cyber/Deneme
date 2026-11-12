# Beceri değerlendirme düzeneği — "bu beceri gerçekten işe yarıyor mu?"

superpowers'ın en önemli fikri bir beceriyi **test edilebilir bir şey** saymasıdır: "Beceri yazmak, süreç
belgelerine uygulanmış test güdümlü geliştirmedir" (`skills/writing-skills/SKILL.md`). Önce becerisiz bir ajanın
nasıl başarısız olduğunu gör (KIRMIZI), sonra beceriyi yaz ve ajanın uyduğunu gör (YEŞİL), sonra açıkları kapat.
Bu mini o düzeneği çevrimdışı kurar: senaryolu bir sahte model, bir kum havuzu, transkript iddiaları, beceriyle ve
becerisiz koşuların istatistiksel karşılaştırması ve superpowers'ın oturum başı kancasının JSON çıktısı.

## Gereksinimler

- Python 3.10+; dış paket yok. Ortak çekirdeği ([anthropic-skills/sifirdan](../../anthropic-skills/sifirdan/README.md))
  `_cekirdek.py` üzerinden kullanır; kopyalamaz.
- Gerçek LLM yok: `sahte_model.py` bağlamdaki ifadelere göre davranış olasılıklarını değiştiren, tohumlu bir modeldir.
  Olasılık tablosu **uydurmadır**; gerçek modellerin davranışını iddia etmez. Öğrettiği şey düzenektir.

## Çalıştırma

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/superpowers/sifirdan
python3 kos.py transkript --tohum 2               # becerisiz tek koşu
python3 kos.py transkript --tohum 2 --beceriyle   # aynı tohum, beceri bağlamda
python3 kos.py karsilastir --kosu 40              # ortalama ± sapma ve fark tablosu
python3 kos.py kirmizi-yesil                      # RED → GREEN kararı
python3 kos.py ifade                              # aynı yönergenin iki yazımı + kontrol grubu
python3 kos.py kanca --ortam cursor               # oturum başı kancasının harness'e göre çıktısı
python3 kos.py kanca --alt-ajan                   # alt ajana enjeksiyon yok
```

## Test

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/superpowers/sifirdan
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -t .
```

17 test: iddia işlevleri, sahte model ve kum havuzu, ölçümler, istatistik, RED/GREEN kararları, ifade karşılaştırması,
kanca biçimleri, JSON kaçışı ve karakter sınırı.

## Aşamalar

Numaralar [dosyadaki](../README.md#4-sıfırdan-yol-dallanma) "Sıfırdan yol" aşamalarıyla aynıdır.

| #   | Dosya                             | Ne yapar                                                                                                   | Öğrendiğin kavram                                               |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | `baslangic_kancasi.py`            | Önyükleme becerisini sarar, harness'e göre JSON yazar, alt ajanı atlar, karakter sınırı uygular            | `hooks/session-start` ve "önyükleme tüm entegrasyondur"         |
| 2a  | `sahte_model.py`                  | Görev için eylem listesi üretir; 3 davranış (test önce, doğrula, cerrahi) bağlama göre olasılık değiştirir | Beceri davranışı _olasılıkla_ kaydırır; tek koşu kanıt değildir |
| 2b  | `kum_havuzu.py`                   | Eylemleri bellekteki çalışma alanına uygular; "testler" komutu kaldı/geçti döndürür                        | Transkript + çalışma alanı farkı = gözlenebilir davranış        |
| 3   | `degerlendirme.py`                | `iceriyor`, `icermiyor`, `sayi`, `sira` iddiaları; `olc()` metrikleri                                      | superpowers `tests/claude-code/test-helpers.sh` iddiaları       |
| 4   | `degerlendirme.karsilastir`       | Aynı tohumlarla beceriyle/becerisiz N koşu; ortalama, n−1 sapma, fark                                      | skill-creator `aggregate_benchmark.py`                          |
| 5   | `degerlendirme.kirmizi_yesil`     | Kontrol zaten geçiyorsa "GEREKSİZ", beceriyle ≥ 0.8 ise "YEŞİL", yoksa "KIRMIZI"                           | writing-skills RED-GREEN-REFACTOR                               |
| 6   | `degerlendirme.ifade_karsilastir` | Aynı yönergenin yazımlarını kontrol grubuyla kıyaslar                                                      | "Micro-test wording": varyans da bir metriktir                  |

Örnek çıktı (`karsilastir --kosu 40`, `kirmizi-yesil` ve `ifade`; aynı tohumlar, tablo ayırıcı satırları atlandı):

```text
| Metrik        | Beceriyle   | Becerisiz   | Fark  |
| gecme_orani   | 0.82 ± 0.38 | 0.07 ± 0.27 | +0.75 |
| test_once     | 0.93 ± 0.27 | 0.28 ± 0.45 | +0.65 |
| dogrulandi    | 0.93 ± 0.27 | 0.17 ± 0.38 | +0.75 |
| ilgisiz_dosya | 0.07 ± 0.27 | 0.57 ± 0.50 | -0.50 |
| diff_satir    | 8.18 ± 1.36 | 8.68 ± 3.18 | -0.50 |
YEŞİL: beceri davranışı değiştiriyor. (becerisiz 0.07, beceriyle 0.82)
kontrol (yönergesiz)  test_once = 0.35 ± 0.49
yasak biçimi          test_once = 0.50 ± 0.51
tarif biçimi          test_once = 0.90 ± 0.31
```

İki ders: (1) "geçti" üç davranışın **birlikte** görülmesini ister; her biri %93 olsa bile birleşik oran düşer, bu
yüzden bileşik iddialar zorlayıcıdır. (2) Yalnızca yasak biçimindeki tek cümle ("Test yazmadan kod yazma.") KIRMIZI
kalır; superpowers'ın "biçimi başarısızlığa uydur" bölümündeki gözlemin (yasak, şekil sorunlarında geri teper) oyuncak
bir yansıması. Gerçek modelde bunu ancak kendi ölçümün söyler.

## Eşleme tablosu

| Mini'deki parça                    | Gerçek depodaki karşılığı (obra/superpowers, `22f0b46`)                                 | Fark                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `sahte_model.SahteModel`           | Gerçek ajan oturumu (`claude -p`, tmux içinde Codex/Gemini)                             | Tohumlu olasılık tablosu; dil anlamaz                |
| `degerlendirme.iceriyor/sira/sayi` | `tests/claude-code/test-helpers.sh` (`assert_contains`, `assert_order`, `assert_count`) | Türkçe kurallı harf küçültme (`KALDI` → `kaldı`)     |
| `kirmizi_yesil`                    | `skills/writing-skills/SKILL.md` "RED-GREEN-REFACTOR for Skills"                        | Eşikler (0.5 / 0.8) bizim seçimimiz                  |
| `ifade_karsilastir`                | `skills/writing-skills/SKILL.md` "Micro-Test Wording Before Full Scenarios"             | Önerilen 5+ tekrar yerine 20 tekrar, otomatik        |
| `karsilastir`                      | anthropics/skills `skill-creator/scripts/aggregate_benchmark.py`                        | Zaman/token yerine davranış metrikleri               |
| `baslangic_kancasi.kanca_ciktisi`  | `hooks/session-start` (Cursor / Claude Code / SDK biçimleri)                            | Python `json.dumps` kaçışı; bash betiği elle kaçırır |
| `oturum_basi(... parentID)`        | `.opencode/plugins/superpowers.js` alt oturum algılama, SKILL.md'deki `<SUBAGENT-STOP>` | Tek alan kontrolü                                    |
| `VARSAYILAN_SINIR = 8000`          | ECC README `ECC_SESSION_START_MAX_CHARS` varsayılanı                                    | superpowers'ta karakter sınırı yok                   |
| Gerçek davranış evalleri           | `evals/` (ayrı depo superpowers-evals; bu depoda `.gitignore` ile dışarıda)             | Bu atlasta incelenmedi                               |
