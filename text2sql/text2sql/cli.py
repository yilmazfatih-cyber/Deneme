"""Komut satırı: ``text2sql sor --db dukkan.sqlite "Kaç müşteri var?"``, ``text2sql sohbet``, ``text2sql bilgi`` ...

Çıkış kodları: 0 başarı · 1 model ya da sorgu hatası · 2 kullanım/ayar hatası (dosya yok, ek paket eksik)
· 3 yazma sorgusu --yaz olmadan reddedildi. Python izleri yalnızca ``-v`` ile gösterilir.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import traceback
from pathlib import Path

from . import __version__
from .backends import OllamaBackend, install_hint, make_backend
from .config import BACKENDS, PROFILES, Settings, normalize_backend
from .errors import ConfigError, ReadOnlyError, Text2SQLError
from .examples import load_examples, ornek_dir
from .hardware import detect_gpus, recommend
from .pipeline import Answer, Text2SQL
from .schema import DIALECT_NAMES, DIALECTS, extract_schema

# --------------------------------------------------------------------------- yardımcılar


def _settings(args) -> Settings:
    model = getattr(args, "model", None)
    profile = getattr(args, "profil", None)
    if model and model.lower() in PROFILES and not profile:  # --model slm-sql de profil seçer
        profile, model = model.lower(), None
    s = Settings.load(profile=profile)
    if model:
        s.model = model
        if model.lower().endswith(".gguf"):
            s.gguf_path, s.backend = model, "llamacpp"
    if getattr(args, "backend", None):
        s.backend = normalize_backend(args.backend)
    for attr, key in (("ornek_satir", "sample_rows"), ("deneme", "retries"), ("limit", "limit")):
        v = getattr(args, attr, None)
        if v is not None:
            setattr(s, key, v)
    return s


def _cell(v, width: int = 40) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        s = f"{v:.2f}" if abs(v - round(v)) > 1e-9 else str(int(v)) if abs(v) < 1e15 else str(v)
    elif isinstance(v, (bytes, bytearray, memoryview)):
        s = f"<{len(bytes(v))} bayt>"
    else:
        s = str(v)
    s = s.replace("\n", " ")
    return s if len(s) <= width else s[: width - 1] + "…"


def format_table(columns: list[str], rows: list[tuple]) -> str:
    """Yalnızca standart kütüphaneyle düz metin tablo; sayılar sağa yaslanır."""
    cells = [[_cell(v) for v in r] for r in rows]
    widths = [len(c) for c in columns]
    for r in cells:
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(c))
    numeric = [bool(rows) and all(isinstance(r[i], (int, float)) or r[i] is None for r in rows) for i in range(len(columns))]

    def line(vals):
        return " | ".join(v.rjust(widths[i]) if numeric[i] else v.ljust(widths[i]) for i, v in enumerate(vals)).rstrip()

    sep = "-+-".join("-" * w for w in widths)
    return "\n".join([line(columns), sep] + [line(r) for r in cells])


def _jsonable(v):
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(v))} bayt>"
    return str(v)


def _print_answer(ans: Answer, args) -> None:
    if args.json:
        d = ans.to_dict()
        if "satirlar" in d:
            d["satirlar"] = [[_jsonable(v) for v in r] for r in d["satirlar"]]
        json.dump(d, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return
    if args.sadece_sql:
        if ans.sql:
            print(ans.sql.rstrip(";") + ";")
    else:
        if ans.sql:
            print("SQL:\n  " + ans.sql.rstrip(";").replace("\n", "\n  ") + ";\n")
        if ans.result is not None:
            r = ans.result
            if r.columns:
                print(format_table(r.columns, r.rows))
                n = len(r.rows)
                print(f"\n({n} satır{'; ilk ' + str(n) + ' gösterildi, --limit ile artırın' if r.truncated else ''})")
            else:
                print(f"Tamam. Etkilenen satır: {r.rowcount if r.rowcount is not None else '?'}")
    for note in ans.notes:
        print(f"Not: {note}", file=sys.stderr)
    if ans.error:
        print(f"Sorgu çalışmadı ({ans.attempts} deneme): {ans.error}", file=sys.stderr)


def _pipeline(args, s: Settings) -> Text2SQL:
    examples = load_examples(args.ornekler) if getattr(args, "ornekler", None) else None
    tables = args.tablolar.split(",") if getattr(args, "tablolar", None) else None
    return Text2SQL(make_backend(s), args.db, dialect=args.lehce, sample_rows=s.sample_rows, tables=tables,
                    examples=examples, num_ctx=s.num_ctx)


def _ask(t2s: Text2SQL, args, s: Settings, question: str, history=None) -> Answer:
    return t2s.ask(question, execute_sql=not args.sadece_sql, write=args.yaz, retries=s.retries, limit=s.limit,
                   query_timeout=s.query_timeout, history=history)


# --------------------------------------------------------------------------- komutlar


def cmd_sor(args) -> int:
    s = _settings(args)
    t2s = _pipeline(args, s)
    ans = _ask(t2s, args, s, " ".join(args.soru))
    _print_answer(ans, args)
    return 1 if ans.error else 0


def cmd_sohbet(args) -> int:
    s = _settings(args)
    t2s = _pipeline(args, s)
    history: list[tuple[str, str]] = []
    print(f"Veritabanı: {args.db} ({DIALECT_NAMES[t2s.dialect]}, {len(t2s.schema.tables)} tablo) · model: {s.model}")
    print("Sorunuzu yazın. Çıkmak için: çık  ·  geçmişi silmek için: temizle\n")
    while True:
        try:
            q = input("soru> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not q:
            continue
        if q.casefold() in ("çık", "cik", "çıkış", "q", "quit", "exit"):
            return 0
        if q.casefold() == "temizle":
            history.clear()
            print("Geçmiş silindi.\n")
            continue
        try:
            ans = _ask(t2s, args, s, q, history[-s.history:] if s.history > 0 else None)
        except Text2SQLError as exc:
            print(str(exc), file=sys.stderr)
            if isinstance(exc, ReadOnlyError) and exc.sql:
                print("Reddedilen SQL:\n  " + exc.sql.replace("\n", "\n  "), file=sys.stderr)
            continue
        _print_answer(ans, args)
        if ans.sql and not ans.error:
            history.append((q, ans.sql))
        print()


def cmd_sema(args) -> int:
    s = _settings(args)
    tables = args.tablolar.split(",") if args.tablolar else None
    schema = extract_schema(args.db, sample_rows=s.sample_rows, tables=tables)
    if args.lehce:
        schema.dialect = args.lehce
    print(f"-- {DIALECT_NAMES[schema.dialect]} · {len(schema.tables)} tablo/görünüm")
    print(schema.to_ddl())
    return 0


def cmd_bilgi(args) -> int:
    s = _settings(args)
    print(f"text2sql {__version__}")
    print("Ayarlar:")
    for k, v in s.as_dict().items():
        print(f"  {k:14} {v}")
    print(f"  {'kaynak':14} {', '.join(s.source) or 'varsayılanlar'}")
    p = PROFILES[s.profile]
    print(f"Profil '{s.profile}': {p['note']}")
    print(f"  lisans: {p['license']} · GGUF: {p['gguf_source']}")

    print("GPU:")
    gpus = detect_gpus()
    if not gpus:
        print("  bulunamadı (nvidia-smi yok ya da yanıt vermedi); model CPU'da çalışır")
    for g in gpus:
        mem = f"{g.vram_mib} MiB" if g.vram_mib else "bellek bilinmiyor"
        print(f"  {g.name} · {mem}")
    vram = None
    if gpus and gpus[0].vram_mib:
        vram = gpus[0].vram_mib * 2 // 3 if gpus[0].kind == "apple" else gpus[0].vram_mib  # birleşik belleğin bir kısmı
    rec = recommend(vram)
    print(f"Öneri: {rec.tag} ({rec.size}) · {rec.note}")

    if s.backend == "ollama":
        ob = OllamaBackend(s.model, s.ollama_host, timeout=5)
        ver = ob.version()
        if ver is None:
            print(f"Ollama: {s.ollama_host} adresinde yanıt yok. Başlatın: ollama serve · indirme: https://ollama.com/download")
        else:
            print(f"Ollama: çalışıyor (sürüm {ver}, {s.ollama_host})")
            try:
                names = ob.list_models()
            except Text2SQLError as exc:
                print(f"  model listesi alınamadı: {exc}")
                names = []
            for m, why in ((s.model, "sorularda kullanılan"), (s.base_model, "taban")):
                if not m:
                    continue
                ok = OllamaBackend.has_model(names, m)
                print(f"  [{'+' if ok else '-'}] {m:40} {why}")
            if not OllamaBackend.has_model(names, s.model):
                print(f"  Model eksik. {install_hint(s.profile, s.model)}")
    elif s.backend == "llamacpp":
        gp = Path(s.gguf_path)
        print(f"llama.cpp: {gp} {'var' if gp.is_file() else 'YOK'}")
        if importlib.util.find_spec("llama_cpp"):
            print("  llama-cpp-python kurulu")
        else:
            print('  llama-cpp-python kurulu değil: pip install -e ".[gguf]"')
    else:
        print("Arka uç: sahte (ağsız test modeli; gerçek SQL üretmez)")
    if importlib.util.find_spec("sqlalchemy"):
        print("PostgreSQL / MySQL desteği: kurulu")
    else:
        print('PostgreSQL / MySQL desteği: yok (pip install -e ".[db]")')
    return 0


def cmd_ornek_db(args) -> int:
    script = ornek_dir() / "olustur.py"
    if not script.is_file():
        raise ConfigError(f"Örnek veritabanı betiği bulunamadı: {script}. Depoyu klonlayıp 'pip install -e .' ile kurun.")
    spec = importlib.util.spec_from_file_location("text2sql_ornek_olustur", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out = Path(args.cikti) if args.cikti else ornek_dir() / "dukkan.sqlite"
    if out.exists() and not args.zorla:
        print(f"Zaten var: {out} (yeniden oluşturmak için --zorla)")
        return 0
    counts = mod.build(out)
    print(f"Oluşturuldu: {out}")
    for table, n in counts.items():
        print(f"  {table:18} {n} satır")
    return 0


def cmd_degerlendir(args) -> int:
    from .evaluate import evaluate

    s = _settings(args)
    pairs = load_examples(args.sorular or ornek_dir() / "sorular.md")
    t2s = Text2SQL(make_backend(s), args.db, dialect=args.lehce, sample_rows=s.sample_rows, num_ctx=s.num_ctx)
    rows = evaluate(t2s, pairs, retries=s.retries)
    print(f"Model: {s.model} (profil {s.profile}, arka uç {s.backend}) · {len(pairs)} soru\n")
    table = [(i, "doğru" if r.ok else "yanlış", r.question, r.reason) for i, r in enumerate(rows, 1)]
    print(format_table(["#", "sonuç", "soru", "not"], table))
    ok = sum(r.ok for r in rows)
    print(f"\nPuan: {ok}/{len(rows)}")
    if args.json:
        Path(args.json).write_text(json.dumps([r.__dict__ for r in rows], ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Ayrıntılar: {args.json}")
    return 0


# --------------------------------------------------------------------------- ayrıştırıcı


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--model", help="Ollama model adı, profil adı (qwen, slm-sql, prem, buyuk) ya da .gguf yolu (TEXT2SQL_MODEL)")
    common.add_argument("--profil", choices=list(PROFILES), help="model profili (TEXT2SQL_PROFIL); varsayılan: qwen")
    common.add_argument("--backend", choices=list(BACKENDS) + ["fake"], help="arka uç: ollama (varsayılan), llamacpp, sahte (TEXT2SQL_BACKEND)")
    common.add_argument("-v", "--verbose", action="store_true", help="hata izlerini göster")

    db = argparse.ArgumentParser(add_help=False)
    env_db = os.environ.get("TEXT2SQL_DB")
    db.add_argument("--db", required=not env_db, default=env_db,
                    help="SQLite dosyası ya da bağlantı adresi (postgresql://..., mysql://...); verilmezse TEXT2SQL_DB")
    db.add_argument("--lehce", choices=DIALECTS, help="SQL lehçesi (varsayılan: adresten anlaşılır)")
    db.add_argument("--ornek-satir", type=int, metavar="N", help="istemde tablo başına N örnek satır (varsayılan 2; 0 = yok)")
    db.add_argument("--tablolar", metavar="a,b", help="yalnızca bu tabloları isteme koy (büyük şemalar için)")

    run = argparse.ArgumentParser(add_help=False)
    run.add_argument("--sadece-sql", action="store_true", help="SQL'i yaz, çalıştırma")
    run.add_argument("--json", action="store_true", help="sonucu JSON olarak yaz")
    run.add_argument("--yaz", action="store_true", help="INSERT/UPDATE/DELETE gibi yazma sorgularına izin ver (dikkat)")
    run.add_argument("--deneme", type=int, metavar="N", help="sorgu hata verirse hatayı modele verip N kez yeniden dene (varsayılan 1)")
    run.add_argument("--limit", type=int, metavar="N", help="en çok N satır göster (varsayılan 200)")
    run.add_argument("--ornekler", metavar="DOSYA", help="kendi örnek soru/SQL çiftleriniz (sorular.md biçiminde)")

    p = argparse.ArgumentParser(prog="text2sql", description="Türkçe sorudan SQL üreten, tamamen yerel çalışan araç")
    p.add_argument("--version", action="version", version=f"text2sql {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True, metavar="komut")

    s = sub.add_parser("sor", parents=[common, db, run], help="tek bir soru sor")
    s.add_argument("soru", nargs="+", help="soru (tırnak içinde)")
    s.set_defaults(func=cmd_sor)

    s = sub.add_parser("sohbet", parents=[common, db, run], help="etkileşimli soru-cevap")
    s.set_defaults(func=cmd_sohbet)

    s = sub.add_parser("sema", parents=[common, db], help="modele verilen şemayı (DDL) göster")
    s.set_defaults(func=cmd_sema)

    s = sub.add_parser("bilgi", parents=[common], help="ayarlar, GPU, Ollama ve model durumu")
    s.set_defaults(func=cmd_bilgi)

    s = sub.add_parser("ornek-db", parents=[common], help="örnek dükkan veritabanını oluştur (ornek/dukkan.sqlite)")
    s.add_argument("--cikti", metavar="YOL", help="başka bir yere yaz")
    s.add_argument("--zorla", action="store_true", help="dosya varsa yeniden oluştur")
    s.set_defaults(func=cmd_ornek_db)

    s = sub.add_parser("degerlendir", parents=[common, db], help="örnek sorularla modeli puanla (iki modeli kıyaslamak için)")
    s.add_argument("--sorular", metavar="DOSYA", help="soru/SQL dosyası (varsayılan: ornek/sorular.md)")
    s.add_argument("--deneme", type=int, metavar="N", help="hata olursa yeniden deneme sayısı (varsayılan 1)")
    s.add_argument("--json", metavar="DOSYA", help="ayrıntıları JSON dosyasına yaz")
    s.set_defaults(func=cmd_degerlendir)
    return p


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # Windows konsolunda Türkçe karakter yüzünden çökmesin
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except Text2SQLError as exc:
        print(str(exc), file=sys.stderr)
        if isinstance(exc, ReadOnlyError) and exc.sql:
            print("Reddedilen SQL:\n  " + exc.sql.replace("\n", "\n  "), file=sys.stderr)
        if getattr(args, "verbose", False):
            traceback.print_exc()
        return exc.exit_code
    except KeyboardInterrupt:
        print("\nDurduruldu.", file=sys.stderr)
        return 130


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
