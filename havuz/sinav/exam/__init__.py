"""Kod ajanı sınavı: görevleri hazırlar, ajanın işini gizli testlerle puanlar, sonuçları karşılaştırır.

Akış: `hazirla` (temelin kopyası + başlangıç durumu) → sahibi ajanını çalıştırır → `puanla` (bütünlük +
gizli testler + temelin denetimi) → `rapor`. `dogrula` her görevin kendisini sınar.
Giriş noktası: `sinav.py` (komut satırı: `exam/cli.py`).

Genişletme: yeni modül bu pakete eklenir; yeni görev `gorevler/<kimlik>/` altına (AGENTS.md → "Yeni görev").
"""
