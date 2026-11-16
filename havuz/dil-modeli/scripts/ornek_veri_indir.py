"""Örnek model için Türkçe Vikipedi metni indirir (Hugging Face: wikimedia/wikipedia).

Dosyanın tümünü (340 MB) değil, yalnız ilk birkaç satır grubunu aralıklı isteklerle okur
(~20 MB indirme). Çıktı: her satırı bir madde olan .jsonl dosyası ve yanında kaynak kaydı
(`*.kaynak.json`: veri kimliği, sürüm, lisans, dosya özetleri). Ham veri depoya girmez.

Çalıştırma (gerekli paketler `hf` ekstrasındadır):
    python scripts/ornek_veri_indir.py --cikti veri/ham/trwiki.jsonl --hedef-mb 24

Genişletme: Başka bir veri kümesi için bu dosyayı kopyalayın; `DATASET`, `REVISION`, `FILE`
sabitlerini ve `_article_text` işlevini değiştirin. Lisansı kaynak kaydına yazmayı unutmayın.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

DATASET = "wikimedia/wikipedia"
# Sabit sürüm: aynı komut her zaman aynı metni indirir.
REVISION = "b04c8d1ceb2f5cd4588862100d08de323dccfbaa"
FILE = "20231101.tr/train-00000-of-00002.parquet"
MIN_CHARS = 500  # bundan kısa maddeler (taslaklar) alınmaz
SKIP_TITLE_PARTS = ("(anlam ayrımı)",)  # yalnız bağlantı listesi olan sayfalar

T = TypeVar("T")


def _retry(action: Callable[[], T], what: str) -> T:
    """Hugging Face hız sınırına (429) takılınca bekleyip yeniden dener."""
    from huggingface_hub.errors import HfHubHTTPError

    delay = 5.0
    for attempt in range(7):
        try:
            return action()
        except HfHubHTTPError as error:
            status = getattr(error.response, "status_code", None)
            if status != 429 or attempt == 6:
                raise
            print(f"  Hugging Face hız sınırı ({what}); {delay:.0f} sn bekleniyor...")
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("ulaşılamaz")


def _article_text(title: str, body: str) -> str | None:
    """Maddeyi eğitim belgesine çevirir; alınmayacaksa None."""
    if len(body) < MIN_CHARS or any(part in title for part in SKIP_TITLE_PARTS):
        return None
    return f"{title}\n\n{body.strip()}"


def download(out_path: Path, target_bytes: int) -> dict[str, Any]:
    import pyarrow.parquet as pq
    from huggingface_hub import HfApi, HfFileSystem

    api = HfApi()
    info = _retry(lambda: api.dataset_info(DATASET, revision=REVISION), "veri kümesi bilgisi")
    paths = _retry(
        lambda: api.get_paths_info(DATASET, [FILE], revision=REVISION, repo_type="dataset"),
        "dosya bilgisi",
    )
    remote = paths[0]
    licenses = getattr(info.card_data, "license", None) if info.card_data else None

    out_path.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    written = articles = skipped = groups = 0
    source = f"datasets/{DATASET}@{REVISION}/{FILE}"
    with HfFileSystem().open(source, "rb") as remote_file, out_path.open("wb") as out:
        parquet = pq.ParquetFile(remote_file)
        for group in range(parquet.metadata.num_row_groups):
            if written >= target_bytes:
                break
            table = _retry(
                lambda group=group: parquet.read_row_group(group, columns=["id", "url", "title", "text"]),
                f"satır grubu {group}",
            )
            groups += 1
            for row in table.to_pylist():
                text = _article_text(row["title"], row["text"])
                if text is None:
                    skipped += 1
                    continue
                record = {"id": row["id"], "url": row["url"], "title": row["title"], "text": text}
                line = (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
                out.write(line)
                digest.update(line)
                written += len(line)
                articles += 1
            print(f"  satır grubu {group}: toplam {articles} madde, {written / 1e6:.1f} MB")

    return {
        "veri_kumesi": DATASET,
        "surum": info.sha,
        "dosya": FILE,
        "dosya_bayt": remote.size,
        "dosya_sha256": remote.lfs.sha256 if remote.lfs else None,
        "lisans": licenses,
        "atif": "Vikipedi katkıcıları, Türkçe Vikipedi (tr.wikipedia.org), 1 Kasım 2023 dökümü",
        "okunan_satir_grubu": groups,
        "madde": articles,
        "atlanan_madde": skipped,
        "suzgec": {"en_az_karakter": MIN_CHARS, "atlanan_baslik_parcalari": list(SKIP_TITLE_PARTS)},
        "cikti": out_path.name,
        "cikti_bayt": written,
        "cikti_sha256": digest.hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Örnek model için Türkçe Vikipedi metni indirir.")
    parser.add_argument("--cikti", type=Path, default=Path("veri/ham/trwiki.jsonl"), help="çıktı .jsonl")
    parser.add_argument("--hedef-mb", type=float, default=24.0, help="yaklaşık metin boyutu (MB)")
    args = parser.parse_args()
    record = download(args.cikti, int(args.hedef_mb * 1e6))
    record_path = args.cikti.with_suffix(".kaynak.json")
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Bitti: {args.cikti} ({record['madde']} madde, {record['cikti_bayt'] / 1e6:.1f} MB)")
    print(f"Kaynak kaydı: {record_path}")


if __name__ == "__main__":
    main()
