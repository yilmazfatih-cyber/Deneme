"""Komut satırı: `python -m is_kuyrugu <veritabanı> <komut> ...`

    ekle <kuyruk> '<json>' [--oncelik N] [--gecikme SN] [--anahtar K]
    durum <kuyruk> · olu <kuyruk> · yeniden <iş_no> · zamanla <ad> "<cron>" <kuyruk> '<json>' ·
    tetikle

Genişletme: yeni komut → `_parser`'a alt komut, `main`'de bir dal.
"""

from __future__ import annotations

import argparse
import json
import sys

from .cron import CronError
from .queue import JobQueue


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m is_kuyrugu", description="Kalıcı iş kuyruğu")
    parser.add_argument("veritabani")
    sub = parser.add_subparsers(dest="komut", required=True)
    add = sub.add_parser("ekle", help="iş ekle")
    add.add_argument("kuyruk")
    add.add_argument("veri", help="JSON nesnesi")
    add.add_argument("--oncelik", type=int, default=0)
    add.add_argument("--gecikme", type=float, default=0.0)
    add.add_argument("--anahtar", help="idempotentlik anahtarı")
    sub.add_parser("durum", help="duruma göre iş sayıları").add_argument("kuyruk")
    sub.add_parser("olu", help="ölü mektuplar").add_argument("kuyruk")
    sub.add_parser("yeniden", help="ölü mektubu sıraya geri koy").add_argument("is_no", type=int)
    plan = sub.add_parser("zamanla", help="yinelenen iş tanımla")
    plan.add_argument("ad")
    plan.add_argument("cron")
    plan.add_argument("kuyruk")
    plan.add_argument("veri")
    sub.add_parser("tetikle", help="zamanı gelen yinelenen işleri sıraya koy")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    queue = JobQueue(args.veritabani)
    try:
        if args.komut in ("ekle", "zamanla"):
            payload = json.loads(args.veri)
            if not isinstance(payload, dict):
                raise ValueError('Veri bir JSON nesnesi olmalı: \'{"anahtar": "değer"}\'')
        if args.komut == "ekle":
            job_id = queue.enqueue(
                args.kuyruk,
                payload,
                priority=args.oncelik,
                delay=args.gecikme,
                idempotency_key=args.anahtar,
            )
            print(job_id)
        elif args.komut == "durum":
            for status, count in sorted(queue.stats(args.kuyruk).items()):
                print(f"{status}: {count}")
        elif args.komut == "olu":
            for job_id, data, error in queue.dead_letters(args.kuyruk):
                print(f"{job_id}\t{json.dumps(data, ensure_ascii=False)}\t{error}")
        elif args.komut == "yeniden":
            queue.requeue(args.is_no)
        elif args.komut == "zamanla":
            queue.schedule(args.ad, args.cron, args.kuyruk, payload)
        else:
            print(len(queue.tick()))
    except (ValueError, CronError) as error:
        print(f"Hata: {error}", file=sys.stderr)
        return 1
    finally:
        queue.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
