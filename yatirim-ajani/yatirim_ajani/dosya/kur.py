"""Hisse dosyası omurgası: her satır bir (gün, saat) anı; yanındaki sütunlar o anda BİLİNEBİLEN değerler.

Disiplin:
- Geçmişe bakan sütunlar yalnız o satırdan önce kapanmış çubuklardan ve o satırın kendi fiyatından hesaplanır.
  Günlük pencereli ölçüler (momentum, oynaklık, MA, RSI, hacim z) önceki günün kapanışına kadar olan günlük seriyle
  kurulur; satırın güncel fiyatı yalnız "son gözlem" olarak eklenir (ör. getiri_20g = P / C[d-20] - 1).
- Temel oranlar (F/K, PD/DD, FD/FAVÖK) İş Yatırım günlük serisinden gelir ve önceki günün oranı güncel fiyatla
  ölçeklenir (F/K_t = F/K_{d-1} · P_t / C_{d-1}); çeyreklik tablo kalemleri KAP açıklanma anından itibaren
  ileri doldurulur (açıklanma anı bilinmiyorsa yasal son gün kullanılır — temkinli, geleceğe bakmaz).
- Olay sütunları yalnız `kamuya_acilma` (yoksa bitiş günü 18:30) satırdan ÖNCE olan olayları sayar.
- `*_ileri` sütunları GELECEĞE bakar: yalnız etiket/değerlendirme içindir, asla özellik olarak kullanılmaz.

Her sütunun formülü ve kaynağı `FORMULLER` kaydında tutulur; `formuller` tablosuna yazılır.
"""

from __future__ import annotations

import gzip
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

TZ = "Europe/Istanbul"

# Yasal son günler (KAP, konsolide): 1Ç → 10 Mayıs, 2Ç → 19 Ağustos, 3Ç → 19 Kasım (2026'da 9 Kas solo/BIST100
# çoğunluğu), 4Ç → 11 Mart. Açıklanma anı bilinmiyorsa bu günlerin 18:30'u kullanılır (temkinli).
YASAL_SON = {3: (5, 10), 6: (8, 19), 9: (11, 19), 12: (3, 11)}

# Takvim bayrakları (resmî tatil ve dinî bayram günleri; borsa kapalı günler zaten seride yoktur,
# bayram ÖNCESİ/SONRASI ilk işlem günü etkisi için kullanılır)
BAYRAMLAR = {
    "2024-04-10", "2024-04-11", "2024-04-12", "2024-06-16", "2024-06-17", "2024-06-18", "2024-06-19",
    "2025-03-30", "2025-03-31", "2025-04-01", "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
    "2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30",
}  # fmt: skip

FORMULLER: list[dict] = [
    {"sutun": "kapanis", "baslik": "Fiyat (çubuk kapanışı)", "formul": "P_t", "pencere": "-", "kaynak": "veri", "yon": "-"},
    {"sutun": "gunici_getiri", "baslik": "Gün içi getiri", "formul": "P_t / O_d - 1 (günün açılışına göre)", "pencere": "gün", "kaynak": "gece/gün içi ayrışması (BIST bulgusu: gün içi ortalama eksi)", "yon": "negatif ort."},
    {"sutun": "gece_getiri", "baslik": "Gece getirisi", "formul": "O_d / C_{d-1} - 1", "pencere": "1g", "kaynak": "Lou-Polk-Skouras (2019) gece-gündüz ayrışması; BIST: bkz. literatür kaydı", "yon": "pozitif ort."},
    {"sutun": "getiri_1g", "baslik": "1 günlük getiri", "formul": "P_t / C_{d-1} - 1", "pencere": "1g", "kaynak": "kısa vadeli ters dönüş (Jegadeesh 1990)", "yon": "negatif"},
    {"sutun": "getiri_5g", "baslik": "1 haftalık getiri", "formul": "P_t / C_{d-5} - 1", "pencere": "5g", "kaynak": "kısa vadeli ters dönüş", "yon": "negatif"},
    {"sutun": "getiri_20g", "baslik": "1 aylık getiri", "formul": "P_t / C_{d-20} - 1", "pencere": "20g", "kaynak": "1 aylık ters dönüş / kısa momentum", "yon": "belirsiz"},
    {"sutun": "getiri_60g", "baslik": "3 aylık getiri", "formul": "P_t / C_{d-60} - 1", "pencere": "60g", "kaynak": "momentum", "yon": "pozitif"},
    {"sutun": "getiri_120g", "baslik": "6 aylık getiri", "formul": "P_t / C_{d-120} - 1", "pencere": "120g", "kaynak": "momentum (Jegadeesh-Titman 1993)", "yon": "pozitif"},
    {"sutun": "mom_12_1", "baslik": "12-1 momentum", "formul": "C_{d-21} / C_{d-252} - 1 (son ay hariç)", "pencere": "252g", "kaynak": "Jegadeesh-Titman; BIST uygulamaları", "yon": "pozitif"},
    {"sutun": "zirve_52h_yakinlik", "baslik": "52 haftanın zirvesine yakınlık", "formul": "P_t / max(C_{d-252..d-1})", "pencere": "252g", "kaynak": "George-Hwang (2004)", "yon": "pozitif"},
    {"sutun": "zirveden_dusus", "baslik": "Zirveden düşüş", "formul": "P_t / max(C_{d-252..d-1}, P_t) - 1", "pencere": "252g", "kaynak": "risk ölçüsü", "yon": "-"},
    {"sutun": "oynaklik_20g", "baslik": "Gerçekleşen oynaklık (yıllık)", "formul": "std(r_{d-20..d-1}) · √252", "pencere": "20g", "kaynak": "düşük oynaklık anomalisi (Ang ve ark. 2006)", "yon": "negatif"},
    {"sutun": "oynaklik_60g", "baslik": "Gerçekleşen oynaklık 60g", "formul": "std(r_{d-60..d-1}) · √252", "pencere": "60g", "kaynak": "düşük oynaklık", "yon": "negatif"},
    {"sutun": "atr_20g_oran", "baslik": "ATR / fiyat", "formul": "mean(TR_{d-20..d-1}) / C_{d-1}", "pencere": "20g", "kaynak": "Wilder; boyutlandırma", "yon": "-"},
    {"sutun": "rsi_14", "baslik": "RSI(14)", "formul": "Wilder RSI, günlük kapanışlar d-1'e kadar", "pencere": "14g", "kaynak": "teknik; BIST testleri çoğunlukla maliyet sonrası başarısız", "yon": "belirsiz"},
    {"sutun": "ma20_uzaklik", "baslik": "20 günlük ortalamaya uzaklık", "formul": "P_t / mean(C_{d-20..d-1}) - 1", "pencere": "20g", "kaynak": "trend", "yon": "belirsiz"},
    {"sutun": "ma50_uzaklik", "baslik": "50 günlük ortalamaya uzaklık", "formul": "P_t / mean(C_{d-50..d-1}) - 1", "pencere": "50g", "kaynak": "trend", "yon": "pozitif"},
    {"sutun": "ma200_uzaklik", "baslik": "200 günlük ortalamaya uzaklık", "formul": "P_t / mean(C_{d-200..d-1}) - 1", "pencere": "200g", "kaynak": "trend (Brock-Lakonishok-LeBaron 1992)", "yon": "pozitif"},
    {"sutun": "hacim_z_20", "baslik": "Hacim z-skoru", "formul": "(V_{d-1} - mean(V_{d-21..d-2})) / std(...)", "pencere": "20g", "kaynak": "hacim şoku", "yon": "belirsiz"},
    {"sutun": "hacim_gunici_oran", "baslik": "Gün içi birikimli hacim / 20g ort.", "formul": "ΣV_d(≤t) / mean(V_{d-20..d-1})", "pencere": "20g", "kaynak": "hacim", "yon": "belirsiz"},
    {"sutun": "amihud_20g", "baslik": "Amihud likiditesizlik (×1e9)", "formul": "mean(|r_i| / (V_i·C_i))·1e9, i=d-20..d-1", "pencere": "20g", "kaynak": "Amihud (2002); BIST likidite primi", "yon": "pozitif (prim)"},
    {"sutun": "devir_hizi_20g", "baslik": "Devir hızı", "formul": "mean(V_{d-20..d-1}) / dolaşımdaki pay (halka açık)", "pencere": "20g", "kaynak": "likidite", "yon": "negatif"},
    {"sutun": "max_gunluk_20g", "baslik": "MAX: son 20 günün en yüksek günlük getirisi", "formul": "max(r_{d-20..d-1})", "pencere": "20g", "kaynak": "Bali-Cakici-Whitelaw (2011); BIST: Alkan-Güner (2018) negatif", "yon": "negatif"},
    {"sutun": "min_gunluk_20g", "baslik": "MIN: son 20 günün en düşük günlük getirisi", "formul": "min(r_{d-20..d-1})", "pencere": "20g", "kaynak": "kuyruk riski", "yon": "belirsiz"},
    {"sutun": "ivol_60g", "baslik": "İdiosenkratik oynaklık (60g, yıllık)", "formul": "std(r - β·r_XU100) · √252, d-60..d-1", "pencere": "60g", "kaynak": "Ang ve ark. (2006); BIST: Çam ve ark. (2024), Akarsu (2023) pozitif bulgu", "yon": "belirsiz"},
    {"sutun": "temettu_verimi", "baslik": "Temettü verimi (son 252 işlem günü)", "formul": "Σ pay başı temettü (hak kullanım günü ≤ d) / P_t; Yahoo yoksa nakit akış vekili", "pencere": "TTM", "kaynak": "temettü faktörü", "yon": "pozitif"},
    {"sutun": "bedelsiz_gun", "baslik": "Son bölünme/bedelsizden bu yana işlem günü", "formul": "d - son bölünme günü (Yahoo 'Stock Splits')", "pencere": "-", "kaynak": "bedelsiz etkisi (BIST: önce aşırı tepki, sonra düzeltme)", "yon": "belirsiz"},
    {"sutun": "bedelsiz_oran", "baslik": "Son bölünme oranı", "formul": "Yahoo bölünme çarpanı (2 = %100 bedelsiz)", "pencere": "-", "kaynak": "bedelsiz", "yon": "-"},
    {"sutun": "gece_ort_20g", "baslik": "Ortalama gece getirisi 20g", "formul": "mean(O_i/C_{i-1}-1), i=d-20..d-1", "pencere": "20g", "kaynak": "gece primi", "yon": "pozitif"},
    {"sutun": "gunici_ort_20g", "baslik": "Ortalama gün içi getiri 20g", "formul": "mean(C_i/O_i-1), i=d-20..d-1", "pencere": "20g", "kaynak": "gün içi eksi", "yon": "negatif"},
    {"sutun": "endekse_gore_1g", "baslik": "Endekse göre 1g", "formul": "getiri_1g - XU100 getiri_1g", "pencere": "1g", "kaynak": "göreli güç", "yon": "belirsiz"},
    {"sutun": "endekse_gore_20g", "baslik": "Endekse göre 20g", "formul": "getiri_20g - XU100 getiri_20g", "pencere": "20g", "kaynak": "göreli momentum", "yon": "pozitif"},
    {"sutun": "endekse_gore_60g", "baslik": "Endekse göre 60g", "formul": "getiri_60g - XU100 getiri_60g", "pencere": "60g", "kaynak": "göreli momentum", "yon": "pozitif"},
    {"sutun": "beta_60g", "baslik": "Beta (60g)", "formul": "cov(r, r_XU100)/var(r_XU100), d-60..d-1", "pencere": "60g", "kaynak": "CAPM; düşük beta anomalisi", "yon": "negatif"},
    {"sutun": "xu100_getiri_20g", "baslik": "XU100 20g getiri", "formul": "XU100_t / XU100_{d-20} - 1", "pencere": "20g", "kaynak": "piyasa rejimi", "yon": "-"},
    {"sutun": "xu100_ma200_uzaklik", "baslik": "XU100 / MA200", "formul": "XU100_t / mean(XU100_{d-200..d-1}) - 1", "pencere": "200g", "kaynak": "rejim (ayı/boğa)", "yon": "-"},
    {"sutun": "usdtry_getiri_20g", "baslik": "USD/TRY 20g değişim", "formul": "K_{d-1} / K_{d-21} - 1", "pencere": "20g", "kaynak": "kur şoku duyarlılığı (BIST)", "yon": "negatif"},
    {"sutun": "dolar_fiyat", "baslik": "Dolar bazlı fiyat", "formul": "P_t / USDTRY_{d-1}", "pencere": "-", "kaynak": "yabancı yatırımcı bakışı", "yon": "-"},
    {"sutun": "dolar_getiri_60g", "baslik": "Dolar bazlı 60g getiri", "formul": "dolar_fiyat_t / dolar_fiyat_{d-60} - 1", "pencere": "60g", "kaynak": "dolar bazlı momentum", "yon": "pozitif"},
    {"sutun": "fk", "baslik": "F/K (fiyat/kazanç, son 4 açıklanmış çeyrek)", "formul": "piyasa_degeri_mn / net_kar_ttm (yalnız kâr > 0); kalemler KAP açıklanma anından itibaren", "pencere": "TTM", "kaynak": "değer faktörü (Basu 1977; BIST: literatür kaydı)", "yon": "negatif (düşük F/K → yüksek getiri)"},
    {"sutun": "pd_dd", "baslik": "PD/DD", "formul": "piyasa_degeri_mn / ana ortaklık özkaynağı (son açıklanan)", "pencere": "son bilanço", "kaynak": "Fama-French değer", "yon": "negatif"},
    {"sutun": "fd_favok", "baslik": "FD/FAVÖK", "formul": "(piyasa_degeri_mn + net finansal borç) / FAVÖK_TTM; FAVÖK = faaliyet kârı + amortisman", "pencere": "TTM", "kaynak": "değerleme", "yon": "negatif"},
    {"sutun": "snak_verimi", "baslik": "Serbest nakit akım verimi", "formul": "serbest nakit akımı TTM / piyasa_degeri_mn", "pencere": "TTM", "kaynak": "değer/kalite", "yon": "pozitif"},
    {"sutun": "net_borc_ozkaynak", "baslik": "Net borç / özkaynak", "formul": "(KV+UV finansal borç - nakit) / ana ortaklık özkaynağı", "pencere": "son bilanço", "kaynak": "kaldıraç", "yon": "negatif"},
    {"sutun": "piyasa_degeri_mn", "baslik": "Piyasa değeri (mn TL)", "formul": "İş Yatırım PD_{d-1} · P_t / C_{d-1}", "pencere": "-", "kaynak": "büyüklük faktörü", "yon": "negatif"},
    {"sutun": "halka_aciklik", "baslik": "Halka açıklık oranı", "formul": "İş Yatırım halka açık PD / PD", "pencere": "-", "kaynak": "likidite/sahiplik", "yon": "belirsiz"},
    {"sutun": "aof_1g_sapma", "baslik": "Önceki gün kapanış / AOF - 1", "formul": "C_{d-1} / AOF_{d-1} - 1 (gün sonu alıcı baskısı)", "pencere": "1g", "kaynak": "mikro yapı", "yon": "belirsiz"},
    {"sutun": "kazanc_verimi", "baslik": "Kazanç verimi E/P", "formul": "net_kar_ttm / piyasa_degeri_mn", "pencere": "TTM", "kaynak": "değer", "yon": "pozitif"},
    {"sutun": "net_kar_ceyrek", "baslik": "Son açıklanan çeyrek net kâr (ana ortaklık, mn TL)", "formul": "KAP mali tablo, açıklanma anından itibaren", "pencere": "çeyrek", "kaynak": "temel", "yon": "-"},
    {"sutun": "net_kar_ttm", "baslik": "Son 4 çeyrek net kâr (mn TL)", "formul": "Σ son 4 açıklanmış çeyrek", "pencere": "TTM", "kaynak": "temel", "yon": "-"},
    {"sutun": "kar_buyume_yillik", "baslik": "Çeyrek kâr büyümesi (yıllık)", "formul": "NK_q / NK_{q-4} - 1", "pencere": "çeyrek", "kaynak": "kâr sürprizi/ivmesi (PEAD)", "yon": "pozitif"},
    {"sutun": "satis_buyume_yillik", "baslik": "Çeyrek satış büyümesi (yıllık)", "formul": "S_q / S_{q-4} - 1", "pencere": "çeyrek", "kaynak": "temel", "yon": "pozitif"},
    {"sutun": "net_kar_marji", "baslik": "Net kâr marjı", "formul": "NK_q / S_q", "pencere": "çeyrek", "kaynak": "kârlılık faktörü", "yon": "pozitif"},
    {"sutun": "roe_ttm", "baslik": "Özkaynak kârlılığı", "formul": "NK_TTM / Özkaynak", "pencere": "TTM", "kaynak": "kârlılık (Novy-Marx 2013)", "yon": "pozitif"},
    {"sutun": "bilancodan_gun", "baslik": "Son bilançodan bu yana gün", "formul": "t - açıklanma anı", "pencere": "-", "kaynak": "PEAD penceresi", "yon": "-"},
    {"sutun": "olay_sayi_1g", "baslik": "Son 24 saatteki olay sayısı", "formul": "Σ olay(kamuya_acilma ∈ (t-24s, t])", "pencere": "1g", "kaynak": "haber yoğunluğu", "yon": "belirsiz"},
    {"sutun": "olay_sayi_5g", "baslik": "Son 5 gündeki olay sayısı", "formul": "Σ olay(kamuya_acilma ∈ (t-5g, t])", "pencere": "5g", "kaynak": "haber yoğunluğu", "yon": "belirsiz"},
    {"sutun": "olay_yon_5g", "baslik": "Son 5 gün olay yönü toplamı", "formul": "Σ(+1 olumlu, -1 olumsuz)", "pencere": "5g", "kaynak": "haber tonu", "yon": "pozitif"},
    {"sutun": "son_olay_tur", "baslik": "Son olayın türü", "formul": "metin", "pencere": "-", "kaynak": "olaylar tablosu", "yon": "-"},
    {"sutun": "son_olay_saat_fark", "baslik": "Son olaydan bu yana saat", "formul": "t - kamuya_acilma", "pencere": "-", "kaynak": "olaylar", "yon": "-"},
    {"sutun": "haftanin_gunu", "baslik": "Haftanın günü (0=Pzt)", "formul": "takvim", "pencere": "-", "kaynak": "haftanın günü etkisi (BIST: Pazartesi eksi bulguları)", "yon": "-"},
    {"sutun": "ay", "baslik": "Ay", "formul": "takvim", "pencere": "-", "kaynak": "Ocak etkisi", "yon": "-"},
    {"sutun": "ay_donusu", "baslik": "Ay dönüşü (son 3 / ilk 3 işlem günü)", "formul": "takvim", "pencere": "-", "kaynak": "ay dönüşü etkisi (Lakonishok-Smidt 1988)", "yon": "pozitif"},
    {"sutun": "bayram_oncesi", "baslik": "Bayram öncesi son işlem günü", "formul": "takvim", "pencere": "-", "kaynak": "tatil öncesi etkisi", "yon": "pozitif"},
    {"sutun": "bayram_sonrasi", "baslik": "Bayram sonrası ilk işlem günü", "formul": "takvim", "pencere": "-", "kaynak": "tatil sonrası", "yon": "belirsiz"},
    {"sutun": "bilanco_sezonu", "baslik": "Bilanço sezonu", "formul": "takvim: Şub-Mar, May, Ağu, Kas", "pencere": "-", "kaynak": "kâr açıklama dönemi", "yon": "-"},
    {"sutun": "ileri_1g", "baslik": "[ETİKET] 1 gün sonraki getiri", "formul": "C_{d+1} / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "ileri_5g", "baslik": "[ETİKET] 5 gün sonraki getiri", "formul": "C_{d+5} / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "ileri_20g", "baslik": "[ETİKET] 20 gün sonraki getiri", "formul": "C_{d+20} / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "ileri_60g", "baslik": "[ETİKET] 60 gün sonraki getiri", "formul": "C_{d+60} / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "ileri_min_20g", "baslik": "[ETİKET] 20 gün içindeki en düşük", "formul": "min(C_{d+1..d+20}) / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "ileri_max_20g", "baslik": "[ETİKET] 20 gün içindeki en yüksek", "formul": "max(C_{d+1..d+20}) / P_t - 1", "pencere": "ileri", "kaynak": "etiket", "yon": "-"},
    {"sutun": "sat_sinyali_20g", "baslik": "[ETİKET] Sat sinyali", "formul": "ileri_min_20g ≤ -10% (20 gün içinde %10 düşüş görüldü)", "pencere": "ileri", "kaynak": "etiket tanımı", "yon": "-"},
    {"sutun": "al_sinyali_20g", "baslik": "[ETİKET] Al sinyali", "formul": "ileri_max_20g ≥ +10% ve ileri_20g > 0", "pencere": "ileri", "kaynak": "etiket tanımı", "yon": "-"},
    {"sutun": "xu100_ileri_1g", "baslik": "[ETİKET] XU100 1g ileri", "formul": "XU100_{d+1}/XU100_t - 1", "pencere": "ileri", "kaynak": "anormal getiri için", "yon": "-"},
    {"sutun": "xu100_ileri_5g", "baslik": "[ETİKET] XU100 5g ileri", "formul": "", "pencere": "ileri", "kaynak": "", "yon": "-"},
    {"sutun": "xu100_ileri_20g", "baslik": "[ETİKET] XU100 20g ileri", "formul": "", "pencere": "ileri", "kaynak": "", "yon": "-"},
]

ISY_ESLEME = {  # İş Yatırım HisseTekil alan adları → dosya sütunları (gerçek alanlar, 2026-11)
    "HGDG_KAPANIS": "isy_kapanis", "HGDG_HACIM": "isy_hacim", "HGDG_AOF": "isy_aof", "PD": "isy_pd", "PD_USD": "isy_pd_usd",
    "HAO_PD": "isy_hao_pd", "SERMAYE": "isy_sermaye", "DOLAR_BAZLI_FIYAT": "isy_dolar_fiyat", "END_DEGER": "isy_xu100",
    "DD_DEGER": "isy_usdtry", "DOLAR_HACIM": "isy_dolar_hacim",
}  # fmt: skip

# Mali tablo kalem kodları (İş Yatırım XI_29 / UFRS): kümülatif (yılbaşından) değerler
KALEM_KOD = {
    "net_kar": "3Z",  # Ana ortaklık payları
    "satis": "3C",  # Satış gelirleri
    "brut_kar": "3D",
    "faaliyet_kari": "3DF",
    "amortisman": "4B",
    "ozkaynak_ana": "2O",
    "ozkaynak": "2N",
    "toplam_varlik": "1BL",
    "fin_borc_kv": "2AA",
    "fin_borc_uv": "2BA",
    "nakit": "1AA",
    "serbest_nakit": "4CB",
    "temettu_odeme": "4CBB",
}
AKIS_KALEMLER = ("net_kar", "satis", "brut_kar", "faaliyet_kari", "amortisman", "serbest_nakit", "temettu_odeme")


def _csv(yol: Path) -> pd.DataFrame:
    """Yoksa ya da boşsa boş çerçeve."""
    try:
        return pd.read_csv(yol) if yol.exists() and yol.stat().st_size > 0 else pd.DataFrame()
    except pd.errors.EmptyDataError:
        return pd.DataFrame()


def _oku_csv(yol: Path, zaman_sutunu: str = "zaman") -> pd.DataFrame:
    df = _csv(yol)
    if df.empty:
        return df
    if zaman_sutunu in df.columns:
        df[zaman_sutunu] = pd.to_datetime(df[zaman_sutunu], utc=True, errors="coerce").dt.tz_convert(TZ)
        df = df.dropna(subset=[zaman_sutunu])
    return df


def _gunluk_seri(saatlik: pd.DataFrame, gunluk: pd.DataFrame) -> pd.DataFrame:
    """Günlük OHLCV: saatlik çubuklardan gün toplamı; saatlik yoksa günlük kaynaktan. Dizin: gün (tarih)."""
    parcalar = []
    if not gunluk.empty:
        g = gunluk.copy()
        g["gun"] = pd.to_datetime(g["tarih"]).dt.tz_localize(None).dt.normalize() if g["tarih"].dt.tz is None else g["tarih"].dt.tz_convert(TZ).dt.tz_localize(None).dt.normalize()
        g = g.set_index("gun")[["acilis", "yuksek", "dusuk", "kapanis", "hacim"]].astype(float)
        parcalar.append(g)
    if not saatlik.empty:
        s = saatlik.copy()
        s["gun"] = s["zaman"].dt.tz_localize(None).dt.normalize()
        g2 = s.groupby("gun").agg(acilis=("acilis", "first"), yuksek=("yuksek", "max"), dusuk=("dusuk", "min"), kapanis=("kapanis", "last"), hacim=("hacim", "sum"))
        parcalar.append(g2)
    if not parcalar:
        return pd.DataFrame(columns=["acilis", "yuksek", "dusuk", "kapanis", "hacim"])
    # Saatlik toplam günlük kaynağa göre önceliklidir (aynı kaynak, tutarlılık için)
    out = pd.concat(parcalar)
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out = out[(out["kapanis"] > 0) & out["kapanis"].notna()]
    return out


def _rsi(c: pd.Series, n: int = 14) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


@dataclass
class Girdiler:
    saatlik: pd.DataFrame  # zaman, acilis, yuksek, dusuk, kapanis, hacim (1h)
    gunluk: pd.DataFrame  # tarih, acilis, ..., hacim (1d, 2024-01→)
    xu100_saatlik: pd.DataFrame
    xu100_gunluk: pd.DataFrame
    usdtry_gunluk: pd.DataFrame
    isy_gunluk: pd.DataFrame  # İş Yatırım günlük oranlar
    isy_mali: pd.DataFrame  # çeyreklik kalemler
    olaylar: pd.DataFrame  # kamuya_acilma, tur, yon, baslik, hisse, kapsam


def girdileri_yukle(hisse: str, saatlik_klasor: str | Path, ham_klasor: str | Path, olaylar: pd.DataFrame | None = None) -> Girdiler:
    sk, hk = Path(saatlik_klasor), Path(ham_klasor)

    def yahoo_1d(ad: str) -> pd.DataFrame:
        df = _csv(hk / ad)
        if not df.empty and "tarih" in df.columns:
            df["tarih"] = pd.to_datetime(df["tarih"], errors="coerce", utc=True).dt.tz_convert(TZ)
            df = df.dropna(subset=["tarih"])
            for c in ("acilis", "yuksek", "dusuk", "kapanis", "hacim", "temettu", "bolunme"):
                if c in df.columns:
                    df[c] = pd.to_numeric(df[c], errors="coerce")
        return df

    isy = _csv(hk / f"{hisse}_isy_gunluk.csv")
    if not isy.empty and "tarih" in isy.columns:
        isy["tarih"] = pd.to_datetime(isy["tarih"], errors="coerce")
    mali = _csv(hk / f"{hisse}_isy_mali.csv")
    return Girdiler(
        saatlik=_oku_csv(sk / f"{hisse}.IS_1h.csv"),
        gunluk=yahoo_1d(f"{hisse}_yahoo_1d.csv"),
        xu100_saatlik=_oku_csv(sk / "XU100.IS_1h.csv"),
        xu100_gunluk=yahoo_1d("XU100.IS_yahoo_1d.csv"),
        usdtry_gunluk=yahoo_1d("USDTRY_X_yahoo_1d.csv"),
        isy_gunluk=isy,
        isy_mali=mali,
        olaylar=olaylar if olaylar is not None else pd.DataFrame(),
    )


# --- mali tablo kalemleri ---------------------------------------------------------------------
KALEM_ARAMA = {
    "net_kar": ["Ana Ortaklık Payları", "ANA ORTAKLIK PAYLARI", "Dönem Net Karı veya Zararı", "DÖNEM KARI (ZARARI)", "Net Dönem Karı"],
    "satis": ["Hasılat", "HASILAT", "Satış Gelirleri", "SATIŞ GELİRLERİ", "Toplam Faaliyet Gelirleri"],
    "ozkaynak": ["Ana Ortaklığa Ait Özkaynaklar", "ANA ORTAKLIĞA AİT ÖZKAYNAKLAR", "Özkaynaklar", "ÖZKAYNAKLAR", "TOPLAM ÖZKAYNAKLAR"],
    "esas_faaliyet_kari": ["Esas Faaliyet Karı", "ESAS FAALİYET KARI", "Faaliyet Karı"],
}  # fmt: skip


def mali_kalemler(mali: pd.DataFrame) -> pd.DataFrame:
    """Çeyreklik kalem tablosu (mn TL): satır = dönem (Period Q), sütunlar = kalemler; akış kalemleri için `_ceyrek` ekleri.

    Kaynak değerleri yılbaşından kümülatiftir; akış kalemleri aynı yılın önceki çeyreği çıkarılarak çeyrekliğe çevrilir.
    Henüz açıklanmamış dönemler (NaN) atılır.
    """
    if mali.empty or "itemCode" not in mali.columns:
        return pd.DataFrame()
    donemler = [c for c in mali.columns if c[:2] == "20" and "/" in c]
    kod = mali.set_index(mali["itemCode"].astype(str).str.strip())
    out = {}
    for ad, k in KALEM_KOD.items():
        if k in kod.index:
            out[ad] = {d: pd.to_numeric(kod.loc[k, d], errors="coerce") for d in donemler}
    if not out:
        return pd.DataFrame()
    df = pd.DataFrame(out) / 1e6
    df.index = pd.PeriodIndex([pd.Period(year=int(d.split("/")[0]), month=int(d.split("/")[1]), freq="Q") for d in df.index], name="donem")
    df = df.sort_index()
    df = df[df["net_kar"].notna()] if "net_kar" in df.columns else df.dropna(how="all")
    for ad in AKIS_KALEMLER:
        if ad in df.columns:
            cey = df[ad].copy()
            for p in df.index:
                if p.quarter > 1:
                    onceki = pd.Period(year=p.year, quarter=p.quarter - 1, freq="Q")
                    if onceki in df.index and pd.notna(df.loc[onceki, ad]):
                        cey.loc[p] = df.loc[p, ad] - df.loc[onceki, ad]
                    else:
                        cey.loc[p] = np.nan  # önceki çeyrek yoksa çeyreklik bilinemez
            df[ad + "_ceyrek"] = cey
    if "faaliyet_kari_ceyrek" in df.columns and "amortisman_ceyrek" in df.columns:
        df["favok_ceyrek"] = df["faaliyet_kari_ceyrek"] + df["amortisman_ceyrek"].abs()
    if "fin_borc_kv" in df.columns and "fin_borc_uv" in df.columns and "nakit" in df.columns:
        df["net_borc"] = df["fin_borc_kv"].fillna(0) + df["fin_borc_uv"].fillna(0) - df["nakit"].fillna(0)
    return df


def aciklanma_anlari(kalemler: pd.DataFrame, olaylar: pd.DataFrame, hisse: str) -> pd.Series:
    """Her dönem için kamuya açıklanma anı: olaylar tablosundaki bilanço kaydı, yoksa yasal son gün 18:30."""
    anlar = {}
    bil = pd.DataFrame()
    if not olaylar.empty and "tur" in olaylar.columns:
        bil = olaylar[(olaylar["tur"].astype(str).str.lower().str.startswith("bilan")) & (olaylar.get("hisse") == hisse)]
    for p in kalemler.index:
        donem_sonu = p.end_time.normalize().tz_localize(TZ)
        an = None
        if not bil.empty:
            aday = bil[(bil["kamuya_acilma"] > donem_sonu) & (bil["kamuya_acilma"] <= donem_sonu + pd.Timedelta(days=75))]
            if not aday.empty:
                an = aday["kamuya_acilma"].min()
        if an is None:
            ay, gun = YASAL_SON[p.end_time.month]
            yil = p.year + (1 if p.end_time.month == 12 else 0)
            an = pd.Timestamp(year=yil, month=ay, day=gun, hour=18, minute=30, tz=TZ)
        anlar[p] = pd.Timestamp(an).tz_convert(TZ) if pd.Timestamp(an).tzinfo else pd.Timestamp(an).tz_localize(TZ)
    return pd.Series(anlar, name="aciklanma")


# --- omurga ---------------------------------------------------------------------------------
def omurga_kur(hisse: str, g: Girdiler) -> pd.DataFrame:
    D = _gunluk_seri(g.saatlik, g.gunluk)  # günlük OHLCV, dizin = gün
    if D.empty:
        raise ValueError(f"{hisse}: fiyat verisi yok")
    X = _gunluk_seri(g.xu100_saatlik, g.xu100_gunluk)
    K = pd.DataFrame()
    if not g.usdtry_gunluk.empty:
        K = g.usdtry_gunluk.copy()
        K["gun"] = K["tarih"].dt.tz_localize(None).dt.normalize()
        K = K.set_index("gun")["kapanis"].astype(float).sort_index()

    # 1) Satırlar: saatlik çubuklar + saatlik kapsam dışındaki günler için günlük satır (18:00)
    satirlar = []
    if not g.saatlik.empty:
        s = g.saatlik[["zaman", "acilis", "yuksek", "dusuk", "kapanis", "hacim"]].copy()
        s["cozunurluk"] = "1h"
        satirlar.append(s)
        saatlik_gunler = set(s["zaman"].dt.tz_localize(None).dt.normalize())
    else:
        saatlik_gunler = set()
    gunluk_satir = D[~D.index.isin(saatlik_gunler)].reset_index()
    if not gunluk_satir.empty:
        gunluk_satir["zaman"] = gunluk_satir["gun"].dt.tz_localize(TZ) + pd.Timedelta(hours=18)
        gunluk_satir["cozunurluk"] = "1d"
        satirlar.append(gunluk_satir[["zaman", "acilis", "yuksek", "dusuk", "kapanis", "hacim", "cozunurluk"]])
    R = pd.concat(satirlar).sort_values("zaman").drop_duplicates("zaman").reset_index(drop=True)
    R["gun"] = R["zaman"].dt.tz_localize(None).dt.normalize()
    R["saat"] = R["zaman"].dt.strftime("%H:%M")
    R["gun_sonu"] = ~R.duplicated("gun", keep="last")
    R["hisse"] = hisse

    # 2) Günlük seriden türeyen, d-1'e kadar bilinen değerler (gün bazında), satırlara gün ile birleştirilir
    gunler = D.index
    C = D["kapanis"]
    r = C.pct_change()
    tr = np.maximum(D["yuksek"] - D["dusuk"], np.maximum((D["yuksek"] - C.shift()).abs(), (D["dusuk"] - C.shift()).abs()))
    gece = D["acilis"] / C.shift() - 1
    gunici = C / D["acilis"] - 1
    tl_hacim = D["hacim"] * C
    G = pd.DataFrame(index=gunler)
    G["C_1"] = C.shift(1)
    G["O_d"] = D["acilis"]  # günün açılışı (saatlik satırlarda gün başında bilinir)
    for k in (5, 20, 60, 120):
        G[f"C_{k}"] = C.shift(k)
    G["C_21"], G["C_252"] = C.shift(21), C.shift(252)
    G["max252"] = C.shift(1).rolling(252, min_periods=120).max()
    G["oynaklik_20g"] = r.shift(1).rolling(20).std() * np.sqrt(252)
    G["oynaklik_60g"] = r.shift(1).rolling(60).std() * np.sqrt(252)
    G["atr_20g_oran"] = tr.shift(1).rolling(20).mean() / C.shift(1)
    G["rsi_14"] = _rsi(C).shift(1)
    for n in (20, 50, 200):
        G[f"ma{n}"] = C.shift(1).rolling(n).mean()
    v1 = D["hacim"].shift(1)
    G["hacim_z_20"] = (v1 - v1.rolling(20).mean().shift(1)) / v1.rolling(20).std().shift(1)
    G["hacim_ort_20"] = v1.rolling(20).mean()
    G["amihud_20g"] = ((r.abs() / tl_hacim.replace(0, np.nan)).shift(1).rolling(20).mean()) * 1e9
    G["max_gunluk_20g"] = r.shift(1).rolling(20).max()  # MAX etkisi (Bali-Cakici-Whitelaw 2011; BIST: Alkan-Güner 2018)
    G["min_gunluk_20g"] = r.shift(1).rolling(20).min()
    G["gece_ort_20g"] = gece.shift(1).rolling(20).mean()
    G["gunici_ort_20g"] = gunici.shift(1).rolling(20).mean()
    G["gece_getiri"] = gece
    if not X.empty:
        XC = X["kapanis"].reindex(gunler).ffill()
        xr = XC.pct_change()
        G["X_1"], G["X_20"], G["X_60"] = XC.shift(1), XC.shift(20), XC.shift(60)
        G["X_ma200"] = XC.shift(1).rolling(200).mean()
        cov = r.shift(1).rolling(60).cov(xr.shift(1))
        var = xr.shift(1).rolling(60).var()
        G["beta_60g"] = cov / var
        # idiosenkratik oynaklık: piyasa regresyonu artıklarının std'si (60g), yıllık
        artik = r.shift(1) - G["beta_60g"] * xr.shift(1)
        G["ivol_60g"] = artik.rolling(60).std() * np.sqrt(252)
        # ileri (etiket) XU100
        for k in (1, 5, 20):
            G[f"xu100_ileri_{k}g"] = XC.shift(-k) / XC - 1
    if not K.empty:
        KK = K.reindex(gunler).ffill()
        G["K_1"] = KK.shift(1)
        G["usdtry_getiri_20g"] = KK.shift(1) / KK.shift(21) - 1
        G["dolar_C_60"] = (C / KK).shift(60)
    # ileri etiketler (gün bazında, günün kapanışına göre değil satır fiyatına göre; burada ileri kapanışlar)
    for k in (1, 5, 20, 60):
        G[f"C_ileri_{k}"] = C.shift(-k)
    G["min_ileri_20"] = C[::-1].rolling(20, min_periods=1).min()[::-1].shift(-1)
    G["max_ileri_20"] = C[::-1].rolling(20, min_periods=1).max()[::-1].shift(-1)
    # temettü (Yahoo, pay başı TL, hak kullanım günü; önceden ilan edilir) ve bölünme/bedelsiz (oran ve geçen işlem günü)
    if not g.gunluk.empty and "temettu" in g.gunluk.columns:
        tg = g.gunluk.copy()
        tg["gun"] = tg["tarih"].dt.tz_convert(TZ).dt.tz_localize(None).dt.normalize()
        tem = tg.groupby("gun")["temettu"].sum().reindex(gunler, fill_value=0.0).fillna(0.0)
        G["temettu_ttm_ps"] = tem.rolling(252, min_periods=1).sum()
        if "bolunme" in tg.columns:
            bol = tg.groupby("gun")["bolunme"].max().reindex(gunler, fill_value=0.0).fillna(0.0)
            sira_b = np.arange(len(gunler), dtype=float)
            son_b = pd.Series(np.where(bol.to_numpy() > 0, sira_b, np.nan), index=gunler).ffill()
            G["bedelsiz_gun"] = sira_b - son_b.to_numpy()
            G["bedelsiz_oran"] = pd.Series(np.where(bol.to_numpy() > 0, bol.to_numpy(), np.nan), index=gunler).ffill()

    # ay dönüşü ve bayram bayrakları TAKVİMDEN (Pzt–Cum iş günleri), veriden değil: gelecekteki işlem günlerine bakmaz
    def _ay_donusu(d: pd.Timestamp) -> int:
        ay = pd.bdate_range(d.replace(day=1), d.replace(day=1) + pd.offsets.MonthEnd(0))
        konum = ay.get_indexer([d.normalize()])[0]
        return int(konum >= 0 and (konum < 3 or konum >= len(ay) - 3))

    bayram = {pd.Timestamp(b) for b in BAYRAMLAR}
    G["ay_donusu"] = [_ay_donusu(d) for d in gunler]
    G["bayram_oncesi"] = [int((d + pd.offsets.BDay(1)) in bayram) for d in gunler]
    G["bayram_sonrasi"] = [int((d - pd.offsets.BDay(1)) in bayram) for d in gunler]

    R = R.merge(G, left_on="gun", right_index=True, how="left")
    P = R["kapanis"]
    # 3) Satır fiyatıyla biten özellikler
    R["gunici_getiri"] = P / R["O_d"] - 1
    R["getiri_1g"] = P / R["C_1"] - 1
    for k in (5, 20, 60, 120):
        R[f"getiri_{k}g"] = P / R[f"C_{k}"] - 1
    R["mom_12_1"] = R["C_21"] / R["C_252"] - 1
    R["zirve_52h_yakinlik"] = P / R["max252"]
    R["zirveden_dusus"] = P / np.maximum(R["max252"], P) - 1
    for n in (20, 50, 200):
        R[f"ma{n}_uzaklik"] = P / R[f"ma{n}"] - 1
    # gün içi birikimli hacim
    R["hacim_birikimli"] = R.groupby("gun")["hacim"].cumsum()
    R["hacim_gunici_oran"] = R["hacim_birikimli"] / R["hacim_ort_20"]
    if "X_1" in R.columns:
        # XU100 satır anındaki değeri: saatlik varsa saatlik kapanış, yoksa günlük kapanış
        if not g.xu100_saatlik.empty:
            xs = g.xu100_saatlik[["zaman", "kapanis"]].rename(columns={"kapanis": "xu100"})
            R = pd.merge_asof(R.sort_values("zaman"), xs.sort_values("zaman"), on="zaman", direction="backward", tolerance=pd.Timedelta(hours=2))
        else:
            R["xu100"] = np.nan
        xg = X["kapanis"].reindex(R["gun"]).to_numpy()
        R["xu100"] = R["xu100"].fillna(pd.Series(xg, index=R.index))
        R["xu100_getiri_1g"] = R["xu100"] / R["X_1"] - 1
        R["xu100_getiri_20g"] = R["xu100"] / R["X_20"] - 1
        R["xu100_getiri_60g"] = R["xu100"] / R["X_60"] - 1
        R["xu100_ma200_uzaklik"] = R["xu100"] / R["X_ma200"] - 1
        R["endekse_gore_1g"] = R["getiri_1g"] - R["xu100_getiri_1g"]
        R["endekse_gore_20g"] = R["getiri_20g"] - R["xu100_getiri_20g"]
        R["endekse_gore_60g"] = R["getiri_60g"] - R["xu100_getiri_60g"]
    if "K_1" in R.columns:
        R["dolar_fiyat"] = P / R["K_1"]
        R["dolar_getiri_60g"] = R["dolar_fiyat"] / R["dolar_C_60"] - 1
    # 4) İş Yatırım günlük değerleri (d-1 değeri, fiyatla ölçekli): piyasa değeri, halka açık PD, pay sayısı
    isy_ok = not g.isy_gunluk.empty and "tarih" in g.isy_gunluk.columns
    if isy_ok:
        isy = g.isy_gunluk.rename(columns={k: v for k, v in ISY_ESLEME.items() if k in g.isy_gunluk.columns}).copy()
        isy["gun"] = pd.to_datetime(isy["tarih"]).dt.normalize()
        isy = isy.set_index("gun").sort_index()
        isy = isy[~isy.index.duplicated(keep="last")]
        onceki = isy.reindex(gunler).ffill().shift(1)  # d-1 değerleri
        O = onceki.reindex(R["gun"]).reset_index(drop=True)
        ref = pd.to_numeric(O["isy_kapanis"], errors="coerce") if "isy_kapanis" in O.columns else R["C_1"]
        olcek = P / ref
        if "isy_pd" in O.columns:
            R["piyasa_degeri_mn"] = pd.to_numeric(O["isy_pd"], errors="coerce") / 1e6 * olcek
        if "isy_hao_pd" in O.columns and "isy_pd" in O.columns:
            R["halka_aciklik"] = pd.to_numeric(O["isy_hao_pd"], errors="coerce") / pd.to_numeric(O["isy_pd"], errors="coerce")
        if "isy_sermaye" in O.columns:
            pay_sayisi = pd.to_numeric(O["isy_sermaye"], errors="coerce")  # 1 TL nominal → pay adedi
            if "halka_aciklik" in R.columns:
                R["devir_hizi_20g"] = R["hacim_ort_20"] / (pay_sayisi * R["halka_aciklik"])
        if "isy_aof" in O.columns:
            R["aof_1g_sapma"] = R["C_1"] / pd.to_numeric(O["isy_aof"], errors="coerce") - 1  # önceki gün kapanış/AOF
    # 5) Çeyreklik kalemler, KAP açıklanma anından itibaren; değerleme oranları = PD / kalem
    kal = mali_kalemler(g.isy_mali)
    if not kal.empty:
        anlar = aciklanma_anlari(kal, g.olaylar, hisse)
        T = kal.copy()
        T["aciklanma"] = pd.to_datetime(anlar)
        T = T.sort_values("aciklanma")
        if "net_kar_ceyrek" in T.columns:
            T["net_kar_ttm"] = T["net_kar_ceyrek"].rolling(4).sum()
            T["kar_buyume_yillik"] = T["net_kar_ceyrek"] / T["net_kar_ceyrek"].shift(4).abs() - np.sign(T["net_kar_ceyrek"].shift(4))
            T.loc[T["net_kar_ceyrek"].shift(4) <= 0, "kar_buyume_yillik"] = np.nan  # zarar tabanında büyüme tanımsız
        if "satis_ceyrek" in T.columns:
            T["satis_buyume_yillik"] = T["satis_ceyrek"] / T["satis_ceyrek"].shift(4) - 1
            if "net_kar_ceyrek" in T.columns:
                T["net_kar_marji"] = T["net_kar_ceyrek"] / T["satis_ceyrek"]
        if "favok_ceyrek" in T.columns:
            T["favok_ttm"] = T["favok_ceyrek"].rolling(4).sum()
        if "serbest_nakit_ceyrek" in T.columns:
            T["serbest_nakit_ttm"] = T["serbest_nakit_ceyrek"].rolling(4).sum()
        if "temettu_odeme_ceyrek" in T.columns:
            T["temettu_ttm"] = T["temettu_odeme_ceyrek"].abs().rolling(4).sum()
        if "ozkaynak_ana" in T.columns and "net_kar_ttm" in T.columns:
            T["roe_ttm"] = T["net_kar_ttm"] / T["ozkaynak_ana"]
        if "net_borc" in T.columns and "ozkaynak_ana" in T.columns:
            T["net_borc_ozkaynak"] = T["net_borc"] / T["ozkaynak_ana"]
        sutunlar = [c for c in ("net_kar_ceyrek", "net_kar_ttm", "kar_buyume_yillik", "satis_buyume_yillik", "net_kar_marji", "roe_ttm",
                                "favok_ttm", "serbest_nakit_ttm", "temettu_ttm", "ozkaynak_ana", "net_borc", "net_borc_ozkaynak") if c in T.columns]  # fmt: skip
        Tm = T[["aciklanma", *sutunlar]].rename(columns={"aciklanma": "zaman"})
        R = pd.merge_asof(R.sort_values("zaman"), Tm.sort_values("zaman"), on="zaman", direction="backward")
        son_ac = pd.merge_asof(R[["zaman"]], Tm[["zaman"]].assign(son_aciklanma=Tm["zaman"]), on="zaman", direction="backward")["son_aciklanma"]
        R["bilancodan_gun"] = (R["zaman"] - son_ac).dt.total_seconds() / 86400
        if "piyasa_degeri_mn" in R.columns:
            if "net_kar_ttm" in R.columns:
                R["fk"] = np.where(R["net_kar_ttm"] > 0, R["piyasa_degeri_mn"] / R["net_kar_ttm"], np.nan)
                R["kazanc_verimi"] = R["net_kar_ttm"] / R["piyasa_degeri_mn"]
            if "ozkaynak_ana" in R.columns:
                R["pd_dd"] = R["piyasa_degeri_mn"] / R["ozkaynak_ana"]
            if "favok_ttm" in R.columns and "net_borc" in R.columns:
                R["fd_favok"] = np.where(R["favok_ttm"] > 0, (R["piyasa_degeri_mn"] + R["net_borc"]) / R["favok_ttm"], np.nan)
            if "serbest_nakit_ttm" in R.columns:
                R["snak_verimi"] = R["serbest_nakit_ttm"] / R["piyasa_degeri_mn"]
            if "temettu_ttm" in R.columns:
                R["temettu_verimi"] = R["temettu_ttm"] / R["piyasa_degeri_mn"]  # vekil: konsolide nakit akışındaki temettü ödemeleri (azınlık dahil)
        R = R.drop(columns=[c for c in ("ozkaynak_ana", "net_borc", "favok_ttm", "serbest_nakit_ttm", "temettu_ttm") if c in R.columns])
    if "temettu_ttm_ps" in R.columns:
        R["temettu_verimi"] = R["temettu_ttm_ps"] / P
        R = R.drop(columns=["temettu_ttm_ps"])
    # 6) Olaylar
    if not g.olaylar.empty and "kamuya_acilma" in g.olaylar.columns:
        O = g.olaylar.dropna(subset=["kamuya_acilma"]).sort_values("kamuya_acilma")
        z = R["zaman"].dt.tz_convert("UTC").dt.tz_localize(None).to_numpy()
        oz = pd.to_datetime(O["kamuya_acilma"]).dt.tz_convert("UTC").dt.tz_localize(None).to_numpy()
        yon = O["yon"].map({"olumlu": 1, "olumsuz": -1}).fillna(0).to_numpy() if "yon" in O.columns else np.zeros(len(O))
        idx_simdi = np.searchsorted(oz, z, side="right")
        idx_1g = np.searchsorted(oz, z - np.timedelta64(24, "h"), side="right")
        idx_5g = np.searchsorted(oz, z - np.timedelta64(5 * 24, "h"), side="right")
        R["olay_sayi_1g"] = idx_simdi - idx_1g
        R["olay_sayi_5g"] = idx_simdi - idx_5g
        kum = np.concatenate([[0], np.cumsum(yon)])
        R["olay_yon_5g"] = kum[idx_simdi] - kum[idx_5g]
        son = idx_simdi - 1
        R["son_olay_tur"] = np.where(son >= 0, O["tur"].to_numpy()[np.clip(son, 0, None)], None)
        R["son_olay_baslik"] = np.where(son >= 0, O["baslik"].to_numpy()[np.clip(son, 0, None)], None)
        fark = (z - oz[np.clip(son, 0, None)]) / np.timedelta64(1, "h")
        R["son_olay_saat_fark"] = np.where(son >= 0, fark, np.nan)
    # 7) Takvim
    R["haftanin_gunu"] = R["zaman"].dt.weekday
    R["ay"] = R["zaman"].dt.month
    R["bilanco_sezonu"] = R["ay"].isin([2, 3, 5, 8, 11]).astype(int)
    # 8) Etiketler (satır fiyatına göre)
    for k in (1, 5, 20, 60):
        R[f"ileri_{k}g"] = R[f"C_ileri_{k}"] / P - 1
    R["ileri_min_20g"] = R["min_ileri_20"] / P - 1
    R["ileri_max_20g"] = R["max_ileri_20"] / P - 1
    R["sat_sinyali_20g"] = (R["ileri_min_20g"] <= -0.10).astype("Int64").where(R["ileri_min_20g"].notna())
    R["al_sinyali_20g"] = ((R["ileri_max_20g"] >= 0.10) & (R["ileri_20g"] > 0)).astype("Int64").where(R["ileri_20g"].notna())
    if "1h" in set(R["cozunurluk"]):
        R["ileri_1s"] = np.where(R["cozunurluk"] == "1h", R["kapanis"].shift(-1) / P - 1, np.nan)
        # gün değişiminde 1s ileri gece getirisini de kapsar; bu bilinçli (sonraki çubuk)
    # Yardımcı sütunları at
    at = [c for c in R.columns if c.startswith(("C_", "X_", "K_", "ma20", "ma50", "ma200", "max252", "O_d", "min_ileri", "max_ileri", "dolar_C_", "hacim_ort_20", "hacim_birikimli")) and not c.endswith("_uzaklik")]
    R = R.drop(columns=[c for c in at if c in R.columns])
    R["zaman"] = R["zaman"].dt.strftime("%Y-%m-%d %H:%M")
    R["gun"] = R["gun"].dt.strftime("%Y-%m-%d")
    return R


# --- depo ---------------------------------------------------------------------------------------
def _tabloya_ekle(db: sqlite3.Connection, tablo: str, df: pd.DataFrame, sil_sql: str | None = None, sil_param: tuple = ()) -> None:
    """Tabloya satır ekler; tabloda olmayan sütunlar ALTER TABLE ile eklenir (hisseler arasında sütun kümesi değişebilir)."""
    mevcut = [r[1] for r in db.execute(f"PRAGMA table_info({tablo})")]
    if mevcut:
        for c in df.columns:
            if c not in mevcut:
                db.execute(f'ALTER TABLE {tablo} ADD COLUMN "{c}"')
        if sil_sql:
            db.execute(sil_sql, sil_param)
    df.to_sql(tablo, db, if_exists="append", index=False)


def depoya_yaz(db_yolu: str | Path, hisse: str, R: pd.DataFrame, olaylar: pd.DataFrame | None = None, kalemler: pd.DataFrame | None = None,
               literatur_json: str | Path | None = None) -> None:
    db_yolu = Path(db_yolu)
    db_yolu.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(db_yolu)
    try:
        if literatur_json and Path(literatur_json).exists():
            lit = pd.DataFrame(json.loads(Path(literatur_json).read_text(encoding="utf-8")))
            for c in lit.columns:
                lit[c] = lit[c].map(lambda v: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
            lit.to_sql("literatur", db, if_exists="replace", index=False)
        db.execute("CREATE TABLE IF NOT EXISTS formuller (sutun TEXT PRIMARY KEY, baslik TEXT, formul TEXT, pencere TEXT, kaynak TEXT, yon TEXT)")
        db.executemany("INSERT OR REPLACE INTO formuller VALUES (?,?,?,?,?,?)", [(f["sutun"], f["baslik"], f["formul"], f["pencere"], f["kaynak"], f["yon"]) for f in FORMULLER])
        _tabloya_ekle(db, "omurga", R, "DELETE FROM omurga WHERE hisse = ?", (hisse,))
        db.execute("CREATE INDEX IF NOT EXISTS omurga_hz ON omurga (hisse, zaman)")
        if olaylar is not None and not olaylar.empty:
            o = olaylar.copy()
            for c in o.columns:
                if pd.api.types.is_datetime64_any_dtype(o[c]):
                    o[c] = o[c].astype(str)
                elif o[c].dtype == object:
                    o[c] = o[c].map(lambda v: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
            o["dosya"] = hisse  # olayın ait olduğu hisse dosyası (makro olaylar her dosyada tekrarlanır)
            _tabloya_ekle(db, "olaylar", o, "DELETE FROM olaylar WHERE dosya = ?", (hisse,))
        if kalemler is not None and not kalemler.empty:
            k = kalemler.reset_index()
            k["donem"] = k["donem"].astype(str)
            k["hisse"] = hisse
            _tabloya_ekle(db, "temel_ceyrek", k, "DELETE FROM temel_ceyrek WHERE hisse = ?", (hisse,))
        db.execute("CREATE TABLE IF NOT EXISTS meta (hisse TEXT PRIMARY KEY, satir INTEGER, ilk TEXT, son TEXT, guncelleme TEXT)")
        db.execute("INSERT OR REPLACE INTO meta VALUES (?,?,?,?,datetime('now'))", (hisse, len(R), R["zaman"].min(), R["zaman"].max()))
        db.commit()
    finally:
        db.close()


def csv_gz_yaz(yol: str | Path, R: pd.DataFrame) -> None:
    yol = Path(yol)
    yol.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(yol, "wt", encoding="utf-8") as f:
        R.to_csv(f, index=False)


def olaylari_hazirla(bilgi_db: str | Path | None, ek_json: list[str | Path] | None = None, hisse: str | None = None,
                     grup: list[str] | None = None) -> pd.DataFrame:
    """Bilgi veritabanı (YALNIZ metin kaynaklı olaylar; sayısal/birleşik olaylar fiyat hareketinden türediği için
    geleceğe bakar, alınmaz) + ek JSON paketlerinden olay tablosu; kamuya_acilma yoksa bitiş günü 18:30.
    `grup`: hissenin iştirakleri/ilgili kodlar (holdingler için) — onların olayları da dosyaya girer."""
    parcalar = []
    if bilgi_db and Path(bilgi_db).exists():
        db = sqlite3.connect(bilgi_db)
        try:
            parcalar.append(pd.read_sql_query("SELECT kapsam, hisse, sektor, baslangic, bitis, kamuya_acilma, tur, baslik, anlam, yon, onden_gorulebilir, guven, kaynak_tipi FROM olaylar WHERE kaynak_tipi = 'metin'", db))
        finally:
            db.close()
    for yol in ek_json or []:
        p = Path(yol)
        if not p.exists():
            continue
        veri = json.loads(p.read_text(encoding="utf-8"))
        liste = veri.get("olaylar", veri) if isinstance(veri, dict) else veri
        parcalar.append(pd.DataFrame(liste))
    if not parcalar:
        return pd.DataFrame()
    O = pd.concat(parcalar, ignore_index=True)
    for c in ("kapsam", "hisse", "sektor", "baslangic", "bitis", "kamuya_acilma", "tur", "baslik", "anlam", "yon", "onden_gorulebilir", "guven", "kaynak_tipi"):
        if c not in O.columns:
            O[c] = None
    ka = pd.to_datetime(O["kamuya_acilma"], errors="coerce")
    bitis = pd.to_datetime(O["bitis"], errors="coerce") + pd.Timedelta(hours=18, minutes=30)
    ka = ka.fillna(bitis)
    O["kamuya_acilma"] = ka.dt.tz_localize(TZ, ambiguous="NaT", nonexistent="shift_forward") if ka.dt.tz is None else ka.dt.tz_convert(TZ)
    O = O.dropna(subset=["kamuya_acilma"])
    if hisse:
        from ..bilgi.sema import SEKTORLER

        ilgili = {hisse, *(grup or [])}
        sektorler = {SEKTORLER.get(h) for h in ilgili} - {None}
        O = O[(O["hisse"].isin(ilgili)) | (O["kapsam"].isin(["yerel_makro", "kuresel"])) | ((O["kapsam"] == "sektor") & (O["sektor"].isin(sektorler)))]
    return O.drop_duplicates(subset=["hisse", "baslangic", "tur", "baslik"]).sort_values("kamuya_acilma").reset_index(drop=True)
