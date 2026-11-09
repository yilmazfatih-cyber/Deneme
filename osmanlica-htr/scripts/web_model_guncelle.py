"""Bir eğitim kontrol noktasını tarayıcı sürümüne ve `modeller/guncel.pt`'ye taşır.

Kullanım: python scripts/web_model_guncelle.py cikti/v3/model.pt v3-d2
- web/model-agirlik.wasm  (ONNX fp32; servis edilebilir uzantıyla)
- web/model.alfabe.json, web/model.json (sürüm, CER, tarih)
- modeller/guncel.pt
Sonra artifact'ı `web/index.html` yoluyla yeniden yayımlayın (dosyalar: model-agirlik.wasm, model.alfabe.json, model.json).
"""

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK))

from osmanlica_htr.model import model_yukle  # noqa: E402


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    kaynak, surum = Path(sys.argv[1]), sys.argv[2]
    model, alfabe, meta = model_yukle(kaynak)
    web = KOK / "web"
    onnx = web / "model.onnx"
    subprocess.run([sys.executable, "-m", "osmanlica_htr.cli", "disa", "--model", str(kaynak), "--cikti", str(onnx)], check=True, cwd=KOK, env={"PYTHONPATH": str(KOK), "PATH": "/usr/bin:/bin:/usr/local/bin"})
    onnx.replace(web / "model-agirlik.wasm")
    (web / "model.json").write_text(
        json.dumps(
            {
                "surum": surum,
                "aciklama": "CRNN+CTC 1,9M; sentetik + Muharaf/OpenITI/MAKHZAN",
                "cer_gercek": round(float(meta.get("cer", 0)), 4),
                "donem": meta.get("donem"),
                "parametre": model.parametre_sayisi(),
                "tarih": time.strftime("%Y-%m-%d"),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (KOK / "modeller").mkdir(exist_ok=True)
    shutil.copy(kaynak, KOK / "modeller" / "guncel.pt")
    print(f"{surum}: CER %{float(meta.get('cer', 0)) * 100:.2f} → web/model-agirlik.wasm ({(web / 'model-agirlik.wasm').stat().st_size / 1e6:.1f} MB), modeller/guncel.pt")


if __name__ == "__main__":
    main()
