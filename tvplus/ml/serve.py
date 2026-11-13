"""mediafm-mini model sunucusu — sunucunun `http` sağlayıcı protokolü (tvplus-embedding/1, PROTOKOL.md).

    python serve.py [--port 9100] [--model ../content/models/mediafm-mini]

    TVP_EMBEDDING_PROVIDER=http TVP_EMBEDDING_URL=http://127.0.0.1:9100/tvplus npm start

Uçlar:
  GET  /<herhangi>      model bilgisi: {"protocol":"tvplus-embedding/1","model":{"id","version","dims"}}
  POST /<herhangi>      {"protocol","input": EmbeddingInput} → {"videoId","shots":[[…]…],"pooled":[…]}
                        Her istekte: yaprağın çekimlerinin önbellekteki tek kipli öznitelikleri (yoksa yerel medyadan /
                        önbellekteki karelerden hesaplanır; ağa çıkılmaz) + İSTEKTEKİ bağlam (özet ve GÜNCEL etiketler)
                        → kaynaştırma modeli. Etiket değişince başlığın vektörleri de değişir.
  GET  /health          {"ok":true, …}
  GET  /search?q=…&k=10 (demo eki) Türkçe/İngilizce bir ifadeye en yakın çekimler: çok dilli CLIP metin kodlayıcısı ile
                        çekimlerin CLIP GÖRÜNTÜ vektörleri aynı uzaydadır (bağlamsal vektörler bu uzayda değildir).
"""

from __future__ import annotations

import argparse
import json
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import torch

from mediafm_mini.corpus import load_inputs
from mediafm_mini.export_format import PROTOCOL, load_shipped
from mediafm_mini.features import Extractor, SynopsisCache, load_cached
from mediafm_mini.infer import encode, l2n, pooled
from mediafm_mini.paths import MODEL_OUT_DIR
from mediafm_mini.training import build_sequence

MAX_BODY = 64 * 1024 * 1024


class State:
    def __init__(self, model_dir: Path) -> None:
        self.model, self.layout, self.manifest = load_shipped(model_dir)
        self.extractor = Extractor(threads=2, offline=True)  # sunucu ağa çıkmaz
        self.syn = SynopsisCache()
        self.lock = threading.Lock()
        self.requests = 0
        self.started = time.time()
        self.search_index: tuple[np.ndarray, list[dict]] | None = None

    def info(self) -> dict:
        return {"protocol": PROTOCOL, "model": {"id": self.manifest["id"], "version": self.manifest["version"],
                                                "dims": self.manifest["dims"]}}

    def embed(self, inp: dict) -> dict:
        with self.lock:  # tek işlem, sırayla (makine paylaşımlı)
            seq = build_sequence(inp, self.layout, self.syn, self.extractor)
            assert seq is not None
            h, _ = encode(self.model, seq)
            self.requests += 1
        h = l2n(h)
        return {"videoId": inp["videoId"], "shots": np.round(h, 6).tolist(), "pooled": np.round(pooled(h), 6).tolist()}

    def search(self, q: str, k: int) -> list[dict]:
        with self.lock:
            if self.search_index is None:
                rows, meta = [], []
                for inp in load_inputs():
                    f = load_cached(inp["videoId"])
                    if f is None:
                        continue
                    for i in np.nonzero(f.visual_ok)[0]:
                        s = inp["shots"][i]
                        rows.append(f.visual[i])
                        meta.append({"videoId": inp["videoId"], "titleId": inp["titleId"],
                                     "title": inp["context"]["title"], "method": inp["method"], "shot": int(i),
                                     "startSec": s["startSec"], "endSec": s["endSec"]})
                self.search_index = (np.stack(rows), meta)
            mat, meta = self.search_index
            qv = self.extractor.embed_texts([q])[0]
        sc = mat @ qv
        top = np.argsort(-sc)[:k]
        return [{**meta[j], "score": round(float(sc[j]), 4)} for j in top]


def handler(state: State):
    class H(BaseHTTPRequestHandler):
        server_version = "mediafm-mini/1"

        def _send(self, code: int, obj) -> None:
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args) -> None:
            print(f"{self.address_string()} {fmt % args}", flush=True)

        def do_GET(self) -> None:
            u = urllib.parse.urlparse(self.path)
            if u.path == "/health":
                return self._send(200, {"ok": True, **state.info(), "requests": state.requests,
                                        "uptimeSec": round(time.time() - state.started)})
            if u.path == "/search":
                qs = urllib.parse.parse_qs(u.query)
                q = (qs.get("q") or [""])[0].strip()
                if not q:
                    return self._send(400, {"error": "q gerekli"})
                k = max(1, min(int((qs.get("k") or ["10"])[0]), 50))
                return self._send(200, {"query": q, "space": "CLIP görüntü (çok dilli metin kodlayıcısıyla)",
                                        "results": state.search(q, k)})
            return self._send(200, state.info())

        def do_POST(self) -> None:
            n = int(self.headers.get("content-length") or 0)
            if n <= 0 or n > MAX_BODY:
                return self._send(400, {"error": "gövde yok ya da çok büyük"})
            try:
                body = json.loads(self.rfile.read(n))
            except json.JSONDecodeError:
                return self._send(400, {"error": "JSON değil"})
            if body.get("protocol") != PROTOCOL or not isinstance(body.get("input"), dict):
                return self._send(400, {"error": f"protokol {PROTOCOL} ve input bekleniyor"})
            inp = body["input"]
            if not inp.get("shots"):
                return self._send(400, {"error": "çekim yok"})
            try:
                return self._send(200, state.embed(inp))
            except Exception as e:  # noqa: BLE001 — sunucu 500 alır ve yeniden dener
                return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    return H


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9100)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--model", type=Path, default=MODEL_OUT_DIR)
    args = ap.parse_args()
    torch.set_num_threads(2)
    state = State(args.model)
    print(f"mediafm-mini {state.manifest['version']} ({state.manifest['dims']} boyut) http://{args.host}:{args.port}",
          flush=True)
    ThreadingHTTPServer((args.host, args.port), handler(state)).serve_forever()


if __name__ == "__main__":
    main()
