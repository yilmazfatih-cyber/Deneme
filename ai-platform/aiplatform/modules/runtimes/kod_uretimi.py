"""N08 Kod Üretimi — LLM ile kod üretimi ve yalıtılmış Python denemesi (`run_sandbox`).

Kum havuzu: ayrı `python -I` süreci, geçici dizin, temiz ortam, 10 sn zaman aşımı, `resource` ile bellek
(RLIMIT_AS), CPU, dosya boyutu ve süreç sayısı sınırları. Ağ: `unshare -rn` (kullanıcı + ağ ad alanı)
çalışıyorsa süreç ağsız başlar ("ağ izolasyonu: var"); çalışmıyorsa yalnız yazılım düzeyinde socket engeli
konur ve yanıtta "ağ izolasyonu: yok" yazar. Bu bir güvenlik sınırı değildir; güvenilmeyen kodu
konteyner/VM içinde çalıştırın.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
import time
from functools import lru_cache

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, note, require

SCHEMA = {
    "type": "object",
    "required": ["code", "language", "explanation"],
    "properties": {
        "code": {"type": "string"},
        "language": {"type": "string"},
        "explanation": {"type": "string"},
        "tests": {"type": "string"},
    },
}
TIMEOUT_S = 10
MEM_BYTES = 512 * 1024 * 1024
MAX_OUTPUT = 20000
_SOCKET_GUARD = (
    "import socket as _s\n"
    "def _blocked(*a, **k):\n"
    "    raise OSError('Kum havuzunda ağ erişimi kapalı')\n"
    "_s.socket.connect = _blocked; _s.socket.connect_ex = _blocked; _s.socket.sendto = _blocked\n"
    "_s.create_connection = _blocked; _s.getaddrinfo = _blocked\n"
    "del _s, _blocked\n"
)


@lru_cache(maxsize=1)
def _netns_prefix() -> tuple[str, ...]:
    if not sys.platform.startswith("linux"):
        return ()
    exe = shutil.which("unshare")
    if not exe:
        return ()
    try:
        r = subprocess.run([exe, "-rn", "true"], capture_output=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return ()
    return (exe, "-rn") if r.returncode == 0 else ()


def _limits():  # pragma: no cover - alt süreçte çalışır
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (MEM_BYTES, MEM_BYTES))
        resource.setrlimit(resource.RLIMIT_CPU, (TIMEOUT_S, TIMEOUT_S + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:
        pass
    os.setsid()


def run_python_sandboxed(code: str, stdin: str = "", timeout: float = TIMEOUT_S) -> dict:
    prefix = _netns_prefix()
    isolated = bool(prefix)
    with tempfile.TemporaryDirectory(prefix="aip_sandbox_") as tmp:
        script = os.path.join(tmp, "main.py")
        with open(script, "w", encoding="utf-8") as f:
            f.write(_SOCKET_GUARD + code)
        env = {
            "PATH": "/usr/bin:/bin",
            "HOME": tmp,
            "TMPDIR": tmp,
            "LANG": "C.UTF-8",
            "PYTHONIOENCODING": "utf-8",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        cmd = (
            [*prefix, sys.executable, "-I", "-S", script] if prefix else [sys.executable, "-I", "-S", script]
        )
        t0 = time.perf_counter()
        timed_out = False
        try:
            r = subprocess.run(
                cmd,
                input=stdin,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tmp,
                env=env,
                preexec_fn=_limits if os.name == "posix" else None,
            )
            stdout, stderr, rc = r.stdout, r.stderr, r.returncode
        except subprocess.TimeoutExpired as e:
            timed_out = True
            stdout = (
                (e.stdout or b"").decode("utf-8", "replace")
                if isinstance(e.stdout, bytes)
                else (e.stdout or "")
            )
            stderr = f"Zaman aşımı: {timeout} saniye"
            rc = None
        dur = int((time.perf_counter() - t0) * 1000)
    return {
        "stdout": stdout[:MAX_OUTPUT],
        "stderr": stderr[:MAX_OUTPUT],
        "returncode": rc,
        "timed_out": timed_out,
        "duration_ms": dur,
        "network_isolation": "var" if isolated else "yok",
    }


@register("kod-uretimi")
class KodUretimi(BaseRuntime):
    uses_llm = True

    async def do_generate(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "spec")
        lang = payload.get("language") or "python"
        user = f"Dil: {lang}\nGereksinim:\n{payload['spec']}"
        if payload.get("context"):
            user += f"\n\nİlgili mevcut kod:\n{payload['context']}"
        res = await self.llm_prompt(ctx, "kod_uretimi", user, schema=SCHEMA, temperature=0.1)
        p = res.parsed
        code = str(p.get("code", ""))
        if code.startswith("```"):
            code = code.split("\n", 1)[1].rsplit("```", 1)[0]
        return {
            "code": code,
            "language": p.get("language") or lang,
            "explanation": p.get("explanation", ""),
            "tests": p.get("tests") or "",
        }

    async def do_run_sandbox(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "code")
        lang = (payload.get("language") or "python").lower()
        if lang not in ("python", "py", "python3"):
            raise ModuleError("Kum havuzu şimdilik yalnız Python çalıştırır")
        timeout = min(float(payload.get("timeout") or TIMEOUT_S), TIMEOUT_S)
        res = await asyncio.to_thread(
            run_python_sandboxed, str(payload["code"]), str(payload.get("stdin") or ""), timeout
        )
        note(ctx, engine="python-subprocess", **{"ağ izolasyonu": res["network_isolation"]})
        return res
