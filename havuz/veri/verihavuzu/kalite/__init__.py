"""Veri kalitesi araçları: şema sözleşmesi, profil, denetimler, kayma, ayırma, yineleme ve
kişisel veri.

Her modül tek iş yapar ve tek başına okunabilir:
  ``validators`` tekil değer denetimleri · ``schema`` tablo sözleşmesi · ``profile`` sütun profili
  ``checks`` tablo denetimleri · ``drift`` PSI/KS · ``split`` sızıntısız ayırma
  ``dedupe`` bulanık yineleme · ``pii`` kişisel veri bulma/maskeleme · ``clean`` temizleme
  ``report`` Markdown/JSON rapor · ``dictionary`` veri sözlüğü
Genişletme: AGENTS.md → "Yeni kalite denetimi ekle" tarifi.
"""
