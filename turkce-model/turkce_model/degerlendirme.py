"""Değerlendirme: kayıp, şaşkınlık (perplexity), karakter başına bit (BPC), çoktan seçmeli doğruluk, ilerleme günlüğü.

BPC, token sayısından bağımsızdır: farklı tokenizer ya da sözlük boyutlarıyla eğitilmiş modelleri adil karşılaştırır.
"""

from __future__ import annotations

import contextlib
import json
import math
import time
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path

import torch
import torch.nn.functional as F

from .tokenizer import TurkceTokenizer
from .veri import AkisVeri

# TurkishMMLU makalesindeki (Yüksel vd., 2024) 5 örnekli (5-shot) ortalama doğruluklar — bağlam için.
# Bizim ölçümümüz 0 örneklidir ve model aynı formatta eğitilir; birebir karşılaştırma değildir.
MMLU_REFERANSLARI = [
    ("GPT-4o", 83.1),
    ("Llama-3 70B", 66.1),
    ("Llama-3 8B", 46.2),
    ("Trendyol-LLM 7B", 34.1),
    ("Llama-2 7B", 22.3),
    ("Rastgele tahmin (5 şık)", 20.0),
]


@torch.no_grad()
def akis_kaybi(
    model: torch.nn.Module,
    akis: AkisVeri,
    cihaz: str,
    baglam_yoneticisi=contextlib.nullcontext,
    yigin: int = 16,
    en_fazla_pencere: int | None = None,
) -> dict:
    """Akışın tamamı (ya da ilk ``en_fazla_pencere`` penceresi) üzerinde ortalama kayıp."""
    model.eval()
    toplam, sayi = 0.0, 0
    for x, y in akis.pencereler(model.m.baglam, yigin, en_fazla_pencere):
        x, y = x.to(cihaz), y.to(cihaz)
        with baglam_yoneticisi():
            logit, _ = model(x)
        nll = F.cross_entropy(logit.float().reshape(-1, logit.size(-1)), y.reshape(-1), reduction="sum")
        toplam += float(nll)
        sayi += y.numel()
    ortalama = toplam / max(sayi, 1)
    return {"kayip": ortalama, "sasirma": math.exp(min(ortalama, 50)), "toplam_nll": toplam, "token": sayi}


def bpc(toplam_nll: float, karakter: int) -> float:
    """Karakter başına bit: toplam negatif log-olabilirlik (nat) / ln 2 / karakter sayısı."""
    return toplam_nll / math.log(2) / max(karakter, 1)


def _devam_tokenlari(tok: TurkceTokenizer, on_metin: str, tam_metin: str) -> tuple[list[int], list[int]]:
    on = tok.encode(on_metin, bos=True)
    tam = tok.encode(tam_metin, bos=True)
    ortak = 0
    while ortak < min(len(on), len(tam)) and on[ortak] == tam[ortak]:
        ortak += 1
    return tam[:ortak], tam[ortak:]


@torch.no_grad()
def secenek_puanlari(
    model: torch.nn.Module, tok: TurkceTokenizer, soru, cihaz: str, baglam_yoneticisi=contextlib.nullcontext
) -> dict[str, list[float]]:
    """Her seçenek için iki puan:

    * ``metin``: " C) seçenek metni" devamının token başına ortalama log-olasılığı,
    * ``harf``: yalnız " C)" kısmının log-olasılığı (şıklar istemde listelidir).
    """
    from .meb import HARFLER, cevap_metni, istem

    model.eval()
    baglam = model.m.baglam
    on_metin = istem(soru)
    diziler, devam_uzunluk, harf_uzunluk = [], [], []
    for i in range(len(soru.secenekler)):
        on, devam = _devam_tokenlari(tok, on_metin, on_metin + cevap_metni(soru, i))
        _, harf = _devam_tokenlari(tok, on_metin, on_metin + f" {HARFLER[i]})")
        k = 0
        while k < min(len(harf), len(devam)) and harf[k] == devam[k]:
            k += 1
        dizi = (on + devam)[-(baglam + 1) :]
        diziler.append(dizi)
        devam_uzunluk.append(min(len(devam), len(dizi) - 1))
        harf_uzunluk.append(min(max(k, 1), devam_uzunluk[-1]))
    uzun = max(len(d) for d in diziler) - 1
    x = torch.zeros(len(diziler), uzun, dtype=torch.long)
    for r, d in enumerate(diziler):
        x[r, : len(d) - 1] = torch.tensor(d[:-1])
    with baglam_yoneticisi():
        logit, _ = model(x.to(cihaz))
    logp = F.log_softmax(logit.float(), dim=-1).cpu()
    metin, harf = [], []
    for r, d in enumerate(diziler):
        n = len(d) - 1
        hedef = torch.tensor(d[1:])
        tok_logp = logp[r, torch.arange(n), hedef]
        dv = tok_logp[n - devam_uzunluk[r] :]
        metin.append(float(dv.mean()) if len(dv) else float("-inf"))
        harf.append(float(dv[: harf_uzunluk[r]].sum()) if len(dv) else float("-inf"))
    return {"metin": metin, "harf": harf}


def coktan_secmeli(
    model: torch.nn.Module,
    tok: TurkceTokenizer,
    sorular: Sequence,
    cihaz: str,
    baglam_yoneticisi=contextlib.nullcontext,
    en_fazla: int | None = None,
) -> dict:
    """Doğruluk (iki yöntemle), rastgele tahmin tabanı ve ders bazında döküm."""
    sorular = list(sorular)[:en_fazla] if en_fazla else list(sorular)
    if not sorular:
        return {"n": 0}
    dogru = {"metin": 0, "harf": 0}
    rastgele = 0.0
    ders: dict[str, dict[str, float]] = defaultdict(lambda: {"n": 0, "metin": 0, "harf": 0, "rastgele": 0.0})
    for s in sorular:
        puan = secenek_puanlari(model, tok, s, cihaz, baglam_yoneticisi)
        taban = 1.0 / len(s.secenekler)
        rastgele += taban
        dd = ders[s.ders]
        dd["n"] += 1
        dd["rastgele"] += taban
        for yontem in ("metin", "harf"):
            secim = max(range(len(puan[yontem])), key=lambda i: puan[yontem][i])
            if secim == s.cevap:
                dogru[yontem] += 1
                dd[yontem] += 1
    n = len(sorular)
    return {
        "n": n,
        "dogruluk_metin": dogru["metin"] / n,
        "dogruluk_harf": dogru["harf"] / n,
        "rastgele": rastgele / n,
        "dersler": {
            k: {
                "n": int(v["n"]),
                "dogruluk_metin": v["metin"] / v["n"],
                "dogruluk_harf": v["harf"] / v["n"],
                "rastgele": v["rastgele"] / v["n"],
            }
            for k, v in sorted(ders.items())
        },
    }


# --------------------------------------------------------------------------------------------
# İlerleme günlüğü
# --------------------------------------------------------------------------------------------


def _yuzde(x: float | None) -> str:
    return "—" if x is None else f"%{100 * x:.1f}"


def _sayi(x: float | None, basamak: int = 3) -> str:
    return "—" if x is None else f"{x:.{basamak}f}"


def _milyon(x: float | None) -> str:
    return "—" if x is None else f"{x / 1e6:.2f} M"


def ilerleme_ekle(cikti_klasoru: Path, kayit: dict) -> Path:
    """Kaydı ``ilerleme.jsonl``'e ekler ve ``ilerleme.md`` tablosunu yeniden yazar."""
    cikti_klasoru.mkdir(parents=True, exist_ok=True)
    kayit = {"zaman": time.strftime("%Y-%m-%d %H:%M"), **kayit}
    jsonl = cikti_klasoru / "ilerleme.jsonl"
    with jsonl.open("a", encoding="utf-8") as f:
        f.write(json.dumps(kayit, ensure_ascii=False) + "\n")
    kayitlar = [json.loads(s) for s in jsonl.read_text(encoding="utf-8").splitlines() if s.strip()]
    satirlar = [
        "# İlerleme",
        "",
        "Her eğitim ya da değerlendirme sonunda bir satır eklenir. BPC (karakter başına bit) düştükçe model Türkçeyi",
        "daha iyi tahmin ediyor demektir; farklı tokenizer'lar arasında da karşılaştırılabilir. Doğruluklar her zaman",
        "rastgele tahmin tabanıyla birlikte okunmalı.",
        "",
        "| Zaman | Deney | Aşama | Adım | Parametre (gömme dışı) | Görülen token | Doğr. kaybı | BPC | MEB doğr. (metin / harf) | MEB test | TurkishMMLU (metin / harf) | Rastgele |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for k in kayitlar:
        meb_d, meb_t, mmlu = k.get("meb_dogrulama") or {}, k.get("meb_test") or {}, k.get("mmlu") or {}
        satirlar.append(
            f"| {k.get('zaman', '')} | {k.get('deney', '')} | {k.get('asama', '')} | {k.get('adim', '—')} | "
            f"{_milyon(k.get('parametre'))} ({_milyon(k.get('parametre_gomme_disi'))}) | {_milyon(k.get('gorulen_token'))} | "
            f"{_sayi(k.get('dogrulama_kaybi'))} | {_sayi(k.get('bpc'))} | "
            f"{_yuzde(meb_d.get('dogruluk_metin'))} / {_yuzde(meb_d.get('dogruluk_harf'))} | "
            f"{_yuzde(meb_t.get('dogruluk_metin'))} | "
            f"{_yuzde(mmlu.get('dogruluk_metin'))} / {_yuzde(mmlu.get('dogruluk_harf'))} | "
            f"{_yuzde(mmlu.get('rastgele') or meb_t.get('rastgele') or meb_d.get('rastgele'))} |"
        )
    satirlar += [
        "",
        "## Bağlam için: TurkishMMLU makalesindeki modeller (5 örnekli, ortalama)",
        "",
        "Bu sayılar milyarlarca parametreli, trilyonlarca token görmüş modellere aittir ve 5 örnekli ölçülmüştür;",
        "buradaki modeller 0 örnekli ölçülür. Amaç yarışmak değil, nerede durduğunu görmek.",
        "",
        "| Model | Doğruluk |",
        "| --- | ---: |",
        *[f"| {ad} | %{d:.1f} |" for ad, d in MMLU_REFERANSLARI],
    ]
    md = cikti_klasoru / "ilerleme.md"
    md.write_text("\n".join(satirlar) + "\n", encoding="utf-8")
    return md
