"""Zaman kilidi: "geleceği görmeden" ilkesinin kod karşılığı.

Investor's Last Exam'in temel fikri, ajanın yalnızca karar anında var olan bilgiyi görmesidir.
Bu sınıf her veri isteğini karar anına (`an`) göre süzer:

* Bir çubuk ancak BİTTİKTEN sonra görünür (başlangıç + aralık <= an). Böylece günün kapanış
  fiyatı, gün kapanmadan karar veren ajana sızmaz.
* `an`'dan sonrasını isteyen kod `GelecekVerisiHatasi` alır; sessizce kırpılmaz, çünkü sessiz
  kırpma geleceğe bakan bir hatayı gizler.
* Anlık temel veriler (çarpanlar, bilanço) geçmişe dönük sürümlenmediği için yalnız canlı
  modda verilir; geçmiş bir tarihte karar verirken bu veriyi kullanmak geleceği görmek olurdu.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

from .kaynak import VeriKaynagi, aralik_suresi


class GelecekVerisiHatasi(RuntimeError):
    """Karar anından sonraki bilgiye erişim girişimi."""


class ZamanKilitliVeri:
    def __init__(self, kaynak: VeriKaynagi, an: datetime, canli: bool = False) -> None:
        if an.tzinfo is None:
            raise ValueError("Karar anı saat dilimli olmalı (ör. datetime.now().astimezone())")
        self.kaynak = kaynak
        self.an = pd.Timestamp(an)
        self.canli = canli

    def cubuklar(
        self, sembol: str, baslangic: datetime, bitis: datetime | None = None, aralik: str = "1d"
    ) -> pd.DataFrame:
        bitis_ts = self.an if bitis is None else pd.Timestamp(bitis)
        if bitis_ts.tzinfo is None:
            bitis_ts = bitis_ts.tz_localize(self.an.tz)
        if bitis_ts > self.an:
            raise GelecekVerisiHatasi(
                f"{sembol}: {bitis_ts} istendi ama karar anı {self.an}. Gelecek verisi kullanılamaz."
            )
        sure = aralik_suresi(aralik)
        # Kaynaktan biraz fazlasını iste, sonra yalnızca tamamlanmış çubukları bırak.
        df = self.kaynak.cubuklar(sembol, baslangic, (bitis_ts + sure).to_pydatetime(), aralik)
        if df.empty:
            return df
        bitis_zamani = df.index + sure
        return df[bitis_zamani <= bitis_ts]

    def son_fiyat(self, sembol: str, aralik: str = "1d", geriye_gun: int = 10) -> float | None:
        df = self.cubuklar(sembol, (self.an - pd.Timedelta(days=geriye_gun)).to_pydatetime(), aralik=aralik)
        return None if df.empty else float(df["kapanis"].iloc[-1])

    def temel(self, sembol: str) -> dict[str, Any]:
        if not self.canli:
            raise GelecekVerisiHatasi(
                "Anlık temel veriler geçmişe dönük sürümlenmiyor; zaman kilitli modda kullanılamaz."
            )
        return self.kaynak.temel(sembol)
