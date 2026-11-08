"""Komut satırı: `aiplatform serve|probe|check|install|uninstall|plan|list|catalog`."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from .catalog import get_catalog
from .config import get_settings, reset_settings
from .hardware.compat import CompatibilityReport, capacity, check_module, fmt_gb, plan_all

_STATUS = {"ok": "UYGUN", "warn": "UYARI", "fail": "UYGUN DEĞİL"}


def _table(rows: list[list[str]], header: list[str] | None = None) -> str:
    data = ([header] if header else []) + rows
    if not data:
        return ""
    widths = [max(len(str(r[i])) for r in data) for i in range(len(data[0]))]
    lines = []
    for n, r in enumerate(data):
        lines.append("  ".join(str(c).ljust(w) for c, w in zip(r, widths, strict=True)).rstrip())
        if header and n == 0:
            lines.append("  ".join("-" * w for w in widths))
    return "\n".join(lines)


def _profile():
    from .hardware.probe import probe

    return probe()


def _installed():
    from .installer import installer

    return installer.installed_pairs(), installer.installed_module_ids()


# ───────────────────────────── komutlar ─────────────────────────────


def cmd_serve(a: argparse.Namespace) -> int:
    import uvicorn

    if a.role:
        os.environ["AIP_ROLE"] = a.role
    if a.host:
        os.environ["AIP_HOST"] = a.host
    if a.port:
        os.environ["AIP_PORT"] = str(a.port)
    reset_settings()
    s = get_settings()
    uvicorn.run("aiplatform.api.app:app", host=s.host, port=s.port, log_level="info")
    return 0


def cmd_probe(a: argparse.Namespace) -> int:
    p = _profile()
    if a.json:
        print(p.model_dump_json(indent=2))
        return 0
    gpus = (
        ", ".join(f"{g.name} ({fmt_gb(g.vram_gb)} GB{', ' + g.driver if g.driver else ''})" for g in p.gpus)
        or "yok"
    )
    rows = [
        ["Makine", f"{p.hostname} ({p.os} {p.os_version})"],
        ["Rol", p.role],
        ["Katman", p.tier],
        ["CPU", f"{p.cpu.model} — {p.cpu.cores} çekirdek / {p.cpu.threads} iş parçacığı"],
        [
            "CPU bayrakları",
            f"AVX2: {'var' if p.cpu.avx2 else 'yok'}, AVX-512: {'var' if p.cpu.avx512 else 'yok'}",
        ],
        ["RAM", f"{fmt_gb(p.ram_gb.total)} GB (kullanılabilir {fmt_gb(p.ram_gb.available)} GB)"],
        ["GPU", gpus + (" — birleşik bellek" if p.unified_memory else "")],
        ["Disk", f"{fmt_gb(p.disk_gb.free)} GB boş / {fmt_gb(p.disk_gb.total)} GB ({p.disk_gb.path})"],
        [
            "Docker",
            ("var" if p.docker.available else "yok")
            + (", NVIDIA çalışma zamanı var" if p.docker.gpu_runtime else ""),
        ],
        ["Ollama", f"var ({p.ollama.version})" if p.ollama.available else "yok"],
        ["NPU", p.npu.name if p.npu.present else "yok"],
    ]
    print(_table(rows, ["Özellik", "Değer"]))
    return 0


def print_report(r: CompatibilityReport) -> None:
    print(
        f"Modül: {r.module_id}  hedef: {r.target}  sonuç: {_STATUS[r.status]}  (modül katmanı {r.module_tier}, makine {r.profile_tier})"
    )
    rows = []
    for s in r.selected:
        if s.delegated:
            where = "sunucuda"
        elif s.shared_already_installed:
            where = "zaten kurulu"
        else:
            where = "GPU" if s.on_gpu else "CPU"
        rows.append(
            [
                s.role,
                s.model or "-",
                s.artifact or "-",
                s.runtime or "-",
                fmt_gb(s.disk_gb),
                fmt_gb(s.ram_gb),
                fmt_gb(s.vram_gb),
                where,
            ]
        )
    print(_table(rows, ["Rol", "Model", "Biçim", "Çalışma", "Disk GB", "RAM GB", "VRAM GB", "Yer"]))
    if r.skipped_optional:
        print(f"İsteğe bağlı (sayılmadı): {', '.join(r.skipped_optional)}")
    print()
    for c in r.checks:
        print(f"  [{_STATUS[c.status]:^11}] {c.id}: {c.message}")
    if r.missing_dependencies:
        print(f"Eksik bağımlılıklar: {', '.join(r.missing_dependencies)}")
    print(f"\nÖneri: {r.recommendation}")


def cmd_check(a: argparse.Namespace) -> int:
    cat = get_catalog()
    if a.module_id not in cat.modules:
        print(f"Bilinmeyen modül: {a.module_id}", file=sys.stderr)
        return 2
    pairs, mods = _installed()
    r = check_module(
        cat,
        a.module_id,
        _profile(),
        pairs,
        a.target,
        a.users,
        with_optional=a.with_optional,
        installed_modules=mods,
    )
    if a.json:
        print(r.model_dump_json(indent=2))
    else:
        print_report(r)
    return 0 if r.status != "fail" else 1


def cmd_plan(a: argparse.Namespace) -> int:
    cat = get_catalog()
    unknown = [m for m in a.module_ids if m not in cat.modules]
    if unknown:
        print(f"Bilinmeyen modül: {', '.join(unknown)}", file=sys.stderr)
        return 2
    pairs, _ = _installed()
    plan = plan_all(cat, _profile(), a.module_ids, a.target, a.users, installed=pairs)
    if a.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    print(f"Plan ({plan['target']}): {', '.join(plan['modules'])}")
    rows = [
        [m["module_id"], fmt_gb(m["disk_gb"]), fmt_gb(m["ram_gb"]), fmt_gb(m["vram_gb"])]
        for m in plan["per_module"]
    ]
    t = plan["totals"]
    rows.append(["TOPLAM", fmt_gb(t["disk_gb"]), fmt_gb(t["ram_gb"]), fmt_gb(t["vram_gb"])])
    print(_table(rows, ["Modül", "Disk GB", "RAM GB", "VRAM GB"]))
    print(
        f"\nGereken katman: {plan['required_tier']}, makine: {plan['profile_tier']}, sonuç: {_STATUS[plan['status']]}"
    )
    for c in plan["checks"]:
        print(f"  [{_STATUS[c['status']]:^11}] {c['id']}: {c['message']}")
    return 0 if plan["status"] != "fail" else 1


def cmd_install(a: argparse.Namespace) -> int:
    from .installer import installer
    from .installer.jobs import get_job_manager

    artifacts = dict(x.split("=", 1) for x in a.artifact) if a.artifact else None

    async def run() -> dict:
        installer.bootstrap(restart_engine=False)
        job_id = installer.submit_install(a.module_id, a.target, artifacts, a.with_optional)
        jm = get_job_manager()
        last_pct = -1
        async for ev in jm.subscribe(job_id):
            if ev["type"] == "log":
                print(f"    {ev['line']}")
            elif ev["type"] in ("progress", "snapshot") and ev.get("progress", 0) != last_pct:
                last_pct = ev["progress"]
                print(f"[{last_pct:3d}%] {ev.get('step', '')}")
            elif ev["type"] == "end":
                break
        return jm.get(job_id) or {}

    try:
        job = asyncio.run(run())
    except installer.InstallError as e:
        print(f"Hata: {e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Kesildi.", file=sys.stderr)
        return 130
    if job.get("status") == "done":
        res = job.get("result") or {}
        print(f"\nKuruldu: {a.module_id} ({res.get('target', '')})")
        for w in res.get("warnings", []):
            print(f"  {w}")
        return 0
    print(f"\nKurulum başarısız: {job.get('error')}", file=sys.stderr)
    report = (job.get("result") or {}).get("report")
    if report:
        print_report(CompatibilityReport.model_validate(report))
    return 1


def cmd_uninstall(a: argparse.Namespace) -> int:
    from .installer import installer

    try:
        res = asyncio.run(installer.uninstall_module(a.module_id, force=a.force))
    except installer.InstallError as e:
        print(f"Hata: {e}" + (f" ({e.hint})" if e.hint else ""), file=sys.stderr)
        return 1
    print(f"Kaldırıldı: {a.module_id}")
    for m in res["removed_models"]:
        print(f"  silindi: {m['model']}/{m['artifact']}")
    for m in res["kept_models"]:
        print(f"  korundu (başka modül kullanıyor): {m['model']}/{m['artifact']}")
    return 0


def cmd_list(a: argparse.Namespace) -> int:
    from .installer import installer

    mods = installer.list_installed()
    if a.json:
        print(
            json.dumps(
                {"modules": mods, "models": installer.list_installed_models()}, ensure_ascii=False, indent=2
            )
        )
        return 0
    if not mods:
        print("Kurulu modül yok. Katalog için: aiplatform catalog")
    else:
        print(
            _table(
                [
                    [m["module_id"], m["name"], m["target"], "etkin" if m["enabled"] else "pasif"]
                    for m in mods
                ],
                ["Modül", "Ad", "Hedef", "Durum"],
            )
        )
    cap = capacity(get_catalog(), _profile(), installer.installed_pairs())
    u = cap["used"]
    print(
        f"\nKullanım: disk {fmt_gb(u['disk_gb'])} GB, RAM {fmt_gb(u['ram_gb'])} GB (%{fmt_gb(cap['pct']['ram'])}), "
        f"VRAM {fmt_gb(u['vram_gb'])} GB (%{fmt_gb(cap['pct']['vram'])})"
    )
    return 0


def cmd_catalog(a: argparse.Namespace) -> int:
    cat = get_catalog()
    profile = _profile() if a.compat else None
    pairs, mods = _installed()
    rows = []
    for m in cat.modules.values():
        row = [m.niche_code, m.id, m.name, m.package, m.tier, "kurulu" if m.id in mods else ""]
        if profile is not None:
            row.append(_STATUS[check_module(cat, m.id, profile, pairs, installed_modules=mods).status])
        rows.append(row)
    header = ["Kod", "Kimlik", "Ad", "Paket", "Katman", "Durum"] + (["Uygunluk"] if profile else [])
    print(_table(rows, header))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="aiplatform", description="Yerel AI platformu — kurulum ve yönetim")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve", help="API sunucusunu başlat")
    s.add_argument("--role", choices=["server", "client"])
    s.add_argument("--host")
    s.add_argument("--port", type=int)
    s.set_defaults(func=cmd_serve)

    s = sub.add_parser("probe", help="Donanım profilini göster")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_probe)

    s = sub.add_parser("check", help="Modülün bu donanıma uygunluğu")
    s.add_argument("module_id")
    s.add_argument("--target", choices=["auto", "server", "client"], default="auto")
    s.add_argument("--users", type=int, default=8, help="eş zamanlı kullanıcı (KV önbellek payı)")
    s.add_argument("--with-optional", action="store_true")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_check)

    s = sub.add_parser("install", help="Modülü kur")
    s.add_argument("module_id")
    s.add_argument("--target", choices=["auto", "server", "client"], default="auto")
    s.add_argument("--with-optional", action="store_true")
    s.add_argument(
        "--artifact", action="append", metavar="ROL=BİÇİM", help="bileşen biçimini zorla, ör. llm=q4_k_m"
    )
    s.set_defaults(func=cmd_install)

    s = sub.add_parser("uninstall", help="Modülü kaldır")
    s.add_argument("module_id")
    s.add_argument("--force", action="store_true", help="bağlı modüller olsa da kaldır")
    s.set_defaults(func=cmd_uninstall)

    s = sub.add_parser("plan", help="Birden çok modülün toplam gereksinimi")
    s.add_argument("module_ids", nargs="+")
    s.add_argument("--target", choices=["auto", "server", "client"], default="auto")
    s.add_argument("--users", type=int, default=8)
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_plan)

    s = sub.add_parser("list", help="Kurulu modüller ve kapasite")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_list)

    s = sub.add_parser("catalog", help="Katalogdaki modüller")
    s.add_argument("--compat", action="store_true", help="uygunluk sütunu ekle")
    s.set_defaults(func=cmd_catalog)
    return p


def main(argv: list[str] | None = None) -> int:
    import logging

    logging.basicConfig(
        level=os.environ.get("AIP_LOG_LEVEL", "WARNING"), format="%(levelname)s %(name)s: %(message)s"
    )
    args = build_parser().parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
