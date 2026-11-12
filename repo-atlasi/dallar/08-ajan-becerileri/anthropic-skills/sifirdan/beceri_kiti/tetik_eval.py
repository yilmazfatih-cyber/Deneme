"""Tetiklenme değerlendirmesi: bir açıklama doğru sorgularda becerinin seçilmesini sağlıyor mu?

skill-creator'ın scripts/run_eval.py ve scripts/run_loop.py betiklerinin mantığını izler:
- her sorgu birkaç kez koşulur, tetiklenme oranı = tetiklenen / koşu,
- tetiklenmesi gereken sorgu oran >= eşikte geçer, gerekmeyen sorgu oran < eşikte geçer (eşik 0.5),
- sorgular should_trigger'a göre katmanlı olarak eğitim/test diye bölünür (ayrılan pay 0.4),
- en iyi açıklama *test* başarısına göre seçilir; eğitim puanına göre seçmek aşırı uydurmadır.

Farklar: özgün döngü `claude -p` ile gerçek modeli çalıştırır ve yeni açıklamaları Claude'a
yazdırır. Biz modeli Secici (BM25) + tohumlu gürültüyle taklit ediyoruz ve aday açıklamaları
sen veriyorsun. Sonuçlar bu yüzden yalnızca mekanizmayı öğretir; gerçek tetiklenmeyi ölçmez.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, replace
from pathlib import Path

from .dizin import BeceriBilgisi, Secici


@dataclass
class Sorgu:
    metin: str
    tetiklemeli: bool


def sorgulari_yukle(yol: str | Path) -> list[Sorgu]:
    """skill-creator biçimini okur: [{"query": ..., "should_trigger": true/false}, ...]."""
    veri = json.loads(Path(yol).read_text(encoding='utf-8'))
    return [Sorgu(o['query'], bool(o['should_trigger'])) for o in veri]


def bol(sorgular: list[Sorgu], ayrilan: float = 0.4, tohum: int = 42) -> tuple[list[Sorgu], list[Sorgu]]:
    """Katmanlı bölme: her sınıftan max(1, int(n * ayrilan)) sorgu teste ayrılır (run_loop ile aynı kural)."""
    rastgele = random.Random(tohum)
    olumlu = [s for s in sorgular if s.tetiklemeli]
    olumsuz = [s for s in sorgular if not s.tetiklemeli]
    rastgele.shuffle(olumlu)
    rastgele.shuffle(olumsuz)
    n_olumlu = max(1, int(len(olumlu) * ayrilan))
    n_olumsuz = max(1, int(len(olumsuz) * ayrilan))
    test = olumlu[:n_olumlu] + olumsuz[:n_olumsuz]
    egitim = olumlu[n_olumlu:] + olumsuz[n_olumsuz:]
    return egitim, test


class SahteYonlendirici:
    """Modelin "bu beceriye bakayım mı?" kararının oyuncak hâli.

    En yüksek puanlı beceri, puanı (esik + gürültü) değerini geçerse "okunur". Gürültü tohumlu
    olduğundan aynı sorgu farklı koşularda farklı sonuç verebilir; tıpkı gerçek modelde olduğu
    gibi tek koşuya güvenmemek gerekir.
    """

    def __init__(self, esik: float = 1.0, gurultu: float = 0.35, tohum: int = 7):
        self.esik = esik
        self.gurultu = gurultu
        self.rastgele = random.Random(tohum)

    def tetiklenen(self, sorgu: str, beceriler: list[BeceriBilgisi]) -> str | None:
        secici = Secici(beceriler)
        adaylar = sorted(((secici.puan(sorgu, b.ad), b.ad) for b in beceriler if not b.kullanici_cagirir), reverse=True)
        if not adaylar:
            return None
        puan, ad = adaylar[0]
        return ad if puan >= self.esik + self.rastgele.gauss(0.0, self.gurultu) else None


def degerlendir(
    hedef: BeceriBilgisi,
    aciklama: str,
    sorgular: list[Sorgu],
    rakipler: list[BeceriBilgisi] = (),
    kosu: int = 3,
    esik: float = 0.5,
    yonlendirici: SahteYonlendirici | None = None,
) -> dict:
    """Hedef becerinin açıklamasını 'aciklama' ile değiştirip sorguları koşar (run_eval'in karşılığı)."""
    yonlendirici = yonlendirici or SahteYonlendirici()
    aday = replace(hedef, aciklama=aciklama)
    beceriler = [aday, *rakipler]
    sonuclar = []
    for sorgu in sorgular:
        tetik = sum(1 for _ in range(kosu) if yonlendirici.tetiklenen(sorgu.metin, beceriler) == aday.ad)
        oran = tetik / kosu
        gecti = oran >= esik if sorgu.tetiklemeli else oran < esik
        sonuclar.append({'sorgu': sorgu.metin, 'tetiklemeli': sorgu.tetiklemeli, 'oran': oran, 'gecti': gecti})
    gecen = sum(1 for s in sonuclar if s['gecti'])
    return {'aciklama': aciklama, 'sonuclar': sonuclar, 'gecen': gecen, 'toplam': len(sonuclar)}


def secim_yap(gecmis: list[dict]) -> dict:
    """Önce test, eşitlikte eğitim puanı, sonra daha kısa açıklama kazanır (her tur bağlam maliyetidir)."""
    return max(gecmis, key=lambda g: (g['_test'], g['_egitim'], -len(g['aciklama'])))


def en_iyiyi_sec(
    hedef: BeceriBilgisi,
    adaylar: list[str],
    sorgular: list[Sorgu],
    rakipler: list[BeceriBilgisi] = (),
    ayrilan: float = 0.4,
    kosu: int = 3,
    tohum: int = 42,
    gurultu: float = 0.35,
) -> dict:
    """Her aday açıklamayı eğitim ve test kümesinde ölçer; test başarısı en yüksek olanı seçer."""
    egitim, test = bol(sorgular, ayrilan, tohum)
    gecmis = []
    for sira, aciklama in enumerate(adaylar, start=1):
        yonlendirici = SahteYonlendirici(gurultu=gurultu, tohum=tohum + sira)
        e = degerlendir(hedef, aciklama, egitim, rakipler, kosu, yonlendirici=yonlendirici)
        t = degerlendir(hedef, aciklama, test, rakipler, kosu, yonlendirici=yonlendirici)
        gecmis.append(
            {
                'sira': sira,
                'aciklama': aciklama,
                'egitim': f'{e["gecen"]}/{e["toplam"]}',
                'test': f'{t["gecen"]}/{t["toplam"]}',
                '_test': t['gecen'],
                '_egitim': e['gecen'],
            }
        )
    en_iyi = secim_yap(gecmis)
    return {
        'en_iyi_aciklama': en_iyi['aciklama'],
        'en_iyi_puan': en_iyi['test'],
        'egitim_sayisi': len(egitim),
        'test_sayisi': len(test),
        'gecmis': [{k: v for k, v in g.items() if not k.startswith('_')} for g in gecmis],
    }
