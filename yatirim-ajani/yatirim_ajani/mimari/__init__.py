"""Strateji mimarisi: KAP olayı → okuyucu (haneler) → dallanma ağacı (Py botu) → emir (defter); saatlik strateji kütüphanesi ve istatistik.

Akış:
  1. Kaynak: KAP bildirimi (Claude Code rutini web'den okur) ya da metin.
  2. Okuyucu: metni yapılandırılmış "hanelere" doldurur (tür, tutar, para birimi, oran, pay başı, süre...);
     ajan JSON'u ya da düzenli ifade okuyucusu. Piyasa verisiyle normalleştirir (tutar_tl, piyasa değerine oran...).
  3. Bot: haneler + piyasa bağlamı (hisse dosyası satırı) + portföy (defter) ile dallanma ağacını gezer; yaprak bir eylemdir.
  4. Emir: eylem somut emre çevrilir (gün, saat penceresi, limit fiyat, adet); defter ileriye dönük kaydeder.
  5. İstatistik: her dal/strateji hangi durumda (rejim hücresi) çalışmış; ağaç yaprakları bu istatistikle kapılanır.
"""
