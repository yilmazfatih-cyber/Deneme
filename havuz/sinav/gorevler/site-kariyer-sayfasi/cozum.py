"""Başvuru çözümü: üreteçle sayfa, içerik, taslaktan çıkarma ve menü bağlantısı.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: site.config.ts'teki menü değişirse aşağıdaki aranan metni güncelleyin.
"""

from pathlib import Path

from exam.edit import replace, run, write

PAGE = """---
title: 'Kariyer'
description: 'Sedir ekibine katılın: açık pozisyonlarımızı, çalışma biçimimizi ve nasıl başvuracağınızı bu sayfada bulabilirsiniz.'
---

Küçük işletmelerin işini kolaylaştıran ürünler yapıyoruz ve ekibimizi büyütüyoruz. Merak eden, soran ve
kullanıcıyı dinleyen insanlarla çalışmak istiyoruz.

## Açık pozisyonlar

- Ön yüz geliştirici (İstanbul, uzaktan)
- Ürün tasarımcısı (Ankara)

Başvurmak için iletişim sayfasından bize kısa bir not bırakın.
"""


def coz(kopya: Path) -> None:
    run(["npm", "run", "new", "--", "sayfa", "Kariyer"], kopya)
    write(kopya / "src/content/sayfalar/tr/kariyer.md", PAGE)
    replace(
        kopya / "src/site.config.ts",
        "        { label: 'Hakkında', href: '/hakkinda/' },\n      ],",
        "        { label: 'Hakkında', href: '/hakkinda/' },\n        { label: 'Kariyer', href: '/kariyer/' },\n      ],",
    )
    run(
        ["npx", "prettier", "--write", "src/content/sayfalar/tr/kariyer.md", "src/site.config.ts"],
        kopya,
    )
