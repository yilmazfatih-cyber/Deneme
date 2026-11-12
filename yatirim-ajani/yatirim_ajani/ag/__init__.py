"""Ağ katmanı: BIST'i bir ağ/ağaç olarak inceler (hisseler, sektörler, madenler, küresel seriler arası bağlantılar),
para akışını (yıl, mevsim, saat) ve yatırımcı tiplerinin (yabancı, fon, bireysel) hangi ölçülere göre işlem yaptığını tahmin eder.

- `kaynaklar.py`: ham veri (tüm BIST paneli, sektör endeksleri, madenler, yabancı payı, TEFAS) — dış ağ gerekir.
- `panel.py`: ham veriden getiri/hacim panelleri.
- `agac.py`: korelasyon ağı, en küçük kapsayan ağaç, kümeler, öncü-takipçi ağı.
- `akis.py`: işlem ilgisi ve işaretli hacim rotasyonu, mevsimsellik, saat-içi profil.
- `yatirimci.py`: yatırımcı tipi vekilleri ve tercih ettikleri ölçüler.
- `strateji.py`: bulgulardan türetilen günlük kuralların ileriye yürüyen testi.

Yatırım tavsiyesi değildir; bulgular tanımlayıcıdır.
"""
