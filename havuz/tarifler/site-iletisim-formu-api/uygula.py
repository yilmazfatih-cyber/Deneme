"""site-iletisim-formu-api tarifini bir proje klasörüne uygular (havuzdaki temellere DOKUNMAZ).

Kullanım:  python havuz/tarifler/site-iletisim-formu-api/uygula.py <proje-klasörü>
Sonuç:     <proje>/site       (havuz/site kopyası + tests/tarif: iki sunuculu uçtan uca test)
           <proje>/uygulama   (havuz/uygulama kopyası + POST /api/iletisim ucu, CONTACT_* ayarları, testler)
İki temelde de `npm ci` çalışır. Sitenin formu derleme anında PUBLIC_FORM_ENDPOINT ile API'ye bağlanır
(README → "Adım adım"). Doğrulama: dogrula.py.
Genişletme: yeni bir kurulum adımı → `isler` listesine bir satır (sıra önemlidir: önce kopya).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al, yerlestir_adimi
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import node_kur, temeli_kopyala


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=True)
    gunluk = Gunluk(f"{tarif.ad} · uygula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_kopyala(gunluk, "site", proje),
            lambda: temeli_kopyala(gunluk, "uygulama", proje),
            lambda: yerlestir_adimi(gunluk, tarif, proje),
            lambda: node_kur(gunluk, proje / "site"),
            lambda: node_kur(gunluk, proje / "uygulama"),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
