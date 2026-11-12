"""Aşama 4 — README'yi makinece okunur JSON'a dönüştürür.

Liste insan için Markdown'da tutulur; uygulamalar ise yapılandırılmış veri ister.
README'de 'API for this project' diye bağlantısı verilen ayrı bir proje bu işi
yapar (davemachado/public-api). Biz aynı fikri küçük bir dışa aktarıcıyla
gösteriyoruz: değerleri normalize ediyor (HTTPS -> bool, Auth -> None/str) ve
özet istatistik ekliyoruz.
"""

from __future__ import annotations

import json
from collections import Counter

from asama1_ayristir import Belge, Kayit


def kaydi_normalize_et(kayit: Kayit) -> dict:
    auth = kayit.auth.strip('`')
    return {
        'baslik': kayit.baslik,
        'url': kayit.url,
        'aciklama': kayit.aciklama,
        'auth': None if auth == 'No' else auth,
        'https': kayit.https == 'Yes',
        'cors': kayit.cors.lower() or None,
        'kategori': kayit.kategori,
    }


def disa_aktar(belge: Belge) -> dict:
    kategoriler = []
    auth_sayaci: Counter[str] = Counter()
    https_sayaci: Counter[str] = Counter()
    cors_sayaci: Counter[str] = Counter()
    for kategori in belge.kategoriler:
        kayitlar = [kaydi_normalize_et(k) for k in kategori.kayitlar if k.baslik]
        for kayit in kayitlar:
            auth_sayaci[kayit['auth'] or 'yok'] += 1
            https_sayaci['evet' if kayit['https'] else 'hayir'] += 1
            cors_sayaci[kayit['cors'] or 'bos'] += 1
        kategoriler.append({'ad': kategori.ad, 'kayit_sayisi': len(kayitlar), 'kayitlar': kayitlar})
    return {
        'kategori_sayisi': len(kategoriler),
        'kayit_sayisi': sum(k['kayit_sayisi'] for k in kategoriler),
        'istatistik': {
            'auth': dict(auth_sayaci.most_common()),
            'https': dict(https_sayaci.most_common()),
            'cors': dict(cors_sayaci.most_common()),
        },
        'kategoriler': kategoriler,
    }


def json_yaz(belge: Belge, yol: str) -> dict:
    veri = disa_aktar(belge)
    with open(yol, 'w', encoding='utf-8') as dosya:
        json.dump(veri, dosya, ensure_ascii=False, indent=2)
        dosya.write('\n')
    return veri
