"""Öğretmen modelle (büyük bir açık model ya da API) sentetik Türkçe e-posta/belge özetleri üretir.

Neden: Açık Türkçe e-posta özetleme kümesi yok; haber kümeleri de e-posta üslubunu kapsamaz.
Bu betik, girdi metinlerini (kendi e-posta/PDF dökümleriniz ya da haber metinleri) alır ve
öğretmen modele çalışma zamanındaki istemin aynısını vererek ÖZET/MADDELER/EYLEMLER biçiminde
hedefler yazdırır. Çıktı ``build_dataset.py --synth`` ile birleştirilir.

Öğretmen olarak OpenAI-uyumlu herhangi bir uç nokta kullanılabilir (vLLM, llama.cpp server, Ollama).
Örnek::

    python train/make_synth.py --inputs dokumanlar/*.txt --base-url http://localhost:8000/v1 --model Qwen/Qwen3-8B --out data/synth.jsonl

Gizlilik: kendi e-postalarınızı yalnızca KENDİ makinenizde çalışan bir öğretmene verin.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
import urllib.request
from pathlib import Path

from common import ROOT, build_messages, clean_text, detect_language, write_jsonl

sys.path.insert(0, str(ROOT))
from ozetci.summarize.output_parse import strip_thinking  # noqa: E402


def chat(base_url: str, model: str, messages: list[dict], api_key: str = "none", max_tokens: int = 400) -> str:
    body = json.dumps({
        "model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False},  # vLLM / llama.cpp server: Qwen3 düşünme kapalı
    }).encode()
    req = urllib.request.Request(f"{base_url.rstrip('/')}/chat/completions", data=body,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.load(resp)
    msg = data["choices"][0]["message"]
    return strip_thinking(msg.get("content") or "")  # 'reasoning_content' alanı zaten dışarıda kalır


def looks_valid(target: str, lang: str, source: str = "") -> bool:
    """Biçim + sıkıştırma oranı (0,05-0,6) + kopya denetimi (özet kaynağın birebir kopyası olmasın)."""
    heads = ("ÖZET", "MADDELER", "EYLEMLER") if lang == "tr" else ("SUMMARY", "POINTS", "ACTIONS")
    if "<think>" in target or not all(h in target for h in heads) or len(target) <= 60:
        return False
    if source:
        ratio = len(target) / max(len(source), 1)
        if ratio < 0.05 or ratio > 0.6:
            return False
        sents = [x.strip() for x in target.split("\n") if len(x.strip()) > 40]
        copied = sum(1 for x in sents if x.lstrip("- ") in source)
        if sents and copied / len(sents) > 0.7:
            return False
    return True


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--inputs", nargs="+", required=True, help="metin dosyaları (glob olabilir)")
    p.add_argument("--base-url", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--api-key", default="none")
    p.add_argument("--kind", default="auto", choices=["auto", "email", "document"])
    p.add_argument("--out", default=str(ROOT / "data" / "synth.jsonl"))
    p.add_argument("--max-chars", type=int, default=9000)
    args = p.parse_args(argv)

    rows = []
    files = [f for pat in args.inputs for f in glob.glob(pat)]
    for f in files:
        text = clean_text(Path(f).read_text(encoding="utf-8", errors="replace"))[: args.max_chars]
        if len(text) < 200:
            continue
        lang = detect_language(text)
        lang = "tr" if lang == "unknown" else lang
        kind = args.kind if args.kind != "auto" else ("email" if text.startswith(("Kimden:", "From:")) else "document")
        try:
            target = chat(args.base_url, args.model, build_messages(text, kind, lang, stage="final"))
        except Exception as exc:
            print(f"[hata] {f}: {exc}", file=sys.stderr)
            continue
        if not looks_valid(target, lang, text):
            print(f"[biçim] {f}: öğretmen biçime uymadı, atlandı", file=sys.stderr)
            continue
        rows.append({"text": text, "summary": target.strip(), "kind": kind, "lang": lang, "source": f})
    write_jsonl(Path(args.out), rows)
    print(f"{len(rows)}/{len(files)} örnek -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
