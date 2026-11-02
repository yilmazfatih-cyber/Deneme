"""Açık veri kümelerinden Türkçe-öncelikli özetleme eğitim kümesi kurar.

Çıktı: ``data/train.jsonl`` ve ``data/eval.jsonl`` — TRL prompt-completion sohbet biçiminde.
İstemler çalışma zamanındaki ``ozetci.summarize.prompts`` ile birebir aynıdır; böylece
eğitilen model, uygulamanın gönderdiği istemi görür.

Kaynaklar (hepsi açık; lisanslara dikkat — README'deki tabloya bakın):
  * csebuetnlp/xlsum (turkish)          — haber özetleme, CC BY-NC-SA 4.0 (TİCARİ DEĞİL)
  * GEM/wiki_lingua (tr)                 — WikiHow nasıl-yapılır özetleri, CC BY-NC-SA (TİCARİ DEĞİL)
  * reciTAL/mlsum (tu)                   — haber özetleme, araştırma amaçlı
  * ytu-ce-cosmos/Turkish-Summarization? — varsa; betik ad çakışmasına dayanıklıdır
  * sentence-transformers/aeslc / aeslc — İngilizce e-posta -> konu satırı (çok kısa hedef)
  * Yale-LILY/aeslc, enron e-posta kümeleri — İngilizce e-posta gövdesi
  * ccdv/govreport-summarization (CC BY 4.0 kaynak), FiscalNote/billsum (CC0) — uzun belge özetleme (İngilizce)

Açık Türkçe E-POSTA özetleme kümesi yoktur; haber kümeleri de e-posta üslubunu kapsamaz. Bu yüzden
asıl eğitim verisi ``make_synth.py`` ile öğretmen modelden üretilen sentetik Türkçe e-posta/belge özetleridir;
buradaki açık kümeler ikincil karışımdır.

Ticari kullanım için yalnızca ``--commercial`` bayrağıyla izinli kümeler bırakılır ve geri kalan
hacim ``synth.jsonl`` (öğretmen modelle üretilmiş sentetik veri) ile doldurulur.

Çalıştırma::

    python train/build_dataset.py --out data --max-per-source 20000 [--commercial] [--noise 0.3]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from common import (ROOT, build_messages, clean_text, example_to_prompt_completion, read_jsonl, seeded, write_jsonl)
from synth_noise import add_ocr_noise

# (hf_id, config, split, metin alanı, özet alanı, dil, tür, ticari kullanıma uygun mu)
SOURCES = [
    ("csebuetnlp/xlsum", "turkish", "train", "text", "summary", "tr", "document", False),
    ("GEM/wiki_lingua", "tr", "train", "source", "target", "tr", "document", False),
    ("reciTAL/mlsum", "tu", "train", "text", "summary", "tr", "document", False),
    ("csebuetnlp/xlsum", "english", "train", "text", "summary", "en", "document", False),
    ("ccdv/govreport-summarization", None, "train", "report", "summary", "en", "document", True),
    ("FiscalNote/billsum", None, "train", "text", "summary", "en", "document", True),
    # AESLC hedefi 3-5 kelimelik konu satırıdır; özet eğitimi için fazla kısa, varsayılan dışı (--only ile açılır)
]
OPTIONAL_SOURCES = [
    ("Yale-LILY/aeslc", None, "train", "email_body", "subject_line", "en", "email", True),
]

MIN_INPUT_CHARS = 300
MAX_INPUT_CHARS = 6500  # çalışma zamanı parçalama eşiğiyle (6000) ve max_length=3072 ile uyumlu
MIN_SUMMARY_CHARS = 40


def load_source(hf_id, config, split, max_rows):
    """datasets>=4 betik tabanlı kümeleri reddeder; HF'nin otomatik Parquet dönüşümüne (refs/convert/parquet) düşülür."""
    from datasets import load_dataset

    attempts = [{}, {"revision": "refs/convert/parquet"}]
    ds = None
    last_exc = None
    for extra in attempts:
        try:
            ds = load_dataset(hf_id, config, split=split, **extra) if config else load_dataset(hf_id, split=split, **extra)
            break
        except Exception as exc:  # betik tabanlı küme, kalkmış kaynak, ad değişikliği
            last_exc = exc
    if ds is None:
        print(f"[atla] {hf_id}/{config}: {str(last_exc)[:200]}", file=sys.stderr)
        return []
    if max_rows and len(ds) > max_rows:
        ds = ds.shuffle(seed=42).select(range(max_rows))
    return ds


def plain_summary_example(text: str, summary: str, kind: str, lang: str) -> dict:
    """Açık kümeler yalnızca düz özet öğretir (çalışma zamanındaki 'bölüm özeti' istemi).

    ÖZET/MADDELER/EYLEMLER biçimi sentetik veriden öğrenilir; açık kümelerde eylem bilgisi
    olmadığından biçimli hedef üretmek modele 'her zaman EYLEMLER: Yok' yazmayı öğretirdi.
    """
    return {
        "prompt": build_messages(text, kind, lang, None, stage="chunk"),
        "completion": [{"role": "assistant", "content": summary.strip()}],
        "kind": kind,
        "lang": lang,
    }


def build_rows(args) -> tuple[list[dict], list[dict]]:
    rng = seeded(42)
    rows: list[dict] = []
    sources = SOURCES + (OPTIONAL_SOURCES if args.only else [])
    for hf_id, config, split, tf, sf, lang, kind, commercial_ok in sources:
        if args.commercial and not commercial_ok:
            print(f"[lisans] {hf_id} ticari kullanıma kapalı, atlandı", file=sys.stderr)
            continue
        if args.only and hf_id not in args.only:
            continue
        ds = load_source(hf_id, config, split, args.max_per_source)
        kept = 0
        for ex in ds:
            text = clean_text(str(ex.get(tf) or ""))
            summary = clean_text(str(ex.get(sf) or ""))
            if len(text) < MIN_INPUT_CHARS or len(summary) < (12 if kind == "email" else MIN_SUMMARY_CHARS):
                continue
            if len(text) > MAX_INPUT_CHARS:
                text = text[:MAX_INPUT_CHARS]
            if len(summary) > len(text) * 0.6:
                continue  # özet metinden kısa olmalı
            rows.append(plain_summary_example(text, summary, kind, lang))
            kept += 1
        print(f"[ok] {hf_id}/{config}: {kept} örnek", file=sys.stderr)

    # Sentetik veri (öğretmen modelden) varsa en yüksek öncelik: biçim ve dil birebir
    synth = Path(args.synth) if args.synth else None
    if synth and synth.exists():
        s_rows = read_jsonl(synth)
        for r in s_rows:
            if {"text", "summary", "kind", "lang"} <= set(r):
                rows.append(example_to_prompt_completion(r["text"], r["summary"], r["kind"], r["lang"], r.get("title")))
        print(f"[ok] sentetik: {len(s_rows)} örnek", file=sys.stderr)

    if not any(r["lang"] == "tr" for r in rows):
        print("UYARI: hiç Türkçe örnek yok (kümeler indirilemedi ya da --commercial ile elendi); --synth ile sentetik veri verin", file=sys.stderr)
    rng.shuffle(rows)
    n_eval = min(args.eval_size, max(1, len(rows) // 20))
    train, evalset = rows[n_eval:], rows[:n_eval]
    # Gürültü yalnızca eğitim kümesine, bölme işleminden SONRA (değerlendirme temiz kalır)
    if args.noise:
        for r in train:
            if rng.random() < args.noise:
                user = r["prompt"][-1]["content"]
                marker = "METİN:\n" if "METİN:\n" in user else "TEXT:\n"
                head, _, body = user.partition(marker)
                if body:
                    r["prompt"][-1]["content"] = head + marker + add_ocr_noise(body, rate=rng.uniform(0.01, 0.05), rng=rng)
    return train, evalset


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", default=str(ROOT / "data"))
    p.add_argument("--max-per-source", type=int, default=20000)
    p.add_argument("--eval-size", type=int, default=500)
    p.add_argument("--noise", type=float, default=0.3, help="OCR gürültüsü uygulanacak örnek oranı")
    p.add_argument("--commercial", action="store_true", help="ticari kullanıma kapalı kümeleri dışarıda bırak")
    p.add_argument("--synth", default=None, help="öğretmen modelle üretilmiş jsonl (text, summary, kind, lang)")
    p.add_argument("--only", nargs="*", default=None, help="yalnızca bu HF kimlikleri (Yale-LILY/aeslc gibi isteğe bağlı kümeler de buradan açılır)")
    args = p.parse_args(argv)

    train, evalset = build_rows(args)
    out = Path(args.out)
    write_jsonl(out / "train.jsonl", train)
    write_jsonl(out / "eval.jsonl", evalset)
    print(f"yazıldı: {len(train)} eğitim, {len(evalset)} değerlendirme -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
