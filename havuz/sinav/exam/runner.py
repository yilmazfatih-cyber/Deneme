"""Komut çalıştırma: çıktıyı günlük dosyasına yazar, süre sınırında bütün süreç grubunu durdurur.

Puanlamada her aşamanın (gizli test, denetim) çıktısı `calisma/kayitlar/<koşu>/puanlama-<n>/` altına
yazılır; ekrana yalnız özet ve başarısızlıkta son satırlar basılır.
Genişletme: yeni bir çalıştırma seçeneği (ör. bellek sınırı) için `run`'a parametre ekleyin.
"""

from __future__ import annotations

import contextlib
import os
import signal
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandResult:
    ok: bool
    code: int
    seconds: float
    log: Path
    timed_out: bool = False

    def tail(self, lines: int = 25) -> str:
        try:
            text = self.log.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return "\n".join(text.splitlines()[-lines:])


def run(
    command: str | list[str],
    cwd: Path,
    log: Path,
    env: dict[str, str] | None = None,
    timeout_s: int = 900,
) -> CommandResult:
    """Komutu `cwd`'de çalıştırır; stdout+stderr `log` dosyasına gider."""
    log.parent.mkdir(parents=True, exist_ok=True)
    shown = command if isinstance(command, str) else " ".join(command)
    started = time.monotonic()
    with log.open("w", encoding="utf-8") as out:
        out.write(f"$ {shown}\n# klasör: {cwd}\n\n")
        out.flush()
        try:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                env=env,
                shell=isinstance(command, str),
                stdout=out,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as error:
            out.write(f"\nÇalıştırılamadı: {error}\n")
            return CommandResult(False, 127, 0.0, log)
        try:
            code = process.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            _kill_group(process)
            out.write(f"\nSÜRE SINIRI AŞILDI ({timeout_s} sn): komut durduruldu.\n")
            return CommandResult(False, -1, time.monotonic() - started, log, timed_out=True)
    return CommandResult(code == 0, code, time.monotonic() - started, log)


def _kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def run_quiet(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str]:
    """Kısa yardımcı komutlar (git gibi) için: (çıkış kodu, birleşik çıktı)."""
    try:
        done = subprocess.run(
            command, cwd=cwd, env=env, capture_output=True, text=True, check=False, timeout=120
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 127, str(error)
    return done.returncode, (done.stdout + done.stderr).strip()
