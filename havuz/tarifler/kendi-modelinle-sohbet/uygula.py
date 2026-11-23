"""kendi-modelinle-sohbet tarifini bir proje klasörüne uygular (havuzdaki temellere DOKUNMAZ).

Kullanım:  python havuz/tarifler/kendi-modelinle-sohbet/uygula.py <proje-klasörü>
Sonuç:     <proje>/dil-modeli   (havuz/dil-modeli kopyası; değişmeden — örnek model dahil)
           <proje>/yz           (havuz/yz kopyası + yz.dil-modeli.yaml bağlantı ayarı)
           <proje>/baglanti     (tek komutluk deneme: baglanti/dene.py)
dil-modeli ortamı yalnız sunucu için kurulur (`sun` ekstrası: torch + fastapi + uvicorn); kendi
denetimini de koşacaksanız `uv sync --frozen --extra dev` ile geliştirme araçlarını ekleyin.
Genişletme: yeni bir kurulum adımı → `isler` listesine bir satır (sıra önemlidir: önce kopya).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al, yerlestir_adimi
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import python_kur, temeli_kopyala


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=True)
    gunluk = Gunluk(f"{tarif.ad} · uygula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_kopyala(gunluk, "dil-modeli", proje),
            lambda: temeli_kopyala(gunluk, "yz", proje),
            lambda: yerlestir_adimi(gunluk, tarif, proje),
            lambda: python_kur(gunluk, proje / "dil-modeli", ["sun"]),
            lambda: python_kur(gunluk, proje / "yz"),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
