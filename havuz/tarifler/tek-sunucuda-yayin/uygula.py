"""tek-sunucuda-yayin tarifini bir proje klasörüne uygular (havuzdaki temellere DOKUNMAZ).

Kullanım:  python havuz/tarifler/tek-sunucuda-yayin/uygula.py <proje-klasörü>
Sonuç:     <proje>/uygulama  (havuz/uygulama kopyası + yedek saklama süresi ve geri yükleme betiği, testleri)
           <proje>/site      (havuz/site kopyası; değişmeden)
           <proje>/yayin     (systemd birimleri, Caddyfile, ortam örneği, sağlık / güncelleme / site yayın betikleri)
İki temelde de `npm ci` çalışır. Sunucuya kurulum adımları: README.md → "Adım adım". Doğrulama: dogrula.py.
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
            lambda: temeli_kopyala(gunluk, "uygulama", proje),
            lambda: temeli_kopyala(gunluk, "site", proje),
            lambda: yerlestir_adimi(gunluk, tarif, proje),
            lambda: node_kur(gunluk, proje / "uygulama"),
            lambda: node_kur(gunluk, proje / "site"),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
