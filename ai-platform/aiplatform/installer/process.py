"""Arka plan süreç yönetimi (LLM motoru gibi uzun ömürlü süreçler).

Her süreç bir adla yönetilir: log `logs_dir/<ad>.log`, pid ve komut `data_dir/run/<ad>.json` dosyasında tutulur.
Böylece platform yeniden başladığında süreç bulunur, durdurulur veya ölmüşse yeniden başlatılabilir.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import psutil

from ..config import get_settings

log = logging.getLogger("aiplatform.process")


def _run_dir() -> Path:
    d = get_settings().data_dir / "run"
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_path(name: str) -> Path:
    s = get_settings()
    s.logs_dir.mkdir(parents=True, exist_ok=True)
    return s.logs_dir / f"{name}.log"


def _info_path(name: str) -> Path:
    return _run_dir() / f"{name}.json"


def read_info(name: str) -> dict | None:
    p = _info_path(name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def start(name: str, cmd: list[str], env: dict[str, str] | None = None, cwd: str | None = None) -> int:
    """Süreci arka planda başlatır; çıktı log dosyasına eklenir. Aynı adla çalışan varsa önce durdurur."""
    if is_running(name):
        stop(name)
    lp = log_path(name)
    full_env = {**os.environ, **(env or {})}
    with lp.open("ab") as fh:
        fh.write(f"\n=== {time.strftime('%Y-%m-%d %H:%M:%S')} başlatılıyor: {' '.join(cmd)}\n".encode())
        fh.flush()
        kwargs: dict = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        else:
            kwargs["start_new_session"] = True
        proc = subprocess.Popen(
            cmd,
            stdout=fh,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            env=full_env,
            cwd=cwd,
            **kwargs,
        )
    _info_path(name).write_text(
        json.dumps(
            {"pid": proc.pid, "cmd": cmd, "env": env or {}, "cwd": cwd, "started": time.time()},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    log.info("süreç başlatıldı: %s (pid %s)", name, proc.pid)
    return proc.pid


def pid_of(name: str) -> int | None:
    info = read_info(name)
    return int(info["pid"]) if info and info.get("pid") else None


def is_running(name: str) -> bool:
    pid = pid_of(name)
    if pid is None:
        return False
    try:
        p = psutil.Process(pid)
        return p.is_running() and p.status() != psutil.STATUS_ZOMBIE
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def stop(name: str, timeout: float = 10.0) -> bool:
    """Önce nazikçe (SIGTERM), süre dolarsa zorla durdurur. Durdurulacak süreç yoksa False."""
    pid = pid_of(name)
    stopped = False
    if pid is not None:
        try:
            p = psutil.Process(pid)
            children = p.children(recursive=True)
            if sys.platform == "win32":
                p.terminate()
            else:
                try:
                    os.killpg(os.getpgid(pid), signal.SIGTERM)
                except (ProcessLookupError, PermissionError):
                    p.terminate()
            _gone, alive = psutil.wait_procs([p, *children], timeout=timeout)
            for a in alive:
                try:
                    a.kill()
                except psutil.NoSuchProcess:
                    pass
            stopped = True
        except psutil.NoSuchProcess:
            pass
    try:
        _info_path(name).unlink()
    except FileNotFoundError:
        pass
    return stopped


def restart_if_dead(name: str) -> bool:
    """Kayıtlı süreç ölmüşse aynı komutla yeniden başlatır (otomatik yeniden başlatma). Yeniden başlattıysa True."""
    info = read_info(name)
    if info is None or is_running(name):
        return False
    log.warning("süreç durmuş, yeniden başlatılıyor: %s", name)
    start(name, info["cmd"], env=info.get("env"), cwd=info.get("cwd"))
    return True


def tail_log(name: str, lines: int = 50) -> list[str]:
    lp = log_path(name)
    if not lp.exists():
        return []
    try:
        data = lp.read_bytes()[-64_000:]
    except OSError:
        return []
    return data.decode("utf-8", errors="replace").splitlines()[-lines:]
