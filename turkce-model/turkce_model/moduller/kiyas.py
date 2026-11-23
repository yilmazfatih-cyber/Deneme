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
_HARF_ONCESI = r"(?<![^\W\d_])"  # önünde harf yok: "ise" içindeki "e", "ışık" içindeki "şık" sayılmaz
_RET = r"(?!\s*[,;:]?\s*(?:değil|olamaz|yanlış|hatalı|eksik|or|veya|ya\s+da|yoksa|is\s+(?:not|incorrect|wrong))\b)"
_CEVAP_IFADESI = re.compile(  # "Cevap C'dir" de geçerli; küçük harf yalnız "a)" biçiminde
    _HARF_ONCESI + r"(?:do[ğg]ru\s+)?(?:cevap|yan[ıi]t|answer|[şs][ıi]k)\w*\s*(?:olarak|is\b|:|：|=)?\s*\**\(?"
    + _HARF_ONCESI + r"((?-i:[A-E])|[a-e](?=\)))\)?(?!\w)" + _RET,
    re.IGNORECASE,
)
_HARF_SIKKI = re.compile(r"(?<![\w'])([A-E])\s*(?:şıkkı|seçeneği)(?!\s+(?:ise\s+)?(?:yanlış|değil|hatalı|eksik|olamaz))")
_BASTA_HARF = re.compile(r"^\(?([A-Ea-e])\)[\s.]")
_SECENEK_ISARETI = re.compile(r"(?<![\w'])\(?[A-E]\)\s")
_TEK_HARF = re.compile(r"(?<![\w'])([A-E])(?!\w)")  # "B'dir" de sayılır
# Olumsuzlanan şık ("A değil", "C şıkkı yanlış", "B seçeneği ise hatalıdır", "A doğru değil", "not A"): hiçbir kural
# bu harfi cevap diye döndürmez.
_OLUMSUZ_HARF = re.compile(
    r"(?<![\w'])\(?([A-E])\)?(?:\s+(?:şıkkı|seçeneği|şık))?(?:\s+ise)?\s*[,;:]?\s*(?:do[ğg]ru\s+)?"
    r"(?:değil|olamaz|yanlış|hatalı|eksik|is\s+(?:not|incorrect|wrong))"
    r"|\bnot\s+\(?([A-E])\)?(?![\w'])"
)


def soru_istemi(s: Soru) -> str:
    """Modele gönderilen metin: yönerge + projenin soru biçimi (``Ders/Soru/A)…/Cevap:``)."""
    return f"{YONERGE}\n\n{istem(s)}"


def cevap_cikar(metin: str, secenek_sayisi: int) -> int | None:
    """Modelin cevabından şık sırasını çıkarır (0 = A); anlaşılamıyorsa ``None`` (cevapsız sayılır).

    Sırayla: yalnız harf ("C", "C)", "(C)"); "Cevap: C" gibi bir ifade (sonuncusu); "C şıkkı"; "C) …" ile
    başlayan cevap; son satırda tek bir harf. Geçerli şık aralığı dışındaki harf ve olumsuzlanan harf ("Cevap A
    değil.", "C şıkkı yanlış") hiçbir kuralda cevap sayılmaz; başka bir harf onaylanmışsa o alınır ("Cevap A değil,
    B'dir." → B).
    """
    gecerli = HARFLER[:secenek_sayisi]

    t = metin.replace("**", "").strip()
    olumsuz = {h for ikili in _OLUMSUZ_HARF.findall(t) for h in ikili if h}

    def sira(harf: str) -> int | None:
        harf = harf.upper()
        return gecerli.index(harf) if harf in gecerli and harf not in olumsuz else None

    if not t:
        return None
    m = _YALNIZ_HARF.match(t)
    if m:
        return sira(m.group(1))
    ifadeler = [x for x in _CEVAP_IFADESI.findall(t) if sira(x) is not None]
    if ifadeler:
        return sira(ifadeler[-1])
    siklar = {x for x in _HARF_SIKKI.findall(t) if sira(x) is not None}
    if siklar:
        return sira(siklar.pop()) if len(siklar) == 1 else None
    if len(_SECENEK_ISARETI.findall(t)) >= 2:  # seçenekleri yineleyen cevap: bir harf seçilmemiş
        return None
    m = _BASTA_HARF.match(t)
    if m:
        return sira(m.group(1))
    son_satir = t.splitlines()[-1]
    harfler = {x for x in _TEK_HARF.findall(son_satir) if sira(x) is not None}
    return sira(harfler.pop()) if len(harfler) == 1 else None


def dusunurken_kesildi(kesik: object, dusunme_kapandi: object) -> bool:
    """Cevap ``en_fazla_token``'da kesildi ve ham içerikte kapanan düşünme bloğu (``</think>``) yok: model düşünürken
    kesildi. Sohbet şablonu düşünmeyi kendisi açan sunucularda (vLLM, llama.cpp ``--jinja``) içerikte ``<think>``
    görünmez; metin düşüncenin kendisidir ("cevap A olabilir mi?"), içinden şık çıkarılmaz. Bu bilgiyi taşımayan eski
    önbellek kaydında ``dusunme_kapandi`` ``None``dır: kayıt eskisi gibi okunur."""
    return bool(kesik) and dusunme_kapandi is False


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
    veri = json.dumps(
        [ayar.model, s.kimlik, soru_istemi(s), ayar.en_fazla_token, ayar.ek_istek], sort_keys=True, ensure_ascii=False
    )
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
        yarim = yol.exists() and yol.stat().st_size and not yol.read_bytes().endswith(b"\n")
        dosya = yol.open("a", encoding="utf-8")
        if yarim:  # yarıda kesilmiş son satır: yeni kayıt ona yapışmasın
            dosya.write("\n")
    dogru = cevapsiz = kesik = 0
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
                sinirda = getattr(sunucu, "son_bitis", None) == "length"
                kapandi = bool(getattr(sunucu, "son_dusunme_kapandi", False))
                kayit = {
                    "anahtar": anahtar, "kimlik": s.kimlik, "cevap": cevap,
                    "secim": None if dusunurken_kesildi(sinirda, kapandi) else cevap_cikar(cevap, len(s.secenekler)),
                    "kesik": sinirda, "dusunme_kapandi": kapandi,
                }
                if dosya is not None:
                    dosya.write(json.dumps(kayit, ensure_ascii=False) + "\n")
                    dosya.flush()
                if len(sureler) % 10 == 0 or i == len(sorular):
                    ort = sum(sureler) / len(sureler)
                    yaz(f"  {ad}: {i}/{len(sorular)} soru (soru başına ~{ort:.1f} sn, kalan ~{(len(sorular) - i) * ort / 60:.0f} dk)")
            secim = cevap_cikar(str(kayit.get("cevap", "")), len(s.secenekler))  # kurallar değişince eski harf kalmasın
            if dusunurken_kesildi(kayit.get("kesik"), kayit.get("dusunme_kapandi")):
                secim = None  # cevapsız ve kesik sayılır
            rastgele += 1.0 / len(s.secenekler)
            ders[s.ders]["n"] += 1
            if secim is None:
                cevapsiz += 1
                kesik += bool(kayit.get("kesik"))
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
        "kesik": kesik,
        "rastgele": rastgele / n,
        "dersler": {k: {"n": int(v["n"]), "dogruluk_uretim": v["dogru"] / v["n"]} for k, v in sorted(ders.items())},
    }
