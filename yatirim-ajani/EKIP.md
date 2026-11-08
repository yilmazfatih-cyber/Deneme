# Haftalık ekip oturumu — Claude Code yönergesi

Bu belge, pazartesi sabahları çalışan Claude Code zamanlanmış görevinin izlediği yönergedir.
Araştırma Claude Code içinde yapılır (abonelik); Anthropic API anahtarı kullanılmaz.
Dil modeli yalnız **haftalık tez** üretir; saatlik işlem kararları ve risk sınırları koddadır.

## Roller

| Rol             | Model                                 | İş                                                               |
| --------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Baş (bu oturum) | Fable 5.1 (yoksa Opus 5.5)            | Plan, görev dağıtımı, çelişki çözümü, nihai tez                  |
| Analist         | Opus 5.5 (Agent aracı, `model: opus`) | Değerleme, yönetim kalitesi, tez taslağı                         |
| Mühendis        | Sonnet 5.5 (`model: sonnet`)          | Eğitim sonucu ve ödül günlüğü yorumu; sızıntı/aşırı uyum uyarısı |
| Stajyer         | Haiku 5.5 (`model: haiku`)            | Fiyat özetleri, KAP bildirimleri, haber taraması; yorum yapmaz   |

Bütçe: en fazla **8 alt görev**. Önce stajyer toplar, sonra analist yazar; mühendise yalnız yeni eğitim
çıktısı varsa danışılır. Baş kendi başına uzun araştırma yapmaz; dağıtır ve karar verir.

## Akış

1. **Veriyi al.** Kod dalında çalışıyorsun; veriler `ajan-ciktilari` dalında:
   ```bash
   git fetch origin ajan-ciktilari && git worktree add /tmp/cikti origin/ajan-ciktilari
   cp -r /tmp/cikti/veri yatirim-ajani/ && cp -r /tmp/cikti/raporlar yatirim-ajani/ 2>/dev/null || true
   cd yatirim-ajani && pip install -e . -q
   ```
   Veri yoksa (ilk hafta) GitHub Actions'taki "veri ve eğitim" işini `gh workflow run` ile tetikle, bitmesini bekle.
2. **Durumu oku.** `python -m yatirim_ajani rapor --piyasa bist` (sanal portföy, son tezler, karne).
   `raporlar/egitim-*.md` varsa son eğitim özetini oku.
3. **Evreni belirle.** `ayarlar.py` içindeki `evren["bist"]` ve `saglam_cekirdek`; `tez_notu` kullanıcının tezidir.
   Çekirdek bir güven işaretidir, zorunlu ağırlık değildir. Ölçüt büyüklük değil **yönetim kalitesi**dir.
4. **Dağıt.** Stajyer: her hisse için fiyat özeti (`fiyat_ozeti` yerine CSV'den: son kapanış, 1 hafta/1 ay/3 ay
   getiri, 52 hafta zirve/dip) + son 7 günün KAP bildirimleri ve haberleri (WebSearch). Analist: hisse başına
   tez taslağı; gerekçede **yönetim kalitesi ayrı başlık** (ana ortak, sicil, sermaye tahsisi, azınlık hissedara
   tutum, KAP disiplini). Mühendis: eğitim çıktısında test günleri masraf sonrası pozitif mi, tahmin-gerçek
   korelasyonu, eşik taraması; "işlem önermiyor" sonucu da geçerli bir sonuçtur.
5. **Karar ver.** Her hisse için tek tez. Kurallar:
   - Olasılık = "ufuk_gun içinde en az esik_getiri getiri" önermesinin olasılığı. Kanıt yoksa 0,50'ye yakın;
     0,65 üstü için somut kanıt; 0,80 üstü neredeyse hiç.
   - AL için olasılık > 0,55; SAT için < 0,45. Emin değilsen IZLE.
   - Karar anından sonrasını kullanma (zaman kuralı). Web sonuçlarında tarihi kontrol et.
   - Adil değer bir ARALIK; veri yetmiyorsa null bırak ve gerekçede söyle.
6. **Kaydet.** Tezleri şu biçimde `raporlar/ekip-bist-YYYYMMDD.json` dosyasına yaz, sonra yükle:
   ```json
   {
     "an": "2026-11-10T08:30:00+03:00",
     "haftalik_not": "…",
     "tezler": [
       {
         "hisse": "ASELS",
         "karar": "AL",
         "olasilik": 0.6,
         "ufuk_gun": 30,
         "esik_getiri": 0.0,
         "adil_deger_alt": null,
         "adil_deger_ust": null,
         "ozet": "…",
         "gerekce": "…",
         "riskler": ["…"],
         "kaynaklar": ["…"]
       }
     ]
   }
   ```
   ```bash
   python -m yatirim_ajani tez-yukle raporlar/ekip-bist-YYYYMMDD.json --piyasa bist
   ```
7. **Yayınla.** `veri/ajan.db` ve `raporlar/` klasörünü `/tmp/cikti` içine kopyala, `ajan-ciktilari` dalına
   commit et ve push et (yalnız bu dal; kod dallarına dokunma). Sonra `raporlar/ekip-bist-YYYYMMDD.md`
   içeriğiyle bir GitHub Issue aç: başlık `Haftalık ekip raporu — YYYY-MM-DD`, etiket `ekip-raporu`.
   Kullanıcı (yilmazfatih-cyber) bu yetkiyi 2026-11-08'de verdi: veri dalına push ve Issue açma serbest;
   başka hiçbir dış eylem yok, gerçek emir yok.

## Yapma

- Gerçek para, emir, aracı kurum işlemi yok; bu yalnız sanal portföy ve tahmin karnesi içindir.
- Kod dosyalarını değiştirme; hata görürsen Issue'da yaz.
- Kullanıcının tezini sorgulamaktan çekinme ama veri olmadan yeniden yazma.
- Kullanım sınırına yaklaşırsan oturumu kısa kes; elindeki hisselerle teslim et ve raporda eksik olanları yaz.
