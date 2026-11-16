"""Test düzeneği: sunucuyu arka plan iş parçacığında kendi olay döngüsüyle koşturur; gerçek
redis-server'ı (varsa) boş bir kapıda başlatır. Kapılar her zaman işletim sisteminden boş seçilir
(sabit kapı yok).

Genişletme: başka bir dış sunucuyla karşılaştırmak için `RedisProcess` benzeri bir bağlam
yöneticisi.
"""

from __future__ import annotations

import asyncio
import select
import shutil
import socket
import subprocess
import threading
import time
from types import TracebackType

from onbellek_sunucu import CacheServer


class ServerThread:
    def __init__(self, server: CacheServer) -> None:
        self.server = server
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)

    def __enter__(self) -> int:
        self.thread.start()
        return asyncio.run_coroutine_threadsafe(self.server.start(), self.loop).result(timeout=30)

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        asyncio.run_coroutine_threadsafe(self.server.close(), self.loop).result(timeout=30)
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=30)
        self.loop.close()


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


class RedisProcess:
    """Gerçek redis-server (kalıcılık kapalı); hazır olduğunu kendi günlüğünden anlar (bekleme
    yok)."""

    available = shutil.which("redis-server") is not None

    def __enter__(self) -> int:
        self.port = free_port()
        command = ["redis-server", "--port", str(self.port), "--bind", "127.0.0.1", "--save", ""]
        command += ["--appendonly", "no", "--daemonize", "no", "--loglevel", "notice"]
        # bufsize=0: tamponsuz boru. Tamponlu okuyucuyla select, tampona çoktan alınmış satırı
        # göremez.
        self.process = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0
        )
        assert self.process.stdout is not None
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            ready, _, _ = select.select([self.process.stdout], [], [], deadline - time.monotonic())
            line = self.process.stdout.readline() if ready else b""
            if b"Ready to accept connections" in line:
                return self.port
            if not line and self.process.poll() is not None:
                break
        self.__exit__(None, None, None)
        raise RuntimeError("redis-server başlatılamadı")

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.process.terminate()
        self.process.wait(timeout=30)
        if self.process.stdout is not None:
            self.process.stdout.close()
