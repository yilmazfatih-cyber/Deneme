"""Komut satırı: `python havuz/sinav/sinav.py <komut>`.

Komutlar:
  liste                               görevleri listeler
  hazirla <gorev> <klasor>            görev klasörünü kurar (temel kopyası + başlangıç + GOREV.md)
  puanla <klasor> --etiket <model>    ajanın işini ölçer ve sonuclar/<etiket>.jsonl'e yazar
  rapor                               modelleri karşılaştıran Markdown tablo
  dogrula [gorev …]                   her görevin kendisini sınar (başlangıç kalır, çözüm geçer, hile yakalanır)
Çıkış kodu: 0 başarı (puanla: geçti), 1 başarısız (puanla: kaldı/geçersiz), 2 kullanım ya da kurulum hatası.
Genişletme: yeni komut → `build_parser`'a alt ayrıştırıcı + aşağıya `cmd_<ad>` işlevi + tests/test_cli.py.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from collections import Counter
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from exam import results
from exam.cli_tr import TurkishParser
from exam.grade import GradeResult, grade
from exam.prepare import PrepareError, prepare
from exam.records import RecordError
from exam.report import build_report
from exam.tasks import TUR_ADLARI, ZORLUKLAR, TaskError, all_tasks, find_task
from exam.verify import summary_table, verify_task

VERDICT = {"gecti": "GEÇTİ", "kaldi": "KALDI", "gecersiz": "GEÇERSİZ (hile denetimi)"}


def cmd_liste(args: argparse.Namespace) -> int:
    tasks = all_tasks()
    if args.json:
        print(json.dumps([
            {"kimlik": t.id, "temel": t.foundation, "tur": t.kind, "zorluk": t.difficulty,
             "tahmini_sure_dk": t.minutes, "baslik": t.title, "aciklama": t.summary}
            for t in tasks
        ], ensure_ascii=False, indent=2))  # fmt: skip
        return 0
    print(f"{'KİMLİK':<30} {'TEMEL':<11} {'TÜR':<14} {'ZORLUK':<6} {'DK':>3}  BAŞLIK")
    for t in tasks:
        print(f"{t.id:<30} {t.foundation:<11} {TUR_ADLARI[t.kind]:<14} {t.difficulty:<6} {t.minutes:>3}  {t.title}")
    levels = Counter(t.difficulty for t in tasks)
    kinds = Counter(TUR_ADLARI[t.kind] for t in tasks)
    print(f"\n{len(tasks)} görev · " + " · ".join(f"{level} {levels[level]}" for level in ZORLUKLAR))
    print("tür: " + ", ".join(f"{kind} {count}" for kind, count in sorted(kinds.items())))
    return 0


def cmd_hazirla(args: argparse.Namespace) -> int:
    task = find_task(args.gorev)
    target = Path(args.klasor).expanduser().resolve()
    print(f"Görev: {task.id} — {task.title} ({task.foundation} · {TUR_ADLARI[task.kind]} · {task.difficulty})")
    prepare(task, target, install=not args.kurma, git=not args.gitsiz)
    print(f"""
Hazır: {target}
Şimdi:
  1. Kod ajanınızı bu klasörde başlatın:  cd {target}
  2. GOREV.md'deki 1. iletiyi verin; yanıt gelince 2. iletiyi verin. Araya girmeyin (README → adil kurallar).
  3. Ajan bitirince (ya da süre dolunca) puanlayın:
     python {Path(__file__).resolve().parent.parent / 'sinav.py'} puanla {target} --etiket <model-adı>""")
    return 0


def _print_grade(result: GradeResult) -> None:
    for finding in result.integrity.violations:
        print(f"\n  İHLAL: {finding.path}: {finding.reason}")
        if finding.detail:
            print("    " + finding.detail.replace("\n", "\n    "))
    for finding in result.integrity.warnings[:10]:
        print(f"  uyarı: {finding.path}: {finding.reason} — {finding.detail[:100]}")
    for stage in result.stages:
        if stage.status == "kaldi" and stage.tail:
            print(f"\n--- {stage.name}: son satırlar (tam günlük: {stage.log}) ---\n{stage.tail}")
    for note in result.notes:
        print(f"  not: {note}")
    print(f"\n  değişiklik: {result.diff.short()}")


def cmd_puanla(args: argparse.Namespace) -> int:
    if not args.kaydetme:
        results.label_file(args.etiket)  # etiket geçersizse ölçmeden önce söyle
    folder = Path(args.klasor)
    print(f"Puanlanıyor: {folder}")
    result = grade(folder, stop_early=args.dur)
    _print_grade(result)
    minutes = args.sure if args.sure is not None else result.minutes
    print(f"  süre: {minutes} dk ({'girilen' if args.sure is not None else 'hazirla → puanla arası'})")
    print(f"\nSONUÇ: {VERDICT[result.verdict]}" + (f"  (kalan: {', '.join(result.failed)})" if result.failed else ""))
    if not args.kaydetme:
        attempt = args.deneme or results.next_attempt(args.etiket, result.task.id)
        entry = results.to_entry(
            result, args.etiket, tool=args.arac, attempt=attempt, minutes=args.sure, note=args.not_
        )
        print(f"Kaydedildi: {results.append(entry)} (deneme {attempt})")
    return 0 if result.verdict == "gecti" else 1


def cmd_rapor(args: argparse.Namespace) -> int:
    entries = results.all_entries()
    if args.etiket:
        entries = [e for e in entries if e.get("etiket") in set(args.etiket)]
    text = build_report(entries, all_tasks(), datetime.now())
    if args.cikti:
        Path(args.cikti).write_text(text, encoding="utf-8")
        print(f"Rapor yazıldı: {args.cikti}")
    else:
        print(text, end="")
    return 0


def cmd_dogrula(args: argparse.Namespace) -> int:
    tasks = [find_task(name) for name in args.gorev] if args.gorev else all_tasks()
    workdir = Path(args.klasor).expanduser().resolve() if args.klasor else Path(tempfile.mkdtemp(prefix="sinav-dogrula-"))
    workdir.mkdir(parents=True, exist_ok=True)
    print(f"{len(tasks)} görev doğrulanıyor (çalışma klasörü: {workdir})")
    outcomes = []
    for number, task in enumerate(tasks, start=1):
        print(f"\n[{number}/{len(tasks)}] {task.id}")
        outcome = verify_task(task, workdir, fast=args.hizli, keep=args.birak)
        outcomes.append(outcome)
        print(f"  → {'TAMAM' if outcome.ok else 'SORUN: ' + '; '.join(outcome.problems)} ({outcome.seconds:.0f} sn)")
    print("\n" + summary_table(outcomes))
    bad = [o.task_id for o in outcomes if not o.ok]
    print(f"\n{'Bütün görevler doğrulandı.' if not bad else 'Sorunlu görevler: ' + ', '.join(bad)}")
    return 1 if bad else 0


def build_parser() -> argparse.ArgumentParser:
    main = TurkishParser(
        prog="python havuz/sinav/sinav.py",
        description="Kod ajanı sınavı: havuz temelleri üstünde gerçekçi görevler, gizli testlerle puanlama.",
        epilog="Adım adım kullanım: havuz/sinav/README.md",
    )
    main._positionals.title = "komutlar"
    sub = main.add_subparsers(dest="komut", metavar="<komut>", parser_class=TurkishParser, required=True)
    p = sub.add_parser("liste", help="görevleri listele", description="Görevleri listeler.")
    p.add_argument("--json", action="store_true", help="makine okur çıktı")
    p = sub.add_parser("hazirla", help="görev klasörünü kur", description="Görev klasörünü kurar.")
    p.add_argument("gorev", help="görev kimliği (liste komutundaki ad)")
    p.add_argument("klasor", help="yeni (boş) klasör; deponun DIŞINDA olmalı, ör. ~/sinav/gorev-1")
    p.add_argument("--kurma", action="store_true", help="bağımlılıkları kurma (yalnız deneme için)")
    p.add_argument("--gitsiz", action="store_true", help="görev klasöründe git deposu açma")
    p = sub.add_parser("puanla", help="ajanın işini ölç ve kaydet", description="Görev klasörünü puanlar.")
    p.add_argument("klasor", help="hazirla ile açılmış görev klasörü")
    p.add_argument("--etiket", required=True, help="model adı, ör. qwen3-coder-30b (sonuç dosyası adı olur)")
    p.add_argument("--arac", default="", help="kod ajanı aracı, ör. 'Claude Code', aider, opencode")
    p.add_argument("--sure", type=float, help="ajanın çalıştığı süre (dakika); verilmezse hazirla→puanla arası")
    p.add_argument("--deneme", type=int, help="deneme numarası (verilmezse sıradaki)")
    p.add_argument("--not", dest="not_", default="", help="sonuca eklenecek kısa not")
    p.add_argument("--kaydetme", action="store_true", help="sonucu dosyaya yazma (yalnız göster)")
    p.add_argument("--dur", action="store_true", help="ilk başarısız aşamada dur (daha hızlı, daha az bilgi)")
    p = sub.add_parser("rapor", help="modelleri karşılaştıran tablo", description="Markdown rapor üretir.")
    p.add_argument("--cikti", help="raporu bu dosyaya yaz (verilmezse ekrana)")
    p.add_argument("--etiket", nargs="+", help="yalnız bu etiketler")
    p = sub.add_parser("dogrula", help="görevlerin kendisini sına", description="Sınavın sınavı.")
    p.add_argument("gorev", nargs="*", help="yalnız bu görevler (boşsa hepsi)")
    p.add_argument("--klasor", help="geçici kopyaların klasörü (varsayılan: sistemin geçici klasörü)")
    p.add_argument("--hizli", action="store_true", help="başlangıçta temelin denetimini koşma")
    p.add_argument("--birak", action="store_true", help="geçici kopyaları silme (inceleme için)")
    return main


COMMANDS = {"liste": cmd_liste, "hazirla": cmd_hazirla, "puanla": cmd_puanla, "rapor": cmd_rapor,
            "dogrula": cmd_dogrula}  # fmt: skip


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return COMMANDS[args.komut](args)
    except (TaskError, PrepareError, RecordError, ValueError) as error:
        print(f"Hata: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nDurduruldu.", file=sys.stderr)
        return 2
