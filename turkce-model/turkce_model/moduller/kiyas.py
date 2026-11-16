"""Kıyas modülü: küçük bir DeepSeek metin modeli aynı sorularda ne yapıyor?

Sıfırdan eğitilen modelin doğruluğunu okurken bir ölçü çubuğu verir. İki ölçüm aynı şey değildir: bu projenin
modeli şıkların olasılığıyla puanlanır; modül modeli soruyu okuyup cevabı yazarak cevaplar ("üretimle") ve
milyarlarca token'lık ön eğitimden gelir. Satır ``ilerleme.md``'de "kıyas" aşamasıyla ayrı durur.

Cevaplar soru başına diske yazılır: yarıda kesilen bir kıyas kaldığı yerden sürer.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections import defaultdict
from collections.abc import Callable, Sequence
from pathlib import Path

from ..meb import HARFLER, Soru, istem
from .ayar import MetinAyarlari
from .istemci import YerelSunucu

YONERGE = "Aşağıdaki çoktan seçmeli soruyu cevapla. Yalnızca doğru şıkkın harfini yaz."

_YALNIZ_HARF = re.compile(r"^\(?([A-Ea-e])\)?[.):]?$")  # yalnız harften oluşan cevapta küçük harf de olur
_CEVAP_IFADESI = re.compile(
    r"(?:do[ğg]ru\s+)?(?:cevap|yan[ıi]t|answer|[şs][ıi]k)\w*\s*(?:olarak|is|:|：|=)?\s*\**\(?([A-E])\)?(?!\w)",  # "Cevap C'dir" de geçerli
    re.IGNORECASE,
)
_HARF_SIKKI = re.compile(r"(?<![\w'])([A-E])\s*(?:şıkkı|seçeneği)")
_BASTA_HARF = re.compile(r"^\(?([A-Ea-e])\)[\s.]")
_TEK_HARF = re.compile(r"(?<![\w'])([A-E])(?![\w'])")


def soru_istemi(s: Soru) -> str:
    """Modele gönderilen metin: yönerge + projenin soru biçimi (``Ders/Soru/A)…/Cevap:``)."""
    return f"{YONERGE}\n\n{istem(s)}"


def cevap_cikar(metin: str, secenek_sayisi: int) -> int | None:
    """Modelin cevabından şık sırasını çıkarır (0 = A); anlaşılamıyorsa ``None`` (cevapsız sayılır).

    Sırayla: yalnız harf ("C", "C)", "(C)"); "Cevap: C" gibi bir ifade (sonuncusu); "C şıkkı"; "C) …" ile
    başlayan cevap; son satırda tek bir harf. Geçerli şık aralığı dışındaki harf cevap sayılmaz.
    """
    gecerli = HARFLER[:secenek_sayisi]

    def sira(harf: str) -> int | None:
        harf = harf.upper()
        return gecerli.index(harf) if harf in gecerli else None

    t = metin.replace("**", "").strip()
    if not t:
        return None
    m = _YALNIZ_HARF.match(t)
    if m:
        return sira(m.group(1))
    ifadeler = [x for x in _CEVAP_IFADESI.findall(t) if sira(x) is not None]
    if ifadeler:
        return sira(ifadeler[-1])
    siklar = [x for x in _HARF_SIKKI.findall(t) if sira(x) is not None]
    if siklar:
        return sira(siklar[-1])
    m = _BASTA_HARF.match(t)
    if m:
        return sira(m.group(1))
    son_satir = t.splitlines()[-1]
    harfler = {x for x in _TEK_HARF.findall(son_satir) if sira(x) is not None}
    return sira(harfler.pop()) if len(harfler) == 1 else None


def ornekle(sorular: Sequence[Soru], adet: int) -> list[Soru]:
    """Soruların kararlı bir alt kümesi: kimliğin özetine göre sıralanıp ilk ``adet`` alınır.

    Aynı sorular her çalıştırmada seçilir ve ``adet`` büyüdükçe küme genişler (önceki cevaplar yeniden
    kullanılır). ``adet <= 0`` ya da soru sayısından büyükse hepsi.
    """
    if adet <= 0 or adet >= len(sorular):
        return list(sorular)
    return sorted(sorular, key=lambda s: hashlib.sha256(s.kimlik.encode("utf-8")).hexdigest())[:adet]


def _dosya_adi(model: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", model).strip("_") or "model"


def _soru_anahtari(s: Soru, ayar: MetinAyarlari) -> str:
    veri = json.dumps([s.kimlik, soru_istemi(s), ayar.en_fazla_token, ayar.ek_istek], sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(veri.encode("utf-8")).hexdigest()[:24]


def kiyasla(
    sunucu: YerelSunucu,
    ayar: MetinAyarlari,
    sorular: Sequence[Soru],
    onbellek: Path | None = None,
    yaz: Callable[[str], object] = print,
    ad: str = "sorular",
) -> dict:
    """Modeli ``sorular`` üzerinde sınar. Döndürür: ``{"n", "dogruluk_uretim", "cevapsiz", "rastgele", "dersler"}``."""
    sorular = list(sorular)
    if not sorular:
        return {"n": 0}
    yol = onbellek / f"{_dosya_adi(ayar.model)}.jsonl" if onbellek else None
    bilinen: dict[str, dict] = {}
    if yol is not None and yol.exists():
        for satir in yol.read_text(encoding="utf-8").splitlines():
            try:
                kayit = json.loads(satir)
            except json.JSONDecodeError:
                continue  # yarıda kesilmiş son satır
            bilinen[kayit.get("anahtar", "")] = kayit
    dosya = None
    if yol is not None:
        yol.parent.mkdir(parents=True, exist_ok=True)
        dosya = yol.open("a", encoding="utf-8")
    dogru = cevapsiz = 0
    rastgele = 0.0
    ders: dict[str, dict[str, float]] = defaultdict(lambda: {"n": 0, "dogru": 0})
    sureler: list[float] = []
    try:
        for i, s in enumerate(sorular, 1):
            anahtar = _soru_anahtari(s, ayar)
            kayit = bilinen.get(anahtar)
            if kayit is None:
                bas = time.time()
                cevap = sunucu.sohbet(
                    ayar.model, [{"role": "user", "content": soru_istemi(s)}], ayar.en_fazla_token, ek_istek=ayar.ek_istek
                )
                sureler.append(time.time() - bas)
                kayit = {"anahtar": anahtar, "kimlik": s.kimlik, "cevap": cevap, "secim": cevap_cikar(cevap, len(s.secenekler))}
                if dosya is not None:
                    dosya.write(json.dumps(kayit, ensure_ascii=False) + "\n")
                    dosya.flush()
                if len(sureler) % 10 == 0 or i == len(sorular):
                    ort = sum(sureler) / len(sureler)
                    yaz(f"  {ad}: {i}/{len(sorular)} soru (soru başına ~{ort:.1f} sn, kalan ~{(len(sorular) - i) * ort / 60:.0f} dk)")
            secim = kayit.get("secim")
            rastgele += 1.0 / len(s.secenekler)
            ders[s.ders]["n"] += 1
            if secim is None:
                cevapsiz += 1
            elif secim == s.cevap:
                dogru += 1
                ders[s.ders]["dogru"] += 1
    finally:
        if dosya is not None:
            dosya.close()
    n = len(sorular)
    return {
        "n": n,
        "dogruluk_uretim": dogru / n,
        "cevapsiz": cevapsiz,
        "rastgele": rastgele / n,
        "dersler": {k: {"n": int(v["n"]), "dogruluk_uretim": v["dogru"] / v["n"]} for k, v in sorted(ders.items())},
    }
