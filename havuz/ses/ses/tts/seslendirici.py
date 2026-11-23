"""Seslendirme hattı: metin → normalizasyon → cümle cümle sentez → hız/perde → sessizlik → düzey.

Perde kaydırma: ses `r = 2^(yarımton/12)` kat UZUN sentezlenir (length_scale × r), sonra r kat hızlı
çalınacak biçimde yeniden örneklenir (kaynak hız fs·r sayılır). Sonuç: perde × r, süre aynı. Bedeli:
biçimlendiriciler (formant) de kayar ("çizgi film" etkisi); ±3 yarım tonun dışı doğal duyulmaz.
Cümleler arası sessizlik `cumle_arasi_ms` (+ en çok 2 × 30 ms pay) olur: her cümlenin baş/son
sessizliği kırpılır, ünsüz kuyrukları kesilmesin diye 30 ms bırakılır.
Ses yüksekliği BS.1770 LUFS'a getirilir (tepe ≤ −1 dBFS; aşacaksa kazanç kısılır).
Kim kullanır: komutlar.py (`seslendir`), sunucu/uygulama.py, scripts/gidis_donus.py.
Genişletme: yeni bir son işlem (ör. hafif yankı) → `seslendir` sonuna bir adım + tests/test_tts.py.
"""

from __future__ import annotations

import numpy as np

from ses.hatalar import BicimHatasi
from ses.ses_isleme.duzey import lufs_normallestir
from ses.ses_isleme.ses import Dizi, Ses
from ses.ses_isleme.sessizlik import sessizligi_kirp, sessizlik, sessizlikle_cevrele
from ses.ses_isleme.yeniden_ornekle import yeniden_ornekle
from ses.tts.motor import SesAyari, TtsMotoru
from ses.tts.normallestir.normallestirici import normallestir

AZAMI_METIN = 5000
"""Tek istekte seslendirilecek en uzun metin (karakter); uzun metni bölün."""


def _perde_kaydir(dizi: Dizi, ornekleme: int, oran: float) -> Dizi:
    if abs(oran - 1.0) < 1e-6:
        return dizi
    kaynak = max(50, round(ornekleme * oran / 50) * 50)  # 50 Hz katı: oran sade kalsın (L/M küçük)
    return yeniden_ornekle(dizi, kaynak, ornekleme)


def seslendir(motor: TtsMotoru, metin: str, ayar: SesAyari | None = None) -> Ses:
    """Metni sese çevirir → tek kanallı `Ses` (motorun ya da `ayar.ornekleme`'nin hızında)."""
    ayar = ayar or SesAyari()
    if len(metin) > AZAMI_METIN:
        raise BicimHatasi(f"Metin çok uzun ({len(metin)} karakter; sınır {AZAMI_METIN}). Bölün.")
    okunus = normallestir(metin) if ayar.normallestir else metin
    if not okunus.strip():
        raise BicimHatasi("Seslendirilecek metin boş.")
    fs = motor.ornekleme
    oran = 2 ** (ayar.perde / 12)
    parcalar: list[Dizi] = []
    for ham in motor.cumleler(okunus, uzunluk_olcegi=oran / ayar.hiz, konusmaci=ayar.konusmaci):
        cumle = sessizligi_kirp(np.asarray(ham, dtype=np.float32), fs, pay_ms=30)
        if len(cumle) == 0:
            continue
        if parcalar:
            parcalar.append(sessizlik(ayar.cumle_arasi_ms, fs))
        parcalar.append(_perde_kaydir(cumle, fs, oran))
    if not parcalar:
        raise BicimHatasi("Seslendirici bu metinden ses üretmedi (yalnız noktalama mı?).")
    dizi = sessizlikle_cevrele(np.concatenate(parcalar), fs, ayar.bas_son_ms, ayar.bas_son_ms)
    if ayar.hedef_lufs is not None:
        dizi, _ = lufs_normallestir(dizi, fs, hedef_lufs=ayar.hedef_lufs)
    if ayar.ornekleme and ayar.ornekleme != fs:
        dizi, fs = yeniden_ornekle(dizi, fs, ayar.ornekleme), ayar.ornekleme
    return Ses.tek_kanaldan(dizi, fs)
