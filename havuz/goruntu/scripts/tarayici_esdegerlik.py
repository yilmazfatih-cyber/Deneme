"""Tarayıcı örneğinin (ornekler/tarayici/index.html) Python ONNX çıkarımıyla eşdeğerliğini ölçer.

Kullanım (temel klasöründen; Chromium ve onnxruntime-web dosyaları gerekir):
    npm pack onnxruntime-web@1.31.1 && tar -xzf onnxruntime-web-1.31.1.tgz      # → package/dist
    .venv/bin/python scripts/tarayici_esdegerlik.py --paket ciktilar/cpu-deneme/paket \\
        --ort package/dist --chromium /opt/pw-browsers/chromium

Ne yapar: geçici bir klasöre sayfayı, paketi ve ORT dosyalarını koyar, boş bir kapıda HTTP sunucusu açar,
iki sentetik görüntüyü (biri yeniden boyutlandırma gerektirmez) headless Chromium'da sınıflandırır,
olasılıkları `OnnxClassifier` ile karşılaştırır. Yeniden boyutlandırmasız görüntüde fark 1e-5'i aşarsa
çıkış kodu 1 (ön işleme kayması). Sonuç docs/TARAYICI.md'dedir.
Genişletme: başka bir tarayıcı için `--chromium` yerine o tarayıcının headless komutunu yazın.
"""

from __future__ import annotations

import argparse
import functools
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from goruntu.disa_aktar.runtime import OnnxClassifier  # noqa: E402
from goruntu.hazirlik.loader import load_rgb  # noqa: E402
from goruntu.synthetic import shape_image  # noqa: E402

ORT_FILES = ("ort.wasm.min.js", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        del format, args


def build_site(site: Path, bundle: Path, ort: Path, model: OnnxClassifier) -> dict[str, str]:
    shutil.copy(ROOT / "ornekler" / "tarayici" / "index.html", site / "index.html")
    (site / "paket").mkdir()
    (site / "ort").mkdir()
    shutil.copy(model.path, site / "paket" / "model.onnx")
    shutil.copy(bundle / "paket.json", site / "paket" / "paket.json")
    for name in ORT_FILES:
        shutil.copy(ort / name, site / "ort" / name)
    spec = model.meta.on_isleme
    exact = spec.resize_size[
        0
    ]  # kısa kenar zaten hedefte: yeniden boyutlandırma yok, yalnız kırpma
    rng = np.random.default_rng(5)
    shape_image("kare", "mavi", rng, exact).save(site / "tam.png")
    shape_image("üçgen", "kirmizi", rng, exact * 2 + 3).save(site / "olcekli.png")
    return {"tam.png": "yeniden boyutlandırma yok", "olcekli.png": "küçültme var"}


def run_browser(chromium: str, url: str) -> tuple[list[float] | None, str]:
    command = [chromium, "--headless=new", "--no-sandbox", "--disable-gpu",
               "--virtual-time-budget=60000", "--dump-dom", url]  # fmt: skip
    dom = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False).stdout
    raw = re.search(r'<pre id="ham"[^>]*>(.*?)</pre>', dom, re.S)
    status = re.search(r'<p id="durum"[^>]*>(.*?)</p>', dom, re.S)
    text = status.group(1) if status else dom[-300:]
    if not raw or not raw.group(1).strip():
        return None, text
    return list(json.loads(raw.group(1))["olasilik"]), text


def main() -> int:
    parser = argparse.ArgumentParser(description="Tarayıcı örneği ↔ Python ONNX eşdeğerliği")
    parser.add_argument("--paket", required=True, help="model.onnx + paket.json klasörü")
    parser.add_argument("--ort", required=True, help="onnxruntime-web dist klasörü")
    parser.add_argument("--chromium", default="/opt/pw-browsers/chromium", help="Chromium yolu")
    args = parser.parse_args()
    bundle = Path(args.paket)
    model = OnnxClassifier(bundle)
    worst_exact = 0.0
    with tempfile.TemporaryDirectory() as scratch:
        site = Path(scratch)
        cases = build_site(site, bundle, Path(args.ort), model)
        handler = functools.partial(QuietHandler, directory=str(site))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            port = server.server_address[1]
            for name, label in cases.items():
                url = f"http://127.0.0.1:{port}/index.html?ort=ort/&ornek={name}"
                browser, status = run_browser(args.chromium, url)
                if browser is None:
                    print(f"{name}: SONUÇ YOK — sayfa durumu: {status}")
                    return 1
                python = model.decision.probabilities(model.logits([load_rgb(site / name)]))[0]
                gap = float(np.abs(np.asarray(browser) - python).max())
                if name == "tam.png":
                    worst_exact = gap
                print(f"{name} ({label}): en büyük olasılık farkı {gap:.2e} — sayfa: {status}")
        finally:
            server.shutdown()
            server.server_close()
    return 1 if worst_exact > 1e-5 else 0


if __name__ == "__main__":
    raise SystemExit(main())
