"""belgeye-soru-uygulamasi tarifini bir proje klasörüne uygular (havuzdaki temellere DOKUNMAZ).

Kullanım:  python havuz/tarifler/belgeye-soru-uygulamasi/uygula.py <proje-klasörü>
Sonuç:     <proje>/uygulama  (havuz/uygulama kopyası + POST /api/sor ucu + Sor sayfası + testler)
           <proje>/yz        (havuz/yz kopyası; değişmeden — RAG sunucusu olarak çalışır)
           <proje>/belgeler  (örnek belge klasörü; kendi belgelerinizi buraya koyun)
uygulama için `npm ci`, yz için .venv (kilitten) kurulur. Çalıştırma ve doğrulama: README.md, dogrula.py.
Genişletme: yeni bir kurulum adımı → `isler` listesine bir satır (sıra önemlidir: önce kopya).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al, yerlestir_adimi
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import node_kur, python_kur, temeli_kopyala


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=True)
    gunluk = Gunluk(f"{tarif.ad} · uygula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_kopyala(gunluk, "uygulama", proje),
            lambda: temeli_kopyala(gunluk, "yz", proje),
            lambda: yerlestir_adimi(gunluk, tarif, proje),
            lambda: node_kur(gunluk, proje / "uygulama"),
            lambda: python_kur(gunluk, proje / "yz"),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
