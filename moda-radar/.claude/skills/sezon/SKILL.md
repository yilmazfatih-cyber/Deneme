---
name: sezon
description: Moda Radar'da bir sezon döngüsünü baştan sona yürütür (brief → plan kapısı → veri → renk → tahmin → yatırım → otomatik kapı → editör incelemesi → demo notu). "/sezon SS27" gibi sezon koduyla çağrılır; baş mimar ajanı lider olarak kullanır.
---

# /sezon <KOD>

Argüman: sezon kodu (`SS27`, `FW27`). Yoksa bugüne göre bir sonraki satın alma sezonu.

1. `docs/ROADMAP.md`'den geçerli aşamayı al. `docs/sezonlar/<KOD>/` ve `reviews/` klasörlerini oluştur.
2. **Brief** (`brief.md`): amaç, kapsam içi/dışı, ölçülebilir kabul kriterleri, ilgili ilkeler, riskler. Aşama P0'daysa kapsam yalnız renk + kadın üst + Zara/LCW.
3. **Plan kapısı:** `gorsel-analist` taksonomi onayı, `renk-bilimci` palet yöntemi, `yatirim-analisti` segment tablosu. Çelişkileri brief'te karara bağla.
4. **Veri:** `veri-muhendisi` → `python -m moda_radar topla --sezon <KOD> --kaynak podyum` ve `--kaynak perakende`. Görsel saklanmadığını doğrula.
5. **Renk:** `renk-bilimci` → `python -m moda_radar renk --sezon <KOD>`; palet tablosu TCX kodlu.
6. **Tahmin:** `trend-modelci` → geriye test önce (`geriye-test`), tabanlar geçildiyse `tahmin`. Karne `docs/karne/` güncel.
7. **Yatırım:** `yatirim-analisti` → `python -m moda_radar yatirim --sezon <KOD> --segment hepsi`; kartlar + çıkış uyarısı.
8. **Otomatik kapı:** `pytest`, `ruff check .`, `ruff format --check .`, `python -m moda_radar dogrula`. Kırmızıysa sahibine geri.
9. **Editör:** `moda-editoru` → `rapor.md` ve `reviews/moda-editoru-1.md`. Engel/Önemli varsa sahibine düzelttir, turu artır. **En fazla 3 tur.**
10. **Demo notu** (`demo.md`): yapılanlar, raporu okuma kılavuzu, kabul kriterleri tablosu (✓ / açık), karne özeti, açık sorular, birikim.
11. Kullanıcıya kısa özet ver. Commit kendi dalına; `main`'e birleştirme ve dış eylem için sor.
